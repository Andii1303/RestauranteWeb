import { Router } from 'express';
import { pool } from '../db.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// List units (public)
router.get('/api/units', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, code, name, decimals FROM units ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List ingredients (admin)
router.get('/api/ingredients', verifyToken, requireRole('ADMIN'), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.id, i.name, i.stock_qty, i.min_qty, i.active,
              u.id AS unit_id, u.code AS unit_code, u.name AS unit_name, u.decimals
         FROM ingredients i
         JOIN units u ON u.id = i.unit_id
        ORDER BY i.id DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create ingredient (admin)
router.post('/api/ingredients', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, unit_id, stock_qty = 0, min_qty = 0 } = req.body || {};
    if (!name || !unit_id) return res.status(400).json({ error: 'name y unit_id son requeridos' });
    const sql = 'INSERT INTO ingredients (name, unit_id, stock_qty, min_qty, active) VALUES (?, ?, ?, ?, 1)';
    const [r] = await pool.query(sql, [name, unit_id, Number(stock_qty), Number(min_qty)]);
    res.status(201).json({ id: r.insertId, name, unit_id, stock_qty: Number(stock_qty), min_qty: Number(min_qty), active: 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update ingredient (admin)
router.put('/api/ingredients/:id', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, unit_id, stock_qty, min_qty, active } = req.body || {};
    const fields = [];
    const params = [];
    if (name != null) { fields.push('name = ?'); params.push(String(name)); }
    if (unit_id != null) { fields.push('unit_id = ?'); params.push(Number(unit_id)); }
    if (stock_qty != null) { fields.push('stock_qty = ?'); params.push(Number(stock_qty)); }
    if (min_qty != null) { fields.push('min_qty = ?'); params.push(Number(min_qty)); }
    if (active != null) { fields.push('active = ?'); params.push(Number(active ? 1 : 0)); }
    if (!fields.length) return res.status(400).json({ error: 'Nada para actualizar' });
    const sql = `UPDATE ingredients SET ${fields.join(', ')} WHERE id = ?`;
    params.push(Number(id));
    await pool.query(sql, params);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft delete ingredient (admin)
router.delete('/api/ingredients/:id', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE ingredients SET active = 0 WHERE id = ?', [Number(id)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch ingress of stock (admin)
router.post('/api/ingredients/ingress', verifyToken, requireRole('ADMIN'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      conn.release();
      return res.status(400).json({ error: 'items debe ser un arreglo con {id, qty}' });
    }
    await conn.beginTransaction();
    for (const it of items) {
      const id = Number(it.id);
      const qty = Number(it.qty);
      if (!id || !(qty > 0)) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: 'Cada item requiere id y qty > 0' });
      }
      await conn.query('UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?', [qty, id]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

export default router;
