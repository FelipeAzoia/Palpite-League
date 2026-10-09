# Decisões de Arquitetura

ADRs (Architecture Decision Records) registram o contexto, a decisão e suas consequências. Decisões pendentes ficam marcadas como propostas; uma proposta não deve ser tratada como tecnologia aprovada para implementação.

| ADR | Decisão | Status |
| --- | --- | --- |
| [ADR-0001](ADR-0001-monolito-modular.md) | Organizar o backend como monólito modular | Proposto |
| [ADR-0002](ADR-0002-api-esportiva.md) | Usar API-Football como fonte externa de dados esportivos | Recomendação para aprovação e validação técnica |
| [ADR-0003](ADR-0003-pagamentos-simulados.md) | Usar Mercado Pago em ambiente de teste para operações financeiras suportadas | Aceito, sujeito à validação por operação |
| [ADR-0004](ADR-0004-tecnologias-confirmadas.md) | Registrar as tecnologias já definidas e adiar escolhas pendentes | Parcialmente aceito |
| [ADR-0005](ADR-0005-invariantes-de-dominio.md) | Validar regras críticas no backend | Proposto |

## Pendências tecnológicas

- Framework HTTP do backend: Express é uma opção simples, ainda não escolhida.
- Banco de dados: SQLite é a recomendação para começar localmente; PostgreSQL continua como alternativa. A escolha está pendente.
- Persistência: SQL direto é a opção de menor abstração sugerida; nenhuma biblioteca de acesso a dados foi escolhida.
- API esportiva: confirmar cobertura do Brasileirão, cotas, preços e termos do plano API-Football antes de iniciar a integração.
- API de pagamento: Mercado Pago em ambiente de teste para assinatura, taxa de entrada, devolução e premiação; validar suporte, permissões e confirmação de cada operação antes da integração. O simulador é permitido durante o desenvolvimento e testes automatizados.
- Hospedagem e implantação: fora do escopo das decisões atuais.