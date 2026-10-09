import { MAX_RECORD_CENTS, formatBRL, roundDiv, type Cents } from '../money';
import { FieldReader, moneyField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseMoney } from './inputs';

/**
 * 2. Quanto custa por ano? (docs/08 §3.2). ano = valor × 12, × 52, ou × 22 × 12 no dia útil;
 * mês = valor × 22 no dia útil, arredonda(valor × 52 ÷ 12) na semana, ou o próprio valor.
 */
export type Frequencia = 'dia_util' | 'semana' | 'mes';
export type CustoPorAnoField = 'valor' | 'frequencia';

export interface CustoPorAnoInput {
  valor: string;
  frequencia: Frequencia | null;
}

export interface CustoPorAnoResult extends CalcTexts {
  valorCents: Cents;
  frequencia: Frequencia;
  monthlyCents: Cents;
  yearlyCents: Cents;
  /** "Anotar como gasto fixo": /gastos-fixos/novo?tipo=mensal&valor=<por mês em centavos>; null acima do limite. */
  noteParams: { tipo: 'mensal'; valor: Cents } | null;
}

export const WORKDAYS_PER_MONTH = 22;
export const WEEKS_PER_YEAR = 52;

export const CUSTO_POR_ANO_FIELDS: Record<CustoPorAnoField, CalcFieldSpec> = {
  valor: moneyField('Valor', 'o valor', '39,90'),
  frequencia: {
    label: 'Com que frequência?',
    kind: 'opcao',
    options: [
      { value: 'dia_util', label: 'Por dia útil' },
      { value: 'semana', label: 'Por semana' },
      { value: 'mes', label: 'Por mês' },
    ],
    errors: { vazio: 'Escolha a frequência.' },
  },
};

const FREQUENCIAS: readonly Frequencia[] = ['dia_util', 'semana', 'mes'];

export function calcCustoPorAno(input: CustoPorAnoInput): CalcOutcome<CustoPorAnoResult, CustoPorAnoField> {
  const r = new FieldReader<CustoPorAnoField>();
  const valor = r.read('valor', parseMoney(input.valor));
  const frequencia = input.frequencia && FREQUENCIAS.includes(input.frequencia) ? input.frequencia : r.fail('frequencia', 'vazio');
  if (!r.ok || valor === undefined || frequencia === undefined) return { ok: false, errors: r.errors };

  let monthlyCents: Cents;
  let yearlyCents: Cents;
  let hypotheses: string[];
  switch (frequencia) {
    case 'dia_util':
      monthlyCents = valor * WORKDAYS_PER_MONTH;
      yearlyCents = monthlyCents * 12;
      hypotheses = ['22 dias úteis por mês.', '12 meses por ano.'];
      break;
    case 'semana':
      monthlyCents = roundDiv(valor * WEEKS_PER_YEAR, 12);
      yearlyCents = valor * WEEKS_PER_YEAR;
      hypotheses = ['52 semanas por ano.', 'Por mês, o valor do ano dividido por 12.'];
      break;
    case 'mes':
      monthlyCents = valor;
      yearlyCents = valor * 12;
      hypotheses = ['12 meses por ano.'];
      break;
  }
  hypotheses.push('O mesmo valor em todos os períodos.');
  return {
    ok: true,
    result: {
      valorCents: valor,
      frequencia,
      monthlyCents,
      yearlyCents,
      noteParams: monthlyCents <= MAX_RECORD_CENTS ? { tipo: 'mensal', valor: monthlyCents } : null,
      resultLines: [`Com estes números, o gasto soma ${formatBRL(yearlyCents)} por ano.`, `Por mês, fica em ${formatBRL(monthlyCents)}.`],
      hypotheses,
      notes: [],
    },
  };
}
