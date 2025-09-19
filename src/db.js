import mysql from "mysql2/promise";

const {
  // Defaults pensados para correr DENTRO de Docker Compose
  DB_HOST = "db",
  DB_PORT = "3306",
  DB_USER = "appuser",
  DB_PASSWORD = "App12345!",
  DB_NAME = "proyectoWeb",   // tu esquema activo
} = process.env;

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function ping() {
  const [rows] = await pool.query(
    "SELECT 1 AS ok, DATABASE() AS db, NOW() AS now;"
  );
  return rows[0]; // { ok: 1, db: '...', now: '...' }
}

// Opcional: helper para SPs
export async function callSP(spName, params = []) {
  const placeholders = params.map(() => "?").join(",");
  const sql = `CALL ${spName}(${placeholders})`;
  const [rows] = await pool.query(sql, params);
  return rows;
}