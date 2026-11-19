import { iofCents, lateChargesCents } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, countField, daysCount, moneyField, rateField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney, parsePercentBp } from './inputs';

/**
 * 5. Multa e juros por atraso (docs/08 §3.2). multa = arredonda(valor × multa); juros = arredonda(valor × juros ×
 * dias ÷ 30), simples e proporcionais (lateChargesCents). O resultado fala em "depois do vencimento". A multa vai até 20%; os
 * juros, até 99,99% ao mês, porque a fatura de cartão depois do vencimento soma o rotativo (perto de 20% ao mês) aos juros de mora
 * (teste de 09/11/2026: a fatura de uma pessoa estava em 20,99% ao mês, acima do limite antigo de 20%).
 */
export type MultaModo = 'conta' | 'fatura';
export type MultaField = 'modo' | 'valor' | 'multaPct' | 'jurosMesPct' | 'dias' | 'rotativoPct' | 'moraPct';

export interface MultaInput {
  /**
   * 'conta' (padrão): conta ou boleto, com multa e juros. 'fatura' (D-093, era D-089 G): fatura de cartão depois do vencimento, com os
   * juros do rotativo, os juros de mora, a multa, o IOF estimado e o teto da Lei 14.690/2023.
   */
  modo?: MultaModo | null;
  valor: string;
  /** 0 a 20%, até 2 casas. */
  multaPct: string;
  /** Modo 'conta': 0 a 99,99% ao mês, até 2 casas. */
  jurosMesPct: string;
  /** 1 a 3.650. */
  dias: string;
  /** Modo 'fatura': juros do rotativo, 0 a 99,99% ao mês. */
  rotativoPct?: string;
  /** Modo 'fatura': juros de mora, 0 a 20% ao mês (em geral 1%). */
  moraPct?: string;
}

export interface MultaResult extends CalcTexts {
  modo: MultaModo;
  valorCents: Cents;
  multaBp: number;
  jurosBp: number;
  dias: number;
  fineCents: Cents;
  /** Modo 'conta': os juros. Modo 'fatura': rotativo + mora, já com o teto. */
  interestCents: Cents;
  totalCents: Cents;
  /** Modo 'fatura'. */
  rotativoCents?: Cents;
  moraCents?: Cents;
  iofCents?: Cents;
  /** Modo 'fatura': juros e multa pararam no teto (o valor não pago). */
  capped?: boolean;
  /** Modo 'fatura': dias usados na conta (no máximo FATURA_CYCLE_DAYS, o primeiro ciclo do rotativo). */
  cycleDays?: number;
  /** Modo 'fatura': os dias informados passam da próxima fatura (a conta para no primeiro ciclo e diz isso). */
  beyondCycle?: boolean;
  /** A multa informada passa de 2%, o limite das relações de consumo abrangidas pelo CDC (art. 52, § 1º): aviso, sem validar. */
  aboveConsumerFine: boolean;
}

/** Primeiro ciclo do rotativo: até a próxima fatura, 30 dias depois do vencimento (Res. CMN 4.549/2017, art. 1º). */
export const FATURA_CYCLE_DAYS = 30;
/** Multa máxima nas relações de consumo abrangidas pelo CDC (art. 52, § 1º): 2%, em pontos-base. */
export const CONSUMER_FINE_CAP_BP = 200;

export const MULTA_RATE_RANGE = { min: 0, max: 2_000 } as const;
export const JUROS_RATE_RANGE = { min: 0, max: 9_999 } as const;
export const MULTA_EXACT_TEXT = 'O valor exato é o do boleto atualizado.';
/** Modo 'conta': a fatura do cartão tem o modo próprio (D-093). */
export const MULTA_CARD_TEXT = 'Para a fatura do cartão, escolha "Fatura do cartão" no começo: a conta soma o rotativo, a mora, a multa e o IOF.';

/**
 * Conta ou boleto com multa acima de 2% (revisão externa de 18/11/2026): o CDC limita a 2% nas relações de consumo abrangidas pelo art. 52,
 * mas outras obrigações têm regras próprias. A conta mostra o valor informado, sem dizer que a cobrança vale nem generalizar os 2%.
 */
export const MULTA_CONSUMER_FINE_TEXT =
  'A multa informada passa de 2%. Em relações de consumo abrangidas pelo Código de Defesa do Consumidor (art. 52, § 1º), a multa é limitada a 2%; outras obrigações, como aluguel e tributos, têm regras próprias. A conta usa o valor informado, sem dizer se a cobrança vale.';

export const MULTA_FATURA_TEXT = {
  cap: 'Desde 2024, os juros e os encargos do rotativo não podem passar do valor que ficou sem pagar (Lei 14.690/2023). Por isso, a conta para nesse teto.',
  rotativo: 'O rotativo vale só até a próxima fatura. Depois, o banco precisa oferecer o parcelamento do que falta, com juros menores.',
  exact: 'O valor exato é o da próxima fatura.',
  /**
   * Revisão externa de 18/11/2026: o rotativo só dura até a fatura seguinte; depois há outra modalidade e outro fluxo. Com mais de 30 dias,
   * a conta para no primeiro ciclo e diz isso, em vez de projetar o rotativo por meses.
   */
  beyondCycle: (dias: number) =>
    `Você informou ${daysCount(dias)}. O rotativo só vale até a próxima fatura: depois, o que falta passa para o parcelamento ou outra modalidade, com outra taxa e outros pagamentos, e a conta não projeta esse período. Peça o valor atualizado à instituição.`,
  /** Fatura do cartão (relação de consumo com crédito) com multa acima de 2%. */
  fine: 'A multa informada passa de 2%. Na fatura do cartão, uma relação de consumo, a multa é limitada a 2% (Código de Defesa do Consumidor, art. 52, § 1º). A conta usa o valor informado, fora dessa regra, sem dizer que a cobrança vale.',
} as const;

/** Hipóteses do modo fatura (revisão externa de 18/11/2026: sem "a fatura pode vir um pouco maior"; o IOF é uma hipótese simplificada). */
export const MULTA_FATURA_HYPOTHESES = {
  interest:
    'Juros simples, proporcionais aos dias, com 30 dias por mês. A instituição pode capitalizar os juros e usar outras datas e outra taxa: o valor dela pode ser diferente desta estimativa.',
  cycle: 'Primeiro ciclo: a conta vai até a próxima fatura, 30 dias depois do vencimento; parcelamento e renegociação ficam de fora.',
  fine: 'Multa cobrada uma vez sobre o valor que ficou sem pagar.',
  iof: 'IOF estimado numa hipótese simplificada: 0,38% mais 0,0082% por dia sobre o valor que ficou sem pagar, como se ele ficasse parado. Não é o valor legal: a instituição calcula sobre o saldo de cada dia, e o IOF pode já estar na fatura; nesse caso, não some de novo.',
} as const;

const HINT = 'Está no boleto ou no contrato.';

export const MULTA_FIELDS: Record<MultaField, CalcFieldSpec> = {
  modo: {
    label: 'Que conta passou do vencimento?',
    kind: 'opcao',
    default: 'conta',
    options: [
      { value: 'conta', label: 'Conta ou boleto' },
      { value: 'fatura', label: 'Fatura do cartão' },
    ],
    errors: { vazio: 'Escolha que conta passou do vencimento.' },
  },
  valor: moneyField('Valor da conta', 'o valor da conta', '200,00'),
  multaPct: rateField('Multa (%)', 'a multa', '2', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use uma multa de 0% a 20%.', HINT),
  jurosMesPct: rateField('Juros ao mês (%)', 'os juros ao mês', '1', JUROS_RATE_RANGE.min, JUROS_RATE_RANGE.max, 'Use juros de 0% a 99,99% ao mês.', HINT),
  dias: countField('Dias depois do vencimento', 'quantos dias passaram do vencimento', 1, 3_650, 'Use de 1 a 3.650 dias.'),
  rotativoPct: rateField('Juros do rotativo ao mês (%)', 'os juros do rotativo', '15', JUROS_RATE_RANGE.min, JUROS_RATE_RANGE.max, 'Use juros de 0% a 99,99% ao mês.', 'Está na fatura, em "juros do rotativo" ou "crédito rotativo".'),
  moraPct: rateField('Juros de mora ao mês (%)', 'os juros de mora', '1', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use juros de mora de 0% a 20% ao mês.', 'Está na fatura. Em geral, 1% ao mês.'),
};

/** Modo 'fatura': o valor é o que ficou sem pagar e a multa costuma ser 2%. */
export const MULTA_FATURA_FIELDS: Record<MultaField, CalcFieldSpec> = {
  ...MULTA_FIELDS,
  valor: moneyField('Valor que ficou sem pagar', 'o valor que ficou sem pagar', '1.000,00', { hint: 'O total da fatura menos o que você pagou.' }),
  multaPct: rateField('Multa (%)', 'a multa', '2', MULTA_RATE_RANGE.min, MULTA_RATE_RANGE.max, 'Use uma multa de 0% a 20%.', 'Está na fatura. Na fatura do cartão, vai até 2%.'),
  dias: countField(
    'Dias depois do vencimento',
    'quantos dias passaram do vencimento',
    1,
    3_650,
    'Use de 1 a 3.650 dias.',
    'A conta vai até a próxima fatura, 30 dias depois do vencimento.',
  ),
};

export function calcMultaEJuros(input: MultaInput): CalcOutcome<MultaResult, MultaField> {
  if (input.modo === 'fatura') return calcFatura(input);
  const r = new FieldReader<MultaField>();
  const valor = r.read('valor', parseMoney(input.valor));
  const multaBp = r.read('multaPct', parsePercentBp(input.multaPct, MULTA_RATE_RANGE));
  const jurosBp = r.read('jurosMesPct', parsePercentBp(input.jurosMesPct, JUROS_RATE_RANGE));
  const dias = r.read('dias', parseCount(input.dias, 1, 3_650));
  if (!r.ok || valor === undefined || multaBp === undefined || jurosBp === undefined || dias === undefined) return { ok: false, errors: r.errors };

  const { fineCents, interestCents, totalCents } = lateChargesCents(valor, multaBp, jurosBp, dias);
  const aboveConsumerFine = multaBp > CONSUMER_FINE_CAP_BP;
  return {
    ok: true,
    result: {
      modo: 'conta',
      valorCents: valor,
      multaBp,
      jurosBp,
      dias,
      fineCents,
      interestCents,
      totalCents,
      aboveConsumerFine,
      resultLines: [
        `Com estes números, ${daysCount(dias)} depois do vencimento a conta fica em ${formatBRL(totalCents)}.`,
        `Multa: ${formatBRL(fineCents)}`,
        `Juros: ${formatBRL(interestCents)}`,
      ],
      hypotheses: [
        'Multa cobrada uma vez sobre o valor da conta.',
        'Juros simples, proporcionais aos dias, com 30 dias por mês.',
        'Sem correção monetária nem regras próprias, como as de tributos e de alguns contratos.',
      ],
      notes: [...(aboveConsumerFine ? [MULTA_CONSUMER_FINE_TEXT] : []), MULTA_EXACT_TEXT, MULTA_CARD_TEXT],
    },
  };
}

/**
 * Modo 'fatura' (D-093): rotativo e mora são juros simples, proporcionais aos dias (30 dias por mês), e a multa é cobrada uma vez.
 * Teto (Lei 14.690/2023, Resolução CMN 5.112/2023): rotativo + mora + multa nunca passam do valor não pago; quando passam, os juros
 * são reduzidos primeiro (a multa fica). IOF estimado (iofCents, Decreto 6.306/2007): 0,38% + 0,0082% por dia, sobre o valor não pago,
 * fora do teto (é imposto, não encargo do banco).
 *
 * Revisão externa de 18/11/2026: o rotativo só dura até a fatura seguinte (Res. CMN 4.549/2017, art. 1º), então a conta vai só até o
 * primeiro ciclo (FATURA_CYCLE_DAYS); com mais dias, usa 30 e diz que não projeta o período seguinte. O IOF é uma hipótese
 * simplificada (saldo parado, sem pagamentos nem o saldo de cada dia), nunca o valor legal, e pode já estar na fatura.
 */
function calcFatura(input: MultaInput): CalcOutcome<MultaResult, MultaField> {
  const r = new FieldReader<MultaField>();
  const valor = r.read('valor', parseMoney(input.valor));
  const rotativoBp = r.read('rotativoPct', parsePercentBp(input.rotativoPct ?? '', JUROS_RATE_RANGE));
  const moraBp = r.read('moraPct', parsePercentBp(input.moraPct ?? '', MULTA_RATE_RANGE));
  const multaBp = r.read('multaPct', parsePercentBp(input.multaPct, MULTA_RATE_RANGE));
  const dias = r.read('dias', parseCount(input.dias, 1, 3_650));
  if (!r.ok || valor === undefined || rotativoBp === undefined || moraBp === undefined || multaBp === undefined || dias === undefined) return { ok: false, errors: r.errors };

  // Só o primeiro ciclo do rotativo: até a próxima fatura.
  const cycleDays = Math.min(dias, FATURA_CYCLE_DAYS);
  const beyondCycle = dias > FATURA_CYCLE_DAYS;
  // As mesmas contas da conta ou boleto (lateChargesCents): multa uma vez e juros simples, cada um arredondado ao centavo.
  const base = lateChargesCents(valor, multaBp, rotativoBp, cycleDays);
  const fine = Math.min(base.fineCents, valor);
  let rotativo = base.interestCents;
  let mora = lateChargesCents(valor, 0, moraBp, cycleDays).interestCents;
  const room = valor - fine;
  const capped = rotativo + mora > room;
  if (capped) {
    // Corta na mesma proporção dos dois; o centavo que sobra fica no rotativo.
    const total = rotativo + mora;
    mora = Math.floor((mora * room) / total);
    rotativo = room - mora;
  }
  const iof = iofCents(valor, cycleDays).totalCents;
  const totalCents = valor + rotativo + mora + fine + iof;
  const aboveConsumerFine = multaBp > CONSUMER_FINE_CAP_BP;
  return {
    ok: true,
    result: {
      modo: 'fatura',
      valorCents: valor,
      multaBp,
      jurosBp: rotativoBp + moraBp,
      dias,
      fineCents: fine,
      interestCents: rotativo + mora,
      totalCents,
      rotativoCents: rotativo,
      moraCents: mora,
      iofCents: iof,
      capped,
      cycleDays,
      beyondCycle,
      aboveConsumerFine,
      resultLines: [
        beyondCycle
          ? `Com estes números, até a próxima fatura (${daysCount(cycleDays)} depois do vencimento) a fatura fica em ${formatBRL(totalCents)}.`
          : `Com estes números, ${daysCount(dias)} depois do vencimento a fatura fica em ${formatBRL(totalCents)}.`,
        `Juros do rotativo: ${formatBRL(rotativo)}`,
        `Juros de mora: ${formatBRL(mora)}`,
        `Multa: ${formatBRL(fine)}`,
        `IOF estimado: ${formatBRL(iof)}`,
      ],
      hypotheses: [MULTA_FATURA_HYPOTHESES.interest, MULTA_FATURA_HYPOTHESES.cycle, MULTA_FATURA_HYPOTHESES.fine, MULTA_FATURA_HYPOTHESES.iof],
      notes: [
        ...(beyondCycle ? [MULTA_FATURA_TEXT.beyondCycle(dias)] : []),
        ...(capped ? [MULTA_FATURA_TEXT.cap] : []),
        ...(aboveConsumerFine ? [MULTA_FATURA_TEXT.fine] : []),
        MULTA_FATURA_TEXT.rotativo,
        MULTA_FATURA_TEXT.exact,
      ],
    },
  };
}
