import type { IsoDate, IsoMonth } from './dates';
import { addDays, formatDateBR, formatMonthYearBR, monthsBetween } from './dates';
import { hasRateStep, rateSummary, type InvestmentDetails } from './investment-details';
import { estimateValueByRate, type EstimatedValue } from './investment-insights';
import type { InvestmentMovement, MarketIndices } from './investments';

/**
 * Valor pela taxa contratada com a taxa que muda numa data (D-104, item 13) e a premissa de cada estimativa do detalhe (D-104, item 4).
 *
 * E1. Sem data de fim, ou com a data ainda por vir: a estimativa de sempre (`estimateValueByRate`), pela taxa contratada.
 * E2. Com a data de fim já passada: até a data (inclusive), a taxa contratada; do dia seguinte até hoje, a taxa de depois. A conta é feita
 *     em duas partes: o valor estimado no dia seguinte à data de fim (com os aportes, resgates e rendimentos até esse dia) vira a base da
 *     segunda parte, como um valor do extrato. Se o último valor do extrato já é de depois da data de fim, só a taxa de depois conta.
 * E3. Como a estimativa de sempre: valor bruto, sem imposto, sem taxas e sem a oscilação de mercado; nunca gravado sozinho.
 */

type MovementLike = Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn'> & { createdAt?: string; id?: string };
type RateFields = Pick<InvestmentDetails, 'indexKind' | 'rateBp' | 'rateUntil' | 'rateAfterBp'>;

export interface SteppedEstimate extends EstimatedValue {
  /** A conta usou a taxa de depois da data de fim (E2). */
  stepApplied: boolean;
}

const earlierMonth = (a: IsoMonth | null, b: IsoMonth | null): IsoMonth | null => (a === null ? b : b === null ? a : monthsBetween(a, b) >= 0 ? a : b);

/** Valor de hoje pela taxa registrada, com a mudança de taxa na data de fim (E1 a E3). */
export function estimateValueWithRateStep(inv: RateFields, movements: readonly MovementLike[], indices: MarketIndices | null, today: IsoDate): SteppedEstimate | null {
  const live = movements.filter((m) => m.occurredOn <= today);
  const until = inv.rateUntil ?? null;
  const after = inv.rateAfterBp ?? null;
  if (!hasRateStep(inv) || until === null || after === null || today <= until) {
    const e = estimateValueByRate(inv, live, indices, today);
    return e ? { ...e, stepApplied: false } : null;
  }
  const lastValue = live.filter((m) => m.kind === 'valor').reduce<IsoDate | null>((a, m) => (a === null || m.occurredOn > a ? m.occurredOn : a), null);
  const second = { indexKind: inv.indexKind, rateBp: after };
  if (lastValue !== null && lastValue > until) {
    const e = estimateValueByRate(second, live, indices, today);
    return e ? { ...e, stepApplied: true } : null;
  }
  const stepDay = addDays(until, 1);
  const first = estimateValueByRate(inv, live.filter((m) => m.occurredOn <= stepDay), indices, stepDay);
  if (!first) return null;
  // A base da segunda parte vem depois de qualquer movimento do dia (o valor estimado já inclui os do dia seguinte à data de fim).
  const rest = live.filter((m) => m.occurredOn > stepDay);
  const e = estimateValueByRate(second, [{ kind: 'valor', amountCents: first.valueCents, occurredOn: stepDay, createdAt: '9999-12-31T23:59:59Z' }, ...rest], indices, today);
  if (!e) return null;
  return { valueCents: e.valueCents, baseOn: first.baseOn, projectedFrom: earlierMonth(first.projectedFrom, e.projectedFrom), lastIndexMonth: e.lastIndexMonth ?? first.lastIndexMonth, stepApplied: true };
}

/** O nome do índice para a premissa (null no prefixado, que não usa índice publicado). */
function indexName(index: InvestmentDetails['indexKind']): string | null {
  switch (index) {
    case 'cdi':
      return 'o CDI';
    case 'selic':
      return 'a Selic';
    case 'ipca':
      return 'o IPCA';
    case 'poupanca':
      return 'a rentabilidade da poupança';
    default:
      return null;
  }
}

export const ESTIMATE_PREMISE_TEXT = {
  /** "Estimativa para hoje, 07/10/2026." */
  forDay: (on: IsoDate) => `Estimativa para hoje, ${formatDateBR(on)}.`,
  /**
   * "Premissa: 105% do CDI, com o CDI publicado pelo Banco Central até setembro de 2026. Conta o rendimento desde o valor de 06/10/2026,
   * sem imposto e sem taxas." Com a data de fim: "Premissa: 120% do CDI até 31/03/2027 e 100% do CDI depois, ...".
   */
  premise: (inv: RateFields, e: EstimatedValue, example = false) => {
    const rate =
      hasRateStep(inv) && inv.rateUntil
        ? `${rateSummary(inv.indexKind, inv.rateBp)} até ${formatDateBR(inv.rateUntil)} e ${rateSummary(inv.indexKind, inv.rateAfterBp ?? null)} depois`
        : rateSummary(inv.indexKind, inv.rateBp) ?? '';
    const name = indexName(inv.indexKind);
    // Na demonstração, os índices são de exemplo (inclusive meses que ainda não vieram): a premissa diz isso, sem mês de publicação.
    const published = !name ? '' : example ? `, com ${name} de exemplo da demonstração` : e.lastIndexMonth ? `, com ${name} publicado pelo Banco Central até ${formatMonthYearBR(e.lastIndexMonth)}` : '';
    const from = e.baseOn ? `desde o valor de ${formatDateBR(e.baseOn)}` : 'desde cada aporte';
    return `Premissa: ${rate}${published}. Conta o rendimento ${from}, sem imposto e sem taxas.`;
  },
  /** O card "No vencimento" (resgate só no vencimento): a conta não projeta o rendimento até lá. */
  maturityPremise: (on: IsoDate) =>
    `Premissa: o valor de hoje, sem o rendimento que ainda pode entrar até ${formatDateBR(on)}, com a alíquota que vale nessa data.`,
  /** "Se resgatasse hoje": o valor de hoje e a alíquota de hoje. */
  todayPremise: (on: IsoDate) => `Premissa: o valor de hoje e as alíquotas de ${formatDateBR(on)}, pelo tempo de cada aporte.`,
} as const;
