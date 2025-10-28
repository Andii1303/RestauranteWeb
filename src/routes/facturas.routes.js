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
    const facturaId = Number(req.params.id);
    const { menu_item_id, nombre, cantidad = 1, precio_unit = 0, item_type = 'PLATO' } = req.body || {};
    if (!facturaId) return res.status(400).json({ ok: false, message: 'factura id inválido' });
    if (!nombre) return res.status(400).json({ ok: false, message: 'nombre requerido' });
    const cant = Number(cantidad) || 1; const pu = Number(precio_unit) || 0; const subtotal = cant * pu;
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO detalles_factura (factura_id, item_type, menu_item_id, nombre, cantidad, precio_unit, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [facturaId, item_type, menu_item_id || null, nombre, cant, pu, subtotal]
    );
    const [[{ total }]] = await conn.query('SELECT IFNULL(SUM(subtotal),0) AS total FROM detalles_factura WHERE factura_id = ?', [facturaId]);
    await conn.query('UPDATE facturas SET total = ? WHERE id = ?', [total, facturaId]);
    await conn.commit();
    res.status(201).json({ ok: true, total });
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
    // Agregar por item para evitar múltiples filas del mismo producto al hidratar el carrito
    const [rows] = await pool.query(
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
       ORDER BY MIN(id)`
      , [facturaId]
    );
    const [[{ total }]] = await pool.query('SELECT IFNULL(SUM(subtotal),0) AS total FROM detalles_factura WHERE factura_id = ?', [facturaId]);
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

    // Reemplazar items si vienen: limpiar y volver a insertar para reflejar el carrito actual
    if (items.length > 0) {
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

export default router;
