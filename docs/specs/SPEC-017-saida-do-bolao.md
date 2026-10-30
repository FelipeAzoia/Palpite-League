# SPEC-017 — Saída voluntária do bolão

- **Status:** aprovada. As propostas OPEN-82 e OPEN-83 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003, SPEC-007, SPEC-010, SPEC-012 e SPEC-014 a SPEC-016.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/` (incluindo `matriz-de-permissoes.md`), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-016.
- **Escopo deste documento:** somente a SPEC-017. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-017
- **Nome:** Saída voluntária do bolão
- **Objetivo:** permitir que um participante confirmado veja as consequências de sair do bolão, confirme a saída e tenha sua participação encerrada nas atividades futuras, sem devolução automática de valores e sem que a administração possa removê-lo.
- **Valor entregue:** o participante controla sua permanência com consequências explícitas, e o bolão trata corretamente seus palpites, pontos, classificação, medalhas e elegibilidade depois da saída.

## 2. Rastreabilidade

- **RF:** RF32 (solicitação de saída do bolão).
- **RB:** RB44 (saída voluntária a qualquer momento), RB45 (sem devolução automática), RB48 (sem remoção unilateral) e RB46 (devolução só por solicitação formal, tratada na SPEC-023); RB63 como consequência (quem saiu não é elegível à premiação).
- **RNF:**
  - RNF02 — a saída, a remoção dos palpites futuros e o registro de auditoria formam uma unidade atômica.
  - RNF04 e RNF16 — a saída do bolão é operação auditável (SPEC-002).
  - RNF12 — a autorização e as regras de saída são aplicadas no backend.
  - RNF18 — as regras críticas têm testes independentes da interface.
  - RNF01 e RNF11 — o participante só sai por si; quem saiu perde o acesso de membro.
  - RNF03 — pontos e pontuação acumulada permanecem consistentes com os palpites que restam.
  - RNF14 — por extensão: tela utilizável em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC06, fluxo principal de saída e exceção A1 (saída não confirmada); o fluxo de devolução pertence às SPEC-023 e SPEC-024.
- **Entidades do modelo conceitual:** `Participacao`, `Palpite`, `Partida`, `Bolao` e `RegistroAuditoria`.
- **Drivers arquiteturais:** DA-01 (integridade da saída e de seus efeitos) e DA-04 (autorização por papel e por vínculo).
- **ADRs:** ADR-0005 (regras e autorização no backend), ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Consequências da saída (UC06, passo 2):** informar, antes da confirmação, o que acontece: palpites de partidas que ainda não começaram serão desconsiderados, pontos já obtidos permanecem registrados, a classificação e a premiação deixam de incluir o participante e a saída não gera devolução automática.
2. **Confirmação e registro da saída (RF32, UC06 passos 3 e 4):** a participação passa a "saiu", com confirmação explícita do usuário.
3. **Efeitos nas atividades futuras:** remoção dos palpites de partidas que ainda não começaram; manutenção dos palpites de partidas já iniciadas e de seus pontos; fim do acesso de membro (OPEN-21, OPEN-82).
4. **Restrições:** o administrador não sai enquanto o bolão está ativo; bolão encerrado não aceita saída; só participação confirmada sai (OPEN-82).
5. **Vedação de remoção unilateral (RB48):** nenhuma operação permite que outro usuário retire um participante.
6. **Auditoria (SPEC-002):** registro da saída, com o status anterior e a quantidade de palpites desconsiderados.
7. **Interface:** ação "Sair do bolão" com a tela de consequências e a confirmação, visível a participantes e coadministradores.

### Fora do escopo

- Solicitação, decisão e processamento de devolução (SPEC-023 e SPEC-024); a saída não cria nenhuma movimentação financeira.
- Elegibilidade à premiação e encerramento do bolão (SPEC-025 e SPEC-026), que leem o status "saiu" como inelegível.
- Pagamento da taxa e confirmação financeira (SPEC-022); a SPEC-022 deve tratar a participação que saiu como não confirmável.
- Nova entrada de quem saiu, que a baseline não prevê (SPEC-009, OPEN-66).
- Cancelamento de participação aprovada aguardando pagamento, que a baseline não prevê.
- Notificação de saída.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, correlação), SPEC-002 (auditoria), SPEC-003 (autenticação e formato de erros), SPEC-007 (bolão, papéis e status), SPEC-010 (participação confirmada), SPEC-012 (palpites), SPEC-014 (pontos), SPEC-015 (classificação) e SPEC-016 (medalhas), cujos efeitos são verificados na integração.
- **Decisões arquiteturais:** ADR-0005 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- O solicitante está autenticado e tem participação confirmada no bolão, com papel de participante ou de coadministrador.
- O bolão está ativo.

### Fluxo principal

1. O participante solicita a saída do bolão.
2. O sistema apresenta as consequências: quantos e quais palpites de partidas ainda não iniciadas serão desconsiderados, que os pontos já obtidos permanecem registrados, que ele deixará a classificação e a premiação e que a saída não gera devolução automática.
3. O participante confirma explicitamente a saída.
4. Em uma transação, o sistema revalida as condições, grava a participação como "saiu", remove os palpites de partidas que ainda não começaram, mantém os palpites de partidas já iniciadas e grava o registro de auditoria de sucesso.
5. O sistema informa que a saída foi registrada e que qualquer devolução depende de solicitação formal ao administrador ou coadministrador.

### Fluxos alternativos

- **A1 — Saída não confirmada** (UC06 A1): nenhuma alteração; a participação permanece confirmada.
- **A2 — Coadministrador que sai:** perde o acesso e as permissões administrativas, pois deixa de ser membro.
- **A3 — Participante sem palpites futuros:** a saída apenas encerra a participação.

### Fluxos de exceção

- **E1 — Sessão ausente, inválida, expirada ou encerrada:** 401.
- **E2 — Quem não é membro, tem participação solicitada, rejeitada ou que já saiu, ou bolão inexistente:** 404, sem dados.
- **E3 — Participação aprovada aguardando pagamento:** 409 do tipo participação não confirmada, nada alterado.
- **E4 — Administrador do bolão ativo:** 409 do tipo administrador não pode sair, nada alterado.
- **E5 — Bolão encerrado:** 409, nada alterado.
- **E6 — Confirmação ausente:** erro de validação (400), nada alterado.
- **E7 — Falha ao gravar a saída, a remoção dos palpites ou o registro de auditoria:** nada é persistido (500, sem detalhes internos).

### Pós-condições

- A participação tem status saiu e não participa de nenhuma atividade futura do bolão.
- Os palpites de partidas que ainda não começaram deixaram de existir; os de partidas já iniciadas e seus pontos permanecem.
- Nenhuma movimentação financeira foi criada.

## 6. Regras e invariantes

- **INV-001:** só o participante e o coadministrador, com participação confirmada, saem do bolão; o administrador não sai enquanto o bolão está ativo (409) (RB44, OPEN-21, matriz de permissões).
- **INV-002:** a saída exige confirmação explícita do usuário, verificada no backend; sem ela nada muda (UC06 passo 3 e A1).
- **INV-003:** a saída é voluntária e individual: nenhuma operação permite que outro usuário, inclusive administrador ou coadministrador, retire um participante (RB48).
- **INV-004:** bolão encerrado não aceita saída (409) (OPEN-21).
- **INV-005:** a saída, a remoção dos palpites de partidas que ainda não começaram e o registro de auditoria são atômicos; partidas que ainda não começaram são as sem data e hora ou com início posterior ao instante da saída, pelo relógio do servidor em UTC (RNF02, OPEN-82).
- **INV-006:** palpites de partidas já iniciadas, seus pontos e a pontuação acumulada correspondente permanecem registrados; a pontuação acumulada continua sendo a soma dos pontos dos palpites que restam (RNF03).
- **INV-007:** quem saiu deixa de aparecer na classificação e na lista de participantes e recebe 404 nas consultas de membro (RB44, SPEC-007, SPEC-011, SPEC-015).
- **INV-008:** quem saiu não palpita, não recebe novas medalhas e não é elegível à premiação; suas medalhas já gravadas permanecem ocultas (RB63, SPEC-012, SPEC-016).
- **INV-009:** quem saiu não solicita entrada de novo no mesmo bolão (SPEC-009).
- **INV-010:** a saída não gera devolução automática nem qualquer movimentação financeira (RB45).
- **INV-011:** a saída não altera as regras do bolão nem as participações, os palpites e os pontos de outros participantes.
- **INV-012:** saídas simultâneas do mesmo participante são efetivadas uma única vez; as demais recebem 404 (ADR-0005).
- **INV-013:** um palpite e uma saída simultâneos nunca deixam um palpite de partida não iniciada para quem saiu (INV-005, SPEC-012).
- **INV-014:** autorização, estado e confirmação são verificados no backend; a interface não é autoridade (ADR-0005).
- **INV-015:** a auditoria da saída traz o status anterior e a quantidade de palpites desconsiderados, sem dados sensíveis (SPEC-002).

## 7. Modelo de domínio envolvido

- **Participacao:** status de confirmada para saiu; pontuação acumulada permanece; relacionada ao `Usuario` e ao `Bolao`.
- **Palpite:** os de partidas que ainda não começaram são removidos; os demais permanecem com seus pontos.
- **Partida e Bolao:** status e horário das partidas e status do bolão, somente leitura.
- **RegistroAuditoria:** um registro por saída, com o status anterior e a quantidade de palpites desconsiderados nos detalhes.
- **Restrições:** transição apenas de confirmada para saiu; sem retorno.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "bolões e participações" (principal), "palpites e pontuação" (remoção dos palpites futuros), "partidas e resultados" (leitura) e "notificações e auditoria".
- **Fronteiras:**
  - O backend decide quem pode sair, o que é "partida que ainda não começou" e executa a remoção em uma única transação.
  - As classificações, medalhas e a elegibilidade leem o status "saiu"; esta Spec não as altera diretamente.
- **Integrações necessárias:** nenhuma.
- **Frontend:** ação de sair, tela de consequências com a lista dos palpites a descartar, confirmação explícita e mensagem final; a ação não aparece para o administrador, com explicação; utilizável em 360 px, 768 px e 1366 px.
- **Backend:** pré-visualização das consequências, saída atômica, autorização e auditoria.
- **ADRs que restringem a solução:** ADR-0001, ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003, com tipos de erro estáveis nos casos de 409.

- **Consultar as consequências da saída**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: palpites de partidas que ainda não começaram que serão desconsiderados (quantidade e partidas), indicação de que os pontos obtidos permanecem, de que o participante deixará a classificação e a premiação e de que não há devolução automática.
  - Erros: 401; 404; 409 (participação não confirmada, administrador não pode sair, bolão encerrado).
- **Confirmar a saída**
  - Entrada: identificador do bolão e confirmação explícita.
  - Saída: confirmação da saída, com o aviso de que devolução depende de solicitação formal.
  - Erros: 401; 400 (confirmação ausente); 404; 409 (os mesmos tipos); 500.
- **Detalhes do registro de auditoria:** status anterior da participação e quantidade de palpites desconsiderados.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF02 | Falhar a remoção dos palpites e a auditoria e conferir que a participação e os palpites permanecem (TC-09). |
| RNF04 e RNF16 | Conferir o registro de auditoria da saída (TC-12). |
| RNF12 e RNF18 | Testes automatizados de autorização e de regras da saída, inclusive com requisições diretas (TC-02 a TC-08, TC-13). |
| RNF01 e RNF11 | Conferir que ninguém retira outro participante e que quem saiu recebe 404 nas consultas de membro (TC-07, TC-10). |
| RNF03 | Conferir que pontos e pontuação acumulada continuam coerentes após a saída (TC-04). |
| RNF14 (por extensão) | Roteiro das telas em 360 px, 768 px e 1366 px (TC-15). |

## 11. Critérios de aceitação

- **CA-01 (consequências):** Dado um participante confirmado com palpites em partidas iniciadas e não iniciadas, Quando ele consulta as consequências da saída, Então vê quantos e quais palpites de partidas não iniciadas serão desconsiderados e os avisos de pontos preservados, de saída da classificação e da premiação e de ausência de devolução automática.
- **CA-02 (saída do participante):** Dado um participante confirmado, Quando ele confirma a saída, Então a participação passa a saiu, existe um registro de auditoria de sucesso com o status anterior e a quantidade de palpites desconsiderados e ele recebe a informação de que devolução depende de solicitação formal.
- **CA-03 (saída do coadministrador):** Dado um coadministrador, Quando ele confirma a saída, Então a participação passa a saiu e ele perde as permissões administrativas, recebendo 404 ao tentar criar convites.
- **CA-04 (administrador):** Dado o administrador de um bolão ativo, Quando ele consulta as consequências ou tenta confirmar a saída, Então recebe 409 do tipo administrador não pode sair e nada muda.
- **CA-05 (sem confirmação):** Dado uma solicitação de saída sem confirmação explícita, Quando ela é enviada, Então é rejeitada (400) e a participação permanece confirmada.
- **CA-06 (efeito nos palpites):** Dado um participante com palpites em partidas já iniciadas, em partidas futuras e em uma partida adiada sem data, Quando ele sai, Então os palpites das partidas futuras e da adiada sem data deixam de existir e os das partidas iniciadas permanecem com seus pontos.
- **CA-07 (pontos preservados):** Dado a saída de um participante com pontos, Quando a pontuação acumulada é conferida, Então é a soma dos pontos dos palpites que restam e os pontos das partidas iniciadas não mudaram.
- **CA-08 (classificação e medalhas):** Dado a saída de um participante, Quando o ranking, a lista de participantes e as medalhas são consultados, Então ele não aparece, os outros participantes são reposicionados, nenhuma nova medalha lhe é concedida e as já gravadas não são exibidas.
- **CA-09 (acesso e elegibilidade):** Dado um participante que saiu, Quando ele consulta regras, ranking ou palpites, ou tenta palpitar, Então recebe 404; e o status saiu é lido como não elegível à premiação.
- **CA-10 (sem retorno):** Dado um participante que saiu, Quando ele tenta solicitar entrada de novo com um convite, Então recebe 409.
- **CA-11 (estados não aplicáveis):** Dado bolão encerrado, participação aprovada aguardando pagamento, solicitada, rejeitada, que já saiu, não membro e requisição sem sessão, Quando tentam sair, Então recebem 409, 409, 404, 404, 404, 404 e 401, respectivamente.
- **CA-12 (sem remoção unilateral):** Dado todas as operações expostas, Quando se procura uma que retire um participante por iniciativa de outro usuário, Então nenhuma existe.
- **CA-13 (sem efeito financeiro):** Dado uma saída concluída, Quando se examinam as movimentações financeiras, Então nenhuma foi criada pela saída.
- **CA-14 (atomicidade):** Dado que a remoção dos palpites ou o registro de auditoria falha, Quando a saída é confirmada, Então a participação continua confirmada e todos os palpites permanecem.
- **CA-15 (saídas simultâneas):** Dado um participante, Quando duas confirmações de saída simultâneas são enviadas, Então apenas uma é efetivada e a outra recebe 404.
- **CA-16 (saída e palpite simultâneos):** Dado um participante, Quando uma saída e um palpite em partida futura são processados simultaneamente, Então, se a saída foi efetivada, não existe palpite de partida futura para a participação.
- **CA-17 (outros não afetados):** Dado a saída de um participante, Quando as regras do bolão e as participações, palpites e pontos dos outros são comparados antes e depois, Então permanecem iguais, exceto as posições relativas na classificação.
- **CA-18 (formato de erros):** Dado erros 400, 401, 404, 409 e 500, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.
- **CA-19 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o participante vê as consequências e confirma, Então as telas permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página, e a ação não aparece para o administrador, com explicação.
- **CA-20 (autorização no backend):** Dado requisições enviadas diretamente ao backend, sem a interface, Quando tentam sair sem permissão, sem confirmação ou em bolão encerrado, Então são rejeitadas como pela interface.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01 | Consultar as consequências com palpites iniciados, futuros e de partida adiada sem data. |
| TC-02 | CA-02, INV-015 | Confirmar a saída de participante e conferir status, auditoria e mensagem. |
| TC-03 | CA-03 | Confirmar a saída de coadministrador e tentar exercer permissões depois. |
| TC-04 | CA-06, CA-07, INV-005, INV-006 | Conferir os palpites removidos e mantidos e a pontuação acumulada. |
| TC-05 | CA-04, INV-001 | Consultar e tentar sair como administrador. |
| TC-06 | CA-05, CA-11, INV-002, INV-004 | Enviar sem confirmação e tentar sair em cada estado não aplicável. |
| TC-07 | CA-12, INV-003 | Examinar as operações expostas em busca de remoção por iniciativa de outro usuário. |
| TC-08 | CA-08, CA-09, INV-007, INV-008 | Conferir ranking, lista de participantes, medalhas, acesso e elegibilidade depois da saída. |
| TC-09 | CA-14 | Forçar falha na remoção dos palpites e na auditoria. |
| TC-10 | CA-10, INV-009 | Tentar nova solicitação de entrada de quem saiu. |
| TC-11 | CA-13, INV-010 | Examinar as movimentações financeiras após a saída. |
| TC-12 | CA-17, INV-011 | Comparar regras, participações, palpites e pontos dos outros antes e depois. |
| TC-13 | CA-20, INV-014 | Enviar requisições diretas sem permissão, sem confirmação e em bolão encerrado. |
| TC-14 | CA-15, CA-16, INV-012, INV-013 | Enviar saídas simultâneas e saída com palpite simultâneo. |
| TC-15 | CA-19 | Executar as telas em 360 px, 768 px e 1366 px. |
| TC-16 | CA-18 | Provocar cada categoria de erro e conferir o formato comum. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-82 | Só participação confirmada sai, conforme a pré-condição do UC06, e a participação aprovada aguardando pagamento recebe 409, pois a baseline não prevê cancelar entrada não paga, o que também evita uma saída concorrente com um pagamento em andamento; os palpites desconsiderados são removidos, e consideram-se partidas que ainda não começaram as sem data e hora ou com início posterior ao instante da saída; a confirmação é um passo explícito, com uma consulta prévia das consequências; a saída é irreversível nesta versão; a SPEC-022 deverá tratar a confirmação de pagamento de uma participação que saiu como não confirmável. |
| OPEN-83 | A mensagem final é um texto fixo da plataforma informando que não há devolução automática e que qualquer devolução depende de solicitação formal ao administrador ou coadministrador; o registro de auditoria traz o status anterior e a quantidade de palpites desconsiderados; os 409 distinguem por tipo estável: participação não confirmada, administrador não pode sair e bolão encerrado; saídas repetidas ou simultâneas depois da primeira recebem 404, pois quem saiu deixa de ser membro. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-017 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-20) estiverem implementados;
- todos os invariantes (INV-001 a INV-015) estiverem preservados;
- os testes derivados (TC-01 a TC-16) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
