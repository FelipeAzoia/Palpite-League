# SPEC-029 — Renovação recorrente, plano anual e pagamento em atraso

- **Status:** aprovada em 23/11/2026. As decisões de negócio foram tomadas pela equipe nesta data (seção 13); liberada para implementação após as SPEC-018, SPEC-019 e SPEC-020.
- **Tipo:** Spec funcional com integração de pagamentos isolada.
- **Baseline:** artefatos de `docs/` (com RB04, RF07, RF08, RB66 a RB68, RF43, RF44 e RNF21 atualizados nesta data), `docs/specs/mapa-de-specs.md` e SPEC-001 a SPEC-028.
- **Escopo deste documento:** somente a SPEC-029. Esta Spec altera partes da SPEC-019 e da SPEC-020, indicadas na seção 14.

---

## 1. Identificação

- **ID:** SPEC-029
- **Nome:** Renovação recorrente, plano anual e pagamento em atraso
- **Objetivo:** tornar a assinatura Premium recorrente, com ciclo mensal ou anual escolhido na contratação, renovar a vigência a cada cobrança confirmada pelo provedor, tratar a renovação não paga com carência de 3 dias e fazer o cancelamento interromper as próximas cobranças, mantendo o Premium até o fim do período já pago.
- **Valor entregue:** o assinante não precisa contratar de novo todo mês; quem escolhe o plano anual paga menos (2 meses grátis); quem cancela não perde o período pago; quem tem a cobrança recusada tem prazo para regularizar.

## 2. Rastreabilidade

- **RF:** RF06 (contratação, agora com o ciclo), RF07 (consulta, agora com a próxima cobrança), RF08 (cancelamento que interrompe novas cobranças), RF43 (renovação automática) e RF44 (regularização do pagamento em atraso); registro das cobranças conforme RF31.
- **RB:** RB04 (assinatura recorrente, mensal ou anual), RB66 (plano anual com desconto), RB67 (renovação e carência), RB68 (cancelamento ao fim do período pago); contexto: RB09, RB10, RB11, RB12, RB55, RB56.
- **RNF:** RNF21 (processamento periódico das renovações), RNF09 (sem cobrança ou efeito duplicado), RNF10 e RNF15 (registro e ambiente de teste), RNF04 (datas em UTC), RNF16 (auditoria), RNF11 (somente a própria assinatura).
- **Caso de uso:** UC02 (contratação, consulta e cancelamento), estendido pela renovação.
- **Entidades:** `Assinatura` (ciclo, renovação, carência), `MovimentacaoFinanceira` (cobrança de renovação), `Usuario` (plano), `Bolao` (somente o recurso ao vivo no fim do cancelamento, conforme a SPEC-020).
- **ADRs:** ADR-0003 (API de Assinaturas do Mercado Pago; o sistema não repete cobranças por conta própria), ADR-0005, ADR-0006 e ADR-0008.

## 3. Escopo

### Incluído

1. **Ciclo de cobrança na contratação:** mensal (R$ 19,90 por mês) ou anual (R$ 199,00 por ano, equivalente a 2 meses grátis), definidos no backend.
2. **Renovação automática:** ao fim de cada período, o provedor cobra o próximo ciclo; o sistema registra a cobrança e, confirmada, estende a vigência por mais um ciclo.
3. **Renovação pendente e carência:** enquanto a cobrança da renovação não é confirmada, a assinatura fica em "renovação pendente" por até 3 dias, com o Premium mantido; se não for paga nesse prazo, expira.
4. **Regularização:** durante a carência, o usuário pode pedir uma nova tentativa de cobrança, só depois de a anterior ter sido recusada.
5. **Cancelamento ao fim do período:** o cancelamento confirmado pelo provedor interrompe as próximas cobranças; o Premium continua até o fim do período pago, quando a assinatura passa a cancelada e o plano volta ao Gratuito.
6. **Consulta:** ciclo, valor, próxima cobrança (ou fim do Premium, se a renovação foi cancelada) e situação da renovação.
7. **Política de Cobrança e Cancelamento:** nova versão com as regras desta Spec.
8. **Auditoria e registro:** renovação, recusa da renovação, fim do período cancelado e expiração por falta de pagamento.

### Fora do escopo

- Troca de ciclo de uma assinatura em andamento (de mensal para anual ou o contrário): o usuário cancela e contrata o outro ciclo depois do fim do período.
- Reativar a renovação de uma assinatura com renovação cancelada.
- Reajuste de preço de assinaturas em andamento: o valor fica fixo na contratação.
- Reembolso, proporcional ou integral (ADR-0003).
- Notificações (SPEC-027) e cupons ou outras promoções.

## 4. Dependências

- **SPEC-018:** núcleo financeiro, tratadores por tipo, chave de operação com tentativa e conferência.
- **SPEC-019:** contratação, ativação e Política de Cobrança e Cancelamento.
- **SPEC-020:** consulta, cancelamento, expiração e as regras de 23/11/2026 (no máximo 1 bolão em andamento para cancelar e perda do ao vivo).
- **SPEC-013:** agendador em processo.

## 5. Comportamento esperado

### 5.1 Contratação com ciclo

1. As condições do Premium apresentam os dois ciclos, com valor, valor mensal equivalente e economia do anual.
2. O usuário escolhe o ciclo, aceita a política e confirma.
3. O fluxo segue a SPEC-019; na ativação, a vigência vai da confirmação até o fim do primeiro ciclo (um mês de calendário ou doze meses de calendário).

### 5.2 Renovação

- **Gatilho:** tarefa periódica (a cada 1 minuto) que encontra assinaturas ativas cuja vigência terminou.
- **Fluxo principal:**
  1. Em uma transação, o sistema registra a cobrança da renovação do período (movimentação do tipo renovação, chave pela assinatura e pelo fim do período) e passa a assinatura para **renovação pendente**, com a carência até o fim do período mais 3 dias.
  2. O sistema consulta o provedor, que é quem efetua a cobrança recorrente.
  3. Confirmada a cobrança, em uma transação, a assinatura volta a ativa, a vigência é estendida por mais um ciclo a partir do fim do período anterior, a carência é removida e a renovação é auditada.
- **A1 — cobrança recusada:** a assinatura continua em renovação pendente até o fim da carência, com o Premium mantido; a recusa é registrada e auditada com resultado falha.
- **A2 — provedor sem resposta:** continua pendente; a conferência seguinte consulta de novo (RNF09).
- **A3 — fim da carência sem pagamento:** antes de expirar, o sistema consulta a cobrança pendente; sem confirmação, a assinatura expira, o plano volta ao Gratuito e os bolões ficam como estão (expiração da SPEC-020).
- **A4 — repetição da tarefa ou da confirmação:** nenhuma cobrança, extensão ou auditoria duplicada.

### 5.3 Regularização do pagamento em atraso

- **Pré-condição:** assinatura em renovação pendente cuja última cobrança foi recusada.
- **Fluxo:** o usuário pede uma nova tentativa; o sistema cria uma nova tentativa da mesma cobrança (nova chave de tentativa) e consulta o provedor. Se a tentativa anterior ainda está pendente, apenas consulta, sem nova cobrança (ADR-0003).

### 5.4 Cancelamento ao fim do período

- **Fluxo:** a solicitação segue a SPEC-020 (confirmação em dois passos, no máximo 1 bolão em andamento, cancelamento pendente até a confirmação). Confirmado pelo provedor, a assinatura passa a **renovação cancelada**: nenhuma cobrança nova acontece e o Premium continua até o fim do período pago.
- **Fim do período:** a tarefa periódica passa a assinatura para **cancelada**, o plano para Gratuito e retira o recurso ao vivo do bolão aberto (regra da SPEC-020 de 23/11/2026), na mesma transação, com auditoria.
- Enquanto o cancelamento está pendente ou a renovação está cancelada, o limite de criação de bolões já é o do Gratuito.
- Pedido de cancelamento com renovação pendente: recusado por conflito (o usuário pode deixar a carência terminar).

### 5.5 Exceções

- **E1:** ciclo inválido na contratação: 400.
- **E2:** nova tentativa sem renovação pendente, ou com a cobrança anterior não recusada: 409, sem nova cobrança.
- **E3:** sessão ausente ou inválida: 401.

## 6. Regras e invariantes

- **INV-001:** o valor de cada ciclo vem do backend e fica fixo na assinatura; o cliente não define valor nem desconto (ADR-0005).
- **INV-002:** o anual custa menos que doze mensalidades; com os valores atuais, R$ 199,00 contra R$ 238,80.
- **INV-003:** a vigência só é estendida por cobrança de renovação confirmada pelo provedor; cada período é estendido no máximo uma vez.
- **INV-004:** o sistema não cobra por conta própria nem repete cobranças automaticamente; a cobrança recorrente é do provedor e a nova tentativa é sempre pedida pelo usuário, depois de uma recusa (ADR-0003).
- **INV-005:** durante a renovação pendente, a renovação cancelada e o cancelamento pendente, o plano continua Premium.
- **INV-006:** a carência é de 3 dias contados do fim do período; ao terminar sem pagamento, a assinatura expira.
- **INV-007:** o cancelamento não gera reembolso; o Premium termina no fim do período pago.
- **INV-008:** toda cobrança de renovação é uma movimentação financeira registrada, vinculada à assinatura e ao período, com auditoria das mudanças de estado.
- **INV-009:** datas de vigência e carência são guardadas e comparadas em UTC.
- **INV-010:** estados finais (recusada, cancelada, expirada) não são reabertos; a vigência nunca diminui.

## 7. Modelo de domínio envolvido

- **Assinatura:** ciclo (mensal ou anual), valor por ciclo, início, fim do período atual, fim da carência e estado.
- **Estados:** pendente, recusada (SPEC-019); ativa, cancelamento pendente, cancelada, expirada (SPEC-020); **renovação pendente** e **renovação cancelada** (esta Spec).
- **Transições novas ou alteradas:**
  - ativa → renovação pendente (fim do período; cobrança da renovação registrada);
  - renovação pendente → ativa (cobrança confirmada; vigência estendida);
  - renovação pendente → expirada (fim da carência sem pagamento);
  - cancelamento pendente → renovação cancelada (confirmação do provedor; antes: cancelada);
  - renovação cancelada → cancelada (fim do período pago).
- **MovimentacaoFinanceira:** novo tipo "renovação da assinatura", com o valor do ciclo.

## 8. Impacto arquitetural

- **Módulos:** pagamentos e assinaturas (principal), bolões (limite de criação e recurso ao vivo), agendador.
- **Porta de pagamentos:** extensão com iniciar e consultar a cobrança de renovação; sem essas operações, a renovação não acontece e a assinatura segue para a carência (nunca usa a operação genérica, que seria uma cobrança avulsa).
- **Mercado Pago em teste:** assinatura (preapproval) com frequência de 1 ou 12 meses; as cobranças recorrentes são consultadas pelos pagamentos autorizados da assinatura; ativado só depois dos smoke tests (OPEN-26).
- **Configuração:** valores de teste do mensal e do anual no `.env.example`, sem segredos.

## 9. Contratos necessários

- **Consultar condições do Premium:** passa a listar os ciclos, cada um com valor, valor mensal equivalente e economia em relação a doze mensalidades.
- **Contratar o Premium:** recebe também o ciclo (mensal ou anual); erro 400 para ciclo inválido.
- **Consultar assinatura:** passa a informar o ciclo, o valor, a próxima cobrança (ou o fim do Premium, se a renovação foi cancelada) e, na renovação pendente, o fim da carência e se é possível pedir nova tentativa.
- **Pedir nova tentativa de pagamento (novo):** entrada: sessão válida; saída: assinatura após a tentativa; erros: 401, 404, 409.
- **Processar períodos (interna, agendada):** renovações, fim de carências e fim de períodos cancelados.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como é verificado |
| --- | --- |
| RNF21 | Rodar a tarefa repetidas vezes e em paralelo e conferir uma única cobrança e uma única extensão por período. |
| RNF09 | Repetir confirmações e recusas da renovação sem efeito duplicado. |
| RNF04 | Bordas de fim de período e de carência no instante UTC exato. |
| RNF10 e RNF15 | Cada cobrança de renovação no histórico financeiro, identificada como simulação quando for o caso. |
| RNF16 | Auditoria de renovação, recusa, fim de período cancelado e expiração. |
| RNF11 | Nova tentativa só sobre a própria assinatura. |

## 11. Critérios de aceitação

- **CA-01 (ciclos):** Dado um usuário do plano Gratuito, Quando consulta as condições, Então vê o mensal (R$ 19,90 por mês) e o anual (R$ 199,00 por ano, R$ 16,58 por mês e economia de R$ 39,80).
- **CA-02 (contratação anual):** Dado o anual escolhido e aceito, Quando o pagamento é confirmado, Então a assinatura fica ativa com vigência de doze meses e valor de R$ 199,00.
- **CA-03 (ciclo inválido):** Dado um ciclo diferente de mensal e anual, Quando a contratação é enviada, Então recebe 400 e nada é criado.
- **CA-04 (renovação confirmada):** Dado uma assinatura ativa no fim do período, Quando a tarefa roda e o provedor confirma a cobrança, Então existe uma movimentação de renovação confirmada, a vigência termina um ciclo depois do fim anterior e a assinatura está ativa.
- **CA-05 (renovação recusada e carência):** Dado a cobrança da renovação recusada, Quando a tarefa roda, Então a assinatura fica em renovação pendente até o fim do período mais 3 dias, com o plano Premium, e a recusa é auditada como falha.
- **CA-06 (fim da carência):** Dado uma renovação pendente sem pagamento, Quando a carência termina, Então a assinatura expira, o plano volta ao Gratuito e os bolões ficam como estão.
- **CA-07 (regularização):** Dado uma renovação pendente com a cobrança recusada, Quando o usuário pede nova tentativa e o provedor confirma, Então a assinatura volta a ativa com a vigência estendida a partir do fim do período anterior; e sem recusa anterior a nova tentativa recebe 409.
- **CA-08 (idempotência):** Dado a tarefa executada várias vezes e confirmações repetidas, Quando são processadas, Então há uma única cobrança e uma única extensão por período.
- **CA-09 (cancelamento ao fim do período):** Dado um cancelamento confirmado pelo provedor, Quando é aplicado, Então a assinatura fica com a renovação cancelada, o plano continua Premium até o fim do período e nenhuma cobrança nova acontece; e no fim do período a assinatura fica cancelada, o plano volta ao Gratuito e o bolão aberto perde o recurso ao vivo.
- **CA-10 (limite durante a renovação cancelada):** Dado uma renovação cancelada, Quando o usuário tenta criar bolões além do limite do Gratuito, Então a criação é recusada.
- **CA-11 (consulta):** Dado uma assinatura em cada estado, Quando consultada, Então mostra ciclo, valor, próxima cobrança ou fim do Premium, e o fim da carência quando houver.
- **CA-12 (sem fallback de cobrança):** Dado um provedor sem as operações de renovação, Quando o período termina, Então nenhuma cobrança genérica é feita e a assinatura segue para a carência.
- **CA-13 (política):** Dado a contratação, Quando a política é aberta, Então explica os ciclos, a renovação automática, a carência, o cancelamento ao fim do período e a ausência de reembolso, e a contratação exige o aceite desta versão.

## 12. Casos de teste derivados

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, CA-03, INV-001, INV-002 | Consultar os ciclos e contratar com ciclo inválido. |
| TC-02 | CA-02 | Contratar o anual e conferir a vigência de doze meses. |
| TC-03 | CA-04, INV-003 | Renovar no fim do período (mensal e anual) e conferir a extensão. |
| TC-04 | CA-05, CA-06, INV-006 | Recusar a renovação e conferir a carência e a expiração no instante exato. |
| TC-05 | CA-07, INV-004 | Pedir nova tentativa depois da recusa e sem recusa. |
| TC-06 | CA-08, RNF21 | Repetir a tarefa e as confirmações. |
| TC-07 | CA-09, CA-10, INV-005, INV-007 | Cancelar, conferir a renovação cancelada, o limite e o fim do período. |
| TC-08 | CA-11 | Consultar em cada estado. |
| TC-09 | CA-12 | Renovar com um provedor sem as operações de renovação. |
| TC-10 | CA-13 | Conferir o texto e o aceite da nova versão da política. |

## 13. Decisões tomadas pela equipe (23/11/2026)

| Tema | Decisão |
| --- | --- |
| Preço do anual | R$ 199,00 por ano (2 meses grátis em relação a doze mensalidades de R$ 19,90). |
| Pagamento em atraso | Carência de 3 dias a partir do fim do período, com o Premium mantido; sem pagamento, a assinatura expira. |
| Cancelamento | Interrompe as próximas cobranças; o Premium continua até o fim do período pago, sem reembolso. |
| Cobrança recorrente | Feita pelo provedor (API de Assinaturas); o sistema registra e confere, sem cobrar por conta própria. |
| Troca de ciclo | Fora do escopo: cancelar e contratar o outro ciclo depois do fim do período. |

### Em aberto

- **Integração real:** a cobrança recorrente do Mercado Pago depende dos smoke tests do sandbox (OPEN-26); até lá vale o simulador identificado.

## 14. Alterações em Specs anteriores

- **SPEC-019:** a contratação passa a receber o ciclo; a vigência inicial é de um ciclo; a Política de Cobrança e Cancelamento ganha nova versão.
- **SPEC-020:** a confirmação do cancelamento leva à renovação cancelada, não mais à cancelada imediata; o retorno ao Gratuito e a perda do recurso ao vivo acontecem no fim do período pago. A expiração de assinatura ativa no fim da vigência deixa de existir: no fim do período há renovação, e a expiração passa a vir do fim da carência (ou do fim do período com o cancelamento ainda pendente, OPEN-91).

## 15. Definition of Done

A SPEC-029 estará concluída quando os critérios CA-01 a CA-13 estiverem implementados, os invariantes preservados, os testes TC-01 a TC-10 aprovados, os RNFs verificados e não houver divergência conhecida entre a implementação e esta Spec. A integração real com o Mercado Pago é acompanhada à parte, como nas Specs 019 e 020.
