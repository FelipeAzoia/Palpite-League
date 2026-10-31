# SPEC-019 — Contratação do Premium e ativação dos recursos

- **Status:** aprovada. As propostas OPEN-86 e OPEN-87 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003, SPEC-005, SPEC-007 e SPEC-018. A integração real depende dos smoke tests do sandbox (OPEN-26).
- **Tipo:** Spec funcional com integração de pagamentos isolada.
- **Baseline:** artefatos de `docs/` (incluindo ADR-0003), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-018.
- **Escopo deste documento:** somente a SPEC-019. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-019
- **Nome:** Contratação do Premium e ativação dos recursos
- **Objetivo:** permitir que um usuário do plano Gratuito veja as condições do Premium, confirme a contratação, acompanhe a operação pendente e tenha os recursos Premium ativados somente depois da confirmação válida do pagamento de teste.
- **Valor entregue:** limite de até 10 bolões simultâneos e resultados ao vivo nos bolões que o usuário criar, para quem assina, sem que nada seja ativado antes da confirmação.

## 2. Rastreabilidade

- **RF:** RF06 (contratação do Premium), com o registro da movimentação conforme RF31.
- **RB:** RB04 (assinatura paga e recorrente), RB55 (ativação depende da confirmação do pagamento), RB01 e RB03 (planos e limite do Premium) e RB09 (recursos Premium enquanto a assinatura está ativa).
- **RNF:**
  - RNF09 — falha antes da confirmação não deixa efeito parcial; repetir a confirmação não duplica.
  - RNF10 e RNF15 — histórico financeiro e somente ambiente de teste ou simulador identificado.
  - RNF02 — a ativação (assinatura, plano e auditoria) é atômica com a confirmação.
  - RNF04 e RNF16 — a contratação e seu resultado são operações auditáveis (SPEC-002).
  - RNF01 e RNF11 — somente o próprio usuário contrata e vê sua contratação.
  - RNF14 — por extensão: telas utilizáveis em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC02, fluxo de contratação e exceções A1, A2, A3 e A5; a consulta da assinatura, o cancelamento e a exceção A4 pertencem à SPEC-020.
- **Entidades do modelo conceitual:** `Assinatura`, `Usuario` (plano), `MovimentacaoFinanceira` e `RegistroAuditoria`.
- **Drivers arquiteturais:** DA-03 (rastreabilidade e integridade financeira).
- **ADRs:** ADR-0003 (Assinaturas do Mercado Pago em teste), ADR-0004, ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Condições da contratação (UC02, passos 1 e 2):** plano Premium, valor, recorrência, moeda, recursos do catálogo da SPEC-005 e o aviso de ambiente de teste, além da indicação de se o usuário pode contratar.
2. **Confirmação da contratação (passos 3 e 4):** cria a assinatura pendente e inicia a movimentação do tipo assinatura pelo núcleo financeiro da SPEC-018, devolvendo os dados de continuação.
3. **Confirmação do pagamento (passos 5 a 7):** pelo tratador registrado na SPEC-018, ao confirmar, ativa a assinatura, passa o plano do usuário a Premium e registra a vigência; ao recusar, marca a assinatura como recusada.
4. **Retorno do checkout:** conferência imediata da operação quando o usuário volta, além da tarefa de conferência da SPEC-018.
5. **Situação da contratação:** consulta do estado da contratação (pendente, ativa ou recusada) pelo próprio usuário.
6. **Página de pagamento simulado:** disponível somente com o simulador ativo, identificada como simulação, em que se aprova ou se recusa a operação (OPEN-86).
7. **Adaptador de Assinaturas do Mercado Pago em teste:** operação de criar assinatura e consultar o estado, ativada só depois dos smoke tests do sandbox (OPEN-26, OPEN-87).
8. **Auditoria (SPEC-002):** contratação, confirmação e recusa.
9. **Interface:** tela de condições, confirmação, acompanhamento da operação pendente e resultado.

### Fora do escopo

- Consulta detalhada da assinatura, cobranças, vigência, cancelamento, renovação mensal, expiração e retorno ao plano Gratuito (SPEC-020).
- Núcleo financeiro, porta de pagamentos e histórico financeiro (SPEC-018).
- Execução dos smoke tests do sandbox, que depende da equipe (OPEN-26).
- Qualquer cobrança real ou credencial de produção (RNF15).
- Notificação de alteração da assinatura (SPEC-027).

## 4. Dependências

- **Specs anteriores:** SPEC-001, SPEC-002 (auditoria), SPEC-003 (autenticação e formato de erros), SPEC-005 (plano e catálogo), SPEC-007 (limite e recurso ao vivo, verificados na integração) e SPEC-018 (núcleo financeiro, tratadores e conferência).
- **Decisões arquiteturais:** ADR-0003 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- O usuário está autenticado, tem o plano Gratuito e não possui assinatura pendente nem ativa.
- Há um provedor de pagamentos configurado (por padrão, o simulador).

### Fluxo principal

1. O usuário consulta os planos e solicita o Premium.
2. O sistema apresenta o preço (R$ 19,90), a recorrência mensal, a moeda, os recursos e o aviso de ambiente de teste.
3. O usuário confirma a contratação.
4. Em uma transação, o sistema cria a assinatura com estado pendente, inicia a movimentação de assinatura no núcleo financeiro e grava o registro de auditoria; devolve os dados de continuação (o endereço do pagamento).
5. O usuário conclui o pagamento no provedor de teste, ou na página de pagamento simulado.
6. Ao voltar, o sistema confere a operação; a tarefa de conferência também a verifica periodicamente.
7. Quando a confirmação é válida, em uma transação, o tratador marca a assinatura como ativa, com início na confirmação e fim um mês depois, passa o plano do usuário a Premium e grava o registro de auditoria.
8. Os recursos Premium passam a valer para as novas criações de bolão.

### Fluxos alternativos

- **A1 — Pagamento recusado** (UC02 A1): a assinatura fica recusada, o plano permanece Gratuito e o usuário é informado; ele pode contratar de novo.
- **A2 — Confirmação ainda não recebida** (UC02 A2): a assinatura permanece pendente e o plano não muda; reabrir a tela mostra a operação pendente.
- **A3 — Contratação repetida com operação pendente:** devolve a assinatura pendente, sem criar outra.

### Fluxos de exceção

- **E1 — Provedor indisponível, tempo esgotado ou resposta inválida** (UC02 A3): o estado anterior é preservado, a falha é registrada, o usuário é informado de que a operação não foi confirmada e nada é repetido automaticamente.
- **E2 — Nova tentativa** (UC02 A5): antes de iniciar outra operação, o sistema consulta a anterior; só depois de uma recusa uma nova tentativa é aceita.
- **E3 — Usuário que já é Premium com assinatura ativa:** 409 do tipo já possui Premium.
- **E4 — Sessão ausente, inválida, expirada ou encerrada:** 401.
- **E5 — Falha ao aplicar a confirmação** (tratador ou auditoria): a transação é desfeita, a assinatura permanece pendente e a conferência seguinte tenta de novo.

### Pós-condições

- O plano do usuário só é Premium se existe uma assinatura ativa originada de uma movimentação confirmada.
- A operação, seu estado e seu histórico ficam registrados.
- Bolões já criados permanecem como estão.

## 6. Regras e invariantes

- **INV-001:** o plano só passa a Premium depois da confirmação verificável do pagamento; operação pendente, recusada ou com falha não altera o plano (RB55, UC02 A1 a A3).
- **INV-002:** a assinatura nasce pendente, com valor de R$ 19,90, recorrência mensal e moeda BRL, parâmetros de teste definidos no backend (OPEN-23, OPEN-86).
- **INV-003:** contrata o usuário autenticado do plano Gratuito sem assinatura ativa; com assinatura ativa recebe 409, e com contratação pendente recebe a própria contratação pendente, sem criar outra (UC02, SPEC-018 INV-007).
- **INV-004:** a criação da assinatura, da movimentação e da auditoria é atômica, e a ativação (assinatura ativa, plano Premium, vigência e auditoria) é atômica com a mudança de estado da movimentação (RNF02, SPEC-018 INV-009).
- **INV-005:** a vigência começa no instante da confirmação, em UTC, e termina um mês de calendário depois (OPEN-23, OPEN-86).
- **INV-006:** uma contratação recusada deixa a assinatura recusada e o plano inalterado; uma nova tentativa só é aceita depois dela (SPEC-018 INV-007).
- **INV-007:** a ativação não altera os bolões existentes nem suas regras; o recurso ao vivo continua fixado na criação de cada bolão (RB11, RB58).
- **INV-008:** a operação simulada é identificada como simulação, a página de pagamento simulado só existe com o simulador ativo e uma simulação nunca é registrada como confirmada pelo provedor (RNF15, ADR-0003).
- **INV-009:** repetir a confirmação ou a conferência não ativa a assinatura duas vezes nem duplica a movimentação (RNF09).
- **INV-010:** a falha ao iniciar ou consultar preserva o estado anterior, não é repetida automaticamente e o estado da operação anterior é consultado antes de uma nova tentativa (ADR-0003, UC02 A3 e A5).
- **INV-011:** somente o próprio usuário contrata e consulta a própria contratação (RNF01, RNF11).
- **INV-012:** o valor, a recorrência e as condições vêm do backend; a interface e o cliente não os definem (ADR-0005).
- **INV-013:** nenhuma chave, token ou dado de cartão aparece em repositório, respostas, registros técnicos ou auditoria (RNF15).
- **INV-014:** a contratação gera auditoria com o usuário como ator; a confirmação e a recusa geram auditoria com o sistema como ator, e a recusa com o resultado falha (SPEC-002).
- **INV-015:** renovação, cancelamento, expiração e retorno ao plano Gratuito não são tratados nesta Spec (SPEC-020).

## 7. Modelo de domínio envolvido

- **Assinatura:** data de início, data de fim, status (pendente, ativa ou recusada nesta Spec) e valor da cobrança; pertence a um `Usuario`. O valor nasce com a assinatura.
- **Usuario:** plano (de Gratuito para Premium na ativação).
- **MovimentacaoFinanceira:** do tipo assinatura, criada e atualizada pelo núcleo da SPEC-018.
- **RegistroAuditoria:** contratação, confirmação e recusa.
- **Restrições:** no máximo uma assinatura pendente ou ativa por usuário; plano Premium somente com assinatura ativa.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "pagamentos e assinaturas" (principal), "autenticação e usuários" (plano), "notificações e auditoria" e o núcleo financeiro da SPEC-018.
- **Fronteiras:**
  - A Spec registra seu tratador no núcleo financeiro; o núcleo não depende dela.
  - O catálogo de planos (SPEC-005) e a criação de bolão (SPEC-007) passam a ver o plano Premium sem alteração, pois leem o atributo do usuário.
  - O backend decide a ativação; a interface não ativa recursos.
- **Integrações necessárias:** API de Assinaturas do Mercado Pago em teste, após os smoke tests; antes disso, o simulador.
- **Frontend:** tela de condições, confirmação, acompanhamento da operação pendente, página de pagamento simulado e resultado, com o aviso de ambiente de teste; utilizável em 360 px, 768 px e 1366 px.
- **Backend:** condições, criação da assinatura, tratador de confirmação e recusa, conferência no retorno e consulta da situação.
- **Configuração:** valor e recorrência de teste e provedor ativo, no `.env.example`, sem valores secretos.
- **ADRs que restringem a solução:** ADR-0003, ADR-0004, ADR-0001 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003.

- **Consultar condições do Premium**
  - Entrada: sessão válida.
  - Saída: plano, valor, recorrência, moeda, recursos, aviso de ambiente de teste e indicação de se o usuário pode contratar e por quê.
  - Erros: 401.
- **Contratar o Premium**
  - Entrada: confirmação explícita, sessão válida.
  - Saída: assinatura pendente e dados de continuação do pagamento; com contratação já pendente, a própria contratação.
  - Erros: 401; 400 (confirmação ausente); 409 (já possui Premium); 503 (provedor indisponível); 500.
- **Conferir a contratação (retorno do checkout)**
  - Entrada: sessão válida.
  - Saída: situação da contratação após a conferência.
  - Erros: 401; 404 (sem contratação).
- **Consultar a situação da contratação**
  - Entrada: sessão válida.
  - Saída: estado (pendente, ativa ou recusada), datas e origem.
  - Erros: 401; 404.
- **Porta de pagamentos (interna):** extensão para criar assinatura e consultar seu estado, no simulador e no Mercado Pago em teste.
- **Detalhes do registro de auditoria:** valor, estado anterior e novo e origem.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF09 | Injetar falhas antes e durante a confirmação e reenviar confirmações do simulador, comparando o estado final com o esperado (TC-06, TC-07, TC-08). |
| RNF10 e RNF15 | Conferir os campos da movimentação, a origem, o aviso de teste e a ausência de segredos (TC-12, TC-13). |
| RNF02 | Falhar a auditoria e a atualização do plano e conferir que a assinatura permanece pendente (TC-08). |
| RNF04 e RNF16 | Conferir os registros de contratação, confirmação e recusa (TC-14). |
| RNF01 e RNF11 | Consultar a contratação com dois usuários e sem sessão (TC-11). |
| RNF14 (por extensão) | Roteiro das telas em 360 px, 768 px e 1366 px (TC-16). |

## 11. Critérios de aceitação

- **CA-01 (condições):** Dado um usuário do plano Gratuito, Quando ele consulta as condições do Premium, Então vê R$ 19,90, recorrência mensal, moeda BRL, os recursos do plano, o aviso de ambiente de teste e que pode contratar.
- **CA-02 (início da contratação):** Dado um usuário do plano Gratuito, Quando ele confirma a contratação com o simulador, Então existe uma assinatura pendente e uma movimentação de assinatura pendente com origem simulador, os dados de continuação são devolvidos, existe um registro de auditoria e o plano continua Gratuito.
- **CA-03 (ativação):** Dado uma contratação pendente que o simulador confirma, Quando a conferência é executada, Então a assinatura fica ativa com início na confirmação e fim um mês depois, o plano do usuário passa a Premium, a movimentação fica confirmada e existe auditoria com o sistema como ator.
- **CA-04 (recursos efetivos):** Dado o usuário agora Premium, Quando ele cria bolões, Então o limite é de 10 bolões simultâneos e o novo bolão oferece resultados ao vivo; e os bolões criados antes permanecem como estavam.
- **CA-05 (pagamento recusado):** Dado uma contratação que o simulador recusa, Quando a conferência é executada, Então a assinatura fica recusada, o plano permanece Gratuito, o usuário é informado e a auditoria registra o resultado falha; e uma nova contratação é permitida.
- **CA-06 (confirmação pendente):** Dado uma contratação sem confirmação, Quando o usuário reabre a tela ou tenta contratar de novo, Então vê a operação pendente, o plano permanece Gratuito e nenhuma segunda assinatura é criada.
- **CA-07 (já Premium e sem sessão):** Dado um usuário com Premium ativo e uma requisição sem sessão, Quando tentam contratar, Então recebem 409 e 401, respectivamente.
- **CA-08 (falhas do provedor):** Dado tempo esgotado, erro de resposta e resposta inválida ao iniciar ou consultar, Quando ocorrem, Então o estado anterior é preservado, a falha é registrada, o usuário é informado de que a operação não foi confirmada, nada é repetido automaticamente e uma nova tentativa só é aceita depois de consultar a anterior.
- **CA-09 (idempotência):** Dado a confirmação enviada três vezes e duas contratações simultâneas, Quando são processadas, Então existe uma única assinatura e uma única movimentação, e a ativação ocorre uma vez.
- **CA-10 (atomicidade):** Dado que a atualização do plano ou o registro de auditoria falha ao aplicar a confirmação, Quando a conferência é executada, Então a assinatura permanece pendente e o plano Gratuito, e a conferência seguinte aplica a confirmação.
- **CA-11 (retorno do checkout):** Dado o usuário que volta do pagamento, Quando a conferência é pedida, Então a situação é atualizada imediatamente; e a tarefa de conferência da SPEC-018 aplica o resultado se ele não voltar.
- **CA-12 (página simulada):** Dado o simulador ativo, Quando o usuário abre a página de pagamento simulado, Então ela se identifica como simulação e permite aprovar ou recusar; e com outro provedor ativo essa página não existe.
- **CA-13 (aviso de teste):** Dado qualquer tela desta Spec, Quando é aberta, Então exibe o aviso de ambiente de teste, e as operações simuladas exibem o selo de simulação.
- **CA-14 (situação da contratação):** Dado uma contratação em cada estado, Quando o usuário consulta a situação, Então vê pendente, ativa ou recusada, com as datas e a origem.
- **CA-15 (isolamento):** Dado dois usuários, Quando cada um consulta sua contratação, Então vê apenas a própria.
- **CA-16 (condições vindas do backend):** Dado uma requisição de contratação com valor ou recorrência diferentes, Quando é enviada, Então os valores enviados são ignorados ou rejeitados e prevalecem os do backend.
- **CA-17 (sem segredos):** Dado qualquer operação desta Spec, com sucesso ou falha, Quando respostas, registros técnicos, auditoria e repositório são inspecionados, Então não contêm chave, token nem dados de cartão.
- **CA-18 (auditoria):** Dado uma contratação, uma confirmação e uma recusa, Quando os registros são consultados no backend, Então existem os registros com o ator esperado e o resultado correspondente.
- **CA-19 (formato de erros):** Dado erros 400, 401, 404, 409, 503 e 500, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.
- **CA-20 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o usuário percorre a contratação, Então as telas permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página.
- **CA-21 (integração real, critério separado):** Dado os smoke tests de Assinaturas aprovados (OPEN-26), contas de teste fora do repositório e a confirmação da equipe, Quando o usuário contrata com o Mercado Pago em teste, Então criação, confirmação e consulta de estado se comportam como nos critérios CA-02, CA-03, CA-05 e CA-09, sem nenhuma cobrança real.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-012 | Consultar as condições e enviar valores divergentes na contratação. |
| TC-02 | CA-02, INV-002, INV-004 | Contratar com o simulador e conferir assinatura, movimentação, auditoria e plano. |
| TC-03 | CA-03, CA-04, INV-001, INV-005, INV-007 | Confirmar e conferir ativação, vigência, limite de 10 e recurso ao vivo, e os bolões antigos. |
| TC-04 | CA-05, INV-006 | Recusar e contratar de novo. |
| TC-05 | CA-06, CA-07, INV-003 | Conferir pendente, já Premium e sem sessão. |
| TC-06 | CA-08, INV-010 | Simular tempo esgotado, erro e resposta inválida e conferir a ausência de repetição automática. |
| TC-07 | CA-09, INV-009 | Reenviar confirmações e disparar contratações simultâneas. |
| TC-08 | CA-10 | Falhar a auditoria e a atualização do plano na confirmação. |
| TC-09 | CA-11 | Conferir o retorno do checkout e a tarefa de conferência. |
| TC-10 | CA-12, INV-008 | Conferir a página simulada com o simulador e sem ele. |
| TC-11 | CA-14, CA-15, INV-011 | Consultar a situação com dois usuários e em cada estado. |
| TC-12 | CA-13 | Conferir o aviso de teste e o selo de simulação. |
| TC-13 | CA-17, INV-013 | Varrer respostas, registros, auditoria e repositório em busca de segredos. |
| TC-14 | CA-18, INV-014 | Conferir os registros de auditoria. |
| TC-15 | CA-19 | Provocar cada categoria de erro e conferir o formato comum. |
| TC-16 | CA-20 | Executar as telas em 360 px, 768 px e 1366 px. |
| TC-17 | CA-21 | Contratar com o Mercado Pago em teste após os smoke tests e a confirmação da equipe (critério de integração). |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-86 | Acrescentar "recusada" aos valores de `StatusAssinatura` (UC02 A1 fala em "estado recusado"); o valor de R$ 19,90, a recorrência mensal e a moeda ficam em configuração de teste do backend; a vigência é de um mês de calendário em UTC e, se o dia seguinte não existir, vale o último dia do mês; com o simulador ativo há uma página de pagamento simulado, identificada como simulação, em que se aprova ou se recusa; a consulta da situação da contratação traz estado, datas e origem. |
| OPEN-87 | A referência de negócio da movimentação é a assinatura, e a chave de operação soma a ela o número da tentativa (SPEC-018); a assinatura nasce pendente na confirmação do usuário e o plano só muda no tratador de confirmação; a conferência é pedida quando o usuário volta do pagamento e também feita pela tarefa da SPEC-018; o adaptador do Mercado Pago usa assinatura sem plano associado, é ativado só depois dos smoke tests (OPEN-26) e antes disso vale o simulador; contratação com Premium ativo recebe 409 do tipo já possui Premium e, com contratação pendente, devolve a pendente. |

### Em aberto

Nenhuma. Os smoke tests de Assinaturas (OPEN-26) têm decisão aprovada e dependem de execução pela equipe; o resultado é acompanhado pelo critério CA-21.

## 14. Definition of Done da Spec

A SPEC-019 estará concluída quando:

- todos os critérios de aceitação funcionais (CA-01 a CA-20) estiverem implementados;
- todos os invariantes (INV-001 a INV-015) estiverem preservados;
- os testes derivados TC-01 a TC-16 estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

O critério de integração real (CA-21, TC-17) é acompanhado à parte: depende dos smoke tests do sandbox (OPEN-26) e da confirmação da equipe, e enquanto não for executado a Spec fica concluída com a integração real registrada como não atendida.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
