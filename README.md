# Palpite League

## 🎓 Sobre o Projeto

Este projeto foi desenvolvido como parte dos requisitos práticos da disciplina de **Modelagem de Sistemas**, do 4º semestre do curso de **Engenharia da Computação** da **Universidade Presbiteriana Mackenzie**.

### 👥 Equipe Desenvolvedora

O grupo é formado por três estudantes:

* **Felipe Azoia Ferracioli** - RA: 10736997
* **Eduardo Braga Sena** - RA: 10436266
* **João Ricardo** - RA: 

O **Palpite League** é uma plataforma de criação e gerenciamento de ligas privadas de palpites esportivos focada no Campeonato Brasileiro. O sistema permite que grupos compitam através de apostas com recompensas reais, automatizando a coleta de resultados oficiais, o cálculo de pontuações, a gestão financeira e o ranqueamento dos participantes.

## 🎯 Principais Funcionalidades

* **Regras Customizáveis e Imutáveis:** Na criação da liga, o administrador define a taxa de entrada, a premiação, a duração (rodadas) e os critérios de desempate. Esses parâmetros são bloqueados e não podem ser alterados após a criação.
* **Resultados Automatizados:** Os placares oficiais são obtidos exclusivamente através de integração com uma API esportiva externa. Para garantir a integridade do sistema, nenhum usuário ou administrador pode inserir ou alterar resultados manualmente.
* **Opções de Palpite:** Os participantes escolhem entre apostar no resultado geral da partida (vitória/empate/derrota) ou no placar exato. Os palpites podem ser feitos ou alterados até o horário exato de início do jogo.
* **Ranking e Gamificação:** O sistema mantém uma classificação cumulativa e distribui medalhas e emblemas visuais aos maiores pontuadores de cada rodada.
* **Gestão de Membros:** 
  * Entrada via convite (link ou interno) com necessidade de aceite explícito dos termos de uso e validação final do administrador.
  * Jogadores que entram com a liga em andamento recebem um aviso claro sobre a desvantagem competitiva.
  * O administrador não possui poder de exclusão arbitrária; saídas com devolução do dinheiro exigem aprovação via pedido formal.

## 👥 Perfis de Usuário

* **Administrador / Coadministrador:** Responsável por criar a liga, configurar as regras iniciais, convidar e aprovar membros, e selecionar os jogos disponíveis para aposta.
* **Participante:** Usuário que recebe o convite, aceita os termos, realiza o pagamento de entrada e gerencia seus palpites a cada rodada.

## 🔄 Fluxo Principal do Sistema

1. **Setup:** Criação da liga → Definição de regras → Disparo de convites.
2. **Onboarding:** Participante aceita as regras → Realiza o pagamento via integração externa (ex: Pix/Mercado Pago) → Administrador aprova a entrada.
3. **Competição:** Participante registra o palpite → Partida inicia (palpites bloqueados) → API de esportes fornece o resultado oficial.
4. **Resolução:** Sistema calcula a pontuação → Atualiza o ranking geral da liga → Atribui o emblema ao melhor da rodada.
5. **Encerramento:** Liga atinge a rodada limite → Vencedor é calculado com base nas regras e critérios de desempate → Sistema libera o botão para o vencedor solicitar o recebimento da premiação.

## 🛠️ Tecnologias e Arquitetura

...


> **Aviso Acadêmico:** Este repositório reflete um projeto de modelagem de sistemas. As funcionalidades envolvendo transações financeiras e apostas com dinheiro real são protótipos acadêmicos para estudo da matéria, não possuindo adequação legal e regulatória para uso em ambiente de produção no Brasil.