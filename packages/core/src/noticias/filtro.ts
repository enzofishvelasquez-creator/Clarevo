import type { TemaNoticia } from './fontes';

/**
 * O filtro de temas das notícias (D-117): só o mercado da Clarevo, finanças pessoais. Uma notícia entra quando o título, o resumo ou os
 * assuntos falam de um destes temas: Selic, Copom e juros; inflação e IPCA; Imposto de Renda, declaração e restituição; Pix e regras de
 * pagamento; cartão, rotativo, crédito, endividamento e renegociação; golpes e fraudes financeiras; FGC; Tesouro Direto e poupança;
 * salário mínimo e 13º (com o abono salarial e o FGTS).
 *
 * E sai, pela linha editorial da CVM (Resolução CVM 20/2021, perguntas 54 e 55 do advogado), toda notícia sobre empresa listada, ação,
 * índice de bolsa ou dica de mercado: código de ação (PETR4), Ibovespa, IFIX, "bolsa de valores", dividendos, preço-alvo, "onde investir",
 * os nomes das maiores empresas listadas e afins. O teste confere cada lista (`noticias.test.ts`).
 *
 * As palavras ficam sem acento e em minúsculas (o texto é comparado do mesmo jeito) e casam com a palavra inteira, aceitando o plural com
 * "s" no fim.
 */

/** Sem acento, em minúsculas, com "º" e "ª" como letras, só letras, números e uns poucos sinais, espaços juntados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^a-z0-9$%+\-/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** Uma expressão que acha qualquer uma das palavras, inteira, com plural opcional em "s". */
const lista = (palavras: readonly string[]) => new RegExp(`(?:^|[^a-z0-9])(?:${palavras.map(escRe).join('|')})s?(?![a-z0-9])`);

interface RegraDeTema {
  tema: TemaNoticia;
  /** Valem no título, no resumo e nos assuntos. */
  fortes: readonly string[];
  /** Valem só no título e nos assuntos (palavras que, soltas no resumo, falam de outra coisa). */
  noTitulo?: readonly string[];
  /** Expressões que usam a palavra em outro sentido e saem do texto antes da comparação ("golpe de Estado"). */
  fora?: readonly string[];
}

/** Os temas, na ordem de preferência quando uma notícia fala de mais de um (o mais específico primeiro). */
export const REGRAS_DE_TEMA: readonly RegraDeTema[] = [
  {
    tema: 'golpes',
    fortes: [
      'golpe', 'golpista', 'fraude bancaria', 'fraude financeira', 'fraude no pix', 'fraudes no pix', 'fraude com cartao', 'fraudes com cartao',
      'fraude com cartoes', 'falsa central', 'falsas centrais', 'falso atendente', 'falso funcionario', 'falsos funcionarios', 'phishing',
      'engenharia social', 'boleto falso', 'boletos falsos', 'conta laranja', 'contas laranja', 'estelionato', 'estelionatario',
    ],
    fora: [
      'golpe de estado', 'golpes de estado', 'tentativa de golpe', 'trama golpista', 'atos golpistas', 'ato golpista', 'golpe militar', 'golpe de 1964',
      'plano golpista', 'nucleo golpista', 'nucleos golpistas', 'acampamento golpista', 'acampamentos golpistas', 'golpe de sorte', 'golpe de mestre',
    ],
  },
  { tema: 'fgc', fortes: ['fgc', 'fundo garantidor de credito', 'fundo garantidor de creditos', 'fundo garantidor'] },
  {
    tema: 'imposto-de-renda',
    fortes: ['imposto de renda', 'irpf', 'malha fina', 'declaracao do ir', 'declaracao do imposto', 'restituicao do ir', 'restituicao do imposto', 'isencao do ir', 'tabela do ir'],
    noTitulo: ['restituicao', 'restituicoes'],
  },
  {
    tema: 'pix',
    fortes: ['pix', 'pagamento instantaneo', 'pagamentos instantaneos', 'open finance', 'drex', 'tarifa bancaria', 'tarifas bancarias'],
    noTitulo: ['boleto', 'meios de pagamento', 'meio de pagamento'],
  },
  {
    tema: 'credito',
    fortes: [
      'cartao de credito', 'cartoes de credito', 'rotativo', 'cheque especial', 'consignado', 'credito pessoal', 'credito ao consumidor',
      'endividamento', 'superendividamento', 'endividado', 'endividada', 'inadimplencia', 'inadimplente', 'renegociacao de divida',
      'renegociacao de dividas', 'renegociar dividas', 'desenrola', 'limpa nome', 'nome sujo', 'juros do cartao', 'dividas atrasadas', 'dividas em atraso',
    ],
    noTitulo: ['contratacao de credito', 'oferta de credito', 'concessao de credito ao consumidor'],
    fora: ['divida publica', 'dividas publicas', 'dividas dos estados', 'divida dos estados', 'dividas de estados', 'dividas dos municipios', 'divida externa', 'renegociacao das dividas dos estados'],
  },
  {
    tema: 'tesouro-e-poupanca',
    fortes: ['tesouro direto', 'poupanca', 'tesouro selic', 'tesouro ipca', 'tesouro prefixado', 'tesouro renda+', 'tesouro educa+'],
  },
  {
    tema: 'salario',
    fortes: ['salario minimo', '13o salario', 'decimo terceiro', 'abono salarial', 'fgts', 'saque-aniversario', 'saque aniversario'],
  },
  { tema: 'juros', fortes: ['selic', 'copom', 'taxa basica de juros', 'politica monetaria'], noTitulo: ['juros', 'juro'] },
  { tema: 'inflacao', fortes: ['ipca', 'ipca-15', 'inpc', 'custo de vida', 'cesta basica'], noTitulo: ['inflacao', 'deflacao'] },
];

const COMPILADAS = REGRAS_DE_TEMA.map((r) => ({
  tema: r.tema,
  fortes: lista(r.fortes),
  noTitulo: r.noTitulo ? lista(r.noTitulo) : null,
  foraGlobal: r.fora ? new RegExp(`(?:^|[^a-z0-9])(?:${r.fora.map(escRe).join('|')})s?(?![a-z0-9])`, 'g') : null,
}));

/**
 * O tema de uma notícia, ou `null` se ela não é do mercado da Clarevo. `titulo` inclui os assuntos (categorias) do feed; `resumo` é o
 * resumo curto (pode faltar).
 */
export function temaDaNoticia(titulo: string, resumo = ''): TemaNoticia | null {
  const t = ` ${normalizar(titulo)} `;
  const r = ` ${normalizar(resumo)} `;
  for (const c of COMPILADAS) {
    const tt = c.foraGlobal ? t.replace(c.foraGlobal, ' ') : t;
    const rr = c.foraGlobal ? r.replace(c.foraGlobal, ' ') : r;
    if (c.fortes.test(tt) || c.fortes.test(rr) || (c.noTitulo && c.noTitulo.test(tt))) return c.tema;
  }
  return null;
}

/** Código de ação ou de fundo listado: quatro letras maiúsculas e o número da classe (PETR4, VALE3, ITUB4, KNRI11). */
export const CODIGO_DE_ACAO = /(?<![A-Za-z0-9])[A-Z]{4}(?:3|4|5|6|11)(?![A-Za-z0-9])/;

/** Bolsa, ações, índices e dicas de mercado (sem acento, minúsculas). */
export const PALAVRAS_DE_MERCADO: readonly string[] = [
  'ibovespa', 'ifix', 'indice bovespa', 'bolsa de valores', 'bolsa brasileira', 'b3', 'mercado de acoes', 'acoes na bolsa', 'acoes de empresas',
  'acoes listadas', 'acoes preferenciais', 'acoes ordinarias', 'acionista', 'dividendo', 'juros sobre capital proprio', 'valor de mercado', 'pregao',
  'ipo', 'oferta publica inicial', 'preco-alvo', 'preco alvo', 'recomendacao de compra', 'recomendacao de venda', 'carteira recomendada',
  'onde investir', 'melhores acoes', 'melhores investimentos', 'melhores fundos', 'vale a pena investir', 'hora de comprar', 'small caps',
  'fundos imobiliarios', 'fundo imobiliario', 'balanco trimestral', 'resultado trimestral', 'lucro liquido', 'wall street', 'nasdaq', 'dow jones',
];

/**
 * Nomes de empresas listadas na B3 que costumam aparecer em notícia de finanças. A comparação é sem acento e com as maiúsculas originais
 * ("Americanas" é a empresa; "empresas americanas", não). A lista não é completa: o código de ação e as palavras de mercado são a proteção
 * principal.
 */
export const EMPRESAS_LISTADAS: readonly string[] = [
  'Petrobras', 'Itau', 'Itau Unibanco', 'Bradesco', 'Banco do Brasil', 'Santander', 'BTG Pactual', 'XP Investimentos', 'XP Inc', 'Banco Inter',
  'Nubank', 'Nu Holdings', 'Magazine Luiza', 'Magalu', 'Americanas', 'Eletrobras', 'Ambev', 'Embraer', 'JBS', 'Gerdau', 'Usiminas', 'Suzano',
  'Raia Drogasil', 'Casas Bahia', 'Sabesp', 'Cemig', 'Copel', 'Hapvida', 'Cielo', 'PagBank', 'PagSeguro', 'Mercado Livre', 'Mercado Pago',
  'Banco Pan', 'Banco BMG', 'Localiza', 'Vale S.A.', 'Vale S/A',
];

const MERCADO = lista(PALAVRAS_DE_MERCADO);
const semAcento = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const EMPRESAS = new RegExp(`(?<![A-Za-z0-9])(?:${EMPRESAS_LISTADAS.map((e) => escRe(semAcento(e))).join('|')})(?![A-Za-z0-9])`);

/**
 * A notícia fala de empresa listada, ação, índice de bolsa ou dica de mercado? `texto`: título, resumo e assuntos. Uma notícia assim não
 * entra na página (linha editorial da CVM).
 */
export function foraDaLinhaEditorial(texto: string): boolean {
  return CODIGO_DE_ACAO.test(texto) || MERCADO.test(` ${normalizar(texto)} `) || EMPRESAS.test(semAcento(texto));
}

/** O que faz o texto inteiro de uma matéria ficar fora do site (a notícia continua na lista, com "Ler na fonte"). */
export const MERCADO_NO_CORPO: readonly string[] = ['ibovespa', 'ifix', 'indice bovespa', 'preco-alvo', 'preco alvo', 'recomendacao de compra', 'recomendacao de venda', 'carteira recomendada', 'melhores acoes'];
const CORPO = lista(MERCADO_NO_CORPO);

/**
 * O corpo da matéria cita código de ação, índice de bolsa ou dica de mercado? Então o texto inteiro não aparece no site, mesmo com a
 * licença permitindo: a notícia fica só com o resumo e o link para a fonte.
 */
export const corpoCitaMercado = (texto: string): boolean => CODIGO_DE_ACAO.test(texto) || CORPO.test(` ${normalizar(texto)} `);
