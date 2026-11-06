# ADR-0007 — Sessão, proteção de senha e recuperação de acesso simulada

- **Status:** Aceito
- **Data:** 2026-11-05
- **Drivers relacionados:** DA-01, DA-04
- **Origem das decisões:** OPEN-06; OPEN-49 a OPEN-55 (SPEC-003 e SPEC-004); RNF01.

## Contexto

O RNF01 exige apenas que a senha não seja guardada em texto puro, e o ADR-0004 não decidiu o mecanismo de autenticação nem o algoritmo de proteção de senha (OPEN-06). Também não havia definição de como a recuperação de acesso funciona sem enviar e-mails reais.

## Decisão

**Senhas**
- Protegidas com `scrypt` do módulo `crypto` do Node, com os parâmetros padrão do Node, sal aleatório único de 16 bytes por usuário e resultado de 64 bytes.
- O hash é guardado junto com os parâmetros usados, para permitir evolução. Nunca há senha em texto puro.

**Sessão**
- Token opaco aleatório de 256 bits. Somente o hash do token é guardado; o token em claro existe apenas na resposta do login.
- O cliente envia o token no cabeçalho `Authorization`.
- Validade de 8 horas contadas da emissão, sem renovação.
- Um usuário pode ter mais de uma sessão simultânea; o logout invalida somente a sessão usada.
- O cadastro não inicia sessão.
- A falha de login responde da mesma forma para e-mail inexistente e senha incorreta.
- A sessão é uma estrutura técnica (hash do token, usuário, emissão, expiração e estado de encerramento), não uma entidade do modelo de domínio.

**Recuperação de acesso simulada**
- O token de recuperação é aleatório (256 bits), de uso único, válido por 30 minutos e guardado somente como hash. Há no máximo um token pendente por usuário; uma nova solicitação invalida o anterior.
- A resposta à solicitação é idêntica, exista ou não a conta.
- A entrega é feita por uma **porta de entrega com implementação simulada**: um arquivo de texto local, só de inclusão, em pasta ignorada pelo Git e com caminho configurável. Cada mensagem traz a marca de simulação, data e hora em UTC, o destinatário e o link de redefinição, com o token no fragmento (`#`) do endereço. O arquivo não é exposto por nenhuma operação HTTP.
- A redefinição invalida as sessões anteriores do usuário e não inicia sessão.
- O envio real de e-mail ou SMS fica fora do protótipo.

## Motivos

As escolhas usam apenas recursos do Node e do SQLite já adotados (ADR-0004), protegem as credenciais em repouso (RNF01) e permitem demonstrar a recuperação de acesso sem integração externa. A porta de entrega simulada permite trocar a implementação por uma real sem alterar a SPEC-004.

## Consequências

- A SPEC-003 implementa cadastro, login, logout e a etapa de autenticação nas requisições; a SPEC-004 implementa a recuperação.
- Os eventos de autenticação são auditáveis (SPEC-002).
- Segredos (senhas, tokens e hashes) nunca aparecem em registros técnicos nem em respostas de erro (RNF20).
- Não há renovação de sessão: após 8 horas o usuário precisa fazer login novamente.
- Os parâmetros do `scrypt` são os padrão do Node e ficam guardados com cada hash, o que permite a evolução futura dos parâmetros.
