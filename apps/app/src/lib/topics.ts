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
      'Realizado é o que já foi pago ou recebido. Previsto é uma conta a pagar que ainda não foi paga, como a internet que vence no dia 15.',
      'Contas a pagar aparecem em "Ainda a pagar neste mês" e não entram em Recebido, Pago ou na diferença do mês. Quando você marca uma conta como paga, o Clarevo registra um gasto com o valor e a data do pagamento, e só esse gasto entra em Pago, no mês da data do pagamento.',
      'Uma conta vencida e ainda não paga continua em "Ainda a pagar" nos meses seguintes, até ser paga ou excluída. Se você anotou o pagamento como gasto em vez de marcar a conta como paga, exclua a conta a pagar para ela não continuar em "Ainda a pagar".',
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
  {
    slug: 'gasto-fixo',
    title: 'Gasto fixo, conta a pagar e gasto anotado',
    subtitle: 'Como cada um entra no mês',
    paragraphs: [
      'Um gasto fixo é uma regra: todo mês ele cria uma conta a pagar. Só quando você marca a conta como paga entra um gasto em Pago, uma única vez.',
      'Anotar o mesmo aluguel como gasto e como gasto fixo contaria duas vezes. Parcelas de compras no cartão ficam na fatura.',
    ],
    hypotheses: 'Exemplo fictício: aluguel de R$ 2.500,00 com vencimento no dia 5.',
  },
  {
    slug: 'estimativa',
    title: 'Contas que mudam de valor',
    subtitle: 'Luz, água e gás',
    paragraphs: [
      'Usamos o valor de referência que você informou, marcado como estimado, até você informar o valor de cada conta.',
      'Quando houver contas pagas, mostramos a média das últimas três como sugestão, e você decide se usa.',
    ],
    hypotheses: 'Contas fictícias de R$ 165,30, R$ 180,00 e R$ 171,90: média de R$ 172,40.',
  },
  {
    slug: 'contas-do-ano',
    title: 'Contas que chegam uma vez por ano',
    subtitle: 'IPVA, IPTU, matrícula e material escolar',
    paragraphs: [
      'Algumas contas não vêm todo mês, mas dá para saber que vão chegar: IPVA, IPTU, matrícula, material escolar e seguros anuais. Muitas se concentram no começo do ano.',
      'Uma forma de se preparar é somar o valor do ano e dividir por 12. Esse valor por mês mostra quanto da renda essas contas ocupam, mesmo nos meses em que nada vence.',
      'As condições de pagamento à vista ou parcelado são definidas por cada estado ou prefeitura. Confira datas e condições no site oficial da Secretaria da Fazenda do seu estado ou da sua prefeitura.',
      'No Clarevo, cadastre cada uma como conta do ano: o ano inteiro aparece em Contas a pagar dois meses antes do primeiro vencimento, e cada conta só entra em Ainda a pagar no mês em que vence.',
      'Exemplo: IPVA de R$ 1.800,00, IPTU de R$ 1.200,00, matrícula de R$ 900,00 e material escolar de R$ 600,00 somam R$ 4.500,00 no ano, ou R$ 375,00 por mês.',
    ],
    hypotheses: 'Valores fictícios, sem desconto à vista nem parcelamento.',
  },
  {
    slug: 'quitar-antes',
    title: 'Quitar antes do prazo',
    subtitle: 'O que a soma das parcelas não mostra',
    paragraphs: [
      'Em financiamentos e compras parceladas, parte de cada parcela é juros.',
      'O Código de Defesa do Consumidor (art. 52, § 2º) garante quitar antes, total ou parcialmente, com redução proporcional dos juros.',
      'Peça ao credor o valor atualizado: a soma das parcelas que faltam costuma ser maior.',
    ],
    hypotheses: 'Exemplo fictício: 36 parcelas de R$ 850,00.',
  },
];

export const topicBySlug = (slug: string) => TOPICS.find((t) => t.slug === slug);
