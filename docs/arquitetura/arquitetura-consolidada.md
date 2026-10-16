# Documento de Arquitetura Consolidado — Palpite League

## 1. Visão geral

O Palpite League é uma plataforma web para criação e gerenciamento de bolões privados de palpites esportivos, com foco no Campeonato Brasileiro. O sistema permite que administradores criem competições, convidem participantes, definam regras imutáveis, coletem palpites, calcular pontuação automaticamente e apresentar o ranking de forma consistente.

A solução foi concebida como um protótipo acadêmico, com regras de negócio fortes, validação no backend e integração externa somente em ambiente de teste. A ênfase está em preservar integridade dos dados, evitar manipulação manual de resultados e manter a lógica de pontuação e participação centralizada na aplicação.

## 2. Escopo do projeto

### 2.1. Objetivos

- permitir a criação de bolões privados;
- controlar as regras do bolão de forma imutável;
- permitir convite e aprovação de participantes;
- aceitar palpites respeitando o prazo da partida;
- obter resultados oficiais de uma API esportiva;
- calcular pontuação e ranking automaticamente;
- manter registros financeiros e de participação em ambiente de teste;
- oferecer suporte acadêmico e demonstrável em ambiente local.

### 2.2. Não escopo

- pagamento real ou movimentação financeira ativa em produção;
- integração de premiação de produção;
- operação com credenciais de produção;
- infraestrutura de deploy em ambiente de produção;
- uso de microserviços sem necessidade demonstrada.

## 3. Drivers arquiteturais

Os principais drivers que orientam a arquitetura são:

- preservação das regras e integridade do bolão;
- obtenção de resultados oficiais a partir de fonte externa;
- rastreabilidade e consistência das operações financeiras de teste;
- autorização e papéis por bolão;
- modularização interna sem complexidade operacional desnecessária;
- compatibilidade com navegadores modernos e telas responsivas.

Esses drivers estão alinhados com os documentos de requisitos, regras de negócio e ADRs do projeto.

## 4. Contexto de negócio

O produto atende a dois perfis principais:

- administrador: cria o bolão, define regras, seleciona partidas, convida usuários e aprova participação;
- participante: recebe convite, aceita as regras, registra palpites, acompanha classificação e medalhas, e pode sair ou solicitar devolução.

O sistema também considera dois perfis financeiros em ambiente de teste:

- assinatura Premium;
- taxa de entrada do bolão;
- devolução e premiação, quando suportadas e validadas no sandbox.

## 5. Requisitos centrais que orientam a arquitetura

### 5.1. Funcionais

A arquitetura precisa suportar os principais fluxos:

- cadastro, autenticação e recuperação de acesso;
- criação de bolão com regras imutáveis;
- convite e aprovação de participantes;
- aceite de regras e confirmação de entrada tardia;
- realização e bloqueio de palpites;
- consulta e sincronização do resultado oficial;
- cálculo da pontuação e atualização do ranking;
- concessão de medalhas por rodada;
- encerramento de bolão e definição do vencedor;
- controle de pagamentos e movimentações financeiras de teste;
- solicitação de devolução e gestão administrativa.

### 5.2. Não funcionais

Os requisitos não funcionais estabelecem a base para qualidade técnica e operação local do protótipo:

- segurança de dados e controle de acesso;
- integridade e consistência de dados;
- rastreabilidade de operações;
- disponibilidade adequada para demonstração local;
- desempenho aceitável em carga acadêmica;
- compatibilidade em navegadores modernos;
- responsividade em diferentes larguras de tela;
- auditoria financeira e observabilidade;
- modularidade e manutenibilidade.

### 5.3. Regras de negócio essenciais

- o plano do usuário não limita a quantidade de bolões em que ele participa;
- o plano define o limite de criação de bolões;
- as regras do bolão são definidas na criação e não podem ser alteradas;
- o administrador e o coadministrador não podem alterar resultado oficial manualmente;
- cada participante escolhe apenas um tipo de palpite por partida;
- palpites só podem ser alterados até o início da partida;
- a pontuação é calculada automaticamente pelo sistema;
- a classificação depende da pontuação acumulada e do critério de desempate;
- a saída não gera devolução automática;
- devolução e premiação dependem de autorização e confirmação do provedor de teste.

## 6. Visão funcional do sistema

A aplicação é estrutura em torno de seis grandes áreas de responsabilidade:

1. identidade e acesso;
2. gestão de bolões e participações;
3. gestão de palpites e partidas;
4. resultados, pontuação e ranking;
5. pagamentos e assinaturas em ambiente de teste;
6. notificações e auditoria.

Essas responsabilidades devem ser separadas internamente para manter acoplamento baixo e regras de domínio independentes da interface.

## 7. Modelo de domínio

O domínio principal é composto por entidades como:

- Usuario
- Assinatura
- Bolao
- Participacao
- Convite
- Rodada
- Partida
- Time
- Palpite
- Medalha
- MovimentacaoFinanceira
- SolicitacaoDevolucao
- Notificacao

Esses conceitos são descritos em profundidade em [modelo-dominio.md](modelo-dominio.md). O modelo conceitual centraliza as relações críticas do sistema:

- um usuário cria bolões;
- um bolão tem participantes com papéis específicos;
- cada participação pode gerar palpites;
- cada partida recebe resultados oficiais;
- cada palpite gera pontuação;
- cada rodada pode gerar medalhas;
- cada operação financeira é registrada em movimento auditável.

## 8. Arquitetura proposta

### 8.1. Estilo arquitetural

A decisão adotada é um monólito modular, com responsabilidades separadas em módulos do domínio e sem necessidade de microserviços neste estágio.

A estrutura é organizada em módulos internos, como:

- autenticação e usuários;
- bolões e participações;
- partidas e resultados;
- palpites e pontuação;
- pagamentos e assinaturas;
- notificações e auditoria;
- integração externa com API esportiva e provedor de pagamentos.

### 8.2. Camadas lógicas

A arquitetura pode ser entendida em camadas:

- apresentação: frontend web em React;
- aplicação: API em Node.js com Express;
- domínio: regras de negócio, validações e invariantes;
- persistência: SQLite para protótipo local;
- integrações externas: API esportiva e APIs de pagamento em ambiente de teste;
- observabilidade: logs, auditoria e rastreabilidade.

### 8.3. Comunicação entre camadas

- a interface web se comunica com a API backend via HTTP;
- o backend centraliza validações de autorização e regras de domínio;
- a persistência armazena estado do bolão, participantes, palpites e movimentações;
- as integrações externas são isoladas em adaptadores específicos para evitar acoplamento com o domínio.

## 9. Integrações externas

### 9.1. API esportiva

A arquitetura prevê integração com uma API esportiva para obter:

- partidas do campeonato;
- status de partidas;
- placares finais;
- informações necessárias para apuração automática.

A API esportiva não pode ser a origem de alteração manual de resultado. O resultado oficial é produto da sincronização automática e do adaptador externo, e não de edição administrativa.

### 9.2. Mercado Pago em ambiente de teste

A integração financeira é tratada como ambiente de teste, não de produção.

Fluxos previstos:

- assinatura Premium;
- taxa de entrada;
- eventuais reembolsos;
- repasse de premiação, somente se validado no sandbox.

Se o sandbox não suportar o repasse posterior da premiação, a demonstração pode utilizar um simulador explicitamente identificado, mas isso não deve ser apresentado como integração concluída.

## 10. Fluxos principais da arquitetura

### 10.1. Criação de bolão

1. usuário autenticado solicita criação;
2. backend valida o plano e o limite de criação;
3. aplicação registra bolão com regras definidas;
4. sistema cria participação do administrador;
5. convites são disponibilizados para os convidados.

### 10.2. Entrada e aprovação

1. usuário acessa o convite;
2. aceita as regras do bolão;
3. administrador ou coadministrador aprova ou rejeita;
4. se houver taxa, o participante aguarda confirmação do pagamento;
5. a participação é confirmada somente após aprovação e pagamento validado.

### 10.3. Palpite

1. participante acessa partida disponível;
2. sistema valida se a partida está aberta para palpite;
3. participante registra resultado ou placar exato;
4. backend valida prazo, tipo de palpite e participação;
5. palpite é persistido ou substituído antes do início da partida.

### 10.4. Apuração e classificação

1. sistema consulta a API esportiva;
2. resultado final é validado;
3. cálculo de pontuação é executado;
4. ranking do bolão é atualizado;
5. medalhas são atribuídas às maiores pontuações da rodada.

### 10.5. Encerramento do bolão

1. período definido é atingido;
2. sistema calcula classificação final;
3. critério de desempate é aplicado;
4. vencedor ou vencedores são registrados;
5. premiação pode ser solicitada e processada somente se a operação for validada.

## 11. Considerações de segurança e integridade

A arquitetura deve garantir que:

- regras do domínio sejam validadas no backend;
- a interface não seja a única camada de proteção;
- permissões por papel sejam verificadas em cada operação administrativa;
- dados sensíveis não sejam expostos em logs;
- resultados oficiais não sejam editados manualmente;
- operações financeiras tenham histórico auditável;
- operações pendentes não sejam duplicadas.

## 12. Tecnologia confirmada para o protótipo

A solução proposta para o protótipo acadêmico é:

- frontend: React + JavaScript + Vite;
- backend: Node.js + Express;
- persistência: SQLite;
- integração esportiva: adaptador isolado para a API esportiva escolhida;
- pagamentos: Mercado Pago em ambiente de teste;
- hospedagem e implantação: fora do escopo desta etapa.

## 13. Dependências e riscos

### 13.1. Dependências técnicas

- disponibilidade da API esportiva;
- limites e termos do plano da API externa;
- compatibilidade do sandbox do Mercado Pago com reembolso e premiação;
- configuração de credenciais de teste fora do repositório.

### 13.2. Riscos principais

- falha da API esportiva afetando a sincronização;
- operação financeira pendente ou indecisa no sandbox;
- inconsistência entre documentação e comportamento real do provedor;
- regras de negócio mal alinhadas com a implementação.

## 14. Status atual

Este documento consolida os artefatos existentes do repositório e representa a arquitetura-base do projeto. Ele está alinhado com os documentos de visão, requisitos, regras de negócio, domínio e ADRs, mas deve continuar sendo revisado à medida que as decisões técnicas forem validadas e a implementação for executada.

## 15. Referências internas

- [docs/visao.md](../visao.md)
- [docs/requisitos/RF.md](../requisitos/RF.md)
- [docs/requisitos/RNF.md](../requisitos/RNF.md)
- [docs/requisitos/RB.md](../requisitos/RB.md)
- [docs/modelo-dominio.md](../modelo-dominio.md)
- [docs/uml/casos-de-uso.md](../uml/casos-de-uso.md)
- [docs/arquitetura/drivers-arquiteturais.md](drivers-arquiteturais.md)
- [docs/arquitetura/validacao-mercado-pago.md](validacao-mercado-pago.md)
- [docs/arquitetura/adr/README.md](adr/README.md)
