# SPEC-025 — Encerramento automático e determinação do vencedor

- **Status:** aprovada em 31/10/2026. As questões OPEN-134 a OPEN-141 foram resolvidas com a aprovação desta Spec, nos termos das propostas da seção 13. Em particular, a OPEN-136 foi aprovada mantendo a SPEC-023 como está (pedidos de devolução pendentes não podem mais ser decididos após o encerramento).
- **Etapa:** Spec-Driven Development, geração de Spec individual. Nenhum código, banco de dados, endpoint ou tecnologia nova é definido aqui.
- **Fonte de verdade:** `mapa-de-specs.md` (aprovado) e artefatos de `docs/`.

> **Nota de rastreabilidade:** ao gerar esta Spec, o texto integral de RF35, RF36, RB42, RB43, RB49, RB50, RB63, do UC07 (passos 1 a 3 e exceções A1 e A2), das SPEC-015, 017, 022 e 024 e a redação final das decisões aprovadas para OPEN-02, OPEN-03, OPEN-04, OPEN-09, OPEN-11, OPEN-13, OPEN-14 e OPEN-21 não estavam disponíveis. O conteúdo abaixo foi derivado do mapa de Specs, das Specs aprovadas nesta conversa e dos registros de OPEN-XX. Tudo que depende desses textos está marcado como OPEN-XX, com proposta, para conferência (ver OPEN-134).

---

## 1. Identificação

- **ID:** SPEC-025
- **Nome:** Encerramento automático e determinação do vencedor
- **Objetivo:** encerrar o bolão ao atingir o período final, calcular a classificação final com o critério de desempate definido na criação e registrar o vencedor ou os vencedores elegíveis, ou a ausência deles.
- **Valor entregue:** resultado final automático e justo, sem apuração manual.

## 2. Rastreabilidade

| Tipo | Itens |
| --- | --- |
| RF | RF35, RF36 |
| RB | RB42, RB43, RB49, RB50, RB63; contexto: RB29, RB30 e RB60 (resultado oficial só pela API), RB22 e RB62 (confirmação por pagamento), RB44 e RB48 (saída), RB51 (premiação definida na criação) |
| RNF | RNF02, RNF03, RNF04, RNF18; por extensão: RNF16 (auditoria do encerramento, ver OPEN-141) |
| Caso de uso | UC07: passos 1 a 3 e exceções A1 e A2 (mapeamento exato a conferir, OPEN-134) |
| Entidades | Bolao, Participacao, Palpite |
| Drivers | DA-01 |
| ADRs | ADR-0005, ADR-0001. Estruturais herdadas da fundação: ADR-0004, ADR-0006 (agendador), ADR-0008 |

## 3. Escopo

**Incluído**

- Detecção automática de bolões que atingiram o período final e já podem ser apurados.
- Encerramento do bolão, com instante registrado em UTC.
- Cálculo da classificação final, com o critério de desempate definido na criação.
- Determinação e registro de vencedor, co-vencedores ou ausência de vencedor.
- Verificação de elegibilidade ao prêmio (RB63) no momento do encerramento.
- Congelamento do resultado final e consulta do resultado final pelos participantes.

**Fora do escopo**

- Pontuação das partidas, ranking durante o bolão, medalhas e encerramento de rodada (SPEC-014, 015, 016).
- Sincronização dos resultados oficiais e suas correções (SPEC-013).
- Cálculo, divisão e solicitação do montante da premiação (SPEC-026, OPEN-13).
- Qualquer movimentação financeira (SPEC-018, 022, 023, 024).
- Notificações (SPEC-027) e histórico dos bolões (SPEC-028).
- Encerramento ou apuração manual, e edição do resultado final por usuário ou administração.

## 4. Dependências

- **SPEC-015:** regra de classificação e de desempate, reutilizada para a classificação final.
- **SPEC-017:** participantes que saíram ficam fora da classificação e da premiação.
- **SPEC-022:** participação confirmada por pagamento, necessária à elegibilidade (RB63).
- **SPEC-024:** devoluções que podem afetar o montante da premiação; a dependência é uma proposta a validar (mapa, OPEN-134).
- **Transitivas:** SPEC-001, 002, 003, 006, 007, 010, 012, 013, 014, 016, 018 e o agendador (ADR-0006).
- **Decisões:** ADR-0005 (invariantes no backend) e ADR-0001 (monólito modular).

## 5. Comportamento esperado

### 5.1 Encerramento automático

- **Pré-condições:** bolão ativo cujo período final foi atingido e cujas partidas selecionadas estão todas apuráveis (OPEN-135).
- **Fluxo principal:**
  1. Uma tarefa agendada própria (ADR-0006, OPEN-135) identifica bolões ativos com período final atingido, em UTC.
  2. Para cada bolão, o sistema verifica que todas as partidas selecionadas têm resultado oficial já pontuado ou estado terminal sem resultado (OPEN-02, OPEN-76).
  3. O sistema determina as participações elegíveis (confirmadas, com pagamento confirmado quando há taxa, e que não saíram).
  4. O sistema calcula a classificação final com o critério de desempate do bolão, pela mesma regra da SPEC-015.
  5. O sistema determina o vencedor, os co-vencedores ou a ausência de vencedor (OPEN-137).
  6. Na mesma transação, o sistema registra a classificação final e os vencedores, muda o bolão para encerrado e registra o instante em UTC.
- **Pós-condição:** bolão encerrado, resultado final congelado e consultável; nenhuma movimentação financeira criada.

### 5.2 Consulta do resultado final

- **Pré-condição:** usuário autenticado e participante do bolão, conforme a regra de acesso da consulta de ranking (OPEN-140).
- **Fluxo principal:** o participante consulta o bolão encerrado e vê instante do encerramento, classificação final, vencedores ou ausência de vencedor.
- **Alternativo:** bolão ainda ativo: resultado final indisponível (a classificação em andamento continua na SPEC-015).

### 5.3 Fluxos alternativos e de exceção

- **A1 (partidas pendentes):** se há partida selecionada sem resultado oficial e sem estado terminal (adiada, suspensa ou aguardando resultado), o bolão permanece ativo e é reavaliado no próximo ciclo; não há encerramento com pontuação incompleta (OPEN-135).
- **A2 (nenhum elegível ou maior pontuação zero):** o bolão é encerrado e o resultado registra ausência de vencedor (OPEN-137).
- **A3 (empate residual):** se o critério de desempate não separa os primeiros colocados, todos os elegíveis na primeira posição são co-vencedores (OPEN-14, OPEN-78).
- **A4 (correção de resultado após o encerramento):** a correção é registrada pela SPEC-013, mas não altera classificação final nem vencedores; o fato é sinalizado no log técnico (OPEN-138).
- **A5 (saída após o encerramento):** se permitida pela SPEC-017, não altera o resultado final (OPEN-21, OPEN-138).
- **A6 (reexecução da tarefa):** bolão já encerrado não é reprocessado e nada muda.
- **A7 (falha durante o encerramento):** a transação é desfeita, o bolão permanece ativo e o próximo ciclo tenta novamente, sem estado parcial.
- **A8 (participação aprovada com pagamento pendente):** não é elegível; eventual confirmação posterior do pagamento não confirma a participação (SPEC-022, INV-011).
- **A9 (pedidos de devolução pendentes):** permanecem sem decisão possível após o encerramento, conforme SPEC-023 (OPEN-136).
- **E1:** usuário não autenticado ou sem vínculo com o bolão tenta consultar: acesso negado, sem revelar a existência do bolão.

## 6. Regras e invariantes

- **INV-001:** o encerramento é exclusivamente automático; nenhum usuário ou administrador encerra o bolão, apura o vencedor ou edita o resultado final (RB29, RB30, RB60, RF35).
- **INV-002:** o bolão só encerra quando o instante atual em UTC alcançou o período final e todas as partidas selecionadas estão apuráveis (RB49, RB50, OPEN-02, OPEN-135).
- **INV-003:** o encerramento é único e irreversível: bolão encerrado não reabre e a reexecução da tarefa não tem efeito.
- **INV-004:** a classificação final usa o critério de desempate definido na criação, imutável (RB42, RB43), e a mesma regra de ordenação da SPEC-015.
- **INV-005:** só participações elegíveis entram na classificação final e podem vencer: confirmadas, com pagamento confirmado quando há taxa, e que não saíram (RB63, RB22, RB62).
- **INV-006:** os vencedores são todos os elegíveis na primeira posição após o desempate; ausência de vencedor é registrada explicitamente, nunca omitida (RF36, OPEN-137).
- **INV-007:** encerramento, classificação final e registro de vencedores ocorrem na mesma transação: tudo ou nada (RNF02).
- **INV-008:** após o encerramento o resultado final é congelado: correções de resultado, saídas, medalhas e pontuação posteriores não o alteram (OPEN-04, OPEN-76, OPEN-80, OPEN-138).
- **INV-009:** o encerramento não cria movimentação financeira nem calcula ou reserva montante de premiação (SPEC-026, OPEN-13).
- **INV-010:** não se encerra com pontuação incompleta: todo resultado oficial de partida selecionada precisa estar pontuado antes (OPEN-76).
- **INV-011:** datas e instantes em UTC (RNF04).
- **INV-012:** as regras são validadas no backend (ADR-0005); o frontend não decide encerramento, elegibilidade nem vencedor.

## 7. Modelo de domínio envolvido

- **Bolao:** estado (ativo, encerrado, conforme OPEN-09), período final, critério de desempate (imutável), instante do encerramento e indicação de ausência de vencedor.
- **Participacao:** pontuação acumulada, status (confirmada, saiu, entre outros conforme OPEN-09), posição final, indicador de elegibilidade e indicador de vencedor.
- **Palpite:** pontos já calculados (SPEC-014), somente leitura.
- **Relacionamentos:** um bolão encerrado tem zero, um ou mais vencedores; cada vencedor é uma participação elegível na primeira posição.
- A forma de persistência do resultado final não é decidida aqui (OPEN-138). Sem modelo físico nesta Spec (OPEN-40).

## 8. Impacto arquitetural

- **Módulos:** bolões (estado e encerramento), ranking (regra de classificação e desempate da SPEC-015), participações (elegibilidade), agendador (tarefa de encerramento, ADR-0006).
- **Fronteiras:** a SPEC-025 lê pontos, partidas e participações e escreve apenas o estado do bolão e o resultado final; não escreve em pontuação, medalhas ou financeiro.
- **Backend:** verifica condições, calcula, decide e registra em transação; tarefa própria, a cada 1 minuto, como em OPEN-76 e OPEN-81.
- **Frontend:** exibição do bolão encerrado, classificação final e vencedores ou ausência de vencedor.
- **ADRs que restringem:** ADR-0005 (validação no backend), ADR-0001, ADR-0004, ADR-0006, ADR-0008.

## 9. Contratos necessários (conceituais)

| Operação | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| Encerrar bolões apuráveis (interna, agendada) | instante atual (UTC) | bolões encerrados, com classificação final e vencedores ou ausência | falha por bolão desfaz a transação daquele bolão; condição não satisfeita mantém o bolão ativo |
| Consultar resultado final | usuário autenticado e bolão | estado, instante do encerramento, classificação final (posições e pontos), vencedores ou ausência de vencedor | não autenticado; sem vínculo ou bolão inexistente (mesma resposta); bolão ainda ativo (conflito de estado) |

- Formato dos erros e códigos: conforme OPEN-53 (SPEC-003) e acesso conforme OPEN-65.
- Contrato de persistência do resultado final: **OPEN-138** (não definido na baseline).

## 10. Requisitos não funcionais aplicáveis

| RNF | Como é verificado |
| --- | --- |
| RNF02 | Teste de atomicidade: falha entre classificar, registrar vencedores e mudar o estado desfaz tudo. |
| RNF03 | Aplicado ao cálculo da classificação final, como nas SPEC-015, 016 e 017; verificação conforme o critério definido no RNF, a conferir (OPEN-134). |
| RNF04 | Teste de datas, período final e instante de encerramento em UTC. |
| RNF18 | Execução de toda a suíte com adaptador simulado e instante de referência controlado, sem credenciais externas. |
| RNF16 (extensão) | Teste de auditoria do encerramento e do registro de vencedores, com o sistema como ator (OPEN-141). |

## 11. Critérios de aceitação

- **CA-01 (encerramento):** Dado um bolão ativo cujo período final foi atingido e cujas partidas selecionadas estão apuráveis, Quando a tarefa executa, Então o bolão fica encerrado com instante UTC registrado.
- **CA-02 (antes do período):** Dado um bolão cujo período final ainda não foi atingido, Quando a tarefa executa, Então o bolão permanece ativo.
- **CA-03 (partidas pendentes):** Dado período final atingido e uma partida selecionada sem resultado oficial e sem estado terminal, Quando a tarefa executa, Então o bolão permanece ativo.
- **CA-04 (pontuação completa):** Dado resultado oficial ainda não pontuado, Quando a tarefa executa, Então o bolão não é encerrado.
- **CA-05 (classificação final):** Dado o encerramento, Quando a classificação é calculada, Então segue o critério de desempate definido na criação e a mesma ordenação da SPEC-015.
- **CA-06 (vencedor único):** Dado um único elegível na primeira posição, Quando o bolão é encerrado, Então esse participante é registrado como vencedor.
- **CA-07 (co-vencedores):** Dado empate residual na primeira posição entre elegíveis, Quando o bolão é encerrado, Então todos são registrados como co-vencedores.
- **CA-08 (elegibilidade):** Dado participante que saiu ou cuja participação não está confirmada, Quando o bolão é encerrado, Então ele não entra na classificação final nem é vencedor.
- **CA-09 (ausência de vencedor):** Dado que não há elegível ou que a maior pontuação elegível é zero, Quando o bolão é encerrado, Então o resultado registra ausência de vencedor.
- **CA-10 (atomicidade):** Dado uma falha durante o encerramento, Quando a transação é desfeita, Então o bolão continua ativo e sem resultado parcial.
- **CA-11 (reexecução):** Dado um bolão já encerrado, Quando a tarefa executa de novo, Então nada muda.
- **CA-12 (sem manual):** Dado qualquer usuário, inclusive administrador, Quando tenta encerrar o bolão ou alterar vencedores, Então não existe operação para isso.
- **CA-13 (congelamento):** Dado um bolão encerrado, Quando ocorre correção de resultado ou saída posterior, Então classificação final e vencedores permanecem inalterados.
- **CA-14 (sem financeiro):** Dado o encerramento, Quando concluído, Então nenhuma movimentação financeira é criada nem montante calculado.
- **CA-15 (consulta):** Dado um participante de bolão encerrado, Quando consulta o resultado final, Então vê instante, classificação final e vencedores ou ausência de vencedor.
- **CA-16 (acesso):** Dado usuário sem vínculo, Quando consulta, Então recebe a mesma resposta de bolão inexistente.
- **CA-17 (bolão ativo):** Dado bolão ativo, Quando consulta o resultado final, Então recebe conflito de estado.
- **CA-18 (pagamento tardio):** Dado participação aprovada com pagamento confirmado após o encerramento, Quando processado, Então a participação não é confirmada e não vira elegível.
- **CA-19 (UTC e testes):** Dado o ambiente de testes, Quando a suíte desta Spec executa, Então roda com adaptador simulado, sem credenciais externas, e com todos os instantes em UTC.

## 12. Casos de teste derivados

Não implementar nesta etapa.

- **CT-01:** encerramento no instante exato do período final (CA-01, INV-002, INV-011).
- **CT-02:** bolão antes do período final permanece ativo (CA-02).
- **CT-03:** partida adiada, suspensa ou sem resultado mantém o bolão ativo (CA-03, INV-010).
- **CT-04:** resultado oficial não pontuado impede o encerramento (CA-04).
- **CT-05:** classificação final com cada critério de desempate admitido (CA-05, INV-004).
- **CT-06:** vencedor único (CA-06).
- **CT-07:** co-vencedores em empate residual (CA-07, INV-006).
- **CT-08:** participante que saiu e participação não confirmada excluídos (CA-08, INV-005).
- **CT-09:** nenhum elegível e maior pontuação zero geram ausência de vencedor (CA-09).
- **CT-10:** falha no meio do encerramento desfaz tudo (CA-10, INV-007).
- **CT-11:** reexecução da tarefa sem efeito (CA-11, INV-003).
- **CT-12:** inexistência de operação manual de encerramento ou de edição do resultado (CA-12, INV-001).
- **CT-13:** correção de resultado e saída após o encerramento não alteram o resultado final (CA-13, INV-008).
- **CT-14:** nenhuma movimentação financeira criada (CA-14, INV-009).
- **CT-15:** consulta do resultado final por participante (CA-15).
- **CT-16:** acesso negado a quem não tem vínculo e conflito em bolão ativo (CA-16, CA-17).
- **CT-17:** pagamento confirmado após o encerramento não confirma participação (CA-18).
- **CT-18:** bolão sem taxa e bolão com taxa na determinação de elegibilidade (INV-005).
- **CT-19:** todas as partidas canceladas gera ausência de vencedor (A2, INV-002).
- **CT-20:** suíte isolada, com relógio controlado e sem rede externa (CA-19, RNF18).

## 13. Questões em aberto

> Cada item traz uma **proposta para aprovação**, no mesmo padrão das Specs anteriores. Se a baseline já decidir algo diferente, a baseline prevalece.

- **OPEN-134 - confirmação necessária:** conferir esta Spec contra o texto integral de RF35, RF36, RB42, RB43, RB49, RB50, RB63, UC07 (passos 1 a 3 e A1, A2), as SPEC-015, 017, 022 e 024 aprovadas, as decisões aprovadas de OPEN-02, OPEN-03, OPEN-04, OPEN-09, OPEN-11, OPEN-13, OPEN-14 e OPEN-21 e o critério de RNF03, que não estavam disponíveis na geração. Validar também se a dependência de SPEC-024 se mantém (o mapa a trata como proposta) e a inclusão de RNF16 por extensão. *Proposta:* ajustar os critérios afetados após a conferência.
- **OPEN-135 - decisão necessária:** definir a condição e o momento do encerramento (OPEN-03, OPEN-11, OPEN-02). *Proposta:* tarefa própria do agendador (ADR-0006), a cada 1 minuto; o período termina ao fim do dia da data final, em UTC; o bolão encerra quando o período terminou e toda partida selecionada tem resultado oficial já pontuado ou estado terminal sem resultado (por exemplo cancelada); partida adiada ou suspensa mantém o bolão ativo, sem prazo máximo e sem encerramento manual.
- **OPEN-136 - decisão necessária:** definir o tratamento de pedidos de devolução pendentes e de pagamentos em andamento no encerramento. Há uma possível inconsistência com a SPEC-023 aprovada, que impede decidir pedidos de bolão encerrado: pedidos ainda pendentes ficariam sem decisão possível. *Proposta:* manter a SPEC-023 como está; os pedidos pendentes permanecem pendentes, visíveis ao solicitante com aviso de que não podem mais ser decididos; devoluções já aprovadas continuam sendo processadas pela SPEC-024; pagamentos pendentes seguem a SPEC-022 (INV-011). Se a equipe preferir permitir decisão após o encerramento, a baseline e a SPEC-023 precisam ser alteradas por decisão humana.
- **OPEN-137 - decisão necessária:** definir elegibilidade e vencedores (RB63, OPEN-14, OPEN-21, OPEN-78). *Proposta:* a classificação final contém só participações confirmadas que não saíram; vencedores são os elegíveis na primeira posição, com co-vencedores em empate residual; sem elegível, ou com maior pontuação zero, o resultado registra ausência de vencedor (alinhado à regra de medalhas só com pontuação positiva, OPEN-80).
- **OPEN-138 - decisão necessária:** definir o registro do resultado final e o congelamento (OPEN-04). *Proposta:* o resultado final (posição final, elegibilidade e vencedores) é registrado uma única vez no encerramento e não é recalculado; correções posteriores de resultado e saídas não o alteram e as correções são sinalizadas no log técnico; forma de persistência definida na implementação, sem modelo físico nesta Spec.
- **OPEN-139 - decisão necessária:** definir a fronteira com a premiação e as devoluções (OPEN-13). *Proposta:* o encerramento só registra vencedores; montante, divisão entre co-vencedores e uso das devoluções confirmadas (SPEC-024) ficam na SPEC-026.
- **OPEN-140 - decisão necessária:** definir acesso e conteúdo da consulta do resultado final e sua relação com a SPEC-015 e a SPEC-028. *Proposta:* mesma regra de acesso da consulta de ranking (SPEC-015); conteúdo: instante do encerramento, posições, pontos e vencedores ou ausência; o histórico de bolões segue na SPEC-028.
- **OPEN-141 - decisão necessária:** definir auditoria e logs. *Proposta:* auditar o encerramento e o registro de vencedores com o sistema como ator, sem auditar o cálculo da classificação (como em OPEN-77); falhas e ciclos relevantes vão ao log técnico, sem segredos.

## 14. Definition of Done

A SPEC-025 está concluída quando:

1. todos os critérios de aceitação (CA-01 a CA-19) estiverem implementados;
2. todos os invariantes (INV-001 a INV-012) estiverem preservados;
3. os casos de teste derivados (CT-01 a CT-20) estiverem aprovados;
4. os RNFs aplicáveis (RNF02, RNF03, RNF04, RNF18 e RNF16 por extensão) tiverem sido verificados;
5. não existir divergência conhecida entre implementação e esta Spec;
6. toda divergência em relação à baseline tiver sido explicitamente analisada e decidida pela equipe humana.

**Regra fundamental:** a implementação obedece à Spec aprovada. Em conflito entre código, Spec e documentos de modelagem, registra-se a divergência e escolhe-se entre corrigir a implementação ou propor alteração da baseline para aprovação humana.
