# SPEC-007 — Criação, configuração e consulta das regras do bolão

- **Status:** aprovada. As propostas OPEN-61 a OPEN-63 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003, SPEC-005 e SPEC-006.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/` (incluindo `matriz-de-permissoes.md` e o modelo de domínio atualizado), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-006.
- **Escopo deste documento:** somente a SPEC-007. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-007
- **Nome:** Criação, configuração e consulta das regras do bolão
- **Objetivo:** permitir que um usuário autenticado, dentro do limite de seu plano, crie um bolão definindo nome, período de duração, taxa de entrada, modelo de premiação, partidas participantes e critério de desempate; registrar essas regras de forma imutável; criar a participação do criador como administrador; e permitir que os membros do bolão consultem as regras.
- **Valor entregue:** o bolão passa a existir com regras fixas e rastreáveis, com o criador já administrador e participante, e com o limite do plano aplicado. É o primeiro agregado do núcleo do domínio, base de convites, entrada, palpites, ranking e finanças.

## 2. Rastreabilidade

- **RF:** RF09 (criação com verificação do plano), RF10 (configuração), RF11 (consulta das regras, para membros; a visão do convidado é da SPEC-009), RF18 (seleção individual ou por rodada, na criação) e RF38 (bloqueio acima do limite).
- **RB:** RB02, RB03 e RB57 (limites de criação), RB05 (participação sem limite, que não restringe a entrada), RB06 e RB58 (recurso ao vivo definido pelo plano do criador), RB08 (taxa independente do plano e igual para todos), RB12 (limite após downgrade), RB13 (criador administrador e participante), RB14 (configuração obrigatória), RB15, RB23, RB43 e RB51 (imutabilidade e definição de taxa, desempate e premiação), RB24 (seleção de partidas) e RB64 (regras associadas ao bolão durante todo o ciclo de vida).
- **RNF:**
  - RNF01 e RNF11 — apenas membros consultam as regras; sem sessão nada é devolvido.
  - RNF02 — o bolão, as partidas selecionadas, a participação do criador e o registro de auditoria formam uma unidade atômica.
  - RNF04 e RNF16 — a criação de bolão é operação auditável (SPEC-002).
  - RNF12 — a validação do limite e das regras ocorre no backend.
  - RNF18 — as regras críticas (limite, imutabilidade, validação) têm testes independentes da interface e de serviços externos.
  - RNF14 — por extensão: telas utilizáveis em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC01, passos 1 a 7 e exceções A1 e A3 (A2 é da SPEC-006; os passos 8 e 9, de convites, são da SPEC-008).
- **Entidades do modelo conceitual:** `Bolao`, `Participacao` (do criador), `Usuario`, `Rodada`, `Partida` e `Time` (para exibição).
- **Drivers arquiteturais:** DA-01 (integridade das regras) e DA-04 (autorização no backend por identidade e papel).
- **ADRs:** ADR-0001, ADR-0005 e ADR-0008.

## 3. Escopo

### Incluído

1. **Disponibilidade de criação:** consultar plano, limite, bolões ativos criados pelo usuário e se pode criar (UC01, passo 2).
2. **Criação (RF09, RF10, RF18):** com nome, período em datas, taxa de entrada, modelo de premiação, critério de desempate e partidas escolhidas individualmente, por rodada ou combinando as duas formas.
3. **Limite de criação (RF38, RB02, RB03, RB12, RB57):** o número de bolões ativos criados pelo usuário deve ser menor que o limite do plano no catálogo da SPEC-005 (1 no Gratuito e 10 no Premium); a verificação ocorre na mesma transação que grava o bolão.
4. **Validação das regras** no backend (seção 6), com indicação dos campos inválidos.
5. **Registro imutável das regras:** nenhuma operação altera taxa, modelo de premiação, período, partidas ou critério de desempate depois da criação; as regras ficam associadas ao bolão durante todo o ciclo de vida (RB64).
6. **Recurso ao vivo:** o bolão guarda, uma única vez, se oferece resultados ao vivo, conforme o plano do criador no momento da criação.
7. **Participação do criador:** papel administrador, com o status definido pela taxa (OPEN-38 aprovada): confirmada se a taxa é zero; aprovada aguardando pagamento se a taxa é maior que zero.
8. **Consulta das regras (RF11)** pelos membros: regras, condições de participação, período, taxa, modelo de premiação, desempate, partidas, recurso ao vivo, status e o papel do solicitante.
9. **Lista dos bolões do usuário** (nome, status e papel), caminho de acesso a um bolão (OPEN-62).
10. **Auditoria (SPEC-002):** registro da criação do bolão.
11. **Interface:** telas de criação (com a seleção de partidas apoiada no componente de rodadas e partidas da SPEC-006), de lista de bolões e de regras do bolão.

### Fora do escopo

- Convites (SPEC-008), solicitação e aprovação de entrada (SPEC-009 e SPEC-010), a consulta das regras por convidados que ainda não são membros (SPEC-009) e a promoção a coadministrador (SPEC-011).
- Pagamento da taxa de entrada e confirmação financeira da participação do criador (SPEC-022).
- Palpites, resultados, pontuação, ranking, medalhas, encerramento e premiação (SPEC-012 em diante).
- Alterar nome, regras ou partidas depois da criação, excluir ou cancelar bolão (a baseline não prevê).
- Preço e condições do plano Premium (SPEC-019).

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, migrações), SPEC-002 (auditoria), SPEC-003 (autenticação e formato de erros), SPEC-005 (catálogo de planos e limites) e SPEC-006 (rodadas e partidas).
- **Decisões arquiteturais:** ADR-0001, ADR-0005 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- O usuário está autenticado.
- O catálogo de rodadas e partidas está disponível (SPEC-006).

### Fluxo principal — criar bolão

1. O usuário solicita a criação de um bolão.
2. O sistema informa o plano, o limite e quantos bolões ativos o usuário já criou, e verifica se pode criar.
3. O sistema apresenta as rodadas e partidas disponíveis (SPEC-006).
4. O usuário informa nome, período (data de início e de fim), taxa de entrada, critério de desempate e escolhe as partidas, individualmente, por rodada ou combinando; o modelo de premiação é o único disponível.
5. Em uma única transação, o sistema reverifica o limite, valida as regras e registra o bolão (status ativo, recurso ao vivo conforme o plano), as partidas selecionadas, a participação do criador como administrador e o registro de auditoria de sucesso.
6. O sistema devolve o bolão criado com suas regras e a participação do criador.

### Fluxo principal — consultar regras

1. Um membro acessa o bolão pela lista de seus bolões.
2. O sistema apresenta nome, status, período, taxa de entrada, modelo de premiação, critério de desempate, partidas selecionadas, se oferece resultados ao vivo, as condições de participação e o papel do solicitante.

### Fluxos alternativos

- **A1 — Seleção por rodada:** o sistema inclui as partidas elegíveis da rodada no momento da criação e informa quantas foram incluídas (OPEN-61).
- **A2 — Seleção combinada:** partidas individuais e rodadas completas são unidas sem duplicar partidas.
- **A3 — Taxa igual a zero:** a participação do criador nasce confirmada.
- **A4 — Taxa maior que zero:** a participação do criador nasce aprovada, aguardando pagamento.

### Fluxos de exceção

- **E1 — Limite atingido** (UC01 A1, RF38): a criação é impedida (409) e a resposta informa o plano, o limite aplicável e a orientação de adequar-se ao limite ou, no Gratuito, contratar o Premium; nada é criado.
- **E2 — Configuração inválida** (UC01 A3): erro de validação (400) indicando os campos; o bolão não é criado.
- **E3 — Catálogo indisponível** (UC01 A2, SPEC-006): a fonte é informada como indisponível (503), nenhuma partida é inventada e uma nova tentativa é possível mais tarde.
- **E4 — Sessão ausente, inválida, expirada ou encerrada:** rejeitada (401).
- **E5 — Falha ao gravar qualquer parte da criação, inclusive o registro de auditoria:** nada é persistido (500, sem detalhes internos).
- **E6 — Consulta por quem não é membro do bolão, ou a bolão inexistente:** resposta de não encontrado (404), sem dados.

### Pós-condições

- O bolão existe com regras registradas e imutáveis, status ativo e as partidas selecionadas.
- O criador possui exatamente uma participação, como administrador.
- Um registro de auditoria de sucesso existe para a criação.
- Falhas não deixam bolão, partidas selecionadas nem participação parciais.

## 6. Regras e invariantes

- **INV-001:** depois da criação, nenhuma operação altera taxa de entrada, modelo de premiação, período, partidas participantes, critério de desempate nem a indicação de resultados ao vivo (RB15, RB23, RB43, RB51, RB58).
- **INV-002:** o número de bolões ativos criados pelo usuário é menor que o limite do plano (1 no Gratuito, 10 no Premium) no momento da criação, lido do catálogo da SPEC-005; só contam os bolões com status ativo (RB02, RB03, RB12, RB57, OPEN-10).
- **INV-003:** a verificação do limite e a gravação do bolão ocorrem na mesma transação, de modo que duas criações simultâneas do mesmo usuário não ultrapassam o limite (ADR-0005).
- **INV-004:** o criador tem exatamente uma participação no bolão, com papel administrador (RB13).
- **INV-005:** a participação do criador nasce confirmada, com o indicador de pagamento confirmado verdadeiro, se a taxa é zero, e aprovada aguardando pagamento, com o indicador falso, se a taxa é maior que zero; nunca confirmada com taxa pendente (OPEN-38, OPEN-68).
- **INV-006:** a data de início do período não é anterior ao dia da criação, a data de fim não é anterior à de início e todas as partidas selecionadas têm data e hora dentro do período, em dias de America/Sao_Paulo (OPEN-11, OPEN-61).
- **INV-007:** o bolão tem ao menos uma partida; cada partida selecionada existe no catálogo, está agendada e tem data e hora futuras no momento da criação; não há partida duplicada (OPEN-61).
- **INV-008:** a taxa é maior ou igual a zero, em BRL, com no máximo duas casas decimais; se maior que zero, está entre R$ 1,00 e R$ 500,00 (OPEN-15).
- **INV-009:** o modelo de premiação é "vencedor leva tudo sobre o montante arrecadado" (OPEN-13).
- **INV-010:** o critério de desempate é um de mais placares exatos, mais resultados corretos ou maior pontuação na última rodada do bolão (OPEN-14).
- **INV-011:** o recurso ao vivo do bolão é verdadeiro se, e somente se, o plano do criador na criação inclui resultados ao vivo (RB06, RB58).
- **INV-012:** a criação do bolão, das partidas selecionadas, da participação do criador e do registro de auditoria é atômica (RNF02).
- **INV-013:** apenas membros (participação aprovada ou confirmada) consultam as regras do bolão; os demais recebem não encontrado, sem dados (RNF01, RNF11).
- **INV-014:** o status inicial do bolão é ativo (OPEN-09).
- **INV-015:** o conjunto de partidas selecionadas é fixado na criação; remarcações, adiamentos ou cancelamentos posteriores no catálogo não alteram o conjunto (RB15).
- **INV-016:** o nome tem de 1 a 100 caracteres após remover os espaços das pontas (OPEN-62).
- **INV-017:** toda validação e todo limite são aplicados no backend; a interface não é autoridade (ADR-0005, RNF12).

## 7. Modelo de domínio envolvido

- **Bolao:** nome, data de início e de fim do período, taxa de entrada, modelo de premiação, critério de desempate, status (ativo) e indicação de resultados ao vivo; relacionado ao criador (`Usuario`) e às partidas selecionadas.
- **Seleção de partidas:** associação entre `Bolao` e `Partida`, fixada na criação; uma partida pode estar em vários bolões.
- **Participacao (do criador):** papel administrador; status confirmada ou aprovada aguardando pagamento; indicação de pagamento confirmado (falsa se a taxa é maior que zero e verdadeira se a taxa é zero, pois não há o que pagar; SPEC-010, OPEN-68); aceite das regras registrado no momento da criação (OPEN-62). Os campos `dataEntrada`, `entradaTardia`, `pontuacaoTotal` e o pagamento são preenchidos pelas Specs que os governam; para o criador sem taxa, a entrada é a própria criação.
- **Usuario, Rodada, Partida, Time:** somente leitura.
- **Restrições:** regras imutáveis; um criador, um administrador na criação; seleção sem duplicatas.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "bolões e participações" (principal), "partidas e resultados" (catálogo, leitura), "autenticação e usuários" (plano e identidade) e "notificações e auditoria".
- **Fronteiras:**
  - O backend reverifica limite e regras na transação de gravação (ADR-0005); a interface apenas orienta o preenchimento.
  - O catálogo de planos da SPEC-005 é a única fonte do limite.
- **Integrações necessárias:** nenhuma externa; o catálogo vem da SPEC-006.
- **Frontend:** tela de criação com mensagem de limite e orientação ao Premium, seleção de partidas por rodada ou individual (componente da SPEC-006), erros por campo, lista de bolões e tela de regras; utilizáveis em 360 px, 768 px e 1366 px.
- **Backend:** verificação do limite, validação das regras, gravação atômica, consulta das regras e lista de bolões.
- **ADRs que restringem a solução:** ADR-0001, ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003 e as categorias da SPEC-006.

- **Consultar disponibilidade de criação**
  - Entrada: sessão válida.
  - Saída: plano, limite do plano, quantidade de bolões ativos criados e se o usuário pode criar.
  - Erros: 401.
- **Criar bolão**
  - Entrada: nome, data de início, data de fim, taxa de entrada, modelo de premiação, critério de desempate e seleção de partidas (partidas individuais e/ou rodadas).
  - Saída: bolão criado com todas as regras, partidas selecionadas, indicação de resultados ao vivo e a participação do criador (papel e status).
  - Erros: 401; 400 (campos inválidos indicados); 409 (limite atingido, com plano, limite e orientação); 503 (catálogo indisponível); 500.
- **Consultar regras do bolão**
  - Entrada: identificador do bolão, sessão válida.
  - Saída: nome, status, período, taxa, modelo de premiação, critério de desempate, partidas selecionadas, indicação de resultados ao vivo, condições de participação e papel do solicitante.
  - Erros: 401; 404 (bolão inexistente ou usuário que não é membro).
- **Listar meus bolões**
  - Entrada: sessão válida.
  - Saída: bolões em que o usuário tem participação aprovada ou confirmada, com nome, status e papel.
  - Erros: 401.
- **Condições de participação (conteúdo informativo fixo):** a entrada exige convite e aprovação do administrador ou coadministrador; pagamento da taxa quando houver; aceite das regras; e quem entra depois do início não palpita nas partidas que já começaram (RB17 a RB21).

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF01 e RNF11 | Chamar as consultas sem sessão e como não membro, conferindo 401 e 404 sem dados (TC-17). |
| RNF02 | Falhar a gravação da auditoria e da participação e conferir que nenhum bolão existe (TC-15). |
| RNF04 e RNF16 | Conferir o registro de auditoria da criação (TC-01, TC-23). |
| RNF12 | Enviar requisições diretas com dados inválidos, ignorando a interface (TC-22). |
| RNF18 | Executar os testes de limite, imutabilidade e validação sem credenciais externas (TC-03 a TC-16). |
| RNF14 (por extensão) | Roteiro das telas em 360 px, 768 px e 1366 px (TC-25). |

## 11. Critérios de aceitação

- **CA-01 (criação sem taxa):** Dado um usuário do plano Gratuito sem bolões ativos, partidas elegíveis e uma configuração válida com taxa zero, Quando ele cria o bolão, Então o bolão existe com status ativo e as regras registradas, o recurso ao vivo é falso, o criador tem uma participação de administrador confirmada e existe um registro de auditoria de sucesso.
- **CA-02 (criação com taxa):** Dado a mesma configuração com taxa de R$ 25,00, Quando o bolão é criado, Então a participação do criador é de administrador, aprovada aguardando pagamento, com pagamento não confirmado.
- **CA-03 (limite do Gratuito):** Dado um usuário Gratuito com um bolão ativo, Quando ele tenta criar outro, Então a criação é impedida (409) com o plano, o limite 1 e a orientação de adequação ou contratação do Premium, e nada é criado.
- **CA-04 (limite do Premium):** Dado um usuário Premium com 9 bolões ativos e outro com 10, Quando cada um tenta criar um bolão, Então o primeiro cria o décimo e o segundo é impedido.
- **CA-05 (após downgrade):** Dado um usuário que voltou ao plano Gratuito e possui bolões ativos, Quando ele tenta criar um novo bolão, Então é impedido e os bolões existentes permanecem intactos.
- **CA-06 (bolões encerrados não contam):** Dado um usuário Gratuito cujo único bolão está encerrado, Quando ele cria um novo bolão, Então a criação é permitida.
- **CA-07 (criações simultâneas):** Dado um usuário Gratuito sem bolões ativos, Quando duas criações válidas simultâneas são enviadas, Então apenas uma é concluída e a outra é impedida pelo limite.
- **CA-08 (recurso ao vivo):** Dado um criador Premium, Quando o bolão é criado, Então o recurso ao vivo é verdadeiro; e quando o plano do criador muda depois, o valor do bolão não muda.
- **CA-09 (campos obrigatórios):** Dado uma criação sem nome, período, taxa, modelo de premiação, partidas ou critério de desempate, Quando ela é enviada, Então é rejeitada (400) indicando os campos e nenhum bolão é criado.
- **CA-10 (nome):** Dado um nome vazio, só com espaços ou com mais de 100 caracteres, Quando a criação é enviada, Então é rejeitada indicando o campo; e com espaços nas pontas o nome é gravado sem eles.
- **CA-11 (período):** Dado uma data de início anterior ao dia da criação, uma data de fim anterior à de início, ou uma partida selecionada fora do período, Quando a criação é enviada, Então é rejeitada indicando o campo.
- **CA-12 (taxa):** Dado uma taxa negativa, abaixo de R$ 1,00 e maior que zero, acima de R$ 500,00 ou com mais de duas casas decimais, Quando a criação é enviada, Então é rejeitada indicando o campo.
- **CA-13 (premiação e desempate):** Dado um modelo de premiação ou um critério de desempate fora dos valores permitidos, Quando a criação é enviada, Então é rejeitada indicando o campo.
- **CA-14 (seleção individual, por rodada e combinada):** Dado partidas escolhidas individualmente, uma rodada inteira e as duas formas juntas, Quando o bolão é criado, Então as partidas selecionadas correspondem à escolha, sem duplicatas, e a resposta informa quantas partidas foram incluídas por rodada.
- **CA-15 (partidas inelegíveis):** Dado uma partida inexistente, em andamento, encerrada, adiada, cancelada ou com data e hora no passado, ou uma seleção vazia, Quando a criação é enviada, Então é rejeitada e nenhum bolão é criado; e uma rodada sem partidas elegíveis também é rejeitada.
- **CA-16 (imutabilidade):** Dado um bolão criado, Quando se tenta alterar taxa, premiação, período, partidas, desempate ou recurso ao vivo por qualquer operação exposta, Então nenhuma operação existe para isso e os valores permanecem os mesmos.
- **CA-17 (conjunto fixo):** Dado um bolão criado, Quando o catálogo passa a informar uma de suas partidas como remarcada, adiada ou cancelada, Então o conjunto de partidas selecionadas do bolão permanece o mesmo.
- **CA-18 (atomicidade):** Dado que a gravação da participação do criador ou do registro de auditoria falha, Quando a criação é executada, Então nenhum bolão nem partida selecionada é persistido.
- **CA-19 (catálogo indisponível):** Dado que o catálogo está vazio e a fonte indisponível, Quando a criação é solicitada, Então a resposta informa a indisponibilidade (503), nada é criado e uma nova tentativa é possível depois.
- **CA-20 (consulta por membro):** Dado o criador de um bolão, Quando ele acessa as regras, Então vê nome, status, período, taxa, premiação, desempate, partidas, recurso ao vivo, condições de participação e seu papel.
- **CA-21 (consulta por não membro ou sem sessão):** Dado um usuário que não é membro, e uma requisição sem sessão, Quando consultam as regras de um bolão, Então recebem 404 e 401, respectivamente, sem nenhum dado do bolão.
- **CA-22 (lista de bolões):** Dado um usuário que criou dois bolões e outro que não participa de nenhum, Quando cada um lista seus bolões, Então o primeiro vê os dois, com nome, status e papel, e o segundo não vê nenhum.
- **CA-23 (disponibilidade de criação):** Dado um usuário Gratuito com e sem bolão ativo, Quando ele consulta a disponibilidade, Então vê plano, limite 1, a quantidade de ativos e se pode criar.
- **CA-24 (validação no backend):** Dado requisições enviadas diretamente ao backend com dados inválidos, Quando são processadas, Então são rejeitadas como pela interface, sem depender de qualquer validação do frontend.
- **CA-25 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando o usuário cria um bolão, vê o limite e consulta as regras, Então as telas permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página, com os erros indicados nos campos.
- **CA-26 (auditoria):** Dado uma criação bem-sucedida, Quando os registros de auditoria do objeto são consultados no backend, Então existe um registro de sucesso da criação do bolão com o criador como ator.
- **CA-27 (formato de erros):** Dado erros de validação, limite, sessão rejeitada, não encontrado, indisponibilidade e falha interna, Quando ocorrem, Então seguem o formato comum com o código esperado, sem detalhes internos e com o identificador de correlação.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-004, INV-012, INV-014 | Criar bolão válido sem taxa e conferir regras, status, participação do criador e auditoria. |
| TC-02 | CA-02, INV-005 | Criar bolão com taxa e conferir o status da participação e o pagamento não confirmado. |
| TC-03 | CA-03, INV-002 | Criar o segundo bolão no Gratuito e conferir 409, limite e orientação. |
| TC-04 | CA-04 | Criar com 9 e com 10 bolões ativos no Premium. |
| TC-05 | CA-05 | Reduzir o plano de um usuário com bolões ativos e tentar criar. |
| TC-06 | CA-06 | Criar com o único bolão já encerrado. |
| TC-07 | CA-07, INV-003 | Enviar duas criações simultâneas e conferir que só uma conclui. |
| TC-08 | CA-08, INV-011 | Criar como Premium, mudar o plano do criador e conferir que o valor do bolão não muda. |
| TC-09 | CA-09 | Enviar cada campo obrigatório ausente. |
| TC-10 | CA-10, INV-016 | Enviar nomes inválidos e nome com espaços nas pontas. |
| TC-11 | CA-11, INV-006 | Enviar períodos e partidas fora do período inválidos. |
| TC-12 | CA-12, INV-008 | Enviar taxas inválidas e válidas nos limites. |
| TC-13 | CA-13, INV-009, INV-010 | Enviar premiação e desempate fora do conjunto. |
| TC-14 | CA-14, CA-15, INV-007 | Criar com seleção individual, por rodada e combinada, e com partidas inelegíveis e seleção vazia. |
| TC-15 | CA-18, INV-012 | Forçar falha na participação e na auditoria e conferir que nada persiste. |
| TC-16 | CA-16, CA-17, INV-001, INV-015 | Examinar as operações expostas em busca de alteração das regras e alterar o catálogo depois da criação. |
| TC-17 | CA-21, INV-013 | Consultar regras sem sessão e como não membro. |
| TC-18 | CA-20 | Consultar as regras como criador e conferir o conteúdo. |
| TC-19 | CA-22 | Listar bolões de dois usuários distintos. |
| TC-20 | CA-23 | Consultar a disponibilidade com e sem bolão ativo. |
| TC-21 | CA-19 | Criar com o catálogo vazio e a fonte indisponível e depois restabelecida. |
| TC-22 | CA-24, INV-017 | Enviar requisições diretas com dados inválidos, sem a interface. |
| TC-23 | CA-26 | Conferir o registro de auditoria da criação. |
| TC-24 | CA-27 | Provocar cada categoria de erro e conferir o formato comum. |
| TC-25 | CA-25 | Executar as telas em 360 px, 768 px e 1366 px. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-61 | Só podem ser selecionadas partidas existentes no catálogo, agendadas e com data e hora futuras; a data de início do período não pode ser anterior ao dia da criação; a seleção por rodada inclui apenas as partidas elegíveis no momento, o conjunto é gravado e a resposta informa quantas foram incluídas; rodada sem partidas elegíveis ou seleção vazia é rejeitada. |
| OPEN-62 | Nome de 1 a 100 caracteres após remover espaços; aceite do criador registrado na criação; lista de bolões com nome, status e papel dos bolões com participação aprovada ou confirmada; não membro ou bolão inexistente recebe 404; condições de participação como texto informativo fixo da plataforma, com a taxa do bolão. |
| OPEN-63 | Limite atingido responde 409 com plano, limite, bolões ativos e orientação de adequar-se ou contratar o Premium (no Gratuito); consulta de disponibilidade antes do formulário; limite reverificado dentro da transação de gravação. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-007 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-27) estiverem implementados;
- todos os invariantes (INV-001 a INV-017) estiverem preservados;
- os testes derivados (TC-01 a TC-25) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
