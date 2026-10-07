/**
 * Educação breve e opcional, ligada à tarefa (CL C005, CL-V007). Exemplos fictícios com hipóteses declaradas.
 */
export interface Topic {
  slug: string;
  title: string;
  subtitle: string;
  paragraphs: string[];
  hypotheses: string;
}

export const TOPICS: Topic[] = [
  {
    slug: 'diferenca',
    title: 'Diferença do mês',
    subtitle: 'Como um registro entra no mês',
    paragraphs: [
      'A diferença do mês é o total recebido menos o total pago no período. Entra no mês a data do pagamento ou do recebimento, não a data da compra.',
      'Exemplo: com R$ 6.000 recebidos e R$ 3.900 pagos em outubro, a diferença é R$ 2.100. Um gasto de R$ 80 pago em 7 de outubro muda o total pago para R$ 3.980.',
    ],
    hypotheses: 'Exemplo fictício. Considera apenas registros realizados no mesmo contexto.',
  },
  {
    slug: 'realizado-previsto',
    title: 'Realizado e previsto',
    subtitle: 'O que já aconteceu e o que ainda vai acontecer',
    paragraphs: [
      'Realizado é o que já foi pago ou recebido. Previsto é um compromisso que ainda vai vencer, como a internet do dia 15.',
      'Valores previstos aparecem em "Ainda a pagar neste mês" e não entram em Recebido, Pago ou na diferença do mês.',
    ],
    hypotheses: 'Exemplo fictício.',
  },
  {
    slug: 'saldo',
    title: 'Diferença do mês e saldo da conta',
    subtitle: 'Por que são números diferentes',
    paragraphs: [
      'O saldo da conta depende do quanto havia antes do mês começar, de transferências e de outros movimentos. A diferença do mês olha só para recebimentos e pagamentos do período.',
      'Por isso o Clarevo não chama a diferença do mês de saldo nem de dinheiro disponível. Sem saldo inicial informado, não mostramos um saldo calculado.',
    ],
    hypotheses: 'Exemplo fictício.',
  },
  {
    slug: 'fatura',
    title: 'Fatura sem contar duas vezes',
    subtitle: 'Entenda o efeito no seu mês',
    paragraphs: [
      'Uma compra de R$ 160 no cartão registra o consumo. Pagar a fatura quita essa obrigação e movimenta a conta. Contar esse pagamento como uma nova compra duplicaria o consumo. Juros e tarifas têm registros próprios.',
      'Cartões ainda não estão disponíveis no Clarevo. Este conteúdo explica o conceito para quando chegarem.',
    ],
    hypotheses: 'Exemplo fictício: uma única compra à vista no cartão, sem parcelas, juros ou estornos.',
  },
];

export const topicBySlug = (slug: string) => TOPICS.find((t) => t.slug === slug);
