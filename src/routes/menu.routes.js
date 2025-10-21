import { Router } from 'express';
import { pool } from '../db.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Public list (only active)
router.get('/api/menu-items', async (req, res) => {
  try {
    // Solo items activos y disponibles (si es PLATO con receta suficiente)
    const [items] = await pool.query(
      `SELECT id, type, name, description, price, photo_url, active FROM menu_items WHERE active = 1 ORDER BY id DESC`
    );
    const available = await computeAvailability(items);
    const inc = String(req.query.includeUnavailable || '').toLowerCase();
    const includeUnavailable = inc === '1' || inc === 'true' || inc === 'yes';
    res.json(includeUnavailable ? available : available.filter(i => i.available));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin list (all)
router.get('/api/admin/menu-items', verifyToken, requireRole('ADMIN'), async (_req, res) => {
  try {
    const [items] = await pool.query('SELECT * FROM menu_items ORDER BY id DESC');
    const withAvailability = await computeAvailability(items);
    res.json(withAvailability);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create item
router.post('/api/menu-items', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { type, name, description = null, price = 0, photo_url = null, active = 1 } = req.body || {};
    if (!type || !['PLATO','PRODUCTO'].includes(type)) return res.status(400).json({ error: 'type inválido' });
    if (!name) return res.status(400).json({ error: 'name requerido' });
    const [r] = await pool.query(
      'INSERT INTO menu_items (type, name, description, price, photo_url, active) VALUES (?, ?, ?, ?, ?, ?)',
      [type, name, description, Number(price), photo_url, Number(active ? 1 : 0)]
    );
    res.status(201).json({ id: r.insertId, type, name, description, price: Number(price), photo_url, active: Number(active ? 1 : 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update item
router.put('/api/menu-items/:id', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { type, name, description, price, photo_url, active } = req.body || {};
    const fields = [];
    const params = [];
    if (type != null) { if (!['PLATO','PRODUCTO'].includes(type)) return res.status(400).json({ error: 'type inválido' }); fields.push('type = ?'); params.push(type); }
    if (name != null) { fields.push('name = ?'); params.push(String(name)); }
    if (description != null) { fields.push('description = ?'); params.push(description); }
    if (price != null) { fields.push('price = ?'); params.push(Number(price)); }
    if (photo_url != null) { fields.push('photo_url = ?'); params.push(photo_url); }
    if (active != null) { fields.push('active = ?'); params.push(Number(active ? 1 : 0)); }
    if (!fields.length) return res.status(400).json({ error: 'Nada para actualizar' });
    const sql = `UPDATE menu_items SET ${fields.join(', ')} WHERE id = ?`;
    params.push(Number(id));
    await pool.query(sql, params);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deactivate (soft-delete)
router.delete('/api/menu-items/:id', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE menu_items SET active = 0 WHERE id = ?', [Number(id)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get recipe for a PLATO
router.get('/api/menu-items/:id/recipe', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT ri.ingredient_id, i.name, ri.qty, i.unit_id, u.code AS unit_code
         FROM recipe_ingredients ri
         JOIN ingredients i ON i.id = ri.ingredient_id
         JOIN units u ON u.id = i.unit_id
        WHERE ri.menu_item_id = ?`
      , [Number(id)]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Replace recipe for a PLATO (atomic replace)
router.put('/api/menu-items/:id/recipe', verifyToken, requireRole('ADMIN'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { ingredients } = req.body || {};
    if (!Array.isArray(ingredients)) return res.status(400).json({ error: 'ingredients debe ser arreglo' });
    await conn.beginTransaction();
    await conn.query('DELETE FROM recipe_ingredients WHERE menu_item_id = ?', [Number(id)]);
    for (const it of ingredients) {
      const ing = Number(it.ingredient_id);
      const qty = Number(it.qty);
      if (!ing || !(qty > 0)) { await conn.rollback(); return res.status(400).json({ error: 'ingredient_id y qty > 0 requeridos' }); }
      await conn.query('INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, qty) VALUES (?, ?, ?)', [Number(id), ing, qty]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

export default router;

// ===== Helpers =====
async function computeAvailability(items) {
  const results = [];
  for (const it of items) {
    if (it.type === 'PRODUCTO') {
      results.push({ ...it, available: !!it.active });
      continue;
    }
    // Para PLATO, calcular max por stock según receta
    const [recipe] = await pool.query(
      `SELECT ri.ingredient_id, ri.qty, i.stock_qty
         FROM recipe_ingredients ri
         JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.menu_item_id = ?`, [it.id]
    );
    if (!recipe.length) {
      results.push({ ...it, available: false });
      continue;
    }
    let canMake = Infinity;
    for (const r of recipe) {
      if (!(r.qty > 0)) { canMake = 0; break; }
      const portion = Math.floor((Number(r.stock_qty) || 0) / Number(r.qty));
      if (portion < canMake) canMake = portion;
    }
    results.push({ ...it, available: it.active && canMake > 0, max_servings: isFinite(canMake) ? canMake : 0 });
  }
  return results;
}
