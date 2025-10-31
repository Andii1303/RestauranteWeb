/**
 * Rutas de facturación
 *
 * Qué expone:
 * - Crear factura en borrador desde mesas (por nombre o ID).
 * - Agregar/eliminar/actualizar detalles de factura (ítems de menú y productos).
 * - Consolidación de totales, manejo de extras (facturas hijas), pagado por detalle.
 * - Resolución de facturas vinculadas a reservas (mesas_mix, reserva_hora).
 * - Endpoints utilitarios (health, vaciar detalles, etc.).
 *
 * Notas:
 * - Usa `pool` (mysql2/promise) para consultas SQL.
 * - Maneja esquemas nuevos y antiguos con fallbacks (ej. columnas faltantes).
 */
import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// Health check para validar que el router esté montado
router.get('/api/facturas/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Crear factura borrador desde una o varias mesas (acepta nombres o IDs)
router.post('/api/facturas/draft-from-mesa', async (req, res) => {
  try {
    const mesasCsvIn = String(req.body?.mesas_csv || '').trim();
    const mesaNombre = String(req.body?.mesa_nombre || req.body?.mesa_id || '').trim();
    if (!mesasCsvIn && !mesaNombre) return res.status(400).json({ ok: false, message: 'mesas_csv o mesa_nombre requerido' });

    // Normalizar: obtener IDs numéricos de mesas. Permitimos CSV de nombres o IDs.
    const nombresOIds = (mesasCsvIn || mesaNombre).split(',').map(s => s.trim()).filter(Boolean);
    if (!nombresOIds.length) return res.status(400).json({ ok: false, message: 'ninguna mesa especificada' });

    const mesaIds = [];
    for (const token of nombresOIds) {
      if (/^\d+$/.test(token)) {
        // Es ID
        mesaIds.push(Number(token));
      } else {
        // Es nombre: asegurar que exista y traer id
        const [rows] = await pool.query('SELECT id FROM mesas WHERE nombre = ? LIMIT 1', [token]);
        if (!rows.length) {
          // crear automáticamente con capacidad default 4
          const [r] = await pool.query('INSERT INTO mesas (nombre, capacidad, activa) VALUES (?, 4, 1)', [token]);
          mesaIds.push(r.insertId);
        } else {
          mesaIds.push(rows[0].id);
        }
      }
    }

    const mesasCsv = mesaIds.join(',');

    // Si viene una franja de reserva, validar que no haya solapes con reservas activas
    const reservaInicio = (req.body?.reserva_inicio || '').trim();
    const reservaFin = (req.body?.reserva_fin || '').trim();
    if (reservaInicio && reservaFin) {
      let conflicts;
      try {
        [conflicts] = await pool.query(
          `SELECT r.id, mm.mesas_csv
           FROM reservas r
           JOIN mesas_mix mm ON mm.id = r.mesas_mix_id
           WHERE r.reserva_inicio IS NOT NULL AND r.reserva_fin IS NOT NULL
             AND NOT (r.reserva_fin <= ? OR r.reserva_inicio >= ?)`
          , [reservaInicio, reservaFin]
        );
      } catch (err) {
        if ((err?.code || '').toUpperCase() === 'ER_BAD_FIELD_ERROR' || /Unknown column/i.test(err?.message || '')) {
          console.warn('Draft conflict check: columnas de reservas no encontradas; asumiendo sin conflictos');
          conflicts = [];
        } else {
          throw err;
        }
      }
      // Chequear intersección de mesas
      const conflictSet = new Set();
      for (const c of conflicts) {
        String(c.mesas_csv||'').split(',').map(s=>Number(s.trim())).filter(Boolean).forEach(x => conflictSet.add(x));
      }
      const intersect = mesaIds.some(id => conflictSet.has(id));
      if (intersect) return res.status(409).json({ ok:false, message:'Las mesas seleccionadas ya están reservadas en ese horario' });
    }

  const [mx] = await pool.query('INSERT INTO mesas_mix (mesas_csv) VALUES (?)', [mesasCsv]);
    const mixId = mx.insertId;
    const [r] = await pool.query('INSERT INTO facturas (mesas_mix_id, status) VALUES (?, "BORRADOR")', [mixId]);

    // Si viene la hora de reserva, guardarla en reserva_hora (inicio)
    if (reservaInicio) {
      try {
        await pool.query('UPDATE facturas SET reserva_hora = ? WHERE id = ?', [reservaInicio, r.insertId]);
      } catch {}
    }

    // Crear registro en reservas con la franja si fue provista
    if (reservaInicio && reservaFin) {
      const createdBy = String(req.body?.created_by || '').trim() || null;
      // Compat: la tabla `reservas` tiene columna legacy `mesa_id` NOT NULL (VARCHAR)
      // Usamos el primer token provisto como identificador legible (p.ej. nombre de mesa)
      const mesaLegacy = mesaNombre || (nombresOIds[0] || '').toString();
      await pool.query(
        'INSERT INTO reservas (mesa_id, mesas_mix_id, factura_id, created_by, activa, reserva_inicio, reserva_fin, status) VALUES (?, ?, ?, ?, 1, ?, ?, "BORRADOR")',
        [mesaLegacy, mixId, r.insertId, createdBy, reservaInicio, reservaFin]
      );
    }

    res.status(201).json({ ok: true, factura_id: r.insertId, mesas_mix_id: mixId, mesas_csv: mesasCsv });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Agregar detalle a factura y recalcular total
router.post('/api/facturas/:id/detalles', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const parentFacturaId = Number(req.params.id);
    const { menu_item_id, nombre, cantidad = 1, precio_unit = 0, item_type = 'PLATO', extra } = req.body || {};
    if (!parentFacturaId) return res.status(400).json({ ok: false, message: 'factura id inválido' });
    if (!nombre) return res.status(400).json({ ok: false, message: 'nombre requerido' });
    const cant = Number(cantidad) || 1; const pu = Number(precio_unit) || 0; const subtotal = cant * pu;

    await conn.beginTransaction();

    // Si es un extra, usar o crear una factura hija ligada a la original para no mezclar totales
    let targetFacturaId = parentFacturaId;
    if (extra === true || String(extra) === '1') {
      // Verificar factura padre
      const [pf] = await conn.query('SELECT id, mesas_mix_id, cliente_nombre, cliente_dni, cliente_telefono, cliente_email, reserva_hora FROM facturas WHERE id = ? FOR UPDATE', [parentFacturaId]);
      if (!pf.length) { await conn.rollback(); return res.status(404).json({ ok:false, message:'factura original no encontrada' }); }
      const padre = pf[0];
      // Buscar hija abierta
      const [h] = await conn.query("SELECT id FROM facturas WHERE parent_factura_id = ? AND es_extra = 1 AND status IN ('BORRADOR','ABIERTA') LIMIT 1", [parentFacturaId]);
      if (h.length) {
        targetFacturaId = h[0].id;
      } else {
        const [ins] = await conn.query(
          'INSERT INTO facturas (parent_factura_id, cliente_nombre, cliente_dni, cliente_telefono, cliente_email, mesas_mix_id, total, status, reserva_hora, es_extra) VALUES (?, ?, ?, ?, ?, ?, 0, "BORRADOR", ?, 1)',
          [parentFacturaId, padre.cliente_nombre || null, padre.cliente_dni || null, padre.cliente_telefono || null, padre.cliente_email || null, padre.mesas_mix_id, padre.reserva_hora || null]
        );
        targetFacturaId = ins.insertId;
      }
    }

    // Insertar detalle en la factura objetivo (padre o hija extra)
    await conn.query(
      'INSERT INTO detalles_factura (factura_id, item_type, menu_item_id, nombre, cantidad, precio_unit, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [targetFacturaId, item_type, menu_item_id || null, nombre, cant, pu, subtotal]
    );

    const [[{ total }]] = await conn.query('SELECT IFNULL(SUM(subtotal),0) AS total FROM detalles_factura WHERE factura_id = ?', [targetFacturaId]);
    await conn.query('UPDATE facturas SET total = ? WHERE id = ?', [total, targetFacturaId]);

    await conn.commit();
    res.status(201).json({ ok: true, total, factura_id_final: targetFacturaId });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ ok: false, message: err.message });
  } finally {
    conn.release();
  }
});

// Obtener detalles de una factura
router.get('/api/facturas/:id/detalles', async (req, res) => {
  try {
    const facturaId = Number(req.params.id);
    if (!facturaId) return res.status(400).json({ ok:false, message:'factura id inválido' });

    // Si viene unpaidOnly=1 (o extra=1), filtrar solo los ítems no pagados
    const unpaidOnly = String(req.query.unpaidOnly || req.query.extra || '0') === '1';

    const whereBase = 'WHERE factura_id = ?';
    const where = unpaidOnly ? `${whereBase} AND pagado = 0` : whereBase;

    // Agregado por item para evitar múltiples filas del mismo producto al hidratar el carrito
    let rows, totalRows;
    try {
      [rows] = await pool.query(
        `SELECT 
           MIN(id) AS id,
           item_type,
           menu_item_id,
           nombre,
           SUM(cantidad) AS cantidad,
           CASE WHEN SUM(cantidad) > 0 THEN ROUND(SUM(subtotal)/SUM(cantidad), 2) ELSE MAX(precio_unit) END AS precio_unit,
           SUM(subtotal) AS subtotal
         FROM detalles_factura
         ${where}
         GROUP BY item_type, menu_item_id, nombre
         ORDER BY MIN(id)`,
        [facturaId]
      );
      [totalRows] = await pool.query(
        `SELECT IFNULL(SUM(subtotal),0) AS total FROM detalles_factura ${where}`,
        [facturaId]
      );
    } catch (err) {
      // Fallback por si la columna pagado aún no existe
      if ((err?.code || '').toUpperCase() === 'ER_BAD_FIELD_ERROR' || /Unknown column 'pagado'/i.test(err?.message || '')) {
        [rows] = await pool.query(
          `SELECT 
             MIN(id) AS id,
             item_type,
             menu_item_id,
             nombre,
             SUM(cantidad) AS cantidad,
             CASE WHEN SUM(cantidad) > 0 THEN ROUND(SUM(subtotal)/SUM(cantidad), 2) ELSE MAX(precio_unit) END AS precio_unit,
             SUM(subtotal) AS subtotal
           FROM detalles_factura
           WHERE factura_id = ?
           GROUP BY item_type, menu_item_id, nombre
           ORDER BY MIN(id)`,
          [facturaId]
        );
        [totalRows] = await pool.query('SELECT IFNULL(SUM(subtotal),0) AS total FROM detalles_factura WHERE factura_id = ?', [facturaId]);
      } else {
        throw err;
      }
    }

    const total = (totalRows?.[0]?.total) ?? 0;
    res.json({ ok:true, items: rows, total });
  } catch (err) {
    res.status(500).json({ ok:false, message: err.message });
  }
});

// Checkout: completar factura con datos del cliente e items opcionales, y marcar status
router.post('/api/facturas/checkout', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const facturaIdIn = Number(req.body?.factura_id) || null;
    const status = String(req.body?.status || 'PAGADA').toUpperCase();
    const cliente = req.body?.cliente || {};
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    await conn.beginTransaction();

    let facturaId = facturaIdIn;
    if (!facturaId) {
      // Crear factura sin mesa (venta online)
      const [mx] = await conn.query('INSERT INTO mesas_mix (mesas_csv) VALUES (\'ONLINE\')');
      const mixId = mx.insertId;
      const [r] = await conn.query(
        'INSERT INTO facturas (mesas_mix_id, status, cliente_nombre, cliente_dni, cliente_telefono, cliente_email) VALUES (?, \'BORRADOR\', ?, ?, ?, ?)',
        [mixId, cliente.nombre || null, cliente.dni || null, cliente.telefono || null, cliente.email || null]
      );
      facturaId = r.insertId;
    } else {
      // Actualizar datos del cliente en factura existente
      await conn.query(
        'UPDATE facturas SET cliente_nombre = ?, cliente_dni = ?, cliente_telefono = ?, cliente_email = ? WHERE id = ?',
        [cliente.nombre || null, cliente.dni || null, cliente.telefono || null, cliente.email || null, facturaId]
      );
    }

    // Si vienen items, marcar como pagados solo los que están en el payload (por factura_id + menu_item_id + nombre)
    if (items.length > 0) {
      // Marcar como pagados los detalles que coincidan con los items recibidos
      for (const it of items) {
        // Siempre matchear por factura, menu_item_id y nombre para cubrir cantidades agregadas
        await conn.query(
          'UPDATE detalles_factura SET pagado=1 WHERE factura_id=? AND (menu_item_id <=> ?) AND nombre=? AND pagado=0',
          [facturaId, (it.menu_item_id ?? null), it.nombre || 'Item']
        );
      }
    }

    // Recalcular total y actualizar status
    const [[{ total }]] = await conn.query('SELECT IFNULL(SUM(subtotal),0) AS total FROM detalles_factura WHERE factura_id = ?', [facturaId]);
    await conn.query('UPDATE facturas SET total = ?, status = ? WHERE id = ?', [total, status, facturaId]);
    // Reflejar estado en la reserva vinculada (si existe)
    try {
      const reservaStatus = status === 'PAGADA' ? 'CONFIRMADA' : (status === 'CANCELADA' ? 'CANCELADA' : 'BORRADOR');
      await conn.query('UPDATE reservas SET status = ? WHERE factura_id = ?', [reservaStatus, facturaId]);
    } catch {}

    await conn.commit();
    res.status(200).json({ ok: true, factura_id: facturaId, total });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ ok: false, message: err.message });
  } finally {
    conn.release();
  }
});

// Reemplazar (sin checkout) los detalles de una factura por un estado deseado del carrito
router.post('/api/facturas/:id/detalles/sync', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const facturaId = Number(req.params.id);
    if (!facturaId) return res.status(400).json({ ok:false, message:'factura id inválido' });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await conn.beginTransaction();
    await conn.query('DELETE FROM detalles_factura WHERE factura_id = ?', [facturaId]);
    for (const it of items) {
      const cant = Number(it?.cantidad) || 1;
      const pu = Number(it?.precio_unit) || 0;
      const subtotal = cant * pu;
      await conn.query(
        'INSERT INTO detalles_factura (factura_id, item_type, menu_item_id, nombre, cantidad, precio_unit, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [facturaId, it?.item_type || 'PLATO', it?.menu_item_id || null, it?.nombre || 'Item', cant, pu, subtotal]
      );
    }
    const [[{ total }]] = await conn.query('SELECT IFNULL(SUM(subtotal),0) AS total FROM detalles_factura WHERE factura_id = ?', [facturaId]);
    await conn.query('UPDATE facturas SET total = ? WHERE id = ?', [total, facturaId]);
    await conn.commit();
    res.json({ ok:true, total });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ ok:false, message: err.message });
  } finally {
    conn.release();
  }
});

// Eliminar todos los detalles de una factura (p.ej. vaciar carrito)
router.delete('/api/facturas/:id/detalles', async (req, res) => {
  try {
    const facturaId = Number(req.params.id);
    if (!facturaId) return res.status(400).json({ ok:false, message:'factura id inválido' });
    await pool.query('DELETE FROM detalles_factura WHERE factura_id = ?', [facturaId]);
    await pool.query('UPDATE facturas SET total = 0 WHERE id = ?', [facturaId]);
    res.json({ ok:true });
  } catch (err) {
    res.status(500).json({ ok:false, message: err.message });
  }
});

// Cancelar y eliminar una factura (siempre que no esté pagada). También elimina la reserva vinculada y limpia mesas_mix si queda huérfana.
router.delete('/api/facturas/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const facturaId = Number(req.params.id);
    if (!facturaId) return res.status(400).json({ ok:false, message:'factura id inválido' });

    await conn.beginTransaction();
    const [facs] = await conn.query('SELECT id, status, mesas_mix_id FROM facturas WHERE id = ? LIMIT 1', [facturaId]);
    if (!facs.length) {
      await conn.rollback();
      return res.status(404).json({ ok:false, message:'factura no encontrada' });
    }
    const fac = facs[0];

    if (String(fac.status).toUpperCase() === 'PAGADA') {
      await conn.rollback();
      return res.status(409).json({ ok:false, message:'no se puede eliminar una factura pagada' });
    }

    // Borrar detalles y reservas vinculadas
    await conn.query('DELETE FROM detalles_factura WHERE factura_id = ?', [facturaId]);
    await conn.query('DELETE FROM reservas WHERE factura_id = ?', [facturaId]);
    await conn.query('DELETE FROM facturas WHERE id = ?', [facturaId]);

    // Limpiar mesas_mix si no tiene referencias
    try {
      const mixId = fac.mesas_mix_id;
      if (mixId) {
        const [[{ cnt }]] = await conn.query('SELECT COUNT(*) AS cnt FROM facturas WHERE mesas_mix_id = ?', [mixId]);
        const [[{ cntR }]] = await conn.query('SELECT COUNT(*) AS cntR FROM reservas WHERE mesas_mix_id = ?', [mixId]);
        if (Number(cnt) === 0 && Number(cntR) === 0) {
          await conn.query('DELETE FROM mesas_mix WHERE id = ?', [mixId]);
        }
      }
    } catch {}

    await conn.commit();
    return res.json({ ok:true, deleted:true });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    return res.status(500).json({ ok:false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;

// Actualizar las mesas de la factura (vía su mesas_mix)
// PATCH /api/facturas/:id/mesas { mesas: "1,2,3" | [1,2,3] }
router.patch('/api/facturas/:id/mesas', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const facturaId = Number(req.params.id);
    if (!facturaId) { conn.release(); return res.status(400).json({ ok:false, message:'factura id inválido' }); }
    let mesasIn = req.body?.mesas ?? req.body?.mesas_csv;
    if (!mesasIn) { conn.release(); return res.status(400).json({ ok:false, message:'mesas requerido' }); }
    let arr = [];
    if (Array.isArray(mesasIn)) arr = mesasIn.map(Number).filter(Number.isFinite);
    else if (typeof mesasIn === 'string') arr = mesasIn.split(',').map(s=>Number(s.trim())).filter(Number.isFinite);
    arr = Array.from(new Set(arr));
    if (!arr.length) { conn.release(); return res.status(400).json({ ok:false, message:'lista de mesas vacía' }); }

    await conn.beginTransaction();
    const [f] = await conn.query('SELECT id, mesas_mix_id FROM facturas WHERE id = ? FOR UPDATE', [facturaId]);
    if (!f.length) { await conn.rollback(); conn.release(); return res.status(404).json({ ok:false, message:'factura no encontrada' }); }
    const mixId = f[0].mesas_mix_id;
    const csv = arr.join(',');
    if (!mixId) {
      const [mx] = await conn.query('INSERT INTO mesas_mix (mesas_csv) VALUES (?)', [csv]);
      await conn.query('UPDATE facturas SET mesas_mix_id = ? WHERE id = ?', [mx.insertId, facturaId]);
    } else {
      await conn.query('UPDATE mesas_mix SET mesas_csv = ? WHERE id = ?', [csv, mixId]);
    }
    // Propagar a reservas vinculadas (si existen)
    try {
      await conn.query('UPDATE reservas SET mesas_mix_id = (SELECT mesas_mix_id FROM facturas WHERE id = ?) WHERE factura_id = ?', [facturaId, facturaId]);
    } catch {}

    await conn.commit();
    res.json({ ok:true, mesas: arr, mesas_csv: csv });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ ok:false, message: err.message });
  } finally {
    conn.release();
  }
});
