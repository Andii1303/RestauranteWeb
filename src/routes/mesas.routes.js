import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// Listar mesas
router.get('/api/mesas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nombre, capacidad, activa FROM mesas ORDER BY id');
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Asegurar conjunto por defecto de mesas (idempotente)
// body: { mesas: [{ nombre: 'MESA_4_A', capacidad: 4 }, ...] }
router.post('/api/mesas/ensure-defaults', async (req, res) => {
  const mesas = Array.isArray(req.body?.mesas) ? req.body.mesas : [];
  if (!mesas.length) return res.status(400).json({ ok: false, message: 'mesas requerido' });
  const created = [];
  try {
    for (const m of mesas) {
      const nombre = String(m?.nombre || '').trim();
      if (!nombre) continue;
      const cap = Number(m?.capacidad) || 4;
      const [rows] = await pool.query('SELECT id FROM mesas WHERE nombre = ? LIMIT 1', [nombre]);
      if (rows.length) {
        created.push({ nombre, id: rows[0].id, capacidad: cap, existed: true });
      } else {
        const [r] = await pool.query('INSERT INTO mesas (nombre, capacidad, activa) VALUES (?, ?, 1)', [nombre, cap]);
        created.push({ nombre, id: r.insertId, capacidad: cap, existed: false });
      }
    }
    res.json({ ok: true, items: created });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Asegurar una mesa por nombre (alias práctico)
router.post('/api/mesas/ensure-one', async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    const capacidad = Number(req.body?.capacidad) || 4;
    if (!nombre) return res.status(400).json({ ok: false, message: 'nombre requerido' });
    const [rows] = await pool.query('SELECT id FROM mesas WHERE nombre = ? LIMIT 1', [nombre]);
    let id;
    if (rows.length) {
      id = rows[0].id;
    } else {
      const [r] = await pool.query('INSERT INTO mesas (nombre, capacidad, activa) VALUES (?, ?, 1)', [nombre, capacidad]);
      id = r.insertId;
    }
    res.status(201).json({ ok: true, id, nombre });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

export default router;
