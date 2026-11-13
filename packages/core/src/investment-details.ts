import type { IsoDate } from './dates';
import { formatDateBR, isValidIsoDate, parseDateBR } from './dates';
import type { InvestmentKind } from './investments';

/**
 * Ficha ampliada do investimento (D-099, `docs/49_ESTUDO_INVESTIMENTOS.md`, item 0): campos opcionais que dizem o que é cada
 * investimento. A partir deles a Clarevo deduz a regra de imposto e a garantia, divide a carteira, lista vencimentos e estima o valor
 * pela taxa contratada. Tudo é o que a pessoa registrou: nada aqui recomenda produto, classe, instituição nem momento.
 *
 * Os títulos públicos usam os nomes oficiais do Tesouro Nacional (decisão do Enzo, 13/11/2026). O nome da instituição é digitado pela
 * pessoa; a Clarevo nunca oferece lista de instituições. Regras repetidas no banco (migração 0035, `clarevo_validate_investment_details`).
 */

export type InvestmentSubkind =
  // Renda fixa
  | 'poupanca'
  | 'cdb'
  | 'lc'
  | 'lci'
  | 'lca'
  | 'lcd'
  | 'lig'
  | 'debenture'
  | 'debenture_incentivada'
  | 'cri'
  | 'cra'
  | 'coe'
  // Títulos públicos
  | 'tesouro_selic'
  | 'tesouro_prefixado'
  | 'tesouro_prefixado_juros'
  | 'tesouro_ipca'
  | 'tesouro_ipca_juros'
  | 'tesouro_renda'
  | 'tesouro_educa'
  | 'tesouro_reserva'
  // Fundos
  | 'fundo_renda_fixa'
  | 'fundo_multimercado'
  | 'fundo_acoes'
  | 'fii'
  | 'fiagro'
  | 'etf'
  // Ações
  | 'acao'
  | 'bdr'
  // Previdência
  | 'pgbl'
  | 'vgbl';

export const SUBKINDS_BY_KIND: Readonly<Record<InvestmentKind, readonly InvestmentSubkind[]>> = {
  renda_fixa: ['poupanca', 'cdb', 'lc', 'lci', 'lca', 'lcd', 'lig', 'debenture', 'debenture_incentivada', 'cri', 'cra', 'coe'],
  titulos_publicos: ['tesouro_selic', 'tesouro_prefixado', 'tesouro_prefixado_juros', 'tesouro_ipca', 'tesouro_ipca_juros', 'tesouro_renda', 'tesouro_educa', 'tesouro_reserva'],
  fundos: ['fundo_renda_fixa', 'fundo_multimercado', 'fundo_acoes', 'fii', 'fiagro', 'etf'],
  acoes: ['acao', 'bdr'],
  previdencia: ['pgbl', 'vgbl'],
  cripto: [],
  outro: [],
};

export const INVESTMENT_SUBKINDS: readonly InvestmentSubkind[] = Object.values(SUBKINDS_BY_KIND).flat();

export const SUBKIND_LABEL: Readonly<Record<InvestmentSubkind, string>> = {
  poupanca: 'Poupança',
  cdb: 'CDB ou RDB',
  lc: 'LC (letra de câmbio)',
  lci: 'LCI',
  lca: 'LCA',
  lcd: 'LCD',
  lig: 'LIG',
  debenture: 'Debênture',
  debenture_incentivada: 'Debênture incentivada',
  cri: 'CRI',
  cra: 'CRA',
  coe: 'COE',
  tesouro_selic: 'Tesouro Selic',
  tesouro_prefixado: 'Tesouro Prefixado',
  tesouro_prefixado_juros: 'Tesouro Prefixado com Juros Semestrais',
  tesouro_ipca: 'Tesouro IPCA+',
  tesouro_ipca_juros: 'Tesouro IPCA+ com Juros Semestrais',
  tesouro_renda: 'Tesouro RendA+',
  tesouro_educa: 'Tesouro Educa+',
  tesouro_reserva: 'Tesouro Reserva',
  fundo_renda_fixa: 'Fundo de renda fixa',
  fundo_multimercado: 'Fundo multimercado',
  fundo_acoes: 'Fundo de ações',
  fii: 'Fundo imobiliário (FII)',
  fiagro: 'Fiagro',
  etf: 'ETF',
  acao: 'Ação',
  bdr: 'BDR',
  pgbl: 'PGBL',
  vgbl: 'VGBL',
};

export function subkindKind(subkind: InvestmentSubkind): InvestmentKind {
  return (Object.keys(SUBKINDS_BY_KIND) as InvestmentKind[]).find((k) => SUBKINDS_BY_KIND[k].includes(subkind))!;
}

/** Como rende: % do CDI, Selic mais taxa, IPCA mais taxa, prefixado, regra da poupança ou variável (sem taxa). */
export type InvestmentIndexKind = 'cdi' | 'selic' | 'ipca' | 'prefixado' | 'poupanca' | 'variavel';
export const INVESTMENT_INDEX_KINDS: readonly InvestmentIndexKind[] = ['cdi', 'selic', 'ipca', 'prefixado', 'poupanca', 'variavel'];
export const INDEX_KIND_LABEL: Readonly<Record<InvestmentIndexKind, string>> = {
  cdi: 'Porcentagem do CDI',
  selic: 'Selic mais uma taxa',
  ipca: 'IPCA mais uma taxa',
  prefixado: 'Prefixado (taxa ao ano)',
  poupanca: 'Regra da poupança',
  variavel: 'Variável, sem taxa combinada',
};

/** Quais formas pedem a taxa contratada, e os limites dela em centésimos de ponto percentual (11000 = 110,00%). */
export const RATE_LIMITS: Readonly<Partial<Record<InvestmentIndexKind, { min: number; max: number }>>> = {
  cdi: { min: 1, max: 50000 },
  selic: { min: -500, max: 2000 },
  ipca: { min: -500, max: 3000 },
  prefixado: { min: 1, max: 10000 },
};

export function indexNeedsRate(index: InvestmentIndexKind | null): boolean {
  return index !== null && RATE_LIMITS[index] !== undefined;
}

/** Quando pode resgatar: qualquer dia, em alguns dias depois do pedido, a partir de uma data ou só no vencimento. */
export type InvestmentLiquidity = 'diaria' | 'dias' | 'a_partir_de' | 'no_vencimento';
export const INVESTMENT_LIQUIDITIES: readonly InvestmentLiquidity[] = ['diaria', 'dias', 'a_partir_de', 'no_vencimento'];
export const LIQUIDITY_LABEL: Readonly<Record<InvestmentLiquidity, string>> = {
  diaria: 'Qualquer dia',
  dias: 'Alguns dias depois do pedido',
  a_partir_de: 'A partir de uma data',
  no_vencimento: 'Só no vencimento',
};
export const LIQUIDITY_DAYS_MAX = 1800;

/** Tipo do rendimento recebido (movimento "rendimento"), para os proventos e o resumo da declaração. */
export type InvestmentIncomeKind = 'juros' | 'dividendo' | 'jcp' | 'fii' | 'outro';
export const INVESTMENT_INCOME_KINDS: readonly InvestmentIncomeKind[] = ['juros', 'dividendo', 'jcp', 'fii', 'outro'];
export const INCOME_KIND_LABEL: Readonly<Record<InvestmentIncomeKind, string>> = {
  juros: 'Juros ou cupom',
  dividendo: 'Dividendos',
  jcp: 'JCP',
  fii: 'Rendimento de FII ou Fiagro',
  outro: 'Outro',
};

export const INSTITUTION_MAX = 40;
/** Datas aceitas no vencimento e na liberação (o banco confere o mesmo intervalo). */
export const DETAILS_DATE_MIN: IsoDate = '1990-01-01';
export const DETAILS_DATE_MAX: IsoDate = '2100-12-31';

export interface InvestmentDetails {
  subkind: InvestmentSubkind | null;
  institution: string | null;
  indexKind: InvestmentIndexKind | null;
  /** Centésimos de ponto percentual: 11000 = 110,00% do CDI; 650 = 6,50% ao ano. Só com cdi, selic, ipca e prefixado. */
  rateBp: number | null;
  maturityOn: IsoDate | null;
  liquidity: InvestmentLiquidity | null;
  /** Com liquidity = 'a_partir_de'. */
  liquidityOn: IsoDate | null;
  /** Com liquidity = 'dias': em quantos dias o dinheiro cai depois do pedido (1 a 1800). */
  liquidityDays: number | null;
}

export const EMPTY_INVESTMENT_DETAILS: InvestmentDetails = {
  subkind: null,
  institution: null,
  indexKind: null,
  rateBp: null,
  maturityOn: null,
  liquidity: null,
  liquidityOn: null,
  liquidityDays: null,
};

export type InvestmentDetailsErrorCode = 'subtipo_invalido' | 'instituicao_invalida' | 'rendimento_invalido' | 'taxa_invalida' | 'vencimento_invalido' | 'liquidez_invalida';

const charCount = (text: string) => [...text].length;

export function normalizeInstitution(text: string | null): string | null {
  if (text === null) return null;
  const t = text.trim().replace(/\s+/g, ' ');
  return t === '' ? null : t;
}

/** Chave para somar a mesma instituição escrita de jeitos diferentes: sem acento, sem caixa, sem pontuação e sem espaços repetidos. */
export function institutionKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const validDate = (d: IsoDate | null) => d === null || (isValidIsoDate(d) && d >= DETAILS_DATE_MIN && d <= DETAILS_DATE_MAX);

/** O primeiro erro da ficha, na ordem dos campos, ou null. Tudo é opcional; o que vem precisa ser coerente. */
export function investmentDetailsError(kind: InvestmentKind, d: InvestmentDetails): InvestmentDetailsErrorCode | null {
  if (d.subkind !== null && !(SUBKINDS_BY_KIND[kind] ?? []).includes(d.subkind)) return 'subtipo_invalido';
  if (d.institution !== null) {
    const n = normalizeInstitution(d.institution);
    if (n === null || n !== d.institution || charCount(n) > INSTITUTION_MAX) return 'instituicao_invalida';
  }
  if (d.indexKind !== null && !INVESTMENT_INDEX_KINDS.includes(d.indexKind)) return 'rendimento_invalido';
  const limits = d.indexKind ? RATE_LIMITS[d.indexKind] : undefined;
  if (limits) {
    if (d.rateBp === null || !Number.isSafeInteger(d.rateBp) || d.rateBp < limits.min || d.rateBp > limits.max) return 'taxa_invalida';
  } else if (d.rateBp !== null) return 'taxa_invalida';
  if (!validDate(d.maturityOn)) return 'vencimento_invalido';
  if (d.liquidity !== null && !INVESTMENT_LIQUIDITIES.includes(d.liquidity)) return 'liquidez_invalida';
  if (d.liquidity === 'a_partir_de') {
    if (d.liquidityOn === null || !validDate(d.liquidityOn) || d.liquidityDays !== null) return 'liquidez_invalida';
  } else if (d.liquidity === 'dias') {
    if (d.liquidityDays === null || !Number.isSafeInteger(d.liquidityDays) || d.liquidityDays < 1 || d.liquidityDays > LIQUIDITY_DAYS_MAX || d.liquidityOn !== null) return 'liquidez_invalida';
  } else if (d.liquidityOn !== null || d.liquidityDays !== null) return 'liquidez_invalida';
  return null;
}

/** A ficha sem nada preenchido. */
export function detailsEmpty(d: InvestmentDetails): boolean {
  return Object.values(d).every((v) => v === null);
}

// ---------------------------------------------------------------------------
// O que a ficha deduz: regra de imposto, garantia e a forma de render que costuma acompanhar o tipo
// ---------------------------------------------------------------------------

/**
 * Regra de imposto pelo tipo exato (as regras e as fontes ficam em `investment-tax.ts`):
 * - isento: sem imposto de renda para pessoa física (poupança, LCI, LCA, LCD, LIG, CRI, CRA e debênture incentivada);
 * - regressiva: tabela regressiva no resgate (CDB, LC, debênture, COE e títulos públicos);
 * - come_cotas: fundos com come-cotas em maio e novembro (renda fixa e multimercado);
 * - venda: imposto sobre o ganho na venda (ações, BDR, ETF, FII, Fiagro e fundo de ações no resgate);
 * - previdencia: depende do regime escolhido no contrato;
 * - cripto: regra própria, sem cálculo na Clarevo.
 */
export type TaxRegime = 'isento' | 'regressiva' | 'come_cotas' | 'venda' | 'previdencia' | 'cripto';

const REGIME_BY_SUBKIND: Readonly<Record<InvestmentSubkind, TaxRegime>> = {
  poupanca: 'isento',
  cdb: 'regressiva',
  lc: 'regressiva',
  lci: 'isento',
  lca: 'isento',
  lcd: 'isento',
  lig: 'isento',
  debenture: 'regressiva',
  debenture_incentivada: 'isento',
  cri: 'isento',
  cra: 'isento',
  coe: 'regressiva',
  tesouro_selic: 'regressiva',
  tesouro_prefixado: 'regressiva',
  tesouro_prefixado_juros: 'regressiva',
  tesouro_ipca: 'regressiva',
  tesouro_ipca_juros: 'regressiva',
  tesouro_renda: 'regressiva',
  tesouro_educa: 'regressiva',
  tesouro_reserva: 'regressiva',
  fundo_renda_fixa: 'come_cotas',
  fundo_multimercado: 'come_cotas',
  fundo_acoes: 'venda',
  fii: 'venda',
  fiagro: 'venda',
  etf: 'venda',
  acao: 'venda',
  bdr: 'venda',
  pgbl: 'previdencia',
  vgbl: 'previdencia',
};

export function taxRegimeOf(kind: InvestmentKind, subkind: InvestmentSubkind | null): TaxRegime | null {
  if (subkind) return REGIME_BY_SUBKIND[subkind];
  if (kind === 'titulos_publicos') return 'regressiva';
  if (kind === 'acoes') return 'venda';
  if (kind === 'previdencia') return 'previdencia';
  if (kind === 'cripto') return 'cripto';
  return null;
}

/** Garantia: do FGC (até R$ 250.000,00 por pessoa em cada instituição ou conglomerado), do Tesouro Nacional, ou nenhuma dessas. */
export type InvestmentGuarantee = 'fgc' | 'tesouro' | 'nenhuma';

/** LCD com a garantia pela Resolução CMN 5.169/2024; LIG tem garantia própria (carteira de ativos), não a do FGC. */
const FGC_SUBKINDS: readonly InvestmentSubkind[] = ['poupanca', 'cdb', 'lc', 'lci', 'lca', 'lcd'];

export function guaranteeOf(kind: InvestmentKind, subkind: InvestmentSubkind | null): InvestmentGuarantee | null {
  if (kind === 'titulos_publicos') return 'tesouro';
  if (subkind) return FGC_SUBKINDS.includes(subkind) ? 'fgc' : 'nenhuma';
  if (kind === 'acoes' || kind === 'fundos' || kind === 'previdencia' || kind === 'cripto') return 'nenhuma';
  return null;
}

export const GUARANTEE_LABEL: Readonly<Record<InvestmentGuarantee, string>> = {
  fgc: 'Garantia do FGC',
  tesouro: 'Garantia do Tesouro Nacional',
  nenhuma: 'Sem garantia do FGC nem do Tesouro',
};

/** A forma de render que costuma acompanhar o tipo exato: só preenche o campo vazio, a pessoa troca se quiser. */
export function suggestedIndexKind(subkind: InvestmentSubkind | null): InvestmentIndexKind | null {
  switch (subkind) {
    case 'poupanca':
      return 'poupanca';
    case 'tesouro_selic':
    case 'tesouro_reserva':
      return 'selic';
    case 'tesouro_prefixado':
    case 'tesouro_prefixado_juros':
      return 'prefixado';
    case 'tesouro_ipca':
    case 'tesouro_ipca_juros':
    case 'tesouro_renda':
    case 'tesouro_educa':
      return 'ipca';
    case 'fundo_acoes':
    case 'fundo_multimercado':
    case 'fii':
    case 'fiagro':
    case 'etf':
    case 'acao':
    case 'bdr':
      return 'variavel';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Liquidez: em que faixa o dinheiro está disponível hoje
// ---------------------------------------------------------------------------

export type LiquidityBucket = 'ate_1_dia' | 'ate_30_dias' | 'ate_1_ano' | 'mais_de_1_ano';
export const LIQUIDITY_BUCKETS: readonly LiquidityBucket[] = ['ate_1_dia', 'ate_30_dias', 'ate_1_ano', 'mais_de_1_ano'];
export const LIQUIDITY_BUCKET_LABEL: Readonly<Record<LiquidityBucket, string>> = {
  ate_1_dia: 'Resgate em até 1 dia',
  ate_30_dias: 'Em até 30 dias',
  ate_1_ano: 'Em até 1 ano',
  mais_de_1_ano: 'Em mais de 1 ano',
};

const daysUntil = (from: IsoDate, to: IsoDate) => Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86400000);

/** A faixa de hoje pelo que a pessoa informou, ou null sem informação suficiente. Carência vencida conta como qualquer dia. */
export function liquidityBucket(d: Pick<InvestmentDetails, 'liquidity' | 'liquidityOn' | 'liquidityDays' | 'maturityOn'>, today: IsoDate): LiquidityBucket | null {
  const byDays = (n: number): LiquidityBucket => (n <= 1 ? 'ate_1_dia' : n <= 30 ? 'ate_30_dias' : n <= 365 ? 'ate_1_ano' : 'mais_de_1_ano');
  switch (d.liquidity) {
    case 'diaria':
      return 'ate_1_dia';
    case 'dias':
      return d.liquidityDays === null ? null : byDays(d.liquidityDays);
    case 'a_partir_de':
      return d.liquidityOn === null ? null : byDays(Math.max(0, daysUntil(today, d.liquidityOn)));
    case 'no_vencimento':
      return d.maturityOn === null ? null : byDays(Math.max(0, daysUntil(today, d.maturityOn)));
    default:
      return null;
  }
}

export { daysUntil as calendarDaysBetween };

// ---------------------------------------------------------------------------
// Rascunho do formulário (bloco "Mais detalhes (opcional)")
// ---------------------------------------------------------------------------

export interface InvestmentDetailsDraft {
  subkind: InvestmentSubkind | null;
  institutionText: string;
  indexKind: InvestmentIndexKind | null;
  rateText: string;
  maturityText: string;
  liquidity: InvestmentLiquidity | null;
  liquidityOnText: string;
  liquidityDaysText: string;
}
export type InvestmentDetailsField = keyof InvestmentDetailsDraft;
export const DETAILS_FIELD_ORDER: InvestmentDetailsField[] = ['subkind', 'institutionText', 'indexKind', 'rateText', 'maturityText', 'liquidity', 'liquidityOnText', 'liquidityDaysText'];

export const EMPTY_DETAILS_DRAFT: InvestmentDetailsDraft = {
  subkind: null,
  institutionText: '',
  indexKind: null,
  rateText: '',
  maturityText: '',
  liquidity: null,
  liquidityOnText: '',
  liquidityDaysText: '',
};

/** "110" ou "110,5" ou "6,25%" para centésimos de ponto (11000, 11050, 625). Aceita sinal de menos (Selic e IPCA). */
export function parseRateText(text: string): number | null {
  const t = text.trim().replace(/%$/, '').trim().replace(/\s/g, '');
  if (!/^-?\d{1,3}(?:[.,]\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t.replace(',', '.')) * 100);
}

/** 11000 para "110" e 625 para "6,25" (sem o símbolo). */
export function formatRateInput(bp: number): string {
  const v = (Math.abs(bp) / 100).toFixed(2).replace(/0+$/, '').replace(/[.]$/, '').replace('.', ',');
  return `${bp < 0 ? '-' : ''}${v}`;
}

export function detailsToDraft(d: InvestmentDetails): InvestmentDetailsDraft {
  return {
    subkind: d.subkind,
    institutionText: d.institution ?? '',
    indexKind: d.indexKind,
    rateText: d.rateBp === null ? '' : formatRateInput(d.rateBp),
    maturityText: d.maturityOn ? formatDateBR(d.maturityOn) : '',
    liquidity: d.liquidity,
    liquidityOnText: d.liquidityOn ? formatDateBR(d.liquidityOn) : '',
    liquidityDaysText: d.liquidityDays === null ? '' : String(d.liquidityDays),
  };
}

export function validateDetailsDraft(
  kind: InvestmentKind | null,
  draft: InvestmentDetailsDraft,
): { ok: true; details: InvestmentDetails } | { ok: false; errors: Partial<Record<InvestmentDetailsField, string>> } {
  const E = DETAILS_TEXT.errors;
  const errors: Partial<Record<InvestmentDetailsField, string>> = {};
  // O tipo exato de outro tipo (a pessoa trocou o tipo depois) cai fora sem erro.
  const subkind = draft.subkind !== null && kind !== null && SUBKINDS_BY_KIND[kind].includes(draft.subkind) ? draft.subkind : null;
  const institution = normalizeInstitution(draft.institutionText);
  if (institution !== null && charCount(institution) > INSTITUTION_MAX) errors.institutionText = E.institution;
  const indexKind = draft.indexKind;
  let rateBp: number | null = null;
  const limits = indexKind ? RATE_LIMITS[indexKind] : undefined;
  if (limits) {
    const r = parseRateText(draft.rateText);
    if (draft.rateText.trim() === '') errors.rateText = E.rateEmpty;
    else if (r === null || r < limits.min || r > limits.max) errors.rateText = E.rate;
    else rateBp = r;
  }
  let maturityOn: IsoDate | null = null;
  if (draft.maturityText.trim() !== '') {
    const d = parseDateBR(draft.maturityText);
    if (!d || d < DETAILS_DATE_MIN || d > DETAILS_DATE_MAX) errors.maturityText = E.date;
    else maturityOn = d;
  }
  const liquidity = draft.liquidity;
  let liquidityOn: IsoDate | null = null;
  let liquidityDays: number | null = null;
  if (liquidity === 'a_partir_de') {
    const d = parseDateBR(draft.liquidityOnText);
    if (draft.liquidityOnText.trim() === '') errors.liquidityOnText = E.liquidityOnEmpty;
    else if (!d || d < DETAILS_DATE_MIN || d > DETAILS_DATE_MAX) errors.liquidityOnText = E.date;
    else liquidityOn = d;
  } else if (liquidity === 'dias') {
    const t = draft.liquidityDaysText.trim();
    const n = /^\d{1,4}$/.test(t) ? Number(t) : NaN;
    if (t === '') errors.liquidityDaysText = E.daysEmpty;
    else if (!Number.isInteger(n) || n < 1 || n > LIQUIDITY_DAYS_MAX) errors.liquidityDaysText = E.days;
    else liquidityDays = n;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, details: { subkind, institution, indexKind, rateBp, maturityOn, liquidity, liquidityOn, liquidityDays } };
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

const pct = (bp: number) => `${formatRateInput(bp)}%`;

/** "110% do CDI", "Selic mais 0,1% ao ano", "IPCA mais 6,5% ao ano", "12,5% ao ano", "Regra da poupança", "Variável". */
export function rateSummary(index: InvestmentIndexKind | null, rateBp: number | null): string | null {
  switch (index) {
    case 'cdi':
      return rateBp === null ? null : `${pct(rateBp)} do CDI`;
    case 'selic':
      return rateBp === null ? null : rateBp === 0 ? 'Selic' : rateBp < 0 ? `Selic menos ${pct(-rateBp)} ao ano` : `Selic mais ${pct(rateBp)} ao ano`;
    case 'ipca':
      return rateBp === null ? null : rateBp < 0 ? `IPCA menos ${pct(-rateBp)} ao ano` : `IPCA mais ${pct(rateBp)} ao ano`;
    case 'prefixado':
      return rateBp === null ? null : `${pct(rateBp)} ao ano`;
    case 'poupanca':
      return 'Regra da poupança';
    case 'variavel':
      return 'Variável';
    default:
      return null;
  }
}

export function liquiditySummary(d: Pick<InvestmentDetails, 'liquidity' | 'liquidityOn' | 'liquidityDays'>): string | null {
  switch (d.liquidity) {
    case 'diaria':
      return 'Resgate em qualquer dia';
    case 'dias':
      return d.liquidityDays === 1 ? 'Resgate cai 1 dia depois do pedido' : `Resgate cai ${d.liquidityDays} dias depois do pedido`;
    case 'a_partir_de':
      return d.liquidityOn ? `Resgate a partir de ${formatDateBR(d.liquidityOn)}` : null;
    case 'no_vencimento':
      return 'Resgate só no vencimento';
    default:
      return null;
  }
}

export const DETAILS_TEXT = {
  sectionTitle: 'Mais detalhes (opcional)',
  sectionHint: 'Com estes dados, a Clarevo mostra vencimentos, a garantia do FGC, o imposto estimado e o valor pela taxa que você contratou.',
  subkindLabel: 'Qual é o investimento?',
  subkindNone: 'Prefiro não dizer',
  institutionLabel: 'Onde está',
  institutionHint: 'O nome do banco ou da corretora, do jeito que você reconhece.',
  indexLabel: 'Como rende',
  rateLabel: (index: InvestmentIndexKind) =>
    index === 'cdi' ? 'Porcentagem do CDI' : index === 'prefixado' ? 'Taxa ao ano' : index === 'selic' ? 'Taxa acima da Selic, ao ano' : 'Taxa acima do IPCA, ao ano',
  rateHint: (index: InvestmentIndexKind) =>
    index === 'cdi'
      ? 'Como está no contrato ou no extrato, por exemplo 110 para 110% do CDI.'
      : index === 'selic'
        ? 'Por exemplo 0,1 para Selic mais 0,1% ao ano. Use 0 se rende só a Selic.'
        : 'Como está no contrato ou no extrato, por exemplo 6,5 para 6,5% ao ano.',
  maturityLabel: 'Vencimento (opcional)',
  maturityHint: 'A data em que o investimento vence, se tiver.',
  liquidityLabel: 'Quando pode resgatar',
  liquidityOnLabel: 'Pode resgatar a partir de',
  liquidityDaysLabel: 'Em quantos dias o dinheiro cai',
  liquidityDaysHint: 'Por exemplo 1 para o dia seguinte ao pedido.',
  /** O que a ficha deduz, mostrado no formulário e no detalhe. */
  regimeLine: (regime: TaxRegime) =>
    ({
      isento: 'Imposto de renda: isento para pessoa física.',
      regressiva: 'Imposto de renda: tabela regressiva, de 22,5% a 15% sobre o rendimento, pelo tempo aplicado.',
      come_cotas: 'Imposto de renda: come-cotas em maio e novembro, e um possível complemento no resgate.',
      venda: 'Imposto de renda: sobre o ganho na venda, com regras próprias.',
      previdencia: 'Imposto de renda: depende do regime escolhido no contrato.',
      cripto: 'Imposto de renda: regra própria para criptoativos.',
    })[regime],
  guaranteeLine: (g: InvestmentGuarantee) => `${GUARANTEE_LABEL[g]}.`,
  checkStatement: 'Confira no seu extrato ou no contrato.',
  errors: {
    institution: `Use até ${INSTITUTION_MAX} caracteres.`,
    rateEmpty: 'Informe a taxa, como está no contrato.',
    rate: 'Informe uma taxa válida, como 110 ou 6,5.',
    date: 'Informe uma data válida, como 15/03/2027.',
    liquidityOnEmpty: 'Informe a partir de quando pode resgatar.',
    daysEmpty: 'Informe em quantos dias o dinheiro cai.',
    days: `Use um número de 1 a ${LIQUIDITY_DAYS_MAX}.`,
  },
} as const;

export function investmentDetailsErrorText(code: InvestmentDetailsErrorCode | string): string | null {
  const E = DETAILS_TEXT.errors;
  switch (code) {
    case 'subtipo_invalido':
      return 'Escolha um investimento da lista.';
    case 'instituicao_invalida':
      return E.institution;
    case 'rendimento_invalido':
      return 'Escolha como rende.';
    case 'taxa_invalida':
      return E.rate;
    case 'vencimento_invalido':
      return E.date;
    case 'liquidez_invalida':
      return 'Confira quando pode resgatar.';
    default:
      return null;
  }
}
