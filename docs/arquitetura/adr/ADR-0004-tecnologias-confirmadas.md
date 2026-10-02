# ADR-0004 — Tecnologias confirmadas e escolhas adiadas

- **Status:** Parcialmente aceito
- **Data:** 2026-10-02
- **Drivers relacionados:** DA-05, DA-06

## Contexto

O projeto definiu uma interface web e um backend JavaScript. A equipe prefere uma solução adequada ao contexto acadêmico, sem ferramentas que adicionem complexidade operacional desnecessária.

## Decisão

Registrar como escolhas confirmadas:

- **Interface:** React com JavaScript, usando Vite para desenvolvimento e build.
- **Backend:** Node.js como runtime da aplicação.
- **Assinatura Premium mensal:** API de Assinaturas do Mercado Pago, usada exclusivamente em ambiente de teste.

Adiar a escolha do framework HTTP, do banco de dados, da biblioteca de acesso a dados e da hospedagem. Express e SQLite são recomendações iniciais, não decisões tomadas. Docker Compose e Prisma não são requisitos para começar.

## Motivos

React, JavaScript, Vite e Node.js foram definidos para o projeto. Adiar as escolhas restantes evita registrar como aprovada uma tecnologia que ainda não foi escolhida pela equipe.

## Consequências

- Frontend e backend poderão compartilhar JavaScript, embora permaneçam aplicações distintas.
- A demonstração da assinatura depende de configurar credenciais e contas de teste do Mercado Pago fora do repositório.
- A implementação do backend depende da escolha posterior de como declarar rotas HTTP.
- A persistência depende da escolha posterior de banco e estratégia de acesso.
- A recomendação atual para protótipo local é SQLite com SQL direto; usar PostgreSQL se a disciplina ou a implantação exigir um banco servidor.