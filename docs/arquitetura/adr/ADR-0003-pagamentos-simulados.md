# ADR-0003 — Mercado Pago para assinatura mensal em ambiente de teste

- **Status:** Aceito
- **Data:** 2026-10-02
- **Drivers relacionados:** DA-03

## Contexto

Os requisitos descrevem uma assinatura Premium com cobrança recorrente, além de taxas de entrada, devoluções e premiações. O projeto é acadêmico e não realizará transações financeiras reais. O Mercado Pago documenta uma API de assinaturas, contas de teste e testes de aprovação de pagamentos.

## Decisão

Usar a API de Assinaturas do Mercado Pago para demonstrar o fluxo da assinatura Premium mensal, exclusivamente em ambiente de teste e com credenciais/contas de teste. Não habilitar credenciais de produção nem realizar cobranças ou transferências reais.

As demais movimentações financeiras do domínio (taxa de entrada, devolução e premiação) permanecerão simuladas, sem movimentação de dinheiro real. Manter registros de teste associados às operações para exercitar a rastreabilidade exigida pelo domínio.

## Motivos

A API de assinaturas corresponde ao requisito de cobrança recorrente do plano Premium e permite demonstrar a integração externa. O ambiente de teste evita movimentação financeira real durante o projeto acadêmico.

## Consequências

- A interface e a apresentação devem deixar claro que assinaturas e pagamentos são testes, sem cobrança real.
- Usar somente credenciais e contas de teste; nunca incluir tokens ou segredos no repositório.
- Validar a criação, autorização, consulta de estado e cancelamento da assinatura mensal antes da apresentação.
- A implementação de produção, cobrança real, taxas de entrada reais e repasses de premiação ficam fora do escopo e exigiriam nova decisão e análise legal e operacional.
- Registros de teste não devem ser apresentados como comprovantes de pagamento real.

## Referências

- [Documentação de assinaturas do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview)
- [Integração de assinatura sem plano associado](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/introduction)
- [Contas de teste para assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/test/accounts)
- [Testar aprovação de pagamento em assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-test/payment-approval)