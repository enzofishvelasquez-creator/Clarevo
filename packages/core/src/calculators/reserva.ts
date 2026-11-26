import { monthsToReach } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, calcNotes, countField, monthsCount, monthsDuration, moneyField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { formatInteger } from '../learn/format';
import { parseCount, parseMoney, parseOptionalMoney } from './inputs';

/**
 * 6. Reserva para imprevistos (docs/08 §3.2). alvo = essenciais × meses; cobertura em décimos de mês =
 * piso(guardado × 10 ÷ essenciais); prazo = teto((alvo − guardado) ÷ por mês), dito nas hipóteses. Sem rendimento. Não diz onde
 * guardar.
 *
 * Revisão externa de 18/11/2026: falta = max(reserva − guardado, 0). Com falta 0, "reserva completa" e prazo 0 (nunca negativo); com
 * falta e R$ 0,00 por mês, não há divisão: a frase diz que não há previsão com esse valor.
 */
export type ReservaField = 'essenciais' | 'meses' | 'guardado' | 'mensal';

export interface ReservaInput {
  essenciais: string;
  /** 1 a 24 (chips 1, 3, 6 e 12, mais "Outro"; nenhum marcado no começo). */
  meses: string;
  /** Opcional. */
  guardado?: string;
  /** Opcional. */
  mensal?: string;
}

export interface ReservaReference {
  text: string;
  /** Endereço conferido da página; null enquanto não conferido (o app mostra só o texto, sem link). */
  url: string | null;
  /** Data da conferência do endereço (AAAA-MM-DD) ou null. */
  checkedOn: string | null;
}

/**
 * Referência mostrada com a calculadora (revisável). O endereço da página do Portal do Investidor não pôde ser
 * conferido neste ciclo (o site não abriu no ambiente de trabalho), então vale o texto sem link e sem número.
 * Quando a página for conferida, trocar por: text 'O Portal do Investidor, da CVM, fala em 6 a 12 meses de gastos,
 * conforme o tipo de renda.', url da página e checkedOn com a data.
 */
export const RESERVA_REFERENCIA: ReservaReference = {
  text: 'O Portal do Investidor, da CVM, explica como pensar em quantos meses guardar, conforme o tipo de renda.',
  url: null,
  checkedOn: null,
};

/** Chips de "Quantos meses cobrir", além de "Outro" (1 a 24). */
export const RESERVA_MONTH_CHIPS: readonly number[] = [1, 3, 6, 12];

export const RESERVA_TEXT = {
  /** Erro dos chips quando nenhum foi marcado; o campo "Outro" usa a mensagem do campo meses ("Digite ..."). */
  chooseMonths: 'Escolha quantos meses cobrir.',
} as const;

export interface ReservaResult extends CalcTexts {
  essenciaisCents: Cents;
  meses: number;
  targetCents: Cents;
  guardadoCents: Cents | null;
  mensalCents: Cents | null;
  /** Meses cobertos pelo que já está guardado, em décimos (piso); null sem "já guardado". */
  coverageTenths: number | null;
  /** max(alvo − guardado, 0). */
  missingCents: Cents;
  /** O que já está guardado cobre a reserva (falta 0). */
  reached: boolean;
  /** Meses até completar guardando "por mês": 0 com a reserva completa; null sem valor por mês ou com R$ 0,00 por mês e algo faltando. */
  monthsToTarget: number | null;
  reference: ReservaReference;
}

export const RESERVA_FIELDS: Record<ReservaField, CalcFieldSpec> = {
  essenciais: moneyField('Gastos essenciais por mês', 'os gastos essenciais por mês', '3.750,00', {
    hint: 'Moradia, mercado, contas da casa, saúde e transporte.',
  }),
  meses: countField('Quantos meses cobrir', 'quantos meses cobrir', 1, 24, 'Use de 1 a 24 meses.', 'Escolha 1, 3, 6 ou 12, ou outro de 1 a 24.'),
  guardado: moneyField('Quanto já tem guardado', 'quanto já tem guardado', '4.500,00', { optional: true }),
  mensal: moneyField('Quanto guarda por mês', 'quanto guarda por mês', '500,00', { optional: true }),
};

/** Décimos de mês: 12 → "1,2 mês", 20 → "2 meses", 25 → "2,5 meses". */
function tenthsOfMonth(tenths: number): string {
  const text = tenths % 10 === 0 ? formatInteger(tenths / 10) : `${formatInteger(Math.floor(tenths / 10))},${tenths % 10}`;
  return `${text} ${tenths < 20 ? 'mês' : 'meses'}`;
}

export function calcReserva(input: ReservaInput): CalcOutcome<ReservaResult, ReservaField> {
  const r = new FieldReader<ReservaField>();
  const essenciais = r.read('essenciais', parseMoney(input.essenciais));
  const meses = r.read('meses', parseCount(input.meses, 1, 24));
  const guardado = r.read('guardado', parseOptionalMoney(input.guardado));
  const mensal = r.read('mensal', parseOptionalMoney(input.mensal));
  if (!r.ok || essenciais === undefined || meses === undefined || guardado === undefined || mensal === undefined) {
    return { ok: false, errors: r.errors };
  }

  const target = essenciais * meses;
  const saved = guardado ?? 0;
  const missing = Math.max(0, target - saved);
  const coverageTenths = guardado === null ? null : Math.floor((guardado * 10) / essenciais);
  const reached = missing === 0;
  // Com falta 0, prazo 0; com algo faltando, só com um valor por mês maior que zero (sem divisão por zero).
  const monthsToTarget = reached ? 0 : mensal !== null && mensal > 0 ? monthsToReach(missing, mensal) : null;

  const resultLines = [`Com estes números, a reserva de ${monthsCount(meses)} é de ${formatBRL(target)}.`];
  if (guardado !== null && guardado > 0) {
    if (missing === 0) resultLines.push(`O que você já guardou cobre a reserva de ${monthsCount(meses)}.`);
    else {
      resultLines.push(
        coverageTenths === 0
          ? 'O que você já guardou cobre menos de 0,1 mês de gastos essenciais.'
          : `O que você já guardou cobre ${tenthsOfMonth(coverageTenths!)} de gastos essenciais.`,
      );
      resultLines.push(`Faltam ${formatBRL(missing)}.`);
    }
  }
  if (monthsToTarget !== null && monthsToTarget > 0) {
    resultLines.push(`Guardando ${formatBRL(mensal!)} por mês, a reserva fica completa em ${monthsDuration(monthsToTarget)}.`);
  } else if (!reached && mensal === 0) {
    resultLines.push(`Guardando ${formatBRL(0)} por mês, não há previsão para completar a reserva.`);
  }

  const hypotheses = ['Sem rendimento: o valor guardado não cresce com juros.', 'Gastos essenciais iguais em todos os meses.'];
  if (guardado !== null && guardado > 0 && missing > 0) hypotheses.push('Meses cobertos arredondados para baixo, em décimos de mês.');
  // Revisão de 17/11/2026: o prazo é teto(falta ÷ por mês), como em "Juntar para um objetivo"; as hipóteses agora dizem isso.
  if (monthsToTarget !== null && monthsToTarget > 0) {
    hypotheses.push('O mesmo valor guardado todo mês.');
    if (missing % mensal! !== 0) hypotheses.push('Prazo em meses inteiros, para cima: no último mês, falta menos que o valor de cada mês.');
  }
  return {
    ok: true,
    result: {
      essenciaisCents: essenciais,
      meses,
      targetCents: target,
      guardadoCents: guardado,
      mensalCents: mensal,
      coverageTenths,
      missingCents: missing,
      reached,
      monthsToTarget,
      reference: RESERVA_REFERENCIA,
      resultLines,
      hypotheses,
      ...calcNotes(),
    },
  };
}
