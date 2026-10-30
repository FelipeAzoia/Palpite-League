# SPEC-006 — Consulta de times, rodadas e partidas via adaptador esportivo

- **Status:** aprovada. As propostas OPEN-58 a OPEN-60 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 e SPEC-003. A integração real depende da prova técnica da OPEN-01.
- **Tipo:** Spec funcional com integração externa isolada.
- **Baseline:** artefatos de `docs/` (incluindo ADR-0002, ADR-0006 e ADR-0008), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-005.
- **Escopo deste documento:** somente a SPEC-006. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-006
- **Nome:** Consulta de times, rodadas e partidas via adaptador esportivo
- **Objetivo:** disponibilizar ao sistema e aos usuários autenticados o catálogo de times, rodadas e partidas do Brasileirão da temporada corrente, obtido por um adaptador isolado da API esportiva, com um provedor simulado para desenvolvimento e testes, preservando os dados existentes quando a fonte falha.
- **Valor entregue:** o administrador passa a ver rodadas e partidas reais (ou simuladas, quando identificado) para selecionar na criação de um bolão, e o sistema nunca inventa partidas quando a fonte está indisponível.

## 2. Rastreabilidade

- **RF:** nenhum direto. A Spec é pré-requisito de RF18 (seleção de partidas, SPEC-007), RF20 (palpites, SPEC-012) e RF23 (resultados, SPEC-013, que compartilha o mesmo adaptador).
- **RB:** RB24 (partidas e rodadas disponíveis para seleção) e RB29 (a fonte oficial é exclusivamente a API esportiva); RB60 e RF25 como restrição de que nada é inserido manualmente.
- **RNF:**
  - RNF08 — confiabilidade da API esportiva: preservar dados, indicar falha, permitir nova tentativa.
  - RNF18 — testes com respostas simuladas, sem credenciais externas.
  - RNF19 — adaptador substituível sem reescrever regras de domínio.
  - RNF20 — falhas de integração registradas, sem segredos.
  - RNF01 — consultas só para usuário autenticado e chave do fornecedor fora de respostas e logs.
  - RNF14 — por extensão: tela de consulta utilizável em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC01, passo 3 (apresentar partidas e rodadas disponíveis) e exceção A2 (partidas indisponíveis); a seleção em si é da SPEC-007.
- **Entidades do modelo conceitual:** `Time`, `Rodada`, `Partida` (sem placar, que é da SPEC-013).
- **Drivers arquiteturais:** DA-02 (integração esportiva isolada e tolerante a falhas) e DA-05 (responsabilidades separadas).
- **ADRs:** ADR-0002 (API-Football como fonte para o protótipo, prova técnica pendente), ADR-0001, ADR-0004, ADR-0008. Apoio: ADR-0006 (agendador, usado pela SPEC-013).

## 3. Escopo

### Incluído

1. **Porta do provedor esportivo:** interface do domínio que devolve times, rodadas e partidas da temporada em formato normalizado, independente do fornecedor, e classifica as falhas (tempo esgotado, erro de resposta, resposta inválida).
2. **Provedor simulado:** implementação com dados determinísticos identificados como simulados, usada por padrão em desenvolvimento e nos testes, que permite injetar falhas e dados alterados (OPEN-60).
3. **Provedor real (API-Football):** implementação do adaptador, escolhida por configuração, cuja ativação depende da prova técnica da OPEN-01. Enquanto a prova não for executada pela equipe, o critério de integração real fica registrado como não atendido.
4. **Catálogo persistido:** times, rodadas e partidas gravados, com identificador do fornecedor como atributo técnico para reconhecer os mesmos itens a cada atualização; sem placar.
5. **Atualização sob demanda do catálogo:** carga quando o catálogo está vazio ou mais antigo que a janela de validade, atômica, idempotente, com uma única atualização por vez (OPEN-58).
6. **Consultas:** lista de rodadas (período e quantidade de partidas) e lista de partidas de uma rodada, com filtro opcional por status, para usuários autenticados.
7. **Tela somente leitura** de rodadas e partidas, reutilizável pela criação de bolão (SPEC-007), com aviso quando a fonte é simulada.
8. **Configuração:** fonte de dados (simulada ou real), temporada (2026), chave do fornecedor, tempo limite da chamada e janela de validade, no `.env.example`, sem valores secretos (ADR-0008).

### Fora do escopo

- Resultado oficial, placar, atualização de status de partidas em andamento ou encerradas e sincronização periódica (SPEC-013, com o agendador do ADR-0006).
- Resultados ao vivo (SPEC-021).
- Seleção das partidas para um bolão (SPEC-007).
- Inserção ou edição manual de times, rodadas ou partidas, vedada pela baseline.
- Execução da prova técnica da API-Football, que depende de ação e de credenciais da equipe (OPEN-01).
- Auditoria do carregamento do catálogo, que não consta do catálogo de operações auditáveis da SPEC-002; as falhas vão ao registro técnico.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, migrações, configuração, correlação e testes) e SPEC-003 (usuário autenticado e formato comum de erros).
- **Decisões arquiteturais:** ADR-0002, ADR-0004 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- SPEC-001 e SPEC-003 operantes.
- O usuário está autenticado.
- Há uma fonte configurada (por padrão, a simulada).

### Fluxo principal — consultar rodadas

1. O usuário solicita as rodadas.
2. O sistema verifica se o catálogo existe e está dentro da janela de validade.
3. Se estiver vazio ou desatualizado, o sistema obtém os dados do provedor, valida a resposta e grava times, rodadas e partidas em uma única transação.
4. O sistema devolve as rodadas, cada uma com número, período e quantidade de partidas, junto da fonte de dados e do momento da última atualização.

### Fluxo principal — consultar partidas de uma rodada

1. O usuário escolhe uma rodada, com filtro opcional por status.
2. O sistema devolve as partidas com mandante, visitante, data e hora e status, e a fonte e o momento da última atualização.
3. A interface apresenta as datas no horário de America/Sao_Paulo e avisa quando a fonte é simulada.

### Fluxos alternativos

- **A1 — Catálogo dentro da janela de validade:** o provedor não é consultado.
- **A2 — Atualização com mudança de horário ou status de partida ainda não iniciada:** a data e hora e o status são atualizados (INV-009).
- **A3 — Atualização repetida com os mesmos dados:** nenhum registro novo e nenhuma alteração.
- **A4 — Duas consultas simultâneas com catálogo vazio:** uma única chamada ao provedor; a outra aguarda o resultado.

### Fluxos de exceção

- **E1 — Tempo esgotado ou erro de resposta do provedor com catálogo existente:** os dados são preservados e devolvidos com a indicação de que a atualização falhou; a falha é registrada tecnicamente e uma nova tentativa é possível em consulta posterior.
- **E2 — Resposta inválida do provedor** (estrutura incorreta, times iguais, data inválida ou status desconhecido): é rejeitada por inteiro; nada é gravado; tratamento igual ao da E1.
- **E3 — Catálogo vazio e provedor indisponível:** a consulta informa a indisponibilidade da fonte (503), sem inventar partidas, e uma nova tentativa é possível mais tarde (UC01 A2).
- **E4 — Rodada inexistente:** erro de recurso não encontrado (404).
- **E5 — Sessão ausente, inválida, expirada ou encerrada:** rejeitada (401), sem dados.
- **E6 — Persistência indisponível:** falha sinalizada (500) sem detalhes internos.

### Pós-condições

- Catálogo persistido e consistente, ou o catálogo anterior intacto.
- Nenhum placar ou resultado gravado.
- Falhas da fonte registradas tecnicamente, sem credenciais.

## 6. Regras e invariantes

- **INV-001:** os dados de times, rodadas e partidas vêm exclusivamente do provedor esportivo pelo adaptador; nenhuma operação do sistema cria ou altera esses dados manualmente (RB29, RB60, RF25).
- **INV-002:** tempo esgotado, erro de resposta ou resposta inválida do provedor não apagam nem substituem dados persistidos (RNF08, ADR-0002).
- **INV-003:** a atualização do catálogo é atômica: o conjunto inteiro é gravado ou nada é gravado.
- **INV-004:** repetir a atualização com os mesmos dados não cria nem altera registros; os identificadores internos são estáveis, reconhecidos pelo identificador do fornecedor.
- **INV-005:** há no máximo uma atualização do catálogo em execução por vez (OPEN-58).
- **INV-006:** uma resposta do provedor com qualquer item inválido é rejeitada por inteiro.
- **INV-007:** a data e hora da partida é guardada em UTC; partida agendada, em andamento ou encerrada sempre tem data e hora, e somente uma partida adiada pode ficar sem ela (OPEN-02, OPEN-37).
- **INV-008:** o status de uma partida é um de agendada, em andamento, encerrada, adiada ou cancelada (OPEN-02).
- **INV-009:** a atualização do catálogo só altera data e hora e status de partidas armazenadas como agendada, adiada ou cancelada, e apenas entre esses valores; transições para em andamento ou encerrada, e o placar, pertencem à SPEC-013 (OPEN-59).
- **INV-010:** o domínio depende somente da porta do provedor esportivo, nunca do cliente ou SDK do fornecedor (RNF19).
- **INV-011:** a chave e as credenciais do fornecedor não aparecem em respostas, registros técnicos ou repositório (RNF01, RNF20, RNF15).
- **INV-012:** sem dados persistidos e com a fonte indisponível, o sistema informa a indisponibilidade e nunca inventa partidas (UC01 A2).
- **INV-013:** as respostas do catálogo identificam a fonte ativa (simulada ou real) e a interface sinaliza quando a fonte é simulada (OPEN-58).
- **INV-014:** todas as operações desta Spec exigem sessão válida (RNF01).
- **INV-015:** toda partida pertence a exatamente uma rodada e tem dois times distintos, mandante e visitante.
- **INV-016:** esta Spec não grava placar nem resultado de partida (RB29; SPEC-013).

## 7. Modelo de domínio envolvido

- **Time:** nome e escudo (texto fornecido pela fonte, guardado como recebido; sua ausência é tolerada). Atributo técnico: identificador do fornecedor.
- **Rodada:** número; data de início e data de fim derivadas da primeira e da última partida da rodada, em dias de America/Sao_Paulo, e recalculadas a cada atualização. Atributo técnico: identificador do fornecedor quando houver.
- **Partida:** rodada, mandante, visitante, data e hora em UTC (ausente apenas para adiada sem nova data) e status. Os atributos de placar existem no modelo, mas não são preenchidos por esta Spec. Atributo técnico: identificador do fornecedor.
- **Metadados do catálogo (técnicos):** fonte, momento da última tentativa e da última atualização bem-sucedida e resultado da última tentativa.
- **Restrições:** um mandante e um visitante distintos por partida; uma rodada por partida; o catálogo cobre uma temporada.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "partidas e resultados" e o adaptador "integrações externas", mais persistência, configuração e correlação da SPEC-001.
- **Fronteiras:**
  - A porta do provedor esportivo é definida pelo domínio; as implementações simulada e real ficam em adaptadores. Trocar uma pela outra não altera o domínio (RNF19).
  - O backend decide quando consultar o fornecedor; o frontend nunca o acessa.
- **Integrações necessárias:** API-Football, em ambiente de teste ou plano gratuito, só após a prova técnica; antes disso, o provedor simulado.
- **Frontend:** tela somente leitura de rodadas e partidas, com data e hora em America/Sao_Paulo, aviso de fonte simulada, aviso de atualização falha e de indisponibilidade com nova tentativa.
- **Backend:** porta e adaptadores, catálogo persistido, atualização atômica e idempotente, consultas e classificação de falhas.
- **ADRs que restringem a solução:** ADR-0002, ADR-0001, ADR-0004 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003, ampliado com as categorias da OPEN-58 (404 e 503).

- **Porta do provedor esportivo (interna)**
  - Entrada: temporada.
  - Saída: times, rodadas e partidas normalizados (identificador do fornecedor, nomes, número da rodada, mandante, visitante, data e hora e status já traduzido para os valores do domínio).
  - Erros: tempo esgotado, erro de resposta, resposta inválida, status desconhecido.
- **Atualização do catálogo (interna)**
  - Entrada: pedido de atualização.
  - Saída: sucesso com contagem de itens inseridos e alterados, ou falha classificada; sem efeitos parciais.
- **Consultar rodadas**
  - Entrada: sessão válida.
  - Saída: rodadas (número, período, quantidade de partidas), fonte e momento da última atualização, e indicação de que a última atualização falhou, quando for o caso.
  - Erros: 401; 503 se não há dados e a fonte está indisponível.
- **Consultar partidas de uma rodada**
  - Entrada: número da rodada e filtro opcional por status.
  - Saída: partidas (mandante, visitante, data e hora, status), fonte e momento da última atualização.
  - Erros: 401; 404 para rodada inexistente; 503 como acima.
- **Configuração:** fonte de dados, temporada, chave do fornecedor, tempo limite da chamada e janela de validade, no `.env.example`, sem valores secretos.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF08 | Simular tempo esgotado, erro de resposta e recuperação do provedor, conferindo preservação, indicação de falha e nova tentativa (TC-07, TC-08, TC-09, TC-10). |
| RNF18 | Executar a suíte com o provedor simulado, sem credenciais e sem rede externa (TC-16). |
| RNF19 | Verificação estrutural e troca entre dois adaptadores de teste sem alterar o domínio (TC-15). |
| RNF20 | Conferir os registros técnicos de falha, com componente e correlação, sem chave (TC-07, TC-17). |
| RNF01 | Chamar as consultas sem sessão e varrer respostas e registros em busca da chave (TC-12, TC-17). |
| RNF14 (por extensão) | Roteiro da tela em 360 px, 768 px e 1366 px (TC-19). |

## 11. Critérios de aceitação

- **CA-01 (primeira carga):** Dado o provedor simulado e o catálogo vazio, Quando um usuário autenticado consulta as rodadas, Então o catálogo é carregado e persistido e as rodadas são devolvidas com número, período, quantidade de partidas, fonte "simulada" e momento da atualização.
- **CA-02 (partidas da rodada):** Dado o catálogo carregado, Quando o usuário consulta uma rodada, Então recebe as partidas com mandante, visitante, data e hora e status, e o filtro por status devolve apenas as partidas desse status.
- **CA-03 (janela de validade):** Dado um catálogo dentro da janela de validade, Quando uma consulta é feita, Então o provedor não é chamado.
- **CA-04 (atualização por desatualização):** Dado um catálogo mais antigo que a janela, Quando uma consulta é feita, Então o provedor é consultado e os dados e o momento da atualização são renovados.
- **CA-05 (idempotência):** Dado duas atualizações com os mesmos dados, Quando a segunda termina, Então nenhum registro foi criado ou alterado e os identificadores permanecem iguais.
- **CA-06 (remarcação e adiamento):** Dado uma partida armazenada como agendada que o provedor passa a informar com outro horário ou como adiada, Quando o catálogo é atualizado, Então data e hora e status são atualizados; e uma partida armazenada como em andamento ou encerrada não é alterada por essa atualização.
- **CA-07 (tempo esgotado):** Dado um catálogo existente e desatualizado e um provedor que esgota o tempo, Quando uma consulta é feita, Então os dados existentes são preservados e devolvidos com a indicação de que a atualização falhou, e a falha é registrada tecnicamente com componente e correlação, sem chave.
- **CA-08 (erro de resposta e resposta inválida):** Dado um provedor que responde com erro, e outro que responde com um item inválido (times iguais, data inválida ou status desconhecido), Quando o catálogo é atualizado, Então nada é gravado, os dados existentes permanecem e a falha é registrada.
- **CA-09 (catálogo vazio e fonte indisponível):** Dado o catálogo vazio e o provedor indisponível, Quando uma consulta é feita, Então a resposta informa a indisponibilidade da fonte (503) e nenhuma partida é inventada.
- **CA-10 (recuperação):** Dado uma falha anterior, Quando o provedor volta a responder e uma nova consulta é feita, Então a atualização ocorre e o catálogo é carregado.
- **CA-11 (sem edição manual):** Dado todas as operações expostas pela aplicação, Quando se tenta criar, alterar ou remover time, rodada ou partida, Então nenhuma operação existe para isso e a tentativa é rejeitada.
- **CA-12 (sem sessão):** Dado uma requisição sem sessão válida, Quando ela chama qualquer consulta, Então é rejeitada (401) sem dados.
- **CA-13 (uma atualização por vez):** Dado duas consultas simultâneas com o catálogo vazio, Quando ambas são processadas, Então há uma única chamada ao provedor e ambas recebem o catálogo carregado.
- **CA-14 (rodada inexistente):** Dado um número de rodada que não existe, Quando as partidas são consultadas, Então a resposta é de recurso não encontrado (404) no formato comum de erros.
- **CA-15 (adaptador substituível):** Dado dois adaptadores de teste que implementam a porta, Quando um é trocado pelo outro, Então o domínio e os testes de consulta funcionam sem alteração, e nenhum código de domínio depende do cliente do fornecedor.
- **CA-16 (testes offline):** Dado um ambiente sem credenciais externas e sem rede externa, Quando a suíte desta Spec é executada, Então todos os testes passam.
- **CA-17 (sem segredos):** Dado qualquer operação desta Spec, com sucesso ou falha, Quando respostas e registros técnicos são inspecionados, Então não contêm a chave do fornecedor.
- **CA-18 (fonte identificada):** Dado o provedor simulado ativo, Quando as consultas são feitas e a tela é usada, Então as respostas indicam a fonte simulada e a tela exibe o aviso.
- **CA-19 (UTC e exibição):** Dado uma partida com data e hora, Quando ela é gravada e exibida, Então é guardada em UTC e a interface a apresenta em America/Sao_Paulo.
- **CA-20 (adiada sem data):** Dado uma partida adiada sem nova data, Quando o catálogo é atualizado, Então ela é aceita sem data e hora; e uma partida agendada, em andamento ou encerrada sem data e hora faz a resposta ser rejeitada.
- **CA-21 (interface responsiva):** Dado as larguras de 360 px, 768 px e 1366 px, Quando a tela de rodadas e partidas é usada, Então permanece utilizável, sem sobreposição de controles nem rolagem horizontal da página.
- **CA-22 (integração real, critério separado):** Dado a prova técnica da OPEN-01 aprovada, o provedor real configurado com a chave de teste fora do repositório e a confirmação da equipe, Quando o catálogo é carregado, Então times, rodadas e partidas da Série A da temporada corrente são normalizados e gravados e os critérios CA-05, CA-06 e CA-08 se confirmam com dados reais.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-013 | Consultar rodadas com catálogo vazio e provedor simulado e conferir carga, conteúdo e fonte. |
| TC-02 | CA-02, INV-015 | Consultar partidas de uma rodada, com e sem filtro por status. |
| TC-03 | CA-03 | Consultar duas vezes dentro da janela e contar as chamadas ao provedor. |
| TC-04 | CA-04 | Avançar o relógio além da janela e conferir a nova consulta e a renovação. |
| TC-05 | CA-05, INV-004 | Atualizar duas vezes com os mesmos dados e comparar registros e identificadores. |
| TC-06 | CA-06, INV-009 | Alterar horário, adiar e injetar status de partida em andamento e encerrada, e conferir quais registros mudam. |
| TC-07 | CA-07, INV-002 | Simular tempo esgotado com catálogo existente e conferir preservação, indicação e registro técnico. |
| TC-08 | CA-08, INV-003, INV-006 | Simular erro de resposta e itens inválidos e conferir que nada é gravado. |
| TC-09 | CA-09, INV-012 | Simular catálogo vazio com provedor indisponível e conferir 503 e ausência de partidas. |
| TC-10 | CA-10 | Restabelecer o provedor e conferir a carga na consulta seguinte. |
| TC-11 | CA-11, INV-001, INV-016 | Examinar as operações expostas e tentar criar, alterar e remover time, rodada e partida; conferir ausência de placar gravado. |
| TC-12 | CA-12, INV-014 | Chamar cada consulta sem sessão e com sessão inválida. |
| TC-13 | CA-13, INV-005 | Disparar duas consultas simultâneas e contar as chamadas ao provedor. |
| TC-14 | CA-14 | Consultar rodada inexistente e conferir o formato de erro. |
| TC-15 | CA-15, INV-010 | Trocar entre dois adaptadores de teste e executar a verificação estrutural. |
| TC-16 | CA-16 | Executar a suíte sem credenciais e sem rede externa. |
| TC-17 | CA-17, INV-011 | Varrer respostas e registros técnicos, em sucesso e em falha, em busca da chave. |
| TC-18 | CA-18, CA-19, CA-20, INV-007, INV-008 | Conferir fonte identificada, UTC e exibição em America/Sao_Paulo, adiada sem data e partida sem data inválida. |
| TC-19 | CA-21 | Executar a tela em 360 px, 768 px e 1366 px. |
| TC-20 | CA-22 | Carregar o catálogo com o provedor real após a prova e a confirmação da equipe, registrando o resultado (critério de integração). |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-58 | Carga sob demanda com catálogo persistido; janela de validade de 6 horas e tempo limite de 10 segundos, ambos em configuração; uma atualização por vez; temporada 2026 em configuração; identificador do fornecedor como atributo técnico; início e fim da rodada derivados da primeira e da última partida; fonte identificada nas respostas e aviso na tela quando simulada; erros 404 (rodada inexistente) e 503 (fonte indisponível sem dados) acrescentados ao formato comum de erros. |
| OPEN-59 | A atualização do catálogo só altera data e hora e status de partidas armazenadas como agendada, adiada ou cancelada, e apenas entre esses valores; partidas inseridas já em andamento ou encerradas entram com esse status e sem placar; transições para em andamento e encerrada e o placar são exclusivos da SPEC-013. |
| OPEN-60 | Provedor simulado determinístico com 20 times, 38 rodadas e 10 partidas por rodada, primeiras rodadas em datas futuras, ao menos uma partida adiada e uma cancelada, marcado como simulado e com injeção de falhas e dados alterados nos testes; consultas por rodada sem paginação, com filtro opcional por status; tela somente leitura. |

### Em aberto

Nenhuma. A prova técnica da API-Football (OPEN-01) tem decisão aprovada e depende de execução pela equipe; o resultado é acompanhado pelo critério CA-22.

## 14. Definition of Done da Spec

A SPEC-006 estará concluída quando:

- todos os critérios de aceitação funcionais (CA-01 a CA-21) estiverem implementados;
- todos os invariantes (INV-001 a INV-016) estiverem preservados;
- os testes derivados TC-01 a TC-19 estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

O critério de integração real (CA-22, TC-20) é acompanhado à parte: depende da prova técnica da OPEN-01 e da confirmação da equipe, e enquanto não for executado a Spec fica concluída com a integração real registrada como não atendida.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
