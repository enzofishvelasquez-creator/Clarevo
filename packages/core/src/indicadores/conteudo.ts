import type { CalcSlug } from '../calculators/catalog';
import { calcRendimentoCdi, regressiveTableText } from '../calculators/rendimento-cdi';
import type { SiteCalcSlug } from '../calculators/site-calculators';
import type { IsoDate } from '../dates';
import { indexOverMonths } from '../investments';
import { formatBp, formatRate } from '../learn/format';
import { realRateBp } from '../learn/math';
import { CONSULTED_ON, INVEST_CONSULTED_ON } from '../learn/topics/common';
import type { LearnSource, TopicSlug } from '../learn/types';
import { formatBRL } from '../money';
import { INDICADORES_TEXT, SGS_INDICADORES, type IndicadorId } from './index';

/**
 * O texto das páginas de mercado do site (D-106, `docs/22_SITE.md`, seção 16): uma página por indicador, o glossário e as duas
 * explicações permanentes ("O que muda quando a Selic muda" e "Como ler o IPCA"). Educação financeira com fonte: nenhum título,
 * empresa, opinião, previsão, ranking, "melhores" ou indicação de aplicação. Os exemplos são fictícios e calculados pelo núcleo (o teste
 * confere cada número). Revisão a cada 12 meses, como os temas de Aprender.
 *
 * Método das fontes (o mesmo de Aprender): os sites oficiais não abrem a partir do ambiente de trabalho. As fontes repetidas dos temas
 * de Aprender mantêm a data de consulta deles; as novas (as páginas das séries no portal de dados abertos do Banco Central e a página
 * do Copom) foram achadas por resultado de busca em 17/11/2026, e o `locator` diz isso.
 */
export const INDICADORES_REVIEWED_ON: IsoDate = '2026-11-17';
export const INDICADORES_REVIEW_EVERY_MONTHS = 12;
const CONSULTA_NOVA: IsoDate = '2026-11-17';

const BCB = 'Banco Central do Brasil';
const PLANALTO = 'Presidência da República';
const BUSCA = 'endereço achado por resultado de busca; a página não abriu daqui';
const TRECHO = 'trecho de resultado de busca; a página não abriu';

const novaBcb = (title: string, url: string, locator: string): LearnSource => ({ kind: 'oficial', publisher: BCB, title, url, locator: `${locator}; ${BUSCA}`, consultedOn: CONSULTA_NOVA });

/** As fontes das páginas de mercado. As que vêm dos temas de Aprender repetem o endereço e a data de consulta de lá. */
export const FONTES_INDICADORES = {
  dadosAbertos: novaBcb('Portal de Dados Abertos do Banco Central', 'https://dadosabertos.bcb.gov.br/', 'Séries do Sistema Gerenciador de Séries Temporais (SGS), com a API usada pelo site'),
  serieSelic: novaBcb(
    'Taxa de juros: Meta Selic definida pelo Copom (série 432)',
    'https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom',
    'Série diária do SGS, em % ao ano',
  ),
  serieDolar: novaBcb(
    'Taxa de câmbio, livre, dólar americano (venda), diário (série 1)',
    'https://dadosabertos.bcb.gov.br/dataset/1-taxa-de-cambio---livre---dolar-americano-venda---diario',
    'Série diária do SGS da taxa de venda do dólar, da fonte PTAX',
  ),
  boletinsDolar: novaBcb(
    'Dólar comercial (venda e compra): cotações diárias',
    'https://dadosabertos.bcb.gov.br/dataset/dolar-americano-usd-todos-os-boletins-diarios',
    'Taxa PTAX de fechamento; desde 01/07/2011, média aritmética das taxas de quatro consultas diárias aos dealers de câmbio',
  ),
  copom: novaBcb('Comitê de Política Monetária (Copom)', 'https://www.bcb.gov.br/controleinflacao/copom', 'Página oficial do Copom, com o calendário das reuniões e as decisões'),
  taxaSelic: {
    kind: 'oficial',
    publisher: BCB,
    title: 'Relatório de Administração do Selic 2023: Taxa Selic',
    url: 'https://www3.bcb.gov.br/rasselic2023/taxa-selic',
    locator: 'Taxa básica de juros, que influencia outras taxas; principal instrumento de política monetária para controlar a inflação',
    consultedOn: CONSULTED_ON,
  },
  repasseSelic: {
    kind: 'oficial',
    publisher: BCB,
    title: 'Estudo Especial nº 118: Repasse da taxa Selic para o mercado de crédito bancário',
    url: 'https://www.bcb.gov.br/conteudo/relatorioinflacao/EstudosEspeciais/EE118_Repasse_da_taxa_Selic_para_o_mercado_de_credito_bancario.pdf',
    locator: 'Alterações da Selic repassadas às diferentes modalidades de crédito',
    consultedOn: CONSULTED_ON,
  },
  lei12703: {
    kind: 'oficial',
    publisher: PLANALTO,
    title: 'Lei nº 12.703/2012 (remuneração dos depósitos de poupança)',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12703.htm',
    locator: `Remuneração adicional de 0,5% ao mês enquanto a meta da Selic ao ano for superior a 8,5%, ou de 70% da meta da Selic, mensalizada, nos demais casos, além da TR; ${TRECHO}`,
    consultedOn: INVEST_CONSULTED_ON,
  },
  poupancaBcb: {
    kind: 'oficial',
    publisher: BCB,
    title: 'Remuneração dos depósitos de poupança',
    url: 'https://www.bcb.gov.br/pec/poupanca/poupanca.asp?frame=1',
    locator: `Remuneração composta pela TR e por uma parcela adicional, que muda conforme a meta da Selic esteja acima de 8,5% ou não; ${TRECHO}`,
    consultedOn: INVEST_CONSULTED_ON,
  },
  rendimentosIsentos: {
    kind: 'oficial',
    publisher: 'Receita Federal',
    title: 'Rendimentos do Capital (manual do Meu Imposto de Renda)',
    url: 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/manual-mir/rendimentos/rendimentos-do-capital',
    locator: `Rendimentos de cadernetas de poupança são isentos e não tributáveis para pessoa física; ${TRECHO}`,
    consultedOn: INVEST_CONSULTED_ON,
  },
  ibgeInflacao: {
    kind: 'oficial',
    publisher: 'IBGE',
    title: 'IBGE Explica: Inflação',
    url: 'https://www.ibge.gov.br/explica/inflacao.php',
    locator: 'Definição de inflação; o IPCA é o índice oficial; a inflação pessoal pode ser maior ou menor que o IPCA',
    consultedOn: CONSULTED_ON,
  },
  ibgeIpca: {
    kind: 'oficial',
    publisher: 'IBGE',
    title: 'IPCA: Índice Nacional de Preços ao Consumidor Amplo',
    url: 'https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9256-indice-nacional-de-precos-ao-consumidor-amplo.html',
    locator: 'População-objetivo: famílias com rendimentos de 1 a 40 salários mínimos, residentes nas áreas urbanas; periodicidade mensal',
    consultedOn: CONSULTED_ON,
  },
  metaInflacao: {
    kind: 'oficial',
    publisher: PLANALTO,
    title: 'Decreto nº 12.079/2024',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/decreto/d12079.htm',
    locator: 'Meta representada por variações acumuladas em doze meses, apuradas mês a mês',
    consultedOn: CONSULTED_ON,
  },
  lei11033: {
    kind: 'oficial',
    publisher: PLANALTO,
    title: 'Lei nº 11.033/2004 (texto compilado)',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033compilado.htm',
    locator: `Tabela regressiva do imposto de renda sobre os rendimentos de aplicações de renda fixa; ${TRECHO}`,
    consultedOn: INVEST_CONSULTED_ON,
  },
} satisfies Record<string, LearnSource>;

const F = FONTES_INDICADORES;

/** Uma seção "O que muda" de uma página: título curto e texto. */
export interface SecaoIndicador {
  titulo: string;
  texto: string;
}

export interface PaginaIndicador {
  id: IndicadorId;
  /** Endereço da página no site (`indicadores/<slug>.html`). */
  slug: string;
  /** O título da página, como as pessoas buscam ("Selic hoje"). */
  titulo: string;
  subtitulo: string;
  oQueE: string[];
  /** O que muda na vida da pessoa: renda fixa, dívidas e poupança (no dólar, compras, contratos e dívidas em dólar). */
  oQueMuda: SecaoIndicador[];
  /** De onde vem o número: a série do SGS e, quando há, a conta da Clarevo. */
  origem: string;
  temas: TopicSlug[];
  calculadoras: (CalcSlug | SiteCalcSlug)[];
  fontes: LearnSource[];
}

const REGRA_POUPANCA =
  'Pela regra em vigor, com a meta da Selic acima de 8,5% ao ano, a poupança rende 0,5% ao mês mais a TR; com a meta em 8,5% ou menos, rende 70% da meta, ao mês, mais a TR.';

export const PAGINAS_INDICADORES: readonly PaginaIndicador[] = [
  {
    id: 'selic',
    slug: 'selic-hoje',
    titulo: 'Selic hoje',
    subtitulo: 'A meta da taxa básica de juros, definida pelo Copom, com a data e a fonte.',
    oQueE: [
      'A Selic é a taxa básica de juros da economia. A meta é definida pelo Comitê de Política Monetária (Copom), do Banco Central, em oito reuniões ordinárias por ano, e vale até uma reunião seguinte mudar o número.',
      'Ela influencia as outras taxas de juros do país, das aplicações aos empréstimos, em ritmo e intensidade diferentes. A Clarevo não prevê a Selic: esta página mostra só a meta em vigor no dia indicado.',
    ],
    oQueMuda: [
      {
        titulo: 'Na renda fixa',
        texto:
          'Aplicações que rendem um percentual do CDI ou da Selic tendem a acompanhar a meta: quando ela muda, o rendimento dos dias seguintes muda junto. Nas prefixadas, a taxa contratada não muda, mas o preço de quem vende antes do vencimento muda, o que se chama marcação a mercado.',
      },
      {
        titulo: 'Nas dívidas',
        texto:
          'Os juros de novos empréstimos e financiamentos costumam acompanhar a Selic, com atraso e com diferenças entre as modalidades. Um contrato com taxa fixa não muda. O rotativo do cartão e o cheque especial cobram juros bem acima da Selic.',
      },
      { titulo: 'Na poupança', texto: REGRA_POUPANCA },
    ],
    origem: `Série ${SGS_INDICADORES.selic} do Sistema Gerenciador de Séries Temporais (SGS) do Banco Central: a meta da Selic definida pelo Copom, em % ao ano, dia a dia.`,
    temas: ['selic', 'titulos-publicos', 'ganho-real'],
    calculadoras: ['rendimento-cdi', 'juros-compostos', 'custo-da-divida'],
    fontes: [F.serieSelic, F.copom, F.taxaSelic, F.lei12703, F.poupancaBcb],
  },
  {
    id: 'cdi',
    slug: 'cdi-hoje',
    titulo: 'CDI hoje',
    subtitulo: 'A taxa que serve de referência para boa parte da renda fixa, com a data e a fonte.',
    oQueE: [
      'O CDI é a taxa média dos empréstimos de um dia entre instituições financeiras. Ela fica muito perto da Selic e serve de referência para muitas aplicações de renda fixa, que dizem quanto rendem como um percentual do CDI.',
      'O Banco Central publica a taxa de cada dia útil, ao dia. Para comparar com outras taxas, esta página mostra a taxa ao ano, em 252 dias úteis, a convenção do mercado para o CDI.',
    ],
    oQueMuda: [
      {
        titulo: 'Na renda fixa',
        texto:
          'Quem aplica a 100% do CDI recebe, em cada dia útil, a taxa do dia; a 90% do CDI, 90% dela. Como o CDI acompanha a Selic, uma mudança na meta muda o rendimento dos dias seguintes. A calculadora "Quanto rende a um percentual do CDI?" faz essa conta, com o Imposto de Renda.',
      },
      {
        titulo: 'Nas dívidas',
        texto: 'Alguns empréstimos e financiamentos têm juros ligados ao CDI, mais uma taxa fixa. Nesses contratos, o custo acompanha o CDI; nos de taxa fixa, nada muda.',
      },
      {
        titulo: 'Na poupança',
        texto:
          'A poupança não segue o CDI: ela tem regra própria, ligada à meta da Selic e à TR. Comparar os dois ajuda a ler os números, mas não diz o que escolher: prazo, risco, liquidez e imposto também contam.',
      },
    ],
    origem: `Série ${SGS_INDICADORES.cdi} do SGS do Banco Central: a taxa do CDI, em % ao dia, nos dias úteis. A Clarevo passa a taxa do último dia publicado para o ano: (1 + taxa ao dia) elevado a 252, menos 1.`,
    temas: ['liquidez-risco-retorno', 'ir-investimentos', 'fgc'],
    calculadoras: ['rendimento-cdi', 'juros-compostos'],
    fontes: [F.dadosAbertos, F.taxaSelic, F.lei11033],
  },
  {
    id: 'ipca',
    slug: 'ipca-12-meses',
    titulo: 'IPCA em 12 meses',
    subtitulo: 'A inflação oficial acumulada nos últimos 12 meses publicados, com os meses e a fonte.',
    oQueE: [
      'O IPCA, calculado todo mês pelo IBGE, é o índice oficial de inflação do Brasil. O acumulado em 12 meses junta as variações dos últimos 12 meses publicados, e é por ele que se mede a meta de inflação.',
      'A meta do Conselho Monetário Nacional é de 3% ao ano, com tolerância de 1,5 ponto percentual para mais ou para menos. O resultado de cada mês é divulgado no mês seguinte.',
    ],
    oQueMuda: [
      {
        titulo: 'Na renda fixa',
        texto:
          'O que mede se o dinheiro guardado ganhou poder de compra é o rendimento acima da inflação, o ganho real. Há também aplicações que rendem o IPCA mais uma taxa: o valor delas acompanha a inflação do período.',
      },
      {
        titulo: 'Nas dívidas',
        texto: 'Alguns contratos, como aluguéis e financiamentos longos, são corrigidos por um índice de preços. Quando o índice do contrato sobe, a parcela ou o saldo sobem junto. O contrato diz qual índice vale.',
      },
      {
        titulo: 'Na poupança',
        texto:
          'A poupança não é corrigida pela inflação: rende pela regra da Selic e da TR. Quando o IPCA de um período passa do que ela rendeu no mesmo período, o dinheiro guardado compra menos.',
      },
    ],
    origem: `Série ${SGS_INDICADORES.ipca} do SGS do Banco Central: a variação mensal do IPCA, calculado pelo IBGE. A Clarevo acumula os últimos 12 meses publicados, multiplicando as taxas. Por arredondamento, o resultado pode diferir em 0,01 ponto do número que o IBGE divulga.`,
    temas: ['inflacao-ipca', 'ganho-real', 'simulacao'],
    calculadoras: ['juros-compostos', 'juntar-para-objetivo'],
    fontes: [F.ibgeInflacao, F.ibgeIpca, F.metaInflacao, F.dadosAbertos],
  },
  {
    id: 'poupanca',
    slug: 'rendimento-da-poupanca',
    titulo: 'Rendimento da poupança hoje',
    subtitulo: 'Quanto a poupança rende no mês, pela regra em vigor, com o período e a fonte.',
    oQueE: [
      'A poupança rende uma vez por mês, na data de aniversário do depósito: o dia do mês em que o dinheiro entrou. O número desta página é o rendimento do período que começa na data indicada.',
      `${REGRA_POUPANCA} Para pessoa física, o rendimento é isento de Imposto de Renda.`,
    ],
    oQueMuda: [
      {
        titulo: 'Na renda fixa',
        texto:
          'A poupança é uma referência conhecida para comparar com outras aplicações. Comparar ajuda a ler os números, mas não diz o que escolher: prazo, risco, liquidez e imposto também contam.',
      },
      {
        titulo: 'Nas dívidas',
        texto:
          'Os juros do rotativo do cartão e do cheque especial ficam muito acima do rendimento da poupança. A calculadora "Quanto custa uma dívida?" mostra quanto uma dívida custa com os seus números.',
      },
      {
        titulo: 'Quando a Selic muda',
        texto:
          'Com a meta acima de 8,5% ao ano, mudanças na Selic mexem pouco na poupança, só pela TR. Com a meta em 8,5% ou menos, o rendimento passa a acompanhar 70% da meta.',
      },
    ],
    origem: `Série ${SGS_INDICADORES.poupanca} do SGS do Banco Central: o rendimento dos depósitos de poupança pela regra de 04/05/2012, em % no período, por data de aniversário. É a mesma série que o app usa em Investir.`,
    temas: ['ganho-real', 'reserva-imprevistos', 'fgc', 'liquidez-risco-retorno'],
    calculadoras: ['juros-compostos', 'reserva', 'custo-da-divida'],
    fontes: [F.lei12703, F.poupancaBcb, F.rendimentosIsentos, F.dadosAbertos],
  },
  {
    id: 'ptax',
    slug: 'dolar-ptax-hoje',
    titulo: 'Dólar PTAX hoje',
    subtitulo: 'A taxa de referência do dólar que o Banco Central calcula uma vez por dia. Não é cotação ao vivo.',
    oQueE: [
      'A PTAX é uma taxa de câmbio de referência calculada pelo Banco Central: a média de consultas feitas a instituições do mercado de câmbio em quatro momentos do dia. O valor de fechamento sai uma vez por dia, depois da última consulta.',
      'Esta página mostra a PTAX de venda do último dia publicado. Ela não é o preço de uma compra de dólar agora, numa casa de câmbio ou no cartão: esses preços incluem a margem de cada instituição e os tributos.',
    ],
    oQueMuda: [
      {
        titulo: 'Nas compras em dólar',
        texto:
          'O valor em reais de uma compra em dólar, no cartão ou em sites de fora, depende da taxa que a instituição usa, que inclui a margem dela, e do IOF. A PTAX ajuda a ter uma ideia, mas não é o valor que vai na fatura.',
      },
      {
        titulo: 'Em contratos em dólar',
        texto: 'Contratos e aplicações ligados ao dólar costumam usar a PTAX como referência para converter valores para reais.',
      },
      { titulo: 'Nas dívidas', texto: 'Uma dívida em dólar fica maior ou menor em reais conforme o dólar muda. Dívidas em reais não mudam com a PTAX.' },
    ],
    origem: `Série ${SGS_INDICADORES.ptax} do SGS do Banco Central: a taxa de venda do dólar dos Estados Unidos, da PTAX de fechamento, nos dias úteis.`,
    temas: ['iof-credito', 'taxa-e-tarifa'],
    calculadoras: [],
    fontes: [F.serieDolar, F.boletinsDolar],
  },
];

/** A página de um indicador. */
export const paginaDoIndicador = (id: IndicadorId): PaginaIndicador => PAGINAS_INDICADORES.find((p) => p.id === id)!;

// ---------------------------------------------------------------------------------------------------------------------------------
// Glossário

export interface TermoGlossario {
  /** Âncora na página (`#cdi`). */
  id: string;
  termo: string;
  definicao: string;
  /** Temas de Aprender que explicam o termo (o site liga para eles). */
  temas: TopicSlug[];
  /** A página de indicador que mostra o número de hoje, quando há. */
  indicador: IndicadorId | null;
  /** Fonte própria, para o termo que não tem tema de Aprender. */
  fontes: LearnSource[];
}

export const GLOSSARIO: readonly TermoGlossario[] = [
  {
    id: 'cdi',
    termo: 'CDI',
    definicao: 'Taxa média dos empréstimos de um dia entre instituições financeiras. Fica muito perto da Selic e serve de referência para muitas aplicações de renda fixa, que rendem "um percentual do CDI".',
    temas: ['liquidez-risco-retorno'],
    indicador: 'cdi',
    fontes: [F.dadosAbertos],
  },
  {
    id: 'come-cotas',
    termo: 'Come-cotas',
    definicao:
      'Cobrança antecipada do Imposto de Renda em fundos abertos, como os de renda fixa: no último dia útil de maio e de novembro, o fundo recolhe o imposto sobre o rendimento do período, com menos cotas para quem investe.',
    temas: ['ir-investimentos'],
    indicador: null,
    fontes: [],
  },
  {
    id: 'copom',
    termo: 'Copom',
    definicao: 'Comitê de Política Monetária do Banco Central, que define a meta da Selic em oito reuniões ordinárias por ano. As datas das reuniões ficam na página oficial do Banco Central.',
    temas: ['selic'],
    indicador: 'selic',
    fontes: [F.copom],
  },
  {
    id: 'fgc',
    termo: 'FGC',
    definicao:
      'Fundo Garantidor de Créditos: devolve valores, dentro de limites por pessoa e por instituição, a quem tinha dinheiro em certos tipos de aplicação numa instituição associada que sofreu intervenção ou liquidação.',
    temas: ['fgc'],
    indicador: null,
    fontes: [],
  },
  {
    id: 'iof',
    termo: 'IOF',
    definicao:
      'Imposto sobre Operações Financeiras. No crédito, entra em empréstimos e financiamentos. Nas aplicações de renda fixa, só nos resgates com menos de 30 dias, sobre o rendimento, numa tabela que cai dia a dia até zerar.',
    temas: ['iof-credito', 'ir-investimentos'],
    indicador: null,
    fontes: [],
  },
  {
    id: 'ipca',
    termo: 'IPCA',
    definicao: 'Índice oficial de inflação do Brasil, calculado todo mês pelo IBGE. O acumulado em 12 meses é o número usado para medir a meta de inflação.',
    temas: ['inflacao-ipca'],
    indicador: 'ipca',
    fontes: [],
  },
  {
    id: 'ir-regressivo',
    termo: 'IR regressivo',
    definicao: `Tabela do Imposto de Renda da renda fixa: a alíquota sobre o rendimento cai com o prazo da aplicação, ${regressiveTableText()}.`,
    temas: ['ir-investimentos'],
    indicador: null,
    fontes: [F.lei11033],
  },
  {
    id: 'liquidez',
    termo: 'Liquidez',
    definicao:
      'A facilidade de transformar uma aplicação em dinheiro disponível, sem perder valor. Alta liquidez é poder resgatar a qualquer dia; baixa liquidez é ter de esperar um prazo ou aceitar um preço menor para sair antes.',
    temas: ['liquidez-risco-retorno'],
    indicador: null,
    fontes: [],
  },
  {
    id: 'marcacao-a-mercado',
    termo: 'Marcação a mercado',
    definicao:
      'O ajuste diário do preço de um título conforme os juros do mercado. Quem fica até o vencimento recebe o que foi contratado; quem vende antes recebe o preço do dia, que pode ser maior ou menor.',
    temas: ['titulos-publicos'],
    indicador: null,
    fontes: [],
  },
  {
    id: 'ptax',
    termo: 'PTAX',
    definicao:
      'Taxa de câmbio de referência calculada pelo Banco Central uma vez por dia, a partir de consultas a instituições do mercado de câmbio. Não é cotação ao vivo nem o preço de uma casa de câmbio.',
    temas: [],
    indicador: 'ptax',
    fontes: [F.boletinsDolar],
  },
  {
    id: 'selic',
    termo: 'Selic',
    definicao: 'A taxa básica de juros da economia. A meta é definida pelo Copom, do Banco Central, e influencia as outras taxas de juros do país.',
    temas: ['selic'],
    indicador: 'selic',
    fontes: [],
  },
  {
    id: 'tr',
    termo: 'TR',
    definicao: 'Taxa Referencial, calculada pelo Banco Central. Entra no rendimento da poupança, junto com a parte que depende da Selic, e na correção de alguns financiamentos.',
    temas: ['ganho-real'],
    indicador: 'poupanca',
    fontes: [F.poupancaBcb],
  },
];

// ---------------------------------------------------------------------------------------------------------------------------------
// Explicações permanentes

export interface Explicacao {
  slug: string;
  titulo: string;
  subtitulo: string;
  resumo: string;
  secoes: { titulo: string; paragrafos: string[] }[];
  /** Exemplo fictício, calculado pelo núcleo, com as hipóteses. */
  exemplo: { texto: string; conta: string[]; hipoteses: string };
  temas: TopicSlug[];
  indicadores: IndicadorId[];
  fontes: LearnSource[];
}

/** O bruto de R$ 10.000,00 a 100% do CDI em 12 meses, com um CDI fictício, pela calculadora do núcleo (sem imposto). */
function brutoA100DoCdi(cdiTexto: string): number {
  const s = calcRendimentoCdi({ valor: '10.000,00', percentual: '100', cdiAno: cdiTexto, meses: '12', imposto: 'isento' });
  if (!s.ok) throw new Error(`o exemplo da Selic não calcula: ${JSON.stringify(s.errors)}`);
  return s.result.grossCents;
}

/** "O que muda quando a Selic muda": o exemplo de 10% e 11% ao ano. */
export function exemploDaSelic(): { menor: number; maior: number } {
  return { menor: brutoA100DoCdi('10'), maior: brutoA100DoCdi('11') };
}

/** "Como ler o IPCA": 0,5% em cada um de 12 meses e 1% em dois meses seguidos, acumulados pela conta do núcleo. */
export function exemploDoIpca(): { dozeMeses: string; doisMeses: string; ganhoReal: string } {
  const meses = Array.from({ length: 12 }, (_, i) => `2000-${String(i + 1).padStart(2, '0')}`);
  const doze = indexOverMonths(Object.fromEntries(meses.map((m) => [m, 0.5])), meses)!;
  const dois = indexOverMonths({ '2000-01': 1, '2000-02': 1 }, ['2000-01', '2000-02'])!;
  return { dozeMeses: formatRate(doze), doisMeses: formatRate(dois), ganhoReal: formatBp(realRateBp(1_000, 450)) };
}

function explicacoes(): Explicacao[] {
  const selic = exemploDaSelic();
  const ipca = exemploDoIpca();
  return [
    {
      slug: 'quando-a-selic-muda',
      titulo: 'O que muda quando a Selic muda',
      subtitulo: 'Na renda fixa, nas dívidas e na poupança, sem previsão.',
      resumo: 'Quando o Copom muda a meta da Selic, mudam o rendimento das aplicações pós-fixadas, o preço dos títulos prefixados, os juros de novos empréstimos e, abaixo de 8,5% ao ano, a poupança.',
      secoes: [
        {
          titulo: 'Quem decide e quando',
          paragrafos: [
            'A meta da Selic é decidida pelo Comitê de Política Monetária (Copom), do Banco Central, em oito reuniões ordinárias por ano. A decisão é divulgada no fim do segundo dia de reunião e passa a valer em seguida.',
            'As datas das reuniões e os comunicados ficam na página oficial do Banco Central. A meta em vigor, com a data, está em "Selic hoje".',
          ],
        },
        {
          titulo: 'Na renda fixa pós-fixada',
          paragrafos: [
            'Aplicações que rendem um percentual do CDI ou da Selic acompanham a meta: o rendimento de cada dia usa a taxa daquele dia. Uma mudança no Copom muda o rendimento dos dias seguintes, não o que já rendeu.',
          ],
        },
        {
          titulo: 'Na renda fixa prefixada',
          paragrafos: [
            'A taxa contratada não muda. O que muda é o preço de quem vende antes do vencimento: quando os juros sobem, o preço dos títulos prefixados já emitidos tende a cair; quando caem, tende a subir. É a marcação a mercado. Quem fica até o vencimento recebe o que foi contratado.',
          ],
        },
        {
          titulo: 'Nas dívidas',
          paragrafos: [
            'Novos empréstimos e financiamentos tendem a ficar mais caros quando a Selic sobe e mais baratos quando ela cai, com atraso e com diferenças entre as modalidades. Contratos com taxa fixa não mudam; contratos com juros ligados ao CDI mudam junto.',
            'O rotativo do cartão e o cheque especial cobram juros muito acima da Selic, com regras próprias de limite, que os temas de Aprender explicam.',
          ],
        },
        { titulo: 'Na poupança', paragrafos: [REGRA_POUPANCA, 'Com a meta acima de 8,5% ao ano, uma mudança na Selic mexe pouco na poupança, só pela TR.'] },
        {
          titulo: 'O que a Clarevo não faz',
          paragrafos: ['A Clarevo não prevê a Selic, não diz se ela vai subir ou cair e não indica aplicação. Os números, com data e fonte, ficam nas páginas de indicadores.'],
        },
      ],
      exemplo: {
        texto: `Com R$ 10.000,00 aplicados a 100% do CDI por 12 meses, um CDI de 10% ao ano leva a ${formatBRL(selic.menor)} brutos; um CDI de 11% ao ano, a ${formatBRL(selic.maior)}. A diferença é de ${formatBRL(selic.maior - selic.menor)} no ano.`,
        conta: [`10.000,00 × 1,10 = ${formatBRL(selic.menor).replace('R$ ', '')}`, `10.000,00 × 1,11 = ${formatBRL(selic.maior).replace('R$ ', '')}`],
        hipoteses: 'Exemplo fictício: CDI constante nos 12 meses (252 dias úteis), sem Imposto de Renda, IOF nem taxas. Não são as taxas de hoje nem uma previsão.',
      },
      temas: ['selic', 'titulos-publicos', 'liquidez-risco-retorno', 'rotativo-cartao', 'cheque-especial'],
      indicadores: ['selic', 'cdi', 'poupanca'],
      fontes: [F.copom, F.taxaSelic, F.repasseSelic, F.lei12703, F.poupancaBcb],
    },
    {
      slug: 'como-ler-o-ipca',
      titulo: 'Como ler o IPCA',
      subtitulo: 'O número do mês, o acumulado em 12 meses e a sua inflação.',
      resumo: 'O IPCA tem dois números: a variação do mês e o acumulado em 12 meses. As taxas se multiplicam, e a sua inflação pessoal pode ser diferente da média.',
      secoes: [
        {
          titulo: 'O número do mês',
          paragrafos: [
            'Todo mês, o IBGE divulga quanto os preços de uma cesta de bens e serviços variaram em relação ao mês anterior. É um número pequeno, que pode até ser negativo quando os preços caem na média.',
          ],
        },
        {
          titulo: 'O acumulado em 12 meses',
          paragrafos: [
            `Para saber quanto os preços subiram em um ano, juntam-se as variações dos últimos 12 meses. As taxas se multiplicam, não se somam: 1% em um mês e 1% no seguinte dão ${ipca.doisMeses}, e não 2%.`,
            'É o acumulado em 12 meses que se compara com a meta de inflação do Conselho Monetário Nacional: 3% ao ano, com tolerância de 1,5 ponto percentual para mais ou para menos.',
          ],
        },
        {
          titulo: 'A sua inflação',
          paragrafos: [
            'O IPCA mede os preços para famílias de áreas urbanas com renda de 1 a 40 salários mínimos. A sua inflação pessoal pode ser maior ou menor, conforme o que você consome.',
          ],
        },
        {
          titulo: 'No seu dinheiro',
          paragrafos: [
            `Para saber se um dinheiro guardado manteve o poder de compra, compare o que ele rendeu com o IPCA do mesmo período: é o ganho real. Uma aplicação que rendeu 10% num período com IPCA de 4,5% teve ganho real de ${ipca.ganhoReal}, e não de 5,5%.`,
          ],
        },
        {
          titulo: 'De onde vem o número da Clarevo',
          paragrafos: [
            '"IPCA em 12 meses" acumula as variações mensais publicadas pelo IBGE, na série 433 do Banco Central. Por arredondamento, o resultado pode diferir em 0,01 ponto do número que o IBGE divulga.',
          ],
        },
      ],
      exemplo: {
        texto: `Com uma inflação fictícia de 0,5% em cada um dos 12 meses, o acumulado é de ${ipca.dozeMeses}, e não de 6%.`,
        conta: [`1,005 elevado a 12, menos 1 = ${ipca.dozeMeses}`],
        hipoteses: 'Exemplo fictício: a mesma variação em todos os meses. Não é o IPCA de nenhum período.',
      },
      temas: ['inflacao-ipca', 'ganho-real', 'simulacao'],
      indicadores: ['ipca', 'poupanca'],
      fontes: [F.ibgeInflacao, F.ibgeIpca, F.metaInflacao],
    },
  ];
}

let guardadas: Explicacao[] | null = null;
/** As duas explicações, com os exemplos já calculados. */
export function explicacoesDeMercado(): Explicacao[] {
  guardadas ??= explicacoes();
  return guardadas;
}

/** A frase do aviso das páginas de mercado, repetida aqui para quem só importa o conteúdo. */
export const AVISO_DE_MERCADO = INDICADORES_TEXT.avisoMercado;

/** Todas as fontes das páginas de mercado (o site libera os endereços delas como links de texto). */
export function fontesDasPaginasDeMercado(): LearnSource[] {
  return [...PAGINAS_INDICADORES.flatMap((p) => p.fontes), ...GLOSSARIO.flatMap((t) => t.fontes), ...explicacoesDeMercado().flatMap((e) => e.fontes)];
}
