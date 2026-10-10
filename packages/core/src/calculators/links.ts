import type { IsoDate } from '../dates';
import { daysBetween } from '../dates';
import { MAX_RECORD_CENTS, centsToInput, type Cents } from '../money';
import type { Commitment, CommitmentSeries } from '../records';
import { DEBT_NATURES } from '../records';
import { currentTerm, remainingInstallments } from '../series';
import type { CalcSlug } from './catalog';
import { isCalcSlug } from './catalog';
import type { Frequencia, CustoPorAnoInput } from './custo-por-ano';
import type { DividaInput, DividaTipo } from './custo-da-divida';
import type { DividirInput, DividirModo } from './dividir-contas';
import type { ObjetivoInput, ObjetivoModo } from './juntar-para-objetivo';
import type { MultaInput } from './multa-e-juros';
import type { ParceladoInput, ParceladoModo } from './parcelado-ou-a-vista';
import type { PlanoInput } from './plano-dividas';
import { PARCELADO_RANGE } from './parcelado-ou-a-vista';
import type { QuitarInput, QuitarModo } from './quitar-antes';
import type { ReservaInput } from './reserva';

/**
 * Links de contexto para as calculadoras (/calcular/[slug]?…), em parâmetros de endereço. Valores em centavos
 * inteiros (como em /gastos-fixos/novo); a taxa nunca vem no link: é sempre a pessoa que digita.
 *
 * Parâmetros: valor, parcela, parcelas, avista, dias, prazos (dias separados por vírgula, até 480), modo, total,
 * frequencia, origem. calcLinkParams monta; calcPrefill lê e valida (ignora os inválidos, nunca lança).
 */
export interface CalcInputMap {
  'parcelado-ou-a-vista': ParceladoInput;
  'custo-por-ano': CustoPorAnoInput;
  'custo-da-divida': DividaInput;
  'quitar-antes': QuitarInput;
  'multa-e-juros': MultaInput;
  'plano-dividas': PlanoInput;
  reserva: ReservaInput;
  'juntar-para-objetivo': ObjetivoInput;
  'dividir-contas': DividirInput;
}

/** O que um link pode preencher, por calculadora (valores em centavos). */
export interface CalcLinkValueMap {
  'parcelado-ou-a-vista': { modo?: ParceladoModo; avistaCents?: Cents; parcelaCents?: Cents; parcelas?: number };
  'custo-por-ano': { valorCents?: Cents; frequencia?: Frequencia };
  'custo-da-divida': { tipo?: DividaTipo; valorCents?: Cents; parcelas?: number };
  'quitar-antes': { parcelaCents?: Cents; restantes?: number; modo?: QuitarModo; prazosEmDias?: readonly number[] };
  'multa-e-juros': { valorCents?: Cents; dias?: number };
  /** Sem parâmetros: as dívidas vêm dos parcelamentos da própria tela, e a taxa é sempre digitada. */
  'plano-dividas': Record<never, never>;
  reserva: { essenciaisCents?: Cents };
  'juntar-para-objetivo': { alvoCents?: Cents; modo?: ObjetivoModo };
  'dividir-contas': { totalCents?: Cents; modo?: DividirModo };
}

/** Origem opcional do link (ex.: "serie", "conta", "familia"): letras minúsculas, números e hífen, até 30. */
export type CalcLinkValues<S extends CalcSlug> = CalcLinkValueMap[S] & { origem?: string };

/** Campos preenchidos pelo link, já no formato do campo ("1.080,00", "10"), mais a origem. */
export type CalcPrefill<S extends CalcSlug> = Partial<CalcInputMap[S]> & { origem?: string };

export type RouteParams = Record<string, string | string[] | undefined>;

export const PRAZOS_MAX = 480;
const DAYS_MAX = 36_500;
const ORIGIN = /^[a-z0-9-]{1,30}$/;

const put = (out: Record<string, string>, key: string, value: number | string | undefined) => {
  if (value !== undefined) out[key] = String(value);
};

/**
 * Parâmetros de endereço para abrir a calculadora preenchida. Uso no app:
 * router.push({ pathname: '/calcular/[slug]', params: { slug, ...calcLinkParams(slug, valores) } }).
 * Prazos negativos (vencimento já passou) viram 0.
 */
export function calcLinkParams<S extends CalcSlug>(slug: S, values: CalcLinkValues<S>): Record<string, string> {
  const out: Record<string, string> = {};
  const v = values as CalcLinkValues<CalcSlug> & Record<string, unknown>;
  switch (slug) {
    case 'parcelado-ou-a-vista': {
      const x = v as CalcLinkValueMap['parcelado-ou-a-vista'];
      put(out, 'modo', x.modo);
      put(out, 'avista', x.avistaCents);
      put(out, 'parcela', x.parcelaCents);
      put(out, 'parcelas', x.parcelas);
      break;
    }
    case 'custo-por-ano': {
      const x = v as CalcLinkValueMap['custo-por-ano'];
      put(out, 'valor', x.valorCents);
      put(out, 'frequencia', x.frequencia);
      break;
    }
    case 'custo-da-divida': {
      const x = v as CalcLinkValueMap['custo-da-divida'];
      put(out, 'modo', x.tipo);
      put(out, 'valor', x.valorCents);
      put(out, 'parcelas', x.parcelas);
      break;
    }
    case 'quitar-antes': {
      const x = v as CalcLinkValueMap['quitar-antes'];
      put(out, 'parcela', x.parcelaCents);
      put(out, 'parcelas', x.restantes);
      put(out, 'modo', x.modo);
      if (x.prazosEmDias && x.prazosEmDias.length > 0) out.prazos = x.prazosEmDias.map((d) => Math.max(0, Math.round(d))).join(',');
      break;
    }
    case 'multa-e-juros': {
      const x = v as CalcLinkValueMap['multa-e-juros'];
      put(out, 'valor', x.valorCents);
      put(out, 'dias', x.dias);
      break;
    }
    case 'plano-dividas':
      break;
    case 'reserva':
      put(out, 'valor', (v as CalcLinkValueMap['reserva']).essenciaisCents);
      break;
    case 'juntar-para-objetivo': {
      const x = v as CalcLinkValueMap['juntar-para-objetivo'];
      put(out, 'total', x.alvoCents);
      put(out, 'modo', x.modo);
      break;
    }
    case 'dividir-contas': {
      const x = v as CalcLinkValueMap['dividir-contas'];
      put(out, 'total', x.totalCents);
      put(out, 'modo', x.modo);
      break;
    }
  }
  put(out, 'origem', v.origem);
  return out;
}

function first(params: RouteParams, key: string): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim() : undefined;
}

/** Centavos de 1 até MAX_RECORD_CENTS → texto do campo ("1.080,00"); inválido: undefined. */
function money(params: RouteParams, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = first(params, key);
    if (value === undefined) continue;
    if (!/^\d{1,10}$/.test(value)) return undefined;
    const cents = Number(value);
    return cents >= 1 && cents <= MAX_RECORD_CENTS ? centsToInput(cents) : undefined;
  }
  return undefined;
}

function count(params: RouteParams, key: string, min: number, max: number): string | undefined {
  const value = first(params, key);
  if (value === undefined || !/^\d{1,6}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? String(n) : undefined;
}

function oneOf<T extends string>(params: RouteParams, key: string, options: readonly T[]): T | undefined {
  const value = first(params, key);
  return options.find((o) => o === value);
}

function daysList(params: RouteParams): number[] | undefined {
  const value = first(params, 'prazos');
  if (value === undefined || !/^\d{1,5}(,\d{1,5})*$/.test(value)) return undefined;
  const list = value.split(',').map(Number);
  return list.length <= PRAZOS_MAX && list.every((d) => d <= DAYS_MAX) ? list : undefined;
}

/** Tira as chaves sem valor (para os testes de ida e volta compararem só o que veio). */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Lê os parâmetros do endereço e devolve só os campos válidos, no formato do campo. Nunca lança: parâmetro inválido
 * ou desconhecido é ignorado; calculadora desconhecida devolve {}.
 * - parcelado-ou-a-vista: modo (compra | cota-unica), avista, parcela (ou valor), parcelas (2 a 480; 2 a 12 na cota única);
 * - custo-por-ano: valor, frequencia (dia_util | semana | mes);
 * - custo-da-divida: modo (rotativo | cheque_especial | emprestimo → tipo), valor, parcelas (1 a 120);
 * - quitar-antes: parcela (ou valor), parcelas (→ restantes, 1 a 480), modo (tudo | ultimas), prazos (→ prazosEmDias;
 *   sem parcelas, restantes = quantidade de prazos; com quantidade diferente, os prazos são ignorados);
 * - multa-e-juros: valor, dias (1 a 3.650);
 * - plano-dividas: nenhum (as dívidas vêm dos parcelamentos da própria tela);
 * - reserva: valor (→ essenciais);
 * - juntar-para-objetivo: total ou valor (→ alvo), modo (prazo | mensal);
 * - dividir-contas: total ou valor, modo (iguais | renda).
 */
export function calcPrefill<S extends CalcSlug>(slug: S, params: RouteParams): CalcPrefill<S>;
export function calcPrefill(slug: string, params: RouteParams): CalcPrefill<CalcSlug>;
export function calcPrefill(slug: string, params: RouteParams): CalcPrefill<CalcSlug> {
  try {
    if (!isCalcSlug(slug)) return {};
    const origemRaw = first(params, 'origem');
    const origem = origemRaw !== undefined && ORIGIN.test(origemRaw) ? origemRaw : undefined;
    let out: Record<string, unknown>;
    switch (slug) {
      case 'parcelado-ou-a-vista': {
        const modo = oneOf(params, 'modo', ['compra', 'cota-unica'] as const);
        const range = PARCELADO_RANGE[modo ?? 'compra'];
        out = { modo, aVista: money(params, 'avista'), parcela: money(params, 'parcela', 'valor'), parcelas: count(params, 'parcelas', range.min, range.max) };
        break;
      }
      case 'custo-por-ano':
        out = { valor: money(params, 'valor'), frequencia: oneOf(params, 'frequencia', ['dia_util', 'semana', 'mes'] as const) };
        break;
      case 'custo-da-divida':
        out = {
          tipo: oneOf(params, 'modo', ['rotativo', 'cheque_especial', 'emprestimo'] as const),
          valor: money(params, 'valor'),
          parcelas: count(params, 'parcelas', 1, 120),
        };
        break;
      case 'quitar-antes': {
        let restantes = count(params, 'parcelas', 1, PRAZOS_MAX);
        let prazos = daysList(params);
        if (prazos && restantes === undefined && first(params, 'parcelas') === undefined) restantes = String(prazos.length);
        if (prazos && Number(restantes) !== prazos.length) prazos = undefined;
        out = { parcela: money(params, 'parcela', 'valor'), restantes, modo: oneOf(params, 'modo', ['tudo', 'ultimas'] as const), prazosEmDias: prazos };
        break;
      }
      case 'multa-e-juros':
        out = { valor: money(params, 'valor'), dias: count(params, 'dias', 1, 3_650) };
        break;
      case 'plano-dividas':
        out = {};
        break;
      case 'reserva':
        out = { essenciais: money(params, 'valor') };
        break;
      case 'juntar-para-objetivo':
        out = { alvo: money(params, 'total', 'valor'), modo: oneOf(params, 'modo', ['prazo', 'mensal'] as const) };
        break;
      case 'dividir-contas':
        out = { total: money(params, 'total', 'valor'), modo: oneOf(params, 'modo', ['iguais', 'renda'] as const) };
        break;
    }
    return compact({ ...out, origem }) as CalcPrefill<CalcSlug>;
  } catch {
    return {};
  }
}

/**
 * "Quanto economizo se quitar antes?" no detalhe de um parcelamento de financiamento ou compra parcelada com parcelas
 * em aberto: valor da próxima parcela, quantas faltam e os dias até cada vencimento (as já vencidas contam 0).
 * Mesmas listas de installmentProgress. Outros tipos (gasto fixo, conta do ano, imposto ou outro parcelamento),
 * sem término ou sem parcelas faltando: null.
 */
export function quitarAntesLink(
  s: Pick<CommitmentSeries, 'id' | 'kind' | 'nature' | 'firstDueMonth' | 'firstNumber' | 'lastNumber' | 'partsPerYear' | 'terms' | 'skippedNumbers'> &
    Partial<Pick<CommitmentSeries, 'paidCount' | 'openCount'>>,
  occurrences: readonly Commitment[],
  open: readonly Commitment[],
  today: IsoDate,
): CalcLinkValues<'quitar-antes'> | null {
  if (s.kind !== 'parcelada' || !DEBT_NATURES.includes(s.nature)) return null;
  const items = remainingInstallments(s, occurrences, open, today);
  if (!items || items.length === 0 || items.length > PRAZOS_MAX) return null;
  return {
    parcelaCents: items[0]!.amountCents,
    restantes: items.length,
    prazosEmDias: items.map((x) => Math.max(0, daysBetween(today, x.dueOn))),
    origem: 'serie',
  };
}

/** "Calcular multa e juros" numa conta vencida em aberto: valor previsto e dias depois do vencimento (até 3.650). */
export function multaLink(c: Pick<Commitment, 'status' | 'dueOn' | 'amountCents'>, today: IsoDate): CalcLinkValues<'multa-e-juros'> | null {
  if (c.status !== 'aberto' || c.dueOn >= today) return null;
  return { valorCents: c.amountCents, dias: Math.min(daysBetween(c.dueOn, today), 3_650), origem: 'conta' };
}

/**
 * "Cota única ou parcelado? Fazer a conta" no detalhe de uma conta do ano: com parcelas, o número de parcelas e o valor
 * de referência de cada uma; com cota única, o valor como cota única. Outros tipos: null.
 */
export function cotaUnicaLink(
  s: Pick<CommitmentSeries, 'kind' | 'firstDueMonth' | 'firstNumber' | 'lastNumber' | 'partsPerYear' | 'terms'>,
  today: IsoDate,
): CalcLinkValues<'parcelado-ou-a-vista'> | null {
  if (s.kind !== 'anual' || s.partsPerYear === null) return null;
  const amount = currentTerm(s, today).amountCents;
  return s.partsPerYear >= 2
    ? { modo: 'cota-unica', parcelas: s.partsPerYear, parcelaCents: amount, origem: 'serie' }
    : { modo: 'cota-unica', avistaCents: amount, origem: 'serie' };
}

/** "Quanto custa por ano?" no detalhe de um gasto fixo mensal: valor atual, frequência mês. Outros tipos: null. */
export function custoPorAnoLink(
  s: Pick<CommitmentSeries, 'kind' | 'firstDueMonth' | 'firstNumber' | 'lastNumber' | 'partsPerYear' | 'terms'>,
  today: IsoDate,
): CalcLinkValues<'custo-por-ano'> | null {
  if (s.kind !== 'mensal') return null;
  return { valorCents: currentTerm(s, today).amountCents, frequencia: 'mes', origem: 'serie' };
}
