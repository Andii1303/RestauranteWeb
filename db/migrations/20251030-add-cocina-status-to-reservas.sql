ALTER TABLE reservas
  ADD COLUMN cocina_status ENUM('PENDIENTE','PREPARANDO','LISTO') NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN cocina_updated_at TIMESTAMP NULL DEFAULT NULL;

CREATE INDEX idx_reservas_cocina_status ON reservas (cocina_status);
