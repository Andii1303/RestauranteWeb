import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

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
    const [mx] = await pool.query('INSERT INTO mesas_mix (mesas_csv) VALUES (?)', [mesasCsv]);
    const mixId = mx.insertId;
    const [r] = await pool.query('INSERT INTO facturas (mesas_mix_id, status) VALUES (?, "BORRADOR")', [mixId]);
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

export default router;
