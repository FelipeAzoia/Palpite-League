# SPEC-014 — Cálculo automático da pontuação

- **Status:** aprovada. As propostas OPEN-76 e OPEN-77 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001, SPEC-003, SPEC-007, SPEC-012 e SPEC-013.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/`, `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-013.
- **Escopo deste documento:** somente a SPEC-014. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-014
- **Nome:** Cálculo automático da pontuação
- **Objetivo:** comparar o resultado oficial de cada partida encerrada com os palpites registrados e calcular automaticamente os pontos de cada palpite (2 por resultado certo, 5 por placar exato e 0 por erro), de forma repetível, sem duplicar pontuação, inclusive quando o provedor corrige um resultado.
- **Valor entregue:** o participante não precisa calcular pontos manualmente e passa a ver quanto cada palpite valeu; a pontuação acumulada fica consistente com os resultados oficiais, base do ranking (SPEC-015).

## 2. Rastreabilidade

- **RF:** RF26 (cálculo da pontuação).
- **RB:** RB33 (pontuação automática), RB34 e RB35 (palpite de resultado), RB36 e RB37 (palpite de placar exato).
- **RNF:**
  - RNF02 — o processamento de cada partida (pontos, pontuação acumulada e marca de versão) é atômico.
  - RNF03 — pontuação e ranking correspondem aos resultados oficiais e às regras vigentes, e as consultas mostram o mesmo estado.
  - RNF17 — o recálculo após resultado atualizado não corrompe outros resultados ou palpites e pode ser repetido sem duplicar pontuação.
  - RNF18 — a regra de pontuação é crítica e tem testes independentes da interface e de serviços externos.
  - RNF01 e RNF11 — o participante só vê os próprios pontos.
  - RNF06 e RNF07 — o processamento não degrada as consultas no perfil de carga acadêmico.
  - RNF14 — por extensão: tela de pontos utilizável em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC05, passos 4 e 5; o passo 6 (ranking) é da SPEC-015.
- **Entidades do modelo conceitual:** `Palpite` (pontos ganhos), `Partida` (placar oficial), `Participacao` (pontuação acumulada) e `Bolao` (status).
- **Drivers arquiteturais:** DA-01 (integridade e repetibilidade da pontuação) e DA-02 (consumo do resultado vindo da integração, sem chamá-la).
- **ADRs:** ADR-0005 (regras no backend), ADR-0006 (agendador), ADR-0002, ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Regra de pontuação:** função que, dados um palpite e o placar oficial da partida, devolve 2, 5 ou 0 pontos conforme a modalidade.
2. **Tarefa de pontuação** no agendador: lê as partidas encerradas cuja versão do resultado é maior que a já pontuada (SPEC-013), calcula os pontos dos palpites e atualiza as pontuações acumuladas (OPEN-76).
3. **Recálculo por correção:** quando a versão do resultado de uma partida cresce, os pontos são recalculados como valores atribuídos, nunca somados de novo.
4. **Pontuação acumulada da participação:** soma dos pontos de seus palpites, recalculada na mesma transação (OPEN-76); a classificação é da SPEC-015.
5. **Escopo dos palpites:** apenas os de bolões ativos; os de bolões encerrados permanecem como estão (OPEN-04).
6. **Consulta dos próprios pontos** por partida encerrada do bolão (OPEN-77).
7. **Interface:** seção de pontos na tela do bolão, com palpite, placar oficial e pontos de cada partida encerrada.

### Fora do escopo

- Classificação, desempate, consulta do ranking e desempenho por rodada (SPEC-015) e medalhas (SPEC-016).
- Registro do resultado oficial e sua correção (SPEC-013); esta Spec só os consome.
- Palpites de outros participantes (SPEC-028).
- Auditoria do cálculo, que não consta do catálogo da SPEC-002; o processamento vai ao registro técnico.
- Notificações (SPEC-027).

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, configuração, correlação e testes), SPEC-003 (autenticação e formato de erros), SPEC-007 (bolão e status), SPEC-012 (palpites) e SPEC-013 (resultado oficial, versão do resultado e agendador).
- **Decisões arquiteturais:** ADR-0005, ADR-0006 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- Existe ao menos uma partida encerrada, com placar oficial e versão do resultado maior que a já pontuada.
- Há palpites registrados para essa partida em bolões ativos.

### Fluxo principal — pontuar

1. O agendador dispara a tarefa de pontuação.
2. O sistema seleciona as partidas encerradas cuja versão do resultado é maior que a versão pontuada.
3. Para cada uma, em uma transação própria, o sistema:
   - lê os palpites da partida pertencentes a bolões ativos;
   - aplica a regra de pontuação a cada palpite com o placar oficial e grava os pontos ganhos (0, 2 ou 5);
   - recalcula a pontuação acumulada de cada participação afetada, como a soma dos pontos de seus palpites;
   - grava a versão pontuada igual à versão do resultado.
4. O sistema registra o processamento no registro técnico.

### Fluxo principal — consultar pontos

1. O participante pede seus pontos no bolão.
2. O sistema devolve, para cada partida encerrada do bolão, o palpite dele, o placar oficial e os pontos ganhos.

### Fluxos alternativos

- **A1 — Correção de resultado:** a versão do resultado cresce (SPEC-013); a partida é processada de novo e os pontos dos palpites de bolões ativos passam ao novo valor, sem acumular.
- **A2 — Partida de bolão encerrado:** os palpites de bolão encerrado não são recalculados e seus pontos permanecem.
- **A3 — Palpite de participante que saiu, em partida já iniciada:** é pontuado normalmente; a classificação decide sobre ele (SPEC-015, SPEC-017).
- **A4 — Nada a processar:** a execução termina sem alterações.

### Fluxos de exceção

- **E1 — Partida sem resultado oficial, adiada, cancelada ou em andamento:** não é pontuada e os pontos dos palpites ficam vazios (UC05 A1).
- **E2 — Falha ao processar uma partida:** a transação dessa partida é desfeita, a falha é registrada e as demais partidas da execução continuam; a partida é tentada de novo na execução seguinte.
- **E3 — Consulta por quem não tem participação confirmada:** 409 para participação aprovada aguardando pagamento e 404 para as demais situações e para bolão inexistente; sem sessão, 401.
- **E4 — Tentativa de informar ou alterar pontos manualmente:** nenhuma operação existe e a tentativa é rejeitada sem efeito.

### Pós-condições

- Cada palpite de partida encerrada em bolão ativo tem pontos 0, 2 ou 5 coerentes com o placar oficial vigente.
- A pontuação acumulada de cada participação afetada é a soma dos pontos de seus palpites.
- A versão pontuada de cada partida processada é igual à versão do resultado.

## 6. Regras e invariantes

- **INV-001:** só há pontuação para partida encerrada com placar oficial; partidas não encerradas, adiadas, canceladas ou não computáveis não pontuam, e um palpite sem resultado oficial tem pontos vazios, diferente de zero (RB33, UC05 A1).
- **INV-002:** o palpite de resultado vale 2 pontos se o resultado previsto coincide com o resultado oficial (vitória do mandante, empate ou vitória do visitante, derivado do placar), e 0 caso contrário (RB34, RB35).
- **INV-003:** o palpite de placar exato vale 5 pontos se os gols do mandante e do visitante coincidem com o placar oficial, e 0 caso contrário; acertar somente o resultado com placar errado vale 0 (RB36, RB37).
- **INV-004:** os pontos de um palpite são um valor atribuído, nunca incrementado; recalcular com o mesmo resultado produz o mesmo valor, sem duplicar pontuação (RNF17).
- **INV-005:** a pontuação é automática; nenhuma operação permite informar ou alterar pontos manualmente (RB33).
- **INV-006:** só é processada a partida cuja versão do resultado é maior que a versão pontuada, e a versão pontuada é atualizada na mesma transação (OPEN-76).
- **INV-007:** o processamento de uma partida (pontos, pontuações acumuladas e versão pontuada) é atômico por partida, e a falha em uma não impede as demais (RNF02).
- **INV-008:** a pontuação acumulada de uma participação é a soma dos pontos de seus palpites, valor derivado e recalculado, nunca incremental, e atualizado na mesma transação dos pontos (RNF03, OPEN-76).
- **INV-009:** palpites de bolões encerrados não são recalculados e mantêm seus pontos (OPEN-04).
- **INV-010:** uma correção de resultado provoca novo cálculo apenas dos palpites da partida corrigida em bolões ativos; outros resultados e palpites não são alterados (RNF17).
- **INV-011:** a tarefa de pontuação é idempotente, não se sobrepõe a si mesma e é isolada de falhas (ADR-0006).
- **INV-012:** o participante vê somente os próprios pontos por partida; nenhuma operação desta Spec expõe pontos de outros participantes (RNF01, RNF11).
- **INV-013:** esta Spec altera apenas pontos e pontuações acumuladas; não altera palpites, partidas nem resultados.
- **INV-014:** o cálculo usa somente dados locais, sem chamar o provedor esportivo.
- **INV-015:** a regra de pontuação é função das entradas (palpite e placar oficial) e é testável sem interface e sem credenciais (RNF18).
- **INV-016:** a classificação e o desempate não são definidos nesta Spec (SPEC-015).

## 7. Modelo de domínio envolvido

- **Palpite:** pontos ganhos, atribuídos por esta Spec (vazios até a pontuação). Modalidade, valores e data de envio são somente leitura.
- **Partida:** placar oficial e versão do resultado, somente leitura; atributo técnico novo: versão pontuada.
- **Participacao:** pontuação acumulada, derivada da soma dos pontos dos palpites; status e demais campos são somente leitura.
- **Bolao:** status, somente leitura.
- **Restrições:** pontos permitidos 0, 2 e 5; versão pontuada nunca maior que a versão do resultado.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "palpites e pontuação" (principal), "partidas e resultados" (leitura da versão e do placar), "bolões e participações" (leitura) e o agendador da SPEC-001 e SPEC-013.
- **Fronteiras:**
  - Esta Spec depende da SPEC-013 e não é chamada por ela; o acoplamento é pela versão do resultado.
  - A classificação consome as pontuações acumuladas produzidas aqui (SPEC-015).
- **Integrações necessárias:** nenhuma.
- **Frontend:** seção de pontos do participante no bolão, utilizável em 360 px, 768 px e 1366 px.
- **Backend:** regra de pontuação, tarefa agendada, processamento atômico por partida e consulta dos próprios pontos.
- **ADRs que restringem a solução:** ADR-0001, ADR-0005, ADR-0006 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003.

- **Regra de pontuação (interna)**
  - Entrada: palpite (modalidade e valores) e placar oficial.
  - Saída: 0, 2 ou 5 pontos.
- **Tarefa de pontuação (interna)**
  - Entrada: disparo do agendador ou de um teste.
  - Saída: resumo (partidas processadas e palpites atualizados) e falhas por partida, sem efeitos parciais em cada partida.
- **Consultar meus pontos do bolão**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: partidas encerradas do bolão com o palpite próprio, o placar oficial e os pontos ganhos.
  - Erros: 401; 404 (não membro ou bolão inexistente); 409 (participação aprovada aguardando pagamento).
- **Leitura interna da pontuação acumulada** por participação, para a SPEC-015.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF02 | Falhar o processamento de uma partida e conferir que nada dela muda, enquanto as outras seguem (TC-10, TC-11). |
| RNF03 | Conferir que pontos, pontuação acumulada e consulta apresentam o mesmo estado após cada processamento (TC-09, TC-13). |
| RNF17 | Reprocessar e corrigir resultados controlados e conferir ausência de duplicação (TC-06, TC-07). |
| RNF18 | Executar a regra e a tarefa sem interface e sem credenciais externas (TC-01 a TC-12). |
| RNF01 e RNF11 | Consultar pontos como outro participante e sem sessão (TC-13). |
| RNF06 e RNF07 | Medir as consultas durante o processamento no conjunto de referência (TC-16), após confirmação da equipe. |
| RNF14 (por extensão) | Roteiro da tela de pontos em 360 px, 768 px e 1366 px (TC-15). |

## 11. Critérios de aceitação

- **CA-01 (resultado certo):** Dado um palpite de resultado "vitória do mandante" e o placar oficial 2 a 1, Quando a partida é pontuada, Então o palpite recebe 2 pontos; e com palpite "empate" e placar 1 a 1, e "vitória do visitante" e placar 0 a 3, recebe 2 pontos também.
- **CA-02 (resultado errado):** Dado um palpite de resultado "empate" e o placar oficial 2 a 1, Quando a partida é pontuada, Então o palpite recebe 0 pontos.
- **CA-03 (placar exato):** Dado um palpite de placar exato 2 a 1 e o placar oficial 2 a 1, Quando a partida é pontuada, Então o palpite recebe 5 pontos.
- **CA-04 (placar errado):** Dado um palpite de placar exato 3 a 1 e o placar oficial 2 a 1, e outro 0 a 2 e placar oficial 2 a 1, Quando a partida é pontuada, Então ambos recebem 0 pontos, inclusive o que acertou só o resultado.
- **CA-05 (sem resultado oficial):** Dado palpites de uma partida que não está encerrada, e de uma adiada e de uma cancelada, Quando a tarefa de pontuação é executada, Então os pontos permanecem vazios e diferentes de zero.
- **CA-06 (automático):** Dado que a SPEC-013 registrou o resultado de uma partida, Quando a tarefa de pontuação é executada sem nenhuma ação humana, Então os palpites são pontuados; e nenhuma operação exposta permite informar ou alterar pontos.
- **CA-07 (idempotência):** Dado uma partida já pontuada com a versão atual, Quando a tarefa é executada de novo, Então a partida não é processada e pontos e pontuações acumuladas permanecem iguais.
- **CA-08 (correção de resultado):** Dado uma partida pontuada cujo resultado é corrigido (versão maior), Quando a tarefa é executada, Então os pontos dos palpites passam ao novo valor, a pontuação acumulada acompanha sem dobrar e outras partidas e palpites não mudam.
- **CA-09 (bolão encerrado):** Dado uma partida cuja correção chega depois do encerramento de um dos bolões que a selecionam, Quando a tarefa é executada, Então os pontos dos palpites do bolão encerrado permanecem e os do bolão ativo são recalculados.
- **CA-10 (pontuação acumulada):** Dado uma participação com palpites de pontos variados, Quando partidas são pontuadas e depois corrigidas, Então a pontuação acumulada é sempre a soma dos pontos de seus palpites.
- **CA-11 (atomicidade por partida):** Dado que o processamento de uma partida falha no meio, Quando a tarefa é executada, Então pontos, pontuações acumuladas e versão pontuada dessa partida permanecem como antes.
- **CA-12 (isolamento de falhas):** Dado uma execução com duas partidas pendentes e falha em uma, Quando a tarefa termina, Então a outra partida foi processada e a falhada é tentada na execução seguinte.
- **CA-13 (participante que saiu):** Dado um palpite de participação com status saiu em partida já iniciada, Quando a partida é pontuada, Então o palpite é pontuado normalmente.
- **CA-14 (consulta dos próprios pontos):** Dado um participante confirmado, Quando ele consulta seus pontos, Então vê, para cada partida encerrada, seu palpite, o placar oficial e os pontos; um não membro e quem está sem sessão recebem 404 e 401; a participação aprovada aguardando pagamento recebe 409.
- **CA-15 (isolamento entre participantes):** Dado dois participantes do mesmo bolão, Quando cada um consulta seus pontos, Então só vê os próprios.
- **CA-16 (sem chamadas externas):** Dado o provedor esportivo indisponível, Quando a tarefa de pontuação é executada, Então resultados já registrados são pontuados normalmente.
- **CA-17 (agendador):** Dado a tarefa registrada com intervalo configurável, Quando o backend inicia e o tempo passa, Então a tarefa executa logo após a inicialização e no intervalo, sem se sobrepor e sem que uma falha impeça a seguinte.
- **CA-18 (tempo até pontuar):** Dado um resultado registrado pela SPEC-013 e o intervalo padrão da tarefa, Quando o tempo avança, Então os palpites são pontuados em até 1 minuto, mantendo o conjunto dentro do limite de 15 minutos do RNF17.
- **CA-19 (carga):** Dado o conjunto de referência de 20 usuários, 5 bolões ativos e 1.000 palpites, Quando partidas são pontuadas durante consultas dos usuários, Então pelo menos 95% das consultas respondem em até 3 segundos e nenhum ponto é perdido ou duplicado.
- **CA-20 (formato de erros):** Dado erros 401, 404 e 409, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.
- **CA-21 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o participante vê seus pontos, Então a tela permanece utilizável, sem sobreposição de controles nem rolagem horizontal da página.
- **CA-22 (outros dados intactos):** Dado qualquer processamento, Quando palpites, partidas e resultados são comparados antes e depois, Então só pontos e pontuações acumuladas mudaram.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, CA-02, INV-002, INV-015 | Tabela de verdade do palpite de resultado, com vitórias, empate e derrotas. |
| TC-02 | CA-03, CA-04, INV-003 | Tabela de verdade do palpite de placar exato, inclusive resultado certo com placar errado. |
| TC-03 | CA-05, INV-001 | Pontuar partidas não encerradas, adiada e cancelada e conferir pontos vazios. |
| TC-04 | CA-06, INV-005 | Registrar resultado pela SPEC-013, executar a tarefa e procurar operações de pontos manuais. |
| TC-05 | CA-07, INV-006, INV-011 | Executar a tarefa duas vezes com a mesma versão. |
| TC-06 | CA-08, INV-004, INV-010 | Corrigir o resultado e conferir o recálculo sem acumular e sem mexer em outros dados. |
| TC-07 | CA-09, INV-009 | Corrigir resultado de partida de bolões ativo e encerrado. |
| TC-08 | CA-10, INV-008 | Conferir a soma das pontuações acumuladas após pontuar e corrigir. |
| TC-09 | CA-22, INV-013 | Comparar palpites, partidas e resultados antes e depois do processamento. |
| TC-10 | CA-11, INV-007 | Forçar falha no meio do processamento de uma partida. |
| TC-11 | CA-12 | Executar com duas partidas pendentes e uma falhando. |
| TC-12 | CA-13 | Pontuar palpite de participação que saiu, em partida já iniciada. |
| TC-13 | CA-14, CA-15, INV-012 | Consultar pontos como participante, outro participante, não membro, sem sessão e com participação aprovada. |
| TC-14 | CA-16, CA-17, CA-18, INV-014 | Executar com o provedor indisponível, no início do backend e no intervalo, e medir o tempo até pontuar. |
| TC-15 | CA-21 | Executar a tela em 360 px, 768 px e 1366 px. |
| TC-16 | CA-19 | Teste de carga com o conjunto de referência (sujeito à confirmação da equipe). |
| TC-17 | CA-20 | Provocar 401, 404 e 409 e conferir o formato comum. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-76 | Tarefa própria no agendador, executada logo após a inicialização e a cada 1 minuto, que processa as partidas cuja versão do resultado é maior que a versão pontuada, atributo técnico da partida; cada partida é uma transação que grava os pontos, recalcula a pontuação acumulada das participações afetadas como a soma dos pontos de seus palpites (valor derivado, nunca incremental) e atualiza a versão pontuada; só palpites de bolões ativos são calculados ou recalculados; a classificação, o desempate e a consulta do ranking permanecem na SPEC-015. |
| OPEN-77 | Todo palpite existente é pontuado, inclusive o de participação que saiu em partida já iniciada, pois os palpites de partidas não iniciadas já foram desconsiderados na saída (SPEC-017) e o ranking decide sobre quem saiu; a consulta dos próprios pontos usa a mesma regra de acesso da SPEC-012 (confirmada; aprovada recebe 409; demais 404) e mostra palpite, placar oficial e pontos das partidas encerradas; o cálculo não é auditado, só registrado tecnicamente. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-014 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-22) estiverem implementados;
- todos os invariantes (INV-001 a INV-016) estiverem preservados;
- os testes derivados (TC-01 a TC-17) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 e o teste de carga dos RNF06 e RNF07 executados somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
