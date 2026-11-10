import { describe, expect, it } from 'vitest';
import {
  CALC_UI_TEXT,
  COMMITTED_LINK_TEXT,
  GOALS_TEXT,
  KIND_SWITCH_TEXT,
  RESERVE_REFRESH_DIFF_PERMILLE,
  SERIES_CARD_TEXT,
  SIMULATE_TEXT,
  reserveRefreshSuggestion,
  type EssentialEstimate,
  type Goal,
} from '../src';

/** A reserva fictícia: base de R$ 3.000,00 por mês, 6 meses (alvo R$ 18.000,00). */
const reserve = (extra: Partial<Goal> = {}): Pick<Goal, 'goalType' | 'status' | 'essentialBaseCents' | 'essentialMonths' | 'essentialBaseSource'> => ({
  goalType: 'emergencia',
  status: 'ativa',
  essentialBaseCents: 300_000,
  essentialMonths: 6,
  essentialBaseSource: 'informado',
  ...extra,
});
const average = (cents: number, months = ['2026-07', '2026-08', '2026-09']): EssentialEstimate => ({
  source: 'media_gastos',
  amountCents: cents,
  months,
  byCategory: [{ category: 'Moradia', cents: cents * months.length }],
  excludedAnnualCents: 0,
});

describe('D-091 F: atualizar a reserva com os registros', () => {
  it('com 3 meses anotados e a média 15% ou mais longe da base, sugere a base nova com os mesmos meses', () => {
    expect(RESERVE_REFRESH_DIFF_PERMILLE).toBe(150);
    expect(reserveRefreshSuggestion(reserve(), average(360_000))).toEqual({
      currentBaseCents: 300_000,
      newBaseCents: 360_000,
      months: 6,
      newTargetCents: 2_160_000,
      averageMonths: 3,
    });
    // Para baixo, só quando a base já veio da média dos registros (um valor informado pode ter gastos que não são anotados).
    expect(reserveRefreshSuggestion(reserve({ essentialBaseSource: 'media_gastos' }), average(250_000))?.newTargetCents).toBe(1_500_000);
    expect(reserveRefreshSuggestion(reserve(), average(250_000))).toBeNull();
    expect(reserveRefreshSuggestion(reserve({ essentialBaseSource: 'contas_do_mes' }), average(250_000))).toBeNull();
    expect(reserveRefreshSuggestion(reserve({ essentialBaseSource: 'contas_do_mes' }), average(360_000))).not.toBeNull();
    // Exatamente 15% conta; menos que isso, não.
    expect(reserveRefreshSuggestion(reserve(), average(345_000))).not.toBeNull();
    expect(reserveRefreshSuggestion(reserve(), average(344_999))).toBeNull();
  });

  it('sem 3 meses anotados, sem média, com a reserva mínima, concluída, arquivada ou sem base, nada a sugerir', () => {
    expect(reserveRefreshSuggestion(reserve(), average(360_000, ['2026-08', '2026-09']))).toBeNull();
    expect(reserveRefreshSuggestion(reserve(), { source: 'contas_do_mes', amountCents: 360_000, month: '2026-10' })).toBeNull();
    expect(reserveRefreshSuggestion(reserve(), { source: 'informado', amountCents: null })).toBeNull();
    expect(reserveRefreshSuggestion(reserve({ essentialBaseSource: 'reserva_minima' }), average(360_000))).toBeNull();
    expect(reserveRefreshSuggestion(reserve({ status: 'concluida' }), average(360_000))).toBeNull();
    expect(reserveRefreshSuggestion(reserve({ status: 'arquivada' }), average(360_000))).toBeNull();
    expect(reserveRefreshSuggestion(reserve({ essentialBaseCents: null }), average(360_000))).toBeNull();
    expect(reserveRefreshSuggestion(reserve({ goalType: 'objetivo' }), average(360_000))).toBeNull();
    expect(reserveRefreshSuggestion(null, average(360_000))).toBeNull();
    expect(reserveRefreshSuggestion(reserve(), null)).toBeNull();
  });

  it('o texto diz a média, os meses e a base de hoje, e que nada muda sozinho', () => {
    const R = GOALS_TEXT.reserve;
    expect(R.refreshBody(3, 360_000, 300_000)).toBe(
      'Nos 3 meses mais recentes com registros, moradia, mercado, transporte, saúde e educação ficam em média R$ 3.600,00 por mês. A reserva usa R$ 3.000,00.',
    );
    expect(R.refreshNote).toMatch(/Nada muda sozinho/);
  });
});

describe('D-091: textos de navegação (docs/10)', () => {
  it('um nome só para o simulador, e as frases novas seguem as regras de redação', () => {
    expect(SIMULATE_TEXT.learnShortcut).toBe('Simular um plano');
    expect(CALC_UI_TEXT.simulateTitle).toBe('Simular um plano');
    expect(CALC_UI_TEXT.learnCardCaption).toMatch(/simular um plano/);
    const all = [
      ...Object.values(KIND_SWITCH_TEXT),
      ...Object.values(SERIES_CARD_TEXT),
      ...Object.values(COMMITTED_LINK_TEXT),
      CALC_UI_TEXT.simulateTitle,
      CALC_UI_TEXT.simulateCaption,
      CALC_UI_TEXT.reserveExists,
      CALC_UI_TEXT.reserveSee,
      GOALS_TEXT.reserve.refreshTitle,
      GOALS_TEXT.reserve.refreshAction,
      GOALS_TEXT.reserve.refreshLater,
      GOALS_TEXT.reserve.refreshNote,
      GOALS_TEXT.reserve.refreshBody(3, 360_000, 300_000),
    ];
    for (const t of all) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fazer sentido/i);
      expect(t).not.toMatch(/\bo Clarevo\b/);
    }
    expect(KIND_SWITCH_TEXT).toEqual({ toIncome: 'É um recebimento? Registrar recebimento', toExpense: 'É um gasto? Anotar gasto' });
    expect(SERIES_CARD_TEXT.asCardPurchase).toBe('Anotar como compra no cartão');
  });
});
