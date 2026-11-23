// Política de Cobrança e Cancelamento do Premium (SPEC-019 CA-22 e SPEC-020, alterações de 23/11/2026).
// O texto descreve o comportamento real do sistema. Ao mudar qualquer regra, atualize o texto e a
// versão, aqui e em billingPolicyVersion no backend: a contratação só aceita a versão em vigor.

export const billingPolicyVersion = '2026-11-23'
export const billingPolicyTitle = 'Política de Cobrança e Cancelamento'
export const billingPolicyUpdatedAt = '23/11/2026'

export const billingPolicySections = Object.freeze([
  {
    title: 'Ambiente de teste',
    items: [
      'O Palpite League está em ambiente de teste: nenhuma operação movimenta dinheiro real.',
      'Os pagamentos são feitos no simulador, sempre identificado como simulação, ou no ambiente de testes do Mercado Pago.',
    ],
  },
  {
    title: 'Valor e cobrança',
    items: [
      'O Premium custa R$ 19,90 por mês, em reais (BRL).',
      'A cobrança acontece uma única vez, quando você contrata, e é feita pelo provedor de pagamentos.',
      'O Premium só é ativado depois que o provedor confirma o pagamento. Enquanto isso, a contratação fica pendente e seu plano continua Gratuito.',
      'Se o pagamento for recusado, nada é ativado e você pode tentar de novo. Nenhuma cobrança é repetida automaticamente.',
    ],
  },
  {
    title: 'Vigência e renovação',
    items: [
      'A assinatura vale por um mês de calendário a partir da confirmação do pagamento. Se o dia não existir no mês seguinte, vale o último dia desse mês.',
      'Nesta versão não há renovação automática: ao fim da vigência a assinatura expira, sem nova cobrança, e sua conta volta ao plano Gratuito.',
      'Para continuar no Premium depois da expiração, basta contratar de novo.',
    ],
  },
  {
    title: 'Cancelamento',
    items: [
      'Você pode pedir o cancelamento enquanto a assinatura estiver ativa, desde que tenha no máximo 1 bolão em andamento criado por você, que é o limite do plano Gratuito.',
      'O cancelamento fica pendente até o provedor confirmar. Até lá o Premium continua valendo, mas você já não pode criar bolões além do limite do Gratuito.',
      'Confirmado o cancelamento, sua conta volta na hora ao plano Gratuito, e o bolão que continuar aberto deixa de ter resultados ao vivo.',
      'Se o provedor recusar o cancelamento, a assinatura continua ativa e você pode pedir de novo.',
    ],
  },
  {
    title: 'Reembolso',
    items: [
      'Não há reembolso do valor já pago, nem proporcional ao tempo que faltava da vigência.',
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
