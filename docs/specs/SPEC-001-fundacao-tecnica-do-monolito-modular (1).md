# SPEC-001 — Fundação técnica do monólito modular

- **Status:** revisada com as decisões aprovadas da proposta de resolução das questões em aberto; liberada para implementação, salvo OPEN-48.
- **Tipo:** Spec técnica (necessidade demonstrada nos artefatos de arquitetura; ver seção 2).
- **Baseline:** artefatos de `docs/` (incluindo ADR-0006, ADR-0007 e ADR-0008), `docs/specs/mapa-de-specs.md` e `docs/specs/proposta-resolucao-questoes-em-aberto.md`.
- **Escopo deste documento:** somente a SPEC-001. Nenhum código, banco de dados de domínio ou endpoint de negócio.

---

## 1. Identificação

- **ID:** SPEC-001
- **Nome:** Fundação técnica do monólito modular
- **Objetivo:** disponibilizar a estrutura executável localmente do monólito modular: um backend único com sete módulos identificáveis, acesso à persistência SQLite com migrações versionadas e execução atômica, configuração fora do repositório, registro técnico com correlação, verificação de disponibilidade e uma suíte de testes que roda sem credenciais externas, mais uma interface web mínima que se comunica com o backend por HTTP.
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
  - Apoio: RNF15, somente o critério de que chaves e tokens não ficam no repositório, no código do cliente nem nos logs.
- **Caso de uso ou fluxo:** nenhum caso de uso específico. A necessidade vem de arquitetura consolidada §14.1–§14.3, §4.2, §4.4, §4.9 e §4.10 e do objetivo de "suporte acadêmico e demonstrável em ambiente local" (§5.1).
- **Entidades do modelo conceitual:** nenhuma.
- **Drivers arquiteturais:** DA-01 (integridade; tratado por ADR-0001 e ADR-0005), DA-05 (responsabilidades separadas e solução simples), DA-06 (navegadores modernos; aqui apenas o carregamento da interface mínima).
- **ADRs:** ADR-0001 (monólito modular), ADR-0004 (tecnologias do protótipo), ADR-0005 (validação no backend), ADR-0008 (convenções do protótipo: esquema, testes, configuração, diretórios e disponibilidade). Apoio: ADR-0002 e ADR-0003 (isolamento de adaptadores, sem integração implementada), ADR-0006 (agendador, fora desta Spec) e ADR-0007 (sessão, fora desta Spec).

## 3. Escopo

### Incluído

1. Aplicação de backend única (um processo) organizada em sete módulos identificáveis, sem regras de negócio dentro deles: autenticação e usuários; bolões e participações; partidas e resultados; palpites e pontuação; pagamentos e assinaturas; notificações e auditoria; e as integrações externas como adaptadores isolados (ADR-0008, arquitetura §14.1).
2. Organização de diretórios: `src/backend` (módulos, adaptadores, compartilhado e `migrations`) e `src/frontend` (aplicação Vite), cada um com seu `package.json`; testes em `tests/backend` e `tests/frontend`.
3. Regra estrutural de dependência: o domínio não depende da interface HTTP nem de SDKs ou clientes de provedores externos; integrações externas ficam em adaptadores isolados.
4. Acesso à persistência SQLite com SQL direto e `better-sqlite3`, com consultas parametrizadas e um mecanismo reutilizável para executar um conjunto de operações como unidade atômica (tudo ou nada).
5. Migrações de esquema: arquivos SQL numerados, versionados em `src/backend/migrations`, aplicados em ordem na inicialização, com tabela de controle de versão, sem ORM nem ferramenta de migração. O arquivo do banco fica em caminho configurável, por padrão em pasta ignorada pelo Git; para reiniciar a demonstração basta apagá-lo. A Spec não cria tabelas de domínio.
6. Configuração por variáveis de ambiente carregadas de um `.env` ignorado pelo Git (carregamento nativo do Node, `--env-file`), com `.env.example` versionado contendo somente os nomes.
7. Registro técnico de eventos com data e hora, nível, componente, identificador de correlação e resultado, sem segredos nem dados desnecessários, e identificador de correlação associado a cada requisição.
8. Tratamento de erros inesperados de forma que sejam registrados e que a resposta ao cliente não exponha segredos nem detalhes internos.
9. Verificação de disponibilidade: consulta HTTP `GET /health`, sem autenticação, que informa disponível ou indisponível e o componente afetado (HTTP 200 ou 503); script executado sob demanda que faz uma consulta por minuto durante 30 minutos (RNF05); encerramento do processo com falha se a persistência ou uma migração falhar na inicialização.
10. Interface web mínima (React com JavaScript e Vite) que carrega no navegador e se comunica com o backend por HTTP, sem telas de negócio.
11. Ferramentas de teste: executor nativo do Node (`node:test`) no backend e Vitest no frontend, com o comando único `npm test` na raiz, e os testes derivados da seção 12.

### Fora do escopo

- Qualquer entidade, tabela, regra ou tela de domínio. Cada Spec define as suas.
- Autenticação, sessão e senha (ADR-0007, SPEC-003) e autorização por papel (`docs/requisitos/matriz-de-permissoes.md`, Specs proprietárias).
- Agendador de tarefas periódicas (ADR-0006), implementado na primeira Spec que o exigir (SPEC-013).
- Trilha de auditoria de operações de negócio (SPEC-002).
- Adaptadores concretos da API esportiva (SPEC-006) e do provedor de pagamentos (SPEC-018).
- Hospedagem, implantação e HTTPS em ambiente publicado (fora do escopo do ADR-0004).
- Verificação de responsividade e compatibilidade de navegadores em telas de negócio (RNF13, RNF14) e de desempenho e escalabilidade (RNF06, RNF07), tratadas nas Specs que possuem os fluxos medidos.
- Notificações (SPEC-027).

## 4. Dependências

- **Specs anteriores:** nenhuma.
- **Decisões arquiteturais:** ADR-0001, ADR-0004, ADR-0005 (aceito) e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- Ambiente local com Node.js 20.6 ou superior (a versão instalada deve ser confirmada; OPEN-48) e dependências do projeto instaladas.
- Arquivo `.env` criado a partir de `.env.example`, sem nenhuma credencial de provedor externo.

### Fluxo principal: inicialização e verificação

1. O backend é iniciado como uma única aplicação.
2. A aplicação lê a configuração do ambiente e abre a persistência local.
3. A aplicação aplica, em ordem, as migrações ainda não aplicadas, cada uma de forma atômica.
4. A aplicação registra o início com data e hora, nível, componente, correlação e resultado.
5. A consulta `GET /health` responde que a aplicação está disponível (HTTP 200).
6. A interface web mínima é iniciada, carrega no navegador e consegue se comunicar com o backend por HTTP.

### Fluxos alternativos

- **A1 — Credenciais externas ausentes:** a aplicação inicia normalmente; a ausência de credenciais de provedores não impede a disponibilidade da fundação.
- **A2 — Operação atômica com sucesso:** um conjunto de operações relacionadas executado pelo mecanismo transacional é persistido integralmente.
- **A3 — Reinicialização sem novas migrações:** nenhuma migração é reaplicada e o esquema não muda.

### Fluxos de exceção

- **E1 — Persistência indisponível na inicialização:** a falha é registrada com o componente afetado e o processo encerra com falha, sem se apresentar como disponível.
- **E2 — Persistência indisponível durante a execução:** a consulta `GET /health` informa indisponibilidade (HTTP 503) com o componente afetado, e a falha é registrada.
- **E3 — Falha no meio de operação atômica:** nenhuma parte da operação permanece persistida e a falha é registrada.
- **E4 — Falha em uma migração:** a migração não é aplicada (atômica), a falha é registrada e o processo encerra com falha.
- **E5 — Erro inesperado em requisição:** o erro é registrado com o identificador de correlação da requisição; a resposta ao cliente não contém segredos nem detalhes internos.

### Pós-condições

- Aplicação operante com persistência acessível e esquema na versão mais recente.
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
- **INV-009:** a verificação de disponibilidade nunca informa disponível quando a persistência local não responde (RNF05).
- **INV-010:** o backend é executado como uma única aplicação, sem separação em serviços independentes (ADR-0001).
- **INV-011:** cada migração é aplicada no máximo uma vez, em ordem numérica e de forma atômica; uma reinicialização sem novas migrações não altera o esquema (ADR-0008).
- **INV-012:** a consulta de disponibilidade não exige autenticação e nunca expõe detalhes internos, como caminhos, mensagens de erro ou credenciais (ADR-0008, RNF01).
- **INV-013:** o `.env` está excluído do controle de versão e o `.env.example` contém somente nomes de variáveis, sem valores secretos (ADR-0008, RNF15).
- **INV-014:** falha da persistência ou de uma migração na inicialização encerra o processo com falha, sem que a aplicação se apresente como disponível (ADR-0008).

## 7. Modelo de domínio envolvido

Nenhuma entidade, atributo ou relacionamento do modelo conceitual. A Spec cria somente o mecanismo de persistência e de migração; as estruturas de dados de domínio são entregues como migrações pela Spec que as utiliza.

## 8. Impacto arquitetural

- **Módulos envolvidos:** os sete da seção 3, item 1, mais a persistência e o registro técnico compartilhados. O critério de RNF19 fica satisfeito, com a pontuação dentro de "palpites e pontuação".
- **Camadas (§14.2):** apresentação (React), aplicação (API Node.js com Express), domínio, persistência (SQLite), integrações externas e observabilidade.
- **Fronteiras:**
  - A interface web se comunica com o backend por HTTP (§14.3).
  - O backend centraliza validações de autorização e regras de domínio (ADR-0005); a interface não é autoridade para mudar estado.
  - Integrações externas ficam em adaptadores isolados.
- **Integrações necessárias:** nenhuma implementada.
- **Frontend:** casca mínima que carrega e alcança o backend; nenhuma regra e nenhuma tela de negócio.
- **Backend:** estrutura de módulos, acesso transacional à persistência, migrações, registro técnico, correlação, tratamento de erros e verificação de disponibilidade.
- **ADRs que restringem a solução:** ADR-0001, ADR-0004 (React, Vite, Node.js, Express, SQLite, SQL direto, `better-sqlite3`, hospedagem fora do escopo), ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; nomes de campos e de variáveis são definidos na implementação e conferidos pelos testes.

- **Verificação de disponibilidade**
  - Entrada: `GET /health`, sem autenticação.
  - Saída: estado da aplicação (disponível ou indisponível) e, quando indisponível, o componente afetado, sem detalhes internos. HTTP 200 quando disponível e 503 quando indisponível.
  - Erros: indisponibilidade da persistência local.
- **Script de verificação do RNF05:** executado sob demanda; faz uma consulta por minuto durante 30 minutos e informa se alguma resposta não foi disponível.
- **Registro técnico**
  - Entrada: evento a registrar, com nível, componente e resultado.
  - Saída: registro com data e hora, nível, componente, identificador de correlação e resultado, sem segredos.
- **Execução atômica**
  - Entrada: conjunto de operações de persistência relacionadas.
  - Saída: sucesso integral ou falha sem persistência parcial.
  - Erros: falha de qualquer operação do conjunto.
- **Migrações**
  - Entrada: arquivos SQL numerados em `src/backend/migrations`.
  - Saída: esquema na versão mais recente e tabela de controle com as migrações aplicadas.
  - Erros: falha em uma migração (não aplicada, processo encerra com falha).
- **Configuração:** variáveis de ambiente listadas no `.env.example`, sem valores secretos; o caminho do banco tem valor padrão em pasta ignorada pelo Git.
- **Resposta de erro ao cliente:** não contém segredos nem detalhes internos. O formato dos erros dos contratos HTTP de negócio é definido na primeira Spec que expõe operações de negócio (SPEC-003).

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF02 | Teste automatizado com operação de dois registros em que a segunda gravação falha: nenhuma das duas permanece (TC-03, TC-04). |
| RNF05 | Testes automatizados da consulta de disponibilidade (TC-01, TC-02, TC-16). A execução do script de 30 minutos, com uma consulta por minuto, é validação prática e só será executada após confirmação explícita da equipe (arquitetura consolidada §4.11). |
| RNF18 | Execução de `npm test` em ambiente sem credenciais e sem rede externa (TC-11, TC-18). |
| RNF19 | Verificação automatizada da estrutura de módulos e das dependências proibidas (TC-09). |
| RNF20 | Testes dos campos do registro, da correlação e da ausência de segredos (TC-06, TC-07, TC-08). |
| RNF15 (apoio) | Inspeção do repositório, do `.env.example` e dos registros em busca de credenciais, chaves e tokens (TC-10, TC-17). |

## 11. Critérios de aceitação

- **CA-01 (fluxo principal):** Dado um ambiente local sem credenciais de provedores externos, Quando a aplicação é iniciada, Então backend e interface iniciam sem erro bloqueante e `GET /health` responde disponível com HTTP 200.
- **CA-02 (interface mínima):** Dado a aplicação em execução, Quando a interface web é aberta em um navegador moderno, Então ela carrega e consegue se comunicar com o backend por HTTP.
- **CA-03 (persistência indisponível em execução):** Dado que a persistência local deixa de estar acessível com a aplicação em execução, Quando `GET /health` é consultado, Então responde indisponível com HTTP 503 e o componente afetado, e um registro técnico de falha é gerado.
- **CA-04 (atomicidade com sucesso):** Dado um conjunto de duas gravações relacionadas, Quando ambas têm sucesso, Então ambas ficam persistidas.
- **CA-05 (atomicidade com falha):** Dado um conjunto de duas gravações relacionadas, Quando a segunda falha, Então nenhuma das duas permanece persistida e a falha é registrada.
- **CA-06 (consulta parametrizada):** Dado um valor com aspas e ponto e vírgula usado como parâmetro de consulta, Quando a consulta é executada, Então o valor é tratado como dado, gravado e recuperado literalmente, e nenhuma instrução adicional é executada.
- **CA-07 (campos do registro):** Dado um erro de aplicação provocado em teste, Quando o registro técnico é gerado, Então ele contém data e hora, nível, componente, identificador de correlação e resultado.
- **CA-08 (correlação):** Dado uma requisição que gera mais de um registro técnico, Quando os registros são inspecionados, Então todos compartilham o mesmo identificador de correlação, e uma segunda requisição tem identificador diferente.
- **CA-09 (segredos):** Dado um valor sensível (senha ou token) enviado a uma operação que falha, Quando a falha é registrada e a resposta de erro é produzida, Então o valor não aparece nos registros técnicos nem na resposta ao cliente.
- **CA-10 (módulos, dependências e diretórios):** Dado o código da aplicação, Quando a verificação estrutural é executada, Então existem os sete módulos da seção 3, a estrutura de diretórios do ADR-0008 está presente, nenhum módulo de domínio depende da interface HTTP ou de SDK de provedor e nenhuma integração externa é acessada fora de um adaptador.
- **CA-11 (testes offline):** Dado um ambiente sem credenciais externas e sem acesso à rede externa, Quando a suíte desta Spec é executada, Então todos os testes passam.
- **CA-12 (repositório sem segredos):** Dado o repositório, Quando é inspecionado, Então não contém credenciais, chaves ou tokens.
- **CA-13 (aplicação única):** Dado o projeto em execução, Quando o backend é iniciado, Então há uma única aplicação de backend, sem serviços independentes por módulo.
- **CA-14 (migrações em ordem e uma vez):** Dado dois arquivos de migração numerados, Quando a aplicação é iniciada, Então ambos são aplicados em ordem e registrados na tabela de controle, e em uma nova inicialização nenhum é reaplicado.
- **CA-15 (migração com falha):** Dado uma migração com erro, Quando a aplicação é iniciada, Então nenhuma parte dessa migração permanece aplicada, a falha é registrada e o processo encerra com falha.
- **CA-16 (falha na inicialização):** Dado que a persistência está inacessível, Quando a aplicação é iniciada, Então a falha é registrada com o componente afetado e o processo encerra com falha, sem responder disponível.
- **CA-17 (consulta de disponibilidade):** Dado a aplicação em execução, Quando `GET /health` é consultado sem autenticação, Então a resposta é entregue e não contém caminhos, mensagens de erro internas nem credenciais.
- **CA-18 (configuração):** Dado o repositório, Quando o controle de versão é consultado, Então o `.env` está ignorado e o `.env.example` contém apenas nomes de variáveis.
- **CA-19 (comando único de testes):** Dado o projeto instalado, Quando `npm test` é executado na raiz, Então as suítes do backend (`node:test`) e do frontend (Vitest) são executadas.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, CA-02, INV-007 | Iniciar a aplicação sem credenciais externas e confirmar `GET /health` com 200 e carregamento da interface com resposta do backend. |
| TC-02 | CA-03, INV-009 | Tornar a persistência indisponível durante a execução e confirmar 503, componente afetado e registro da falha. |
| TC-03 | CA-04, INV-001 | Executar duas gravações relacionadas com sucesso e confirmar persistência das duas. |
| TC-04 | CA-05, INV-001 | Forçar falha na segunda gravação e confirmar que nenhuma permanece. |
| TC-05 | CA-06, INV-002 | Usar valor com caracteres de SQL como parâmetro e confirmar armazenamento literal e ausência de efeito colateral. |
| TC-06 | CA-07, INV-006 | Provocar erro de aplicação e confirmar os cinco campos do registro. |
| TC-07 | CA-08, INV-008 | Gerar vários registros em uma requisição e em outra; conferir correlação igual dentro e diferente entre requisições. |
| TC-08 | CA-09, INV-005 | Enviar valor sensível a operação que falha e confirmar ausência em registros e resposta. |
| TC-09 | CA-10, INV-003, INV-004 | Verificar os sete módulos, a estrutura de diretórios, as dependências proibidas do domínio e os acessos externos fora de adaptadores. |
| TC-10 | CA-12, INV-005 | Inspecionar o repositório em busca de credenciais, chaves e tokens. |
| TC-11 | CA-11, INV-007 | Executar a suíte sem credenciais e sem rede externa. |
| TC-12 | CA-13, INV-010 | Confirmar que o backend é iniciado como uma única aplicação. |
| TC-13 | CA-14, INV-011 | Iniciar com duas migrações, conferir ordem e tabela de controle, reiniciar e confirmar que nada é reaplicado. |
| TC-14 | CA-15, INV-011 | Iniciar com migração que falha no meio e confirmar que nada dela permanece, falha registrada e processo encerrado com falha. |
| TC-15 | CA-16, INV-014 | Iniciar com persistência inacessível e confirmar registro da falha, encerramento com falha e ausência de resposta disponível. |
| TC-16 | CA-17, INV-012 | Consultar `GET /health` sem autenticação, nos estados disponível e indisponível, e varrer a resposta em busca de detalhes internos. |
| TC-17 | CA-18, INV-013 | Verificar que o `.env` está ignorado e que o `.env.example` contém só nomes. |
| TC-18 | CA-19 | Executar `npm test` na raiz e confirmar que as duas suítes rodam. |

## 13. Questões em aberto

### Decisões incorporadas (proposta aprovada)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-03 | Agendador fora desta Spec (ADR-0006), implementado na SPEC-013. |
| OPEN-06 | Mecanismo de sessão e senha fora desta Spec (ADR-0007, SPEC-003); o fluxo de requisição fica aberto a esse encaixe. |
| OPEN-35 | ADR-0005 confirmado como Aceito. |
| OPEN-39 | Sete módulos conforme arquitetura §14.1. |
| OPEN-40 | Migrações SQL numeradas aplicadas na inicialização. |
| OPEN-41 | `node:test`, Vitest e `npm test`. |
| OPEN-42 | `GET /health` sem autenticação, 200 ou 503; encerramento do processo em falha na inicialização; script de 30 minutos sob demanda. |
| OPEN-43 | Estrutura `src/backend`, `src/frontend`, `tests/backend`, `tests/frontend`. |
| OPEN-44 | `.env` ignorado, `.env.example` só com nomes, carregamento nativo do Node. |

### Em aberto

- **OPEN-48 - confirmação necessária:** confirmar que a versão do Node.js instalada na máquina da equipe é 20.6 ou superior, requisito do carregamento nativo do `.env` (ADR-0008). A implementação não deve começar sem essa confirmação.

## 14. Definition of Done da Spec

A SPEC-001 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-19) estiverem implementados;
- todos os invariantes (INV-001 a INV-014) estiverem preservados;
- os testes derivados (TC-01 a TC-18) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com a execução do script de 30 minutos do RNF05 realizada somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada;
- a confirmação da versão do Node.js (OPEN-48) estiver registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
