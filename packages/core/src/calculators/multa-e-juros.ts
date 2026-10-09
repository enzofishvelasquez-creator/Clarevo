import { lateChargesCents } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, countField, daysCount, moneyField, rateField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney, parsePercentBp } from './inputs';

/**
 * 4. Multa e juros por atraso (docs/08 §3.2). multa = arredonda(valor × multa); juros = arredonda(valor × juros ×
 * dias ÷ 30), simples e proporcionais (lateChargesCents). O resultado fala em "depois do vencimento".
 */
export type MultaField = 'valor' | 'multaPct' | 'jurosMesPct' | 'dias';

export interface MultaInput {
  valor: string;
  /** 0 a 20%, até 2 casas. */
  multaPct: string;
  /** 0 a 20% ao mês, até 2 casas. */
  jurosMesPct: string;
  /** 1 a 3.650. */
  dias: string;
}

export interface MultaResult extends CalcTexts {
  valorCents: Cents;
  multaBp: number;
  jurosBp: number;
  dias: number;
  fineCents: Cents;
  interestCents: Cents;
  totalCents: Cents;
}

export const MULTA_RATE_RANGE = { min: 0, max: 2_000 } as const;
export const MULTA_EXACT_TEXT = 'O valor exato é o do boleto atualizado.';

const HINT = 'Está no boleto ou no contrato.';

export const MULTA_FIELDS: Record<MultaField, CalcFieldSpec> = {
  valor: moneyField('Valor da conta', 'o valor da conta', '200,00'),
  multaPct: rateField('Multa (%)', 'a multa', '2', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use uma multa de 0% a 20%.', HINT),
  jurosMesPct: rateField('Juros ao mês (%)', 'os juros ao mês', '1', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use juros de 0% a 20% ao mês.', HINT),
  dias: countField('Dias depois do vencimento', 'quantos dias passaram do vencimento', 1, 3_650, 'Use de 1 a 3.650 dias.'),
};

export function calcMultaEJuros(input: MultaInput): CalcOutcome<MultaResult, MultaField> {
  const r = new FieldReader<MultaField>();
  const valor = r.read('valor', parseMoney(input.valor));
  const multaBp = r.read('multaPct', parsePercentBp(input.multaPct, MULTA_RATE_RANGE));
  const jurosBp = r.read('jurosMesPct', parsePercentBp(input.jurosMesPct, MULTA_RATE_RANGE));
  const dias = r.read('dias', parseCount(input.dias, 1, 3_650));
  if (!r.ok || valor === undefined || multaBp === undefined || jurosBp === undefined || dias === undefined) return { ok: false, errors: r.errors };

  const { fineCents, interestCents, totalCents } = lateChargesCents(valor, multaBp, jurosBp, dias);
  return {
    ok: true,
    result: {
      valorCents: valor,
      multaBp,
      jurosBp,
      dias,
      fineCents,
      interestCents,
      totalCents,
      resultLines: [
        `Com estes números, ${daysCount(dias)} depois do vencimento a conta fica em ${formatBRL(totalCents)}.`,
        `Multa: ${formatBRL(fineCents)}`,
        `Juros: ${formatBRL(interestCents)}`,
      ],
      hypotheses: ['Multa cobrada uma vez sobre o valor da conta.', 'Juros simples, proporcionais aos dias, com 30 dias por mês.'],
      notes: [MULTA_EXACT_TEXT],
    },
  };
}
