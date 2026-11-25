# SPEC-031 — Escolha de partidas por rodadas e times, e consulta da API-Football 2024

- **Status:** aprovada em 24/11/2026. As decisões de negócio foram tomadas pela equipe nesta data (seção 13); liberada para implementação após as SPEC-006, SPEC-007 e SPEC-030.
- **Tipo:** Spec funcional que estende a criação do bolão (SPEC-007) e o catálogo de partidas (SPEC-006).
- **Baseline:** artefatos de `docs/`, `docs/mapa-de-specs (1).md` e SPEC-001 a SPEC-030.
- **Escopo deste documento:** somente a SPEC-031. As alterações em Specs anteriores estão na seção 14.

---

## 1. Identificação

- **ID:** SPEC-031
- **Nome:** Escolha de partidas por rodadas e times, e consulta da API-Football 2024
- **Objetivo:**
  1. tornar a escolha das partidas do bolão mais rápida: todas as rodadas do período, algumas rodadas ou jogo a jogo, sempre com a opção de limitar a times escolhidos;
  2. permitir consultar, na tela de criação do bolão, os dados reais do Brasileirão 2024 obtidos da API-Football, só para leitura, para demonstrar a integração.
- **Valor entregue:** quem cria o bolão monta "o bolão dos meus times" em poucos cliques; a equipe demonstra a integração real com a API-Football sem pagar o plano da temporada atual.

## 2. Rastreabilidade

- **RF:** RF09 e RF18 (criação com escolha de partidas, individualmente ou por rodada), RF10 (catálogo de partidas).
- **RB:** RB15, RB23, RB64 (partidas imutáveis depois da criação).
- **RNF:** RNF07 e RNF08 (integração externa isolada, com tempo limite e falhas tratadas), RNF15 (segredos fora do repositório), RNF18 (testes sem rede externa).
- **Caso de uso:** UC03 (criação do bolão).
- **Entidades:** `Bolao` e `PartidaDoBolao` (inalteradas), `Time`, `Rodada`, `Partida` do catálogo.
- **ADRs:** ADR-0002 (catálogo esportivo pela API-Football, com simulador enquanto a prova não for aprovada).

## 3. Escopo

### Incluído

- Três modos de escolha na criação do bolão: **todas as rodadas do período**, **escolher rodadas** e **escolher jogos**.
- Filtro opcional de **times**, válido nos três modos: entra no bolão todo jogo em que **ao menos um** dos times escolhidos jogue.
- Lista de times do catálogo para o filtro.
- **Nomes reais dos clubes no campeonato simulado:** os 20 times simulados passam a usar nomes de clubes do Brasileirão, para que o filtro de times faça sentido na demonstração.
- **Escudos nos placares:** os times simulados usam os escudos que a API-Football devolve para esses clubes, e todas as telas com placar (resultados, palpites, pontos, histórico, jogos do bolão, convite, catálogo e consulta de 2024) mostram o escudo ao lado do nome; sem imagem, aparece a inicial do time.
- Chave **"Campeonato simulado / API-Football · Brasileirão 2024"** no canto superior direito da criação do bolão. Na segunda opção, a tela mostra só a consulta de 2024 (rodadas, jogos, escudos e placares reais), sem formulário de criação.
- Consulta de 2024 pelo backend, separada do catálogo usado pelos bolões, com cache.

### Fora do escopo

- Criar ou jogar bolões com partidas de 2024 (todas já aconteceram; o palpite fecha no início da partida).
- Trocar a fonte do catálogo dos bolões: continua definida no `.env` (`SPORTS_CATALOG_SOURCE`), com o simulador como padrão.
- Guardar a escolha de modo ou de times no bolão: o que fica gravado continua sendo o conjunto de partidas (RB64).

## 4. Dependências

- **SPEC-006:** catálogo de times, rodadas e partidas.
- **SPEC-007:** criação do bolão e validação das partidas.
- **ADR-0002 / adaptador da API-Football** (liga 71, Brasileirão Série A).

## 5. Comportamento esperado

### 5.1 Escolha de partidas

- **Todas as rodadas do período:** entram todas as partidas elegíveis (agendadas e futuras) cujo dia, em America/Sao_Paulo, esteja dentro do período do bolão. O resumo mostra quantas rodadas e partidas entraram antes de criar.
- **Escolher rodadas:** como hoje: as partidas elegíveis das rodadas marcadas; continua valendo a regra de que todas precisam estar dentro do período.
- **Escolher jogos:** como hoje, jogo a jogo; o filtro de times só reduz a lista exibida.
- **Filtro de times:** com times escolhidos, nos modos "todas" e "rodadas" entram só as partidas em que ao menos um deles joga. Sem times escolhidos, nada é filtrado.
- **Exceções:**
  - E1: nenhuma partida resultante (por exemplo, nenhum time escolhido joga no período): 400 no campo `selection`, com mensagem explicando o motivo;
  - E2: time inexistente no catálogo: 400 no campo `selection`;
  - E3: o resultado passa de 500 partidas (limite atual): 400 no campo `selection`.

### 5.2 Consulta da API-Football 2024

- **Fluxo:** a pessoa liga a chave "API-Football · Brasileirão 2024". A tela carrega as rodadas de 2024 e mostra, para a rodada escolhida, os jogos com escudos, data, situação e placar final, e um aviso: "Dados reais da temporada 2024, obtidos da API-Football. A temporada atual exige o plano pago, por isso os bolões usam o campeonato simulado."
- **A1 — chave da API não configurada:** a opção aparece desabilitada, com a explicação "API-Football não configurada neste ambiente".
- **A2 — falha da API (tempo esgotado, limite diário, resposta inválida):** a tela mostra a mensagem de indisponibilidade e permite tentar de novo; se houver uma cópia anterior em cache, ela é mostrada com a data em que foi obtida.
- **A3 — volta ao simulado:** o formulário de criação reaparece com o que já estava preenchido.

## 6. Regras e invariantes

- **INV-001:** o bolão continua guardando só o conjunto de partidas resolvido na criação; modo e times não são gravados e não mudam nada depois (RB64).
- **INV-002:** a resolução das partidas é feita pelo backend; o cliente envia o modo, as rodadas, os jogos e os times, nunca a lista final calculada no modo "todas".
- **INV-003:** só entram partidas elegíveis (agendadas, com data e hora futuras) e dentro do período (SPEC-007 INV-006).
- **INV-004:** a consulta de 2024 nunca grava no catálogo usado pelos bolões nem é aceita como origem de partidas na criação.
- **INV-005:** a consulta de 2024 faz no máximo uma chamada à API por janela de cache (24 horas), já que os dados de 2024 não mudam; a chave da API fica só no `.env` e nunca aparece em respostas ou registros (RNF15).
- **INV-006:** os testes automatizados não acessam a rede: usam respostas gravadas da API (RNF18).

## 7. Modelo de domínio envolvido

- Sem tabelas novas. O cache da consulta de 2024 fica em memória no servidor.
- **Time (simulado):** os identificadores `sim-team-1` a `sim-team-20` não mudam; só os nomes passam a ser de clubes do Brasileirão.

## 8. Impacto técnico

- **Backend:**
  - validação da seleção aceita `mode` (`all_in_period`, `rounds`, `matches`) e `teamIds`, mantendo `matchIds` e `roundNumbers`;
  - resolução das partidas com o filtro de times;
  - rota `GET /catalog/teams`;
  - rota `GET /catalog/showcase/api-football-2024`, com adaptador próprio, tempo limite, cache de 24 horas e erros classificados;
  - simulador esportivo com nomes de clubes reais.
- **Frontend:**
  - seletor de modo, seleção de rodadas, filtro de times com busca e "marcar todos";
  - resumo do que vai entrar no bolão;
  - chave no canto superior direito e tela de consulta de 2024.
- **Configuração:** usa `API_FOOTBALL_API_KEY` e `SPORTS_PROVIDER_TIMEOUT_MS`, que já existem; nenhuma variável nova.

## 9. Contratos

| Operação | Mudança |
| --- | --- |
| Criar bolão | `selection` passa a aceitar `{ mode, roundNumbers?, matchIds?, teamIds? }`. Sem `mode`, vale o formato atual (`matchIds` e/ou `roundNumbers`). |
| `GET /catalog/teams` | Novo: `{ teams: [{ id, name, crest }] }`, em ordem alfabética. |
| `GET /catalog/showcase/api-football-2024` | Novo: `{ source: 'api-football', season: 2024, fetchedAt, rounds: [{ number, matches: [{ id, startsAt, status, home: { name, crest, score }, away: { name, crest, score } }] }] }`. Erro 503 `showcase_unavailable` (A2) ou 503 `showcase_not_configured` (A1). |

## 10. Testes

- **TC-01:** modo "todas as rodadas do período" inclui só partidas elegíveis dentro do período.
- **TC-02:** filtro de times inclui jogos em que ao menos um time escolhido joga, nos modos "todas" e "rodadas".
- **TC-03:** E1, E2 e E3.
- **TC-04:** formato antigo da seleção continua aceito (regressão da SPEC-007).
- **TC-05:** `GET /catalog/teams` lista os times do catálogo.
- **TC-06:** consulta de 2024 com resposta gravada da API: rodadas, jogos, placares e escudos; uma única chamada dentro da janela de cache.
- **TC-07:** consulta de 2024 sem chave (A1) e com falha da API (A2), sem vazar a chave.
- **TC-08 (frontend):** modos, filtro de times, resumo e montagem do pedido; rótulos da consulta de 2024.

## 11. Critérios de aceitação

- **CA-01:** Dado o período do bolão, Quando a pessoa escolhe "todas as rodadas do período", Então o bolão recebe todas as partidas elegíveis desse período.
- **CA-02:** Dado times escolhidos, Quando o bolão é criado nos modos "todas" ou "rodadas", Então só entram jogos com ao menos um desses times.
- **CA-03:** Dado que nenhuma partida atende à escolha, Quando a criação é enviada, Então é recusada com a explicação no campo de partidas.
- **CA-04:** Dado a chave "API-Football · Brasileirão 2024" ligada, Quando a tela carrega, Então mostra rodadas, jogos e placares reais de 2024, com o aviso de que são só para consulta, e não permite criar bolão com eles.
- **CA-05:** Dado várias consultas de 2024 dentro de 24 horas, Quando são feitas, Então a API é chamada no máximo uma vez.

## 12. Riscos

- Plano gratuito da API-Football: 100 chamadas por dia; mitigado pelo cache de 24 horas (INV-005).
- Trocar os nomes dos times simulados altera o que aparece em bolões já criados no ambiente de desenvolvimento; os identificadores não mudam, então nada quebra.

## 13. Decisões tomadas pela equipe (24/11/2026)

| Tema | Decisão |
| --- | --- |
| Uso da API-Football | Só consulta dos dados reais de 2024, para demonstrar a integração; bolões seguem com o campeonato simulado. |
| Filtro de times | Entra o jogo em que ao menos um dos times escolhidos joga. |
| Modos de escolha | Todas as rodadas do período, escolher rodadas, escolher jogos; filtro de times opcional em qualquer modo. |

## 14. Alterações em Specs anteriores

- **SPEC-007:** a seleção ganha o modo "todas as rodadas do período" e o filtro de times; o formato anterior continua aceito.
- **SPEC-006:** o catálogo ganha a lista de times; o simulador passa a usar nomes de clubes do Brasileirão.

## 15. Definition of Done

A SPEC-031 estará concluída quando os critérios CA-01 a CA-05 estiverem implementados, os invariantes preservados, os testes TC-01 a TC-08 aprovados sem acesso à rede, e o mapa de specs atualizado.
