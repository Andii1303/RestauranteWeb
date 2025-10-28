import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// Listar mesas
router.get('/api/mesas', async (_req, res) => {
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

// Disponibilidad de mesas por franja (intervalos de 30 minutos)
// GET /api/mesas/availability?fecha=YYYY-MM-DD&inicio=HH:MM&fin=HH:MM
router.get('/api/mesas/availability', async (req, res) => {
  try {
    const fecha = String(req.query?.fecha || '').trim();
    const inicio = String(req.query?.inicio || '').trim();
    const fin = String(req.query?.fin || '').trim();
    if (!fecha || !inicio || !fin) return res.status(400).json({ ok:false, message:'fecha, inicio y fin requeridos' });
    const start = `${fecha} ${inicio}:00`;
    const end = `${fecha} ${fin}:00`;
    // Si el rango es inválido (inicio >= fin), responder vacío sin error
    if (inicio >= fin) {
      return res.json({ ok:true, unavailable_ids: [], unavailable_nombres: [] });
    }
    // Reservas activas que solapan: NOT (fin <= start OR inicio >= end)
    let rows;
    try {
      [rows] = await pool.query(
        `SELECT r.id AS reserva_id, mm.mesas_csv
         FROM reservas r
         JOIN mesas_mix mm ON mm.id = r.mesas_mix_id
         WHERE r.reserva_inicio IS NOT NULL AND r.reserva_fin IS NOT NULL
           AND NOT (r.reserva_fin <= ? OR r.reserva_inicio >= ?)`
        , [start, end]
      );
    } catch (err) {
      // Si faltan columnas (reservas antiguas), fallar suave: sin conflictos
      if ((err?.code || '').toUpperCase() === 'ER_BAD_FIELD_ERROR' || /Unknown column/i.test(err?.message || '')) {
        console.warn('Availability: columnas de reservas no encontradas; devolviendo lista vacía');
        rows = [];
      } else {
        throw err;
      }
    }
    const idSet = new Set();
    for (const r of rows) {
      String(r.mesas_csv || '').split(',').map(s=>s.trim()).filter(Boolean).forEach(x => idSet.add(Number(x)));
    }
    const ids = Array.from(idSet);
    let nombres = [];
    if (ids.length) {
      const [ms] = await pool.query(`SELECT id, nombre FROM mesas WHERE id IN (${ids.map(()=>'?').join(',')})`, ids);
      nombres = ms.map(m => m.nombre);
    }
    res.json({ ok:true, unavailable_ids: ids, unavailable_nombres: nombres });
  } catch (err) {
    res.status(500).json({ ok:false, message: err.message });
  }
});

// Detalle y disponibilidad de una mesa específica por franja
// GET /api/mesas/:nombre/details?fecha=YYYY-MM-DD&inicio=HH:MM&fin=HH:MM
router.get('/api/mesas/:nombre/details', async (req, res) => {
  try {
    const nombre = String(req.params.nombre || '').trim();
    if (!nombre) return res.status(400).json({ ok:false, message:'nombre requerido' });
    const [rows] = await pool.query('SELECT id, nombre, capacidad, activa FROM mesas WHERE nombre = ? LIMIT 1', [nombre]);
    if (!rows.length) return res.status(404).json({ ok:false, message:'mesa no encontrada' });
    const mesa = rows[0];
    const fecha = String(req.query?.fecha || '').trim();
    const inicio = String(req.query?.inicio || '').trim();
    const fin = String(req.query?.fin || '').trim();
    let disponible = true;
    if (fecha && inicio && fin) {
      const start = `${fecha} ${inicio}:00`;
      const end = `${fecha} ${fin}:00`;
      if (inicio >= fin) {
        // Rango inválido: consideramos disponible para no romper UI
        return res.json({ ok:true, nombre: mesa.nombre, capacidad: mesa.capacidad, activa: !!mesa.activa, disponible: true, extras_max: 2 });
      }
      let conf;
      try {
        [conf] = await pool.query(
          `SELECT mm.mesas_csv
           FROM reservas r JOIN mesas_mix mm ON mm.id = r.mesas_mix_id
           WHERE r.reserva_inicio IS NOT NULL AND r.reserva_fin IS NOT NULL
             AND NOT (r.reserva_fin <= ? OR r.reserva_inicio >= ?)`
          , [start, end]
        );
      } catch (err) {
        if ((err?.code || '').toUpperCase() === 'ER_BAD_FIELD_ERROR' || /Unknown column/i.test(err?.message || '')) {
          console.warn('Mesa details: columnas de reservas no encontradas; asumiendo disponible');
          return res.json({ ok:true, nombre: mesa.nombre, capacidad: mesa.capacidad, activa: !!mesa.activa, disponible: true, extras_max: 2 });
        }
        throw err;
      }
      const conflictSet = new Set();
      for (const c of conf) {
        String(c.mesas_csv||'').split(',').map(s=>Number(s.trim())).filter(Boolean).forEach(x => conflictSet.add(x));
      }
      // Ver si el id de esta mesa está en conflicto
      disponible = !conflictSet.has(mesa.id);
    }
    // Regla simple para extras: hasta 2 sillas adicionales por mesa
    const extras_max = 2;
    res.json({ ok:true, nombre: mesa.nombre, capacidad: mesa.capacidad, activa: !!mesa.activa, disponible, extras_max });
  } catch (err) {
    res.status(500).json({ ok:false, message: err.message });
  }
});

// Alternativa sin parámetro en la ruta para evitar conflictos de matching en algunos entornos
// GET /api/mesa-details?nombre=MESA_4_A&fecha=YYYY-MM-DD&inicio=HH:MM&fin=HH:MM
router.get('/api/mesa-details', async (req, res) => {
  try {
    const nombre = String(req.query?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ ok:false, message:'nombre requerido' });
    const [rows] = await pool.query('SELECT id, nombre, capacidad, activa FROM mesas WHERE nombre = ? LIMIT 1', [nombre]);
    if (!rows.length) return res.status(404).json({ ok:false, message:'mesa no encontrada' });
    const mesa = rows[0];
    const fecha = String(req.query?.fecha || '').trim();
    const inicio = String(req.query?.inicio || '').trim();
    const fin = String(req.query?.fin || '').trim();
    let disponible = true;
    if (fecha && inicio && fin) {
      const start = `${fecha} ${inicio}:00`;
      const end = `${fecha} ${fin}:00`;
      const [conf] = await pool.query(
        `SELECT mm.mesas_csv
         FROM reservas r JOIN mesas_mix mm ON mm.id = r.mesas_mix_id
         WHERE r.reserva_inicio IS NOT NULL AND r.reserva_fin IS NOT NULL
           AND NOT (r.reserva_fin <= ? OR r.reserva_inicio >= ?)`
        , [start, end]
      );
      const conflictSet = new Set();
      for (const c of conf) {
        String(c.mesas_csv||'').split(',').map(s=>Number(s.trim())).filter(Boolean).forEach(x => conflictSet.add(x));
      }
      disponible = !conflictSet.has(mesa.id);
    }
    const extras_max = 2;
    res.json({ ok:true, nombre: mesa.nombre, capacidad: mesa.capacidad, activa: !!mesa.activa, disponible, extras_max });
  } catch (err) {
    res.status(500).json({ ok:false, message: err.message });
  }
});

export default router;
