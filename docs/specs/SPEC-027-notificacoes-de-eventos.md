# SPEC-027 — Notificações de eventos

- **Status:** aprovada em 31/10/2026. As questões OPEN-151 a OPEN-158 foram resolvidas com a aprovação desta Spec, nos termos das propostas da seção 13.
- **Etapa:** Spec-Driven Development, geração de Spec individual. Nenhum código, banco de dados, endpoint ou tecnologia nova é definido aqui.
- **Fonte de verdade:** `mapa-de-specs.md` (aprovado) e artefatos de `docs/`.

> **Nota de rastreabilidade:** ao gerar esta Spec, o texto integral de RF39, dos casos de uso UC02, UC03, UC05 e UC07 (de onde vêm os eventos), das SPEC-010, 013, 016, 019, 020 e 026 e a redação final da decisão aprovada para OPEN-32 e o critério de RNF06 não estavam disponíveis. O conteúdo abaixo foi derivado do mapa de Specs, das Specs aprovadas nesta conversa e dos registros de OPEN-XX. Tudo que depende desses textos está marcado como OPEN-XX, com proposta, para conferência (ver OPEN-151).

---

## 1. Identificação

- **ID:** SPEC-027
- **Nome:** Notificações de eventos
- **Objetivo:** disponibilizar ao usuário notificações dos eventos relevantes: aprovação de entrada, atualização de resultado, encerramento de rodada, medalha, alteração de assinatura e conclusão de premiação.
- **Valor entregue:** o usuário é avisado sem precisar consultar cada tela, sem que nenhuma Spec anterior dependa das notificações.

## 2. Rastreabilidade

| Tipo | Itens |
| --- | --- |
| RF | RF39 |
| RB | nenhuma regra de negócio específica (o mapa indica "—"); contexto: RB58 e a decisão de não notificar atualizações ao vivo (SPEC-021, OPEN-103) |
| RNF | RNF01, RNF06, RNF11 |
| Caso de uso | nenhum caso de uso próprio; os eventos vêm de UC02 (assinatura), UC03 (entrada), UC05 (resultados, rodada e medalhas) e UC07 (premiação) |
| Entidades | Notificacao, Usuario |
| Drivers | DA-04 |
| ADRs | ADR-0001. Estruturais herdadas da fundação: ADR-0004, ADR-0005, ADR-0006 (agendador), ADR-0008 |

## 3. Escopo

**Incluído**

- Geração automática de notificações para os seis eventos do RF39:
  1. aprovação de entrada (SPEC-010);
  2. atualização de resultado oficial (SPEC-013);
  3. encerramento de rodada (SPEC-016);
  4. medalha concedida (SPEC-016);
  5. alteração de assinatura (SPEC-019 e SPEC-020);
  6. conclusão de premiação (SPEC-026).
- Consulta das próprias notificações pelo usuário, com indicação de lida ou não lida e contagem de não lidas.
- Marcação de notificações como lidas pelo próprio usuário.
- Conteúdo padronizado em texto, dentro da aplicação.

**Fora do escopo**

- Qualquer canal externo (e-mail, mensagem, push), por não haver provedor de envio escolhido (OPEN-07, OPEN-32).
- Notificação de atualizações ao vivo (SPEC-021, OPEN-103).
- Eventos fora do RF39: pagamento da taxa, devolução, encerramento do bolão e vencedor, rejeição de entrada, saída, convites e demais (OPEN-153).
- Alteração de qualquer dado das Specs de origem.
- Histórico do bolão (SPEC-028) e histórico financeiro (SPEC-018, RF41).
- Preferências de notificação por usuário e exclusão de notificações (OPEN-156).

## 4. Dependências

- **SPEC-010:** aprovação de entrada.
- **SPEC-013:** resultado oficial registrado e corrigido.
- **SPEC-016:** rodada encerrada e medalha concedida.
- **SPEC-019 e SPEC-020:** ativação, recusa, cancelamento e expiração da assinatura.
- **SPEC-026:** premiação concluída.
- **Transitivas:** SPEC-001, 002, 003, 007, 009, 012, 014, 015, 018, 021, 022, 025.
- **Observação de direção:** esta Spec só observa estados já estabelecidos; nenhuma Spec anterior depende dela (mapa, justificativa da posição).

## 5. Comportamento esperado

### 5.1 Geração de notificações

- **Pré-condições:** existe pelo menos um evento relevante ainda sem notificação para algum destinatário.
- **Fluxo principal:**
  1. Uma tarefa agendada própria (ADR-0006, OPEN-155) examina os estados já estabelecidos pelas Specs de origem.
  2. Para cada evento relevante sem notificação, o sistema determina os destinatários no backend (OPEN-153).
  3. O sistema cria uma notificação não lida para cada destinatário, com tipo, texto padronizado, referência ao objeto de origem e instante em UTC.
  4. A criação é idempotente por chave natural do evento e do destinatário (OPEN-155).
- **Pós-condição:** notificações disponíveis na lista do destinatário; nenhum dado de origem alterado.

### 5.2 Eventos e destinatários (proposta, OPEN-153)

| Evento | Origem | Destinatários |
| --- | --- | --- |
| Aprovação de entrada | SPEC-010 | O usuário cuja entrada foi aprovada |
| Atualização de resultado | SPEC-013 | Participantes confirmados do bolão que têm palpite na partida, por resultado oficial registrado ou corrigido (OPEN-154) |
| Encerramento de rodada | SPEC-016 | Participantes confirmados do bolão da rodada encerrada |
| Medalha | SPEC-016 | Participantes que receberam a medalha |
| Alteração de assinatura | SPEC-019, SPEC-020 | O titular da assinatura, nas mudanças de estado: ativada, recusada, cancelada e expirada |
| Conclusão de premiação | SPEC-026 | O vencedor cuja premiação foi confirmada, com indicação de simulação quando for o caso |

### 5.3 Consulta e leitura

- **Consulta:** o usuário autenticado vê as próprias notificações, da mais recente para a mais antiga, com paginação e contagem de não lidas.
- **Marcar como lida:** o usuário marca uma notificação própria como lida, ou todas as suas de uma vez; marcar de novo é inofensivo.

### 5.4 Fluxos alternativos e de exceção

- **A1 (sem notificações):** lista vazia e contagem zero.
- **A2 (evento repetido):** a mesma mudança observada em ciclos seguintes não gera nova notificação.
- **A3 (falha em um evento):** a falha em criar a notificação de um evento não impede os demais e é reavaliada no ciclo seguinte; nada é desfeito na operação de origem.
- **A4 (atualização ao vivo):** dados parciais da SPEC-021 nunca geram notificação.
- **A5 (correção de resultado):** a correção do resultado oficial gera nova notificação própria, diferente da original (OPEN-154).
- **A6 (usuário saiu do bolão):** as notificações já geradas continuam na lista do usuário, sem dar acesso ao bolão.
- **E1:** usuário não autenticado: acesso negado.
- **E2:** notificação inexistente ou de outro usuário: mesma resposta de inexistente, sem revelar nada.

## 6. Regras e invariantes

- **INV-001:** cada notificação pertence a exatamente um usuário, que é o único que a consulta ou altera (RNF01, RNF11).
- **INV-002:** o mesmo evento gera no máximo uma notificação por destinatário; reexecutar a tarefa não duplica.
- **INV-003:** a geração apenas observa estados já estabelecidos; não altera dados das Specs de origem, e falha na geração nunca desfaz nem bloqueia a operação de origem.
- **INV-004:** só os eventos do RF39 geram notificação; atualizações ao vivo e dados parciais nunca geram (SPEC-021, OPEN-103).
- **INV-005:** os destinatários são determinados pelo backend a partir do estado do evento, nunca informados pelo cliente, e a notificação não revela dado que o destinatário não poderia ver (RNF11).
- **INV-006:** o conteúdo preserva a identificação de simulação: operação ou premiação simulada nunca é notificada como confirmação do provedor (ADR-0003).
- **INV-007:** o conteúdo é padronizado e não contém credenciais, segredos nem valores financeiros de movimentações (RNF15, OPEN-152).
- **INV-008:** o canal é único e interno à aplicação; nenhum envio externo é feito (OPEN-32).
- **INV-009:** instantes são armazenados e apresentados em UTC, padrão do projeto.
- **INV-010:** o estado lida é por notificação; marcar como lida é idempotente e não há retorno ao estado não lida nesta Spec (OPEN-156).
- **INV-011:** a notificação é um aviso, não fonte de verdade: o estado real é o da Spec de origem.
- **INV-012:** as regras são validadas no backend (ADR-0005); o frontend não decide destinatário nem conteúdo.

## 7. Modelo de domínio envolvido

- **Notificacao:** pertence a um Usuario (destinatário); atributos relevantes: tipo, texto padronizado, referência ao objeto de origem (bolão, rodada, partida, assinatura ou premiação), instante em UTC e indicador de lida; identificada, para idempotência, pela chave natural do evento e do destinatário.
- **TipoNotificacao** (proposta, OPEN-152): entrada aprovada, resultado atualizado, rodada encerrada, medalha concedida, assinatura alterada, premiação concluída.
- **Usuario:** destinatário.
- **Objetos de origem:** lidos, nunca alterados (Participacao, Partida, Rodada, Medalha, Assinatura, MovimentacaoFinanceira de premiação).
- Sem modelo físico nesta Spec (OPEN-40); a persistência da notificação e da chave natural é decidida na implementação (OPEN-155).

## 8. Impacto arquitetural

- **Módulos:** notificações (geração, consulta, leitura), agendador (tarefa própria, ADR-0006); leitura de estados dos módulos de entrada, resultados, rodadas e medalhas, assinaturas e premiação.
- **Fronteiras:** módulo de notificações só lê os demais; nenhuma Spec de origem o chama (ADR-0001, monólito modular).
- **Backend:** tarefa de geração, validação de acesso e de destinatário, consulta paginada e marcação de lida.
- **Frontend:** indicador de não lidas, lista de notificações e ação de marcar como lida.
- **ADRs que restringem:** ADR-0001 (monólito modular), ADR-0005, ADR-0006, ADR-0004, ADR-0008.

## 9. Contratos necessários (conceituais)

| Operação | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| Listar notificações | usuário autenticado, paginação e filtro opcional de não lidas | itens (identificador, tipo, texto, referência, instante UTC, lida) e contagem de não lidas | não autenticado |
| Marcar uma como lida | usuário autenticado e notificação | notificação atualizada | não autenticado; inexistente ou de outro usuário (mesma resposta) |
| Marcar todas como lidas | usuário autenticado | contagem atualizada | não autenticado |
| Gerar notificações (interna, agendada) | estado atual dos eventos de origem | notificações criadas | falha por evento isolada, reavaliada no próximo ciclo |

- Formato dos erros e códigos: conforme OPEN-53 (SPEC-003) e acesso conforme OPEN-65.
- Contrato de persistência: **OPEN-155** (não definido na baseline).

## 10. Requisitos não funcionais aplicáveis

| RNF | Como é verificado |
| --- | --- |
| RNF01 | Teste de que nenhuma notificação é acessível sem autenticação nem por outro usuário. |
| RNF06 | Verificação conforme o critério definido no RNF, a conferir (OPEN-151); em particular, teste de que a lista paginada responde dentro do critério e de que a notificação aparece no ciclo seguinte ao evento. |
| RNF11 | Teste de que cada usuário vê apenas as próprias notificações e de que o conteúdo não expõe dados que ele não poderia ver. |

## 11. Critérios de aceitação

- **CA-01 (entrada aprovada):** Dado que a entrada de um usuário foi aprovada, Quando a tarefa executa, Então o usuário recebe uma notificação "entrada aprovada" referenciando o bolão.
- **CA-02 (resultado):** Dado resultado oficial registrado para uma partida, Quando a tarefa executa, Então cada participante confirmado com palpite nessa partida recebe uma notificação de resultado.
- **CA-03 (correção):** Dado resultado oficial corrigido, Quando a tarefa executa, Então os mesmos destinatários recebem uma notificação distinta de correção.
- **CA-04 (rodada):** Dado rodada encerrada, Quando a tarefa executa, Então os participantes confirmados do bolão recebem uma notificação de rodada encerrada.
- **CA-05 (medalha):** Dado medalha concedida, Quando a tarefa executa, Então cada premiado recebe uma notificação de medalha.
- **CA-06 (assinatura):** Dado mudança de assinatura para ativada, recusada, cancelada ou expirada, Quando a tarefa executa, Então o titular recebe a notificação correspondente.
- **CA-07 (premiação):** Dado premiação confirmada, Quando a tarefa executa, Então o vencedor recebe uma notificação de conclusão e, se simulada, ela indica simulação.
- **CA-08 (ao vivo):** Dado dados parciais de partida em andamento, Quando a tarefa executa, Então nenhuma notificação é criada.
- **CA-09 (idempotência):** Dado um evento já notificado, Quando a tarefa executa de novo, Então nenhuma notificação duplicada é criada.
- **CA-10 (isolamento da origem):** Dado falha na geração de uma notificação, Quando a tarefa executa, Então a operação de origem permanece íntegra e os demais eventos são processados.
- **CA-11 (listagem):** Dado um usuário com notificações, Quando consulta, Então vê só as próprias, da mais recente para a mais antiga, com contagem de não lidas.
- **CA-12 (leitura):** Dado uma notificação não lida, Quando o usuário a marca como lida, Então ela passa a lida e a contagem diminui; marcar de novo não altera nada.
- **CA-13 (todas lidas):** Dado várias não lidas, Quando o usuário marca todas, Então todas as suas passam a lidas e as de outros usuários não mudam.
- **CA-14 (acesso):** Dado usuário não autenticado ou outro usuário, Quando tenta consultar ou marcar notificação alheia, Então é negado ou recebe resposta de inexistente.
- **CA-15 (conteúdo):** Dado qualquer notificação, Quando exibida, Então o conteúdo é padronizado e não contém credenciais, segredos nem valores financeiros.
- **CA-16 (saída do bolão):** Dado usuário que saiu do bolão, Quando consulta suas notificações, Então as já geradas continuam disponíveis sem dar acesso ao bolão.
- **CA-17 (sem canal externo):** Dado qualquer evento, Quando a notificação é criada, Então nenhum envio externo é feito.

## 12. Casos de teste derivados

Não implementar nesta etapa.

- **CT-01:** notificação de entrada aprovada (CA-01).
- **CT-02:** notificação de resultado para quem tem palpite e não para quem não tem (CA-02, INV-005).
- **CT-03:** correção de resultado gera notificação distinta (CA-03).
- **CT-04:** rodada encerrada notifica participantes confirmados (CA-04).
- **CT-05:** medalha notifica premiados (CA-05).
- **CT-06:** cada mudança de assinatura (ativada, recusada, cancelada, expirada) notifica o titular (CA-06).
- **CT-07:** premiação concluída e premiação simulada identificada (CA-07, INV-006).
- **CT-08:** atualização ao vivo não gera notificação (CA-08, INV-004).
- **CT-09:** reexecução da tarefa sem duplicidade (CA-09, INV-002).
- **CT-10:** falha em uma notificação não afeta a origem nem as demais (CA-10, INV-003).
- **CT-11:** listagem ordenada, paginada e contagem de não lidas (CA-11).
- **CT-12:** marcar como lida é idempotente (CA-12, INV-010).
- **CT-13:** marcar todas só afeta as do usuário (CA-13).
- **CT-14:** acesso sem autenticação e a notificação alheia (CA-14, INV-001).
- **CT-15:** conteúdo sem segredos, credenciais e valores (CA-15, INV-007).
- **CT-16:** notificações permanecem após a saída do bolão sem dar acesso (CA-16).
- **CT-17:** nenhum envio externo (CA-17, INV-008).
- **CT-18:** a Spec de origem não é alterada pela geração (INV-003, INV-011).

## 13. Questões em aberto

> Cada item traz uma **proposta para aprovação**, no mesmo padrão das Specs anteriores. Se a baseline já decidir algo diferente, a baseline prevalece.

- **OPEN-151 - confirmação necessária:** conferir esta Spec contra o texto integral de RF39, dos casos de uso UC02, UC03, UC05 e UC07, das SPEC-010, 013, 016, 019, 020 e 026 aprovadas, da decisão aprovada de OPEN-32 e do critério de RNF06, que não estavam disponíveis na geração. *Proposta:* ajustar os critérios afetados após a conferência.
- **OPEN-152 - decisão necessária:** definir canal, tipos e conteúdo (OPEN-32). *Proposta:* canal único dentro da aplicação; tipos entrada aprovada, resultado atualizado, rodada encerrada, medalha concedida, assinatura alterada e premiação concluída; texto padronizado em português com referência ao objeto, sem valores financeiros nem dados de provedor, e com indicação de simulação quando houver.
- **OPEN-153 - decisão necessária:** definir eventos e destinatários, e o que fica de fora da lista do RF39. *Proposta:* destinatários conforme a tabela da seção 5.2; ficam fora de escopo pagamento da taxa, devolução, rejeição de entrada, saída, encerramento do bolão e vencedor, convites e cancelamento pendente.
- **OPEN-154 - decisão necessária:** definir se cada atualização de resultado gera notificação (OPEN-32). *Proposta:* uma notificação por resultado oficial registrado e outra por correção, apenas para participantes confirmados com palpite na partida; atualizações ao vivo nunca notificam.
- **OPEN-155 - decisão necessária:** definir o mecanismo de geração e a persistência. *Proposta:* tarefa própria do agendador (ADR-0006), a cada 1 minuto como em OPEN-76 e OPEN-81; varredura idempotente por chave natural do evento e do destinatário; não retroativa, sem atributos de controle nas Specs de origem; falha isolada por evento.
- **OPEN-156 - decisão necessária:** definir estado e consulta. *Proposta:* estado lida e não lida, marcação individual e de todas, lista da mais recente para a mais antiga com paginação e contagem de não lidas; sem exclusão pelo usuário, sem preferências de notificação e sem prazo de retenção no protótipo.
- **OPEN-157 - decisão necessária:** definir acesso e privacidade. *Proposta:* só o destinatário acessa; notificação de terceiros recebe a mesma resposta de inexistente (OPEN-65); as geradas permanecem após a saída do bolão, sem dar acesso a ele; o conteúdo nunca revela dado fora da visão do destinatário.
- **OPEN-158 - decisão necessária:** definir auditoria e logs. *Proposta:* não auditar geração nem leitura de notificações (derivadas e de alto volume); falhas e ciclos relevantes vão ao log técnico, sem segredos.

## 14. Definition of Done

A SPEC-027 está concluída quando:

1. todos os critérios de aceitação (CA-01 a CA-17) estiverem implementados;
2. todos os invariantes (INV-001 a INV-012) estiverem preservados;
3. os casos de teste derivados (CT-01 a CT-18) estiverem aprovados;
4. os RNFs aplicáveis (RNF01, RNF06, RNF11) tiverem sido verificados;
5. não existir divergência conhecida entre implementação e esta Spec;
6. toda divergência em relação à baseline tiver sido explicitamente analisada e decidida pela equipe humana.

**Regra fundamental:** a implementação obedece à Spec aprovada. Em conflito entre código, Spec e documentos de modelagem, registra-se a divergência e escolhe-se entre corrigir a implementação ou propor alteração da baseline para aprovação humana.
