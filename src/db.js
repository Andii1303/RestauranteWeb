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

// Inicializa de forma segura el esquema mínimo usado por reservas/mesas/facturas.
// Solo crea tablas si no existen; NO altera estructuras existentes.
export async function ensureReservationSchema() {
  // Tabla de mesas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mesas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL UNIQUE,
      capacidad INT NOT NULL DEFAULT 4,
      activa TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Agrupador de mesas seleccionadas (para reservas con múltiples mesas)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mesas_mix (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mesas_csv TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Facturas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS facturas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mesas_mix_id INT NULL,
      status ENUM('BORRADOR','PAGADA','CANCELADA') NOT NULL DEFAULT 'BORRADOR',
      reserva_hora DATETIME NULL,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      cliente_nombre VARCHAR(150) NULL,
      cliente_dni VARCHAR(50) NULL,
      cliente_telefono VARCHAR(50) NULL,
      cliente_email VARCHAR(150) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (mesas_mix_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Detalles de factura (carrito)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS detalles_factura (
      id INT AUTO_INCREMENT PRIMARY KEY,
      factura_id INT NOT NULL,
      item_type VARCHAR(32) NOT NULL DEFAULT 'PLATO',
      menu_item_id VARCHAR(64) NULL,
      nombre VARCHAR(255) NOT NULL,
      cantidad INT NOT NULL DEFAULT 1,
      precio_unit DECIMAL(10,2) NOT NULL DEFAULT 0,
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (factura_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Reservas: referencia a combinación de mesas y factura
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mesa_id VARCHAR(100) NOT NULL, -- legado/identificador legible
      mesas_mix_id INT NULL,
      factura_id INT NULL,
      created_by VARCHAR(100) NULL,
      activa TINYINT(1) NOT NULL DEFAULT 1,
      reserva_inicio DATETIME NULL,
      reserva_fin DATETIME NULL,
      status ENUM('BORRADOR','CONFIRMADA','CANCELADA') NOT NULL DEFAULT 'BORRADOR',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (mesas_mix_id),
      INDEX (factura_id),
      INDEX (reserva_inicio),
      INDEX (reserva_fin)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}
