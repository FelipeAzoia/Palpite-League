-- SPEC-010: sinalizador definitivo de entrada tardia, gravado somente na confirmação da participação
-- (junto com a data de entrada). Vazio enquanto a participação não está confirmada.
ALTER TABLE pool_participations ADD COLUMN late_entry INTEGER CHECK (late_entry IN (0, 1));
