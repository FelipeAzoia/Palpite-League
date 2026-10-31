# SPEC-023 — Solicitação e decisão administrativa de devolução

- **Status:** aprovada em 30/10/2026. As questões OPEN-116 a OPEN-124 foram resolvidas com a aprovação desta Spec, nos termos das propostas da seção 13.
- **Etapa:** Spec-Driven Development, geração de Spec individual. Nenhum código, banco de dados, endpoint ou tecnologia nova é definido aqui.
- **Fonte de verdade:** `mapa-de-specs.md` (aprovado) e artefatos de `docs/`.

> **Nota de rastreabilidade:** ao gerar esta Spec, o texto integral de RF19, RF33, RF34, RB45, RB46, RB47, RB59, do UC06 (fluxo de devolução, passos 1 a 3, e exceções A2 e A3), das SPEC-017 e SPEC-018 e a redação final das decisões aprovadas para OPEN-08, OPEN-09, OPEN-22, OPEN-28 e OPEN-30 não estavam disponíveis. O conteúdo abaixo foi derivado do mapa de Specs e dos registros de OPEN-XX. Tudo que depende desses textos está marcado como OPEN-XX, com proposta, para conferência (ver OPEN-116).

---

## 1. Identificação

- **ID:** SPEC-023
- **Nome:** Solicitação e decisão administrativa de devolução
- **Objetivo:** permitir que quem saiu do bolão solicite formalmente a devolução de valor elegível e que administrador ou coadministrador aprove ou rejeite o pedido, registrando a autorização ou a rejeição.
- **Valor entregue:** fluxo formal e auditável de pedido e decisão, sem devolução automática e sem confundir autorização com devolução concluída.

## 2. Rastreabilidade

| Tipo | Itens |
| --- | --- |
| RF | RF19, RF33, RF34 (registro da autorização ou rejeição) |
| RB | RB45, RB46, RB47, RB59; contexto: RB48 (sem remoção unilateral), RB44 e RB63 (efeitos da saída), RB53 e RB54 (registro das movimentações) |
| RNF | RNF02, RNF04, RNF11, RNF12, RNF16 |
| Caso de uso | UC06: fluxo de devolução, passos 1 a 3, e exceções A2 e A3 (mapeamento exato a conferir, OPEN-116) |
| Entidades | SolicitacaoDevolucao, Participacao, MovimentacaoFinanceira (somente leitura da movimentação de origem) |
| Drivers | DA-03, DA-04 |
| ADRs | ADR-0003, ADR-0005. Estruturais herdadas da fundação: ADR-0001, ADR-0004, ADR-0008 |

## 3. Escopo

**Incluído**

- Solicitação formal de devolução por quem saiu do bolão e tem taxa de entrada confirmada.
- Consulta do próprio pedido pelo solicitante.
- Listagem dos pedidos pendentes do bolão por administrador e coadministrador.
- Aprovação ou rejeição do pedido, com registro do decisor, do instante e do resultado.
- Cálculo do valor elegível pelo backend, a partir da movimentação de taxa confirmada.
- Auditoria de solicitação e decisão.

**Fora do escopo**

- Saída do bolão e o aviso de ausência de devolução automática (SPEC-017).
- Pagamento da taxa de entrada (SPEC-022).
- Execução da devolução no provedor, movimentação de devolução e seus estados (SPEC-024).
- Núcleo financeiro e porta de pagamentos (SPEC-018).
- Saldo ou carteira simulada (a Carteira é reservada, OPEN-22).
- Devolução parcial, cancelamento do pedido pelo solicitante e novo pedido após rejeição (OPEN-118, OPEN-120).
- Tratamento de pagamento tardio sinalizado na SPEC-022 (OPEN-122).
- Notificações (SPEC-027) e premiação (SPEC-026).

## 4. Dependências

- **SPEC-017:** participação que saiu, com a saída registrada e o aviso de ausência de devolução automática.
- **SPEC-022:** movimentação de taxa de entrada confirmada, que dá origem ao valor elegível.
- **SPEC-018:** registro das movimentações, identificação de operação e consulta do histórico financeiro próprio.
- **Transitivas:** SPEC-001, 002, 003, 007, 010, 011 (coadministrador).
- **Decisões:** ADR-0003 (sem reembolso automático) e ADR-0005 (autorização e regras no backend).

## 5. Comportamento esperado

### 5.1 Solicitação de devolução

- **Pré-condições:** usuário autenticado, titular de uma participação que saiu do bolão, com movimentação de taxa de entrada confirmada ainda não devolvida, em bolão não encerrado (OPEN-117) e sem pedido anterior para essa participação.
- **Fluxo principal:**
  1. O ex-participante solicita a devolução da participação.
  2. O sistema valida as condições no backend e calcula o valor elegível a partir da movimentação confirmada (nunca informado pelo cliente).
  3. O sistema registra o pedido em estado pendente, com instante em UTC, e registra a auditoria.
  4. O sistema informa que o pedido aguarda decisão administrativa e que não há devolução automática.
- **Pós-condição:** pedido pendente; nenhuma movimentação de devolução é criada.

### 5.2 Consulta do pedido

- O solicitante consulta o estado do próprio pedido (pendente, aprovada, rejeitada) e, se aprovada, vê que aguarda processamento (OPEN-121).

### 5.3 Decisão administrativa

- **Pré-condições:** administrador ou coadministrador do bolão (RF19, RF34, RB59), diferente do solicitante, com pedido pendente em bolão não encerrado.
- **Fluxo principal:**
  1. O decisor lista os pedidos pendentes do bolão.
  2. O decisor aprova ou rejeita um pedido.
  3. O sistema registra a decisão, o decisor, o instante em UTC e o resultado, na mesma transação, e registra a auditoria.
- **Pós-condição (aprovação):** pedido aprovado, autorização registrada e disponível para a SPEC-024; nenhuma devolução foi realizada ainda.
- **Pós-condição (rejeição):** pedido rejeitado, decisão final, nenhuma movimentação criada.

### 5.4 Fluxos alternativos e de exceção

- **A1 (rejeição):** o pedido é rejeitado e a decisão é definitiva nesta Spec (OPEN-118).
- **A2 (pedido repetido):** nova solicitação para a mesma participação recebe conflito, sem novo pedido.
- **A3 (solicitação inelegível):** participação que não saiu, sem taxa confirmada, já devolvida ou em bolão encerrado: conflito de estado, sem registro de pedido.
- **A4 (decisão repetida ou simultânea):** o segundo decisor recebe conflito e a primeira decisão prevalece.
- **A5 (sem decisor elegível):** se o único administrador for o solicitante, o pedido permanece pendente e nada é decidido automaticamente (OPEN-119).
- **E1:** usuário não autenticado, de outro usuário ou sem participação anterior no bolão: acesso negado, sem revelar a existência do pedido ou do bolão.
- **E2:** membro sem permissão de administração tenta listar ou decidir: negado e auditado (OPEN-124).
- **E3:** decisor tenta decidir o próprio pedido: negado.

## 6. Regras e invariantes

- **INV-001:** a saída do bolão nunca cria pedido nem devolução automática (RB45, ADR-0003).
- **INV-002:** só pode solicitar quem saiu do bolão e tem taxa de entrada confirmada vinculada à participação (UC06, RB46, RB47).
- **INV-003:** nenhuma devolução prossegue sem autorização administrativa registrada (RB46, RB47, ADR-0003).
- **INV-004:** o decisor deve ser administrador ou coadministrador do bolão, verificado no backend, e nunca é o solicitante (RF34, RB59, RNF12, OPEN-30).
- **INV-005:** o valor elegível é calculado pelo backend a partir da movimentação de taxa confirmada, nunca informado pelo cliente e nunca superior ao valor pago.
- **INV-006:** há no máximo um pedido por participação e por movimentação de origem; uma mesma taxa não é pedida duas vezes.
- **INV-007:** a decisão é única e final: pendente leva a aprovada ou rejeitada, e estados finais não mudam nesta Spec.
- **INV-008:** a decisão e o registro da autorização ou rejeição ocorrem na mesma transação (RNF02), com instante em UTC (RNF04).
- **INV-009:** esta Spec não executa devolução no provedor nem cria movimentação de devolução; "aprovada" nunca é apresentada como "devolvida" (SPEC-024).
- **INV-010:** o solicitante só acessa o próprio pedido; a listagem é restrita a administração do bolão (RNF11).
- **INV-011:** toda solicitação e decisão gera auditoria com ator, ação, objeto, instante UTC e resultado, sem segredos (RNF16, RNF04).
- **INV-012:** as regras são validadas no backend (ADR-0005); o frontend não decide elegibilidade, valor nem permissão.

## 7. Modelo de domínio envolvido

- **SolicitacaoDevolucao:** vinculada a uma Participacao e a um solicitante; atributos relevantes: valor elegível (centavos inteiros em BRL), movimentação de origem, estado (pendente, aprovada, rejeitada), instante da solicitação, decisor e instante da decisão.
- **Participacao:** lida para verificar que saiu e para autorizar o acesso; não é alterada.
- **MovimentacaoFinanceira:** a movimentação de taxa confirmada é lida como origem; a movimentação de devolução é criada na SPEC-024, referenciando a autorização desta Spec (OPEN-84, OPEN-121).
- **Relacionamentos:** uma participação tem no máximo um pedido; um pedido referencia uma movimentação de origem.
- A Carteira é reservada e não é usada (OPEN-22). Sem modelo físico nesta Spec (OPEN-40).

## 8. Impacto arquitetural

- **Módulos:** participações e papéis (autorização), financeiro (leitura da movimentação de origem e registro do pedido e da decisão), auditoria (SPEC-002).
- **Fronteiras:** a SPEC-023 termina na autorização registrada; o processamento financeiro pertence à SPEC-024 e usa a porta de pagamentos da SPEC-018.
- **Backend:** valida estado, papel, titularidade, valor e concorrência, e executa a decisão em transação.
- **Frontend:** ação "solicitar devolução" para quem saiu, tela do próprio pedido, lista de pedidos pendentes e ações aprovar e rejeitar para a administração, com texto que diferencia aprovação de devolução concluída.
- **ADRs que restringem:** ADR-0003 (sem reembolso automático, provedor em teste), ADR-0005 (autorização e invariantes no backend), ADR-0001, ADR-0004, ADR-0008.

## 9. Contratos necessários (conceituais)

| Operação | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| Solicitar devolução | usuário autenticado e participação própria que saiu | pedido pendente (identificador, valor elegível, instante UTC) | não autenticado; participação inexistente ou de outro usuário (mesma resposta); inelegível, pedido já existente ou bolão encerrado |
| Consultar o próprio pedido | usuário autenticado e participação própria | estado do pedido e, se aprovada, indicação de aguardando processamento | não autenticado; inexistente ou de outro usuário |
| Listar pedidos pendentes do bolão | usuário autenticado e bolão | pedidos pendentes (solicitante, valor elegível, instante) | não autenticado; membro sem permissão; não membro (mesma resposta de bolão inexistente) |
| Decidir pedido | usuário autenticado, pedido e decisão (aprovar ou rejeitar) | pedido decidido, decisor e instante UTC | não autenticado; sem permissão; não membro; já decidido; decisor é o solicitante; bolão encerrado |

- Formato dos erros e códigos: conforme OPEN-53 (SPEC-003) e a autorização conforme OPEN-65 (403 para membro sem permissão, 404 para não membro).
- Contrato de persistência: **OPEN-121** (não definido na baseline).

## 10. Requisitos não funcionais aplicáveis

| RNF | Como é verificado |
| --- | --- |
| RNF02 | Teste de atomicidade: falha entre a decisão e o registro desfaz tudo, sem estado parcial. |
| RNF04 | Teste de datas e registros em UTC. |
| RNF11 | Teste de que só o solicitante vê o próprio pedido e só a administração do bolão lista os pendentes. |
| RNF12 | Teste de autorização por papel no backend, inclusive tentativa direta sem passar pela interface. |
| RNF16 | Teste de auditoria de solicitação, aprovação, rejeição e tentativas negadas por permissão. |

## 11. Critérios de aceitação

- **CA-01 (solicitar):** Dado um ex-participante com taxa confirmada em bolão ativo, Quando solicita a devolução, Então é registrado um pedido pendente com o valor elegível calculado pelo backend.
- **CA-02 (sem automático):** Dado a saída de um participante, Quando a saída é concluída, Então nenhum pedido nem devolução é criado automaticamente.
- **CA-03 (valor):** Dado qualquer solicitação, Quando o pedido é criado, Então o valor é o da movimentação confirmada e qualquer valor enviado pelo cliente é ignorado ou rejeitado.
- **CA-04 (inelegível):** Dado participação que não saiu, sem taxa confirmada, já devolvida ou em bolão encerrado, Quando solicita, Então recebe conflito e nada é registrado.
- **CA-05 (pedido único):** Dado um pedido existente para a participação, Quando solicita de novo, Então recebe conflito e não há segundo pedido.
- **CA-06 (aprovar):** Dado um pedido pendente e um administrador ou coadministrador diferente do solicitante, Quando aprova, Então o pedido fica aprovado, com decisor e instante UTC registrados, e nenhuma movimentação de devolução é criada.
- **CA-07 (rejeitar):** Dado um pedido pendente, Quando a administração rejeita, Então o pedido fica rejeitado e a decisão é final.
- **CA-08 (permissão):** Dado um membro sem papel de administração, Quando tenta listar ou decidir, Então é negado e a tentativa é auditada.
- **CA-09 (não membro):** Dado um usuário sem vínculo com o bolão, Quando tenta listar ou decidir, Então recebe a mesma resposta de bolão inexistente.
- **CA-10 (conflito de interesse):** Dado o solicitante, Quando tenta decidir o próprio pedido, Então é negado.
- **CA-11 (decisão repetida):** Dado um pedido já decidido, Quando outra decisão é enviada, Então recebe conflito e a primeira prevalece.
- **CA-12 (decisões simultâneas):** Dado duas decisões simultâneas, Quando processadas, Então apenas uma é registrada.
- **CA-13 (sem decisor):** Dado que o único administrador é o solicitante, Quando o pedido está pendente, Então permanece pendente e nada é decidido automaticamente.
- **CA-14 (titularidade):** Dado outro usuário, Quando tenta consultar o pedido alheio, Então é negado sem revelar sua existência.
- **CA-15 (atomicidade):** Dado uma falha durante a decisão, Quando a transação é desfeita, Então o pedido permanece pendente.
- **CA-16 (aprovada não é devolvida):** Dado pedido aprovado, Quando exibido, Então aparece como "aguardando processamento" e nunca como devolvido.
- **CA-17 (bolão encerrado):** Dado bolão encerrado, Quando solicita ou decide, Então recebe conflito.
- **CA-18 (auditoria):** Dado qualquer solicitação ou decisão, Quando concluída, Então existe registro com ator, ação, objeto, instante UTC e resultado, sem segredos.

## 12. Casos de teste derivados

Não implementar nesta etapa.

- **CT-01:** solicitação válida por ex-participante (CA-01, INV-002).
- **CT-02:** saída não gera pedido nem devolução (CA-02, INV-001).
- **CT-03:** valor calculado pelo backend e valor do cliente ignorado (CA-03, INV-005).
- **CT-04:** solicitação inelegível: não saiu, sem taxa, já devolvida e bolão encerrado (CA-04, CA-17).
- **CT-05:** pedido repetido e pedidos simultâneos (CA-05, INV-006).
- **CT-06:** aprovação por administrador e por coadministrador (CA-06, INV-003).
- **CT-07:** rejeição e decisão final (CA-07, INV-007).
- **CT-08:** membro sem permissão negado e auditado (CA-08, INV-004).
- **CT-09:** não membro recebe resposta de bolão inexistente (CA-09).
- **CT-10:** decisão do próprio pedido negada (CA-10).
- **CT-11:** decisão repetida e decisões simultâneas (CA-11, CA-12).
- **CT-12:** pedido pendente sem decisor elegível (CA-13).
- **CT-13:** acesso ao pedido alheio negado (CA-14, INV-010).
- **CT-14:** falha na decisão desfaz tudo (CA-15, INV-008).
- **CT-15:** aprovada exibida como aguardando processamento, sem movimentação criada (CA-16, INV-009).
- **CT-16:** autorização validada no backend por chamada direta (INV-012, RNF12).
- **CT-17:** registros e auditoria em UTC e sem segredos (CA-18, INV-011).
- **CT-18:** valor nunca superior ao pago (INV-005).

## 13. Questões em aberto

> Cada item traz uma **proposta para aprovação**, no mesmo padrão das Specs anteriores. Se a baseline já decidir algo diferente, a baseline prevalece.

- **OPEN-116 - confirmação necessária:** conferir esta Spec contra o texto integral de RF19, RF33, RF34, RB45, RB46, RB47, RB59, UC06 (passos 1 a 3 e A2, A3), as SPEC-017 (OPEN-82, OPEN-83) e SPEC-018 aprovadas e as decisões aprovadas de OPEN-08, OPEN-09, OPEN-22, OPEN-28 e OPEN-30, que não estavam disponíveis na geração. *Proposta:* ajustar os critérios afetados após a conferência.
- **OPEN-117 - decisão necessária:** definir elegibilidade, valor elegível e prazo (OPEN-28, RB47). *Proposta:* só quem saiu, com taxa de entrada confirmada; valor elegível igual ao da movimentação confirmada (integral); pedido permitido apenas enquanto o bolão não estiver encerrado, por poder afetar o montante da premiação (OPEN-13); as "regras previamente estabelecidas" e o prazo seguem a decisão aprovada de OPEN-28, se mais restritivas.
- **OPEN-118 - decisão necessária:** definir o ciclo do pedido. *Proposta:* estados pendente, aprovada e rejeitada; um pedido por participação; rejeição definitiva; sem cancelamento do pedido pelo solicitante nesta Spec.
- **OPEN-119 - decisão necessária:** definir autorização e conflito de interesse (OPEN-08, OPEN-30, RB59). *Proposta:* decidem administrador e coadministrador do bolão; o decisor nunca é o solicitante; membro sem permissão recebe 403 e não membro recebe 404 (OPEN-65); sem decisor elegível, o pedido permanece pendente.
- **OPEN-120 - decisão necessária:** definir as regras da decisão. *Proposta:* aprovação só do valor elegível integral (sem valor parcial), rejeição sem motivo obrigatório (como em OPEN-68), decisão em um passo, conflito para decisão repetida ou simultânea (como em OPEN-69).
- **OPEN-121 - decisão necessária:** definir a fronteira com a SPEC-024 e o contrato de persistência. *Proposta:* a SPEC-023 termina com o pedido aprovado e a autorização registrada; a SPEC-024 cria a movimentação de devolução como nova movimentação referenciando a autorização (OPEN-84) e atualiza o estado exibido; o estado "aguardando processamento" é derivado.
- **OPEN-122 - decisão necessária:** definir se o pagamento tardio sinalizado na SPEC-022 (OPEN-112) tem fluxo de devolução. *Proposta:* fora desta Spec, que cobre só quem saiu (UC06); o caso permanece sinalizado e auditado até decisão própria.
- **OPEN-123 - decisão necessária:** definir visibilidade e conteúdo. *Proposta:* o solicitante vê o estado e o valor do próprio pedido, mesmo após a saída; a administração vê, na lista de pendentes, solicitante, valor elegível e instante; ninguém mais vê.
- **OPEN-124 - decisão necessária:** definir a auditoria (ações e resultados, conforme OPEN-45 e OPEN-46). *Proposta:* auditar solicitação, aprovação, rejeição e tentativas negadas por falta de permissão; não auditar recusas por conflito de estado (como em OPEN-73 e OPEN-96).

## 14. Definition of Done

A SPEC-023 está concluída quando:

1. todos os critérios de aceitação (CA-01 a CA-18) estiverem implementados;
2. todos os invariantes (INV-001 a INV-012) estiverem preservados;
3. os casos de teste derivados (CT-01 a CT-18) estiverem aprovados;
4. os RNFs aplicáveis (RNF02, RNF04, RNF11, RNF12, RNF16) tiverem sido verificados;
5. não existir divergência conhecida entre implementação e esta Spec;
6. toda divergência em relação à baseline tiver sido explicitamente analisada e decidida pela equipe humana.

**Regra fundamental:** a implementação obedece à Spec aprovada. Em conflito entre código, Spec e documentos de modelagem, registra-se a divergência e escolhe-se entre corrigir a implementação ou propor alteração da baseline para aprovação humana.
