# Palpite League

## 🎓 Sobre o Projeto

Este projeto foi desenvolvido como parte dos requisitos práticos da disciplina de **Modelagem de Sistemas**, do 4º semestre do curso de **Engenharia da Computação** da **Universidade Presbiteriana Mackenzie**.

### 👥 Equipe Desenvolvedora

O grupo é formado por três estudantes:

* **Felipe Azoia Ferracioli** - RA: 10736997
* **Eduardo Braga Sena** - RA: 10436266
* **João Ricardo Gomes Ferreira** - RA: 10737497

O **Palpite League** é uma plataforma de criação e gerenciamento de bolões privados de palpites esportivos focada no Campeonato Brasileiro. O sistema automatiza a coleta de resultados oficiais, o cálculo de pontuações e o ranqueamento. As operações financeiras fazem parte de uma simulação acadêmica: a entrega final prevê integração com o Mercado Pago exclusivamente em ambiente de teste, sem movimentação de dinheiro real. A taxa de entrada usará Checkout Pro; se o sandbox não oferecer repasse posterior de premiação, a demonstração poderá usar um simulador claramente identificado, sem alegar que a integração de premiação foi concluída.

## 🎯 Principais Funcionalidades

* **Regras Customizáveis e Imutáveis:** Na criação do bolão, o administrador define a taxa de entrada, o modelo de premiação, a duração (rodadas) e os critérios de desempate. Esses parâmetros são bloqueados e não podem ser alterados após a criação; os valores são usados apenas em operações de teste/simulação.
* **Resultados Automatizados:** Os placares oficiais são obtidos exclusivamente através de integração com uma API esportiva externa. Para garantir a integridade do sistema, nenhum usuário ou administrador pode inserir ou alterar resultados manualmente.
* **Opções de Palpite:** Os participantes escolhem entre apostar no resultado geral da partida (vitória/empate/derrota) ou no placar exato. Os palpites podem ser feitos ou alterados até o horário exato de início do jogo.
* **Ranking e Gamificação:** O sistema mantém uma classificação cumulativa e distribui medalhas e emblemas visuais aos maiores pontuadores de cada rodada.
* **Gestão de Membros:** 
  * Entrada via convite (link ou interno) com necessidade de aceite explícito dos termos de uso e validação final do administrador.
  * Jogadores que entram com o bolão em andamento recebem um aviso claro sobre a desvantagem competitiva.
  * O administrador não possui poder de exclusão arbitrária; saídas não geram devolução automática, e um pedido formal de devolução exige aprovação administrativa.

## 👥 Perfis de Usuário

* **Administrador / Coadministrador:** Responsável por criar o bolão, configurar as regras iniciais, convidar e aprovar membros, e selecionar os jogos disponíveis para aposta.
* **Participante:** Usuário que recebe o convite, aceita as regras, aguarda aprovação e, quando houver taxa, conclui o pagamento pelo Checkout Pro em ambiente de teste antes de ter a participação confirmada; depois gerencia seus palpites a cada rodada.

## 🔄 Fluxo Principal do Sistema

1. **Setup:** Criação do bolão → Definição de regras → Disparo de convites.
2. **Onboarding:** Participante aceita as regras → Administrador aprova a entrada → Participante realiza o pagamento pelo Mercado Pago em ambiente de teste, se houver taxa → Sistema confirma a participação após confirmação do pagamento.
3. **Competição:** Participante registra o palpite → Partida inicia (palpites bloqueados) → API de esportes fornece o resultado oficial.
4. **Resolução:** Sistema calcula a pontuação → Atualiza o ranking geral do bolão → Atribui medalhas aos participantes empatados na maior pontuação da rodada.
5. **Encerramento:** Bolão atinge a rodada limite → Vencedor(es) é/são calculado(s) com base nas regras e critérios de desempate → O vencedor solicita a premiação, processada pelo provedor em ambiente de teste se suportada e confirmada.

## Documentação de análise

Os atores, o diagrama de casos de uso e os fluxos principais estão descritos em [Casos de Uso](docs/uml/casos-de-uso.md).

## 🛠️ Tecnologias e Arquitetura

A arquitetura consolidada do projeto está documentada em [docs/arquitetura/arquitetura-consolidada.md](docs/arquitetura/arquitetura-consolidada.md).

## 🚀 Desenvolvimento local

Instale as dependências e execute a interface:

```bash
npm install
npm run dev
```

Em outro terminal, execute a API:

```bash
npm run dev:server
```

A API responde em `http://localhost:3000/health`. O banco SQLite local é criado em `data/palpite-league.db` e não é versionado.

O catálogo esportivo usa o provedor simulado por padrão. Os parâmetros `SPORTS_CATALOG_SOURCE`, `SPORTS_SEASON`, `SPORTS_PROVIDER_TIMEOUT_MS` e `SPORTS_CATALOG_TTL_MS` estão no `.env.example`; a janela padrão é de seis horas e o tempo limite, de dez segundos. A integração API-Football requer `API_FOOTBALL_API_KEY` e `SPORTS_API_FOOTBALL_PROOF_APPROVED=true`, após a aprovação da prova técnica da equipe. Sem ela, o adaptador real permanece bloqueado.

Com uma sessão autenticada, o catálogo pode ser consultado em `GET /catalog/rounds` e `GET /catalog/rounds/:roundNumber/matches`; a segunda rota aceita o filtro opcional `?status=scheduled|in_progress|finished|postponed|cancelled`.

Para executar os testes técnicos:

```bash
npm test
```

Antes dos testes do frontend, instale também as dependências da interface:

```bash
npm install --prefix src/frontend
npm run test:frontend
```

## ✅ Integração contínua

Todo pull request para `main`, `develop` ou `staging` dispara o workflow [CI](.github/workflows/ci.yml) no GitHub Actions (também pode ser executado manualmente pela aba Actions). Os jobs rodam em paralelo, e qualquer falha reprova o PR:

| Job | Comando |
| --- | --- |
| ESLint | `npm run lint` (erros e avisos reprovam) |
| Build (Vite) | `npm run build` |
| Testes backend | `npm run test:backend` |
| Testes frontend (Vitest) | `npm run test:frontend` |
| npm audit | `npm audit --audit-level=high --omit=dev` |

Antes de abrir o PR, rode o mesmo localmente:

```bash
npm ci
npm run lint      # ou npm run lint:fix para corrigir o que for automático
npm run build
npm test
```

## ☁️ Deploy (Railway)

Um serviço só: o back (Express) serve a API e o front compilado pelo Vite, com o banco SQLite num volume persistente. A configuração de build e start está em [railway.json](railway.json).

1. **Novo projeto** no Railway → *Deploy from GitHub repo* → este repositório (branch `main`).
2. **Volume:** no serviço, *Add Volume* com *Mount path* `/data`. O banco precisa dele para não se perder a cada deploy. Use **1 réplica** só (SQLite).
3. **Variáveis** (aba *Variables*):

   | Variável | Valor |
   | --- | --- |
   | `SERVE_FRONTEND` | `true` |
   | `DATABASE_PATH` | `/data/palpite-league.db` |
   | `SEED_DEMO_DATA` | `true` (monta os dados de demonstração só na primeira subida, com o banco sem usuários) |
   | `APP_BASE_URL` | o endereço público do serviço, com `https://` (ex.: `https://palpite-league.up.railway.app`) |
   | `PAYMENTS_PROVIDER` | `simulator` |
   | `RECOVERY_CHANNEL_PATH` | `/data/simulated-recovery-channel.txt` |
   | `API_FOOTBALL_API_KEY` | chave da API-Football (opcional; sem ela a consulta de 2024 fica desabilitada) |

4. **Domínio:** *Settings → Networking → Generate Domain*, e use esse endereço em `APP_BASE_URL`.
5. O Railway roda `npm ci`, `npm run build` e `npm run start:prod`; o health check usa `GET /health`.

Com `SEED_DEMO_DATA=true`, a primeira subida monta, pela própria API do servidor ([src/backend/demo-seed.js](src/backend/demo-seed.js)), as contas `teste2@gmail.com` a `teste10@gmail.com` (senha `12345678`; a teste2 é Premium), três bolões (pódio 50/30/20, taxa de R$ 10 paga no simulador e pódio 70/20/10 com filtro de times), as entradas e palpites nos jogos abertos. Nenhum dado de conta fica versionado no repositório. Nas subidas seguintes nada é recriado; para recomeçar do zero, apague o volume e faça um novo deploy.

> **Aviso Acadêmico:** Este repositório reflete um projeto de modelagem de sistemas. As integrações financeiras são destinadas exclusivamente a ambiente de teste e simulação, sem movimentação de dinheiro real. O projeto não está preparado para operação financeira em produção.
