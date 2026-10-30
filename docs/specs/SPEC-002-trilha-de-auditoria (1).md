# SPEC-002 — Trilha de auditoria

- **Status:** revisada com as decisões aprovadas da proposta de resolução das questões em aberto; liberada para implementação após a SPEC-001.
- **Tipo:** Spec técnica (necessidade demonstrada nos artefatos de arquitetura; ver seção 2).
- **Baseline:** artefatos de `docs/` (incluindo `RegistroAuditoria` no modelo conceitual e `matriz-de-permissoes.md`), `docs/specs/mapa-de-specs.md`, `docs/specs/proposta-resolucao-questoes-em-aberto.md` e SPEC-001.
- **Escopo deste documento:** somente a SPEC-002. Nenhum código, tabela, endpoint de negócio ou escolha tecnológica nova.

---

## 1. Identificação

- **ID:** SPEC-002
- **Nome:** Trilha de auditoria
- **Objetivo:** disponibilizar a capacidade de registrar operações auditáveis com ator, ação, objeto afetado, data e hora em UTC, resultado e identificador de correlação, identificando o sistema como ator nas ações automáticas, mantendo os registros preservados, atômicos com a operação auditada e sem segredos.
- **Valor entregue:** evidência consultável de quem fez o quê e com qual resultado, reutilizada pelas Specs que executam operações auditáveis (autenticação, aceite das regras, palpites, decisões administrativas, sincronização de resultados, saída do bolão, assinatura e movimentações financeiras).

## 2. Rastreabilidade

- **RF:** nenhum. A Spec é habilitadora; consumidores diretos incluem RF31 e, indiretamente, RF02, RF14, RF15, RF20, RF21, RF23, RF32, RF33, RF34 e RF37.
- **RB:** RB65 (registro do aceite) e RB53 (registro das movimentações) como consumidoras do mecanismo.
- **RNF:**
  - RNF04 — rastreabilidade: campos do registro, sistema como ator, sem senhas, tokens ou dados de pagamento sensíveis.
  - RNF16 — não repúdio: evidência de palpites, aceites, decisões administrativas e movimentações; alteração não apaga o registro anterior; origem da movimentação.
  - RNF02 — somente a parte de que a operação auditada e seu registro de sucesso formam uma unidade atômica.
  - RNF01 — somente a parte de não armazenar senhas e segredos.
  - RNF20 — somente a parte de que falhas ao registrar geram registro técnico, sem segredos.
- **Caso de uso ou fluxo:** nenhum caso de uso específico. A necessidade vem de arquitetura consolidada §4.3, §4.7 e §7.7, da lista de módulos em §14.1 (notificações e auditoria) e do número de Specs que dependem do mesmo mecanismo.
- **Entidades do modelo conceitual:** `RegistroAuditoria` (atributos conceituais: ação, tipo e identificador do objeto, momento em UTC, resultado, origem, correlação e detalhes) e referência a `Usuario` como ator.
- **Drivers arquiteturais:** DA-03 (rastreabilidade) e DA-04 (restrição por identidade e papel; aqui, somente o registro do ator).
- **ADRs:** ADR-0001 (módulo interno do monólito), ADR-0005 (o backend é a autoridade das operações e de seus registros), ADR-0008 (convenções). Apoio: ADR-0003 (origem simulada identificada) e ADR-0007 (eventos de autenticação são auditáveis).
- **Justificativa de ser Spec técnica:** RNF04 e RNF16 valem transversalmente e não geram Spec própria por si. Esta Spec existe porque o mecanismo único de registro (campos, imutabilidade, ator sistema, atomicidade, ausência de segredos) é pré-requisito comum de pelo menos dez Specs posteriores, e a arquitetura reserva um módulo para ele (§14.1). Cada operação auditável concreta continua sendo especificada na Spec que a possui.

## 3. Escopo

### Incluído

1. Registrar uma operação auditável com ator, ação, objeto afetado (tipo e identificador), data e hora em UTC, resultado e identificador de correlação, mais detalhes estruturados não sensíveis quando a Spec proprietária os definir (por exemplo, valores anterior e novo de um palpite).
2. Resultado do registro ∈ {sucesso, falha, negado}.
3. Atribuir ao sistema o papel de ator nas ações executadas automaticamente, e registrar como "anônimo" o ator não identificado, sem guardar o e-mail tentado.
4. Preservar os registros: o módulo de auditoria não oferece atualização nem remoção de registros existentes, e uma alteração posterior de um objeto gera novo registro sem afetar o anterior.
5. Atomicidade: o registro de sucesso é gravado na mesma transação da operação auditada; se o registro falhar, a operação é desfeita. Registros de falha ou negativa são gravados em transação separada, depois do desfazimento, para sobreviverem a ele.
6. Auditar também as falhas ou negativas de: autenticação, operação administrativa negada por permissão, movimentação recusada ou com falha e sincronização com falha.
7. Garantir que o registro não contenha senhas, tokens, credenciais nem dados completos de pagamento.
8. Aceitar e preservar a origem de uma operação financeira (provedor de teste ou simulador) quando informada pelo módulo proprietário.
9. Consultar registros, somente em nível de backend, em ordem cronológica, filtrados por objeto afetado ou por ator. Sem expurgo no protótipo.
10. Sinalizar ao chamador e registrar tecnicamente (SPEC-001) a falha ao gravar um registro.

### Catálogo de operações auditáveis

O mecanismo atende ao catálogo abaixo; cada Spec proprietária declara e implementa o registro de suas operações e o exige em seus critérios de aceitação.

| Categoria | Spec proprietária |
| --- | --- |
| Cadastro; login, logout e recuperação de acesso | SPEC-003, SPEC-004 |
| Criação de bolão; convites (criação e revogação) | SPEC-007, SPEC-008 |
| Aceite das regras; solicitação, aprovação e rejeição de entrada | SPEC-009, SPEC-010 |
| Promoção a coadministrador | SPEC-011 |
| Palpite (registro e alteração) | SPEC-012 |
| Sincronização de resultados (ator sistema) | SPEC-013 |
| Saída do bolão | SPEC-017 |
| Assinatura (contratação, cancelamento, expiração) | SPEC-019, SPEC-020 |
| Movimentações financeiras | SPEC-018, SPEC-022, SPEC-024, SPEC-026 |
| Solicitação, decisão e processamento de devolução | SPEC-023, SPEC-024 |
| Encerramento do bolão (ator sistema) | SPEC-025 |
| Solicitação de premiação | SPEC-026 |

### Fora do escopo

- Implementar o registro de cada operação do catálogo: pertence à Spec proprietária.
- Exposição dos registros a usuários por interface, telas e autorização de consulta (a matriz de permissões não permite consulta por usuário no protótipo).
- Retenção, expurgo e exportação dos registros.
- Registros técnicos de diagnóstico (logs), que pertencem à SPEC-001.
- Histórico financeiro `MovimentacaoFinanceira` e sua consulta (SPEC-018), que continua sendo a fonte do histórico financeiro; o registro de auditoria apenas referencia seu identificador e copia a origem.
- Armazenamento do aceite dentro de `Participacao` (SPEC-009) e histórico exibido ao participante (SPEC-028): os campos de momento do domínio guardam o estado atual e a auditoria é o histórico.
- Mecanismos criptográficos de assinatura ou selagem dos registros; a baseline exige evidência auditável, não prova criptográfica.

## 4. Dependências

- **Specs anteriores:** SPEC-001 (persistência com execução atômica, módulos, registro técnico e correlação, testes sem credenciais externas).
- **Decisões arquiteturais:** ADR-0001, ADR-0005 e ADR-0008.
- **Obrigação para Specs posteriores:** cada Spec que introduzir uma operação auditável deve listá-la, exigir seu registro nos critérios de aceitação e definir as chaves de seus detalhes, sem valores sensíveis.

## 5. Comportamento esperado

### Pré-condições

- SPEC-001 operante (aplicação, persistência e registro técnico).
- Uma operação definida como auditável foi executada por um ator, que pode ser um usuário identificado, o sistema ou um ator não identificado.

### Fluxo principal

1. O módulo proprietário executa uma operação auditável dentro de uma transação.
2. Na mesma transação, ele solicita o registro informando ator, ação, objeto afetado, resultado de sucesso e, se definidos, origem e detalhes.
3. O sistema atribui a data e a hora em UTC e o identificador de correlação, e persiste o registro junto com a operação.
4. O registro fica disponível para consulta no backend por objeto afetado ou por ator, em ordem cronológica, sem conteúdo sensível.

### Fluxos alternativos

- **A1 — Ação automática:** o ator registrado é o sistema, não um usuário, e a correlação é a da execução da tarefa.
- **A2 — Operação financeira:** o registro preserva a origem informada (provedor de teste ou simulador).
- **A3 — Alteração posterior de um objeto já auditado:** um novo registro é criado e o anterior permanece inalterado.
- **A4 — Operação que falha ou é negada:** a operação é desfeita e, em transação separada, é gravado um registro com resultado de falha ou negado, nas categorias do item 6 do escopo.
- **A5 — Ator não identificado (por exemplo, autenticação malsucedida):** o ator é registrado como "anônimo" e o e-mail tentado não é guardado.

### Fluxos de exceção

- **E1 — Solicitação sem campo obrigatório:** é rejeitada e nenhum registro parcial é persistido.
- **E2 — Valor sensível presente no processamento da operação:** o valor não é persistido no registro nem nos detalhes.
- **E3 — Falha ao gravar o registro de sucesso:** a operação auditada é desfeita (nenhuma alteração permanece), a falha é sinalizada ao chamador e registrada tecnicamente com componente e identificador de correlação.
- **E4 — Falha ao gravar o registro de falha ou negativa:** a falha é registrada tecnicamente (SPEC-001) e não é silenciada.

### Pós-condições

- Registro persistido, completo, com data e hora em UTC, sem segredos, e coerente com o resultado da operação.
- Registros anteriores inalterados.
- Operação desfeita não deixa registro de sucesso.

## 6. Regras e invariantes

- **INV-001:** todo registro contém ator, ação, objeto afetado (tipo e identificador), data e hora em UTC e resultado (RNF04).
- **INV-002:** ação executada automaticamente tem o sistema como ator, nunca um usuário (RNF04).
- **INV-003:** o módulo de auditoria não oferece operação de atualização nem de remoção de registros existentes; uma alteração posterior gera novo registro e preserva o anterior (RNF16).
- **INV-004:** nenhum registro contém senha, token, credencial nem dados completos de pagamento (RNF04, RNF16, RNF01).
- **INV-005:** a data e a hora do registro são atribuídas pelo sistema em UTC; um valor fornecido pelo chamador não as substitui (RNF04, RNF16).
- **INV-006:** a origem informada de uma operação financeira é preservada como informada, e uma operação simulada nunca é registrada como originada pelo provedor (RNF16, RNF15).
- **INV-007:** a consulta retorna os registros em ordem cronológica e somente os que correspondem ao critério informado.
- **INV-008:** toda operação auditável concluída com sucesso gera exatamente um registro de sucesso correspondente, e uma operação desfeita não deixa registro de sucesso (RNF04, RNF02).
- **INV-009:** todo registro contém o identificador de correlação da requisição ou da execução da tarefa automática que o originou (SPEC-001).
- **INV-010:** o resultado de um registro é um de sucesso, falha ou negado.
- **INV-011:** um ator não identificado é registrado como "anônimo", sem guardar o e-mail tentado.
- **INV-012:** os detalhes de um registro só contêm chaves definidas pela Spec proprietária e nunca valores sensíveis.
- **INV-013:** falhas ou negativas de autenticação, de autorização administrativa, de movimentação financeira e de sincronização geram registro de resultado falha ou negado, em transação separada da operação desfeita.

## 7. Modelo de domínio envolvido

Entidade `RegistroAuditoria` (incluída no modelo conceitual):

- **Atributos conceituais:** ator (usuário identificado, sistema ou anônimo), ação (identificador estável do catálogo), objeto afetado (tipo e identificador), momento em UTC, resultado (sucesso, falha, negado), origem (provedor de teste ou simulador, em operações financeiras), correlação e detalhes (estruturados, não sensíveis).
- **Restrições:** somente inclusão (sem atualização ou remoção); nunca contém segredos; o objeto afetado é uma referência, não uma cópia.
- **Relacionamentos:** referência a `Usuario` como ator e a qualquer entidade como objeto afetado, sem alterá-las. `MovimentacaoFinanceira` continua sendo a fonte do histórico financeiro; o registro referencia seu identificador e copia a origem. `Participacao.aceiteRegrasEm` e `Palpite.dataEnvio` continuam guardando o estado atual.

Nenhum modelo físico é definido nesta Spec; a tabela correspondente é entregue como migração (ADR-0008) na implementação.

## 8. Impacto arquitetural

- **Módulos envolvidos:** "notificações e auditoria" (arquitetura §14.1) e a persistência e a transação da SPEC-001. Os módulos proprietários das operações o utilizam por uma interface explícita.
- **Fronteiras:**
  - Somente o backend cria registros; a interface não é autoridade para gerar evidência (ADR-0005).
  - O módulo de auditoria não depende da interface HTTP nem de SDKs de provedores externos (verificação estrutural da SPEC-001).
- **Integrações necessárias:** nenhuma.
- **Frontend:** nenhuma responsabilidade; não há tela de consulta.
- **Backend:** registro, preservação e consulta interna dos registros, atomicidade com a operação auditada e sinalização de falha de gravação.
- **ADRs que restringem a solução:** ADR-0001, ADR-0004 (SQLite com SQL direto e execução parametrizada), ADR-0005 e ADR-0008.

## 9. Contratos necessários

Contratos conceituais; nomes de campos e identificadores de ações são definidos na implementação e nas Specs proprietárias.

- **Registrar operação auditável**
  - Entrada: ator (usuário identificado, sistema ou anônimo), ação (do catálogo), objeto afetado (tipo e identificador), resultado, origem (opcional, operações financeiras) e detalhes (opcionais, não sensíveis).
  - Saída: registro persistido com data e hora em UTC e identificador de correlação atribuídos pelo sistema.
  - Semântica transacional: o registro de sucesso participa da transação do chamador; registros de falha e negado usam transação própria.
  - Erros: campo obrigatório ausente (solicitação rejeitada, nada persistido); falha de persistência (operação desfeita e falha sinalizada ao chamador e registrada tecnicamente).
- **Consultar registros**
  - Entrada: critério por objeto afetado ou por ator.
  - Saída: lista de registros em ordem cronológica; lista vazia quando nada corresponde.
  - Erros: critério inválido.
  - Acesso: somente o backend; nenhuma operação de usuário (matriz de permissões).
- **Relação com o registro técnico:** falhas de gravação seguem o contrato de registro técnico da SPEC-001.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como será verificado |
| --- | --- |
| RNF04 | Registrar operações de teste de usuário, sistema e anônimo e conferir campos, UTC e ausência de segredos (TC-01, TC-03, TC-04, TC-07, TC-14). A conferência de uma operação por categoria real do catálogo ocorre nas Specs proprietárias. |
| RNF16 | Registrar operações sucessivas sobre o mesmo objeto e conferir que o primeiro registro permanece idêntico; conferir a origem (TC-05, TC-06, TC-08). |
| RNF02 (parte) | Falhar a gravação do registro e conferir que a operação é desfeita (TC-15). |
| RNF01 (parte) | Inspeção dos registros e da resposta de erro em busca de senhas e segredos (TC-07). |
| RNF20 (parte) | Provocar falha de gravação e conferir o registro técnico com componente e correlação, sem segredos (TC-11). |

## 11. Critérios de aceitação

- **CA-01 (registro completo):** Dado uma operação auditável de teste executada por um usuário identificado, Quando ela é concluída com sucesso, Então existe um registro com ator, ação, objeto afetado, data e hora em UTC, resultado indicando sucesso e identificador de correlação.
- **CA-02 (resultado de falha):** Dado uma operação auditável de teste que falha, Quando ela é concluída, Então existe um registro cujo resultado indica falha.
- **CA-03 (ator sistema):** Dado uma ação automática de teste, Quando ela é registrada, Então o ator do registro é o sistema e não um usuário.
- **CA-04 (UTC atribuída pelo sistema):** Dado o registro de uma operação, Quando o registro é inspecionado, Então a data e a hora estão em UTC e correspondem ao instante do registro, e um valor de data e hora fornecido pelo chamador não prevalece.
- **CA-05 (imutabilidade):** Dado um registro existente, Quando se tenta alterá-lo ou removê-lo por qualquer operação oferecida pelo módulo de auditoria, Então nenhuma alteração é possível e o registro permanece idêntico.
- **CA-06 (preservação do histórico):** Dado um objeto que já possui um registro, Quando uma nova operação auditável incide sobre o mesmo objeto, Então existem dois registros e o primeiro permanece idêntico.
- **CA-07 (sem segredos):** Dado uma operação de teste cujo processamento envolve senha, token e dados completos de cartão, Quando o registro é gerado, Então nenhum campo do registro, inclusive os detalhes, contém esses valores.
- **CA-08 (origem da operação):** Dado uma operação financeira de teste com origem informada como simulador, Quando ela é registrada, Então o registro mostra a origem simulador e não aparece como originada pelo provedor; e o mesmo vale para a origem provedor de teste.
- **CA-09 (campos obrigatórios):** Dado uma solicitação de registro sem ator, ação, objeto afetado ou resultado, Quando ela é enviada, Então é rejeitada e nenhum registro parcial é persistido.
- **CA-10 (consulta):** Dado registros de objetos e atores diferentes, Quando a consulta é feita por um objeto ou por um ator, Então são retornados somente os registros correspondentes, em ordem cronológica.
- **CA-11 (falha de gravação por indisponibilidade):** Dado que a persistência está indisponível no momento do registro, Quando se tenta registrar uma operação, Então a falha é sinalizada ao chamador e registrada tecnicamente com componente e identificador de correlação, sem segredos.
- **CA-12 (cobertura por sucesso):** Dado uma operação auditável de teste concluída com sucesso, Quando se consultam os registros do objeto afetado, Então há exatamente um registro correspondente a essa operação.
- **CA-13 (estrutura e testes offline):** Dado o módulo de auditoria e um ambiente sem credenciais externas e sem rede externa, Quando a verificação estrutural da SPEC-001 e a suíte desta Spec são executadas, Então o módulo não depende da interface HTTP nem de SDK de provedor e todos os testes passam.
- **CA-14 (atomicidade com a operação):** Dado uma operação auditável de teste cujo registro de sucesso falha ao ser gravado, Quando ela é executada, Então nenhuma alteração da operação permanece persistida e nenhum registro de sucesso existe.
- **CA-15 (registro de falha sobrevive ao desfazimento):** Dado uma operação de teste desfeita por falha, Quando o desfazimento termina, Então existe um registro com resultado falha, gravado em transação separada.
- **CA-16 (ator anônimo):** Dado uma tentativa de autenticação malsucedida de teste, Quando ela é registrada, Então o ator é "anônimo" e o e-mail tentado não aparece em nenhum campo do registro.
- **CA-17 (negado por permissão):** Dado uma operação administrativa de teste negada por permissão, Quando ela é concluída, Então existe um registro com resultado negado e nenhuma alteração do objeto.
- **CA-18 (detalhes não sensíveis):** Dado uma operação de teste que informa detalhes com chave não prevista ou valor sensível, Quando o registro é gerado, Então a chave não prevista é rejeitada ou omitida e o valor sensível não é persistido.

## 12. Casos de teste derivados

Lista mínima; os testes não são implementados nesta etapa.

| ID | Cobre | Descrição |
| --- | --- | --- |
| TC-01 | CA-01, INV-001, INV-009 | Registrar operação de teste de um usuário e conferir os campos, inclusive correlação. |
| TC-02 | CA-02, INV-010 | Registrar operação de teste com falha e conferir o resultado de falha. |
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
| TC-14 | CA-16, INV-011 | Simular autenticação malsucedida e varrer o registro em busca do e-mail tentado. |
| TC-15 | CA-14, INV-008 | Forçar falha na gravação do registro de sucesso e conferir que a operação foi desfeita e que não há registro de sucesso. |
| TC-16 | CA-15, INV-013 | Desfazer uma operação por falha e conferir o registro de falha em transação separada. |
| TC-17 | CA-17, INV-013 | Negar uma operação administrativa por permissão e conferir o registro negado sem alteração do objeto. |
| TC-18 | CA-18, INV-012 | Informar detalhes com chave não prevista e com valor sensível e conferir o resultado. |

## 13. Questões em aberto

### Decisões incorporadas (proposta aprovada)

| OPEN | Decisão incorporada nesta Spec |
| --- | --- |
| OPEN-08 | Matriz de permissões publicada; nenhum papel consulta registros de auditoria no protótipo. |
| OPEN-31 | Catálogo da seção 3, entidade `RegistroAuditoria`, consulta só no backend, sem expurgo. |
| OPEN-39 | Auditoria abrigada no módulo "notificações e auditoria". |
| OPEN-45 | Resultado ∈ {sucesso, falha, negado}; categorias de falhas auditadas; ator anônimo sem e-mail tentado. |
| OPEN-46 | Operação e registro de sucesso na mesma transação; registros de falha e negado em transação separada. |
| OPEN-47 | Correlação e detalhes estruturados não sensíveis; domínio guarda o estado atual e a auditoria, o histórico; `MovimentacaoFinanceira` segue como fonte financeira. |

### Em aberto

Nenhuma.

## 14. Definition of Done da Spec

A SPEC-002 estará concluída quando:

- todos os critérios de aceitação (CA-01 a CA-18) estiverem implementados;
- todos os invariantes (INV-001 a INV-013) estiverem preservados;
- os testes derivados (TC-01 a TC-18) estiverem aprovados;
- os RNFs aplicáveis tiverem sido verificados;
- não existir divergência conhecida entre a implementação e esta Spec;
- toda divergência em relação à baseline tiver sido explicitamente analisada, com decisão humana registrada.

Se durante a implementação surgir conflito entre código, esta Spec ou os documentos de modelagem, a divergência será registrada e a equipe escolherá entre corrigir a implementação para respeitar a baseline ou propor alteração da baseline para aprovação humana.
