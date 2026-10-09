import type { Topic } from '../types';
import { REVIEWED_ON, bcb, cvm, mercado, oficial, planalto } from './common';

/** Seção "Dinheiro no tempo" (Anexo A, temas 18 a 21, com os ajustes da conferência de fontes de 09/10/2026). */
export const TEMPO_TOPICS: Topic[] = [
  {
    slug: 'inflacao-ipca',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Inflação e IPCA',
    subtitle: 'Por que o mesmo dinheiro compra menos',
    question: 'O que é IPCA?',
    short:
      'Inflação é o aumento geral dos preços. O IPCA, do IBGE, é o índice oficial; a meta do Conselho Monetário Nacional é de 3% ao ano, com tolerância de 1,5 ponto percentual.',
    paragraphs: [
      'Inflação é o aumento geral dos preços. Com ela, o mesmo valor compra menos com o passar do tempo.',
      'O IPCA, calculado todo mês pelo IBGE, é o índice oficial de inflação do Brasil. Ele mede preços de bens e serviços para famílias de áreas urbanas com renda de 1 a 40 salários mínimos; a sua inflação pessoal pode ser maior ou menor, conforme o que você consome.',
      'Desde 2025, a meta de inflação do Conselho Monetário Nacional é de 3% ao ano, medida pelo IPCA acumulado em 12 meses, com tolerância de 1,5 ponto percentual para mais ou para menos (de 1,5% a 4,5%). O número do último mês fica no site do IBGE.',
      'Taxas se acumulam: 4% num ano e 5% no seguinte dão 9,2% no total, e não 9%.',
    ],
    example:
      'Com inflação de 5% em um ano, uma compra de R$ 600,00 passa a custar R$ 630,00. Daqui a um ano, R$ 1.000,00 vão comprar o mesmo que R$ 952,38 compram hoje.',
    calculation: '600,00 × 1,05 = 630,00 · 1.000,00 ÷ 1,05 = 952,38 · 1,04 × 1,05 - 1 = 0,092 → 9,2%.',
    hypotheses: 'Inflação fictícia de 5% ao ano, a mesma em cada item.',
    facts: [
      { text: '3% ao ano', source: 3 },
      { text: 'de 1,5% a 4,5%', source: 3 },
    ],
    keywords: ['inflação', 'preços', 'poder de compra', 'índice de preços', 'meta de inflação'],
    related: ['selic', 'juros-simples-compostos', 'contas-do-ano'],
    sources: [
      oficial('IBGE', 'IBGE Explica: Inflação', 'https://www.ibge.gov.br/explica/inflacao.php', 'Definição de inflação; o IPCA é o índice oficial; a inflação pessoal pode ser maior ou menor que o IPCA'),
      oficial(
        'IBGE',
        'IPCA: Índice Nacional de Preços ao Consumidor Amplo',
        'https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9256-indice-nacional-de-precos-ao-consumidor-amplo.html',
        'População-objetivo: famílias com rendimentos de 1 a 40 salários mínimos, residentes nas áreas urbanas; periodicidade mensal',
      ),
      planalto(
        'Decreto nº 12.079/2024',
        'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/decreto/d12079.htm',
        'Meta representada por variações acumuladas em doze meses, apuradas mês a mês; mudança com antecedência mínima de trinta e seis meses',
      ),
      bcb(
        'Relatório de Política Monetária, março de 2026 (boxe)',
        'https://www.bcb.gov.br/content/ri/relatorioinflacao/202603/rpm202603b10p.pdf',
        'Meta de 3,00% para o período iniciado em janeiro de 2025, medida pelo IPCA, com intervalo de 1,50% a 4,50%',
      ),
      bcb(
        'Relatório de Política Monetária, setembro de 2025 (boxe)',
        'https://www.bcb.gov.br/content/ri/relatorioinflacao/202509/rpm202509b12p.pdf',
        'Meta fixada pela Resolução CMN nº 5.141, de 26 de junho de 2024',
      ),
    ],
    reviewedOn: REVIEWED_ON,
    reviewEveryMonths: 12,
    aliases: ['inflacao'],
  },
  {
    slug: 'selic',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Selic, a taxa básica de juros',
    subtitle: 'O que é e por que ela mexe com outras taxas',
    question: 'O que é a Selic?',
    short: 'A taxa básica de juros da economia, que influencia as outras taxas, definida pelo Copom em oito reuniões ordinárias por ano.',
    paragraphs: [
      'A Selic é a taxa básica de juros da economia e influencia as outras taxas de juros do país. Quando ela sobe ou desce, crédito e aplicações tendem a acompanhar, em ritmo e intensidade diferentes.',
      'O Comitê de Política Monetária (Copom), do Banco Central, define a meta da Selic em oito reuniões ordinárias por ano, cerca de uma a cada 45 dias. A Selic é o principal instrumento do Banco Central para levar a inflação à meta.',
      'A taxa cobrada num empréstimo fica acima do custo de captação do dinheiro pela instituição. Essa diferença se chama spread e inclui o risco de não pagamento, as despesas administrativas, os tributos e a margem da instituição.',
      'O Clarevo não prevê a Selic nem usa a taxa atual nos cálculos. O valor vigente e o calendário das reuniões ficam no site do Banco Central.',
    ],
    example:
      'Uma taxa básica fictícia de 10% ao ano equivale a 0,80% ao mês. Um empréstimo fictício a 3% ao mês equivale a 42,58% ao ano. A diferença entre a taxa do empréstimo e o custo de captação da instituição é o spread.',
    calculation: '1,10^(1/12) - 1 = 0,007974 → 0,80% ao mês · 1,03^12 - 1 = 0,425761 → 42,58% ao ano.',
    hypotheses: 'Taxas fictícias, com capitalização mensal; não são a Selic atual nem a taxa de nenhuma instituição.',
    facts: [],
    keywords: ['taxa básica', 'copom', 'juros básicos', 'spread', 'política monetária'],
    related: ['inflacao-ipca', 'taxa-mes-ano', 'cet'],
    sources: [
      bcb('Relatório de Administração do Selic 2023: Taxa Selic', 'https://www3.bcb.gov.br/rasselic2023/taxa-selic', 'Taxa básica de juros, que influencia outras taxas; principal instrumento de política monetária para controlar a inflação'),
      bcb(
        'Estudo Especial nº 118: Repasse da taxa Selic para o mercado de crédito bancário',
        'https://www.bcb.gov.br/conteudo/relatorioinflacao/EstudosEspeciais/EE118_Repasse_da_taxa_Selic_para_o_mercado_de_credito_bancario.pdf',
        'Alterações da Selic repassadas às diferentes modalidades de crédito',
      ),
      bcb(
        'Monetary Policy Committee (Copom)',
        'https://www.bcb.gov.br/en/monetarypolicy/committee',
        'Oito reuniões por ano, aproximadamente a cada 45 dias; calendário publicado até junho do ano anterior',
      ),
      bcb('Voto BCB nº 3/2021 (regulamento do Copom)', 'https://normativos.bcb.gov.br/Votos/BCB/20213/Voto_do_BC_3_2021.pdf', 'Oito reuniões ordinárias por ano e extraordinárias por convocação'),
      bcb(
        'Glossário das estatísticas monetárias e de crédito',
        'https://www.bcb.gov.br/content/estatisticas/Documents/Estatisticas_mensais/Monetaria_credito/glossariocredito.pdf',
        'Spread: diferença entre a taxa média de juros e o custo de captação',
      ),
      bcb(
        'Relatório de Estabilidade Financeira, abril de 2025 (apresentação)',
        'https://www.bcb.gov.br/conteudo/home-ptbr/TextosApresentacoes/REF_abril2025_coletiva_imprensa.pdf',
        'Componentes do spread: inadimplência, despesas administrativas, tributos e FGC, margem',
      ),
    ],
    reviewedOn: REVIEWED_ON,
    reviewEveryMonths: 12,
  },
  {
    slug: 'liquidez-risco-retorno',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Liquidez, risco e retorno',
    subtitle: 'Três perguntas antes de guardar dinheiro',
    question: 'O que é liquidez?',
    short:
      'Retorno é quanto o dinheiro pode render; risco, a chance de o resultado ser diferente; liquidez, a facilidade de virar dinheiro a um valor justo. O Clarevo não indica produtos.',
    paragraphs: [
      'Retorno é quanto o dinheiro pode render; no começo, ele é só uma expectativa. Risco é a chance de o resultado ser diferente do esperado, inclusive de perder parte do valor. Liquidez é a facilidade e a rapidez de transformar o que foi guardado em dinheiro, a um valor justo.',
      'Segundo a CVM, todo investimento tem algum risco, e retornos esperados maiores costumam vir com riscos maiores. A CVM também alerta que promessas de ganho muito acima do comum podem ser sinal de fraude.',
      'Não existe uma opção melhor para todo mundo: o adequado depende do objetivo e do prazo. A reserva para imprevistos precisa de liquidez; um objetivo de longo prazo pode conviver com mais oscilação, se a pessoa aceitar esse risco. O Clarevo não indica produtos nem instituições.',
    ],
    example:
      'Um bem que vale R$ 20.000,00 precisa ser vendido em poucos dias, e a única oferta é 10% abaixo do valor: R$ 18.000,00. A falta de liquidez custou R$ 2.000,00.',
    calculation: '20.000,00 × (1 - 10%) = 18.000,00 · 20.000,00 - 18.000,00 = 2.000,00.',
    hypotheses: 'Exemplo fictício, sem taxas de venda.',
    facts: [],
    keywords: ['liquidez', 'risco', 'retorno', 'rentabilidade', 'resgate', 'fraude'],
    related: ['reserva-imprevistos', 'fgc', 'o-que-o-clarevo-nao-faz'],
    sources: [
      cvm(
        'Liquidez',
        'https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos/liquidez',
        'Facilidade ou rapidez com que o investimento pode ser resgatado, vendido ou convertido em dinheiro, a um valor justo; reserva em alternativas mais líquidas',
      ),
      cvm(
        'Risco e a relação risco x retorno',
        'https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos/risco-e-a-relacao-risco-x-retorno',
        'Risco: probabilidade de o retorno obtido ser diferente do esperado',
      ),
      oficial(
        'CVM e Senacon',
        'Boletim Consumidor Investidor nº 1: objetivos e riscos',
        'https://www.gov.br/mj/pt-br/assuntos/seus-direitos/consumidor/boletins-para-o-consumo/boletim-consumidor-investidor/anexos/boletim-cvm-01',
        'Há risco em qualquer investimento; quanto maior a rentabilidade, maior o risco',
      ),
      cvm(
        'Pirâmides financeiras e esquemas Ponzi',
        'https://www.gov.br/investidor/pt-br/investir/cuidados-ao-investir/evitando-problemas/principais-fraudes-e-esquemas-irregulares/piramides-financeiras-e-esquemas-ponzi',
        'Ofertas com promessa de rentabilidade alta, acima do que o mercado oferece, em curto espaço de tempo',
      ),
    ],
    reviewedOn: REVIEWED_ON,
    reviewEveryMonths: 12,
    aliases: ['liquidez'],
  },
  {
    slug: 'fgc',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Garantia do FGC',
    subtitle: 'O que acontece se uma instituição quebrar',
    question: 'O que é o FGC?',
    short:
      'Entidade privada que devolve valores, dentro de limites, a quem tinha dinheiro numa instituição associada que sofreu intervenção ou liquidação: até R$ 250.000,00 por CPF ou CNPJ em cada instituição ou conglomerado.',
    paragraphs: [
      'O Fundo Garantidor de Créditos (FGC) é uma entidade privada, sem fins lucrativos, mantida por contribuições das instituições associadas. Ele devolve valores, dentro de limites, a quem tinha dinheiro numa instituição associada que sofreu intervenção ou liquidação.',
      'O limite é de R$ 250.000,00 por CPF ou CNPJ em cada instituição ou conglomerado, e de R$ 1.000.000,00 no total a cada 4 anos. Nem toda aplicação tem essa garantia; a lista do que é coberto fica no site do FGC.',
      'A garantia trata do risco de a instituição quebrar: ela só é acionada em intervenção, liquidação extrajudicial ou insolvência reconhecida pelo Banco Central.',
    ],
    example:
      'Com R$ 300.000,00 numa única instituição que sofre liquidação, a garantia cobre até R$ 250.000,00. Os outros R$ 50.000,00 ficam fora da garantia e dependem do processo de liquidação.',
    calculation: '300.000,00 - 250.000,00 = 50.000,00.',
    hypotheses: 'Exemplo fictício: uma pessoa titular, valores de tipos cobertos e nenhuma outra garantia do FGC no mesmo período de 4 anos.',
    facts: [
      { text: 'R$ 250.000,00', source: 0 },
      { text: 'R$ 1.000.000,00', source: 1 },
    ],
    keywords: ['fundo garantidor', 'garantia', 'liquidação', 'quebra de banco', 'limite da garantia'],
    related: ['liquidez-risco-retorno', 'selic'],
    sources: [
      mercado('FGC', 'Sobre a garantia FGC', 'https://www.fgc.org.br/en/sobre-garantia-fgc', 'R$ 250.000,00 por pessoa, por instituição ou conglomerado; o site lista o que é e o que não é coberto'),
      mercado(
        'FGC',
        'Regulamento do FGC',
        'https://www.fgc.org.br/documents/d/asset-library-52554/regulamento-fgc240905-1',
        'R$ 1.000.000,00 a cada período de quatro anos consecutivos, contado do primeiro evento',
      ),
      mercado(
        'FGC',
        'Estatuto do FGC',
        'https://fgc.org.br/documents/d/asset-library-52554/estatuto-fgc_-241055nv',
        'Garantia em intervenção, liquidação extrajudicial ou insolvência reconhecida pelo Banco Central; receitas de contribuições das associadas',
      ),
      mercado(
        'FGC',
        'Quem somos',
        'https://www1.fgc.org.br/sobre-o-fgc/quem-somos',
        'Entidade privada, sem fins lucrativos; custeio pelas contribuições mensais das associadas',
      ),
      mercado('FGC', 'Pagamento de garantia', 'https://fgc.org.br/en/pagamento-de-garantia', 'O que passa do limite fica como saldo a ser habilitado na instituição em liquidação'),
    ],
    reviewedOn: REVIEWED_ON,
    reviewEveryMonths: 12,
  },
];
