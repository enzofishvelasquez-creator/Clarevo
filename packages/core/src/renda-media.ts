import { addMonths, formatMonthName, formatMonthYearBR, isValidIsoMonth, monthsBetween, type IsoMonth } from './dates';
import { COMMITTED_TEXT } from './committed';
import { comparisonStats, evolutionPoints, type EvolutionPoint } from './evolucao';
import type { Cents } from './money';
import { formatBRL } from './money';
import type { MonthOverview } from './records';
import type { RecordsRepository } from './repository';
import { ERROR_TEXT } from './validation';

/**
 * Renda variável (D-062 item 2, Ciclo V): "Calcular pela média" no formulário da renda de referência. A média do Recebido dos 3 ou dos 6
 * meses fechados anteriores ao mês de hoje, a partir das linhas de `months_overview` do contexto escolhido (Pessoal ou Família), com as
 * mesmas regras da Evolução (D04): entra o mês fechado com recebimentos e o mês conferido como zero (D-060, "Conferi este mês", que
 * entra com R$ 0,00); ficam de fora o mês atual (nunca está na janela) e o mês sem registros. A conta é a de `comparisonStats`
 * (`averageCents`: soma exata em bigint, metade para cima no centavo). O resultado só preenche o campo: quem grava é a pessoa, pela
 * mesma `set_income_reference` de sempre. Sem mês com recebimentos, não há média (conferir meses como zero não basta: a referência
 * precisa ser maior que zero). Sem banco, sem escrita e sem mudar nenhum total. É uma estimativa, e o texto diz isso.
 *
 * Diferente da sugestão de `suggestReference` (3 meses, sem a categoria "Reembolso"), esta usa o Recebido como a Evolução mostra, com
 * todo recebimento anotado, inclusive reembolsos; o texto diz isso.
 */

/** As janelas que a pessoa escolhe: os últimos 3 ou os últimos 6 meses fechados. */
export const INCOME_AVERAGE_CHOICES = [3, 6] as const;
export type IncomeAverageChoice = (typeof INCOME_AVERAGE_CHOICES)[number];
export const INCOME_AVERAGE_DEFAULT_CHOICE: IncomeAverageChoice = 3;

export function isIncomeAverageChoice(value: unknown): value is IncomeAverageChoice {
  return (INCOME_AVERAGE_CHOICES as readonly unknown[]).includes(value);
}

/** Os meses da janela, do mais antigo ao mês anterior ao atual: o atual nunca entra. */
export function incomeAverageWindow(currentMonth: IsoMonth, choice: IncomeAverageChoice): IsoMonth[] {
  if (!isValidIsoMonth(currentMonth)) throw new RangeError(`mês atual inválido: ${currentMonth}`);
  if (!isIncomeAverageChoice(choice)) throw new RangeError(`janela inválida: ${String(choice)}`);
  return Array.from({ length: choice }, (_, i) => addMonths(currentMonth, i - choice));
}

interface IncomeAverageBase {
  choice: IncomeAverageChoice;
  /** Os meses da janela, do mais antigo ao mais recente. */
  window: IsoMonth[];
  /** Um ponto por mês da janela (o Recebido do mês, a contagem e o estado: com registros, zero confirmado ou sem registros). */
  points: EvolutionPoint[];
  /** Os meses que não entraram: os sem registros. */
  excluded: IsoMonth[];
}

/** Há média: pelo menos um mês fechado com recebimentos. */
export interface IncomeAverageOk extends IncomeAverageBase {
  ok: true;
  /** Os meses que entraram (com registros ou conferidos como zero), do mais antigo ao mais recente. */
  included: IsoMonth[];
  /** Dos que entraram, os conferidos como zero: entram com R$ 0,00. */
  zeroConfirmed: IsoMonth[];
  /** A média em centavos inteiros, metade para cima. Sempre maior que zero. */
  averageCents: Cents;
}

/** Nenhum mês fechado com recebimentos na janela (ou só meses conferidos como zero): não há média. */
export interface IncomeAverageNone extends IncomeAverageBase {
  ok: false;
  reason: 'sem_meses';
}

export type IncomeAverageOutcome = IncomeAverageOk | IncomeAverageNone;

/**
 * A média do Recebido dos últimos `choice` meses fechados antes de `currentMonth`. `overview`: as linhas de months_overview (ou de
 * monthsOverview, no core); linhas de meses fora da janela, inclusive o mês atual, são ignoradas, e mês sem linha vale "sem registros".
 * Mês repetido, mês inválido, valor negativo ou não inteiro lançam RangeError (como `evolutionPoints`).
 * Recebido de julho, agosto e setembro em R$ 4.300,00, R$ 6.200,00 e R$ 5.100,00: média R$ 5.200,00, "3 de 3". Sem agosto: R$ 4.700,00,
 * "2 de 3". Com agosto conferido como zero: R$ 3.133,33 (9.400,00 ÷ 3, metade para cima).
 */
export function incomeAverage(overview: readonly MonthOverview[], choice: IncomeAverageChoice, currentMonth: IsoMonth): IncomeAverageOutcome {
  const window = incomeAverageWindow(currentMonth, choice);
  const rows: MonthOverview[] = [];
  for (const row of overview) {
    if (!isValidIsoMonth(row.month)) throw new RangeError(`mês inválido: ${row.month}`);
    if (window.includes(row.month)) rows.push(row);
  }
  // Mês sem linha é mês sem registros, nunca um zero conferido.
  for (const month of window) {
    if (!rows.some((r) => r.month === month)) rows.push({ month, receivedCount: 0, receivedCents: 0, paidCount: 0, paidCents: 0 });
  }
  const points = evolutionPoints(rows, 'recebido', currentMonth);
  const stats = comparisonStats(points, []);
  const excluded = points.filter((p) => p.state === 'sem_registros').map((p) => p.month);
  const base: IncomeAverageBase = { choice, window, points, excluded };
  // A referência precisa ser de pelo menos R$ 0,01: sem recebimento nenhum (só meses conferidos como zero), ou com uma média que arredonda para zero, não há valor para preencher.
  if (stats.average === null || stats.average <= 0) return { ...base, ok: false, reason: 'sem_meses' };
  const zeroConfirmed = points.filter((p) => p.state === 'zero_confirmado').map((p) => p.month);
  return { ...base, ok: true, included: stats.visibleMonths, zeroConfirmed, averageCents: stats.average };
}

/** Lê `months_overview` dos meses da janela, no contexto escolhido, e calcula. A falha da leitura passa como veio (RepoError ou de rede). */
export async function loadIncomeAverage(
  repo: Pick<RecordsRepository, 'monthsOverview'>,
  contextId: string,
  currentMonth: IsoMonth,
  choice: IncomeAverageChoice,
): Promise<IncomeAverageOutcome> {
  const window = incomeAverageWindow(currentMonth, choice);
  const overview = await repo.monthsOverview(contextId, window[0]!, window[window.length - 1]!);
  return incomeAverage(overview, choice, currentMonth);
}

// ---------------------------------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------------------------------

/** "a", "a e b", "a, b e c". */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Um mês, com o ano só quando a janela passa de um ano para outro ("novembro de 2026" e "janeiro de 2027"). */
function monthName(month: IsoMonth, withYear: boolean): string {
  return withYear ? formatMonthYearBR(month) : formatMonthName(month);
}

/**
 * Os meses em texto: "setembro", "agosto e setembro", "junho, agosto e setembro" ou, com três meses seguidos ou mais, "julho a
 * setembro". Meses salteados nunca viram um intervalo ("julho a setembro" só quando os três entraram).
 */
function monthsPhrase(months: readonly IsoMonth[], withYear: boolean, range = true): string {
  if (range && months.length >= 3 && monthsBetween(months[0]!, months[months.length - 1]!) === months.length - 1) {
    return `${monthName(months[0]!, withYear)} a ${monthName(months[months.length - 1]!, withYear)}`;
  }
  return joinList(months.map((m) => monthName(m, withYear)));
}

const capitalize = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

export const INCOME_AVERAGE_TEXT = {
  /** Antes dos botões, para quem tem renda que muda de um mês para o outro. */
  intro:
    'Se a sua renda muda de um mês para o outro, calcule a média do que você recebeu nos últimos meses fechados. O mês atual fica de fora, e os meses sem registros também, a não ser que você tenha conferido que não houve recebimentos.',
  choiceLabel: 'Meses para a média',
  choices: { 3: 'Últimos 3 meses', 6: 'Últimos 6 meses' } as Record<IncomeAverageChoice, string>,
  /** O botão. */
  action: 'Calcular pela média',
  busy: 'Calculando…',
  /** O aviso que acompanha todo resultado. */
  notice: 'É uma estimativa feita com o que você anotou. Ajuste se souber que o próximo mês será diferente.',
  /** Que valores entram na conta (diferente da sugestão acima do formulário, que deixa os reembolsos de fora). */
  basis: 'Entram todos os recebimentos anotados no mês, inclusive reembolsos.',
  /** O que o resultado faz e não faz com o campo. */
  filled: `O valor foi para o campo "${COMMITTED_TEXT.reference.amountLabel}". Ele só é salvo quando você toca em "${COMMITTED_TEXT.reference.save}".`,
  /** A leitura falhou (rede ou permissão): o botão pode ser tocado de novo. */
  failed: ERROR_TEXT.carregar_falhou,
  /** "Média de julho a setembro: R$ 5.200,00" */
  headline: (months: readonly IsoMonth[], cents: Cents, withYear: boolean): string => `Média de ${monthsPhrase(months, withYear)}: ${formatBRL(cents)}`,
  /** "Meses usados: 3 de 3" ou "Meses usados: 2 de 3, setembro sem registros ficou de fora" */
  count: (used: number, total: number, excluded: readonly IsoMonth[], withYear: boolean): string =>
    excluded.length === 0
      ? `Meses usados: ${used} de ${total}`
      : `Meses usados: ${used} de ${total}, ${monthsPhrase(excluded, withYear, false)} sem registros ${excluded.length === 1 ? 'ficou' : 'ficaram'} de fora`,
  /** "Agosto entrou com R$ 0,00 porque você conferiu que não houve recebimentos." */
  zero: (months: readonly IsoMonth[], withYear: boolean): string =>
    `${capitalize(joinList(months.map((m) => monthName(m, withYear))))} ${months.length === 1 ? 'entrou' : 'entraram'} com ${formatBRL(0)} porque você conferiu que não houve recebimentos.`,
  /** Sem mês com recebimentos: "Para calcular a média, é preciso ter pelo menos um mês fechado com recebimentos anotados. Nos últimos 3 meses (julho a setembro), nenhum mês tem." */
  empty: (choice: IncomeAverageChoice, window: readonly IsoMonth[], withYear: boolean): string =>
    `Para calcular a média, é preciso ter pelo menos um mês fechado com recebimentos anotados. Nos últimos ${choice} meses (${monthsPhrase(window, withYear)}), nenhum mês tem.`,
  /** Dito uma vez ao leitor de tela, depois de preencher o campo. */
  announce: (months: readonly IsoMonth[], cents: Cents, withYear: boolean): string =>
    `Valor por mês preenchido com ${formatBRL(cents)}, média de ${monthsPhrase(months, withYear)}.`,
} as const;

/** Os textos de um resultado, prontos para a tela. */
export interface IncomeAverageTexts {
  /** "Média de julho a setembro: R$ 5.200,00"; null sem média. */
  headline: string | null;
  /** "Meses usados: 3 de 3"; null sem média. */
  count: string | null;
  /** O mês conferido como zero que entrou; null se nenhum. */
  zero: string | null;
  /** Entram todos os recebimentos; null sem média. */
  basis: string | null;
  /** O aviso de estimativa; null sem média. */
  notice: string | null;
  /** Que o valor foi para o campo e só vale quando salvo; null sem média. */
  filled: string | null;
  /** Sem mês com recebimentos: a explicação. null com média. */
  empty: string | null;
  /** Dito uma vez ao leitor de tela; a explicação, se não há média. */
  announce: string;
}

/** O ano só aparece quando a janela vai de um ano para o outro. */
function windowCrossesYear(window: readonly IsoMonth[]): boolean {
  return window[0]!.slice(0, 4) !== window[window.length - 1]!.slice(0, 4);
}

export function incomeAverageTexts(outcome: IncomeAverageOutcome): IncomeAverageTexts {
  const T = INCOME_AVERAGE_TEXT;
  const withYear = windowCrossesYear(outcome.window);
  if (!outcome.ok) {
    const empty = T.empty(outcome.choice, outcome.window, withYear);
    return { headline: null, count: null, zero: null, basis: null, notice: null, filled: null, empty, announce: empty };
  }
  return {
    headline: T.headline(outcome.included, outcome.averageCents, withYear),
    count: T.count(outcome.included.length, outcome.window.length, outcome.excluded, withYear),
    zero: outcome.zeroConfirmed.length > 0 ? T.zero(outcome.zeroConfirmed, withYear) : null,
    basis: T.basis,
    notice: T.notice,
    filled: T.filled,
    empty: null,
    announce: T.announce(outcome.included, outcome.averageCents, withYear),
  };
}

/** Todos os textos com meses e valores de exemplo (para o teste de textos). */
export function incomeAverageTextSamples(): string[] {
  const T = INCOME_AVERAGE_TEXT;
  const strings = (Object.values(T) as unknown[]).filter((v): v is string => typeof v === 'string');
  const out: string[] = [...strings, ...Object.values(T.choices)];
  for (const withYear of [false, true]) {
    const a: IsoMonth[] = ['2026-07', '2026-08', '2026-09'];
    const b: IsoMonth[] = ['2026-12', '2027-01', '2027-02'];
    for (const months of [a, b, [a[0]!], [a[0]!, a[2]!], [a[1]!, a[2]!], [...a, '2026-11']]) {
      out.push(T.headline(months, 520_000, withYear), T.zero(months, withYear), T.announce(months, 520_000, withYear));
      out.push(T.count(months.length, 6, months, withYear), T.count(1, 3, months, withYear));
    }
    out.push(T.count(3, 3, [], withYear));
    for (const choice of INCOME_AVERAGE_CHOICES) out.push(T.empty(choice, a, withYear));
  }
  return out;
}
