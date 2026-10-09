# Requisitos Não Funcionais — Palpite League

> **Escopo de validação:** as metas quantitativas deste documento foram definidas para um protótipo acadêmico executado localmente. Os resultados devem ser registrados junto às condições do ambiente de teste; não representam metas de produção.

## RNF01 — Segurança dos dados

**Tipo EARS: Ubiquitous**

O sistema deverá proteger dados pessoais, credenciais, informações financeiras, palpites e informações dos bolões contra acesso não autorizado.

**Critério de aceitação:** solicitações sem autenticação válida não acessam dados privados; um usuário não acessa dados de outro usuário ou de bolões dos quais não participa, salvo permissões administrativas previstas. Senhas não são armazenadas em texto puro e segredos não aparecem em respostas ou logs.

**Verificação:** executar testes automatizados de acesso anônimo, acesso cruzado entre usuários e acesso por papel; inspecionar a persistência e os logs para confirmar que não contêm senhas ou segredos.

---

## RNF02 — Integridade dos dados

**Tipo EARS: Ubiquitous**

O sistema deverá preservar a integridade dos dados de usuários, planos, assinaturas, bolões, participantes, palpites, resultados, pontuações, pagamentos e premiações.

**Critério de aceitação:** se uma operação que altera dados relacionados falhar, nenhuma parte da operação ficará persistida; as regras de domínio e restrições de unicidade aplicáveis serão respeitadas.

**Verificação:** provocar falhas em operações compostas e conferir que o estado permanece íntegro; testar duplicidade e violações das regras de domínio.

---

## RNF03 — Consistência das informações

**Tipo EARS: Ubiquitous**

O sistema deverá apresentar dados consistentes entre as funcionalidades de participantes, palpites, resultados, pontuações, rankings, planos e movimentações financeiras.

**Critério de aceitação:** após cada operação confirmada, as consultas relacionadas apresentam o mesmo estado persistido; a pontuação e o ranking correspondem aos resultados oficiais e às regras de pontuação vigentes.

**Verificação:** executar testes de integração que consultem os dados por diferentes funcionalidades após registrar e processar operações.

---

## RNF04 — Rastreabilidade

**Tipo EARS: Ubiquitous**

O sistema deverá registrar operações relevantes realizadas na plataforma, incluindo ator, ação, objeto afetado, data e hora em UTC e resultado da operação. Para ações executadas automaticamente, deverá identificar o sistema como ator.

**Critério de aceitação:** cada operação definida como auditável gera um registro consultável com esses campos, sem armazenar senhas, tokens ou dados de pagamento sensíveis.

**Verificação:** executar uma operação de cada categoria auditável e conferir os registros gerados e a ausência de segredos.

---

## RNF05 — Disponibilidade

**Tipo EARS: Ubiquitous**

No ambiente utilizado para avaliação, o sistema deverá permanecer disponível durante a janela de demonstração acordada pela equipe.

**Critério de aceitação:** durante uma demonstração local de 30 minutos, uma verificação a cada minuto confirma que a aplicação inicia e que as funcionalidades principais podem ser acessadas, sem falha bloqueante. A indisponibilidade de dependências externas deverá ser registrada separadamente, não como sucesso da integração.

**Verificação:** executar 30 verificações periódicas durante a demonstração e registrar duração, resultado e causa de cada falha.

---

## RNF06 — Desempenho

**Tipo EARS: Ubiquitous**

O sistema deverá processar operações comuns sem dependência de serviços externos dentro do limite de resposta definido para o protótipo.

**Critério de aceitação:** sob carga de 5 usuários simultâneos, pelo menos 95% das operações de consulta e gravação locais respondem em até 3 segundos. Chamadas a APIs externas são medidas separadamente.

**Verificação:** executar teste de carga representativo no ambiente local e reportar o percentil 95, a quantidade de erros e as condições do teste.

---

## RNF07 — Escalabilidade

**Tipo EARS: Ubiquitous**

O sistema deverá suportar o perfil de carga acadêmico definido para a avaliação sem perda de dados ou falha nas funcionalidades principais.

**Critério de aceitação:** com 20 usuários cadastrados, 5 bolões ativos e 1.000 palpites armazenados, os fluxos principais permanecem funcionais e não há perda ou duplicação de dados.

**Verificação:** carregar esse conjunto de dados de referência, executar os fluxos principais e conferir os dados antes e depois. O teste não implica suporte a crescimento ilimitado nem caracteriza capacidade de produção.

---

## RNF08 — Confiabilidade da API esportiva

**Tipo EARS: Event-driven**

Quando a API esportiva estiver indisponível ou retornar erro, o sistema deverá preservar os dados já registrados, indicar que a sincronização falhou e não aceitar resultados oficiais inseridos manualmente.

**Critério de aceitação:** timeout e respostas de erro da API não apagam nem substituem resultados persistidos; a falha fica registrada e uma sincronização posterior pode ser tentada novamente.

**Verificação:** simular timeout, resposta HTTP de erro e recuperação da API, verificando persistência, indicação de falha e sincronização posterior.

---

## RNF09 — Recuperação de falhas

**Tipo EARS: Event-driven**

Quando ocorrer uma falha durante uma operação de pagamento em ambiente de teste ou simulado, assinatura, palpite ou atualização de dados, o sistema deverá preservar o estado anterior ou concluir a operação sem efeitos parciais.

**Critério de aceitação:** repetir uma notificação de pagamento ou uma solicitação já processada não duplica saldo, participação ou movimentação financeira; falhas antes da confirmação não deixam a operação parcialmente aplicada.

**Verificação:** injetar falhas antes e durante a confirmação e reenviar notificações do simulador e do provedor de teste; comparar o estado final com o esperado.

---

## RNF10 — Auditoria financeira

**Tipo EARS: Ubiquitous**

O sistema deverá manter um histórico das movimentações financeiras de teste relacionadas a assinaturas, taxas de entrada, devoluções e premiações, associado ao usuário, ao provedor e à operação de origem.

**Critério de aceitação:** cada movimentação registra identificador local, identificador da operação no provedor quando aplicável, tipo, valor, moeda, estado, data e hora, usuário e origem; operações confirmadas não podem desaparecer do histórico por uma atualização comum.

**Verificação:** gerar movimentações de cada tipo e conferir seus campos e sua consulta no histórico. Os registros deste projeto não deverão ser apresentados como comprovantes de transações reais.

---

## RNF11 — Privacidade

**Tipo EARS: Ubiquitous**

O sistema deverá exibir dados pessoais e financeiros somente a usuários autenticados com permissão para consultá-los.

**Critério de aceitação:** um usuário consulta seus próprios dados; dados privados de outro usuário e detalhes financeiros de terceiros são negados, exceto quando uma regra explícita de administração do bolão autorizar a consulta.

**Verificação:** testar consultas próprias e cruzadas para participante, administrador e coadministrador.

---

## RNF12 — Controle de acesso

**Tipo EARS: Ubiquitous**

O backend deverá autorizar cada operação administrativa com base no papel do usuário no bolão correspondente.

**Critério de aceitação:** participante não executa operações administrativas; administrador e coadministrador só executam as operações permitidas às suas funções. Ocultar um controle na interface não substitui a autorização no backend.

**Verificação:** chamar diretamente as operações administrativas com cada papel e confirmar autorização ou rejeição conforme a matriz de permissões do sistema.

---

## RNF13 — Compatibilidade

**Tipo EARS: Ubiquitous**

O sistema deverá disponibilizar os fluxos principais nas versões estáveis atuais de Google Chrome, Mozilla Firefox e Microsoft Edge para desktop, e Google Chrome para Android e Safari para iOS.

**Critério de aceitação:** cadastro/autenticação, entrada em bolão, realização de palpite e consulta de ranking funcionam nos navegadores e sistemas listados, sem erro que bloqueie o fluxo.

**Verificação:** executar roteiro manual nesses navegadores e registrar versão, dispositivo e resultado. A lista de versões suportadas deverá ser atualizada na data da avaliação.

---

## RNF14 — Responsividade

**Tipo EARS: Ubiquitous**

O sistema deverá manter os fluxos principais utilizáveis nas larguras de viewport de 360 px, 768 px e 1366 px.

**Critério de aceitação:** nas larguras indicadas, cadastro/autenticação, entrada em bolão, realização de palpite e consulta de ranking permanecem acessíveis, sem sobreposição de controles nem rolagem horizontal da página.

**Verificação:** executar o roteiro principal em cada largura, usando ferramentas de emulação do navegador ou dispositivos correspondentes.

---

## RNF15 — Segurança das transações

**Tipo EARS: Ubiquitous**

O sistema deverá usar exclusivamente o ambiente de teste do Mercado Pago para assinatura Premium, taxa de entrada, devolução e premiação nas operações que forem validadas como suportadas. Durante o desenvolvimento e os testes automatizados, um simulador poderá substituir o provedor.

**Critério de aceitação:** não há credenciais de produção, cobranças ou transferências reais, nem armazenamento de dados completos de cartão; chaves e tokens não são incluídos no repositório, no código do cliente ou nos logs. Operações simuladas são identificadas como simulação e não aparecem como confirmadas pelo provedor. Em ambiente publicado, as comunicações com o provedor usam HTTPS.

**Verificação:** revisar configuração, histórico versionado e logs; validar em separado as operações pretendidas usando somente contas e credenciais de teste; conferir que simulações e confirmações do provedor são distinguíveis.

---

## RNF16 — Não repúdio das operações

**Tipo EARS: Ubiquitous**

O sistema deverá produzir evidência auditável de palpites registrados ou alterados, aceites de regras, decisões administrativas e movimentações financeiras de teste ou simuladas.

**Critério de aceitação:** cada evidência permite identificar ator, ação, objeto, data e hora em UTC, resultado e origem da movimentação (provedor de teste ou simulador); uma alteração não apaga o registro anterior da ação. Segredos e dados completos de pagamento não são incluídos.

**Verificação:** executar as operações listadas, conferir os registros correspondentes e confirmar que alterações posteriores não removem o histórico.

---

## RNF17 — Sincronização de resultados

**Tipo EARS: Event-driven**

Quando a API esportiva disponibilizar um resultado final atualizado, o sistema deverá sincronizar o dado e iniciar o recálculo correspondente sem corromper outros resultados ou palpites.

**Critério de aceitação:** em condições normais e respeitando a cota e a frequência permitidas pela API, o resultado final é refletido no sistema em até 15 minutos após estar disponível no provedor; a sincronização é registrada e pode ser repetida sem duplicar pontuação ou movimentações.

**Verificação:** usar respostas controladas do adaptador da API e medir o intervalo até a atualização. Registrar a frequência de consulta permitida pelo fornecedor; se ela impedir o cumprimento do limite de 15 minutos, documentar a limitação observada.

---

## RNF18 — Manutenibilidade

**Tipo EARS: Ubiquitous**

As regras críticas de negócio deverão possuir testes automatizados independentes da interface e dos serviços externos.

**Critério de aceitação:** existem testes automatizados para imutabilidade das regras, autorização por papel, prazo e exclusividade de palpites, cálculo de pontuação e tratamento de falhas financeiras; esses testes podem ser executados sem credenciais externas.

**Verificação:** executar a suíte de testes em ambiente limpo e conferir que os cenários listados não dependem de chamadas reais a provedores.

---

## RNF19 — Modularidade

**Tipo EARS: Ubiquitous**

O sistema deverá separar as responsabilidades de autenticação/usuários, bolões/participações, palpites, partidas/resultados/pontuação e pagamentos/assinaturas.

**Critério de aceitação:** cada responsabilidade possui um módulo identificável; regras de domínio não dependem diretamente da interface nem de SDKs de provedores externos. A integração esportiva e a de pagamentos podem ser substituídas sem reescrever as regras de pontuação e participação.

**Verificação:** revisar a estrutura de módulos e dependências em relação à arquitetura definida para o projeto.

---

## RNF20 — Observabilidade

**Tipo EARS: Ubiquitous**

O sistema deverá registrar eventos técnicos relevantes para diagnosticar falhas da aplicação e de suas integrações.

**Critério de aceitação:** erros de aplicação e falhas de integração registram data e hora, nível, componente, identificador de correlação e resultado; logs não incluem senhas, tokens ou dados pessoais/financeiros desnecessários.

**Verificação:** provocar uma falha controlada em cada integração e conferir os campos do log e a ausência de dados sensíveis.