# SPEC-011 — Promoção a coadministrador

- **Status:** aprovada. As propostas OPEN-70 e OPEN-71 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003 e SPEC-007 a SPEC-010.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/` (incluindo `matriz-de-permissoes.md` e o modelo de domínio atualizado), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-010.
- **Escopo deste documento:** somente a SPEC-011. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-011
- **Nome:** Promoção a coadministrador
- **Objetivo:** permitir que o administrador de um bolão ativo consulte os participantes do bolão e atribua o papel de coadministrador a um participante confirmado, passando a ele as permissões administrativas da matriz de permissões.
- **Valor entregue:** a administração do bolão pode ser compartilhada: o coadministrador convida, aprova ou rejeita entradas e decide devoluções, sem poder promover outros.

## 2. Rastreabilidade

- **RF:** RF17 (gerenciamento de coadministrador).
- **RB:** RB16 (promoção e permissões definidas pelo sistema) e RB59 (as solicitações administrativas são analisadas por administrador ou coadministrador conforme as permissões).
- **RNF:**
  - RNF01 e RNF11 — somente quem tem permissão promove e vê a lista de participantes; a lista não expõe e-mail.
  - RNF02 — a promoção e seu registro de auditoria formam uma unidade atômica.
  - RNF04 e RNF16 — a promoção a coadministrador é decisão administrativa auditável (SPEC-002).
  - RNF12 — a autorização por papel é aplicada no backend.
  - RNF18 — a autorização por papel tem testes independentes da interface.
  - RNF14 — por extensão: telas utilizáveis em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC08, incluindo as exceções A1 (solicitante sem permissão) e A2 (usuário que não participa do bolão).
- **Entidades do modelo conceitual:** `Participacao` (papel), `Usuario` (nome), `Bolao` e `RegistroAuditoria`.
- **Drivers arquiteturais:** DA-04 (autorização por papel).
- **ADRs:** ADR-0005 (autorização no backend), ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Listar participantes do bolão** (UC08, passo 1), para administrador e coadministrador (OPEN-70).
2. **Promover** um participante confirmado do mesmo bolão a coadministrador, somente pelo administrador (RF17).
3. **Efeito imediato das permissões:** o coadministrador passa a exercer as permissões da matriz, que as SPEC-008 e SPEC-010 já aceitam para o papel.
4. **Autorização** por papel e por status da participação, com negativas auditadas (OPEN-65).
5. **Auditoria (SPEC-002):** registro da promoção e das tentativas negadas.
6. **Interface:** na tela do bolão, lista de participantes com a ação de promover, visível ao administrador.

### Fora do escopo

- Revogar ou rebaixar o papel de coadministrador e transferir a administração, que a baseline não prevê.
- A saída de um coadministrador do bolão (SPEC-017).
- Notificar o participante promovido, que não consta do RF39.
- Ranking e desempenho dos participantes (SPEC-015).
- Remoção de participante, vedada pela baseline (RB48).
- Limite de coadministradores por bolão, que a baseline não prevê.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, correlação), SPEC-002 (auditoria), SPEC-003 (autenticação e formato de erros), SPEC-007 (bolão, papéis e status), SPEC-008 e SPEC-010 (permissões do coadministrador, verificadas na integração) e SPEC-009 (participações).
- **Decisões arquiteturais:** ADR-0005 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- O solicitante está autenticado e é o administrador do bolão, com participação aprovada ou confirmada.
- O bolão está ativo.
- O participante a promover possui participação confirmada no mesmo bolão, com papel de participante.

### Fluxo principal — listar participantes

1. O administrador (ou o coadministrador) pede os participantes do bolão.
2. O sistema devolve os membros com participação aprovada ou confirmada: nome, papel e status, sem e-mail.

### Fluxo principal — promover

1. O administrador seleciona um participante e solicita a promoção.
2. Em uma transação, o sistema valida o papel do solicitante, a pertença do alvo ao bolão, o status confirmada e o papel participante do alvo e o status ativo do bolão, altera o papel do alvo para coadministrador e grava o registro de auditoria de sucesso.
3. O sistema confirma a alteração.
4. A partir daí, o coadministrador exerce as permissões da matriz neste bolão.

### Fluxos alternativos

- **A1 — Vários coadministradores:** o administrador pode promover quantos participantes confirmados desejar.
- **A2 — Coadministrador consulta a lista:** vê os mesmos participantes, sem a ação de promover.

### Fluxos de exceção

- **E1 — Sessão ausente, inválida, expirada ou encerrada:** rejeitada (401).
- **E2 — Solicitante que não é membro do bolão, ou bolão inexistente:** 404, sem dados, auditada como negada.
- **E3 — Membro sem permissão para promover** (participante comum ou coadministrador): 403, nada alterado, auditada como negada (UC08 A1).
- **E4 — Alvo que não participa do bolão, ou inexistente nele:** 404; a promoção não é realizada (UC08 A2).
- **E5 — Alvo sem participação confirmada** (solicitada, aprovada aguardando pagamento, rejeitada ou que saiu): 409, nada alterado.
- **E6 — Alvo que já é coadministrador ou é o próprio administrador:** 409, nada alterado.
- **E7 — Bolão encerrado:** a promoção é recusada (409).
- **E8 — Falha ao gravar a alteração ou o registro de auditoria:** nada é persistido (500, sem detalhes internos).

### Pós-condições

- O participante selecionado possui o papel de coadministrador no bolão; seu status e sua pontuação permanecem os mesmos.
- Um registro de auditoria de sucesso existe.
- Falhas não deixam alteração parcial.

## 6. Regras e invariantes

- **INV-001:** somente o administrador do bolão, com participação aprovada ou confirmada, promove; coadministrador e participante comum recebem 403 e quem não é membro recebe 404, ambos auditados como negado e sem alteração (RF17, RB16, matriz de permissões, OPEN-65).
- **INV-002:** o alvo precisa ter participação confirmada, com papel de participante, no mesmo bolão (UC08, OPEN-70).
- **INV-003:** a promoção altera somente o papel do alvo naquele bolão, de participante para coadministrador; status, pontuação e outras participações não mudam (RB16).
- **INV-004:** o coadministrador exerce, logo após a promoção, as permissões da matriz (convidar, aprovar e rejeitar entradas, decidir devoluções) e não promove outros participantes.
- **INV-005:** o bolão tem sempre exatamente um administrador; nenhuma operação desta Spec o altera ou o rebaixa.
- **INV-006:** a promoção e o registro de auditoria de sucesso são atômicos (RNF02).
- **INV-007:** toda tentativa sem permissão não altera nada e gera registro de auditoria com resultado negado, em transação separada (OPEN-45).
- **INV-008:** a lista de participantes só é entregue ao administrador e ao coadministrador do bolão e contém os membros (participação aprovada ou confirmada) com nome, papel e status, sem e-mail (RNF11, OPEN-70).
- **INV-009:** promoção repetida ou simultânea do mesmo alvo é efetivada uma única vez; as demais recebem 409 (ADR-0005, OPEN-71).
- **INV-010:** bolão encerrado não aceita promoções (OPEN-71).
- **INV-011:** autorização e elegibilidade são verificadas no backend; a interface não é autoridade (ADR-0005).
- **INV-012:** esta Spec não oferece operação de rebaixamento do coadministrador (OPEN-71).

## 7. Modelo de domínio envolvido

- **Participacao:** papel (participante para coadministrador); status e pontuação permanecem; relacionada ao `Usuario` e ao `Bolao`.
- **Usuario:** nome, somente leitura, para a lista.
- **Bolao:** status, somente leitura.
- **RegistroAuditoria:** um registro por promoção, com o papel anterior e o novo nos detalhes.
- **Restrições:** um administrador por bolão; o papel só avança de participante para coadministrador.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "bolões e participações", "notificações e auditoria" e persistência e correlação da SPEC-001.
- **Fronteiras:**
  - O backend decide quem pode promover e quem pode ser promovido; a interface só apresenta e envia o comando.
  - A matriz de permissões é aplicada pelas Specs de cada operação; esta Spec só atribui o papel.
- **Integrações necessárias:** nenhuma.
- **Frontend:** lista de participantes na tela do bolão para administrador e coadministrador, com a ação de promover apenas para o administrador e atualização da lista após a promoção; utilizável em 360 px, 768 px e 1366 px.
- **Backend:** listagem, promoção atômica, autorização por papel e auditoria.
- **ADRs que restringem a solução:** ADR-0001, ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003 e as categorias das SPEC-006 e SPEC-008.

- **Listar participantes do bolão**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: participantes com identificador da participação, nome, papel e status.
  - Erros: 401; 403; 404.
- **Promover a coadministrador**
  - Entrada: identificador do bolão e da participação do alvo.
  - Saída: participação atualizada, com papel coadministrador.
  - Erros: 401; 403 (sem permissão); 404 (não membro, bolão ou alvo inexistente neste bolão); 409 (alvo não confirmado, alvo já coadministrador ou administrador, ou bolão encerrado); 500.
- **Detalhes do registro de auditoria:** papel anterior e papel novo do alvo.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF01 e RNF11 | Chamar as operações sem sessão e como não membro, e conferir que a lista não traz e-mail (TC-01, TC-03). |
| RNF02 | Falhar a gravação da auditoria e conferir que o papel permanece (TC-09). |
| RNF04 e RNF16 | Conferir os registros de promoção e de negado (TC-10). |
| RNF12 e RNF18 | Testes automatizados de autorização por papel, inclusive com requisições diretas (TC-03, TC-11). |
| RNF14 (por extensão) | Roteiro das telas em 360 px, 768 px e 1366 px (TC-13). |

## 11. Critérios de aceitação

- **CA-01 (listar participantes):** Dado um bolão com participantes em vários status, Quando o administrador e o coadministrador listam os participantes, Então veem apenas os membros (participação aprovada ou confirmada), com nome, papel e status, sem e-mail e sem solicitações pendentes, rejeitadas ou de quem saiu; e um participante comum recebe 403.
- **CA-02 (promover):** Dado um participante com participação confirmada, Quando o administrador o promove, Então o papel dele passa a coadministrador, o status e a pontuação permanecem e existe um registro de auditoria de sucesso com os papéis anterior e novo.
- **CA-03 (permissões imediatas):** Dado o participante recém-promovido, Quando ele cria e lista convites e lista e decide solicitações de entrada, Então as operações são permitidas; e quando tenta promover outro participante, Então recebe 403.
- **CA-04 (sem permissão):** Dado um coadministrador, um participante comum, um não membro e uma requisição sem sessão, Quando tentam promover, Então recebem 403, 403, 404 e 401, respectivamente, sem alteração; as três primeiras são auditadas como negado.
- **CA-05 (alvo de outro bolão):** Dado um participante que pertence a outro bolão, ou um identificador inexistente, Quando o administrador tenta promovê-lo, Então recebe 404 e nada muda.
- **CA-06 (alvo não elegível):** Dado participantes com status solicitada, aprovada aguardando pagamento, rejeitada e que saiu, Quando o administrador tenta promovê-los, Então recebe 409 em todos e nada muda.
- **CA-07 (alvo já promovido ou administrador):** Dado um coadministrador e o próprio administrador como alvo, Quando a promoção é solicitada, Então recebe 409 e nada muda.
- **CA-08 (promoções simultâneas):** Dado um participante elegível, Quando duas promoções simultâneas do mesmo alvo são enviadas, Então uma é efetivada e a outra recebe 409.
- **CA-09 (bolão encerrado):** Dado um bolão encerrado, Quando o administrador tenta promover, Então a promoção é recusada (409).
- **CA-10 (atomicidade):** Dado que a gravação do registro de auditoria falha, Quando a promoção é executada, Então o papel do alvo permanece o mesmo.
- **CA-11 (único administrador):** Dado qualquer sequência de promoções, Quando os papéis do bolão são conferidos, Então existe exatamente um administrador.
- **CA-12 (autorização no backend):** Dado requisições enviadas diretamente ao backend, sem a interface, Quando tentam promover ou listar sem permissão, Então são rejeitadas como pela interface.
- **CA-13 (formato de erros):** Dado erros 401, 403, 404, 409 e 500, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.
- **CA-14 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o administrador lista e promove e o coadministrador lista, Então as telas permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página, e a ação de promover só aparece para o administrador.
- **CA-15 (sem rebaixamento):** Dado todas as operações expostas, Quando se procura uma que reduza o papel de coadministrador, Então nenhuma existe.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-008 | Listar participantes como administrador, coadministrador e participante comum e conferir conteúdo e 403. |
| TC-02 | CA-02, INV-003, INV-006 | Promover um participante confirmado e conferir papel, status, pontuação e auditoria. |
| TC-03 | CA-04, INV-001 | Tentar promover como coadministrador, participante comum, não membro e sem sessão. |
| TC-04 | CA-03, INV-004 | Após a promoção, exercer as permissões da matriz e tentar promover outro participante. |
| TC-05 | CA-05 | Promover alvo de outro bolão e identificador inexistente. |
| TC-06 | CA-06, INV-002 | Promover alvos em cada status não elegível. |
| TC-07 | CA-07 | Promover um coadministrador e o administrador. |
| TC-08 | CA-08, INV-009 | Enviar duas promoções simultâneas do mesmo alvo. |
| TC-09 | CA-10 | Forçar falha na auditoria durante a promoção. |
| TC-10 | CA-09, INV-010 | Promover em bolão encerrado. |
| TC-11 | CA-11, INV-005 | Executar várias promoções e conferir o único administrador. |
| TC-12 | CA-12, INV-011 | Enviar requisições diretas sem permissão. |
| TC-13 | CA-14 | Executar as telas em 360 px, 768 px e 1366 px. |
| TC-14 | CA-13 | Provocar cada categoria de erro e conferir o formato comum. |
| TC-15 | CA-15, INV-012 | Examinar as operações expostas em busca de rebaixamento. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-70 | A lista é visível a administrador e coadministrador e mostra os membros (participação aprovada ou confirmada) com nome, papel e status, sem e-mail; só um participante com participação confirmada e papel de participante pode ser promovido. |
| OPEN-71 | Bolão encerrado não aceita promoção (409); alvo de outro bolão ou inexistente recebe 404; alvo não elegível, já coadministrador ou administrador recebe 409; promoção simultânea do mesmo alvo é efetivada uma vez; sem limite de coadministradores e sem operação de rebaixamento. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-011 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-15) estiverem implementados;
- todos os invariantes (INV-001 a INV-012) estiverem preservados;
- os testes derivados (TC-01 a TC-15) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
