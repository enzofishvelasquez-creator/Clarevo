import { monthsToReach } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, countField, monthsCount, monthsDuration, moneyField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { formatInteger } from '../learn/format';
import { parseCount, parseMoney, parseOptionalMoney } from './inputs';

/**
 * 5. Reserva para imprevistos (docs/08 §3.2). alvo = essenciais × meses; cobertura em décimos de mês =
 * piso(guardado × 10 ÷ essenciais); prazo = teto((alvo − guardado) ÷ por mês). Sem rendimento. Não diz onde guardar.
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

export interface ReservaResult extends CalcTexts {
  essenciaisCents: Cents;
  meses: number;
  targetCents: Cents;
  guardadoCents: Cents | null;
  mensalCents: Cents | null;
  /** Meses cobertos pelo que já está guardado, em décimos (piso); null sem "já guardado". */
  coverageTenths: number | null;
  /** alvo − guardado, nunca negativo. */
  missingCents: Cents;
  /** Meses até completar guardando "por mês"; null sem esse valor ou sem nada faltando. */
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
  const monthsToTarget = mensal !== null && mensal > 0 && missing > 0 ? monthsToReach(missing, mensal) : null;

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
  if (monthsToTarget !== null) {
    resultLines.push(`Guardando ${formatBRL(mensal!)} por mês, a reserva fica completa em ${monthsDuration(monthsToTarget)}.`);
  }

  const hypotheses = ['Sem rendimento: o valor guardado não cresce com juros.', 'Gastos essenciais iguais em todos os meses.'];
  if (guardado !== null && guardado > 0 && missing > 0) hypotheses.push('Meses cobertos arredondados para baixo, em décimos de mês.');
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
      monthsToTarget,
      reference: RESERVA_REFERENCIA,
      resultLines,
      hypotheses,
      notes: [],
    },
  };
}
