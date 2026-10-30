# SPEC-013 — Sincronização de resultados oficiais

- **Status:** aprovada. As propostas OPEN-74 e OPEN-75 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003, SPEC-006 e SPEC-007. A integração real depende da prova técnica da OPEN-01.
- **Tipo:** Spec funcional com integração externa isolada e infraestrutura de agendamento.
- **Baseline:** artefatos de `docs/` (incluindo ADR-0002 e ADR-0006), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-012.
- **Escopo deste documento:** somente a SPEC-013. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-013
- **Nome:** Sincronização de resultados oficiais
- **Objetivo:** consultar periodicamente a API esportiva, por meio do adaptador isolado, validar a resposta e registrar o estado e o resultado oficial das partidas selecionadas por bolões ativos, preservando os dados em caso de falha, permitindo nova sincronização e impedindo qualquer inserção ou edição manual de resultado.
- **Valor entregue:** resultados oficiais confiáveis e disponíveis aos participantes depois do encerramento das partidas, sem intervenção humana, e o gatilho de dados limpo para o cálculo da pontuação (SPEC-014).

## 2. Rastreabilidade

- **RF:** RF23 (consulta e registro do resultado oficial) e RF25 (bloqueio de alteração manual).
- **RB:** RB07 e RB32 (bolões sem recurso ao vivo só veem o resultado após o encerramento da partida), RB29 (fonte exclusiva), RB30 e RB60 (nenhuma alteração administrativa).
- **RNF:**
  - RNF08 — falha da API preserva dados, é indicada e permite nova tentativa; nada de resultado manual.
  - RNF17 — o resultado final é refletido em até 15 minutos nas condições normais e a sincronização pode ser repetida sem duplicar.
  - RNF02 — a gravação de uma sincronização e seus registros de auditoria formam uma unidade atômica.
  - RNF04 e RNF16 — a sincronização de resultados é operação auditável, com o sistema como ator (SPEC-002).
  - RNF03 — as consultas apresentam o mesmo estado persistido.
  - RNF01 — o resultado só é exposto a membros do bolão.
  - RNF18 — testes com respostas controladas do adaptador, sem credenciais externas.
  - RNF20 — falhas de integração registradas, sem segredos.
  - RNF14 — por extensão: tela de resultados utilizável em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC05, passos 1 a 3 e exceções A1 (resultado indisponível), A2 (API indisponível ou resposta inválida) e A3 (bolão sem acompanhamento ao vivo); os passos 4 a 8 pertencem às SPEC-014 a SPEC-016.
- **Entidades do modelo conceitual:** `Partida` (status e placar), `Bolao` (partidas selecionadas e status), `Participacao` (para a consulta) e `RegistroAuditoria`.
- **Drivers arquiteturais:** DA-02 (integração esportiva isolada e tolerante a falhas) e DA-01 (integridade do resultado e das correções).
- **ADRs:** ADR-0002 (API esportiva e adaptador), ADR-0006 (agendamento em processo), ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Extensão da porta do provedor esportivo** (SPEC-006) com a obtenção do estado e do resultado das partidas da temporada, nas implementações simulada e real, esta ativada só após a prova técnica da OPEN-01.
2. **Agendador em processo** (ADR-0006): mecanismo reutilizável de tarefas periódicas, com intervalo configurável, sem sobreposição de execuções da mesma tarefa, isolamento de falhas e acionamento direto nos testes. Esta Spec é a primeira a usá-lo e registra a tarefa de sincronização de resultados, com intervalo padrão de 10 minutos.
3. **Sincronização de resultados:** a cada execução, identifica as partidas a acompanhar, consulta o provedor uma única vez, valida a resposta e atualiza estado e placar (OPEN-59, OPEN-74).
4. **Registro do resultado oficial:** somente o placar final de partida encerrada, e somente pela sincronização.
5. **Correção de resultado** pelo provedor, conforme a política da OPEN-04.
6. **Gatilho para a pontuação:** cada registro ou correção de resultado incrementa uma versão do resultado da partida, que a SPEC-014 consome.
7. **Bloqueio de edição manual** (RF25, RB30, RB60): nenhuma operação escreve resultado, placar ou estado de partida.
8. **Consulta de resultados do bolão** pelos membros, com a situação da última sincronização.
9. **Auditoria (SPEC-002):** registros com o sistema como ator, por partida alterada e por execução malsucedida.
10. **Interface:** tela de resultados do bolão com as partidas, seus status, os placares finais e o aviso de última sincronização.

### Fora do escopo

- Cálculo de pontos, ranking, medalhas e encerramento do bolão (SPEC-014 a SPEC-016 e SPEC-025).
- Atualizações ao vivo e placar parcial exibido ao usuário (SPEC-021).
- Atualização do catálogo de times, rodadas e partidas e do horário de partidas remarcadas (SPEC-006).
- Outras tarefas agendadas: conferência de pagamentos (SPEC-018 e SPEC-022), resultados ao vivo (SPEC-021) e verificação de encerramento (SPEC-025).
- Execução da prova técnica da API-Football, que depende da equipe (OPEN-01).
- Notificações de resultado (SPEC-027).

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, configuração, correlação, testes), SPEC-002 (auditoria), SPEC-003 (autenticação e formato de erros), SPEC-006 (catálogo e porta do provedor) e SPEC-007 (bolões e partidas selecionadas). A consulta usa a condição de membro definida pelas SPEC-007, SPEC-009 e SPEC-010.
- **Decisões arquiteturais:** ADR-0002, ADR-0006 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- SPEC-001, SPEC-002, SPEC-006 e SPEC-007 operantes.
- Existe ao menos uma partida selecionada por um bolão ativo, cujo início já passou e cujo status armazenado é agendada, em andamento ou adiada (partidas a acompanhar).
- Há uma fonte configurada (por padrão, a simulada).

### Fluxo principal — sincronização

1. O agendador dispara a tarefa no intervalo configurado e uma vez logo após a inicialização do backend.
2. O sistema determina as partidas a acompanhar. Se não há nenhuma, encerra a execução sem consultar o provedor.
3. O sistema consulta o provedor uma única vez e recebe o estado e o resultado das partidas da temporada.
4. O sistema valida a resposta e, para cada partida acompanhada, aplica o que o provedor informa:
   - em andamento: grava o status em andamento, sem registrar placar oficial;
   - encerrada com placar final válido: grava o status encerrada e o placar oficial e incrementa a versão do resultado;
   - adiada ou cancelada: grava o status correspondente;
   - encerrada sem placar disponível, ou sem mudança: mantém os dados existentes.
5. Em uma única transação, o sistema persiste as alterações, os metadados da última sincronização e os registros de auditoria de sucesso, com o sistema como ator.
6. As partidas encerradas ficam prontas para a pontuação (SPEC-014).

### Fluxo principal — consultar resultados

1. Um membro do bolão pede os resultados.
2. O sistema devolve as partidas selecionadas com o status e, para as encerradas, o placar final, e a situação da última sincronização (momento e resultado).

### Fluxos alternativos

- **A1 — Correção de resultado:** o provedor passa a informar um placar diferente para uma partida já encerrada; se existe ao menos um bolão ativo que a selecione, o placar é atualizado e a versão do resultado é incrementada; se todos os bolões que a selecionam estão encerrados, o placar não muda e a divergência é auditada (OPEN-04).
- **A2 — Execução sem mudanças:** nada é gravado, nenhum registro de auditoria é criado e a situação da última sincronização é atualizada.
- **A3 — Partida de nenhum bolão ativo:** não é acompanhada nem alterada.

### Fluxos de exceção

- **E1 — Resultado ainda indisponível** (UC05 A1): os dados existentes são mantidos e a partida não é marcada como encerrada nem pontuada.
- **E2 — Tempo esgotado, erro de resposta ou resposta inválida** (UC05 A2): nada é alterado, a falha é registrada tecnicamente e na auditoria (sistema como ator, resultado falha) e a situação da última sincronização indica a falha; a execução seguinte tenta de novo.
- **E3 — Item inválido de partida acompanhada:** a resposta é rejeitada por inteiro, com o tratamento da E2; itens de partidas não acompanhadas ou desconhecidas são ignorados.
- **E4 — Tentativa de inserir, editar ou substituir resultado, placar ou estado de partida por qualquer usuário, inclusive administrador:** nenhuma operação existe para isso e a tentativa é rejeitada sem efeito (RF25).
- **E5 — Consulta por quem não é membro, ou bolão inexistente:** 404, sem dados; sem sessão, 401.
- **E6 — Falha ao gravar as alterações ou os registros de auditoria:** nada é persistido e a execução é tratada como falha.

### Pós-condições

- Apenas o placar final obtido da fonte integrada é tratado como oficial.
- Falhas não apagam nem substituem resultados já validados.
- Cada registro ou correção de resultado incrementou a versão do resultado da partida.

## 6. Regras e invariantes

- **INV-001:** o resultado oficial é obtido exclusivamente do provedor esportivo, pelo adaptador; nenhuma operação, de nenhum papel, insere, edita ou substitui resultado, placar ou estado de partida manualmente (RB29, RB30, RB60, RF25, RNF08).
- **INV-002:** apenas o placar final é gravado como resultado oficial, e somente quando o provedor informa status encerrada com os dois placares válidos; placar parcial nunca é gravado como oficial (UC05, passo 3).
- **INV-003:** tempo esgotado, erro de resposta, resposta inválida ou resultado ainda indisponível não apagam nem substituem dados persistidos; a falha é registrada e uma nova sincronização pode ser tentada (RNF08, UC05 A1 e A2).
- **INV-004:** a gravação de uma execução, com seus registros de auditoria, é atômica; uma resposta com item inválido de partida acompanhada é rejeitada por inteiro (OPEN-75).
- **INV-005:** a sincronização é idempotente: repetir com os mesmos dados não altera partidas nem versões e não cria registros de auditoria (RNF17).
- **INV-006:** duas execuções da mesma tarefa nunca se sobrepõem, e a falha de uma execução não interrompe o agendador (ADR-0006).
- **INV-007:** só são acompanhadas as partidas selecionadas por ao menos um bolão ativo, cujo início já passou e cujo status armazenado é agendada, em andamento ou adiada; sem partidas a acompanhar, o provedor não é consultado (UC05, OPEN-74).
- **INV-008:** o placar de uma partida encerrada só é corrigido se ao menos um bolão ativo a selecionar; senão a divergência é apenas auditada e o dado permanece (OPEN-04).
- **INV-009:** cada registro ou correção de resultado incrementa a versão do resultado da partida, que é o gatilho do cálculo da SPEC-014; esta Spec não calcula pontos (OPEN-74).
- **INV-010:** uma partida encerrada nunca volta a outro status por sincronização (OPEN-74).
- **INV-011:** instantes de sincronização e de registro usam o relógio do servidor em UTC (RNF04).
- **INV-012:** o resultado só é exposto a membros do bolão (participação aprovada ou confirmada), e o placar de uma partida só existe depois que ela é encerrada (RB07, RB32, RNF01).
- **INV-013:** na auditoria, o ator da sincronização é o sistema, com resultado sucesso por partida alterada ou corrigida e resultado falha por execução malsucedida (RNF04, OPEN-45, OPEN-74).
- **INV-014:** a chave do fornecedor não aparece em respostas, registros técnicos ou auditoria (RNF20, RNF15).
- **INV-015:** cada execução faz no máximo uma consulta ao provedor (cota).
- **INV-016:** a frequência da tarefa é configurável, com padrão de 10 minutos; se a cota do fornecedor impedir o limite de 15 minutos do RNF17, a limitação observada é documentada (RNF17).
- **INV-017:** a interface nunca escreve resultados; só os consulta.

## 7. Modelo de domínio envolvido

- **Partida:** status (agendada, em andamento, encerrada, adiada, cancelada) e placar do mandante e do visitante, gravados somente por esta Spec; atributos técnicos: versão do resultado e momento do registro.
- **Metadados da sincronização (técnicos):** momento e resultado da última tentativa e da última execução bem-sucedida.
- **Bolao e Participacao:** somente leitura (partidas selecionadas, status do bolão e condição de membro).
- **RegistroAuditoria:** registros com o sistema como ator, objeto partida e detalhes de status e placar anterior e novo; em falha, o objeto é a sincronização.
- **Restrições:** placar oficial somente de partida encerrada; versão do resultado crescente.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "partidas e resultados" (principal), o adaptador de "integrações externas", "bolões e participações" (leitura), "notificações e auditoria" e o agendador na infraestrutura da SPEC-001.
- **Fronteiras:**
  - A porta do provedor esportivo é definida pelo domínio; o domínio não conhece o cliente do fornecedor (RNF19).
  - A SPEC-014 depende desta Spec: consome partidas encerradas e a versão do resultado; esta Spec não a chama.
  - A SPEC-006 mantém o catálogo e o horário; esta Spec mantém status e placar de partidas acompanhadas (OPEN-59).
- **Integrações necessárias:** API-Football, em ambiente de teste ou plano gratuito, somente após a prova técnica; antes disso, o provedor simulado.
- **Frontend:** tela de resultados do bolão, só leitura, com aviso de falha da última sincronização; utilizável em 360 px, 768 px e 1366 px.
- **Backend:** agendador, tarefa de sincronização, validação, atualização atômica, correções, auditoria e consulta.
- **Configuração:** intervalo da tarefa e demais parâmetros do provedor, no `.env.example`, sem valores secretos.
- **ADRs que restringem a solução:** ADR-0002, ADR-0006, ADR-0001 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003.

- **Porta do provedor esportivo — estado e resultado das partidas (interna)**
  - Entrada: temporada.
  - Saída: para cada partida, identificador do fornecedor, status normalizado e placar final (somente quando encerrada).
  - Erros: tempo esgotado, erro de resposta, resposta inválida, status desconhecido.
- **Sincronizar resultados (interna)**
  - Entrada: disparo do agendador ou de um teste.
  - Saída: resumo (partidas alteradas, corrigidas, divergências) ou falha classificada, sem efeitos parciais.
- **Agendador (interno)**
  - Entrada: nome da tarefa, intervalo e função.
  - Saída: execução periódica sem sobreposição, com isolamento de falhas, início e parada junto do backend e acionamento direto em testes.
- **Consultar resultados do bolão**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: partidas selecionadas com status e, para as encerradas, placar final; momento e resultado da última sincronização.
  - Erros: 401; 404 (não membro ou bolão inexistente).
- **Detalhes do registro de auditoria:** status anterior e novo e placar anterior e novo da partida; em divergência, o placar recebido e o mantido; em falha, o tipo da falha.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF08 | Simular tempo esgotado, erro de resposta, resposta inválida e recuperação, conferindo preservação, indicação de falha e sincronização posterior (TC-04). |
| RNF17 | Usar respostas controladas do adaptador e medir o intervalo até a atualização com o intervalo padrão; documentar a frequência permitida pelo fornecedor (TC-06, TC-21). |
| RNF02 | Falhar a gravação e a auditoria e conferir que nada muda (TC-13). |
| RNF04 e RNF16 | Conferir os registros com o sistema como ator, por partida alterada e por falha (TC-14). |
| RNF03 | Conferir o mesmo estado nas consultas e no gatilho da pontuação após a sincronização (TC-18). |
| RNF01 | Consultar resultados sem sessão e como não membro (TC-17). |
| RNF18 | Executar a suíte com respostas controladas, sem credenciais e sem rede externa (TC-01 a TC-16). |
| RNF20 | Varrer registros técnicos e auditoria em busca da chave (TC-19). |
| RNF14 (por extensão) | Roteiro da tela de resultados em 360 px, 768 px e 1366 px (TC-20). |

## 11. Critérios de aceitação

- **CA-01 (resultado final):** Dado uma partida selecionada por um bolão ativo, já iniciada, e um provedor que a informa como encerrada em 2 a 1, Quando a sincronização é executada, Então a partida fica encerrada com o placar 2 a 1, a versão do resultado é incrementada e existe um registro de auditoria de sucesso com o sistema como ator e os valores anterior e novo.
- **CA-02 (em andamento):** Dado o provedor informando a partida em andamento com placar parcial, Quando a sincronização é executada, Então o status passa a em andamento e nenhum placar oficial é gravado.
- **CA-03 (resultado indisponível):** Dado o provedor informando a partida como encerrada sem placar, Quando a sincronização é executada, Então os dados existentes são mantidos e a partida não é marcada como encerrada.
- **CA-04 (falhas da fonte):** Dado tempo esgotado, erro de resposta e resposta inválida, Quando a sincronização é executada em cada caso, Então os dados persistidos permanecem, a falha é registrada tecnicamente e na auditoria e a situação da última sincronização indica falha; e quando o provedor se recupera, a execução seguinte atualiza os dados.
- **CA-05 (idempotência):** Dado duas execuções com os mesmos dados, Quando a segunda termina, Então nenhuma partida, versão ou registro de auditoria foi alterado ou criado por ela.
- **CA-06 (correção com bolão ativo):** Dado uma partida encerrada selecionada por um bolão ativo e o provedor informando outro placar, Quando a sincronização é executada, Então o placar é atualizado, a versão é incrementada e a auditoria traz o placar anterior e o novo.
- **CA-07 (correção sem bolão ativo):** Dado uma partida encerrada selecionada apenas por bolões encerrados e o provedor informando outro placar, Quando a sincronização é executada, Então o placar não muda e a divergência é registrada na auditoria.
- **CA-08 (adiada e cancelada):** Dado uma partida acompanhada que o provedor informa como adiada e outra como cancelada, Quando a sincronização é executada, Então os status correspondentes são gravados e nenhuma é tratada como encerrada.
- **CA-09 (encerrada não regride):** Dado uma partida já encerrada e o provedor informando em andamento, Quando a sincronização é executada, Então o status e o placar permanecem.
- **CA-10 (partidas a acompanhar e cota):** Dado nenhum bolão ativo com partida iniciada e não encerrada, e depois várias partidas nessa condição, Quando a sincronização é executada, Então no primeiro caso o provedor não é consultado e no segundo há uma única consulta.
- **CA-11 (partidas de outros bolões):** Dado partidas que nenhum bolão ativo seleciona, Quando a sincronização é executada, Então elas não são alteradas.
- **CA-12 (sem edição manual):** Dado todas as operações expostas, Quando se procura uma que escreva resultado, placar ou estado de partida, e quando um administrador tenta fazê-lo diretamente, Então nenhuma operação existe para isso e a tentativa é rejeitada sem efeito.
- **CA-13 (agendador):** Dado a tarefa registrada com intervalo configurável, Quando o tempo passa e uma execução demora além do intervalo ou falha, Então a execução não se sobrepõe a si mesma e a falha não impede a execução seguinte.
- **CA-14 (atomicidade):** Dado que a gravação das alterações ou da auditoria falha, Quando a sincronização é executada, Então nenhuma partida é alterada e a execução é tratada como falha.
- **CA-15 (itens inválidos):** Dado um item inválido de partida acompanhada e outro de partida não acompanhada, Quando a sincronização é executada, Então no primeiro caso a resposta inteira é rejeitada e no segundo o item é ignorado.
- **CA-16 (consulta de resultados):** Dado um bolão com partidas em situações diferentes, Quando um membro consulta os resultados, Então vê status e, para as encerradas, o placar final, e a situação da última sincronização; e um não membro e quem está sem sessão recebem 404 e 401.
- **CA-17 (sem placar antes do fim):** Dado uma partida em andamento de um bolão sem recurso ao vivo, Quando um membro consulta os resultados, Então vê o status sem placar.
- **CA-18 (sem segredos):** Dado qualquer execução, com sucesso ou falha, Quando registros técnicos e de auditoria são inspecionados, Então não contêm a chave do fornecedor.
- **CA-19 (formato de erros):** Dado erros 401 e 404, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.
- **CA-20 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando um membro usa a tela de resultados, Então permanece utilizável, sem sobreposição de controles nem rolagem horizontal da página, com o aviso de falha da última sincronização quando houver.
- **CA-21 (ator e instante):** Dado uma sincronização com alteração, Quando os registros de auditoria são consultados, Então o ator é o sistema e o momento está em UTC.
- **CA-22 (gatilho da pontuação):** Dado partidas encerradas com versão do resultado, Quando um consumidor de teste lê as partidas com versão maior que a última processada, Então recebe exatamente as partidas novas ou corrigidas.
- **CA-23 (execução ao iniciar):** Dado o backend iniciado, Quando o agendador sobe, Então uma execução da tarefa ocorre logo após a inicialização.
- **CA-24 (tempo até refletir):** Dado o resultado final disponível no provedor controlado e o intervalo padrão de 10 minutos, Quando o tempo avança, Então o resultado é refletido em até 15 minutos.
- **CA-25 (integração real, critério separado):** Dado a prova técnica da OPEN-01 aprovada, o provedor real configurado com a chave de teste fora do repositório e a confirmação da equipe, Quando a sincronização é executada, Então os resultados de partidas reais encerradas são registrados e os critérios CA-05, CA-06 e CA-24 se confirmam com dados reais, documentando a frequência e a cota observadas.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, CA-21, INV-002, INV-013 | Sincronizar partida encerrada e conferir placar, versão e auditoria com o sistema como ator. |
| TC-02 | CA-02, CA-03, INV-002 | Sincronizar partida em andamento e encerrada sem placar. |
| TC-03 | CA-08, CA-09, INV-010 | Sincronizar partidas adiada, cancelada e uma encerrada que o provedor informa em andamento. |
| TC-04 | CA-04, INV-003 | Simular tempo esgotado, erro de resposta, resposta inválida e recuperação. |
| TC-05 | CA-05, INV-005 | Executar a sincronização duas vezes com os mesmos dados. |
| TC-06 | CA-24, INV-016 | Avançar o tempo com o provedor controlado e medir até a atualização. |
| TC-07 | CA-06, INV-008, INV-009 | Corrigir o placar de partida encerrada em bolão ativo. |
| TC-08 | CA-07, INV-008 | Corrigir o placar de partida de bolões apenas encerrados. |
| TC-09 | CA-10, CA-11, INV-007, INV-015 | Executar sem partidas a acompanhar e com várias, e com partidas de nenhum bolão ativo. |
| TC-10 | CA-12, INV-001 | Examinar as operações expostas e tentar escrever resultado como administrador. |
| TC-11 | CA-13, INV-006 | Registrar a tarefa, forçar execução lenta e falha, e conferir a ausência de sobreposição e a continuidade. |
| TC-12 | CA-23 | Iniciar o backend e conferir a execução imediata. |
| TC-13 | CA-14, INV-004 | Forçar falha na gravação e na auditoria durante a sincronização. |
| TC-14 | CA-15 | Enviar itens inválidos de partidas acompanhadas e não acompanhadas. |
| TC-15 | CA-22, INV-009 | Ler partidas com versão maior que a última processada. |
| TC-16 | CA-16, CA-17, INV-012 | Consultar resultados como membro, não membro e sem sessão, com e sem partida em andamento. |
| TC-17 | CA-19 | Provocar 401 e 404 e conferir o formato comum. |
| TC-18 | CA-16, RNF03 | Conferir o mesmo estado nas consultas após a sincronização. |
| TC-19 | CA-18, INV-014 | Varrer registros técnicos e auditoria em busca da chave. |
| TC-20 | CA-20 | Executar a tela em 360 px, 768 px e 1366 px. |
| TC-21 | CA-25 | Sincronizar com o provedor real após a prova e a confirmação da equipe, registrando o resultado (critério de integração). |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-74 | Acompanhar partidas selecionadas por bolão ativo, com início já passado e status armazenado agendada, em andamento ou adiada, consultando o provedor uma só vez por execução e nenhuma quando não há o que acompanhar; esta Spec também grava os status adiada e cancelada das partidas acompanhadas (a data remarcada continua com o catálogo da SPEC-006) e nunca tira uma partida de encerrada; cada registro ou correção de resultado incrementa a versão do resultado da partida, que a SPEC-014 lê, sem que esta Spec a chame; a auditoria registra somente partidas alteradas ou corrigidas, divergências e execuções falhas, nunca execuções sem mudança; o agendador executa a tarefa logo após a inicialização e depois a cada 10 minutos; não há operação de escrita de resultado e qualquer tentativa direta é rejeitada sem efeito e sem auditoria. |
| OPEN-75 | Itens de partidas não acompanhadas ou desconhecidas são ignorados e o item inválido de partida acompanhada rejeita a execução inteira, coerente com a SPEC-006; a correção de placar segue a OPEN-04 (aplicada se existir bolão ativo que selecione a partida, senão só auditada como divergência com o placar recebido e o mantido); membros (participação aprovada ou confirmada) consultam os resultados do bolão com status, placar final das encerradas e a situação da última sincronização, e não há placar antes do encerramento. |

### Em aberto

Nenhuma. A prova técnica da API-Football (OPEN-01) tem decisão aprovada e depende de execução pela equipe; o resultado é acompanhado pelo critério CA-25.

## 14. Definition of Done da Spec

A SPEC-013 estará concluída quando:

- todos os critérios de aceitação funcionais (CA-01 a CA-24) estiverem implementados;
- todos os invariantes (INV-001 a INV-017) estiverem preservados;
- os testes derivados TC-01 a TC-20 estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

O critério de integração real (CA-25, TC-21) é acompanhado à parte: depende da prova técnica da OPEN-01 e da confirmação da equipe, e enquanto não for executado a Spec fica concluída com a integração real registrada como não atendida.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
