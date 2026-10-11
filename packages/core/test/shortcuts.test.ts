import { describe, expect, it } from 'vitest';
import {
  DEMO_TODAY,
  ORGANIZE_TEXT,
  createDemoRepository,
  payablesCaption,
  payablesCaptionFromSummary,
  seriesCaptionShort,
  shortcutA11yLabel,
  summarizeToPay,
} from '../src';

describe('Movimentos › Organizar: legendas', () => {
  it('Contas a pagar: neste mês, com vencidas, sem nada e em outros meses', () => {
    const cur = '2026-10';
    expect(payablesCaption({ openCents: 65_000, overdueCount: 1, month: cur, currentMonth: cur })).toBe('R$ 650,00 em aberto neste mês · 1 vencida');
    expect(payablesCaption({ openCents: 65_000, overdueCount: 2, month: cur, currentMonth: cur })).toBe('R$ 650,00 em aberto neste mês · 2 vencidas');
    expect(payablesCaption({ openCents: 65_000, overdueCount: 0, month: cur, currentMonth: cur })).toBe('R$ 650,00 em aberto neste mês');
    expect(payablesCaption({ openCents: 0, overdueCount: 0, month: cur, currentMonth: cur })).toBe('Nada em aberto neste mês');
    expect(payablesCaption({ openCents: 30_000, overdueCount: 0, month: '2026-11', currentMonth: cur })).toBe('R$ 300,00 em aberto em novembro');
    expect(payablesCaption({ openCents: 0, overdueCount: 0, month: '2026-11', currentMonth: cur })).toBe('Nada em aberto em novembro');
    expect(payablesCaption({ openCents: 30_000, overdueCount: 0, month: '2027-01', currentMonth: cur })).toBe('R$ 300,00 em aberto em janeiro de 2027');
  });

  it('mesma origem do card "Ainda a pagar" na demonstração', async () => {
    const repo = await createDemoRepository({ cards: false });
    const ctx = (await repo.getSpace())!.personalContextId;
    const oct = summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY);
    expect(payablesCaptionFromSummary(oct, DEMO_TODAY)).toBe('R$ 650,00 em aberto neste mês');
    const nov = summarizeToPay(await repo.listCommitments(ctx, '2026-11'), ctx, '2026-11', DEMO_TODAY);
    expect(payablesCaptionFromSummary(nov, DEMO_TODAY)).toBe('R$ 3.830,00 em aberto em novembro');
    // Dez dias depois, a Internet (15/10) está vencida.
    const later = summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', '2026-10-17');
    expect(payablesCaptionFromSummary(later, '2026-10-17')).toBe('R$ 650,00 em aberto neste mês · 1 vencida');
    expect(seriesCaptionShort(await repo.listSeries(ctx))).toBe('7 cadastrados, com as contas do ano');
  });

  it('Gastos fixos e parcelamentos: nenhum, 1 e vários', () => {
    expect(seriesCaptionShort([])).toBe('Nenhum cadastrado. Aluguel, escola, financiamento, IPVA');
    expect(seriesCaptionShort([{ kind: 'mensal' }])).toBe('1 cadastrado');
    expect(seriesCaptionShort([{ kind: 'mensal' }, { kind: 'parcelada' }, { kind: 'mensal' }])).toBe('3 cadastrados');
    expect(seriesCaptionShort([{ kind: 'mensal' }, { kind: 'anual' }, { kind: 'parcelada' }])).toBe('3 cadastrados, com as contas do ano');
  });

  it('nomes acessíveis e textos fixos', () => {
    expect(shortcutA11yLabel('Contas a pagar', 'R$ 650,00 em aberto neste mês · 1 vencida')).toBe('Contas a pagar, R$ 650,00 em aberto neste mês, 1 vencida');
    expect(ORGANIZE_TEXT.calculators).toEqual({ title: 'Calculadoras', caption: 'Parcelado ou à vista, dívidas, reserva e outras contas' });
    expect(ORGANIZE_TEXT.payables.title).toBe('Contas a pagar');
    expect(ORGANIZE_TEXT.series.title).toBe('Gastos fixos e parcelamentos');
  });
});
