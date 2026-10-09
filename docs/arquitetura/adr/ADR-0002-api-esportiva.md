# ADR-0002 — API-Football como fonte de dados esportivos

- **Status:** Recomendação para aprovação e validação técnica
- **Data:** 2026-10-02
- **Drivers relacionados:** DA-02

## Contexto

O sistema precisa obter partidas e resultados oficiais do Brasileirão. Também prevê atualização durante partidas para bolões com o recurso ao vivo. O resultado oficial não pode ser inserido ou alterado manualmente. As operações financeiras em ambiente de teste não afetam essa integração: a API esportiva fornece dados de futebol, não processa pagamentos.

## Decisão recomendada

Adotar a **API-Football, da API-Sports**, como candidata principal para a integração esportiva. Isolar as chamadas externas em um módulo adaptador, sem espalhar detalhes do fornecedor pelas regras de domínio.

Antes de iniciar a integração, fazer uma prova de conceito que confirme a cobertura da Série A do Campeonato Brasileiro para as temporadas necessárias, os dados de status e placar, a frequência de atualização disponível, os limites e custos do plano e os termos de uso aplicáveis ao projeto.

## Motivos

É uma API especializada em futebol e, portanto, uma candidata mais alinhada às necessidades de partidas, placares e acompanhamento ao vivo do que uma fonte voltada somente a resultados finais. A escolha do adaptador permite substituir o fornecedor se a prova de conceito revelar limitações.

## Consequências

- O sistema dependerá da disponibilidade e dos limites de uso do fornecedor.
- Falhas de consulta devem preservar os dados existentes, registrar o problema e permitir nova sincronização, sem aceitar resultados manuais como oficiais.
- A integração real só deve avançar após a prova de conceito e a conferência dos termos do plano selecionado.
- Testes automatizados devem usar respostas simuladas para não depender da API externa nem consumir cotas.

## Alternativas consideradas

- **Sportmonks:** alternativa especializada em futebol, a ser comparada caso a cobertura ou os limites da API-Football não atendam ao projeto.
- **football-data.org:** alternativa a avaliar, especialmente se os dados disponíveis forem suficientes; confirmar se cobertura e atualização atendem ao requisito de acompanhamento ao vivo.
- **Dados simulados apenas:** opção suficiente para testes, mas não demonstra a integração com uma fonte externa prevista nos requisitos.