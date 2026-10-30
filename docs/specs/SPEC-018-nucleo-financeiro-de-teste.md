# SPEC-018 — Núcleo financeiro de teste

- **Status:** aprovada. As propostas OPEN-84 e OPEN-85 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003 e SPEC-013.
- **Tipo:** Spec técnica (necessidade demonstrada nos artefatos de arquitetura; ver seção 2).
- **Baseline:** artefatos de `docs/` (incluindo ADR-0003, ADR-0006 e RF41), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-017.
- **Escopo deste documento:** somente a SPEC-018. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-018
- **Nome:** Núcleo financeiro de teste
- **Objetivo:** registrar de forma auditável e idempotente as movimentações financeiras de teste e isolar o provedor de pagamentos atrás de uma porta, com um simulador sempre identificado como tal, estados pendente, confirmada e recusada, conferência periódica das operações pendentes e consulta do histórico financeiro do próprio usuário.
- **Valor entregue:** base única e segura para assinatura, taxa de entrada, devolução e premiação, sem cobranças duplicadas, sem efeitos parciais e sem apresentar uma simulação como confirmação do provedor.

## 2. Rastreabilidade

- **RF:** RF31 (registro da movimentação financeira) e RF41 (consulta do histórico financeiro próprio). As Specs financeiras seguintes estendem o RF31 para cada tipo de operação.
- **RB:** RB53 (registro vinculado ao usuário e à operação) e RB54 (integridade financeira).
- **RNF:**
  - RNF09 — recuperação de falhas: sem efeito parcial e sem duplicidade ao repetir notificação ou solicitação.
  - RNF10 — auditoria financeira: campos do histórico e permanência das movimentações confirmadas.
  - RNF15 — segurança das transações: somente ambiente de teste e simulador identificado.
  - RNF02 — mudança de estado, efeitos e auditoria formam uma unidade atômica.
  - RNF04 e RNF16 — movimentações e suas mudanças de estado são operações auditáveis (SPEC-002), com a origem.
  - RNF01 e RNF11 — somente o próprio usuário vê suas movimentações; sem segredos em respostas e logs.
  - RNF18 — as regras críticas têm testes independentes da interface e do provedor.
  - RNF20 — falhas de integração registradas, sem segredos.
  - RNF14 — por extensão: tela do histórico utilizável em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** transversal a UC02, UC03, UC06 e UC07 (seção de escopo de pagamentos de `casos-de-uso.md`).
- **Entidades do modelo conceitual:** `MovimentacaoFinanceira`, `Usuario` e referências a `Bolao`, `Assinatura`, `Participacao` e `SolicitacaoDevolucao`; a `Carteira` é reservada e não é usada.
- **Drivers arquiteturais:** DA-03 (rastreabilidade e integridade financeira) e DA-05 (responsabilidades separadas e solução simples).
- **ADRs:** ADR-0003 (Mercado Pago em teste, simulador identificado, sem repetição automática), ADR-0004, ADR-0001, ADR-0006 e ADR-0008.
- **Justificativa de ser Spec técnica:** quatro Specs posteriores (019, 022, 024 e 026) dependem do mesmo registro, da mesma idempotência e do mesmo adaptador; a necessidade está em ADR-0003, RNF09, RNF10 e RNF15. Cada fluxo financeiro concreto continua especificado na Spec que o possui.

## 3. Escopo

### Incluído

1. **Registro de movimentações:** tipo (taxa de entrada, assinatura, devolução, premiação), valor, moeda, estado, data e hora, usuário, origem, identificador local, identificador do provedor quando aplicável e a operação de origem (OPEN-84).
2. **Estados e transições:** pendente, confirmada e recusada; da pendente para confirmada ou recusada; os dois últimos são finais.
3. **Porta do provedor de pagamentos** (interface do domínio) com a operação genérica de iniciar e a de consultar estado; as operações específicas de assinatura, reembolso e repasse são acrescentadas pelas Specs que as possuem (OPEN-85).
4. **Simulador de pagamentos:** implementação determinística, usada por padrão, que permite injetar confirmação, recusa, atraso, falha e notificação repetida; sempre com origem simulador.
5. **Seleção do provedor por configuração** (simulado ou Mercado Pago em teste), cliente HTTP isolado com tempo limite e classificação de erros, e chave fora do repositório.
6. **Idempotência** por chave de operação, sem repetição automática de cobrança, reembolso ou repasse, e nova tentativa somente depois de uma recusa (ADR-0003, OPEN-84).
7. **Tratadores por tipo de movimentação:** ponto de extensão em que as Specs 019, 022, 024 e 026 registram o que acontece ao confirmar ou recusar; executados na mesma transação da mudança de estado (OPEN-85).
8. **Conferência das operações pendentes:** tarefa agendada que consulta o provedor e aplica a confirmação ou a recusa, e operação interna de conferência de uma operação, para ser chamada quando o usuário volta do checkout (OPEN-36).
9. **Histórico financeiro próprio (RF41):** o usuário consulta suas movimentações, com a origem identificada.
10. **Auditoria (SPEC-002):** criação e mudanças de estado das movimentações, com a origem.
11. **Interface:** tela do histórico financeiro e aviso permanente de ambiente de teste nas telas financeiras.

### Fora do escopo

- Os fluxos concretos de assinatura (SPEC-019 e SPEC-020), taxa de entrada (SPEC-022), devolução (SPEC-023 e SPEC-024) e premiação (SPEC-026), inclusive as operações específicas do Mercado Pago e os smoke tests do sandbox.
- A visão do administrador sobre a confirmação do pagamento de cada participante (SPEC-022, parte do RF41).
- Carteira e saldo, reservados e não usados.
- Qualquer credencial de produção, cobrança ou transferência reais (RNF15).
- Notificações (SPEC-027).

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, configuração, correlação, testes), SPEC-002 (auditoria), SPEC-003 (autenticação e formato de erros) e SPEC-013 (agendador).
- **Decisões arquiteturais:** ADR-0003, ADR-0004, ADR-0006 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- SPEC-001, SPEC-002, SPEC-003 e SPEC-013 operantes.
- Há um provedor configurado (por padrão, o simulador).
- Uma Spec proprietária inicia uma operação financeira de um usuário, com uma referência de negócio.

### Fluxo principal — iniciar uma operação

1. A Spec proprietária solicita ao núcleo uma nova operação financeira, informando tipo, valor, usuário, operação de origem e a referência de negócio.
2. O núcleo deriva a chave de operação e, em uma transação, cria a movimentação com estado pendente e a origem do provedor configurado e grava o registro de auditoria.
3. O núcleo inicia a operação no provedor pela porta e registra o identificador do provedor e os dados de continuação, devolvendo-os à Spec proprietária.

### Fluxo principal — confirmar ou recusar

1. A tarefa de conferência (a cada 5 minutos e logo após a inicialização), ou a conferência pedida quando o usuário volta do checkout, consulta o provedor sobre cada movimentação pendente.
2. Se o provedor confirma, em uma transação o núcleo passa a movimentação para confirmada, executa o tratador do tipo e grava o registro de auditoria, com o sistema como ator e a origem.
3. Se o provedor recusa, em uma transação passa a recusada, executa o tratador de recusa e grava o registro de auditoria de falha.
4. Se ainda não há resposta, a movimentação permanece pendente.

### Fluxo principal — consultar histórico

1. O usuário pede seu histórico financeiro.
2. O sistema devolve suas movimentações, da mais recente para a mais antiga, com tipo, valor, moeda, estado, data e hora e origem.

### Fluxos alternativos

- **A1 — Solicitação repetida com a mesma chave:** devolve a movimentação existente, sem criar outra.
- **A2 — Notificação ou confirmação repetida:** não duplica movimentação nem efeitos.
- **A3 — Nova tentativa da mesma operação de negócio:** só depois de a anterior ter sido recusada; cria uma nova movimentação com nova chave de tentativa.
- **A4 — Estorno ou devolução:** é uma nova movimentação, que referencia a original, nunca uma alteração dela.

### Fluxos de exceção

- **E1 — Tempo esgotado, erro de resposta ou resposta inválida ao iniciar ou consultar:** a movimentação permanece pendente, nada é repetido automaticamente, a falha é registrada tecnicamente e, antes de qualquer nova tentativa, o estado da anterior é consultado.
- **E2 — Falha do tratador ou da auditoria na mudança de estado:** a transação é desfeita e a movimentação permanece pendente, para nova conferência.
- **E3 — Nova tentativa enquanto a anterior está pendente ou confirmada:** não cria nova movimentação; devolve a existente.
- **E4 — Consulta sem sessão:** 401.
- **E5 — Persistência indisponível:** falha sinalizada sem detalhes internos (500).

### Pós-condições

- Toda movimentação está registrada e vinculada ao usuário e à operação de origem.
- Estados finais não são reabertos nem apagados.
- Nenhum efeito parcial nem duplicado.

## 6. Regras e invariantes

- **INV-001:** toda movimentação financeira é registrada e vinculada a um usuário e a uma operação de origem (RB53, RF31).
- **INV-002:** cada movimentação tem identificador local, identificador do provedor quando aplicável, tipo, valor, moeda, estado, data e hora em UTC, usuário e origem (RNF10).
- **INV-003:** os estados são pendente, confirmada e recusada; só a pendente evolui, para confirmada ou recusada, e esses são finais; nenhuma operação remove ou reescreve uma movimentação confirmada (RNF10).
- **INV-004:** devoluções, estornos e correções são novas movimentações, nunca edição da original (RNF10, RB54).
- **INV-005:** a origem é provedor de teste ou simulador, nunca ambígua; uma operação simulada nunca é registrada nem apresentada como confirmada pelo provedor (RNF15, ADR-0003).
- **INV-006:** repetir uma solicitação, uma notificação ou uma conferência com a mesma chave de operação não duplica movimentação nem efeitos (RNF09).
- **INV-007:** não há repetição automática de cobrança, reembolso ou repasse; uma nova tentativa da mesma operação de negócio só é aceita depois de a anterior ser recusada, e nunca enquanto estiver pendente ou confirmada (ADR-0003, OPEN-84).
- **INV-008:** uma operação aguardando confirmação permanece pendente; só passa a confirmada com confirmação verificável, por consulta ao provedor ou resposta do simulador (ADR-0003).
- **INV-009:** a mudança de estado, a execução do tratador do tipo e o registro de auditoria são atômicos (RNF02, RNF09).
- **INV-010:** uma falha antes da confirmação deixa o estado anterior, sem efeito parcial (RNF09).
- **INV-011:** nenhuma chave, token ou dado de cartão aparece em repositório, respostas, registros técnicos ou auditoria, e dados completos de cartão nunca são armazenados (RNF15, RNF20).
- **INV-012:** somente o próprio usuário vê suas movimentações; nenhuma consulta expõe movimentações de outro usuário (RNF01, RNF11).
- **INV-013:** valores são em BRL, com duas casas decimais, representados sem ponto flutuante (OPEN-84).
- **INV-014:** a tarefa de conferência é idempotente, não se sobrepõe a si mesma e é isolada de falhas (ADR-0006).
- **INV-015:** toda criação e toda mudança de estado geram registro de auditoria na mesma transação, com a origem; o ator é o usuário ao iniciar e o sistema ao aplicar a resposta do provedor (RNF04, RNF16, SPEC-002).
- **INV-016:** as telas financeiras exibem aviso de ambiente de teste, e registros de teste não são apresentados como comprovantes de pagamento real (RNF10, ADR-0003).
- **INV-017:** a Carteira não é usada para movimentações nem para saldo (OPEN-22).
- **INV-018:** o domínio depende somente da porta de pagamentos, nunca do cliente do provedor (RNF19).

## 7. Modelo de domínio envolvido

- **MovimentacaoFinanceira:** tipo, valor, moeda, estado, data e hora, origem, vínculo com o usuário e com a operação de origem (tipo e identificador); atributos técnicos: identificador do provedor, chave de operação e número da tentativa, e referência à movimentação original nas devoluções.
- **Usuario:** somente leitura.
- **Referências:** `Bolao`, `Assinatura`, `Participacao` e `SolicitacaoDevolucao`, apontadas pelo tipo e identificador da operação de origem, sem dependência de suas Specs.
- **Restrições:** unicidade da chave de operação; transições apenas de pendente para confirmada ou recusada; movimentação sem remoção.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "pagamentos e assinaturas" (principal), "notificações e auditoria" e a infraestrutura de agendamento da SPEC-013, mais persistência, configuração e correlação da SPEC-001.
- **Fronteiras:**
  - A porta de pagamentos é definida pelo domínio; simulador e Mercado Pago são adaptadores substituíveis por configuração.
  - Os tratadores por tipo invertem a dependência: as Specs financeiras se registram no núcleo, que não depende delas.
  - O backend decide estados e efeitos; a interface não confirma pagamento.
- **Integrações necessárias:** Mercado Pago em ambiente de teste, operação por operação, nas Specs 019, 022, 024 e 026, depois dos smoke tests do sandbox (OPEN-26); antes disso, o simulador.
- **Frontend:** tela do histórico financeiro e aviso de ambiente de teste, com selo de simulação por movimentação; utilizável em 360 px, 768 px e 1366 px.
- **Backend:** registro, estados, porta, simulador, tratadores, conferência, histórico e auditoria.
- **Configuração:** provedor ativo, intervalo da conferência (padrão 5 minutos) e chave do provedor, no `.env.example`, sem valores secretos.
- **ADRs que restringem a solução:** ADR-0003, ADR-0004, ADR-0001, ADR-0006 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003.

- **Porta do provedor de pagamentos (interna)**
  - Iniciar operação — entrada: tipo, valor, moeda, referência idempotente e dados do usuário necessários; saída: identificador do provedor, estado inicial pendente e dados de continuação (por exemplo, o endereço do checkout).
  - Consultar operação — entrada: identificador do provedor ou chave; saída: estado atual (pendente, confirmada ou recusada).
  - Erros: tempo esgotado, erro de resposta, resposta inválida, recusa.
  - As operações de assinatura, reembolso e repasse são estendidas pelas Specs 019, 024 e 026.
- **Núcleo financeiro (interno)**
  - Iniciar movimentação — entrada: tipo, valor, usuário, operação de origem e referência de negócio; saída: movimentação pendente e dados de continuação.
  - Conferir movimentação — entrada: chave ou identificador; saída: estado aplicado, sem efeito se já final.
  - Registrar tratador — entrada: tipo e ações ao confirmar e ao recusar; executadas na transação da mudança de estado.
- **Tarefa de conferência (interna):** a cada 5 minutos e logo após a inicialização, para as movimentações pendentes.
- **Consultar meu histórico financeiro**
  - Entrada: sessão válida.
  - Saída: movimentações do usuário, da mais recente para a mais antiga, com tipo, valor, moeda, estado, data e hora e origem.
  - Erros: 401; 500.
- **Detalhes do registro de auditoria:** tipo, valor, estado anterior e novo, origem e identificadores local e do provedor.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF09 | Injetar falhas antes e durante a confirmação e reenviar confirmações do simulador, comparando o estado final com o esperado (TC-05, TC-06, TC-07). |
| RNF10 | Gerar movimentações de cada tipo e conferir campos, permanência e consulta (TC-01, TC-10, TC-12). |
| RNF15 | Revisar configuração, histórico versionado e logs; conferir que simulação e provedor são distinguíveis (TC-13, TC-14). |
| RNF02 | Falhar a auditoria e o tratador e conferir que a movimentação permanece pendente (TC-07). |
| RNF04 e RNF16 | Conferir os registros de criação e de mudança de estado, com a origem (TC-15). |
| RNF01 e RNF11 | Consultar o histórico com dois usuários e sem sessão (TC-11). |
| RNF18 | Executar a suíte com o simulador, sem credenciais e sem rede externa (TC-01 a TC-17). |
| RNF14 (por extensão) | Roteiro da tela em 360 px, 768 px e 1366 px (TC-16). |

## 11. Critérios de aceitação

- **CA-01 (registro):** Dado uma operação iniciada com o simulador, Quando a movimentação é criada, Então existe uma movimentação pendente com identificador local, tipo, valor, moeda BRL, estado, data e hora em UTC, usuário, origem simulador e operação de origem, e um registro de auditoria.
- **CA-02 (confirmação):** Dado uma movimentação pendente que o simulador confirma, Quando a conferência é executada, Então ela passa a confirmada, o tratador do tipo é executado e existe um registro de auditoria com o sistema como ator e a origem.
- **CA-03 (recusa):** Dado uma movimentação pendente que o simulador recusa, Quando a conferência é executada, Então ela passa a recusada, o tratador de recusa é executado e a auditoria registra o resultado falha.
- **CA-04 (pendente sem prova):** Dado uma movimentação sem resposta do provedor, Quando a conferência é executada, Então ela permanece pendente e nenhum efeito do tratador ocorre.
- **CA-05 (confirmação repetida):** Dado uma confirmação enviada três vezes, Quando todas são processadas, Então há uma única movimentação, um único efeito do tratador e uma única mudança de estado.
- **CA-06 (solicitação repetida):** Dado duas solicitações iguais com a mesma chave de operação, Quando são processadas, Então a segunda devolve a movimentação da primeira e nenhuma outra é criada.
- **CA-07 (sem repetição automática):** Dado um tempo esgotado ao iniciar uma operação, Quando o tempo passa, Então nenhuma nova chamada de cobrança é feita automaticamente e o estado anterior é consultado antes de qualquer nova tentativa.
- **CA-08 (nova tentativa):** Dado uma operação de negócio com movimentação pendente, uma confirmada e uma recusada, Quando se pede nova tentativa em cada caso, Então apenas depois da recusada é criada uma nova movimentação, com nova chave de tentativa.
- **CA-09 (falhas na mudança de estado):** Dado uma falha do tratador ou da auditoria ao aplicar uma confirmação, Quando a conferência é executada, Então a movimentação permanece pendente e nenhum efeito parcial existe; e a conferência seguinte aplica a confirmação.
- **CA-10 (permanência):** Dado movimentações confirmadas e recusadas, Quando se procura qualquer operação que as apague ou reescreva, Então nenhuma existe, e uma devolução gera uma nova movimentação que referencia a original.
- **CA-11 (histórico próprio):** Dado dois usuários com movimentações, Quando cada um consulta seu histórico, Então vê apenas as suas, da mais recente para a mais antiga, com tipo, valor, moeda, estado, data e hora e origem; e quem está sem sessão recebe 401.
- **CA-12 (agendador):** Dado a tarefa de conferência, Quando o backend inicia e o tempo passa, Então ela executa logo após a inicialização e a cada 5 minutos, sem se sobrepor e sem que uma falha impeça a seguinte.
- **CA-13 (origem identificada):** Dado movimentações do simulador e do provedor de teste, Quando respostas e telas são examinadas, Então a origem aparece em cada uma, a simulação tem selo visível e nenhuma simulação aparece como confirmada pelo provedor.
- **CA-14 (aviso de ambiente de teste):** Dado qualquer tela financeira, Quando ela é aberta, Então exibe o aviso de que as operações são de teste e sem dinheiro real.
- **CA-15 (sem segredos):** Dado qualquer operação, com sucesso ou falha, Quando respostas, registros técnicos, auditoria e repositório são inspecionados, Então não contêm chave, token nem dados de cartão.
- **CA-16 (adaptador substituível):** Dado dois adaptadores de teste que implementam a porta, Quando um é trocado pelo outro, Então o domínio e os testes do núcleo funcionam sem alteração.
- **CA-17 (auditoria):** Dado uma criação, uma confirmação e uma recusa, Quando os registros são consultados no backend, Então existem os registros com o ator esperado, a origem e os estados anterior e novo.
- **CA-18 (atomicidade):** Dado que o registro de auditoria falha ao criar uma movimentação, Quando a operação é iniciada, Então nenhuma movimentação nem chamada de continuação é gravada.
- **CA-19 (valores):** Dado valores como R$ 0,10 e R$ 0,20, Quando são somados e registrados, Então o resultado é exato, sem erro de ponto flutuante.
- **CA-20 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o usuário consulta o histórico, Então a tela permanece utilizável, sem sobreposição de controles nem rolagem horizontal da página.
- **CA-21 (formato de erros):** Dado erros 401 e 500, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-001, INV-002 | Iniciar operação com o simulador e conferir campos e auditoria. |
| TC-02 | CA-02, CA-03, INV-003, INV-009 | Confirmar e recusar e conferir estado, tratadores e auditoria. |
| TC-03 | CA-04, INV-008 | Conferir pendente sem resposta do provedor. |
| TC-04 | CA-08, INV-007 | Pedir nova tentativa com pendente, confirmada e recusada. |
| TC-05 | CA-05, CA-06, INV-006 | Repetir solicitações e confirmações. |
| TC-06 | CA-07, INV-007, INV-010 | Simular tempo esgotado e conferir ausência de repetição automática e consulta prévia. |
| TC-07 | CA-09, CA-18, INV-009 | Falhar o tratador e a auditoria na mudança de estado e na criação. |
| TC-08 | CA-12, INV-014 | Conferir o agendamento da conferência. |
| TC-09 | CA-16, INV-018 | Trocar entre dois adaptadores de teste. |
| TC-10 | CA-10, INV-003, INV-004 | Procurar operações de remoção e reescrita e gerar uma devolução. |
| TC-11 | CA-11, INV-012 | Consultar o histórico com dois usuários e sem sessão. |
| TC-12 | CA-19, INV-013 | Somar valores decimais e conferir exatidão. |
| TC-13 | CA-13, INV-005 | Conferir a origem e o selo de simulação em respostas e telas. |
| TC-14 | CA-14, CA-15, INV-011, INV-016 | Conferir o aviso de teste e varrer respostas, registros e repositório em busca de segredos. |
| TC-15 | CA-17, INV-015 | Conferir os registros de auditoria de criação, confirmação e recusa. |
| TC-16 | CA-20 | Executar a tela em 360 px, 768 px e 1366 px. |
| TC-17 | CA-21 | Provocar 401 e 500 e conferir o formato comum. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-84 | Valores guardados em centavos inteiros, em BRL, sem ponto flutuante; tipos de movimentação: taxa de entrada, assinatura, devolução e premiação; a operação de origem é referenciada por tipo e identificador (participação, assinatura, solicitação de devolução ou bolão); a chave de operação é a referência de negócio mais o número da tentativa, única em todo o sistema; uma nova tentativa só é aceita depois de a anterior ser recusada, e nunca enquanto está pendente ou confirmada; uma devolução é uma movimentação nova que guarda a referência da original. |
| OPEN-85 | Porta genérica com iniciar e consultar, estendida pelas Specs financeiras; tratadores registrados por tipo pelas Specs 019, 022, 024 e 026, executados na transação da mudança de estado e capazes de desfazê-la por falha; tarefa de conferência a cada 5 minutos e logo após a inicialização, mais a conferência de uma operação quando o usuário volta do checkout, sem webhooks (OPEN-36); histórico próprio da mais recente para a mais antiga, sem filtros, com o selo de simulação e o aviso permanente de ambiente de teste; o ator da auditoria é o usuário ao iniciar e o sistema ao aplicar a resposta do provedor; a Carteira não é usada. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-018 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-21) estiverem implementados;
- todos os invariantes (INV-001 a INV-018) estiverem preservados;
- os testes derivados (TC-01 a TC-17) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Os critérios de integração real com o Mercado Pago (smoke tests do sandbox, OPEN-26) são acompanhados nas Specs 019, 022, 024 e 026, onde cada operação é especificada; enquanto não forem executados, valem o simulador identificado e o registro de integração real como não atendida.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
