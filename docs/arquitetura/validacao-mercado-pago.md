# Validação documental do Mercado Pago

- **Data da consulta:** 2026-10-09
- **Escopo:** capacidades descritas publicamente para a integração acadêmica, sem movimentação de dinheiro real.
- **Resultado:** validação documental parcial. Nenhuma chamada foi executada no sandbox; o repositório ainda não contém aplicação, credenciais ou configuração de integração.

## Decisões técnicas relacionadas

- **Cobrança da taxa de entrada:** Checkout Pro, com redirecionamento para o checkout hospedado pelo Mercado Pago.
- **Assinatura Premium:** API de Assinaturas do Mercado Pago.
- **Reembolso:** a integração e o endpoint compatíveis com Checkout Pro ainda precisam ser confirmados antes da implementação.
- **Premiação:** repasse posterior ao vencedor não foi confirmado. A documentação de Split 1:1 descreve a divisão dos valores de uma transação entre participantes, não comprova um repasse discricionário posterior.
- **Fallback da premiação:** se o sandbox não suportar o repasse, a demonstração acadêmica poderá usar um simulador explicitamente identificado. Isso não conta como integração de premiação com o Mercado Pago nem como atendimento desse requisito de integração.

## Matriz de evidências

| Operação | Evidência documental | Situação no sandbox |
| --- | --- | --- |
| Assinatura Premium | A documentação descreve assinaturas e gerenciamento, incluindo consulta, pausa, cancelamento (`status: canceled`) e reativação. Há documentação específica de contas e aprovação de pagamentos de teste. | Fluxo documentado; chamadas de criação, cobrança recorrente, confirmação e cancelamento ainda não executadas. |
| Taxa de entrada | Checkout Pro cria uma preferência de pagamento no backend e redireciona o comprador ao checkout hospedado. A documentação de teste descreve contas de vendedor/comprador e uso de cartões ou saldo fictício. | Produto e fluxo de teste documentados; preferência e pagamento ainda não executados. |
| Devolução | A documentação de Checkout API Orders descreve reembolsos integrais/parciais, limite de 180 dias após aprovação e requisito de saldo suficiente. Ela não confirma, por si só, o endpoint aplicável ao fluxo escolhido de Checkout Pro. | Compatibilidade do fluxo de reembolso com Checkout Pro e execução de teste pendentes. |
| Premiação/repasse posterior | A documentação de Split 1:1 descreve a divisão do pagamento de uma transação entre partes. Isso não comprova uma transferência posterior independente ao vencedor. | Capacidade e permissões não confirmadas; manter o repasse como pendente. Se usado, o simulador da demonstração deve indicar que a premiação não foi enviada pelo Mercado Pago. |

## Próximas verificações de integração

Quando a aplicação estiver implementada, testar com contas e credenciais de teste fora do repositório:

1. Criar e pagar uma preferência de Checkout Pro; validar os estados pendentes, aprovados e recusados antes de confirmar a participação.
2. Criar, consultar e cancelar uma assinatura; verificar como o estado e as cobranças recorrentes são informados.
3. Confirmar o fluxo de reembolso compatível com a cobrança de Checkout Pro e testar a consulta do resultado da operação.
4. Investigar especificamente se existe um mecanismo de teste autorizado para repasse posterior ao vencedor. Até haver evidência de uma operação executada, não registrar essa integração como concluída.
5. Verificar notificações, idempotência, consulta de estado e recuperação de falhas sem reenviar cobranças ou devoluções automaticamente.

As validações devem usar somente contas e credenciais de teste. Não incluir tokens, senhas ou dados completos de pagamento em código versionado, logs ou documentação.

## Fontes oficiais consultadas

- [Visão geral do Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview)
- [Criar e configurar uma preferência de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-payment-preference)
- [Contas de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/accounts)
- [Visão geral de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview)
- [Gerenciamento de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management)
- [Cancelamentos e reembolsos do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/refunds-cancellations)
- [Contas de teste de Checkout API Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/test-accounts)
- [Split de pagamentos 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/overview)
