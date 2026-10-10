import { looksLikeCardNumber } from '../cards';
import type { IsoDate, IsoMonth } from '../dates';
import { addMonths, formatMonthYearBR, monthOf } from '../dates';
import { roundDivBig } from '../learn/math';
import { centsToInput, formatBRL, type Cents } from '../money';
import type { Commitment, CommitmentSeries } from '../records';
import { INSTALLMENT_NATURES } from '../records';
import { remainingInstallments } from '../series';
import { charCount } from '../validation';
import { FieldReader, LIMIT_TEXT, countField, moneyField, monthsCount, monthsDuration, rateField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney, parseOptionalMoney, parsePercentBp } from './inputs';

/**
 * 9. Em que ordem quitar as dívidas? (D-040; docs/08 §5 item 10). Calculadora educativa: nada é gravado, a taxa é sempre
 * digitada pela pessoa e as duas ordens aparecem lado a lado, sem dizer qual é a certa.
 *
 * A conta é mês a mês, com os pagamentos no fim de cada mês, a partir do mês seguinte:
 * - dívida com saldo: saldo informado; cada mês, juros = saldo × i (metade para cima, no centavo) e pagamento = o informado,
 *   limitado a saldo + juros;
 * - dívida parcelada: segue a tabela do contrato. Saldo inicial = valor presente das parcelas que faltam, Σ parcela ÷
 *   (1 + i)^t, t = 1..n (sem taxa informada, a soma das parcelas); depois de pagar k parcelas, o saldo da tabela é o valor
 *   presente das n − k que restam, e a parcela paga é sempre a do contrato (a última também), sem pagamento final maior.
 *   Os juros do mês são o que fecha a conta: saldo depois + pagamento − saldo antes. Cada saldo da tabela é arredondado uma
 *   vez, a partir do valor exato, e por isso os juros de um mês diferem do exato em cerca de 1 centavo, sem efeito acumulado.
 *   O valor a mais aplicado numa parcelada rende a taxa do contrato e abate o saldo da tabela; a dívida fecha quando ele
 *   cobre o valor presente do que falta;
 * - com o valor a mais: o total do mês é o valor a mais mais todos os pagamentos de sempre; o que as dívidas abertas não
 *   usam (por já estarem quitadas) vai para a primeira dívida aberta da ordem, e o que sobrar ao quitá-la passa para a
 *   seguinte no mesmo mês (efeito bola de neve);
 * - referência: "Sem valor a mais" paga cada dívida só com os pagamentos de sempre, sem passar nada adiante.
 * Dinheiro em centavos inteiros; juros e valores presentes usam BigInt e roundDivBig, sem ponto flutuante.
 */
export type PlanoTipo = 'parcelada' | 'saldo';
export type PlanoCampo = 'apelido' | 'tipo' | 'parcela' | 'restantes' | 'taxaParcelada' | 'saldo' | 'taxaSaldo' | 'pagamento';
/** Campos por dívida levam a posição na lista: "parcela.0", "taxaSaldo.2". */
export type PlanoField = 'dividas' | 'extra' | `${PlanoCampo}.${number}`;

export interface PlanoDividaInput {
  tipo: PlanoTipo | null;
  /** Opcional, até 30 caracteres; em branco vira "Dívida 1", "Dívida 2"... */
  apelido?: string;
  /** Parcelada: valor da parcela. */
  parcela?: string;
  /** Parcelada: 1 a 480. */
  restantes?: string;
  /** Parcelada: 0,00% a 99,99% ao mês; em branco = sem juros informados. */
  taxaParcelada?: string;
  /** Saldo com juros: saldo de hoje. */
  saldo?: string;
  /** Saldo com juros: 0,01% a 99,99% ao mês. */
  taxaSaldo?: string;
  /** Saldo com juros: quanto paga por mês. */
  pagamento?: string;
}

export interface PlanoInput {
  /** De 1 a 10 dívidas. */
  dividas: readonly PlanoDividaInput[];
  /** Opcional: quanto a mais por mês, de R$ 0 a R$ 9.999.999,99. */
  extra?: string;
}

export const PLANO_MAX_DEBTS = 10;
/** 50 anos: acima disto, "as dívidas não terminam". */
export const PLANO_MAX_MONTHS = 600;
export const PLANO_NAME_MAX = 30;
export const PLANO_RATE_RANGE = { parcelada: { min: 0, max: 9_999 }, saldo: { min: 1, max: 9_999 } } as const;

/** Texto fixo, como o de "Quitar antes": o valor oficial é o da instituição. */
export const PLANO_ESTIMATE_TEXT = 'Estimativa. O valor oficial de cada dívida é o que a instituição informar; peça o valor atualizado.';

export const PLANO_TEXT = {
  emptyList: 'Acrescente as dívidas que você quer comparar.',
  addDebt: 'Acrescentar dívida',
  maxReached: 'Você chegou a 10 dívidas. Tire alguma da conta para acrescentar outra.',
  removeDebt: 'Tirar da conta',
  removeDebtA11y: (name: string) => `Tirar da conta: ${name}`,
  debtTitle: (index: number) => `Dívida ${index + 1}`,
  listTitle: 'Suas dívidas',
  listHint: 'De 1 a 10 dívidas. Nada é gravado: tirar uma da conta não apaga nada.',
  prefilledNote: 'Preenchido com os seus parcelamentos em aberto. Informe a taxa ao mês de cada contrato; nada muda neles.',
  prefilledHidden: 'Valor oculto. Mostre os valores para editar.',
  showValues: 'Mostrar valores',
  showValuesA11y: (name: string) => `Mostrar valores para editar a parcela, ${name}`,
  typeGroup: (name: string) => `Tipo de dívida, ${name}`,
  loadFailed: 'Não foi possível ler os seus parcelamentos agora. Você pode acrescentar as dívidas à mão.',
  loading: 'Lendo os seus parcelamentos',
  typeHint: 'Parcelada: financiamento, compra parcelada ou outro parcelamento. Saldo com juros: rotativo do cartão, cheque especial ou outra dívida com saldo.',
  /** Mostrado junto do campo "Quanto você paga por mês" e entre as notas do resultado. */
  balanceStays: 'Com este pagamento, o saldo não diminui.',
  /** Legenda de "Sem valor a mais" quando há 2 ou mais dívidas e nenhum valor a mais: explica por que as ordens terminam antes. */
  baselineCaption: 'Cada dívida só com os pagamentos de sempre, sem passar nada adiante.',
  balanceStaysNote: (name: string, interestCents: Cents) =>
    `${name} fica fora da comparação até o pagamento ser maior que os juros do primeiro mês (${formatBRL(interestCents)}).`,
  savingsHint: (cents: Cents) => `No seu plano de guardar você informou ${formatBRL(cents)} por mês.`,
  noDebtCompared: 'Nenhuma dívida entra na comparação ainda.',
  noEnd: 'Com estes números, as dívidas não terminam em 50 anos.',
  needExtra: 'Informe quanto a mais você consegue pôr por mês para ver o efeito.',
  sequenceTitle: 'Em que ordem cada dívida termina',
  detailsTitle: 'Detalhes de cada ordem',
  scenario: {
    sem_extra: 'Sem valor a mais',
    com_extra: 'Com o valor a mais',
    maior_taxa: 'Maior taxa primeiro',
    menor_divida: 'Menor dívida primeiro',
  },
  sameInterest: 'As duas ordens têm o mesmo total de juros.',
  sameFirst: 'A primeira dívida termina no mesmo mês nas duas ordens.',
  sameEnd: 'Tudo termina no mesmo mês nas duas ordens.',
  hypotheses: {
    fixedRates: 'Taxas fixas, sem novas compras nem atrasos.',
    noFees: 'Sem IOF nem tarifas.',
    endOfMonth: 'Pagamentos no fim de cada mês, a partir do mês seguinte.',
    minimums: 'Cada dívida recebe todo mês a parcela, ou o pagamento que você informou.',
    snowballWithExtra: 'O valor a mais e as parcelas das dívidas já quitadas vão para a primeira dívida da ordem; o restante passa para a seguinte, no mesmo mês.',
    snowballNoExtra: 'As parcelas das dívidas já quitadas vão para a primeira dívida da ordem; o restante passa para a seguinte, no mesmo mês.',
    extraOnly: 'O valor a mais vai para a dívida todo mês, além do pagamento de sempre.',
    baseline: '"Sem valor a mais" paga cada dívida só com os pagamentos de sempre, sem passar nada adiante.',
    presentValue: 'O saldo inicial de uma dívida parcelada é o valor presente das parcelas que faltam, pela taxa informada. A parcela segue a tabela do contrato e o valor a mais abate o saldo.',
    overdueOut: 'Dos seus parcelamentos, entram só as parcelas que vencem de hoje em diante; as já vencidas e em aberto ficam fora desta conta.',
    noRate: (name: string) => `${name}: sem juros informados, conta só as parcelas.`,
  },
} as const;

export const PLANO_FIELDS: Record<PlanoCampo | 'extra' | 'dividas', CalcFieldSpec> = {
  dividas: {
    label: 'Dívidas',
    kind: 'inteiro',
    min: 1,
    max: PLANO_MAX_DEBTS,
    errors: { vazio: PLANO_TEXT.emptyList, fora_da_faixa: 'Compare de 1 a 10 dívidas.' },
  },
  apelido: {
    label: 'Apelido',
    hint: 'Opcional. Até 30 caracteres. Fica só nesta tela.',
    kind: 'texto',
    optional: true,
    errors: {
      longo: 'Use no máximo 30 caracteres.',
      invalido: 'Não use o número do cartão no apelido. Use um nome, como Cartão azul.',
    },
  },
  tipo: {
    label: 'Tipo de dívida',
    kind: 'opcao',
    options: [
      { value: 'parcelada', label: 'Parcelada' },
      { value: 'saldo', label: 'Saldo com juros' },
    ],
    errors: { vazio: 'Escolha o tipo da dívida.' },
  },
  parcela: moneyField('Valor da parcela', 'o valor da parcela', '850,00'),
  restantes: countField('Parcelas que faltam', 'quantas parcelas faltam', 1, 480, 'Use de 1 a 480 parcelas.', 'De 1 a 480'),
  taxaParcelada: {
    ...rateField(
      'Taxa de juros ao mês do contrato (%)',
      'a taxa ao mês do contrato',
      '1,5',
      PLANO_RATE_RANGE.parcelada.min,
      PLANO_RATE_RANGE.parcelada.max,
      'Use uma taxa de 0,00% a 99,99% ao mês, ou deixe em branco.',
      'Opcional. Está no contrato ou no extrato. Em branco: conta só as parcelas.',
    ),
    optional: true,
  },
  saldo: moneyField('Saldo hoje', 'o saldo de hoje', '1.000,00'),
  taxaSaldo: rateField(
    'Taxa de juros ao mês (%)',
    'a taxa ao mês',
    '8',
    PLANO_RATE_RANGE.saldo.min,
    PLANO_RATE_RANGE.saldo.max,
    'Use uma taxa de 0,01% a 99,99% ao mês.',
    'Está na fatura, no extrato ou no contrato.',
  ),
  pagamento: moneyField('Quanto você paga por mês', 'quanto você paga por mês', '200,00'),
  extra: {
    label: 'Quanto a mais você consegue pôr por mês nas dívidas?',
    hint: 'Opcional. Em branco: só os pagamentos de sempre.',
    kind: 'dinheiro',
    optional: true,
    errors: { invalido: 'Confira o valor, como 200,00.', acima_do_limite: LIMIT_TEXT },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Conta

export type PlanoScenarioId = 'sem_extra' | 'com_extra' | 'maior_taxa' | 'menor_divida';

export interface PlanoDebtInfo {
  /** Posição na lista da pessoa (de 0). */
  index: number;
  name: string;
  tipo: PlanoTipo;
  /** Parcelada: valor presente das parcelas; saldo com juros: o saldo informado. */
  initialCents: Cents;
  /** Taxa ao mês em pontos-base; null = parcelada sem juros informados. */
  rateBp: number | null;
  /** Parcela ou pagamento informado. */
  minimumCents: Cents;
  /** Parcelada: parcelas que faltam; saldo com juros: null. */
  restantes: number | null;
  /** Juros do primeiro mês sobre o saldo inicial. */
  firstInterestCents: Cents;
  /** Dívida com saldo cujo pagamento não passa dos juros do primeiro mês: fora da comparação. */
  excluded: boolean;
}

export interface PlanoSequenceItem {
  index: number;
  name: string;
  /** Mês, contado do mês seguinte (1 = o próximo fim de mês). */
  month: number;
  /** Mês do calendário, quando a conta recebeu a data de hoje. */
  calendar: IsoMonth | null;
}

export interface PlanoScenario {
  id: PlanoScenarioId;
  title: string;
  /** Meses até tudo terminar; null = passa de 600 meses. */
  months: number | null;
  endMonth: IsoMonth | null;
  /** Mês em que a primeira dívida termina; null junto de months. */
  firstMonth: number | null;
  totalPaidCents: Cents | null;
  /** Total pago menos a soma dos saldos iniciais. */
  interestCents: Cents | null;
  /** Dívidas na ordem em que terminam (empate: ordem da lista). Vazia quando passa de 600 meses. */
  sequence: PlanoSequenceItem[];
  /** "Maior taxa primeiro: tudo termina em 28 meses (2 anos e 4 meses), em fevereiro de 2029." */
  summary: string;
  /** "Total pago: R$ ...", "Juros estimados: R$ ...". */
  detailLines: string[];
  /** "1. Cartão: termina em 5 meses (março de 2027)." */
  sequenceLines: string[];
  /** Legenda junto ao título; só em "Sem valor a mais", com 2 ou mais dívidas e nenhum valor a mais. */
  caption: string | null;
}

export interface PlanoResult extends CalcTexts {
  extraCents: Cents;
  debts: PlanoDebtInfo[];
  /** Quantas dívidas entram na comparação (as outras, com saldo que não diminui, ficam de fora). */
  included: number;
  /** Soma dos saldos iniciais das dívidas que entram. */
  initialSumCents: Cents;
  scenarios: PlanoScenario[];
  /** Diferenças entre as duas ordens, em frases neutras (vazia com 1 dívida ou quando uma ordem passa de 600 meses). */
  differences: string[];
}

interface SimDebt {
  initial: Cents;
  bp: number;
  minimum: Cents;
  /** Parcelada: número de parcelas que faltam; a dívida termina no mês `term`. */
  term: number | null;
  /** Parcelada: `table[k]` = valor presente das k últimas parcelas (a tabela do contrato), de k = 0 a `term`. */
  table: readonly Cents[] | null;
}

interface SimOutcome {
  months: number | null;
  totalPaid: Cents;
  interest: Cents;
  closedAt: number[];
}

const BP = 10_000n;

/** Juros de um mês: saldo × taxa, metade para cima no centavo, em inteiros exatos. */
function monthInterest(balance: Cents, bp: number): Cents {
  return Number(roundDivBig(BigInt(balance) * BigInt(bp), BP));
}

/**
 * Tabela de uma dívida parcelada: `table[k]` = valor presente de k parcelas iguais, Σ parcela ÷ (1 + i)^t, t = 1..k, em
 * forma fechada, parcela × B × ((B + bp)^k − B^k) ÷ (bp × (B + bp)^k) com B = 10.000, e arredondado uma só vez, metade para
 * cima (é o mesmo número de presentValueCents, sem somar termo a termo). Sem taxa, k × parcela.
 */
export function installmentTable(parcela: Cents, bp: number, count: number): Cents[] {
  const table: Cents[] = [0];
  if (bp === 0) {
    for (let k = 1; k <= count; k++) table.push(parcela * k);
    return table;
  }
  const pay = BigInt(parcela);
  const rate = BigInt(bp);
  const q = BP + rate;
  let qk = 1n;
  let bk = 1n;
  for (let k = 1; k <= count; k++) {
    qk *= q;
    bk *= BP;
    table.push(Number(roundDivBig(pay * BP * (qk - bk), rate * qk)));
  }
  return table;
}

/**
 * Meses até quitar. `pool` null: cada dívida só com os pagamentos de sempre. Com `pool`: total do mês = valor a mais mais todos
 * os pagamentos de sempre; o que as dívidas abertas não usam segue a ordem (posições em `debts`).
 *
 * Dívida com saldo: juros = saldo × i; pagamento = o informado, limitado a saldo + juros. Dívida parcelada: o saldo é o da
 * tabela do contrato menos o valor a mais já aplicado (que rende a mesma taxa); o pagamento do mês é a parcela, e os juros são
 * o que fecha a conta (saldo depois + pagamento − saldo antes). No mês `term` a tabela chega a zero e a dívida termina.
 */
function simulate(debts: readonly SimDebt[], pool: { order: readonly number[]; budget: Cents } | null): SimOutcome {
  const balance = debts.map((d) => d.initial);
  /** Parcelada: valor a mais já aplicado, com a taxa do contrato. */
  const applied = debts.map(() => 0);
  const closedAt = debts.map(() => 0);
  let totalPaid = 0;
  let interest = 0;
  for (let month = 1; month <= PLANO_MAX_MONTHS; month++) {
    let used = 0;
    for (let i = 0; i < debts.length; i++) {
      const open = balance[i]!;
      if (open <= 0) continue;
      const d = debts[i]!;
      let pay: Cents;
      if (d.table !== null) {
        const grown = applied[i]! + monthInterest(applied[i]!, d.bp);
        const gap = d.table[Math.max(0, d.term! - month)]! - grown;
        const after = Math.max(0, gap);
        pay = Math.min(d.minimum, Math.max(0, gap + d.minimum));
        applied[i] = grown;
        interest += after + pay - open;
        balance[i] = after;
      } else {
        const j = monthInterest(open, d.bp);
        interest += j;
        const owed = open + j;
        pay = Math.min(d.minimum, owed);
        balance[i] = owed - pay;
      }
      totalPaid += pay;
      used += pay;
    }
    if (pool) {
      let rest = Math.max(0, pool.budget - used);
      for (const i of pool.order) {
        if (rest === 0) break;
        const open = balance[i]!;
        if (open > 0) {
          const pay = Math.min(rest, open);
          balance[i] = open - pay;
          applied[i] = applied[i]! + pay;
          rest -= pay;
          totalPaid += pay;
        }
      }
    }
    for (let i = 0; i < debts.length; i++) if (balance[i] === 0 && closedAt[i] === 0) closedAt[i] = month;
    if (closedAt.every((c) => c > 0)) return { months: month, totalPaid, interest, closedAt };
  }
  return { months: null, totalPaid: 0, interest: 0, closedAt };
}

/**
 * "Com este pagamento, o saldo não diminui.": dívida com saldo cujo pagamento não passa dos juros do primeiro mês. Vale com
 * os três campos da própria dívida válidos, mesmo que outro campo (de outra dívida ou o valor a mais) esteja incompleto.
 */
export function planoDebtStays(d: PlanoDividaInput): boolean {
  if (d.tipo !== 'saldo') return false;
  const saldo = parseMoney(d.saldo ?? '');
  const bp = parsePercentBp(d.taxaSaldo ?? '', PLANO_RATE_RANGE.saldo);
  const pagamento = parseMoney(d.pagamento ?? '');
  if (!saldo.ok || !bp.ok || !pagamento.ok) return false;
  return pagamento.value <= monthInterest(saldo.value, bp.value);
}

/** Nome mostrado: o apelido sem espaços nas pontas ou "Dívida N". */
export function planoDebtName(apelido: string | undefined, index: number): string {
  const nick = (apelido ?? '').trim();
  return nick !== '' ? nick : PLANO_TEXT.debtTitle(index);
}

/** Depois de dois-pontos a frase segue em minúscula: "Sem valor a mais: com estes números, ...". */
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

const calendarMonth = (today: IsoDate | undefined, months: number): IsoMonth | null => (today === undefined ? null : addMonths(monthOf(today), months));

function buildScenario(
  id: PlanoScenarioId,
  sim: SimOutcome,
  included: readonly PlanoDebtInfo[],
  today: IsoDate | undefined,
  caption: string | null = null,
): PlanoScenario {
  const title = PLANO_TEXT.scenario[id];
  if (sim.months === null) {
    return {
      id,
      title,
      months: null,
      endMonth: null,
      firstMonth: null,
      totalPaidCents: null,
      interestCents: null,
      sequence: [],
      summary: `${title}: ${lowerFirst(PLANO_TEXT.noEnd)}`,
      detailLines: [],
      sequenceLines: [],
      caption,
    };
  }
  const sequence = included
    .map((d, k) => ({ index: d.index, name: d.name, month: sim.closedAt[k]!, calendar: calendarMonth(today, sim.closedAt[k]!) }))
    .sort((a, b) => a.month - b.month || a.index - b.index);
  const endMonth = calendarMonth(today, sim.months);
  const interest = sim.interest;
  return {
    id,
    title,
    months: sim.months,
    endMonth,
    firstMonth: sequence[0]!.month,
    totalPaidCents: sim.totalPaid,
    interestCents: interest,
    sequence,
    summary: `${title}: tudo termina em ${monthsDuration(sim.months)}${endMonth ? `, em ${formatMonthYearBR(endMonth)}` : ''}.`,
    detailLines: [`Total pago: ${formatBRL(sim.totalPaid)}`, `Juros estimados: ${formatBRL(interest)}`],
    sequenceLines: sequence.map((s, k) => `${k + 1}. ${s.name}: termina em ${monthsCount(s.month)}${s.calendar ? ` (${formatMonthYearBR(s.calendar)})` : ''}.`),
    caption,
  };
}

/** Frases neutras sobre a diferença entre as duas ordens (só quando as duas terminam em até 600 meses). */
function differences(maior: PlanoScenario, menor: PlanoScenario): string[] {
  if (maior.months === null || menor.months === null) return [];
  const out: string[] = [];
  const interest = menor.interestCents! - maior.interestCents!;
  if (interest > 0) out.push(`${maior.title}: ${formatBRL(interest)} a menos de juros.`);
  else if (interest < 0) out.push(`${menor.title}: ${formatBRL(-interest)} a menos de juros.`);
  else out.push(PLANO_TEXT.sameInterest);
  const first = menor.firstMonth! - maior.firstMonth!;
  if (first < 0) out.push(`${menor.title}: a primeira dívida termina ${monthsCount(-first)} antes.`);
  else if (first > 0) out.push(`${maior.title}: a primeira dívida termina ${monthsCount(first)} antes.`);
  else out.push(PLANO_TEXT.sameFirst);
  const end = menor.months - maior.months;
  if (end < 0) out.push(`${menor.title}: tudo termina ${monthsCount(-end)} antes.`);
  else if (end > 0) out.push(`${maior.title}: tudo termina ${monthsCount(end)} antes.`);
  else out.push(PLANO_TEXT.sameEnd);
  return out;
}

/**
 * Compara a ordem "Maior taxa primeiro" com "Menor dívida primeiro" e mostra "Sem valor a mais" como referência. Com uma só
 * dívida, mostra "Sem valor a mais" e "Com o valor a mais". `today` (a data de hoje) só serve para dar nome de mês ao fim de
 * cada dívida; sem ele, o resultado fala só em quantos meses.
 */
export function calcPlanoDividas(input: PlanoInput, today?: IsoDate): CalcOutcome<PlanoResult, PlanoField> {
  const r = new FieldReader<PlanoField>();
  const extra = r.read('extra', parseOptionalMoney(input.extra));
  const list = input.dividas;
  if (list.length === 0) return { ok: false, errors: { dividas: 'vazio', ...r.errors } };
  if (list.length > PLANO_MAX_DEBTS) return { ok: false, errors: { dividas: 'fora_da_faixa', ...r.errors } };

  const infos: PlanoDebtInfo[] = [];
  /** Tabela do contrato de cada parcelada (por posição na lista). */
  const tables = new Map<number, Cents[]>();
  list.forEach((d, i) => {
    const nick = (d.apelido ?? '').trim();
    if (charCount(nick) > PLANO_NAME_MAX) r.fail(`apelido.${i}`, 'longo');
    else if (looksLikeCardNumber(nick)) r.fail(`apelido.${i}`, 'invalido');
    const name = planoDebtName(d.apelido, i);
    if (d.tipo === 'parcelada') {
      const parcela = r.read(`parcela.${i}`, parseMoney(d.parcela ?? ''));
      const restantes = r.read(`restantes.${i}`, parseCount(d.restantes ?? '', 1, 480));
      const rateText = d.taxaParcelada ?? '';
      const bp = rateText.trim() === '' ? null : r.read(`taxaParcelada.${i}`, parsePercentBp(rateText, PLANO_RATE_RANGE.parcelada));
      if (parcela === undefined || restantes === undefined || (rateText.trim() !== '' && bp === undefined)) return;
      const rate = bp ?? null;
      const table = installmentTable(parcela, rate ?? 0, restantes);
      tables.set(i, table);
      const initial = table[restantes]!;
      infos.push({
        index: i,
        name,
        tipo: 'parcelada',
        initialCents: initial,
        rateBp: rate,
        minimumCents: parcela,
        // Pela tabela: saldo depois da primeira parcela + parcela - saldo inicial.
        firstInterestCents: Math.max(0, table[restantes - 1]! + parcela - initial),
        restantes,
        excluded: false,
      });
    } else if (d.tipo === 'saldo') {
      const saldo = r.read(`saldo.${i}`, parseMoney(d.saldo ?? ''));
      const bp = r.read(`taxaSaldo.${i}`, parsePercentBp(d.taxaSaldo ?? '', PLANO_RATE_RANGE.saldo));
      const pagamento = r.read(`pagamento.${i}`, parseMoney(d.pagamento ?? ''));
      if (saldo === undefined || bp === undefined || pagamento === undefined) return;
      const firstInterest = monthInterest(saldo, bp);
      infos.push({
        index: i,
        name,
        tipo: 'saldo',
        initialCents: saldo,
        rateBp: bp,
        minimumCents: pagamento,
        restantes: null,
        firstInterestCents: firstInterest,
        excluded: planoDebtStays(d),
      });
    } else {
      r.fail(`tipo.${i}`, 'vazio');
    }
  });
  if (!r.ok || extra === undefined) return { ok: false, errors: r.errors };

  const extraCents = extra ?? 0;
  const included = infos.filter((d) => !d.excluded);
  const sim: SimDebt[] = included.map((d) => ({
    initial: d.initialCents,
    bp: d.rateBp ?? 0,
    minimum: d.minimumCents,
    term: d.restantes,
    table: tables.get(d.index) ?? null,
  }));
  const initialSum = included.reduce((s, d) => s + d.initialCents, 0);
  const budget = extraCents + sim.reduce((s, d) => s + d.minimum, 0);

  const scenarios: PlanoScenario[] = [];
  let diff: string[] = [];
  const lines: string[] = [];
  if (included.length > 0) {
    const baseCaption = included.length > 1 && extraCents === 0 ? PLANO_TEXT.baselineCaption : null;
    const base = buildScenario('sem_extra', simulate(sim, null), included, today, baseCaption);
    scenarios.push(base);
    lines.push(base.summary);
    if (included.length === 1) {
      if (extraCents > 0) {
        const withExtra = buildScenario('com_extra', simulate(sim, { order: [0], budget }), included, today);
        scenarios.push(withExtra);
        lines.push(withExtra.summary);
        if (base.months !== null && withExtra.months !== null) {
          const saved = base.interestCents! - withExtra.interestCents!;
          if (saved > 0) lines.push(`Com o valor a mais: ${formatBRL(saved)} a menos de juros.`);
          const earlier = base.months - withExtra.months;
          if (earlier > 0) lines.push(`Com o valor a mais: tudo termina ${monthsCount(earlier)} antes.`);
        }
      } else {
        lines.push(PLANO_TEXT.needExtra);
      }
    } else {
      const positions = sim.map((_, k) => k);
      const byRate = [...positions].sort((a, b) => sim[b]!.bp - sim[a]!.bp || sim[a]!.initial - sim[b]!.initial || a - b);
      const bySize = [...positions].sort((a, b) => sim[a]!.initial - sim[b]!.initial || sim[b]!.bp - sim[a]!.bp || a - b);
      const maior = buildScenario('maior_taxa', simulate(sim, { order: byRate, budget }), included, today);
      const menor = buildScenario('menor_divida', simulate(sim, { order: bySize, budget }), included, today);
      scenarios.push(maior, menor);
      lines.push(maior.summary, menor.summary);
      diff = differences(maior, menor);
      lines.push(...diff);
    }
  } else {
    lines.push(PLANO_TEXT.noDebtCompared);
  }

  const H = PLANO_TEXT.hypotheses;
  const hypotheses: string[] = [H.fixedRates, H.noFees, H.endOfMonth, H.minimums];
  if (included.length > 1) hypotheses.push(extraCents > 0 ? H.snowballWithExtra : H.snowballNoExtra);
  else if (included.length === 1 && extraCents > 0) hypotheses.push(H.extraOnly);
  if (included.length > 1) hypotheses.push(H.baseline);
  if (included.some((d) => d.tipo === 'parcelada' && d.rateBp !== null)) hypotheses.push(H.presentValue);
  for (const d of included) if (d.tipo === 'parcelada' && d.rateBp === null) hypotheses.push(H.noRate(d.name));

  const notes = [PLANO_ESTIMATE_TEXT, ...infos.filter((d) => d.excluded).map((d) => PLANO_TEXT.balanceStaysNote(d.name, d.firstInterestCents))];

  return {
    ok: true,
    result: {
      extraCents,
      debts: infos,
      included: included.length,
      initialSumCents: initialSum,
      scenarios,
      differences: diff,
      resultLines: lines,
      hypotheses,
      notes,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Dívidas que já estão no Clarevo

/** Uma dívida parcelada em aberto, lida de um parcelamento (nada é gravado ou alterado nele). */
export interface SeriesDebtDraft {
  seriesId: string;
  /** Descrição do parcelamento, até 30 caracteres; vazio quando parece número de cartão. */
  name: string;
  /** Valor da próxima parcela. */
  parcelaCents: Cents;
  /** Parcelas que ainda faltam (das contas em aberto e das ainda não criadas). */
  restantes: number;
}

/**
 * Parcelamentos com parcelas a vencer (financiamento, compra parcelada ou outro parcelamento; nunca gasto fixo nem conta do
 * ano), na ordem em que vieram, até 10. `occurrences` são as contas vivas da série e `open` as em aberto (mesmas listas de
 * "Quanto economizo se quitar antes?"). Regra: contam só as parcelas com vencimento de hoje em diante; as já vencidas e em
 * aberto ficam fora (a tela diz isso), e um parcelamento sem nenhuma parcela a vencer fica fora, esteja ou não encerrado.
 */
export function seriesDebtDrafts(
  items: readonly { series: CommitmentSeries; occurrences: readonly Commitment[]; open: readonly Commitment[] }[],
  today: IsoDate,
): SeriesDebtDraft[] {
  const out: SeriesDebtDraft[] = [];
  for (const { series: s, occurrences, open } of items) {
    if (out.length >= PLANO_MAX_DEBTS) break;
    if (s.kind !== 'parcelada' || !INSTALLMENT_NATURES.includes(s.nature)) continue;
    const next = remainingInstallments(s, occurrences, open, today)?.filter((x) => x.dueOn >= today);
    if (!next || next.length === 0 || next.length > 480) continue;
    const term = [...s.terms].reverse().find((t) => t.fromNumber <= next[0]!.number) ?? s.terms[0];
    const raw = [...(term?.description ?? '').trim()].slice(0, PLANO_NAME_MAX).join('').trim();
    out.push({ seriesId: s.id, name: looksLikeCardNumber(raw) ? '' : raw, parcelaCents: next[0]!.amountCents, restantes: next.length });
  }
  return out;
}

/** Campos da calculadora para uma dívida lida de um parcelamento (a taxa fica em branco: é a pessoa que informa). */
export function draftToInput(d: SeriesDebtDraft): PlanoDividaInput {
  return { tipo: 'parcelada', apelido: d.name, parcela: centsToInput(d.parcelaCents), restantes: String(d.restantes), taxaParcelada: '' };
}
