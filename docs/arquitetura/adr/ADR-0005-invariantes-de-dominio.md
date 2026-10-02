# ADR-0005 — Validar invariantes de domínio no backend

- **Status:** Proposto
- **Data:** 2026-10-02
- **Drivers relacionados:** DA-01, DA-04

## Contexto

O domínio contém regras que precisam valer independentemente da interface utilizada: imutabilidade das regras do bolão, autorização por papel, exclusividade do tipo de palpite e bloqueio de palpites após o início da partida.

## Decisão proposta

Validar regras de negócio no backend antes de confirmar operações. A interface pode repetir validações para orientar o usuário, mas não será a autoridade para permitir mudanças de estado.

## Motivos

Validação somente na interface pode ser contornada e não protege contra chamadas diretas à API ou clientes diferentes. O backend é o ponto comum de controle das operações.

## Consequências

- Operações devem verificar autorização e regras do domínio no servidor.
- O instante de início da partida e alterações concorrentes precisam ser considerados ao aceitar ou rejeitar palpites.
- Quando a persistência for definida, devem ser avaliadas restrições transacionais e de unicidade para complementar as validações.
- Testes devem cobrir tentativas inválidas, além dos fluxos de sucesso.