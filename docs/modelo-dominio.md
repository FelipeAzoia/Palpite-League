# Modelo de Domínio — Palpite League

O sistema organiza bolões privados de palpites sobre partidas do Brasileirão, com plano gratuito e premium, taxa de entrada, premiação e apuração automática via API esportiva. Quatorze conceitos sustentam essa organização. Cada um existe por uma razão de negócio, refletindo as regras de negócio (RB) e requisitos funcionais (RF) já definidos para o projeto.

> Nota de nomenclatura: **Bolão** é o termo canônico usado neste modelo para a competição privada de palpites.

## Os conceitos

**Usuario** é quem acessa o sistema. Guarda identidade, contato e o plano atual (Gratuito ou Premium), que determina quantos bolões pode criar simultaneamente (RB01, RB02, RB03).

**Assinatura** representa a contratação paga do plano Premium, com vigência e cobrança recorrente (RB04, RB55). Existe separada de Usuario porque tem ciclo de vida próprio: pode expirar ou ser cancelada sem afetar bolões já criados (RB09, RB10, RB11).

**Carteira** guarda o saldo em dinheiro real do usuário.

**MovimentacaoFinanceira** registra toda entrada, pagamento, devolução, assinatura ou premiação, vinculada ao usuário e à operação de origem (RB53, RB54, RNF10). Existe separada de Carteira porque o histórico financeiro precisa ser auditável, não apenas o saldo atual.

**Bolão** é o espaço privado onde os palpites acontecem. Tem um criador, um período de duração, uma taxa de entrada, um modelo de premiação e um critério de desempate — todos definidos na criação e imutáveis depois (RB13, RB14, RB15, RB23, RB43, RB51). Também guarda se oferece acompanhamento de resultado ao vivo, recurso exclusivo de bolões criados por usuários Premium (RB06, RB58).

**Convite** é o mecanismo pelo qual um usuário é habilitado a solicitar entrada em um bolão privado (RB17, RF12).

**Participacao** representa a entrada de um usuário em um bolão específico, com um papel (administrador, coadministrador ou participante), um status de aprovação, o registro do aceite das regras e a pontuação acumulada naquele bolão (RB13, RB16, RB18, RB19, RB65). Também guarda se a entrada foi tardia, o que restringe quais partidas podem receber palpite (RB20, RB21).

**Rodada** é uma rodada oficial do Brasileirão, usada para selecionar partidas em bloco na configuração de um bolão (RB24).

**Partida** é o confronto entre dois times em uma rodada. Guarda o placar oficial, obtido exclusivamente pela API esportiva integrada e nunca alterável manualmente (RB29, RB30, RB60).

**Time** é um clube do Brasileirão. Aparece em uma partida ora como mandante, ora como visitante.

**Palpite** é o registro que um participante faz para uma partida, sendo obrigatoriamente de um único tipo — resultado ou placar exato — nunca os dois (RB25, RB26). Só pode ser criado ou alterado até o início da partida (RB27, RB28) e concentra a regra de pontuação: 2 pontos por acertar o resultado, 5 pontos por acertar o placar exato, 0 pontos em caso de erro (RB34–RB37).

**Medalha** reconhece o melhor jogador de uma rodada dentro de um bolão. Tem finalidade apenas visual e de incentivo, sem efeito na pontuação ou na premiação (RB39, RB40, RB41).

**SolicitacaoDevolucao** representa o pedido formal de um participante que já saiu do bolão para reaver valores associados a ele, dependente de aprovação administrativa (RB44, RB45, RB46, RB47).

**Notificacao** avisa o usuário sobre eventos relevantes, como aprovação de entrada, atualização de resultado, encerramento de rodada, medalha recebida, alteração de assinatura ou premiação concluída (RF39).

## Como os conceitos se ligam

Um **Usuario** cria de zero a muitos **Bolões**. Cada Bolão tem exatamente um Usuario como criador, que assume automaticamente os papéis de administrador e participante (RB13).

Um **Usuario** possui exatamente uma **Carteira** (composição) e contrata de zero a muitas **Assinaturas** ao longo do tempo (RB04, RF06).

Um **Usuario** possui de zero a muitas **Participacoes**, uma por bolão do qual participa (RB05: o plano não limita quantos bolões o usuário pode participar, só quantos pode criar).

Um **Bolão** contém de uma a muitas **Participacoes** — composição, pois a participação não existe fora do bolão (RB13, RB18).

Um **Bolão** gera de zero a muitos **Convites**. Cada Convite refere-se a um usuário convidado (RB17).

Um **Bolão** seleciona de zero a muitas **Partidas**, individualmente ou por rodada inteira; cada Partida pode ser selecionada por vários bolões ao mesmo tempo (RB24).

Uma **Rodada** contém de uma a muitas **Partidas** (composição).

Cada **Partida** tem exatamente um **Time** mandante e exatamente um **Time** visitante; um Time aparece em zero ou muitas partidas em cada papel.

Uma **Participacao** registra de zero a muitos **Palpites**. Cada Palpite refere-se a exatamente uma Partida, e cada Partida recebe de zero a muitos Palpites (RB27, RB28).

Uma **Participacao** pode conquistar de zero a muitas **Medalhas**; cada Medalha refere-se a exatamente uma Rodada e a exatamente uma Participacao (RB39, RB40).

Uma **Participacao** pode gerar de zero a muitas **SolicitacoesDevolucao**, cada uma associada a exatamente uma Participacao (RB46).

Uma **Carteira** registra de zero a muitas **MovimentacoesFinanceiras** (RB53). Cada MovimentacaoFinanceira pode referenciar opcionalmente um **Bolão** (taxa de entrada, devolução ou premiação) ou uma **Assinatura** (pagamento do plano Premium) (RB55, RF30, RF31, RF34).

Um **Usuario** recebe de zero a muitas **Notificacoes** (RF39).
