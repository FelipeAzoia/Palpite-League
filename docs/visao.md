# Visão do Produto — Palpite League

Palpite League é uma plataforma de criação e gerenciamento de bolões privados de palpites esportivos, permitindo que amigos e outros grupos compitam durante o Brasileirão. As operações financeiras são acadêmicas: a entrega prevê uma integração com provedor de pagamentos em ambiente de teste, sem movimentação de dinheiro real. Se o sandbox não oferecer repasse posterior de premiação, a demonstração poderá usar um simulador explicitamente identificado, sem considerar a integração de premiação concluída.

O usuário poderá criar ou participar de diferentes bolões, recebendo convites por link ou dentro da própria plataforma. Ao criar um bolão, o administrador definirá previamente regras como taxa de entrada, premiação, período de duração, partidas participantes e critérios de desempate, não podendo alterar essas configurações após a criação.

Em cada partida, o participante poderá escolher entre apostar no resultado da partida ou apostar no placar exato, realizando seu palpite até o início do jogo. Os resultados reais serão obtidos automaticamente por meio de uma API esportiva, permitindo ao sistema calcular a pontuação e atualizar o ranking do bolão.

Durante a competição, os participantes poderão acompanhar sua colocação, pontuação acumulada e desempenho por rodada. O jogador que obtiver a maior pontuação em cada rodada receberá uma medalha visual, incentivando a competição entre os participantes.

Ao final do bolão, o sistema calculará automaticamente o vencedor conforme as regras estabelecidas na criação e disponibilizará a opção de solicitar a premiação, processada em ambiente de teste somente se o provedor oferecer e confirmar o repasse. Uma eventual simulação na demonstração será identificada como tal.
