import type { Topic } from '../types';
import { BCB_CADERNO, CVM_GUIA, CVM_RESERVAS, REVIEWED_ON, clarevo, cvm, oficial } from './common';

/** Seção "Organizar o mês" (Anexo A, temas 1, 2, 3 e 5, com os ajustes de spec3 §3.4 e da conferência de fontes). */
export const ORGANIZAR_TOPICS: Topic[] = [
  {
    slug: 'gasto-fixo-variavel',
    section: 'organizar',
    kind: 'tema',
    status: 'publicado',
    title: 'Gasto fixo e gasto variável',
    subtitle: 'O que se repete e o que muda todo mês',
    question: 'Qual a diferença entre gasto fixo e gasto variável?',
    short:
      'Gasto fixo se repete com valor igual ou quase igual todo mês, como aluguel e internet. Gasto variável muda conforme o uso ou as escolhas do mês, como mercado e luz.',
    paragraphs: [
      'Gasto fixo é o que se repete com valor igual ou quase igual todo mês, como aluguel, escola, internet e parcelas. Gasto variável muda conforme o uso ou as escolhas do mês, como mercado, luz, água e lazer.',
      'Alguns gastos chegam só em certas épocas, como impostos, seguros e matrícula. Como dá para saber que vão chegar, eles entram no planejamento do ano, e não na reserva para imprevistos (veja "Contas que chegam uma vez por ano").',
      'Separar os dois tipos ajuda a ver o que já tem destino antes de o mês começar e onde há espaço para ajustes. No Clarevo, o que se repete todo mês pode virar um gasto fixo, que cria a conta a pagar de cada mês; contas que mudam de valor, como a de luz, entram com valor estimado até você informar o valor da conta.',
    ],
    example:
      'Aluguel de R$ 2.500,00 e internet de R$ 120,00 somam R$ 2.620,00 em gastos fixos. Mercado de R$ 1.100,00 e luz de R$ 172,40 somam R$ 1.272,40 em gastos variáveis. O mês fica em R$ 3.892,40.',
    calculation: '2.500,00 + 120,00 = 2.620,00 · 1.100,00 + 172,40 = 1.272,40 · 2.620,00 + 1.272,40 = 3.892,40.',
    hypotheses: 'Exemplo fictício, com valores de um único mês.',
    facts: [],
    keywords: ['despesa fixa', 'despesa variável', 'conta de luz', 'mercado', 'orçamento'],
    related: ['gasto-fixo', 'contas-do-ano', 'orcamento-50-30-20'],
    sources: [
      BCB_CADERNO('Módulo 2, orçamento pessoal ou familiar; despesas fixas são as que não variam ou variam muito pouco, como o aluguel e a prestação de um financiamento'),
      CVM_GUIA('Registrar as despesas que não são mensais, como impostos, seguros e matrículas'),
      CVM_RESERVAS('Reserva só para imprevistos, o que exclui gastos sazonais e previsíveis, como tributos e matrículas'),
      clarevo('D-024'),
    ],
    reviewedOn: REVIEWED_ON,
    reviewEveryMonths: 12,
  },
  {
    slug: 'contas-do-ano',
    section: 'organizar',
    kind: 'tema',
    status: 'publicado',
    title: 'Contas que chegam uma vez por ano',
    subtitle: 'IPVA, IPTU, matrícula e material escolar',
    question: 'Como me preparar para IPVA, IPTU e matrícula?',
    short:
      'IPVA, IPTU, matrícula e material escolar chegam em certas épocas. Somar o valor do ano e dividir por 12 mostra quanto da renda essas contas ocupam por mês.',
    paragraphs: [
      'Algumas contas não vêm todo mês, mas dá para saber que vão chegar: IPVA, IPTU, matrícula, material escolar e seguros anuais. Muitas se concentram no começo do ano.',
      'Uma forma de se preparar é somar o valor do ano e dividir por 12. Esse valor por mês mostra quanto da renda essas contas ocupam, mesmo nos meses em que nada vence.',
      'Como são previsíveis, essas contas não são imprevistos. O Portal do Investidor, da CVM, lembra que a reserva para imprevistos não serve para gastos de certa época do ano, como tributos e matrículas.',
      'As condições de pagamento à vista ou parcelado são definidas por cada estado ou prefeitura. Confira datas e condições no site oficial da Secretaria da Fazenda do seu estado ou da sua prefeitura.',
      'No Clarevo, cadastre cada uma como conta do ano: o ano inteiro aparece em Contas a pagar dois meses antes do primeiro vencimento, e cada conta só entra em Ainda a pagar no mês em que vence.',
    ],
    example:
      'IPVA de R$ 1.800,00, IPTU de R$ 1.200,00, matrícula de R$ 900,00 e material escolar de R$ 600,00 somam R$ 4.500,00 no ano, ou R$ 375,00 por mês.',
    calculation: '1.800,00 + 1.200,00 + 900,00 + 600,00 = 4.500,00 · 4.500,00 ÷ 12 = 375,00.',
    hypotheses: 'Valores fictícios, sem desconto à vista nem parcelamento.',
    facts: [],
    keywords: ['ipva', 'iptu', 'matrícula', 'material escolar', 'seguro anual', 'imposto', 'cota única', 'conta anual'],
    related: ['gasto-fixo-variavel', 'reserva-imprevistos'],
    sources: [
      CVM_RESERVAS('Reserva só para imprevistos: exclui gastos sazonais e previsíveis, como tributos e matrículas'),
      CVM_GUIA('Registrar as despesas que não são mensais, como impostos, seguros e matrículas'),
      oficial(
        'Prefeitura de São Paulo, Secretaria da Fazenda',
        'Edital do IPTU 2026',
        'https://prefeitura.sp.gov.br/web/fazenda/w/editaldoiptu2026',
        'Primeira parcela ou pagamento à vista em fevereiro; condições definidas pelo município',
      ),
      oficial(
        'Governo do Paraná',
        'Fazenda divulga datas do IPVA 2026',
        'https://www.parana.pr.gov.br/Audio/Com-aliquota-de-19-e-desconto-vista-Fazenda-divulga-datas-do-IPVA-2026',
        'Vencimentos a partir de janeiro; condições definidas pelo estado',
      ),
      clarevo('D-029'),
    ],
    reviewedOn: REVIEWED_ON,
    reviewEveryMonths: 12,
    calculator: { slug: 'parcelado-ou-a-vista', params: { modo: 'cota-unica' } },
  },
  {
    slug: 'orcamento-50-30-20',
    section: 'organizar',
    kind: 'tema',
    status: 'rascunho',
    title: 'Orçamento e a referência 50-30-20',
    subtitle: 'Um ponto de partida, não uma regra',
    question: 'O que é a regra 50-30-20?',
    short:
      'Referência criada nos Estados Unidos, não uma norma brasileira: 50% da renda líquida para necessidades, 30% para escolhas pessoais e 20% para guardar ou quitar dívidas.',
    paragraphs: [
      'Orçamento é o plano do mês: quanto entra, quanto sai e o que sobra. Com ele, as escolhas acontecem antes de o dinheiro sair, e não só no fim do mês.',
      'A divisão 50-30-20 foi popularizada pelo livro "All Your Worth", de Elizabeth Warren e Amelia Warren Tyagi (2005): 50% da renda líquida para necessidades, 30% para escolhas pessoais e 20% para guardar ou quitar dívidas.',
      'É uma referência criada nos Estados Unidos, não uma norma brasileira. Moradia, transporte e escola podem passar de 50% em algumas cidades e fases da vida. Use os percentuais como comparação; os seus podem ser outros.',
    ],
    example:
      'Com renda líquida de R$ 6.000,00, a referência daria R$ 3.000,00 para necessidades, R$ 1.800,00 para escolhas pessoais e R$ 1.200,00 para guardar ou quitar dívidas.',
    calculation: '6.000,00 × 50% = 3.000,00 · 6.000,00 × 30% = 1.800,00 · 6.000,00 × 20% = 1.200,00.',
    hypotheses: 'Renda líquida fictícia, já sem descontos como INSS e Imposto de Renda.',
    facts: [
      { text: '50%', source: 0 },
      { text: '30%', source: 0 },
      { text: '20%', source: 0 },
    ],
    keywords: ['orçamento', 'planejamento do mês', 'necessidades', 'desejos'],
    related: ['gasto-fixo-variavel', 'reserva-imprevistos'],
    sources: [
      {
        kind: 'obra',
        authors: 'Elizabeth Warren e Amelia Warren Tyagi',
        title: 'All Your Worth: The Ultimate Lifetime Money Plan',
        publisher: 'Free Press',
        year: 2005,
        locator: null,
        consultedOn: null,
      },
      BCB_CADERNO('Módulo 2, orçamento pessoal ou familiar'),
    ],
    reviewedOn: REVIEWED_ON,
    reviewEveryMonths: 12,
    pending: [
      'Confirmar no próprio livro (ou na página da editora) a divisão 50% necessidades, 30% escolhas pessoais e 20% para guardar ou quitar dívidas; as buscas de 09/10/2026 só trouxeram resenhas e resumos de terceiros.',
      'Confirmar no livro que a base é a renda líquida (depois dos impostos).',
      'Registrar capítulo ou página da divisão e preencher consultedOn da obra.',
    ],
  },
  {
    slug: 'reserva-imprevistos',
    section: 'organizar',
    kind: 'tema',
    status: 'publicado',
    title: 'Reserva para imprevistos',
    subtitle: 'Quantos meses de gastos guardar',
    question: 'De quanto precisa ser a reserva de emergência?',
    short:
      'Dinheiro para os gastos essenciais quando algo foge do plano. A CVM cita de 6 a 12 meses de gastos, conforme o tipo de renda, e 1, 3 ou 6 meses como exemplo de meta para começar.',
    paragraphs: [
      'A reserva para imprevistos cobre os gastos essenciais quando algo foge do plano, como perda de renda, um conserto ou um problema de saúde. A conta parte de quanto você gasta com o essencial em um mês, não da renda.',
      'O Portal do Investidor, da CVM, cita de 6 a 12 meses de gastos, conforme o tipo de renda (fixa ou variável), a estabilidade do emprego e quantas pessoas contribuem para a renda da casa. Como exemplo de meta para começar, o mesmo portal cita 1, 3 ou 6 meses de despesas.',
      'A reserva serve para imprevistos; contas previsíveis, como impostos e matrícula, ficam no planejamento do ano. Como pode ser usada a qualquer momento, ela precisa de acesso rápido ao dinheiro e pouca oscilação de valor (veja "Liquidez, risco e retorno"). Dinheiro para aproveitar uma oportunidade é outra meta, com outro objetivo.',
    ],
    example:
      'Com gastos essenciais de R$ 3.750,00 por mês, 1 mês de reserva é R$ 3.750,00; 3 meses, R$ 11.250,00; 6 meses, R$ 22.500,00; 12 meses, R$ 45.000,00. Guardando R$ 500,00 por mês, o primeiro mês de reserva fica completo no 8º mês.',
    calculation: '3.750,00 × 1 = 3.750,00 · × 3 = 11.250,00 · × 6 = 22.500,00 · × 12 = 45.000,00 · 3.750,00 ÷ 500,00 = 7,5 → 8 meses.',
    hypotheses: 'Gastos essenciais fictícios. Sem rendimento e sem resgates no período.',
    facts: [],
    keywords: ['reserva de emergência', 'emergência', 'imprevisto', 'colchão', 'meses de gastos'],
    related: ['contas-do-ano', 'liquidez-risco-retorno'],
    sources: [
      cvm(
        'Emergências e aposentadoria',
        'https://www.gov.br/investidor/pt-br/investir/antes-de-investir/defina-seus-objetivos/emergencias-e-aposentadoria',
        'Entre 6 e 12 meses de gastos, conforme o tipo de renda, a estabilidade no emprego e quantas pessoas contribuem para a renda; reserva de baixo risco e liquidez diária',
      ),
      CVM_RESERVAS('1, 3 ou 6 meses de despesas, por exemplo; reserva só para imprevistos, como problemas médicos, demissão ou reparo em casa'),
      CVM_GUIA('Custo de vida de 6 a 12 meses; por prudência, 12 meses'),
    ],
    reviewedOn: REVIEWED_ON,
    reviewEveryMonths: 12,
    aliases: ['reservas'],
    calculator: { slug: 'reserva', params: {} },
  },
];
