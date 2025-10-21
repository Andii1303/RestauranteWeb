// Conexión a MySQL para el backend

import mysql from "mysql2/promise";

// Si necesitas inicializar la base de datos, ejecuta los scripts SQL directamente.
const {
  DB_HOST = "db",
  DB_PORT = "3306",
  DB_USER = "appuser",
  DB_PASSWORD = "App12345!",
  DB_NAME = "restauranteDB",
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

// Helper opcional para ping
export async function ping() {
  const [rows] = await pool.query(
    "SELECT 1 AS ok, DATABASE() AS db, NOW() AS now;"
  );
  return rows[0];
}
