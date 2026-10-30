# SPEC-003 — Cadastro e autenticação de usuário

- **Status:** aprovada. As propostas OPEN-49 a OPEN-53 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 e SPEC-002.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/` (incluindo ADR-0007, ADR-0008 e `matriz-de-permissoes.md`), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md`, SPEC-001 e SPEC-002.
- **Escopo deste documento:** somente a SPEC-003. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-003
- **Nome:** Cadastro e autenticação de usuário
- **Objetivo:** permitir que um visitante crie uma conta com nome, e-mail e senha, que um usuário com credenciais válidas seja autenticado por uma sessão com validade definida, que possa encerrá-la e que as operações protegidas do sistema exijam uma sessão válida e saibam quem é o usuário autenticado.
- **Valor entregue:** acesso identificado ao sistema, pré-condição de todos os casos de uso (UC01 a UC08), e a base de identidade sobre a qual as demais Specs aplicam plano, papel e privacidade.

## 2. Rastreabilidade

- **RF:** RF01 (cadastro) e RF02 (autenticação). A parte de RF02 que fala em "funcionalidades correspondentes ao perfil e plano" é viabilizada aqui pela identidade autenticada; as funcionalidades em si pertencem às Specs seguintes.
- **RB:** RB01 e RB02 (todo usuário nasce no plano Gratuito).
- **RNF:**
  - RNF01 — segurança: acesso anônimo negado a dados privados, senhas nunca em texto puro, segredos fora de respostas e logs.
  - RNF02 — somente a parte de que a operação e seu registro de auditoria formam uma unidade atômica.
  - RNF04 e RNF16 — via SPEC-002: cadastro, login, logout e falhas de autenticação são auditáveis.
  - RNF06 — desempenho das operações locais.
  - RNF11 — privacidade: a identidade autenticada é a base para negar dados de outros usuários.
  - RNF13 e RNF14 — compatibilidade de navegadores e responsividade do fluxo de cadastro e autenticação.
  - RNF20 — somente a parte de ausência de segredos nos registros técnicos.
- **Caso de uso ou fluxo:** pré-condição de UC01 a UC08 ("usuário autenticado"). Não há caso de uso próprio para cadastro e login.
- **Entidades do modelo conceitual:** `Usuario` (id, nome, email, plano, status). Credencial e sessão são estruturas técnicas definidas pelo ADR-0007, não entidades do domínio.
- **Drivers arquiteturais:** DA-04 (restrição de dados e operações pela identidade do usuário) e DA-06 (navegadores modernos e diferentes tamanhos de tela).
- **ADRs:** ADR-0001, ADR-0004, ADR-0005, ADR-0007 (sessão e senha) e ADR-0008.

## 3. Escopo

### Incluído

1. **Cadastro (RF01):** nome, e-mail e senha obrigatórios; e-mail único sem distinguir maiúsculas e minúsculas; senha com no mínimo 8 caracteres; usuário criado com plano Gratuito e status ativo; sem criar a Carteira (reservada) e sem iniciar sessão.
2. **Autenticação (RF02):** login com e-mail e senha; emissão de uma sessão com token opaco aleatório de 256 bits, guardado somente como hash, enviado pelo cliente no cabeçalho `Authorization`, com validade de 8 horas contadas da emissão, sem renovação.
3. **Encerramento de sessão:** logout que invalida a sessão usada.
4. **Proteção de operações:** etapa de autenticação no fluxo de requisição que rejeita operações protegidas sem sessão válida e disponibiliza às demais Specs a identidade do usuário autenticado (e seu plano).
5. **Senhas:** protegidas com `scrypt` do módulo `crypto` do Node, com os parâmetros padrão do Node, sal aleatório único de 16 bytes por usuário e resultado de 64 bytes, guardados junto com os parâmetros para permitir evolução; nunca em texto puro.
6. **Auditoria (SPEC-002):** registro de cadastro, login, logout e tentativas de login malsucedidas.
7. **Contrato de erros HTTP:** formato comum de erros dos contratos de negócio, que a SPEC-001 deixou para a primeira Spec que expõe operações de negócio (seção 9).
8. **Interface web:** telas de cadastro, login e logout, com a sessão mantida no navegador e enviada nas requisições, e redirecionamento ao login quando a sessão é rejeitada.

### Fora do escopo

- Recuperação de acesso e troca de senha (SPEC-004).
- Consulta e alteração do perfil e consulta do plano (SPEC-005).
- Autorização por papel em bolão e propriedade dos recursos de cada Spec (Specs proprietárias; `matriz-de-permissoes.md`).
- Confirmação de e-mail, autenticação multifator e login social, que a baseline não exige.
- Contratação do plano Premium (SPEC-019).
- Exclusão de conta, que a baseline não prevê.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, migrações, correlação e testes) e SPEC-002 (registro de auditoria).
- **Decisões arquiteturais:** ADR-0004, ADR-0005, ADR-0007 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- SPEC-001 e SPEC-002 operantes.
- Cadastro: o solicitante não possui sessão ativa. Login: o usuário já tem conta.

### Fluxo principal — cadastro

1. O visitante informa nome, e-mail e senha.
2. O sistema normaliza o e-mail (remove espaços das pontas e compara sem distinguir maiúsculas) e valida os campos.
3. Na mesma transação, cria o usuário com plano Gratuito e status ativo, guardando a senha protegida, e grava o registro de auditoria de sucesso.
4. O sistema informa o sucesso e leva o usuário ao login. Nenhuma sessão é iniciada.

### Fluxo principal — login

1. O usuário informa e-mail e senha.
2. O sistema valida as credenciais.
3. Na mesma transação, cria a sessão (token de 256 bits, apenas o hash guardado, expiração em 8 horas) e grava o registro de auditoria de sucesso.
4. O sistema devolve o token e os dados mínimos do usuário (identificador e nome).
5. A interface guarda o token e passa a enviá-lo nas requisições; o usuário acessa a área autenticada.

### Fluxo principal — logout

1. O usuário solicita o logout com uma sessão válida.
2. O sistema invalida essa sessão e grava o registro de auditoria.
3. A interface descarta o token e leva o usuário ao login.

### Fluxos alternativos

- **A1 — E-mail com maiúsculas ou espaços nas pontas:** é normalizado no cadastro e no login.
- **A2 — Novo login com sessão já ativa:** cria uma nova sessão; a anterior permanece válida até expirar ou sofrer logout.
- **A3 — Recarga da página com sessão válida:** o usuário permanece autenticado.

### Fluxos de exceção

- **E1 — Dado obrigatório ausente ou inválido no cadastro** (nome vazio ou acima do limite, e-mail com formato inválido ou acima do limite, senha curta ou acima do limite): a solicitação é rejeitada indicando os campos e nada é persistido.
- **E2 — E-mail já cadastrado:** o cadastro é rejeitado e a conta existente não é alterada.
- **E3 — Credenciais inválidas (e-mail inexistente ou senha incorreta):** o login falha com a mesma resposta nos dois casos, nenhuma sessão é criada e um registro de auditoria com ator "anônimo" e resultado falha é gravado, sem o e-mail tentado.
- **E4 — Sessão ausente, inválida, expirada ou encerrada em operação protegida:** a operação é rejeitada, nenhum dado privado é retornado e a interface leva o usuário ao login.
- **E5 — Falha ao gravar o usuário, a sessão ou o registro de auditoria:** nada é persistido e a falha é sinalizada sem segredos (SPEC-002, E3).
- **E6 — Persistência indisponível:** a falha é sinalizada ao cliente sem segredos nem detalhes internos.

### Pós-condições

- Cadastro: usuário novo com plano Gratuito e status ativo, sem sessão.
- Login: sessão válida por 8 horas.
- Logout: sessão invalidada.
- Falhas: nenhum estado de usuário ou sessão alterado; apenas registros de auditoria de falha.

## 6. Regras e invariantes

- **INV-001:** o e-mail é único sem distinguir maiúsculas e minúsculas, após remover espaços das pontas (OPEN-05).
- **INV-002:** todo usuário criado tem plano Gratuito e status ativo (RB01, RB02).
- **INV-003:** a senha nunca é armazenada em texto puro; é guardada com `scrypt` e sal único por usuário (RNF01, ADR-0007).
- **INV-004:** o token de sessão é guardado somente como hash; o token em claro existe apenas na resposta do login (ADR-0007).
- **INV-005:** a sessão expira 8 horas após a emissão e não é renovada (ADR-0007).
- **INV-006:** uma sessão expirada ou invalidada por logout não autentica nenhuma requisição.
- **INV-007:** operações protegidas rejeitam requisições sem sessão válida e não retornam dados privados (RNF01).
- **INV-008:** nenhuma resposta, registro técnico ou registro de auditoria contém senha, token ou hash (RNF01, RNF20, SPEC-002).
- **INV-009:** a falha de login não distingue e-mail inexistente de senha incorreta (OPEN-50).
- **INV-010:** o cadastro e seu registro de auditoria de sucesso são uma unidade atômica, assim como o login, a criação da sessão e o registro de sucesso (RNF02, SPEC-002).
- **INV-011:** toda tentativa de login malsucedida gera registro com ator "anônimo", resultado falha e sem o e-mail tentado (SPEC-002).
- **INV-012:** o nome tem de 1 a 100 caracteres após remover espaços das pontas, o e-mail tem até 254 caracteres com um único "@", texto antes e depois e sem espaços, e a senha tem de 8 a 128 caracteres, sem exigência adicional de complexidade (OPEN-05, OPEN-52).
- **INV-013:** um usuário pode ter mais de uma sessão simultânea, e o logout invalida somente a sessão usada (OPEN-49).
- **INV-014:** o cadastro não cria a Carteira (reservada) nem inicia sessão (OPEN-22, OPEN-49).

## 7. Modelo de domínio envolvido

- **Usuario:** identificador, nome, e-mail, plano (Gratuito neste momento) e status (ativo). Relacionamentos com `Bolao`, `Assinatura`, `Participacao`, `Convite`, `Notificacao` e `RegistroAuditoria` são criados por outras Specs e não são exercitados aqui.
- **Credencial e sessão:** estruturas técnicas do ADR-0007 (hash da senha com sal e parâmetros; hash do token, usuário, emissão, expiração e estado de encerramento), sem relação com as entidades do modelo conceitual além do usuário.
- **Restrições:** unicidade do e-mail normalizado; plano e status iniciais fixos. A Carteira não é criada.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "autenticação e usuários", "notificações e auditoria" (SPEC-002), persistência e correlação da SPEC-001.
- **Fronteiras:**
  - O backend é a autoridade de autenticação (ADR-0005); a interface apenas guarda e envia o token.
  - A etapa de autenticação entra no fluxo de requisição da SPEC-001, depois da correlação e antes das operações protegidas.
  - As demais Specs recebem a identidade e o plano do usuário autenticado e aplicam seus próprios controles de papel e propriedade.
- **Integrações necessárias:** nenhuma.
- **Frontend:** telas de cadastro, login e logout, guarda do token no navegador, envio do token nas requisições e redirecionamento ao login quando a sessão é rejeitada; fluxos utilizáveis em 360 px, 768 px e 1366 px.
- **Backend:** validação, normalização, proteção de senha, sessão, etapa de autenticação e auditoria.
- **ADRs que restringem a solução:** ADR-0004 (SQL direto, `better-sqlite3`), ADR-0005, ADR-0007 e ADR-0008 (migrações, testes).

## 9. Contratos necessários

Contratos conceituais; caminhos, nomes de campos e formatos exatos são definidos na implementação e conferidos pelos testes.

- **Cadastrar usuário**
  - Entrada: nome, e-mail e senha.
  - Saída: confirmação de que a conta foi criada, sem sessão e sem senha.
  - Erros: dados inválidos (campos indicados), e-mail já cadastrado, falha interna.
- **Autenticar usuário**
  - Entrada: e-mail e senha.
  - Saída: token de sessão, momento de expiração e dados mínimos (identificador e nome).
  - Erros: credenciais inválidas (resposta única), falha interna.
- **Encerrar sessão**
  - Entrada: sessão válida.
  - Saída: confirmação.
  - Erros: sessão ausente ou inválida.
- **Etapa de autenticação (interna e para as demais Specs)**
  - Entrada: token no cabeçalho `Authorization`.
  - Saída: identidade do usuário autenticado (identificador e plano) para a operação protegida.
  - Erros: sessão ausente, inválida, expirada ou encerrada.
- **Formato comum de erros HTTP:** conceitualmente, um tipo de erro estável, uma mensagem ao usuário sem detalhes internos, os campos inválidos quando houver e o identificador de correlação. Códigos HTTP: 400 para validação, 401 para credenciais inválidas e sessão rejeitada, 409 para e-mail já cadastrado e 500 para falha interna, sempre sem detalhes internos.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF01 | Testes automatizados de acesso anônimo a operação protegida (TC-08, TC-09); inspeção da persistência, dos registros técnicos e da auditoria em busca de senha, token e hash (TC-04, TC-06, TC-14). O acesso cruzado entre usuários e por papel é verificado nas Specs que expõem dados. |
| RNF02 (parte) | Falhar a gravação do registro de auditoria no cadastro e no login e conferir que nada é persistido (TC-13). |
| RNF04 e RNF16 | Conferir os registros de cadastro, login, logout e falha (TC-01, TC-05, TC-07, TC-11). |
| RNF06 | Teste de carga com 5 usuários simultâneos em cadastro e login, reportando o percentil 95 (TC-18). É validação prática e só será executada após confirmação da equipe (arquitetura consolidada §4.11). |
| RNF11 | A etapa de autenticação entrega a identidade usada pelas Specs com dados privados (TC-12). |
| RNF13 | Roteiro manual de cadastro e login nos navegadores listados, registrando versão, dispositivo e resultado (TC-17). |
| RNF14 | Roteiro de cadastro, login e logout em 360 px, 768 px e 1366 px (TC-16). |
| RNF20 (parte) | Provocar falhas e varrer os registros técnicos (TC-14). |

## 11. Critérios de aceitação

- **CA-01 (cadastro):** Dado um visitante com nome, e-mail ainda não cadastrado e senha de 8 ou mais caracteres, Quando ele solicita o cadastro, Então a conta é criada com plano Gratuito e status ativo, nenhuma sessão é iniciada e existe um registro de auditoria de sucesso.
- **CA-02 (dados inválidos):** Dado uma solicitação de cadastro sem nome, sem e-mail ou sem senha, com nome de mais de 100 caracteres, com e-mail de formato inválido ou de mais de 254 caracteres, ou com senha de menos de 8 ou mais de 128 caracteres, Quando ela é enviada, Então é rejeitada indicando os campos e nada é persistido.
- **CA-03 (e-mail duplicado):** Dado um e-mail já cadastrado, inclusive escrito com maiúsculas ou com espaços nas pontas, Quando outro cadastro é solicitado com ele, Então é rejeitado e a conta existente permanece inalterada.
- **CA-04 (senha protegida):** Dado dois usuários cadastrados com a mesma senha, Quando a persistência é inspecionada, Então nenhuma senha está em texto puro e os dois valores guardados são diferentes.
- **CA-05 (login):** Dado um usuário cadastrado, Quando ele informa credenciais válidas, Então recebe um token de sessão, o momento de expiração 8 horas após a emissão e seus dados mínimos, e existe um registro de auditoria de sucesso.
- **CA-06 (token somente como hash):** Dado um login realizado, Quando a persistência é inspecionada, Então só o hash do token está guardado.
- **CA-07 (credenciais inválidas):** Dado um e-mail inexistente ou uma senha incorreta, Quando o login é tentado, Então a resposta é a mesma nos dois casos, nenhuma sessão é criada e existe um registro de auditoria com ator "anônimo", resultado falha e sem o e-mail tentado.
- **CA-08 (acesso anônimo):** Dado uma requisição sem sessão, com token inexistente ou com token de sessão encerrada, Quando ela chama uma operação protegida de teste, Então é rejeitada e nenhum dado privado é retornado.
- **CA-09 (expiração):** Dado uma sessão emitida há menos de 8 horas e outra há mais de 8 horas (com relógio controlado em teste), Quando ambas são usadas, Então a primeira é aceita e a segunda é rejeitada.
- **CA-10 (logout):** Dado uma sessão válida, Quando o usuário faz logout, Então a sessão é invalidada, qualquer uso posterior do token é rejeitado e existe um registro de auditoria.
- **CA-11 (sessões simultâneas):** Dado dois logins do mesmo usuário, Quando um deles faz logout, Então a outra sessão continua válida.
- **CA-12 (identidade entregue):** Dado uma sessão válida, Quando uma operação protegida de teste é chamada, Então ela recebe o identificador e o plano do usuário autenticado.
- **CA-13 (atomicidade):** Dado que a gravação do registro de auditoria de sucesso falha, Quando o cadastro ou o login é executado, Então nenhum usuário nem sessão é criado.
- **CA-14 (sem segredos):** Dado qualquer operação desta Spec, com sucesso ou falha, Quando respostas, registros técnicos e registros de auditoria são inspecionados, Então não contêm senha, token nem hash.
- **CA-15 (normalização no login):** Dado um usuário cadastrado com e-mail escrito com maiúsculas e espaços nas pontas, Quando ele faz login com o e-mail em minúsculas e sem espaços, Então é autenticado.
- **CA-16 (interface responsiva):** Dado as larguras de 360 px, 768 px e 1366 px, Quando cadastro, login e logout são executados, Então permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página.
- **CA-17 (navegadores):** Dado os navegadores e sistemas do RNF13, Quando o roteiro de cadastro e autenticação é executado, Então funciona sem erro que bloqueie o fluxo.
- **CA-18 (sessão no navegador):** Dado um usuário autenticado, Quando a página é recarregada na mesma aba, Então ele permanece autenticado enquanto a sessão for válida; quando a aba é fechada, o token é descartado do navegador.
- **CA-19 (rejeição leva ao login):** Dado um usuário cuja sessão foi rejeitada, Quando a interface recebe a rejeição, Então o usuário é levado ao login.
- **CA-20 (desempenho):** Dado 5 usuários simultâneos, Quando executam cadastro e login, Então pelo menos 95% das operações respondem em até 3 segundos.
- **CA-21 (formato de erros):** Dado erros de validação, credenciais inválidas, e-mail duplicado, sessão rejeitada e falha interna, Quando eles ocorrem, Então a resposta segue o formato comum de erros, com os códigos 400, 401, 409 e 500 conforme a categoria, sem detalhes internos e com o identificador de correlação.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-002, INV-014 | Cadastrar usuário válido e conferir plano Gratuito, status ativo, ausência de sessão e registro de auditoria. |
| TC-02 | CA-02, INV-012 | Enviar cada variação de dado inválido e confirmar rejeição com campos indicados e nada persistido. |
| TC-03 | CA-03, INV-001 | Cadastrar com e-mail duplicado em variações de caixa e espaços e confirmar rejeição e conta inalterada. |
| TC-04 | CA-04, INV-003 | Cadastrar dois usuários com a mesma senha e inspecionar os valores guardados. |
| TC-05 | CA-05, INV-005 | Fazer login válido e conferir token, expiração de 8 horas e registro de auditoria. |
| TC-06 | CA-06, INV-004 | Inspecionar a persistência após login e confirmar que só o hash do token existe. |
| TC-07 | CA-07, INV-009, INV-011 | Tentar login com e-mail inexistente e com senha incorreta, comparar as respostas e conferir o registro anônimo sem e-mail. |
| TC-08 | CA-08, INV-007 | Chamar operação protegida sem token, com token inexistente e com token encerrado. |
| TC-09 | CA-09, INV-005, INV-006 | Usar uma sessão com relógio controlado antes e depois de 8 horas. |
| TC-10 | CA-10, INV-006 | Fazer logout e tentar reutilizar o token. |
| TC-11 | CA-11, INV-013 | Abrir duas sessões, encerrar uma e usar a outra. |
| TC-12 | CA-12 | Chamar operação protegida com sessão válida e conferir a identidade e o plano entregues. |
| TC-13 | CA-13, INV-010 | Forçar falha no registro de auditoria durante cadastro e login e confirmar que nada é criado. |
| TC-14 | CA-14, INV-008 | Varrer respostas, registros técnicos e auditoria em busca de senha, token e hash, em sucesso e em falha. |
| TC-15 | CA-15, INV-001 | Cadastrar com e-mail em caixa mista e espaços e autenticar com a forma normalizada. |
| TC-16 | CA-16 | Executar cadastro, login e logout em 360 px, 768 px e 1366 px. |
| TC-17 | CA-17 | Roteiro manual nos navegadores do RNF13 registrando versão, dispositivo e resultado. |
| TC-18 | CA-20 | Teste de carga com 5 usuários simultâneos, relatando o percentil 95 e os erros (sujeito à confirmação da equipe). |
| TC-19 | CA-18, CA-19 | Recarregar a página, fechar a aba e provocar rejeição de sessão na interface. |
| TC-20 | CA-21 | Provocar cada categoria de erro e conferir o formato comum, sem detalhes internos e com correlação. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-49 | O cadastro não inicia sessão e leva ao login; várias sessões simultâneas são permitidas e o logout encerra só a usada; a interface guarda o token no `sessionStorage`, que sobrevive à recarga e é descartado ao fechar a aba. |
| OPEN-50 | A mesma resposta para e-mail inexistente e senha incorreta; sem bloqueio por tentativas no protótipo; cada falha é registrada na auditoria. |
| OPEN-51 | `scrypt` com os parâmetros padrão do Node, sal de 16 bytes e resultado de 64 bytes, guardados com os parâmetros. |
| OPEN-52 | Nome de 1 a 100 caracteres, e-mail de até 254 com formato simples e senha de 8 a 128, sem exigência adicional de complexidade. |
| OPEN-53 | Formato comum de erros com tipo estável, mensagem ao usuário, campos inválidos e correlação; 400, 401, 409 e 500. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-003 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-21) estiverem implementados;
- todos os invariantes (INV-001 a INV-014) estiverem preservados;
- os testes derivados (TC-01 a TC-20) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o teste de carga do RNF06 e o roteiro manual dos RNF13 e RNF14 executados somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
