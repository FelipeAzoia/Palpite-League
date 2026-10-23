# SPEC-001 — Fundação técnica do monólito modular

- **Status:** aprovada para implementação.
- **Tipo:** Spec técnica (necessidade demonstrada nos artefatos de arquitetura; ver seção 2).
- **Baseline:** artefatos de `docs/` e `docs/specs/mapa-de-specs.md` (aprovado).
- **Escopo deste documento:** somente a SPEC-001. Nenhum código, banco de dados de domínio, endpoint de negócio ou escolha tecnológica nova.

---

## 1. Identificação

- **ID:** SPEC-001
- **Nome:** Fundação técnica do monólito modular
- **Objetivo:** disponibilizar a estrutura executável localmente do monólito modular: um backend único com módulos identificáveis por responsabilidade, acesso à persistência com transações atômicas, registro técnico de eventos com correlação e uma suíte de testes que roda sem credenciais externas, mais uma interface web mínima que se comunica com o backend por HTTP.
- **Valor entregue:** base verificável (a aplicação sobe, responde, persiste de forma atômica e registra falhas sem expor segredos) sobre a qual todas as demais Specs são implementadas. Não contém regra de negócio.

## 2. Rastreabilidade

- **RF:** nenhum. A Spec é habilitadora de todos os RF.
- **RB:** nenhuma.
- **RNF:**
  - RNF02 — integridade dos dados (operação que falha não persiste nenhuma parte).
  - RNF05 — disponibilidade na demonstração local.
  - RNF18 — testes automatizados executáveis sem credenciais externas.
  - RNF19 — modularidade por responsabilidade; domínio sem dependência de interface nem de SDKs de provedores.
  - RNF20 — observabilidade (campos mínimos do registro técnico; sem senhas, tokens ou dados desnecessários).
  - Apoio: RNF15, somente o critério de que chaves e tokens não ficam no repositório, no código do cliente nem nos logs. O mapa aprovado não listava RNF15 para esta Spec; ele é acrescentado aqui apenas para essa parte.
- **Caso de uso ou fluxo:** nenhum caso de uso específico. A necessidade vem de arquitetura consolidada §14.1–§14.3, §4.2, §4.4, §4.9 e §4.10 e do objetivo de "suporte acadêmico e demonstrável em ambiente local" (§5.1).
- **Entidades do modelo conceitual:** nenhuma.
- **Drivers arquiteturais:** DA-01 (integridade; tratado por ADR-0001 e ADR-0005), DA-05 (responsabilidades separadas e solução simples), DA-06 (navegadores modernos; aqui apenas o carregamento da interface mínima).
- **ADRs:** ADR-0001 (monólito modular), ADR-0004 (tecnologias do protótipo), ADR-0005 (validação no backend). Apoio: ADR-0002 e ADR-0003, somente pela regra de isolar integrações em adaptadores; nenhuma integração é implementada aqui.

## 3. Escopo

### Incluído

1. Aplicação de backend única (um processo), organizada em módulos identificáveis por responsabilidade, sem regras de negócio dentro deles.
2. Regra estrutural de dependência: o domínio não depende da interface HTTP nem de SDKs ou clientes de provedores externos; integrações externas ficam em adaptadores isolados.
3. Acesso à persistência SQLite com SQL direto e `better-sqlite3`, com consultas parametrizadas e um mecanismo reutilizável para executar um conjunto de operações como unidade atômica (tudo ou nada).
4. Registro técnico de eventos com data e hora, nível, componente, identificador de correlação e resultado, sem segredos nem dados desnecessários.
5. Identificador de correlação associado a cada requisição e presente em todos os registros gerados por ela.
6. Tratamento de erros inesperados de forma que sejam registrados e que a resposta ao cliente não exponha segredos nem detalhes internos.
7. Configuração e credenciais mantidas fora do repositório; a aplicação inicia sem credenciais de provedores externos.
8. Verificação de disponibilidade da aplicação e da persistência local.
9. Interface web mínima (React com JavaScript e Vite) que carrega no navegador e se comunica com o backend por HTTP, sem telas de negócio.
10. Estrutura de testes automatizados independente da interface e de serviços externos, com os testes derivados da seção 12.

### Fora do escopo

- Qualquer entidade, tabela, regra ou tela de domínio. Cada Spec define as suas (o modelo conceitual não vira modelo físico aqui).
- Autenticação, sessão e autorização por papel (SPEC-003 e demais; OPEN-06, OPEN-08).
- Trilha de auditoria de operações de negócio (SPEC-002).
- Adaptadores concretos da API esportiva (SPEC-006) e do provedor de pagamentos (SPEC-018).
- Mecanismo de agendamento de tarefas periódicas (OPEN-03; SPEC-013, SPEC-021 e SPEC-025).
- Hospedagem, implantação, HTTPS em ambiente publicado e escolha de plataforma (fora do escopo do ADR-0004).
- Verificação de responsividade e de compatibilidade de navegadores em telas de negócio (RNF13, RNF14), tratada nas Specs que possuem telas.
- Validação prática de desempenho e escalabilidade (RNF06, RNF07), tratada nas Specs com os fluxos medidos.
- Notificações (SPEC-027).

## 4. Dependências

- **Specs anteriores:** nenhuma.
- **Decisões arquiteturais:** ADR-0001, ADR-0004 e ADR-0005. O status do ADR-0005 está inconsistente entre documentos (OPEN-35).

## 5. Comportamento esperado

### Pré-condições

- Ambiente local com as dependências do projeto instaladas.
- Nenhuma credencial de provedor externo configurada (o comportamento esperado vale com e sem elas).

### Fluxo principal: inicialização e verificação

1. O backend é iniciado como uma única aplicação.
2. A aplicação lê sua configuração e abre o acesso à persistência local.
3. A aplicação registra o início com data e hora, nível, componente, correlação e resultado.
4. A aplicação passa a responder à verificação de disponibilidade informando que está disponível.
5. A interface web mínima é iniciada, carrega no navegador e consegue se comunicar com o backend por HTTP.

### Fluxos alternativos

- **A1 — Credenciais externas ausentes:** a aplicação inicia normalmente; a ausência de credenciais de provedores não impede a disponibilidade da fundação.
- **A2 — Operação atômica com sucesso:** um conjunto de operações relacionadas executado pelo mecanismo transacional é persistido integralmente.

### Fluxos de exceção

- **E1 — Persistência indisponível:** a falha é registrada com o componente afetado e a verificação de disponibilidade informa indisponibilidade, nunca sucesso.
- **E2 — Falha no meio de operação atômica:** nenhuma parte da operação permanece persistida e a falha é registrada.
- **E3 — Erro inesperado em requisição:** o erro é registrado com o identificador de correlação da requisição; a resposta ao cliente não contém segredos nem detalhes internos.

### Pós-condições

- Aplicação operante com persistência acessível.
- Nenhum dado de domínio criado.
- Registros técnicos disponíveis para diagnóstico, sem segredos.

## 6. Regras e invariantes

- **INV-001:** toda operação que altera mais de um registro relacionado é executada como unidade atômica; se qualquer parte falhar, nenhuma parte permanece persistida (RNF02).
- **INV-002:** valores externos usados em consultas SQL são passados como parâmetros, nunca concatenados ao texto da consulta (ADR-0004).
- **INV-003:** código de domínio não depende do módulo de interface HTTP nem de SDKs ou clientes de provedores externos (RNF19, §4.9).
- **INV-004:** integrações externas são acessadas somente por adaptadores isolados (§14.3). Nesta Spec a regra é estrutural, pois nenhum adaptador concreto existe.
- **INV-005:** nenhuma senha, token ou credencial aparece em registros técnicos, em respostas de erro ou no repositório (RNF20, RNF15).
- **INV-006:** todo registro técnico de erro ou falha de integração contém data e hora, nível, componente, identificador de correlação e resultado (RNF20).
- **INV-007:** a aplicação inicia e responde à verificação de disponibilidade sem credenciais de provedores externos e sem acesso à rede externa (RNF05, RNF18, §4.4).
- **INV-008:** todos os registros gerados durante uma mesma requisição compartilham o mesmo identificador de correlação, e requisições distintas têm identificadores distintos (RNF20).
- **INV-009:** a verificação de disponibilidade nunca informa sucesso quando a persistência local não responde (RNF05).
- **INV-010:** o backend é executado como uma única aplicação, sem separação em serviços independentes (ADR-0001).

## 7. Modelo de domínio envolvido

Nenhuma entidade, atributo ou relacionamento do modelo conceitual. A Spec cria somente o mecanismo de persistência; as estruturas de dados de domínio são decididas por cada Spec que as utilize (ver OPEN-40 sobre a criação e a evolução dessas estruturas).

## 8. Impacto arquitetural

- **Módulos envolvidos:** autenticação/usuários, bolões/participações, palpites, partidas/resultados, pontuação, pagamentos/assinaturas, auditoria, notificações e adaptadores de integração externa. Nesta Spec, esses módulos são identificáveis e não contêm regras de negócio.
- **Camadas (§14.2):** apresentação (React), aplicação (API Node.js com Express), domínio, persistência (SQLite), integrações externas e observabilidade.
- **Fronteiras:**
  - A interface web se comunica com o backend por HTTP (§14.3).
  - O backend centraliza validações de autorização e regras de domínio (ADR-0005); a interface não é autoridade para mudar estado.
  - Integrações externas ficam em adaptadores isolados.
- **Integrações necessárias:** nenhuma implementada.
- **Frontend:** casca mínima que carrega e alcança o backend; nenhuma regra e nenhuma tela de negócio.
- **Backend:** estrutura de módulos, acesso transacional à persistência, registro técnico, correlação, tratamento de erros e verificação de disponibilidade.
- **ADRs que restringem a solução:** ADR-0001 (aplicação única, módulos internos), ADR-0004 (React, Vite, Node.js, Express, SQLite, SQL direto, `better-sqlite3`, hospedagem fora do escopo) e ADR-0005 (validação no backend).

## 9. Contratos necessários

Contratos conceituais; detalhes técnicos não definidos na baseline estão em OPEN.

- **Verificação de disponibilidade**
  - Entrada: solicitação de verificação.
  - Saída: estado da aplicação (disponível ou indisponível) e, quando indisponível, o componente afetado, sem detalhes internos.
  - Erros: indisponibilidade da persistência local.
  - Decisão aprovada: `GET /health`, sem autenticação, retorna HTTP 200 quando backend e SQLite respondem e HTTP 503 quando a persistência está indisponível; a resposta de indisponibilidade identifica somente o componente `persistence` e a correlação. `/api/health` permanece como alias compatível. Após falha ao abrir o SQLite, novas solicitações de health tentam abri-lo e aplicar migrações novamente; não há tarefa periódica em segundo plano.
- **Registro técnico**
  - Entrada: evento a registrar, com nível, componente e resultado.
  - Saída: registro com data e hora, nível, componente, identificador de correlação e resultado, sem segredos.
  - Decisão aprovada: eventos são persistidos na tabela técnica `technical_events` do SQLite; se o banco não puder receber um evento, ele é emitido em JSON no `stderr`. Não há expurgo automático; a retenção acompanha o arquivo local do banco.
- **Execução atômica**
  - Entrada: conjunto de operações de persistência relacionadas.
  - Saída: sucesso integral ou falha sem persistência parcial.
  - Erros: falha de qualquer operação do conjunto.
- **Resposta de erro ao cliente:** não contém segredos nem detalhes internos; erros técnicos retornam mensagem genérica e identificador de correlação.
- **Configuração e credenciais:** variáveis de ambiente; execução carrega opcionalmente `.env`, ignorado pelo Git, e `.env.example` lista somente configurações não sensíveis. Credenciais de provedores externos não são necessárias (OPEN-44 resolvida).

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF02 | Teste automatizado com operação de dois registros em que a segunda gravação falha: nenhuma das duas permanece (TC-03, TC-04). |
| RNF05 | Teste automatizado da verificação de disponibilidade (TC-01, TC-02). A execução manual de 30 minutos com uma verificação por minuto é validação prática e só será executada após confirmação explícita da equipe (arquitetura consolidada §4.11). |
| RNF18 | Execução da suíte desta Spec em ambiente sem credenciais e sem rede externa (TC-11). |
| RNF19 | Verificação automatizada da estrutura de módulos e das dependências proibidas (TC-09). |
| RNF20 | Testes dos campos do registro, da correlação e da ausência de segredos (TC-06, TC-07, TC-08). |
| RNF15 (apoio) | Inspeção do repositório e dos registros em busca de credenciais, chaves e tokens (TC-10). |

## 11. Critérios de aceitação

- **CA-01 (fluxo principal):** Dado um ambiente local sem credenciais de provedores externos, Quando a aplicação é iniciada, Então backend e interface iniciam sem erro bloqueante e a verificação de disponibilidade informa que a aplicação está disponível.
- **CA-02 (interface mínima):** Dado a aplicação em execução, Quando a interface web é aberta em um navegador moderno, Então ela carrega e consegue se comunicar com o backend por HTTP.
- **CA-03 (persistência indisponível):** Dado que a persistência local não está acessível, Quando a verificação de disponibilidade é solicitada, Então ela informa indisponibilidade, não sucesso, e um registro técnico de falha é gerado com o componente afetado.
- **CA-04 (atomicidade com sucesso):** Dado um conjunto de duas gravações relacionadas, Quando ambas têm sucesso, Então ambas ficam persistidas.
- **CA-05 (atomicidade com falha):** Dado um conjunto de duas gravações relacionadas, Quando a segunda falha, Então nenhuma das duas permanece persistida e a falha é registrada.
- **CA-06 (consulta parametrizada):** Dado um valor com aspas e ponto e vírgula usado como parâmetro de consulta, Quando a consulta é executada, Então o valor é tratado como dado, gravado e recuperado literalmente, e nenhuma instrução adicional é executada.
- **CA-07 (campos do registro):** Dado um erro de aplicação provocado em teste, Quando o registro técnico é gerado, Então ele contém data e hora, nível, componente, identificador de correlação e resultado.
- **CA-08 (correlação):** Dado uma requisição que gera mais de um registro técnico, Quando os registros são inspecionados, Então todos compartilham o mesmo identificador de correlação, e uma segunda requisição tem identificador diferente.
- **CA-09 (segredos):** Dado um valor sensível (senha ou token) enviado a uma operação que falha, Quando a falha é registrada e a resposta de erro é produzida, Então o valor não aparece nos registros técnicos nem na resposta ao cliente.
- **CA-10 (módulos e dependências):** Dado o código da aplicação, Quando a verificação estrutural é executada, Então cada responsabilidade exigida por RNF19 possui módulo identificável, nenhum módulo de domínio depende da interface HTTP ou de SDK de provedor externo e nenhuma integração externa é acessada fora de um adaptador.
- **CA-11 (testes offline):** Dado um ambiente sem credenciais externas e sem acesso à rede externa, Quando a suíte desta Spec é executada, Então todos os testes passam.
- **CA-12 (repositório sem segredos):** Dado o repositório, Quando é inspecionado, Então não contém credenciais, chaves ou tokens.
- **CA-13 (aplicação única):** Dado o projeto em execução, Quando o backend é iniciado, Então há uma única aplicação de backend, sem serviços independentes por módulo.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, CA-02, INV-007 | Iniciar a aplicação sem credenciais externas e confirmar disponibilidade e carregamento da interface com resposta do backend. |
| TC-02 | CA-03, INV-009 | Tornar a persistência indisponível e confirmar indisponibilidade na verificação e registro da falha com o componente. |
| TC-03 | CA-04, INV-001 | Executar duas gravações relacionadas com sucesso e confirmar persistência das duas. |
| TC-04 | CA-05, INV-001 | Forçar falha na segunda gravação e confirmar que nenhuma permanece. |
| TC-05 | CA-06, INV-002 | Usar valor com caracteres de SQL como parâmetro e confirmar armazenamento literal e ausência de efeito colateral. |
| TC-06 | CA-07, INV-006 | Provocar erro de aplicação e confirmar os cinco campos do registro. |
| TC-07 | CA-08, INV-008 | Gerar vários registros em uma requisição e em outra; conferir correlação igual dentro e diferente entre requisições. |
| TC-08 | CA-09, INV-005 | Enviar valor sensível a operação que falha e confirmar ausência em registros e resposta. |
| TC-09 | CA-10, INV-003, INV-004 | Verificar módulos por responsabilidade e dependências proibidas do domínio e acessos externos fora de adaptadores. |
| TC-10 | CA-12, INV-005 | Inspecionar o repositório em busca de credenciais, chaves e tokens. |
| TC-11 | CA-11, INV-007 | Executar a suíte sem credenciais e sem rede externa. |
| TC-12 | CA-13, INV-010 | Confirmar que o backend é iniciado como uma única aplicação. |

## 13. Questões em aberto e decisões registradas

- **OPEN-03 - decisão necessária:** mecanismo e frequência de agendamento de tarefas periódicas. Fica fora desta Spec e será tratado na primeira Spec que o exigir (SPEC-013), salvo decisão em contrário.
- **OPEN-06 - decisão necessária:** mecanismo de sessão ou credencial de autenticação e algoritmo de proteção de senha. Decidido na SPEC-003; esta Spec apenas não impede que a autenticação seja encaixada no fluxo de requisição.
- **OPEN-35 - resolvida:** ADR-0005 permanece aceito, conforme seu próprio status e a seção 3.5 da arquitetura consolidada.
- **OPEN-39 - resolvida:** módulos separados para autenticação/usuários, bolões/participações, palpites, partidas/resultados, pontuação, pagamentos/assinaturas, auditoria, notificações e adaptadores de integração externa.
- **OPEN-40 - resolvida:** migrações SQL versionadas executadas na inicialização; banco local padrão em `data/palpite-league.db`, substituível por `DATABASE_PATH`; sem recriação destrutiva automática.
- **OPEN-41 - resolvida:** runner nativo `node:test` para backend e Vitest para frontend, executados por `npm test`.
- **OPEN-42 - resolvida:** `GET /health` sem autenticação, com HTTP 200/503 e resposta mínima. Se o SQLite falhar ao iniciar, o backend HTTP continua ativo e responde 503; cada solicitação de health tenta reabrir/aplicar migrações, sem tarefa periódica em segundo plano. A equipe confirmou a execução do teste de estabilidade RNF05 após a implementação.
- **OPEN-43 - resolvida:** monorepositório com `backend/`, `frontend/` e `tests/`; um único processo de backend. Vite atende a interface em desenvolvimento e encaminha chamadas HTTP ao backend.
- **OPEN-44 - resolvida:** variáveis de ambiente e `.env` local ignorado pelo Git, com `.env.example` sem segredos; provedores externos opcionais.

## 14. Definition of Done da Spec

A SPEC-001 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-13) estiverem implementados;
- todos os invariantes (INV-001 a INV-010) estiverem preservados;
- os testes derivados (TC-01 a TC-12) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com a execução prática de 30 minutos de RNF05 realizada somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada;
- as decisões OPEN-35 e OPEN-39 a OPEN-44 estiverem documentadas e aplicadas às partes correspondentes.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
