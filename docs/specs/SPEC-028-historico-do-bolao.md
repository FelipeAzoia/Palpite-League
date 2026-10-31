# SPEC-028 — Histórico do bolão

- **Status:** aprovada em 31/10/2026. As questões OPEN-159 a OPEN-166 foram resolvidas com a aprovação desta Spec, nos termos das propostas da seção 13.
- **Etapa:** Spec-Driven Development, geração de Spec individual. Nenhum código, banco de dados, endpoint ou tecnologia nova é definido aqui.
- **Fonte de verdade:** `mapa-de-specs.md` (aprovado) e artefatos de `docs/`.

> **Nota de rastreabilidade:** ao gerar esta Spec, o texto integral de RF40, RB64, do UC05 (passo 8), das SPEC-012, 013, 014 e 015 e a redação final das decisões aprovadas para OPEN-18, OPEN-34, OPEN-78 e OPEN-79, além dos critérios de RNF03, RNF06, RNF07, RNF13 e RNF14, não estavam disponíveis. O conteúdo abaixo foi derivado do mapa de Specs, das Specs aprovadas nesta conversa e dos registros de OPEN-XX. Tudo que depende desses textos está marcado como OPEN-XX, com proposta, para conferência (ver OPEN-159).

---

## 1. Identificação

- **ID:** SPEC-028
- **Nome:** Histórico do bolão
- **Objetivo:** apresentar ao participante o histórico de partidas, palpites, pontuações, ranking e resultados registrados durante sua participação.
- **Valor entregue:** consulta consolidada e consistente do que aconteceu no bolão, sem criar nenhuma regra nova de cálculo.

## 2. Rastreabilidade

| Tipo | Itens |
| --- | --- |
| RF | RF40 |
| RB | RB64 (texto a conferir, OPEN-159); contexto: RB29, RB30 e RB31 (resultado oficial só pela API e dado parcial nunca é oficial), RB44 (efeitos da saída) |
| RNF | RNF03, RNF06, RNF07, RNF11, RNF13, RNF14; por extensão: RNF01 (acesso restrito a quem participa, ver OPEN-159) |
| Caso de uso | UC05, passo 8 (disponibilização dos resultados processados) |
| Entidades | Participacao, Palpite, Partida, Rodada, Bolao |
| Drivers | DA-01, DA-04 |
| ADRs | ADR-0005. Estruturais herdadas da fundação: ADR-0001, ADR-0004, ADR-0008 |

## 3. Escopo

**Incluído**

- Consulta do histórico de um bolão pelo participante, agrupado por rodada.
- Para cada partida: dados da partida, status, resultado oficial quando houver, palpite do próprio participante e pontos obtidos.
- Para cada rodada: pontos da rodada, pontuação acumulada e posição na classificação ao final da rodada.
- Resumo do bolão: posição atual ou final e pontuação total.
- Em bolão encerrado, resultado final congelado da SPEC-025.
- Consulta, por quem saiu do bolão, do histórico do período em que participou.

**Fora do escopo**

- Qualquer alteração de dados: palpites, resultados, pontuação, ranking e participações (SPEC-012, 013, 014, 015, 017).
- Dados ao vivo e parciais (SPEC-021), que nunca entram no histórico.
- Medalhas e encerramento de rodada em si (SPEC-016), notificações (SPEC-027), financeiro (SPEC-018 e seguintes).
- Exibição de palpites de outros participantes, além do que a SPEC-012 já permite (OPEN-18, OPEN-163).
- Exportação, estatísticas avançadas e comparação entre bolões.
- Histórico financeiro do usuário (SPEC-018, RF41).

## 4. Dependências

- **SPEC-012:** palpites do participante.
- **SPEC-013:** partidas, status e resultado oficial.
- **SPEC-014:** pontos por palpite.
- **SPEC-015:** regra de classificação e desempenho por rodada, reutilizada para as posições históricas.
- **Transitivas:** SPEC-001, 002, 003, 006, 007, 009, 010, 016, 017, 025.
- **Observação de direção:** esta Spec é uma visão de leitura; nenhuma Spec anterior depende dela (mapa, justificativa da posição).

## 5. Comportamento esperado

### 5.1 Consulta do histórico

- **Pré-condições:** usuário autenticado e participante confirmado do bolão, ou ex-participante limitado ao período em que participou (OPEN-162).
- **Fluxo principal:**
  1. O participante abre o histórico do bolão.
  2. O sistema valida o acesso no backend.
  3. O sistema apresenta, em ordem cronológica de rodada, as partidas selecionadas do bolão cujo início ocorreu durante a participação, cada uma com status, resultado oficial (se houver), palpite próprio (ou "sem palpite") e pontos obtidos.
  4. Para cada rodada, o sistema apresenta pontos da rodada, pontuação acumulada e posição na classificação ao final da rodada, calculadas pelas regras da SPEC-015.
  5. O sistema apresenta o resumo do bolão (posição atual ou final e pontuação total) e, se o bolão estiver encerrado, o resultado final congelado.
- **Pós-condição:** nenhum dado é alterado.

### 5.2 Fluxos alternativos e de exceção

- **A1 (sem partidas finalizadas):** o histórico mostra as partidas com seus status, sem resultados e sem pontos.
- **A2 (partida sem palpite):** a partida aparece como "sem palpite", com zero ponto, e sem inventar palpite.
- **A3 (partida adiada, cancelada ou suspensa):** aparece com o status recebido, sem resultado e sem pontos (OPEN-02, OPEN-165).
- **A4 (partida em andamento):** aparece como "em andamento", sem placar parcial; dados ao vivo não entram no histórico (OPEN-165).
- **A5 (resultado corrigido):** o histórico mostra o resultado oficial e os pontos atuais, já recalculados pelas SPEC-013 e SPEC-014 (OPEN-161).
- **A6 (bolão encerrado):** o resumo usa o resultado final congelado da SPEC-025, sem recalcular.
- **A7 (ex-participante):** o usuário que saiu vê só o histórico do período em que participou, em somente leitura; a classificação posterior à saída não é exibida (OPEN-162).
- **A8 (participação aprovada, mas não confirmada):** sem acesso ao histórico, como a quem ainda não participa.
- **E1:** usuário não autenticado: acesso negado.
- **E2:** usuário sem vínculo com o bolão, ou bolão inexistente: mesma resposta, sem revelar a existência do bolão.

## 6. Regras e invariantes

- **INV-001:** a consulta é somente leitura; o histórico é uma visão sobre dados das Specs de origem e nunca os altera.
- **INV-002:** só acessa o histórico quem participa do bolão (confirmado) e, após a saída, apenas o próprio período; não participantes não acessam (RNF01, RNF11).
- **INV-003:** a consulta nunca expõe palpites de outros participantes além do que a SPEC-012 já permite (OPEN-18).
- **INV-004:** o histórico exibe somente resultados oficiais; dados ao vivo e parciais nunca aparecem (RB29, RB30, RB31, SPEC-021).
- **INV-005:** pontos, pontuação acumulada e posições vêm das mesmas regras e dados das SPEC-014 e SPEC-015; o histórico nunca aplica regra própria de cálculo (RNF03).
- **INV-006:** a soma dos pontos das partidas de uma rodada é igual aos pontos da rodada, e a soma das rodadas é igual à pontuação acumulada exibida.
- **INV-007:** dados históricos não são excluídos nem editados pela consulta (RB64, texto a conferir).
- **INV-008:** em bolão encerrado, o resultado final exibido é o congelado da SPEC-025, sem recalcular (OPEN-138).
- **INV-009:** a ordem é determinística: rodadas em ordem cronológica e partidas por instante de início e identificador.
- **INV-010:** instantes são armazenados e comparados em UTC.
- **INV-011:** o acesso é validado no backend (ADR-0005); o frontend não decide permissão nem conteúdo.

## 7. Modelo de domínio envolvido

- **Bolao:** identificação, estado, período e, se encerrado, resultado final (SPEC-025); somente leitura.
- **Rodada:** agrupamento das partidas selecionadas do bolão; somente leitura.
- **Partida:** times, instante de início, status e resultado oficial; somente leitura.
- **Palpite:** placar palpitado e instante de envio do próprio participante, com pontos obtidos; somente leitura.
- **Participacao:** instante de confirmação, estado (confirmada ou saiu) e pontuação acumulada; somente leitura.
- O histórico é derivado desses dados; não cria entidade nem armazena cópias nesta Spec (OPEN-161). Sem modelo físico (OPEN-40).

## 8. Impacto arquitetural

- **Módulos:** histórico (consulta e composição), lendo palpites, partidas e resultados, pontuação e ranking.
- **Fronteiras:** só leitura; nenhuma escrita em outros módulos; nenhum módulo depende dele (ADR-0001).
- **Backend:** valida acesso, compõe a visão por rodada e reutiliza as regras da SPEC-015 para as posições.
- **Frontend:** tela de histórico por rodada, com resumo, partidas, palpites, pontos, rodada e posição, e estados de carregamento e vazio.
- **ADRs que restringem:** ADR-0005 (validação no backend), ADR-0001, ADR-0004, ADR-0008.

## 9. Contratos necessários (conceituais)

| Operação | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| Consultar histórico do bolão | usuário autenticado, bolão, filtro opcional de rodada e paginação | resumo (posição atual ou final, pontuação total, resultado final se encerrado) e, por rodada: partidas (status, resultado oficial, palpite próprio, pontos), pontos da rodada, acumulado e posição | não autenticado; sem vínculo ou bolão inexistente (mesma resposta) |

- Formato dos erros e códigos: conforme OPEN-53 (SPEC-003) e acesso conforme OPEN-65.
- Contrato de persistência: nenhum, pois a Spec só lê (OPEN-161).

## 10. Requisitos não funcionais aplicáveis

| RNF | Como é verificado |
| --- | --- |
| RNF03 | Teste de consistência: pontos por partida, por rodada e acumulado coincidem com os da SPEC-014 e da SPEC-015; critério exato a conferir (OPEN-159). |
| RNF06 e RNF07 | Verificação conforme os critérios definidos nos RNFs, a conferir (OPEN-159); em particular, teste de resposta da consulta paginada com volume realista de rodadas e partidas. |
| RNF11 | Teste de que só participantes veem o histórico e de que nenhum palpite alheio é exposto. |
| RNF13 e RNF14 | Aplicados ao fluxo de ranking e histórico (mapa, seção 3.3); verificação conforme os critérios definidos nos RNFs, a conferir (OPEN-159). |
| RNF01 (extensão) | Teste de acesso negado sem autenticação e sem vínculo. |

## 11. Critérios de aceitação

- **CA-01 (consulta):** Dado um participante confirmado de bolão com partidas finalizadas, Quando abre o histórico, Então vê, por rodada, as partidas com resultado oficial, seu palpite e os pontos obtidos.
- **CA-02 (rodada):** Dado uma rodada, Quando exibida, Então mostra pontos da rodada, pontuação acumulada e posição ao final da rodada, calculados pelas regras da SPEC-015.
- **CA-03 (consistência):** Dado qualquer histórico, Quando exibido, Então a soma dos pontos das partidas é igual aos pontos da rodada, e a soma das rodadas é igual à pontuação acumulada.
- **CA-04 (sem palpite):** Dado uma partida em que o participante não palpitou, Quando exibida, Então aparece "sem palpite" com zero ponto.
- **CA-05 (partida especial):** Dado partida adiada, cancelada ou suspensa, Quando exibida, Então mostra o status, sem resultado e sem pontos.
- **CA-06 (sem ao vivo):** Dado partida em andamento, Quando o histórico é exibido, Então aparece como "em andamento", sem placar parcial.
- **CA-07 (correção):** Dado resultado oficial corrigido, Quando o histórico é consultado, Então mostra o resultado e os pontos atuais.
- **CA-08 (encerrado):** Dado bolão encerrado, Quando o histórico é consultado, Então o resumo mostra o resultado final congelado da SPEC-025.
- **CA-09 (ex-participante):** Dado usuário que saiu do bolão, Quando consulta, Então vê somente o histórico do período em que participou, em somente leitura.
- **CA-10 (não confirmado):** Dado participação aprovada e não confirmada, Quando tenta consultar, Então recebe a mesma resposta de quem não participa.
- **CA-11 (acesso):** Dado usuário sem vínculo ou sem autenticação, Quando consulta, Então é negado ou recebe resposta de bolão inexistente.
- **CA-12 (palpites alheios):** Dado qualquer consulta, Quando exibida, Então nenhum palpite de outro participante é exposto além do permitido pela SPEC-012.
- **CA-13 (somente leitura):** Dado qualquer consulta, Quando concluída, Então nenhum dado é criado, alterado ou excluído.
- **CA-14 (ordem):** Dado qualquer histórico, Quando exibido, Então rodadas e partidas seguem a ordem cronológica determinística.
- **CA-15 (paginação e filtro):** Dado um bolão com muitas rodadas, Quando o histórico é consultado, Então a resposta é paginada e pode ser filtrada por rodada sem perder a consistência dos totais.
- **CA-16 (período):** Dado participante que entrou após o início de rodadas, Quando consulta, Então as partidas iniciadas antes de sua confirmação não são listadas.

## 12. Casos de teste derivados

Não implementar nesta etapa.

- **CT-01:** histórico com partidas finalizadas, palpites e pontos (CA-01).
- **CT-02:** pontos da rodada, acumulado e posição pela regra da SPEC-015 (CA-02, INV-005).
- **CT-03:** consistência entre soma por partida, rodada e acumulado (CA-03, INV-006).
- **CT-04:** partida sem palpite (CA-04).
- **CT-05:** partida adiada, cancelada e suspensa (CA-05).
- **CT-06:** partida em andamento sem placar parcial e sem dado ao vivo (CA-06, INV-004).
- **CT-07:** resultado corrigido refletido no histórico (CA-07).
- **CT-08:** bolão encerrado exibe resultado final congelado (CA-08, INV-008).
- **CT-09:** ex-participante vê só o próprio período e em somente leitura (CA-09).
- **CT-10:** participação aprovada e não confirmada sem acesso (CA-10).
- **CT-11:** acesso sem autenticação e sem vínculo (CA-11, INV-002).
- **CT-12:** nenhum palpite alheio exposto (CA-12, INV-003).
- **CT-13:** a consulta não altera nenhum dado (CA-13, INV-001).
- **CT-14:** ordem determinística de rodadas e partidas (CA-14, INV-009).
- **CT-15:** paginação e filtro por rodada com totais consistentes (CA-15).
- **CT-16:** entrada tardia omite partidas anteriores à confirmação (CA-16).
- **CT-17:** carga com volume realista de rodadas e partidas (RNF06, RNF07).

## 13. Questões em aberto

> Cada item traz uma **proposta para aprovação**, no mesmo padrão das Specs anteriores. Se a baseline já decidir algo diferente, a baseline prevalece.

- **OPEN-159 - confirmação necessária:** conferir esta Spec contra o texto integral de RF40, RB64, UC05 (passo 8), as SPEC-012, 013, 014 e 015 aprovadas, as decisões aprovadas de OPEN-18, OPEN-34, OPEN-78 e OPEN-79 e os critérios de RNF03, RNF06, RNF07, RNF13 e RNF14, que não estavam disponíveis na geração. Confirmar também a inclusão de RNF01 por extensão. *Proposta:* ajustar os critérios afetados após a conferência.
- **OPEN-160 - decisão necessária:** definir o conteúdo e o período do histórico. *Proposta:* partidas selecionadas do bolão, agrupadas por rodada, cujo início ocorreu entre a confirmação da participação e a saída ou o encerramento; partidas iniciadas antes da confirmação não são listadas; cada partida mostra status, resultado oficial, palpite próprio e pontos; cada rodada mostra pontos, acumulado e posição; o resumo mostra posição e pontuação total.
- **OPEN-161 - decisão necessária:** definir a origem e a consistência dos dados. *Proposta:* tudo é derivado dos dados persistidos, sem cópias nem snapshots; a posição ao final de cada rodada é calculada cumulativamente pelas regras da SPEC-015 (OPEN-78, OPEN-79); correções de resultado são refletidas no valor atual, e a posição histórica pode mudar retroativamente enquanto o bolão estiver ativo; em bolão encerrado vale o resultado final congelado (OPEN-138).
- **OPEN-162 - decisão necessária:** definir quem acessa. *Proposta:* participante confirmado acessa; quem saiu acessa em somente leitura apenas o período em que participou; participação aprovada e não confirmada não acessa; não membro recebe a mesma resposta de bolão inexistente (OPEN-65); a administração não tem visão do histórico de outros participantes.
- **OPEN-163 - decisão necessária:** definir a visibilidade de palpites de outros e do ranking (OPEN-18, OPEN-34). *Proposta:* o histórico mostra só os palpites do próprio participante; a classificação segue a visibilidade já definida na SPEC-015, sem expor palpites de terceiros; qualquer ampliação depende de decisão da OPEN-18 aprovada.
- **OPEN-164 - decisão necessária:** definir ordenação, paginação e filtros. *Proposta:* rodadas em ordem cronológica, partidas por instante de início e identificador, paginação por rodada, filtro por rodada e totais consistentes independentemente da página.
- **OPEN-165 - decisão necessária:** definir a exibição de partidas especiais. *Proposta:* adiada, cancelada e suspensa aparecem com o status recebido, sem resultado e sem pontos (OPEN-02); em andamento aparece sem placar parcial; só resultado oficial é exibido.
- **OPEN-166 - decisão necessária:** definir auditoria e logs. *Proposta:* a consulta não é auditada; falhas de leitura vão ao log técnico, sem segredos.

## 14. Definition of Done

A SPEC-028 está concluída quando:

1. todos os critérios de aceitação (CA-01 a CA-16) estiverem implementados;
2. todos os invariantes (INV-001 a INV-011) estiverem preservados;
3. os casos de teste derivados (CT-01 a CT-17) estiverem aprovados;
4. os RNFs aplicáveis (RNF03, RNF06, RNF07, RNF11, RNF13, RNF14 e RNF01 por extensão) tiverem sido verificados;
5. não existir divergência conhecida entre implementação e esta Spec;
6. toda divergência em relação à baseline tiver sido explicitamente analisada e decidida pela equipe humana.

**Regra fundamental:** a implementação obedece à Spec aprovada. Em conflito entre código, Spec e documentos de modelagem, registra-se a divergência e escolhe-se entre corrigir a implementação ou propor alteração da baseline para aprovação humana.
