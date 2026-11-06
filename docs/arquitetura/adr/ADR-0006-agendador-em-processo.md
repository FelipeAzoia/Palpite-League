# ADR-0006 — Agendador de tarefas periódicas em processo

- **Status:** Aceito
- **Data:** 2026-11-05
- **Drivers relacionados:** DA-02, DA-03, DA-05
- **Origem das decisões:** OPEN-03 e OPEN-74 (SPEC-013), OPEN-76 (SPEC-014), OPEN-81 (SPEC-016), SPEC-018, OPEN-90 (SPEC-020), OPEN-99 (SPEC-021), OPEN-126 (SPEC-024), OPEN-135 (SPEC-025) e OPEN-155 (SPEC-027).

## Contexto

Vários comportamentos precisam acontecer sem ação de um usuário: sincronizar resultados oficiais, pontuar partidas, atribuir medalhas, conferir operações financeiras pendentes, expirar assinaturas, atualizar partidas ao vivo, processar devoluções, encerrar bolões e gerar notificações. O caso de uso UC05 cita "cronjob" e o RF24 cita "periodicamente", mas o ADR-0004 não escolheu mecanismo nem frequência (OPEN-03).

## Decisão

Adotar um **agendador em processo**: um mecanismo reutilizável, dentro do monólito (ADR-0001), que executa tarefas periódicas. Ele implementa estas regras:

- cada tarefa tem **intervalo configurável**;
- cada tarefa executa **logo após a inicialização do backend** e depois a cada intervalo;
- **duas execuções da mesma tarefa nunca se sobrepõem**;
- a **falha de uma execução não interrompe** o agendador nem impede a execução seguinte;
- as tarefas podem ser **acionadas diretamente nos testes**, sem esperar o tempo passar;
- as tarefas são **idempotentes**: reexecutá-las não duplica efeitos.

O agendador é implementado pela SPEC-013, a primeira a usá-lo. Nenhuma outra Spec o recria.

Intervalos padrão registrados nas Specs aprovadas:

| Tarefa | Spec | Intervalo padrão |
| --- | --- | --- |
| Sincronização de resultados oficiais | SPEC-013 | 10 minutos |
| Conferência de operações financeiras pendentes | SPEC-018 | 5 minutos |
| Pontuação de partidas | SPEC-014 (OPEN-76) | 1 minuto |
| Medalhas da rodada | SPEC-016 (OPEN-81) | 1 minuto |
| Atualização ao vivo (bolões Premium) | SPEC-021 (OPEN-99) | 1 minuto |
| Início do processamento de devoluções | SPEC-024 (OPEN-126) | 1 minuto |
| Encerramento de bolões | SPEC-025 (OPEN-135) | 1 minuto |
| Geração de notificações | SPEC-027 (OPEN-155) | 1 minuto |

A tarefa de expiração de assinaturas (SPEC-020, OPEN-90) também usa o agendador. Os intervalos de tarefas que consultam provedores externos devem respeitar as cotas definidas após a prova técnica da OPEN-01.

## Motivos

Um agendador dentro do processo único mantém a execução local simples e demonstrável (DA-05), sem infraestrutura adicional. Tarefas sem sobreposição, isoladas de falhas e idempotentes preservam a consistência dos dados diante de falhas do provedor ou do próprio processo (DA-02, DA-03).

## Consequências

- As tarefas só rodam enquanto o backend estiver em execução.
- Os testes acionam as tarefas diretamente e não dependem de relógio nem de rede externa (RNF18).
- Tarefas que usam provedores externos continuam sujeitas à prova técnica e às cotas (OPEN-01), com simulador identificado até lá.
- Mudar para um agendador externo ou para vários processos exigiria nova decisão, pois o ADR-0001 prevê um único processo.
