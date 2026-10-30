# SPEC-012 — Realização e alteração de palpite dentro do prazo

- **Status:** aprovada. As propostas OPEN-72 e OPEN-73 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003, SPEC-006, SPEC-007, SPEC-009 e SPEC-010.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/` (incluindo `matriz-de-permissoes.md` e o modelo de domínio atualizado), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-011.
- **Escopo deste documento:** somente a SPEC-012. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-012
- **Nome:** Realização e alteração de palpite dentro do prazo
- **Objetivo:** permitir que um participante confirmado consulte as partidas do bolão, registre ou altere um palpite de resultado ou de placar exato até o início da partida e seja impedido de fazê-lo depois, ou quando não tem direito à partida por entrada tardia.
- **Valor entregue:** o participante palpita nas partidas do bolão com garantia de prazo, de exclusividade de modalidade e de um único palpite por partida, base de toda a pontuação e do ranking.

## 2. Rastreabilidade

- **RF:** RF20 (realização de palpite), RF21 (alteração antes do início) e RF22 (bloqueio após o início).
- **RB:** RB21 (consequência da entrada tardia), RB25 (uma modalidade por partida), RB26 (exclusividade), RB27 (prazo até o início) e RB28 (bloqueio após o início); RB24 (partidas do bolão) e RB22 e RB62 (só a participação confirmada palpita) como restrições herdadas.
- **RNF:**
  - RNF01 e RNF11 — o participante só vê e altera os próprios palpites; nenhum palpite alheio é exposto.
  - RNF02 — o palpite e seu registro de auditoria formam uma unidade atômica.
  - RNF03 — as consultas apresentam o mesmo estado persistido após cada operação confirmada.
  - RNF04 e RNF16 — o registro e a alteração de palpite são operações auditáveis, com os valores anterior e novo (SPEC-002).
  - RNF06 e RNF07 — desempenho local e perfil de carga acadêmico (20 usuários, 5 bolões ativos, 1.000 palpites).
  - RNF09 — falha antes da confirmação não deixa efeito parcial; repetir uma solicitação já processada não duplica.
  - RNF13 e RNF14 — o palpite é fluxo principal: navegadores e responsividade.
  - RNF18 — as regras críticas (prazo, exclusividade, direito por entrada tardia) têm testes independentes da interface.
- **Caso de uso ou fluxo:** UC04, fluxo principal e exceções A1 (partida já iniciada), A2 (palpite inválido) e A3 (participante sem direito).
- **Entidades do modelo conceitual:** `Palpite`, `Participacao`, `Partida`, `Bolao`, `Rodada`, `Time` e `RegistroAuditoria`.
- **Drivers arquiteturais:** DA-01 (integridade do prazo e da unicidade) e DA-04 (acesso restrito ao próprio participante).
- **ADRs:** ADR-0005 (validação e prazo no backend, instante de início e alterações concorrentes), ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Consultar as partidas do bolão para palpite (UC04, passo 1):** partidas selecionadas, agrupadas por rodada, com a situação de cada uma para o participante e o palpite próprio.
2. **Registrar e alterar palpite (RF20, RF21):** de resultado (vitória do mandante, empate ou vitória do visitante) ou de placar exato (gols do mandante e do visitante), uma modalidade por partida; a alteração substitui o palpite anterior inteiro, inclusive trocando a modalidade.
3. **Prazo (RB27, RB28, RF22):** aceito somente se o instante da gravação for estritamente anterior ao início vigente da partida, pelo relógio do servidor em UTC, verificado dentro da transação de gravação, sem tolerância (OPEN-37).
4. **Direito à partida (RB21, UC04 A3):** recusar palpite em partida cujo início é anterior à data de entrada do participante e em partida que não está agendada com data e hora.
5. **Unicidade e exclusividade (RB25, RB26):** no máximo um palpite por participante e partida, de uma única modalidade.
6. **Auditoria (SPEC-002):** registro de cada registro e alteração efetivos de palpite, com valores anterior e novo nos detalhes.
7. **Interface:** tela de palpites do bolão, com as partidas por rodada, a situação de cada uma, o formulário de palpite e as mensagens de prazo encerrado e de falta de direito.

### Fora do escopo

- Pontuação, resultado oficial, ranking e medalhas (SPEC-013 a SPEC-016); esta Spec nunca preenche os pontos do palpite.
- Visão dos palpites de outros participantes depois do início da partida, que será entregue no histórico do bolão (SPEC-028; OPEN-73).
- Quem entra tarde e a definição da data de entrada (SPEC-009, SPEC-010 e SPEC-022).
- Auditoria de tentativas recusadas (prazo, direito), que não consta do catálogo da SPEC-002; elas vão ao registro técnico.
- Resultados ao vivo (SPEC-021).

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, relógio, correlação), SPEC-002 (auditoria), SPEC-003 (autenticação e formato de erros), SPEC-006 (partidas e status), SPEC-007 (partidas selecionadas do bolão), SPEC-009 e SPEC-010 (participação confirmada e data de entrada).
- **Decisões arquiteturais:** ADR-0005 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- O participante está autenticado e tem participação confirmada no bolão, com data de entrada.
- O bolão está ativo.
- A partida está selecionada para o bolão, está agendada com data e hora e ainda não começou.
- O início da partida não é anterior à data de entrada do participante.

### Fluxo principal — consultar partidas

1. O participante pede as partidas do bolão.
2. O sistema devolve as partidas por rodada, com mandante, visitante, data e hora e status, a situação de cada uma para ele (aberta, encerrada para palpite, sem direito por entrada tardia ou indisponível) e o palpite que ele já fez, se houver.

### Fluxo principal — registrar ou alterar palpite

1. O participante escolhe uma partida aberta e uma modalidade, e informa o palpite.
2. Em uma transação, o sistema valida a participação, a pertença da partida ao bolão, o status e o horário da partida, o direito por entrada tardia e o formato do palpite, compara o instante da gravação com o início da partida e grava o palpite novo ou substitui o anterior, com a data de envio em UTC.
3. Na mesma transação, o sistema grava o registro de auditoria de sucesso, com os valores anterior e novo.
4. O sistema confirma a operação e devolve o palpite gravado.

### Fluxos alternativos

- **A1 — Substituição de modalidade:** o palpite de resultado é trocado por um de placar exato, ou o inverso; o anterior deixa de existir e nunca coexistem os dois.
- **A2 — Reenvio idêntico:** um palpite igual ao já gravado é aceito sem alteração: a data de envio não muda e nenhum registro de auditoria novo é criado.
- **A3 — Partida remarcada:** o prazo passa a ser o novo início, enquanto a partida continuar agendada.

### Fluxos de exceção

- **E1 — Sessão ausente, inválida, expirada ou encerrada:** rejeitada (401).
- **E2 — Quem não é membro do bolão, tem participação solicitada, rejeitada ou que saiu, ou bolão inexistente:** 404, sem dados.
- **E3 — Participação aprovada aguardando pagamento:** 409 do tipo participação não confirmada, nada gravado.
- **E4 — Partida que não pertence ao bolão:** 404.
- **E5 — Partida já iniciada, no instante exato do início ou depois** (UC04 A1, RF22): 409 do tipo prazo encerrado, com a informação de que o prazo terminou; o palpite anterior é preservado.
- **E6 — Partida adiada, cancelada ou sem data e hora:** 409 do tipo partida indisponível; palpites existentes são mantidos.
- **E7 — Partida cujo início é anterior à data de entrada do participante** (UC04 A3, RB21): 409 do tipo sem direito por entrada tardia.
- **E8 — Palpite inválido** (UC04 A2): 400 indicando o campo; o palpite anterior é preservado.
- **E9 — Bolão encerrado:** 409.
- **E10 — Falha ao gravar o palpite ou o registro de auditoria:** nada é persistido e o palpite anterior permanece (500, sem detalhes internos).

### Pós-condições

- Existe no máximo um palpite por participante e partida.
- Palpites só foram criados ou alterados antes do início da partida.
- Os pontos do palpite continuam vazios até a apuração.
- Falhas não deixam efeito parcial.

## 6. Regras e invariantes

- **INV-001:** existe no máximo um palpite por participante e partida, também sob envios simultâneos (UC04, RNF03).
- **INV-002:** um palpite é de resultado ou de placar exato, nunca os dois; substituir troca a modalidade e descarta o conteúdo anterior (RB25, RB26).
- **INV-003:** o palpite só é aceito se o instante da gravação, pelo relógio do servidor em UTC e verificado dentro da transação, for estritamente anterior ao início vigente da partida; no instante do início ou depois é recusado, sem tolerância (RB27, RB28, OPEN-37).
- **INV-004:** só partidas com status agendada e com data e hora aceitam palpite; adiada, cancelada, em andamento e encerrada não (OPEN-72).
- **INV-005:** só participação confirmada palpita; a participação aprovada aguardando pagamento é recusada (409) e as demais situações e não membros recebem 404 (RB22, RB62, UC04).
- **INV-006:** só partidas selecionadas pelo bolão aceitam palpite do bolão (RB24).
- **INV-007:** não há palpite em partida cujo início é anterior à data de entrada do participante (RB21, RF16, OPEN-17).
- **INV-008:** um palpite inválido é recusado e o palpite anterior é preservado (UC04 A2).
- **INV-009:** o palpite de resultado é um de vitória do mandante, empate ou vitória do visitante; o de placar exato tem dois números inteiros de 0 a 99 (OPEN-72).
- **INV-010:** cada alteração efetiva e seu registro de auditoria de sucesso, com os valores anterior e novo, são atômicos; um reenvio idêntico não altera a data de envio nem gera registro (RNF02, RNF09, RNF16, OPEN-72).
- **INV-011:** nenhuma operação desta Spec expõe palpites de outros participantes (RNF01, RNF11, OPEN-18, OPEN-73).
- **INV-012:** um palpite nunca é criado, alterado ou substituído depois do início da partida (RF22, RB28).
- **INV-013:** esta Spec não preenche os pontos do palpite (SPEC-014).
- **INV-014:** o registro, a alteração e a consulta usam somente dados locais, sem chamada ao fornecedor esportivo (RNF06).
- **INV-015:** prazo, direito e formato são validados no backend; a interface não é autoridade (ADR-0005).
- **INV-016:** a data de envio é a do servidor em UTC e só muda em alteração efetiva (RNF16).

## 7. Modelo de domínio envolvido

- **Palpite:** participação, partida, tipo (resultado ou placar exato), resultado previsto, gols previstos do mandante e do visitante, pontos ganhos (vazios nesta Spec) e data de envio em UTC. Único por participação e partida.
- **Participacao:** status confirmada e data de entrada, somente leitura.
- **Partida, Rodada, Time:** status, data e hora, mandante e visitante, somente leitura.
- **Bolao:** partidas selecionadas e status, somente leitura.
- **RegistroAuditoria:** um registro por alteração efetiva, com os valores anterior e novo do palpite nos detalhes.
- **Restrições:** unicidade por participação e partida; exclusividade da modalidade.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "palpites e pontuação" (principal), "bolões e participações" e "partidas e resultados" (leitura), "notificações e auditoria" e persistência e correlação da SPEC-001.
- **Fronteiras:**
  - O backend decide prazo, direito e formato dentro da transação de gravação; a interface apenas orienta.
  - Nenhuma chamada a fornecedor externo ocorre no palpite; o catálogo local é a fonte do horário (SPEC-006).
- **Integrações necessárias:** nenhuma.
- **Frontend:** tela de palpites com partidas por rodada, indicação clara da situação de cada partida, formulário com a modalidade e os valores, mensagens de prazo encerrado e de falta de direito, e atualização do estado após a gravação; utilizável em 360 px, 768 px e 1366 px.
- **Backend:** consulta das partidas do participante, gravação atômica do palpite, validações e auditoria.
- **ADRs que restringem a solução:** ADR-0001, ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003, com tipos de erro estáveis nos casos de 409.

- **Consultar partidas do bolão para palpite**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: rodadas com partidas (mandante, visitante, data e hora, status), situação de cada partida para o participante e palpite próprio (modalidade, valores, data de envio).
  - Erros: 401; 404; 409 (participação não confirmada).
- **Registrar ou alterar palpite**
  - Entrada: identificador do bolão e da partida, modalidade e valores (resultado, ou gols do mandante e do visitante).
  - Saída: palpite gravado (modalidade, valores, data de envio).
  - Erros: 401; 400 (campo inválido); 404 (não membro, partida fora do bolão); 409 com tipo prazo encerrado, sem direito por entrada tardia, partida indisponível, participação não confirmada ou bolão encerrado; 500.
- **Detalhes do registro de auditoria:** modalidade e valores anterior e novo do palpite.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF01 e RNF11 | Com dois participantes, conferir que cada um vê e altera só o seu palpite e que nenhuma operação expõe o do outro (TC-12). |
| RNF02 e RNF09 | Falhar a gravação da auditoria e do palpite, e reenviar o mesmo palpite, conferindo ausência de efeito parcial e de duplicidade (TC-13, TC-05). |
| RNF03 | Registrar um palpite e conferir o mesmo estado na lista de partidas e na consulta direta (TC-14). |
| RNF04 e RNF16 | Conferir os registros com os valores anterior e novo (TC-15). |
| RNF06 e RNF07 | Teste de carga com 5 usuários simultâneos e conjunto de referência de 20 usuários, 5 bolões ativos e 1.000 palpites, após confirmação da equipe (TC-20). |
| RNF13 e RNF14 | Roteiros nos navegadores do RNF13 e em 360 px, 768 px e 1366 px (TC-18, TC-19). |
| RNF18 | Testes automatizados das regras de prazo, exclusividade e direito, sem credenciais externas (TC-02 a TC-11). |

## 11. Critérios de aceitação

- **CA-01 (palpite de resultado):** Dado um participante confirmado e uma partida aberta, Quando ele registra um palpite de resultado, Então o palpite é gravado com a data de envio em UTC, sem pontos, e existe um registro de auditoria de sucesso com os valores novos.
- **CA-02 (palpite de placar exato):** Dado a mesma situação, Quando ele registra um palpite de placar exato, Então o palpite é gravado com os gols do mandante e do visitante.
- **CA-03 (alteração):** Dado um palpite já registrado em partida ainda aberta, Quando o participante o altera, Então o palpite é substituído, continua existindo um único palpite para a partida e o registro de auditoria traz os valores anterior e novo.
- **CA-04 (troca de modalidade):** Dado um palpite de resultado, Quando ele é substituído por um de placar exato, Então só o de placar exato existe e o conteúdo de resultado deixa de existir.
- **CA-05 (reenvio idêntico):** Dado um palpite já gravado, Quando o mesmo palpite é reenviado, Então a operação é aceita, a data de envio não muda e nenhum registro de auditoria novo é criado.
- **CA-06 (prazo encerrado):** Dado uma partida cujo início já passou, e outra cujo início é exatamente o instante da gravação, Quando o participante tenta registrar, alterar ou substituir o palpite, Então recebe 409 do tipo prazo encerrado e o palpite anterior é preservado.
- **CA-07 (instante da gravação):** Dado um relógio controlado, Quando o palpite é gravado 1 milissegundo antes do início e no instante do início, Então o primeiro é aceito e o segundo é recusado.
- **CA-08 (remarcação):** Dado uma partida agendada cujo horário o catálogo passou a informar como mais tarde, Quando o participante palpita depois do horário antigo e antes do novo, Então o palpite é aceito.
- **CA-09 (partida indisponível):** Dado uma partida adiada, uma cancelada, uma sem data e hora e uma em andamento, Quando o participante tenta palpitar, Então recebe 409 do tipo partida indisponível ou prazo encerrado e palpites existentes permanecem iguais.
- **CA-10 (entrada tardia):** Dado um participante cuja data de entrada é posterior ao início de uma partida, Quando ele tenta palpitar nela, Então recebe 409 do tipo sem direito por entrada tardia; e nas partidas que começam depois da entrada o palpite é aceito.
- **CA-11 (participação não confirmada):** Dado um participante com participação aprovada aguardando pagamento, e outros com participação solicitada, rejeitada, que saiu ou sem vínculo, Quando tentam palpitar, Então o primeiro recebe 409 do tipo participação não confirmada e os demais recebem 404.
- **CA-12 (partida fora do bolão):** Dado uma partida que o bolão não selecionou, Quando o participante tenta palpitar, Então recebe 404.
- **CA-13 (palpite inválido):** Dado modalidade ausente ou dupla, resultado fora dos três valores, placar negativo, acima de 99, não inteiro ou incompleto, Quando o palpite é enviado, Então é rejeitado (400) indicando o campo e o palpite anterior é preservado.
- **CA-14 (lista de partidas):** Dado um bolão com partidas em situações diferentes, Quando o participante as consulta, Então vê, por rodada, cada partida com sua situação (aberta, encerrada para palpite, sem direito, indisponível) e o próprio palpite.
- **CA-15 (isolamento):** Dado dois participantes do mesmo bolão, Quando cada um consulta e altera seus palpites, Então só vê e altera os próprios, e nenhuma operação desta Spec devolve o palpite do outro, nem depois do início da partida.
- **CA-16 (envios simultâneos):** Dado um participante, Quando dois palpites simultâneos para a mesma partida aberta são enviados, Então existe um único palpite ao final, correspondente a um dos envios.
- **CA-17 (atomicidade):** Dado que a gravação do registro de auditoria falha, Quando o palpite é registrado ou alterado, Então nenhum palpite novo é criado e o palpite anterior permanece.
- **CA-18 (consistência):** Dado um palpite confirmado, Quando a lista de partidas e a consulta direta são comparadas, Então apresentam o mesmo estado.
- **CA-19 (sem chamadas externas):** Dado o fornecedor esportivo indisponível, Quando o participante consulta partidas e palpita, Então as operações funcionam com os dados locais.
- **CA-20 (bolão encerrado):** Dado um bolão encerrado, Quando o participante tenta palpitar, Então recebe 409 do tipo bolão encerrado.
- **CA-21 (sessão e formato de erros):** Dado uma requisição sem sessão válida e os erros 400, 401, 404, 409 e 500, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.
- **CA-22 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o participante vê as partidas e palpita, Então as telas permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página, e as mensagens de prazo encerrado e de falta de direito são claras.
- **CA-23 (navegadores):** Dado os navegadores e sistemas do RNF13, Quando o roteiro de palpite é executado, Então funciona sem erro que bloqueie o fluxo.
- **CA-24 (desempenho e escala):** Dado 5 usuários simultâneos e o conjunto de referência de 20 usuários, 5 bolões ativos e 1.000 palpites, Quando os fluxos de consulta e gravação de palpite são executados, Então pelo menos 95% respondem em até 3 segundos e não há perda nem duplicação de dados.
- **CA-25 (autorização no backend):** Dado requisições enviadas diretamente ao backend, sem a interface, Quando tentam palpitar fora do prazo, sem direito ou sem confirmação, Então são rejeitadas como pela interface.
- **CA-26 (auditoria):** Dado um registro e uma alteração de palpite, Quando os registros de auditoria são consultados no backend, Então existem registros de sucesso com o participante como ator, o palpite como objeto e os valores anterior e novo nos detalhes, sem segredos.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, CA-02, INV-013 | Registrar palpite de resultado e de placar exato e conferir gravação, pontos vazios e auditoria. |
| TC-02 | CA-03, CA-04, INV-001, INV-002 | Alterar o palpite, trocar a modalidade e conferir o único palpite e os valores anterior e novo. |
| TC-03 | CA-06, CA-07, INV-003, INV-012 | Palpitar antes, no instante e depois do início com relógio controlado. |
| TC-04 | CA-08 | Remarcar a partida no catálogo e palpitar entre o horário antigo e o novo. |
| TC-05 | CA-05, INV-010 | Reenviar o mesmo palpite e conferir data de envio e registros. |
| TC-06 | CA-09, INV-004 | Palpitar em partidas adiada, cancelada, sem data e em andamento. |
| TC-07 | CA-10, INV-007 | Palpitar antes e depois da data de entrada do participante. |
| TC-08 | CA-11, INV-005 | Palpitar com participação aprovada, solicitada, rejeitada, que saiu e sem vínculo. |
| TC-09 | CA-12, INV-006 | Palpitar em partida fora do bolão. |
| TC-10 | CA-13, INV-008, INV-009 | Enviar cada categoria de palpite inválido e conferir a preservação do anterior. |
| TC-11 | CA-20 | Palpitar em bolão encerrado. |
| TC-12 | CA-15, INV-011 | Com dois participantes, conferir o isolamento antes e depois do início. |
| TC-13 | CA-17, INV-010 | Forçar falha na auditoria e conferir que nada é criado e o anterior permanece. |
| TC-14 | CA-14, CA-18 | Conferir a lista de partidas e a consulta direta após cada operação. |
| TC-15 | CA-26 | Conferir os registros de auditoria de registro e alteração. |
| TC-16 | CA-16 | Enviar dois palpites simultâneos para a mesma partida. |
| TC-17 | CA-19, CA-25, CA-21 | Palpitar com o fornecedor indisponível, com requisições diretas sem permissão e verificar o formato de erros. |
| TC-18 | CA-23 | Roteiro manual nos navegadores do RNF13. |
| TC-19 | CA-22 | Executar as telas em 360 px, 768 px e 1366 px. |
| TC-20 | CA-24 | Teste de carga e de escala (sujeito à confirmação da equipe). |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-72 | Só partidas com status agendada e com data e hora aceitam palpite, enquanto adiadas, canceladas, em andamento e encerradas não, mantendo os palpites já feitos; o palpite de resultado é vitória do mandante, empate ou vitória do visitante; o de placar exato tem dois inteiros de 0 a 99; um reenvio idêntico é aceito como operação sem efeito, sem alterar a data de envio e sem registro de auditoria; os 409 distinguem por tipo estável: prazo encerrado, sem direito por entrada tardia, partida indisponível, participação não confirmada e bolão encerrado. |
| OPEN-73 | A consulta de partidas e a de palpite exigem participação confirmada (a aprovada recebe 409, as demais 404); esta Spec expõe somente os palpites do próprio participante; a visão dos palpites dos outros depois do início da partida fica no histórico do bolão (SPEC-028); tentativas recusadas por prazo ou por falta de direito não são auditadas, só vão ao registro técnico. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-012 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-26) estiverem implementados;
- todos os invariantes (INV-001 a INV-016) estiverem preservados;
- os testes derivados (TC-01 a TC-20) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com os roteiros de navegadores e de larguras de tela (RNF13 e RNF14) e o teste de carga e de escala (RNF06 e RNF07) executados somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
