# SPEC-030 — Premiação por pódio

- **Status:** aprovada em 24/11/2026. As decisões de negócio foram tomadas pela equipe nesta data (seção 13); liberada para implementação após as SPEC-007, SPEC-025 e SPEC-026.
- **Tipo:** Spec funcional que estende a criação do bolão (SPEC-007), o resultado final (SPEC-025) e a premiação (SPEC-026).
- **Baseline:** artefatos de `docs/` (com RB51 complementada pela RB69 nesta data), `docs/mapa-de-specs (1).md` e SPEC-001 a SPEC-029.
- **Escopo deste documento:** somente a SPEC-030. As alterações em Specs anteriores estão na seção 14.

---

## 1. Identificação

- **ID:** SPEC-030
- **Nome:** Premiação por pódio
- **Objetivo:** permitir que quem cria o bolão escolha, entre modelos prontos, se o montante arrecadado vai todo para o 1º lugar ou é dividido entre 1º, 2º e 3º lugares em porcentagens fixas; calcular e pagar a parte de cada premiado.
- **Valor entregue:** bolões maiores premiam mais gente e mantêm o interesse de quem não está na liderança; a divisão é conhecida desde a criação e não pode mudar.

## 2. Rastreabilidade

- **RF:** RF09 (criação com modelo de premiação), RF11 (consulta das regras), RF36 (resultado final), RF37 (solicitação da premiação).
- **RB:** RB51 (modelo definido na criação e imutável), **RB69 (modelos disponíveis e divisão, nova)**, RB63 (elegibilidade), RB64 (regras imutáveis).
- **RNF:** RNF09 (sem pagamento duplicado), RNF15 (ambiente de teste), RNF16 (auditoria), RNF11 (cada premiado vê só a própria parte).
- **Caso de uso:** UC03 (criação do bolão) e UC07 (premiação).
- **Entidades:** `Bolao` (modelo de premiação), `ClassificacaoFinal` (posições congeladas), `MontantePremiacao` e **`PartePremiacao` (nova)**, `MovimentacaoFinanceira` (repasse).
- **ADRs:** ADR-0003 (premiação simulada enquanto o repasse não for validado no sandbox), ADR-0005.

## 3. Escopo

### Incluído

- Quatro modelos de premiação na criação do bolão, escolhidos em uma lista.
- Exibição do modelo escolhido nas regras do bolão, no convite e no resultado final.
- Cálculo das partes de todos os premiados a partir da classificação final congelada, com as regras de empate e de posições vazias da seção 6.
- Congelamento, na primeira solicitação, do montante **e da parte de cada premiado**.
- Solicitação da premiação por qualquer premiado (não só o 1º lugar), com o mesmo fluxo da SPEC-026.

### Fora do escopo

- Porcentagens digitadas por quem cria o bolão.
- Premiar mais de três posições.
- Trocar o modelo depois da criação (proibido pela RB51).
- Mudar quem é "vencedor" no resultado final: o vencedor continua sendo o 1º lugar (SPEC-025); o pódio só muda quem recebe premiação.

## 4. Dependências

- **SPEC-007:** criação do bolão e regras imutáveis.
- **SPEC-025:** classificação final congelada, com posições em que empatados ocupam a mesma posição e a seguinte é pulada (1º, 1º, 3º).
- **SPEC-026:** solicitação, processamento, nova tentativa e auditoria da premiação.

## 5. Comportamento esperado

### 5.1 Criação

- O formulário mostra a lista "Modelo de premiação" com os quatro modelos da RB69 e, abaixo, uma linha explicando o modelo selecionado.
- O padrão continua "Vencedor leva tudo".
- O backend aceita só os quatro valores; qualquer outro é rejeitado (400, campo `prizeModel`).

### 5.2 Consulta das regras e resultado final

- As regras do bolão e a tela do convite mostram o nome do modelo (por exemplo, "Pódio: 1º 50% · 2º 30% · 3º 20%").
- O resultado final do bolão encerrado marca, além do vencedor, os **premiados** e a porcentagem do montante que cabe a cada um.

### 5.3 Premiação

- **Fluxo principal:** igual à SPEC-026, trocando "vencedor" por "premiado": cada premiado vê a própria parte, solicita, e o repasse fica pendente até a confirmação.
- **Primeira solicitação do bolão:** o sistema apura o montante, calcula a parte de todos os premiados e grava tudo de uma vez, numa única transação. Solicitações seguintes, de qualquer premiado, usam as partes gravadas.
- **A1 (não premiado):** quem não tem parte recebe recusa (403), auditada como hoje.
- **A2 (sem premiado):** quando ninguém elegível fez pontos, não há premiação (mesmo comportamento atual de "sem vencedor").
- **Administração:** vê a lista de premiados com a colocação e o estado de cada um, sem valores do provedor (OPEN-148).

## 6. Regras e invariantes

- **INV-001 (modelos):** os modelos e suas porcentagens por colocação são:

  | Modelo | 1º | 2º | 3º |
  | --- | --- | --- | --- |
  | Vencedor leva tudo (`winner_takes_all`) | 100% | — | — |
  | Pódio 50/30/20 (`podium_50_30_20`) | 50% | 30% | 20% |
  | Pódio 60/30/10 (`podium_60_30_10`) | 60% | 30% | 10% |
  | Pódio 70/20/10 (`podium_70_20_10`) | 70% | 20% | 10% |

- **INV-002 (quem pode ser premiado):** só participações elegíveis da classificação final congelada (RB63) com pontuação maior que zero.
- **INV-003 (colocações):** os elegíveis com pontos, em ordem de posição, ocupam colocações sequenciais; empatados na mesma posição formam um grupo que ocupa tantas colocações quantos forem seus membros. Exemplo: posições 1, 2, 2, 4 ocupam as colocações 1, 2–3 e 4.
- **INV-004 (empate):** um grupo recebe a soma das porcentagens das colocações premiadas que ocupa, dividida por igual entre seus membros. Exemplo com 50/30/20 e dois empatados em 2º: cada um fica com (30% + 20%) ÷ 2 = 25%. Um grupo que começa depois da 3ª colocação não recebe nada.
- **INV-005 (colocações vazias):** se menos de três colocações premiadas forem ocupadas, a porcentagem que sobrar é repartida entre os premiados na proporção das porcentagens que já receberam. Exemplo com 50/30/20 e só dois premiados: 1º fica com 50/80 = 62,5% e 2º com 30/80 = 37,5%. Nenhum valor fica retido no bolão.
- **INV-006 (centavos):** cada parte é arredondada para baixo em centavos inteiros; os centavos restantes são distribuídos um por vez, na ordem da classificação final (mesma regra de OPEN-144). A soma das partes é sempre igual ao montante.
- **INV-007 (congelamento):** montante e partes são gravados uma única vez por bolão, na primeira solicitação, e nunca mudam (estende INV-004 da SPEC-026).
- **INV-008 (compatibilidade):** "Vencedor leva tudo" produz exatamente o resultado atual (co-vencedores dividem por igual). Bolões cuja premiação já foi fixada antes desta Spec, sem partes gravadas, continuam usando a divisão igual entre os vencedores.
- **INV-009 (imutabilidade):** o modelo é gravado na criação e protegido como as demais regras (RB51, RB64).
- **INV-010 (valor pelo servidor):** o cliente nunca informa valor nem porcentagem (INV-003 da SPEC-026).

## 7. Modelo de domínio envolvido

- **Bolao:** `modelo de premiação` passa a aceitar os quatro valores da INV-001.
- **PartePremiacao (nova):** bolão, participação, colocação inicial do grupo, porcentagem efetiva (após empate e redistribuição) e valor em centavos. Criada junto com o montante e imutável.
- **MovimentacaoFinanceira:** repasse com o valor da parte gravada.

## 8. Impacto técnico

- **Banco:**
  - migration nova que reconstrói a tabela `pools` só para ampliar a checagem de `prize_model`, preservando dados, índices e gatilhos de imutabilidade (técnica das migrations de reconstrução da SPEC-020);
  - tabela nova `pool_prize_shares`, ligada a `pool_prize_pools`, com gatilhos que impedem alteração e exclusão;
  - testada numa cópia do banco atual e num banco vazio.
- **Backend:**
  - `pools-participations`: lista de modelos e validação;
  - `prize-payout`: cálculo das partes (função pura e testável), gravação junto com o montante, elegibilidade por parte em vez de "vencedor", lista de premiados para a administração;
  - `pool-closing`: resultado final informa o modelo e, para cada linha, se é premiado e a porcentagem efetiva.
- **Frontend:** rótulos dos modelos, explicação no formulário de criação, marca "premiado" com a porcentagem no resultado final, textos da tela de premiação ("premiado" em vez de "vencedor" onde couber).
- **Notificações e histórico:** sem mudança de regra; a notificação de premiação paga já vale para qualquer premiado.

## 9. Contratos

| Operação | Mudança |
| --- | --- |
| Criar bolão | `prizeModel` aceita `winner_takes_all`, `podium_50_30_20`, `podium_60_30_10`, `podium_70_20_10`. |
| Consultar regras / convite | `prizeModel` com um dos quatro valores (o cliente traduz o rótulo). |
| Resultado final | Ganha `prizeModel` e, por linha, `awarded` (booleano) e `prizePercent` (porcentagem efetiva, com até duas casas, ou `null`). |
| Consultar premiação | `state`, `shareCents` e o restante como hoje; a lista da administração passa a se chamar `awardees`, com `name`, `place`, `state` e `isRequester`. |
| Solicitar premiação | Sem mudança de entrada; agora permitida a qualquer premiado. |

## 10. Testes

- **TC-01:** cálculo puro das partes para cada modelo, sem empate, com 3 ou mais premiados.
- **TC-02:** empate no 1º (dois e três empatados), empate no 2º, empate no 3º com quatro pessoas.
- **TC-03:** menos de três premiados (um e dois) e redistribuição proporcional.
- **TC-04:** centavos: soma das partes igual ao montante e resto na ordem da classificação.
- **TC-05:** "vencedor leva tudo" igual ao resultado anterior (regressão da SPEC-026).
- **TC-06:** criação aceita os quatro modelos e recusa outro valor; o modelo não pode ser alterado.
- **TC-07:** o 2º e o 3º lugares solicitam e recebem a própria parte; o 4º recebe 403.
- **TC-08:** partes gravadas na primeira solicitação não mudam com devoluções ou solicitações posteriores; solicitações simultâneas não duplicam.
- **TC-09:** bolão com montante fixado antes desta Spec continua pagando pela divisão igual.
- **TC-10:** resultado final mostra premiados e porcentagens; a administração vê a lista de premiados sem valores.
- **TC-11 (frontend):** rótulos, explicação do modelo e marcação de premiado.

## 11. Critérios de aceitação

- **CA-01:** Dado o formulário de criação, Quando o usuário abre "Modelo de premiação", Então vê os quatro modelos e a explicação do selecionado.
- **CA-02:** Dado um bolão criado com um pódio, Quando qualquer membro consulta as regras, Então vê o modelo e as porcentagens.
- **CA-03:** Dado um bolão encerrado com pódio e três premiados sem empate, Quando cada um solicita, Então cada repasse tem o valor da sua porcentagem.
- **CA-04:** Dado empate em uma colocação premiada, Quando as partes são calculadas, Então os empatados dividem por igual a soma das porcentagens das colocações que ocupam.
- **CA-05:** Dado menos de três premiados, Quando as partes são calculadas, Então todo o montante é repartido entre eles, na proporção das porcentagens.
- **CA-06:** Dado um participante sem parte, Quando solicita, Então recebe recusa e nada é registrado além da auditoria.
- **CA-07:** Dado um bolão "vencedor leva tudo", Quando a premiação é solicitada, Então o resultado é o mesmo da SPEC-026.
- **CA-08:** Dado partes já gravadas, Quando qualquer premiado consulta ou solicita depois, Então os valores não mudam.

## 12. Riscos

- A reconstrução da tabela `pools` toca a tabela mais referenciada do sistema; mitigação: técnica já usada, verificação de chaves estrangeiras antes do commit e teste em cópia do banco.

## 13. Decisões tomadas pela equipe (24/11/2026)

| Tema | Decisão |
| --- | --- |
| Porcentagens | Valores prontos (50/30/20, 60/30/10, 70/20/10), além do "vencedor leva tudo"; quem cria o bolão escolhe um. |
| Armazenamento | Cada divisão é um valor próprio do modelo de premiação (opção A). |
| Empate | Os empatados somam as porcentagens das colocações que ocupam e dividem por igual. |
| Colocações vazias | A sobra é repartida entre os premiados, proporcionalmente. |

## 14. Alterações em Specs anteriores

- **SPEC-007:** INV-009 e o passo 4 do fluxo deixam de dizer que há um único modelo; passam a remeter à RB69 e a esta Spec (OPEN-13 reaberta e resolvida aqui).
- **SPEC-025:** o resultado final passa a informar o modelo, os premiados e a porcentagem de cada um. O vencedor continua sendo o 1º lugar.
- **SPEC-026:** "vencedor" passa a "premiado" na elegibilidade; INV-004 passa a congelar também a parte de cada premiado; a divisão por igual entre co-vencedores vira um caso particular da INV-004 desta Spec.

## 15. Definition of Done

A SPEC-030 estará concluída quando os critérios CA-01 a CA-08 estiverem implementados, os invariantes preservados, os testes TC-01 a TC-11 aprovados, a migration testada em cópia do banco e em banco vazio, e os documentos da seção 14, a RB69 e o mapa de specs estiverem atualizados.
