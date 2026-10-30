# SPEC-008 — Convites para o bolão

- **Status:** aprovada. As propostas OPEN-64 e OPEN-65 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003 e SPEC-007.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/` (incluindo `matriz-de-permissoes.md` e o modelo de domínio atualizado), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-007.
- **Escopo deste documento:** somente a SPEC-008. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-008
- **Nome:** Convites para o bolão
- **Objetivo:** permitir que o administrador ou o coadministrador de um bolão ativo gere, liste e revogue convites em forma de link com código de uso único e validade de 7 dias, e oferecer ao fluxo de entrada (SPEC-009) a verificação e o consumo atômico de um convite.
- **Valor entregue:** o administrador consegue trazer convidados, condição para qualquer entrada em um bolão privado, sem que o convite conceda participação ou acesso por si só.

## 2. Rastreabilidade

- **RF:** RF12 (convite por link; o "mecanismo interno" fica fora do protótipo, conforme OPEN-16).
- **RB:** RB17 (somente convidados solicitam entrada) e RB16 (as permissões do coadministrador seguem a matriz de permissões).
- **RNF:**
  - RNF01 — o código do convite é um segredo: guardado como hash, ausente de listagens, registros e auditoria.
  - RNF02 — criação e revogação formam unidade atômica com seus registros de auditoria; o consumo é atômico.
  - RNF04 e RNF16 — criação e revogação de convites são operações auditáveis (SPEC-002), assim como as negativas por permissão.
  - RNF12 — a autorização por papel é aplicada no backend.
  - RNF18 — a autorização por papel tem testes automatizados independentes da interface.
  - RNF14 — por extensão: tela de convites utilizável em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC01, passos 8 e 9 (solicitar convites e disponibilizá-los); a verificação e o consumo servem ao UC03, passos 1 e 2 e exceção A1 (SPEC-009).
- **Entidades do modelo conceitual:** `Convite`, `Bolao`, `Usuario` e `Participacao` (para autorizar pelo papel).
- **Drivers arquiteturais:** DA-04.
- **ADRs:** ADR-0005 (autorização e validade no backend), ADR-0001 e ADR-0008.

## 3. Escopo

### Incluído

1. **Criar convite:** gera um convite para um bolão ativo; devolve o link com o código em claro uma única vez; o convite fica ativo por 7 dias (OPEN-16, OPEN-64).
2. **Listar convites do bolão:** status, datas e quem criou, sem o código.
3. **Revogar convite:** somente convites ativos.
4. **Verificar convite (interno):** diz se um código corresponde a um convite utilizável, sem consumi-lo, para o fluxo de entrada.
5. **Consumir convite (interno):** vincula o convite, de forma atômica e de uso único, ao usuário autenticado que o apresenta; em disputa, vence o primeiro.
6. **Autorização:** somente administrador ou coadministrador do bolão, com participação aprovada ou confirmada, cria, lista e revoga convites (OPEN-65).
7. **Auditoria (SPEC-002):** criação e revogação de convites e tentativas negadas por permissão.
8. **Interface:** na tela do bolão, seção de convites para administrador e coadministrador (criar, exibir o link uma vez com cópia, listar e revogar).

### Fora do escopo

- A tela que o convidado abre pelo link, o aceite das regras, a solicitação de entrada e a visão das regras por convidado (SPEC-009).
- Aprovar ou rejeitar a solicitação de entrada (SPEC-010).
- Atribuir o papel de coadministrador (SPEC-011). Esta Spec apenas reconhece o papel como autorizado.
- Convite por "mecanismo interno da plataforma" (por exemplo, a um usuário já cadastrado por nome), que a decisão da OPEN-16 deixou de fora.
- Auditoria do consumo do convite, que não consta do catálogo da SPEC-002 (o aceite e a solicitação são auditados pela SPEC-009).
- Limite de convites por bolão e notificação do convite, que a baseline não prevê.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, configuração, correlação), SPEC-002 (auditoria), SPEC-003 (autenticação e formato de erros) e SPEC-007 (bolão, participação do criador e status do bolão).
- **Decisões arquiteturais:** ADR-0005 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- O solicitante está autenticado.
- Existe um bolão (SPEC-007) e o solicitante é seu administrador ou coadministrador, com participação aprovada ou confirmada. O administrador criador pode convidar mesmo com a taxa de entrada ainda pendente, pois sua participação está aprovada.

### Fluxo principal — criar convite

1. O solicitante pede um convite para o bolão.
2. O sistema verifica a autorização e que o bolão está ativo.
3. Em uma transação, o sistema cria o convite ativo, com código aleatório guardado só como hash, e grava o registro de auditoria de sucesso.
4. O sistema devolve o link, formado com o endereço base da interface e o código no fragmento (`#`), e a validade de 7 dias.
5. A interface exibe o link uma única vez, com ação de copiar.

### Fluxo principal — listar convites

1. O administrador ou coadministrador pede a lista de convites do bolão.
2. O sistema devolve os convites com status, data de criação, data de validade, quem o criou e, se usado, quando, sem o código.

### Fluxo principal — revogar convite

1. O solicitante escolhe um convite ativo.
2. Em uma transação, o sistema marca o convite como revogado e grava o registro de auditoria de sucesso.
3. O sistema confirma a revogação.

### Fluxos internos para a SPEC-009

- **Verificar convite:** dado um código e o usuário, informa se o convite é utilizável e para qual bolão, sem alterar nada.
- **Consumir convite:** dado um código e o usuário autenticado, em uma operação atômica, passa o convite de ativo para usado e o vincula ao usuário. Se o mesmo usuário o apresenta de novo, a operação é aceita e nada muda.

### Fluxos alternativos

- **A1 — Vários convites ativos:** um bolão pode ter quantos convites ativos o administrador ou o coadministrador criar; revogar um não afeta os outros.
- **A2 — Convite já consumido pelo mesmo usuário:** continua válido para ele no fluxo de entrada; a expiração não o afeta (OPEN-64).
- **A3 — Convite ativo vencido:** é apresentado como expirado e não pode ser consumido.

### Fluxos de exceção

- **E1 — Sessão ausente, inválida, expirada ou encerrada:** rejeitada (401).
- **E2 — Solicitante que não é membro do bolão, ou bolão inexistente:** não encontrado (404), sem dados; a tentativa é auditada como negada (OPEN-65).
- **E3 — Membro sem permissão** (participante comum): proibido (403), nada alterado; a tentativa é auditada como negada.
- **E4 — Bolão encerrado:** criar convite é recusado (409).
- **E5 — Revogar convite que não está ativo, ou que não pertence ao bolão:** 409 para convite usado, expirado ou já revogado; 404 para convite inexistente neste bolão.
- **E6 — Verificar ou consumir convite inexistente, vencido, revogado, usado por outro usuário ou de bolão encerrado:** a mesma resposta de não encontrado (404) em todos os casos.
- **E7 — Falha ao gravar o convite ou o registro de auditoria:** nada é persistido (500, sem detalhes internos).

### Pós-condições

- Criar: um convite ativo, com validade de 7 dias, e um registro de auditoria.
- Revogar: o convite fica revogado e deixa de poder ser consumido.
- Consumir: o convite fica usado e vinculado a um único usuário; nenhuma participação é criada.
- Falhas: nenhum convite criado, revogado ou consumido parcialmente.

## 6. Regras e invariantes

- **INV-001:** somente o administrador ou o coadministrador do bolão, com participação aprovada ou confirmada, cria, lista e revoga convites; participante comum e não membro não podem (RF12, matriz de permissões, RNF12).
- **INV-002:** só se cria convite para bolão com status ativo (OPEN-64).
- **INV-003:** o código do convite é aleatório (128 bits) e é guardado somente como hash; o código em claro só existe no link devolvido na criação e nunca aparece em listagens, registros técnicos, auditoria ou respostas de erro (RNF01, RNF20, OPEN-64).
- **INV-004:** o link traz o código no fragmento (`#`) do endereço, que não é enviado ao servidor na abertura do link (OPEN-64).
- **INV-005:** o convite ativo vale por 7 dias a partir da criação, em UTC; depois disso é expirado e nunca é consumido; a expiração é avaliada no momento da consulta ou do uso, sem tarefa agendada (OPEN-16, OPEN-64).
- **INV-006:** o convite é de uso único: é consumido por no máximo um usuário; em consumos simultâneos vence o primeiro e os demais falham (OPEN-16).
- **INV-007:** o convite usado fica vinculado ao usuário que o consumiu e continua válido para ele no fluxo de entrada; a expiração só se aplica a convite ainda ativo (OPEN-64).
- **INV-008:** só convite ativo pode ser revogado; convite revogado ou expirado nunca é consumido (OPEN-64).
- **INV-009:** inexistente, expirado, revogado, usado por outro usuário e de bolão encerrado recebem a mesma resposta (404) na verificação e no consumo (RNF01).
- **INV-010:** o status de um convite é um de ativo, usado, expirado ou revogado; um convite ativo vencido é apresentado como expirado (OPEN-09).
- **INV-011:** a criação e a revogação são atômicas com seus registros de auditoria de sucesso, e o consumo é atômico (RNF02).
- **INV-012:** toda tentativa de criar, listar ou revogar sem permissão não altera nada e gera um registro de auditoria com resultado negado, em transação separada (OPEN-45, OPEN-65).
- **INV-013:** um convite pertence a um único bolão; criar, revogar ou consumir um convite não afeta os demais.
- **INV-014:** a listagem não revela o código nem a identidade de quem consumiu o convite.
- **INV-015:** autorização e validade são verificadas no backend; a interface não é autoridade (ADR-0005).
- **INV-016:** consumir um convite não cria participação, não atribui papel e não concede acesso às regras ou aos dados do bolão fora do que a SPEC-009 definir (RB17, RB18).

## 7. Modelo de domínio envolvido

- **Convite:** código (guardado como hash), status, data de criação e vínculo com o bolão. Atributos técnicos necessários: quem o criou, data de validade, usuário que o consumiu e data do consumo, data da revogação.
- **Relacionamentos:** um `Bolao` gera zero a muitos `Convite`; cada `Convite` passa a referir-se a um usuário convidado no momento do consumo (RB17, modelo de domínio).
- **Autorização:** consulta a `Participacao` do solicitante no bolão (papel e status), sem alterá-la.
- **Restrições:** uso único; validade de 7 dias; vínculo ao usuário que consome.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "bolões e participações" (convites e autorização por papel), "notificações e auditoria" e persistência, configuração e correlação da SPEC-001.
- **Fronteiras:**
  - O backend decide quem pode convidar e se o convite é válido; a interface só apresenta.
  - A SPEC-009 usa as operações internas de verificar e consumir, sem reimplementar suas regras.
- **Integrações necessárias:** nenhuma.
- **Frontend:** seção de convites na tela do bolão, visível a administrador e coadministrador, com criação, link exibido uma vez e cópia, listagem e revogação; o destino do link é a tela de convite da SPEC-009.
- **Backend:** criação, listagem e revogação; verificação e consumo atômico; autorização por papel; auditoria.
- **Configuração:** o endereço base da interface usado no link é o mesmo da SPEC-004, em variável de ambiente do `.env.example`.
- **ADRs que restringem a solução:** ADR-0001, ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003, ampliado com o código 403 (OPEN-65).

- **Criar convite**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: identificador do convite, link com o código no fragmento e data de validade.
  - Erros: 401; 403 (sem permissão); 404 (não membro ou bolão inexistente); 409 (bolão encerrado); 500.
- **Listar convites do bolão**
  - Entrada: identificador do bolão.
  - Saída: convites com identificador, status, data de criação, data de validade, quem criou e, se usado, quando.
  - Erros: 401; 403; 404.
- **Revogar convite**
  - Entrada: identificador do bolão e do convite.
  - Saída: confirmação.
  - Erros: 401; 403; 404 (não membro, bolão ou convite inexistente neste bolão); 409 (convite não ativo); 500.
- **Verificar convite (interno)**
  - Entrada: código e usuário.
  - Saída: bolão associado e confirmação de que é utilizável.
  - Erros: indisponível, com resposta única (404).
- **Consumir convite (interno)**
  - Entrada: código e usuário autenticado.
  - Saída: vínculo entre o convite e o usuário.
  - Erros: indisponível, com resposta única (404).

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF01 | Inspecionar persistência, listagens, registros técnicos, auditoria e respostas de erro em busca do código em claro (TC-07, TC-18). |
| RNF02 | Falhar a gravação da auditoria na criação e na revogação e conferir que nada persiste (TC-15). |
| RNF04 e RNF16 | Conferir os registros de criação, revogação e negado (TC-01, TC-03, TC-12, TC-21). |
| RNF12 e RNF18 | Testes automatizados de autorização por papel e por status da participação, inclusive com requisições diretas ao backend (TC-02, TC-03, TC-04, TC-16, TC-17). |
| RNF14 (por extensão) | Roteiro da tela de convites em 360 px, 768 px e 1366 px (TC-20). |

## 11. Critérios de aceitação

- **CA-01 (criar convite):** Dado o administrador de um bolão ativo, Quando ele solicita um convite, Então recebe um link com o código no fragmento e a validade de 7 dias, o convite fica ativo e existe um registro de auditoria de sucesso.
- **CA-02 (coadministrador):** Dado um coadministrador com participação confirmada, Quando ele solicita, lista ou revoga convites, Então as operações são permitidas.
- **CA-03 (participante comum):** Dado um participante sem papel administrativo, Quando ele tenta criar, listar ou revogar convites, Então recebe 403, nada é alterado e existe um registro de auditoria negado.
- **CA-04 (não membro e sem sessão):** Dado um usuário que não é membro do bolão e uma requisição sem sessão, Quando tentam criar convite, Então recebem 404 e 401, respectivamente, sem dados; a tentativa do usuário sem vínculo é auditada como negada.
- **CA-05 (criador com taxa pendente):** Dado o criador de um bolão com taxa, cuja participação está aprovada aguardando pagamento, Quando ele cria um convite, Então a criação é permitida.
- **CA-06 (membro que saiu):** Dado um coadministrador cuja participação tem status saiu, Quando ele tenta criar convite, Então é tratado como não membro (404) e a tentativa é auditada como negada.
- **CA-07 (bolão encerrado):** Dado um bolão encerrado, Quando um administrador tenta criar convite, Então a criação é recusada (409).
- **CA-08 (código somente como hash):** Dado um convite criado, Quando a persistência, a listagem, os registros técnicos e a auditoria são inspecionados, Então só o hash do código está guardado e o código em claro só aparece no link devolvido na criação.
- **CA-09 (listagem):** Dado vários convites em dois bolões, Quando o administrador de um deles lista os convites, Então vê apenas os do seu bolão, com status, datas e criador, sem o código e sem a identidade de quem o consumiu.
- **CA-10 (validade de 7 dias):** Dado um convite ativo com menos de 7 dias e outro com mais (relógio controlado), Quando ambos são verificados e consumidos, Então o primeiro é utilizável e o segundo é apresentado como expirado e não é consumido.
- **CA-11 (uso único e disputa):** Dado um convite ativo, Quando dois usuários o consomem simultaneamente, Então um vence e fica vinculado ao convite e o outro recebe a resposta única (404).
- **CA-12 (mesmo usuário):** Dado um convite consumido por um usuário, Quando o mesmo usuário o apresenta de novo, Então a operação é aceita e nada muda; e quando outro usuário o apresenta, Então recebe a resposta única.
- **CA-13 (convite usado não expira):** Dado um convite consumido há mais de 7 dias do momento da criação, Quando o usuário vinculado o verifica, Então continua válido para ele.
- **CA-14 (revogação):** Dado um convite ativo, Quando ele é revogado, Então passa a revogado, não pode ser consumido e os outros convites do bolão permanecem intactos; e revogar um convite usado, expirado ou já revogado devolve 409.
- **CA-15 (resposta única):** Dado um código inexistente, um convite expirado, um revogado, um usado por outro usuário e um de bolão encerrado, Quando são verificados ou consumidos, Então todos recebem a mesma resposta (404), sem distinguir o motivo.
- **CA-16 (consumir não concede acesso):** Dado um usuário que consumiu um convite, Quando se examinam as participações e as consultas do bolão, Então não existe nova participação e o usuário continua sem acesso às regras pela consulta de membros (404).
- **CA-17 (atomicidade):** Dado que a gravação do registro de auditoria falha, Quando um convite é criado ou revogado, Então nada é persistido e o convite permanece como antes.
- **CA-18 (autorização no backend):** Dado requisições enviadas diretamente ao backend, sem a interface, Quando comandam criar, listar ou revogar sem permissão, Então são rejeitadas como pela interface.
- **CA-19 (sem segredos em erros e logs):** Dado qualquer operação desta Spec, com sucesso ou falha, Quando respostas de erro e registros técnicos são inspecionados, Então não contêm o código do convite.
- **CA-20 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o administrador cria, copia o link, lista e revoga convites, Então a tela permanece utilizável, sem sobreposição de controles nem rolagem horizontal da página, e o link só é exibido na criação.
- **CA-21 (auditoria):** Dado a criação e a revogação de convites, Quando os registros de auditoria são consultados no backend, Então existem registros de sucesso com o usuário como ator e o convite como objeto, e a tentativa negada tem resultado negado.
- **CA-22 (formato de erros):** Dado erros 401, 403, 404, 409 e 500, Quando ocorrem, Então seguem o formato comum, sem detalhes internos e com o identificador de correlação.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-005, INV-011 | Criar convite como administrador e conferir link, validade, status ativo e auditoria. |
| TC-02 | CA-02 | Criar, listar e revogar como coadministrador com participação confirmada. |
| TC-03 | CA-03, INV-012 | Tentar criar, listar e revogar como participante comum e conferir 403 e auditoria negada. |
| TC-04 | CA-04, CA-06, INV-001 | Tentar como não membro, sem sessão e como coadministrador que saiu. |
| TC-05 | CA-05 | Criar convite como criador com participação aprovada aguardando pagamento. |
| TC-06 | CA-07, INV-002 | Criar convite em bolão encerrado. |
| TC-07 | CA-08, INV-003, INV-004 | Inspecionar persistência, listagem, registros e auditoria em busca do código em claro e conferir o fragmento do link. |
| TC-08 | CA-09, INV-013, INV-014 | Listar convites de dois bolões e conferir o conteúdo e a ausência de código e de identidade do consumidor. |
| TC-09 | CA-10, INV-005, INV-010 | Verificar e consumir convites antes e depois de 7 dias com relógio controlado. |
| TC-10 | CA-11, INV-006 | Consumir o mesmo convite com dois usuários simultâneos. |
| TC-11 | CA-12, CA-13, INV-007 | Repetir o consumo pelo mesmo usuário e por outro, e verificar o convite usado após 7 dias. |
| TC-12 | CA-14, INV-008 | Revogar convites ativos e não ativos e tentar consumir o revogado. |
| TC-13 | CA-15, INV-009 | Comparar as respostas dos cinco casos de convite indisponível. |
| TC-14 | CA-16, INV-016 | Consumir um convite e conferir ausência de participação e acesso às regras. |
| TC-15 | CA-17, INV-011 | Forçar falha na auditoria durante criação e revogação. |
| TC-16 | CA-18, INV-015 | Enviar requisições diretas sem permissão, sem passar pela interface. |
| TC-17 | RNF18 | Executar a suíte de autorização por papel sem credenciais externas. |
| TC-18 | CA-19 | Varrer respostas de erro e registros técnicos em busca do código. |
| TC-19 | CA-22 | Provocar cada categoria de erro e conferir o formato comum. |
| TC-20 | CA-20 | Executar a tela de convites em 360 px, 768 px e 1366 px. |
| TC-21 | CA-21 | Conferir os registros de auditoria de criação, revogação e negado. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-64 | Código aleatório de 128 bits, guardado só como hash; o link (endereço base da interface mais o código no fragmento) é devolvido apenas na criação e exibido uma única vez, e para recuperar o acesso o administrador revoga e cria outro; a expiração é avaliada na consulta ou no uso, sem tarefa agendada, e só se aplica a convite ainda ativo; o convite usado fica vinculado ao usuário que o consumiu e continua válido para ele; só convite ativo é revogável e só bolão ativo recebe convites; verificação e consumo de convite indisponível respondem sempre com 404 único. |
| OPEN-65 | Pode convidar quem é administrador ou coadministrador com participação aprovada ou confirmada (o criador com taxa pendente inclusive); membro sem permissão recebe 403 e quem não é membro ou usa bolão inexistente recebe 404; ambos os casos são auditados como negado; o código 403 é acrescentado ao formato comum de erros; a listagem mostra status, datas, quem criou e quando foi usado, sem o código e sem quem o consumiu. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-008 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-22) estiverem implementados;
- todos os invariantes (INV-001 a INV-016) estiverem preservados;
- os testes derivados (TC-01 a TC-21) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
