// Conexión a MySQL para el backend

import mysql from "mysql2/promise";

// Si necesitas inicializar la base de datos, ejecuta los scripts SQL directamente.
const {
  DB_HOST = "db",
  DB_PORT = "3306",
  DB_USER = "appuser",
  DB_PASSWORD = "App12345!",
  DB_NAME = "restauranteDB",
  DB_POOL_SIZE = "10",
  DB_SSL = "false",
  SKIP_DB = "false",
} = process.env;

const sslOption = DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined;

export const pool = SKIP_DB === 'true'
  ? null
  : mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: Number(DB_POOL_SIZE || 10),
      queueLimit: 0,
      ssl: sslOption,
    });

// Helper opcional para ping
export async function ping() {
  if (!pool) return { ok: 1, db: null, now: new Date().toISOString(), skipped: true };
  const [rows] = await pool.query(
    "SELECT 1 AS ok, DATABASE() AS db, NOW() AS now;"
  );
  return rows[0];
}

// Inicializa de forma segura el esquema mínimo usado por reservas/mesas/facturas.
// Solo crea tablas si no existen; NO altera estructuras existentes.
export async function ensureReservationSchema() {
  if (!pool) return; // DB disabled
  // Catálogo base para menú e ingredientes (idempotente)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS units (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(32) NOT NULL UNIQUE,
      name VARCHAR(64) NOT NULL,
      decimals TINYINT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      unit_id INT NOT NULL,
      stock_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
      min_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_ingredients_unit FOREIGN KEY (unit_id) REFERENCES units(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type ENUM('PLATO','PRODUCTO') NOT NULL,
      name VARCHAR(160) NOT NULL,
      description VARCHAR(500),
      price DECIMAL(12,2) NOT NULL DEFAULT 0,
      photo_url VARCHAR(500),
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_menu_items_name_type (name, type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      menu_item_id INT NOT NULL,
      ingredient_id INT NOT NULL,
      qty DECIMAL(12,3) NOT NULL,
      PRIMARY KEY (menu_item_id, ingredient_id),
      CONSTRAINT fk_recipe_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
      CONSTRAINT fk_recipe_ing FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Seeds mínimos para units
  try {
    await pool.query(`INSERT IGNORE INTO units (id, code, name, decimals) VALUES
      (1,'u','Unidad',0), (2,'g','Gramos',3), (3,'ml','Mililitros',3)`);
  } catch {}
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

  // Migración defensiva de facturas: columnas posibles faltantes (usando helpers)
  try { await ensureColumn('facturas', 'mesas_mix_id', 'mesas_mix_id INT NULL'); } catch {}
  try { await ensureColumn('facturas', 'reserva_hora', 'reserva_hora DATETIME NULL'); } catch {}
  try { await ensureColumn('facturas', 'total', 'total DECIMAL(10,2) NOT NULL DEFAULT 0'); } catch {}
  try { await ensureColumn('facturas', 'cliente_nombre', 'cliente_nombre VARCHAR(150) NULL'); } catch {}
  try { await ensureColumn('facturas', 'cliente_dni', 'cliente_dni VARCHAR(50) NULL'); } catch {}
  try { await ensureColumn('facturas', 'cliente_telefono', 'cliente_telefono VARCHAR(50) NULL'); } catch {}
  try { await ensureColumn('facturas', 'cliente_email', 'cliente_email VARCHAR(150) NULL'); } catch {}
  try { await ensureIndex('facturas', 'idx_facturas_mesas_mix_id', '(mesas_mix_id)'); } catch {}

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

  // Helpers de migración compatibles con versiones que no soportan IF NOT EXISTS
  async function ensureColumn(table, column, definition) {
    const [cols] = await pool.query(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [DB_NAME, table, column]
    );
    if (!cols.length) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    }
  }
  async function ensureIndex(table, indexName, columnsExpr) {
    const [idx] = await pool.query(
      `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [DB_NAME, table, indexName]
    );
    if (!idx.length) {
      await pool.query(`CREATE INDEX \`${indexName}\` ON \`${table}\` ${columnsExpr}`);
    }
  }

  // Migración defensiva: agregar columnas e índices si faltan (BDs antiguas)
  try { await ensureColumn('reservas', 'mesas_mix_id', 'mesas_mix_id INT NULL'); } catch {}
  try { await ensureColumn('reservas', 'factura_id', 'factura_id INT NULL'); } catch {}
  try { await ensureColumn('reservas', 'created_by', 'created_by VARCHAR(100) NULL'); } catch {}
  try { await ensureColumn('reservas', 'activa', 'activa TINYINT(1) NOT NULL DEFAULT 1'); } catch {}
  try { await ensureColumn('reservas', 'reserva_inicio', 'reserva_inicio DATETIME NULL'); } catch {}
  try { await ensureColumn('reservas', 'reserva_fin', 'reserva_fin DATETIME NULL'); } catch {}
  try { await ensureColumn('reservas', 'status', "status ENUM('BORRADOR','CONFIRMADA','CANCELADA') NOT NULL DEFAULT 'BORRADOR'"); } catch {}
  // Índices
  try { await ensureIndex('reservas', 'idx_reservas_inicio', '(reserva_inicio)'); } catch {}
  try { await ensureIndex('reservas', 'idx_reservas_fin', '(reserva_fin)'); } catch {}
  try { await ensureIndex('reservas', 'idx_reservas_activa_inicio_fin', '(activa, reserva_inicio, reserva_fin)'); } catch {}
}
