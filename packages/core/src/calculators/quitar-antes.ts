import { presentValueCents } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, countField, moneyField, rateField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney, parsePercentBp } from './inputs';

/**
 * 4. Quitar antes ou adiantar parcelas (docs/08 §3.2; D-034(3); spec4 §1.2). Sempre uma estimativa, nunca o valor
 * oficial da instituição. soma = parcela × k; valor presente = Σ parcela ÷ (1 + i)^t. Sem prazos, t = 1, 2, …
 * (próxima parcela em 1 mês; "as últimas N" são as de prazo restantes − N + 1 a restantes). Com prazosEmDias (um por
 * parcela restante, em ordem), t = dias ÷ 30, uma convenção.
 *
 * Revisão externa de 18/11/2026:
 * - a taxa pedida é a taxa efetiva de juros ao mês do contrato, não o CET, e pode ser 0% (desconto zero);
 * - parcelas vencidas (dias negativos, vindas do detalhe do parcelamento) ficam fora do valor presente: não ganham desconto fictício,
 *   aparecem à parte, sem multa e juros (que a instituição soma), e o resultado não se apresenta como quitação completa;
 * - a conta vale para parcelas e taxa fixas: SAC, contratos corrigidos por índice, seguros variáveis ou parcelas diferentes não são
 *   reproduzidos, e a hipótese diz isso; adiantar as últimas encurta o prazo, não reduz a parcela.
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
  /** Dias até cada vencimento restante, em ordem (negativo: parcela vencida); só vale quando tem exatamente `restantes` itens. */
  prazosEmDias?: readonly number[];
}

export interface QuitarResult extends CalcTexts {
  modo: QuitarModo;
  parcelaCents: Cents;
  restantes: number;
  /** Parcelas a vencer que entram na conta (as escolhidas, sem as vencidas). */
  count: number;
  taxaBp: number;
  /** parcela × count (só as a vencer). */
  sumCents: Cents;
  /** Valor estimado para pagar hoje as parcelas a vencer escolhidas. */
  presentValueCents: Cents;
  /** sumCents − presentValueCents. */
  discountCents: Cents;
  /** Os prazos vieram dos vencimentos da série (prazosEmDias). */
  usesDueDates: boolean;
  /** Parcelas escolhidas que já venceram: ficam fora do valor presente, sem desconto e sem multa e juros calculados. */
  overdueCount: number;
  /** parcela × overdueCount, sem multa e juros. */
  overdueSumCents: Cents;
}

/** Taxa de 0% (desconto zero) a 99,99% ao mês. */
export const QUITAR_RATE_RANGE = { min: 0, max: 9_999 } as const;

/** Hipóteses fixas (revisão externa de 18/11/2026). */
export const QUITAR_TEXT = {
  rate: 'Juros descontados pela taxa efetiva de juros ao mês do contrato, com juros compostos.',
  zeroRate: 'Taxa de 0%: não há juros a descontar, e o valor para pagar hoje é a soma das parcelas.',
  fixed:
    'Parcelas e taxa fixas, sem tarifas e IOF. Em contratos pela tabela SAC, corrigidos por índice (como IPCA ou TR), com seguros variáveis ou parcelas diferentes, o valor da instituição pode ser bem diferente.',
  last: 'Adiantar as últimas encurta o prazo: as parcelas que continuam ficam com o mesmo valor. Reduzir o valor da parcela, em vez do prazo, depende do contrato.',
  dueDates: 'Prazos contados pelos vencimentos das parcelas, com 30 dias por mês, uma convenção: a instituição pode contar os dias de outro jeito.',
  monthly: 'Próxima parcela em 1 mês e as outras a cada mês.',
  overdue: (count: number, sumCents: Cents) =>
    `Fora desta conta: ${count === 1 ? '1 parcela vencida' : `${count} parcelas vencidas`} (${formatBRL(sumCents)}, sem multa e juros). A instituição soma os encargos delas; por isso, este valor não é a quitação completa.`,
  allOverdue: 'Todas as parcelas escolhidas já venceram: não há desconto a estimar. O valor delas, com multa e juros, é o que a instituição informar.',
} as const;

/** Texto fixo (CDC art. 52 §2º; Res. CMN 5.004/2022). */
export const QUITAR_ESTIMATE_TEXT = 'Estimativa. O valor oficial é o que a instituição informar; peça o valor atualizado.';

export const QUITAR_FIELDS: Record<QuitarField, CalcFieldSpec> = {
  parcela: moneyField('Valor da parcela', 'o valor da parcela', '850,00'),
  restantes: countField('Parcelas que faltam', 'quantas parcelas faltam', 1, 480, 'Use de 1 a 480 parcelas.', 'De 1 a 480'),
  taxaMes: rateField(
    'Taxa de juros ao mês do contrato (%)',
    'a taxa ao mês do contrato',
    '1,5',
    QUITAR_RATE_RANGE.min,
    QUITAR_RATE_RANGE.max,
    'Use uma taxa de 0% a 99,99% ao mês.',
    'A taxa efetiva de juros ao mês, não o CET. Está no contrato ou no extrato.',
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
  const bp = r.read('taxaMes', parsePercentBp(input.taxaMes, QUITAR_RATE_RANGE));
  const modo = input.modo === 'tudo' || input.modo === 'ultimas' ? input.modo : r.fail('modo', 'vazio');
  const quantas = modo === 'ultimas' ? r.read('quantas', parseCount(input.quantas ?? '', 1, restantes ?? 480)) : undefined;
  if (!r.ok || parcela === undefined || restantes === undefined || bp === undefined || modo === undefined) return { ok: false, errors: r.errors };

  const chosen = modo === 'ultimas' ? quantas! : restantes;
  const days = input.prazosEmDias;
  const usesDueDates = days !== undefined && days.length === restantes && days.every((d) => Number.isFinite(d));
  // Prazos em meses; vencida (dias negativos) é null: fica fora do valor presente, sem desconto.
  const all: (number | null)[] = usesDueDates ? days.map((d) => (d < 0 ? null : d / 30)) : Array.from({ length: restantes }, (_, k) => k + 1);
  const selected = all.slice(restantes - chosen);
  const times = selected.filter((t): t is number => t !== null);
  const count = times.length;
  const overdueCount = chosen - count;
  const overdueSum = parcela * overdueCount;
  const pv = presentValueCents(parcela, bp, times);
  const sum = parcela * count;
  const discount = sum - pv;

  const last = count === 1 ? 'a última' : `as ${count} últimas`;
  const resultLines: string[] = [];
  if (count === 0) {
    resultLines.push(QUITAR_TEXT.allOverdue);
  } else if (modo === 'tudo' && overdueCount > 0) {
    resultLines.push(
      `Valor estimado para quitar hoje ${count === 1 ? 'a parcela a vencer' : `as ${count} parcelas a vencer`}: ${formatBRL(pv)}`,
      `Desconto estimado sobre a soma das parcelas a vencer: ${formatBRL(discount)}`,
      `Soma ${count === 1 ? 'da parcela a vencer' : `das ${count} parcelas a vencer`}: ${formatBRL(sum)}`,
    );
  } else if (modo === 'tudo') {
    resultLines.push(
      `Valor estimado para quitar hoje: ${formatBRL(pv)}`,
      `Desconto estimado sobre a soma das parcelas: ${formatBRL(discount)}`,
      `Soma ${count === 1 ? 'da parcela' : `das ${count} parcelas`}: ${formatBRL(sum)}`,
    );
  } else {
    resultLines.push(
      `Valor estimado para adiantar ${last} hoje: ${formatBRL(pv)}`,
      `Desconto estimado sobre a soma das parcelas: ${formatBRL(discount)}`,
      `Soma ${count === 1 ? 'da última parcela' : `das ${count} últimas parcelas`}: ${formatBRL(sum)}`,
    );
  }
  if (overdueCount > 0) resultLines.push(QUITAR_TEXT.overdue(overdueCount, overdueSum));

  const hypotheses: string[] = [usesDueDates ? QUITAR_TEXT.dueDates : QUITAR_TEXT.monthly, bp === 0 ? QUITAR_TEXT.zeroRate : QUITAR_TEXT.rate, QUITAR_TEXT.fixed];
  if (modo === 'ultimas') hypotheses.push(QUITAR_TEXT.last);
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
      overdueCount,
      overdueSumCents: overdueSum,
      resultLines,
      hypotheses,
      notes: [QUITAR_ESTIMATE_TEXT],
    },
  };
}
