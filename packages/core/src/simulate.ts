import { monthsCount } from './calculators/common';
import { parseCount, parseMoney, parseOptionalMoney, parsePercentBp, type CalcErrorCode, type Parsed } from './calculators/inputs';
import type { ObjetivoResult } from './calculators/juntar-para-objetivo';
import type { RouteParams } from './calculators/links';
import type { IsoDate } from './dates';
import { addMonths, formatMonthInputBR, monthOf } from './dates';
import type { GoalDraft, GoalPlan } from './goals';
import { formatBp, formatBpCompact } from './learn/format';
import { equivalentMonthlyBp, monthlyShareCents, monthsToReach } from './learn/math';
import { MAX_RECORD_CENTS, centsToInput, formatBRL, type Cents } from './money';

/**
 * Simulador (D-028, Ciclo D; spec2 §2.6, §3.5 e §4.7). Só conta: nenhuma tabela, função de banco ou gravação. A taxa
 * é sempre digitada pela pessoa (0% a 30% ao ano, sem valor padrão) e nunca é gravada, nem na meta.
 *
 * - Taxa mensal equivalente: i = (1 + a)^(1/12) − 1, com a = pontos-base ÷ 10.000; a = 0 → i = 0.
 * - Aportes no início de cada mês, a convenção da Calculadora do Cidadão do Banco Central (Aplicação com depósitos
 *   regulares: Sn = (1 + j) × (((1 + j)^n − 1) ÷ j) × p; decisão de Enzo de 09/10/2026, no lugar do fim do mês da
 *   spec2 §2.6): final(n) = piso(inicial × (1 + i)^n + mensal × (1 + i) × ((1 + i)^n − 1) ÷ i);
 *   i = 0 → inicial + mensal × n.
 * - Valor por mês para um alvo: o menor inteiro com final ≥ alvo (para cima); i = 0 → teto((alvo − inicial) ÷ n).
 * - Prazo: o menor n de 1 a 600 com final(n) ≥ alvo (para cima); senão null ("não alcança em 50 anos").
 * - Dinheiro de hoje: piso(final ÷ (1 + π)^n), com π a inflação mensal equivalente.
 * - Só o fator de juros usa ponto flutuante de 64 bits; entradas e saídas são centavos inteiros. O fator é calculado
 *   com log1p e expm1 ((1 + i)^n = e^(n × ln(1 + a) ÷ 12), 1 + i = e^(ln(1 + a) ÷ 12)), a mesma conta da spec2 sem a
 *   perda de precisão de (1 + i) − 1 com taxas pequenas e prazos longos.
 * - Sem produto, banco, emissor, ranking, perfil de quem investe ou taxa sugerida (Resoluções CVM 19, 20 e 30).
 */

export type SimulationMode = 'quanto-guardar' | 'em-quanto-tempo' | 'quanto-ter';
export const SIMULATION_MODES: readonly SimulationMode[] = ['quanto-guardar', 'em-quanto-tempo', 'quanto-ter'];

/** Taxa e inflação ao ano: 0 a 3.000 pontos-base (0% a 30%). */
export const SIMULATE_RATE_MAX_BP = 3_000;
/** Prazo: 1 a 600 meses (50 anos). */
export const SIMULATE_MONTHS_MIN = 1;
export const SIMULATE_MONTHS_MAX = 600;
/** Maior resultado mostrado: R$ 999.999.999.999,99 (acima disso, "o resultado passa do que o simulador mostra"). */
export const SIMULATE_RESULT_MAX_CENTS = 99_999_999_999_999;

/** Temas de Aprender ligados ao simulador (spec3 §3.7): taxa, inflação, resultado e leitura da simulação. */
export const SIMULATE_TOPICS = {
  rate: 'taxa-mes-ano',
  inflation: 'inflacao-ipca',
  result: 'juros-simples-compostos',
  reading: 'simulacao',
} as const;

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

function checkInt(value: number, name: string, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${name} inválido: ${value}`);
}

function checkRate(bp: number, name: string): void {
  checkInt(bp, name, 0, SIMULATE_RATE_MAX_BP);
}

/** ln(1 + i) da taxa mensal equivalente: ln(1 + a) ÷ 12. */
function logMonthly(bp: number): number {
  return Math.log1p(bp / 10_000) / 12;
}

/**
 * Taxa (fração) do texto digitado, em pontos-base: "10" e "10,00" → 1.000; "10,5" → 1.050; "0" → 0. Até 2 casas,
 * de 0% a 30%; vazio, "30,01", "10,555" ou "abc" → null. Aceita "%" no fim e ponto como vírgula (parsePercentBp).
 */
export function parseRateBp(text: string): number | null {
  const parsed = parsePercentBp(text, { min: 0, max: SIMULATE_RATE_MAX_BP });
  return parsed.ok ? parsed.value : null;
}

/** Taxa mensal equivalente (fração): (1 + a)^(1/12) − 1. monthlyRate(1.000) ≈ 0,0079741 (0,80% ao mês). */
export function monthlyRate(rateBp: number): number {
  checkRate(rateBp, 'taxa');
  return rateBp === 0 ? 0 : Math.expm1(logMonthly(rateBp));
}

/** Taxa mensal equivalente para o texto: 1.000 → "0,80%"; 450 → "0,37%"; uma taxa positiva abaixo de 0,01%: "menos de 0,01%". */
export function monthlyRateText(rateBp: number): string {
  checkRate(rateBp, 'taxa');
  const bp = equivalentMonthlyBp(rateBp);
  return bp === 0 && rateBp > 0 ? 'menos de 0,01%' : formatBp(bp);
}

/**
 * Fator dos aportes no início de cada mês, por centavo aportado por mês: (1 + i) × ((1 + i)^n − 1) ÷ i
 * = expm1(n × l) ÷ expm1(l) × e^l, com l = ln(1 + i). Com i > 0 fica acima de n (o aporte do mês já rende no mês).
 */
function depositsFactor(months: number, l: number): number {
  return (Math.expm1(months * l) / Math.expm1(l)) * Math.exp(l);
}

/**
 * Valor sem piso nem conferência de tamanho, com aportes no início de cada mês:
 * inicial × (1 + i)^n + mensal × (1 + i) × ((1 + i)^n − 1) ÷ i, nunca abaixo do aportado.
 */
function rawFinal(initial: Cents, monthly: Cents, months: number, rateBp: number): number {
  const contributed = initial + monthly * months;
  if (rateBp === 0) return contributed;
  const l = logMonthly(rateBp);
  const value = Math.floor(initial * Math.exp(months * l) + monthly * depositsFactor(months, l));
  // Com taxa de 0% ou mais, o valor nunca fica abaixo do aportado: o máximo só corrige o ruído do ponto flutuante.
  return Math.max(value, contributed);
}

function checkAmounts(initial: Cents, monthly: Cents, months: number, rateBp: number, minMonths: number): void {
  checkInt(initial, 'valor inicial', 0, MAX_RECORD_CENTS);
  checkInt(monthly, 'valor por mês', 0, MAX_RECORD_CENTS);
  checkInt(months, 'prazo', minMonths, SIMULATE_MONTHS_MAX);
  checkRate(rateBp, 'taxa');
}

function safe(value: number): Cents {
  if (value > Number.MAX_SAFE_INTEGER) throw new RangeError('resultado grande demais');
  return value;
}

/**
 * Valor ao fim de n meses, para baixo no centavo, com aportes no início de cada mês. n = 0 → o valor inicial.
 * finalValueCents(450.000, 117.515, 14, 1.000) = 2.250.012; finalValueCents(0, 50.000, 120, 1.000) = 10.072.879.
 */
export function finalValueCents(initial: Cents, monthly: Cents, months: number, rateBp: number): Cents {
  checkAmounts(initial, monthly, months, rateBp, 0);
  return safe(rawFinal(initial, monthly, months, rateBp));
}

/**
 * Valor em dinheiro de hoje: piso(valor ÷ (1 + π)^n), π = (1 + inflação)^(1/12) − 1. Inflação 0: o próprio valor.
 * todayValueCents(10.072.879, 120, 450) = 6.486.205.
 */
export function todayValueCents(valueCents: Cents, months: number, inflationBp: number): Cents {
  checkInt(valueCents, 'valor', 0, Number.MAX_SAFE_INTEGER);
  checkInt(months, 'prazo', 0, SIMULATE_MONTHS_MAX);
  checkRate(inflationBp, 'inflação');
  if (inflationBp === 0 || months === 0) return valueCents;
  return Math.floor(valueCents / Math.exp(months * logMonthly(inflationBp)));
}

export interface SimulationGrowthInput {
  initial: Cents;
  monthly: Cents;
  /** 1 a 600. */
  months: number;
  /** 0 a 3.000. */
  rateBp: number;
  /** Opcional, 0 a 3.000; null ou ausente: sem valor em dinheiro de hoje. */
  inflationBp?: number | null;
}

/** Uma barra (e uma linha da tabela) por ano; o último ano pode ser parcial. Valores acumulados até o fim do período. */
export interface SimulationYear {
  /** 1, 2, 3... */
  year: number;
  /** Meses desde o começo até o fim deste ano (12, 24... ou n no último). */
  months: number;
  /** Ano incompleto (o último, quando n não é múltiplo de 12). */
  partial: boolean;
  contributedCents: Cents;
  earningsCents: Cents;
  finalCents: Cents;
  todayValueCents: Cents | null;
}

export interface SimulationGrowth {
  /** Valor ao fim do prazo, na hipótese informada (para baixo). */
  finalCents: Cents;
  /** Total aportado: inicial + mensal × n. É também o resultado sem rendimento. */
  contributedCents: Cents;
  /** Rendimento na hipótese: final − aportado (nunca negativo). */
  earningsCents: Cents;
  /** Valor final em dinheiro de hoje; null sem inflação informada. */
  todayValueCents: Cents | null;
  byYear: SimulationYear[];
}

/**
 * Composição na hipótese: aportado, rendimento, final, dinheiro de hoje e o ano a ano.
 * simulateGrowth({ initial: 0, monthly: 50.000, months: 120, rateBp: 1.000, inflationBp: 450 }) →
 * { finalCents: 10.072.879, contributedCents: 6.000.000, earningsCents: 4.072.879, todayValueCents: 6.486.205, byYear: [10 anos] }.
 */
export function simulateGrowth(input: SimulationGrowthInput): SimulationGrowth {
  const { initial, monthly, months, rateBp } = input;
  const inflationBp = input.inflationBp ?? null;
  checkAmounts(initial, monthly, months, rateBp, SIMULATE_MONTHS_MIN);
  if (inflationBp !== null) checkRate(inflationBp, 'inflação');
  const at = (n: number) => {
    const finalCents = safe(rawFinal(initial, monthly, n, rateBp));
    const contributedCents = initial + monthly * n;
    return {
      finalCents,
      contributedCents,
      earningsCents: finalCents - contributedCents,
      todayValueCents: inflationBp === null ? null : todayValueCents(finalCents, n, inflationBp),
    };
  };
  const byYear: SimulationYear[] = [];
  for (let year = 1; (year - 1) * 12 < months; year++) {
    const n = Math.min(year * 12, months);
    byYear.push({ year, months: n, partial: n % 12 !== 0, ...at(n) });
  }
  return { ...at(months), byYear };
}

/**
 * Valor por mês para juntar o alvo em n meses: o menor inteiro com final ≥ alvo (para cima no centavo); 0 quando o
 * inicial já chega lá. Taxa 0: teto((alvo − inicial) ÷ n). monthlyForTarget(2.250.000, 450.000, 14, 1.000) = 117.515;
 * com taxa 0, 128.572.
 */
export function monthlyForTarget(target: Cents, initial: Cents, months: number, rateBp: number): Cents {
  checkInt(target, 'alvo', 1, MAX_RECORD_CENTS);
  checkAmounts(initial, 0, months, rateBp, SIMULATE_MONTHS_MIN);
  if (initial >= target) return 0;
  if (rateBp === 0) return monthlyShareCents(target - initial, months);
  // Fórmula da spec2 com aportes no início do mês: max(0, teto((alvo − inicial × f) × i ÷ ((f − 1) × (1 + i)))),
  // conferida e ajustada pelo próprio final(), para que o resultado seja sempre o menor valor que alcança o alvo.
  const l = logMonthly(rateBp);
  let m = Math.max(0, Math.ceil((target - initial * Math.exp(months * l)) / depositsFactor(months, l)));
  while (m > 0 && rawFinal(initial, m - 1, months, rateBp) >= target) m -= 1;
  while (rawFinal(initial, m, months, rateBp) < target) m += 1;
  return m;
}

/**
 * Meses para juntar o alvo: o menor n de 1 a 600 com final(n) ≥ alvo; 0 quando o inicial já chega lá; null quando não
 * alcança em 600 meses (50 anos). monthsForTarget(2.250.000, 450.000, 100.000, 1.000) = 17; com taxa 0, 18.
 */
export function monthsForTarget(target: Cents, initial: Cents, monthly: Cents, rateBp: number): number | null {
  checkInt(target, 'alvo', 1, MAX_RECORD_CENTS);
  checkAmounts(initial, monthly, SIMULATE_MONTHS_MIN, rateBp, SIMULATE_MONTHS_MIN);
  if (initial >= target) return 0;
  if (rateBp === 0) {
    if (monthly === 0) return null;
    const n = monthsToReach(target - initial, monthly);
    return n <= SIMULATE_MONTHS_MAX ? n : null;
  }
  for (let n = 1; n <= SIMULATE_MONTHS_MAX; n++) if (rawFinal(initial, monthly, n, rateBp) >= target) return n;
  return null;
}

// ---------------------------------------------------------------------------
// Formulário (/simular)
// ---------------------------------------------------------------------------

/** O que a pessoa digitou. Campos que não pertencem ao modo são ignorados. */
export interface SimulationDraft {
  mode: SimulationMode | null;
  /** "Quanto quer juntar" (quanto-guardar, em-quanto-tempo). */
  targetText: string;
  /** "Quanto já tem (opcional)" (todos). */
  initialText: string;
  /** "Em quantos meses" (quanto-guardar, quanto-ter), 1 a 600. */
  monthsText: string;
  /** "Quanto vai guardar por mês" (em-quanto-tempo, quanto-ter). */
  monthlyText: string;
  /** "Taxa de rendimento ao ano (%)": vazia por padrão, sempre digitada. */
  rateText: string;
  /** "Descontar inflação? (opcional)". */
  inflationOn: boolean;
  /** "Inflação ao ano (%)", lida só com inflationOn. */
  inflationText: string;
}

export type SimulationField = 'mode' | 'targetText' | 'initialText' | 'monthsText' | 'monthlyText' | 'rateText' | 'inflationText';
/** Ordem dos campos na tela: o foco vai para o primeiro erro. */
export const SIMULATION_FIELD_ORDER: readonly SimulationField[] = ['mode', 'targetText', 'initialText', 'monthsText', 'monthlyText', 'rateText', 'inflationText'];
/** Campos de cada modo, na ordem da tela (inflação só com o interruptor ligado). */
export const SIMULATION_MODE_FIELDS: Readonly<Record<SimulationMode, readonly SimulationField[]>> = {
  'quanto-guardar': ['targetText', 'initialText', 'monthsText', 'rateText', 'inflationText'],
  'em-quanto-tempo': ['targetText', 'initialText', 'monthlyText', 'rateText', 'inflationText'],
  'quanto-ter': ['initialText', 'monthsText', 'monthlyText', 'rateText', 'inflationText'],
};

/** Rascunho vazio: nenhum modo, taxa vazia, sem inflação. */
export function emptySimulationDraft(mode: SimulationMode | null = null): SimulationDraft {
  return { mode, targetText: '', initialText: '', monthsText: '', monthlyText: '', rateText: '', inflationOn: false, inflationText: '' };
}

/** Entradas lidas e conferidas. */
export interface SimulationInput {
  mode: SimulationMode;
  /** null em quanto-ter. */
  targetCents: Cents | null;
  /** 0 quando em branco. */
  initialCents: Cents;
  /** null em em-quanto-tempo (é o que se calcula). */
  months: number | null;
  /** null em quanto-guardar (é o que se calcula). */
  monthlyCents: Cents | null;
  rateBp: number;
  /** null sem inflação. */
  inflationBp: number | null;
}

export interface SimulationTexts {
  /** Linha de abertura ("Para juntar R$ 22.500,00 em 14 meses, começando com R$ 4.500,00:"); null quando não há. */
  intro: string | null;
  /** Destaque ("R$ 1.175,15 por mês na hipótese informada"). */
  highlight: string;
  /** Demais linhas, na ordem (sem rendimento, composição, dinheiro de hoje). */
  lines: string[];
}

export interface SimulationResult {
  mode: SimulationMode;
  input: SimulationInput;
  /** Quanto já tem ≥ quanto quer juntar: sem conta nem gráfico. */
  reached: boolean;
  /** Não alcança em 600 meses na hipótese (só em em-quanto-tempo). */
  unreachable: boolean;
  /** Por mês: calculado (quanto-guardar, na hipótese) ou informado. null quando reached. */
  monthlyCents: Cents | null;
  /** quanto-guardar: por mês sem rendimento; null nos outros modos. */
  monthlyWithoutYieldCents: Cents | null;
  /** Prazo: calculado (em-quanto-tempo; null quando não alcança) ou informado. null quando reached. */
  months: number | null;
  /** em-quanto-tempo: prazo sem rendimento (null quando passa de 600 meses); null nos outros modos. */
  monthsWithoutYield: number | null;
  /** Composição na hipótese; null quando reached ou unreachable. */
  growth: SimulationGrowth | null;
  texts: SimulationTexts;
  /** Hipóteses, sempre visíveis. */
  hypotheses: string[];
  /** Aviso fixo (D-028(3)). */
  disclaimer: string;
}

export type SimulationOutcome =
  | { ok: true; input: SimulationInput; result: SimulationResult }
  | { ok: false; errors: Partial<Record<SimulationField, string>>; codes: Partial<Record<SimulationField, CalcErrorCode>> };

/**
 * Lê o formulário, confere na ordem da tela e calcula. Nada é gravado. Regras: taxa obrigatória (0 vale), de 0% a 30%
 * com até 2 casas; inflação de 0% a 30% só com o interruptor ligado; prazo de 1 a 600; valores até R$ 9.999.999,99;
 * "quanto quer juntar" maior que zero; em em-quanto-tempo, valor por mês maior que zero; em quanto-ter, valor por mês
 * zero só com algo já guardado. Resultado acima de SIMULATE_RESULT_MAX_CENTS: resultado_alto no prazo.
 */
export function validateSimulationDraft(draft: SimulationDraft): SimulationOutcome {
  const codes: Partial<Record<SimulationField, CalcErrorCode>> = {};
  const read = <T>(field: SimulationField, parsed: Parsed<T>): T | undefined => {
    if (parsed.ok) return parsed.value;
    codes[field] ??= parsed.error;
    return undefined;
  };
  const mode = draft.mode !== null && SIMULATION_MODES.includes(draft.mode) ? draft.mode : null;
  if (mode === null) codes.mode = 'vazio';
  const uses = (field: SimulationField) => mode !== null && SIMULATION_MODE_FIELDS[mode].includes(field);

  const target = uses('targetText') ? read('targetText', parseMoney(draft.targetText)) : null;
  const initial = read('initialText', parseOptionalMoney(draft.initialText));
  const months = uses('monthsText') ? read('monthsText', parseCount(draft.monthsText, SIMULATE_MONTHS_MIN, SIMULATE_MONTHS_MAX)) : null;
  let monthly: Cents | null | undefined = null;
  if (mode === 'em-quanto-tempo') monthly = read('monthlyText', parseMoney(draft.monthlyText));
  else if (mode === 'quanto-ter') {
    monthly = read('monthlyText', parseMoney(draft.monthlyText, { allowZero: true }));
    if (monthly === 0 && initial !== undefined && (initial ?? 0) === 0) codes.monthlyText ??= 'zero';
  }
  const rate = read('rateText', parsePercentBp(draft.rateText, { min: 0, max: SIMULATE_RATE_MAX_BP }));
  const inflation = draft.inflationOn ? read('inflationText', parsePercentBp(draft.inflationText, { min: 0, max: SIMULATE_RATE_MAX_BP })) : null;

  if (Object.keys(codes).length > 0 || mode === null || target === undefined || initial === undefined || months === undefined || monthly === undefined || rate === undefined || inflation === undefined) {
    return { ok: false, codes, errors: simulationErrors(codes) };
  }
  const input: SimulationInput = { mode, targetCents: target, initialCents: initial ?? 0, months, monthlyCents: monthly, rateBp: rate, inflationBp: inflation };
  if (resultTooHigh(input)) {
    const field: SimulationField = mode === 'em-quanto-tempo' ? 'monthlyText' : 'monthsText';
    codes[field] = 'resultado_alto';
    return { ok: false, codes, errors: simulationErrors(codes) };
  }
  return { ok: true, input, result: simulate(input) };
}

/** A composição passaria de SIMULATE_RESULT_MAX_CENTS (valores e prazos extremos). */
function resultTooHigh(input: SimulationInput): boolean {
  const plan = planOf(input);
  return plan !== null && rawFinal(input.initialCents, plan.monthly, plan.months, input.rateBp) > SIMULATE_RESULT_MAX_CENTS;
}

/** Valor por mês e prazo da composição (calculando o que falta); null quando já alcançou ou não alcança. */
function planOf(input: SimulationInput): { monthly: Cents; months: number } | null {
  const { mode, targetCents, initialCents, rateBp } = input;
  if (mode === 'quanto-ter') return { monthly: input.monthlyCents!, months: input.months! };
  if (initialCents >= targetCents!) return null;
  if (mode === 'quanto-guardar') return { monthly: monthlyForTarget(targetCents!, initialCents, input.months!, rateBp), months: input.months! };
  const months = monthsForTarget(targetCents!, initialCents, input.monthlyCents!, rateBp);
  return months === null ? null : { monthly: input.monthlyCents!, months };
}

/**
 * Calcula a simulação de entradas já conferidas (validateSimulationDraft chama esta). Entradas fora dos limites ou
 * resultado acima de Number.MAX_SAFE_INTEGER: RangeError.
 */
export function simulate(input: SimulationInput): SimulationResult {
  const { mode, targetCents, initialCents, rateBp, inflationBp } = input;
  checkRate(rateBp, 'taxa');
  if (inflationBp !== null) checkRate(inflationBp, 'inflação');
  checkInt(initialCents, 'valor inicial', 0, MAX_RECORD_CENTS);
  if (mode !== 'quanto-ter') checkInt(targetCents ?? -1, 'alvo', 1, MAX_RECORD_CENTS);
  if (mode !== 'em-quanto-tempo') checkInt(input.months ?? -1, 'prazo', SIMULATE_MONTHS_MIN, SIMULATE_MONTHS_MAX);
  if (mode !== 'quanto-guardar') checkInt(input.monthlyCents ?? -1, 'valor por mês', 0, MAX_RECORD_CENTS);

  const T = SIMULATE_TEXT;
  const base = { mode, input, hypotheses: T.hypotheses(mode, rateBp, inflationBp), disclaimer: T.disclaimer };
  const empty = { monthlyWithoutYieldCents: null, monthsWithoutYield: null };
  const growthOf = (monthly: Cents, months: number) => simulateGrowth({ initial: initialCents, monthly, months, rateBp, inflationBp });
  const todayLine = (g: SimulationGrowth) => (g.todayValueCents === null || inflationBp === null ? [] : [T.todayValue(inflationBp, g.todayValueCents)]);

  if (mode !== 'quanto-ter' && initialCents >= targetCents!) {
    return {
      ...base,
      ...empty,
      reached: true,
      unreachable: false,
      monthlyCents: null,
      months: null,
      growth: null,
      texts: { intro: null, highlight: T.reached, lines: [] },
    };
  }

  if (mode === 'quanto-guardar') {
    const months = input.months!;
    const monthly = monthlyForTarget(targetCents!, initialCents, months, rateBp);
    const withoutYield = monthlyShareCents(targetCents! - initialCents, months);
    const growth = growthOf(monthly, months);
    return {
      ...base,
      ...empty,
      reached: false,
      unreachable: false,
      monthlyCents: monthly,
      monthlyWithoutYieldCents: withoutYield,
      months,
      growth,
      texts: {
        intro: T.introSave(targetCents!, months, initialCents),
        highlight: T.monthlyHighlight(monthly),
        lines: [...(monthly === 0 ? [T.initialAlone(growth.finalCents, months)] : []), T.monthlyWithoutYield(withoutYield), ...todayLine(growth)],
      },
    };
  }

  if (mode === 'em-quanto-tempo') {
    const monthly = input.monthlyCents!;
    const months = monthsForTarget(targetCents!, initialCents, monthly, rateBp);
    const withoutYield = monthsForTarget(targetCents!, initialCents, monthly, 0);
    const intro = T.introTime(targetCents!, initialCents);
    if (months === null) {
      return {
        ...base,
        reached: false,
        unreachable: true,
        monthlyCents: monthly,
        monthlyWithoutYieldCents: null,
        months: null,
        monthsWithoutYield: withoutYield,
        growth: null,
        texts: { intro, highlight: T.unreachable, lines: [] },
      };
    }
    const growth = growthOf(monthly, months);
    return {
      ...base,
      reached: false,
      unreachable: false,
      monthlyCents: monthly,
      monthlyWithoutYieldCents: null,
      months,
      monthsWithoutYield: withoutYield,
      growth,
      texts: { intro, highlight: T.timeHighlight(monthly, months, withoutYield), lines: todayLine(growth) },
    };
  }

  const months = input.months!;
  const monthly = input.monthlyCents!;
  const growth = growthOf(monthly, months);
  return {
    ...base,
    ...empty,
    reached: false,
    unreachable: false,
    monthlyCents: monthly,
    months,
    growth,
    texts: {
      intro: T.introTotal(monthly, months, initialCents),
      highlight: T.totalHighlight(growth.finalCents, months),
      lines: [T.contributed(growth.contributedCents), T.earnings(growth.earningsCents), ...todayLine(growth), T.totalWithoutYield(growth.contributedCents)],
    },
  };
}

/** Todas as linhas do resultado, na ordem da tela (abertura, destaque e demais). */
export function simulationResultLines(result: SimulationResult): string[] {
  return [...(result.texts.intro ? [result.texts.intro] : []), result.texts.highlight, ...result.texts.lines];
}

/** Mensagem de cada código, por campo. */
export function simulationErrorText(field: SimulationField, code: CalcErrorCode): string {
  return SIMULATE_ERROR_TEXT[field][code] ?? SIMULATE_ERROR_TEXT.fallback;
}

function simulationErrors(codes: Partial<Record<SimulationField, CalcErrorCode>>): Partial<Record<SimulationField, string>> {
  const out: Partial<Record<SimulationField, string>> = {};
  for (const field of SIMULATION_FIELD_ORDER) {
    const code = codes[field];
    if (code) out[field] = simulationErrorText(field, code);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Criar meta, links e entradas
// ---------------------------------------------------------------------------

/** Campos de "Nova meta" preenchidos por "Criar meta com estes valores". */
export type SimulationGoalPrefill = Pick<GoalDraft, 'goalType' | 'targetText' | 'targetMonthText' | 'initialText' | 'plannedText'>;

/**
 * "Criar meta com estes valores" (D-028(1)): alvo, prazo (MM/AAAA), já guardado e plano por mês. A taxa nunca vai para
 * a meta. Prazo = mês de hoje + n − 1: numa meta nova, o primeiro mês projetado é o atual, e o valor por mês sem
 * rendimento da meta fica igual ao do simulador. Em quanto-ter, o alvo é o valor na hipótese (em branco acima de
 * R$ 9.999.999,99). null quando já alcançou ou não alcança (o botão não aparece).
 */
export function simulationGoalPrefill(result: SimulationResult, today: IsoDate): SimulationGoalPrefill | null {
  if (result.reached || result.unreachable || result.growth === null || result.months === null) return null;
  const target = result.mode === 'quanto-ter' ? result.growth.finalCents : result.input.targetCents!;
  const monthly = result.monthlyCents ?? 0;
  return {
    goalType: 'objetivo',
    targetText: target >= 1 && target <= MAX_RECORD_CENTS ? centsToInput(target) : '',
    targetMonthText: formatMonthInputBR(addMonths(monthOf(today), result.months - 1)),
    initialText: result.input.initialCents > 0 ? centsToInput(result.input.initialCents) : '',
    plannedText: monthly > 0 ? centsToInput(monthly) : '',
  };
}

/** O que um link para /simular pode preencher (valores em centavos). A taxa nunca vem no link. */
export interface SimulationLinkValues {
  modo?: SimulationMode;
  alvoCents?: Cents;
  inicialCents?: Cents;
  meses?: number;
  mensalCents?: Cents;
  /** "calculadora", "meta", "aprender" (letras minúsculas, números e hífen, até 30). */
  origem?: string;
}

const ORIGIN = /^[a-z0-9-]{1,30}$/;

/**
 * Parâmetros de /simular?modo=&alvo=&inicial=&meses=&mensal=&origem= (centavos inteiros). Uso no app:
 * router.push({ pathname: '/simular', params: simulateLinkParams(valores) }). Valores fora dos limites ficam de fora.
 */
export function simulateLinkParams(values: SimulationLinkValues): Record<string, string> {
  const out: Record<string, string> = {};
  const money = (key: string, v: Cents | undefined, min: number) => {
    if (v !== undefined && Number.isSafeInteger(v) && v >= min && v <= MAX_RECORD_CENTS) out[key] = String(v);
  };
  if (values.modo && SIMULATION_MODES.includes(values.modo)) out.modo = values.modo;
  money('alvo', values.alvoCents, 1);
  money('inicial', values.inicialCents, 0);
  if (values.meses !== undefined && Number.isSafeInteger(values.meses) && values.meses >= SIMULATE_MONTHS_MIN && values.meses <= SIMULATE_MONTHS_MAX) {
    out.meses = String(values.meses);
  }
  money('mensal', values.mensalCents, 1);
  if (values.origem && ORIGIN.test(values.origem)) out.origem = values.origem;
  return out;
}

/**
 * Lê os parâmetros de /simular e devolve o rascunho preenchido (no formato do campo: "22.500,00", "14"). Ignora o que
 * for inválido e nunca lança. A taxa e a inflação nunca são preenchidas.
 */
export function simulatePrefill(params: RouteParams): Partial<SimulationDraft> & { origem?: string } {
  const one = (key: string): string | undefined => {
    const v = params[key];
    return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const int = (key: string, min: number, max: number): number | undefined => {
    const v = one(key);
    if (v === undefined || !/^\d{1,15}$/.test(v)) return undefined;
    const n = Number(v);
    return n >= min && n <= max ? n : undefined;
  };
  const out: Partial<SimulationDraft> & { origem?: string } = {};
  const modo = one('modo');
  if (modo && (SIMULATION_MODES as readonly string[]).includes(modo)) out.mode = modo as SimulationMode;
  const alvo = int('alvo', 1, MAX_RECORD_CENTS);
  if (alvo !== undefined) out.targetText = centsToInput(alvo);
  const inicial = int('inicial', 1, MAX_RECORD_CENTS);
  if (inicial !== undefined) out.initialText = centsToInput(inicial);
  const meses = int('meses', SIMULATE_MONTHS_MIN, SIMULATE_MONTHS_MAX);
  if (meses !== undefined) out.monthsText = String(meses);
  const mensal = int('mensal', 1, MAX_RECORD_CENTS);
  if (mensal !== undefined) out.monthlyText = centsToInput(mensal);
  const origem = one('origem');
  if (origem && ORIGIN.test(origem)) out.origem = origem;
  return out;
}

/**
 * "Simular com rendimento" na calculadora "Juntar para um objetivo": os mesmos números, sem a taxa. Modo 'prazo' da
 * calculadora (informa os meses) → quanto-guardar; modo 'mensal' (informa o valor por mês) → em-quanto-tempo.
 */
export function simulateValuesFromObjetivo(result: Pick<ObjetivoResult, 'modo' | 'alvoCents' | 'jaTemCents' | 'monthlyCents' | 'months'>): SimulationLinkValues {
  const values: SimulationLinkValues = { modo: result.modo === 'prazo' ? 'quanto-guardar' : 'em-quanto-tempo', alvoCents: result.alvoCents, origem: 'calculadora' };
  if (result.jaTemCents > 0) values.inicialCents = result.jaTemCents;
  if (result.modo === 'prazo' && result.months !== null) values.meses = result.months;
  if (result.modo === 'mensal' && result.monthlyCents !== null) values.mensalCents = result.monthlyCents;
  return values;
}

/**
 * "Simular com rendimento" no detalhe da meta: alvo, valor guardado e, com prazo a partir do primeiro mês projetado,
 * os meses até ele (quanto-guardar); sem prazo e com plano, o plano (em-quanto-tempo).
 */
export function simulateValuesFromGoal(plan: Pick<GoalPlan, 'targetCents' | 'savedCents' | 'deadline' | 'plannedMonthlyCents'>): SimulationLinkValues {
  const values: SimulationLinkValues = { modo: 'quanto-guardar', alvoCents: plan.targetCents, origem: 'meta' };
  if (plan.savedCents > 0) values.inicialCents = plan.savedCents;
  const months = plan.deadline?.months ?? 0;
  if (months >= SIMULATE_MONTHS_MIN && months <= SIMULATE_MONTHS_MAX) values.meses = months;
  else if (plan.plannedMonthlyCents !== null && plan.plannedMonthlyCents > 0) {
    values.modo = 'em-quanto-tempo';
    values.mensalCents = plan.plannedMonthlyCents;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Textos (spec2 §4.7, com os ajustes da spec3 §0 e §4 e das notas do Ciclo D)
// ---------------------------------------------------------------------------

/** Aviso fixo, visível sem rolagem em 360 px (D-028(3)). */
export const SIMULATE_DISCLAIMER = 'Simulação com as hipóteses que você informou. Não é promessa de rendimento nem recomendação de investimento.';

const RATE_RANGE_TEXT = 'Use uma taxa de 0% a 30% ao ano, com até 2 casas.';
const INFLATION_RANGE_TEXT = 'Use uma inflação de 0% a 30% ao ano, com até 2 casas.';
const LIMIT = 'O valor máximo é R$ 9.999.999,99.';

/** Mensagens por campo e código. Os exemplos são só de valores em reais e de meses: nunca uma taxa sugerida. */
export const SIMULATE_ERROR_TEXT: Readonly<Record<SimulationField, Partial<Record<CalcErrorCode, string>>>> & { fallback: string } = {
  mode: { vazio: 'Escolha o que você quer saber.' },
  targetText: {
    vazio: 'Digite quanto quer juntar, como 22.500,00.',
    invalido: 'Confira o valor, como 22.500,00.',
    zero: 'Informe um valor maior que zero, como 22.500,00.',
    acima_do_limite: LIMIT,
  },
  initialText: { invalido: 'Confira o valor, como 4.500,00.', acima_do_limite: LIMIT },
  monthsText: {
    vazio: 'Digite em quantos meses, de 1 a 600.',
    invalido: 'Use só números inteiros, como 14.',
    fora_da_faixa: 'Use um prazo de 1 a 600 meses.',
    resultado_alto: 'Com estes números, o resultado passa do que o simulador mostra. Use um valor, uma taxa ou um prazo menor.',
  },
  monthlyText: {
    vazio: 'Digite quanto vai guardar por mês, como 1.000,00.',
    invalido: 'Confira o valor, como 1.000,00.',
    zero: 'Informe um valor maior que zero, como 1.000,00.',
    acima_do_limite: LIMIT,
    resultado_alto: 'Com estes números, o resultado passa do que o simulador mostra. Use um valor, uma taxa ou um prazo menor.',
  },
  rateText: {
    vazio: 'Digite a taxa ao ano que quer testar, de 0% a 30%.',
    invalido: RATE_RANGE_TEXT,
    casas_demais: RATE_RANGE_TEXT,
    fora_da_faixa: RATE_RANGE_TEXT,
  },
  inflationText: {
    vazio: 'Digite a inflação ao ano que quer testar, de 0% a 30%.',
    invalido: INFLATION_RANGE_TEXT,
    casas_demais: INFLATION_RANGE_TEXT,
    fora_da_faixa: INFLATION_RANGE_TEXT,
  },
  fallback: 'Confira o número digitado.',
};

const brl = formatBRL;

export const SIMULATE_TEXT = {
  title: 'Simular um plano',
  intro: 'Faça contas com hipóteses suas. Nada aqui é gravado até você escolher criar uma meta.',
  modeLabel: 'O que você quer saber?',
  modes: {
    'quanto-guardar': 'Quanto guardar por mês',
    'em-quanto-tempo': 'Em quanto tempo',
    'quanto-ter': 'Quanto posso ter',
  } satisfies Record<SimulationMode, string>,
  fields: {
    target: 'Quanto quer juntar',
    initial: 'Quanto já tem (opcional)',
    months: 'Em quantos meses',
    monthsHint: 'De 1 a 600',
    monthly: 'Quanto vai guardar por mês',
    rate: 'Taxa de rendimento ao ano (%)',
    rateHint: 'Você informa a taxa que quer testar. O Clarevo não sugere taxas, produtos nem instituições.',
    inflationToggle: 'Descontar inflação? (opcional)',
    inflation: 'Inflação ao ano (%)',
    inflationHint: 'Você informa a inflação que quer testar, de 0% a 30% ao ano.',
  },
  simulateButton: 'Simular',
  hypothesesTitle: 'Hipóteses',
  disclaimer: SIMULATE_DISCLAIMER,
  reached: 'Com estes números, você já tem o valor que quer juntar.',
  unreachable: 'Com estes valores, a meta não é alcançada em 50 anos na hipótese informada. Mude o valor por mês ou quanto quer juntar.',
  chart: {
    title: 'Ano a ano',
    contributed: 'Aportado',
    earnings: 'Rendimento na hipótese',
    showTable: 'Ver tabela ano a ano',
    hideTable: 'Ocultar tabela ano a ano',
  },
  table: {
    year: 'Ano',
    contributed: 'Aportado',
    earnings: 'Rendimento na hipótese',
    total: 'Total na hipótese',
    today: 'Em dinheiro de hoje',
  },
  createGoal: 'Criar meta com estes valores',
  createGoalHint: 'A meta recebe o valor, o prazo, o que você já tem e o valor por mês. A taxa não é gravada, e o progresso só anda com o que você registrar.',
  /** Link na calculadora "Juntar para um objetivo" (e no detalhe da meta, GOALS_TEXT.detail.simulate). */
  calcLink: 'Simular com rendimento',
  /** Atalho no topo da seção "Dinheiro no tempo" de Aprender. */
  learnShortcut: 'Simular',
  learnShortcutHint: 'Quanto guardar por mês, em quanto tempo e quanto você pode ter, com hipóteses suas.',

  /** "Para juntar R$ 22.500,00 em 14 meses, começando com R$ 4.500,00:" */
  introSave: (targetCents: Cents, months: number, initialCents: Cents) =>
    `Para juntar ${brl(targetCents)} em ${monthsCount(months)}${initialCents > 0 ? `, começando com ${brl(initialCents)}` : ''}:`,
  /** "Para juntar R$ 22.500,00, começando com R$ 4.500,00:" */
  introTime: (targetCents: Cents, initialCents: Cents) =>
    `Para juntar ${brl(targetCents)}${initialCents > 0 ? `, começando com ${brl(initialCents)}` : ''}:`,
  /** "Guardando R$ 500,00 por mês por 120 meses:"; sem valor por mês: "Com R$ 4.500,00 por 14 meses, sem guardar mais nada por mês:". */
  introTotal: (monthlyCents: Cents, months: number, initialCents: Cents) =>
    monthlyCents > 0
      ? `Guardando ${brl(monthlyCents)} por mês por ${monthsCount(months)}${initialCents > 0 ? `, começando com ${brl(initialCents)}` : ''}:`
      : `Com ${brl(initialCents)} por ${monthsCount(months)}, sem guardar mais nada por mês:`,
  /** "R$ 1.175,15 por mês na hipótese informada" */
  monthlyHighlight: (monthlyCents: Cents) => `${brl(monthlyCents)} por mês na hipótese informada`,
  /** "Sem rendimento, seriam R$ 1.285,72 por mês." */
  monthlyWithoutYield: (monthlyCents: Cents) => `Sem rendimento, seriam ${brl(monthlyCents)} por mês.`,
  /** Valor por mês zero: o inicial sozinho chega lá. */
  initialAlone: (finalCents: Cents, months: number) =>
    `Na hipótese informada, o que você já tem chega a ${brl(finalCents)} em ${monthsCount(months)}, sem guardar mais nada por mês.`,
  /** "Com R$ 1.000,00 por mês: 17 meses na hipótese informada; 18 meses sem rendimento." */
  timeHighlight: (monthlyCents: Cents, months: number, monthsWithoutYield: number | null) =>
    `Com ${brl(monthlyCents)} por mês: ${monthsCount(months)} na hipótese informada; ${
      monthsWithoutYield === null ? 'sem rendimento, não alcança em 50 anos' : `${monthsCount(monthsWithoutYield)} sem rendimento`
    }.`,
  /** "Na hipótese informada: R$ 100.728,79 em 120 meses" */
  totalHighlight: (finalCents: Cents, months: number) => `Na hipótese informada: ${brl(finalCents)} em ${monthsCount(months)}`,
  /** "Total aportado: R$ 60.000,00" */
  contributed: (cents: Cents) => `Total aportado: ${brl(cents)}`,
  /** "Rendimento na hipótese: R$ 40.728,79" */
  earnings: (cents: Cents) => `Rendimento na hipótese: ${brl(cents)}`,
  /** "Sem rendimento, seriam R$ 60.000,00." */
  totalWithoutYield: (cents: Cents) => `Sem rendimento, seriam ${brl(cents)}.`,
  /** "Em dinheiro de hoje, com inflação de 4,5% ao ano: R$ 64.862,05" */
  todayValue: (inflationBp: number, cents: Cents) => `Em dinheiro de hoje, com inflação de ${formatBpCompact(inflationBp)} ao ano: ${brl(cents)}`,

  /** Hipóteses, sempre visíveis, na ordem da spec2 §4.7, mais o arredondamento do modo. */
  hypotheses: (mode: SimulationMode, rateBp: number, inflationBp: number | null): string[] => [
    rateBp === 0
      ? 'Taxa de 0% ao ano: sem rendimento.'
      : `Taxa de ${formatBpCompact(rateBp)} ao ano (${monthlyRateText(rateBp)} ao mês, taxa equivalente), constante no período.`,
    'Aportes no início de cada mês, como na Calculadora do Cidadão do Banco Central.',
    'Valores brutos, sem imposto de renda, IOF ou taxas.',
    inflationBp === null
      ? 'Sem inflação, salvo se informada.'
      : `Inflação de ${formatBpCompact(inflationBp)} ao ano (${monthlyRateText(inflationBp)} ao mês, taxa equivalente), constante no período, só para o valor em dinheiro de hoje.`,
    mode === 'quanto-guardar'
      ? 'Valor por mês arredondado para cima, no centavo; valores finais para baixo.'
      : mode === 'em-quanto-tempo'
        ? 'Prazo em meses inteiros, arredondado para cima; valores finais para baixo, no centavo.'
        : 'Valores finais arredondados para baixo, no centavo.',
  ],

  /** "Ano 1"; último ano incompleto: "Ano 2 (até o mês 14)". */
  yearLabel: (row: Pick<SimulationYear, 'year' | 'months' | 'partial'>) => (row.partial ? `Ano ${row.year} (até o mês ${row.months})` : `Ano ${row.year}`),
  /** Nome acessível de uma linha da tabela (e da barra do ano). */
  yearA11y: (row: SimulationYear) =>
    `${SIMULATE_TEXT.yearLabel(row)}: aportado ${brl(row.contributedCents)}, rendimento na hipótese ${brl(row.earningsCents)}, total ${brl(row.finalCents)}${
      row.todayValueCents === null ? '' : `, em dinheiro de hoje ${brl(row.todayValueCents)}`
    }.`,
  /** Nome acessível do gráfico. */
  chartA11y: (growth: SimulationGrowth, months: number) =>
    `Gráfico por ano, até ${monthsCount(months)}: ${brl(growth.contributedCents)} aportados e ${brl(growth.earningsCents)} de rendimento na hipótese, total de ${brl(growth.finalCents)}.`,
};
