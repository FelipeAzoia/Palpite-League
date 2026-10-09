# ADR-0003 — Mercado Pago para operações financeiras em ambiente de teste

- **Status:** Aceito
- **Data:** 2026-10-02
- **Drivers relacionados:** DA-03

## Contexto

Os requisitos descrevem assinatura Premium recorrente, taxa de entrada, devoluções e premiações. A entrega acadêmica precisa exercitar uma integração de pagamentos, sem movimentar dinheiro real. O ambiente de teste do Mercado Pago será avaliado para cada operação; a disponibilidade de assinatura não implica que cobrança, reembolso e repasse estejam todos suportados pelo mesmo fluxo ou pelas mesmas contas de teste.

## Decisão

Usar o Mercado Pago em ambiente de teste para assinatura Premium, taxa de entrada, devolução e premiação, exclusivamente para as operações que forem validadas como suportadas no ambiente de teste. Não habilitar credenciais de produção nem realizar cobranças ou transferências reais. Durante desenvolvimento e testes automatizados, um simulador poderá substituir o provedor; operações simuladas devem permanecer identificadas como simulação e nunca ser apresentadas como confirmadas pelo Mercado Pago.

Operações aguardando confirmação permanecem pendentes. O sistema não repetirá automaticamente uma cobrança, reembolso ou repasse; antes de uma nova tentativa, deverá consultar o estado da operação anterior para evitar duplicidade.

## Motivos

A integração em ambiente de teste permite exercitar o limite entre o domínio financeiro e o provedor sem movimentar dinheiro real. A validação explícita por operação evita assumir que a API de assinaturas, por si só, oferece os fluxos de cobrança de taxa, reembolso ou repasse necessários.

## Consequências

- A interface e a apresentação devem deixar claro que todas as operações são testes, sem movimentação de dinheiro real.
- Usar somente credenciais e contas de teste; nunca incluir tokens ou segredos no repositório.
- Validar em separado criação, confirmação, consulta de estado e cancelamento de assinatura; cobrança de taxa; reembolso; e repasse de premiação. Confirmar também as permissões, restrições e mecanismos de confirmação no ambiente de teste.
- Se o ambiente não suportar uma operação, mantê-la simulada somente em desenvolvimento/testes, sem declarar que foi processada pelo provedor.
- Operações de produção e movimentação real de fundos ficam fora do escopo e exigiriam nova decisão e análise legal e operacional.
- Registros de teste não devem ser apresentados como comprovantes de pagamento real.

## Referências

- [Documentação de assinaturas do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview)
- [Integração de assinatura sem plano associado](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/introduction)
- [Contas de teste para assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/test/accounts)
- [Testar aprovação de pagamento em assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-test/payment-approval)
- [Documentação de pagamentos do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/landing)