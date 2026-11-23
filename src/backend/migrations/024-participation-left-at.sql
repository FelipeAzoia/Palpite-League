-- SPEC-028: instante da saída do bolão, para limitar o histórico de quem saiu ao período em que
-- participou (OPEN-162). Gravado pela saída (SPEC-017); saídas anteriores a esta migração usam o
-- instante registrado na auditoria.
ALTER TABLE pool_participations ADD COLUMN left_at TEXT;

UPDATE pool_participations
SET left_at = (
  SELECT MIN(a.occurred_at) FROM audit_records a
  WHERE a.action = 'participation.left' AND a.object_id = pool_participations.id AND a.result = 'success'
)
WHERE status = 'left';
