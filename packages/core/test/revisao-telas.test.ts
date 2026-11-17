import { describe, expect, it } from 'vitest';

import {
  ANALYSES_TEXT,
  CARDS_TEXT,
  DEMO_TODAY,
  INVESTMENT_GOAL_TEXT,
  INVESTMENT_TEXT,
  PAYABLES_LATER_TEXT,
  REPEAT_COMMITMENT_TEXT,
  createDemoRepository,
  goalDetailTexts,
  groupAnnualLater,
  groupLaterByMonth,
  laterMonthsShown,
  linkedInvestmentsSummary,
  monthOf,
  summarizeToPay,
  type GroupedCommitment,
} from '../src';

/** Revisão das telas antes dos testes com pessoas (16/11/2026): as regras novas que as telas usam. */

const monthOfRow = (g: GroupedCommitment) => monthOf(g.type === 'conta' ? g.commitment.dueOn : g.group.firstDueOn);

describe('Contas a pagar: "Próximos meses" por mês', () => {
  it('na demonstração, novembro fica à vista com as cinco contas; as faturas de dezembro a agosto ficam atrás de "Ver os próximos meses"', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const month = monthOf(DEMO_TODAY);
    const s = summarizeToPay(await repo.listCommitments(ctx, month), ctx, month, DEMO_TODAY);
    const groups = groupLaterByMonth(groupAnnualLater(s.later), monthOfRow);
    expect(groups.map((g) => g.title)).toEqual([
      'Novembro de 2026 · 5 contas',
      'Dezembro de 2026 · 1 conta',
      'Janeiro de 2027 · 1 conta',
      'Fevereiro de 2027 · 1 conta',
      'Março de 2027 · 1 conta',
      'Abril de 2027 · 1 conta',
      'Maio de 2027 · 1 conta',
      'Junho de 2027 · 1 conta',
      'Julho de 2027 · 1 conta',
      'Agosto de 2027 · 1 conta',
    ]);
    // Nenhuma linha some nem muda de ordem: os grupos juntos são a lista de antes.
    expect(groups.flatMap((g) => g.items)).toEqual(groupAnnualLater(s.later));
    const shown = laterMonthsShown(groups, month);
    expect(shown).toBe(1);
    const hidden = groups.slice(shown);
    expect(PAYABLES_LATER_TEXT.showMoreCaption(hidden.reduce((n, g) => n + g.items.length, 0), hidden[hidden.length - 1]!.month)).toBe('Mais 9 contas, até agosto de 2027');
    expect(PAYABLES_LATER_TEXT.showMore).toBe('Ver os próximos meses');
  });

  it('à vista: os meses até o mês seguinte; sem nenhum, o primeiro mês com conta; sem contas, nada', () => {
    expect(laterMonthsShown([{ month: '2026-11' }, { month: '2026-12' }], '2026-10')).toBe(1);
    expect(laterMonthsShown([{ month: '2027-02' }, { month: '2027-03' }], '2026-10')).toBe(1);
    expect(laterMonthsShown([], '2026-10')).toBe(0);
    expect(PAYABLES_LATER_TEXT.monthTitle('2026-11', 1)).toBe('Novembro de 2026 · 1 conta');
    expect(PAYABLES_LATER_TEXT.showMoreCaption(1, '2027-01')).toBe('Mais 1 conta, até janeiro de 2027');
  });
});

describe('Metas: o plano dito uma vez e os investimentos ligados fora do guardado', () => {
  it('com prazo e um plano do mesmo valor por mês, só a linha do prazo aparece (a viagem da demonstração)', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const trip = (await repo.listGoals(ctx)).find((g) => g.name === 'Viagem de férias')!;
    const t = goalDetailTexts(trip, await repo.listGoalMovements(trip.id), DEMO_TODAY);
    expect(t.deadline).toBe('Até julho de 2027: R$ 480,00 por mês, sem contar rendimentos.');
    expect(t.planned).toBeNull();
    // Com outro valor por mês, as duas linhas dizem coisas diferentes e ficam.
    const other = goalDetailTexts({ ...trip, plannedMonthlyCents: 30_000 }, await repo.listGoalMovements(trip.id), DEMO_TODAY);
    expect(other.deadline).toBe('Até julho de 2027: R$ 480,00 por mês, sem contar rendimentos.');
    expect(other.planned).toMatch(/^Você planejou guardar R\$ 300,00 por mês\./);
  });

  it('a reserva da demonstração tem um investimento ligado que não entra no guardado: a linha dos cards', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const reserve = (await repo.listGoals(ctx)).find((g) => g.goalType === 'emergencia')!;
    expect(reserve.valueSource).not.toBe('investimentos');
    const summary = linkedInvestmentsSummary(reserve.id, await repo.listInvestments(ctx), DEMO_TODAY)!;
    expect(INVESTMENT_GOAL_TEXT.notCounted(summary.valueCents)).toBe('Investimentos ligados: R$ 10.875,00, não somados ao guardado');
    expect(INVESTMENT_GOAL_TEXT.notCountedSeeA11y.startsWith(INVESTMENT_GOAL_TEXT.notCountedSee)).toBe(true);
  });
});

describe('textos novos das telas', () => {
  it('Movimentos, conta paga, Investir e cartões', () => {
    expect(ANALYSES_TEXT.rowTitle).toBe('Ver análises do mês');
    expect(ANALYSES_TEXT.rowA11y.startsWith(ANALYSES_TEXT.rowTitle)).toBe(true);
    expect(REPEAT_COMMITMENT_TEXT).toMatchObject({ button: 'Repetir esta conta', nextMonth: 'Só no próximo mês', monthly: 'Todo mês', yearly: 'Todo ano' });
    expect(INVESTMENT_TEXT.compare).toBe('Comparar com CDI, IPCA e poupança');
    // O aviso único do fim da aba diz tudo o que os quatro diziam.
    for (const part of ['A Clarevo não guarda, não movimenta nem indica investimentos.', 'não é recomendação de investimento', 'o que rendeu no passado não garante o futuro', 'não entram em Pago nem em Recebido']) {
      expect(INVESTMENT_TEXT.closingNote).toContain(part);
    }
    expect(CARDS_TEXT.addAnotherCard).toBe('Adicionar outro cartão');
    expect(CARDS_TEXT.invoice.payAfterClosing('2026-11-03')).toBe(
      'Esta fatura fecha em 03/11/2026. Depois disso, o pagamento pode ser registrado aqui. Se pagar antes, informe a data real do pagamento.',
    );
    for (const text of [ANALYSES_TEXT.rowCaption, INVESTMENT_TEXT.closingNote, PAYABLES_LATER_TEXT.showMoreCaption(9, '2027-08')]) {
      expect(text).not.toMatch(/[–—]/);
      expect(text).not.toMatch(new RegExp(['faz', 'sentido'].join(' '), 'i'));
    }
  });
});
