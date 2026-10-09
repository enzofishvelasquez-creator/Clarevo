import { monthlyShareCents, monthsToReach } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, countField, monthsDuration, moneyField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney, parseOptionalMoney } from './inputs';

/**
 * 7. Juntar para um objetivo (docs/08 §3.2). falta = alvo − já tem; por mês = teto(falta ÷ meses);
 * prazo = teto(falta ÷ por mês). Sem rendimento, dito na hipótese.
 */
export type ObjetivoModo = 'prazo' | 'mensal';
export type ObjetivoField = 'alvo' | 'jaTem' | 'modo' | 'meses' | 'mensal';

export interface ObjetivoInput {
  alvo: string;
  /** Opcional. */
  jaTem?: string;
  modo: ObjetivoModo | null;
  /** Modo 'prazo': 1 a 600. */
  meses?: string;
  /** Modo 'mensal'. */
  mensal?: string;
}

export interface ObjetivoResult extends CalcTexts {
  modo: ObjetivoModo;
  alvoCents: Cents;
  jaTemCents: Cents;
  /** alvo − já tem, nunca negativo. */
  missingCents: Cents;
  /** Já tem o valor do objetivo. */
  reached: boolean;
  /** Por mês (calculado no modo 'prazo', informado no modo 'mensal'); null quando já tem o valor. */
  monthlyCents: Cents | null;
  /** Meses (informado no modo 'prazo', calculado no modo 'mensal'); null quando já tem o valor. */
  months: number | null;
}

export const OBJETIVO_FIELDS: Record<ObjetivoField, CalcFieldSpec> = {
  alvo: moneyField('Quanto quer juntar', 'quanto quer juntar', '22.500,00'),
  jaTem: moneyField('Quanto já tem', 'quanto já tem', '4.500,00', { optional: true }),
  modo: {
    label: 'O que você quer saber?',
    kind: 'opcao',
    default: 'prazo',
    options: [
      { value: 'prazo', label: 'Quanto guardar por mês' },
      { value: 'mensal', label: 'Em quanto tempo' },
    ],
    errors: { vazio: 'Escolha o que você quer saber.' },
  },
  meses: countField('Em quantos meses', 'em quantos meses', 1, 600, 'Use de 1 a 600 meses.', 'De 1 a 600'),
  mensal: moneyField('Quanto vai guardar por mês', 'quanto vai guardar por mês', '1.000,00'),
};

export function calcJuntarParaObjetivo(input: ObjetivoInput): CalcOutcome<ObjetivoResult, ObjetivoField> {
  const r = new FieldReader<ObjetivoField>();
  const alvo = r.read('alvo', parseMoney(input.alvo));
  const jaTem = r.read('jaTem', parseOptionalMoney(input.jaTem));
  const modo = input.modo === 'prazo' || input.modo === 'mensal' ? input.modo : r.fail('modo', 'vazio');
  const meses = modo === 'prazo' ? r.read('meses', parseCount(input.meses ?? '', 1, 600)) : undefined;
  const mensal = modo === 'mensal' ? r.read('mensal', parseMoney(input.mensal ?? '')) : undefined;
  if (!r.ok || alvo === undefined || jaTem === undefined || modo === undefined) return { ok: false, errors: r.errors };

  const has = jaTem ?? 0;
  const missing = Math.max(0, alvo - has);
  const base = { modo, alvoCents: alvo, jaTemCents: has, missingCents: missing };
  const hypotheses = ['Sem rendimento: o valor guardado não cresce com juros.', 'O mesmo valor guardado todo mês.'];

  if (missing === 0) {
    return {
      ok: true,
      result: { ...base, reached: true, monthlyCents: null, months: null, resultLines: ['Com estes números, você já tem o valor do objetivo.'], hypotheses, notes: [] },
    };
  }
  const faltam = `Faltam ${formatBRL(missing)} para chegar a ${formatBRL(alvo)}.`;
  if (modo === 'prazo') {
    const monthly = monthlyShareCents(missing, meses!);
    return {
      ok: true,
      result: {
        ...base,
        reached: false,
        monthlyCents: monthly,
        months: meses!,
        resultLines: [`Com estes números, são ${formatBRL(monthly)} por mês, por ${monthsDuration(meses!)}.`, faltam],
        hypotheses: [...hypotheses, 'Valor por mês arredondado para cima, no centavo.'],
        notes: [],
      },
    };
  }
  const months = monthsToReach(missing, mensal!);
  return {
    ok: true,
    result: {
      ...base,
      reached: false,
      monthlyCents: mensal!,
      months,
      resultLines: [`Com estes números, guardando ${formatBRL(mensal!)} por mês, você chega lá em ${monthsDuration(months)}.`, faltam],
      hypotheses: [...hypotheses, ...(missing % mensal! === 0 ? [] : ['No último mês, falta menos que o valor de cada mês.'])],
      notes: [],
    },
  };
}
