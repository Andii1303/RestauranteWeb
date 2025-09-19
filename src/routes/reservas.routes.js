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
    fechaReservaISO, // preferido
    fecha, // opcional si ya viene en formato SQL
    duracionMin,
    nombre,
    dni,
    telefono,
    email,
    comensales,
    descuento,
    items,
    usuario,
    // soporte alternativo por si viene anidado
    cliente,
  } = body || {};

  const mesasCsv = typeof mesas === "string" ? mesas.trim() : "";
  if (!mesasCsv) return { error: "El campo 'mesas' es requerido y no puede estar vacío." };

  // fecha -> prioriza fechaReservaISO; si no, usa fecha ya en SQL
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

export default router;