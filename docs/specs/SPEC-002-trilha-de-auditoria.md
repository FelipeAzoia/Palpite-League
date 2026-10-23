# SPEC-002 — Trilha de auditoria

- **Status:** rascunho aguardando aprovação humana.
- **Tipo:** Spec técnica (necessidade demonstrada nos artefatos de arquitetura; ver seção 2).
- **Baseline:** artefatos de `docs/`, `docs/specs/mapa-de-specs.md` (aprovado) e SPEC-001.
- **Escopo deste documento:** somente a SPEC-002. Nenhum código, tabela, endpoint de negócio ou escolha tecnológica nova.

---

## 1. Identificação

- **ID:** SPEC-002
- **Nome:** Trilha de auditoria
- **Objetivo:** disponibilizar a capacidade de registrar operações auditáveis com ator, ação, objeto afetado, data e hora em UTC e resultado, identificando o sistema como ator nas ações automáticas, mantendo os registros preservados e sem armazenar segredos.
- **Valor entregue:** evidência consultável de quem fez o quê e com qual resultado, reutilizada pelas Specs que executam operações auditáveis (autenticação, aceite das regras, palpites, decisões administrativas, sincronização de resultados, saída do bolão, assinatura e movimentações financeiras).

## 2. Rastreabilidade

- **RF:** nenhum. A Spec é habilitadora; consumidores diretos incluem RF31 e, indiretamente, RF02, RF14, RF15, RF20, RF21, RF23, RF32, RF33, RF34 e RF37.
- **RB:** RB65 (registro do aceite) e RB53 (registro das movimentações) como consumidoras do mecanismo. RB64 não é coberta aqui (histórico das regras é dado do bolão, SPEC-007).
- **RNF:**
  - RNF04 — rastreabilidade: campos do registro, sistema como ator, sem senhas, tokens ou dados de pagamento sensíveis.
  - RNF16 — não repúdio: evidência de palpites, aceites, decisões administrativas e movimentações; alteração não apaga o registro anterior; origem da movimentação.
  - RNF01 — somente a parte de não armazenar senhas e segredos.
  - RNF20 — somente a parte de que falhas ao registrar geram registro técnico, sem segredos.
- **Caso de uso ou fluxo:** nenhum caso de uso específico. A necessidade vem de arquitetura consolidada §4.3, §4.7 e §7.7, da lista de módulos em §14.1 (notificações e auditoria) e do número de Specs que dependem do mesmo mecanismo.
- **Entidades do modelo conceitual:** nenhuma existente. O registro de auditoria não consta no modelo conceitual (OPEN-31); seção 7 descreve o conceito provisório.
- **Drivers arquiteturais:** DA-03 (rastreabilidade financeira e das operações) e DA-04 (restrição de dados e operações por identidade e papel; aqui, somente o registro do ator).
- **ADRs:** ADR-0001 (módulo interno do monólito), ADR-0005 (o backend é a autoridade das operações e, portanto, de seus registros). Apoio: ADR-0003 (origem simulada identificada, sem apresentar simulação como confirmação do provedor).
- **Justificativa de ser Spec técnica:** RNF04 e RNF16 valem transversalmente e não geram Spec própria por si. Esta Spec existe porque o mecanismo único de registro (campos, imutabilidade, ator sistema, ausência de segredos) é pré-requisito comum de pelo menos dez Specs posteriores, e a arquitetura reserva um módulo para ele (§14.1). Cada operação auditável concreta continua sendo especificada na Spec que a possui.

## 3. Escopo

### Incluído

1. Registrar uma operação auditável com ator, ação, objeto afetado (tipo e identificador), data e hora em UTC e resultado.
2. Atribuir ao sistema o papel de ator nas ações executadas automaticamente.
3. Preservar os registros: o módulo de auditoria não oferece atualização nem remoção de registros existentes, e uma alteração posterior de um objeto gera novo registro sem afetar o anterior.
4. Garantir que o registro não contenha senhas, tokens, credenciais nem dados completos de pagamento.
5. Aceitar e preservar a origem de uma operação financeira (provedor de teste ou simulador) quando informada pelo módulo proprietário.
6. Consultar registros, em nível de aplicação (backend), em ordem cronológica, filtrados por objeto afetado ou por ator.
7. Sinalizar ao chamador e registrar tecnicamente (SPEC-001) a falha ao gravar um registro.

### Fora do escopo

- O catálogo concreto de operações auditáveis e o ato de registrá-las: cada Spec proprietária declara e implementa as suas (SPEC-003 autenticação, SPEC-009 aceite, SPEC-010 aprovação, SPEC-012 palpite, SPEC-013 sincronização, SPEC-017 saída, SPEC-018, SPEC-019, SPEC-020 e SPEC-022 a SPEC-026 operações financeiras e de assinatura, SPEC-011 e SPEC-023 decisões administrativas).
- Exposição dos registros a usuários por interface, telas e autorização de consulta (RNF11, RNF12; OPEN-08, OPEN-31).
- Retenção, expurgo e exportação dos registros (OPEN-31).
- Registros técnicos de diagnóstico (logs), que pertencem à SPEC-001.
- Histórico financeiro `MovimentacaoFinanceira` e sua consulta (SPEC-018; OPEN-33).
- Armazenamento do aceite dentro de `Participacao` (SPEC-009) e histórico exibido ao participante (SPEC-028).
- Mecanismos criptográficos de assinatura ou selagem dos registros; a baseline exige evidência auditável, não prova criptográfica.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (persistência com execução atômica, módulos, registro técnico, testes sem credenciais externas).
- **Decisões arquiteturais:** ADR-0001 e ADR-0005. Quanto ao módulo que abriga a auditoria, aguarda OPEN-39.
- **Obrigação para Specs posteriores:** cada Spec que introduzir uma operação auditável deve listá-la e exigir seu registro nos critérios de aceitação.

## 5. Comportamento esperado

### Pré-condições

- SPEC-001 operante (aplicação, persistência e registro técnico).
- Uma operação definida como auditável foi concluída por um ator, que pode ser um usuário identificado ou o sistema.

### Fluxo principal

1. Uma operação auditável é concluída pelo módulo que a possui.
2. O módulo solicita o registro informando ator, ação, objeto afetado e resultado.
3. O sistema atribui a data e a hora em UTC e persiste o registro.
4. O registro fica disponível para consulta por objeto afetado ou por ator, em ordem cronológica, sem conteúdo sensível.

### Fluxos alternativos

- **A1 — Ação automática:** o ator registrado é o sistema, não um usuário.
- **A2 — Operação financeira:** o registro preserva a origem informada (provedor de teste ou simulador).
- **A3 — Alteração posterior de um objeto já auditado:** um novo registro é criado e o anterior permanece inalterado.
- **A4 — Operação com resultado de falha:** o registro indica resultado de falha (escopo das falhas auditáveis em OPEN-45).

### Fluxos de exceção

- **E1 — Solicitação sem campo obrigatório:** é rejeitada e nenhum registro parcial é persistido.
- **E2 — Valor sensível presente no processamento da operação:** o valor não é persistido no registro.
- **E3 — Falha ao gravar o registro:** a falha é sinalizada ao chamador e registrada tecnicamente com componente e identificador de correlação; não é silenciada. A consequência para a operação auditada (desfazê-la ou mantê-la) aguarda decisão em OPEN-46.

### Pós-condições

- Registro persistido, completo, com data e hora em UTC e sem segredos.
- Registros anteriores inalterados.

## 6. Regras e invariantes

- **INV-001:** todo registro contém ator, ação, objeto afetado (tipo e identificador), data e hora em UTC e resultado (RNF04).
- **INV-002:** ação executada automaticamente tem o sistema como ator, nunca um usuário (RNF04).
- **INV-003:** o módulo de auditoria não oferece operação de atualização nem de remoção de registros existentes; uma alteração posterior gera novo registro e preserva o anterior (RNF16).
- **INV-004:** nenhum registro contém senha, token, credencial nem dados completos de pagamento (RNF04, RNF16, RNF01).
- **INV-005:** a data e a hora do registro são atribuídas pelo sistema em UTC; um valor fornecido pelo chamador não as substitui (derivado de RNF04 e RNF16, evidência confiável).
- **INV-006:** a origem informada de uma operação financeira é preservada como informada, e uma operação simulada nunca é registrada como originada pelo provedor (RNF16, RNF15).
- **INV-007:** a consulta retorna os registros em ordem cronológica e somente os que correspondem ao critério informado.
- **INV-008:** toda operação auditável concluída com sucesso gera um registro correspondente (RNF04: "cada operação definida como auditável gera um registro").

## 7. Modelo de domínio envolvido

Nenhuma entidade existente do modelo conceitual é alterada. Esta Spec introduz o conceito provisório de **registro de auditoria**, cujo nome e estrutura dependem de OPEN-31:

- **Atributos conceituais:** ator (usuário identificado ou sistema), ação, objeto afetado (tipo e identificador), momento do registro em UTC, resultado e, quando a operação for financeira, origem.
- **Restrições:** somente inclusão (sem atualização ou remoção); nunca contém segredos; o objeto afetado é uma referência, não uma cópia do objeto.
- **Relacionamentos:** referência ao usuário ator e ao objeto afetado, sem alterar `Usuario` nem as entidades de domínio. Relação com `MovimentacaoFinanceira`, com `Participacao.aceiteRegrasEm` e com `Palpite.dataEnvio`: OPEN-47.

Nenhum modelo físico é definido nesta Spec.

## 8. Impacto arquitetural

- **Módulos envolvidos:** módulo de auditoria, abrigado conforme OPEN-39 (a arquitetura consolidada §14.1 prevê "notificações e auditoria"; RNF19 não o lista), e a persistência da SPEC-001. Os módulos proprietários das operações o utilizam por uma interface explícita.
- **Fronteiras:**
  - Somente o backend cria registros; a interface não é autoridade para gerar evidência (ADR-0005).
  - O módulo de auditoria não depende da interface HTTP nem de SDKs de provedores externos (verificação estrutural da SPEC-001).
- **Integrações necessárias:** nenhuma.
- **Frontend:** nenhuma responsabilidade; não há tela de consulta nesta Spec.
- **Backend:** registro, preservação e consulta interna dos registros, e sinalização de falha de gravação.
- **ADRs que restringem a solução:** ADR-0001, ADR-0004 (SQLite com SQL direto e execução parametrizada, pela SPEC-001) e ADR-0005.

## 9. Contratos necessários

Contratos conceituais; valores e formatos não definidos na baseline estão em OPEN.

- **Registrar operação auditável**
  - Entrada: ator (usuário identificado ou sistema), ação, objeto afetado (tipo e identificador), resultado e, para operação financeira, origem.
  - Saída: registro persistido com data e hora em UTC atribuídas pelo sistema.
  - Erros: campo obrigatório ausente (solicitação rejeitada, nada persistido); falha de persistência (sinalizada ao chamador e registrada tecnicamente).
  - Conjunto de ações, valores de resultado e representação do ator não identificado: OPEN-45. Conteúdo adicional do registro: OPEN-47.
- **Consultar registros**
  - Entrada: critério por objeto afetado ou por ator.
  - Saída: lista de registros em ordem cronológica; lista vazia quando nada corresponde.
  - Erros: critério inválido.
  - Quem pode consultar, filtros finais e exposição ao usuário: OPEN-31 e OPEN-08.
- **Relação com o registro técnico:** falhas de gravação seguem o contrato de registro técnico da SPEC-001 (data e hora, nível, componente, correlação e resultado, sem segredos).

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF04 | Registrar uma operação de teste de cada tipo de ator (usuário e sistema) e conferir campos, UTC e ausência de segredos (TC-01, TC-03, TC-04, TC-07). Conforme a verificação do próprio RNF, uma operação por categoria auditável real será conferida nas Specs proprietárias. |
| RNF16 | Registrar operações sucessivas sobre o mesmo objeto e conferir que o primeiro registro permanece idêntico; conferir a origem simulada (TC-05, TC-06, TC-08). |
| RNF01 (parte) | Inspeção dos registros e da resposta de erro em busca de senhas e segredos (TC-07). |
| RNF20 (parte) | Provocar falha de gravação e conferir o registro técnico com componente e correlação, sem segredos (TC-11). |

## 11. Critérios de aceitação

- **CA-01 (registro completo):** Dado uma operação auditável de teste executada por um usuário identificado, Quando ela é concluída com sucesso, Então existe um registro com ator, ação, objeto afetado, data e hora em UTC e resultado indicando sucesso.
- **CA-02 (resultado de falha):** Dado uma operação auditável de teste que falha, Quando ela é concluída, Então existe um registro cujo resultado indica falha.
- **CA-03 (ator sistema):** Dado uma ação automática de teste, Quando ela é registrada, Então o ator do registro é o sistema e não um usuário.
- **CA-04 (UTC atribuída pelo sistema):** Dado o registro de uma operação, Quando o registro é inspecionado, Então a data e a hora estão em UTC e correspondem ao instante do registro, e um valor de data e hora fornecido pelo chamador não prevalece.
- **CA-05 (imutabilidade):** Dado um registro existente, Quando se tenta alterá-lo ou removê-lo por qualquer operação oferecida pelo módulo de auditoria, Então nenhuma alteração é possível e o registro permanece idêntico.
- **CA-06 (preservação do histórico):** Dado um objeto que já possui um registro, Quando uma nova operação auditável incide sobre o mesmo objeto, Então existem dois registros e o primeiro permanece idêntico.
- **CA-07 (sem segredos):** Dado uma operação de teste cujo processamento envolve senha, token e dados completos de cartão, Quando o registro é gerado, Então nenhum campo do registro contém esses valores.
- **CA-08 (origem da operação):** Dado uma operação financeira de teste com origem informada como simulador, Quando ela é registrada, Então o registro mostra a origem simulador e não aparece como originada pelo provedor; e o mesmo vale para a origem provedor de teste.
- **CA-09 (campos obrigatórios):** Dado uma solicitação de registro sem ator, ação, objeto afetado ou resultado, Quando ela é enviada, Então é rejeitada e nenhum registro parcial é persistido.
- **CA-10 (consulta):** Dado registros de objetos e atores diferentes, Quando a consulta é feita por um objeto ou por um ator, Então são retornados somente os registros correspondentes, em ordem cronológica.
- **CA-11 (falha de gravação):** Dado que a persistência está indisponível no momento do registro, Quando se tenta registrar uma operação, Então a falha é sinalizada ao chamador e registrada tecnicamente com componente e identificador de correlação, sem segredos.
- **CA-12 (cobertura por sucesso):** Dado uma operação auditável de teste concluída com sucesso, Quando se consultam os registros do objeto afetado, Então há exatamente um registro correspondente a essa operação.
- **CA-13 (estrutura e testes offline):** Dado o módulo de auditoria e um ambiente sem credenciais externas e sem rede externa, Quando a verificação estrutural da SPEC-001 e a suíte desta Spec são executadas, Então o módulo não depende da interface HTTP nem de SDK de provedor e todos os testes passam.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-001 | Registrar operação de teste de um usuário e conferir os cinco campos. |
| TC-02 | CA-02 | Registrar operação de teste com falha e conferir o resultado de falha. |
| TC-03 | CA-03, INV-002 | Registrar ação automática e conferir o sistema como ator. |
| TC-04 | CA-04, INV-005 | Conferir UTC e instante atribuído pelo sistema, inclusive com data e hora fornecida pelo chamador. |
| TC-05 | CA-05, INV-003 | Tentar alterar e remover um registro existente por toda operação oferecida e confirmar que permanece idêntico. |
| TC-06 | CA-06, INV-003 | Registrar duas operações sucessivas sobre o mesmo objeto e comparar o primeiro registro antes e depois. |
| TC-07 | CA-07, INV-004 | Processar operação com senha, token e dados de cartão fictícios e varrer o registro e a resposta de erro. |
| TC-08 | CA-08, INV-006 | Registrar operações com origem simulador e com origem provedor de teste e conferir a distinção. |
| TC-09 | CA-09 | Enviar solicitações sem cada campo obrigatório e confirmar rejeição sem registro parcial. |
| TC-10 | CA-10, INV-007 | Criar registros de objetos e atores distintos e consultar por objeto e por ator, conferindo filtro e ordem. |
| TC-11 | CA-11 | Tornar a persistência indisponível e conferir sinalização ao chamador e registro técnico. |
| TC-12 | CA-12, INV-008 | Concluir operação com sucesso e conferir um único registro correspondente. |
| TC-13 | CA-13 | Executar a verificação estrutural da SPEC-001 sobre o módulo e a suíte sem credenciais e sem rede externa. |

## 13. Questões em aberto

- **OPEN-31 - decisão necessária:** definir o catálogo de operações auditáveis (RNF04 diz "definida como auditável" sem lista; há listas parciais em RNF16, arquitetura §4.3 e §7.7), a representação do registro (não há entidade no modelo conceitual), quem pode consultá-lo, os filtros de consulta e a retenção.
- **OPEN-08 - decisão necessária:** documentar a matriz de permissões por papel, necessária para decidir quem consulta os registros (RNF11, RNF12).
- **OPEN-39 - decisão necessária:** definir o módulo que abriga a auditoria e o agrupamento dos módulos (RNF19 não lista auditoria; arquitetura §14.1 a agrupa com notificações).
- **OPEN-45 - decisão necessária:** definir os valores de ação e de resultado, quais tentativas falhas ou negadas são auditáveis (por exemplo, autenticação malsucedida) e como representar o ator quando ele não é identificado.
- **OPEN-46 - decisão necessária:** definir a relação entre a operação auditada e seu registro quando a gravação do registro falha: desfazer a operação (tratando ambos como uma unidade atômica, em linha com RNF02) ou mantê-la e sinalizar a falta de evidência; e se o registro de falhas deve sobreviver ao desfazimento da operação.
- **OPEN-47 - decisão necessária:** definir se o registro guarda conteúdo além dos campos obrigatórios (por exemplo, valores anterior e novo de um palpite alterado, para que RNF16 mostre o que foi feito, e o identificador de correlação da requisição) e como ele se relaciona com os dados que já guardam momento (`Participacao.aceiteRegrasEm`, `Palpite.dataEnvio`) e com o histórico financeiro (`MovimentacaoFinanceira`, RNF10).

## 14. Definition of Done da Spec

A SPEC-002 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-13) estiverem implementados;
- todos os invariantes (INV-001 a INV-008) estiverem preservados;
- os testes derivados (TC-01 a TC-13) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada;
- as questões em aberto OPEN-31, OPEN-39, OPEN-45, OPEN-46 e OPEN-47 tiverem decisão humana antes da implementação das partes que dependem delas.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
