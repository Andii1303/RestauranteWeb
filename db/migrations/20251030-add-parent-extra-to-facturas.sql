ALTER TABLE facturas
  ADD COLUMN parent_factura_id INT NULL AFTER id,
  ADD COLUMN es_extra TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

ALTER TABLE facturas
  ADD CONSTRAINT fk_facturas_parent
    FOREIGN KEY (parent_factura_id) REFERENCES facturas(id)
    ON DELETE SET NULL;

CREATE INDEX idx_facturas_parent ON facturas(parent_factura_id);
CREATE INDEX idx_facturas_es_extra ON facturas(es_extra);
