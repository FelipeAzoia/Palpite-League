# SPEC-015 — Ranking acumulado, desempate e consulta de desempenho

- **Status:** aprovada. As propostas OPEN-78 e OPEN-79 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001, SPEC-003, SPEC-007, SPEC-010, SPEC-012 e SPEC-014.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/` (incluindo RF42 e o modelo de domínio atualizado), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-014.
- **Escopo deste documento:** somente a SPEC-015. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-015
- **Nome:** Ranking acumulado, desempate e consulta de desempenho
- **Objetivo:** apresentar a classificação acumulada dos participantes de um bolão, aplicando o critério de desempate definido na criação, e permitir que o participante acompanhe sua colocação, sua pontuação e seu desempenho por rodada, sempre refletindo os pontos mais recentes.
- **Valor entregue:** o participante acompanha sua posição no bolão e entende por que está à frente ou atrás de quem tem os mesmos pontos.

## 2. Rastreabilidade

- **RF:** RF27 (atualização da classificação a cada pontuação) e RF42 (consulta do ranking, da pontuação acumulada e do desempenho por rodada).
- **RB:** RB38 (classificação pela pontuação acumulada no período), RB42 (desempate pelo critério da criação) e RB43 (critério imutável); RB44 e RB63 como contexto (quem sai e quem é elegível).
- **RNF:**
  - RNF03 — a classificação corresponde aos pontos e às regras vigentes; consultas mostram o mesmo estado.
  - RNF01 e RNF11 — o ranking só é visível a participantes do bolão e não expõe e-mail nem palpites alheios.
  - RNF06 e RNF07 — tempo de resposta e escala no conjunto de referência (20 usuários, 5 bolões ativos, 1.000 palpites).
  - RNF13 e RNF14 — a consulta de ranking é fluxo principal: navegadores e responsividade.
  - RNF18 — as regras de classificação e de desempate são críticas e têm testes independentes da interface.
- **Caso de uso ou fluxo:** UC05, passo 6 (atualizar o ranking de cada bolão afetado).
- **Entidades do modelo conceitual:** `Participacao` (pontuação acumulada e status), `Bolao` (critério de desempate e partidas selecionadas), `Palpite` (pontos), `Rodada`, `Partida` e `Usuario` (nome).
- **Drivers arquiteturais:** DA-01 (consistência da classificação) e DA-04 (visibilidade restrita ao bolão).
- **ADRs:** ADR-0005 (regras e autorização no backend), ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Classificação do bolão:** participações confirmadas, em ordem decrescente de pontuação acumulada, com desempate pelo critério do bolão e posições iguais quando o critério não separa (OPEN-14, OPEN-78).
2. **Atualização automática (RF27):** a classificação é calculada a partir dos pontos persistidos no momento da consulta, de modo que reflete cada pontuação ou correção assim que a SPEC-014 a grava (OPEN-78).
3. **Consulta do ranking (RF42):** posição, nome, pontuação acumulada, valor do critério de desempate e pontos por rodada de cada participante.
4. **Desempenho do próprio participante por rodada (RF42):** pontos, acertos, palpites registrados e partidas encerradas de cada rodada do bolão (OPEN-79).
5. **Pontuação por rodada** como função reutilizável: soma dos pontos dos palpites nas partidas selecionadas da rodada, com o indicador de rodada encerrada para o bolão (OPEN-20), usada também pelas medalhas (SPEC-016).
6. **Função de classificação reutilizável** pelo encerramento do bolão (SPEC-025), com o mesmo resultado da consulta.
7. **Interface:** tela de ranking do bolão, com destaque para a linha do participante e detalhe por rodada.

### Fora do escopo

- Cálculo dos pontos e da pontuação acumulada (SPEC-014).
- Medalhas e melhor jogador da rodada (SPEC-016).
- Encerramento do bolão, vencedores e premiação (SPEC-025 e SPEC-026).
- Palpites e pontos por partida de outros participantes (SPEC-028).
- Saída do bolão e seus efeitos sobre palpites futuros (SPEC-017); esta Spec só aplica o resultado: quem saiu não entra na classificação.
- Notificações de mudança de posição (SPEC-027).

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência, correlação, testes), SPEC-003 (autenticação e formato de erros), SPEC-007 (bolão, critério de desempate e partidas), SPEC-010 (participação confirmada), SPEC-012 (palpites) e SPEC-014 (pontos e pontuação acumulada).
- **Decisões arquiteturais:** ADR-0005 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- O participante está autenticado e tem participação confirmada no bolão.
- O bolão está ativo ou encerrado.

### Fluxo principal — consultar o ranking

1. O participante pede o ranking do bolão.
2. O sistema reúne as participações confirmadas, lê a pontuação acumulada de cada uma e calcula, por participante, o valor do critério de desempate do bolão e os pontos por rodada.
3. O sistema ordena por pontuação acumulada decrescente, desempata pelo critério e atribui as posições, dando posição igual aos que permanecem empatados.
4. O sistema devolve a classificação, os pontos por rodada, as rodadas do bolão com o indicador de encerrada, o critério de desempate e a identificação da linha do solicitante.

### Fluxo principal — consultar o próprio desempenho por rodada

1. O participante pede seu desempenho no bolão.
2. O sistema devolve, para cada rodada do bolão, os pontos dele, quantos palpites acertaram, quantos palpites ele registrou, quantas partidas da rodada estão encerradas e o total de partidas selecionadas, e se a rodada está encerrada.

### Fluxos alternativos

- **A1 — Pontuação ou correção processada pela SPEC-014:** a consulta seguinte já mostra a nova classificação, sem etapa manual.
- **A2 — Bolão sem pontos:** todos aparecem com 0 ponto e na mesma posição.
- **A3 — Bolão encerrado:** a classificação final continua consultável.
- **A4 — Participante que saiu:** não aparece na classificação.

### Fluxos de exceção

- **E1 — Sessão ausente, inválida, expirada ou encerrada:** 401.
- **E2 — Participação aprovada aguardando pagamento:** 409 do tipo participação não confirmada.
- **E3 — Quem não é membro, tem participação solicitada, rejeitada ou que saiu, ou bolão inexistente:** 404, sem dados.
- **E4 — Falha de leitura:** 500 sem detalhes internos.

### Pós-condições

- Nenhum dado é alterado; a consulta é somente leitura.
- A classificação apresentada corresponde aos pontos persistidos no instante da consulta.

## 6. Regras e invariantes

- **INV-001:** a classificação do bolão é determinada pela pontuação acumulada das participações confirmadas, em ordem decrescente (RB38, RF27).
- **INV-002:** só participações confirmadas entram na classificação; participações aprovadas aguardando pagamento, solicitadas, rejeitadas ou que saíram não entram (OPEN-21).
- **INV-003:** os participantes empatados em pontos são desempatados pelo critério definido na criação do bolão, que não pode ser alterado: mais placares exatos (palpites com 5 pontos), mais resultados corretos (palpites com 2 ou 5 pontos) ou maior pontuação na última rodada do bolão (RB42, RB43, OPEN-14, OPEN-78).
- **INV-004:** quando o critério não separa os empatados, eles recebem a mesma posição e a posição seguinte salta o número de empatados (por exemplo, 1, 1, 3) (OPEN-14, OPEN-78).
- **INV-005:** a classificação é derivada dos pontos persistidos no momento da consulta; não existe classificação gravada que possa divergir dos pontos (RNF03, RF27, OPEN-78).
- **INV-006:** a pontuação acumulada exibida é a da SPEC-014 e coincide com a soma dos pontos dos palpites do participante (RNF03).
- **INV-007:** a pontuação de um participante em uma rodada é a soma dos pontos de seus palpites nas partidas selecionadas pelo bolão naquela rodada; a rodada do bolão é a rodada oficial com ao menos uma partida selecionada (OPEN-20).
- **INV-008:** uma rodada está encerrada para o bolão quando todas as suas partidas selecionadas estão encerradas ou não computáveis (OPEN-20, OPEN-02).
- **INV-009:** a "última rodada do bolão" é a de maior número entre as rodadas do bolão, e o valor do desempate por ela usa os pontos obtidos até o momento, mesmo que a rodada esteja incompleta (OPEN-78).
- **INV-010:** o ranking só é visível a participantes confirmados do próprio bolão; a participação aprovada recebe 409, as demais situações e bolão inexistente recebem 404 e sem sessão recebe 401 (RNF01, RNF11, OPEN-18).
- **INV-011:** o ranking nunca expõe e-mail, palpites ou pontos de partidas individuais de outros participantes; mostra apenas posição, nome, pontuação acumulada, valor do desempate e pontos por rodada (OPEN-18, OPEN-78).
- **INV-012:** a ordem de exibição entre participantes com a mesma posição é determinística: por nome e, persistindo o empate, por identificador (OPEN-78).
- **INV-013:** esta Spec é somente leitura: não altera pontos, palpites, participações nem regras do bolão.
- **INV-014:** a função de classificação e a de pontuação por rodada produzem o mesmo resultado para a consulta, para o encerramento do bolão e para as medalhas.
- **INV-015:** a autorização e as regras são aplicadas no backend (ADR-0005).

## 7. Modelo de domínio envolvido

- **Participacao:** status (somente confirmadas) e pontuação acumulada, somente leitura.
- **Bolao:** critério de desempate, partidas selecionadas e status, somente leitura.
- **Palpite:** pontos ganhos, somente leitura, para os valores de desempate e os pontos por rodada.
- **Rodada e Partida:** número da rodada, status das partidas selecionadas, somente leitura.
- **Usuario:** nome, somente leitura.
- **Restrições:** posições iguais para empates não resolvidos; nenhum dado novo é persistido por esta Spec.

Nenhum modelo físico é definido aqui.

## 8. Impacto arquitetural

- **Módulos envolvidos:** "palpites e pontuação" (principal), "bolões e participações" e "partidas e resultados" (leitura).
- **Fronteiras:**
  - O backend calcula a classificação e autoriza; a interface apresenta.
  - A função de classificação é interna e compartilhada com a SPEC-016 e a SPEC-025.
- **Integrações necessárias:** nenhuma.
- **Frontend:** tela de ranking com tabela (posição, nome, pontos e o valor do desempate do bolão), destaque da linha do participante, detalhe por rodada em cada linha e seção de desempenho próprio; utilizável em 360 px, 768 px e 1366 px.
- **Backend:** cálculo da classificação e das pontuações por rodada a partir dos pontos persistidos, consulta do ranking e do desempenho próprio.
- **ADRs que restringem a solução:** ADR-0001, ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003.

- **Consultar ranking do bolão**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: critério de desempate do bolão; rodadas do bolão com número e indicador de encerrada; lista de participantes com posição, nome, pontuação acumulada, valor do critério de desempate, pontos por rodada e indicação de que a linha é a do solicitante.
  - Erros: 401; 404; 409 (participação não confirmada); 500.
- **Consultar meu desempenho por rodada**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: por rodada, pontos, quantidade de palpites com acerto, palpites registrados, partidas encerradas, total de partidas selecionadas e indicador de rodada encerrada.
  - Erros: 401; 404; 409.
- **Classificação do bolão (interna)**
  - Entrada: bolão.
  - Saída: participantes ordenados com posições, pontuação acumulada, valor do desempate e pontos por rodada.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF03 | Recalcular a classificação de modo independente a partir dos palpites e comparar com a consulta, antes e depois de pontuações e correções (TC-08, TC-09). |
| RNF01 e RNF11 | Consultar como participante, aprovada, não membro, quem saiu e sem sessão, e varrer a resposta em busca de e-mail e palpites alheios (TC-12). |
| RNF06 e RNF07 | Medir a consulta no conjunto de referência, após confirmação da equipe (TC-17). |
| RNF13 e RNF14 | Roteiros nos navegadores do RNF13 e em 360 px, 768 px e 1366 px (TC-15, TC-16). |
| RNF18 | Testes automatizados das regras de ordenação e desempate, sem interface e sem credenciais externas (TC-01 a TC-07). |

## 11. Critérios de aceitação

- **CA-01 (ordenação por pontos):** Dado participantes com 12, 9 e 15 pontos acumulados, Quando o ranking é consultado, Então a ordem é 15, 12 e 9, com posições 1, 2 e 3.
- **CA-02 (desempate por placares exatos):** Dado um bolão com esse critério e dois participantes com a mesma pontuação, Quando o ranking é consultado, Então fica à frente quem tem mais palpites de 5 pontos.
- **CA-03 (desempate por resultados corretos):** Dado um bolão com esse critério e dois participantes com a mesma pontuação, Quando o ranking é consultado, Então fica à frente quem tem mais palpites de 2 ou 5 pontos.
- **CA-04 (desempate pela última rodada):** Dado um bolão com esse critério e dois participantes com a mesma pontuação, Quando o ranking é consultado, Então fica à frente quem fez mais pontos na última rodada do bolão, inclusive quando essa rodada ainda está incompleta.
- **CA-05 (empate não resolvido):** Dado três participantes com a mesma pontuação e o mesmo valor de desempate, e um quarto com menos pontos, Quando o ranking é consultado, Então os três têm a mesma posição e o quarto tem a posição 4.
- **CA-06 (quem entra):** Dado um bolão com participações confirmadas, aprovada aguardando pagamento, solicitada, rejeitada e que saiu, Quando o ranking é consultado, Então aparecem apenas as confirmadas, inclusive o administrador.
- **CA-07 (atualização automática):** Dado um ranking consultado, Quando a SPEC-014 pontua uma partida nova ou corrige um resultado e o ranking é consultado de novo, Então a nova classificação já está refletida, sem nenhuma etapa manual.
- **CA-08 (consistência):** Dado qualquer estado dos palpites, Quando a classificação consultada é comparada com um cálculo independente a partir dos pontos dos palpites, Então coincidem, e a pontuação acumulada de cada participante é a soma de seus pontos.
- **CA-09 (desempenho por rodada):** Dado um bolão que selecionou partidas parciais de duas rodadas, Quando o participante consulta seu desempenho, Então os pontos, acertos, palpites registrados, partidas encerradas e total de cada rodada consideram somente as partidas selecionadas e o indicador de rodada encerrada está correto.
- **CA-10 (critério imutável por bolão):** Dado dois bolões com critérios de desempate diferentes e os mesmos participantes e pontos, Quando os rankings são consultados, Então cada um aplica o critério do seu bolão, sem alteração ao longo do tempo.
- **CA-11 (acesso):** Dado um participante confirmado, um com participação aprovada, um não membro, um que saiu e uma requisição sem sessão, Quando consultam o ranking, Então o primeiro recebe os dados e os demais recebem 409, 404, 404 e 401.
- **CA-12 (sem dados indevidos):** Dado a resposta do ranking, Quando é examinada, Então não contém e-mail, palpites nem pontos de partidas individuais de outros participantes.
- **CA-13 (bolão sem pontos):** Dado um bolão em que nenhuma partida foi pontuada, Quando o ranking é consultado, Então todos aparecem com 0 ponto e na posição 1.
- **CA-14 (bolão encerrado):** Dado um bolão encerrado, Quando um participante consulta o ranking, Então recebe a classificação final com os pontos persistidos.
- **CA-15 (reutilização):** Dado a função interna de classificação, Quando consumidores internos de teste a usam, Então obtêm o mesmo resultado da consulta.
- **CA-16 (ordem estável):** Dado participantes com a mesma posição, Quando o ranking é consultado várias vezes, Então a ordem de exibição entre eles é sempre a mesma.
- **CA-17 (linha do solicitante):** Dado o ranking, Quando é consultado por um participante, Então a linha dele está identificada.
- **CA-18 (formato de erros):** Dado erros 401, 404, 409 e 500, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.
- **CA-19 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o participante consulta o ranking e o detalhe por rodada, Então as telas permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página.
- **CA-20 (navegadores):** Dado os navegadores e sistemas do RNF13, Quando o roteiro de consulta do ranking é executado, Então funciona sem erro que bloqueie o fluxo.
- **CA-21 (desempenho e escala):** Dado o conjunto de referência de 20 usuários, 5 bolões ativos e 1.000 palpites, Quando 5 usuários consultam o ranking simultaneamente, Então pelo menos 95% respondem em até 3 segundos.
- **CA-22 (somente leitura):** Dado qualquer consulta desta Spec, Quando pontos, palpites, participações e regras são comparados antes e depois, Então permanecem iguais.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-001 | Ordenar participantes por pontos e conferir posições. |
| TC-02 | CA-02, INV-003 | Desempatar por placares exatos. |
| TC-03 | CA-03, INV-003 | Desempatar por resultados corretos, contando também os exatos. |
| TC-04 | CA-04, INV-009 | Desempatar pela última rodada, com rodada completa e incompleta. |
| TC-05 | CA-05, INV-004 | Montar empate não resolvido entre três participantes e conferir as posições 1, 1, 1 e 4. |
| TC-06 | CA-06, INV-002 | Conferir quem entra na classificação em cada status de participação. |
| TC-07 | CA-10, INV-003 | Comparar dois bolões com critérios diferentes e os mesmos pontos. |
| TC-08 | CA-07, INV-005 | Pontuar uma partida nova e corrigir um resultado e consultar o ranking em seguida. |
| TC-09 | CA-08, CA-22, INV-006, INV-013 | Recalcular a classificação de forma independente, comparar e conferir que nada foi alterado. |
| TC-10 | CA-09, INV-007, INV-008 | Consultar o desempenho por rodada com partidas selecionadas parcialmente. |
| TC-11 | CA-13, CA-14 | Consultar bolão sem pontos e bolão encerrado. |
| TC-12 | CA-11, CA-12, INV-010, INV-011 | Consultar como participante, aprovada, não membro, quem saiu e sem sessão e varrer a resposta. |
| TC-13 | CA-15, CA-16, CA-17, INV-012, INV-014 | Usar a função interna, repetir a consulta com empates e conferir a linha do solicitante. |
| TC-14 | CA-18 | Provocar cada categoria de erro e conferir o formato comum. |
| TC-15 | CA-19 | Executar as telas em 360 px, 768 px e 1366 px. |
| TC-16 | CA-20 | Roteiro manual nos navegadores do RNF13. |
| TC-17 | CA-21 | Teste de carga com o conjunto de referência (sujeito à confirmação da equipe). |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-78 | A classificação é calculada na hora da consulta a partir dos pontos persistidos, sem ranking gravado, o que atende o RF27 e evita divergência; só participações confirmadas entram; "mais placares exatos" conta palpites com 5 pontos, "mais resultados corretos" conta palpites com 2 ou 5 pontos (só pelos pontos, sem reinterpretar palpites de placar com resultado certo e placar errado) e "última rodada" soma os pontos da rodada de maior número entre as rodadas do bolão, com os pontos obtidos até o momento; empate residual dá posições iguais com salto (1, 1, 3); a ordem de exibição entre empatados é por nome e depois por identificador; a resposta mostra posição, nome, total, valor do desempate e pontos por rodada, nunca e-mail nem palpites; a consulta vale também para bolão encerrado. |
| OPEN-79 | O desempenho próprio traz, por rodada do bolão, pontos, quantidade de palpites com acerto (2 ou 5 pontos), palpites registrados, partidas encerradas, total de partidas selecionadas e indicador de rodada encerrada; o ranking traz os pontos por rodada de todos, que a interface mostra no detalhe de cada linha; o acesso é de participação confirmada, com 409 para a aprovada e 404 para as demais situações. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-015 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-22) estiverem implementados;
- todos os invariantes (INV-001 a INV-015) estiverem preservados;
- os testes derivados (TC-01 a TC-17) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com os roteiros de navegadores e de larguras de tela (RNF13 e RNF14) e o teste de carga (RNF06 e RNF07) executados somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
