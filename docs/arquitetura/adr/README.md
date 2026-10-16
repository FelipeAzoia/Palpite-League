# Decisões de Arquitetura

ADRs (Architecture Decision Records) registram o contexto, a decisão e suas consequências. Decisões pendentes ficam marcadas como propostas; uma proposta não deve ser tratada como tecnologia aprovada para implementação.

| ADR | Decisão | Status |
| --- | --- | --- |
| [ADR-0001](ADR-0001-monolito-modular.md) | Organizar o backend como monólito modular | Aceito |
| [ADR-0002](ADR-0002-api-esportiva.md) | Usar API-Football como fonte externa de dados esportivos | Aceito para o protótipo; prova técnica pendente |
| [ADR-0003](ADR-0003-pagamentos-simulados.md) | Usar Mercado Pago em teste para assinatura e taxa; investigar reembolso e premiação por operação | Aceito, com validação sandbox pendente |
| [ADR-0004](ADR-0004-tecnologias-confirmadas.md) | Definir stack do protótipo e produtos de pagamento | Aceito |
| [ADR-0005](ADR-0005-invariantes-de-dominio.md) | Validar regras críticas no backend | Aceito |

## Pendências tecnológicas

- API esportiva: a API-Football foi escolhida para o protótipo. Ainda é necessário confirmar cobertura do Brasileirão, cotas, preços, frequência de atualização e termos do plano antes de iniciar a integração.
- API de pagamento: a decisão documental sobre assinatura e Checkout Pro está aceita; executar smoke tests no sandbox e confirmar a compatibilidade do reembolso e do repasse posterior de premiação continuam pendentes. Consultar [Validação documental do Mercado Pago](../validacao-mercado-pago.md). Se o repasse não estiver disponível, eventual simulador de demonstração não conta como integração cumprida.
- Hospedagem e implantação: fora do escopo; não selecionadas.