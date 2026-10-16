import { describe, expect, it } from 'vitest';
import {
  APP_SCREENS,
  DEMO_TODAY,
  EVOLUTION_DEFAULT_METRIC,
  EVOLUTION_DEFAULT_WINDOW,
  EVOLUTION_ROUTE,
  EVOLUTION_TEXT,
  EVOLUTION_WINDOWS,
  EvolutionSelectionStore,
  barModeFor,
  buildEvolutionView,
  categoryBreakdown,
  createDemoRepository,
  demoScenarioFrom,
  evolutionAnnouncement,
  evolutionExplainPlan,
  evolutionExplanation,
  evolutionFetchRange,
  evolutionGapMonths,
  evolutionMonths,
  evolutionPanel,
  evolutionSelectedMonth,
  evolutionTopCategories,
  evolutionVariation,
  isEvolutionWindow,
  loadEvolutionGaps,
  loadInvoicesOfRecords,
  MemoryRepository,
  monthOf,
  newOperationKey,
  paidCategoryParts,
  receivedCategoryParts,
  summarizeMonth,
  topicTabFor,
  type Commitment,
  type CommitmentSeries,
  type CategoryPart,
  type EvolutionMetric,
  type EvolutionWindow,
  type FinancialRecord,
  type MonthOverview,
} from '../src';

/**
 * Evolução financeira, fase 1b (D-057): o que a tela mostra, montado no core (docs/14 §4 e §6; EF §6, §7 e §12). Valores do caso
 * de referência, em centavos: janeiro 320.000, fevereiro 340.000, março 330.000, abril 780.000, maio 345.000 e junho 360.000.
 */
const PAID = [320_000, 340_000, 330_000, 780_000, 345_000, 360_000];
const RECEIVED = [500_000, 500_000, 0, 520_000, 500_000, 510_000];
const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];

const overview: MonthOverview[] = MONTHS.map((month, i) => ({
  month,
  receivedCount: RECEIVED[i] === 0 ? 0 : 2,
  receivedCents: RECEIVED[i]!,
  paidCount: 10 + i,
  paidCents: PAID[i]!,
}));

/** Julho de 2026 é o mês atual: os seis meses acima estão fechados e o de julho não tem lançamentos. */
const AFTER = '2026-07';
const fromJune = (hiddenMonths: string[] = [], metric: EvolutionMetric = 'pago', windowMonths: EvolutionWindow = 6) =>
  buildEvolutionView({ overview, metric, windowMonths, currentMonth: '2026-06', hiddenMonths });

describe('janelas e leitura', () => {
  it('a janela é 3, 6 ou 12 meses, padrão 6, terminando no mês atual, e a leitura é sempre de 12 meses', () => {
    expect(EVOLUTION_WINDOWS).toEqual([3, 6, 12]);
    expect(EVOLUTION_DEFAULT_WINDOW).toBe(6);
    expect(EVOLUTION_DEFAULT_METRIC).toBe('pago');
    expect(isEvolutionWindow(6)).toBe(true);
    expect(isEvolutionWindow(4)).toBe(false);
    expect(isEvolutionWindow('6')).toBe(false);
    expect(evolutionFetchRange('2026-10')).toEqual({ from: '2025-11', to: '2026-10' });
    expect(evolutionMonths('2026-10', 3)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(evolutionMonths('2026-02', 6)).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    expect(evolutionMonths('2026-10', 12)).toHaveLength(12);
  });

  it('só os meses da janela entram: a leitura de 12 meses é recortada, e mês que a leitura não trouxe vale sem registros', () => {
    const twelve: MonthOverview[] = evolutionMonths('2026-10', 12).map((month) => ({ month, receivedCount: 1, receivedCents: 100, paidCount: 1, paidCents: 200 }));
    const three = buildEvolutionView({ overview: twelve, metric: 'pago', windowMonths: 3, currentMonth: '2026-10', hiddenMonths: [] });
    expect(three.points.map((p) => p.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(three.from).toBe('2026-08');
    expect(three.to).toBe('2026-10');
    expect(three.points.map((p) => p.state)).toEqual(['com_registros', 'com_registros', 'em_andamento']);
    const partial = buildEvolutionView({ overview: twelve.slice(-2), metric: 'pago', windowMonths: 3, currentMonth: '2026-10', hiddenMonths: [] });
    expect(partial.points[0]).toMatchObject({ month: '2026-08', cents: 0, count: 0, state: 'sem_registros', valueText: null });
  });
});

describe('buildEvolutionView', () => {
  it('T01: seis meses, sem filtro, com o estado de cada ponto e o valor exato', () => {
    const view = buildEvolutionView({ overview, metric: 'pago', windowMonths: 6, currentMonth: AFTER, hiddenMonths: [] });
    expect(view.points).toHaveLength(6);
    expect(view.points.map((p) => p.month)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
    const june = fromJune();
    expect(june.points.map((p) => p.month)).toEqual(MONTHS);
    expect(june.outCount).toBe(0);
    expect(june.eligibleCount).toBe(5);
    expect(june.points.map((p) => p.participation)).toEqual([
      'na_comparacao',
      'na_comparacao',
      'na_comparacao',
      'na_comparacao',
      'na_comparacao',
      'fora_andamento',
    ]);
    expect(june.points[3]).toMatchObject({ month: '2026-04', cents: 780_000, valueText: 'R$ 7.800,00', title: 'Abril de 2026', shortLabel: 'abr', included: true, eligible: true });
  });

  it('T04 e T05: os seis meses fechados dão 412.500 e 342.500, e sem abril 339.000 e 340.000', () => {
    const closed = buildEvolutionView({ overview, metric: 'pago', windowMonths: 6, currentMonth: AFTER, hiddenMonths: [] });
    // O mês atual (julho) não tem lançamentos: fora das contas; os cinco meses fechados da janela são fevereiro a junho.
    expect(closed.stats.eligibleCount).toBe(5);
    const all = buildEvolutionView({ overview, metric: 'pago', windowMonths: 12, currentMonth: '2026-12', hiddenMonths: [] });
    expect(all.points).toHaveLength(12);
    expect(all.eligibleCount).toBe(6);
    expect(all.stats.average).toBe(412_500);
    expect(all.stats.median).toBe(342_500);
    expect(all.stats.visibleCount).toBe(6);
    expect(all.totalCents).toBe(2_475_000);
    const noApril = buildEvolutionView({ overview, metric: 'pago', windowMonths: 12, currentMonth: '2026-12', hiddenMonths: ['2026-04'] });
    expect(noApril.stats.average).toBe(339_000);
    expect(noApril.stats.median).toBe(340_000);
    expect(noApril.stats.visibleCount).toBe(5);
    expect(noApril.eligibleCount).toBe(6);
    expect(noApril.outCount).toBe(1);
    expect(EVOLUTION_TEXT.stats.ofMonths(noApril.stats.visibleCount, noApril.eligibleCount)).toBe('5 de 6 meses');
    expect(EVOLUTION_TEXT.stats.ofMonths(6, 6)).toBe('6 de 6 meses');
    expect(EVOLUTION_TEXT.stats.ofMonths(1, 1)).toBe('1 de 1 mês');
    expect(EVOLUTION_TEXT.custom.banner(noApril.outCount, noApril.eligibleCount)).toBe('Comparação personalizada: 1 de 6 meses fora da comparação');
    expect(EVOLUTION_TEXT.custom.banner(1, 1)).toBe('Comparação personalizada: 1 de 1 mês fora da comparação');
    // Os meses sem registros (os 6 de julho a dezembro) continuam à vista no eixo e fora das contas.
    expect(noApril.points.filter((p) => p.participation === 'fora_sem_registros')).toHaveLength(6);
    expect(noApril.points.find((p) => p.month === '2026-04')).toMatchObject({ participation: 'fora_escolha', included: false, eligible: true });
  });

  it('T06: o total dos meses exibidos não muda com a seleção, nem com todos fora', () => {
    for (const hidden of [[], ['2026-04'], ['2026-01', '2026-03', '2026-05'], MONTHS]) {
      expect(fromJune(hidden).totalCents).toBe(2_475_000);
    }
    expect(fromJune().maxCents).toBe(780_000);
    expect(fromJune(['2026-04']).maxCents).toBe(780_000);
  });

  it('T07: vários meses fora, sem renumerar nenhum ponto', () => {
    const view = fromJune(['2026-02', '2026-04']);
    expect(view.points.map((p) => [p.month, p.cents, p.participation])).toEqual([
      ['2026-01', 320_000, 'na_comparacao'],
      ['2026-02', 340_000, 'fora_escolha'],
      ['2026-03', 330_000, 'na_comparacao'],
      ['2026-04', 780_000, 'fora_escolha'],
      ['2026-05', 345_000, 'na_comparacao'],
      ['2026-06', 360_000, 'fora_andamento'],
    ]);
    expect(view.outCount).toBe(2);
    expect(view.stats.hiddenMonths).toEqual(['2026-02', '2026-04']);
    expect(EVOLUTION_TEXT.custom.list(view.stats.hiddenMonths)).toBe('Fora da comparação: fevereiro e abril.');
    expect(EVOLUTION_TEXT.custom.list(['2026-02', '2026-04', '2026-05'])).toBe('Fora da comparação: fevereiro, abril e maio.');
  });

  it('T08: todos fora, nunca média zero', () => {
    const view = fromJune(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']);
    expect(view.situation).toBe('todos_fora');
    expect(view.stats.visibleCount).toBe(0);
    expect(view.stats.average).toBeNull();
    expect(view.stats.median).toBeNull();
    expect(view.outCount).toBe(5);
    expect(evolutionAnnouncement(view)).toBe('Nenhum mês na comparação.');
    expect(EVOLUTION_TEXT.states.allOutTitle).toBe('Escolha ao menos um mês para comparar');
    expect(view.totalCents).toBe(2_475_000);
  });

  it('T09: um único mês na comparação: média e mediana são o valor dele e a variação não está disponível', () => {
    const view = fromJune(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(view.situation).toBe('um_mes');
    expect(view.stats.average).toBe(345_000);
    expect(view.stats.median).toBe(345_000);
    expect(evolutionVariation(view, '2026-05')).toEqual({ available: false, text: EVOLUTION_TEXT.variation.unavailableNoBase });
    expect(evolutionAnnouncement(view)).toBe('Média R$ 3.450,00, mediana R$ 3.450,00, 1 de 5 meses.');
  });

  it('T10: mês sem registros é sem registros, sem valor e sem "R$ 0,00"; Recebido de março', () => {
    const view = fromJune([], 'recebido');
    const march = view.points[2]!;
    expect(march).toMatchObject({ state: 'sem_registros', participation: 'fora_sem_registros', valueText: null, included: false, eligible: false });
    expect(march.stateText).toBe('Sem registros: mês sem anotação não quer dizer mês sem recebimentos');
    expect(march.name).toBe('Março de 2026, sem registros, fora da comparação');
    expect(march.includedText).toBe('Fora da comparação');
    expect(fromJune().points[2]!.stateText).toBe('Com registros');
    expect(EVOLUTION_TEXT.panel.noRecords('pago')).toBe('Sem registros: mês sem anotação não quer dizer mês sem gastos');
    // Os 5 meses com recebimento: março não conta.
    expect(view.eligibleCount).toBe(4);
    expect(view.stats.eligibleCount).toBe(4);
    for (const p of view.points) expect(p.name, p.name).not.toMatch(/R\$ 0,00/);
  });

  it('o convite a olhar mais meses só aparece com menos de 12 meses na janela', () => {
    expect(EVOLUTION_TEXT.states.olderMonths(3)).toBe('Se há anotações mais antigas, escolha 6 ou 12 meses.');
    expect(EVOLUTION_TEXT.states.olderMonths(6)).toBe('Se há anotações mais antigas, escolha 12 meses.');
    expect(EVOLUTION_TEXT.states.olderMonths(12)).toBeNull();
  });

  it('sem registros em todos os meses e só o mês em andamento são situações à parte', () => {
    const empty = buildEvolutionView({ overview: [], metric: 'pago', windowMonths: 6, currentMonth: '2026-10', hiddenMonths: [] });
    expect(empty.situation).toBe('sem_registros');
    expect(empty.points.every((p) => p.valueText === null)).toBe(true);
    expect(empty.stats.average).toBeNull();
    expect(empty.maxCents).toBe(0);
    const only: MonthOverview[] = [{ month: '2026-10', receivedCount: 0, receivedCents: 0, paidCount: 2, paidCents: 90_000 }];
    const view = buildEvolutionView({ overview: only, metric: 'pago', windowMonths: 3, currentMonth: '2026-10', hiddenMonths: [] });
    expect(view.situation).toBe('sem_mes_fechado');
    expect(view.eligibleCount).toBe(0);
    expect(view.stats.average).toBeNull();
    expect(view.points[2]).toMatchObject({ state: 'em_andamento', participation: 'fora_andamento', valueText: 'R$ 900,00', stateText: 'Mês em andamento' });
    expect(view.totalCents).toBe(90_000);
  });

  it('nome acessível do ponto: mês, valor, estado do mês e se está na comparação', () => {
    const view = fromJune(['2026-04']);
    expect(view.points[3]!.name).toBe('Abril de 2026, R$ 7.800,00, fora da comparação');
    expect(view.points[0]!.name).toBe('Janeiro de 2026, R$ 3.200,00, na comparação');
    expect(view.points[5]!.name).toBe('Junho de 2026, R$ 3.600,00, mês em andamento, fora da comparação');
    expect(view.points[3]!.includedText).toBe('Fora da comparação');
    expect(view.points[0]!.includedText).toBe('Sim');
  });

  it('mês oculto que não existe na janela ou que não é elegível não conta; nada do que recebe é alterado', () => {
    const hidden = ['2020-01', '2026-06', '2026-03'];
    const frozen = Object.freeze([...hidden]);
    const rows = Object.freeze(overview.map((r) => Object.freeze({ ...r })));
    const before = JSON.stringify(rows);
    const view = buildEvolutionView({ overview: rows, metric: 'recebido', windowMonths: 6, currentMonth: '2026-06', hiddenMonths: frozen });
    // Junho é o mês atual e março não tem recebimento: os dois já estavam fora e não entram na conta de "fora".
    expect(view.outCount).toBe(0);
    expect(view.eligibleCount).toBe(4);
    expect(JSON.stringify(rows)).toBe(before);
    expect(() => buildEvolutionView({ overview: [{ ...overview[0]!, paidCents: -1 }], metric: 'pago', windowMonths: 3, currentMonth: '2026-03', hiddenMonths: [] })).toThrow(RangeError);
  });
});

describe('variação do mês (D06, T14, T27)', () => {
  it('março para abril: as duas datas, a diferença e o percentual', () => {
    const view = fromJune();
    const v = evolutionVariation(view, '2026-04');
    expect(v).toEqual({
      available: true,
      text: 'De março para abril: R$ 4.500,00 a mais',
      percentText: '136,4% a mais que março',
      skippedText: null,
      fromMonth: '2026-03',
      toMonth: '2026-04',
      adjacent: true,
    });
  });

  it('T14: março para maio com abril fora diz as datas reais e que abril ficou fora; nunca "mês a mês"', () => {
    const view = fromJune(['2026-04']);
    const v = evolutionVariation(view, '2026-05');
    expect(v).toEqual({
      available: true,
      text: 'De março para maio: R$ 150,00 a mais',
      percentText: '4,5% a mais que março',
      skippedText: 'Abril ficou fora da comparação.',
      fromMonth: '2026-03',
      toMonth: '2026-05',
      adjacent: false,
    });
    expect(JSON.stringify(v)).not.toMatch(/mês a mês/i);
    // O mês tirado também mostra a variação, contra o mês anterior que está na comparação.
    expect(evolutionVariation(view, '2026-04')).toMatchObject({ available: true, text: 'De março para abril: R$ 4.500,00 a mais', adjacent: true });
    // Dois meses no meio: no plural.
    const two = evolutionVariation(fromJune(['2026-02', '2026-03']), '2026-04');
    expect(two).toMatchObject({ text: 'De janeiro para abril: R$ 4.600,00 a mais', skippedText: 'Fevereiro e março ficaram fora da comparação.', adjacent: false });
  });

  it('a diferença para menos, sem diferença e o percentual minúsculo', () => {
    const down = evolutionVariation(fromJune(), '2026-05');
    expect(down).toMatchObject({ text: 'De abril para maio: R$ 4.350,00 a menos', percentText: '55,8% a menos que abril' });
    const same: MonthOverview[] = [
      { month: '2026-03', receivedCount: 0, receivedCents: 0, paidCount: 1, paidCents: 100_000 },
      { month: '2026-04', receivedCount: 0, receivedCents: 0, paidCount: 1, paidCents: 100_000 },
    ];
    const sameView = buildEvolutionView({ overview: same, metric: 'pago', windowMonths: 3, currentMonth: '2026-05', hiddenMonths: [] });
    expect(evolutionVariation(sameView, '2026-04')).toMatchObject({ text: 'De março para abril: sem diferença', percentText: null });
    const tiny: MonthOverview[] = [
      { month: '2026-03', receivedCount: 0, receivedCents: 0, paidCount: 1, paidCents: 100_000_000 },
      { month: '2026-04', receivedCount: 0, receivedCents: 0, paidCount: 1, paidCents: 100_000_001 },
    ];
    const tinyView = buildEvolutionView({ overview: tiny, metric: 'pago', windowMonths: 3, currentMonth: '2026-05', hiddenMonths: [] });
    expect(evolutionVariation(tinyView, '2026-04')).toMatchObject({ percentText: 'Menos de 0,1% a mais que março' });
  });

  it('T27: base zero não tem percentual; mês em andamento e mês sem registros não têm variação', () => {
    const zero: MonthOverview[] = [
      { month: '2026-03', receivedCount: 0, receivedCents: 0, paidCount: 1, paidCents: 0 },
      { month: '2026-04', receivedCount: 0, receivedCents: 0, paidCount: 1, paidCents: 50_000 },
    ];
    const view = buildEvolutionView({ overview: zero, metric: 'pago', windowMonths: 3, currentMonth: '2026-05', hiddenMonths: [] });
    expect(evolutionVariation(view, '2026-04')).toMatchObject({ available: true, text: 'De março para abril: R$ 500,00 a mais', percentText: 'Percentual não disponível para estes meses.' });
    const june = fromJune();
    expect(evolutionVariation(june, '2026-06')).toEqual({ available: false, text: 'Variação não disponível: o mês ainda está em andamento.' });
    const received = fromJune([], 'recebido');
    expect(evolutionVariation(received, '2026-03')).toEqual({ available: false, text: 'Variação não disponível: mês sem registros.' });
    // Janeiro é o primeiro mês da janela: não há mês antes dele.
    expect(evolutionVariation(june, '2026-01')).toEqual({ available: false, text: 'Variação não disponível: não há outro mês na comparação antes deste.' });
    // Mês sem registros no meio é dito à parte.
    expect(evolutionVariation(received, '2026-04')).toMatchObject({ text: 'De fevereiro para abril: R$ 200,00 a mais', skippedText: 'Março está sem registros.', adjacent: false });
  });
});

describe('painel do mês (tela B)', () => {
  it('abril: valor com centavos, estado, interruptor ligado e links', () => {
    const panel = evolutionPanel(fromJune(), '2026-04');
    expect(panel).toMatchObject({
      title: 'Abril de 2026',
      valueCaption: 'Pago',
      valueText: 'R$ 7.800,00',
      stateText: 'Com registros',
      canToggle: true,
      included: true,
      notEligibleText: null,
      showsCategories: true,
      showsRecords: true,
      recordsHref: '/composicao?tipo=pago',
      categoriesHref: '/composicao?tipo=pago&vista=categoria',
    });
    expect(evolutionPanel(fromJune(['2026-04']), '2026-04')).toMatchObject({ canToggle: true, included: false });
  });

  it('mês em andamento e mês sem registros: sem interruptor, com a razão; Recebido com categorias só no mês com registros', () => {
    const june = evolutionPanel(fromJune(), '2026-06');
    expect(june).toMatchObject({ stateText: 'Mês em andamento', canToggle: false, included: false, notEligibleText: 'Este mês fica fora da comparação até terminar.', showsCategories: true });
    const march = evolutionPanel(fromJune([], 'recebido'), '2026-03');
    expect(march).toMatchObject({ valueText: null, canToggle: false, notEligibleText: 'Este mês fica fora da comparação porque não tem registros.', showsCategories: false, showsRecords: false });
    const received = evolutionPanel(fromJune([], 'recebido'), '2026-04');
    // Fase 2: Recebido também mostra as 3 maiores categorias do mês (sem tela de categorias, então sem "Ver Pago por categoria").
    expect(received).toMatchObject({
      metric: 'recebido',
      valueCaption: 'Recebido',
      valueText: 'R$ 5.200,00',
      showsCategories: true,
      categoriesNote: 'Mostra o que foi recebido.',
      showsCategoriesAction: false,
      showsRecords: true,
      recordsHref: '/composicao?tipo=recebido',
    });
    expect(evolutionPanel(fromJune(), '2026-04')).toMatchObject({ metric: 'pago', categoriesNote: 'Mostra o que foi pago. Compra no cartão entra quando a fatura é paga.', showsCategoriesAction: true });
    expect(march).toMatchObject({ showsCategories: false, showsCategoriesAction: false });
  });

  it('as categorias do painel falam do pago ou do recebido', () => {
    expect(EVOLUTION_TEXT.panel.categoryShare('35,9%')).toBe('35,9% do pago');
    expect(EVOLUTION_TEXT.panel.categoryShare('35,9%', 'pago')).toBe('35,9% do pago');
    expect(EVOLUTION_TEXT.panel.categoryShare('100%', 'recebido')).toBe('100% do recebido');
  });

  it('o mês escolhido que sai da janela, ou ainda não escolhido, é o mais recente com lançamentos', () => {
    const view = fromJune();
    expect(evolutionSelectedMonth(view, '2026-04')).toBe('2026-04');
    expect(evolutionSelectedMonth(view, '2025-01')).toBe('2026-06');
    expect(evolutionSelectedMonth(view, null)).toBe('2026-06');
    expect(evolutionPanel(view, '2025-01').month).toBe('2026-06');
    // Com o mês atual sem lançamentos, o painel abre no último mês que tem; sem nenhum, no último da janela.
    const after = buildEvolutionView({ overview, metric: 'pago', windowMonths: 6, currentMonth: '2026-08', hiddenMonths: [] });
    expect(after.points[5]).toMatchObject({ month: '2026-08', state: 'sem_registros' });
    expect(evolutionSelectedMonth(after, null)).toBe('2026-06');
    const empty = buildEvolutionView({ overview: [], metric: 'pago', windowMonths: 3, currentMonth: '2026-08', hiddenMonths: [] });
    expect(evolutionSelectedMonth(empty, null)).toBe('2026-08');
  });
});

describe('as maiores categorias do painel', () => {
  it('as 3 maiores por valor (empate: nome), com "Sem categoria" entrando pelo valor, e sem mexer na lista', () => {
    const share = (category: string | null, cents: number) => ({ category, label: category ?? 'Sem categoria', cents, tenths: 0, percentText: '0%', a11yLabel: '' });
    const shares = [share('Mercado', 88_000), share('Moradia', 200_000), share('Lazer', 88_000), share(null, 300_000), share('Transporte', 470_000)];
    const before = JSON.stringify(shares);
    expect(evolutionTopCategories(shares).map((c) => [c.label, c.cents])).toEqual([
      ['Transporte', 470_000],
      ['Sem categoria', 300_000],
      ['Moradia', 200_000],
    ]);
    expect(evolutionTopCategories([share('Mercado', 88_000), share('Lazer', 88_000), share('Casa', 88_000), share('Zoo', 88_000)]).map((c) => c.label)).toEqual(['Casa', 'Lazer', 'Mercado']);
    expect(evolutionTopCategories([])).toEqual([]);
    expect(JSON.stringify(shares)).toBe(before);
  });
});

describe('meses fora da comparação na memória (D03, T13, T19)', () => {
  it('cada métrica tem a sua seleção, e restaurar uma não mexe na outra', () => {
    const store = new EvolutionSelectionStore();
    const scope = EvolutionSelectionStore.scope('pessoa-1', 'contexto-1')!;
    store.setHidden(scope, 'pago', '2026-04', true);
    expect([...store.get(scope, 'pago')]).toEqual(['2026-04']);
    expect(store.get(scope, 'recebido').size).toBe(0);
    store.setHidden(scope, 'recebido', '2026-02', true);
    store.restoreAll(scope, 'pago');
    expect(store.get(scope, 'pago').size).toBe(0);
    expect([...store.get(scope, 'recebido')]).toEqual(['2026-02']);
    // Cada métrica vai para o mesmo cálculo (12 meses, com os seis de janeiro a junho fechados), com a sua própria seleção.
    const build = (metric: EvolutionMetric) =>
      buildEvolutionView({ overview, metric, windowMonths: 12, currentMonth: '2026-12', hiddenMonths: store.get(scope, metric) });
    // Fevereiro foi tirado só de Recebido: Pago não o herda.
    const pago = build('pago');
    const recebido = build('recebido');
    expect(recebido.stats.hiddenMonths).toEqual(['2026-02']);
    expect(recebido.outCount).toBe(1);
    expect(pago.stats.hiddenMonths).toEqual([]);
    expect(pago.outCount).toBe(0);
    expect(pago.points.find((p) => p.month === '2026-02')).toMatchObject({ participation: 'na_comparacao', included: true });
    // O contrário: abril tirado só de Pago não chega a Recebido, e restaurar Pago não devolve o fevereiro de Recebido.
    store.setHidden(scope, 'pago', '2026-04', true);
    expect(build('pago').stats.hiddenMonths).toEqual(['2026-04']);
    expect(build('recebido').stats.hiddenMonths).toEqual(['2026-02']);
    expect(build('recebido').points.find((p) => p.month === '2026-04')).toMatchObject({ participation: 'na_comparacao', included: true });
    store.restoreAll(scope, 'pago');
    expect(build('pago').stats.hiddenMonths).toEqual([]);
    expect(build('recebido').stats.hiddenMonths).toEqual(['2026-02']);
  });

  it('por pessoa e por contexto: outra pessoa ou outro contexto começa sem nada', () => {
    const store = new EvolutionSelectionStore();
    const a = EvolutionSelectionStore.scope('pessoa-1', 'pessoal-1')!;
    const family = EvolutionSelectionStore.scope('pessoa-1', 'familia-1')!;
    const other = EvolutionSelectionStore.scope('pessoa-2', 'pessoal-2')!;
    store.setHidden(a, 'pago', '2026-04', true);
    expect(store.get(family, 'pago').size).toBe(0);
    expect(store.get(other, 'pago').size).toBe(0);
    expect(store.get(null, 'pago').size).toBe(0);
    expect(EvolutionSelectionStore.scope(null, 'x')).toBeNull();
    expect(EvolutionSelectionStore.scope('x', undefined)).toBeNull();
  });

  it('a mesma referência enquanto nada muda; repetir a ação não avisa ninguém; clear esquece tudo e avisa', () => {
    const store = new EvolutionSelectionStore();
    const scope = EvolutionSelectionStore.scope('p', 'c')!;
    let calls = 0;
    const off = store.subscribe(() => (calls += 1));
    const empty = store.get(scope, 'pago');
    expect(store.get(scope, 'pago')).toBe(empty);
    store.setHidden(scope, 'pago', '2026-04', false);
    store.restoreAll(scope, 'pago');
    store.clear();
    expect(calls).toBe(0);
    store.setHidden(scope, 'pago', '2026-04', true);
    const one = store.get(scope, 'pago');
    expect(store.get(scope, 'pago')).toBe(one);
    expect(one).not.toBe(empty);
    store.setHidden(scope, 'pago', '2026-04', true);
    expect(calls).toBe(1);
    store.setHidden(scope, 'pago', '2026-06', true);
    expect([...store.get(scope, 'pago')].sort()).toEqual(['2026-04', '2026-06']);
    expect(store.get(scope, 'pago')).not.toBe(one);
    store.setHidden(scope, 'pago', '2026-06', false);
    expect(calls).toBe(3);
    store.clear();
    expect(calls).toBe(4);
    expect(store.get(scope, 'pago').size).toBe(0);
    off();
    store.setHidden(scope, 'pago', '2026-05', true);
    expect(calls).toBe(4);
  });
});

describe('meses tirados em outra janela (Restaurar todos restaura tudo, com a pessoa sabendo)', () => {
  const store = () => {
    const st = new EvolutionSelectionStore();
    const scope = EvolutionSelectionStore.scope('pessoa-1', 'contexto-1')!;
    return { st, scope };
  };
  const build = (st: EvolutionSelectionStore, scope: string, windowMonths: EvolutionWindow, metric: EvolutionMetric = 'pago') =>
    buildEvolutionView({ overview, metric, windowMonths, currentMonth: '2026-06', hiddenMonths: st.get(scope, metric) });

  it('a janela de 3 meses (abril a junho) conta e cita fevereiro, que foi tirado na janela de 6 meses', () => {
    const { st, scope } = store();
    st.setHidden(scope, 'pago', '2026-02', true);
    st.setHidden(scope, 'pago', '2026-05', true);
    const view = build(st, scope, 3);
    // O aviso conta só os meses da janela (maio); fevereiro é dito à parte, com o ano.
    expect(view.outCount).toBe(1);
    expect(view.eligibleCount).toBe(2);
    expect(view.stats.hiddenMonths).toEqual(['2026-05']);
    expect(view.outsideMonths).toEqual(['2026-02']);
    expect(EVOLUTION_TEXT.custom.banner(view.outCount, view.eligibleCount)).toBe('Comparação personalizada: 1 de 2 meses fora da comparação');
    expect(EVOLUTION_TEXT.custom.list(view.stats.hiddenMonths, view.outsideMonths)).toBe(
      'Fora da comparação: maio, e 1 mês fora desta janela (fevereiro de 2026).',
    );
    // Na janela de 6 meses os dois estão à vista, e nada fica fora dela.
    const six = build(st, scope, 6);
    expect(six.outCount).toBe(2);
    expect(six.outsideMonths).toEqual([]);
    expect(EVOLUTION_TEXT.custom.list(six.stats.hiddenMonths, six.outsideMonths)).toBe('Fora da comparação: fevereiro e maio.');
    // "Restaurar todos" devolve também o que estava fora da janela: o aviso disse que eram dois.
    st.restoreAll(scope, 'pago');
    expect(build(st, scope, 3).outsideMonths).toEqual([]);
    expect(build(st, scope, 3).outCount).toBe(0);
    expect(build(st, scope, 6).outCount).toBe(0);
  });

  it('vários meses fora da janela: no plural, em ordem e com o ano de cada um; a média da janela não muda', () => {
    const { st, scope } = store();
    for (const m of ['2026-03', '2026-01', '2025-11']) st.setHidden(scope, 'pago', m, true);
    const view = build(st, scope, 3);
    expect(view.outsideMonths).toEqual(['2025-11', '2026-01', '2026-03']);
    expect(view.outCount).toBe(0);
    expect(view.stats.average).toBe(Math.round((780_000 + 345_000) / 2));
    expect(EVOLUTION_TEXT.custom.list(['2026-05'], view.outsideMonths)).toBe(
      'Fora da comparação: maio, e 3 meses fora desta janela (novembro de 2025, janeiro de 2026 e março de 2026).',
    );
    expect(EVOLUTION_TEXT.custom.list(['2026-05'], [])).toBe('Fora da comparação: maio.');
    expect(EVOLUTION_TEXT.custom.list(['2026-05'])).toBe('Fora da comparação: maio.');
  });

  it('cada valor mostrado tem os seus meses fora da janela, e o mês de outra métrica nunca entra', () => {
    const { st, scope } = store();
    st.setHidden(scope, 'recebido', '2026-02', true);
    expect(build(st, scope, 3, 'pago').outsideMonths).toEqual([]);
    expect(build(st, scope, 3, 'recebido').outsideMonths).toEqual(['2026-02']);
  });
});

describe('lacuna em mês fechado de Pago (D04, segunda metade, e D10)', () => {
  const WARNING = 'Pode faltar algo neste mês: há conta prevista sem registro';
  const gapView = (gapMonths: string[], hiddenMonths: string[] = [], metric: EvolutionMetric = 'pago', windowMonths: EvolutionWindow = 6) =>
    buildEvolutionView({ overview, metric, windowMonths, currentMonth: '2026-06', hiddenMonths, gapMonths });

  it('o ponto ganha o campo gap, continua na comparação e a média, a mediana e o total não mudam', () => {
    const plain = fromJune();
    const view = gapView(['2026-03']);
    expect(plain.points.every((p) => p.gap === false)).toBe(true);
    expect(view.points.map((p) => [p.month, p.gap])).toEqual([
      ['2026-01', false],
      ['2026-02', false],
      ['2026-03', true],
      ['2026-04', false],
      ['2026-05', false],
      ['2026-06', false],
    ]);
    expect(view.points[2]).toMatchObject({ participation: 'na_comparacao', included: true, eligible: true });
    expect(view.stats).toEqual(plain.stats);
    expect(view.eligibleCount).toBe(plain.eligibleCount);
    expect(view.totalCents).toBe(plain.totalCents);
    expect(view.situation).toBe(plain.situation);
  });

  it('o aviso está no nome acessível do ponto, e o texto tem a frase combinada', () => {
    expect(EVOLUTION_TEXT.gap.warning).toBe(WARNING);
    const view = gapView(['2026-03', '2026-04']);
    expect(view.points[2]!.name).toBe(`Março de 2026, R$ 3.300,00, na comparação, pode faltar algo neste mês: há conta prevista sem registro`);
    // O mês pode estar fora da comparação por escolha: o aviso continua.
    const out = gapView(['2026-04'], ['2026-04']);
    expect(out.points[3]).toMatchObject({ gap: true, participation: 'fora_escolha', included: false });
    expect(out.points[3]!.name).toBe('Abril de 2026, R$ 7.800,00, fora da comparação, pode faltar algo neste mês: há conta prevista sem registro');
    // Mês sem lacuna não muda de nome.
    expect(view.points[0]!.name).toBe('Janeiro de 2026, R$ 3.200,00, na comparação');
  });

  it('o painel traz o aviso e, com ele, a variação e as categorias do mês (D10); sem lacuna, gapText é null', () => {
    const view = gapView(['2026-04']);
    const panel = evolutionPanel(view, '2026-04');
    expect(panel.gapText).toBe(WARNING);
    expect(panel.stateText).toBe('Com registros');
    expect(panel.variation).toMatchObject({ available: true, text: 'De março para abril: R$ 4.500,00 a mais' });
    expect(panel).toMatchObject({ showsCategories: true, showsRecords: true, canToggle: true, included: true });
    expect(evolutionPanel(view, '2026-05').gapText).toBeNull();
    expect(evolutionPanel(fromJune(), '2026-04').gapText).toBeNull();
  });

  it('só Pago, e só mês fechado com registros: Recebido, mês sem registros e mês em andamento nunca têm o aviso', () => {
    // Em Recebido, março não tem registros e junho está em andamento; a lista de lacunas vale para Pago.
    const received = gapView(['2026-03', '2026-04', '2026-06'], [], 'recebido');
    expect(received.points.every((p) => p.gap === false)).toBe(true);
    expect(received.points[2]!.name).toBe('Março de 2026, sem registros, fora da comparação');
    expect(evolutionPanel(received, '2026-04').gapText).toBeNull();
    // Em Pago, junho (em andamento) e um mês fora da janela da leitura não ganham o aviso.
    const paid = gapView(['2026-06', '2025-01']);
    expect(paid.points.every((p) => p.gap === false)).toBe(true);
    // Mês sem registros em Pago (nenhum lançamento): o aviso de "sem registros" basta, sem aviso de lacuna e sem explicação (D10).
    const empty = buildEvolutionView({ overview: [], metric: 'pago', windowMonths: 3, currentMonth: '2026-06', hiddenMonths: [], gapMonths: ['2026-04', '2026-05'] });
    expect(empty.points.every((p) => p.gap === false && p.state === 'sem_registros')).toBe(true);
    const panel = evolutionPanel(empty, '2026-05');
    expect(panel).toMatchObject({ gapText: null, showsCategories: false, showsRecords: false, canToggle: false });
    expect(panel.variation.available).toBe(false);
  });

  it('o mês vizinho do painel, para "Mês anterior" e "Mês seguinte", e null no limite da janela', () => {
    const view = fromJune();
    expect(evolutionPanel(view, '2026-04')).toMatchObject({ previousMonth: '2026-03', nextMonth: '2026-05' });
    expect(evolutionPanel(view, '2026-01')).toMatchObject({ previousMonth: null, nextMonth: '2026-02' });
    expect(evolutionPanel(view, '2026-06')).toMatchObject({ previousMonth: '2026-05', nextMonth: null });
    expect(EVOLUTION_TEXT.panel.previous).toBe('Mês anterior');
    expect(EVOLUTION_TEXT.panel.next).toBe('Mês seguinte');
    expect(EVOLUTION_TEXT.panel.stepHint('2026-03')).toBe('Mostra março de 2026');
  });

  describe('evolutionGapMonths e loadEvolutionGaps', () => {
    /** Aluguel mensal desde maio, cadastrado em 20/05/2026; o dia passa a 07/10/2026 sem a geração das contas (como "Seus últimos meses"). */
    async function seriesRepo() {
      let today = '2026-05-20';
      const repo = new MemoryRepository({ actorId: 'pessoa-1', displayName: 'Pessoa Um', email: 'um@exemplo.com', today: () => today, latencyMs: 0 });
      const space = await repo.ensurePersonalSpace('Conta principal');
      const ctx = space.personalContextId;
      const write = await repo.createSeries(newOperationKey(), ctx, {
        kind: 'mensal',
        nature: 'conta',
        description: 'Aluguel',
        category: 'Moradia',
        amountCents: 250_000,
        amountMode: 'fixo',
        dueDay: 5,
        firstDueMonth: '2026-05',
        firstNumber: 1,
        installmentTotal: null,
        partsPerYear: null,
        lastMonth: null,
      });
      const may = write.occurrences.find((c) => c.dueOn === '2026-05-05')!;
      await repo.payCommitment(newOperationKey(), may.id, may.version, { accountId: space.accounts[0]!.id, amountCents: 250_000, paidOn: '2026-05-05', category: 'Moradia' });
      today = '2026-10-07';
      return { repo, ctx, space };
    }

    it('números da série sem conta registrada: de junho a setembro, e maio (paga) fica de fora', async () => {
      const { repo, ctx } = await seriesRepo();
      const series = await repo.listSeries(ctx);
      const commitments = await repo.listCommitmentsDueBetween(ctx, '2025-11', '2026-09');
      expect(evolutionGapMonths(series, commitments, '2025-11', '2026-09')).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
      expect(evolutionGapMonths(series, commitments, '2026-09', '2025-11')).toEqual([]);
      expect(await loadEvolutionGaps(repo, ctx, '2026-10')).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
    });

    it('depois da geração do dia, as contas de agosto e setembro em aberto continuam sendo lacuna; as pagas deixam de ser', async () => {
      const { repo, ctx, space } = await seriesRepo();
      await repo.syncSeriesOccurrences(ctx);
      // A geração cria setembro, outubro e novembro (em aberto): junho a agosto seguem sem conta, e setembro tem conta vencida em aberto.
      expect(await loadEvolutionGaps(repo, ctx, '2026-10')).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
      const sept = (await repo.listCommitmentsDueBetween(ctx, '2026-09', '2026-09')).find((c) => c.series?.number === 5)!;
      await repo.payCommitment(newOperationKey(), sept.id, sept.version, { accountId: space.accounts[0]!.id, amountCents: 250_000, paidOn: '2026-09-05', category: 'Moradia' });
      expect(await loadEvolutionGaps(repo, ctx, '2026-10')).toEqual(['2026-06', '2026-07', '2026-08']);
    });

    it('conta avulsa em aberto vencida em mês fechado é lacuna; a paga, a do mês atual e a de fora do período não', async () => {
      const repo = await createDemoRepository({ scenario: 'evolucao' });
      const ctx = (await repo.getSpace())!.personalContextId;
      expect(await loadEvolutionGaps(repo, ctx, '2026-10')).toEqual([]);
      const open = async (description: string, dueOn: string) => repo.createCommitment(newOperationKey(), ctx, { description, amountCents: 18_000, dueOn, category: 'Moradia' });
      await open('Luz de março', '2026-03-20');
      await open('Água de março', '2026-03-25');
      await open('Gás de setembro', '2026-09-28');
      await open('Internet de outubro', '2026-10-15');
      const paid = await open('Seguro de maio', '2026-05-10');
      await repo.payCommitment(newOperationKey(), paid.commitment.id, paid.commitment.version, {
        accountId: (await repo.getSpace())!.accounts[0]!.id,
        amountCents: 18_000,
        paidOn: '2026-05-10',
        category: 'Moradia',
      });
      // Março (duas contas, um mês só) e setembro; outubro é o mês atual e maio está pago.
      expect(await loadEvolutionGaps(repo, ctx, '2026-10')).toEqual(['2026-03', '2026-09']);
      // E o aviso entra no ponto de março, que tem registros, e não no de setembro, que não tem.
      const range = evolutionFetchRange('2026-10');
      const rows = await repo.monthsOverview(ctx, range.from, range.to);
      const view = buildEvolutionView({ overview: rows, metric: 'pago', windowMonths: 12, currentMonth: '2026-10', hiddenMonths: [], gapMonths: await loadEvolutionGaps(repo, ctx, '2026-10') });
      expect(view.points.filter((p) => p.gap).map((p) => p.month)).toEqual(['2026-03']);
      expect(view.points.find((p) => p.month === '2026-09')).toMatchObject({ state: 'sem_registros', gap: false });
    });

    it('serie_inconsistente é capturada: a série sem vigência é pulada, as outras seguem e outro erro continua sendo lançado', async () => {
      const { repo, ctx } = await seriesRepo();
      const [good] = await repo.listSeries(ctx);
      const commitments = await repo.listCommitmentsDueBetween(ctx, '2025-11', '2026-09');
      const broken: CommitmentSeries = { ...good!, id: 'serie-quebrada', terms: [] };
      expect(() => evolutionGapMonths([broken], commitments, '2025-11', '2026-09')).not.toThrow();
      // Sem as contas, a série quebrada não dá nenhum mês; com elas, só a conta em aberto de junho (que a série não precisa para valer).
      expect(evolutionGapMonths([broken], [], '2025-11', '2026-09')).toEqual([]);
      expect(evolutionGapMonths([broken], commitments, '2025-11', '2026-09')).toEqual(['2026-06']);
      expect(evolutionGapMonths([broken, good!], commitments, '2025-11', '2026-09')).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
      expect(() => evolutionGapMonths([{ ...good!, terms: null as never }], commitments, '2025-11', '2026-09')).toThrow(TypeError);
    });

    it('lê só listSeries e listCommitmentsDueBetween, dos 12 meses até o mês anterior ao atual; falha de leitura é falha (a tela mostra sem o aviso)', async () => {
      const calls: string[] = [];
      const repo = {
        listSeries: async (ctx: string) => {
          calls.push(`series:${ctx}`);
          return [] as CommitmentSeries[];
        },
        listCommitmentsDueBetween: async (ctx: string, from: string, to: string) => {
          calls.push(`due:${ctx}:${from}:${to}`);
          return [] as Commitment[];
        },
      };
      expect(await loadEvolutionGaps(repo, 'ctx-1', '2026-10')).toEqual([]);
      expect(calls.sort()).toEqual(['due:ctx-1:2025-11:2026-09', 'series:ctx-1']);
      const failing = { ...repo, listSeries: async (): Promise<CommitmentSeries[]> => Promise.reject(new Error('falha de leitura')) };
      await expect(loadEvolutionGaps(failing, 'ctx-1', '2026-10')).rejects.toThrow('falha de leitura');
    });

    it('a demonstração padrão e a do cenário "evolucao" não têm lacuna; a de "retorno" tem, mas só em meses sem registros', async () => {
      for (const scenario of [undefined, 'evolucao'] as const) {
        const repo = await createDemoRepository(scenario ? { scenario } : {});
        const ctx = (await repo.getSpace())!.personalContextId;
        expect(await loadEvolutionGaps(repo, ctx, monthOf(DEMO_TODAY)), String(scenario)).toEqual([]);
      }
      const repo = await createDemoRepository({ scenario: 'retorno' });
      const ctx = (await repo.getSpace())!.personalContextId;
      const gaps = await loadEvolutionGaps(repo, ctx, monthOf(DEMO_TODAY));
      expect(gaps).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
      const { from, to } = evolutionFetchRange(monthOf(DEMO_TODAY));
      const view = buildEvolutionView({ overview: await repo.monthsOverview(ctx, from, to), metric: 'pago', windowMonths: 12, currentMonth: monthOf(DEMO_TODAY), hiddenMonths: [], gapMonths: gaps });
      expect(view.points.some((p) => p.gap)).toBe(false);
      expect(view.points.find((p) => p.month === '2026-05')).toMatchObject({ state: 'com_registros', gap: false });
    });
  });
});

describe('navegação e busca (D-039)', () => {
  it('a rota é de consulta, com Movimentos marcado, e o índice "No app" a acha', () => {
    expect(EVOLUTION_ROUTE).toBe('/evolucao');
    expect(barModeFor('/evolucao')).toBe('consulta');
    expect(topicTabFor('/evolucao')).toBe('/movimentacoes');
    const screen = APP_SCREENS.find((s) => s.id === 'evolucao')!;
    expect(screen.href).toBe('/evolucao');
    expect(screen.title).toBe(EVOLUTION_TEXT.title);
    expect(screen.caption).toBe(EVOLUTION_TEXT.screenCaption);
  });
});

describe('a demonstração da Evolução (cenário fictício "evolucao")', () => {
  it('?cenario=evolucao é reconhecido', () => {
    expect(demoScenarioFrom('evolucao')).toBe('evolucao');
    expect(demoScenarioFrom(' Evolucao ')).toBe('evolucao');
  });

  it('Pago de janeiro a junho de 2026 é o caso de referência, com o "Reparo do carro" de R$ 4.400,00 em abril', async () => {
    const repo = await createDemoRepository({ scenario: 'evolucao' });
    const ctx = (await repo.getSpace())!.personalContextId;
    const { from, to } = evolutionFetchRange(monthOf(DEMO_TODAY));
    const rows = await repo.monthsOverview(ctx, from, to);
    expect(rows).toHaveLength(12);
    const view = buildEvolutionView({ overview: rows, metric: 'pago', windowMonths: 12, currentMonth: monthOf(DEMO_TODAY), hiddenMonths: [] });
    expect(view.points.filter((p) => p.state === 'com_registros').map((p) => [p.month, p.cents])).toEqual(
      MONTHS.map((m, i) => [m, PAID[i]]),
    );
    // Novembro e dezembro de 2025 e julho a outubro de 2026 não têm registros: à vista no eixo e fora das contas.
    expect(view.points.filter((p) => p.state === 'sem_registros').map((p) => p.month)).toEqual(['2025-11', '2025-12', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(view.stats.average).toBe(412_500);
    expect(view.stats.median).toBe(342_500);
    expect(view.totalCents).toBe(2_475_000);
    const noApril = buildEvolutionView({ overview: rows, metric: 'pago', windowMonths: 12, currentMonth: monthOf(DEMO_TODAY), hiddenMonths: ['2026-04'] });
    expect(noApril.stats.average).toBe(339_000);
    expect(noApril.stats.median).toBe(340_000);
    expect(noApril.totalCents).toBe(2_475_000);
    expect(EVOLUTION_TEXT.stats.ofMonths(noApril.stats.visibleCount, noApril.eligibleCount)).toBe('5 de 6 meses');
    const april = await repo.listRecords(ctx, '2026-04');
    const repair = april.find((r) => r.description === 'Reparo do carro')!;
    expect(repair).toMatchObject({ amountCents: 440_000, kind: 'despesa', status: 'realizado' });
    const summary = summarizeMonth(april, ctx, '2026-04');
    expect(summary.paidCents).toBe(780_000);
    const top = categoryBreakdown(summary.composition.paid, await loadInvoicesOfRecords(repo, summary.composition.paid, DEMO_TODAY));
    expect(top.slice(0, 3).map((c) => [c.label, c.cents])).toEqual([
      ['Transporte', 470_000],
      ['Moradia', 200_000],
      ['Mercado', 88_000],
    ]);
  });

  it('Recebido: março sem nenhum recebimento anotado; os outros meses com salário', async () => {
    const repo = await createDemoRepository({ scenario: 'evolucao' });
    const ctx = (await repo.getSpace())!.personalContextId;
    const rows = await repo.monthsOverview(ctx, '2026-01', '2026-06');
    const view = buildEvolutionView({ overview: rows, metric: 'recebido', windowMonths: 6, currentMonth: '2026-06', hiddenMonths: [] });
    expect(view.points.map((p) => p.cents)).toEqual([500_000, 500_000, 0, 520_000, 500_000, 510_000]);
    expect(view.points[2]!.state).toBe('sem_registros');
    expect(view.points[5]!.state).toBe('em_andamento');
  });

  it('a base de aceite de outubro de 2026 não muda: 6.000 / 3.900 / 2.100 e o resto da demonstração padrão', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const summary = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    expect([summary.receivedCents, summary.paidCents, summary.differenceCents]).toEqual([600_000, 390_000, 210_000]);
    const rows = await repo.monthsOverview(ctx, '2026-05', '2026-10');
    const view = buildEvolutionView({ overview: rows, metric: 'pago', windowMonths: 6, currentMonth: '2026-10', hiddenMonths: [] });
    expect(view.points.map((p) => p.state)).toEqual(['sem_registros', 'sem_registros', 'sem_registros', 'sem_registros', 'com_registros', 'em_andamento']);
    expect(view.points[4]).toMatchObject({ month: '2026-09', cents: 375_000 });
    expect(view.points[5]).toMatchObject({ month: '2026-10', cents: 390_000 });
    // Sem a faixa de cenário, a conta de demonstração padrão não tem o "Reparo do carro".
    expect((await repo.listRecords(ctx, '2026-04')).length).toBe(0);
  });

  it('uma conta nova nunca recebe dado de exemplo: nenhum ponto tem registros', async () => {
    const repo = new MemoryRepository({ actorId: 'pessoa-nova', displayName: 'Pessoa Nova', email: 'nova@exemplo.com', today: () => DEMO_TODAY, latencyMs: 0 });
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    const { from, to } = evolutionFetchRange(monthOf(DEMO_TODAY));
    const view = buildEvolutionView({ overview: await repo.monthsOverview(ctx, from, to), metric: 'pago', windowMonths: 12, currentMonth: monthOf(DEMO_TODAY), hiddenMonths: [] });
    expect(view.situation).toBe('sem_registros');
    expect(view.totalCents).toBe(0);
  });
});

/**
 * "Entender o que mudou" (fase 2: D06, D08 e D10; EF-16, EF-17, T14 e T28): quando a seção aparece, contra qual mês compara, os avisos e
 * a explicação por categoria e por lançamento. Descritiva: nunca diz que uma categoria foi a causa.
 */
describe('Entender o que mudou: o plano (quando aparece e contra qual mês)', () => {
  const WARNING = 'Pode faltar algo neste mês: há conta prevista sem registro';
  const gapView = (gapMonths: string[], hiddenMonths: string[] = [], metric: EvolutionMetric = 'pago') =>
    buildEvolutionView({ overview, metric, windowMonths: 6, currentMonth: '2026-06', hiddenMonths, gapMonths });

  it('abril contra março, os vizinhos da comparação, sempre com as duas datas e sem aviso', () => {
    const plan = evolutionExplainPlan(fromJune(), '2026-04');
    expect(plan).toEqual({
      visible: true,
      metric: 'pago',
      month: '2026-04',
      baseMonth: '2026-03',
      cents: 780_000,
      baseCents: 330_000,
      unavailableText: null,
      hint: 'Compara abril com março',
      notices: [],
      adjacencyText: null,
      compare: { included: true, label: 'Comparar sem este mês', hint: 'Só muda a média, a mediana e o gráfico. Nenhum lançamento é apagado nem mudado.' },
      showsCategoriesAction: true,
    });
    // O painel traz o mesmo plano.
    expect(evolutionPanel(fromJune(), '2026-04').explain).toEqual(plan);
  });

  it('o mês de comparação é o mesmo da variação, em todos os meses e com meses fora', () => {
    for (const hidden of [[], ['2026-04'], ['2026-02', '2026-04'], ['2026-03']]) {
      const view = fromJune(hidden);
      for (const point of view.points) {
        const variation = evolutionVariation(view, point.month);
        const plan = evolutionExplainPlan(view, point.month);
        if (variation.available) expect(plan.baseMonth, `${point.month} sem ${hidden}`).toBe(variation.fromMonth);
        // Sem variação por falta de outro mês antes, também não há mês de comparação (o mês em andamento não tem variação, mas tem a
        // descrição, contra o mesmo mês que a variação usaria).
        else if (point.state === 'com_registros') expect(plan.baseMonth, `${point.month} sem ${hidden}`).toBeNull();
      }
    }
  });

  it('T14: março e maio com abril fora não são vizinhos, e o texto diz as duas datas e qual mês está fora', () => {
    const plan = evolutionExplainPlan(fromJune(['2026-04']), '2026-05');
    expect(plan).toMatchObject({ baseMonth: '2026-03', month: '2026-05', hint: 'Compara maio com março', adjacencyText: '(março e maio não são meses vizinhos na comparação: abril está fora)' });
    // Vários meses fora no meio.
    const many = evolutionExplainPlan(fromJune(['2026-02', '2026-03', '2026-04']), '2026-05');
    expect(many).toMatchObject({ baseMonth: '2026-01', adjacencyText: '(janeiro e maio não são meses vizinhos na comparação: fevereiro, março e abril estão fora)' });
    // O próprio mês fora da comparação (abril) ainda compara com o anterior que está nela: vizinhos.
    expect(evolutionExplainPlan(fromJune(['2026-04']), '2026-04')).toMatchObject({ baseMonth: '2026-03', adjacencyText: null, compare: { included: false, label: 'Voltar a comparar com este mês' } });
  });

  it('mês sem registros no meio também é dito, e junto com mês tirado', () => {
    // Em Recebido, março não tem registros: abril compara com fevereiro.
    const received = evolutionExplainPlan(fromJune([], 'recebido'), '2026-04');
    expect(received).toMatchObject({ baseMonth: '2026-02', adjacencyText: '(fevereiro e abril não são meses vizinhos na comparação: março está sem registros)', showsCategoriesAction: false });
    const both = evolutionExplainPlan(fromJune(['2026-02'], 'recebido'), '2026-04');
    expect(both).toMatchObject({ baseMonth: '2026-01', adjacencyText: '(janeiro e abril não são meses vizinhos na comparação: fevereiro está fora; março está sem registros)' });
  });

  it('D10: não aparece em mês sem registros; aparece em mês com lacuna, com o aviso já existente, e o mês de comparação com lacuna também avisa', () => {
    expect(evolutionExplainPlan(fromJune([], 'recebido'), '2026-03')).toMatchObject({ visible: false, baseMonth: null, notices: [], compare: null });
    const empty = buildEvolutionView({ overview: [], metric: 'pago', windowMonths: 3, currentMonth: '2026-06', hiddenMonths: [], gapMonths: ['2026-04'] });
    for (const point of empty.points) expect(evolutionExplainPlan(empty, point.month).visible).toBe(false);
    expect(evolutionExplainPlan(gapView(['2026-04']), '2026-04').notices).toEqual([WARNING]);
    expect(evolutionExplainPlan(gapView(['2026-03']), '2026-04').notices).toEqual(['Pode faltar algo em março: há conta prevista sem registro']);
    expect(evolutionExplainPlan(gapView(['2026-03', '2026-04']), '2026-04').notices).toEqual([WARNING, 'Pode faltar algo em março: há conta prevista sem registro']);
    // A lacuna é só de Pago.
    expect(evolutionExplainPlan(gapView(['2026-03', '2026-04'], [], 'recebido'), '2026-04').notices).toEqual([]);
  });

  it('mês em andamento aparece, com o aviso de que os valores ainda podem mudar, e sem interruptor', () => {
    const plan = evolutionExplainPlan(fromJune(), '2026-06');
    expect(plan).toMatchObject({ visible: true, baseMonth: '2026-05', notices: ['Mês em andamento: os valores ainda podem mudar.'], compare: null, cents: 360_000, baseCents: 345_000 });
    // Com lacuna no mês de comparação, o aviso de andamento vem primeiro.
    expect(evolutionExplainPlan(gapView(['2026-05']), '2026-06').notices).toEqual(['Mês em andamento: os valores ainda podem mudar.', 'Pode faltar algo em maio: há conta prevista sem registro']);
  });

  it('um só mês na comparação (ou nenhum antes do escolhido): "Escolha outro mês na comparação para ver o que mudou."', () => {
    const text = 'Escolha outro mês na comparação para ver o que mudou.';
    expect(evolutionExplainPlan(fromJune(), '2026-01')).toMatchObject({ visible: true, baseMonth: null, unavailableText: text, hint: null, notices: [], compare: null });
    // Só maio na comparação: nenhum outro mês antes dele.
    const onlyMay = fromJune(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(evolutionExplainPlan(onlyMay, '2026-05')).toMatchObject({ visible: true, baseMonth: null, unavailableText: text });
    // Janela de 3 meses: o primeiro mês dela não tem outro antes.
    expect(evolutionExplainPlan(buildEvolutionView({ overview, metric: 'pago', windowMonths: 3, currentMonth: '2026-06', hiddenMonths: [] }), '2026-04')).toMatchObject({ baseMonth: null, unavailableText: text });
  });

  it('o mês escolhido que não existe na janela vira o último; não altera a visão', () => {
    const view = fromJune();
    const before = structuredClone(view);
    expect(evolutionExplainPlan(view, '2025-01').month).toBe('2026-06');
    expect(view).toEqual(before);
  });
});

describe('Entender o que mudou: a explicação em texto', () => {
  let seq = 0;
  const rec = (category: string | null, amountCents: number, description: string, occurredOn: string, kind: 'despesa' | 'receita' = 'despesa'): FinancialRecord => ({
    id: `e${++seq}`,
    contextId: 'c',
    accountId: 'a',
    kind,
    status: 'realizado',
    amountCents,
    currency: 'BRL',
    occurredOn,
    description,
    category,
    commitmentId: null,
    invoice: null,
    receiptKey: null,
    createdBy: 'p',
    version: 1,
    createdAt: `${occurredOn}T00:00:00Z`,
    updatedAt: `${occurredOn}T00:00:00Z`,
  });
  const total = (rows: readonly FinancialRecord[]) => rows.reduce((a, r) => a + r.amountCents, 0);
  const rows = (months: [string, FinancialRecord[]][]): MonthOverview[] =>
    months.map(([month, records]) => ({ month, receivedCount: 0, receivedCents: 0, paidCount: records.length, paidCents: total(records) }));

  const march = [rec('Casa', 120_000, 'Aluguel', '2026-03-05'), rec('Mercado', 80_000, 'Mercado', '2026-03-12')];
  const april = [rec('Casa', 120_000, 'Aluguel', '2026-04-05'), rec('Casa', 440_000, 'Reparo do carro', '2026-04-22'), rec('Mercado', 80_000, 'Mercado', '2026-04-12'), rec('Lazer', 10_000, 'Cinema', '2026-04-24')];
  const view = (hidden: string[] = []) => buildEvolutionView({ overview: rows([['2026-03', march], ['2026-04', april]]), metric: 'pago', windowMonths: 12, currentMonth: '2026-06', hiddenMonths: hidden });
  const explain = (v = view(), month = '2026-04', base = march, current = april) => evolutionExplanation(evolutionExplainPlan(v, month), paidCategoryParts(base), paidCategoryParts(current));

  it('a frase principal com os dois meses, as categorias com os dois valores e a diferença, e o lançamento relacionado', () => {
    const e = explain();
    expect(e.headline).toBe('O Pago registrado foi R$ 4.500,00 maior em abril que em março.');
    expect(e.adjacencyText).toBeNull();
    expect(e.notices).toEqual([]);
    expect(e.categoriesTitle).toBe('Categorias que mais mudaram');
    expect(e.categories.map((c) => c.text)).toEqual([
      'Casa: R$ 1.200,00 em março, R$ 5.600,00 em abril, R$ 4.400,00 a mais',
      'Lazer: sem pagamentos em março, R$ 100,00 em abril, R$ 100,00 a mais',
    ]);
    expect(e.othersText).toBeNull();
    expect(e.limitation).toBeNull();
    expect(e.related).toEqual({
      title: 'Lançamentos relacionados',
      intro: 'Os maiores lançamentos de abril em Casa',
      emptyText: null,
      rows: [
        { key: april[1]!.id, description: 'Reparo do carro', dateText: '22/04/2026', valueText: 'R$ 4.400,00', cents: 440_000, partialText: null, text: 'Reparo do carro · 22/04/2026 · R$ 4.400,00', a11y: 'Reparo do carro, 22/04/2026, R$ 4.400,00' },
        { key: april[0]!.id, description: 'Aluguel', dateText: '05/04/2026', valueText: 'R$ 1.200,00', cents: 120_000, partialText: null, text: 'Aluguel · 05/04/2026 · R$ 1.200,00', a11y: 'Aluguel, 05/04/2026, R$ 1.200,00' },
      ],
    });
    expect(e.change.differenceCents).toBe(450_000);
    expect(e.note).toBe('Descreve o que está registrado nos dois meses. Não diz que uma categoria ou um lançamento é a causa da diferença.');
  });

  it('"maior", "menor" e "igual": o mesmo fato com o sinal, sempre com os dois meses', () => {
    expect(EVOLUTION_TEXT.explain.headline('pago', 450_000, '2026-03', '2026-04')).toBe('O Pago registrado foi R$ 4.500,00 maior em abril que em março.');
    expect(EVOLUTION_TEXT.explain.headline('pago', -450_000, '2026-03', '2026-04')).toBe('O Pago registrado foi R$ 4.500,00 menor em abril que em março.');
    expect(EVOLUTION_TEXT.explain.headline('pago', 0, '2026-03', '2026-04')).toBe('O Pago registrado foi igual em abril e em março.');
    expect(EVOLUTION_TEXT.explain.headline('recebido', 20_000, '2026-02', '2026-04')).toBe('O Recebido registrado foi R$ 200,00 maior em abril que em fevereiro.');
    // Anos diferentes: os dois meses levam o ano.
    expect(EVOLUTION_TEXT.explain.headline('pago', 100, '2025-12', '2026-01')).toBe('O Pago registrado foi R$ 1,00 maior em janeiro de 2026 que em dezembro de 2025.');
    expect(EVOLUTION_TEXT.explain.hint('2025-12', '2026-01')).toBe('Compara janeiro de 2026 com dezembro de 2025');
  });

  it('abril menor que março: "a menos", e o lançamento relacionado é do mês escolhido (março)', () => {
    const v = buildEvolutionView({ overview: rows([['2026-03', april], ['2026-04', march]]), metric: 'pago', windowMonths: 12, currentMonth: '2026-06', hiddenMonths: [] });
    const e = explain(v, '2026-04', april, march);
    expect(e.headline).toBe('O Pago registrado foi R$ 4.500,00 menor em abril que em março.');
    expect(e.categories[0]!.text).toBe('Casa: R$ 5.600,00 em março, R$ 1.200,00 em abril, R$ 4.400,00 a menos');
    expect(e.related!.rows.map((r) => r.description)).toEqual(['Aluguel']);
  });

  it('as categorias que não fecham a diferença: "Outras categorias também mudaram", sem dizer que uma categoria foi a causa', () => {
    const base = [rec('Casa', 100_000, 'a', '2026-03-01'), rec('Mercado', 100_000, 'b', '2026-03-02'), rec('Lazer', 100_000, 'c', '2026-03-03'), rec('Saúde', 100_000, 'd', '2026-03-04')];
    const next = [rec('Casa', 600_000, 'a', '2026-04-01'), rec('Mercado', 300_000, 'b', '2026-04-02'), rec('Lazer', 20_000, 'c', '2026-04-03'), rec('Saúde', 110_000, 'd', '2026-04-04')];
    const v = buildEvolutionView({ overview: rows([['2026-03', base], ['2026-04', next]]), metric: 'pago', windowMonths: 12, currentMonth: '2026-06', hiddenMonths: [] });
    const e = explain(v, '2026-04', base, next);
    expect(e.categories.map((c) => c.label)).toEqual(['Casa', 'Mercado', 'Lazer']);
    expect(e.othersText).toBe('Outras categorias também mudaram: R$ 100,00 a mais no total.');
    expect(e.othersText).not.toMatch(/causa|culpa|motivo|por causa/i);
    // Sobra negativa: as 3 categorias somam mais que a diferença total, e a frase diz "a menos".
    const lower = [rec('Casa', 600_000, 'a', '2026-04-01'), rec('Mercado', 300_000, 'b', '2026-04-02'), rec('Lazer', 20_000, 'c', '2026-04-03'), rec('Saúde', 90_000, 'd', '2026-04-04')];
    const vLower = buildEvolutionView({ overview: rows([['2026-03', base], ['2026-04', lower]]), metric: 'pago', windowMonths: 12, currentMonth: '2026-06', hiddenMonths: [] });
    expect(explain(vLower, '2026-04', base, lower).othersText).toBe('Outras categorias também mudaram: R$ 100,00 a menos no total.');
    // Quando fecha, a frase não aparece.
    expect(explain().othersText).toBeNull();
  });

  it('T14: março e maio com abril fora: a frase diz as duas datas reais e o mês fora; nunca "mês a mês"', () => {
    const may = [rec('Casa', 120_000, 'Aluguel', '2026-05-05'), rec('Mercado', 95_000, 'Mercado', '2026-05-12')];
    const v = buildEvolutionView({ overview: rows([['2026-03', march], ['2026-04', april], ['2026-05', may]]), metric: 'pago', windowMonths: 12, currentMonth: '2026-06', hiddenMonths: ['2026-04'] });
    const e = explain(v, '2026-05', march, may);
    expect(e.headline).toBe('O Pago registrado foi R$ 150,00 maior em maio que em março.');
    expect(e.adjacencyText).toBe('(março e maio não são meses vizinhos na comparação: abril está fora)');
    expect(`${e.headline} ${e.adjacencyText}`).not.toMatch(/mês a mês/i);
    expect(e.categories.map((c) => c.text)).toEqual(['Mercado: R$ 800,00 em março, R$ 950,00 em maio, R$ 150,00 a mais']);
  });

  it('diferença zero sem categoria que mudou: "igual" e "Nenhuma categoria mudou de valor."', () => {
    const copy = march.map((r) => ({ ...r, id: `${r.id}x`, occurredOn: r.occurredOn.replace('-03-', '-04-') }));
    const v = buildEvolutionView({ overview: rows([['2026-03', march], ['2026-04', copy]]), metric: 'pago', windowMonths: 12, currentMonth: '2026-06', hiddenMonths: [] });
    const e = explain(v, '2026-04', march, copy);
    expect(e.headline).toBe('O Pago registrado foi igual em abril e em março.');
    expect(e).toMatchObject({ categories: [], noChangeText: 'Nenhuma categoria mudou de valor.', othersText: null, related: null });
  });

  it('lançamentos que não fecham com os totais dos meses: só a limitação, sem categoria e sem lançamento', () => {
    const v = buildEvolutionView({ overview: rows([['2026-03', march], ['2026-04', april]]), metric: 'pago', windowMonths: 12, currentMonth: '2026-06', hiddenMonths: [] });
    const e = explain(v, '2026-04', march, april.slice(0, 2));
    expect(e.headline).toBe('O Pago registrado foi R$ 4.500,00 maior em abril que em março.');
    expect(e).toMatchObject({
      categories: [],
      related: null,
      othersText: null,
      limitation: 'Os lançamentos lidos não fecham com o total dos dois meses, então não dá para detalhar por categoria agora.',
    });
  });

  it('categoria que sumiu no mês de chegada, sem lançamento nela: "Nenhum lançamento em ..."', () => {
    // A categoria que mais mudou é Casa, que sumiu em abril: nenhum lançamento dela no mês escolhido.
    const base = [rec('Casa', 500_000, 'Reforma', '2026-03-10'), rec('Mercado', 10_000, 'Mercado', '2026-03-12')];
    const next = [rec('Mercado', 10_000, 'Mercado', '2026-04-12')];
    const v = buildEvolutionView({ overview: rows([['2026-03', base], ['2026-04', next]]), metric: 'pago', windowMonths: 12, currentMonth: '2026-06', hiddenMonths: [] });
    const e = explain(v, '2026-04', base, next);
    expect(e.categories[0]!.text).toBe('Casa: R$ 5.000,00 em março, sem pagamentos em abril, R$ 5.000,00 a menos');
    expect(e.related).toMatchObject({ rows: [], emptyText: 'Nenhum lançamento em Casa em abril.' });
  });

  it('pagamento de fatura: o lançamento relacionado mostra a parte da categoria e diz que é parte', () => {
    const invoice = { cardId: 'cartao', month: '2026-04', mix: [{ category: 'Mercado', charges: false, cents: 60_000 }, { category: 'Lazer', charges: false, cents: 40_000 }] };
    const pay: FinancialRecord = { ...rec('Cartão', 100_000, 'Fatura do cartão', '2026-04-10'), invoice: { cardId: 'cartao', month: '2026-04' } };
    const base = [rec('Mercado', 10_000, 'Mercado', '2026-03-12')];
    const v = buildEvolutionView({ overview: rows([['2026-03', base], ['2026-04', [pay]]]), metric: 'pago', windowMonths: 12, currentMonth: '2026-06', hiddenMonths: [] });
    const e = evolutionExplanation(evolutionExplainPlan(v, '2026-04'), paidCategoryParts(base), paidCategoryParts([pay], [invoice]));
    expect(e.categories.map((c) => c.text)).toEqual([
      'Mercado: R$ 100,00 em março, R$ 600,00 em abril, R$ 500,00 a mais',
      'Lazer: sem pagamentos em março, R$ 400,00 em abril, R$ 400,00 a mais',
    ]);
    expect(e.related!.rows).toEqual([
      { key: pay.id, description: 'Fatura do cartão', dateText: '10/04/2026', valueText: 'R$ 600,00', cents: 60_000, partialText: 'Parte do pagamento da fatura', text: 'Fatura do cartão · 10/04/2026 · R$ 600,00', a11y: 'Fatura do cartão, 10/04/2026, R$ 600,00, parte do pagamento da fatura' },
    ]);
  });

  it('Recebido: "O Recebido registrado foi ...", com as categorias dos recebimentos e "sem recebimentos"', () => {
    const feb = [rec('Salário', 500_000, 'Salário', '2026-02-05', 'receita')];
    const apr = [rec('Salário', 500_000, 'Salário', '2026-04-05', 'receita'), rec('Freela', 120_000, 'Projeto', '2026-04-20', 'receita')];
    const ov: MonthOverview[] = [
      { month: '2026-02', receivedCount: 1, receivedCents: 500_000, paidCount: 0, paidCents: 0 },
      { month: '2026-04', receivedCount: 2, receivedCents: 620_000, paidCount: 0, paidCents: 0 },
    ];
    const v = buildEvolutionView({ overview: ov, metric: 'recebido', windowMonths: 12, currentMonth: '2026-06', hiddenMonths: [] });
    const plan = evolutionExplainPlan(v, '2026-04');
    expect(plan).toMatchObject({ baseMonth: '2026-02', adjacencyText: '(fevereiro e abril não são meses vizinhos na comparação: março está sem registros)', showsCategoriesAction: false });
    const e = evolutionExplanation(plan, receivedCategoryParts(feb), receivedCategoryParts(apr));
    expect(e.headline).toBe('O Recebido registrado foi R$ 1.200,00 maior em abril que em fevereiro.');
    expect(e.categories.map((c) => c.text)).toEqual(['Freela: sem recebimentos em fevereiro, R$ 1.200,00 em abril, R$ 1.200,00 a mais']);
    expect(e.related!.rows.map((r) => [r.description, r.valueText])).toEqual([['Projeto', 'R$ 1.200,00']]);
  });

  it('sem mês de comparação não há explicação (lança RangeError)', () => {
    const plan = evolutionExplainPlan(fromJune(), '2026-01');
    expect(() => evolutionExplanation(plan, [] as CategoryPart[], [] as CategoryPart[])).toThrow(RangeError);
    expect(() => evolutionExplanation(evolutionExplainPlan(fromJune([], 'recebido'), '2026-03'), [], [])).toThrow(RangeError);
  });
});

describe('Entender o que mudou na demonstração (cenário "evolucao", EF §6)', () => {
  async function demoSides(metric: EvolutionMetric) {
    const repo = await createDemoRepository({ scenario: 'evolucao' });
    const ctx = (await repo.getSpace())!.personalContextId;
    const { from, to } = evolutionFetchRange(monthOf(DEMO_TODAY));
    const overviewRows = await repo.monthsOverview(ctx, from, to);
    const parts = async (month: string): Promise<CategoryPart[]> => {
      const summary = summarizeMonth(await repo.listRecords(ctx, month), ctx, month);
      return metric === 'pago'
        ? paidCategoryParts(summary.composition.paid, await loadInvoicesOfRecords(repo, summary.composition.paid, DEMO_TODAY))
        : receivedCategoryParts(summary.composition.received);
    };
    const build = (hidden: string[] = []) => buildEvolutionView({ overview: overviewRows, metric, windowMonths: 12, currentMonth: monthOf(DEMO_TODAY), hiddenMonths: hidden });
    return { parts, build };
  }

  it('abril contra março: R$ 4.500,00 maior, o reparo de R$ 4.400,00 como lançamento relacionado e "Outras categorias também mudaram" com os R$ 100,00 restantes', async () => {
    const { parts, build } = await demoSides('pago');
    const e = evolutionExplanation(evolutionExplainPlan(build(), '2026-04'), await parts('2026-03'), await parts('2026-04'));
    expect(e.headline).toBe('O Pago registrado foi R$ 4.500,00 maior em abril que em março.');
    expect(e.categories.map((c) => c.text)).toEqual([
      'Transporte: R$ 300,00 em março, R$ 4.700,00 em abril, R$ 4.400,00 a mais',
      'Mercado: R$ 730,00 em março, R$ 880,00 em abril, R$ 150,00 a mais',
      'Saúde: R$ 150,00 em março, sem pagamentos em abril, R$ 150,00 a menos',
    ]);
    // 4.400 + 150 − 150 = 4.400: sobram R$ 100,00 de outras categorias (Lazer: R$ 120,00 para R$ 220,00).
    expect(e.othersText).toBe('Outras categorias também mudaram: R$ 100,00 a mais no total.');
    expect(e.change.otherCents).toBe(100_00);
    expect(e.related).toMatchObject({ title: 'Lançamentos relacionados', intro: 'Os maiores lançamentos de abril em Transporte', emptyText: null });
    expect(e.related!.rows.map((r) => r.text)).toEqual(['Reparo do carro · 22/04/2026 · R$ 4.400,00', 'Combustível · 18/04/2026 · R$ 300,00']);
    expect(e.limitation).toBeNull();
    expect(e.change.reconciled).toBe(true);
  });

  it('T14 no cenário: com abril fora, maio contra março diz as duas datas, "R$ 150,00 maior" e que abril está fora', async () => {
    const { parts, build } = await demoSides('pago');
    const e = evolutionExplanation(evolutionExplainPlan(build(['2026-04']), '2026-05'), await parts('2026-03'), await parts('2026-05'));
    expect(e.headline).toBe('O Pago registrado foi R$ 150,00 maior em maio que em março.');
    expect(e.adjacencyText).toBe('(março e maio não são meses vizinhos na comparação: abril está fora)');
  });

  it('Recebido: abril contra fevereiro (março sem registros), com o salário como categoria', async () => {
    const { parts, build } = await demoSides('recebido');
    const plan = evolutionExplainPlan(build(), '2026-04');
    expect(plan.baseMonth).toBe('2026-02');
    const e = evolutionExplanation(plan, await parts('2026-02'), await parts('2026-04'));
    expect(e.headline).toBe('O Recebido registrado foi R$ 200,00 maior em abril que em fevereiro.');
    expect(e.categories.map((c) => c.text)).toEqual(['Salário: R$ 5.000,00 em fevereiro, R$ 5.200,00 em abril, R$ 200,00 a mais']);
    expect(e.related!.rows.map((r) => r.text)).toEqual(['Salário · 05/04/2026 · R$ 5.200,00']);
    expect(e.othersText).toBeNull();
  });

  it('nenhum mês da demonstração tem lançamentos que não fechem com o total do gráfico (Pago e Recebido, janela de 12 meses)', async () => {
    for (const metric of ['pago', 'recebido'] as EvolutionMetric[]) {
      const { parts, build } = await demoSides(metric);
      const view = build();
      const closed = view.points.filter((p) => p.state === 'com_registros');
      expect(closed.length).toBe(metric === 'pago' ? 6 : 5);
      for (const point of closed) expect((await parts(point.month)).reduce((a, p) => a + p.cents, 0), `${metric} ${point.month}`).toBe(point.cents);
    }
  });
});
