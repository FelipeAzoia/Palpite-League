-- SPEC-019 e SPEC-020, alterações aprovadas pela equipe em 23/11/2026.

-- 1. Versão da Política de Cobrança e Cancelamento aceita na contratação (SPEC-019, CA-22).
--    Contratações anteriores à política ficam sem versão.
ALTER TABLE subscriptions ADD COLUMN billing_policy_version TEXT;

-- 2. Ao cancelar o Premium, o bolão ainda aberto perde os resultados ao vivo (SPEC-020, CA-19).
--    As demais regras do bolão continuam imutáveis; o recurso ao vivo só pode ser retirado (1 → 0),
--    nunca concedido depois da criação nem reescrito.
DROP TRIGGER pools_rules_are_immutable;

CREATE TRIGGER pools_rules_are_immutable
BEFORE UPDATE OF creator_id, name, starts_on, ends_on, entry_fee_cents, prize_model, tiebreaker, created_at ON pools
BEGIN
  SELECT RAISE(ABORT, 'pool rules are immutable');
END;

CREATE TRIGGER pools_live_results_can_only_be_removed
BEFORE UPDATE OF live_results ON pools
WHEN NOT (OLD.live_results = 1 AND NEW.live_results = 0)
BEGIN
  SELECT RAISE(ABORT, 'pool rules are immutable');
END;
