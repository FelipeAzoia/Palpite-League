-- SPEC-024: processamento da devolução. Duas informações do resultado do provedor, gravadas na
-- própria movimentação enquanto ela ainda está pendente (a migração 012 impede alterar as finais):
-- - refusal_reason: motivo da recusa informado pelo provedor, como transação não reembolsável (A6);
-- - inconsistency: resposta incoerente que impede a confirmação, como valor divergente (A7).
ALTER TABLE financial_movements ADD COLUMN refusal_reason TEXT
  CHECK (refusal_reason IS NULL OR refusal_reason IN ('not_refundable', 'provider_refused'));
ALTER TABLE financial_movements ADD COLUMN inconsistency TEXT
  CHECK (inconsistency IS NULL OR inconsistency IN ('amount_mismatch'));
