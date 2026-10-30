# SPEC-010 — Decisão administrativa de entrada e confirmação sem taxa

- **Status:** aprovada. As propostas OPEN-68 e OPEN-69 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003 e SPEC-007 a SPEC-009.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/` (incluindo `matriz-de-permissoes.md` e o modelo de domínio atualizado), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-009.
- **Escopo deste documento:** somente a SPEC-010. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-010
- **Nome:** Decisão administrativa de entrada e confirmação sem taxa
- **Objetivo:** permitir que o administrador ou o coadministrador de um bolão ativo veja as solicitações de entrada pendentes e as aprove ou rejeite; ao aprovar em bolão sem taxa, confirmar a participação; ao aprovar em bolão com taxa, deixá-la aprovada aguardando pagamento.
- **Valor entregue:** os participantes passam a existir de fato no bolão, o que viabiliza a promoção a coadministrador, os palpites e o restante da competição; em bolão com taxa, a participação aprovada permanece não confirmada até o pagamento (SPEC-022).

## 2. Rastreabilidade

- **RF:** RF14 (aprovação ou rejeição de participante).
- **RB:** RB18 (a entrada depende da aprovação), RB59 (análise administrativa conforme as permissões), RB22 e RB62 (a confirmação financeira depende do pagamento quando há taxa; aqui apenas respeitada), RB20 e RB61 (entrada tardia, cujo sinalizador definitivo é calculado na confirmação).
- **RNF:**
  - RNF01 — somente quem tem permissão decide; sem sessão nada é devolvido.
  - RNF02 — a decisão e seu registro de auditoria formam uma unidade atômica.
  - RNF04 e RNF16 — aprovação e rejeição são decisões administrativas auditáveis (SPEC-002).
  - RNF12 — a autorização por papel é aplicada no backend.
  - RNF18 — a autorização e as regras da decisão têm testes independentes da interface.
  - RNF14 — por extensão: tela de solicitações utilizável em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC03, passo 6 e exceções A4 (solicitação rejeitada) e A5 (sem taxa de entrada, confirmação após a aprovação); a cobrança (passos 7 a 9) é da SPEC-022.
- **Entidades do modelo conceitual:** `Participacao`, `Usuario`, `Bolao`, `Partida` (para o cálculo da entrada tardia) e `RegistroAuditoria`.
- **Drivers arquiteturais:** DA-01 (integridade da decisão e da confirmação) e DA-04 (autorização por papel).
- **ADRs:** ADR-0005 (autorização e regras no backend), ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Listar solicitações pendentes** do bolão para administrador e coadministrador (OPEN-68).
2. **Aprovar ou rejeitar** uma solicitação com status solicitada (RF14).
3. **Aprovação em bolão sem taxa:** confirma a participação na mesma transação, com a data de entrada e o sinalizador definitivo de entrada tardia (OPEN-17).
4. **Aprovação em bolão com taxa:** a participação fica aprovada aguardando pagamento, sem data de entrada.
5. **Rejeição:** a participação fica rejeitada, sem acesso ao bolão e sem nova solicitação (OPEN-66).
6. **Operação interna de confirmação de participação**, única, atômica e reutilizada pela SPEC-022 quando o pagamento for confirmado (OPEN-69).
7. **Autorização** por papel e por status da participação do decisor, com negativas auditadas (OPEN-65).
8. **Auditoria (SPEC-002):** registro da aprovação, da rejeição e das tentativas negadas.
9. **Interface:** na tela do bolão, seção de solicitações de entrada para administrador e coadministrador, com ações de aprovar e rejeitar e confirmação antes de rejeitar.

### Fora do escopo

- Solicitar a entrada e o aceite das regras (SPEC-009).
- Cobrança, pagamento e confirmação financeira da participação em bolão com taxa (SPEC-022).
- Atribuir o papel de coadministrador (SPEC-011).
- Notificação de aprovação ao usuário (SPEC-027); o usuário acompanha pela abertura do convite (SPEC-009) e pela lista de bolões (SPEC-007).
- Bloqueio de palpites por entrada tardia (SPEC-012).
- Lista geral de participantes do bolão e remoção de participantes, que a baseline não prevê (RB48).
- Motivo da rejeição e nova solicitação após a rejeição, que a baseline não prevê.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, correlação), SPEC-002 (auditoria), SPEC-003 (autenticação e formato de erros), SPEC-007 (bolão, papéis e status), SPEC-008 (padrão de autorização e códigos de erro) e SPEC-009 (solicitações). O catálogo de partidas vem da SPEC-006, pelas partidas selecionadas do bolão.
- **Decisões arquiteturais:** ADR-0005 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- O decisor está autenticado e é administrador ou coadministrador do bolão, com participação aprovada ou confirmada.
- O bolão está ativo e existe ao menos uma solicitação com status solicitada.

### Fluxo principal — listar

1. O decisor pede as solicitações pendentes do bolão.
2. O sistema devolve, para cada solicitação, o nome do solicitante, a data e hora da solicitação e a indicação de que a entrada seria tardia no momento da consulta, sem e-mail nem código de convite.

### Fluxo principal — aprovar

1. O decisor escolhe uma solicitação e aprova.
2. Em uma transação, o sistema revalida a autorização, o status solicitada e o status ativo do bolão e:
   - se o bolão não tem taxa, confirma a participação: status confirmada, data de entrada igual ao instante da decisão em UTC, sinalizador definitivo de entrada tardia, pagamento confirmado;
   - se o bolão tem taxa, grava o status aprovada, aguardando pagamento, sem data de entrada;
   - grava o registro de auditoria de sucesso da aprovação.
3. O sistema informa o resultado ao decisor.

### Fluxo principal — rejeitar

1. O decisor escolhe uma solicitação, confirma a rejeição e rejeita.
2. Em uma transação, o sistema grava o status rejeitada e o registro de auditoria de sucesso da rejeição.
3. O sistema informa o resultado.

### Fluxos alternativos

- **A1 — Aprovação em bolão sem taxa com partida selecionada já iniciada:** a participação é confirmada com o sinalizador de entrada tardia verdadeiro.
- **A2 — Aprovação em bolão com taxa:** o solicitante passa a ser membro (consulta as regras e vê o bolão na lista), mas a participação não está confirmada.
- **A3 — Coadministrador decide:** equivale ao administrador, conforme a matriz de permissões.

### Fluxos de exceção

- **E1 — Sessão ausente, inválida, expirada ou encerrada:** rejeitada (401).
- **E2 — Decisor que não é membro do bolão, ou bolão inexistente:** 404, sem dados, auditada como negada.
- **E3 — Membro sem permissão** (participante comum): 403, nada alterado, auditada como negada.
- **E4 — Solicitação inexistente neste bolão:** 404.
- **E5 — Solicitação que não está mais com status solicitada** (já decidida, ou decidida por outro decisor ao mesmo tempo): 409, nada alterado.
- **E6 — Bolão encerrado:** a decisão é recusada (409).
- **E7 — Falha ao gravar a decisão ou o registro de auditoria:** nada é persistido e a solicitação continua pendente (500, sem detalhes internos).

### Pós-condições

- Aprovação sem taxa: participação confirmada, com data de entrada e sinalizador definitivos.
- Aprovação com taxa: participação aprovada aguardando pagamento.
- Rejeição: participação rejeitada.
- Em todos os casos, um registro de auditoria da decisão; falhas não deixam decisão parcial.

## 6. Regras e invariantes

- **INV-001:** somente administrador ou coadministrador do bolão, com participação aprovada ou confirmada, decide solicitações; participante comum recebe 403 e quem não é membro recebe 404, ambos auditados como negado e sem alteração (RF14, RB59, matriz de permissões, OPEN-65).
- **INV-002:** só uma solicitação com status solicitada pode ser decidida; decidir uma solicitação já decidida devolve 409, e em decisões simultâneas sobre a mesma solicitação apenas uma é efetivada (ADR-0005, OPEN-69).
- **INV-003:** a aprovação em bolão sem taxa confirma a participação na mesma transação, com status confirmada, data de entrada igual ao instante da decisão em UTC, sinalizador definitivo de entrada tardia e pagamento confirmado, pois não há nada a pagar (OPEN-17, OPEN-68).
- **INV-004:** a aprovação em bolão com taxa deixa a participação aprovada aguardando pagamento, sem data de entrada e com pagamento não confirmado; uma participação nunca é confirmada com taxa pendente (RB22, RB62).
- **INV-005:** o sinalizador de entrada tardia é verdadeiro se, e somente se, no instante da confirmação existe partida selecionada com início anterior a esse instante, excluídas as canceladas (OPEN-17, OPEN-67).
- **INV-006:** a rejeição deixa a participação com status rejeitada, sem acesso de membro; o usuário não solicita de novo (OPEN-66).
- **INV-007:** a decisão e seu registro de auditoria de sucesso são atômicos (RNF02).
- **INV-008:** toda tentativa sem permissão não altera nada e gera registro de auditoria com resultado negado, em transação separada (OPEN-45).
- **INV-009:** a lista de solicitações contém somente solicitações com status solicitada do próprio bolão e mostra nome, data e hora da solicitação e a indicação de entrada tardia, sem e-mail nem código de convite (RNF11, OPEN-68).
- **INV-010:** bolão encerrado não aceita decisões (OPEN-69).
- **INV-011:** toda autorização e toda regra da decisão são verificadas no backend; a interface não é autoridade (ADR-0005).
- **INV-012:** a operação de confirmação de participação é única e atômica e é a mesma usada pela SPEC-022; aplicada a uma participação já confirmada, não altera a data de entrada nem o sinalizador (OPEN-69).
- **INV-013:** a decisão não altera as regras do bolão nem outras participações (RB15).
- **INV-014:** o solicitante aprovado com taxa pendente já é membro para consultar as regras e para aparecer na lista de bolões (SPEC-007), mas não palpita antes da confirmação (RB22, RB62).

## 7. Modelo de domínio envolvido

- **Participacao:** status (solicitada para aprovada, confirmada ou rejeitada), data de entrada, sinalizador de entrada tardia e indicação de pagamento confirmado. A data de entrada e o sinalizador só são gravados na confirmação.
- **Usuario:** nome do solicitante, somente leitura.
- **Bolao e Partida:** somente leitura (taxa, status e partidas selecionadas para o cálculo da entrada tardia).
- **RegistroAuditoria:** um registro por decisão, com os detalhes definidos na seção 9.
- **Restrições:** transições permitidas apenas de solicitada para aprovada, confirmada ou rejeitada; aprovada para confirmada fica com a SPEC-022.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "bolões e participações", "partidas e resultados" (leitura), "notificações e auditoria" e persistência e correlação da SPEC-001.
- **Fronteiras:**
  - O backend decide quem pode decidir, o estado da solicitação e a confirmação; a interface só apresenta e envia o comando.
  - A operação interna de confirmação de participação é exposta ao módulo de pagamentos para a SPEC-022.
- **Integrações necessárias:** nenhuma.
- **Frontend:** seção de solicitações na tela do bolão para administrador e coadministrador, com lista, ações de aprovar e rejeitar, confirmação antes de rejeitar e atualização da lista quando a solicitação já foi decidida; utilizável em 360 px, 768 px e 1366 px.
- **Backend:** listagem, decisão atômica, cálculo da entrada tardia, operação interna de confirmação, autorização e auditoria.
- **ADRs que restringem a solução:** ADR-0001, ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003 e as categorias das SPEC-006 e SPEC-008.

- **Listar solicitações pendentes**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: solicitações com identificador, nome do solicitante, data e hora da solicitação e indicação de entrada tardia.
  - Erros: 401; 403; 404.
- **Aprovar solicitação**
  - Entrada: identificador do bolão e da solicitação.
  - Saída: situação resultante da participação (confirmada, ou aprovada aguardando pagamento) e, se confirmada, a indicação de entrada tardia.
  - Erros: 401; 403; 404 (não membro, bolão ou solicitação inexistente); 409 (solicitação já decidida ou bolão encerrado); 500.
- **Rejeitar solicitação**
  - Entrada: identificador do bolão e da solicitação.
  - Saída: situação resultante (rejeitada).
  - Erros: os mesmos da aprovação.
- **Confirmar participação (interna)**
  - Entrada: participação.
  - Saída: participação confirmada com data de entrada em UTC e sinalizador definitivo de entrada tardia; sem efeito se já confirmada.
  - Erros: participação em status incompatível.
- **Detalhes do registro de auditoria:** na aprovação, se a participação foi confirmada ou ficou aguardando pagamento e, se confirmada, o sinalizador de entrada tardia; na rejeição, nenhum detalhe adicional.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF01 | Chamar as operações sem sessão e como não membro, conferindo 401 e 404 sem dados (TC-04). |
| RNF02 | Falhar a gravação da auditoria e conferir que a solicitação continua pendente (TC-11). |
| RNF04 e RNF16 | Conferir os registros de aprovação, rejeição e negado (TC-12). |
| RNF12 e RNF18 | Testes automatizados de autorização por papel e por status, inclusive com requisições diretas (TC-04, TC-14). |
| RNF14 (por extensão) | Roteiro da tela de solicitações em 360 px, 768 px e 1366 px (TC-16). |

## 11. Critérios de aceitação

- **CA-01 (listar):** Dado um bolão com solicitações pendentes e decididas, Quando o administrador lista as solicitações, Então vê apenas as pendentes do seu bolão, com nome, data e hora e indicação de entrada tardia, sem e-mail nem código de convite.
- **CA-02 (aprovar sem taxa):** Dado um bolão sem taxa e uma solicitação pendente, Quando o administrador a aprova, Então a participação fica confirmada, com data de entrada em UTC igual ao instante da decisão, sinalizador de entrada tardia falso, pagamento confirmado e um registro de auditoria de sucesso; e o usuário passa a ver o bolão em sua lista e a consultar as regras como membro.
- **CA-03 (aprovar sem taxa, entrada tardia):** Dado um bolão sem taxa com uma partida selecionada já iniciada, Quando a solicitação é aprovada, Então a participação fica confirmada com o sinalizador de entrada tardia verdadeiro.
- **CA-04 (aprovar com taxa):** Dado um bolão com taxa, Quando a solicitação é aprovada, Então a participação fica aprovada aguardando pagamento, sem data de entrada e com pagamento não confirmado; o usuário é membro, mas não confirmado.
- **CA-05 (rejeitar):** Dado uma solicitação pendente, Quando o administrador a rejeita, Então a participação fica rejeitada, o usuário não é membro, a abertura do convite mostra a situação rejeitada e uma nova solicitação é recusada (409).
- **CA-06 (coadministrador):** Dado um coadministrador com participação confirmada, Quando ele lista, aprova e rejeita solicitações, Então as operações são permitidas.
- **CA-07 (sem permissão):** Dado um participante comum, um não membro e uma requisição sem sessão, Quando tentam decidir, Então recebem 403, 404 e 401, respectivamente, sem alteração; as duas primeiras são auditadas como negado.
- **CA-08 (já decidida):** Dado uma solicitação já aprovada ou rejeitada, Quando se tenta decidi-la de novo, Então a resposta é 409 e nada muda.
- **CA-09 (decisões simultâneas):** Dado uma solicitação pendente, Quando duas decisões simultâneas, uma de aprovar e outra de rejeitar, são enviadas, Então apenas uma é efetivada e a outra recebe 409.
- **CA-10 (bolão encerrado):** Dado um bolão encerrado com solicitação pendente, Quando se tenta decidir, Então a decisão é recusada (409).
- **CA-11 (solicitação de outro bolão):** Dado uma solicitação que pertence a outro bolão, Quando o administrador a decide pelo identificador do seu bolão, Então recebe 404 e nada muda.
- **CA-12 (atomicidade):** Dado que a gravação do registro de auditoria falha, Quando a decisão é executada, Então a solicitação continua pendente e nenhum dado de entrada é gravado.
- **CA-13 (auditoria):** Dado uma aprovação, uma rejeição e uma tentativa negada, Quando os registros são consultados no backend, Então existem registros de sucesso com o decisor como ator e a participação como objeto, e um de resultado negado; a aprovação traz nos detalhes se a participação foi confirmada ou ficou aguardando pagamento e o sinalizador de entrada tardia.
- **CA-14 (confirmação interna):** Dado uma participação já confirmada, Quando a operação interna de confirmação é aplicada de novo, Então a data de entrada e o sinalizador não mudam.
- **CA-15 (autorização no backend):** Dado requisições enviadas diretamente ao backend, sem a interface, Quando tentam decidir sem permissão, Então são rejeitadas como pela interface.
- **CA-16 (formato de erros):** Dado erros 401, 403, 404, 409 e 500, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.
- **CA-17 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o administrador lista, aprova e rejeita, Então a tela permanece utilizável, sem sobreposição de controles nem rolagem horizontal da página; a rejeição pede confirmação e, se a solicitação já foi decidida, a lista é atualizada com a mensagem de erro.
- **CA-18 (decisão não afeta o resto):** Dado a decisão de uma solicitação, Quando as regras do bolão e as outras participações são comparadas antes e depois, Então permanecem iguais.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-009 | Listar solicitações com pendentes, decididas e de outro bolão e conferir o conteúdo. |
| TC-02 | CA-02, INV-003, INV-007 | Aprovar em bolão sem taxa e conferir confirmação, data, sinalizador, pagamento, auditoria e acesso de membro. |
| TC-03 | CA-03, INV-005 | Aprovar em bolão sem taxa com partida iniciada e com partida apenas cancelada e conferir o sinalizador. |
| TC-04 | CA-07, INV-001 | Tentar decidir como participante comum, não membro e sem sessão. |
| TC-05 | CA-04, INV-004, INV-014 | Aprovar em bolão com taxa e conferir status, ausência de data de entrada e condição de membro. |
| TC-06 | CA-05, INV-006 | Rejeitar, conferir a situação, e tentar nova solicitação. |
| TC-07 | CA-06 | Listar, aprovar e rejeitar como coadministrador. |
| TC-08 | CA-08, INV-002 | Decidir de novo uma solicitação já decidida. |
| TC-09 | CA-09 | Enviar aprovar e rejeitar simultâneos sobre a mesma solicitação. |
| TC-10 | CA-10, INV-010 | Decidir em bolão encerrado. |
| TC-11 | CA-12 | Forçar falha na auditoria durante a decisão. |
| TC-12 | CA-13 | Conferir os registros de auditoria de aprovação, rejeição e negado. |
| TC-13 | CA-11, CA-18, INV-013 | Decidir solicitação de outro bolão e comparar regras e participações antes e depois. |
| TC-14 | CA-15, INV-011 | Enviar requisições diretas sem permissão. |
| TC-15 | CA-14, INV-012 | Aplicar a confirmação interna duas vezes. |
| TC-16 | CA-17 | Executar a tela em 360 px, 768 px e 1366 px, incluindo o erro de solicitação já decidida. |
| TC-17 | CA-16 | Provocar cada categoria de erro e conferir o formato comum. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-68 | A lista mostra só solicitações pendentes, com nome do solicitante, data e hora da solicitação e a indicação de que a entrada seria tardia agora, sem e-mail nem código de convite; a rejeição não tem motivo; em bolão sem taxa, o indicador de pagamento confirmado é verdadeiro porque não há o que pagar, o que vale também para o criador da SPEC-007 quando a taxa é zero. |
| OPEN-69 | Só solicitação com status solicitada é decidível; decisão repetida ou simultânea devolve 409; bolão encerrado não aceita decisões (409); a confirmação de participação é uma operação interna única, atômica e idempotente, que grava status confirmada, data de entrada em UTC e o sinalizador de entrada tardia, e é a mesma que a SPEC-022 aplicará após o pagamento. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-010 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-18) estiverem implementados;
- todos os invariantes (INV-001 a INV-014) estiverem preservados;
- os testes derivados (TC-01 a TC-17) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
