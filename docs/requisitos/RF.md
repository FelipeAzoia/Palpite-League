# Requisitos Funcionais — Palpite League

## RF01 — Cadastro de usuário

**Tipo EARS: Event-driven**

Quando um visitante solicitar seu cadastro, o sistema deverá permitir o registro de uma nova conta mediante o preenchimento dos dados obrigatórios.

---

## RF02 — Autenticação do usuário

**Tipo EARS: Event-driven**

Quando um usuário informar credenciais válidas, o sistema deverá autenticar o usuário e disponibilizar as funcionalidades correspondentes ao seu perfil e plano.

---

## RF03 — Recuperação de acesso

**Tipo EARS: Event-driven**

Quando um usuário solicitar a recuperação de acesso, o sistema deverá iniciar o processo de redefinição de senha utilizando o mecanismo de recuperação configurado.

---

## RF04 — Gerenciamento do perfil

**Tipo EARS: Event-driven**

Quando um usuário acessar seu perfil, o sistema deverá permitir a visualização e alteração dos dados pessoais permitidos pela plataforma.

---

## RF05 — Consulta do plano

**Tipo EARS: Event-driven**

Quando um usuário acessar as informações de sua conta, o sistema deverá apresentar seu plano atual, seu status e os recursos disponíveis.

---

## RF06 — Contratação do plano Premium

**Tipo EARS: Event-driven**

Quando um usuário solicitar a contratação do plano Premium, o sistema deverá disponibilizar o processo de pagamento e ativar os recursos Premium após a confirmação da assinatura.

---

## RF07 — Consulta da assinatura

**Tipo EARS: Event-driven**

Quando um usuário acessar sua assinatura Premium, o sistema deverá apresentar seu status, período de vigência e informações relacionadas à cobrança.

---

## RF08 — Cancelamento da assinatura

**Tipo EARS: Event-driven**

Quando um usuário solicitar o cancelamento da assinatura Premium, o sistema deverá registrar a solicitação e interromper novas cobranças conforme as condições da assinatura.

---

## RF09 — Criação de bolão

**Tipo EARS: Event-driven**

Quando um usuário solicitar a criação de um bolão, o sistema deverá verificar seu plano e permitir a criação caso o usuário esteja dentro do limite de bolões permitido.

---

## RF10 — Configuração do bolão

**Tipo EARS: Event-driven**

Quando o administrador criar um bolão, o sistema deverá permitir a definição do nome, período de duração, taxa de entrada, modelo de premiação, partidas participantes e critério de desempate.

---

## RF11 — Consulta das regras do bolão

**Tipo EARS: Event-driven**

Quando um usuário acessar um bolão, o sistema deverá apresentar suas regras, condições de participação, período de duração, taxa de entrada e modelo de premiação.

---

## RF12 — Convite para participação

**Tipo EARS: Event-driven**

Quando o administrador ou coadministrador convidar um usuário, o sistema deverá disponibilizar um convite por link ou mecanismo interno da plataforma.

---

## RF13 — Solicitação de entrada

**Tipo EARS: Event-driven**

Quando um usuário utilizar um convite válido para um bolão privado, o sistema deverá registrar sua solicitação de participação.

---

## RF14 — Aprovação de participante

**Tipo EARS: Event-driven**

Quando o administrador ou coadministrador analisar uma solicitação de entrada, o sistema deverá permitir sua aprovação ou rejeição.

---

## RF15 — Aceite das regras

**Tipo EARS: Event-driven**

Quando um usuário solicitar entrada em um bolão, o sistema deverá apresentar as regras da competição e registrar seu aceite antes da confirmação da participação.

---

## RF16 — Entrada tardia

**Tipo EARS: Event-driven**

Quando um usuário solicitar entrada em um bolão que já esteja em andamento, o sistema deverá informar que ele não poderá realizar palpites referentes às partidas anteriores à sua entrada e solicitar sua confirmação.

---

## RF17 — Gerenciamento de coadministrador

**Tipo EARS: Event-driven**

Quando o administrador selecionar um participante para exercer a função de coadministrador, o sistema deverá atribuir as permissões administrativas correspondentes.

---

## RF18 — Gerenciamento das partidas

**Tipo EARS: Event-driven**

Quando o administrador ou coadministrador configurar as partidas de um bolão, o sistema deverá permitir a seleção individual de partidas ou de todas as partidas de determinadas rodadas.

---

## RF19 — Gerenciamento de solicitações financeiras

**Tipo EARS: Event-driven**

Quando houver uma solicitação de devolução ou outra movimentação financeira que dependa de aprovação administrativa, o sistema deverá disponibilizá-la para análise do administrador ou coadministrador.

---

## RF20 — Realização de palpite

**Tipo EARS: Event-driven**

Quando um participante selecionar uma partida disponível para palpite, o sistema deverá permitir a realização de um palpite de resultado ou de placar exato.

---

## RF21 — Alteração de palpite

**Tipo EARS: Event-driven**

Quando um participante solicitar a alteração de um palpite antes do início da partida, o sistema deverá atualizar o palpite registrado.

---

## RF22 — Bloqueio de palpite após o início

**Tipo EARS: Unwanted behavior**

Se um participante tentar realizar, alterar ou substituir um palpite após o início da partida, então o sistema deverá impedir a operação e informar que o prazo para palpites foi encerrado.

---

## RF23 — Consulta de resultados oficiais

**Tipo EARS: Event-driven**

Quando uma partida participante de um bolão for encerrada, o sistema deverá consultar a API esportiva integrada e registrar seu resultado oficial.

---

## RF24 — Atualização de resultados ao vivo

**Tipo EARS: Optional-feature**

Onde o bolão possuir o recurso de resultados ao vivo, o sistema deverá consultar periodicamente a API esportiva integrada e atualizar as informações da partida durante sua realização.

---

## RF25 — Bloqueio de alteração do resultado oficial

**Tipo EARS: Unwanted behavior**

Se um administrador ou coadministrador tentar inserir, editar ou substituir manualmente o resultado oficial de uma partida, então o sistema deverá impedir a operação.

---

## RF26 — Cálculo da pontuação

**Tipo EARS: Event-driven**

Quando o resultado oficial de uma partida estiver disponível, o sistema deverá comparar o resultado com os palpites registrados e calcular automaticamente a pontuação dos participantes.

---

## RF27 — Atualização do ranking

**Tipo EARS: Event-driven**

Quando uma pontuação for calculada, o sistema deverá atualizar a classificação acumulada dos participantes do bolão.

---

## RF28 — Identificação do melhor jogador da rodada

**Tipo EARS: Event-driven**

Quando uma rodada participante do bolão for encerrada, o sistema deverá identificar o participante com maior pontuação na rodada.

---

## RF29 — Concessão de medalha

**Tipo EARS: Event-driven**

Quando o melhor jogador da rodada for identificado, o sistema deverá associar uma medalha visual ao seu perfil dentro do bolão.

---

## RF30 — Pagamento da taxa de entrada

**Tipo EARS: Event-driven**

Quando um participante ingressar em um bolão que possua taxa de entrada, o sistema deverá disponibilizar o processo de pagamento e registrar sua participação financeira após a confirmação do pagamento.

---

## RF31 — Registro de movimentação financeira

**Tipo EARS: Event-driven**

Quando ocorrer uma entrada, pagamento, devolução, assinatura ou premiação, o sistema deverá registrar a movimentação financeira associada ao usuário e à operação correspondente.

---

## RF32 — Solicitação de saída do bolão

**Tipo EARS: Event-driven**

Quando um participante solicitar sua saída de um bolão, o sistema deverá registrar a solicitação e encerrar sua participação nas próximas atividades da competição.

---

## RF33 — Solicitação de devolução

**Tipo EARS: Event-driven**

Quando um participante solicitar sua saída e desejar recuperar valores associados ao bolão, o sistema deverá registrar uma solicitação de devolução para análise administrativa.

---

## RF34 — Aprovação de devolução

**Tipo EARS: Event-driven**

Quando o administrador ou coadministrador aprovar uma solicitação de devolução, o sistema deverá registrar a autorização e iniciar o processo de devolução financeira.

---

## RF35 — Encerramento automático do bolão

**Tipo EARS: Event-driven**

Quando o período definido para o bolão for atingido, o sistema deverá encerrar automaticamente a competição.

---

## RF36 — Determinação do vencedor

**Tipo EARS: Event-driven**

Quando um bolão for encerrado, o sistema deverá determinar o vencedor ou vencedores aplicando a pontuação e o critério de desempate definidos na criação.

---

## RF37 — Solicitação de premiação

**Tipo EARS: Event-driven**

Quando um bolão for encerrado e um participante for identificado como vencedor, o sistema deverá disponibilizar a solicitação de recebimento da premiação.

---

## RF38 — Bloqueio de criação acima do limite

**Tipo EARS: Unwanted behavior**

Se um usuário tentar criar um bolão quando já tiver atingido o limite permitido pelo seu plano, então o sistema deverá impedir a criação e informar a necessidade de adequação ao limite ou contratação do plano Premium.

---

## RF39 — Notificação de eventos

**Tipo EARS: Event-driven**

Quando ocorrer um evento relevante para o usuário, como aprovação de entrada, atualização de resultado, encerramento de rodada, recebimento de medalha, alteração de assinatura ou conclusão de premiação, o sistema deverá disponibilizar uma notificação correspondente.

---

## RF40 — Consulta do histórico do bolão

**Tipo EARS: Event-driven**

Quando um participante acessar o histórico de um bolão, o sistema deverá apresentar informações sobre partidas, palpites, pontuações, ranking e resultados registrados durante sua participação.