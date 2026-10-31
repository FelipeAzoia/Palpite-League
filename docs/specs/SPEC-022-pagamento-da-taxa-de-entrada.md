# SPEC-022 — Pagamento da taxa de entrada e confirmação financeira da participação

- **Status:** aprovada em 30/10/2026. As questões OPEN-107 a OPEN-115 foram resolvidas com a aprovação desta Spec, nos termos das propostas da seção 13.
- **Etapa:** Spec-Driven Development, geração de Spec individual. Nenhum código, banco de dados, endpoint ou tecnologia nova é definido aqui.
- **Fonte de verdade:** `mapa-de-specs.md` (aprovado) e artefatos de `docs/`.

> **Nota de rastreabilidade:** ao gerar esta Spec, o texto integral de RF30, RB08, RB22, RB23, RB62, do UC03 (passos 7 a 9 e exceções A6, A7 e A8), da SPEC-010 e da SPEC-018 e a redação final das decisões aprovadas para OPEN-09, OPEN-15, OPEN-17, OPEN-26, OPEN-36 e OPEN-38 não estavam disponíveis. O conteúdo abaixo foi derivado do mapa de Specs e dos registros de OPEN-XX. Tudo que depende desses textos está marcado como OPEN-XX, com proposta, para conferência (ver OPEN-107).

---

## 1. Identificação

- **ID:** SPEC-022
- **Nome:** Pagamento da taxa de entrada e confirmação financeira da participação
- **Objetivo:** iniciar a cobrança da taxa de entrada após a aprovação do participante, manter a participação não confirmada enquanto o pagamento estiver pendente, recusado ou indisponível e confirmá-la somente após confirmação verificável do pagamento.
- **Valor entregue:** participação financeiramente confirmada, sem cobranças duplicadas e sem apresentar simulação como confirmação do provedor.

## 2. Rastreabilidade

| Tipo | Itens |
| --- | --- |
| RF | RF30, com registro conforme RF31 |
| RB | RB08, RB22, RB23, RB62; contexto: RB18 (aprovação administrativa), RB53 e RB54 (registro das movimentações) |
| RNF | RNF01, RNF02, RNF04, RNF09, RNF10, RNF13, RNF14, RNF15, RNF16 |
| Caso de uso | UC03: passos 7 a 9 e exceções A6, A7 e A8 (pagamento recusado, pendente e provedor indisponível, conforme o objetivo; mapeamento exato a conferir, OPEN-107) |
| Entidades | Participacao (pagamento confirmado), MovimentacaoFinanceira, Bolao (taxa de entrada) |
| Drivers | DA-03 |
| ADRs | ADR-0003, ADR-0004. Estruturais herdadas da fundação: ADR-0001, ADR-0005, ADR-0006, ADR-0008 |

## 3. Escopo

**Incluído**

- Início da cobrança da taxa de entrada pelo titular de uma participação aprovada em bolão com taxa.
- Registro da movimentação financeira de teste, vinculada a usuário, bolão e operação, com chave de operação idempotente.
- Estados do pagamento: pendente, confirmado, recusado; e a indisponibilidade do provedor.
- Confirmação da participação somente após confirmação verificável, reutilizando a operação interna de confirmação da SPEC-010 (OPEN-69).
- Nova tentativa somente após recusa, com consulta do estado da tentativa anterior.
- Tratamento de pagamento confirmado para participação que deixou de ser elegível.
- Identificação visível de qualquer operação simulada.

**Fora do escopo**

- Aprovação ou rejeição da entrada e confirmação de participação em bolão sem taxa (SPEC-010).
- Definição da taxa, da moeda e do formato da premiação na criação do bolão (SPEC-007).
- Núcleo financeiro, porta de pagamentos e histórico financeiro próprio (SPEC-018).
- Saída do bolão, pedido e processamento de devolução (SPEC-017, 023, 024).
- Premiação (SPEC-026) e notificações (SPEC-027).
- Reembolso, repasse ou nova cobrança automática (vedados pela ADR-0003).
- Smoke tests do sandbox do Mercado Pago (OPEN-26, responsabilidade da equipe).
- Recálculo da ciência de entrada tardia (SPEC-009, OPEN-67).

## 4. Dependências

- **SPEC-010:** participação aprovada, estados da participação e operação interna de confirmação reutilizável.
- **SPEC-018:** registro idempotente das movimentações, porta de pagamentos, tratador por tipo, conferência de pendentes e simulador identificado.
- **Transitivas:** SPEC-001, 002, 003, 007, 008, 009, 013 (agendador).
- **Decisões:** ADR-0003 (provedor em teste, sem repetição automática de cobrança). Até a execução dos smoke tests (OPEN-26), vale o simulador identificado.

## 5. Comportamento esperado

### 5.1 Início da cobrança

- **Pré-condições:** usuário autenticado e titular de uma participação aprovada e não confirmada, em bolão com taxa de entrada maior que zero, ainda não encerrado, sem tentativa de pagamento pendente.
- **Fluxo principal:**
  1. O titular solicita o pagamento da taxa.
  2. O sistema valida as condições no backend e obtém o valor do bolão (nunca do cliente).
  3. O sistema registra uma movimentação financeira de taxa de entrada, com chave de operação que inclui o número da tentativa, em estado pendente.
  4. O sistema cria a cobrança no provedor de teste (ou simulador identificado) e devolve ao usuário o caminho para concluir o pagamento.
- **Pós-condição:** movimentação pendente registrada e auditada; participação continua aprovada e não confirmada.

### 5.2 Confirmação do pagamento e da participação

- **Gatilho:** retorno do fluxo de pagamento e/ou conferência de pendentes (SPEC-018), com confirmação verificável (OPEN-109).
- **Fluxo principal:** o sistema confirma a movimentação, confirma a participação, marca o pagamento como confirmado e registra auditoria, tudo em uma única transação.
- **Pós-condição:** participação confirmada, apta às atividades da SPEC-012 e seguintes.

### 5.3 Fluxos alternativos e de exceção

- **A1 (pagamento recusado):** a movimentação passa a recusada, a participação continua aprovada e não confirmada, e o usuário pode iniciar nova tentativa.
- **A2 (pagamento pendente):** a participação continua não confirmada; a conferência de pendentes e o retorno do pagamento resolvem a situação. Não é criada nova cobrança.
- **A3 (provedor indisponível na criação da cobrança):** nenhuma cobrança é criada no provedor, a tentativa é registrada como recusada por indisponibilidade e a participação continua não confirmada (OPEN-111).
- **A4 (confirmação repetida):** notificação, retorno ou conferência repetidos da mesma operação não têm efeito adicional.
- **A5 (nova tentativa):** só após recusa; antes de criar a nova movimentação, o sistema consulta o estado da tentativa anterior e, se estiver pendente ou confirmada, não cria outra.
- **A6 (pagamento tardio para participação inelegível):** se o pagamento é confirmado quando a participação não é mais elegível (saiu, rejeitada, bolão encerrado), a movimentação é registrada como confirmada, a participação não é confirmada e o caso fica sinalizado para tratamento administrativo (OPEN-112).
- **E1:** usuário não autenticado ou sem titularidade da participação: acesso negado, sem revelar a existência da participação.
- **E2:** participação não aprovada, já confirmada, em bolão sem taxa ou em bolão encerrado: recusa por conflito de estado.
- **E3:** já existe tentativa pendente: recusa por conflito, sem nova cobrança.
- **E4:** solicitações simultâneas: uma única cobrança criada, a outra recebe conflito.

## 6. Regras e invariantes

- **INV-001:** em bolão com taxa, a participação só é confirmada após aprovação administrativa e pagamento confirmado de forma verificável (RB22, RB62, RB18).
- **INV-002:** o valor cobrado é sempre a taxa de entrada do bolão, imutável desde a criação (RB23, RB08), definida no backend; o cliente não informa valor.
- **INV-003:** há no máximo uma tentativa pendente por participação; nova tentativa só após recusa e após consulta do estado da anterior (OPEN-84, ADR-0003).
- **INV-004:** a confirmação é idempotente: repetir a mesma confirmação não duplica movimentação nem efeitos (RNF09).
- **INV-005:** não há repetição automática de cobrança (ADR-0003).
- **INV-006:** a confirmação da movimentação e da participação ocorre na mesma transação: ou ambas, ou nenhuma (RNF02).
- **INV-007:** só o titular inicia e consulta o próprio pagamento; a administração vê apenas o indicador de pagamento confirmado (RNF01, OPEN-113).
- **INV-008:** toda cobrança gera registro vinculado a usuário, bolão e operação, com instante em UTC, e auditoria sem segredos (RB53, RB54, RF31, RNF04, RNF10, RNF16).
- **INV-009:** simulação é sempre identificada e nunca apresentada como confirmação do provedor (ADR-0003, RNF15).
- **INV-010:** sem dinheiro real e sem credenciais de produção; segredos fora do repositório (RNF15, ADR-0008).
- **INV-011:** pagamento confirmado nunca confirma participação inelegível (saiu, rejeitada ou bolão encerrado).
- **INV-012:** enquanto o pagamento está pendente, recusado ou indisponível, a participação permanece não confirmada: sem palpites, sem ranking e sem direitos de participante confirmado.
- **INV-013:** bolão sem taxa não passa por esta Spec (confirmação direta na SPEC-010).
- **INV-014:** as regras são validadas no backend (ADR-0005); o frontend não decide valor, estado nem confirmação.

## 7. Modelo de domínio envolvido

- **Participacao:** status (aprovada, confirmada, entre outros conforme OPEN-09) e indicador de pagamento confirmado; pertence a um Usuario e a um Bolao.
- **Bolao:** taxa de entrada (imutável), moeda BRL, estado (encerrado ou não).
- **MovimentacaoFinanceira:** tipo taxa de entrada, valor em centavos inteiros em BRL, estado (pendente, confirmada, recusada), operação de origem, número da tentativa e chave de operação, referência ao provedor ou ao simulador, vínculo com usuário, bolão e participação (OPEN-84, OPEN-85).
- **Relacionamento:** uma participação pode ter várias movimentações de taxa de entrada (tentativas), no máximo uma pendente por vez.
- Sem modelo físico nesta Spec (OPEN-40 e SPEC-018).

## 8. Impacto arquitetural

- **Módulos:** participações (confirmação), núcleo financeiro (registro, idempotência, porta de pagamentos, tratador de taxa de entrada, conferência de pendentes), agendador (conferência de pendentes).
- **Fronteiras:** a confirmação da participação é feita pela operação interna da SPEC-010; a SPEC-022 decide quando acioná-la. O núcleo financeiro não conhece regras do bolão.
- **Integração:** provedor de pagamentos via adaptador isolado (Checkout Pro conforme ADR-0003); real só após os smoke tests (OPEN-26); até lá, simulador identificado.
- **Backend:** valida estado, titularidade e valor, registra a operação, cria a cobrança, trata a confirmação e executa a transação.
- **Frontend:** ação "pagar taxa" na participação aprovada, página de pagamento (ou página simulada identificada), exibição de pendente, recusado, indisponível e confirmado, e identificação visível de simulação.
- **ADRs que restringem:** ADR-0003 (sem repetição de cobrança, simulador identificado), ADR-0004 (stack), ADR-0001, ADR-0005, ADR-0006, ADR-0008.

## 9. Contratos necessários (conceituais)

| Operação | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| Iniciar pagamento da taxa | usuário autenticado e participação própria | movimentação pendente (identificador, valor, tentativa), caminho para concluir o pagamento, indicação de simulação | não autenticado; participação inexistente ou de outro usuário (mesma resposta); estado inválido, tentativa pendente, bolão sem taxa ou encerrado; provedor indisponível |
| Consultar situação do pagamento | usuário autenticado e participação própria | estado da movimentação e da participação | não autenticado; participação inexistente ou de outro usuário |
| Confirmar ou recusar pagamento (interna) | referência da operação e resultado verificável | transição da movimentação e, se confirmada, da participação | operação desconhecida; resultado inconsistente |
| Conferir pendentes (interna, agendada) | movimentações pendentes de taxa | estados atualizados | provedor indisponível: mantém pendente |

- Formato dos erros e códigos: conforme OPEN-53 (SPEC-003).
- Contrato de persistência e do provedor: **OPEN-109**.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como é verificado |
| --- | --- |
| RNF01 | Teste de que só o titular inicia e consulta o próprio pagamento e de que a administração vê apenas o indicador. |
| RNF02 | Teste de atomicidade: falha entre confirmar movimentação e participação não deixa estado parcial. |
| RNF04 | Teste de datas e registros em UTC. |
| RNF09 | Teste de confirmação repetida e de conferência sem duplicidade de cobrança ou de efeitos. |
| RNF10 | Teste de que cada tentativa gera registro consultável, vinculado a usuário, bolão e operação. |
| RNF13 e RNF14 | Aplicados ao fluxo de entrada em bolão (mapa, seção 3.3); verificação conforme o critério definido em cada RNF, a conferir (OPEN-107). |
| RNF15 | Revisão e teste de ausência de dinheiro real, credenciais de produção e segredos em registros e respostas. |
| RNF16 | Teste de auditoria de iniciar, confirmar, recusar e pagamento tardio. |

## 11. Critérios de aceitação

- **CA-01 (iniciar):** Dado um titular com participação aprovada em bolão com taxa, Quando solicita o pagamento, Então é registrada uma movimentação pendente com o valor da taxa do bolão e o caminho para pagar é apresentado.
- **CA-02 (valor):** Dado qualquer solicitação, Quando a cobrança é criada, Então o valor é o da taxa do bolão e qualquer valor enviado pelo cliente é ignorado ou rejeitado.
- **CA-03 (confirmação):** Dado uma movimentação pendente, Quando o provedor confirma de forma verificável, Então a movimentação fica confirmada, a participação fica confirmada e o pagamento é marcado como confirmado.
- **CA-04 (atomicidade):** Dado uma falha durante a confirmação, Quando a transação é desfeita, Então nem a movimentação nem a participação mudam de estado.
- **CA-05 (recusa):** Dado um pagamento recusado, Quando o resultado é aplicado, Então a movimentação fica recusada e a participação continua aprovada e não confirmada.
- **CA-06 (pendente):** Dado um pagamento pendente, Quando o titular consulta, Então vê "pendente", a participação continua não confirmada e nenhuma nova cobrança é criada.
- **CA-07 (indisponível):** Dado que o provedor está indisponível, Quando o titular inicia o pagamento, Então nenhuma cobrança é criada, a tentativa fica registrada como recusada por indisponibilidade e a participação continua não confirmada.
- **CA-08 (nova tentativa):** Dado uma tentativa recusada, Quando o titular inicia nova tentativa, Então o sistema consulta o estado anterior e cria nova movimentação com número de tentativa seguinte.
- **CA-09 (sem duplicidade):** Dado uma tentativa pendente ou confirmada, Quando o titular solicita nova cobrança, Então recebe conflito e nada é criado.
- **CA-10 (concorrência):** Dado duas solicitações simultâneas, Quando processadas, Então apenas uma cobrança é criada.
- **CA-11 (idempotência):** Dado a mesma confirmação recebida mais de uma vez, Quando processada, Então não há efeito adicional.
- **CA-12 (estado inválido):** Dado participação não aprovada, já confirmada, em bolão sem taxa ou em bolão encerrado, Quando o titular solicita o pagamento, Então recebe conflito e nada é alterado.
- **CA-13 (titularidade):** Dado outro usuário, Quando tenta iniciar ou consultar o pagamento de uma participação que não é sua, Então é negado sem revelar sua existência.
- **CA-14 (visão da administração):** Dado administrador ou coadministrador, Quando consulta os participantes, Então vê apenas o indicador de pagamento confirmado, sem detalhes da movimentação.
- **CA-15 (pagamento tardio):** Dado pagamento confirmado após saída, rejeição ou encerramento, Quando aplicado, Então a movimentação fica confirmada, a participação não é confirmada e o caso fica sinalizado e auditado.
- **CA-16 (sem direitos antes da confirmação):** Dado participação não confirmada por pagamento, Quando tenta palpitar ou aparecer no ranking, Então é bloqueado conforme as Specs de palpite e ranking.
- **CA-17 (simulador):** Dado que a operação foi feita pelo simulador, Quando exibida ou registrada, Então aparece identificada como simulação e nunca como confirmação do provedor.
- **CA-18 (auditoria e segredos):** Dado qualquer cobrança, confirmação ou recusa, Quando concluída, Então existe registro com ator, ação, objeto, instante UTC e resultado, sem segredos.

## 12. Casos de teste derivados

Não implementar nesta etapa.

- **CT-01:** início de cobrança válido (CA-01, INV-002).
- **CT-02:** valor enviado pelo cliente ignorado ou rejeitado (CA-02).
- **CT-03:** confirmação verificável confirma movimentação e participação (CA-03, INV-001).
- **CT-04:** falha no meio da confirmação desfaz tudo (CA-04, INV-006).
- **CT-05:** pagamento recusado mantém participação não confirmada (CA-05, INV-012).
- **CT-06:** pagamento pendente e conferência posterior (CA-06).
- **CT-07:** provedor indisponível na criação da cobrança (CA-07).
- **CT-08:** nova tentativa após recusa, com consulta da anterior e número seguinte (CA-08, INV-003).
- **CT-09:** nova cobrança com tentativa pendente ou confirmada (CA-09).
- **CT-10:** solicitações simultâneas geram uma cobrança (CA-10).
- **CT-11:** confirmação repetida sem efeito adicional (CA-11, INV-004).
- **CT-12:** participação não aprovada, já confirmada, bolão sem taxa e bolão encerrado (CA-12, INV-013).
- **CT-13:** acesso por outro usuário e sem autenticação (CA-13, INV-007).
- **CT-14:** administração vê só o indicador de pagamento (CA-14).
- **CT-15:** pagamento tardio para participação que saiu, rejeitada e bolão encerrado (CA-15, INV-011).
- **CT-16:** participação não confirmada não palpita nem aparece no ranking (CA-16).
- **CT-17:** operação simulada identificada em tela e registro (CA-17, INV-009).
- **CT-18:** registros e auditoria sem segredos e em UTC (CA-18, INV-008, INV-010).
- **CT-19:** nenhuma repetição automática de cobrança após recusa ou falha (INV-005).
- **CT-20:** valor imutável após criação do bolão e uso das centavos inteiros em BRL (INV-002).

## 13. Questões em aberto

> Cada item traz uma **proposta para aprovação**, no mesmo padrão das Specs anteriores. Se a baseline já decidir algo diferente, a baseline prevalece.

- **OPEN-107 - confirmação necessária:** conferir esta Spec contra o texto integral de RF30, RB08, RB22, RB23, RB62, UC03 (passos 7 a 9 e A6 a A8), a SPEC-010 aprovada (OPEN-68 e OPEN-69), a SPEC-018 e as decisões aprovadas de OPEN-09, OPEN-15, OPEN-17, OPEN-26, OPEN-36 e OPEN-38, e os critérios de RNF13 e RNF14, que não estavam disponíveis na geração. *Proposta:* ajustar os critérios afetados após a conferência.
- **OPEN-108 - decisão necessária:** definir quem inicia a cobrança, onde e como a jornada aparece. *Proposta:* o titular inicia pela ação "pagar taxa" na participação aprovada (a aprovação não gera cobrança sozinha); o Checkout Pro só após os smoke tests (OPEN-26) e, até lá, página de pagamento simulado identificada (padrão de OPEN-86).
- **OPEN-109 - decisão necessária:** definir o fluxo técnico com o núcleo financeiro e o provedor (referência de negócio, tratador de taxa de entrada, conferência no retorno e conferência periódica de pendentes, prazo máximo de pendência, contrato de persistência). *Proposta:* reutilizar a porta de pagamentos, o tratador por tipo e a conferência da SPEC-018 (OPEN-84, OPEN-85, OPEN-36); valor em centavos inteiros em BRL; prazo de pendência configurável fora do código e, ao vencer, resolvido após consulta ao provedor, nunca por suposição.
- **OPEN-110 - decisão necessária:** definir se e como o criador do bolão paga a taxa (OPEN-38, RB08, RB13). *Proposta:* seguir a decisão aprovada de OPEN-38; esta Spec trata qualquer titular de participação aprovada e não confirmada com pagamento exigido do mesmo modo.
- **OPEN-111 - decisão necessária:** definir as regras de nova tentativa. *Proposta:* só após recusa; indisponibilidade na criação da cobrança conta como recusa sem cobrança no provedor; consulta do estado anterior antes de criar a nova; número de tentativa na chave de operação; sem limite de tentativas e sem repetição automática.
- **OPEN-112 - decisão necessária:** definir o tratamento de pagamento confirmado para participação inelegível (saiu, rejeitada, bolão encerrado). *Proposta:* movimentação registrada como confirmada, participação inalterada, caso sinalizado e auditado, sem reembolso automático (ADR-0003); eventual devolução segue o fluxo administrativo da SPEC-023 quando aplicável.
- **OPEN-113 - decisão necessária:** definir visibilidade. *Proposta:* o titular vê o estado e os dados da própria movimentação (histórico próprio pela SPEC-018, RF41); administração e coadministração veem só o indicador de pagamento confirmado (OPEN-68); não participantes não veem nada.
- **OPEN-114 - decisão necessária:** definir a interação com a entrada tardia (OPEN-17, OPEN-67). *Proposta:* a confirmação financeira não recalcula a ciência de entrada tardia, registrada na solicitação (SPEC-009); direitos a palpites seguem SPEC-009 e SPEC-012.
- **OPEN-115 - decisão necessária:** definir a auditoria (ações e resultados, conforme OPEN-45 e OPEN-46) e o tratamento de tentativas recusadas por estado inválido. *Proposta:* auditar iniciar, confirmar, recusar, indisponibilidade e pagamento tardio; não auditar recusas por conflito de estado (como em OPEN-73 e OPEN-96).

## 14. Definition of Done

A SPEC-022 está concluída quando:

1. todos os critérios de aceitação (CA-01 a CA-18) estiverem implementados;
2. todos os invariantes (INV-001 a INV-014) estiverem preservados;
3. os casos de teste derivados (CT-01 a CT-20) estiverem aprovados;
4. os RNFs aplicáveis (RNF01, RNF02, RNF04, RNF09, RNF10, RNF13, RNF14, RNF15, RNF16) tiverem sido verificados;
5. não existir divergência conhecida entre implementação e esta Spec;
6. toda divergência em relação à baseline tiver sido explicitamente analisada e decidida pela equipe humana.

**Regra fundamental:** a implementação obedece à Spec aprovada. Em conflito entre código, Spec e documentos de modelagem, registra-se a divergência e escolhe-se entre corrigir a implementação ou propor alteração da baseline para aprovação humana.
