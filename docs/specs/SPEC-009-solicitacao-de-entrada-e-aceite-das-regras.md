# SPEC-009 — Solicitação de entrada, aceite das regras e entrada tardia

- **Status:** aprovada. As propostas OPEN-66 e OPEN-67 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003, SPEC-007 e SPEC-008.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/` (incluindo `matriz-de-permissoes.md` e o modelo de domínio atualizado), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-008.
- **Escopo deste documento:** somente a SPEC-009. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-009
- **Nome:** Solicitação de entrada, aceite das regras e entrada tardia
- **Objetivo:** permitir que um usuário autenticado com convite válido abra o convite, consulte as regras do bolão, veja as oportunidades de palpite já encerradas quando houver, aceite explicitamente as regras e a entrada tardia quando aplicável, e registre sua solicitação de participação, que passa a aguardar a decisão do administrador ou coadministrador.
- **Valor entregue:** a solicitação de entrada nasce com o aceite registrado e com a ciência das partidas já perdidas, fechando a primeira etapa do fluxo de entrada sem conceder acesso ao bolão.

## 2. Rastreabilidade

- **RF:** RF11 (visão do convidado), RF13 (solicitação de entrada), RF15 (aceite das regras) e RF16 (entrada tardia).
- **RB:** RB05 (o plano não limita a participação), RB17 (somente convidados), RB19 (aceite das regras), RB20 e RB61 (entrada tardia e seu aceite explícito), RB21 (consequência da entrada tardia, apenas informada aqui; o bloqueio do palpite é da SPEC-012) e RB65 (registro do aceite).
- **RNF:**
  - RNF01 e RNF11 — o convidado só vê as regras com convite válido vinculado a ele; o código do convite não vaza.
  - RNF02 — participação e registros de auditoria formam uma unidade atômica.
  - RNF04 e RNF16 — aceite das regras e solicitação de entrada são operações auditáveis, com a ciência da entrada tardia nos detalhes.
  - RNF18 — regras críticas (aceite, entrada tardia, unicidade) com testes independentes da interface.
  - RNF13 e RNF14 — a entrada em bolão é fluxo principal: compatibilidade de navegadores e responsividade.
- **Caso de uso ou fluxo:** UC03, passos 1 a 5 e exceções A1, A2 e A3; os passos 6 a 9 pertencem às SPEC-010 e SPEC-022.
- **Entidades do modelo conceitual:** `Convite`, `Participacao`, `Bolao`, `Usuario`, `Partida` e `RegistroAuditoria`.
- **Drivers arquiteturais:** DA-01 (integridade do aceite e da unicidade), DA-04 (acesso condicionado ao convite) e DA-06 (navegadores e telas).
- **ADRs:** ADR-0005 (validação e aceite no backend), ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Abrir convite:** com sessão válida e o código, o sistema verifica e consome o convite (SPEC-008), devolve as regras do bolão, a situação do usuário em relação ao bolão e, se aplicável, as oportunidades de palpite já encerradas (OPEN-66, OPEN-67).
2. **Visão das regras do convidado (RF11, OPEN-19):** nome, período, taxa de entrada, modelo de premiação, critério de desempate, partidas selecionadas, indicação de resultados ao vivo e condições de participação, sem lista de participantes.
3. **Entrada tardia (RF16, RB20, RB61):** quando há partida selecionada já iniciada, informar quais oportunidades de palpite estão encerradas e exigir a confirmação explícita de ciência.
4. **Solicitar entrada (RF13, RF15, RB19, RB65):** com o aceite explícito das regras e, quando exigida, a ciência da entrada tardia, registrar a participação como solicitada.
5. **Unicidade:** no máximo uma participação por usuário e bolão; quem já tem participação, em qualquer status, não solicita de novo (OPEN-66).
6. **Auditoria (SPEC-002):** registro do aceite das regras e da solicitação de entrada.
7. **Interface:** tela do convite (regras, aviso de entrada tardia, caixas de aceite, envio e situação da solicitação), com o código mantido durante o login e removido do endereço.

### Fora do escopo

- Aprovar ou rejeitar a solicitação, e definir a data de entrada e o sinalizador definitivo de entrada tardia, que são preenchidos na confirmação da participação (SPEC-010 e SPEC-022).
- Pagamento da taxa de entrada (SPEC-022).
- O bloqueio de palpite nas partidas já iniciadas (SPEC-012).
- Notificações de aprovação (SPEC-027).
- Gerar, listar ou revogar convites (SPEC-008).
- Nova solicitação de quem foi rejeitado ou saiu, que a baseline não prevê (OPEN-66).

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, configuração, correlação), SPEC-002 (auditoria), SPEC-003 (autenticação e formato de erros), SPEC-007 (bolão, regras e participação) e SPEC-008 (verificação e consumo de convites). O catálogo de partidas vem da SPEC-006, por meio das partidas selecionadas do bolão.
- **Decisões arquiteturais:** ADR-0005 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- O usuário está autenticado e possui um link de convite.
- O usuário ainda não está confirmado no bolão.

### Fluxo principal

1. O usuário abre o link. Se não houver sessão, a interface leva ao login ou ao cadastro e depois retorna ao convite, mantendo o código.
2. O sistema verifica o convite e o consome, vinculando-o ao usuário (SPEC-008).
3. O sistema apresenta as regras do bolão e a situação do usuário.
4. Se existem partidas selecionadas já iniciadas, o sistema mostra as oportunidades de palpite já encerradas e informa que o usuário não poderá palpitar nelas.
5. O usuário aceita explicitamente as regras e, quando exigido, confirma a ciência da entrada tardia, e envia a solicitação.
6. Em uma transação, o sistema registra a participação como solicitada (papel participante, aceite em UTC, pagamento não confirmado) e os registros de auditoria do aceite e da solicitação.
7. O sistema informa que a solicitação aguarda a decisão do administrador ou coadministrador.

### Fluxos alternativos

- **A1 — Bolão sem partida iniciada:** a ciência da entrada tardia não é exigida, ainda que o período já tenha começado.
- **A2 — Reabertura do convite pelo mesmo usuário:** o convite continua válido para ele e o sistema mostra a situação atual (sem solicitação, solicitada, aprovada aguardando pagamento, confirmada, rejeitada ou saiu).
- **A3 — Usuário não aceita as regras ou não confirma a ciência:** o fluxo é encerrado sem solicitação (UC03 A2 e A3), sem registro de aceite.

### Fluxos de exceção

- **E1 — Convite inexistente, expirado, revogado, usado por outro usuário ou de bolão encerrado:** a mesma resposta de não encontrado (404), sem solicitação (UC03 A1).
- **E2 — Sessão ausente, inválida, expirada ou encerrada:** rejeitada (401).
- **E3 — Aceite ausente, ou ciência ausente quando exigida no momento do registro:** erro de validação (400) indicando o campo; nada é registrado.
- **E4 — Usuário já possui participação no bolão, em qualquer status:** a solicitação é recusada (409); a abertura do convite informa a situação.
- **E5 — Solicitações simultâneas do mesmo usuário:** uma é registrada e as demais recebem 409.
- **E6 — Falha ao gravar a participação ou os registros de auditoria:** nada é persistido (500, sem detalhes internos). O vínculo do convite, já consumido na abertura, permanece.

### Pós-condições

- Solicitação registrada: uma participação com status solicitada, aceite registrado e dois registros de auditoria.
- A participação não está confirmada e o usuário continua sem acesso ao bolão como membro.
- Falhas: nenhuma participação ou registro de aceite parcial.

## 6. Regras e invariantes

- **INV-001:** somente um usuário autenticado com convite válido, ativo ou já vinculado a ele, abre o convite e solicita entrada (RB17, RF13).
- **INV-002:** abrir o convite o consome de forma atômica e o vincula ao usuário, mas não cria participação (SPEC-008).
- **INV-003:** um usuário tem no máximo uma participação por bolão; quem já tem participação em qualquer status, inclusive rejeitada ou saiu, não solicita de novo (OPEN-66).
- **INV-004:** a solicitação só é registrada com o aceite explícito das regras; sem aceite nada é registrado (RF15, RB19, RB65).
- **INV-005:** quando, no momento do registro, o bolão tem partida selecionada já iniciada, a solicitação exige a confirmação explícita da ciência da entrada tardia, e essa necessidade é recalculada no backend (RF16, RB20, RB61, OPEN-67).
- **INV-006:** a participação nasce com papel participante, status solicitada, aceite das regras em UTC, pagamento não confirmado, pontuação zero e sem data de entrada, que é a da confirmação (OPEN-17).
- **INV-007:** a solicitação não confirma a participação nem concede acesso de membro; a consulta de regras da SPEC-007 continua devolvendo 404 (RB18).
- **INV-008:** o aceite e a solicitação geram dois registros de auditoria de sucesso na mesma transação da participação, com, nos detalhes, a indicação da ciência da entrada tardia e a quantidade de partidas já encerradas (RNF16, OPEN-67).
- **INV-009:** o plano do usuário não limita a quantidade de bolões em que ele solicita entrada (RB05).
- **INV-010:** as oportunidades de palpite já encerradas são as partidas selecionadas cujo início é anterior ao momento da consulta, excluídas as canceladas, em ordem cronológica (OPEN-67).
- **INV-011:** a visão das regras do convidado contém somente o conteúdo definido na OPEN-19, nunca a lista de participantes.
- **INV-012:** convite indisponível por qualquer motivo recebe a mesma resposta (404) (SPEC-008).
- **INV-013:** aceite e ciência são validados no backend; a interface não é autoridade (ADR-0005).
- **INV-014:** o código do convite não aparece em registros técnicos, auditoria ou respostas de erro (RNF01).
- **INV-015:** bolão encerrado não aceita novas solicitações (SPEC-008).

## 7. Modelo de domínio envolvido

- **Participacao:** papel (participante), status (solicitada), aceite das regras em UTC, indicação de pagamento confirmado (falsa), pontuação total (zero); `dataEntrada` e o sinalizador definitivo `entradaTardia` ficam vazios até a confirmação (SPEC-010 e SPEC-022). Relacionada ao `Usuario` e ao `Bolao`.
- **Convite:** consumido na abertura, passando a usado e vinculado ao usuário (SPEC-008).
- **Bolao e Partida:** somente leitura, para regras e oportunidades encerradas.
- **RegistroAuditoria:** dois registros por solicitação, um do aceite das regras e outro da solicitação de entrada.
- **Restrições:** no máximo uma participação por usuário e bolão; solicitação só com aceite.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "bolões e participações", "partidas e resultados" (leitura), "notificações e auditoria" e a persistência, a configuração e a correlação da SPEC-001.
- **Fronteiras:**
  - O backend decide a validade do convite, o aceite, a ciência e a unicidade; a interface apresenta e coleta as confirmações.
  - A verificação e o consumo do convite são os da SPEC-008, sem reimplementação.
- **Integrações necessárias:** nenhuma.
- **Frontend:** tela do convite acessada pelo link, com o código lido do fragmento, removido da barra de endereço e mantido no `sessionStorage` durante o login e o cadastro; exibição das regras e do aviso de entrada tardia; duas caixas de confirmação; situação da solicitação; utilizável em 360 px, 768 px e 1366 px.
- **Backend:** abertura do convite, cálculo das oportunidades encerradas, validação do aceite e da ciência, registro atômico da participação e da auditoria.
- **ADRs que restringem a solução:** ADR-0001, ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. O código do convite viaja no corpo, nunca na URL enviada ao servidor. Erros seguem o formato comum da SPEC-003 e as categorias das SPEC-006 e SPEC-008.

- **Abrir convite**
  - Entrada: código do convite, sessão válida.
  - Saída: regras do bolão (nome, status, período, taxa, modelo de premiação, critério de desempate, partidas selecionadas, resultados ao vivo e condições de participação), situação do usuário (sem solicitação, solicitada, aprovada aguardando pagamento, confirmada, rejeitada ou saiu) e, se houver partidas já iniciadas, as oportunidades de palpite encerradas e a indicação de que a ciência é exigida.
  - Erros: 401; 404 (convite indisponível, resposta única); 500.
- **Solicitar entrada**
  - Entrada: código do convite, aceite das regras e, quando exigida, ciência da entrada tardia.
  - Saída: participação solicitada, com a data e hora do aceite.
  - Erros: 401; 400 (campo de aceite ou de ciência); 404 (convite indisponível); 409 (já existe participação); 500.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF01 e RNF11 | Abrir convite sem sessão, de outro usuário, indisponível, e conferir 401 e 404 sem dados; varrer registros em busca do código (TC-03, TC-16). |
| RNF02 | Falhar a gravação da participação e da auditoria e conferir que nada persiste (TC-13). |
| RNF04 e RNF16 | Conferir os registros do aceite e da solicitação, com a ciência nos detalhes (TC-04, TC-14). |
| RNF18 | Testes automatizados de aceite, entrada tardia e unicidade, sem credenciais externas (TC-04 a TC-12). |
| RNF13 e RNF14 | Roteiro do fluxo do convite nos navegadores do RNF13 e em 360 px, 768 px e 1366 px (TC-18, TC-19). |

## 11. Critérios de aceitação

- **CA-01 (abrir convite):** Dado um usuário autenticado com convite ativo, Quando ele abre o convite, Então o convite fica usado e vinculado a ele, recebe as regras do bolão e a situação "sem solicitação", e nenhuma participação é criada.
- **CA-02 (sem sessão):** Dado um link de convite aberto sem sessão, Quando o usuário faz login ou cadastro, Então a interface o devolve ao convite sem perder o código e o código sai da barra de endereço.
- **CA-03 (convite indisponível):** Dado um código inexistente, um convite expirado, um revogado, um usado por outro usuário e um de bolão encerrado, Quando são abertos, Então todos recebem a mesma resposta (404) e nenhuma solicitação é registrada.
- **CA-04 (solicitação sem entrada tardia):** Dado um bolão sem partida selecionada já iniciada, Quando o usuário aceita as regras e solicita a entrada, Então existe uma participação solicitada, de papel participante, com o aceite em UTC e pagamento não confirmado, sem exigir a ciência, e dois registros de auditoria de sucesso.
- **CA-05 (sem aceite):** Dado uma solicitação sem o aceite das regras, Quando ela é enviada, Então é rejeitada (400) indicando o campo e nenhuma participação nem registro de aceite é criado.
- **CA-06 (entrada tardia informada):** Dado um bolão com ao menos uma partida selecionada já iniciada, Quando o usuário abre o convite, Então vê as partidas já iniciadas, sem as canceladas, em ordem cronológica, e a indicação de que a ciência é exigida.
- **CA-07 (entrada tardia confirmada):** Dado o mesmo bolão, Quando o usuário aceita as regras, confirma a ciência e solicita, Então a solicitação é registrada e os detalhes da auditoria indicam a ciência e a quantidade de partidas já encerradas.
- **CA-08 (ciência ausente):** Dado o mesmo bolão, Quando a solicitação é enviada sem a ciência, Então é rejeitada (400) indicando o campo e nada é registrado.
- **CA-09 (recálculo no backend):** Dado que, entre a abertura e o envio, uma partida selecionada passou a estar iniciada e o cliente não confirmou a ciência, Quando a solicitação é enviada, Então é rejeitada (400) pela ciência.
- **CA-10 (participação existente):** Dado um usuário que já tem participação solicitada, aprovada, confirmada, rejeitada ou que saiu, Quando ele tenta solicitar de novo, Então recebe 409 e a abertura do convite mostra a situação atual.
- **CA-11 (solicitações simultâneas):** Dado um usuário apto, Quando duas solicitações simultâneas são enviadas, Então apenas uma participação é criada e a outra recebe 409.
- **CA-12 (sem acesso de membro):** Dado uma solicitação registrada, Quando o usuário consulta as regras pela consulta de membros da SPEC-007, Então recebe 404 e a participação não está confirmada.
- **CA-13 (plano irrelevante):** Dado um usuário Gratuito que já participa de vários bolões e um Premium, Quando cada um solicita entrada em um novo bolão, Então ambos conseguem.
- **CA-14 (visão das regras):** Dado a abertura de um convite, Quando a resposta é examinada, Então contém exatamente as regras definidas e nenhuma lista de participantes.
- **CA-15 (atomicidade):** Dado que a gravação da participação ou da auditoria falha, Quando a solicitação é enviada, Então nenhuma participação nem registro é persistido.
- **CA-16 (situação da solicitação):** Dado uma solicitação registrada, Quando o usuário reabre o convite, Então vê a situação "solicitada".
- **CA-17 (sem segredos):** Dado qualquer operação desta Spec, Quando registros técnicos, auditoria e respostas de erro são inspecionados, Então não contêm o código do convite.
- **CA-18 (sessão):** Dado uma requisição sem sessão válida, Quando abre o convite ou solicita, Então recebe 401.
- **CA-19 (formato de erros):** Dado erros 400, 401, 404, 409 e 500, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.
- **CA-20 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o usuário abre o convite, lê o aviso, marca as confirmações e envia, Então as telas permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página.
- **CA-21 (navegadores):** Dado os navegadores e sistemas do RNF13, Quando o roteiro do convite é executado, Então funciona sem erro que bloqueie o fluxo.
- **CA-22 (código na jornada):** Dado o código lido do fragmento, Quando a jornada termina com a solicitação registrada ou a aba é fechada, Então o código é descartado do navegador.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-002 | Abrir convite ativo e conferir vínculo, regras, situação e ausência de participação. |
| TC-02 | CA-02, CA-22 | Abrir o link sem sessão, autenticar-se e conferir o retorno ao convite e o descarte do código. |
| TC-03 | CA-03, CA-18, INV-012 | Abrir convites indisponíveis e sem sessão e comparar as respostas. |
| TC-04 | CA-04, INV-004, INV-006, INV-008 | Solicitar sem entrada tardia e conferir participação e dois registros de auditoria. |
| TC-05 | CA-05, INV-004 | Enviar solicitação sem aceite. |
| TC-06 | CA-06, INV-010 | Abrir convite de bolão com partidas iniciadas e canceladas e conferir a lista. |
| TC-07 | CA-07, INV-005 | Solicitar com aceite e ciência e conferir os detalhes da auditoria. |
| TC-08 | CA-08, CA-09 | Enviar sem ciência e simular a mudança de condição entre abertura e envio. |
| TC-09 | CA-10, INV-003 | Solicitar com participação em cada status existente. |
| TC-10 | CA-11, CA-12, INV-007 | Enviar duas solicitações simultâneas e consultar as regras como membro. |
| TC-11 | CA-13, INV-009 | Solicitar com usuários Gratuito e Premium. |
| TC-12 | CA-14, INV-011 | Examinar a resposta da abertura do convite. |
| TC-13 | CA-15 | Forçar falha na participação e na auditoria. |
| TC-14 | CA-16 | Reabrir o convite após a solicitação. |
| TC-15 | CA-19 | Provocar cada categoria de erro e conferir o formato comum. |
| TC-16 | CA-17, INV-014 | Varrer registros técnicos, auditoria e erros em busca do código. |
| TC-17 | INV-013, INV-015 | Enviar requisições diretas sem aceite e em bolão encerrado, sem a interface. |
| TC-18 | CA-21 | Roteiro manual do convite nos navegadores do RNF13. |
| TC-19 | CA-20 | Executar as telas em 360 px, 768 px e 1366 px. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-66 | O convite é consumido quando o usuário autenticado o abre, vinculando-o a ele; a abertura nunca cria participação; um usuário tem no máximo uma participação por bolão e quem já tem participação em qualquer status, inclusive rejeitada ou saiu, não solicita de novo (409); a abertura devolve a situação atual do usuário, que é também o modo de acompanhar a solicitação. |
| OPEN-67 | As oportunidades encerradas são as partidas selecionadas com início anterior ao momento da consulta, sem as canceladas, em ordem cronológica; a ciência é exigida quando existe ao menos uma e é recalculada no backend no envio, sem fixar a lista exibida; o aceite e a ciência ficam nos detalhes dos registros de auditoria (ciência confirmada e quantidade de partidas encerradas); a interface mantém o código no `sessionStorage` durante login e cadastro, remove-o do endereço ao lê-lo e o descarta quando a solicitação é registrada ou a aba é fechada. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-009 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-22) estiverem implementados;
- todos os invariantes (INV-001 a INV-015) estiverem preservados;
- os testes derivados (TC-01 a TC-19) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com os roteiros de navegadores e de larguras de tela dos RNF13 e RNF14 executados somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
