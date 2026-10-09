import { formatBp, formatBpCompact } from '../learn/format';
import { compoundTotalBig, equivalentAnnualBp, installmentCents } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, countField, monthsCount, moneyField, rateField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney, parsePercentBp } from './inputs';

/**
 * 2. Quanto custa uma dívida? (docs/08 §3.2; spec4 §1.2).
 * - Rotativo: 1 ciclo só (até a fatura seguinte); depois, "E se parcelar a fatura?" com taxa e parcelas (1 a 24),
 *   e juros e encargos limitados ao valor original (total máximo = 2 × valor, sem o IOF).
 * - Cheque especial: juros compostos por 1 a 24 meses; acima de 8% ao mês, o aviso do teto.
 * - Empréstimo: parcela pela tabela Price, de 1 a 120 parcelas, com o lembrete do CET.
 */
export type DividaTipo = 'rotativo' | 'cheque_especial' | 'emprestimo';
export type DividaField = 'tipo' | 'valor' | 'taxaMes' | 'meses' | 'parcelas';
export type ParcelarFaturaField = 'parcelarTaxaMes' | 'parcelarParcelas';

export interface DividaInput {
  tipo: DividaTipo | null;
  valor: string;
  /** 0,01% a 99,99% ao mês. */
  taxaMes: string;
  /** Cheque especial: 1 a 24. */
  meses?: string;
  /** Empréstimo: 1 a 120. */
  parcelas?: string;
  /** Rotativo, "E se parcelar a fatura?" (opcional; os dois em branco: sem simulação). */
  parcelarTaxaMes?: string;
  /** Rotativo: 1 a 24. */
  parcelarParcelas?: string;
}

export interface ParcelarFaturaResult extends CalcTexts {
  parcelas: number;
  taxaBp: number;
  installmentCents: Cents;
  /** Parcelas × valor, sem o limite. */
  totalCents: Cents;
  /** Total − valor original (juros e encargos do rotativo e do parcelamento). */
  chargesCents: Cents;
  /** O limite da Lei 14.690/2023 foi aplicado (juros e encargos acima do valor original). */
  limited: boolean;
  /** min(total, 2 × valor original). */
  cappedTotalCents: Cents;
}

export interface DividaResult extends CalcTexts {
  tipo: DividaTipo;
  valorCents: Cents;
  taxaBp: number;
  annualBp: number;
  /** Rotativo: valor na fatura seguinte; cheque especial: total no fim do prazo; empréstimo: parcelas × parcela. */
  totalCents: Cents;
  interestCents: Cents;
  /** Empréstimo: valor de cada parcela. */
  installmentCents: Cents | null;
  /** Cheque especial: taxa acima do teto de 8% ao mês. */
  aboveCap: boolean;
  /** Só no rotativo, com algum campo de "E se parcelar a fatura?" preenchido. */
  parcelamento: CalcOutcome<ParcelarFaturaResult, ParcelarFaturaField> | null;
}

export const DIVIDA_TIPOS: readonly DividaTipo[] = ['rotativo', 'cheque_especial', 'emprestimo'];
/** Teto do cheque especial: 8% ao mês (Res. CMN 4.765/2019). */
export const CHEQUE_ESPECIAL_CAP_BP = 800;
export const DEBT_RATE_RANGE = { min: 1, max: 9_999 } as const;

const RATE_RANGE_TEXT = 'Use uma taxa de 0,01% a 99,99% ao mês.';
const RATE_HINT = 'Está na fatura, no extrato ou no contrato.';

export const DIVIDA_TEXT = {
  parcelarTitle: 'E se parcelar a fatura?',
  chequeCapNote: 'A taxa informada passa do teto de 8% ao mês do cheque especial (Res. CMN 4.765/2019). Confira o extrato.',
  cetNote: 'O CET do contrato inclui tarifas, seguros e IOF, e pode ser maior que a taxa de juros. Confira o CET no contrato.',
} as const;

export const DIVIDA_FIELDS: Record<DividaField | ParcelarFaturaField, CalcFieldSpec> = {
  tipo: {
    label: 'Tipo de dívida',
    kind: 'opcao',
    options: [
      { value: 'rotativo', label: 'Rotativo do cartão' },
      { value: 'cheque_especial', label: 'Cheque especial' },
      { value: 'emprestimo', label: 'Empréstimo ou outra dívida' },
    ],
    errors: { vazio: 'Escolha o tipo de dívida.' },
  },
  valor: moneyField('Valor da dívida', 'o valor da dívida', '1.000,00'),
  taxaMes: rateField('Taxa de juros ao mês (%)', 'a taxa ao mês', '2,5', DEBT_RATE_RANGE.min, DEBT_RATE_RANGE.max, RATE_RANGE_TEXT, RATE_HINT),
  meses: countField('Por quantos meses', 'o número de meses', 1, 24, 'Use de 1 a 24 meses.', 'De 1 a 24'),
  parcelas: countField('Número de parcelas', 'o número de parcelas', 1, 120, 'Use de 1 a 120 parcelas.', 'De 1 a 120'),
  parcelarTaxaMes: rateField(
    'Taxa do parcelamento ao mês (%)',
    'a taxa do parcelamento ao mês',
    '8',
    DEBT_RATE_RANGE.min,
    DEBT_RATE_RANGE.max,
    RATE_RANGE_TEXT,
    'Está na fatura.',
  ),
  parcelarParcelas: countField('Em quantas parcelas', 'o número de parcelas', 1, 24, 'Use de 1 a 24 parcelas.', 'De 1 a 24'),
};

const parcelasText = (n: number) => (n === 1 ? '1 parcela' : `${n} parcelas`);

function parcelarFatura(valor: Cents, saldo: Cents, input: DividaInput): CalcOutcome<ParcelarFaturaResult, ParcelarFaturaField> | null {
  const rateText = input.parcelarTaxaMes ?? '';
  const countText = input.parcelarParcelas ?? '';
  if (rateText.trim() === '' && countText.trim() === '') return null;
  const r = new FieldReader<ParcelarFaturaField>();
  const bp = r.read('parcelarTaxaMes', parsePercentBp(rateText, DEBT_RATE_RANGE));
  const n = r.read('parcelarParcelas', parseCount(countText, 1, 24));
  if (!r.ok || bp === undefined || n === undefined) return { ok: false, errors: r.errors };
  const inst = installmentCents(saldo, bp, n);
  const totalCents = inst * n;
  const chargesCents = totalCents - valor;
  const limited = chargesCents > valor;
  const cappedTotalCents = limited ? 2 * valor : totalCents;
  const head = `Parcelar em ${n} × ${formatBRL(inst)} a ${formatBpCompact(bp)} ao mês`;
  const resultLines = limited
    ? [
        `${head} somaria ${formatBRL(totalCents)}.`,
        `Pelo limite da Lei 14.690/2023, juros e encargos não passam do valor original: o total fica em no máximo ${formatBRL(cappedTotalCents)}.`,
      ]
    : [
        `${head} soma ${formatBRL(totalCents)}.`,
        `São ${formatBRL(chargesCents)} de juros e encargos sobre o valor original, dentro do limite da Lei 14.690/2023.`,
      ];
  return {
    ok: true,
    result: {
      parcelas: n,
      taxaBp: bp,
      installmentCents: inst,
      totalCents,
      chargesCents,
      limited,
      cappedTotalCents,
      resultLines,
      hypotheses: [
        `Parcelamento do valor da fatura seguinte (${formatBRL(saldo)}), em parcelas iguais (tabela Price).`,
        'O limite vale para juros e encargos do rotativo e do parcelamento somados, sem o IOF (Lei 14.690/2023 e Res. CMN 5.112/2023).',
      ],
      notes: [],
    },
  };
}

export function calcCustoDaDivida(input: DividaInput): CalcOutcome<DividaResult, DividaField> {
  const r = new FieldReader<DividaField>();
  const tipo = input.tipo && DIVIDA_TIPOS.includes(input.tipo) ? input.tipo : r.fail('tipo', 'vazio');
  const valor = r.read('valor', parseMoney(input.valor));
  const bp = r.read('taxaMes', parsePercentBp(input.taxaMes, DEBT_RATE_RANGE));
  const meses = tipo === 'cheque_especial' ? r.read('meses', parseCount(input.meses ?? '', 1, 24)) : undefined;
  const parcelas = tipo === 'emprestimo' ? r.read('parcelas', parseCount(input.parcelas ?? '', 1, 120)) : undefined;
  if (!r.ok || tipo === undefined || valor === undefined || bp === undefined) return { ok: false, errors: r.errors };

  const annualBp = equivalentAnnualBp(bp);
  const annualLine = `Isso equivale a ${formatBp(annualBp)} ao ano.`;
  const base = { tipo, valorCents: valor, taxaBp: bp, annualBp, aboveCap: false, parcelamento: null, installmentCents: null };

  if (tipo === 'rotativo') {
    const saldo = Number(compoundTotalBig(valor, bp, 1));
    const juros = saldo - valor;
    return {
      ok: true,
      result: {
        ...base,
        totalCents: saldo,
        interestCents: juros,
        parcelamento: parcelarFatura(valor, saldo, input),
        resultLines: [
          `Com estes números, os juros do rotativo somam ${formatBRL(juros)} em 1 mês.`,
          `O valor vai para ${formatBRL(saldo)} na fatura seguinte.`,
          annualLine,
        ],
        hypotheses: ['Rotativo por 1 ciclo, até a fatura seguinte (Res. CMN 4.549/2017).', 'Juros compostos, sem IOF, multa ou tarifas.'],
        notes: [],
      },
    };
  }

  if (tipo === 'cheque_especial') {
    if (meses === undefined) return { ok: false, errors: r.errors };
    const total = compoundTotalBig(valor, bp, meses);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, errors: { meses: 'resultado_alto' } };
    const totalCents = Number(total);
    const aboveCap = bp > CHEQUE_ESPECIAL_CAP_BP;
    return {
      ok: true,
      result: {
        ...base,
        aboveCap,
        totalCents,
        interestCents: totalCents - valor,
        resultLines: [
          `Com estes números, a dívida vai a ${formatBRL(totalCents)} em ${monthsCount(meses)}.`,
          `Juros: ${formatBRL(totalCents - valor)}`,
          annualLine,
        ],
        hypotheses: ['Juros compostos, mês a mês, sem pagamentos no período.', 'Sem IOF e tarifas.'],
        notes: aboveCap ? [DIVIDA_TEXT.chequeCapNote] : [],
      },
    };
  }

  if (parcelas === undefined) return { ok: false, errors: r.errors };
  const inst = installmentCents(valor, bp, parcelas);
  const totalCents = inst * parcelas;
  return {
    ok: true,
    result: {
      ...base,
      installmentCents: inst,
      totalCents,
      interestCents: totalCents - valor,
      resultLines: [
        `Com estes números, ${parcelas === 1 ? 'é' : 'são'} ${parcelasText(parcelas)} de ${formatBRL(inst)}.`,
        `Total: ${formatBRL(totalCents)}, com ${formatBRL(totalCents - valor)} de juros.`,
        annualLine,
      ],
      hypotheses: ['Parcelas iguais (tabela Price), a primeira 1 mês depois.', 'Só a taxa de juros informada, sem tarifas, seguros e IOF.'],
      notes: [DIVIDA_TEXT.cetNote],
    },
  };
}
