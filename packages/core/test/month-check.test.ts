import { describe, expect, it } from 'vitest';
import {
  EVOLUTION_TEXT,
  MONTH_CHECK_KINDS,
  MONTH_CHECK_TEXT,
  MemoryFamilyHub,
  MemoryRepository,
  buildEvolutionView,
  buildReturnReview,
  checkKindOf,
  comparisonStats,
  evolutionPanel,
  evolutionPoints,
  evolutionSelectedMonth,
  evolutionVariation,
  isRepoError,
  loadReturnReview,
  monthCheckErrorText,
  monthCheckPlan,
  monthCheckState,
  monthCheckTextSamples,
  monthCheckValid,
  monthsOverview,
  newOperationKey,
  reviewMonthCard,
  returnWindow,
  type MonthOverview,
  type RepoError,
  type RepoErrorCode,
} from '../src';

/**
 * "Conferi este mês" (D-060, item 2; resolve P-022): o zero confirmado. Regras puras (estado e plano de cada mês e tipo), a Evolução
 * (estado `zero_confirmado`, que entra nas médias e na mediana como zero), "Seus últimos meses" (o mês conferido deixa de ser lacuna) e
 * o repositório em memória (as mesmas regras de set_month_check e clear_month_check, testadas no banco em 48_mes_conferido.sql).
 */

const key = () => newOperationKey();

async function expectCode(p: Promise<unknown>, code: RepoErrorCode, detail?: string) {
  let error: unknown = null;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(isRepoError(error, code), `esperava ${code}, veio ${error instanceof Error ? (error as RepoError).code : String(error)}`).toBe(true);
  if (detail !== undefined) expect((error as RepoError).detail).toBe(detail);
}

const row = (month: string, over: Partial<MonthOverview> = {}): MonthOverview => ({
  month,
  receivedCount: 0,
  receivedCents: 0,
  paidCount: 0,
  paidCents: 0,
  receivedChecked: false,
  paidChecked: false,
  ...over,
});

describe('monthCheckState e monthCheckPlan', () => {
  it('o mês atual e os futuros nunca se marcam; com registro do tipo não há o que conferir; sem registro, conferido ou a conferir', () => {
    const now = '2026-10';
    expect(monthCheckState(row('2026-10'), 'pagamentos', now)).toBe('nao_encerrado');
    expect(monthCheckState(row('2026-11'), 'recebimentos', now)).toBe('nao_encerrado');
    expect(monthCheckState(row('2026-09'), 'pagamentos', now)).toBe('sem_registros');
    expect(monthCheckState(row('2026-09', { paidChecked: true }), 'pagamentos', now)).toBe('conferido');
    // O registro vence a marca: a marca deixou de valer (o banco devolve false, e a conta confere com a contagem).
    expect(monthCheckState(row('2026-09', { paidCount: 1, paidCents: 100, paidChecked: true }), 'pagamentos', now)).toBe('com_registros');
    expect(monthCheckValid(row('2026-09', { paidCount: 1, paidCents: 100, paidChecked: true }), 'pagamentos')).toBe(false);
    // Os dois tipos são separados.
    const half = row('2026-09', { paidCount: 2, paidCents: 5_000, receivedChecked: true });
    expect(monthCheckState(half, 'recebimentos', now)).toBe('conferido');
    expect(monthCheckState(half, 'pagamentos', now)).toBe('com_registros');
    // Sem a marca no dado (linha antiga): sem marca.
    expect(monthCheckState({ month: '2026-09', receivedCount: 0, receivedCents: 0, paidCount: 0, paidCents: 0 }, 'recebimentos', now)).toBe('sem_registros');
  });

  it('o plano: o botão só com escrita, a frase de mês conferido a todos, o "Desfazer" só com escrita', () => {
    const now = '2026-10';
    const open = monthCheckPlan(row('2026-08'), 'pagamentos', now, true);
    expect(open).toMatchObject({
      state: 'sem_registros',
      action: 'Conferi: não houve gastos em agosto de 2026',
      actionNote: 'Não muda nenhum valor e você pode desfazer.',
      doneText: null,
      undo: null,
    });
    expect(monthCheckPlan(row('2026-08'), 'recebimentos', now, true).action).toBe('Conferi: não houve recebimentos em agosto de 2026');
    // Quem só lê não vê o botão.
    expect(monthCheckPlan(row('2026-08'), 'pagamentos', now, false)).toMatchObject({ state: 'sem_registros', action: null, actionNote: null, doneText: null, undo: null });
    const done = monthCheckPlan(row('2026-08', { paidChecked: true }), 'pagamentos', now, true);
    expect(done).toMatchObject({ state: 'conferido', action: null, doneText: 'Você conferiu: não houve gastos em agosto de 2026.', undo: 'Desfazer a conferência' });
    expect(done.undoA11y).toBe('Desfazer a conferência: não houve gastos em agosto de 2026');
    const reader = monthCheckPlan(row('2026-08', { receivedChecked: true }), 'recebimentos', now, false);
    expect(reader).toMatchObject({ state: 'conferido', doneText: 'Você conferiu: não houve recebimentos em agosto de 2026.', undo: null, undoA11y: null });
    // Mês atual e mês com registro: nada.
    for (const r of [row('2026-10'), row('2026-08', { paidCount: 1, paidCents: 1 })]) {
      expect(monthCheckPlan(r, 'pagamentos', now, true)).toMatchObject({ action: null, doneText: null, undo: null });
    }
  });

  it('os textos de recusa são os da tela, e o resto é a falha genérica de salvar', () => {
    expect(monthCheckErrorText('mes_com_registros')).toBe(MONTH_CHECK_TEXT.errors.mes_com_registros);
    expect(monthCheckErrorText('versao_desatualizada')).toBe(MONTH_CHECK_TEXT.errors.versao_desatualizada);
    expect(monthCheckErrorText('mes_invalido')).toBe('Só é possível conferir um mês que já terminou.');
    expect(monthCheckErrorText('qualquer_outro')).toBe(MONTH_CHECK_TEXT.failed);
    expect(MONTH_CHECK_KINDS).toEqual(['recebimentos', 'pagamentos']);
    expect(monthCheckTextSamples().length).toBeGreaterThan(20);
  });
});

describe('Evolução: zero confirmado (D04)', () => {
  /** Janeiro a junho com Pago em 320.000 a 360.000; março sem Pago e abril sem Recebido, a conferir. */
  const overview: MonthOverview[] = [
    row('2026-01', { paidCount: 10, paidCents: 320_000, receivedCount: 2, receivedCents: 500_000 }),
    row('2026-02', { paidCount: 11, paidCents: 340_000, receivedCount: 2, receivedCents: 500_000 }),
    row('2026-03', { receivedCount: 2, receivedCents: 500_000 }),
    row('2026-04', { paidCount: 13, paidCents: 780_000 }),
    row('2026-05', { paidCount: 14, paidCents: 345_000, receivedCount: 2, receivedCents: 500_000 }),
    row('2026-06', { paidCount: 15, paidCents: 360_000, receivedCount: 2, receivedCents: 510_000 }),
  ];
  const withMarch = overview.map((r) => (r.month === '2026-03' ? { ...r, paidChecked: true } : r));

  it('contagem 0 e a marca do tipo, num mês fechado, é zero_confirmado; sem a marca segue sem_registros; o outro tipo não herda', () => {
    const plain = evolutionPoints(overview, 'pago', '2026-07');
    expect(plain.find((p) => p.month === '2026-03')).toEqual({ month: '2026-03', cents: 0, count: 0, state: 'sem_registros' });
    const checked = evolutionPoints(withMarch, 'pago', '2026-07');
    expect(checked.find((p) => p.month === '2026-03')).toEqual({ month: '2026-03', cents: 0, count: 0, state: 'zero_confirmado' });
    // Recebido de março tem registros; a marca de Pago não o toca. Abril, sem Recebido, segue sem_registros (a marca de Pago não vale lá).
    const received = evolutionPoints(withMarch, 'recebido', '2026-07');
    expect(received.find((p) => p.month === '2026-03')!.state).toBe('com_registros');
    expect(received.find((p) => p.month === '2026-04')!.state).toBe('sem_registros');
    // Marca com registro no mês: com_registros (o registro vence).
    const stale = overview.map((r) => (r.month === '2026-04' ? { ...r, paidChecked: true } : r));
    expect(evolutionPoints(stale, 'pago', '2026-07').find((p) => p.month === '2026-04')!.state).toBe('com_registros');
    // O mês atual nunca é zero confirmado, mesmo com a marca no dado.
    const current = [...overview, row('2026-07', { paidChecked: true })];
    expect(evolutionPoints(current, 'pago', '2026-07').find((p) => p.month === '2026-07')!.state).toBe('sem_registros');
    expect(evolutionPoints([row('2026-08', { paidChecked: true })], 'pago', '2026-07')[0]!.state).toBe('sem_registros');
  });

  it('o zero confirmado entra na média e na mediana como zero, e conta em "n de N"', () => {
    const points = evolutionPoints(withMarch, 'pago', '2026-07');
    const s = comparisonStats(points, []);
    // 320.000 + 340.000 + 0 + 780.000 + 345.000 + 360.000 = 2.145.000, em seis meses: 357.500; mediana de 0, 320, 340, 345, 360 e 780 mil: 342.500.
    expect([s.eligibleCount, s.visibleCount, s.average, s.median]).toEqual([6, 6, 357_500, 342_500]);
    expect(s.canonicalTotal).toBe(2_145_000n);
    // Sem a marca, março fica fora (D04): cinco meses, média 429.000.
    const plain = comparisonStats(evolutionPoints(overview, 'pago', '2026-07'), []);
    expect([plain.eligibleCount, plain.average, plain.median]).toEqual([5, 429_000, 345_000]);
    // Tirar o zero da comparação volta ao cálculo de cinco meses, como qualquer mês escolhido.
    const without = comparisonStats(points, ['2026-03']);
    expect([without.eligibleCount, without.visibleCount, without.average, without.hiddenMonths]).toEqual([6, 5, 429_000, ['2026-03']]);
    // E o total é o mesmo com ou sem a marca: ela nunca muda um total.
    expect(plain.canonicalTotal).toBe(s.canonicalTotal);
  });

  it('a tela: "R$ 0,00, conferido" no ponto, na tabela e no painel; sem categorias, lançamentos nem "Entender o que mudou"', () => {
    const view = buildEvolutionView({ overview: withMarch, metric: 'pago', windowMonths: 12, currentMonth: '2026-07', hiddenMonths: [] });
    const march = view.points.find((p) => p.month === '2026-03')!;
    expect(march).toMatchObject({
      state: 'zero_confirmado',
      participation: 'na_comparacao',
      included: true,
      eligible: true,
      valueText: 'R$ 0,00',
      stateLabel: 'Conferido',
      stateText: 'Você conferiu: não houve gastos em março de 2026.',
      includedText: 'Sim',
    });
    expect(march.name).toBe('Março de 2026, R$ 0,00, conferido, na comparação');
    expect(march.name).toContain('R$ 0,00, conferido');
    expect(view.situation).toBe('normal');
    expect(view.eligibleCount).toBe(6);
    expect(view.stats.average).toBe(357_500);
    // O painel: o valor é R$ 0,00; a frase de mês conferido e "Desfazer" (com escrita); nada de categorias nem de lançamentos.
    const panel = evolutionPanel(view, '2026-03', true);
    expect(panel).toMatchObject({ state: 'zero_confirmado', valueText: 'R$ 0,00', canToggle: true, included: true, showsCategories: false, showsRecords: false, showsCategoriesAction: false });
    expect(panel.check).toMatchObject({ state: 'conferido', doneText: 'Você conferiu: não houve gastos em março de 2026.', undo: 'Desfazer a conferência', action: null });
    expect(panel.explain.visible).toBe(false);
    // A variação até o zero é um fato: de fevereiro para março, R$ 3.400,00 a menos (100% a menos).
    expect(evolutionVariation(view, '2026-03')).toMatchObject({ available: true, text: 'De fevereiro para março: R$ 3.400,00 a menos', percentText: '100% a menos que fevereiro' });
    // Quem só lê vê a frase, sem o botão.
    expect(evolutionPanel(view, '2026-03', false).check).toMatchObject({ doneText: 'Você conferiu: não houve gastos em março de 2026.', undo: null });
    // Abril tem "Entender o que mudou" com março (zero) como mês de comparação.
    const april = evolutionPanel(view, '2026-04');
    expect(april.explain).toMatchObject({ visible: true, baseMonth: '2026-03', baseCents: 0 });
  });

  it('sem a marca, o mês fechado segue sem registros, com a ação de conferir só para quem escreve (e nunca no mês atual)', () => {
    const view = buildEvolutionView({ overview, metric: 'pago', windowMonths: 6, currentMonth: '2026-07', hiddenMonths: [] });
    const march = evolutionPanel(view, '2026-03', true);
    expect(march.state).toBe('sem_registros');
    expect(march.valueText).toBeNull();
    expect(march.stateText).toBe('Sem registros: mês sem anotação não quer dizer mês sem gastos');
    expect(march.check).toMatchObject({ state: 'sem_registros', action: 'Conferi: não houve gastos em março de 2026', undo: null });
    expect(evolutionPanel(view, '2026-03', false).check).toMatchObject({ state: 'sem_registros', action: null });
    // Recebido: abril é o mês sem recebimentos, e o tipo é "recebimentos".
    const received = buildEvolutionView({ overview, metric: 'recebido', windowMonths: 6, currentMonth: '2026-07', hiddenMonths: [] });
    expect(evolutionPanel(received, '2026-04', true).check).toMatchObject({ kind: 'recebimentos', action: 'Conferi: não houve recebimentos em abril de 2026' });
    expect(checkKindOf('recebido')).toBe('recebimentos');
    expect(checkKindOf('pago')).toBe('pagamentos');
    // O mês atual sem registros: sem plano de conferência (ainda não terminou).
    const current = buildEvolutionView({ overview: [...overview, row('2026-07')], metric: 'pago', windowMonths: 6, currentMonth: '2026-07', hiddenMonths: [] });
    expect(evolutionPanel(current, '2026-07', true).check).toBeNull();
    // Mês com registros: sem plano.
    expect(evolutionPanel(view, '2026-05', true).check).toBeNull();
  });

  it('o painel abre no mais recente com lançamentos; sem nenhum, no conferido mais recente', () => {
    const only: MonthOverview[] = [row('2026-05', { paidChecked: true }), row('2026-06', { paidChecked: true })];
    const view = buildEvolutionView({ overview: only, metric: 'pago', windowMonths: 3, currentMonth: '2026-07', hiddenMonths: [] });
    expect(view.situation).toBe('normal');
    expect(evolutionSelectedMonth(view, null)).toBe('2026-06');
    const mixed = buildEvolutionView({ overview: [row('2026-05', { paidCount: 1, paidCents: 5_000 }), row('2026-06', { paidChecked: true })], metric: 'pago', windowMonths: 3, currentMonth: '2026-07', hiddenMonths: [] });
    expect(evolutionSelectedMonth(mixed, null)).toBe('2026-05');
    // Todos sem registros e sem marca: a tela de "sem registros".
    expect(buildEvolutionView({ overview: [], metric: 'pago', windowMonths: 3, currentMonth: '2026-07', hiddenMonths: [] }).situation).toBe('sem_registros');
  });

  it('os textos novos da Evolução dizem o que o ponto é', () => {
    expect(EVOLUTION_TEXT.legend.zeroConfirmed).toBe('Conferido, sem lançamentos');
    expect(EVOLUTION_TEXT.panel.state.zero_confirmado).toBe('Conferido');
    expect(EVOLUTION_TEXT.participation.zeroConfirmed).toBe('conferido');
  });
});

describe('"Seus últimos meses": o mês conferido deixa de ser lacuna', () => {
  const state = { activity: { lastWriteOn: '2026-05-20', absenceFromOn: null, absenceUntilOn: null }, mark: null };
  const window = returnWindow(state, '2026-10-07')!;
  const review = (overview: MonthOverview[]) => buildReturnReview(window, overview, [], [], '2026-10-07');
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

  it('sem a marca, o mês sem recebimento ou sem gasto é "com algo sem registro" e entra nos passos; com a marca do tipo, deixa de ser', () => {
    const base = months.map((m) => row(m, { receivedCount: 1, receivedCents: 100, paidCount: 1, paidCents: 100 }));
    const gaps = (patch: Record<string, Partial<MonthOverview>>) => review(base.map((r) => ({ ...r, ...(patch[r.month] ?? {}) })));
    // Junho sem gastos e agosto sem recebimentos, sem conferir.
    const open = gaps({ '2026-06': { paidCount: 0, paidCents: 0 }, '2026-08': { receivedCount: 0, receivedCents: 0 } });
    expect(open.counts.monthsWithGaps).toBe(2);
    expect(open.steps.map((s) => s.month)).toEqual(['2026-06', '2026-08']);
    expect(open.isEmpty).toBe(false);
    // Junho conferido (gastos): deixa de ser lacuna. Agosto segue.
    const one = gaps({ '2026-06': { paidCount: 0, paidCents: 0, paidChecked: true }, '2026-08': { receivedCount: 0, receivedCents: 0 } });
    expect(one.counts.monthsWithGaps).toBe(1);
    expect(one.steps.map((s) => s.month)).toEqual(['2026-08']);
    // Os dois conferidos: nada a conferir, e a faixa some (isEmpty).
    const none = gaps({
      '2026-06': { paidCount: 0, paidCents: 0, paidChecked: true },
      '2026-08': { receivedCount: 0, receivedCents: 0, receivedChecked: true },
    });
    expect(none.counts).toEqual({ monthsWithGaps: 0, billsToCheck: 0 });
    expect(none.steps).toEqual([]);
    expect(none.isEmpty).toBe(true);
    // A marca de um tipo não vale para o outro: junho sem recebimentos nem gastos, só os gastos conferidos.
    const cross = gaps({ '2026-06': { paidCount: 0, paidCents: 0, receivedCount: 0, receivedCents: 0, paidChecked: true } });
    expect(cross.months.find((m) => m.month === '2026-06')).toMatchObject({ missing: true, toCheck: true });
    // Marca com registro no mês (a marca deixou de valer): o mês segue como está.
    const stale = gaps({ '2026-06': { paidCount: 1, paidChecked: true } });
    expect(stale.counts.monthsWithGaps).toBe(0);
  });

  it('o cartão do mês diz "conferido, não houve" e fica compacto quando nada mais falta', () => {
    const r = review(months.map((m) => row(m, { receivedCount: 1, receivedCents: 100, paidCount: 0, paidCents: 0, paidChecked: m === '2026-07' })));
    const july = reviewMonthCard(r.months.find((m) => m.month === '2026-07')!);
    expect(july.paid).toBe('Pago: conferido, não houve gastos');
    expect(july.received).toBe('Recebido: R$ 1,00 · 1 recebimento');
    expect(july.compact).toBe(true);
    const june = reviewMonthCard(r.months.find((m) => m.month === '2026-06')!);
    expect(june.paid).toBe('Pago: nenhum gasto anotado');
    expect(june.compact).toBe(false);
  });

  it('o resumo puro de months_overview devolve as marcas só quando o mês não tem registro do tipo', () => {
    const rec = { id: 'r', contextId: 'c', accountId: 'a', kind: 'despesa' as const, status: 'realizado' as const, amountCents: 1_000, currency: 'BRL' as const, occurredOn: '2026-08-10', description: 'x', category: null, commitmentId: null, invoice: null, receiptKey: null, createdBy: 'p', version: 1, createdAt: '', updatedAt: '' };
    const checks = [
      { month: '2026-08', kind: 'pagamentos' as const },
      { month: '2026-08', kind: 'recebimentos' as const },
      { month: '2026-07', kind: 'pagamentos' as const },
    ];
    const out = monthsOverview([rec], 'c', '2026-07', '2026-08', checks);
    expect(out[0]).toMatchObject({ month: '2026-07', paidChecked: true, receivedChecked: false });
    expect(out[1]).toMatchObject({ month: '2026-08', paidCount: 1, paidChecked: false, receivedChecked: true });
  });
});

describe('MemoryRepository: set_month_check e clear_month_check', () => {
  async function harness(today = '2026-10-07') {
    let day = today;
    const hub = new MemoryFamilyHub({ now: () => Date.parse('2026-10-07T12:00:00.000Z') });
    const mk = async (id: string, name: string) => {
      const repo = new MemoryRepository({ actorId: id, displayName: name, today: () => day, family: hub });
      const space = await repo.ensurePersonalSpace('Conta principal');
      return { repo, ctx: space.personalContextId, accountId: space.accounts[0]!.id };
    };
    return { hub, mk, setDay: (d: string) => (day = d) };
  }
  const overviewOf = async (repo: MemoryRepository, ctx: string, month: string) => (await repo.monthsOverview(ctx, month, month))[0]!;

  it('marca, lê, repete e desmarca; cada tipo é separado; nenhum total muda', async () => {
    const { mk } = await harness();
    const lia = await mk('lia', 'Lia');
    const totalsBefore = JSON.stringify(await lia.repo.listRecords(lia.ctx, '2026-08'));
    const k = key();
    const w = await lia.repo.setMonthCheck(k, lia.ctx, '2026-08', 'pagamentos', 0);
    expect(w).toMatchObject({ contextId: lia.ctx, month: '2026-08', kind: 'pagamentos', checked: true, version: 1 });
    expect(w.checkedAt).toMatch(/^2026-10-07T/);
    expect(await overviewOf(lia.repo, lia.ctx, '2026-08')).toMatchObject({ paidChecked: true, receivedChecked: false, paidCount: 0, receivedCount: 0 });
    // Repetir devolve o mesmo, sem outra marca nem outra operação; outro conteúdo com a mesma chave é recusado.
    expect(await lia.repo.setMonthCheck(k, lia.ctx, '2026-08', 'pagamentos', 0)).toEqual(w);
    await expectCode(lia.repo.setMonthCheck(k, lia.ctx, '2026-08', 'recebimentos', 0), 'chave_reutilizada');
    await expectCode(lia.repo.clearMonthCheck(k, lia.ctx, '2026-08', 'pagamentos', 1), 'chave_reutilizada');
    // O outro tipo e outro mês.
    await lia.repo.setMonthCheck(key(), lia.ctx, '2026-08', 'recebimentos', 0);
    await lia.repo.setMonthCheck(key(), lia.ctx, '2026-07', 'recebimentos', 0);
    expect(await overviewOf(lia.repo, lia.ctx, '2026-08')).toMatchObject({ paidChecked: true, receivedChecked: true });
    expect(JSON.stringify(await lia.repo.listRecords(lia.ctx, '2026-08'))).toBe(totalsBefore);
    // Várias linhas de uma vez, cada mês com as suas marcas.
    const rows = await lia.repo.monthsOverview(lia.ctx, '2026-06', '2026-09');
    expect(rows.map((r) => `${r.month}:${r.receivedChecked ? 'R' : '-'}${r.paidChecked ? 'P' : '-'}`)).toEqual(['2026-06:--', '2026-07:R-', '2026-08:RP', '2026-09:--']);
    // Desmarcar: a versão certa; repetir devolve o mesmo; chave de outra ação é recusada.
    const kc = key();
    const cleared = await lia.repo.clearMonthCheck(kc, lia.ctx, '2026-08', 'pagamentos', 1);
    expect(cleared).toEqual({ contextId: lia.ctx, month: '2026-08', kind: 'pagamentos', checked: false, version: 0, checkedAt: null });
    expect(await lia.repo.clearMonthCheck(kc, lia.ctx, '2026-08', 'pagamentos', 1)).toEqual(cleared);
    await expectCode(lia.repo.setMonthCheck(kc, lia.ctx, '2026-08', 'pagamentos', 0), 'chave_reutilizada');
    expect(await overviewOf(lia.repo, lia.ctx, '2026-08')).toMatchObject({ paidChecked: false, receivedChecked: true });
    // Marcar de novo depois de desmarcar vale (versão 0).
    expect((await lia.repo.setMonthCheck(key(), lia.ctx, '2026-08', 'pagamentos', 0)).checked).toBe(true);
  });

  it('o mês atual, os futuros, o que não é o primeiro dia e o tipo errado são recusados; recusa não grava', async () => {
    const { mk } = await harness();
    const lia = await mk('lia', 'Lia');
    for (const month of ['2026-10', '2026-11', '2030-01', 'agosto', '2026-8', '', null as never]) {
      await expectCode(lia.repo.setMonthCheck(key(), lia.ctx, month, 'pagamentos', 0), 'mes_invalido');
      await expectCode(lia.repo.clearMonthCheck(key(), lia.ctx, month, 'pagamentos', 1), 'mes_invalido');
    }
    for (const kind of ['gastos', 'Pagamentos', '', null]) {
      await expectCode(lia.repo.setMonthCheck(key(), lia.ctx, '2026-08', kind as never, 0), 'tipo_invalido');
    }
    // O tipo vem antes do mês quando os dois estão errados.
    await expectCode(lia.repo.setMonthCheck(key(), lia.ctx, '2026-10', 'gastos' as never, 0), 'tipo_invalido');
    expect(await overviewOf(lia.repo, lia.ctx, '2026-08')).toMatchObject({ paidChecked: false, receivedChecked: false });
    // O "hoje" é o da pessoa: em novembro, outubro já terminou.
    const { mk: mk2, setDay } = await harness('2026-11-02');
    const bia = await mk2('bia', 'Bia');
    expect((await bia.repo.setMonthCheck(key(), bia.ctx, '2026-10', 'recebimentos', 0)).checked).toBe(true);
    await expectCode(bia.repo.setMonthCheck(key(), bia.ctx, '2026-11', 'recebimentos', 0), 'mes_invalido');
    setDay('2026-11-30');
    await expectCode(bia.repo.setMonthCheck(key(), bia.ctx, '2026-11', 'pagamentos', 0), 'mes_invalido');
  });

  it('versão: marcar espera 0 e nenhuma marca viva; desmarcar espera a versão viva; sem marca, versao_atual=0', async () => {
    const { mk } = await harness();
    const lia = await mk('lia', 'Lia');
    await lia.repo.setMonthCheck(key(), lia.ctx, '2026-08', 'pagamentos', 0);
    for (const v of [0, 1, 2, null as never]) await expectCode(lia.repo.setMonthCheck(key(), lia.ctx, '2026-08', 'pagamentos', v), 'versao_desatualizada', 'versao_atual=1');
    for (const v of [1, -1, null as never]) await expectCode(lia.repo.setMonthCheck(key(), lia.ctx, '2026-07', 'pagamentos', v), 'versao_desatualizada', 'versao_atual=0');
    for (const v of [0, 2, null as never]) await expectCode(lia.repo.clearMonthCheck(key(), lia.ctx, '2026-08', 'pagamentos', v), 'versao_desatualizada', 'versao_atual=1');
    for (const v of [0, 1]) await expectCode(lia.repo.clearMonthCheck(key(), lia.ctx, '2026-07', 'pagamentos', v), 'versao_desatualizada', 'versao_atual=0');
    expect(await overviewOf(lia.repo, lia.ctx, '2026-08')).toMatchObject({ paidChecked: true });
  });

  it('a marca deixa de valer com um registro do tipo no mês, sem ser apagada, e volta a valer quando o registro sai; marcar com registro é recusado', async () => {
    const { mk } = await harness();
    const lia = await mk('lia', 'Lia');
    const expense = (day: string) => lia.repo.createRecord(key(), lia.ctx, 'despesa', { accountId: lia.accountId, amountCents: 3_000, occurredOn: day, description: 'Farmácia', category: null });
    // Com registro do tipo, marcar é recusado; o outro tipo, sem registro, vale.
    const first = await expense('2026-08-31');
    await expectCode(lia.repo.setMonthCheck(key(), lia.ctx, '2026-08', 'pagamentos', 0), 'mes_com_registros');
    expect((await lia.repo.setMonthCheck(key(), lia.ctx, '2026-08', 'recebimentos', 0)).checked).toBe(true);
    await lia.repo.deleteRecord(key(), first.id, first.version);
    expect((await lia.repo.setMonthCheck(key(), lia.ctx, '2026-08', 'pagamentos', 0)).checked).toBe(true);
    expect(await overviewOf(lia.repo, lia.ctx, '2026-08')).toMatchObject({ paidChecked: true, receivedChecked: true });
    // Aparece um gasto: a marca deixa de valer (o mês volta a ser "com registros"), mas segue guardada (marcar de novo é versão 1).
    const second = await expense('2026-08-01');
    expect(await overviewOf(lia.repo, lia.ctx, '2026-08')).toMatchObject({ paidCount: 1, paidChecked: false, receivedChecked: true });
    await expectCode(lia.repo.setMonthCheck(key(), lia.ctx, '2026-08', 'pagamentos', 0), 'versao_desatualizada', 'versao_atual=1');
    // Registros de outros meses ou do outro tipo não interferem; excluir o gasto devolve o zero confirmado.
    await lia.repo.createRecord(key(), lia.ctx, 'despesa', { accountId: lia.accountId, amountCents: 100, occurredOn: '2026-09-01', description: 'x', category: null });
    await lia.repo.deleteRecord(key(), second.id, second.version);
    expect(await overviewOf(lia.repo, lia.ctx, '2026-08')).toMatchObject({ paidCount: 0, paidChecked: true });
    // Desmarcar vale mesmo com registro.
    const third = await expense('2026-08-15');
    expect((await overviewOf(lia.repo, lia.ctx, '2026-08')).paidChecked).toBe(false);
    expect((await lia.repo.clearMonthCheck(key(), lia.ctx, '2026-08', 'pagamentos', 1)).checked).toBe(false);
    await lia.repo.deleteRecord(key(), third.id, third.version);
    expect((await overviewOf(lia.repo, lia.ctx, '2026-08')).paidChecked).toBe(false);
  });

  it('não conta como anotação para a atividade de "Seus últimos meses" e não muda decisão nem outra tabela', async () => {
    const { mk, setDay } = await harness();
    const lia = await mk('lia', 'Lia');
    await lia.repo.createRecord(key(), lia.ctx, 'despesa', { accountId: lia.accountId, amountCents: 100, occurredOn: '2026-10-07', description: 'x', category: null });
    const before = await lia.repo.getReturnReviewState(lia.ctx);
    expect(before.activity).toEqual({ lastWriteOn: '2026-10-07', absenceFromOn: null, absenceUntilOn: null });
    setDay('2026-12-20');
    await lia.repo.setMonthCheck(key(), lia.ctx, '2026-11', 'pagamentos', 0);
    await lia.repo.clearMonthCheck(key(), lia.ctx, '2026-11', 'pagamentos', 1);
    await lia.repo.setMonthCheck(key(), lia.ctx, '2026-11', 'recebimentos', 0);
    expect(await lia.repo.getReturnReviewState(lia.ctx)).toEqual(before);
    // Uma anotação de verdade conta: a ausência longa aparece.
    await lia.repo.createRecord(key(), lia.ctx, 'despesa', { accountId: lia.accountId, amountCents: 100, occurredOn: '2026-12-20', description: 'y', category: null });
    expect((await lia.repo.getReturnReviewState(lia.ctx)).activity).toMatchObject({ lastWriteOn: '2026-12-20', absenceFromOn: '2026-10-07', absenceUntilOn: '2026-12-20' });
  });

  it('Família: quem escreve (titular e membro) marca e desmarca; quem só lê e quem é de fora não; ex-membro perde tudo', async () => {
    const { hub } = await harness();
    const mkp = async (id: string) => {
      const repo = new MemoryRepository({ actorId: id, displayName: id, today: () => '2026-10-07', family: hub });
      const space = await repo.ensurePersonalSpace('Conta principal');
      return { repo, personal: space.personalContextId };
    };
    const vera = await mkp('vera');
    const mauro = await mkp('mauro');
    const nina = await mkp('nina');
    const otto = await mkp('otto');
    const { context } = await vera.repo.createFamily(key(), 'Casa');
    const fam = context.id;
    await mauro.repo.acceptFamilyInvite(key(), (await vera.repo.createFamilyInvite(key(), fam, 'membro')).code!);
    await nina.repo.acceptFamilyInvite(key(), (await vera.repo.createFamilyInvite(key(), fam, 'leitor')).code!);
    // Titular e membro marcam e desmarcam na Família.
    expect((await vera.repo.setMonthCheck(key(), fam, '2026-08', 'pagamentos', 0)).checked).toBe(true);
    expect((await mauro.repo.setMonthCheck(key(), fam, '2026-08', 'pagamentos', 0)).checked).toBe(true);
    expect((await mauro.repo.clearMonthCheck(key(), fam, '2026-08', 'pagamentos', 1)).checked).toBe(false);
    // Quem só lê vê (lê o mês) e não marca nem desmarca; de fora nem lê.
    expect(await nina.repo.monthsOverview(fam, '2026-08', '2026-08')).toHaveLength(1);
    await expectCode(nina.repo.setMonthCheck(key(), fam, '2026-08', 'recebimentos', 0), 'sem_permissao');
    await expectCode(nina.repo.clearMonthCheck(key(), fam, '2026-08', 'pagamentos', 1), 'sem_permissao');
    await expectCode(otto.repo.setMonthCheck(key(), fam, '2026-08', 'recebimentos', 0), 'sem_permissao');
    await expectCode(otto.repo.monthsOverview(fam, '2026-08', '2026-08'), 'sem_permissao');
    // O Pessoal de outra pessoa também não.
    await expectCode(otto.repo.setMonthCheck(key(), vera.personal, '2026-08', 'recebimentos', 0), 'sem_permissao');
    await expectCode(otto.repo.setMonthCheck(key(), 'ctx-que-nao-existe', '2026-08', 'recebimentos', 0), 'sem_permissao');
    // A permissão vem antes da validação.
    await expectCode(otto.repo.setMonthCheck(key(), fam, '2026-10', 'gastos' as never, 0), 'sem_permissao');
    // Quem sai (vínculo revogado) perde a escrita e a leitura; repetir a chave de antes diz "não encontrado".
    const k = key();
    await mauro.repo.setMonthCheck(k, fam, '2026-07', 'recebimentos', 0);
    await mauro.repo.leaveFamily(key(), fam);
    await expectCode(mauro.repo.setMonthCheck(key(), fam, '2026-06', 'recebimentos', 0), 'sem_permissao');
    await expectCode(mauro.repo.monthsOverview(fam, '2026-07', '2026-07'), 'sem_permissao');
    await expectCode(mauro.repo.setMonthCheck(k, fam, '2026-07', 'recebimentos', 0), 'nao_encontrado');
  });

  it('falha de rede: antes de gravar, nada; depois de gravar, repetir com a mesma chave devolve a marca sem refazer', async () => {
    const { mk } = await harness();
    const lia = await mk('lia', 'Lia');
    const k = key();
    lia.repo.failNextWrite = 'antes';
    await expectCode(lia.repo.setMonthCheck(k, lia.ctx, '2026-08', 'pagamentos', 0), 'rede');
    expect((await overviewOf(lia.repo, lia.ctx, '2026-08')).paidChecked).toBe(false);
    lia.repo.failNextWrite = 'depois';
    await expectCode(lia.repo.setMonthCheck(k, lia.ctx, '2026-08', 'pagamentos', 0), 'rede');
    expect((await overviewOf(lia.repo, lia.ctx, '2026-08')).paidChecked).toBe(true);
    expect(await lia.repo.setMonthCheck(k, lia.ctx, '2026-08', 'pagamentos', 0)).toMatchObject({ checked: true, version: 1 });
    const kc = key();
    lia.repo.failNextWrite = 'depois';
    await expectCode(lia.repo.clearMonthCheck(kc, lia.ctx, '2026-08', 'pagamentos', 1), 'rede');
    expect(await lia.repo.clearMonthCheck(kc, lia.ctx, '2026-08', 'pagamentos', 1)).toMatchObject({ checked: false, version: 0 });
  });

  it('"Seus últimos meses" lê as marcas: conferir os meses vazios esvazia a revisão; excluir a conta apaga as marcas', async () => {
    // Última anotação em 21/05; em 07/10, de junho a setembro, nada anotado.
    const { mk, setDay } = await harness('2026-05-21');
    const lia = await mk('lia', 'Lia');
    const rec = (day: string, kind: 'receita' | 'despesa') =>
      lia.repo.createRecord(key(), lia.ctx, kind, { accountId: lia.accountId, amountCents: 1_000, occurredOn: day, description: 'Teste', category: null });
    await rec('2026-05-20', 'despesa');
    await rec('2026-05-21', 'receita');
    setDay('2026-10-07');
    const load = async () => (await loadReturnReview(lia.repo, lia.ctx, '2026-10-07')).review;
    const open = (await load())!;
    expect(open.counts.monthsWithGaps).toBe(4);
    for (const month of ['2026-06', '2026-07', '2026-08', '2026-09']) {
      for (const kind of MONTH_CHECK_KINDS) await lia.repo.setMonthCheck(key(), lia.ctx, month, kind, 0);
    }
    const done = await load();
    expect(done).not.toBeNull();
    expect(done!.counts.monthsWithGaps).toBe(0);
    expect(done!.isEmpty).toBe(true);
    // Desfazer uma conferência traz o mês de volta como possível lacuna.
    await lia.repo.clearMonthCheck(key(), lia.ctx, '2026-07', 'pagamentos', 1);
    expect((await load())!.counts.monthsWithGaps).toBe(1);
    // Conta excluída: o repositório não guarda mais nada (a marca some com o contexto).
    await lia.repo.deleteMyAccount('EXCLUIR', key());
    await expectCode(lia.repo.monthsOverview(lia.ctx, '2026-08', '2026-08'), 'sem_permissao');
  });
});
