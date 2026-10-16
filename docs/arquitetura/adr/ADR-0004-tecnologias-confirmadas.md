# ADR-0004 — Tecnologias e ferramentas do protótipo

- **Status:** Aceito
- **Data:** 2026-10-02
- **Drivers relacionados:** DA-05, DA-06

## Contexto

O projeto definiu uma interface web e um backend JavaScript. Para o protótipo acadêmico, a equipe confirmou uma solução local simples, sem ferramentas que adicionem complexidade operacional desnecessária. A integração de pagamento em teste está detalhada no ADR-0003 e em [Validação documental do Mercado Pago](../validacao-mercado-pago.md).

## Decisão

- **Interface:** React com JavaScript, usando Vite para desenvolvimento e build.
- **Backend:** Node.js com Express.
- **Persistência:** SQLite, com SQL direto e `better-sqlite3` como driver Node.js.
- **Assinatura Premium:** API de Assinaturas do Mercado Pago, exclusivamente em ambiente de teste.
- **Taxa de entrada:** Checkout Pro, com redirecionamento ao checkout hospedado e uso exclusivo de credenciais de teste.
- **Hospedagem e implantação:** fora do escopo deste protótipo; nenhuma plataforma foi escolhida.

## Motivos

As escolhas aprovadas atendem ao escopo acadêmico com tecnologias familiares e uma persistência local simples. O Checkout Pro reduz a implementação de interface de pagamento, enquanto a validação documental e os limites de cada operação financeira permanecem registrados separadamente. A escolha de tecnologias não implica que a integração com o provedor já foi implementada ou executada.

## Consequências

- Frontend e backend poderão compartilhar JavaScript, embora permaneçam aplicações distintas.
- A demonstração de pagamentos depende da implementação dos fluxos e da configuração de contas e credenciais de teste fora do repositório.
- O backend usa consultas SQL explícitas; consultas parametrizadas e transações devem ser usadas quando aplicáveis.
- SQLite atende ao protótipo local. Uma eventual necessidade de banco servidor ou hospedagem requer nova decisão.
- O uso do Checkout Pro para a taxa de entrada não confirma a compatibilidade de um fluxo específico de reembolso nem a disponibilidade de repasse posterior de premiação; consultar o ADR-0003 e a validação documental antes de declarar essas operações concluídas.