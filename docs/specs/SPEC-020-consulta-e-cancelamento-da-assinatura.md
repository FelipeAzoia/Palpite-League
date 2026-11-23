# SPEC-020 — Consulta e cancelamento da assinatura, expiração e downgrade

- **Status:** aprovada em 30/10/2026 e atualizada pela conferência da baseline em 23/11/2026. As questões OPEN-88 a OPEN-96 foram resolvidas com a aprovação desta Spec e pela SPEC-029.
- **Etapa:** Spec-Driven Development, geração de Spec individual. Nenhum código, banco de dados, endpoint ou tecnologia nova é definido aqui.
- **Fonte de verdade:** `mapa-de-specs.md` (aprovado) e artefatos de `docs/`.

> **Nota de rastreabilidade:** esta Spec foi conferida contra RF07, RF08, RF43, RF44, RB09 a RB12, RB56, RB67 e RB68, UC02 e a SPEC-029. Os estados e prazos de renovação seguem a SPEC-029, cuja decisão prevalece quando houver diferença posterior.

---

## 1. Identificação

- **ID:** SPEC-020
- **Nome:** Consulta e cancelamento da assinatura, expiração e downgrade
- **Objetivo:** permitir que o usuário consulte sua assinatura, solicite o cancelamento (que fica pendente até confirmação verificável) e que o sistema mantenha o Premium até o fim do período pago ou aplique a expiração, retornando ao plano Gratuito e preservando os bolões existentes.
- **Valor entregue:** transparência sobre a assinatura e transição segura para o plano Gratuito, sem perda de bolões, sem cancelamento "fantasma" e sem duplicidade de operações.

## 2. Rastreabilidade

| Tipo | Itens |
| --- | --- |
| RF | RF07 (consulta da assinatura), RF08 (cancelamento), RF43 (renovação), RF44 (regularização), com registro conforme RF31 |
| RB | RB09, RB10, RB11, RB12, RB56, RB67, RB68; contexto: RB55 (ativação só com confirmação), RB02, RB03, RB57 (limites), RB58 (recurso ao vivo associado ao bolão), RB53 e RB54 (registro de movimentações) |
| RNF | RNF04, RNF09, RNF10, RNF11, RNF15, RNF16, RNF21 |
| Caso de uso | UC02: fluxos de consulta e cancelamento e exceções A4 e A5 |
| Entidades | Assinatura, Usuario, Bolao (somente preservado), MovimentacaoFinanceira |
| Drivers | DA-03, DA-01 |
| ADRs | ADR-0003 (principal). Estruturais herdadas da fundação: ADR-0001, ADR-0004, ADR-0005, ADR-0006, ADR-0008 |

## 3. Escopo

**Incluído**

- Consulta da própria assinatura e do plano vigente (status, vigência, situação do cancelamento, recursos).
- Solicitação de cancelamento pelo usuário, com estado pendente até confirmação verificável.
- Aplicação do resultado do cancelamento: confirmado, recusado ou indisponível.
- Expiração da assinatura ao fim da vigência, detectada pelo sistema.
- Downgrade: retorno ao plano Gratuito para novas criações de bolão.
- Preservação dos bolões existentes, participações, palpites e medalhas do usuário.
- Registro e auditoria das mudanças de estado.

**Fora do escopo**

- Contratação e ativação do Premium (SPEC-019).
- Regra de limite de criação de bolões em si (SPEC-007); esta Spec apenas altera o plano que ela consulta.
- Funcionamento das atualizações ao vivo (SPEC-021).
- Notificação ao usuário sobre alteração da assinatura (SPEC-027).
- Reembolso, estorno, repasse ou nova cobrança automática (vedados pela ADR-0003).
- Histórico financeiro consultável (SPEC-018, RF41).
- Execução dos smoke tests do sandbox do Mercado Pago (OPEN-26, responsabilidade da equipe).
- Renovação da assinatura (ver OPEN-90).

## 4. Dependências

- **SPEC-019:** cria a assinatura, o estado ativo e o fluxo técnico com o núcleo financeiro e o provedor.
- **SPEC-007:** consulta o plano do usuário na criação e é a fonte da regra de limite (RB12).
- **Transitivas:** SPEC-001, 002, 003, 005, 018. O agendador em processo (ADR-0006) vem da SPEC-013, já alcançada via SPEC-018.
- **Decisões:** ADR-0003. Até a execução dos smoke tests (OPEN-26), vale o simulador identificado (OPEN-87).

## 5. Comportamento esperado

### 5.1 Consulta da assinatura (RF07)

- **Pré-condição:** usuário autenticado.
- **Fluxo principal:** o usuário abre a tela da assinatura. O sistema apresenta plano atual, status da assinatura, datas de início e fim da vigência (UTC), indicação de cancelamento pendente, limite de criação e recurso ao vivo do plano.
- **Alternativo A1:** usuário sem assinatura (plano Gratuito): o sistema apresenta o plano Gratuito sem dados de vigência.
- **Alternativo A2:** assinatura em estado final (cancelada ou expirada): o sistema apresenta o estado e a data em que passou a valer.
- **Exceção E1:** usuário não autenticado: acesso negado.
- **Pós-condição:** nenhum dado é alterado.

### 5.2 Solicitação de cancelamento (RF08)

- **Pré-condição:** usuário autenticado com assinatura ativa.
- **Fluxo principal:**
  1. O usuário solicita o cancelamento.
  2. O sistema exibe o aviso das consequências (sem reembolso, retorno ao Gratuito, bolões preservados) e pede confirmação (OPEN-94).
  3. O usuário confirma.
  4. O sistema valida o estado no backend, registra a operação financeira de cancelamento (chave de operação idempotente, RB53 e RB54) e muda a assinatura para **cancelamento pendente**.
  5. O sistema encaminha o pedido ao provedor (ou simulador identificado) e informa que o cancelamento aguarda confirmação.
- **Pós-condição:** assinatura em cancelamento pendente; plano mantido até a confirmação (OPEN-89); operação registrada e auditada.

### 5.3 Confirmação do cancelamento e renovação cancelada

- **Gatilho:** confirmação verificável do provedor, obtida por retorno ou por conferência de pendentes do núcleo financeiro (SPEC-018).
- **Fluxo principal:** o sistema muda a assinatura para **renovação cancelada**, impede novas cobranças e mantém o plano Premium até o fim do período já pago. A mudança é registrada e auditada. Os bolões existentes não são alterados.
- **Alternativo A3 (recusa ou falha):** o provedor recusa ou o cancelamento falha: a assinatura volta a **ativa**, a recusa é registrada e não há repetição automática (ADR-0003). Nova tentativa só pelo usuário e só após a recusa (OPEN-84).
- **Alternativo A4 (indisponibilidade):** provedor indisponível: o estado permanece pendente, nunca é apresentado como cancelado, e a conferência posterior resolve (RNF09).
- **Alternativo A5 (confirmação repetida):** notificação ou conferência repetida da mesma operação: nenhum efeito adicional.

### 5.4 Fim do período, renovação, expiração e downgrade

- **Gatilho:** tarefa agendada periódica (ADR-0006, RNF21) que processa o fim do período em UTC.
- **Fluxo principal:** assinatura ativa no fim do período entra em renovação pendente ou é renovada; cobrança confirmada estende a vigência e manutenção do estado ativa. Fim da carência sem confirmação resulta em assinatura **expirada** e plano Gratuito. Os bolões existentes não são alterados.
- **Alternativo A6:** assinatura em cancelamento pendente ao atingir o fim do período: o cancelamento confirmado vira renovação cancelada; sem confirmação, expira no fim da vigência conforme SPEC-029.
- **Alternativo A7:** reexecução da tarefa: sem efeito sobre assinaturas já renovadas, expiradas ou canceladas.

### 5.5 Exceções da solicitação de cancelamento

- **E2:** não há assinatura ativa: recusa por conflito de estado, sem alteração.
- **E3:** cancelamento já pendente: recusa por conflito, sem nova operação.
- **E4:** assinatura já cancelada ou expirada: recusa por conflito.
- **E5:** solicitação simultânea duplicada: uma única operação criada, a outra recebe conflito.

## 6. Regras e invariantes

- **INV-001:** recursos Premium só existem enquanto a assinatura estiver ativa, em cancelamento pendente ou renovação cancelada até o fim do período pago, ou em carência (RB09, RB67, RB68); após o fim de período cancelado ou expiração, o plano é Gratuito.
- **INV-002:** o cancelamento só é efetivado após confirmação verificável do provedor; enquanto isso, o estado é "cancelamento pendente" e nunca "cancelada".
- **INV-003:** o downgrade não exclui, encerra, altera regras nem remove participações, palpites ou medalhas de bolões existentes do usuário.
- **INV-004:** uma solicitação de cancelamento gera no máximo uma operação por chave de operação, mesmo sob repetição ou concorrência.
- **INV-005:** só são aceitas as transições de estado da seção 7; estados finais (cancelada, expirada) não são reabertos por esta Spec.
- **INV-006:** o usuário só consulta e cancela a própria assinatura (RNF11).
- **INV-007:** toda mudança de estado da assinatura e toda operação financeira geram registro vinculado a usuário e operação (RB53, RB54, RF31) e auditoria com ator e instante UTC (RNF04, RNF16).
- **INV-008:** o cancelamento não gera reembolso, repasse ou nova cobrança automática (ADR-0003).
- **INV-009:** simulação nunca é apresentada como confirmação do provedor; o simulador é sempre identificado (ADR-0003, RNF15).
- **INV-010:** as regras são validadas no backend (ADR-0005); o frontend não decide estado nem plano.
- **INV-011:** datas de vigência e de expiração são armazenadas e comparadas em UTC (RNF04).
- **INV-012:** nenhuma credencial, token ou segredo do provedor é gravado em registro, auditoria ou resposta (RNF15).

## 7. Modelo de domínio envolvido

- **Assinatura:** pertence a um Usuario; atributos relevantes: plano, status, início e fim da vigência, referência da operação com o provedor.
- **StatusAssinatura:** pendente e recusada (SPEC-019), ativa, cancelamento pendente, renovação pendente, renovação cancelada, cancelada e expirada (SPEC-029).
- **Transições desta Spec:**
  - ativa → cancelamento pendente (solicitação);
  - cancelamento pendente → renovação cancelada (confirmação);
  - renovação cancelada → cancelada (fim do período pago);
  - cancelamento pendente → ativa (recusa ou falha);
  - ativa → expirada (fim da vigência);
  - cancelamento pendente → expirada (fim da vigência antes da confirmação, OPEN-91).
- **Usuario:** plano atual derivado ou atualizado conforme o estado da assinatura (OPEN-56, SPEC-005).
- **Bolao:** somente leitura nesta Spec; nada é alterado (INV-003).
- **MovimentacaoFinanceira:** registro da operação de cancelamento, conforme representação definida na SPEC-018 (OPEN-84).
- Não há modelo físico nesta Spec (OPEN-40 e SPEC-018).

## 8. Impacto arquitetural

- **Módulos:** planos e assinaturas (consulta, estados, downgrade), núcleo financeiro (registro, idempotência e adaptador de pagamentos da SPEC-018), agendador (expiração e conferência de pendentes).
- **Fronteiras:** a criação de bolão (SPEC-007) apenas lê o plano; esta Spec nunca toca regras do bolão.
- **Integração:** provedor de pagamentos via adaptador isolado; adaptador de Assinaturas real só após os smoke tests (OPEN-26, OPEN-87); até lá, simulador identificado.
- **Backend:** valida estado, autorização, idempotência, transições e downgrade, e executa a expiração.
- **Frontend:** tela de assinatura (consulta), ação de cancelar com aviso e confirmação em dois passos, exibição de pendente, cancelada e expirada, e identificação visível quando a operação é simulada.
- **ADRs que restringem:** ADR-0001 (monólito modular), ADR-0003 (provedor em teste, sem reembolso ou repasse), ADR-0004 (stack), ADR-0005 (invariantes no backend), ADR-0006 (agendador), ADR-0008 (configuração fora do repositório).

## 9. Contratos necessários (conceituais)

| Operação | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| Consultar assinatura | usuário autenticado | plano, status, início e fim da vigência (UTC), cancelamento pendente (sim ou não), limite de criação, recurso ao vivo, indicação de operação simulada | não autenticado |
| Solicitar cancelamento | usuário autenticado e confirmação explícita | assinatura em cancelamento pendente e identificador da operação | não autenticado; sem assinatura ativa; já pendente; já finalizada; provedor indisponível |
| Confirmar ou recusar cancelamento (interna) | referência da operação e resultado verificável do provedor | transição de estado e downgrade, ou retorno a ativa | operação desconhecida; resultado inconsistente |
| Expirar assinaturas (interna, agendada) | instante UTC atual | assinaturas expiradas e planos atualizados | falha parcial sem perda de dados |

- Formato dos erros e códigos: conforme OPEN-53 (SPEC-003).
- Contrato de persistência: **OPEN-93** (não definido na baseline).

## 10. Requisitos não funcionais aplicáveis

| RNF | Como é verificado |
| --- | --- |
| RNF04 | Teste de que datas e registros de auditoria estão em UTC e de que a expiração compara instantes UTC. |
| RNF09 | Teste de repetição da mesma confirmação sem efeito duplicado e de reconsulta de pendentes. |
| RNF10 | Teste de que cada operação gera registro consultável, vinculado a usuário e operação. |
| RNF11 | Teste de que usuário A não consulta nem cancela a assinatura do usuário B. |
| RNF15 | Revisão e teste de que nada usa dinheiro real ou credenciais de produção e de que não há segredos em registros e respostas. |
| RNF16 | Teste de auditoria das ações de solicitação, confirmação, recusa, expiração e downgrade. |

## 11. Critérios de aceitação

- **CA-01 (consulta, Premium):** Dado um usuário com assinatura ativa, Quando consulta a assinatura, Então vê plano Premium, status ativa, vigência em UTC, limite de 10 bolões e recurso ao vivo.
- **CA-02 (consulta, Gratuito):** Dado um usuário sem assinatura, Quando consulta, Então vê o plano Gratuito sem dados de vigência.
- **CA-03 (isolamento):** Dado um usuário autenticado, Quando tenta consultar ou cancelar a assinatura de outro usuário, Então é negado e nada é alterado.
- **CA-04 (solicitar cancelamento):** Dado um usuário com assinatura ativa, Quando confirma o cancelamento, Então a assinatura fica em cancelamento pendente, uma operação é registrada e o plano continua Premium (OPEN-89).
- **CA-05 (aviso):** Dado que o usuário solicita o cancelamento, Quando a tela é exibida, Então o aviso de ausência de reembolso, retorno ao Gratuito e preservação dos bolões aparece antes da confirmação.
- **CA-06 (confirmação):** Dado um cancelamento pendente, Quando o provedor confirma de forma verificável, Então a assinatura fica com renovação cancelada e o plano continua Premium até o fim do período pago.
- **CA-07 (recusa):** Dado um cancelamento pendente, Quando o provedor recusa, Então a assinatura volta a ativa, a recusa é registrada e nenhuma nova tentativa ocorre automaticamente.
- **CA-08 (indisponibilidade):** Dado que o provedor está indisponível, Quando o cancelamento é solicitado, Então o estado permanece pendente, nunca é exibido como cancelado e a conferência posterior o resolve.
- **CA-09 (idempotência):** Dado um cancelamento já pendente ou duas solicitações simultâneas, Quando solicitado de novo, Então só uma operação existe e a repetida recebe conflito.
- **CA-10 (estado inválido):** Dado um usuário sem assinatura ativa, ou com assinatura cancelada ou expirada, Quando solicita cancelamento, Então recebe conflito e nada é alterado.
- **CA-11 (expiração):** Dado uma renovação pendente sem confirmação ao fim da carência, Quando a tarefa executa, Então a assinatura fica expirada, o plano passa a Gratuito e o ator registrado é o sistema.
- **CA-12 (reexecução):** Dado uma assinatura já expirada, Quando a tarefa executa novamente, Então nada muda.
- **CA-13 (bolões preservados):** Dado um usuário que tem bolões criados e participações, Quando ocorre cancelamento confirmado ou expiração, Então os bolões, participações, palpites e medalhas permanecem inalterados (INV-003).
- **CA-14 (limite após downgrade, RB12):** Dado um ex-Premium com bolões existentes, Quando tenta criar novo bolão, Então a SPEC-007 aplica o limite do plano Gratuito.
- **CA-15 (simulador):** Dado que a operação foi feita pelo simulador, Quando exibida ou registrada, Então aparece identificada como simulação e nunca como confirmação do provedor.
- **CA-16 (auditoria):** Dado qualquer mudança de estado, Quando concluída, Então existe registro com ator, ação, objeto, instante UTC e resultado, sem segredos.

## 12. Casos de teste derivados

Não implementar nesta etapa.

- **CT-01:** consulta com Premium ativo (CA-01).
- **CT-02:** consulta com plano Gratuito (CA-02).
- **CT-03:** consulta de assinatura cancelada e de expirada (alternativo A2).
- **CT-04:** acesso a assinatura de outro usuário e acesso sem autenticação (CA-03, INV-006).
- **CT-05:** solicitação válida de cancelamento muda para pendente e mantém o plano (CA-04).
- **CT-06:** a tela exibe o aviso e exige confirmação em dois passos (CA-05).
- **CT-07:** confirmação do provedor leva a renovação cancelada e mantém Premium até o fim do período (CA-06).
- **CT-08:** recusa do provedor leva a ativa e não gera nova tentativa automática (CA-07, INV-008).
- **CT-09:** provedor indisponível mantém pendente e a conferência posterior resolve (CA-08).
- **CT-10:** confirmação repetida da mesma operação não duplica efeitos (CA-09, INV-004).
- **CT-11:** duas solicitações simultâneas geram uma operação (CA-09).
- **CT-12:** solicitação sem assinatura ativa, já pendente, já cancelada e já expirada (CA-10, INV-005).
- **CT-13:** expiração na borda do instante UTC de fim da vigência (CA-11, INV-011).
- **CT-14:** reexecução da tarefa de expiração (CA-12).
- **CT-15:** bolões, participações, palpites e medalhas intactos após downgrade (CA-13).
- **CT-16:** criação de bolão após downgrade segue o limite do Gratuito (CA-14).
- **CT-17:** operação simulada identificada em tela e registro (CA-15, INV-009).
- **CT-18:** registros e auditoria sem segredos, com ator sistema na expiração (CA-16, INV-007, INV-012).
- **CT-19:** transições de estado inválidas rejeitadas (INV-005).

## 13. Questões em aberto

> Cada item traz uma **proposta para aprovação**, no mesmo padrão das Specs anteriores. Se a baseline já decidir algo diferente, a baseline prevalece.

- **OPEN-88 - conferência concluída em 23/11/2026:** esta Spec foi conferida contra RF07, RF08, RB09 a RB12, RB56, RB67, RB68, UC02 (A4 e A5) e as decisões de assinatura já aprovadas. Resultado: não há divergência residual; os critérios de cancelamento vigentes são os desta Spec e da SPEC-029.
- **OPEN-89 - resolvida pela SPEC-029:** o Premium continua durante cancelamento pendente e renovação cancelada até o fim do período pago; retorna ao Gratuito no fim desse período. Não há downgrade na confirmação provisória.
- **OPEN-90 - resolvida pela SPEC-029:** a renovação é processada no fim do período em UTC; não pago entra em carência de 3 dias e expira no fim dela. A tarefa roda periodicamente como definido no RNF21.
- **OPEN-91 - resolvida pela SPEC-029:** `StatusAssinatura` inclui renovação pendente e renovação cancelada. Cancelamento pendente confirmado vira renovação cancelada; sem confirmação até o fim do período, segue o tratamento de expiração pela vigência/carência.
- **OPEN-92 - decisão necessária:** definir o conteúdo exato da consulta e se mostra assinaturas anteriores. *Proposta:* somente a assinatura atual ou a mais recente, com os campos da seção 9 e indicação de simulação.
- **OPEN-93 - decisão necessária:** definir o fluxo técnico do cancelamento com o núcleo financeiro e o provedor (tipo do registro, referência de negócio, tratador, conferência no retorno, prazo máximo de pendência) e o contrato de persistência. *Proposta:* reutilizar porta de pagamentos, tratador por tipo e conferência de pendentes da SPEC-018, com chave de operação com número da tentativa e nova tentativa só após recusa (OPEN-84, OPEN-85, OPEN-87).
- **OPEN-94 - decisão necessária:** definir a confirmação e as mensagens do cancelamento. *Proposta:* confirmação em dois passos, com aviso fixo de ausência de reembolso, retorno ao Gratuito e preservação dos bolões (padrão de OPEN-82 e OPEN-83).
- **OPEN-95 - decisão necessária:** definir o efeito do downgrade sobre o recurso ao vivo de bolões existentes (OPEN-24, RB58) e sobre usuários com mais bolões que o limite Gratuito (RB12). *Proposta:* nenhum bolão é alterado ou encerrado; o usuário apenas não cria novos até ficar dentro do limite; o recurso ao vivo segue a decisão aprovada de OPEN-24.
- **OPEN-96 - decisão necessária:** definir a auditoria desta Spec (ações e resultados, conforme OPEN-45 e OPEN-46) e se tentativas recusadas por estado inválido são auditadas. *Proposta:* auditar solicitação, confirmação, recusa, expiração e downgrade; não auditar recusas por conflito de estado (como em OPEN-73).

## 14. Definition of Done

A SPEC-020 está concluída quando:

1. todos os critérios de aceitação (CA-01 a CA-16) estiverem implementados;
2. todos os invariantes (INV-001 a INV-012) estiverem preservados;
3. os casos de teste derivados (CT-01 a CT-19) estiverem aprovados;
4. os RNFs aplicáveis (RNF04, RNF09, RNF10, RNF11, RNF15, RNF16) tiverem sido verificados;
5. não existir divergência conhecida entre implementação e esta Spec;
6. toda divergência em relação à baseline tiver sido explicitamente analisada e decidida pela equipe humana.

**Regra fundamental:** a implementação obedece à Spec aprovada. Em conflito entre código, Spec e documentos de modelagem, registra-se a divergência e escolhe-se entre corrigir a implementação ou propor alteração da baseline para aprovação humana.

---

## 15. Alterações aprovadas pela equipe em 23/11/2026

Decisão humana registrada durante a implementação. Estas regras complementam as seções anteriores e **prevalecem** sobre elas no que for diferente; os trechos afetados estão indicados.

### 15.1 Novas regras

- **Condição para cancelar:** o usuário só pode pedir o cancelamento se tiver **no máximo 1 bolão em andamento criado por ele** (o limite do plano Gratuito, RB02). "Em andamento" usa a mesma contagem do limite de criação da SPEC-007 (bolões criados pelo usuário com status ativo); participar de bolões de outras pessoas não conta. Acima disso, o pedido é recusado com conflito e a tela explica quantos bolões precisam ser encerrados.
- **Perda dos resultados ao vivo:** no fim do período pago, a assinatura cancelada faz o bolão aberto perder os resultados ao vivo. A confirmação inicial deixa o Premium ativo até esse instante. As demais regras do bolão e todo o seu conteúdo continuam intactos. Bolões já encerrados não são alterados.
- **Limite durante o cancelamento pendente:** enquanto o cancelamento aguarda confirmação, o plano continua Premium (OPEN-89), mas o limite de criação de bolões já é o do Gratuito, para que a condição acima não seja contornada.
- **Expiração:** estas regras valem para o cancelamento pedido pelo usuário. A expiração por fim da vigência continua como na seção 5.4: não depende da quantidade de bolões e não retira o recurso ao vivo.
- **Política de Cobrança e Cancelamento:** as regras de cancelamento são explicadas na política aceita na contratação (SPEC-019, seção 15) e o aviso de cancelamento (OPEN-94) passa a incluir a perda dos resultados ao vivo e o limite durante a pendência, com link para a política.

### 15.2 Trechos alterados

- **INV-003 e OPEN-95:** o downgrade no fim de período do **cancelamento** passa a retirar o recurso ao vivo do bolão aberto; o restante do INV-003 continua valendo. A expiração segue o INV-003 original.
- **RB58 e OPEN-24 (SPEC-007):** o recurso ao vivo continua fixado na criação, com a única exceção de ser retirado no fim do período da renovação cancelada.
- **5.2 Solicitação de cancelamento:** pré-condição acrescida — no máximo 1 bolão em andamento criado pelo usuário. Exceção nova **E6**: mais bolões em andamento que o limite do Gratuito, recusa por conflito sem alteração.
- **Contratos (seção 9):** "Consultar assinatura" informa se o cancelamento é permitido, com a contagem de bolões em andamento e o limite; "Solicitar cancelamento" ganha o erro de conflito por excesso de bolões em andamento; a auditoria do fim do período informa quantos bolões perderam os resultados ao vivo.

### 15.3 Critérios e testes acrescentados

- **CA-17 (consulta da condição):** Dado um usuário com assinatura ativa, Quando consulta a assinatura, Então vê quantos bolões em andamento tem, o limite do Gratuito e se pode cancelar.
- **CA-18 (condição para cancelar):** Dado um usuário com assinatura ativa e mais de 1 bolão em andamento criado por ele, Quando pede o cancelamento, Então recebe conflito, nada é alterado e nenhuma operação é registrada; e com no máximo 1, o pedido é aceito.
- **CA-19 (perda do ao vivo):** Dado uma renovação cancelada de um usuário com 1 bolão aberto com resultados ao vivo, Quando chega o fim do período pago, Então o bolão aberto deixa de ter resultados ao vivo, bolões encerrados não mudam, a auditoria registra a quantidade de bolões afetados e o recurso não pode ser reativado.
- **CA-20 (limite durante a pendência):** Dado um cancelamento pendente, Quando o usuário tenta criar um bolão além do limite do Gratuito, Então a criação é recusada com a orientação de que o cancelamento está em andamento.
- **CT-20 (CA-17, CA-18):** pedir o cancelamento com 2 bolões em andamento (e participação em bolão de outra pessoa), conferir o conflito e a consulta, encerrar um bolão e pedir de novo.
- **CT-21 (CA-19):** concluir o fim do período com renovação cancelada, conferindo um bolão aberto e outro encerrado, a retirada do recurso ao vivo, a auditoria e a impossibilidade de reativar.
- **CT-22 (CA-20):** com o cancelamento pendente, conferir a disponibilidade de criação e a recusa da criação.
- **CT-23 (seção 15.1, expiração):** expirar a assinatura de um usuário com 2 bolões e conferir que ambos mantêm os resultados ao vivo.

---

## 16. Alterações pela SPEC-029 (23/11/2026)

A SPEC-029 (renovação recorrente, plano anual e pagamento em atraso) altera esta Spec; no que for diferente, ela prevalece:

- **Confirmação do cancelamento (5.3, CA-06):** leva à **renovação cancelada**, não mais à cancelada imediata. O Premium continua até o fim do período pago; no fim do período a assinatura fica cancelada, o plano volta ao Gratuito e o bolão aberto perde o recurso ao vivo (regra da seção 15 desta Spec, que passa a valer nesse momento).
- **Expiração (5.4, CA-11):** assinatura ativa no fim da vigência é **renovada**, não expira. A expiração passa a acontecer no fim da carência de 3 dias sem pagamento e, como antes, quando o cancelamento ainda está pendente no fim do período (OPEN-91).
- **Limite de criação:** além do cancelamento pendente, vale o limite do Gratuito também com a renovação cancelada.
- **Estados:** acrescentados "renovação pendente" e "renovação cancelada" (seção 7 da SPEC-029).
