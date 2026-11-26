import { formatBpCompact } from '../learn/format';
import { formatBRL, type Cents } from '../money';
import { SIMULATE_MONTHS_MAX, SIMULATE_MONTHS_MIN, SIMULATE_RATE_MAX_BP, SIMULATE_RESULT_MAX_CENTS, SIMULATE_TEXT, monthlyRateText, simulateGrowth } from '../simulate';
import { FieldReader, calcNotes, countField, monthsDuration, moneyField, rateField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney, parseOptionalMoney, parsePercentBp } from './inputs';

/**
 * Juros compostos (D-106, `docs/22_SITE.md`, seção 16): quanto um valor inicial e um valor guardado por mês podem virar, a uma taxa ao
 * ano que a própria pessoa digita. A conta é a do simulador do app ("Simular um plano", modo "Quanto posso ter", `simulate.ts`): taxa
 * mensal equivalente (1 + a)^(1/12) − 1, aportes no início de cada mês (a convenção da Calculadora do Cidadão do Banco Central), valores
 * para baixo no centavo. Por enquanto só o site mostra esta calculadora (`SITE_CALCULATORS`); o app tem a mesma conta no simulador.
 * O resultado é sempre uma estimativa, com as premissas escritas: sem imposto, sem taxas e sem inflação. Nunca sugere taxa nem produto.
 */
export type JurosCompostosField = 'inicial' | 'mensal' | 'taxaAno' | 'meses';

export interface JurosCompostosInput {
  /** Opcional. */
  inicial?: string;
  /** Zero vale, desde que haja algo em "inicial". */
  mensal: string;
  /** 0% a 30% ao ano, digitada pela pessoa. */
  taxaAno: string;
  /** 1 a 600. */
  meses: string;
}

export interface JurosCompostosResult extends CalcTexts {
  initialCents: Cents;
  monthlyCents: Cents;
  rateBp: number;
  months: number;
  /** Valor ao fim do prazo, na estimativa (para baixo). */
  finalCents: Cents;
  /** Inicial + mensal × meses: é também o resultado sem juros. */
  contributedCents: Cents;
  /** Final − guardado. */
  interestCents: Cents;
}

export const JUROS_COMPOSTOS_FIELDS: Record<JurosCompostosField, CalcFieldSpec> = {
  inicial: moneyField('Quanto já tem para começar', 'quanto já tem para começar', '4.500,00', { optional: true }),
  mensal: moneyField('Quanto vai guardar por mês', 'quanto vai guardar por mês', '500,00', {
    hint: 'Pode ser 0, se você só quer ver o valor inicial render.',
    errors: { zero: 'Informe quanto vai guardar por mês ou quanto já tem para começar.' },
  }),
  taxaAno: rateField('Taxa de rendimento ao ano (%)', 'a taxa ao ano', '10', 0, SIMULATE_RATE_MAX_BP, 'Use de 0% a 30% ao ano.', SIMULATE_TEXT.fields.rateHint),
  meses: countField('Por quantos meses', 'por quantos meses', SIMULATE_MONTHS_MIN, SIMULATE_MONTHS_MAX, 'Use de 1 a 600 meses.', 'De 1 a 600'),
};

export const JUROS_COMPOSTOS_TEXT = {
  /** "Estimativa: R$ 100.728,79 em 120 meses (10 anos)" */
  highlight: (finalCents: Cents, months: number) => `Estimativa: ${formatBRL(finalCents)} em ${monthsDuration(months)}`,
  contributed: (cents: Cents) => `Total guardado: ${formatBRL(cents)}`,
  interest: (cents: Cents) => `Juros na estimativa: ${formatBRL(cents)}`,
  note: 'É uma estimativa: na vida real a taxa muda com o tempo, e imposto, taxas e inflação mudam o resultado.',
  hypotheses: (rateBp: number, monthly: Cents): string[] => [
    rateBp === 0 ? 'Taxa de 0% ao ano: sem juros.' : `Taxa de ${formatBpCompact(rateBp)} ao ano (${monthlyRateText(rateBp)} ao mês, taxa equivalente), a mesma em todo o prazo.`,
    ...(monthly > 0 ? ['Valor de cada mês guardado no início do mês, como na Calculadora do Cidadão do Banco Central.'] : []),
    'Valores brutos, sem Imposto de Renda, IOF, taxas nem inflação.',
    'Valores arredondados para baixo, no centavo.',
  ],
} as const;

export function calcJurosCompostos(input: JurosCompostosInput): CalcOutcome<JurosCompostosResult, JurosCompostosField> {
  const r = new FieldReader<JurosCompostosField>();
  const inicial = r.read('inicial', parseOptionalMoney(input.inicial));
  const mensal = r.read('mensal', parseMoney(input.mensal, { allowZero: true }));
  const taxa = r.read('taxaAno', parsePercentBp(input.taxaAno, { min: 0, max: SIMULATE_RATE_MAX_BP }));
  const meses = r.read('meses', parseCount(input.meses, SIMULATE_MONTHS_MIN, SIMULATE_MONTHS_MAX));
  // Sem nada para começar e sem nada por mês, não há o que render (a mesma regra do simulador).
  if (mensal === 0 && inicial !== undefined && (inicial ?? 0) === 0) r.fail('mensal', 'zero');
  if (!r.ok || inicial === undefined || mensal === undefined || taxa === undefined || meses === undefined) return { ok: false, errors: r.errors };

  const initial = inicial ?? 0;
  let growth: ReturnType<typeof simulateGrowth>;
  try {
    growth = simulateGrowth({ initial, monthly: mensal, months: meses, rateBp: taxa });
  } catch {
    growth = { finalCents: Number.POSITIVE_INFINITY, contributedCents: 0, earningsCents: 0, todayValueCents: null, byYear: [] };
  }
  if (!(growth.finalCents <= SIMULATE_RESULT_MAX_CENTS)) return { ok: false, errors: { meses: 'resultado_alto' } };

  const T = JUROS_COMPOSTOS_TEXT;
  return {
    ok: true,
    result: {
      initialCents: initial,
      monthlyCents: mensal,
      rateBp: taxa,
      months: meses,
      finalCents: growth.finalCents,
      contributedCents: growth.contributedCents,
      interestCents: growth.earningsCents,
      resultLines: [T.highlight(growth.finalCents, meses), T.contributed(growth.contributedCents), T.interest(growth.earningsCents)],
      ...calcNotes(['estimate', T.note]),
      hypotheses: T.hypotheses(taxa, mensal),
    },
  };
}
