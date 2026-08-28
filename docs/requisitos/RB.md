# Regras de Negócio --- Palpite League

## RB01 --- Criação da Liga

Toda liga deverá possuir um usuário responsável por sua criação, que
assumirá automaticamente os papéis de administrador e participante da
liga.

## RB02 --- Configuração Inicial da Liga

No momento da criação, o administrador deverá definir
obrigatoriamente: - taxa de entrada; - modelo de premiação; - período de
duração; - partidas participantes; - critério de desempate.

## RB03 --- Imutabilidade das Regras

Após a criação da liga, a taxa de entrada, o modelo de premiação, o
período de duração e o critério de desempate não poderão ser alterados
pelo administrador ou coadministrador.

## RB04 --- Coadministrador

O administrador poderá promover um participante a coadministrador,
concedendo a ele as permissões administrativas definidas pelo sistema.

## RB05 --- Convite para Participação

Somente usuários convidados poderão solicitar entrada em uma liga
privada.

## RB06 --- Aprovação de Participantes

A entrada de um usuário em uma liga dependerá da aprovação do
administrador ou coadministrador.

## RB07 --- Aceite das Regras

Antes de participar de uma liga, o usuário deverá visualizar e aceitar
as regras estabelecidas pelo administrador, funcionando como um termo de
participação da liga.

## RB08 --- Entrada Tardia

Um usuário poderá entrar em uma liga que já esteja em andamento, desde
que seja aprovado e aceite explicitamente a condição de entrada tardia,
reconhecendo que não poderá recuperar as oportunidades de palpites das
rodadas anteriores.

## RB09 --- Pagamento da Entrada

O participante deverá realizar o pagamento da taxa de entrada definida
na criação da liga para ter sua participação financeira confirmada.

## RB10 --- Valor da Taxa

A taxa de entrada será única para todos os participantes da mesma liga e
não poderá ser alterada após sua criação.

## RB11 --- Seleção das Partidas

O administrador ou coadministrador poderá selecionar individualmente as
partidas que participarão da liga ou selecionar todas as partidas de uma
ou mais rodadas.

## RB12 --- Tipos de Palpite

Para cada partida, o participante deverá escolher apenas uma modalidade
de palpite: - resultado da partida; ou - placar exato.

## RB13 --- Prazo para Palpites

O participante poderá realizar ou alterar seu palpite somente até o
início da respectiva partida.

## RB14 --- Bloqueio de Palpites

Após o início de uma partida, nenhum participante poderá realizar,
alterar ou substituir o palpite daquela partida.

## RB15 --- Resultado Oficial

O resultado utilizado para determinar a pontuação deverá ser obtido por
meio da API esportiva integrada ao Palpite League.

## RB16 --- Resultado Não Pode Ser Alterado Administrativamente

O administrador e o coadministrador não poderão inserir, editar ou
substituir manualmente o resultado oficial de uma partida.

## RB17 --- Pontuação do Palpite

A pontuação de cada participante será calculada automaticamente pelo
sistema com base na comparação entre seu palpite e o resultado oficial
da partida.

### Regra de pontuação

  Tipo de palpite   Condição                                 Pontos
  ----------------- -------------------------------------- --------
  Resultado         Acerto de vitória, empate ou derrota          2
  Resultado         Erro                                          0
  Placar exato      Acerto exato do placar                        5
  Placar exato      Erro do placar                                0

> O participante deverá escolher entre palpite de resultado ou palpite
> de placar exato. O palpite de placar exato somente concederá a
> pontuação correspondente quando o placar for acertado exatamente.

## RB18 --- Ranking

A classificação da liga será determinada pela pontuação acumulada dos
participantes durante o período definido para a competição.

## RB19 --- Melhor Jogador da Rodada

Ao término de cada rodada, o participante que obtiver a maior pontuação
naquela rodada será reconhecido como melhor jogador da rodada.

## RB20 --- Medalha

O melhor jogador de cada rodada receberá uma medalha visual associada ao
seu perfil dentro daquela liga. A medalha terá finalidade exclusivamente
visual e de incentivo à competição.

## RB21 --- Critério de Desempate

Em caso de empate na classificação, o sistema deverá aplicar o critério
de desempate definido pelo administrador no momento da criação da liga.

## RB22 --- Imutabilidade do Desempate

O critério de desempate definido na criação da liga não poderá ser
alterado durante sua duração.

## RB23 --- Saída Voluntária

Um participante poderá solicitar sua saída da liga a qualquer momento.

## RB24 --- Saldo Após Saída

A saída de um participante não implicará devolução automática do
dinheiro que estiver associado à liga.

## RB25 --- Solicitação de Devolução

Caso um participante queira recuperar seu saldo após solicitar sua
saída, deverá realizar uma solicitação formal ao administrador ou
coadministrador.

## RB26 --- Autorização de Devolução

A devolução do dinheiro de um participante que deixou a liga somente
poderá ocorrer mediante autorização do administrador ou coadministrador,
respeitando as regras previamente estabelecidas para a liga.

## RB27 --- Remoção de Participante

O administrador e o coadministrador não poderão remover unilateralmente
um participante da liga.

## RB28 --- Encerramento da Liga

A liga será encerrada automaticamente quando atingir o período final
definido durante sua criação.

## RB29 --- Premiação

Ao encerramento da liga, o sistema deverá determinar o vencedor ou
vencedores de acordo com o modelo de premiação definido na criação.

## RB30 --- Solicitação do Prêmio

Após o encerramento da liga, o vencedor poderá solicitar o recebimento
da premiação disponível.

## RB31 --- Integridade Financeira

Todas as entradas, saídas, pagamentos, devoluções e premiações deverão
ser registradas e vinculadas à respectiva liga e ao usuário responsável
pela movimentação.
