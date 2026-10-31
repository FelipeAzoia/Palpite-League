# SPEC-024 — Processamento da devolução no provedor de teste

- **Status:** aprovada em 30/10/2026. As questões OPEN-125 a OPEN-133 foram resolvidas com a aprovação desta Spec, nos termos das propostas da seção 13.
- **Etapa:** Spec-Driven Development, geração de Spec individual. Nenhum código, banco de dados, endpoint ou tecnologia nova é definido aqui.
- **Fonte de verdade:** `mapa-de-specs.md` (aprovado) e artefatos de `docs/`.

> **Nota de rastreabilidade:** ao gerar esta Spec, o texto integral de RF34, RF31, RB47, RB53, RB54, do UC06 (passos 4 a 6 e exceções A4, A5 e A6), da SPEC-018 e a redação final das decisões aprovadas para OPEN-22, OPEN-27, OPEN-28 e OPEN-36 não estavam disponíveis. O conteúdo abaixo foi derivado do mapa de Specs, da SPEC-023 aprovada e dos registros de OPEN-XX. Tudo que depende desses textos está marcado como OPEN-XX, com proposta, para conferência (ver OPEN-125).

---

## 1. Identificação

- **ID:** SPEC-024
- **Nome:** Processamento da devolução no provedor de teste
- **Objetivo:** encaminhar ao provedor de teste a devolução aprovada, manter o estado pendente até confirmação verificável, registrar recusa ou conclusão e consultar o estado antes de qualquer nova tentativa.
- **Valor entregue:** devolução aprovada concluída com rastreabilidade, ou claramente pendente ou recusada, sem duplicidade e sem apresentar simulação como confirmação do provedor.

## 2. Rastreabilidade

| Tipo | Itens |
| --- | --- |
| RF | RF34 (início do processo de devolução financeira), RF31 |
| RB | RB47, RB53, RB54; contexto: RB45 e RB46 (devolução só após autorização e confirmação do provedor) |
| RNF | RNF02, RNF04, RNF09, RNF10, RNF15, RNF16; por extensão: RNF11 (acesso ao estado da devolução, ver OPEN-125) |
| Caso de uso | UC06: fluxo de devolução, passos 4 a 6, e exceções A4, A5 e A6 (recusa, pendência e indisponibilidade, conforme o objetivo; mapeamento exato a conferir, OPEN-125) |
| Entidades | SolicitacaoDevolucao, MovimentacaoFinanceira (a Carteira é reservada, OPEN-22) |
| Drivers | DA-03 |
| ADRs | ADR-0003. Estruturais herdadas da fundação: ADR-0001, ADR-0004, ADR-0005, ADR-0006, ADR-0008 |

## 3. Escopo

**Incluído**

- Início do processamento de pedido de devolução aprovado na SPEC-023.
- Registro da movimentação de devolução como nova movimentação, com chave de operação idempotente.
- Envio ao provedor de teste (ou simulador identificado), referenciando a transação original.
- Estados da devolução: pendente, confirmada, recusada.
- Manutenção do estado pendente até confirmação verificável, inclusive em indisponibilidade ou resposta ambígua.
- Nova tentativa somente após recusa, com consulta do estado da tentativa anterior.
- Consulta do estado da devolução pelo solicitante e pela administração do bolão.
- Identificação visível de qualquer devolução simulada.

**Fora do escopo**

- Solicitação, decisão e autorização da devolução (SPEC-023).
- Saída do bolão (SPEC-017) e pagamento da taxa (SPEC-022).
- Núcleo financeiro, porta de pagamentos e conferência de pendentes em si (SPEC-018); aqui são apenas usados.
- Recálculo do montante da premiação e do vencedor (SPEC-025, OPEN-13).
- Saldo ou carteira simulada (OPEN-22).
- Devolução parcial e devolução automática sem autorização (vedadas pela baseline e pela ADR-0003).
- Notificação da conclusão (SPEC-027).
- Teste real de compatibilidade do reembolso com o Checkout Pro (OPEN-27, responsabilidade da equipe).

## 4. Dependências

- **SPEC-023:** pedido aprovado e autorização registrada, único gatilho de processamento.
- **SPEC-018:** registro idempotente, porta de pagamentos, tratador por tipo, conferência de pendentes e simulador identificado.
- **Transitivas:** SPEC-001, 002, 003, 017, 022 (movimentação de origem confirmada) e SPEC-013 (agendador).
- **Decisões:** ADR-0003 (provedor em teste, sem repetição automática de reembolso, simulador sempre identificado). Até a validação do reembolso no sandbox (OPEN-27), vale o simulador identificado.

## 5. Comportamento esperado

### 5.1 Início do processamento

- **Pré-condições:** pedido de devolução aprovado, sem nenhuma tentativa de devolução registrada, com movimentação de taxa de entrada de origem confirmada e sem devolução ativa (pendente ou confirmada).
- **Fluxo principal:**
  1. A tarefa agendada identifica pedidos aprovados sem tentativa (OPEN-126).
  2. O sistema valida valor, movimentação de origem e ausência de devolução ativa.
  3. O sistema registra uma movimentação de devolução em estado pendente, com chave de operação que inclui o número da tentativa, vinculada a usuário, bolão, pedido e movimentação de origem, e registra a auditoria com o sistema como ator.
  4. O sistema envia a devolução ao provedor de teste (ou simulador identificado) referenciando a transação original.
  5. A devolução permanece pendente até confirmação verificável.
- **Pós-condição:** movimentação de devolução pendente registrada; nenhuma devolução é apresentada como concluída ainda.

### 5.2 Confirmação ou recusa

- **Gatilho:** retorno do provedor e/ou conferência de pendentes (SPEC-018), com resultado verificável (OPEN-127).
- **Fluxo principal (confirmação):** a movimentação passa a confirmada, o estado exibido do pedido passa a "concluída" e a auditoria é registrada, na mesma transação.
- **Fluxo principal (recusa):** a movimentação passa a recusada, o estado exibido passa a "recusada" e nada é repetido automaticamente.

### 5.3 Fluxos alternativos e de exceção

- **A1 (devolução recusada):** a movimentação fica recusada e o pedido continua aprovado; nova tentativa só pela administração (A4).
- **A2 (pendente):** o estado permanece pendente; a conferência de pendentes e o retorno do provedor resolvem. Não é criada nova movimentação.
- **A3 (provedor indisponível, tempo esgotado ou resposta ambígua):** como não se sabe se o provedor processou o pedido, o estado permanece pendente, nunca recusada nem concluída por suposição, e a conferência posterior resolve (OPEN-127).
- **A4 (nova tentativa):** só após recusa; administrador ou coadministrador do bolão solicita; antes de criar a nova movimentação, o sistema consulta o estado da anterior e, se estiver pendente ou confirmada, não cria outra (OPEN-129).
- **A5 (confirmação repetida):** retorno, notificação ou conferência repetidos da mesma operação não têm efeito adicional.
- **A6 (transação original não reembolsável):** se o provedor informar que a transação original não admite devolução, a movimentação fica recusada com o motivo registrado (OPEN-128).
- **A7 (valor divergente):** se a resposta do provedor indicar valor diferente do aprovado, a devolução não é confirmada: permanece pendente e sinalizada como inconsistente (OPEN-130).
- **A8 (pré-condição interna violada):** pedido não aprovado, movimentação de origem não confirmada ou devolução ativa já existente: nada é enviado e o caso é registrado no log técnico.
- **E1:** usuário não autenticado, sem vínculo com o pedido ou o bolão: acesso negado, sem revelar a existência do pedido.
- **E2:** membro sem permissão de administração tenta nova tentativa: negado e auditado (OPEN-133).
- **E3:** nova tentativa sem recusa anterior, com tentativa pendente ou já concluída: conflito de estado.

## 6. Regras e invariantes

- **INV-001:** só é processada devolução de pedido aprovado com autorização registrada na SPEC-023 (RB47, RB46, ADR-0003).
- **INV-002:** o valor da devolução é o valor elegível aprovado, nunca superior ao valor da taxa confirmada, e há no máximo uma devolução ativa (pendente ou confirmada) por pedido.
- **INV-003:** a devolução é feita na transação original do pagamento (UC06), sem uso de saldo ou carteira (OPEN-22).
- **INV-004:** a devolução é uma nova movimentação, que não altera a movimentação de origem, vinculada a usuário, bolão, pedido e operação (RB53, RB54, RF31, OPEN-84).
- **INV-005:** o estado pendente permanece até confirmação verificável; indisponibilidade, tempo esgotado ou resposta ambígua nunca produzem "recusada" nem "concluída" por suposição (ADR-0003).
- **INV-006:** antes de qualquer nova tentativa, o estado da anterior é consultado; nova tentativa só após recusa confirmada, com o número de tentativa seguinte (ADR-0003, OPEN-84).
- **INV-007:** não há repetição automática de devolução: nenhuma tarefa cria nova tentativa, apenas confere pendentes (ADR-0003).
- **INV-008:** a confirmação é idempotente: repetir a mesma confirmação não duplica movimentação nem efeitos (RNF09).
- **INV-009:** o registro do resultado e a atualização do estado ocorrem na mesma transação (RNF02).
- **INV-010:** simulação é sempre identificada e nunca apresentada como confirmação do provedor, inclusive devolução simulada "concluída" (ADR-0003, RNF15).
- **INV-011:** sem dinheiro real e sem credenciais de produção; segredos fora do repositório (RNF15, ADR-0008).
- **INV-012:** datas em UTC e auditoria com ator, ação, objeto e resultado, com o sistema como ator nas ações automáticas e sem segredos (RNF04, RNF16).
- **INV-013:** as regras são validadas no backend (ADR-0005); o frontend não decide elegibilidade, valor nem estado.
- **INV-014:** esta Spec não aprova nem rejeita pedidos (SPEC-023) e não recalcula premiação nem vencedor (SPEC-025).

## 7. Modelo de domínio envolvido

- **SolicitacaoDevolucao:** pedido aprovado na SPEC-023; mantém os estados pendente, aprovada e rejeitada. O estado de processamento exibido (aguardando processamento, em processamento, concluída, recusada) é derivado das movimentações de devolução do pedido (OPEN-131).
- **MovimentacaoFinanceira:** tipo devolução, valor em centavos inteiros em BRL, estado (pendente, confirmada, recusada), número da tentativa, chave de operação, referência ao pedido, à movimentação de origem e ao provedor ou simulador, vínculo com usuário e bolão (OPEN-84, OPEN-85).
- **Relacionamentos:** um pedido aprovado tem uma ou mais movimentações de devolução (tentativas), no máximo uma ativa por vez; cada devolução referencia a movimentação de taxa de origem.
- A Carteira é reservada e não é usada (OPEN-22). Sem modelo físico nesta Spec (OPEN-40).

## 8. Impacto arquitetural

- **Módulos:** financeiro (registro, idempotência, porta de pagamentos, tratador de devolução, conferência de pendentes), devoluções (pedido e estado exibido), agendador (início do processamento e conferência), auditoria (SPEC-002).
- **Fronteiras:** a SPEC-023 decide; a SPEC-024 executa. O núcleo financeiro não conhece regras do bolão.
- **Integração:** provedor de pagamentos via adaptador isolado (ADR-0003); adaptador real condicionado à validação do reembolso no sandbox (OPEN-27); até lá, simulador identificado.
- **Backend:** valida pré-condições, registra, envia, confere e atualiza estados em transação.
- **Frontend:** exibição do estado da devolução ao solicitante e à administração, indicação de simulação e ação "nova tentativa" para a administração após recusa.
- **ADRs que restringem:** ADR-0003 (sem repetição automática, simulador identificado, devolução validada por operação), ADR-0005, ADR-0006 (agendador), ADR-0001, ADR-0004, ADR-0008.

## 9. Contratos necessários (conceituais)

| Operação | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| Processar devolução aprovada (interna, agendada) | pedido aprovado sem tentativa | movimentação de devolução pendente e envio ao provedor | pré-condição violada; provedor indisponível ou ambíguo (mantém pendente) |
| Confirmar ou recusar devolução (interna) | referência da operação e resultado verificável | transição da movimentação e do estado exibido | operação desconhecida; resultado inconsistente ou valor divergente |
| Conferir pendentes (interna, agendada) | movimentações de devolução pendentes | estados atualizados | provedor indisponível: mantém pendente |
| Solicitar nova tentativa | usuário autenticado (administração) e pedido | nova movimentação pendente | não autenticado; sem permissão; não membro; sem recusa anterior, pendente ou concluída |
| Consultar estado da devolução | usuário autenticado e pedido | estado de processamento, valor, instante UTC, indicação de simulação | não autenticado; sem vínculo (mesma resposta de inexistente) |

- Formato dos erros e códigos: conforme OPEN-53 (SPEC-003) e autorização conforme OPEN-65.
- Contrato de persistência e do provedor: **OPEN-127**.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como é verificado |
| --- | --- |
| RNF02 | Teste de atomicidade: falha entre registrar o resultado e atualizar o estado desfaz tudo, sem estado parcial. |
| RNF04 | Teste de datas e registros em UTC. |
| RNF09 | Teste de confirmação repetida e de conferência sem duplicidade de devolução ou de efeitos. |
| RNF10 | Teste de que cada tentativa gera registro consultável, vinculado a usuário, bolão, pedido e operação. |
| RNF15 | Revisão e teste de ausência de dinheiro real, credenciais de produção e segredos em registros e respostas. |
| RNF16 | Teste de auditoria de início, confirmação, recusa, pendência por indisponibilidade e nova tentativa. |
| RNF11 (extensão) | Teste de que só o solicitante e a administração do bolão veem o estado da devolução. |

## 11. Critérios de aceitação

- **CA-01 (início):** Dado um pedido aprovado sem tentativa e com origem confirmada, Quando a tarefa executa, Então é registrada uma movimentação de devolução pendente e o envio ao provedor referencia a transação original.
- **CA-02 (só com aprovação):** Dado um pedido pendente ou rejeitado, Quando a tarefa executa, Então nenhuma devolução é criada nem enviada.
- **CA-03 (valor):** Dado uma devolução, Quando registrada, Então o valor é o elegível aprovado e nunca excede o valor da taxa confirmada.
- **CA-04 (confirmação):** Dado uma devolução pendente, Quando o provedor confirma de forma verificável, Então a movimentação fica confirmada e o estado exibido passa a "concluída".
- **CA-05 (recusa):** Dado uma devolução pendente, Quando o provedor recusa, Então a movimentação fica recusada, o pedido continua aprovado e nada é repetido automaticamente.
- **CA-06 (pendente):** Dado uma devolução pendente, Quando consultada, Então aparece como "em processamento" e nenhuma nova movimentação é criada.
- **CA-07 (indisponibilidade):** Dado que o provedor está indisponível, expira ou responde de forma ambígua, Quando o envio é feito, Então a devolução permanece pendente, nunca recusada nem concluída, e a conferência posterior a resolve.
- **CA-08 (nova tentativa):** Dado uma devolução recusada, Quando administrador ou coadministrador solicita nova tentativa, Então o sistema consulta o estado anterior e cria nova movimentação com número de tentativa seguinte.
- **CA-09 (sem duplicidade):** Dado devolução pendente ou confirmada, Quando é solicitada nova tentativa, Então recebe conflito e nada é criado.
- **CA-10 (sem repetição automática):** Dado uma devolução recusada, Quando qualquer tarefa executa, Então nenhuma nova tentativa é criada sem ação da administração.
- **CA-11 (idempotência):** Dado a mesma confirmação recebida mais de uma vez, Quando processada, Então não há efeito adicional.
- **CA-12 (atomicidade):** Dado uma falha ao registrar o resultado, Quando a transação é desfeita, Então a movimentação e o estado exibido não mudam.
- **CA-13 (não reembolsável):** Dado que o provedor informa que a transação original não admite devolução, Quando aplicado, Então a movimentação fica recusada com o motivo registrado.
- **CA-14 (valor divergente):** Dado resposta com valor diferente do aprovado, Quando recebida, Então a devolução não é confirmada, permanece pendente e fica sinalizada.
- **CA-15 (acesso):** Dado usuário sem vínculo com o pedido ou o bolão, Quando consulta o estado, Então é negado sem revelar a existência do pedido.
- **CA-16 (permissão da nova tentativa):** Dado membro sem papel de administração, Quando solicita nova tentativa, Então é negado e a tentativa é auditada.
- **CA-17 (simulador):** Dado devolução feita pelo simulador, Quando exibida ou registrada, Então aparece identificada como simulação, inclusive quando "concluída", e nunca como confirmação do provedor.
- **CA-18 (origem preservada):** Dado qualquer devolução, Quando registrada, Então a movimentação de taxa de origem permanece inalterada.
- **CA-19 (auditoria e segredos):** Dado qualquer início, resultado ou nova tentativa, Quando concluído, Então existe registro com ator (sistema nas ações automáticas), ação, objeto, instante UTC e resultado, sem segredos.

## 12. Casos de teste derivados

Não implementar nesta etapa.

- **CT-01:** processamento de pedido aprovado envia devolução referenciando a transação original (CA-01, INV-003).
- **CT-02:** pedido pendente ou rejeitado não gera devolução (CA-02, INV-001).
- **CT-03:** valor igual ao elegível e nunca superior ao pago (CA-03, INV-002).
- **CT-04:** confirmação verificável leva a "concluída" (CA-04).
- **CT-05:** recusa mantém o pedido aprovado e não repete (CA-05, CA-10, INV-007).
- **CT-06:** devolução pendente consultada e conferida (CA-06).
- **CT-07:** indisponibilidade, tempo esgotado e resposta ambígua mantêm pendente (CA-07, INV-005).
- **CT-08:** nova tentativa após recusa, com consulta da anterior e número seguinte (CA-08, INV-006).
- **CT-09:** nova tentativa com devolução pendente ou concluída (CA-09, INV-002).
- **CT-10:** confirmação repetida sem efeito adicional (CA-11, INV-008).
- **CT-11:** falha no meio do registro desfaz tudo (CA-12, INV-009).
- **CT-12:** transação original não reembolsável (CA-13).
- **CT-13:** valor divergente do provedor (CA-14).
- **CT-14:** acesso negado a quem não tem vínculo (CA-15, RNF11).
- **CT-15:** nova tentativa por membro sem permissão negada e auditada (CA-16).
- **CT-16:** devolução simulada identificada em tela e registro (CA-17, INV-010).
- **CT-17:** movimentação de origem inalterada (CA-18, INV-004).
- **CT-18:** auditoria em UTC, com ator sistema e sem segredos (CA-19, INV-012, INV-011).
- **CT-19:** pré-condição interna violada não envia nada e registra no log técnico (A8).
- **CT-20:** valor nunca altera ranking, participação nem premiação nesta Spec (INV-014).

## 13. Questões em aberto

> Cada item traz uma **proposta para aprovação**, no mesmo padrão das Specs anteriores. Se a baseline já decidir algo diferente, a baseline prevalece.

- **OPEN-125 - confirmação necessária:** conferir esta Spec contra o texto integral de RF34, RF31, RB47, RB53, RB54, UC06 (passos 4 a 6 e A4 a A6), a SPEC-023 aprovada, a SPEC-018 e as decisões aprovadas de OPEN-22, OPEN-27, OPEN-28 e OPEN-36, que não estavam disponíveis na geração. Confirmar também se RF34 exige ação explícita da administração para iniciar a devolução, além da aprovação, e a inclusão de RNF11 por extensão, que o mapa não lista para esta Spec. *Proposta:* ajustar os critérios afetados após a conferência.
- **OPEN-126 - decisão necessária:** definir o gatilho e a frequência do início do processamento. *Proposta:* a aprovação na SPEC-023 é a ordem de início; uma tarefa do agendador (ADR-0006), a cada 1 minuto como em OPEN-76 e OPEN-81, processa só pedidos aprovados sem nenhuma tentativa; depois da primeira tentativa, só a conferência de pendentes age. O processamento independe de o bolão estar ativo ou encerrado.
- **OPEN-127 - decisão necessária:** definir o fluxo técnico com o núcleo financeiro e o provedor (referência de negócio, tratador de devolução, conferência no retorno e periódica, prazo máximo de pendência) e o contrato de persistência. *Proposta:* reutilizar a porta de pagamentos, o tratador por tipo e a conferência da SPEC-018 (OPEN-84, OPEN-85, OPEN-36); prazo de pendência configurável fora do código e, ao vencer, resolvido só após consulta ao provedor, nunca por suposição.
- **OPEN-128 - decisão necessária:** definir o tratamento da compatibilidade do reembolso com o Checkout Pro (OPEN-27) e a identificação do simulador. *Proposta:* até a validação no sandbox pela equipe, vale o simulador identificado, e uma devolução simulada "concluída" é exibida como simulação; o adaptador real só entra após o teste aprovado; transação original não reembolsável resulta em recusa com motivo.
- **OPEN-129 - decisão necessária:** definir as regras de nova tentativa. *Proposta:* só após recusa confirmada; solicitada por administrador ou coadministrador do bolão; consulta do estado anterior antes de criar a nova; número de tentativa na chave de operação; sem limite de tentativas e sem repetição automática.
- **OPEN-130 - decisão necessária:** definir valor e unicidade. *Proposta:* devolução integral do valor elegível aprovado, sem valor parcial, em centavos inteiros em BRL; no máximo uma devolução ativa por pedido; resposta do provedor com valor diferente é tratada como inconsistência, mantida pendente e sinalizada.
- **OPEN-131 - decisão necessária:** definir o estado exibido e a visibilidade. *Proposta:* estados derivados das movimentações (aguardando processamento, em processamento, concluída, recusada) com indicação de simulação; o solicitante vê o estado do próprio pedido e a administração vê o estado dos pedidos aprovados do bolão, sem dados do provedor; ninguém mais vê.
- **OPEN-132 - decisão necessária:** definir os efeitos sobre ranking, participação e premiação. *Proposta:* esta Spec só registra a devolução confirmada; não altera ranking, participação nem prêmio, e o efeito sobre o montante é tratado na SPEC-025 (OPEN-13).
- **OPEN-133 - decisão necessária:** definir a auditoria (ações e resultados, conforme OPEN-45 e OPEN-46). *Proposta:* auditar início do processamento, confirmação, recusa, pendência por indisponibilidade, valor divergente e nova tentativa, com o sistema como ator nas ações automáticas e tentativas negadas por falta de permissão; não auditar recusas por conflito de estado (como em OPEN-73, OPEN-96 e OPEN-124).

## 14. Definition of Done

A SPEC-024 está concluída quando:

1. todos os critérios de aceitação (CA-01 a CA-19) estiverem implementados;
2. todos os invariantes (INV-001 a INV-014) estiverem preservados;
3. os casos de teste derivados (CT-01 a CT-20) estiverem aprovados;
4. os RNFs aplicáveis (RNF02, RNF04, RNF09, RNF10, RNF15, RNF16 e RNF11 por extensão) tiverem sido verificados;
5. não existir divergência conhecida entre implementação e esta Spec;
6. toda divergência em relação à baseline tiver sido explicitamente analisada e decidida pela equipe humana.

**Regra fundamental:** a implementação obedece à Spec aprovada. Em conflito entre código, Spec e documentos de modelagem, registra-se a divergência e escolhe-se entre corrigir a implementação ou propor alteração da baseline para aprovação humana.
