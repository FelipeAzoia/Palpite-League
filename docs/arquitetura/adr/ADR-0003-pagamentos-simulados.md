# ADR-0003 — Mercado Pago para operações financeiras em ambiente de teste

- **Status:** Aceito
- **Data:** 2026-10-02
- **Drivers relacionados:** DA-03

## Contexto

Os requisitos descrevem assinatura Premium recorrente, taxa de entrada, devoluções e premiações. A entrega acadêmica precisa exercitar uma integração de pagamentos, sem movimentar dinheiro real. A cobrança da taxa de entrada foi definida com Checkout Pro; a assinatura usará a API de Assinaturas. A disponibilidade dessas integrações não implica que reembolso ou repasse posterior estejam suportados pelo mesmo fluxo.

## Decisão

Usar a API de Assinaturas do Mercado Pago em ambiente de teste para a assinatura Premium e Checkout Pro em ambiente de teste para a taxa de entrada. Investigar separadamente os fluxos de devolução e premiação antes de considerá-los integrações disponíveis. Não habilitar credenciais de produção nem realizar cobranças ou transferências reais. Durante desenvolvimento e testes automatizados, um simulador poderá substituir o provedor. Se o sandbox não oferecer repasse posterior ao vencedor, o simulador poderá ser usado também na demonstração acadêmica, desde que a operação esteja claramente identificada como simulada e a integração de premiação permaneça registrada como não atendida.

Operações aguardando confirmação permanecem pendentes. O sistema não repetirá automaticamente uma cobrança, reembolso ou repasse; antes de uma nova tentativa, deverá consultar o estado da operação anterior para evitar duplicidade.

## Motivos

A integração em ambiente de teste permite exercitar o limite entre o domínio financeiro e o provedor sem movimentar dinheiro real. Checkout Pro fornece o checkout hospedado para a cobrança avulsa, enquanto a API de Assinaturas trata o ciclo recorrente. A validação explícita por operação evita assumir que esses fluxos oferecem também reembolso ou repasse posterior.

## Consequências

- A interface e a apresentação devem deixar claro que todas as operações são testes, sem movimentação de dinheiro real.
- Usar somente credenciais e contas de teste; nunca incluir tokens ou segredos no repositório.
- O adaptador aceita apenas credenciais de teste. Ver [Atualização de 24/11/2026](#atualização-de-24112026--formato-das-credenciais-de-teste).
- Validar em separado criação, confirmação, consulta de estado e cancelamento de assinatura; preferência, pagamento e estados da taxa; reembolso; e repasse de premiação. Confirmar também as permissões, restrições e mecanismos de confirmação no ambiente de teste.
- O simulador de premiação na demonstração é fallback visual/funcional acadêmico, não prova de suporte nem substituto da integração exigida. Deve ser distinguível de operações confirmadas pelo provedor.
- A validação documental e as decisões atuais não equivalem a chamadas executadas no sandbox. O estado por operação e as próximas verificações estão em [Validação documental do Mercado Pago](../validacao-mercado-pago.md).
- Operações de produção e movimentação real de fundos ficam fora do escopo e exigiriam nova decisão e análise legal e operacional.
- Registros de teste não devem ser apresentados como comprovantes de pagamento real.

## Atualização de 24/11/2026 — formato das credenciais de teste

**Contexto.** A proteção original do adaptador aceitava só chaves com o prefixo `TEST-`. O painel do Mercado Pago passou a emitir, na seção "Credenciais de teste" das aplicações novas, Public Key e Access Token com o prefixo `APP_USR-`, o mesmo das credenciais de produção. Com isso, credenciais de teste legítimas eram recusadas, e o prefixo deixou de bastar para distinguir teste de produção.

**Decisão.** O adaptador `mercado-pago-test` passa a aceitar:

- chaves `TEST-` (formato legado), como antes;
- chaves `APP_USR-` somente quando a configuração declarar explicitamente que são credenciais de teste, com `MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED=true`.

Qualquer outro formato, ou `APP_USR-` sem a confirmação, continua impedindo a inicialização do servidor. O simulador continua sendo o provedor padrão.

**Consequências.**

- A confirmação é uma declaração de quem configura o ambiente: a chave deve ser copiada de "Credenciais de teste" (ou de um usuário de teste), nunca de "Credenciais de produção". O código não consegue verificar isso sozinho, então a revisão de configuração do RNF15 passa a conferir também a origem da chave.
- A confirmação, assim como a chave, fica só no `.env` local e nunca no repositório.
- As demais regras desta ADR não mudam: sem cobranças ou transferências reais, sem credenciais de produção, e as operações de teste continuam identificadas como tal.

## Referências

- [Documentação de assinaturas do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview)
- [Integração de assinatura sem plano associado](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/introduction)
- [Credenciais do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials)
- [Contas de teste para assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/test/accounts)
- [Testar aprovação de pagamento em assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-test/payment-approval)
- [Documentação de pagamentos do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/landing)
- [Validação documental e matriz por operação](../validacao-mercado-pago.md)