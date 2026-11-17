import { describe, expect, it } from 'vitest';
import {
  CALENDAR_TEXT,
  buildFinancialCalendar,
  calendarDayTitle,
  calendarMonthParams,
  calendarStartMonth,
  calendarStep,
  calendarTotalsLines,
  createDemoRepository,
  isCalendarMonth,
  lastBusinessDayOf,
  type CalendarInput,
  type Commitment,
} from '../src';

// Valores FICTÍCIOS (a demonstração e linhas montadas aqui).
const TODAY = '2026-10-07';

async function demoInput(month: string, opts: { personal?: boolean; goalDay?: number | null; investDay?: number | null } = {}): Promise<CalendarInput> {
  const repo = await createDemoRepository();
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  await repo.syncSeriesOccurrences(ctx);
  const personal = opts.personal ?? true;
  return {
    month,
    today: TODAY,
    commitments: await repo.listCommitmentsDueBetween(ctx, month, month),
    series: await repo.listSeries(ctx),
    goals: await repo.listGoals(ctx),
    personal,
    investments: personal ? await repo.listInvestments(ctx) : null,
    investmentPlan: personal ? await repo.getInvestmentPlan(ctx) : null,
    goalDepositDay: opts.goalDay ?? null,
    investmentDepositDay: opts.investDay ?? null,
  };
}

describe('calendário financeiro (D-105)', () => {
  it('outubro da demonstração: as contas do mês (paga e em aberto), sem previsão de série que já tem conta, e os aportes planejados no mês', async () => {
    const cal = buildFinancialCalendar(await demoInput('2026-10'));
    const flat = cal.days.flatMap((d) => d.items.map((i) => `${d.date} ${i.title} ${i.amountKind} ${i.amountCents}`));
    expect(flat).toEqual([
      '2026-10-05 Aluguel pago 250000',
      '2026-10-15 Internet previsto 15000',
      '2026-10-20 Condomínio previsto 50000',
    ]);
    // O previsto é o mesmo "Ainda a pagar" do Resumo (R$ 650,00); o pago fica à parte.
    expect(cal.totals.toPayCents).toBe(65_000);
    expect(cal.totals.toPayCount).toBe(2);
    expect(cal.totals.paidCents).toBe(250_000);
    expect(cal.totals.paidCount).toBe(1);
    // Sem o lembrete ligado, os aportes planejados ficam no mês, sem dia.
    expect(cal.undated.map((i) => `${i.kind} ${i.title} ${i.amountCents}`)).toEqual([
      'plano_aportes Plano de aportes 60000',
      'aporte_meta Reserva para imprevistos 50000',
      'aporte_meta Viagem de férias 48000',
    ]);
    expect(cal.totals.goalsPlannedCents).toBe(98_000);
    expect(cal.days[0]!.items[0]!.caption).toBe('Paga em 05/10/2026');
    expect(cal.days[1]!.items[0]!.caption).toBe('Conta a pagar · em aberto');
    expect(cal.days[1]!.title).toBe('Quinta, 15 de outubro');
    const lines = calendarTotalsLines(cal.totals);
    expect(lines.toPay).toBe('2 contas em aberto ou previstas. Valores previstos, separados do que já foi pago.');
    expect(lines.paid).toBe('Já pago: R$ 2.500,00 em 1 conta.');
    expect(lines.goals).toBe('Aportes planejados nas metas: R$ 980,00, previsto.');
    expect(lines.estimated).toBeNull();
  });

  it('novembro: a fatura do cartão, as contas criadas pela geração e a Luz estimada; o dia do lembrete leva os aportes para o dia', async () => {
    const cal = buildFinancialCalendar(await demoInput('2026-11', { goalDay: 5, investDay: 5 }));
    const flat = cal.days.flatMap((d) => d.items.map((i) => `${d.date} ${i.kind} ${i.title}`));
    expect(flat).toEqual([
      '2026-11-05 conta Aluguel',
      '2026-11-05 plano_aportes Plano de aportes',
      '2026-11-05 aporte_meta Reserva para imprevistos',
      '2026-11-05 aporte_meta Viagem de férias',
      '2026-11-10 fatura Fatura Cartão Exemplo',
      '2026-11-10 conta Financiamento do carro',
      '2026-11-10 conta Seguro do carro',
      '2026-11-12 conta Luz',
    ]);
    expect(cal.undated).toEqual([]);
    const invoice = cal.days.find((d) => d.date === '2026-11-10')!.items[0]!;
    expect(invoice.caption).toBe('Fatura de cartão · em aberto');
    expect(invoice.target).toEqual({ kind: 'conta', commitmentId: expect.any(String), invoice: { cardId: expect.any(String), month: '2026-11' } });
    // Aluguel 2.500 + fatura 550 + financiamento 850 + seguro 300 + luz 180 (estimada) = 4.380.
    expect(cal.totals.toPayCents).toBe(438_000);
    expect(cal.totals.toPayEstimatedCents).toBeGreaterThanOrEqual(18_000);
    expect(calendarTotalsLines(cal.totals).estimated).toMatch(/^Inclui R\$ [\d.,]+ em valores estimados\.$/);
  });

  it('meses além da janela de geração: gastos fixos e parcelas entram como previsão, com o toque no gasto fixo; o vencimento do investimento entra no dia', async () => {
    const cal = buildFinancialCalendar(await demoInput('2027-06'));
    const flat = cal.days.flatMap((d) => d.items.map((i) => `${d.date} ${i.kind} ${i.title} · ${i.caption}`));
    expect(flat).toContain('2027-06-01 vencimento_investimento Aplicação do banco · Vencimento do investimento');
    expect(flat).toContain('2027-06-05 previsto Aluguel · Gasto fixo · previsto');
    expect(flat).toContain('2027-06-10 previsto Financiamento do carro · Parcela 20 de 48 · prevista');
    expect(flat).toContain('2027-06-12 previsto Luz · Gasto fixo · previsto');
    // As assinaturas de exemplo começam em junho de 2027.
    expect(flat).toContain('2027-06-10 previsto Streaming (exemplo) · Gasto fixo · previsto');
    const luz = cal.days.flatMap((d) => d.items).find((i) => i.title === 'Luz')!;
    expect(luz.estimate).toBe(true);
    expect(luz.target.kind).toBe('gasto_fixo');
    const maturity = cal.days.flatMap((d) => d.items).find((i) => i.kind === 'vencimento_investimento')!;
    expect(maturity.amountCents).toBeNull();
    expect(maturity.target).toEqual({ kind: 'investimento', investmentId: expect.any(String) });
  });

  it('meses que já passaram não recebem previsão nem aportes planejados', async () => {
    const cal = buildFinancialCalendar(await demoInput('2026-09'));
    expect(cal.days.flatMap((d) => d.items).every((i) => i.kind === 'conta' || i.kind === 'fatura')).toBe(true);
    expect(cal.undated).toEqual([]);
    expect(cal.totals.goalsPlannedCount).toBe(0);
  });

  it('Família: sem investimentos, sem plano de aportes e sem a temporada do Imposto de Renda', async () => {
    const base = await demoInput('2027-02', { personal: false });
    const cal = buildFinancialCalendar(base);
    const kinds = [...cal.days.flatMap((d) => d.items), ...cal.undated].map((i) => i.kind);
    expect(kinds).not.toContain('plano_aportes');
    expect(kinds).not.toContain('vencimento_investimento');
    expect(kinds).not.toContain('informe_ir');
    // Mesmo com investimentos passados por engano, a Família não os mostra.
    const leaked = buildFinancialCalendar({ ...base, investments: [{ id: 'i', name: 'X', status: 'ativo', maturityOn: '2027-02-10' }], investmentPlan: { plannedMonthlyCents: 100 } });
    expect([...leaked.days.flatMap((d) => d.items), ...leaked.undated].some((i) => i.kind === 'vencimento_investimento' || i.kind === 'plano_aportes')).toBe(false);
  });

  it('Imposto de Renda: o informe no último dia útil de fevereiro e, de março a maio, a declaração sem data, mandando conferir a oficial', () => {
    const base: CalendarInput = {
      month: '2027-02',
      today: TODAY,
      commitments: [],
      series: [],
      goals: [],
      personal: true,
      investments: [],
      investmentPlan: null,
      goalDepositDay: null,
      investmentDepositDay: null,
    };
    // 28/02/2027 é domingo: o último dia útil é sexta, 26/02.
    expect(lastBusinessDayOf('2027-02')).toBe('2027-02-26');
    // 2026: 28/02 é sábado.
    expect(lastBusinessDayOf('2026-02')).toBe('2026-02-27');
    // 2028 (bissexto): 29/02 é terça.
    expect(lastBusinessDayOf('2028-02')).toBe('2028-02-29');
    const feb = buildFinancialCalendar(base);
    expect(feb.days.map((d) => `${d.date} ${d.items[0]!.title}`)).toEqual(['2027-02-26 Informes de rendimentos']);
    expect(feb.days[0]!.items[0]!.caption).toBe('Bancos, corretoras e quem pagou você entregam os informes até o último dia útil de fevereiro.');
    expect(CALENDAR_TEXT.itemA11y(feb.days[0]!.items[0]!)).toBe(
      'Informes de rendimentos. Bancos, corretoras e quem pagou você entregam os informes até o último dia útil de fevereiro. 26 de fevereiro.',
    );
    for (const m of ['2027-03', '2027-04', '2027-05']) {
      const cal = buildFinancialCalendar({ ...base, month: m });
      expect(cal.undated.map((i) => i.title)).toEqual(['Declaração do Imposto de Renda']);
      expect(cal.undated[0]!.caption).toBe('A Receita Federal define o prazo de cada ano. Confira a data oficial no site da Receita.');
      // Nenhuma data de prazo inventada no texto.
      expect(cal.undated[0]!.caption).not.toMatch(/\d/);
      expect(cal.undated[0]!.target).toEqual({ kind: 'tema', slug: 'imposto-de-renda' });
    }
    expect(buildFinancialCalendar({ ...base, month: '2027-06' }).empty).toBe(true);
    expect(buildFinancialCalendar({ ...base, month: '2027-01' }).empty).toBe(true);
  });

  it('metas: só ativas, com plano, sem ter chegado ao valor e até o prazo; o dia do lembrete vale até o fim do mês', () => {
    const goal = (id: string, extra: Partial<CalendarInput['goals'][number]> = {}) => ({
      id,
      name: id,
      goalType: 'objetivo' as const,
      status: 'ativa' as const,
      plannedMonthlyCents: 10_000,
      targetCents: 100_000,
      savedCents: 0,
      targetMonth: null,
      ...extra,
    });
    const cal = buildFinancialCalendar({
      month: '2026-11',
      today: TODAY,
      commitments: [],
      series: [],
      goals: [
        goal('A'),
        goal('Arquivada', { status: 'arquivada' }),
        goal('Sem plano', { plannedMonthlyCents: null }),
        goal('Alcançada', { savedCents: 100_000 }),
        goal('Prazo passou', { targetMonth: '2026-10' }),
        goal('Prazo no mês', { targetMonth: '2026-11' }),
      ],
      personal: false,
      investments: null,
      investmentPlan: null,
      goalDepositDay: 25,
      investmentDepositDay: null,
    });
    expect(cal.days.flatMap((d) => d.items.map((i) => `${d.date} ${i.title}`))).toEqual(['2026-11-25 A', '2026-11-25 Prazo no mês']);
    expect(cal.totals.goalsPlannedCents).toBe(20_000);
  });

  it('conta vencida diz "venceu em", sem cor nem cobrança; fatura paga pelo valor pago', () => {
    const c = (p: Partial<Commitment> & { id: string }): Commitment => ({
      contextId: 'ctx',
      description: p.id,
      amountCents: 10_000,
      currency: 'BRL',
      dueOn: '2026-10-02',
      category: null,
      status: 'aberto',
      payment: null,
      series: null,
      seriesOverride: false,
      amountIsEstimate: false,
      invoice: null,
      createdBy: 'p',
      version: 1,
      createdAt: '2026-10-01T12:00:00Z',
      updatedAt: '2026-10-01T12:00:00Z',
      ...p,
    });
    const cal = buildFinancialCalendar({
      month: '2026-10',
      today: TODAY,
      commitments: [
        c({ id: 'Água' }),
        c({ id: 'Fatura', status: 'quitado', invoice: { cardId: 'k', month: '2026-10', closingOn: '2026-09-25' }, payment: { recordId: 'r', amountCents: 9_000, paidOn: '2026-10-01', accountId: 'a' } }),
        c({ id: 'Outro mês', dueOn: '2026-11-02' }),
      ],
      series: [],
      goals: [],
      personal: true,
      investments: [],
      investmentPlan: null,
      goalDepositDay: null,
      investmentDepositDay: null,
    });
    const items = cal.days.flatMap((d) => d.items);
    expect(items.map((i) => `${i.title}: ${i.caption}`)).toEqual(['Fatura: Fatura paga em 01/10/2026', 'Água: Conta a pagar · venceu em 02/10/2026']);
    expect(cal.totals).toMatchObject({ toPayCents: 10_000, paidCents: 9_000 });
    expect(CALENDAR_TEXT.itemA11y(items[1]!)).toBe('Água, R$ 100,00. Conta a pagar · venceu em 02/10/2026. 2 de outubro.');
    expect(CALENDAR_TEXT.itemA11y({ ...items[1]!, estimate: true, date: null })).toBe('Água, R$ 100,00, valor estimado. Conta a pagar · venceu em 02/10/2026. No mês, sem dia marcado.');
  });

  it('seletor de mês: 24 meses para trás e 12 para a frente; o mês de hoje não vai no endereço', () => {
    expect(isCalendarMonth('2026-10', '2026-10')).toBe(true);
    expect(isCalendarMonth('2027-10', '2026-10')).toBe(true);
    expect(isCalendarMonth('2027-11', '2026-10')).toBe(false);
    expect(isCalendarMonth('2024-10', '2026-10')).toBe(true);
    expect(isCalendarMonth('2024-09', '2026-10')).toBe(false);
    expect(isCalendarMonth('2026-13', '2026-10')).toBe(false);
    expect(calendarStartMonth('2026-12', '2026-10')).toBe('2026-12');
    expect(calendarStartMonth(['2027-01'], '2026-10')).toBe('2027-01');
    expect(calendarStartMonth('xx', '2026-10')).toBe('2026-10');
    expect(calendarStep('2027-10', '2026-10', 1)).toBeNull();
    expect(calendarStep('2027-09', '2026-10', 1)).toBe('2027-10');
    expect(calendarMonthParams('2026-10', '2026-10')).toEqual({});
    expect(calendarMonthParams('2026-11', '2026-10')).toEqual({ mes: '2026-11' });
    expect(calendarDayTitle('2026-10-07', TODAY)).toBe('Hoje, 7 de outubro');
    expect(calendarDayTitle('2026-10-10', TODAY)).toBe('Sábado, 10 de outubro');
  });

  it('textos: sem travessão, previsto sempre rotulado, sem cobrança', () => {
    const all = JSON.stringify(CALENDAR_TEXT) + CALENDAR_TEXT.toPayCaption(2) + CALENDAR_TEXT.paidLine(100, 1) + CALENDAR_TEXT.goalsPlannedLine(100);
    expect(all).not.toMatch(/[\u2013\u2014]/);
    expect(all).not.toMatch(/atrasad|urgente|não esqueça/i);
    expect(CALENDAR_TEXT.toPayLabel).toContain('Previsto');
    expect(CALENDAR_TEXT.goalsPlannedLine(100)).toContain('previsto');
  });
});
