# SPEC-005 — Perfil do usuário e consulta do plano

- **Status:** aprovada. As propostas OPEN-56 e OPEN-57 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 e SPEC-003.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/`, `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-004.
- **Escopo deste documento:** somente a SPEC-005. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-005
- **Nome:** Perfil do usuário e consulta do plano
- **Objetivo:** permitir que o usuário autenticado veja seus dados pessoais e altere os permitidos, consulte seu plano atual, o status e os recursos disponíveis e compare os planos Gratuito e Premium.
- **Valor entregue:** o usuário gerencia seus dados e sabe o que seu plano permite (limite de bolões criados e recurso ao vivo). A Spec também estabelece a fonte única de limites e recursos por plano, que a criação de bolão (SPEC-007) consulta.

## 2. Rastreabilidade

- **RF:** RF04 (gerenciamento do perfil) e RF05 (consulta do plano).
- **RB:** RB01 (planos Gratuito e Premium), RB02 (Gratuito cria até 1 bolão simultâneo), RB03 (Premium cria até 10), RB05 (participação sem limite por plano) e RB06 (resultados ao vivo só em bolões criados por Premium).
- **RNF:**
  - RNF01 — somente o próprio usuário autenticado acessa e altera seus dados; sem credenciais nas respostas.
  - RNF11 — privacidade dos dados pessoais.
  - RNF14 — por extensão: telas de perfil e plano utilizáveis em 360 px, 768 px e 1366 px.
- **Caso de uso ou fluxo:** UC02, passo 1 do fluxo de contratação ("o usuário consulta os planos") e a parte de consulta do plano (RF05). Contratação, consulta da assinatura e cancelamento pertencem às SPEC-019 e SPEC-020.
- **Entidades do modelo conceitual:** `Usuario` (nome, e-mail, plano, status).
- **Drivers arquiteturais:** DA-04.
- **ADRs:** ADR-0004, ADR-0005 (validação no backend) e ADR-0008.

## 3. Escopo

### Incluído

1. **Perfil (RF04):** consultar nome, e-mail e plano do próprio usuário e alterar o nome. Somente o nome é editável; e-mail, senha, plano, status e identificador não são alterados por esta Spec.
2. **Catálogo de planos (RB01, RB02, RB03, RB05, RB06):** definição única, no backend, dos planos Gratuito e Premium e de seus recursos:

| Recurso | Gratuito | Premium |
| --- | --- | --- |
| Bolões criados simultaneamente | até 1 | até 10 |
| Participação em bolões | sem limite | sem limite |
| Resultados ao vivo nos bolões que o usuário cria | não | sim |

3. **Consulta do plano (RF05):** plano atual, status e recursos disponíveis do próprio usuário. O status do plano Gratuito é "ativo" (OPEN-56).
4. **Comparação dos planos (UC02, passo 1; RB01):** apresentação dos dois planos e de seus recursos, sem preço nem condições de assinatura.
5. **Interface:** telas de perfil (visualizar e alterar o nome) e de plano (plano atual e comparação), acessíveis na área autenticada.

### Fora do escopo

- Alteração de e-mail e de senha (a senha só muda pela recuperação de acesso, SPEC-004).
- Mudança de plano, preço, recorrência e condições da assinatura (SPEC-019).
- Consulta da assinatura, cobranças, vigência e cancelamento (SPEC-020, RF07 e RF08).
- Quantos bolões o usuário já criou em relação ao limite (SPEC-007).
- Exclusão de conta, que a baseline não prevê.
- Registro de auditoria da alteração de nome, que não consta do catálogo de operações auditáveis da SPEC-002.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência, testes) e SPEC-003 (usuário, sessão, regras de nome e formato comum de erros).
- **Decisões arquiteturais:** ADR-0004, ADR-0005 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- O usuário está autenticado com sessão válida (SPEC-003).

### Fluxo principal — consultar perfil

1. O usuário acessa seu perfil.
2. O sistema apresenta nome, e-mail e plano do próprio usuário, sem credenciais.

### Fluxo principal — alterar nome

1. O usuário informa o novo nome.
2. O sistema remove os espaços das pontas e valida o nome (1 a 100 caracteres).
3. O sistema grava o novo nome e apresenta o perfil atualizado.

### Fluxo principal — consultar plano

1. O usuário acessa as informações de sua conta.
2. O sistema apresenta o plano atual, o status e os recursos disponíveis, tomados do catálogo de planos.
3. O usuário pode ver a comparação entre os planos Gratuito e Premium.

### Fluxos alternativos

- **A1 — Nome igual ao atual:** é aceito sem alteração visível.
- **A2 — Nome com espaços nas pontas:** é gravado sem eles.

### Fluxos de exceção

- **E1 — Sessão ausente, inválida, expirada ou encerrada:** a operação é rejeitada (401), sem dados, e a interface leva o usuário ao login.
- **E2 — Nome vazio, só com espaços ou acima de 100 caracteres:** erro de validação (400) indicando o campo; nada é alterado.
- **E3 — Solicitação de alteração com campo não editável** (e-mail, plano, status ou identificador): erro de validação (400); nada é alterado, nem o nome (OPEN-57).
- **E4 — Persistência indisponível ou falha ao gravar:** falha sinalizada (500) sem segredos nem detalhes internos; nada é alterado.

### Pós-condições

- Consulta: nenhum dado alterado.
- Alteração de nome bem-sucedida: somente o nome do usuário autenticado mudou.
- Falhas: nenhum dado alterado.

## 6. Regras e invariantes

- **INV-001:** um usuário consulta e altera apenas o próprio perfil e plano; nenhuma operação desta Spec retorna dados de outro usuário nem aceita indicar outro usuário (RNF01, RNF11).
- **INV-002:** somente o nome é alterável pelo perfil; e-mail, senha, plano, status e identificador não mudam por esta Spec (RF04, OPEN-05).
- **INV-003:** o nome tem de 1 a 100 caracteres após remover os espaços das pontas (SPEC-003).
- **INV-004:** nenhuma resposta ou registro técnico contém senha, hash, token ou credencial (RNF01, RNF20).
- **INV-005:** o catálogo de planos é a fonte única dos limites e recursos: Gratuito cria até 1 bolão simultâneo e Premium até 10; participação em bolões é sem limite nos dois; resultados ao vivo só em bolões criados por Premium (RB02, RB03, RB05, RB06).
- **INV-006:** o plano apresentado é o plano do usuário; nenhuma operação desta Spec o altera (RB01; a mudança é das SPEC-019 e SPEC-020).
- **INV-007:** todas as operações exigem sessão válida (RNF01).
- **INV-008:** uma solicitação de alteração do perfil que traga qualquer campo diferente de nome é rejeitada por inteiro (OPEN-57).
- **INV-009:** o status do plano Gratuito é "ativo" (OPEN-56).

## 7. Modelo de domínio envolvido

- **Usuario:** nome (alterável), e-mail, plano (Gratuito ou Premium) e status (ativo); identificador. Somente o nome é gravado por esta Spec.
- **Plano (catálogo):** definição fixa no backend dos planos Gratuito e Premium, com limite de bolões simultâneos e indicação de resultados ao vivo em bolões criados. Não é uma tabela de dados do usuário.
- **Restrições:** plano e status só mudam por Specs próprias. O preço do Premium não pertence a este catálogo e é definido na SPEC-019.

Nenhum modelo físico é definido aqui.

## 8. Impacto arquitetural

- **Módulos envolvidos:** "autenticação e usuários"; o catálogo de planos é consumido por "bolões e participações" (SPEC-007).
- **Fronteiras:** o backend é a autoridade da validação do nome e da identidade (ADR-0005); a interface não decide quem pode ver ou alterar o quê.
- **Integrações necessárias:** nenhuma.
- **Frontend:** telas de perfil e de plano na área autenticada, mensagens de erro no campo e redirecionamento ao login quando a sessão é rejeitada.
- **Backend:** leitura do perfil e do plano do usuário autenticado, alteração do nome e catálogo de planos.
- **ADRs que restringem a solução:** ADR-0004, ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação. Erros seguem o formato comum da SPEC-003.

- **Consultar perfil**
  - Entrada: sessão válida.
  - Saída: nome, e-mail e plano do usuário autenticado.
  - Erros: sessão rejeitada (401).
- **Alterar nome**
  - Entrada: novo nome (único campo aceito).
  - Saída: perfil atualizado.
  - Erros: sessão rejeitada (401); nome inválido ou campo não editável (400, campo indicado); falha interna (500).
- **Consultar plano da conta**
  - Entrada: sessão válida.
  - Saída: plano atual, status e recursos disponíveis (bolões criados simultâneos, participação sem limite e resultados ao vivo nos bolões criados).
  - Erros: sessão rejeitada (401).
- **Consultar planos disponíveis**
  - Entrada: sessão válida.
  - Saída: planos Gratuito e Premium com seus recursos, sem preço.
  - Erros: sessão rejeitada (401).
- **Catálogo de planos (interno)**
  - Saída: limite de bolões simultâneos e indicação de resultados ao vivo por plano, para as demais Specs.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF01 | Testes automatizados de acesso sem sessão, de tentativa de indicar outro usuário e de varredura de respostas em busca de credenciais (TC-05, TC-06, TC-08, TC-10). |
| RNF11 | Com dois usuários, conferir que cada um vê e altera apenas os próprios dados (TC-06). |
| RNF14 (por extensão) | Roteiro das telas de perfil e plano em 360 px, 768 px e 1366 px (TC-12). |

## 11. Critérios de aceitação

- **CA-01 (perfil próprio):** Dado um usuário autenticado, Quando ele acessa o perfil, Então vê o próprio nome, e-mail e plano e nenhuma credencial.
- **CA-02 (alterar nome):** Dado um nome válido, Quando o usuário o altera, Então o novo nome é gravado, o perfil mostra o novo nome e e-mail, plano e status permanecem iguais.
- **CA-03 (normalização):** Dado um nome com espaços nas pontas, Quando é gravado, Então fica sem eles.
- **CA-04 (nome inválido):** Dado um nome vazio, só com espaços ou com mais de 100 caracteres, Quando a alteração é enviada, Então é rejeitada indicando o campo e nada é alterado.
- **CA-05 (campos não editáveis):** Dado uma solicitação que traga e-mail, plano, status ou identificador, com ou sem nome, Quando ela é enviada, Então é rejeitada por inteiro e nada é alterado.
- **CA-06 (sem sessão):** Dado uma requisição sem sessão válida, Quando ela chama qualquer operação desta Spec, Então é rejeitada sem dados e a interface leva o usuário ao login.
- **CA-07 (isolamento):** Dado dois usuários, Quando o primeiro consulta ou altera seus dados, Então vê e altera somente os seus, e nenhuma operação permite apontar o outro usuário.
- **CA-08 (plano atual):** Dado um usuário recém-cadastrado, Quando ele consulta o plano, Então vê plano Gratuito, status ativo e os recursos: criar até 1 bolão simultâneo, participar de bolões sem limite e nenhum resultado ao vivo nos bolões que criar.
- **CA-09 (comparação):** Dado um usuário autenticado, Quando ele consulta os planos disponíveis, Então vê Gratuito e Premium com 1 e 10 bolões simultâneos, participação sem limite nos dois e resultados ao vivo apenas no Premium, sem preço.
- **CA-10 (fonte única):** Dado o catálogo de planos, Quando o limite de criação é lido pelo código de domínio em teste, Então retorna 1 para o Gratuito e 10 para o Premium, da mesma fonte que alimenta as telas.
- **CA-11 (plano inalterado):** Dado qualquer operação desta Spec, Quando ela termina, Então o plano do usuário não mudou.
- **CA-12 (sem segredos):** Dado qualquer operação desta Spec, com sucesso ou falha, Quando respostas e registros técnicos são inspecionados, Então não contêm senha, hash, token nem credencial.
- **CA-13 (formato de erros):** Dado erro de validação, sessão rejeitada e falha interna, Quando ocorrem, Então a resposta segue o formato comum de erros da SPEC-003, sem detalhes internos e com o identificador de correlação.
- **CA-14 (interface responsiva):** Dado as larguras de 360 px, 768 px e 1366 px, Quando as telas de perfil e de plano são usadas, Então permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página, com o erro de validação indicado no campo.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-001 | Consultar o perfil e conferir nome, e-mail, plano e ausência de credenciais. |
| TC-02 | CA-02, INV-002 | Alterar o nome e conferir o perfil e que e-mail, plano e status não mudaram. |
| TC-03 | CA-03, INV-003 | Alterar o nome com espaços nas pontas e conferir o valor gravado. |
| TC-04 | CA-04, INV-003 | Enviar nome vazio, só com espaços e com 101 caracteres. |
| TC-05 | CA-05, INV-002, INV-008 | Enviar alteração com e-mail, plano, status e identificador, com e sem nome, e conferir rejeição integral. |
| TC-06 | CA-07, INV-001 | Com dois usuários, consultar e alterar um deles e conferir que o outro não é visto nem afetado, inclusive ao enviar o identificador do outro. |
| TC-07 | CA-06, INV-007 | Chamar cada operação sem sessão, com token inválido e com sessão encerrada. |
| TC-08 | CA-12, INV-004 | Varrer respostas e registros técnicos, em sucesso e em falha, em busca de credenciais. |
| TC-09 | CA-08, INV-009 | Consultar o plano de um usuário novo e conferir plano, status e recursos. |
| TC-10 | CA-09, INV-005 | Consultar os planos disponíveis e conferir recursos e ausência de preço. |
| TC-11 | CA-10, CA-11, INV-005, INV-006 | Ler o limite do catálogo pelo domínio e conferir que nenhuma operação altera o plano. |
| TC-12 | CA-14 | Executar as telas em 360 px, 768 px e 1366 px. |
| TC-13 | CA-13 | Provocar cada categoria de erro e conferir o formato comum. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-56 | O plano Gratuito tem status "ativo"; a consulta mostra plano atual, status e os recursos do catálogo (bolões criados simultâneos, participação sem limite e resultados ao vivo nos bolões criados); para o Premium, o estado da assinatura e a vigência são acrescentados pelas SPEC-019 e SPEC-020. |
| OPEN-57 | Solicitação de alteração do perfil com qualquer campo diferente de nome é rejeitada por inteiro com erro de validação (400), sem ignorar campos em silêncio. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-005 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-14) estiverem implementados;
- todos os invariantes (INV-001 a INV-009) estiverem preservados;
- os testes derivados (TC-01 a TC-13) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
