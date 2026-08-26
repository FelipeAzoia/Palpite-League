# Requisitos funcionais

## RF01 — Criação da liga

Quando o usuário criar uma liga, o sistema deverá permitir que ele defina nome, período de duração, taxa de entrada, premiação, partidas participantes e critério de desempate.

## RF02 — Regras imutáveis

Quando uma liga for criada, o sistema deverá manter as regras, taxa de entrada, premiação e critério de desempate definidos pelo administrador durante toda a duração da liga.

## RF03 — Convite para liga

Quando o administrador ou coadministrador convidar um usuário, o sistema deverá disponibilizar um convite por link ou dentro da plataforma.

## RF04 — Entrada na liga

Quando um usuário solicitar participação em uma liga, o sistema deverá exigir a validação do administrador ou coadministrador antes de confirmar sua entrada.

## RF05 — Aceite das regras

Quando um usuário solicitar participação em uma liga, o sistema deverá apresentar as regras da competição e exigir sua concordância antes da confirmação da entrada.

## RF06 — Palpites

Quando houver uma partida disponível para apostas, o sistema deverá permitir que o participante escolha entre apostar no resultado da partida ou no placar exato.

## RF07 — Encerramento dos palpites

Quando uma partida atingir seu horário de início, o sistema deverá bloquear novos palpites e alterações nos palpites existentes daquela partida.

## RF08 — Resultados automáticos

Quando uma partida for encerrada, o sistema deverá consultar a API esportiva configurada e obter o resultado oficial da partida.

## RF09 — Pontuação

Quando o resultado oficial de uma partida estiver disponível, o sistema deverá comparar o resultado com o palpite realizado pelo participante e atribuir a pontuação correspondente.

## RF10 — Ranking

Quando a pontuação de uma partida for calculada, o sistema deverá atualizar o ranking acumulado dos participantes da liga.

## RF11 — Melhor da rodada

Quando uma rodada for encerrada, o sistema deverá identificar o participante com maior pontuação na rodada e atribuir uma medalha visual ao seu perfil naquela liga.

## RF12 — Premiação

Quando a liga chegar ao final de sua duração, o sistema deverá identificar o vencedor conforme as regras previamente estabelecidas e disponibilizar a solicitação de recebimento da premiação.
