import { equivalentAnnualRate, impliedMonthlyRate } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, countField, moneyField, rateText, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney } from './inputs';

/**
 * 1. Parcelado ou à vista? (docs/08 §3.2; spec4 §1.2). Modo 'compra' (padrão) e modo 'cota-unica' (contas do ano).
 * diferença = n × parcela − à vista; taxa i por bisseção em à vista = parcela × (1 − (1 + i)^−n) ÷ i; com a primeira
 * parcela na compra (ou junto com a cota única), financiado = à vista − parcela, em n − 1 parcelas; ao ano = (1 + i)^12 − 1.
 */
export type ParceladoModo = 'compra' | 'cota-unica';
export type FormaPagamento = 'boleto' | 'debito' | 'cartao';
export type ParceladoField = 'aVista' | 'parcelas' | 'parcela' | 'primeiraNaCompra' | 'formaPagamento';

export interface ParceladoInput {
  /** Ausente: 'compra'. */
  modo?: ParceladoModo;
  aVista: string;
  /** 2 a 480 ('compra'); 2 a 12 ('cota-unica'). */
  parcelas: string;
  parcela: string;
  /** 'compra': "A primeira parcela é paga na compra?" (padrão Não). 'cota-unica': "vence junto com a cota única?" (padrão Sim). */
  primeiraNaCompra: boolean;
  /** Só no modo 'compra'; opcional. */
  formaPagamento?: FormaPagamento | null;
}

export interface ParceladoResult extends CalcTexts {
  modo: ParceladoModo;
  parcelas: number;
  parcelaCents: Cents;
  aVistaCents: Cents;
  /** n × parcela. */
  totalCents: Cents;
  /** Total − à vista (pode ser zero ou negativo: sem juros embutidos). */
  differenceCents: Cents;
  /** Valor financiado e número de parcelas usados na taxa (descontada a primeira, quando paga na compra). */
  financedCents: Cents;
  financedInstallments: number;
  noInterest: boolean;
  /** Taxa ao mês e ao ano (frações, sem arredondar); null sem juros ou quando a primeira parcela já cobre o preço. */
  monthlyRate: number | null;
  annualRate: number | null;
  /**
   * Botão depois do resultado (só no modo 'compra'): 'anotar_parcelamento' fora do cartão (ou sem forma escolhida),
   * 'aviso_cartao' com cartão de crédito (o app mostra o aviso de fatura que já existe); null no modo 'cota-unica'.
   */
  action: 'anotar_parcelamento' | 'aviso_cartao' | null;
  /** Parâmetros de /gastos-fixos/novo?tipo=parcelada (valor em centavos), quando action = 'anotar_parcelamento'. */
  noteParams: { tipo: 'parcelada'; parcelas: number; valor: Cents } | null;
}

export const PARCELADO_RANGE = { compra: { min: 2, max: 480 }, 'cota-unica': { min: 2, max: 12 } } as const;

export const PARCELADO_FIELDS: Record<ParceladoField, CalcFieldSpec> = {
  aVista: moneyField('Preço à vista', 'o preço à vista', '1.080,00'),
  parcelas: countField('Número de parcelas', 'o número de parcelas', 2, 480, 'Use de 2 a 480 parcelas.', 'De 2 a 480'),
  parcela: moneyField('Valor de cada parcela', 'o valor de cada parcela', '120,00'),
  primeiraNaCompra: {
    label: 'A primeira parcela é paga na compra?',
    kind: 'sim_nao',
    default: false,
    options: [
      { value: 'nao', label: 'Não' },
      { value: 'sim', label: 'Sim' },
    ],
  },
  formaPagamento: {
    label: 'Como vai pagar as parcelas?',
    kind: 'opcao',
    optional: true,
    options: [
      { value: 'boleto', label: 'Boleto ou carnê' },
      { value: 'debito', label: 'Débito ou Pix' },
      { value: 'cartao', label: 'Cartão de crédito' },
    ],
  },
};

/** Modo cota única: sem formaPagamento; a primeira parcela vence junto com a cota única por padrão. */
export const COTA_UNICA_FIELDS: Record<Exclude<ParceladoField, 'formaPagamento'>, CalcFieldSpec> = {
  aVista: moneyField('Valor da cota única', 'o valor da cota única', '2.400,00'),
  parcelas: countField('Número de parcelas', 'o número de parcelas', 2, 12, 'Use de 2 a 12 parcelas.', 'De 2 a 12'),
  parcela: moneyField('Valor de cada parcela', 'o valor de cada parcela', '480,00'),
  primeiraNaCompra: {
    label: 'A primeira parcela vence junto com a cota única?',
    kind: 'sim_nao',
    default: true,
    options: [
      { value: 'nao', label: 'Não' },
      { value: 'sim', label: 'Sim' },
    ],
  },
};

export function calcParceladoOuAVista(input: ParceladoInput): CalcOutcome<ParceladoResult, ParceladoField> {
  const modo: ParceladoModo = input.modo === 'cota-unica' ? 'cota-unica' : 'compra';
  const cota = modo === 'cota-unica';
  const range = PARCELADO_RANGE[modo];
  const r = new FieldReader<ParceladoField>();
  const aVista = r.read('aVista', parseMoney(input.aVista));
  const n = r.read('parcelas', parseCount(input.parcelas, range.min, range.max));
  const parcela = r.read('parcela', parseMoney(input.parcela));
  if (!r.ok || aVista === undefined || n === undefined || parcela === undefined) return { ok: false, errors: r.errors };

  const first = input.primeiraNaCompra;
  const totalCents = n * parcela;
  const differenceCents = totalCents - aVista;
  const financedCents = first ? aVista - parcela : aVista;
  const financedInstallments = first ? n - 1 : n;
  const noInterest = differenceCents <= 0;
  const monthlyRate = noInterest || financedCents <= 0 ? null : impliedMonthlyRate(financedCents, parcela, financedInstallments);
  const annualRate = monthlyRate === null ? null : equivalentAnnualRate(monthlyRate);

  const base = cota ? 'a cota única' : 'o preço à vista';
  const resultLines: string[] = [];
  if (noInterest) {
    resultLines.push(`Não há juros embutidos: o total parcelado é igual ou menor que ${base}.`);
  } else {
    resultLines.push(
      cota
        ? `Com estes números, parcelar custa ${formatBRL(differenceCents)} a mais que a cota única.`
        : `Com estes números, o parcelado custa ${formatBRL(differenceCents)} a mais.`,
    );
    resultLines.push(
      monthlyRate !== null && annualRate !== null
        ? `Isso equivale a juros de ${rateText(monthlyRate)} ao mês (${rateText(annualRate)} ao ano).`
        : `Como a primeira parcela já cobre ${base}, não há uma taxa ao mês para mostrar.`,
    );
  }
  resultLines.push(`Total parcelado: ${formatBRL(totalCents)} (${n} × ${formatBRL(parcela)}).`);

  const hypotheses = [
    cota
      ? first
        ? 'Primeira parcela junto com a cota única e as outras a cada mês.'
        : 'Primeira parcela 1 mês depois da cota única e as outras a cada mês.'
      : first
        ? 'Primeira parcela paga na compra e as outras a cada mês.'
        : 'Primeira parcela 1 mês depois da compra e as outras a cada mês.',
    ...(monthlyRate !== null ? [`Taxa que iguala as parcelas ${cota ? 'à cota única' : 'ao preço à vista'}, com juros compostos.`] : []),
  ];

  const action: ParceladoResult['action'] = cota ? null : input.formaPagamento === 'cartao' ? 'aviso_cartao' : 'anotar_parcelamento';
  return {
    ok: true,
    result: {
      modo,
      parcelas: n,
      parcelaCents: parcela,
      aVistaCents: aVista,
      totalCents,
      differenceCents,
      financedCents,
      financedInstallments,
      noInterest,
      monthlyRate,
      annualRate,
      action,
      noteParams: action === 'anotar_parcelamento' ? { tipo: 'parcelada', parcelas: n, valor: parcela } : null,
      resultLines,
      hypotheses,
      notes: [],
    },
  };
}
