import { describe, expect, it } from 'vitest';
import { reserveEssentialBaseCents, validateGoalDraft, type EssentialEstimate } from '../src';
import { essentialSourceFor, savingsInitialStage, savingsNeedsStageChoice } from '../../../apps/app/src/lib/essentials';
import { statusAttemptMatches } from '../../../apps/app/src/lib/goal-status-attempt';

/** Regras puras das telas de reserva e de meta (lib do app, lidas direto como em privacy-app.test.ts). */

const minimum = { essentialBaseCents: 10_000, essentialBaseSource: 'reserva_minima', essentialMonths: 1 } as const;
const estimate: EssentialEstimate = { amountCents: 250_000, source: 'media_gastos' } as EssentialEstimate;
const noEstimate: EssentialEstimate = { amountCents: null, source: 'informado' } as EssentialEstimate;

describe('essentialSourceFor: reserva mínima', () => {
  it('a base da reserva mínima não é gasto essencial (reserveEssentialBaseCents)', () => {
    expect(reserveEssentialBaseCents(minimum)).toBeNull();
  });

  it('reserva_minima só sobrevive com o mesmo valor e 1 mês; com outro prazo vira informado', () => {
    const saved = { cents: 10_000, source: 'reserva_minima' } as const;
    expect(essentialSourceFor(10_000, noEstimate, saved, 1)).toBe('reserva_minima');
    expect(essentialSourceFor(10_000, noEstimate, saved)).toBe('reserva_minima');
    expect(essentialSourceFor(10_000, noEstimate, saved, 3)).toBe('informado');
    expect(essentialSourceFor(10_000, noEstimate, saved, null)).toBe('informado');
    expect(essentialSourceFor(20_000, noEstimate, saved, 1)).toBe('informado');
  });

  it('origens reais (média, contas do mês, informado) seguem como antes', () => {
    expect(essentialSourceFor(250_000, estimate, null, 3)).toBe('media_gastos');
    expect(essentialSourceFor(300_000, estimate, { cents: 300_000, source: 'contas_do_mes' }, 6)).toBe('contas_do_mes');
    expect(essentialSourceFor(null, estimate, null, 3)).toBe('informado');
  });

  it('reserva mínima de R$ 100,00 editada para 3 meses é aceita (essenciais digitados, origem informado)', () => {
    const base = reserveEssentialBaseCents(minimum);
    expect(base).toBeNull();
    const source = essentialSourceFor(200_000, noEstimate, null, 3);
    const checked = validateGoalDraft(
      { goalType: 'emergencia', name: 'Reserva para imprevistos', targetText: '', essentialBaseText: '2.000,00', essentialMonthsText: '3', essentialBaseSource: source, targetMonthText: '', initialText: '', plannedText: '' },
      '2026-10-10',
      { mode: 'editar', originalTargetMonth: null },
    );
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.input.targetCents).toBe(600_000);
  });

  it('o rascunho antigo (R$ 100,00, 3 meses, reserva_minima) continua recusado', () => {
    const checked = validateGoalDraft(
      { goalType: 'emergencia', name: 'Reserva para imprevistos', targetText: '', essentialBaseText: '100,00', essentialMonthsText: '3', essentialBaseSource: 'reserva_minima', targetMonthText: '', initialText: '', plannedText: '' },
      '2026-10-10',
      { mode: 'editar', originalTargetMonth: null },
    );
    expect(checked.ok).toBe(false);
  });
});

describe('plano de guardar: etapa da reserva', () => {
  it('reserva mínima (1 mês): nenhuma etapa pré-marcada e a escolha é obrigatória', () => {
    expect(savingsInitialStage(minimum)).toBeNull();
    expect(savingsNeedsStageChoice(minimum)).toBe(true);
  });

  it('reserva de 1, 3 ou 6 meses dos gastos essenciais pré-marca a própria etapa', () => {
    for (const m of [1, 3, 6]) {
      const reserve = { essentialBaseCents: 200_000, essentialBaseSource: 'informado', essentialMonths: m } as const;
      expect(savingsInitialStage(reserve)).toBe(`reserva-${m}`);
      expect(savingsNeedsStageChoice(reserve)).toBe(false);
    }
  });

  it('reserva de outro prazo exige escolha; sem reserva vale o padrão do core', () => {
    const twelve = { essentialBaseCents: 200_000, essentialBaseSource: 'informado', essentialMonths: 12 } as const;
    expect(savingsInitialStage(twelve)).toBeNull();
    expect(savingsNeedsStageChoice(twelve)).toBe(true);
    expect(savingsInitialStage(null)).toBeNull();
    expect(savingsNeedsStageChoice(null)).toBe(false);
  });
});

describe('statusAttemptMatches: Arquivar perdido e depois Reativar', () => {
  const archive = JSON.stringify(['situacao', 'g1', 3, 'arquivada']);
  it('só aceita a tentativa que pedia a mesma situação', () => {
    expect(statusAttemptMatches(archive, 'arquivada')).toBe(true);
    expect(statusAttemptMatches(archive, 'ativa')).toBe(false);
    expect(statusAttemptMatches(archive, 'concluida')).toBe(false);
  });
  it('snapshot de outra ação ou ilegível nunca é aceito', () => {
    expect(statusAttemptMatches(JSON.stringify(['excluir', 'g1', 3]), 'arquivada')).toBe(false);
    expect(statusAttemptMatches('não é json', 'ativa')).toBe(false);
    expect(statusAttemptMatches('null', 'ativa')).toBe(false);
  });
});
