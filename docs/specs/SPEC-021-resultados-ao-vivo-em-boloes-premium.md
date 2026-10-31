# SPEC-021 — Resultados ao vivo em bolões Premium

- **Status:** aprovada em 30/10/2026. As questões OPEN-97 a OPEN-106 foram resolvidas com a aprovação desta Spec, nos termos das propostas da seção 13.
- **Etapa:** Spec-Driven Development, geração de Spec individual. Nenhum código, banco de dados, endpoint ou tecnologia nova é definido aqui.
- **Fonte de verdade:** `mapa-de-specs.md` (aprovado) e artefatos de `docs/`.

> **Nota de rastreabilidade:** ao gerar esta Spec, o texto integral de RF24, RB06, RB07, RB31, RB32, RB58, do UC05 (passo 3 e exceção A3), da SPEC-013 e a redação final das decisões aprovadas para OPEN-01, OPEN-02, OPEN-03, OPEN-24 e OPEN-25 não estavam disponíveis. O conteúdo abaixo foi derivado do mapa de Specs. Tudo que depende desses textos está marcado como OPEN-XX, com proposta, para conferência (ver OPEN-97).

---

## 1. Identificação

- **ID:** SPEC-021
- **Nome:** Resultados ao vivo em bolões Premium
- **Objetivo:** atualizar periodicamente as informações das partidas durante sua realização, somente nos bolões com o recurso ao vivo habilitado, sem tratar dados parciais como resultado oficial.
- **Valor entregue:** acompanhamento em tempo real das partidas do bolão, diferencial do plano Premium, sem comprometer a confiabilidade do resultado oficial, da pontuação e do ranking.

## 2. Rastreabilidade

| Tipo | Itens |
| --- | --- |
| RF | RF24 |
| RB | RB06, RB31, RB58; para bolões sem o recurso: RB07, RB32; contexto: RB29, RB30 e RB60 (resultado oficial só pela API, nunca manual), RB15 e RB24 (partidas fixas do bolão) |
| RNF | RNF08, RNF18, RNF20; por extensão: RNF01 (acesso restrito a membros, ver OPEN-97) |
| Caso de uso | UC05: extensão do passo 3 e exceção A3 (bolões sem o recurso) |
| Entidades | Bolao (recurso ao vivo), Partida; leitura de Participacao para autorização |
| Drivers | DA-02 |
| ADRs | ADR-0002 (principal). Estruturais herdadas da fundação: ADR-0001, ADR-0004, ADR-0005, ADR-0006, ADR-0008 |

## 3. Escopo

**Incluído**

- Atualização periódica, pelo adaptador esportivo isolado, de status e placar parcial das partidas em andamento.
- Aplicação somente a partidas selecionadas por bolões ativos que têm o recurso ao vivo habilitado.
- Armazenamento dos dados ao vivo separado do resultado oficial.
- Consulta dos dados ao vivo pelos participantes do bolão, com identificação de "parcial, não oficial" e do instante da última atualização.
- Comportamento em falha do provedor: preservar o último dado válido e nunca inventar dados.
- Comportamento dos bolões sem o recurso: sem dados parciais, apenas o fluxo oficial.

**Fora do escopo**

- Resultado oficial, correções de resultado e agendador de sincronização (SPEC-013).
- Pontuação, ranking, medalhas e encerramento (SPEC-014, 015, 016, 025). Dados ao vivo nunca os acionam.
- Pontuação ou ranking provisórios calculados a partir de placar parcial (OPEN-106).
- Habilitação do recurso na criação do bolão (SPEC-007) e contratação do Premium (SPEC-019).
- Notificações de atualização (SPEC-027).
- Exibição de palpites de outros participantes (SPEC-012, OPEN-18).
- Prova técnica e escolha final do fornecedor esportivo (OPEN-01, responsabilidade da equipe).

## 4. Dependências

- **SPEC-007:** o bolão e o atributo do recurso ao vivo (RB58) e as partidas selecionadas.
- **SPEC-013:** adaptador esportivo em uso, agendador (ADR-0006), estados das partidas e resultado oficial, que sempre prevalece.
- **SPEC-019:** existência de bolões criados por usuários Premium, necessária para a demonstração de ponta a ponta.
- **Transitivas:** SPEC-001, 002, 003, 006, 010 (participação confirmada).
- **Decisões:** ADR-0002 (integração real condicionada à prova técnica); até lá, adaptador simulado (OPEN-60).

## 5. Comportamento esperado

### 5.1 Atualização ao vivo (processo do sistema)

- **Pré-condições:** existem partidas em andamento que pertencem a pelo menos um bolão ativo com o recurso habilitado.
- **Fluxo principal:**
  1. A tarefa agendada identifica as partidas em andamento de bolões ativos com o recurso habilitado.
  2. Para cada partida, o sistema consulta o adaptador uma única vez por ciclo, mesmo que várias partidas de bolões compartilhem a mesma partida.
  3. O sistema valida a leitura (OPEN-101).
  4. O sistema grava status e placar parcial como dado ao vivo, com o instante da leitura em UTC, separado do resultado oficial.
- **Alternativo A1 (sem partidas elegíveis):** o ciclo termina sem consultar o provedor.
- **Alternativo A2 (partida termina):** quando a partida passa a finalizada, a atualização ao vivo deixa de ser feita para ela; o resultado oficial vem pela SPEC-013 e prevalece.
- **Alternativo A3 (partida adiada, cancelada ou suspensa):** o status é apresentado como recebido, sem placar parcial (OPEN-02).
- **Exceção E1 (provedor indisponível, tempo esgotado ou resposta inválida):** o último dado válido é mantido com seu instante, a falha é registrada no log técnico (RNF20) e nada é inventado.
- **Pós-condição:** dados ao vivo atualizados, resultado oficial intacto.

### 5.2 Consulta pelo participante

- **Pré-condição:** usuário autenticado e participante confirmado do bolão.
- **Fluxo principal:** o participante abre as partidas do bolão. Para as partidas em andamento, o sistema apresenta status, placar parcial rotulado "parcial, não oficial" e o instante da última atualização.
- **Alternativo A4 (bolão sem o recurso, UC05 A3):** o sistema não retorna dado parcial; informa que o recurso não está disponível para o bolão e mantém o fluxo oficial.
- **Alternativo A5 (sem dado ao vivo ainda):** a partida em andamento aparece sem placar e com indicação de ausência de dados.
- **Alternativo A6 (resultado oficial disponível):** o sistema apresenta o resultado oficial, ignorando qualquer dado ao vivo.
- **Exceção E2:** usuário não autenticado, não participante ou bolão inexistente: acesso negado, sem revelar a existência do bolão (OPEN-102).
- **Pós-condição:** nenhum dado é alterado.

## 6. Regras e invariantes

- **INV-001:** dados ao vivo nunca são resultado oficial: não são gravados como oficial e não acionam pontuação, ranking, medalhas, encerramento ou premiação (RB31, RB29, RB30, RB60).
- **INV-002:** somente bolões com o recurso habilitado recebem e exibem dados parciais; para os demais, o backend não os retorna (RB06, RB58, RB07, RB32).
- **INV-003:** esta Spec não altera o atributo do recurso ao vivo do bolão, definido na criação (RB58, RB15).
- **INV-004:** nenhum dado ao vivo é inventado; sem leitura válida, exibe-se ausência; em falha, mantém-se o último dado válido com seu instante.
- **INV-005:** todo dado parcial é apresentado como "não oficial" e acompanhado do instante da última atualização em UTC (RNF04).
- **INV-006:** só participantes confirmados do bolão consultam seus dados ao vivo (RNF01).
- **INV-007:** há no máximo uma consulta ao adaptador por partida por ciclo, independentemente do número de bolões que a contêm (RNF08, cotas).
- **INV-008:** quando existe resultado oficial da partida, ele prevalece sobre qualquer dado ao vivo.
- **INV-009:** só partidas selecionadas pelo bolão recebem dados ao vivo (RB24, RB15).
- **INV-010:** a atualização é idempotente: reexecutar o ciclo não duplica dados, e leitura mais antiga que a já registrada é descartada.
- **INV-011:** as regras são validadas no backend (ADR-0005); o frontend não decide elegibilidade nem acesso.
- **INV-012:** logs técnicos não contêm credenciais, e segredos ficam fora do repositório (RNF20, ADR-0008).

## 7. Modelo de domínio envolvido

- **Bolao:** atributo "recurso ao vivo habilitado", definido na criação (SPEC-007) e somente lido aqui.
- **Partida:** status, resultado oficial (SPEC-013) e, nesta Spec, dado ao vivo separado: placar parcial dos dois times, instante da leitura (UTC) e indicador de fonte.
- **Participacao:** lida para autorizar a consulta (confirmada).
- Dado ao vivo e resultado oficial são conceitualmente distintos; a forma de persistência não é decidida aqui (OPEN-100).
- Sem modelo físico nesta Spec (OPEN-40).

## 8. Impacto arquitetural

- **Módulos:** partidas e resultados (dado ao vivo, consulta), integração esportiva (adaptador), agendador (ciclo de atualização). Agrupamento dos módulos conforme OPEN-39.
- **Fronteiras:** a Spec nunca escreve em resultado oficial nem chama pontuação; dados ao vivo e oficial são caminhos separados.
- **Integração:** consulta de dados parciais pelo adaptador isolado (ADR-0002); extensão do contrato e do simulador para dados parciais (OPEN-100). Testes sem credenciais externas (RNF18).
- **Backend:** seleciona partidas elegíveis, valida leituras, aplica autorização e entrega ao participante.
- **Frontend:** exibe indicador "ao vivo", placar rotulado "parcial, não oficial", instante da última atualização e estado de indisponibilidade; atualização da tela por consulta periódica (OPEN-103).
- **ADRs que restringem:** ADR-0002 (adaptador isolado, simulado nos testes), ADR-0001, ADR-0004, ADR-0005, ADR-0006, ADR-0008.

## 9. Contratos necessários (conceituais)

| Operação | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| Consultar partidas ao vivo do bolão | usuário autenticado e bolão | por partida em andamento: status, placar parcial, instante da última atualização (UTC), marca "não oficial"; para bolão sem o recurso: indicação de recurso indisponível | não autenticado; bolão inexistente ou sem participação (mesma resposta) |
| Atualizar dados ao vivo (interna, agendada) | instante atual e partidas elegíveis | dados ao vivo atualizados | provedor indisponível, tempo esgotado ou resposta inválida: mantém o último dado válido |
| Consulta ao adaptador (interna) | identificador da partida | status e placar parcial | indisponível, não encontrada, resposta inválida |

- Formato dos erros e códigos: conforme OPEN-53 (SPEC-003).
- Contrato de persistência e extensão do adaptador: **OPEN-100**.

## 10. Requisitos não funcionais aplicáveis

| RNF | Como é verificado |
| --- | --- |
| RNF08 | Teste de uma única consulta por partida por ciclo, de comportamento em falha, tempo esgotado e respeito ao intervalo configurado, com adaptador simulado. |
| RNF18 | Execução de toda a suíte com adaptador simulado, sem credenciais ou rede externa. |
| RNF20 | Verificação de que falhas e ciclos relevantes geram log técnico sem segredos. |
| RNF01 (extensão) | Teste de que não participantes e não autenticados não acessam dados ao vivo. |

## 11. Critérios de aceitação

- **CA-01 (atualização):** Dado um bolão ativo com o recurso habilitado e uma partida selecionada em andamento, Quando o ciclo executa, Então status e placar parcial são gravados com instante UTC.
- **CA-02 (consulta):** Dado esse bolão, Quando um participante confirmado consulta as partidas, Então vê status e placar parcial rotulados "parcial, não oficial" com o instante da última atualização.
- **CA-03 (bolão sem recurso, RB07 e RB32):** Dado um bolão sem o recurso habilitado, Quando o ciclo executa e o participante consulta, Então nenhum dado parcial é gravado nem retornado e o recurso é informado como indisponível.
- **CA-04 (não vira oficial):** Dado placar parcial gravado, Quando ocorre a atualização, Então nenhum resultado oficial, pontuação, ranking, medalha ou encerramento é alterado.
- **CA-05 (oficial prevalece):** Dado dado ao vivo e posterior resultado oficial da partida, Quando o participante consulta, Então vê o resultado oficial.
- **CA-06 (falha do provedor):** Dado que o provedor falha, Quando o ciclo executa, Então o último dado válido é mantido com seu instante, a falha vai ao log técnico e nada é inventado.
- **CA-07 (sem dado ainda):** Dado partida em andamento sem leitura válida, Quando consultada, Então aparece sem placar e com indicação de ausência de dados.
- **CA-08 (uma consulta por partida):** Dado uma partida contida em vários bolões elegíveis, Quando o ciclo executa, Então o adaptador é consultado uma única vez para ela.
- **CA-09 (sem partidas elegíveis):** Dado que não há partida em andamento elegível, Quando o ciclo executa, Então o provedor não é consultado.
- **CA-10 (partida fora da seleção):** Dado uma partida em andamento que não pertence ao bolão, Quando o ciclo executa, Então nenhum dado ao vivo é gravado para esse bolão.
- **CA-11 (acesso):** Dado um usuário não autenticado, não participante ou com participação não confirmada, Quando consulta, Então é negado, sem revelar a existência do bolão.
- **CA-12 (validação):** Dado uma leitura inválida (partida desconhecida, status inválido ou placar fora do formato), Quando recebida, Então é descartada e o último dado válido é mantido.
- **CA-13 (leitura antiga):** Dado dado ao vivo mais recente já gravado, Quando chega leitura com instante anterior, Então ela é descartada.
- **CA-14 (partida adiada ou cancelada):** Dado partida adiada, cancelada ou suspensa, Quando consultada, Então o status é apresentado sem placar parcial.
- **CA-15 (atributo imutável):** Dado qualquer execução desta Spec, Quando concluída, Então o atributo do recurso ao vivo do bolão permanece inalterado (INV-003).
- **CA-16 (testes isolados):** Dado o ambiente de testes, Quando a suíte desta Spec executa, Então roda apenas com adaptador simulado, sem credenciais externas.

## 12. Casos de teste derivados

Não implementar nesta etapa.

- **CT-01:** atualização de partida em andamento em bolão com recurso (CA-01).
- **CT-02:** consulta por participante confirmado com rótulo e instante (CA-02, INV-005).
- **CT-03:** bolão sem recurso: nada gravado e nada retornado (CA-03, INV-002).
- **CT-04:** dado ao vivo não altera oficial, pontos, ranking, medalhas nem encerramento (CA-04, INV-001).
- **CT-05:** resultado oficial prevalece sobre o dado ao vivo (CA-05, INV-008).
- **CT-06:** falha, tempo esgotado e resposta inválida mantêm o último dado (CA-06, CA-12, INV-004).
- **CT-07:** partida em andamento sem leitura válida (CA-07).
- **CT-08:** uma única consulta por partida em vários bolões (CA-08, INV-007).
- **CT-09:** ciclo sem partidas elegíveis não consulta o provedor (CA-09).
- **CT-10:** partida fora da seleção do bolão (CA-10, INV-009).
- **CT-11:** acesso negado a não autenticado, não participante e participação não confirmada (CA-11, INV-006).
- **CT-12:** leitura mais antiga descartada e reexecução do ciclo sem duplicidade (CA-13, INV-010).
- **CT-13:** partida adiada, cancelada e suspensa sem placar (CA-14).
- **CT-14:** atributo do recurso ao vivo inalterado (CA-15, INV-003).
- **CT-15:** suíte roda só com adaptador simulado (CA-16, RNF18).
- **CT-16:** logs técnicos sem segredos (INV-012, RNF20).

## 13. Questões em aberto

> Cada item traz uma **proposta para aprovação**, no mesmo padrão das Specs anteriores. Se a baseline já decidir algo diferente, a baseline prevalece.

- **OPEN-97 - confirmação necessária:** conferir esta Spec contra o texto integral de RF24, RB06, RB07, RB31, RB32, RB58, UC05 (passo 3 e A3), a SPEC-013 aprovada (OPEN-74 e OPEN-75) e as decisões aprovadas de OPEN-01, OPEN-02, OPEN-03, OPEN-24 e OPEN-25, que não estavam disponíveis na geração. Confirmar também a inclusão de RNF01 por extensão, que o mapa não lista para esta Spec. *Proposta:* ajustar os critérios afetados após a conferência.
- **OPEN-98 - decisão necessária:** definir o que é apresentado ao vivo (OPEN-25). *Proposta:* status da partida, placar parcial e instante da última atualização; sem minuto de jogo e sem eventos ou lances.
- **OPEN-99 - decisão necessária:** definir frequência, janela e cotas. *Proposta:* tarefa própria do agendador (ADR-0006) com intervalo configurável, padrão de 1 minuto, ativa somente para partidas em andamento de bolões ativos com o recurso, uma consulta por partida por ciclo e sem repetição imediata em caso de falha; o intervalo final respeita as cotas definidas após a prova técnica (OPEN-01).
- **OPEN-100 - decisão necessária:** definir a fronteira com a SPEC-013, a extensão do contrato do adaptador e do simulador para dados parciais, e a persistência do dado ao vivo separado do oficial. *Proposta:* mesma porta do adaptador da SPEC-006 e SPEC-013, estendida com consulta de status e placar parcial; o simulador reproduz cenários de partida em andamento, falha e atraso; dado ao vivo armazenado à parte, com instante da leitura.
- **OPEN-101 - decisão necessária:** definir a validação e o tratamento das leituras. *Proposta:* aceitar só partida conhecida, status válido e placar inteiro não negativo para os dois times; aceitar queda de placar (correção do provedor, por exemplo anulação de gol); descartar leitura com instante anterior ao já registrado; leitura inválida mantém o último dado válido.
- **OPEN-102 - decisão necessária:** definir acesso e visibilidade. *Proposta:* só participante confirmado do bolão; quem saiu do bolão e não participantes recebem a mesma resposta de "não encontrado"; em bolão encerrado, só o resultado oficial é exibido.
- **OPEN-103 - decisão necessária:** definir a apresentação e a atualização da tela. *Proposta:* o frontend repete a consulta em intervalo próprio, sem adotar tecnologia nova; placar rotulado "parcial, não oficial", instante da última atualização e aviso de indisponibilidade; nenhuma notificação é gerada por atualização ao vivo (SPEC-027, OPEN-32).
- **OPEN-104 - decisão necessária:** definir auditoria e logs. *Proposta:* atualizações ao vivo não são auditadas (dado não oficial e de alto volume); falhas e ciclos relevantes vão ao log técnico (RNF20), sem segredos.
- **OPEN-105 - decisão necessária:** definir o efeito de cancelamento ou expiração do Premium sobre o recurso ao vivo (OPEN-24, OPEN-95 da SPEC-020). *Proposta:* a verificação usa o atributo do bolão, definido na criação, e não o plano atual do criador; se a decisão aprovada de OPEN-24 determinar outro efeito, ela prevalece.
- **OPEN-106 - decisão necessária:** confirmar que não há pontuação nem ranking provisórios a partir de placar parcial. *Proposta:* não há; pontos só a partir do resultado oficial (SPEC-014).

## 14. Definition of Done

A SPEC-021 está concluída quando:

1. todos os critérios de aceitação (CA-01 a CA-16) estiverem implementados;
2. todos os invariantes (INV-001 a INV-012) estiverem preservados;
3. os casos de teste derivados (CT-01 a CT-16) estiverem aprovados;
4. os RNFs aplicáveis (RNF08, RNF18, RNF20 e RNF01 por extensão) tiverem sido verificados;
5. não existir divergência conhecida entre implementação e esta Spec;
6. toda divergência em relação à baseline tiver sido explicitamente analisada e decidida pela equipe humana.

**Regra fundamental:** a implementação obedece à Spec aprovada. Em conflito entre código, Spec e documentos de modelagem, registra-se a divergência e escolhe-se entre corrigir a implementação ou propor alteração da baseline para aprovação humana.
