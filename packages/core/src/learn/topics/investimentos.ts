import type { Topic } from '../types';
import { INVEST_REVIEWED_ON, oficialInvest } from './common';

/**
 * Temas de investimentos da seção "Dinheiro no tempo" (D-093, aba Investir; `docs/49_ESTUDO_INVESTIMENTOS.md`, item 11), escritos e
 * conferidos em 13/11/2026. Os nomes dos títulos públicos são os oficiais do Tesouro Nacional, por decisão do Enzo. Nenhum tema
 * recomenda produto, classe, emissor, instituição, percentual ou momento: explicam regras públicas, com fonte e exemplo fictício.
 *
 * Método (spec5_notes §2): gov.br, planalto.gov.br, bcb.gov.br e camara.leg.br não abrem a partir do ambiente de trabalho (DNS);
 * cada fato vem de trecho de resultado de busca da própria fonte, e o `locator` diz isso.
 */
const TRECHO = 'trecho de resultado de busca; a página não abriu';
const PLANALTO = 'Presidência da República';
const CAMARA = 'Câmara dos Deputados';
const RECEITA = 'Receita Federal';
const CVM_PORTAL = 'CVM, Portal do Investidor';
const CVM = 'Comissão de Valores Mobiliários';
const TESOURO = 'Tesouro Nacional';
const FAZENDA = 'Ministério da Fazenda';
const BCB = 'Banco Central do Brasil';
const CMN_BCB = 'Conselho Monetário Nacional e Banco Central do Brasil';

const LEI_11033 = (locator: string) =>
  oficialInvest(PLANALTO, 'Lei nº 11.033/2004 (texto compilado)', 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033compilado.htm', `${locator}; ${TRECHO}`);

const LEI_11033_CAMARA = (locator: string) =>
  oficialInvest(CAMARA, 'Lei nº 11.033/2004, norma atualizada', 'https://www2.camara.leg.br/legin/fed/lei/2004/lei-11033-21-dezembro-2004-535177-normaatualizada-pl.pdf', `${locator}; ${TRECHO}`);

const LEI_14754 = (locator: string) =>
  oficialInvest(PLANALTO, 'Lei nº 14.754/2023 (tributação de fundos de investimento)', 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14754.htm', `${locator}; ${TRECHO}`);

const LEI_14937 = (locator: string) =>
  oficialInvest(PLANALTO, 'Lei nº 14.937/2024 (Letra de Crédito do Desenvolvimento)', 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14937.htm', `${locator}; ${TRECHO}`);

const MIR_RENDIMENTOS = (locator: string) =>
  oficialInvest(
    RECEITA,
    'Rendimentos do Capital (manual do Meu Imposto de Renda)',
    'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/manual-mir/rendimentos/rendimentos-do-capital',
    `${locator}; ${TRECHO}`,
  );

const MIR_BENS = (locator: string) =>
  oficialInvest(
    RECEITA,
    'Bens Financeiros (manual do Meu Imposto de Renda)',
    'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/manual-mir/patrimonio/bens-financeiros',
    `${locator}; ${TRECHO}`,
  );

const RESERVA_LANCAMENTO = (locator: string) =>
  oficialInvest(
    FAZENDA,
    'Tesouro Nacional, B3 e BB lançam Tesouro Reserva com operação 24h nos 7 dias da semana',
    'https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/maio/tesouro-nacional-b3-e-bb-lancam-tesouro-reserva-com-operacao-24h-nos-7-dias-da-semana',
    `${locator}; ${TRECHO}`,
  );

export const INVESTIMENTOS_TOPICS: Topic[] = [
  {
    slug: 'ir-investimentos',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Imposto de renda nos investimentos',
    subtitle: 'Tabela regressiva, IOF, come-cotas e isenções',
    question: 'Quanto de imposto se paga sobre o rendimento de uma aplicação?',
    short:
      'Na renda fixa, o imposto incide só sobre o rendimento e cai com o prazo, de 22,5% a 15%. Há IOF em resgates nos primeiros 30 dias, come-cotas em fundos e isenções para pessoa física.',
    paragraphs: [
      'Em CDB, títulos públicos e outras aplicações de renda fixa, o imposto de renda incide só sobre o rendimento, não sobre o valor aplicado, e é retido no resgate ou no vencimento. A alíquota cai conforme o prazo da aplicação: 22,5% até 180 dias, 20% de 181 a 360 dias, 17,5% de 361 a 720 dias e 15% acima de 720 dias.',
      'Resgates nos primeiros 30 dias também podem pagar IOF. Ele incide só sobre o rendimento e diminui a cada dia de aplicação, pela tabela do Decreto 6.306/2007: no 1º dia, fica com 96% do rendimento.',
      'Em fundos abertos, como os de renda fixa, há o come-cotas: no último dia útil de maio e de novembro, o fundo recolhe o imposto sobre o rendimento do período, a 15% ou, nos fundos de curto prazo, a 20%, com menos cotas para quem investe. No resgate, entra só a diferença até a alíquota do prazo. Fundos de ações e fundos imobiliários seguem regras próprias.',
      'São isentos de imposto de renda para pessoa física os rendimentos da poupança, de LCI, LCA, LCD, CRI, CRA e debêntures incentivadas, e os rendimentos distribuídos por fundos imobiliários que cumprem as condições da lei. Essas regras mudam por lei e, no caso do IOF, por decreto: confira a data de revisão e as fontes.',
    ],
    example:
      'Uma aplicação fictícia de R$ 10.000,00 rendeu R$ 1.200,00 e foi resgatada com 400 dias. A alíquota é de 17,5%: o imposto fica em R$ 210,00, e o resgate líquido, em R$ 10.990,00. Se o resgate fosse com 100 dias e rendimento de R$ 300,00, seriam 22,5%: R$ 67,50 de imposto.',
    calculation: '400 dias → 17,5% · 1.200,00 × 17,5% = 210,00 · 10.000,00 + 1.200,00 - 210,00 = 10.990,00 · 100 dias → 22,5% · 300,00 × 22,5% = 67,50.',
    hypotheses:
      'Exemplo fictício: aplicação tributada de renda fixa, resgatada depois de 30 dias (sem IOF), sem taxas e sem come-cotas, com a tabela da Lei 11.033/2004 em vigor em 13/11/2026.',
    facts: [
      { text: '22,5% até 180 dias', source: 0 },
      { text: '20% de 181 a 360 dias', source: 0 },
      { text: '17,5% de 361 a 720 dias', source: 0 },
      { text: '15% acima de 720 dias', source: 0 },
      { text: '96%', source: 2 },
      { text: 'a 15% ou, nos fundos de curto prazo, a 20%', source: 3 },
    ],
    keywords: ['imposto de renda', 'tabela regressiva', 'IOF', 'come-cotas', 'isenção', 'alíquota', 'rendimento líquido', 'renda fixa'],
    related: ['titulos-publicos', 'lci-lca', 'declarar-investimentos'],
    sources: [
      LEI_11033('Art. 1º: imposto de renda na fonte sobre rendimentos de aplicações de renda fixa, a 22,5% em aplicações de até 180 dias, 20% de 181 a 360 dias, 17,5% de 361 a 720 dias e 15% acima de 720 dias'),
      RESERVA_LANCAMENTO('Imposto de renda apenas sobre os rendimentos, no resgate ou no vencimento, com alíquotas regressivas; para aplicações resgatadas em até 30 dias, pode haver cobrança de IOF'),
      oficialInvest(
        CAMARA,
        'Decreto nº 6.306/2007 (Regulamento do IOF), norma atualizada',
        'https://www2.camara.leg.br/legin/fed/decret/2007/decreto-6306-14-dezembro-2007-566561-normaatualizada-pe.html',
        `Art. 32: IOF de um por cento ao dia sobre o valor do resgate, limitado ao rendimento da operação, em função do prazo, conforme a tabela do Anexo (96% do rendimento no 1º dia, 93% no 2º, 90% no 3º); ${TRECHO}`,
      ),
      LEI_14754('Art. 17: tributação periódica no último dia útil dos meses de maio e de novembro, à alíquota de 15% no regime geral e de 20% nos fundos de curto prazo, com alíquota complementar no resgate'),
      oficialInvest(
        RECEITA,
        'Nova legislação sobre Fundos de Investimento',
        'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/manuais/orientacao-tributaria/fundosdeinvestimento',
        `Fundos regidos por norma geral de curto prazo têm incidência semestral do imposto de renda à alíquota de 20%; ${TRECHO}`,
      ),
      MIR_RENDIMENTOS(
        'Rendimentos de cadernetas de poupança, letras hipotecárias, LCA, LCI, CRA e CRI são isentos e não tributáveis e só podem ser recebidos de pessoa jurídica; entre os títulos isentos estão também a LIG e as debêntures de infraestrutura',
      ),
      LEI_14937('Art. 6º, I, a: alíquota zero do imposto de renda na fonte sobre os rendimentos da LCD auferidos por pessoa física residente ou domiciliada no País'),
      LEI_11033_CAMARA(
        'Art. 3º: isenção, na fonte e na declaração da pessoa física, dos rendimentos distribuídos por fundos de investimento imobiliário e Fiagro com cotas admitidas à negociação exclusivamente em bolsa ou balcão organizado, com as condições da Lei 14.754/2023',
      ),
    ],
    reviewedOn: INVEST_REVIEWED_ON,
    reviewEveryMonths: 6,
  },
  {
    slug: 'titulos-publicos',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Títulos públicos',
    subtitle: 'Os tipos, a marcação a mercado e a custódia',
    question: 'Como funcionam os títulos públicos do Tesouro Direto?',
    short:
      'São títulos do governo federal, garantidos pelo Tesouro Nacional, e não pelo FGC. Cada tipo rende de um jeito, e vender antes do vencimento pode dar mais ou menos que o contratado na compra.',
    paragraphs: [
      'Comprar um título público é emprestar dinheiro ao governo federal. O pagamento é garantido pelo Tesouro Nacional, e não pelo FGC. No Tesouro Direto, o nome oficial de cada título diz como ele rende: Tesouro Selic acompanha a taxa Selic; Tesouro Prefixado tem a taxa fixada na compra; Tesouro IPCA+ paga a inflação do IPCA mais uma taxa fixada na compra.',
      'Esses três pagam tudo no vencimento; Tesouro Prefixado com Juros Semestrais e Tesouro IPCA+ com Juros Semestrais pagam juros a cada seis meses. Tesouro RendA+ paga uma renda mensal por 20 anos, a partir da data de aposentadoria escolhida, corrigida pela inflação. Tesouro Educa+ paga 60 parcelas mensais a partir do ano escolhido, para os estudos.',
      'Tesouro Reserva, lançado em 11/05/2026, rende 100% da Selic por dia, sem marcação a mercado, com aplicação e resgate a qualquer hora, todos os dias, por Pix. Nos outros títulos, o preço muda todo dia com os juros do mercado: é a marcação a mercado. Quem fica até o vencimento recebe o contratado; quem vende antes recebe o preço do dia, que pode dar mais ou menos.',
      'A B3 cobra taxa de custódia de 0,20% ao ano, debitada na venda, no vencimento ou no pagamento de juros, o que vier primeiro. No Tesouro Selic, os primeiros R$ 10.000,00 por CPF ficam isentos, e a taxa incide só sobre o que passar disso; RendA+ e Educa+ têm regras próprias. O imposto de renda segue a tabela regressiva.',
    ],
    example:
      'Com R$ 25.000,00 no Tesouro Selic durante um ano, a taxa de custódia incide sobre R$ 15.000,00, o que passa da isenção: 0,20% de R$ 15.000,00 dá R$ 30,00 no ano.',
    calculation: '25.000,00 - 10.000,00 = 15.000,00 · 15.000,00 × 0,20% = 30,00.',
    hypotheses:
      'Exemplo fictício: valor constante durante os 12 meses, um só CPF, sem outro título do mesmo tipo e com a taxa de 0,20% ao ano em vigor em 13/11/2026.',
    facts: [
      { text: '100% da Selic', source: 3 },
      { text: '0,20% ao ano', source: 4 },
      { text: 'R$ 10.000,00 por CPF', source: 4 },
    ],
    keywords: ['tesouro direto', 'títulos do governo', 'marcação a mercado', 'taxa de custódia', 'juros semestrais', 'prefixado', 'IPCA+', 'vencimento'],
    related: ['selic', 'ir-investimentos', 'fgc'],
    sources: [
      oficialInvest(
        CVM_PORTAL,
        'Títulos Públicos',
        'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-publicos',
        `Por serem garantidos pelo Tesouro Nacional, os títulos têm risco soberano; principais títulos: Tesouro Selic, Tesouro Prefixado e Tesouro IPCA+; o preço do Tesouro Selic oscila pouco no dia a dia e o rendimento acompanha a Selic; marcação a mercado é o ajuste diário do preço conforme as condições da economia e os juros, e o valor pode ficar maior ou menor que o esperado antes do vencimento; investimentos de até R$ 10.000,00 no Tesouro Selic têm isenção da taxa de custódia da B3; ${TRECHO}`,
      ),
      RESERVA_LANCAMENTO(
        'Lançamento na segunda-feira, dia 11 (maio de 2026), do Tesouro Reserva, título do Programa Tesouro Direto com rendimento indexado à Selic, negociado em qualquer hora, todos os dias da semana (24x7), com operações por transação via Pix; ao contrário do Tesouro Selic, não tem marcação a mercado',
      ),
      oficialInvest(
        'Escola Nacional de Administração Pública (Enap)',
        'E-book de acompanhamento, módulo 3 (curso sobre o Tesouro Direto)',
        'https://bibliotecadigital.enap.gov.br/bitstream/1/6248/4/M%C3%B3dulo%203%20TD.pdf',
        `Títulos com juros semestrais: o pagamento dos juros é semestral e o resgate do valor nominal atualizado ocorre no vencimento do título; ${TRECHO}`,
      ),
      oficialInvest(
        FAZENDA,
        'Tesouro Direto tem emissão líquida recorde de R$ 6,07 bilhões em maio',
        'https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/junho/tesouro-direto-tem-emissao-liquida-recorde-de-r-6-07-bilhoes-em-maio',
        `Lançado em 11 de maio, o Tesouro Reserva é um novo título público no âmbito do Tesouro Direto; rentabilidade diária, equivalente a 100% da Taxa Selic over, sem exposição à volatilidade de preços; ${TRECHO}`,
      ),
      oficialInvest(
        TESOURO,
        'Taxa de custódia do Tesouro Direto cai para 0,20%',
        'https://www.gov.br/tesouronacional/pt-br/noticias/taxa-de-custodia-do-tesouro-direto-cai-para-0-20',
        `Taxa de custódia de 0,20% ao ano a partir de 1º de janeiro de 2022; no Tesouro Selic, isenção até R$ 10.000,00 em custódia por investidor pessoa física (CPF), com a taxa só sobre o que ultrapassar; cobrança proporcional ao período, debitada na venda antecipada, no vencimento ou no pagamento de juros, o que ocorrer primeiro; ${TRECHO}`,
      ),
      oficialInvest(
        TESOURO,
        'Conheça o RendA+, Aposentadoria Extra, o novo título do Tesouro Direto',
        'https://www.gov.br/tesouronacional/pt-br/noticias/conheca-o-renda-aposentadoria-extra-o-novo-titulo-do-tesouro-direto',
        `Renda mensal extra por 20 anos (240 parcelas) a partir da data de aposentadoria escolhida; valores corrigidos pelo IPCA mais a taxa contratada na compra; isenção da custódia até o vencimento, com limite ligado à renda mensal; ${TRECHO}`,
      ),
      oficialInvest(
        TESOURO,
        'Tesouro Educa+ começa a ser negociado hoje na B3',
        'https://www.gov.br/tesouronacional/pt-br/noticias/tesouro-educa-comeca-a-ser-negociado-hoje-na-b3',
        `Renda para os estudos paga em 60 parcelas mensais, a partir de 15 de janeiro do ano escolhido; regras próprias de custódia; ${TRECHO}`,
      ),
    ],
    reviewedOn: INVEST_REVIEWED_ON,
    reviewEveryMonths: 12,
  },
  {
    slug: 'lci-lca',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Letras de crédito isentas',
    subtitle: 'Isenção de imposto, prazo mínimo e garantia',
    question: 'O que são LCI e LCA e quando o dinheiro pode ser resgatado?',
    short:
      'Letras emitidas por instituições financeiras para financiar imóveis, o agronegócio e, na LCD, o desenvolvimento. Para pessoa física, o rendimento é isento de imposto de renda, e há prazo mínimo para o resgate.',
    paragraphs: [
      'LCI (Letra de Crédito Imobiliário) e LCA (Letra de Crédito do Agronegócio) são títulos emitidos por instituições financeiras, ligados a financiamentos de imóveis e do agronegócio. A LCD (Letra de Crédito do Desenvolvimento), criada pela Lei 14.937/2024, é emitida por bancos de desenvolvimento.',
      'Para pessoa física, o rendimento das três é isento de imposto de renda. Por isso, comparar uma letra com uma aplicação tributada pede o valor líquido das duas, depois do imposto, no mesmo prazo. Na declaração anual, esse rendimento entra como isento.',
      'Elas têm prazo mínimo definido pelo Conselho Monetário Nacional, e a instituição não pode resgatá-las antes dele. Desde 2025 (Resolução CMN 5.215/2025), o mínimo é de seis meses para LCI e LCA sem correção por índice de preços; com correção pela inflação, o prazo mínimo é maior. Confira o vencimento e a carência de cada título antes de aplicar.',
      'LCI, LCA e LCD estão entre os títulos cobertos pelo FGC, com os limites por pessoa e por instituição explicados em Garantia do FGC. As regras de imposto e de prazo mudam por lei ou por norma do Conselho Monetário Nacional: confira a data de revisão e as fontes.',
    ],
    example:
      'Numa aplicação tributada fictícia resgatada com 400 dias, um rendimento de R$ 1.000,00 paga 17,5% de imposto e chega líquido a R$ 825,00. Uma letra isenta, no mesmo prazo, precisa render R$ 825,00 para entregar o mesmo valor líquido.',
    calculation: '1.000,00 × 17,5% = 175,00 · 1.000,00 - 175,00 = 825,00 · letra isenta: 825,00 de rendimento = 825,00 líquidos.',
    hypotheses:
      'Exemplo fictício: o mesmo valor aplicado e o mesmo prazo nas duas, resgate depois de 30 dias (sem IOF), sem taxas e com a tabela da Lei 11.033/2004 em vigor em 13/11/2026.',
    facts: [{ text: '17,5%', source: 6 }],
    keywords: ['letra de crédito', 'letra de crédito imobiliário', 'letra de crédito do agronegócio', 'isenção', 'carência', 'prazo mínimo', 'renda fixa'],
    related: ['fgc', 'ir-investimentos', 'liquidez-risco-retorno'],
    sources: [
      oficialInvest(
        CVM_PORTAL,
        'Títulos bancários',
        'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-bancarios',
        `Títulos protegidos pelo FGC: poupança, CDB, RDB, LCI e LCA; a Letra Financeira não conta com a garantia do FGC; ${TRECHO}`,
      ),
      MIR_RENDIMENTOS('Rendimentos de LCA, LCI, CRA, CRI e cadernetas de poupança são isentos e não tributáveis e entram em campo próprio de rendimentos isentos da declaração'),
      LEI_14937('Art. 6º, I, a: alíquota zero do imposto de renda na fonte sobre os rendimentos da LCD auferidos por pessoa física residente ou domiciliada no País'),
      oficialInvest(
        CAMARA,
        'Entra em vigor lei que cria a Letra de Crédito do Desenvolvimento',
        'https://www.camara.leg.br/noticias/1085544-ENTRA-EM-VIGOR-LEI-QUE-CRIA-A-LETRA-DE-CREDITO-DO-DESENVOLVIMENTO',
        `A LCD poderá ser emitida pelos bancos de desenvolvimento atuantes no Brasil, até um limite por instituição emissora, nos moldes da LCA e da LCI; ${TRECHO}`,
      ),
      oficialInvest(
        CMN_BCB,
        'Resolução CMN nº 4.410/2015, texto consolidado (prazos mínimos das letras de crédito)',
        'https://normativos.bcb.gov.br/Lists/Normativos/Attachments/48547/Res_4410_v7_P.pdf',
        `Prazo mínimo de seis meses nos casos sem atualização por índice de preços (redação da Resolução CMN nº 5.215, de 22/5/2025), e prazos maiores com atualização por índice de preços (36 meses na atualização mensal); é vedado à instituição emissora recomprar ou resgatar a letra, total ou parcialmente, antes dos prazos mínimos; trecho de resultado de busca; o arquivo não abriu`,
      ),
      oficialInvest(
        CMN_BCB,
        'Resolução CMN nº 4.222/2013 (estatuto e regulamento do FGC), texto consolidado',
        'https://normativos.bcb.gov.br/Lists/Normativos/Attachments/48942/Res_4222_v17_L.pdf',
        `Art. 2º: entre os créditos garantidos estão as letras de crédito imobiliário e as letras de crédito do agronegócio e, no inciso IX (redação da Resolução CMN nº 5.184/2024), as letras de crédito do desenvolvimento; trecho de resultado de busca; o arquivo não abriu`,
      ),
      LEI_11033('Art. 1º: imposto de renda na fonte de 17,5% sobre o rendimento de aplicações de renda fixa de 361 a 720 dias'),
    ],
    reviewedOn: INVEST_REVIEWED_ON,
    reviewEveryMonths: 6,
  },
  {
    slug: 'proventos',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Dividendos, JCP e rendimentos de FII',
    subtitle: 'O que cada um é e como o imposto entra em cada caso',
    question: 'Dividendo, JCP e rendimento de fundo imobiliário pagam imposto?',
    short:
      'Dividendos e juros sobre capital próprio (JCP) são formas de a empresa pagar a quem tem ações; fundos imobiliários (FII) distribuem rendimentos aos cotistas. Cada um tem regra própria de imposto de renda.',
    paragraphs: [
      'Dividendos são a parte do lucro que a empresa distribui a quem tem as ações. Os juros sobre capital próprio (JCP) também remuneram quem tem as ações, mas são calculados sobre o patrimônio líquido da empresa, que pode deduzi-los ao apurar o próprio lucro tributável. Desde 1º de janeiro de 2026, o JCP tem 17,5% de imposto de renda retido na fonte (Lei Complementar 224/2025).',
      'Até R$ 50.000,00 por mês de uma mesma empresa para a mesma pessoa, os dividendos não têm retenção. Acima disso, desde 2026, a empresa retém 10% sobre o total pago no mês (Lei 15.270/2025). O valor retido entra no ajuste da declaração anual.',
      'Fundos imobiliários (FII) distribuem aos cotistas pelo menos 95% do lucro apurado em cada semestre, e muitos pagam todo mês. Para pessoa física, esses rendimentos são isentos quando o fundo tem pelo menos 100 cotistas, as cotas são negociadas só em bolsa ou balcão organizado e a pessoa tem menos de 10% das cotas. O ganho na venda das cotas segue outra regra.',
    ],
    example:
      'Uma pessoa recebeu, num mês, R$ 60.000,00 em dividendos de uma mesma empresa fictícia. Como passou de R$ 50.000,00, a retenção é de 10% sobre o total: R$ 6.000,00. Com R$ 40.000,00 no mês, não haveria retenção. Um JCP fictício de R$ 1.000,00 tem R$ 175,00 retidos e chega líquido a R$ 825,00.',
    calculation:
      '60.000,00 passa de 50.000,00 → 60.000,00 × 10% = 6.000,00 · 40.000,00 não passa de 50.000,00 → sem retenção · 1.000,00 × 17,5% = 175,00 · 1.000,00 - 175,00 = 825,00.',
    hypotheses:
      'Exemplo fictício: um só pagamento de dividendos no mês, de lucros fora da regra de transição de 2025, com as regras em vigor em 13/11/2026; o ajuste da declaração anual fica fora da conta.',
    facts: [
      { text: '17,5% de imposto de renda retido na fonte', source: 2 },
      { text: 'Até R$ 50.000,00 por mês', source: 3 },
      { text: 'retém 10% sobre o total pago no mês', source: 3 },
      { text: 'pelo menos 95% do lucro', source: 5 },
      { text: 'menos de 10% das cotas', source: 7 },
    ],
    keywords: ['dividendos', 'juros sobre capital próprio', 'JCP', 'proventos', 'FII', 'rendimentos mensais', 'ações', 'cotas'],
    related: ['ir-investimentos', 'declarar-investimentos', 'liquidez-risco-retorno'],
    sources: [
      oficialInvest(
        CVM_PORTAL,
        'Direitos do Investidor',
        'https://investidor.cvm.gov.br/menu/primeiros_passos/conhecendo_meus_direitos/direitos_investidor.html',
        `Entre os direitos de quem tem ações: participar nos lucros sociais, recebendo dividendos, juros sobre o capital e bonificações; ${TRECHO}`,
      ),
      oficialInvest(
        CAMARA,
        'Lei nº 9.249/1995, norma atualizada',
        'https://www2.camara.leg.br/legin/fed/lei/1995/lei-9249-26-dezembro-1995-349062-normaatualizada-pl.html',
        `Art. 9º: a pessoa jurídica pode deduzir, para apurar o lucro real, os juros pagos ou creditados a titular, sócios ou acionistas a título de remuneração do capital próprio, calculados sobre as contas do patrimônio líquido; ${TRECHO}`,
      ),
      oficialInvest(
        PLANALTO,
        'Lei Complementar nº 224/2025',
        'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp224.htm',
        `Inclui o § 2º no art. 9º da Lei 9.249/1995: os juros sobre capital próprio ficam sujeitos ao imposto de renda na fonte à alíquota de 17,5% na data do pagamento ou do crédito; a maior parte das mudanças vale desde 1º de janeiro de 2026; ${TRECHO}`,
      ),
      oficialInvest(
        PLANALTO,
        'Lei nº 15.270/2025',
        'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm',
        `Desde janeiro de 2026, pagamentos de lucros e dividendos de uma mesma pessoa jurídica a uma mesma pessoa física residente que passem de R$ 50.000,00 no mês têm retenção de 10% sobre o total, sem deduções, recalculada sobre a soma do mês; o valor retido pode ser deduzido no ajuste anual; ${TRECHO}`,
      ),
      oficialInvest(
        RECEITA,
        'Perguntas e Respostas: considerações sobre lucros e dividendos (tributação de altas rendas)',
        'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2025/dezembro/receita-federal-lanca-perguntas-e-respostas-sobre-tributacao-de-altas-rendas-consideracoes-sobre-lucros-e-dividendos/manual_padrao_rfb_per_tributacao_sutri_v2.pdf',
        `Valores pagos a uma mesma pessoa física abaixo de R$ 50.000,00 no mês não ficam sujeitos à retenção; regra de transição para lucros apurados até 2025 com distribuição aprovada até 31/12/2025; trecho de resultado de busca; o arquivo não abriu`,
      ),
      oficialInvest(
        PLANALTO,
        'Lei nº 8.668/1993 (fundos de investimento imobiliário)',
        'https://www.planalto.gov.br/ccivil_03/leis/l8668.htm',
        `Art. 10, parágrafo único: o fundo deve distribuir aos cotistas, no mínimo, 95% dos lucros auferidos, apurados segundo o regime de caixa, com base em balanço ou balancete semestral; ${TRECHO}`,
      ),
      oficialInvest(
        CVM,
        'CVM emite ofício-circular com orientações sobre a distribuição de resultados de Fundos de Investimento Imobiliário',
        'https://www.gov.br/cvm/pt-br/assuntos/noticias/2014/cvm-emite-oficio-circular-com-orientacoes-sobre-a-distribuicao-de-resultados-de-fundos-de-investimento-imobiliario-65a03159a7ef4d01b0a98c8c58838b61',
        `Fundos que distribuem resultados mensalmente devem, ao fim do semestre, ter distribuído no mínimo 95% dos resultados apurados em base de caixa; ${TRECHO}`,
      ),
      LEI_11033_CAMARA(
        'Art. 3º: isenção dos rendimentos distribuídos por fundos imobiliários com cotas admitidas à negociação exclusivamente em bolsa ou balcão organizado; não vale para a pessoa física com 10% ou mais das cotas ou com direito a mais de 10% dos rendimentos',
      ),
      LEI_14754('Altera a Lei 11.033/2004: a isenção dos rendimentos de fundos imobiliários e Fiagro só vale para fundos com, no mínimo, 100 cotistas'),
    ],
    reviewedOn: INVEST_REVIEWED_ON,
    reviewEveryMonths: 6,
  },
  {
    slug: 'declarar-investimentos',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Como declarar investimentos',
    subtitle: 'Bens e Direitos, informe de rendimentos e a pré-preenchida',
    question: 'Como informar aplicações e ações na declaração do Imposto de Renda?',
    short:
      'Na declaração anual, cada investimento entra em Bens e Direitos, com o valor em 31 de dezembro, e os rendimentos entram nas fichas que o informe de rendimentos indica. A pré-preenchida ajuda, mas precisa ser conferida.',
    paragraphs: [
      'No começo do ano, cada instituição onde há dinheiro aplicado fornece o informe de rendimentos, com os saldos e os rendimentos do ano anterior. Ele é a base para preencher a ficha Bens e Direitos e as fichas de rendimentos que o próprio informe indica.',
      'Em Bens e Direitos, cada investimento ocupa uma linha, com grupo, código, instituição e o valor em 31/12 do ano anterior e do ano declarado. Poupança, títulos tributados (como CDB e títulos públicos) e títulos isentos (como LCI e LCA) ficam no grupo 04, de aplicações e investimentos, cada tipo com seu código; saldos de até R$ 140,00 em 31/12 podem ficar fora.',
      'Ações e criptoativos entram pelo valor pago na compra, e não pela cotação de 31/12; criptoativos ficam no grupo 08. Ações, cotas de fundos imobiliários (FII) e VGBL também têm grupo e código próprios. Confira o grupo e o código de cada investimento no programa da Receita do ano.',
      'A declaração pré-preenchida, com conta gov.br nível prata ou ouro, já traz informações que bancos e empresas enviaram à Receita, mas não dispensa conferir cada valor com o informe e os comprovantes. A Clarevo não preenche nem entrega a declaração.',
    ],
    example:
      'Uma pessoa fictícia tinha R$ 5.000,00 numa aplicação em 31/12/2024 e R$ 5.400,00 em 31/12/2025. Na declaração de 2026, a linha do bem mostra os dois saldos, e os R$ 400,00 de rendimento entram na ficha que o informe indicar. Ela também comprou 100 ações a R$ 20,00 cada: elas entram por R$ 2.000,00, seja qual for a cotação de 31/12/2025.',
    calculation: '5.400,00 - 5.000,00 = 400,00 · 100 × 20,00 = 2.000,00.',
    hypotheses:
      'Exemplo fictício: sem novas aplicações nem resgates no ano, rendimento igual à diferença dos saldos e ações compradas sem custos de corretagem; grupos e códigos a conferir no programa do ano.',
    facts: [{ text: 'saldos de até R$ 140,00', source: 0 }],
    keywords: ['declaração', 'imposto de renda', 'bens e direitos', 'pré-preenchida', 'grupo e código', 'custo de aquisição', 'ações', 'irpf'],
    related: ['imposto-de-renda', 'ir-investimentos', 'proventos'],
    sources: [
      MIR_BENS(
        'Aplicações e Investimentos do tipo Depósito em Conta Poupança, Títulos Públicos e Privados sujeitos à Tributação e Títulos Isentos de Tributação devem ser declarados se o saldo em 31/12 do ano-calendário for maior que R$ 140,00; participações societárias, pelo valor de aquisição; criptoativos, pelo valor original de aquisição, e não pelo valor atual; o valor em 31/12 é o dos comprovantes',
      ),
      oficialInvest(
        RECEITA,
        'Situações Específicas (manual do Meu Imposto de Renda)',
        'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/manual-mir/situacoes-especificas',
        `Aplicações financeiras no exterior vão no grupo 04, código 99, Outras Aplicações e Investimentos (o grupo 04 é o das aplicações e investimentos); ${TRECHO}`,
      ),
      oficialInvest(
        RECEITA,
        'Receita Federal esclarece sobre declaração de operações com criptoativos',
        'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2023/marco/receita-federal-esclarece-sobre-declaracao-de-operacoes-com-criptoativos',
        `Criptoativos são informados pelo valor de aquisição na ficha Bens e Direitos, no grupo 08, com códigos próprios por tipo; ${TRECHO}`,
      ),
      oficialInvest(
        RECEITA,
        'Declaração Pré-Preenchida',
        'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/declaracao-pre-preenchida',
        `Exige conta gov.br nível prata ou ouro; apresenta as informações recebidas pela Receita Federal de empresas, bancos, médicos e outros, mas não afasta a responsabilidade de conferir todos os dados; ${TRECHO}`,
      ),
      oficialInvest(
        RECEITA,
        'Perguntas e Respostas IRPF 2026',
        'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf',
        'Fica dispensada a inclusão de saldos existentes em 31/12/2025 de contas correntes e outras aplicações financeiras de até R$ 140,00; trecho de resultado de busca; o arquivo não abriu',
      ),
      oficialInvest(
        RECEITA,
        'Instrução Normativa SRF nº 268/2002 (informe de rendimentos financeiros)',
        'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?visao=anotado&idAto=15149',
        `Informe de rendimentos financeiros fornecido à pessoa física beneficiária até o último dia útil de fevereiro do ano seguinte; a vigência atual da norma não foi conferida; ${TRECHO}`,
      ),
    ],
    reviewedOn: INVEST_REVIEWED_ON,
    reviewEveryMonths: 6,
  },
  {
    slug: 'ganho-real',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Ganho real',
    subtitle: 'Quanto o dinheiro rendeu acima da inflação',
    question: 'Como calcular o rendimento descontada a inflação?',
    short: 'Ganho real é o rendimento acima da inflação do mesmo período. A conta divide em vez de subtrair: (1 + rentabilidade) ÷ (1 + IPCA) - 1.',
    paragraphs: [
      'A rentabilidade nominal diz quanto o dinheiro rendeu em reais. A real desconta a inflação do mesmo período, medida pelo IPCA, e mostra quanto o poder de compra cresceu. Se a inflação foi maior que o rendimento, o ganho real é negativo: o valor aumentou em reais, mas compra menos do que antes.',
      'A conta é (1 + rentabilidade) ÷ (1 + IPCA) - 1, com as duas taxas do mesmo período, na forma decimal (10% vira 0,10). Subtrair a inflação do rendimento dá um número próximo, mas um pouco maior que o ganho real.',
      'A poupança é uma referência conhecida para comparar. Pela regra em vigor, com a meta da Selic acima de 8,5% ao ano, ela rende 0,5% ao mês mais a TR; com a meta em 8,5% ou menos, 70% da meta da Selic mais a TR. Uma referência ajuda a ler o número, mas não diz o que escolher: prazo, risco e liquidez também contam.',
    ],
    example:
      'Uma aplicação fictícia rendeu 10% em 12 meses, com IPCA de 4,5% no período. O ganho real foi de 5,26%, e não de 5,5%. No mesmo período, uma poupança fictícia, com 0,5% ao mês e TR zero, rendeu 6,17%: um ganho real de 1,60%.',
    calculation: '1,10 ÷ 1,045 - 1 = 0,0526 → 5,26% · 10% - 4,5% = 5,5% (conta aproximada) · 1,005^12 - 1 = 0,0617 → 6,17% · 1,0617 ÷ 1,045 - 1 = 0,0160 → 1,60%.',
    hypotheses:
      'Exemplo fictício: taxas do mesmo período de 12 meses, valores brutos, sem imposto, IOF ou taxas; a poupança fictícia com a meta da Selic acima de 8,5% e TR zero em todos os meses. Não são taxas atuais nem sugeridas.',
    facts: [
      { text: '8,5% ao ano', source: 2 },
      { text: '0,5% ao mês mais a TR', source: 2 },
      { text: '70% da meta da Selic', source: 2 },
    ],
    keywords: ['ganho real', 'rentabilidade real', 'rentabilidade nominal', 'poder de compra', 'taxa real', 'rendimento real'],
    related: ['inflacao-ipca', 'simulacao', 'selic'],
    sources: [
      oficialInvest(
        CVM_PORTAL,
        'Glossário: rentabilidade nominal e rentabilidade real',
        'https://www.investidor.gov.br/glossario/r/rentabilidade_nominal.html?dir=/glossario/r/&letra=R',
        `Rentabilidade real: é obtida descontando-se da rentabilidade nominal a inflação (calculada pelo IPCA) decorrida no período; ${TRECHO}`,
      ),
      oficialInvest(
        'Secretaria da Educação do Ceará',
        'Finanças: matemática financeira e comercial (material da educação profissional)',
        'https://www.seduc.ce.gov.br/wp-content/uploads/sites/37/2011/10/financas_matematica_financeira_e_comercial_1.pdf',
        `Taxa real mostra o ganho ou a perda do aplicador descontada a inflação: C(1 + In) = C(1 + R)(1 + INF), o que dá R = (1 + In) ÷ (1 + INF) - 1; trecho de resultado de busca; o arquivo não abriu`,
      ),
      oficialInvest(
        PLANALTO,
        'Lei nº 12.703/2012 (remuneração dos depósitos de poupança)',
        'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12703.htm',
        `Altera o art. 12 da Lei 8.177/1991: remuneração adicional de 0,5% ao mês enquanto a meta da Selic ao ano for superior a 8,5%, ou de 70% da meta da Selic, mensalizada, nos demais casos, além da TR; ${TRECHO}`,
      ),
      oficialInvest(BCB, 'Remuneração dos depósitos de poupança', 'https://www.bcb.gov.br/pec/poupanca/poupanca.asp?frame=1', `Remuneração composta pela TR e por uma parcela adicional, que muda conforme a meta da Selic esteja acima de 8,5% ou não; ${TRECHO}`),
    ],
    reviewedOn: INVEST_REVIEWED_ON,
    reviewEveryMonths: 12,
  },
  {
    slug: 'golpes-rentabilidade',
    section: 'tempo',
    kind: 'tema',
    status: 'publicado',
    title: 'Golpes com promessa de rentabilidade',
    subtitle: 'Sinais comuns e onde conferir registro e autorização',
    question: 'Como saber se uma oferta de investimento pode ser golpe?',
    short:
      'Ganho alto e certo, pressa para decidir e pagamento que depende de novas pessoas são sinais comuns de fraude. Antes de investir, confira o registro na CVM e a autorização no Banco Central.',
    paragraphs: [
      'A CVM aponta sinais que aparecem com frequência em fraudes: promessa de ganho alto e garantido, muito acima do que o mercado oferece; pressão para decidir rápido, com prazo curto; oferta que chega por canais não oficiais; e pouca informação sobre os riscos.',
      'Na pirâmide financeira, o dinheiro de quem entra paga quem entrou antes, e o ganho depende de trazer novas pessoas; quando a entrada de gente diminui, o esquema para de pagar. No esquema Ponzi, não é preciso recrutar ninguém, mas os pagamentos também saem do dinheiro de novos participantes.',
      'Antes de investir, confira se quem oferece tem registro na CVM, na consulta de participantes autorizados, e veja a página de alertas da CVM, que lista ofertas e atuações irregulares. Para bancos e outras instituições financeiras, o site do Banco Central tem a consulta de instituições autorizadas a funcionar.',
      'Golpes podem usar o nome e a marca de instituições reais: confira o contato pelos canais oficiais da própria instituição. A Clarevo não indica investimentos nem instituições.',
    ],
    example:
      'Uma oferta fictícia promete 5% ao mês, com ganho garantido. Em 12 meses, com juros compostos, isso daria 79,59% no ano. Para comparar, uma taxa básica fictícia de 10% ao ano equivale a 0,80% ao mês.',
    calculation: '1,05^12 - 1 = 0,7959 → 79,59% ao ano · 1,10^(1/12) - 1 = 0,0080 → 0,80% ao mês.',
    hypotheses: 'Exemplo fictício: taxas escolhidas só para a conta, com capitalização mensal; não são a Selic atual nem a oferta de ninguém.',
    facts: [],
    keywords: ['golpe', 'fraude', 'pirâmide financeira', 'esquema Ponzi', 'promessa de ganho', 'registro na CVM', 'instituição autorizada', 'alerta'],
    related: ['liquidez-risco-retorno', 'fgc', 'selic'],
    sources: [
      oficialInvest(
        CVM_PORTAL,
        'Bandeira Vermelha. Os principais sinais de fraude!',
        'https://www.gov.br/investidor/pt-br/investir/cuidados-ao-investir/evitando-problemas/bandeira-vermelha-os-principais-sinais-de-fraude',
        `Promessas de rentabilidade elevada e garantida, pressão para tomar uma decisão rapidamente e ofertas que chegam por canais não oficiais são sinais que merecem atenção, assim como pouco detalhamento dos riscos; golpistas querem decisão rápida, com prazo muito limitado; ${TRECHO}`,
      ),
      oficialInvest(
        CVM_PORTAL,
        'Pirâmides financeiras e esquemas Ponzi',
        'https://www.gov.br/investidor/pt-br/investir/cuidados-ao-investir/evitando-problemas/principais-fraudes-e-esquemas-irregulares/piramides-financeiras-e-esquemas-ponzi',
        `Ofertas com promessa de rentabilidade alta, acima do que o mercado oferece, em curto espaço de tempo; na pirâmide, a remuneração depende de trazer novos participantes; no esquema Ponzi, não é preciso recrutar, e os pagamentos vêm do dinheiro de novos aplicadores; ${TRECHO}`,
      ),
      oficialInvest(
        CVM,
        'Consulta de Participantes Autorizados',
        'https://www.gov.br/cvm/pt-br/canais_atendimento/consultas-reclamacoes-denuncias/participantes-autorizados',
        `Antes de investir, é preciso verificar se o ofertante está registrado na CVM; fora dessa hipótese, a oferta é potencialmente irregular; consulta pelo Cadastro Geral da CVM; ${TRECHO}`,
      ),
      oficialInvest(CVM, 'Alertas ao cidadão', 'https://www.gov.br/cvm/pt-br/assuntos/protecao/alertas', `Alertas da CVM sobre ofertas e atuações irregulares no mercado e sobre companhias inadimplentes; ${TRECHO}`),
      oficialInvest(
        CVM,
        'Ofertas / Atuações irregulares',
        'https://www.gov.br/cvm/pt-br/assuntos/protecao/alertas/ofertas-atuacoes-irregulares',
        `Pirâmides financeiras são, em geral, crimes contra a economia popular; golpistas podem usar o nome e a identidade visual de instituições reais; ${TRECHO}`,
      ),
      oficialInvest(
        BCB,
        'Cartilha de Informações Financeiras para Migrantes e Refugiados',
        'https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Cartilha_Migrantes_Refugiados/cartilha_BC_PORTUGUES.pdf',
        'Seção 3.1, "Tenha certeza de que a instituição é autorizada pelo BC" (o trecho trouxe só o título da seção); trecho de resultado de busca; o arquivo não abriu',
      ),
    ],
    reviewedOn: INVEST_REVIEWED_ON,
    reviewEveryMonths: 12,
  },
];
