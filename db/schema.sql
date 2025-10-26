-- Esquema base para restauranteDB
CREATE DATABASE IF NOT EXISTS restauranteDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE restauranteDB;

-- Tabla principal de usuarios
CREATE TABLE IF NOT EXISTS app_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','COCINERO','MESERO','CLIENTE') NOT NULL DEFAULT 'CLIENTE',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Unidades de medida (g, ml, unidad, etc.)
CREATE TABLE IF NOT EXISTS units (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE, -- 'g', 'ml', 'u'
  name VARCHAR(64) NOT NULL,
  decimals TINYINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ingredientes con stock
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

-- Ítems del menú (PLATO: requiere receta; PRODUCTO: se vende por unidad)
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

-- Receta: relación N:M entre PLATO y ingredientes con cantidades
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  menu_item_id INT NOT NULL,
  ingredient_id INT NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  PRIMARY KEY (menu_item_id, ingredient_id),
  CONSTRAINT fk_recipe_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_ing FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seeds básicos de unidades
INSERT IGNORE INTO units (id, code, name, decimals) VALUES
  (1, 'u', 'Unidad', 0),
  (2, 'g', 'Gramos', 3),
  (3, 'ml', 'Mililitros', 3);

-- Reservas mínimas: registro de selección de mesa como borrador
CREATE TABLE IF NOT EXISTS reservas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mesa_id VARCHAR(50) NOT NULL,
  status ENUM('BORRADOR','CONFIRMADA','CANCELADA') NOT NULL DEFAULT 'BORRADOR',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Mesas físicas del restaurante
CREATE TABLE IF NOT EXISTS mesas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL,
  capacidad INT NOT NULL DEFAULT 4,
  activa TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_mesas_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Mix de mesas (varias mesas en una sola reserva/factura) con CSV simple para mantenerlo ligero
CREATE TABLE IF NOT EXISTS mesas_mix (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mesas_csv VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Facturas (borrador al crear desde selección de mesa)
CREATE TABLE IF NOT EXISTS facturas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_nombre VARCHAR(150) DEFAULT NULL,
  cliente_dni VARCHAR(50) DEFAULT NULL,
  cliente_telefono VARCHAR(50) DEFAULT NULL,
  cliente_email VARCHAR(150) DEFAULT NULL,
  mesas_mix_id INT NOT NULL,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('BORRADOR','ABIERTA','PAGADA','CANCELADA') NOT NULL DEFAULT 'BORRADOR',
  reserva_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_facturas_mix FOREIGN KEY (mesas_mix_id) REFERENCES mesas_mix(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Detalles de factura: platos/productos consumidos
CREATE TABLE IF NOT EXISTS detalles_factura (
  id INT AUTO_INCREMENT PRIMARY KEY,
  factura_id INT NOT NULL,
  item_type ENUM('PLATO','PRODUCTO') NOT NULL DEFAULT 'PLATO',
  menu_item_id INT DEFAULT NULL,
  nombre VARCHAR(200) NOT NULL,
  cantidad INT NOT NULL DEFAULT 1,
  precio_unit DECIMAL(12,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_detalles_factura_factura FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Evolución de reservas para soportar mix de mesas y franjas horarias
ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS mesas_mix_id INT NULL,
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS activa TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reserva_inicio DATETIME NULL,
  ADD COLUMN IF NOT EXISTS reserva_fin DATETIME NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS factura_id INT NULL;

-- FKs e índices (idempotentes)
ALTER TABLE reservas
  ADD CONSTRAINT IF NOT EXISTS fk_reservas_mix FOREIGN KEY (mesas_mix_id) REFERENCES mesas_mix(id) ON DELETE SET NULL,
  ADD CONSTRAINT IF NOT EXISTS fk_reservas_factura FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservas_activa_inicio_fin ON reservas (activa, reserva_inicio, reserva_fin);