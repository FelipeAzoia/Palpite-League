# Regras de Negócio — Palpite League

## RB01 — Planos disponíveis

A plataforma disponibilizará os planos Gratuito e Premium.

---

## RB02 — Plano Gratuito

Todo usuário poderá utilizar gratuitamente as funcionalidades básicas da plataforma e criar até 1 bolão simultaneamente.

---

## RB03 — Plano Premium

Usuários com plano Premium poderão criar até 10 bolões simultaneamente.

---

## RB04 — Assinatura Premium

O plano Premium será disponibilizado mediante assinatura paga, com cobrança recorrente conforme as condições comerciais definidas pela plataforma.

---

## RB05 — Participação independente do plano

O plano do usuário não limitará a quantidade de bolões dos quais ele poderá participar.

---

## RB06 — Resultado ao vivo Premium

Somente bolões criados por usuários com plano Premium possuirão o recurso de acompanhamento dos jogos em tempo real.

---

## RB07 — Resultado pós-partida

Bolões sem o recurso de acompanhamento ao vivo disponibilizarão os resultados oficiais após o encerramento das respectivas partidas.

---

## RB08 — Independência entre plano e taxa de entrada

O plano do usuário não determinará a existência ou o valor da taxa de entrada de um bolão. A taxa deverá ser definida pelo administrador no momento da criação e será aplicada igualmente a todos os participantes daquele bolão.

---

## RB09 — Validade dos recursos Premium

Os recursos exclusivos do plano Premium estarão disponíveis enquanto a assinatura estiver ativa, respeitando as condições definidas para o plano.

---

## RB10 — Expiração da assinatura

Quando a assinatura Premium expirar ou for cancelada, o usuário retornará às limitações do plano Gratuito para novas criações de bolões.

---

## RB11 — Manutenção dos bolões existentes

A expiração ou cancelamento da assinatura Premium não deverá excluir nem encerrar automaticamente os bolões que já tenham sido criados durante sua vigência.

---

## RB12 — Limite após downgrade

Após retornar ao plano Gratuito, o usuário não poderá criar novos bolões caso já possua um bolão ativo.

---

## RB13 — Criação da liga

Toda liga deverá possuir um usuário responsável por sua criação, que assumirá automaticamente os papéis de administrador e participante.

---

## RB14 — Configuração inicial da liga

No momento da criação, o administrador deverá definir obrigatoriamente:

- nome da liga;
- período de duração;
- taxa de entrada;
- modelo de premiação;
- partidas participantes;
- critério de desempate.

---

## RB15 — Imutabilidade das regras

Após a criação da liga, a taxa de entrada, o modelo de premiação, o período de duração, as partidas participantes e o critério de desempate não poderão ser alterados pelo administrador ou coadministrador.

---

## RB16 — Coadministrador

O administrador poderá promover um participante a coadministrador, concedendo a ele as permissões administrativas definidas pelo sistema.

---

## RB17 — Convite para participação

Somente usuários convidados poderão solicitar entrada em uma liga privada.

---

## RB18 — Aprovação de participantes

A entrada de um usuário em uma liga dependerá da aprovação do administrador ou coadministrador.

---

## RB19 — Aceite das regras

Antes de participar de uma liga, o usuário deverá visualizar e aceitar as regras estabelecidas pelo administrador, funcionando como um termo de participação da liga.

---

## RB20 — Entrada tardia

Um usuário poderá entrar em uma liga que já esteja em andamento, desde que seja aprovado e aceite explicitamente a condição de entrada tardia.

---

## RB21 — Consequência da entrada tardia

Um participante que ingressar em uma liga após o início de uma ou mais partidas não poderá realizar palpites referentes às partidas cujo prazo já tenha sido encerrado.

---

## RB22 — Pagamento da entrada

Quando houver taxa de entrada definida para a liga, o participante deverá realizar o pagamento para ter sua participação financeira confirmada.

---

## RB23 — Valor da taxa

A taxa de entrada será única para todos os participantes da mesma liga e não poderá ser alterada após sua criação.

---

## RB24 — Seleção das partidas

O administrador ou coadministrador poderá selecionar individualmente as partidas que participarão da liga ou selecionar todas as partidas de uma ou mais rodadas.

---

## RB25 — Tipos de palpite

Para cada partida, o participante deverá escolher apenas uma modalidade de palpite:

- resultado da partida; ou
- placar exato.

---

## RB26 — Exclusividade do tipo de palpite

Um participante não poderá registrar simultaneamente um palpite de resultado e um palpite de placar exato para a mesma partida.

---

## RB27 — Prazo para palpites

O participante poderá realizar ou alterar seu palpite somente até o início da respectiva partida.

---

## RB28 — Bloqueio de palpites

Após o início de uma partida, nenhum participante poderá realizar, alterar ou substituir o palpite daquela partida.

---

## RB29 — Resultado oficial

O resultado utilizado para determinar a pontuação deverá ser obtido exclusivamente por meio da API esportiva integrada ao Palpite League.

---

## RB30 — Resultado não pode ser alterado administrativamente

O administrador e o coadministrador não poderão inserir, editar ou substituir manualmente o resultado oficial de uma partida.

---

## RB31 — Resultado ao vivo

Nos bolões com recurso de resultados ao vivo habilitado, as informações das partidas deverão ser atualizadas durante a realização dos jogos por meio da API esportiva integrada.

---

## RB32 — Resultado pós-jogo

Nos bolões sem recurso de resultados ao vivo, o resultado oficial deverá ser disponibilizado após o encerramento da partida.

---

## RB33 — Pontuação do palpite

A pontuação de cada participante será calculada automaticamente pelo sistema com base na comparação entre seu palpite e o resultado oficial da partida.

---

## RB34 — Pontuação por resultado

Um palpite do tipo resultado concederá 2 pontos quando o participante acertar o resultado da partida, considerando vitória, empate ou derrota.

---

## RB35 — Erro no palpite de resultado

Um palpite do tipo resultado concederá 0 pontos quando o participante errar o resultado da partida.

---

## RB36 — Pontuação por placar exato

Um palpite do tipo placar exato concederá 5 pontos quando o participante acertar exatamente o placar da partida.

---

## RB37 — Erro no palpite de placar

Um palpite do tipo placar exato concederá 0 pontos quando o participante não acertar exatamente o placar da partida.

---

## RB38 — Ranking

A classificação da liga será determinada pela pontuação acumulada dos participantes durante o período definido para a competição.

---

## RB39 — Melhor jogador da rodada

Ao término de cada rodada, o participante que obtiver a maior pontuação naquela rodada será reconhecido como melhor jogador da rodada.

---

## RB40 — Medalha

O melhor jogador de cada rodada receberá uma medalha visual associada ao seu perfil dentro daquela liga.

---

## RB41 — Finalidade da medalha

A medalha terá finalidade exclusivamente visual e de incentivo à competição, não concedendo vantagem na pontuação ou na premiação.

---

## RB42 — Critério de desempate

Em caso de empate na classificação, o sistema deverá aplicar o critério de desempate definido pelo administrador no momento da criação da liga.

---

## RB43 — Imutabilidade do desempate

O critério de desempate definido na criação da liga não poderá ser alterado durante sua duração.

---

## RB44 — Saída voluntária

Um participante poderá solicitar sua saída da liga a qualquer momento.

---

## RB45 — Saldo após saída

A saída de um participante não implicará devolução automática do dinheiro associado à liga.

---

## RB46 — Solicitação de devolução

Caso um participante queira recuperar valores após solicitar sua saída, deverá realizar uma solicitação formal ao administrador ou coadministrador.

---

## RB47 — Autorização de devolução

A devolução do dinheiro de um participante que deixou a liga somente poderá ocorrer mediante autorização do administrador ou coadministrador, respeitando as regras previamente estabelecidas para a liga.

---

## RB48 — Remoção de participante

O administrador e o coadministrador não poderão remover unilateralmente um participante da liga.

---

## RB49 — Encerramento da liga

A liga será encerrada automaticamente quando atingir o período final definido durante sua criação.

---

## RB50 — Determinação do vencedor

Ao encerramento da liga, o sistema deverá determinar o vencedor ou vencedores de acordo com a pontuação acumulada e o critério de desempate definido na criação.

---

## RB51 — Modelo de premiação

O valor ou modelo de distribuição da premiação deverá ser definido pelo administrador no momento da criação da liga e não poderá ser alterado posteriormente.

---

## RB52 — Solicitação do prêmio

Após o encerramento da liga, o vencedor poderá solicitar o recebimento da premiação disponível.

---

## RB53 — Registro das movimentações financeiras

Todas as entradas, pagamentos, devoluções, assinaturas e premiações deverão ser registradas e vinculadas ao respectivo usuário e à operação correspondente.

---

## RB54 — Integridade financeira

O sistema deverá manter a correspondência entre os valores financeiros registrados, os participantes, as ligas e as respectivas operações realizadas.

---

## RB55 — Pagamento da assinatura Premium

A ativação do plano Premium dependerá da confirmação do pagamento da assinatura.

---

## RB56 — Cancelamento do Premium

O cancelamento da assinatura Premium não deverá cancelar automaticamente os bolões já existentes.

---

## RB57 — Limite de criação

Um usuário não poderá criar um novo bolão quando já tiver atingido o limite de criação correspondente ao seu plano.

---

## RB58 — Resultado ao vivo por bolão

O recurso de acompanhamento ao vivo será determinado pelo plano do usuário responsável pela criação do bolão e permanecerá associado àquele bolão conforme as regras definidas pela plataforma.

---

## RB59 — Administração das solicitações

Solicitações de entrada, devolução e outras operações administrativas deverão ser analisadas pelo administrador ou coadministrador conforme as permissões atribuídas.

---

## RB60 — Proibição de alteração manual dos resultados

Nenhum usuário com função administrativa poderá alterar manualmente resultados oficiais obtidos pela API esportiva.

---

## RB61 — Aceite da entrada tardia

O usuário que ingressar em uma liga em andamento deverá confirmar explicitamente que está ciente das oportunidades de palpites que já foram encerradas.

---

## RB62 — Participação financeira

A confirmação da participação financeira em uma liga dependerá do pagamento da taxa de entrada quando esta estiver definida.

---

## RB63 — Vencedor e premiação

Somente participantes elegíveis ao final da competição poderão receber a premiação definida nas regras da liga.

---

## RB64 — Histórico das regras

As regras definidas no momento da criação deverão permanecer associadas à liga durante todo o seu ciclo de vida para fins de consulta e rastreabilidade.

---

## RB65 — Registro do aceite

O sistema deverá manter o registro do aceite das regras realizado por cada participante antes da confirmação de sua entrada na liga.