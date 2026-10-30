# SPEC-004 — Recuperação de acesso

- **Status:** aprovada. As propostas OPEN-54 e OPEN-55 foram aprovadas e incorporadas; liberada para implementação após as SPEC-001 a SPEC-003.
- **Tipo:** Spec funcional.
- **Baseline:** artefatos de `docs/` (incluindo ADR-0007 e ADR-0008), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001 a SPEC-003.
- **Escopo deste documento:** somente a SPEC-004. Nenhum código, tabela ou endpoint.

---

## 1. Identificação

- **ID:** SPEC-004
- **Nome:** Recuperação de acesso
- **Objetivo:** permitir que um usuário que perdeu a senha solicite a recuperação de acesso, receba por um canal simulado um token de uso único com validade de 30 minutos e, com ele, defina uma nova senha.
- **Valor entregue:** o usuário que perdeu a senha volta a acessar a conta, sem expor a existência de contas nem depender de um provedor de e-mail.

## 2. Rastreabilidade

- **RF:** RF03. O requisito diz "iniciar o processo de redefinição de senha"; a conclusão da redefinição (definir a nova senha) é a continuação necessária para que o valor entregue se cumpra e está prevista no ADR-0007.
- **RB:** nenhuma.
- **RNF:**
  - RNF01 — segurança: token e senha nunca em texto puro nem em respostas e logs; a resposta não revela se a conta existe.
  - RNF02 — somente a parte de que a redefinição e seu registro de auditoria formam uma unidade atômica.
  - RNF04 e RNF16 — via SPEC-002: a recuperação de acesso é operação auditável (arquitetura §4.3).
  - RNF14 — por extensão do fluxo de autenticação da SPEC-003: telas utilizáveis em 360 px, 768 px e 1366 px.
  - RNF20 — somente a parte de ausência de segredos nos registros técnicos.
- **Caso de uso ou fluxo:** nenhum (RF03 não possui caso de uso).
- **Entidades do modelo conceitual:** `Usuario` (a senha é alterada). Token de recuperação e canal simulado são estruturas técnicas do ADR-0007, não entidades do domínio.
- **Drivers arquiteturais:** DA-04.
- **ADRs:** ADR-0004, ADR-0005, ADR-0007 (recuperação simulada) e ADR-0008 (configuração e testes).

## 3. Escopo

### Incluído

1. **Solicitação de recuperação:** o usuário informa o e-mail; o sistema responde sempre da mesma forma, exista ou não a conta; se a conta existe, cria um token de recuperação e entrega a mensagem pelo canal simulado.
2. **Token:** aleatório (256 bits), de uso único, válido por 30 minutos a partir da criação, guardado somente como hash (OPEN-55).
3. **Canal simulado:** arquivo de texto local, só de inclusão, em pasta ignorada pelo Git e com caminho configurável, identificado como simulação e acessível apenas ao desenvolvedor; faz o papel da caixa de e-mail do usuário e é o único lugar onde o token existe em claro.
4. **Redefinição de senha:** com o token e uma nova senha, o sistema altera a senha, consome o token e invalida as sessões ativas e os demais tokens pendentes do usuário, sem iniciar sessão nova.
5. **Auditoria (SPEC-002):** registro das solicitações e das redefinições, com sucesso ou falha.
6. **Interface:** link "esqueci minha senha" no login, tela de solicitação e tela de redefinição, que lê o token do fragmento do endereço e o remove da barra de endereço.

### Fora do escopo

- Entrega real de e-mail ou SMS: a recuperação por e-mail real fica fora do protótipo (ADR-0007).
- Troca de senha pelo próprio usuário já autenticado e alteração do perfil (SPEC-005, que só edita o nome).
- Login e sessão (SPEC-003).
- Limite de solicitações por usuário ou por origem, que a baseline não exige (coerente com OPEN-50).
- Confirmação de e-mail e autenticação multifator.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (módulos, persistência atômica, configuração, correlação e testes), SPEC-002 (auditoria) e SPEC-003 (usuário, regras de senha, `scrypt`, sessões e formato comum de erros).
- **Decisões arquiteturais:** ADR-0005, ADR-0007 e ADR-0008.

## 5. Comportamento esperado

### Pré-condições

- SPEC-001 a SPEC-003 operantes.
- Solicitação: o solicitante conhece o e-mail cadastrado; não precisa estar autenticado.
- Redefinição: o solicitante possui o token entregue pelo canal simulado.

### Fluxo principal — solicitação

1. O visitante informa o e-mail.
2. O sistema normaliza o e-mail (remove espaços das pontas e compara sem distinguir maiúsculas).
3. O sistema responde com uma confirmação genérica, a mesma para qualquer e-mail válido.
4. Se existe conta com esse e-mail, em uma transação o sistema invalida os tokens pendentes do usuário, cria um novo token (hash guardado, expiração em 30 minutos) e grava o registro de auditoria de sucesso.
5. Depois de confirmada a transação, o sistema grava no canal simulado a mensagem com a marca de simulação, a data e a hora em UTC, o e-mail cadastrado do destinatário e o link para a redefinição, formado com o endereço base da interface e com o token no fragmento (`#`) do endereço.

### Fluxo principal — redefinição

1. O usuário abre o link recebido; a interface lê o token do fragmento, remove-o da barra de endereço e pede a nova senha.
2. O sistema valida o token (existente, não usado e não expirado) e a nova senha (regras da SPEC-003).
3. Em uma única transação, o sistema grava a nova senha protegida com `scrypt` e novo sal, marca o token como usado, invalida os demais tokens pendentes e todas as sessões ativas do usuário e grava o registro de auditoria de sucesso.
4. O sistema informa o sucesso e leva o usuário ao login. Nenhuma sessão é iniciada.

### Fluxos alternativos

- **A1 — E-mail com maiúsculas ou espaços nas pontas:** é normalizado.
- **A2 — Nova solicitação com token anterior pendente:** o token anterior é invalidado; só o mais recente vale.
- **A3 — E-mail sem conta:** a resposta é idêntica; nenhum token nem mensagem simulada é criado; a auditoria registra o ator "anônimo" e o resultado falha, sem o e-mail informado.

### Fluxos de exceção

- **E1 — E-mail ausente ou de formato inválido na solicitação:** rejeitado como erro de validação (400), sem criar token.
- **E2 — Token inexistente, expirado ou já usado:** a mesma resposta de erro nos três casos (400), nada é alterado e a auditoria registra o ator "anônimo" e o resultado falha.
- **E3 — Nova senha fora das regras:** erro de validação indicando o campo (400); o token não é consumido e pode ser usado de novo dentro da validade.
- **E4 — Falha ao gravar a nova senha, o token ou o registro de auditoria:** nada é persistido, o token continua válido e a falha é sinalizada sem segredos.
- **E5 — Falha ao gravar a mensagem simulada:** a falha é registrada tecnicamente com componente e correlação; a resposta ao usuário permanece genérica.
- **E6 — Persistência indisponível:** falha sinalizada sem segredos nem detalhes internos (500).

### Pós-condições

- Solicitação com conta existente: um único token pendente para o usuário e uma mensagem simulada gravada.
- Redefinição: senha nova ativa, senha antiga inválida, token usado, nenhuma sessão anterior válida e nenhuma sessão nova.
- Falhas: nenhuma senha, token ou sessão alterados indevidamente; apenas registros de auditoria de falha.

## 6. Regras e invariantes

- **INV-001:** o token é aleatório (256 bits), de uso único e válido por 30 minutos a partir da criação, e é guardado somente como hash (ADR-0007).
- **INV-002:** o token em claro existe apenas na mensagem simulada, nunca em respostas, registros técnicos, auditoria ou na estrutura de tokens (RNF01, RNF20).
- **INV-003:** a resposta à solicitação é idêntica, em status e conteúdo, exista ou não a conta (ADR-0007).
- **INV-004:** a mensagem simulada é identificada como simulação e não é exposta por nenhuma operação HTTP (ADR-0007).
- **INV-005:** a redefinição é atômica: nova senha, consumo do token, invalidação de sessões e de tokens pendentes e registro de auditoria ocorrem juntos ou nenhum ocorre (RNF02).
- **INV-006:** depois de uma redefinição, nenhuma sessão anterior do usuário autentica requisições (OPEN-55).
- **INV-007:** no máximo um token pendente por usuário: uma nova solicitação invalida o anterior (OPEN-55).
- **INV-008:** token inexistente, expirado e já usado recebem a mesma resposta (ADR-0007).
- **INV-009:** a nova senha segue as regras da SPEC-003 (8 a 128 caracteres) e é guardada com `scrypt` e novo sal; nunca em texto puro (RNF01).
- **INV-010:** nenhuma resposta, registro técnico ou registro de auditoria contém senha, token ou hash (RNF01, RNF20).
- **INV-011:** solicitação para e-mail sem conta não cria token nem mensagem simulada.
- **INV-012:** a redefinição não inicia sessão (OPEN-55).
- **INV-013:** toda solicitação e toda redefinição, com sucesso ou falha, gera registro de auditoria; o ator não identificado é registrado como "anônimo" e sem o e-mail informado (SPEC-002).

## 7. Modelo de domínio envolvido

- **Usuario:** a senha protegida é substituída; plano, status, nome e e-mail permanecem.
- **Token de recuperação (técnico):** hash do token, usuário, criação, expiração e estado (pendente, usado ou invalidado).
- **Canal simulado (técnico):** mensagens com a marca de simulação, data e hora UTC, destinatário e link; não faz parte do modelo conceitual.
- **Restrições:** um token pendente por usuário; uso único; validade de 30 minutos.

Nenhum modelo físico é definido aqui; as estruturas são entregues como migração (ADR-0008).

## 8. Impacto arquitetural

- **Módulos envolvidos:** "autenticação e usuários", "notificações e auditoria" (SPEC-002), persistência e correlação da SPEC-001.
- **Fronteiras:**
  - A entrega da mensagem fica atrás de uma porta de entrega com implementação simulada, como as demais integrações (SPEC-001, INV-004). Uma implementação real poderia substituí-la sem alterar esta Spec.
  - O backend é a autoridade da validação do token e da senha (ADR-0005).
- **Integrações necessárias:** nenhuma real.
- **Frontend:** link "esqueci minha senha" no login, tela de solicitação, tela de redefinição, mensagens de sucesso e de erro, utilizáveis em 360 px, 768 px e 1366 px.
- **Backend:** solicitação, geração e validação do token, redefinição atômica e entrega simulada.
- **Configuração:** o caminho do canal simulado e o endereço base da interface usado no link vêm de variáveis de ambiente listadas no `.env.example` (ADR-0008).
- **ADRs que restringem a solução:** ADR-0004, ADR-0005, ADR-0007 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; caminhos e nomes de campos são definidos na implementação.

- **Solicitar recuperação**
  - Entrada: e-mail.
  - Saída: confirmação genérica, igual para qualquer e-mail válido.
  - Erros: e-mail ausente ou de formato inválido (400); falha interna (500). Formato de erros e códigos conforme a SPEC-003.
- **Redefinir senha**
  - Entrada: token e nova senha.
  - Saída: confirmação, sem sessão e sem dados sensíveis.
  - Erros: token inválido, expirado ou usado (resposta única, 400); nova senha fora das regras (400, campo indicado); falha interna (500).
- **Entrega da mensagem simulada (interno)**
  - Entrada: destinatário, link com o token e momento.
  - Saída: mensagem gravada com a marca de simulação.
  - Erros: falha de gravação (registrada tecnicamente, sem afetar a resposta ao usuário).
- **Mensagem simulada:** marca "SIMULAÇÃO", data e hora UTC, e-mail cadastrado do destinatário e link de redefinição com o token no fragmento; acessível somente ao desenvolvedor, fora de qualquer operação HTTP. O endereço base da interface e o caminho do arquivo vêm de variáveis de ambiente do `.env.example`.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF01 | Testes automatizados de resposta idêntica com e sem conta (TC-02), token só como hash (TC-05) e varredura de respostas, registros técnicos e auditoria (TC-14). |
| RNF02 (parte) | Falhar a gravação da auditoria ou da troca de senha e conferir que nada é persistido e o token segue válido (TC-12). |
| RNF04 e RNF16 | Conferir os registros de solicitação e redefinição, com sucesso e com falha (TC-01, TC-02, TC-06, TC-09). |
| RNF14 (por extensão) | Roteiro das telas de solicitação e redefinição em 360 px, 768 px e 1366 px (TC-16). |
| RNF20 (parte) | Provocar falhas, inclusive na entrega simulada, e varrer os registros técnicos (TC-14, TC-15). |

## 11. Critérios de aceitação

- **CA-01 (solicitação com conta):** Dado um usuário cadastrado, Quando ele solicita a recuperação com o seu e-mail, Então recebe a confirmação genérica, um token pendente é criado, uma mensagem simulada com a marca de simulação e o link é gravada no canal simulado e existe um registro de auditoria de sucesso.
- **CA-02 (solicitação sem conta):** Dado um e-mail de formato válido sem conta, Quando a recuperação é solicitada, Então a resposta é idêntica à do CA-01 em status e conteúdo, nenhum token nem mensagem simulada é criado e existe um registro de auditoria com ator "anônimo", resultado falha e sem o e-mail informado.
- **CA-03 (e-mail inválido):** Dado um e-mail ausente ou de formato inválido, Quando a recuperação é solicitada, Então é rejeitada como erro de validação e nenhum token é criado.
- **CA-04 (normalização):** Dado uma conta cadastrada com e-mail em caixa mista, Quando a recuperação é solicitada com o e-mail em minúsculas e com espaços nas pontas, Então o fluxo do CA-01 ocorre.
- **CA-05 (token como hash e mensagem identificada):** Dado uma solicitação com conta, Quando a persistência e o canal simulado são inspecionados, Então a estrutura de tokens guarda somente o hash e a mensagem simulada traz a marca de simulação.
- **CA-06 (redefinição):** Dado um token válido e uma nova senha válida, Quando a redefinição é feita, Então a nova senha passa a autenticar e a antiga deixa de autenticar, o token fica usado, as sessões anteriores do usuário e os demais tokens pendentes são invalidados, nenhuma sessão nova é criada e existe um registro de auditoria de sucesso.
- **CA-07 (uso único):** Dado um token já usado, Quando ele é apresentado de novo, Então é rejeitado e nada é alterado.
- **CA-08 (validade de 30 minutos):** Dado um token com menos de 30 minutos e outro com mais de 30 minutos (relógio controlado), Quando ambos são usados, Então o primeiro é aceito e o segundo é rejeitado.
- **CA-09 (token inválido):** Dado um token inexistente, um expirado e um já usado, Quando a redefinição é tentada, Então a resposta é a mesma nos três casos, nada é alterado e existe um registro de auditoria com ator "anônimo" e resultado falha.
- **CA-10 (senha inválida):** Dado um token válido e uma nova senha fora das regras, Quando a redefinição é tentada, Então é rejeitada indicando o campo, e o token permanece válido para nova tentativa.
- **CA-11 (nova solicitação invalida a anterior):** Dado duas solicitações sucessivas para a mesma conta, Quando os dois tokens são usados, Então o primeiro é rejeitado e o segundo é aceito.
- **CA-12 (atomicidade):** Dado que a gravação da auditoria ou da nova senha falha, Quando a redefinição é executada, Então a senha, o token, as sessões e os tokens pendentes permanecem como antes.
- **CA-13 (sem segredos):** Dado qualquer operação desta Spec, com sucesso ou falha, Quando respostas, registros técnicos, auditoria e a estrutura de tokens são inspecionados, Então não contêm senha, token em claro nem hash exposto; o token em claro aparece apenas na mensagem simulada.
- **CA-14 (canal não exposto):** Dado a aplicação em execução, Quando todas as operações HTTP são examinadas, Então nenhuma retorna o conteúdo do canal simulado.
- **CA-15 (falha de entrega):** Dado que a gravação da mensagem simulada falha, Quando a recuperação é solicitada, Então a falha é registrada tecnicamente com componente e correlação, sem segredos, e a resposta ao usuário continua genérica.
- **CA-16 (interface):** Dado as larguras de 360 px, 768 px e 1366 px, Quando as telas de solicitação e de redefinição são usadas a partir do login, Então permanecem utilizáveis, sem sobreposição de controles nem rolagem horizontal da página.
- **CA-17 (formato de erros):** Dado erros de validação, token inválido e falha interna, Quando eles ocorrem, Então a resposta segue o formato comum de erros da SPEC-003, sem detalhes internos e com o identificador de correlação.
- **CA-18 (sem login automático):** Dado uma redefinição bem-sucedida, Quando ela termina, Então o usuário é levado ao login e nenhuma sessão existe para ele até que ele faça login.
- **CA-19 (token no fragmento):** Dado o link de redefinição com o token no fragmento, Quando a interface abre a tela de redefinição, Então lê o token, o remove da barra de endereço e o envia apenas no corpo da requisição de redefinição.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-001, INV-013 | Solicitar com conta existente e conferir resposta, token pendente, mensagem simulada e auditoria. |
| TC-02 | CA-02, INV-003, INV-011 | Solicitar com e-mail sem conta, comparar a resposta com a do TC-01 e conferir ausência de token e mensagem e o registro anônimo. |
| TC-03 | CA-03 | Solicitar com e-mail ausente e de formato inválido. |
| TC-04 | CA-04 | Solicitar com e-mail em caixa diferente e com espaços. |
| TC-05 | CA-05, INV-001, INV-004 | Inspecionar a estrutura de tokens e a mensagem simulada. |
| TC-06 | CA-06, INV-005, INV-006, INV-009, INV-012 | Redefinir com token válido e conferir a troca de senha, o consumo do token, a invalidação de sessões e tokens e a ausência de sessão nova. |
| TC-07 | CA-07 | Reapresentar um token já usado. |
| TC-08 | CA-08, INV-001 | Usar tokens com relógio controlado antes e depois de 30 minutos. |
| TC-09 | CA-09, INV-008 | Tentar token inexistente, expirado e usado, comparar respostas e conferir o registro anônimo. |
| TC-10 | CA-10 | Tentar nova senha fora das regras e depois uma válida com o mesmo token. |
| TC-11 | CA-11, INV-007 | Solicitar duas vezes e usar os dois tokens. |
| TC-12 | CA-12, INV-005 | Forçar falha na auditoria e na troca de senha e conferir que tudo permanece como antes. |
| TC-13 | CA-14, INV-004 | Examinar todas as operações HTTP em busca de acesso ao canal simulado. |
| TC-14 | CA-13, INV-002, INV-010 | Varrer respostas, registros técnicos, auditoria e estrutura de tokens em sucesso e em falha. |
| TC-15 | CA-15 | Forçar falha na gravação da mensagem simulada e conferir o registro técnico e a resposta genérica. |
| TC-16 | CA-16 | Executar as telas em 360 px, 768 px e 1366 px. |
| TC-17 | CA-17 | Provocar cada categoria de erro e conferir o formato comum. |
| TC-18 | CA-18 | Concluir uma redefinição e conferir o redirecionamento ao login e a ausência de sessão. |
| TC-19 | CA-19 | Abrir o link com o token no fragmento e conferir a leitura, a remoção da barra de endereço e o envio apenas no corpo. |

## 13. Questões em aberto

### Decisões incorporadas (propostas aprovadas)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-54 | Canal simulado em arquivo de texto local, só de inclusão, em pasta ignorada pelo Git, com caminho configurável; mensagem com marca "SIMULAÇÃO", data e hora UTC, e-mail cadastrado e link formado com o endereço base da interface (variável de ambiente); token no fragmento do link, lido e removido da barra de endereço pela interface; falha na gravação da mensagem é registrada tecnicamente e a resposta continua genérica, sem compensar o token. |
| OPEN-55 | Token de 256 bits; nova solicitação invalida os tokens pendentes; redefinição invalida os demais tokens e todas as sessões do usuário e não inicia sessão; nova senha pode ser igual à anterior; sem limite de solicitações no protótipo. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-004 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-19) estiverem implementados;
- todos os invariantes (INV-001 a INV-013) estiverem preservados;
- os testes derivados (TC-01 a TC-19) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados, com o roteiro de larguras de tela do RNF14 executado somente após confirmação da equipe;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
