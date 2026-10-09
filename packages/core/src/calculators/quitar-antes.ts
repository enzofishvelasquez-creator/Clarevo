import { presentValueCents } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, countField, moneyField, rateField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney, parsePercentBp } from './inputs';
import { DEBT_RATE_RANGE } from './custo-da-divida';

/**
 * 3. Quitar antes ou adiantar parcelas (docs/08 §3.2; D-034(3); spec4 §1.2). Sempre uma estimativa, nunca o valor
 * oficial da instituição. soma = parcela × k; valor presente = Σ parcela ÷ (1 + i)^t. Sem prazos, t = 1, 2, …
 * (próxima parcela em 1 mês; "as últimas N" são as de prazo restantes − N + 1 a restantes). Com prazosEmDias (um por
 * parcela restante, em ordem), t = dias ÷ 30 (antes de hoje conta como 0).
 */
export type QuitarModo = 'tudo' | 'ultimas';
export type QuitarField = 'parcela' | 'restantes' | 'taxaMes' | 'modo' | 'quantas';

export interface QuitarInput {
  parcela: string;
  /** 1 a 480. */
  restantes: string;
  /** 0,01% a 99,99% ao mês. */
  taxaMes: string;
  modo: QuitarModo | null;
  /** Só em 'ultimas': 1 a restantes. */
  quantas?: string;
  /** Dias até cada vencimento restante, em ordem; só vale quando tem exatamente `restantes` itens. */
  prazosEmDias?: readonly number[];
}

export interface QuitarResult extends CalcTexts {
  modo: QuitarModo;
  parcelaCents: Cents;
  restantes: number;
  /** Parcelas antecipadas (restantes em 'tudo'). */
  count: number;
  taxaBp: number;
  /** parcela × count. */
  sumCents: Cents;
  /** Valor estimado para pagar hoje. */
  presentValueCents: Cents;
  /** sumCents − presentValueCents. */
  discountCents: Cents;
  /** Os prazos vieram dos vencimentos da série (prazosEmDias). */
  usesDueDates: boolean;
}

/** Texto fixo (CDC art. 52 §2º; Res. CMN 5.004/2022). */
export const QUITAR_ESTIMATE_TEXT = 'Estimativa. O valor oficial é o que a instituição informar; peça o valor atualizado.';

export const QUITAR_FIELDS: Record<QuitarField, CalcFieldSpec> = {
  parcela: moneyField('Valor da parcela', 'o valor da parcela', '850,00'),
  restantes: countField('Parcelas que faltam', 'quantas parcelas faltam', 1, 480, 'Use de 1 a 480 parcelas.', 'De 1 a 480'),
  taxaMes: rateField(
    'Taxa de juros ao mês do contrato (%)',
    'a taxa ao mês do contrato',
    '1,5',
    DEBT_RATE_RANGE.min,
    DEBT_RATE_RANGE.max,
    'Use uma taxa de 0,01% a 99,99% ao mês.',
    'Está no contrato ou no extrato.',
  ),
  modo: {
    label: 'O que você quer simular?',
    kind: 'opcao',
    default: 'tudo',
    options: [
      { value: 'tudo', label: 'Quitar tudo' },
      { value: 'ultimas', label: 'Adiantar as últimas' },
    ],
    errors: { vazio: 'Escolha entre quitar tudo ou adiantar as últimas.' },
  },
  quantas: (() => {
    const spec = countField('Quantas das últimas', 'quantas parcelas adiantar', 1, 480, 'Use de 1 até o número de parcelas que faltam.');
    return { ...spec, errors: { ...spec.errors, vazio: 'Digite quantas das últimas parcelas adiantar.' } };
  })(),
};

export function calcQuitarAntes(input: QuitarInput): CalcOutcome<QuitarResult, QuitarField> {
  const r = new FieldReader<QuitarField>();
  const parcela = r.read('parcela', parseMoney(input.parcela));
  const restantes = r.read('restantes', parseCount(input.restantes, 1, 480));
  const bp = r.read('taxaMes', parsePercentBp(input.taxaMes, DEBT_RATE_RANGE));
  const modo = input.modo === 'tudo' || input.modo === 'ultimas' ? input.modo : r.fail('modo', 'vazio');
  const quantas = modo === 'ultimas' ? r.read('quantas', parseCount(input.quantas ?? '', 1, restantes ?? 480)) : undefined;
  if (!r.ok || parcela === undefined || restantes === undefined || bp === undefined || modo === undefined) return { ok: false, errors: r.errors };

  const count = modo === 'ultimas' ? quantas! : restantes;
  const days = input.prazosEmDias;
  const usesDueDates = days !== undefined && days.length === restantes && days.every((d) => Number.isFinite(d));
  const all = usesDueDates ? days.map((d) => Math.max(0, d) / 30) : Array.from({ length: restantes }, (_, k) => k + 1);
  const times = all.slice(restantes - count);
  const pv = presentValueCents(parcela, bp, times);
  const sum = parcela * count;
  const discount = sum - pv;

  const last = count === 1 ? 'a última' : `as ${count} últimas`;
  const resultLines =
    modo === 'tudo'
      ? [
          `Valor estimado para quitar hoje: ${formatBRL(pv)}`,
          `Desconto estimado sobre a soma das parcelas: ${formatBRL(discount)}`,
          `Soma ${count === 1 ? 'da parcela' : `das ${count} parcelas`}: ${formatBRL(sum)}`,
        ]
      : [
          `Valor estimado para adiantar ${last} hoje: ${formatBRL(pv)}`,
          `Desconto estimado sobre a soma das parcelas: ${formatBRL(discount)}`,
          `Soma ${count === 1 ? 'da última parcela' : `das ${count} últimas parcelas`}: ${formatBRL(sum)}`,
        ];
  return {
    ok: true,
    result: {
      modo,
      parcelaCents: parcela,
      restantes,
      count,
      taxaBp: bp,
      sumCents: sum,
      presentValueCents: pv,
      discountCents: discount,
      usesDueDates,
      resultLines,
      hypotheses: [
        usesDueDates
          ? 'Prazos contados pelos vencimentos das parcelas, com 30 dias por mês.'
          : 'Próxima parcela em 1 mês e as outras a cada mês.',
        'Juros descontados pela taxa ao mês informada, com juros compostos.',
        'Todas as parcelas com o mesmo valor, sem tarifas e IOF.',
      ],
      notes: [QUITAR_ESTIMATE_TEXT],
    },
  };
}
