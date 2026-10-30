# SPEC-016 — Melhor jogador da rodada e medalhas

- **Status:** aprovada. As propostas OPEN-80 e OPEN-81 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001, SPEC-003, SPEC-007, SPEC-010 e SPEC-013 a SPEC-015.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/`, `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-015.
- **Escopo deste documento:** somente a SPEC-016. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-016
- **Nome:** Melhor jogador da rodada e medalhas
- **Objetivo:** identificar, ao término de cada rodada do bolão, todos os participantes empatados na maior pontuação da rodada e associar a cada um uma medalha visual dentro do bolão, mantendo as medalhas coerentes com os pontos vigentes enquanto o bolão está ativo.
- **Valor entregue:** incentivo competitivo por rodada, sem nenhum efeito na pontuação, na classificação ou na premiação.

## 2. Rastreabilidade

- **RF:** RF28 (identificação de todos os empatados na maior pontuação da rodada) e RF29 (medalha visual no perfil, dentro do bolão).
- **RB:** RB39 (melhores jogadores da rodada), RB40 (medalha por bolão) e RB41 (finalidade exclusivamente visual).
- **RNF:**
  - RNF02 — a reconciliação das medalhas de uma rodada é atômica.
  - RNF03 — as medalhas correspondem aos pontos e às regras vigentes.
  - RNF01 e RNF11 — as medalhas só são visíveis a participantes do bolão, sem e-mail.
  - RNF18 — as regras de concessão têm testes independentes da interface e de serviços externos.
  - RNF14 — por extensão: telas utilizáveis em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC05, passo 7 e exceção A4 (rodada sem palpites válidos ou sem pontuação apurável).
- **Entidades do modelo conceitual:** `Medalha`, `Participacao`, `Rodada`, `Bolao`, `Palpite` (pontos), `Partida` (status e versões) e `Usuario` (nome).
- **Drivers arquiteturais:** DA-01 (consistência das medalhas com os pontos) e DA-04 (visibilidade restrita ao bolão).
- **ADRs:** ADR-0005 (regras e autorização no backend), ADR-0006 (agendador), ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Concessão de medalhas por rodada do bolão:** quando a rodada está encerrada para o bolão e todos os resultados das suas partidas estão pontuados na versão atual, concede uma medalha a cada participante elegível com a maior pontuação da rodada (RF28, RF29, OPEN-80).
2. **Pontuação da rodada** pela função da SPEC-015 (soma dos pontos dos palpites nas partidas selecionadas da rodada) e rodada encerrada conforme a OPEN-20.
3. **Reconciliação enquanto o bolão está ativo:** quando os pontos de uma rodada mudam por correção de resultado, as medalhas são ajustadas (concede as que passam a valer, retira as que deixam de valer); depois do encerramento do bolão não há mais recálculo (OPEN-04).
4. **Tarefa de medalhas** no agendador, que reconcilia as rodadas encerradas dos bolões ativos (OPEN-81).
5. **Consulta das medalhas do bolão** pelos participantes: melhores jogadores por rodada encerrada e medalhas de cada participante (OPEN-81).
6. **Interface:** medalha ao lado do nome do participante no ranking e tela de medalhas por rodada.

### Fora do escopo

- Cálculo dos pontos e do ranking (SPEC-014 e SPEC-015); esta Spec apenas os consome.
- Notificação de "medalha recebida" (SPEC-027), que lerá a concessão desta Spec.
- Encerramento do bolão, vencedores e premiação (SPEC-025 e SPEC-026); a medalha não influencia nenhum deles.
- Saída do bolão (SPEC-017).
- Auditoria da concessão, que não consta do catálogo da SPEC-002; o processamento vai ao registro técnico.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, correlação, testes), SPEC-003 (autenticação e formato de erros), SPEC-007 (bolão e partidas selecionadas), SPEC-010 (participação confirmada), SPEC-013 (agendador e status das partidas), SPEC-014 (pontos e versão pontuada) e SPEC-015 (pontuação por rodada e classificação).
- **Decisões arquiteturais:** ADR-0005, ADR-0006 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- Existe uma rodada do bolão encerrada (todas as suas partidas selecionadas estão encerradas ou não computáveis).
- Todas as partidas encerradas dessa rodada estão pontuadas na versão atual do resultado (SPEC-014).
- O bolão está ativo.

### Fluxo principal — conceder medalhas

1. O agendador dispara a tarefa de medalhas.
2. O sistema identifica as rodadas encerradas dos bolões ativos cujos resultados estão todos pontuados na versão atual.
3. Para cada rodada, em uma transação, o sistema calcula a pontuação de cada participante elegível na rodada, determina a maior pontuação e, se ela for maior que zero, identifica todos os participantes com essa pontuação.
4. O sistema reconcilia as medalhas da rodada com esse conjunto: concede a medalha aos que não a possuem, com a data de concessão em UTC, e retira a de quem deixou de estar no conjunto; quem já a possui mantém a medalha e a data original.
5. O sistema registra o processamento no registro técnico.

### Fluxo principal — consultar medalhas

1. O participante pede as medalhas do bolão.
2. O sistema devolve, por rodada encerrada, os melhores jogadores (nome e pontos da rodada) e, por participante, as medalhas conquistadas.

### Fluxos alternativos

- **A1 — Empate na maior pontuação:** todos os empatados recebem a medalha (RB39).
- **A2 — Correção de resultado em bolão ativo:** a pontuação da rodada muda, o conjunto de melhores jogadores é recalculado e as medalhas são ajustadas.
- **A3 — Bolão encerrado:** as medalhas permanecem como estão.
- **A4 — Rodada parcial do bolão:** só as partidas selecionadas pelo bolão contam para a pontuação e para o encerramento da rodada.

### Fluxos de exceção

- **E1 — Rodada sem palpites válidos ou sem pontos** (UC05 A4): nenhuma medalha é concedida.
- **E2 — Rodada ainda aberta, ou com resultado pendente de pontuação:** nenhuma medalha é concedida nem alterada até a rodada estar pronta.
- **E3 — Falha ao reconciliar uma rodada:** a transação é desfeita, a falha é registrada e as demais rodadas continuam; a rodada é tentada de novo na execução seguinte.
- **E4 — Consulta sem sessão, de quem não é membro, de quem saiu ou de bolão inexistente:** 401 e 404, sem dados; participação aprovada aguardando pagamento recebe 409.

### Pós-condições

- Cada rodada encerrada e pontuada de bolão ativo tem medalha para todos os participantes elegíveis na maior pontuação positiva, e para mais ninguém.
- Pontos, classificação e premiação não foram alterados.

## 6. Regras e invariantes

- **INV-001:** só rodadas encerradas para o bolão (todas as partidas selecionadas encerradas ou não computáveis) e com todos os resultados pontuados na versão atual recebem medalhas; antes disso nada é concedido nem alterado (RF28, UC05 passo 7).
- **INV-002:** recebem medalha todos os participantes elegíveis empatados com a maior pontuação da rodada, desde que essa pontuação seja maior que zero; rodada sem palpites válidos ou sem pontos não concede medalha (RB39, UC05 A4, OPEN-80).
- **INV-003:** são elegíveis as participações confirmadas no momento do cálculo; quem saiu não recebe nova medalha (OPEN-21, OPEN-80).
- **INV-004:** a pontuação da rodada é a função da SPEC-015: soma dos pontos dos palpites do participante nas partidas selecionadas pelo bolão naquela rodada (OPEN-20).
- **INV-005:** existe no máximo uma medalha por participação e rodada do bolão (RB40).
- **INV-006:** a medalha é exclusivamente visual: nunca altera pontos, pontuação acumulada, classificação, desempate, elegibilidade ou premiação (RB41).
- **INV-007:** enquanto o bolão está ativo, o conjunto de medalhas de cada rodada encerrada é reconciliado com os pontos vigentes; reprocessar sem mudança de pontos não altera nada e preserva a data de concessão original (RNF03, OPEN-04, OPEN-80).
- **INV-008:** depois que o bolão é encerrado, as medalhas não são mais recalculadas (OPEN-04).
- **INV-009:** a reconciliação das medalhas de uma rodada de um bolão é atômica (RNF02).
- **INV-010:** a tarefa de medalhas é idempotente, não se sobrepõe a si mesma e é isolada de falhas (ADR-0006).
- **INV-011:** só participantes confirmados do bolão veem as medalhas; a participação aprovada recebe 409, as demais situações e bolão inexistente recebem 404 e sem sessão recebe 401; nada de e-mail é exposto (RNF01, RNF11).
- **INV-012:** as medalhas de quem saiu permanecem gravadas e deixam de ser exibidas (OPEN-80).
- **INV-013:** a data de concessão é a do servidor em UTC.
- **INV-014:** o cálculo usa somente dados locais, sem chamar o provedor esportivo.
- **INV-015:** uma medalha pertence a um bolão e a uma rodada; medalhas de um bolão nunca aparecem em outro, ainda que compartilhem a mesma rodada oficial.

## 7. Modelo de domínio envolvido

- **Medalha:** data de concessão; conquistada por uma `Participacao` e referente a uma `Rodada`. Única por participação e rodada.
- **Participacao, Rodada, Bolao, Palpite, Partida, Usuario:** somente leitura (status, rodada do bolão, pontos, status e versões das partidas, nome).
- **Restrições:** uma medalha por participação e rodada; sem efeito sobre pontuação, classificação ou premiação.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "palpites e pontuação" (principal), "bolões e participações" e "partidas e resultados" (leitura) e o agendador da SPEC-001 e SPEC-013.
- **Fronteiras:**
  - A pontuação da rodada e o encerramento da rodada vêm da função da SPEC-015; esta Spec não os redefine.
  - A SPEC-027 lerá as concessões; esta Spec não a chama.
- **Integrações necessárias:** nenhuma.
- **Frontend:** medalha visual ao lado do nome no ranking e tela de medalhas por rodada, utilizáveis em 360 px, 768 px e 1366 px.
- **Backend:** tarefa de reconciliação, transação por rodada e consulta das medalhas.
- **ADRs que restringem a solução:** ADR-0001, ADR-0005, ADR-0006 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003.

- **Tarefa de medalhas (interna)**
  - Entrada: disparo do agendador ou de um teste.
  - Saída: resumo (rodadas processadas, medalhas concedidas e retiradas) e falhas por rodada, sem efeitos parciais em cada rodada.
- **Consultar medalhas do bolão**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: por rodada encerrada, os melhores jogadores (nome e pontos da rodada, com a data de concessão) e, por participante exibido, as rodadas em que conquistou medalha e a quantidade.
  - Erros: 401; 404; 409 (participação não confirmada); 500.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF02 | Falhar a reconciliação de uma rodada e conferir que nada dela muda, enquanto as outras seguem (TC-09). |
| RNF03 | Alterar pontos por correção e conferir que as medalhas correspondem a eles (TC-06). |
| RNF01 e RNF11 | Consultar como participante, aprovada, não membro, quem saiu e sem sessão, e varrer a resposta em busca de e-mail (TC-12). |
| RNF18 | Testes automatizados das regras de concessão, sem interface e sem credenciais externas (TC-01 a TC-11). |
| RNF14 (por extensão) | Roteiro das telas em 360 px, 768 px e 1366 px (TC-14). |

## 11. Critérios de aceitação

- **CA-01 (concessão):** Dado uma rodada do bolão encerrada e pontuada em que um participante tem a maior pontuação positiva, Quando a tarefa de medalhas é executada, Então esse participante recebe uma medalha da rodada, e a consulta mostra a rodada, o nome e os pontos.
- **CA-02 (empate):** Dado dois participantes empatados na maior pontuação positiva da rodada, Quando a tarefa é executada, Então ambos recebem a medalha.
- **CA-03 (rodada não pronta):** Dado uma rodada com uma partida ainda não encerrada, e outra com um resultado encerrado cuja pontuação ainda não está na versão atual, Quando a tarefa é executada, Então nenhuma medalha é concedida nem alterada.
- **CA-04 (sem pontos):** Dado uma rodada em que ninguém fez palpite, e outra em que todos têm 0 ponto, Quando a tarefa é executada, Então nenhuma medalha é concedida.
- **CA-05 (rodada parcial):** Dado um bolão que selecionou apenas parte das partidas de uma rodada, Quando as partidas selecionadas são encerradas e pontuadas, Então a rodada é considerada encerrada e a pontuação conta somente essas partidas.
- **CA-06 (sem efeito na competição):** Dado um bolão com e sem medalhas concedidas, Quando pontos, pontuação acumulada, classificação, desempate e elegibilidade à premiação são comparados, Então são idênticos.
- **CA-07 (correção de resultado):** Dado uma rodada com medalhas concedidas em bolão ativo e uma correção de resultado que muda o líder, Quando a tarefa é executada, Então a medalha do novo líder é concedida, a do antigo é retirada e as demais permanecem; e sem mudança de pontos nada é alterado e a data de concessão original é preservada.
- **CA-08 (bolão encerrado):** Dado um bolão encerrado com medalhas, Quando uma correção de resultado chega, Então as medalhas do bolão permanecem como estão.
- **CA-09 (elegibilidade):** Dado participantes com participação confirmada, aprovada aguardando pagamento, solicitada, rejeitada e que saiu, Quando a tarefa é executada, Então só os confirmados concorrem, inclusive o administrador; e a medalha já gravada de quem depois saiu permanece gravada e não é exibida.
- **CA-10 (unicidade):** Dado execuções repetidas e simultâneas da tarefa, Quando terminam, Então existe no máximo uma medalha por participação e rodada.
- **CA-11 (atomicidade):** Dado que a reconciliação de uma rodada falha no meio, Quando a tarefa é executada, Então as medalhas dessa rodada permanecem como antes e as demais rodadas são processadas.
- **CA-12 (consulta):** Dado um bolão com medalhas, Quando um participante confirmado as consulta, Então vê os melhores jogadores por rodada e as medalhas de cada participante, sem e-mail.
- **CA-13 (acesso):** Dado um participante confirmado, um com participação aprovada, um não membro, um que saiu e uma requisição sem sessão, Quando consultam as medalhas, Então o primeiro recebe os dados e os demais recebem 409, 404, 404 e 401.
- **CA-14 (isolamento entre bolões):** Dado dois bolões que selecionam partidas diferentes da mesma rodada oficial, Quando a tarefa é executada, Então as medalhas de cada bolão são independentes.
- **CA-15 (agendador):** Dado a tarefa registrada com intervalo configurável, Quando o backend inicia e o tempo passa, Então a tarefa executa logo após a inicialização e no intervalo, sem se sobrepor e sem que uma falha impeça a seguinte.
- **CA-16 (tempo até conceder):** Dado uma rodada que se torna elegível, Quando o tempo avança, Então a medalha é concedida em até 1 minuto.
- **CA-17 (sem chamadas externas):** Dado o provedor esportivo indisponível, Quando a tarefa é executada, Então rodadas elegíveis são processadas com os dados locais.
- **CA-18 (data de concessão):** Dado uma medalha concedida, Quando é consultada, Então a data de concessão está em UTC.
- **CA-19 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o participante vê o ranking com medalhas e a tela de medalhas por rodada, Então permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página.
- **CA-20 (formato de erros):** Dado erros 401, 404 e 409, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-001, INV-004 | Conceder a medalha ao líder de uma rodada encerrada e pontuada. |
| TC-02 | CA-02, INV-002 | Conceder a todos os empatados na maior pontuação. |
| TC-03 | CA-03, INV-001 | Executar com partida pendente e com pontuação atrasada. |
| TC-04 | CA-04, INV-002 | Executar com rodada sem palpites e com todos em 0 ponto. |
| TC-05 | CA-05 | Executar com rodada parcial do bolão. |
| TC-06 | CA-06, CA-07, INV-006, INV-007 | Corrigir o resultado, conferir a reconciliação, a data original e a ausência de efeito na competição. |
| TC-07 | CA-08, INV-008 | Corrigir resultado depois do encerramento do bolão. |
| TC-08 | CA-09, CA-14, INV-003, INV-012, INV-015 | Conferir a elegibilidade por status, a permanência da medalha de quem saiu e o isolamento entre bolões. |
| TC-09 | CA-11, INV-009 | Forçar falha na reconciliação de uma rodada. |
| TC-10 | CA-10, INV-005, INV-010 | Executar a tarefa de forma repetida e simultânea. |
| TC-11 | CA-15, CA-16, CA-17, CA-18, INV-013, INV-014 | Conferir o agendador, o tempo até conceder, o provedor indisponível e a data em UTC. |
| TC-12 | CA-12, CA-13, INV-011 | Consultar como participante, aprovada, não membro, quem saiu e sem sessão e varrer a resposta. |
| TC-13 | CA-20 | Provocar cada categoria de erro e conferir o formato comum. |
| TC-14 | CA-19 | Executar as telas em 360 px, 768 px e 1366 px. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-80 | Só há medalha se a maior pontuação da rodada é maior que zero; são elegíveis as participações confirmadas no momento do cálculo; a rodada só é processada quando está encerrada para o bolão e todos os seus resultados estão pontuados na versão atual; enquanto o bolão está ativo, as medalhas são reconciliadas a cada processamento com os pontos vigentes (concede as faltantes e retira as que deixaram de valer, preservando a data de concessão de quem continua), e depois do encerramento ficam congeladas; a medalha de quem depois saiu permanece gravada e não é exibida; no máximo uma medalha por participação e rodada. |
| OPEN-81 | Tarefa própria no agendador, executada logo após a inicialização e a cada 1 minuto, que reconcilia todas as rodadas encerradas e prontas dos bolões ativos, sem atributo técnico de controle, porque o volume é pequeno e o resultado é idempotente; a consulta de medalhas tem a mesma regra de acesso do ranking (confirmada; aprovada recebe 409; demais 404) e mostra, por rodada encerrada, nome e pontos dos melhores jogadores e, por participante, suas medalhas; a interface exibe a medalha ao lado do nome no ranking; a concessão não é auditada, só registrada tecnicamente. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-016 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-20) estiverem implementados;
- todos os invariantes (INV-001 a INV-015) estiverem preservados;
- os testes derivados (TC-01 a TC-14) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
