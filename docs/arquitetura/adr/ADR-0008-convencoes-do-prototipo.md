# ADR-0008 — Convenções do protótipo: esquema, testes, configuração, diretórios e disponibilidade

- **Status:** Aceito
- **Data:** 2026-11-05
- **Drivers relacionados:** DA-01, DA-05, DA-06
- **Origem das decisões:** OPEN-39 a OPEN-44 e OPEN-48 (mapa de specs); SPEC-001, seções 3, 5, 9 e 13.

## Contexto

O ADR-0004 definiu a stack do protótipo (React, Vite, Node.js, Express, SQLite, `better-sqlite3`), mas não definiu como as estruturas do banco evoluem, quais ferramentas de teste são usadas, como a configuração é fornecida fora do repositório, como o código é organizado em diretórios nem como a disponibilidade é verificada. Todas as Specs dependem dessas convenções.

## Decisão

1. **Módulos.** O backend é uma única aplicação, organizada em sete módulos identificáveis, conforme a arquitetura consolidada §14.1: autenticação e usuários; bolões e participações; partidas e resultados; palpites e pontuação; pagamentos e assinaturas; notificações e auditoria; e integrações externas como adaptadores isolados (OPEN-39).
2. **Diretórios.** `src/backend` (módulos, adaptadores, código compartilhado e `migrations`) e `src/frontend` (aplicação Vite), cada um com seu `package.json`; testes em `tests/backend` e `tests/frontend` (OPEN-43).
3. **Esquema e migrações.** Arquivos SQL numerados em `src/backend/migrations`, aplicados em ordem na inicialização, cada um de forma atômica, com tabela de controle de versão. Não há ORM nem ferramenta de migração. O arquivo do banco fica em caminho configurável, por padrão em pasta ignorada pelo Git; para reiniciar a demonstração basta apagá-lo. Cada Spec entrega as migrações das estruturas que utiliza (OPEN-40).
4. **Testes.** `node:test` no backend, Vitest no frontend e o comando único `npm test` na raiz. A suíte roda sem credenciais externas e sem rede externa (OPEN-41).
5. **Configuração.** Variáveis de ambiente carregadas de um `.env` ignorado pelo Git, com o carregamento nativo do Node (`--env-file`). O `.env.example` é versionado e contém somente nomes de variáveis, nunca valores secretos (OPEN-44).
6. **Disponibilidade.** `GET /health`, sem autenticação, responde disponível (HTTP 200) ou indisponível (HTTP 503) com o componente afetado, sem detalhes internos. Um script executado sob demanda faz uma consulta por minuto durante 30 minutos para a validação do RNF05. Falha da persistência ou de uma migração na inicialização encerra o processo com falha (OPEN-42).

## Motivos

As convenções mantêm o projeto simples de executar, explicar e depurar em contexto acadêmico (DA-05), preservam a integridade dos dados por meio de migrações atômicas (DA-01) e dispensam bibliotecas ou ferramentas adicionais onde o Node e o SQLite já resolvem o problema.

## Consequências

- Requer Node.js 20.6 ou superior, por causa do carregamento nativo do `.env`. A equipe confirmou em 2026-11-05 a versão v24.16.0 (OPEN-48).
- Mudanças de esquema só ocorrem por novas migrações numeradas; uma migração aplicada não é reescrita.
- A SPEC-001 implementa essas convenções e as demais Specs as herdam.
- A verificação de 30 minutos do RNF05 só é executada após confirmação explícita da equipe.
- Hospedagem, implantação e HTTPS em ambiente publicado continuam fora do escopo (ADR-0004).
