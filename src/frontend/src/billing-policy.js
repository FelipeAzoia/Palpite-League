// Política de Cobrança e Cancelamento do Premium (SPEC-019 CA-22, SPEC-020 seção 15 e SPEC-029).
// O texto descreve o comportamento real do sistema. Ao mudar qualquer regra, atualize o texto e a
// versão, aqui e em billingPolicyVersion no backend: a contratação só aceita a versão em vigor.

export const billingPolicyVersion = '2026-11-23.2'
export const billingPolicyTitle = 'Política de Cobrança e Cancelamento'
export const billingPolicyUpdatedAt = '23/11/2026 (revisão 2)'

export const billingPolicySections = Object.freeze([
  {
    title: 'Ambiente de teste',
    items: [
      'O Palpite League está em ambiente de teste: nenhuma operação movimenta dinheiro real.',
      'Os pagamentos são feitos no simulador, sempre identificado como simulação, ou no ambiente de testes do Mercado Pago.',
    ],
  },
  {
    title: 'Planos e valores',
    items: [
      'Mensal: R$ 19,90 por mês, em reais (BRL).',
      'Anual: R$ 199,00 por ano, pagos de uma vez a cada ano. Equivale a 2 meses grátis em relação a doze mensalidades (R$ 238,80).',
      'O valor fica fixo na sua assinatura enquanto ela estiver em andamento.',
    ],
  },
  {
    title: 'Cobrança e renovação automática',
    items: [
      'A primeira cobrança acontece quando você contrata, e o Premium só é ativado depois que o provedor confirma o pagamento.',
      'A assinatura é renovada automaticamente: no fim de cada mês (no mensal) ou de cada ano (no anual), o provedor cobra o próximo ciclo e a vigência é estendida.',
      'A vigência conta em meses de calendário a partir da confirmação. Se o dia não existir no mês de destino, vale o último dia desse mês.',
      'O sistema não repete cobranças por conta própria: cada cobrança é feita pelo provedor, uma vez por ciclo.',
    ],
  },
  {
    title: 'Pagamento em atraso',
    items: [
      'Se a cobrança da renovação for recusada, você tem 3 dias de carência, contados do fim do período, para regularizar. Durante a carência o Premium continua valendo.',
      'Na tela do plano você pode pedir uma nova tentativa de pagamento depois de uma recusa.',
      'Se o pagamento não for confirmado até o fim da carência, a assinatura expira e sua conta volta ao plano Gratuito.',
    ],
  },
  {
    title: 'Cancelamento',
    items: [
      'Você pode cancelar enquanto a assinatura estiver ativa, desde que tenha no máximo 1 bolão em andamento criado por você, que é o limite do plano Gratuito.',
      'O cancelamento fica pendente até o provedor confirmar. Confirmado, nenhuma cobrança nova acontece e o Premium continua até o fim do período já pago.',
      'Desde o pedido até o fim do período, você já não pode criar bolões além do limite do Gratuito.',
      'No fim do período sua conta volta ao plano Gratuito, e o bolão que continuar aberto deixa de ter resultados ao vivo.',
      'Se o provedor recusar o cancelamento, a assinatura continua ativa e você pode pedir de novo.',
    ],
  },
  {
    title: 'Reembolso',
    items: [
      'Não há reembolso de valores já pagos, nem proporcional ao tempo restante do mês ou do ano.',
    ],
  },
  {
    title: 'Seus bolões',
    items: [
      'Cancelar ou deixar a assinatura expirar não apaga nem encerra bolões: participações, palpites, pontos e medalhas continuam como estão.',
      'Depois de voltar ao Gratuito, você só cria um bolão novo quando tiver menos de 1 bolão em andamento criado por você.',
    ],
  },
  {
    title: 'Dados de pagamento',
    items: [
      'Os dados de pagamento são informados apenas no provedor de pagamentos. O Palpite League não pede nem guarda dados de cartão.',
    ],
  },
])
