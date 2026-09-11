# Requisitos Não Funcionais — Palpite League

## RNF01 — Segurança dos dados

**Tipo EARS: Ubiquitous**

O sistema deverá proteger os dados pessoais, credenciais, informações financeiras, palpites e informações das ligas contra acesso não autorizado durante toda a utilização da plataforma.

---

## RNF02 — Integridade dos dados

**Tipo EARS: Ubiquitous**

O sistema deverá garantir a integridade dos dados relacionados a usuários, planos, assinaturas, ligas, participantes, palpites, resultados, pontuações, pagamentos e premiações durante toda sua operação.

---

## RNF03 — Consistência das informações

**Tipo EARS: Ubiquitous**

O sistema deverá manter consistentes as informações apresentadas entre suas diferentes funcionalidades, incluindo participantes, palpites, resultados, pontuações, rankings, planos e valores financeiros.

---

## RNF04 — Rastreabilidade

**Tipo EARS: Ubiquitous**

O sistema deverá manter registros das operações relevantes realizadas na plataforma, identificando o usuário responsável, a operação realizada e o momento de sua execução.

---

## RNF05 — Disponibilidade

**Tipo EARS: Ubiquitous**

O sistema deverá permanecer disponível aos usuários durante o período de funcionamento da plataforma, exceto durante manutenções programadas.

---

## RNF06 — Desempenho

**Tipo EARS: Ubiquitous**

O sistema deverá processar as operações comuns da plataforma em tempo adequado para proporcionar uma experiência de utilização fluida aos usuários.

---

## RNF07 — Escalabilidade

**Tipo EARS: Ubiquitous**

O sistema deverá permitir o aumento da quantidade de usuários, bolões, palpites, partidas e movimentações financeiras sem comprometer suas funcionalidades essenciais.

---

## RNF08 — Confiabilidade da API esportiva

**Tipo EARS: Event-driven**

Quando a API esportiva estiver temporariamente indisponível, o sistema deverá preservar os dados já registrados e informar a indisponibilidade sem permitir a inserção manual de resultados oficiais.

---

## RNF09 — Recuperação de falhas

**Tipo EARS: Event-driven**

Quando ocorrer uma falha durante uma operação de pagamento, assinatura, palpite ou atualização de dados, o sistema deverá preservar o estado anterior da operação ou restaurá-lo de forma consistente.

---

## RNF10 — Auditoria financeira

**Tipo EARS: Ubiquitous**

O sistema deverá manter um histórico das movimentações financeiras relacionadas a assinaturas, taxas de entrada, devoluções e premiações.

---

## RNF11 — Privacidade

**Tipo EARS: Ubiquitous**

O sistema deverá restringir o acesso aos dados pessoais e financeiros de acordo com as permissões do usuário autenticado.

---

## RNF12 — Controle de acesso

**Tipo EARS: Ubiquitous**

O sistema deverá restringir o acesso às funcionalidades administrativas de acordo com o papel exercido pelo usuário em cada bolão.

---

## RNF13 — Compatibilidade

**Tipo EARS: Ubiquitous**

O sistema deverá disponibilizar suas funcionalidades principais em navegadores modernos compatíveis com os padrões web utilizados pela aplicação.

---

## RNF14 — Responsividade

**Tipo EARS: Ubiquitous**

O sistema deverá adaptar sua interface aos diferentes tamanhos de tela dos dispositivos compatíveis, mantendo o acesso às funcionalidades principais.

---

## RNF15 — Segurança das transações

**Tipo EARS: Ubiquitous**

O sistema deverá utilizar mecanismos seguros para o processamento e armazenamento das informações relacionadas a pagamentos e assinaturas.

---

## RNF16 — Não repúdio das operações

**Tipo EARS: Ubiquitous**

O sistema deverá registrar informações suficientes para comprovar a realização de operações relevantes, incluindo pagamentos, palpites, aceites de regras, alterações administrativas e solicitações financeiras.

---

## RNF17 — Sincronização de resultados

**Tipo EARS: Event-driven**

Quando novas informações forem disponibilizadas pela API esportiva, o sistema deverá atualizar os dados correspondentes sem comprometer a integridade dos resultados já registrados.

---

## RNF18 — Manutenibilidade

**Tipo EARS: Ubiquitous**

O sistema deverá possuir uma estrutura que permita a manutenção e evolução de seus componentes sem exigir alterações desnecessárias em funcionalidades não relacionadas.

---

## RNF19 — Modularidade

**Tipo EARS: Ubiquitous**

O sistema deverá manter separadas as responsabilidades relacionadas a autenticação, usuários, bolões, palpites, resultados, pagamentos, assinaturas e pontuação.

---

## RNF20 — Observabilidade

**Tipo EARS: Ubiquitous**

O sistema deverá registrar eventos técnicos relevantes para permitir o monitoramento, diagnóstico e identificação de falhas da aplicação.