import { COMMITTED_TEXT, formatPermille } from '../committed';
import type { IsoDate, IsoMonth } from '../dates';
import { addMonths, formatMonthInputBR, formatMonthYearBR, monthOf } from '../dates';
import { formatBpCompact } from '../learn/format';
import { installmentCents, percentTenths, roundDivBig } from '../learn/math';
import { MAX_RECORD_CENTS, formatBRL, type Cents } from '../money';
import { SIMULATE_MONTHS_MAX, monthlyRateText, monthsForTarget } from '../simulate';
import { FieldReader, countField, moneyField, monthsCount, monthsDuration, rateField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney, parsePercentBp, type Parsed } from './inputs';

/**
 * 10. Antes de financiar (D-044; pedido de Adriana Velasquez, encaminhado por Enzo em 10/10/2026). Calculadora educativa
 * no padrão de D-035: nada é gravado, a taxa do financiamento e o rendimento são sempre digitados, sem produto, sem oferta de
 * crédito e sem dizer qual caminho escolher. Quatro respostas, na ordem da transcrição:
 *
 * 1. Financiar. valor financiado = preço − entrada; parcela pela tabela Price (primeira parcela 1 mês depois da compra:
 *    P × i × (1 + i)^n ÷ ((1 + i)^n − 1); paga na compra: a mesma conta dividida por (1 + i), que é a anuidade antecipada);
 *    total pago = entrada + n × parcela; juros = total pago − preço. Inteiros exatos (BigInt), metade para cima.
 * 2. Impacto na renda. parcela ÷ renda (uma casa, como D-026(3)) e, com o comprometido do mês atual conhecido
 *    (month_committed, vindo da tela), "de X% para Y% enquanto durar o financiamento". Sem julgamento; a referência de 30%
 *    com dívidas (P-024) aparece só como referência, com a fonte.
 * 3. Juntar antes. Meses para juntar o que falta para comprar à vista (o preço menos a entrada que a pessoa já tem, um só
 *    alvo), guardando X por mês (padrão: a parcela) com o rendimento ao ano digitado (vazio: sem rendimento), com os aportes
 *    no início de cada mês (monthsForTarget, D-028). Comparação com frases simétricas; o preço do bem pode mudar.
 * 4. Entrada maior. O efeito de mais 10% e 20% do preço à vista de entrada na parcela e nos juros.
 *
 * Taxa 0%: nunca há juros (juros 0 e "sem juros"). A parcela é o valor financiado ÷ n, no centavo, e a última parcela
 * absorve a diferença de arredondamento, de modo que o total pago é o preço à vista.
 */
export type AntesField = 'preco' | 'entrada' | 'parcelas' | 'taxaMes' | 'primeiraEmUmMes' | 'renda' | 'guardar' | 'rendimento';

export interface AntesInput {
  preco: string;
  /** Opcional (em branco: sem entrada). De R$ 0 até o preço. */
  entrada?: string;
  /** 1 a 480. */
  parcelas: string;
  /** 0,00% a 99,99% ao mês, digitada. */
  taxaMes: string;
  /** "A primeira parcela vence em 1 mês?" (padrão Sim); Não: a primeira é paga na compra. */
  primeiraEmUmMes?: boolean;
  /** Renda líquida por mês, opcional. */
  renda?: string;
  /** Quanto guardaria por mês, opcional (em branco: o valor da parcela). */
  guardar?: string;
  /** Rendimento ao ano, 0% a 30%, opcional (em branco: sem rendimento). */
  rendimento?: string;
  /** Comprometido do mês atual (month_committed.committed_cents), quando a tela o conhece; null ou ausente: sem a linha. */
  comprometidoCents?: Cents | null;
}

/** Uma linha de "entrada maior": mais 10% ou 20% do preço à vista. */
export interface AntesEntradaMaior {
  /** 10 ou 20 (por cento do preço à vista). */
  percent: number;
  extraCents: Cents;
  entradaCents: Cents;
  parcelaCents: Cents;
  interestCents: Cents;
  /** Parcela e juros a menos que na entrada informada (nunca negativos). */
  parcelaDiffCents: Cents;
  interestDiffCents: Cents;
}

/** Parâmetros de /meta/nova (o app só repassa; valores em centavos como texto). */
export interface AntesGoalParams {
  tipo: 'objetivo';
  valor: Cents;
  /** MM/AAAA: mês de hoje + meses − 1, como no simulador. */
  prazo: string;
  mensal: Cents | null;
}

export interface AntesResult extends CalcTexts {
  precoCents: Cents;
  entradaCents: Cents;
  financedCents: Cents;
  parcelas: number;
  taxaBp: number;
  firstInOneMonth: boolean;
  /** Entrada igual ao preço: não há o que financiar (sem parcela, juros nem comparação). */
  nothingToFinance: boolean;
  parcelaCents: Cents;
  /** Última parcela: igual à parcela, salvo com taxa 0%, em que absorve a diferença de arredondamento. */
  lastParcelaCents: Cents;
  /** entrada + n × parcela (com taxa 0%: o preço à vista, pela última parcela). */
  totalCents: Cents;
  /** max(0, total − preço). */
  interestCents: Cents;
  /** Total pago igual ou menor que o preço à vista. */
  noInterest: boolean;
  /** Mês da última parcela (precisa da data de hoje). */
  lastMonth: IsoMonth | null;
  /** Renda considerada e o peso da parcela (milésimos); null sem renda. */
  rendaCents: Cents | null;
  parcelaPermille: number | null;
  /** Comprometido do mês atual antes e depois da parcela, em milésimos; null sem renda ou sem o comprometido. */
  committedBeforePermille: number | null;
  committedAfterPermille: number | null;
  /** Juntar antes: o que falta para comprar à vista (preço menos entrada), valor por mês e meses (null: não chega em 50 anos). */
  savingTargetCents: Cents;
  savingMonthlyCents: Cents;
  savingMonths: number | null;
  rendimentoBp: number;
  /** Mais 10% e 20% do preço de entrada (só os que deixam algo a financiar). */
  biggerEntries: AntesEntradaMaior[];
  /** Linhas de "Juntar antes" e de "Com uma entrada maior", mostradas abaixo do resultado. */
  savingLines: string[];
  entryLines: string[];
  /**
   * "Anotar como parcelamento": /gastos-fixos/novo?tipo=parcelada&natureza=financiamento (2 a 480 parcelas). `valor` (a parcela)
   * só vai quando cabe no limite de um registro; senão o cadastro abre sem ele.
   */
  noteParams: { tipo: 'parcelada'; natureza: 'financiamento'; parcelas: number; valor?: Cents } | null;
  /** "Criar meta com este valor": só com a data de hoje e um prazo que a calculadora alcança. */
  goalParams: AntesGoalParams | null;
}

export const ANTES_PARCELAS = { min: 1, max: 480 } as const;
export const ANTES_RATE_RANGE = { min: 0, max: 9_999 } as const;
export const ANTES_YIELD_MAX_BP = 3_000;
/** Percentuais do preço à vista somados à entrada em "Com uma entrada maior". */
export const ANTES_EXTRA_ENTRY_PERCENTS: readonly number[] = [10, 20];

const RATE_RANGE_TEXT = 'Use uma taxa de 0% a 99,99% ao mês.';
const YIELD_RANGE_TEXT = 'Use um rendimento de 0% a 30% ao ano, com até 2 casas.';

export const ANTES_ESTIMATE_TEXT = 'Estimativa. As condições oficiais são as da proposta; peça o CET.';

export const ANTES_FIELDS: Record<AntesField, CalcFieldSpec> = {
  preco: moneyField('Preço à vista do bem', 'o preço à vista', '50.000,00'),
  entrada: moneyField('Entrada', 'a entrada', '10.000,00', {
    optional: true,
    hint: 'Opcional. De R$ 0 até o preço à vista.',
    errors: { fora_da_faixa: 'A entrada não pode passar do preço à vista.' },
  }),
  parcelas: countField('Número de parcelas', 'o número de parcelas', ANTES_PARCELAS.min, ANTES_PARCELAS.max, 'Use de 1 a 480 parcelas.', 'De 1 a 480'),
  taxaMes: rateField(
    'Taxa de juros ao mês (%)',
    'a taxa ao mês',
    '1,99',
    ANTES_RATE_RANGE.min,
    ANTES_RATE_RANGE.max,
    RATE_RANGE_TEXT,
    'Está na proposta do banco ou da loja. Use o CET ao mês, se tiver.',
  ),
  primeiraEmUmMes: {
    label: 'A primeira parcela vence em 1 mês?',
    hint: 'Não: a primeira parcela é paga na compra.',
    kind: 'sim_nao',
    default: true,
    options: [
      { value: 'nao', label: 'Não' },
      { value: 'sim', label: 'Sim' },
    ],
  },
  renda: moneyField('Sua renda líquida por mês', 'sua renda líquida por mês', '4.500,00', {
    optional: true,
    hint: 'Opcional. Serve para mostrar quanto a parcela pesa na renda.',
  }),
  guardar: moneyField('Quanto você conseguiria guardar por mês', 'quanto conseguiria guardar por mês', '1.000,00', {
    optional: true,
    hint: 'Opcional. Em branco: o valor da parcela.',
  }),
  rendimento: {
    ...rateField('Rendimento ao ano (%)', 'o rendimento ao ano', '0', 0, ANTES_YIELD_MAX_BP, YIELD_RANGE_TEXT, 'Opcional. Você informa o que quer testar. Em branco: sem rendimento.'),
    optional: true,
    errors: {
      vazio: 'Digite o rendimento ao ano que quer testar, de 0% a 30%.',
      invalido: YIELD_RANGE_TEXT,
      casas_demais: YIELD_RANGE_TEXT,
      fora_da_faixa: YIELD_RANGE_TEXT,
    },
  },
};

/** Textos fixos da tela. */
export const ANTES_TEXT = {
  alternativeTitle: 'Alternativa: juntar antes',
  alternativeHint: 'Quanto tempo leva para juntar o que falta para comprar à vista: o preço menos a entrada que você já tem.',
  savingTitle: 'Juntar antes',
  entryTitle: 'Com uma entrada maior',
  noBiggerEntry: 'Com mais 10% do preço, a entrada já cobriria o preço inteiro.',
  otherEntry: 'Fazer a conta com outra entrada',
  noteInstallment: 'Anotar como parcelamento',
  createGoal: 'Criar meta com este valor',
  createGoalHint: 'A meta recebe o valor, o prazo e o valor por mês. A taxa de rendimento não é gravada.',
  /** Dica do campo de renda quando ela veio da renda de referência. */
  rendaFromReference: 'Veio da sua renda de referência. Mudar aqui não altera a referência.',
  rendaHidden: 'Valor oculto. Mostre os valores para editar.',
  showValues: 'Mostrar valores',
  showValuesA11y: 'Mostrar valores para editar a renda',
  loadFailed: 'Não foi possível ler o comprometido do mês. A conta segue sem essa linha.',
} as const;

const brl = formatBRL;
const parcelasText = (n: number) => (n === 1 ? '1 parcela' : `${n} parcelas`);

/** Campo opcional em reais, maior que zero quando preenchido: em branco vale null. */
function optionalPositiveMoney(text: string | undefined): Parsed<Cents | null> {
  if (text === undefined || text.trim() === '') return { ok: true, value: null };
  return parseMoney(text);
}

/** Entrada: em branco vale R$ 0; zero é aceito. */
function optionalEntry(text: string | undefined): Parsed<Cents> {
  if (text === undefined || text.trim() === '') return { ok: true, value: 0 };
  return parseMoney(text, { allowZero: true });
}

/** Rendimento opcional ao ano em pontos-base: em branco vale 0 (sem rendimento). */
function optionalYield(text: string | undefined): Parsed<number> {
  if (text === undefined || text.trim() === '') return { ok: true, value: 0 };
  return parsePercentBp(text, { min: 0, max: ANTES_YIELD_MAX_BP });
}

/**
 * Parcela da tabela Price, em centavos inteiros e metade para cima. firstInOneMonth: P × i × q^n ÷ (q^n − 1), com q = 1 + i
 * (installmentCents); paga na compra (anuidade antecipada): P × i × q^(n−1) ÷ (q^n − 1), a mesma parcela dividida por q.
 * Taxa zero: P ÷ n. Nunca abaixo de 1 centavo com algo a financiar. financed 0: 0.
 */
export function financePaymentCents(financedCents: Cents, monthlyBp: number, installments: number, firstInOneMonth: boolean): Cents {
  if (!Number.isSafeInteger(financedCents) || financedCents < 0) throw new RangeError(`valor financiado inválido: ${financedCents}`);
  if (!Number.isSafeInteger(monthlyBp) || monthlyBp < 0) throw new RangeError(`taxa inválida: ${monthlyBp}`);
  if (!Number.isSafeInteger(installments) || installments < 1) throw new RangeError(`parcelas inválidas: ${installments}`);
  if (financedCents === 0) return 0;
  let payment: Cents;
  if (firstInOneMonth) {
    payment = installmentCents(financedCents, monthlyBp, installments);
  } else if (monthlyBp === 0) {
    payment = Number(roundDivBig(BigInt(financedCents), BigInt(installments)));
  } else {
    const base = 10_000n;
    const q = base + BigInt(monthlyBp);
    const n = BigInt(installments);
    payment = Number(roundDivBig(BigInt(financedCents) * BigInt(monthlyBp) * q ** (n - 1n), q ** n - base ** n));
  }
  return Math.max(1, payment);
}

/** Meses para juntar o alvo guardando `monthly` por mês, com aportes no início do mês; null passa de 600 meses. */
function monthsToSave(target: Cents, monthly: Cents, rateBp: number): number | null {
  // Um depósito que já cobre o alvo chega lá em 1 mês, com ou sem rendimento (e evita o limite de entrada do simulador).
  if (monthly >= target) return 1;
  return monthsForTarget(target, 0, monthly, rateBp);
}

function percentOfPrice(preco: Cents, percent: number): Cents {
  return Number(roundDivBig(BigInt(preco) * BigInt(percent), 100n));
}

interface FinanceSchedule {
  parcela: Cents;
  last: Cents;
  total: Cents;
  interest: Cents;
}

/**
 * Parcelas, total e juros para uma entrada. Com taxa 0% não há juros: a parcela é o valor financiado ÷ n e a última absorve a
 * diferença de arredondamento (o total é o preço). Só quando o valor financiado tem menos centavos que parcelas é que a última
 * não pode absorver (cada parcela tem ao menos 1 centavo): o total passa do preço em centavos, ainda sem juros.
 */
function financeSchedule(preco: Cents, entrada: Cents, taxaBp: number, n: number, firstInOneMonth: boolean): FinanceSchedule {
  const financed = preco - entrada;
  let parcela = financePaymentCents(financed, taxaBp, n, firstInOneMonth);
  if (taxaBp !== 0) {
    const total = entrada + n * parcela;
    return { parcela, last: parcela, total, interest: Math.max(0, total - preco) };
  }
  let last = financed - (n - 1) * parcela;
  if (last < 1) {
    parcela = Math.max(1, Math.floor(financed / n));
    last = financed - (n - 1) * parcela;
  }
  if (last < 1) return { parcela, last: parcela, total: entrada + n * parcela, interest: 0 };
  return { parcela, last, total: preco, interest: 0 };
}

export function calcAntesDeFinanciar(input: AntesInput, today?: IsoDate): CalcOutcome<AntesResult, AntesField> {
  const r = new FieldReader<AntesField>();
  const preco = r.read('preco', parseMoney(input.preco));
  const entradaRead = r.read('entrada', optionalEntry(input.entrada));
  const n = r.read('parcelas', parseCount(input.parcelas, ANTES_PARCELAS.min, ANTES_PARCELAS.max));
  const taxaBp = r.read('taxaMes', parsePercentBp(input.taxaMes, ANTES_RATE_RANGE));
  const renda = r.read('renda', optionalPositiveMoney(input.renda));
  const guardarRead = r.read('guardar', optionalPositiveMoney(input.guardar));
  const rendimentoBp = r.read('rendimento', optionalYield(input.rendimento));
  if (preco !== undefined && entradaRead !== undefined && entradaRead > preco) r.fail('entrada', 'fora_da_faixa');
  if (
    !r.ok ||
    preco === undefined ||
    entradaRead === undefined ||
    n === undefined ||
    taxaBp === undefined ||
    renda === undefined ||
    guardarRead === undefined ||
    rendimentoBp === undefined
  ) {
    return { ok: false, errors: r.errors };
  }

  const entrada = entradaRead;
  const firstInOneMonth = input.primeiraEmUmMes !== false;
  const financed = preco - entrada;
  const committed =
    input.comprometidoCents !== undefined && input.comprometidoCents !== null && Number.isSafeInteger(input.comprometidoCents) && input.comprometidoCents >= 0
      ? input.comprometidoCents
      : null;
  const calendar = (months: number): IsoMonth | null => (today === undefined ? null : addMonths(monthOf(today), months));

  const estimateNote = ANTES_ESTIMATE_TEXT;
  if (financed === 0) {
    return {
      ok: true,
      result: {
        precoCents: preco,
        entradaCents: entrada,
        financedCents: 0,
        parcelas: n,
        taxaBp,
        firstInOneMonth,
        nothingToFinance: true,
        parcelaCents: 0,
        lastParcelaCents: 0,
        totalCents: entrada,
        interestCents: 0,
        noInterest: true,
        lastMonth: null,
        rendaCents: renda,
        parcelaPermille: null,
        committedBeforePermille: null,
        committedAfterPermille: null,
        savingTargetCents: 0,
        savingMonthlyCents: 0,
        savingMonths: null,
        rendimentoBp,
        biggerEntries: [],
        savingLines: [],
        entryLines: [],
        noteParams: null,
        goalParams: null,
        resultLines: ['Com a entrada igual ao preço à vista, não há o que financiar.', `Você paga ${brl(preco)} na compra, sem juros.`],
        hypotheses: [],
        notes: [],
      },
    };
  }

  // 1. Financiar
  const { parcela, last: lastParcela, total, interest } = financeSchedule(preco, entrada, taxaBp, n, firstInOneMonth);
  const noInterest = taxaBp === 0 || total <= preco;
  const lastDiffers = lastParcela !== parcela;
  const lastOffset = firstInOneMonth ? n : n - 1;
  const lastMonth = calendar(lastOffset);

  const resultLines: string[] = [];
  resultLines.push(`Com estes números, ${n === 1 ? 'é' : 'são'} ${parcelasText(n)} de ${brl(parcela)}.`);
  const paidAtPurchase = n === 1 && !firstInOneMonth;
  if (paidAtPurchase) resultLines.push('Você paga tudo na compra.');
  else resultLines.push(`Você paga por ${monthsDuration(n)}${firstInOneMonth ? '' : ', a primeira na compra'}${lastMonth ? `, até ${formatMonthYearBR(lastMonth)}` : ''}.`);
  const installmentsText = lastDiffers ? `${n - 1} × ${brl(parcela)} e uma última de ${brl(lastParcela)}` : `${n} × ${brl(parcela)}`;
  resultLines.push(`Total pago: ${brl(total)} (${entrada > 0 ? `entrada de ${brl(entrada)} mais ` : ''}${installmentsText}).`);
  resultLines.push(noInterest ? 'Sem juros: o total pago é igual ou menor que o preço à vista.' : `Juros: ${brl(interest)}.`);

  // 2. Impacto na renda
  let parcelaPermille: number | null = null;
  let beforePermille: number | null = null;
  let afterPermille: number | null = null;
  const notes: string[] = [estimateNote];
  // Uma parcela só, paga na compra, não pesa mês a mês: sem as linhas de impacto na renda nem do comprometido.
  const showImpact = !paidAtPurchase;
  if (showImpact && renda !== null) {
    parcelaPermille = percentTenths(parcela, renda);
    resultLines.push(`A parcela seria ${formatPermille(parcelaPermille, parcela)} da sua renda.`);
    if (committed !== null) {
      beforePermille = percentTenths(committed, renda);
      afterPermille = percentTenths(committed + parcela, renda);
      resultLines.push(
        `Seu comprometido iria de ${formatPermille(beforePermille, committed)} para ${formatPermille(afterPermille, committed + parcela)} enquanto durar o financiamento.`,
      );
    }
    notes.push(`${COMMITTED_TEXT.debtReference} ${COMMITTED_TEXT.debtReferenceSource}`);
  } else if (showImpact && committed !== null && committed > 0) {
    resultLines.push(`Seu comprometido do mês iria de ${brl(committed)} para ${brl(committed + parcela)} enquanto durar o financiamento.`);
  }

  // 3. Juntar antes
  const target = financed;
  const guardarIsDefault = guardarRead === null;
  const monthly = guardarRead ?? parcela;
  const months = monthsToSave(target, monthly, rendimentoBp);
  const yieldText = rendimentoBp > 0 ? `com rendimento de ${formatBpCompact(rendimentoBp)} ao ano` : 'sem rendimento';
  const savingLines: string[] = [];
  const span = lastOffset === 0 ? '' : ` ao longo de ${monthsCount(n)}`;
  const financing = noInterest
    ? `Financiando: você usa o bem agora e não paga juros${span}.`
    : `Financiando: você usa o bem agora e paga ${brl(interest)} de juros${span}.`;
  if (months === null) {
    savingLines.push(`Guardando ${brl(monthly)} por mês, ${yieldText}, não dá para juntar ${brl(target)} em 50 anos.`);
    savingLines.push(financing);
  } else {
    savingLines.push(`Guardando ${brl(monthly)} por mês, ${yieldText}, você junta ${brl(target)} em ${monthsDuration(months)}.`);
    savingLines.push(financing);
    savingLines.push(
      `Juntando: leva ${monthsCount(months)} para juntar o que falta para comprar à vista e não paga juros do financiamento.`,
    );
  }

  // 4. Entrada maior
  const biggerEntries: AntesEntradaMaior[] = [];
  for (const percent of ANTES_EXTRA_ENTRY_PERCENTS) {
    const extra = percentOfPrice(preco, percent);
    const novaEntrada = entrada + extra;
    if (extra < 1 || novaEntrada >= preco) continue;
    const { parcela: novaParcela, interest: novoJuros } = financeSchedule(preco, novaEntrada, taxaBp, n, firstInOneMonth);
    biggerEntries.push({
      percent,
      extraCents: extra,
      entradaCents: novaEntrada,
      parcelaCents: novaParcela,
      interestCents: novoJuros,
      parcelaDiffCents: Math.max(0, parcela - novaParcela),
      interestDiffCents: Math.max(0, interest - novoJuros),
    });
  }
  const entryLines = biggerEntries.map((e) => {
    const less = e.interestDiffCents > 0 ? ` (${brl(e.interestDiffCents)} a menos)` : '';
    return `Com mais ${e.percent}% do preço na entrada (${brl(e.extraCents)}): parcela de ${brl(e.parcelaCents)} e juros de ${brl(e.interestCents)}${less}.`;
  });

  // Hipóteses, sempre visíveis
  const hypotheses: string[] = [
    firstInOneMonth ? 'Parcelas iguais (tabela Price), a primeira 1 mês depois da compra.' : 'Parcelas iguais (tabela Price), a primeira paga na compra e as outras a cada mês.',
    taxaBp === 0
      ? lastDiffers
        ? `Sem juros informados: a parcela é o valor financiado dividido pelas parcelas, no centavo, e a última (${brl(lastParcela)}) absorve a diferença do arredondamento.`
        : 'Sem juros informados: a parcela é o valor financiado dividido pelas parcelas, no centavo.'
      : 'Só a taxa de juros informada, sem tarifas, seguros e IOF.',
  ];
  if (showImpact && renda !== null) hypotheses.push('Percentuais sobre a renda líquida por mês que você informou aqui.');
  if (showImpact && committed !== null) hypotheses.push('O comprometido é o do mês atual, com as contas a pagar já criadas; os meses seguintes podem ser diferentes.');
  hypotheses.push(
    entrada > 0
      ? `Juntar para comprar à vista: o valor a juntar é o que falta, o preço menos a entrada de ${brl(entrada)} que você já tem: ${brl(financed)}.`
      : `Juntar para comprar à vista: o valor a juntar é o preço inteiro, ${brl(preco)}.`,
  );
  hypotheses.push(guardarIsDefault ? 'Valor guardado por mês: o da parcela, a menos que você informe outro.' : 'Valor guardado por mês: o que você informou.');
  hypotheses.push(
    rendimentoBp > 0
      ? `Rendimento de ${formatBpCompact(rendimentoBp)} ao ano (${monthlyRateText(rendimentoBp)} ao mês, taxa equivalente), informado por você, constante no período e sem imposto ou taxas.`
      : 'Sem rendimento: o valor guardado não cresce.',
  );
  hypotheses.push('Depósitos no início de cada mês, como na Calculadora do Cidadão do Banco Central; prazo em meses inteiros, para cima.');
  hypotheses.push('O preço do bem pode mudar enquanto você junta.');
  if (biggerEntries.length > 0) hypotheses.push('Entrada maior: soma 10% e 20% do preço à vista à entrada, com a mesma taxa e o mesmo número de parcelas.');

  const goalMonths = months;
  const goalParams: AntesGoalParams | null =
    today !== undefined && goalMonths !== null && goalMonths >= 1 && goalMonths <= SIMULATE_MONTHS_MAX && target >= 1 && target <= MAX_RECORD_CENTS
      ? {
          tipo: 'objetivo',
          valor: target,
          prazo: formatMonthInputBR(addMonths(monthOf(today), goalMonths - 1)),
          mensal: monthly >= 1 && monthly <= MAX_RECORD_CENTS ? monthly : null,
        }
      : null;

  return {
    ok: true,
    result: {
      precoCents: preco,
      entradaCents: entrada,
      financedCents: financed,
      parcelas: n,
      taxaBp,
      firstInOneMonth,
      nothingToFinance: false,
      parcelaCents: parcela,
      lastParcelaCents: lastParcela,
      totalCents: total,
      interestCents: interest,
      noInterest,
      lastMonth,
      rendaCents: renda,
      parcelaPermille,
      committedBeforePermille: beforePermille,
      committedAfterPermille: afterPermille,
      savingTargetCents: target,
      savingMonthlyCents: monthly,
      savingMonths: months,
      rendimentoBp,
      biggerEntries,
      savingLines,
      entryLines,
      noteParams:
        n >= 2
          ? { tipo: 'parcelada', natureza: 'financiamento', parcelas: n, ...(parcela <= MAX_RECORD_CENTS ? { valor: parcela } : {}) }
          : null,
      goalParams,
      resultLines,
      hypotheses,
      notes,
    },
  };
}
