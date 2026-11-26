-- Ejecutar UNA sola vez en la base de datos (MySQL 8). Cada ALTER falla si la columna ya existe: omítalo.

-- HU-07: filtro por tipo (público/privado); HU-15/16: tarifa por día y servicios
ALTER TABLE parqueos ADD COLUMN tipo ENUM('publico','privado') NOT NULL DEFAULT 'privado';
ALTER TABLE parqueos ADD COLUMN tarifa_por_dia DECIMAL(10,2) NULL;
ALTER TABLE parqueos ADD COLUMN servicios VARCHAR(255) NULL;

-- HU-17: aviso activable por favorito
ALTER TABLE favoritos ADD COLUMN notificar TINYINT(1) NOT NULL DEFAULT 1;

-- HU-13: historial de parqueos visitados
CREATE TABLE IF NOT EXISTS historial_visitas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  parqueo_id INT NOT NULL,
  visitado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hist_usuario (usuario_id, visitado_en),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (parqueo_id) REFERENCES parqueos(id) ON DELETE CASCADE
);

-- HU-17: avisos pendientes de entrega a la app
CREATE TABLE IF NOT EXISTS notificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  parqueo_id INT NOT NULL,
  mensaje VARCHAR(255) NOT NULL,
  leida TINYINT(1) NOT NULL DEFAULT 0,
  creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_usuario (usuario_id, leida),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (parqueo_id) REFERENCES parqueos(id) ON DELETE CASCADE
);

-- Integridad de disponibilidad (HU-14)
ALTER TABLE disponibilidad ADD CONSTRAINT chk_cupos_libres CHECK (cupos_libres >= 0);
ALTER TABLE disponibilidad ADD CONSTRAINT chk_cupos_ocupados CHECK (cupos_ocupados >= 0);
