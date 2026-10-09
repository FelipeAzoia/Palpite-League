# Palpite League

## 🎓 Sobre o Projeto

Este projeto foi desenvolvido como parte dos requisitos práticos da disciplina de **Modelagem de Sistemas**, do 4º semestre do curso de **Engenharia da Computação** da **Universidade Presbiteriana Mackenzie**.

### 👥 Equipe Desenvolvedora

O grupo é formado por três estudantes:

* **Felipe Azoia Ferracioli** - RA: 10736997
* **Eduardo Braga Sena** - RA: 10436266
* **João Ricardo Gomes Ferreira** - RA: 10737497

O **Palpite League** é uma plataforma de criação e gerenciamento de bolões privados de palpites esportivos focada no Campeonato Brasileiro. O sistema automatiza a coleta de resultados oficiais, o cálculo de pontuações e o ranqueamento. As operações financeiras fazem parte de uma simulação acadêmica: a entrega final prevê integração com o Mercado Pago exclusivamente em ambiente de teste, sem movimentação de dinheiro real.

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
* **Participante:** Usuário que recebe o convite, aceita as regras, aguarda aprovação e, quando houver taxa, conclui o pagamento em ambiente de teste antes de ter a participação confirmada; depois gerencia seus palpites a cada rodada.

## 🔄 Fluxo Principal do Sistema

1. **Setup:** Criação do bolão → Definição de regras → Disparo de convites.
2. **Onboarding:** Participante aceita as regras → Administrador aprova a entrada → Participante realiza o pagamento pelo Mercado Pago em ambiente de teste, se houver taxa → Sistema confirma a participação após confirmação do pagamento.
3. **Competição:** Participante registra o palpite → Partida inicia (palpites bloqueados) → API de esportes fornece o resultado oficial.
4. **Resolução:** Sistema calcula a pontuação → Atualiza o ranking geral do bolão → Atribui medalhas aos participantes empatados na maior pontuação da rodada.
5. **Encerramento:** Bolão atinge a rodada limite → Vencedor(es) é/são calculado(s) com base nas regras e critérios de desempate → O vencedor solicita a premiação, processada pelo provedor em ambiente de teste se suportada e confirmada.

## Documentação de análise

Os atores, o diagrama de casos de uso e os fluxos principais estão descritos em [Casos de Uso](docs/uml/casos-de-uso.md).

## 🛠️ Tecnologias e Arquitetura

...


> **Aviso Acadêmico:** Este repositório reflete um projeto de modelagem de sistemas. As integrações financeiras são destinadas exclusivamente a ambiente de teste e simulação, sem movimentação de dinheiro real. O projeto não está preparado para operação financeira em produção.
