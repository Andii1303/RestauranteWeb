import { Router } from "express";
import { pool } from "../db.js";
import { parseMySqlSpResponse } from "../utils/parseMySqlSpResponse.js";

const router = Router();

// Util: convierte ISO a "YYYY-MM-DD HH:MM:SS" (hora local)
function toSqlDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

// Prepara y valida payload para SP
function mapAndValidatePayload(body) {
  const {
    mesas,
    fechaReservaISO,
    fecha,
    duracionMin,
    nombre,
    dni,
    telefono,
    email,
    comensales,
    descuento,
    items,
    usuario,
    cliente,
  } = body || {};

  const mesasCsv = typeof mesas === "string" ? mesas.trim() : "";
  if (!mesasCsv) return { error: "El campo 'mesas' es requerido y no puede estar vacío." };

  // fecha
  let fechaSql = null;
  if (fechaReservaISO) {
    fechaSql = toSqlDateTime(fechaReservaISO);
  } else if (fecha) {
    fechaSql = fecha;
  }
  if (!fechaSql) return { error: "El campo 'fechaReservaISO' o 'fecha' es requerido y debe ser válido." };

  const cli = {
    nombre: nombre ?? cliente?.nombre ?? "",
    dni: dni ?? cliente?.dni ?? "",
    telefono: telefono ?? cliente?.telefono ?? "",
    email: email ?? cliente?.email ?? "",
  };

  const com = Number(comensales ?? 0);
  const desc = Number(descuento ?? 0);

  let itemsArr = items;
  if (typeof itemsArr === "string") {
    try {
      itemsArr = JSON.parse(itemsArr);
    } catch {
      return { error: "El campo 'items' debe ser arreglo o un JSON válido." };
    }
  }
  if (!Array.isArray(itemsArr) || itemsArr.length === 0) {
    return { error: "El campo 'items' debe contener al menos un elemento." };
  }

  const usuarioStr = String(usuario ?? "").trim() || "system";

  const params = [
    mesasCsv,
    fechaSql,
    Number(duracionMin ?? 0),
    String(cli.nombre ?? ""),
    String(cli.dni ?? ""),
    String(cli.telefono ?? ""),
    String(cli.email ?? ""),
    com,
    desc,
    JSON.stringify(itemsArr),
    usuarioStr,
  ];

  return { params };
}

// Lógica reutilizable para invocar el SP
async function ejecutarSpCrearReservaConFactura(payload) {
  const mapped = mapAndValidatePayload(payload);
  if (mapped.error) {
    return { status: 400, body: { ok: false, message: mapped.error } };
  }

  try {
    const [rows] = await pool.query(
      "CALL sp_crear_reserva_con_factura(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      mapped.params
    );
    const parsed = parseMySqlSpResponse(rows);
    return { status: 200, body: { ok: parsed.ok, ...(parsed.message ? { message: parsed.message } : {}), data: parsed.data } };
  } catch (err) {
    console.error("Error SP sp_crear_reserva_con_factura:", err);
    const dev = process.env.NODE_ENV !== "production" ? (err.sqlMessage || err.message) : "Error interno al crear la reserva.";
    return { status: 500, body: { ok: false, message: dev } };
  }
}

// POST /api/reservas
router.post("/api/reservas", async (req, res) => {
  const result = await ejecutarSpCrearReservaConFactura(req.body);
  res.status(result.status).json(result.body);
});

// GET /api/ping-reserva (payload de prueba)
router.get("/api/ping-reserva", async (req, res) => {
  const prueba = {
    mesas: "1,2",
    fechaReservaISO: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    duracionMin: 120,
    cliente: {
      nombre: "Pedro García",
      dni: "12345678",
      telefono: "555-9876",
      email: "pedro@correo.com",
    },
    comensales: 6,
    descuento: 0.0,
    items: [
      { id: 10, tipo: "PLATO", cantidad: 1 },
      { id: "AGUA_500ML_QR006", tipo: "PRODUCTO", cantidad: 3 },
    ],
    usuario: "mesero1",
  };

  const result = await ejecutarSpCrearReservaConFactura(prueba);
  res.status(result.status).json(result.body);
});

// === Minimalista: seleccionar mesa y crear reserva BORRADOR ===
// POST /api/reservas/draft { mesa_id }
router.post('/api/reservas/draft', async (req, res) => {
  try {
    const mesaId = String(req.body?.mesa_id || '').trim();
    if (!mesaId) return res.status(400).json({ ok: false, message: 'mesa_id requerido' });
    const [r] = await pool.query('INSERT INTO reservas (mesa_id, status) VALUES (?, "BORRADOR")', [mesaId]);
    res.status(201).json({ ok: true, id: r.insertId, mesa_id: mesaId });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Alias GET muy simple: /api/reservas/draft/:mesaId
router.get('/api/reservas/draft/:mesaId', async (req, res) => {
  try {
    const mesaId = String(req.params.mesaId || '').trim();
    if (!mesaId) return res.status(400).json({ ok: false, message: 'mesaId requerido' });
    const [r] = await pool.query('INSERT INTO reservas (mesa_id, status) VALUES (?, "BORRADOR")', [mesaId]);
    res.status(201).json({ ok: true, id: r.insertId, mesa_id: mesaId });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

export default router;
 
// Asegurar que una reserva tenga factura BORRADOR vinculada
// POST /api/reservas/:id/ensure-factura -> { ok:true, factura_id }
router.post('/api/reservas/:id/ensure-factura', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    if (!id) { conn.release(); return res.status(400).json({ ok:false, message:'id inválido' }); }
    await conn.beginTransaction();
    let [rows] = await conn.query(
      `SELECT r.id, r.mesa_id, r.mesas_mix_id, r.factura_id, r.reserva_inicio, mm.mesas_csv
       FROM reservas r LEFT JOIN mesas_mix mm ON mm.id = r.mesas_mix_id
       WHERE r.id = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      // Fallback: intentar localizar por ventana exacta y mesas_csv si viene en el body
      const bodyMesas = req.body?.mesas;
      const inicio = req.body?.reserva_inicio || req.body?.inicio || null;
      const fin = req.body?.reserva_fin || req.body?.fin || null;
      let csv = null;
      if (Array.isArray(bodyMesas)) {
        const arr = Array.from(new Set(bodyMesas.map(n=>Number(n)).filter(Number.isFinite)));
        if (arr.length) csv = arr.join(',');
      } else if (typeof bodyMesas === 'string' && bodyMesas.trim()) {
        csv = bodyMesas.split(',').map(s=>Number(s.trim())).filter(Number.isFinite).join(',');
      }
      if (inicio && fin && csv) {
        const [alt] = await conn.query(
          `SELECT r.id, r.mesa_id, r.mesas_mix_id, r.factura_id, r.reserva_inicio, mm.mesas_csv
           FROM reservas r LEFT JOIN mesas_mix mm ON mm.id = r.mesas_mix_id
           WHERE r.reserva_inicio = ? AND r.reserva_fin = ? AND mm.mesas_csv = ? FOR UPDATE`,
          [inicio, fin, csv]
        );
        if (alt.length) {
          rows = alt; // usar registro encontrado por fallback
        }
      }
    }
    if (!rows.length) { await conn.rollback(); conn.release(); return res.status(404).json({ ok:false, message:'reserva no encontrada' }); }
    const r = rows[0];
    if (r.factura_id) {
      await conn.commit(); conn.release();
      return res.json({ ok:true, factura_id: r.factura_id });
    }
    let mixId = r.mesas_mix_id;
    let csv = (r.mesas_csv || '').trim();
    if (!mixId) {
      if (!csv) {
        // Intentar derivar desde legacy mesa_id (puede ser string)
        const nums = String(r.mesa_id||'').split(/[^0-9]+/).map(s=>Number(s)).filter(n=>Number.isFinite(n));
        csv = nums.length ? nums.join(',') : 'ONLINE';
      }
      const [mx] = await conn.query('INSERT INTO mesas_mix (mesas_csv) VALUES (?)', [csv]);
      mixId = mx.insertId;
      await conn.query('UPDATE reservas SET mesas_mix_id = ? WHERE id = ?', [mixId, id]);
    }
    const [fac] = await conn.query('INSERT INTO facturas (mesas_mix_id, status, reserva_hora) VALUES (?, "BORRADOR", ?)', [mixId, r.reserva_inicio || null]);
    const facturaId = fac.insertId;
    await conn.query('UPDATE reservas SET factura_id = ? WHERE id = ?', [facturaId, id]);
    await conn.commit(); conn.release();
    res.json({ ok:true, factura_id: facturaId });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    res.status(500).json({ ok:false, message: err.message });
  }
});

// Listar reservas por día/franja
// GET /api/reservas/for-day?fecha=YYYY-MM-DD&inicio=HH:MM&fin=HH:MM
router.get('/api/reservas/for-day', async (req, res) => {
  try {
    const fecha = String(req.query?.fecha || '').trim();
    const inicio = String(req.query?.inicio || '00:00').trim();
    const fin = String(req.query?.fin || '23:59').trim();
    const includeItems = String(req.query?.includeItems || '0') === '1';
    if (!fecha) return res.status(400).json({ ok:false, message:'fecha requerida' });
    if (inicio >= fin) return res.json({ ok:true, items: [] });
    const start = `${fecha} ${inicio}:00`;
    const end = `${fecha} ${fin}:00`;

  let rows;
    try {
      [rows] = await pool.query(
        `SELECT r.id, r.reserva_inicio, r.reserva_fin, r.status,
                COALESCE(r.factura_id, (SELECT id FROM facturas WHERE mesas_mix_id = r.mesas_mix_id ORDER BY id DESC LIMIT 1)) AS factura_id,
                r.asistencia_confirmada,
                mm.id AS mesas_mix_id, mm.mesas_csv, f.cliente_nombre
         FROM reservas r
         LEFT JOIN mesas_mix mm ON mm.id = r.mesas_mix_id
         LEFT JOIN facturas f ON f.id = r.factura_id
         WHERE r.reserva_inicio IS NOT NULL AND r.reserva_fin IS NOT NULL
           AND NOT (r.reserva_fin <= ? OR r.reserva_inicio >= ?)
         ORDER BY r.reserva_inicio ASC`
        , [start, end]
      );
    } catch (err) {
      if ((err?.code || '').toUpperCase() === 'ER_BAD_FIELD_ERROR' || /Unknown column/i.test(err?.message || '')) {
        // Esquema antiguo: sin columnas de horarios -> no hay base para listar por franja
        return res.json({ ok:true, items: [] });
      }
      throw err;
    }

    // Enriquecer con nombres de mesas a partir de CSV
    const baseItems = rows.map(r => {
      const mesas = String(r.mesas_csv||'').split(',').map(s=>s.trim()).filter(Boolean);
      return {
        id: r.id,
        inicio: r.reserva_inicio,
        fin: r.reserva_fin,
        status: r.status,
        factura_id: r.factura_id || null,
        mesas_mix_id: r.mesas_mix_id || null,
        cliente: r.cliente_nombre || null,
        mesas,
        asistencia_confirmada: (typeof r.asistencia_confirmada === 'number' ? r.asistencia_confirmada : 0),
      };
    });

    // Si se solicita, anexar los ítems de menú por reserva (considerando factura principal + extras hijas)
    if (includeItems && baseItems.length) {
      for (const it of baseItems) {
        try {
          const facturaId = Number(it.factura_id) || null;
          if (!facturaId) { it.menu = []; continue; }
          const [children] = await pool.query('SELECT id FROM facturas WHERE parent_factura_id = ? AND es_extra = 1', [facturaId]);
          const ids = [facturaId, ...children.map(c => c.id)];
          // Agregar por item para consolidar cantidades
          const [menuRows] = await pool.query(
            `SELECT item_type, menu_item_id, nombre, SUM(cantidad) AS cantidad,
                    CASE WHEN SUM(cantidad) > 0 THEN ROUND(SUM(subtotal)/SUM(cantidad), 2) ELSE MAX(precio_unit) END AS precio_unit
               FROM detalles_factura
              WHERE factura_id IN (?)
              GROUP BY item_type, menu_item_id, nombre
              ORDER BY MIN(id)`
            , [ids]
          );
          it.menu = menuRows;
        } catch (e) {
          it.menu = [];
        }
      }
    }

    res.json({ ok:true, items: baseItems });
  } catch (err) {
    res.status(500).json({ ok:false, message: err.message });
  }
});

// Obtener detalle de una reserva específica
router.get('/api/reservas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok:false, message:'id inválido' });
    const [rows] = await pool.query(
      `SELECT r.id, r.reserva_inicio, r.reserva_fin, r.status,
              COALESCE(r.factura_id, (SELECT id FROM facturas WHERE mesas_mix_id = r.mesas_mix_id ORDER BY id DESC LIMIT 1)) AS factura_id,
              mm.id AS mesas_mix_id, mm.mesas_csv, f.cliente_nombre
       FROM reservas r
       LEFT JOIN mesas_mix mm ON mm.id = r.mesas_mix_id
       LEFT JOIN facturas f ON f.id = r.factura_id
       WHERE r.id = ?
       LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ ok:false, message:'reserva no encontrada' });
    const r = rows[0];
    const mesas = String(r.mesas_csv||'').split(',').map(s=>s.trim()).filter(Boolean);
    res.json({ ok:true, item: {
      id: r.id,
      inicio: r.reserva_inicio,
      fin: r.reserva_fin,
      status: r.status,
      factura_id: r.factura_id || null,
      mesas_mix_id: r.mesas_mix_id || null,
      cliente: r.cliente_nombre || null,
      mesas,
    }});
  } catch (err) {
    res.status(500).json({ ok:false, message: err.message });
  }
});

// Obtener factura vinculada (o resoluble por mesas_mix) para una reserva
router.get('/api/reservas/:id/factura', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok:false, message:'id inválido' });
    let [rows] = await pool.query('SELECT factura_id, mesas_mix_id FROM reservas WHERE id = ? LIMIT 1', [id]);
    let facturaId = null;
    if (rows.length) {
      const r = rows[0];
      facturaId = r.factura_id || null;
      if (!facturaId && r.mesas_mix_id) {
        const [fx] = await pool.query('SELECT id FROM facturas WHERE mesas_mix_id = ? ORDER BY id DESC LIMIT 1', [r.mesas_mix_id]);
        if (fx.length) facturaId = fx[0].id;
      }
    }

    // Fallback: si no se pudo por id, intentar por (inicio, fin, mesas)
    if (!facturaId) {
      const inicio = String(req.query?.inicio || '').trim();
      const fin = String(req.query?.fin || '').trim();
      const mesasQ = String(req.query?.mesas || '').trim();
      if (inicio && fin && mesasQ) {
        const norm = (csv) => csv.split(',').map(s=>Number(s.trim())).filter(Number.isFinite).sort((a,b)=>a-b).join(',');
        const targetCsv = norm(mesasQ);
        const [cands] = await pool.query(
          `SELECT r.id, r.factura_id, r.mesas_mix_id, mm.mesas_csv
             FROM reservas r LEFT JOIN mesas_mix mm ON mm.id = r.mesas_mix_id
            WHERE r.reserva_inicio = ? AND r.reserva_fin = ?`,
          [inicio, fin]
        );
        for (const c of cands) {
          const csv = norm(String(c.mesas_csv||''));
          if (csv === targetCsv) {
            if (c.factura_id) { facturaId = c.factura_id; break; }
            if (c.mesas_mix_id) {
              const [fx] = await pool.query('SELECT id FROM facturas WHERE mesas_mix_id = ? ORDER BY id DESC LIMIT 1', [c.mesas_mix_id]);
              if (fx.length) { facturaId = fx[0].id; break; }
            }
          }
        }
      }
    }

    if (!facturaId) return res.status(404).json({ ok:false, message:'factura no encontrada para la reserva' });
    return res.json({ ok:true, factura_id: facturaId });
  } catch (err) {
    res.status(500).json({ ok:false, message: err.message });
  }
});

// Actualizar las mesas asignadas a una reserva (reemplaza el CSV)
// PATCH /api/reservas/:id/mesas { mesas: "1,2,3" | [1,2,3] }
router.patch('/api/reservas/:id/mesas', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    if (!id) { conn.release(); return res.status(400).json({ ok:false, message:'id inválido' }); }
    let mesasIn = req.body?.mesas;
    if (!mesasIn && typeof req.body?.mesas_csv === 'string') mesasIn = req.body.mesas_csv;
    if (!mesasIn) { conn.release(); return res.status(400).json({ ok:false, message:'mesas requerido' }); }

    // Normalizar a arreglo de enteros únicos
    let arr = [];
    if (Array.isArray(mesasIn)) arr = mesasIn.map(x=>Number(x)).filter(n=>Number.isFinite(n));
    else if (typeof mesasIn === 'string') arr = mesasIn.split(',').map(s=>Number(s.trim())).filter(n=>Number.isFinite(n));
    arr = Array.from(new Set(arr));
    if (arr.length === 0) { conn.release(); return res.status(400).json({ ok:false, message:'lista de mesas vacía' }); }

    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT r.id, r.mesas_mix_id, mm.mesas_csv
       FROM reservas r LEFT JOIN mesas_mix mm ON mm.id = r.mesas_mix_id
       WHERE r.id = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length) { await conn.rollback(); conn.release(); return res.status(404).json({ ok:false, message:'reserva no encontrada' }); }
    const r = rows[0];

    let mixId = r.mesas_mix_id;
    const csv = arr.join(',');
    if (!mixId) {
      const [mx] = await conn.query('INSERT INTO mesas_mix (mesas_csv) VALUES (?)', [csv]);
      mixId = mx.insertId;
      await conn.query('UPDATE reservas SET mesas_mix_id = ? WHERE id = ?', [mixId, id]);
    } else {
      await conn.query('UPDATE mesas_mix SET mesas_csv = ? WHERE id = ?', [csv, mixId]);
    }

    await conn.commit();
    res.json({ ok:true, mesas: arr, mesas_csv: csv, mesas_mix_id: mixId });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ ok:false, message: err.message });
  } finally {
    conn.release();
  }
});

// Marcar asistencia del cliente a la reserva
// PATCH /api/reservas/:id/attendance { attended: true|false }
router.patch('/api/reservas/:id/attendance', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok:false, message:'id inválido' });
    const attended = !!(req.body?.attended ?? true);

    try {
      await pool.query('UPDATE reservas SET asistencia_confirmada = ? WHERE id = ?', [attended ? 1 : 0, id]);
      return res.json({ ok:true, id, asistencia_confirmada: attended ? 1 : 0 });
    } catch (err) {
      // Fallback si la columna no existe: usar status
      if ((err?.code || '').toUpperCase() === 'ER_BAD_FIELD_ERROR' || /Unknown column/i.test(err?.message || '')) {
        await pool.query('UPDATE reservas SET status = ? WHERE id = ?', [attended ? 'CONFIRMADA' : 'BORRADOR', id]);
        return res.json({ ok:true, id, status: attended ? 'CONFIRMADA' : 'BORRADOR' });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ ok:false, message: err.message });
  }
});

// Fallback: confirmar asistencia por factura
router.patch('/api/reservas/by-factura/:facturaId/attendance', async (req, res) => {
  try {
    const facturaId = Number(req.params.facturaId);
    if (!facturaId) return res.status(400).json({ ok:false, message:'facturaId inválido' });
    const attended = !!(req.body?.attended ?? true);
    const [r] = await pool.query('UPDATE reservas SET asistencia_confirmada = ? WHERE factura_id = ?', [attended ? 1 : 0, facturaId]);
    if (r.affectedRows === 0) return res.status(404).json({ ok:false, message:'reserva no encontrada para la factura' });
    return res.json({ ok:true, factura_id: facturaId, asistencia_confirmada: attended ? 1 : 0 });
  } catch (err) {
    res.status(500).json({ ok:false, message: err.message });
  }
});