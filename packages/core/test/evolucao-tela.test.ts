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
  evolutionFetchRange,
  evolutionMonths,
  evolutionPanel,
  evolutionSelectedMonth,
  evolutionTopCategories,
  evolutionVariation,
  isEvolutionWindow,
  loadInvoicesOfRecords,
  monthOf,
  summarizeMonth,
  topicTabFor,
  type EvolutionMetric,
  type EvolutionWindow,
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

  it('mês em andamento e mês sem registros: sem interruptor, com a razão; Recebido sem categorias', () => {
    const june = evolutionPanel(fromJune(), '2026-06');
    expect(june).toMatchObject({ stateText: 'Mês em andamento', canToggle: false, included: false, notEligibleText: 'Este mês fica fora da comparação até terminar.', showsCategories: true });
    const march = evolutionPanel(fromJune([], 'recebido'), '2026-03');
    expect(march).toMatchObject({ valueText: null, canToggle: false, notEligibleText: 'Este mês fica fora da comparação porque não tem registros.', showsCategories: false, showsRecords: false });
    const received = evolutionPanel(fromJune([], 'recebido'), '2026-04');
    expect(received).toMatchObject({ valueCaption: 'Recebido', valueText: 'R$ 5.200,00', showsCategories: false, showsRecords: true, recordsHref: '/composicao?tipo=recebido' });
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
    // Cada métrica vai para o mesmo cálculo, com a sua própria seleção.
    const pago = buildEvolutionView({ overview, metric: 'pago', windowMonths: 6, currentMonth: '2026-12', hiddenMonths: store.get(scope, 'pago') });
    const recebido = buildEvolutionView({ overview, metric: 'recebido', windowMonths: 6, currentMonth: '2026-12', hiddenMonths: store.get(scope, 'recebido') });
    expect(pago.outCount).toBe(0);
    expect(recebido.points.length).toBe(6);
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
    const { MemoryRepository } = await import('../src');
    const repo = new MemoryRepository({ actorId: 'pessoa-nova', displayName: 'Pessoa Nova', email: 'nova@exemplo.com', today: () => DEMO_TODAY, latencyMs: 0 });
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    const { from, to } = evolutionFetchRange(monthOf(DEMO_TODAY));
    const view = buildEvolutionView({ overview: await repo.monthsOverview(ctx, from, to), metric: 'pago', windowMonths: 12, currentMonth: monthOf(DEMO_TODAY), hiddenMonths: [] });
    expect(view.situation).toBe('sem_registros');
    expect(view.totalCents).toBe(0);
  });
});
