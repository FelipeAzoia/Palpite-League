# SPEC-026 — Solicitação e processamento da premiação

- **Status:** aprovada em 31/10/2026. As questões OPEN-142 a OPEN-150 foram resolvidas com a aprovação desta Spec, nos termos das propostas da seção 13.
- **Etapa:** Spec-Driven Development, geração de Spec individual. Nenhum código, banco de dados, endpoint ou tecnologia nova é definido aqui.
- **Fonte de verdade:** `mapa-de-specs.md` (aprovado) e artefatos de `docs/`.

> **Nota de rastreabilidade:** ao gerar esta Spec, o texto integral de RF37, RF31, RB51, RB52, RB53, RB63, do UC07 (passos 4 a 8 e exceções A3 a A7), das SPEC-018, 024 e 025 e a redação final das decisões aprovadas para OPEN-13, OPEN-22, OPEN-29 e OPEN-36 não estavam disponíveis. O conteúdo abaixo foi derivado do mapa de Specs, das Specs aprovadas nesta conversa e dos registros de OPEN-XX. Em especial, o modelo de premiação definido na criação do bolão (OPEN-13) não foi consultado: o cálculo da parte segue o que a baseline aprovada definir, e o que for proposto aqui só vale na ausência dessa definição. Tudo que depende desses textos está marcado como OPEN-XX, com proposta, para conferência (ver OPEN-142).

---

## 1. Identificação

- **ID:** SPEC-026
- **Nome:** Solicitação e processamento da premiação
- **Objetivo:** permitir que o vencedor elegível solicite sua parte da premiação, recusar duplicidade e inelegibilidade, manter o estado pendente até confirmação verificável e identificar claramente qualquer simulação.
- **Valor entregue:** fechamento do ciclo do bolão com a premiação definida na criação, sem pagamento duplicado e sem apresentar simulação como confirmação do provedor.

## 2. Rastreabilidade

| Tipo | Itens |
| --- | --- |
| RF | RF37, com registro conforme RF31 |
| RB | RB51, RB52, RB53, RB63; contexto: RB54 (vínculo da movimentação a usuário e operação), RB43 e RB23 (regras imutáveis do bolão) |
| RNF | RNF04, RNF09, RNF10, RNF15, RNF16; por extensão: RNF11 (acesso restrito, ver OPEN-142) |
| Caso de uso | UC07: passos 4 a 8 e exceções A3 a A7 (mapeamento exato a conferir, OPEN-142) |
| Entidades | Bolao, Participacao, MovimentacaoFinanceira (a Carteira é reservada, OPEN-22) |
| Drivers | DA-03 |
| ADRs | ADR-0003, ADR-0004. Estruturais herdadas da fundação: ADR-0001, ADR-0005, ADR-0006, ADR-0008 |

## 3. Escopo

**Incluído**

- Consulta, pelo vencedor, da situação e da parte da premiação do bolão encerrado.
- Solicitação da premiação pelo vencedor registrado no resultado final da SPEC-025, sem aprovação administrativa (UC07).
- Cálculo da parte do vencedor pelo backend, conforme o modelo de premiação imutável do bolão.
- Recusa de duplicidade e de inelegibilidade.
- Registro da movimentação de premiação como nova movimentação, com chave de operação idempotente.
- Envio ao provedor de teste ou ao simulador identificado, estados pendente, confirmada e recusada, e confirmação verificável.
- Nova tentativa somente após recusa, com consulta do estado anterior.
- Identificação visível de simulação e registro de que a integração de premiação permanece não atendida enquanto não houver validação real.

**Fora do escopo**

- Encerramento do bolão, classificação final e determinação dos vencedores (SPEC-025).
- Definição do modelo de premiação na criação do bolão (SPEC-007).
- Núcleo financeiro, porta de pagamentos e histórico financeiro próprio (SPEC-018).
- Devoluções (SPEC-023 e SPEC-024), apenas lidas quando afetam o montante.
- Notificação de conclusão da premiação (SPEC-027) e histórico dos bolões (SPEC-028).
- Alteração do resultado final, do ranking ou da participação.
- Saldo ou carteira simulada (OPEN-22).
- Repasse real com dinheiro de verdade (vedado pela ADR-0003).

## 4. Dependências

- **SPEC-025:** bolão encerrado, vencedores e ausência de vencedor registrados e congelados.
- **SPEC-018:** registro idempotente, porta de pagamentos, tratador por tipo, conferência de pendentes e simulador identificado.
- **Leitura de SPEC-022 e SPEC-024:** taxas confirmadas e devoluções, quando o montante depende delas (OPEN-13, OPEN-144).
- **Transitivas:** SPEC-001, 002, 003, 007, 010, 013 (agendador), 017.
- **Decisões:** ADR-0003 (provedor em teste, simulador sempre identificado, sem repetição automática de repasse) e ADR-0004. A integração real de premiação depende de validação de sandbox ainda não executada (OPEN-29); até lá, o simulador identificado nunca conta como integração atendida.

## 5. Comportamento esperado

### 5.1 Consulta da premiação

- **Pré-condição:** usuário autenticado e participante do bolão encerrado.
- **Fluxo principal:** o vencedor vê sua parte da premiação, o estado (disponível para solicitar, em processamento, concluída ou recusada), a indicação de simulação, quando houver, e a indicação de que a integração de premiação não está atendida (OPEN-146).
- **Alternativo A1 (não vencedor):** o participante vê que não há premiação a solicitar para ele; os vencedores continuam consultáveis pela SPEC-025.
- **Alternativo A2 (ausência de vencedor ou sem valor a pagar):** o sistema informa que não há premiação a pagar (OPEN-150).
- **Exceção E1:** usuário não autenticado ou sem vínculo: acesso negado, sem revelar a existência do bolão.

### 5.2 Solicitação da premiação

- **Pré-condições:** usuário autenticado, bolão encerrado, usuário registrado como vencedor no resultado final, sem premiação ativa (pendente ou confirmada) e montante apurável.
- **Fluxo principal:**
  1. O vencedor solicita sua parte da premiação.
  2. O sistema valida no backend a condição de vencedor, a ausência de duplicidade e a apurabilidade do montante.
  3. O sistema obtém o montante fixado do bolão (ou o apura e fixa na primeira solicitação, OPEN-144) e calcula a parte do vencedor em centavos inteiros em BRL.
  4. O sistema registra a movimentação de premiação em estado pendente, com chave de operação que inclui o número da tentativa, vinculada a usuário, bolão, participação e operação, e registra a auditoria.
  5. O sistema envia a premiação ao provedor de teste ou ao simulador identificado, pela porta de pagamentos (OPEN-145).
  6. A premiação permanece pendente até confirmação verificável.
- **Pós-condição:** movimentação de premiação pendente registrada; a premiação não é apresentada como concluída.

### 5.3 Confirmação ou recusa

- **Gatilho:** retorno do provedor e/ou conferência de pendentes (SPEC-018), com resultado verificável (OPEN-145).
- **Confirmação:** a movimentação passa a confirmada, o estado exibido passa a "concluída" (com a indicação de simulação, quando for o caso) e a auditoria é registrada, na mesma transação.
- **Recusa:** a movimentação passa a recusada, o estado exibido passa a "recusada" e nada é repetido automaticamente.

### 5.4 Fluxos alternativos e de exceção

- **A3 (inelegibilidade):** usuário que não é vencedor, bolão não encerrado ou ausência de vencedor: a solicitação é recusada, sem registro de movimentação.
- **A4 (duplicidade):** já existe premiação pendente ou confirmada para o vencedor: conflito, nada é criado.
- **A5 (recusa pelo provedor):** a movimentação fica recusada e o vencedor pode solicitar nova tentativa (A8).
- **A6 (pendente):** o estado permanece pendente; conferência e retorno resolvem; nenhuma nova movimentação é criada.
- **A7 (indisponibilidade, tempo esgotado ou resposta ambígua):** como não se sabe se o provedor processou o repasse, o estado permanece pendente, nunca recusada nem concluída por suposição (OPEN-147).
- **A8 (nova tentativa):** só após recusa confirmada, solicitada pelo próprio vencedor; antes de criar a nova movimentação o sistema consulta o estado da anterior e, se estiver pendente ou confirmada, não cria outra.
- **A9 (confirmação repetida):** retorno ou conferência repetidos da mesma operação não têm efeito adicional.
- **A10 (montante ainda não apurável):** se a origem do montante depende de taxas e há devolução aprovada ainda em processamento no bolão, a solicitação recebe conflito de "aguardando devoluções" e nada é criado (OPEN-144).
- **A11 (valor divergente do provedor):** resposta com valor diferente do calculado não confirma a premiação: permanece pendente e sinalizada como inconsistente.
- **E2:** tentativa de solicitar premiação em nome de outro usuário, inclusive pela administração: negada.

## 6. Regras e invariantes

- **INV-001:** só o vencedor registrado no resultado final congelado da SPEC-025 pode solicitar a premiação, e só para si (RB63, RF37).
- **INV-002:** cada vencedor tem no máximo uma premiação ativa (pendente ou confirmada) por bolão; a solicitação duplicada é recusada (UC07).
- **INV-003:** a parte é calculada pelo backend a partir do modelo de premiação imutável do bolão (RB51) e do resultado final; o cliente não informa valor, e a soma das partes nunca excede o montante apurado.
- **INV-004:** o montante é apurado e fixado uma única vez por bolão, de modo que co-vencedores dividam o mesmo montante (OPEN-144).
- **INV-005:** o estado pendente permanece até confirmação verificável; indisponibilidade, tempo esgotado ou resposta ambígua nunca produzem "recusada" nem "concluída" por suposição (ADR-0003).
- **INV-006:** nova tentativa só após recusa confirmada, com consulta ao estado da anterior e número de tentativa seguinte; não há repetição automática de repasse (ADR-0003, OPEN-84).
- **INV-007:** a premiação é uma nova movimentação, vinculada a usuário, bolão e operação, registrada de forma auditável (RB53, RB54, RF31).
- **INV-008:** a confirmação é idempotente: repetir a mesma confirmação não duplica movimentação nem efeitos (RNF09).
- **INV-009:** simulação é sempre identificada, nunca apresentada como confirmação do provedor e nunca conta como integração de premiação atendida; o registro dessa não atendida é mantido (ADR-0003, OPEN-29, RNF15).
- **INV-010:** sem dinheiro real e sem credenciais de produção; segredos fora do repositório (RNF15, ADR-0008).
- **INV-011:** datas em UTC e auditoria com ator, ação, objeto e resultado, sem segredos (RNF04, RNF16).
- **INV-012:** o registro do resultado e a atualização do estado exibido ocorrem na mesma transação.
- **INV-013:** as regras são validadas no backend (ADR-0005); o frontend não decide elegibilidade, valor nem estado.
- **INV-014:** esta Spec não altera resultado final, ranking, participação nem devoluções (SPEC-025, SPEC-024).
- **INV-015:** não existe aprovação administrativa da premiação: a administração não solicita, bloqueia nem decide em nome do vencedor (UC07, OPEN-30).

## 7. Modelo de domínio envolvido

- **Bolao:** estado encerrado, modelo de premiação imutável (RB51) e resultado final (vencedores ou ausência); somente leitura aqui.
- **Participacao:** indicação de vencedor do resultado final da SPEC-025; somente leitura.
- **MovimentacaoFinanceira:** tipo premiação, valor em centavos inteiros em BRL, estado (pendente, confirmada, recusada), número da tentativa, chave de operação, referência ao provedor ou simulador, vínculo com usuário, bolão e participação, indicador de simulação (OPEN-84, OPEN-85).
- **Montante apurado do bolão:** valor fixado uma vez por bolão, do qual derivam as partes dos vencedores (OPEN-144).
- **Relacionamentos:** cada vencedor tem uma ou mais movimentações de premiação (tentativas), no máximo uma ativa por vez.
- A Carteira é reservada e não é usada (OPEN-22). Sem modelo físico nesta Spec (OPEN-40).

## 8. Impacto arquitetural

- **Módulos:** premiação (elegibilidade, cálculo, estado exibido), núcleo financeiro (registro, idempotência, porta de pagamentos, tratador de premiação, conferência de pendentes), agendador (conferência de pendentes).
- **Fronteiras:** a SPEC-025 decide quem vence; a SPEC-026 só paga. O núcleo financeiro não conhece regras do bolão.
- **Integração:** provedor de pagamentos via adaptador isolado (ADR-0003); repasse real condicionado à validação de sandbox (OPEN-29); até lá, simulador identificado.
- **Backend:** valida elegibilidade, duplicidade e valor, registra, envia, confere e atualiza estados em transação.
- **Frontend:** tela da premiação do bolão encerrado, ação "solicitar premiação" para o vencedor, estados, indicação de simulação e de integração não atendida.
- **ADRs que restringem:** ADR-0003 (sem repetição automática, simulador identificado, premiação validada por operação), ADR-0004, ADR-0005, ADR-0006, ADR-0001, ADR-0008.

## 9. Contratos necessários (conceituais)

| Operação | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| Consultar premiação do bolão | usuário autenticado e bolão encerrado | para o vencedor: parte, estado, indicação de simulação e de integração não atendida; para os demais: ausência de premiação a solicitar | não autenticado; sem vínculo ou bolão inexistente (mesma resposta); bolão não encerrado (conflito de estado) |
| Solicitar premiação (inclui nova tentativa) | usuário autenticado e bolão | movimentação pendente (identificador, valor, tentativa), indicação de simulação | não autenticado; não vencedor; bolão não encerrado; duplicidade; aguardando devoluções |
| Confirmar ou recusar premiação (interna) | referência da operação e resultado verificável | transição da movimentação e do estado exibido | operação desconhecida; resultado inconsistente ou valor divergente |
| Conferir pendentes (interna, agendada) | movimentações de premiação pendentes | estados atualizados | provedor indisponível: mantém pendente |

- Formato dos erros e códigos: conforme OPEN-53 (SPEC-003) e acesso conforme OPEN-65.
- Contrato de persistência e do provedor: **OPEN-145**.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como é verificado |
| --- | --- |
| RNF04 | Teste de datas e registros em UTC. |
| RNF09 | Teste de confirmação repetida e de conferência sem duplicidade de premiação ou de efeitos. |
| RNF10 | Teste de que cada tentativa gera registro consultável, vinculado a usuário, bolão e operação. |
| RNF15 | Revisão e teste de ausência de dinheiro real, credenciais de produção e segredos em registros e respostas. |
| RNF16 | Teste de auditoria de solicitação, confirmação, recusa, pendência por indisponibilidade e nova tentativa. |
| RNF11 (extensão) | Teste de que só o vencedor vê os detalhes da própria premiação e de que a administração vê só o estado (OPEN-148). |

## 11. Critérios de aceitação

- **CA-01 (solicitar):** Dado um vencedor de bolão encerrado sem premiação ativa, Quando solicita a premiação, Então é registrada uma movimentação pendente com a parte calculada pelo backend.
- **CA-02 (valor):** Dado qualquer solicitação, Quando a movimentação é criada, Então o valor é o calculado pelo backend e qualquer valor enviado pelo cliente é ignorado ou rejeitado.
- **CA-03 (não vencedor):** Dado um participante que não é vencedor, Quando solicita, Então recebe recusa e nada é registrado.
- **CA-04 (bolão não encerrado):** Dado bolão ativo, Quando o usuário solicita, Então recebe conflito e nada é registrado.
- **CA-05 (ausência de vencedor):** Dado bolão encerrado sem vencedor, Quando um participante tenta solicitar, Então recebe recusa e nada é registrado.
- **CA-06 (duplicidade):** Dado premiação pendente ou confirmada para o vencedor, Quando solicita de novo, Então recebe conflito e nada é criado.
- **CA-07 (concorrência):** Dado duas solicitações simultâneas do mesmo vencedor, Quando processadas, Então apenas uma movimentação é criada.
- **CA-08 (confirmação):** Dado uma premiação pendente, Quando o provedor confirma de forma verificável, Então a movimentação fica confirmada e o estado exibido passa a "concluída".
- **CA-09 (recusa):** Dado uma premiação pendente, Quando o provedor recusa, Então a movimentação fica recusada e nada é repetido automaticamente.
- **CA-10 (pendente):** Dado uma premiação pendente, Quando consultada, Então aparece como "em processamento" e nenhuma nova movimentação é criada.
- **CA-11 (indisponibilidade):** Dado que o provedor está indisponível, expira ou responde de forma ambígua, Quando o envio é feito, Então a premiação permanece pendente, nunca recusada nem concluída, e a conferência posterior a resolve.
- **CA-12 (nova tentativa):** Dado uma premiação recusada, Quando o vencedor solicita nova tentativa, Então o sistema consulta o estado anterior e cria nova movimentação com número de tentativa seguinte.
- **CA-13 (idempotência):** Dado a mesma confirmação recebida mais de uma vez, Quando processada, Então não há efeito adicional.
- **CA-14 (co-vencedores):** Dado mais de um vencedor, Quando cada um solicita, Então as partes derivam do mesmo montante fixado e a soma das partes não excede o montante.
- **CA-15 (aguardando devoluções):** Dado montante dependente das taxas e devolução aprovada em processamento no bolão, Quando um vencedor solicita, Então recebe conflito de "aguardando devoluções" e nada é criado.
- **CA-16 (valor divergente):** Dado resposta do provedor com valor diferente do calculado, Quando recebida, Então a premiação não é confirmada, permanece pendente e fica sinalizada.
- **CA-17 (simulador):** Dado premiação feita pelo simulador, Quando exibida ou registrada, Então aparece identificada como simulação, inclusive quando "concluída", nunca como confirmação do provedor, e a integração de premiação consta como não atendida.
- **CA-18 (acesso):** Dado usuário sem vínculo com o bolão, Quando consulta, Então recebe a mesma resposta de bolão inexistente.
- **CA-19 (sem administração):** Dado administrador ou coadministrador que não é o vencedor, Quando tenta solicitar ou bloquear a premiação de outro, Então é negado.
- **CA-20 (resultado inalterado):** Dado qualquer solicitação, confirmação ou recusa, Quando concluída, Então resultado final, ranking, participações e devoluções permanecem inalterados.
- **CA-21 (auditoria e segredos):** Dado qualquer solicitação, resultado ou nova tentativa, Quando concluído, Então existe registro com ator, ação, objeto, instante UTC e resultado, sem segredos.

## 12. Casos de teste derivados

Não implementar nesta etapa.

- **CT-01:** solicitação válida do vencedor único (CA-01, INV-001).
- **CT-02:** valor enviado pelo cliente ignorado ou rejeitado (CA-02, INV-003).
- **CT-03:** não vencedor, bolão ativo e bolão sem vencedor recusados (CA-03, CA-04, CA-05).
- **CT-04:** duplicidade e solicitações simultâneas (CA-06, CA-07, INV-002).
- **CT-05:** confirmação verificável leva a "concluída" (CA-08).
- **CT-06:** recusa não repete automaticamente (CA-09, INV-006).
- **CT-07:** premiação pendente consultada e conferida (CA-10).
- **CT-08:** indisponibilidade, tempo esgotado e resposta ambígua mantêm pendente (CA-11, INV-005).
- **CT-09:** nova tentativa após recusa, com consulta da anterior e número seguinte (CA-12).
- **CT-10:** nova tentativa com premiação pendente ou confirmada recusada (INV-002, INV-006).
- **CT-11:** confirmação repetida sem efeito adicional (CA-13, INV-008).
- **CT-12:** co-vencedores dividem o mesmo montante sem exceder o total (CA-14, INV-004).
- **CT-13:** montante dependente das taxas com devolução em processamento (CA-15).
- **CT-14:** valor divergente do provedor (CA-16).
- **CT-15:** premiação simulada identificada e integração não atendida em tela e registro (CA-17, INV-009).
- **CT-16:** acesso negado a quem não tem vínculo (CA-18).
- **CT-17:** administração não solicita nem bloqueia em nome do vencedor (CA-19, INV-015).
- **CT-18:** resultado final, ranking e devoluções intactos (CA-20, INV-014).
- **CT-19:** auditoria em UTC, sem segredos, e ausência de dinheiro real (CA-21, INV-010, INV-011).
- **CT-20:** bolão sem valor a pagar não cria movimentação (A2, OPEN-150).

## 13. Questões em aberto

> Cada item traz uma **proposta para aprovação**, no mesmo padrão das Specs anteriores. Se a baseline já decidir algo diferente, a baseline prevalece.

- **OPEN-142 - confirmação necessária:** conferir esta Spec contra o texto integral de RF37, RF31, RB51, RB52, RB53, RB63, UC07 (passos 4 a 8 e A3 a A7), as SPEC-018, 024 e 025 aprovadas e as decisões aprovadas de OPEN-13, OPEN-22, OPEN-29 e OPEN-36, que não estavam disponíveis na geração. Confirmar também a inclusão de RNF11 por extensão e que o mapa não lista RNF02 para esta Spec, embora a transação única do resultado seja exigida (INV-012). *Proposta:* ajustar os critérios afetados após a conferência.
- **OPEN-143 - decisão necessária:** definir elegibilidade e prazo da solicitação. *Proposta:* a elegibilidade vem do resultado final congelado da SPEC-025; se a SPEC-017 permitir a saída depois do encerramento, a saída não retira o direito do vencedor já registrado (consistente com OPEN-138); não há prazo para solicitar; só o próprio vencedor solicita, sem aprovação administrativa.
- **OPEN-144 - decisão necessária:** definir o cálculo da parte (OPEN-13): origem do montante, divisão entre co-vencedores, arredondamento, moeda e efeito de saídas e devoluções. *Proposta:* seguir a decisão aprovada de OPEN-13 e o modelo gravado na criação (SPEC-007); na ausência de regra mais específica, valor em centavos inteiros em BRL, divisão igual entre co-vencedores, arredondamento para baixo em cada parte com o resto de centavos atribuído em ordem estável da classificação final, montante fixado uma única vez, na primeira solicitação, e, se a origem depender das taxas, desconsiderando as devoluções confirmadas, com solicitação bloqueada enquanto houver devolução aprovada em processamento.
- **OPEN-145 - decisão necessária:** definir o fluxo técnico com o núcleo financeiro e o provedor (referência de negócio, tratador de premiação, conferência no retorno e periódica, prazo máximo de pendência) e o contrato de persistência. *Proposta:* reutilizar a porta de pagamentos, o tratador por tipo e a conferência da SPEC-018 (OPEN-84, OPEN-85, OPEN-36); prazo de pendência configurável fora do código e, ao vencer, resolvido só após consulta ao provedor.
- **OPEN-146 - decisão necessária:** definir o tratamento do simulador e do registro de integração não atendida (OPEN-29). *Proposta:* até a validação de repasse no sandbox pela equipe, vale o simulador identificado; a tela e o registro mostram que a integração de premiação permanece não atendida; o adaptador real só entra após a validação.
- **OPEN-147 - decisão necessária:** definir nova tentativa e indisponibilidade. *Proposta:* nova tentativa pelo próprio vencedor, só após recusa confirmada, com consulta ao estado anterior, número de tentativa na chave de operação, sem limite e sem repetição automática; indisponibilidade ou resposta ambígua mantém pendente (como em OPEN-127).
- **OPEN-148 - decisão necessária:** definir o estado exibido e a visibilidade. *Proposta:* estados derivados (disponível, em processamento, concluída, recusada) com indicação de simulação; o vencedor vê os detalhes da própria premiação; a administração vê só o estado por vencedor, sem dados do provedor; demais participantes veem apenas os vencedores (SPEC-025).
- **OPEN-149 - decisão necessária:** definir a auditoria (ações e resultados, conforme OPEN-45 e OPEN-46). *Proposta:* auditar solicitação, confirmação, recusa, pendência por indisponibilidade, valor divergente e nova tentativa, com o sistema como ator nas ações automáticas, e auditar tentativas negadas de quem não é vencedor; não auditar recusas por conflito de estado (como em OPEN-73, OPEN-96 e OPEN-133).
- **OPEN-150 - decisão necessária:** definir bolão sem valor a pagar (modelo de premiação sem montante, montante zero ou ausência de vencedor). *Proposta:* nenhuma movimentação é criada, a consulta informa que não há premiação a pagar e o estado exibido é "sem premiação a pagar".

## 14. Definition of Done

A SPEC-026 está concluída quando:

1. todos os critérios de aceitação (CA-01 a CA-21) estiverem implementados;
2. todos os invariantes (INV-001 a INV-015) estiverem preservados;
3. os casos de teste derivados (CT-01 a CT-20) estiverem aprovados;
4. os RNFs aplicáveis (RNF04, RNF09, RNF10, RNF15, RNF16 e RNF11 por extensão) tiverem sido verificados;
5. não existir divergência conhecida entre implementação e esta Spec;
6. toda divergência em relação à baseline tiver sido explicitamente analisada e decidida pela equipe humana.

**Regra fundamental:** a implementação obedece à Spec aprovada. Em conflito entre código, Spec e documentos de modelagem, registra-se a divergência e escolhe-se entre corrigir a implementação ou propor alteração da baseline para aprovação humana.
