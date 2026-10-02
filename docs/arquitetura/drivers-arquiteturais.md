# Drivers Arquiteturais — Palpite League

Este documento registra as necessidades e restrições que orientam as decisões de arquitetura do Palpite League. Os drivers são derivados da visão do produto, do modelo de domínio e dos requisitos existentes; não definem por si só uma tecnologia específica.

## Drivers

| ID | Driver | Prioridade | Origem |
| --- | --- | --- | --- |
| DA-01 | Preservar regras e integridade do bolão: configurações imutáveis, papéis por bolão, aceite das regras, prazo de palpites, exclusividade do tipo de palpite e cálculo consistente de pontuação. | Alta | RB13–RB28, RB33–RB43; RF09–RF22, RF26–RF29; RNF02–RNF03, RNF12 |
| DA-02 | Obter resultados oficiais de uma fonte esportiva externa, manter os dados consistentes diante de falhas e não permitir edição manual de resultado oficial. | Alta | RB29–RB32; RF23–RF25; RNF08, RNF17 |
| DA-03 | Registrar operações financeiras de forma rastreável e consistente. O escopo acadêmico não movimentará dinheiro real: pagamentos, taxas, devoluções e premiações serão simulados. | Alta | RB22–RB23, RB44–RB47, RB53–RB55; RF30–RF34; RNF02, RNF04, RNF09–RNF10, RNF15–RNF16 |
| DA-04 | Restringir dados e operações administrativas conforme a identidade do usuário e seu papel em cada bolão. | Alta | RB16–RB19, RB46–RB48; RNF01, RNF11–RNF12; RF02, RF14, RF17, RF19 |
| DA-05 | Manter responsabilidades separadas e favorecer uma solução simples de desenvolver, explicar e manter em contexto acadêmico, sem infraestrutura desnecessária. | Média | RNF18–RNF20; escopo acadêmico do projeto |
| DA-06 | Disponibilizar as funções principais em navegadores modernos e em diferentes tamanhos de tela. | Média | RNF13–RNF14 |

## Relação com decisões

- DA-01 é tratado principalmente pelos ADRs 0001 e 0005.
- DA-02 é tratado pelo ADR 0002.
- DA-03 é tratado pelo ADR 0003.
- DA-04 é tratado pelos ADRs 0001 e 0005.
- DA-05 é tratado pelos ADRs 0001 e 0004.
- DA-06 é tratado pelo ADR 0004.

Consulte o [índice de decisões](adr/README.md) para o status de cada ADR.