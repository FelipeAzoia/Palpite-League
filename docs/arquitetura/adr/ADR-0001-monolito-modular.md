# ADR-0001 — Organizar o backend como monólito modular

- **Status:** Proposto
- **Data:** 2026-10-02
- **Drivers relacionados:** DA-01, DA-04, DA-05

## Contexto

O projeto reúne responsabilidades de usuários, bolões, palpites, resultados, pontuação e operações financeiras. É um projeto acadêmico e ainda não há requisito que justifique implantação ou operação de vários serviços independentes.

## Decisão proposta

Organizar o backend como uma única aplicação, separando internamente as responsabilidades por módulos de domínio. Não adotar microserviços neste estágio.

## Motivos

Um monólito modular mantém simples a execução e a depuração do projeto, enquanto os módulos tornam as responsabilidades visíveis e reduzem o acoplamento entre funcionalidades.

## Consequências

- A aplicação terá um único processo de backend e uma implantação mais simples.
- Módulos poderão ser testados e evoluídos com responsabilidades delimitadas.
- Se houver necessidade futura de escalar componentes de forma independente, essa decisão deverá ser reavaliada com evidências de uso.

## Alternativas consideradas

- **Aplicação sem separação interna:** mais simples no começo, mas dificulta localizar regras e limitar dependências conforme o domínio cresce.
- **Microserviços:** acrescentam comunicação distribuída e operação independente sem necessidade demonstrada neste projeto.