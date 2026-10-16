# Documento de Arquitetura Consolidado — Palpite League

## 1. Visão geral

O Palpite League é uma plataforma web para criação e gerenciamento de bolões privados de palpites esportivos, com foco no Campeonato Brasileiro. O sistema permite que administradores criem competições, convidem participantes, definam regras imutáveis, coletem palpites, calcular pontuação automaticamente e apresentar o ranking de forma consistente.

A solução foi concebida como um protótipo acadêmico, com regras de negócio fortes, validação no backend e integração externa somente em ambiente de teste. A ênfase está em preservar integridade dos dados, evitar manipulação manual de resultados e manter a lógica de pontuação e participação centralizada na aplicação.

## 2. Decisões técnicas

### 2.1. Decisão arquitetural principal

A arquitetura do Palpite League foi definida como um monólito modular. A justificativa é manter o projeto simples, fácil de operar em contexto acadêmico e com responsabilidades organizadas em módulos de domínio. Isso reduz o acoplamento entre usuários, bolões, palpites, pagamentos e resultados, sem introduzir complexidade de infraestrutura desnecessária.

**Status:** proposta formalmente registrada em ADR-0001.

### 2.2. Decisão de persistência

Foi escolhida a persistência local com SQLite, usando acesso direto via SQL e driver Node.js. Essa escolha atende ao escopo do protótipo, permitindo execução local simples, testes automatizados sem dependência de serviços externos e persistência suficiente para bolões, participantes, palpites e movimentações financeiras de teste.

**Status:** aceita para a etapa de protótipo acadêmico.

### 2.3. Decisão de API esportiva

Foi definida como candidata principal a integração com a API-Football da API-Sports, mantendo o adaptador isolado do núcleo do domínio. A integração deve ser validada antes da implementação final, confirmando cobertura do Brasileirão, limites, custo, frequência de atualização e termos de uso.

**Status:** recomendação para aprovação e validação técnica, conforme ADR-0002.

### 2.4. Decisão de pagamentos e assinaturas

A solução usa o Mercado Pago em ambiente de teste para:

- assinatura Premium via API de Assinaturas;
- taxa de entrada via Checkout Pro;
- registro de movimentações financeiras e estados pendentes/confirmados.

A premiação e a devolução não são tratadas como integrações já concluídas. Essas operações exigem validação específica do sandbox e devem permanecer explícitas como pendentes até confirmação prática.

**Status:** aceita como decisão de protótipo, mas com validação sandbox pendente, conforme ADR-0003 e a validação documental do Mercado Pago.

### 2.5. Decisão de tecnologia de interface e backend

Foram confirmadas as tecnologias do protótipo:

- frontend: React com JavaScript e Vite;
- backend: Node.js com Express;
- banco: SQLite;
- integração externa: adaptadores isolados para API esportiva e provedor financeiro.

**Status:** aceita para o protótipo, conforme ADR-0004.

### 2.6. Decisão sobre premiação simulada

Se o sandbox do Mercado Pago não oferecer repasse posterior de premiação, a demonstração pode usar um simulador identificado explicitamente como simulação. Esse simulador não conta como integração concluída de premiação e não deve ser apresentado como operação validada pelo provedor.

**Status:** fallback acadêmico permitido, desde que claramente identificado.

### 2.7. Decisão de validação de regras de domínio

As regras regradas por domínio, como imutabilidade do bolão, papéis por bolão, exclusividade de tipo de palpite e bloqueio de palpites, devem ser validadas no backend, não apenas na interface. Isso evita que clientes externos ou chamadas diretas bypassem a regra.

**Status:** proposta e alinhada ao ADR-0005.

## 3. ADRs

### 3.1. ADR-0001 — monólito modular

O projeto decidiu manter um monólito modular como estilo arquitetural principal. A proposta mantém a aplicação em um único backend, com módulos internos para separar autenticação, bolões, palpites, resultados, pagamentos e auditoria.

**Status:** proposto. A decisão é coerente com o escopo acadêmico e reduz complexidade operacional, mas ainda precisa ser confirmada como decisão final do projeto.

### 3.2. ADR-0002 — integração com API esportiva

A solução deve obter partidas e resultados oficiais por meio de uma API esportiva externa, com isolamento do adaptador para não espalhar detalhes do provedor pelo domínio. A API-Football foi indicada como candidata principal.

**Status:** recomendação para aprovação e validação técnica. A decisão depende de confirmação de cobertura do Brasileirão, limites, custos e termos de uso.

### 3.3. ADR-0003 — pagamentos em ambiente de teste

O sistema usará o Mercado Pago em ambiente de teste para assinatura Premium e taxa de entrada. A validação de devolução e premiação deve ser tratada separadamente, porque o sandbox não garante que todos os fluxos financeiros tenham suporte equivalente.

**Status:** aceito com validação sandbox pendente. Operações de premiação e reembolso devem continuar identificadas como pendentes até confirmação prática.

### 3.4. ADR-0004 — tecnologias confirmadas

A stack do protótipo foi confirmada com React no frontend, Node.js com Express no backend, SQLite como persistência local e integração externa isolada em adaptadores.

**Status:** aceito.

### 3.5. ADR-0005 — invariantes de domínio

As regras críticas do domínio devem ser validadas no backend, independentemente da interface web. Isso inclui imutabilidade das regras do bolão, papéis por bolão, exclusividade de palpite por partida e bloqueio de palpites após o início da partida.

**Status:** proposto. A decisão é fortemente recomendada e deve ser adotada como regra de implementação.

### 3.6. Síntese do status dos ADRs

- ADR-0001: proposto
- ADR-0002: recomendação para validação
- ADR-0003: aceito, com validação pendente
- ADR-0004: aceito
- ADR-0005: proposto

A conclusão prática recomendada é: os ADRs de tecnologia e protótipo estão em boa base, mas os itens de validação técnica e de decisão final precisam ser fechados antes de considerar a arquitetura totalmente concluída.

## 4. Requisitos não funcionais

Os requisitos não funcionais do Palpite League definem a qualidade mínima esperada para a solução em contexto acadêmico. Neste documento, a maioria deles foi tratada de forma documental e de especificação funcional, sem execução prática de testes de carga, integração ou benchmark de ambiente, salvo confirmação prévia do usuário para validação operacional.

### 4.1. Segurança e controle de acesso

O sistema deve proteger dados pessoais, credenciais, informações financeiras e dados dos bolões. O acesso deve ser restrito por autenticação e pela função do usuário no bolão. Permissões administrativas devem ser verificadas no backend e não depender apenas da interface.

### 4.2. Integridade e consistência de dados

As operações que alteram estado do sistema devem manter consistência entre usuário, bolão, palpite, resultado e movimentação financeira. A lógica de pontuação, ranking, aceite de regras e aprovação de participantes deve ser persistida de forma coerente com os resultados oficiais e com as regras do domínio.

### 4.3. Rastreabilidade e auditoria

Toda operação relevante deve registrar ator, ação, objeto afetado, data e hora em UTC e resultado da operação. Isso inclui eventos de autenticação, aprovação, palpite, sincronização de resultados, ajuste de assinatura e movimentações financeiras em ambiente de teste.

### 4.4. Disponibilidade e desempenho

O sistema deve manter disponibilidade suficiente para demonstração local e responder em limites aceitáveis para o protótipo. Operações locais devem ser executadas em tempo compatível com o ambiente acadêmico, sem depender de serviços externos para funcionamento básico.

### 4.5. Confiabilidade da API esportiva e da integração externa

O sistema deve tratar falhas de API esportiva de forma segura: preservar dados existentes, registrar falhas e evitar aceitação de resultados manuais. O mesmo princípio vale para integrações de pagamento: falhas devem manter o estado anterior e não duplicar cobranças, reembolsos ou pagamentos.

### 4.6. Segurança financeira e auditoria de transações

As operações financeiras do protótipo devem ser executadas apenas em ambiente de teste. Nenhuma credencial de produção, fluxo de dinheiro real ou dado sensível deve ser armazenado no repositório. Operações simuladas devem ser identificadas explicitamente e diferenciadas de transações confirmadas pelo provedor.

### 4.7. Privacidade e não repúdio

Os dados pessoais e financeiros devem ser exibidos apenas para usuários autorizados. Além disso, o sistema deve manter evidência auditável de ações como aceitação das regras, alteração de palpite, aprovação de participante e movimentação financeira, sem perder histórico anterior.

### 4.8. Compatibilidade, responsividade e uso em navegadores

A interface deve manter os fluxos principais acessíveis em navegadores modernos e em tamanhos de tela típicos de desktop e mobile. O objetivo é permitir uso adequado em diferentes dispositivos sem quebra de fluxo básico.

### 4.9. Modularidade e manutenibilidade

As regras de domínio devem ser separadas da interface e das integrações externas. Isso facilita manutenção, testes e evolução futura do sistema. O backend deve concentrar as políticas de negócio e autorizações, enquanto os adaptadores externos devem ser isolados.

### 4.10. Observabilidade

O sistema deve registrar eventos técnicos relevantes para diagnóstico de falhas e integração. Logs devem conter como mínimo componente, nível, correlação, hora e resultado, sem expor senhas, tokens ou dados sensíveis desnecessários.

### 4.11. Validação recomendada e regra de execução

A validação dos RNFs deve ocorrer em duas etapas:

1. validação documental, baseada nos requisitos e na arquitetura definida;
2. validação prática, por testes, simulações e execução em ambiente controlado.

Qualquer validação prática de desempenho, integração externa, sandbox financeiro ou comportamento de produção deve ser explicitamente confirmada com o usuário antes da execução, conforme solicitado.

## 5. Escopo do projeto

### 5.1. Objetivos

- permitir a criação de bolões privados;
- controlar as regras do bolão de forma imutável;
- permitir convite e aprovação de participantes;
- aceitar palpites respeitando o prazo da partida;
- obter resultados oficiais de uma API esportiva;
- calcular pontuação e ranking automaticamente;
- manter registros financeiros e de participação em ambiente de teste;
- oferecer suporte acadêmico e demonstrável em ambiente local.

### 5.2. Não escopo

- pagamento real ou movimentação financeira ativa em produção;
- integração de premiação de produção;
- operação com credenciais de produção;
- infraestrutura de deploy em ambiente de produção;
- uso de microserviços sem necessidade demonstrada.

## 6. Casos de uso

Os casos de uso do Palpite League representam os fluxos principais de negócio que a arquitetura precisa suportar. Eles estão alinhados aos requisitos funcionais, às regras de negócio e aos atores do sistema. Qualquer validação prática desses fluxos que envolva API esportiva, sandbox financeiro ou comportamento externo deve ser confirmada com o usuário antes da execução.

### 6.1. Atores

- Usuário autenticado: pode criar bolões, contratar Premium e solicitar entrada em competições.
- Administrador: cria e configura o bolão, convoca participantes e aprova solicitações relevantes.
- Coadministrador: exerce permissões administrativas em um bolão específico.
- Participante: registra palpites, acompanha resultados e pode sair ou solicitar devolução.
- Vencedor: participante elegível após encerramento do bolão.
- API esportiva: fornece partidas e resultados oficiais.
- Mercado Pago em ambiente de teste: processa assinatura Premium, taxa de entrada e operações financeiras de teste.

### 6.2. Catálogo de casos de uso

| ID | Caso de uso | Ator principal | Objetivo |
| --- | --- | --- | --- |
| UC01 | Criar bolão e convidar participantes | Administrador | Criar competição privada com regras e convites |
| UC02 | Gerenciar assinatura Premium | Usuário | Contratar, consultar ou cancelar Premium |
| UC03 | Solicitar entrada e confirmar participação | Usuário convidado | Acessar convite, aceitar regras e confirmar entrada |
| UC04 | Realizar ou alterar palpite | Participante | Registrar ou ajustar palpite antes do início da partida |
| UC05 | Apurar partida e atualizar classificação | Sistema/cronjob | Consultar resultado oficial e recalcular pontuação |
| UC06 | Sair do bolão e solicitar devolução | Participante | Registrar saída e analisar devolução |
| UC07 | Encerrar bolão e solicitar premiação | Sistema/Vencedor | Definir classificação final e processar premiação |
| UC08 | Promover participante a coadministrador | Administrador | Atribuir permissão administrativa |

### 6.3. UC01 — Criar bolão e convidar participantes

1. o administrador acessa a criação de bolão;
2. o sistema valida o limite do plano do criador;
3. o administrador informa nome, prazo, taxa, premiação, partidas e critério de desempate;
4. o sistema registra o bolão com regras imutáveis;
5. o administrador dispara convites e disponibiliza acesso.

### 6.4. UC02 — Gerenciar assinatura Premium

1. o usuário consulta planos e solicita Premium;
2. o sistema inicia a operação de assinatura em ambiente de teste;
3. o provedor confirma o estado da assinatura;
4. o sistema atualiza o plano e os recursos disponíveis;
5. o usuário pode consultar ou cancelar a assinatura conforme o estado confirmado.

### 6.5. UC03 — Solicitar entrada e confirmar participação

1. o usuário acessa o convite;
2. valida o convite e aceita as regras;
3. o administrador ou coadministrador analisa a solicitação;
4. se houver taxa, o sistema inicia cobrança em ambiente de teste;
5. após aprovação e confirmação financeira, a participação é confirmada.

### 6.6. UC04 — Realizar ou alterar palpite

1. o participante acessa a partida disponível;
2. o sistema mostra as modalidades de palpite;
3. o participante envia um palpite válido;
4. o sistema valida participação, data de início e tipo de palpite;
5. o registro é persistido ou atualizado antes do início da partida.

### 6.7. UC05 — Apurar partida e atualizar classificação

1. o sistema consulta a API esportiva;
2. valida o resultado oficial retornado;
3. calcula pontos por palpite;
4. atualiza a pontuação acumulada;
5. recalcula o ranking e concede medalhas quando necessário.

### 6.8. UC06 — Sair do bolão e solicitar devolução

1. o participante solicita saída do bolão;
2. o sistema registra a saída e informa que não há devolução automática;
3. se houver pedido formal de devolução, a solicitação é registrada para aprovação administrativa;
4. o administrador ou coadministrador aprova ou rejeita;
5. se aprovada, a operação é processada conforme suporte do provedor de teste.

### 6.9. UC07 — Encerrar bolão e solicitar premiação

1. o sistema encerra o bolão ao atingir o prazo;
2. calcula classificação final e critério de desempate;
3. identifica vencedor ou vencedores;
4. o vencedor solicita a premiação;
5. a operação é processada somente se houver suporte validado no sandbox.

### 6.10. UC08 — Promover participante a coadministrador

1. o administrador consulta participantes do bolão;
2. seleciona um participante para promoção;
3. o sistema valida papel do solicitante e participação do alvo;
4. atribui o papel de coadministrador;
5. confirma a alteração no sistema.

### 6.11. Observações de validação

Os casos de uso acima são a base funcional da aplicação. Qualquer execução real de validação que envolva resultado esportivo, financeiro ou integração externa deve ser confirmada com o usuário antes da execução para evitar testes indevidos em sandbox, API externa ou dados sensíveis.

## 7. Regras de negócio

As regras de negócio do Palpite League definem os limites e as obrigações do sistema para que os bolões sejam justos, consistentes e auditáveis. Elas orientam tanto a experiência do usuário quanto a implementação do backend, e estão diretamente alinhadas ao modelo de domínio e aos casos de uso.

### 7.1. Regras de planos e assinatura

- o usuário pode utilizar o sistema em plano Gratuito ou Premium;
- o plano Gratuito permite criar até 1 bolão simultaneamente;
- o plano Premium permite criar até 10 bolões simultaneamente;
- recursos Premium permanecem ativos enquanto a assinatura estiver válida;
- ao expirar ou cancelar a assinatura, o usuário retorna ao plano Gratuito para novas criações;
- bolões já existentes não são automaticamente encerrados pelo downgrade ou cancelamento.

### 7.2. Regras de criação e administração do bolão

- todo bolão deve possuir um criador responsável, que assume o papel de administrador;
- o administrador define nome, período, taxa de entrada, premiação, partidas e critério de desempate;
- as regras do bolão são imutáveis após a criação;
- o administrador pode indicar coadministradores para auxiliar na gestão;
- somente o administrador ou coadministrador pode aprovar participantes e gerir a configuração administrativa do bolão.

### 7.3. Regras de participação e convite

- somente usuários convidados podem solicitar participação em um bolão privado;
- a entrada requer aprovação do administrador ou coadministrador;
- antes de participar, o usuário deve visualizar e aceitar as regras do bolão;
- se houver taxa de entrada, a confirmação financeira é necessária para ativar a participação;
- participantes que entram depois do início da competição só podem apostar em partidas ainda abertas.

### 7.4. Regras de palpites e prazos

- cada participante pode registrar apenas um tipo de palpite por partida: resultado ou placar exato;
- o palpite deve ser registrado antes do início da partida;
- o usuário pode alterar ou substituir o palpite somente enquanto a partida ainda não começou;
- após o início da partida, o palpite fica bloqueado e não pode mais ser alterado;
- o resultado oficial da partida deve ser obtido exclusivamente pela API esportiva integrada.

### 7.5. Regras de pontuação e ranking

- a pontuação é calculada automaticamente pelo sistema;
- a comparação entre palpite e resultado oficial determina o resultado da rodada e do bolão;
- o ranking considera a pontuação acumulada e o critério de desempate definido no bolão;
- medalhas e posições podem ser atribuídas automaticamente por rodada ou por classificação geral;
- o sistema não permite manipulação manual do resultado oficial por administrador ou coadministrador.

### 7.6. Regras financeiras e de devolução

- a taxa de entrada, quando houver, deve ser única para todos os participantes do bolão;
- o pagamento deve ser validado antes da confirmação da participação;
- a saída do bolão não gera devolução automática;
- solicitações de devolução devem ser registradas e aprovadas por autorização administrativa;
- premiação e devolução somente podem ser processadas quando houver suporte confirmado no ambiente de teste.

### 7.7. Regras de auditoria e rastreabilidade

- toda operação relevante deve registrar ator, ação, objeto afetado e data/hora;
- ações de autenticação, aprovação, acompanhamento de resultado, movimentação financeira e saída do bolão devem ser auditáveis;
- o sistema deve manter histórico suficiente para demonstrar consistência do bolão e dos pagamentos simulados;
- logs e registros devem ser mantidos sem expor credenciais, tokens ou dados sensíveis desnecessários.

Essas regras servem como base de implementação para o backend, especialmente para validações de integridade, autorização e persistência de dados.

## 8. Drivers arquiteturais

Os principais drivers que orientam a arquitetura são:

- preservação das regras e integridade do bolão;
- obtenção de resultados oficiais a partir de fonte externa;
- rastreabilidade e consistência das operações financeiras de teste;
- autorização e papéis por bolão;
- modularização interna sem complexidade operacional desnecessária;
- compatibilidade com navegadores modernos e telas responsivas.

Esses drivers estão alinhados com os documentos de requisitos, regras de negócio e ADRs do projeto.

## 9. Contexto de negócio

O produto atende a dois perfis principais:

- administrador: cria o bolão, define regras, seleciona partidas, convida usuários e aprova participação;
- participante: recebe convite, aceita as regras, registra palpites, acompanha classificação e medalhas, e pode sair ou solicitar devolução.

O sistema também considera dois perfis financeiros em ambiente de teste:

- assinatura Premium;
- taxa de entrada do bolão;
- devolução e premiação, quando suportadas e validadas no sandbox.

## 10. Requisitos centrais que orientam a arquitetura

### 10.1. Funcionais

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

### 10.2. Não funcionais

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

### 10.3. Regras de negócio essenciais

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

## 11. Requisitos funcionais

Os requisitos funcionais do Palpite League definem o comportamento esperado do sistema em cada fluxo principal de negócio. A estrutura abaixo organiza esses requisitos de forma consistente com as histórias de usuário, regras de negócio e casos de uso do projeto. Qualquer validação prática de fluxo funcional que envolva dados externos, sandbox de pagamento ou API esportiva deve ser confirmada com o usuário antes da execução.

### 11.1. Gestão de usuários e autenticação

- cadastro de usuário com preenchimento de dados obrigatórios;
- autenticação com credenciais válidas;
- recuperação de acesso por mecanismo configurado;
- consulta e atualização do perfil do usuário;
- consulta do plano e status da conta.

### 11.2. Gestão de planos e assinatura

- contratação do plano Premium;
- consulta do status da assinatura;
- cancelamento da assinatura conforme condições do plano;
- ativação de recursos Premium somente após confirmação válida;
- manutenção dos bolões existentes após downgrade ou cancelamento.

### 11.3. Criação e administração de bolões

- criação de bolão respeitando regras e limite do plano;
- configuração do nome, prazo, taxa de entrada, premiação, partidas e critério de desempate;
- consulta das regras do bolão;
- convite de usuários para participação;
- aprovação ou rejeição de participantes;
- gestão de coadministradores;
- seleção de partidas por rodada ou individualmente.

### 11.4. Participação e aceite das regras

- solicitação de entrada em bolão por convite válido;
- aceite explícito das regras do bolão;
- aviso e confirmação de entrada tardia quando aplicável;
- confirmação de participação somente após aprovação e pagamento, quando houver taxa.

### 11.5. Palpites e prazos

- registro de palpite por participante em partida disponível;
- alteração de palpite antes do início da partida;
- bloqueio de operações após o início da partida;
- exclusividade entre palpite de resultado e palpite de placar exato.

### 11.6. Resultados e apuração

- consulta do resultado oficial através da API esportiva;
- atualização dos resultados sem alteração manual administrativa;
- cálculo automático da pontuação;
- atualização do ranking acumulado;
- identificação de líderes da rodada;
- concessão de medalhas visuais conforme regras da competição.

### 11.7. Pagamentos, saídas e devoluções

- registro da movimentação financeira;
- cobrança da taxa de entrada quando aplicável;
- registro de saída do bolão;
- solicitação formal de devolução;
- aprovação ou rejeição administrativa da devolução;
- processamento da premiação conforme suporte do provedor.

### 11.8. Encerramento e classificação final

- encerramento do bolão ao atingir o período final;
- cálculo do vencedor ou vencedores com critério de desempate;
- solicitação de premiação pelo vencedor;
- registro do estado final do bolão e da premiação.

### 11.9. Notificações e histórico

- notificação de eventos relevantes para o usuário;
- consulta do histórico do bolão;
- rastreio das decisões administrativas e dos momentos de participação.

## 12. Visão funcional do sistema

A aplicação é estrutura em torno de seis grandes áreas de responsabilidade:

1. identidade e acesso;
2. gestão de bolões e participações;
3. gestão de palpites e partidas;
4. resultados, pontuação e ranking;
5. pagamentos e assinaturas em ambiente de teste;
6. notificações e auditoria.

Essas responsabilidades devem ser separadas internamente para manter acoplamento baixo e regras de domínio independentes da interface.

## 13. Modelo de domínio

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

## 14. Arquitetura proposta

### 14.1. Estilo arquitetural

A decisão adotada é um monólito modular, com responsabilidades separadas em módulos do domínio e sem necessidade de microserviços neste estágio.

A estrutura é organizada em módulos internos, como:

- autenticação e usuários;
- bolões e participações;
- partidas e resultados;
- palpites e pontuação;
- pagamentos e assinaturas;
- notificações e auditoria;
- integração externa com API esportiva e provedor de pagamentos.

### 14.2. Camadas lógicas

A arquitetura pode ser entendida em camadas:

- apresentação: frontend web em React;
- aplicação: API em Node.js com Express;
- domínio: regras de negócio, validações e invariantes;
- persistência: SQLite para protótipo local;
- integrações externas: API esportiva e APIs de pagamento em ambiente de teste;
- observabilidade: logs, auditoria e rastreabilidade.

### 14.3. Comunicação entre camadas

- a interface web se comunica com a API backend via HTTP;
- o backend centraliza validações de autorização e regras de domínio;
- a persistência armazena estado do bolão, participantes, palpites e movimentações;
- as integrações externas são isoladas em adaptadores específicos para evitar acoplamento com o domínio.

## 15. Integrações externas

### 15.1. API esportiva

A arquitetura prevê integração com uma API esportiva para obter:

- partidas do campeonato;
- status de partidas;
- placares finais;
- informações necessárias para apuração automática.

A API esportiva não pode ser a origem de alteração manual de resultado. O resultado oficial é produto da sincronização automática e do adaptador externo, e não de edição administrativa.

### 15.2. Mercado Pago em ambiente de teste

A integração financeira é tratada como ambiente de teste, não de produção.

Fluxos previstos:

- assinatura Premium;
- taxa de entrada;
- eventuais reembolsos;
- repasse de premiação, somente se validado no sandbox.

Se o sandbox não suportar o repasse posterior da premiação, a demonstração pode utilizar um simulador explicitamente identificado, mas isso não deve ser apresentado como integração concluída.

## 16. Fluxos principais da arquitetura

### 16.1. Criação de bolão

1. usuário autenticado solicita criação;
2. backend valida o plano e o limite de criação;
3. aplicação registra bolão com regras definidas;
4. sistema cria participação do administrador;
5. convites são disponibilizados para os convidados.

### 16.2. Entrada e aprovação

1. usuário acessa o convite;
2. aceita as regras do bolão;
3. administrador ou coadministrador aprova ou rejeita;
4. se houver taxa, o participante aguarda confirmação do pagamento;
5. a participação é confirmada somente após aprovação e pagamento validado.

### 16.3. Palpite

1. participante acessa partida disponível;
2. sistema valida se a partida está aberta para palpite;
3. participante registra resultado ou placar exato;
4. backend valida prazo, tipo de palpite e participação;
5. palpite é persistido ou substituído antes do início da partida.

### 16.4. Apuração e classificação

1. sistema consulta a API esportiva;
2. resultado final é validado;
3. cálculo de pontuação é executado;
4. ranking do bolão é atualizado;
5. medalhas são atribuídas às maiores pontuações da rodada.

### 16.5. Encerramento do bolão

1. período definido é atingido;
2. sistema calcula classificação final;
3. critério de desempate é aplicado;
4. vencedor ou vencedores são registrados;
5. premiação pode ser solicitada e processada somente se a operação for validada.

## 17. Considerações de segurança e integridade

A arquitetura deve garantir que:

- regras do domínio sejam validadas no backend;
- a interface não seja a única camada de proteção;
- permissões por papel sejam verificadas em cada operação administrativa;
- dados sensíveis não sejam expostos em logs;
- resultados oficiais não sejam editados manualmente;
- operações financeiras tenham histórico auditável;
- operações pendentes não sejam duplicadas.

## 18. Tecnologia confirmada para o protótipo

A solução proposta para o protótipo acadêmico é:

- frontend: React + JavaScript + Vite;
- backend: Node.js + Express;
- persistência: SQLite;
- integração esportiva: adaptador isolado para a API esportiva escolhida;
- pagamentos: Mercado Pago em ambiente de teste;
- hospedagem e implantação: fora do escopo desta etapa.

## 19. Dependências e riscos

### 19.1. Dependências técnicas

- disponibilidade da API esportiva;
- limites e termos do plano da API externa;
- compatibilidade do sandbox do Mercado Pago com reembolso e premiação;
- configuração de credenciais de teste fora do repositório.

### 19.2. Riscos principais

- falha da API esportiva afetando a sincronização;
- operação financeira pendente ou indecisa no sandbox;
- inconsistência entre documentação e comportamento real do provedor;
- regras de negócio mal alinhadas com a implementação.

## 20. Status atual

Este documento consolida os artefatos existentes do repositório e representa a arquitetura-base do projeto. Ele está alinhado com os documentos de visão, requisitos, regras de negócio, domínio e ADRs, mas deve continuar sendo revisado à medida que as decisões técnicas forem validadas e a implementação for executada.

## 21. Referências internas

- [docs/visao.md](../visao.md)
- [docs/requisitos/RF.md](../requisitos/RF.md)
- [docs/requisitos/RNF.md](../requisitos/RNF.md)
- [docs/requisitos/RB.md](../requisitos/RB.md)
- [docs/modelo-dominio.md](../modelo-dominio.md)
- [docs/uml/casos-de-uso.md](../uml/casos-de-uso.md)
- [docs/arquitetura/drivers-arquiteturais.md](drivers-arquiteturais.md)
- [docs/arquitetura/validacao-mercado-pago.md](validacao-mercado-pago.md)
- [docs/arquitetura/adr/README.md](adr/README.md)
