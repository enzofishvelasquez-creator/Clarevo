import { describe, expect, it } from 'vitest';
import {
  EVOLUTION_TEXT,
  MONTH_CHECK_KINDS,
  MONTH_CHECK_TEXT,
  MemoryFamilyHub,
  MemoryRepository,
  MonthCheckKeys,
  buildEvolutionView,
  buildReturnReview,
  checkKindOf,
  comparisonStats,
  evolutionPanel,
  evolutionPoints,
  evolutionSelectedMonth,
  evolutionVariation,
  importKey,
  invoiceFor,
  isRepoError,
  loadInvoices,
  loadReturnReview,
  monthCheckCardPurchases,
  monthCheckErrorText,
  monthCheckOutcome,
  monthCheckPlan,
  monthCheckState,
  monthCheckTextSamples,
  monthCheckValid,
  monthCheckVersion,
  monthsOverview,
  newOperationKey,
  reviewMonthCard,
  returnWindow,
  summarizeMonth,
  type ImportItem,
  type MonthOverview,
  type RepoError,
  type RepoErrorCode,
} from '../src';

/**
 * "Conferi este mês" (D-060, item 2; resolve P-022): o zero confirmado. Regras puras (estado e plano de cada mês e tipo, a versão que a
 * tela manda, o aviso de compras no cartão, o resultado e as chaves das tentativas), a Evolução (estado `zero_confirmado`, que entra
 * nas médias e na mediana como zero), "Seus últimos meses" (o mês conferido deixa de ser lacuna) e o repositório em memória (as mesmas
 * regras de set_month_check e clear_month_check, testadas no banco em 48_mes_conferido.sql). Pago é caixa, pela data do pagamento:
 * a conferência fala de "pagamentos", e compra no cartão só entra no Pago quando a fatura é paga.
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
  receivedCheckVersion: 0,
  paidCheckVersion: 0,
  cardPurchaseCount: 0,
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
      version: 0,
      action: 'Conferi: não houve pagamentos em agosto de 2026',
      actionNote: 'Não muda nenhum valor e você pode desfazer.',
      doneText: null,
      cardNotice: null,
      undo: null,
    });
    expect(monthCheckPlan(row('2026-08'), 'recebimentos', now, true).action).toBe('Conferi: não houve recebimentos em agosto de 2026');
    // Quem só lê não vê o botão.
    expect(monthCheckPlan(row('2026-08'), 'pagamentos', now, false)).toMatchObject({ state: 'sem_registros', action: null, actionNote: null, doneText: null, undo: null });
    const done = monthCheckPlan(row('2026-08', { paidChecked: true }), 'pagamentos', now, true);
    expect(done).toMatchObject({ state: 'conferido', action: null, doneText: 'Você conferiu: não houve pagamentos em agosto de 2026.', undo: 'Desfazer a conferência' });
    expect(done.undoA11y).toBe('Desfazer a conferência: não houve pagamentos em agosto de 2026');
    const reader = monthCheckPlan(row('2026-08', { receivedChecked: true }), 'recebimentos', now, false);
    expect(reader).toMatchObject({ state: 'conferido', doneText: 'Você conferiu: não houve recebimentos em agosto de 2026.', undo: null, undoA11y: null });
    // Mês atual e mês com registro: nada.
    for (const r of [row('2026-10'), row('2026-08', { paidCount: 1, paidCents: 1 })]) {
      expect(monthCheckPlan(r, 'pagamentos', now, true)).toMatchObject({ action: null, doneText: null, undo: null });
    }
  });

  it('a versão que a tela manda é a da linha da marca (0 sem linha), ligada ou desligada, no tipo certo', () => {
    const now = '2026-10';
    expect(monthCheckVersion(row('2026-08'), 'pagamentos')).toBe(0);
    expect(monthCheckVersion(row('2026-08', { paidCheckVersion: 4, receivedCheckVersion: 2 }), 'pagamentos')).toBe(4);
    expect(monthCheckVersion(row('2026-08', { paidCheckVersion: 4, receivedCheckVersion: 2 }), 'recebimentos')).toBe(2);
    // Linha de um banco sem a 0016, ou fora da forma: 0.
    expect(monthCheckVersion({ month: '2026-08', receivedCount: 0, receivedCents: 0, paidCount: 0, paidCents: 0 }, 'pagamentos')).toBe(0);
    expect(monthCheckVersion(row('2026-08', { paidCheckVersion: -1 }), 'pagamentos')).toBe(0);
    expect(monthCheckVersion(row('2026-08', { paidCheckVersion: 1.5 }), 'pagamentos')).toBe(0);
    // O plano leva a versão: a linha desligada (versão 2) manda 2 ao marcar; a ligada (versão 3) manda 3 ao desfazer.
    expect(monthCheckPlan(row('2026-08', { paidCheckVersion: 2 }), 'pagamentos', now, true)).toMatchObject({ state: 'sem_registros', version: 2 });
    expect(monthCheckPlan(row('2026-08', { paidCheckVersion: 3, paidChecked: true }), 'pagamentos', now, true)).toMatchObject({ state: 'conferido', version: 3 });
    // Dois tipos, duas versões.
    const both = row('2026-08', { paidCheckVersion: 3, paidChecked: true, receivedCheckVersion: 1 });
    expect(monthCheckPlan(both, 'recebimentos', now, true)).toMatchObject({ state: 'sem_registros', version: 1 });
  });

  it('compra no cartão não é registro de Pago: o aviso vem junto da conferência de pagamentos (botão ou frase), só com compras vivas pela data da compra', () => {
    const now = '2026-10';
    const NOTICE = 'Há compras no cartão em agosto de 2026. Elas entram no Pago quando a fatura é paga.';
    expect(monthCheckCardPurchases(row('2026-08'))).toBe(0);
    expect(monthCheckCardPurchases(row('2026-08', { cardPurchaseCount: 3 }))).toBe(3);
    expect(monthCheckCardPurchases({ month: '2026-08', receivedCount: 0, receivedCents: 0, paidCount: 0, paidCents: 0 })).toBe(0);
    expect(monthCheckCardPurchases(row('2026-08', { cardPurchaseCount: -2 }))).toBe(0);
    // Só uma compra no cartão: o mês segue "sem registros" de Pago, o botão aparece e o aviso vem junto.
    const onlyCard = row('2026-08', { cardPurchaseCount: 1 });
    expect(monthCheckState(onlyCard, 'pagamentos', now)).toBe('sem_registros');
    expect(monthCheckPlan(onlyCard, 'pagamentos', now, true)).toMatchObject({ state: 'sem_registros', action: 'Conferi: não houve pagamentos em agosto de 2026', cardNotice: NOTICE });
    // Conferido: a frase de mês conferido e o aviso (também para quem só lê).
    const checked = row('2026-08', { cardPurchaseCount: 2, paidChecked: true, paidCheckVersion: 1 });
    expect(monthCheckPlan(checked, 'pagamentos', now, true)).toMatchObject({ state: 'conferido', doneText: 'Você conferiu: não houve pagamentos em agosto de 2026.', cardNotice: NOTICE });
    expect(monthCheckPlan(checked, 'pagamentos', now, false)).toMatchObject({ state: 'conferido', cardNotice: NOTICE, undo: null });
    // Quem só lê um mês ainda a conferir não vê botão nem aviso (não há o que mostrar).
    expect(monthCheckPlan(onlyCard, 'pagamentos', now, false)).toMatchObject({ action: null, doneText: null, cardNotice: null });
    // Só uma fatura paga: o pagamento é um registro de Pago (pela data em que foi pago), então não há o que conferir, nem aviso.
    expect(monthCheckPlan(row('2026-08', { paidCount: 1, paidCents: 25_000 }), 'pagamentos', now, true)).toMatchObject({ state: 'com_registros', action: null, cardNotice: null });
    // Com registro de Pago e compra no cartão no mês, também não: o mês tem registros.
    expect(monthCheckPlan(row('2026-08', { paidCount: 1, paidCents: 100, cardPurchaseCount: 1 }), 'pagamentos', now, true).cardNotice).toBeNull();
    // Recebimentos nunca traz o aviso (compra no cartão é de Pago).
    expect(monthCheckPlan(row('2026-08', { cardPurchaseCount: 1 }), 'recebimentos', now, true)).toMatchObject({ state: 'sem_registros', action: 'Conferi: não houve recebimentos em agosto de 2026', cardNotice: null });
    // O mês atual não tem nada.
    expect(monthCheckPlan(row('2026-10', { cardPurchaseCount: 1 }), 'pagamentos', now, true)).toMatchObject({ state: 'nao_encerrado', action: null, cardNotice: null });
  });

  it('o resultado confere o estado: marcar só é "feito" com a marca ligada, desfazer só com ela desligada', () => {
    expect(monthCheckOutcome('marcar', { checked: true })).toBe('feito');
    expect(monthCheckOutcome('marcar', { checked: false })).toBe('mudou');
    expect(monthCheckOutcome('desfazer', { checked: false })).toBe('feito');
    expect(monthCheckOutcome('desfazer', { checked: true })).toBe('mudou');
    expect(MONTH_CHECK_TEXT.changedElsewhere).toBe(MONTH_CHECK_TEXT.errors.versao_desatualizada);
  });

  it('as chaves das tentativas: a incerta é guardada e repetida; quando o estado muda (versão, estado, mês ou tipo), as guardadas são esquecidas', () => {
    let n = 0;
    const keys = new MonthCheckKeys(() => `chave-${++n}`);
    const plan = (over: Partial<{ month: string; kind: 'recebimentos' | 'pagamentos'; state: 'sem_registros' | 'conferido'; version: number }> = {}) => ({ month: '2026-08', kind: 'pagamentos' as const, state: 'sem_registros' as const, version: 0, ...over });
    // Sem resultado incerto, cada pedido tem chave nova.
    expect(keys.keyFor('marcar', plan())).toBe('chave-1');
    expect(keys.keyFor('marcar', plan())).toBe('chave-2');
    // Resultado incerto: a chave fica, e a repetição usa a mesma (com o mesmo estado, a mesma versão).
    keys.keep('marcar', plan(), 'chave-2');
    expect(keys.size).toBe(1);
    expect(keys.keyFor('marcar', plan())).toBe('chave-2');
    expect(keys.keyFor('desfazer', plan())).toBe('chave-3');
    // Um pedido que terminou (certo, recusado ou de estado diferente) esquece a chave.
    keys.settle('marcar');
    expect(keys.size).toBe(0);
    expect(keys.keyFor('marcar', plan())).toBe('chave-4');
    // O estado mudou (outro aparelho marcou e desmarcou: a versão da linha subiu): a chave guardada não vale mais.
    keys.keep('marcar', plan(), 'chave-4');
    keys.keep('desfazer', plan(), 'chave-5');
    expect(keys.size).toBe(2);
    expect(keys.sync(plan())).toBe(false);
    expect(keys.sync(plan({ version: 2 }))).toBe(true);
    expect(keys.size).toBe(0);
    expect(keys.keyFor('marcar', plan({ version: 2 }))).toBe('chave-5');
    // Estado, mês e tipo diferentes também limpam; a mesma chamada de novo não limpa nada.
    for (const other of [plan({ version: 2, state: 'conferido' }), plan({ version: 2, month: '2026-07' }), plan({ version: 2, kind: 'recebimentos' })]) {
      keys.keep('marcar', plan({ version: 2 }), 'chave-6');
      expect(keys.sync(other), JSON.stringify(other)).toBe(true);
      expect(keys.size).toBe(0);
      keys.sync(plan({ version: 2 }));
    }
    // Pedir com outro estado nunca devolve a chave guardada do estado antigo.
    keys.keep('marcar', plan({ version: 2 }), 'chave-7');
    expect(keys.keyFor('marcar', plan({ version: 3 }))).not.toBe('chave-7');
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
      stateText: 'Você conferiu: não houve pagamentos em março de 2026.',
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
    expect(panel.check).toMatchObject({ state: 'conferido', doneText: 'Você conferiu: não houve pagamentos em março de 2026.', undo: 'Desfazer a conferência', action: null });
    expect(panel.explain.visible).toBe(false);
    // A variação até o zero é um fato: de fevereiro para março, R$ 3.400,00 a menos (100% a menos).
    expect(evolutionVariation(view, '2026-03')).toMatchObject({ available: true, text: 'De fevereiro para março: R$ 3.400,00 a menos', percentText: '100% a menos que fevereiro' });
    // Quem só lê vê a frase, sem o botão.
    expect(evolutionPanel(view, '2026-03', false).check).toMatchObject({ doneText: 'Você conferiu: não houve pagamentos em março de 2026.', undo: null });
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
    expect(march.check).toMatchObject({ state: 'sem_registros', version: 0, action: 'Conferi: não houve pagamentos em março de 2026', undo: null });
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

  it('o painel leva a versão da linha da marca e o aviso de compras no cartão da linha do mês', () => {
    const rows = [
      row('2026-04', { paidCount: 2, paidCents: 9_000 }),
      // Março: a linha foi ligada, desligada e ligada de novo (versão 3), e há uma compra no cartão pela data da compra.
      row('2026-03', { paidChecked: true, paidCheckVersion: 3, cardPurchaseCount: 1 }),
      // Fevereiro: desligada (versão 2), sem compra no cartão.
      row('2026-02', { paidCheckVersion: 2 }),
    ];
    const view = buildEvolutionView({ overview: rows, metric: 'pago', windowMonths: 6, currentMonth: '2026-07', hiddenMonths: [] });
    expect(view.rows.map((r) => r.month)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
    expect(evolutionPanel(view, '2026-03', true).check).toMatchObject({
      state: 'conferido',
      version: 3,
      cardNotice: 'Há compras no cartão em março de 2026. Elas entram no Pago quando a fatura é paga.',
    });
    expect(evolutionPanel(view, '2026-02', true).check).toMatchObject({ state: 'sem_registros', version: 2, action: 'Conferi: não houve pagamentos em fevereiro de 2026', cardNotice: null });
    // Mês que a leitura não trouxe: a linha zerada (sem linha, versão 0).
    expect(evolutionPanel(view, '2026-05', true).check).toMatchObject({ state: 'sem_registros', version: 0 });
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
    expect(july.paid).toBe('Pago: conferido, não houve pagamentos');
    expect(july.received).toBe('Recebido: R$ 1,00 · 1 recebimento');
    expect(july.compact).toBe(true);
    const june = reviewMonthCard(r.months.find((m) => m.month === '2026-06')!);
    expect(june.paid).toBe('Pago: nenhum gasto anotado');
    expect(june.compact).toBe(false);
  });

  it('o resumo puro de months_overview devolve as marcas só quando o mês não tem registro do tipo', () => {
    const rec = { id: 'r', contextId: 'c', accountId: 'a', kind: 'despesa' as const, status: 'realizado' as const, amountCents: 1_000, currency: 'BRL' as const, occurredOn: '2026-08-10', description: 'x', category: null, commitmentId: null, invoice: null, receiptKey: null, createdBy: 'p', version: 1, createdAt: '', updatedAt: '' };
    const checks = [
      { month: '2026-08', kind: 'pagamentos' as const, checked: true, version: 1 },
      { month: '2026-08', kind: 'recebimentos' as const, checked: true, version: 3 },
      { month: '2026-07', kind: 'pagamentos' as const, checked: true, version: 1 },
      // Linha desligada: não vale, e a versão dela vai junto.
      { month: '2026-07', kind: 'recebimentos' as const, checked: false, version: 2 },
    ];
    const out = monthsOverview([rec], 'c', '2026-07', '2026-08', checks);
    expect(out[0]).toMatchObject({ month: '2026-07', paidChecked: true, receivedChecked: false, paidCheckVersion: 1, receivedCheckVersion: 2 });
    // O registro vence a marca (que fica, com a versão dela), e só o tipo sem registro vale.
    expect(out[1]).toMatchObject({ month: '2026-08', paidCount: 1, paidChecked: false, receivedChecked: true, paidCheckVersion: 1, receivedCheckVersion: 3 });
  });

  it('o resumo puro conta as compras no cartão pela data da compra, uma por compra, e mais nada muda em Pago', () => {
    const out = monthsOverview([], 'c', '2026-02', '2026-05', [], [{ purchasedOn: '2026-02-03' }, { purchasedOn: '2026-03-31' }, { purchasedOn: '2026-03-01' }, { purchasedOn: '2026-05-08' }]);
    expect(out.map((r) => [r.month, r.cardPurchaseCount, r.paidCount, r.paidCents])).toEqual([
      ['2026-02', 1, 0, 0],
      ['2026-03', 2, 0, 0],
      ['2026-04', 0, 0, 0],
      ['2026-05', 1, 0, 0],
    ]);
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
    // A linha persiste, desligada, e cada mudança soma 1 à versão: desmarcar deixa a versão 2.
    expect(cleared).toEqual({ contextId: lia.ctx, month: '2026-08', kind: 'pagamentos', checked: false, version: 2, checkedAt: null });
    expect(await lia.repo.clearMonthCheck(kc, lia.ctx, '2026-08', 'pagamentos', 1)).toEqual(cleared);
    await expectCode(lia.repo.setMonthCheck(kc, lia.ctx, '2026-08', 'pagamentos', 0), 'chave_reutilizada');
    expect(await overviewOf(lia.repo, lia.ctx, '2026-08')).toMatchObject({ paidChecked: false, receivedChecked: true, paidCheckVersion: 2, receivedCheckVersion: 1 });
    // Marcar de novo depois de desmarcar manda a versão lida (2): vale, na versão 3.
    expect(await lia.repo.setMonthCheck(key(), lia.ctx, '2026-08', 'pagamentos', 2)).toMatchObject({ checked: true, version: 3 });
    expect(await overviewOf(lia.repo, lia.ctx, '2026-08')).toMatchObject({ paidChecked: true, paidCheckVersion: 3 });
  });

  it('dois aparelhos: cada um manda a versão que leu, e a versão antiga responde versao_desatualizada (marcar e desmarcar somam 1)', async () => {
    const { mk } = await harness();
    const lia = await mk('lia', 'Lia');
    const at = (kind: 'pagamentos' | 'recebimentos' = 'pagamentos') => lia.repo.monthsOverview(lia.ctx, '2026-02', '2026-02').then((r) => (kind === 'pagamentos' ? r[0]!.paidCheckVersion : r[0]!.receivedCheckVersion));
    // Os dois leram "sem linha" (versão 0): A marca (versão 1); B, com a versão 0, é recusado e recebe a versão nova.
    expect(await at()).toBe(0);
    expect(await lia.repo.setMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', 0)).toMatchObject({ checked: true, version: 1 });
    await expectCode(lia.repo.setMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', 0), 'versao_desatualizada', 'versao_atual=1');
    // Os dois leram "marcado, versão 1": A desmarca (versão 2); B, com a versão 1, é recusado.
    expect(await lia.repo.clearMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', 1)).toMatchObject({ checked: false, version: 2 });
    await expectCode(lia.repo.clearMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', 1), 'versao_desatualizada', 'versao_atual=2');
    // Desmarcar o que já está desligado, mesmo com a versão da linha, também é recusado; marcar com versão velha (0 ou 1), idem.
    await expectCode(lia.repo.clearMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', 2), 'versao_desatualizada', 'versao_atual=2');
    for (const v of [0, 1, 3, null as never]) await expectCode(lia.repo.setMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', v), 'versao_desatualizada', 'versao_atual=2');
    expect(await at()).toBe(2);
    // B lê de novo (versão 2) e marca (versão 3); A, que também leu a 2, é recusado com a 3.
    expect(await lia.repo.setMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', 2)).toMatchObject({ checked: true, version: 3 });
    await expectCode(lia.repo.setMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', 2), 'versao_desatualizada', 'versao_atual=3');
    await expectCode(lia.repo.clearMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', 2), 'versao_desatualizada', 'versao_atual=3');
    expect(await lia.repo.clearMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', 3)).toMatchObject({ checked: false, version: 4 });
    expect(await at()).toBe(4);
    // O outro tipo tem a própria linha e a própria versão.
    expect(await at('recebimentos')).toBe(0);
    expect(await lia.repo.setMonthCheck(key(), lia.ctx, '2026-02', 'recebimentos', 0)).toMatchObject({ checked: true, version: 1 });
    // A repetição da chave de uma marcação antiga devolve o estado de agora (não refaz a marca).
    const k = key();
    expect(await lia.repo.setMonthCheck(k, lia.ctx, '2026-02', 'pagamentos', 4)).toMatchObject({ checked: true, version: 5 });
    await lia.repo.clearMonthCheck(key(), lia.ctx, '2026-02', 'pagamentos', 5);
    expect(await lia.repo.setMonthCheck(k, lia.ctx, '2026-02', 'pagamentos', 4)).toMatchObject({ checked: false, version: 6, checkedAt: null });
    expect(await at()).toBe(6);
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

  it('versão: marcar espera a versão da linha (0 sem linha) e a marca desligada; desmarcar espera a da linha ligada; sem linha, versao_atual=0', async () => {
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
    expect(await lia.repo.clearMonthCheck(kc, lia.ctx, '2026-08', 'pagamentos', 1)).toMatchObject({ checked: false, version: 2 });
    // Resultado incerto e outro aparelho muda a marca antes da repetição: a repetição da mesma chave devolve o estado de agora (aqui,
    // desligada), e a tela confere o `checked` antes de anunciar (monthCheckOutcome).
    const kset = key();
    lia.repo.failNextWrite = 'depois';
    await expectCode(lia.repo.setMonthCheck(kset, lia.ctx, '2026-08', 'recebimentos', 0), 'rede');
    await lia.repo.clearMonthCheck(key(), lia.ctx, '2026-08', 'recebimentos', 1);
    const again = await lia.repo.setMonthCheck(kset, lia.ctx, '2026-08', 'recebimentos', 0);
    expect(again).toMatchObject({ checked: false, version: 2 });
    expect(monthCheckOutcome('marcar', again)).toBe('mudou');
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

describe('MemoryRepository: compra no cartão, fatura paga e importação (a marca segue o caixa, D-057 D07)', () => {
  const importItem = (name: string, amountCents: number, occurredOn: string, description: string): ImportItem => ({
    importKey: importKey('teste', { date: '2026-01-01', amountCents: 1, description: name, fitId: null }, 0),
    kind: 'compra',
    amountCents,
    occurredOn,
    description,
    category: null,
  });

  it('só uma compra no cartão: o mês aceita a marca de pagamentos, ela vale e o aviso aparece; só a fatura paga é registro de Pago', async () => {
    const repo = new MemoryRepository({ actorId: 'mara', displayName: 'Mara', today: () => '2026-10-07' });
    const space = await repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    const card = (await repo.createCard(key(), ctx, { name: 'Cartão da Mara', lastDigits: '1234', closingDay: 5, dueDay: 15, limitCents: null })).card.id;
    const month = async (m: string) => (await repo.monthsOverview(ctx, m, m))[0]!;
    const paidOf = async (m: string) => summarizeMonth(await repo.listRecords(ctx, m), ctx, m).paidCents;

    // (a) Só uma compra no cartão (fevereiro): nenhum registro de Pago, e o mês avisa a compra.
    await repo.addCardPurchase(key(), card, { description: 'Compra de fevereiro', category: 'Mercado', purchasedOn: '2026-02-03', totalCents: 25_000, installments: 1 });
    expect(await month('2026-02')).toMatchObject({ paidCount: 0, paidCents: 0, paidChecked: false, paidCheckVersion: 0, cardPurchaseCount: 1 });
    expect(await paidOf('2026-02')).toBe(0);
    const plan = (row: MonthOverview, canWrite = true) => monthCheckPlan(row, 'pagamentos', '2026-10', canWrite);
    expect(plan(await month('2026-02'))).toMatchObject({
      state: 'sem_registros',
      action: 'Conferi: não houve pagamentos em fevereiro de 2026',
      cardNotice: 'Há compras no cartão em fevereiro de 2026. Elas entram no Pago quando a fatura é paga.',
    });
    expect(await repo.setMonthCheck(key(), ctx, '2026-02', 'pagamentos', 0)).toMatchObject({ checked: true, version: 1 });
    expect(await month('2026-02')).toMatchObject({ paidChecked: true, paidCheckVersion: 1, cardPurchaseCount: 1 });
    expect(plan(await month('2026-02'))).toMatchObject({ state: 'conferido', version: 1, doneText: 'Você conferiu: não houve pagamentos em fevereiro de 2026.', cardNotice: expect.stringContaining('Há compras no cartão') });
    expect(await paidOf('2026-02')).toBe(0);
    // Um parcelamento de 3 vezes em março conta uma compra, em março; as parcelas de abril e maio não são compras de abril nem de maio.
    await repo.addCardPurchase(key(), card, { description: 'Compra parcelada', category: null, purchasedOn: '2026-03-04', totalCents: 30_000, installments: 3 });
    expect(await repo.monthsOverview(ctx, '2026-02', '2026-06').then((rows) => rows.map((r) => r.cardPurchaseCount))).toEqual([1, 1, 0, 0, 0]);

    // (b) Só uma fatura paga (abril): o pagamento de 02/04 é um registro de Pago em abril; marcar pagamentos é recusado, sem aviso.
    const stored = (await repo.getCard(card))!;
    const feb = invoiceFor(stored, await loadInvoices(repo, stored, '2026-10-07'), '2026-02', '2026-10-07');
    await repo.payInvoice(key(), card, '2026-02', feb.commitmentVersion!, 25_000, '2026-04-02');
    expect(await month('2026-04')).toMatchObject({ paidCount: 1, paidCents: 25_000, paidChecked: false, cardPurchaseCount: 0 });
    expect(await paidOf('2026-04')).toBe(25_000);
    await expectCode(repo.setMonthCheck(key(), ctx, '2026-04', 'pagamentos', 0), 'mes_com_registros');
    expect(plan(await month('2026-04'))).toMatchObject({ state: 'com_registros', action: null, cardNotice: null });
    expect((await repo.setMonthCheck(key(), ctx, '2026-04', 'recebimentos', 0)).checked).toBe(true);
    expect(await paidOf('2026-04')).toBe(25_000);
    // Fevereiro segue conferido, com o aviso, mesmo com a fatura paga em abril.
    expect(await month('2026-02')).toMatchObject({ paidChecked: true, cardPurchaseCount: 1 });

    // (c) Só uma importação para o cartão (maio): é uma compra no cartão pela data dela, não um registro de Pago.
    expect(await repo.importRecords(key(), ctx, 'cartao', card, [importItem('c1', 8_050, '2026-05-08', 'Mercado importado')])).toEqual({ created: 1, skipped: 0 });
    expect(await month('2026-05')).toMatchObject({ paidCount: 0, paidChecked: false, cardPurchaseCount: 1 });
    expect(await repo.setMonthCheck(key(), ctx, '2026-05', 'pagamentos', 0)).toMatchObject({ checked: true, version: 1 });
    expect(plan(await month('2026-05'))).toMatchObject({ state: 'conferido', cardNotice: expect.stringContaining('maio de 2026') });
    // Excluída a compra, o aviso some (só conta compra viva) e a marca segue valendo.
    const bought = (await repo.listCardEntries(card)).find((e) => e.kind === 'compra' && e.description === 'Mercado importado')!;
    await repo.deleteCardEntry(key(), bought.id, bought.version);
    expect(await month('2026-05')).toMatchObject({ paidChecked: true, cardPurchaseCount: 0 });
    expect(plan(await month('2026-05')).cardNotice).toBeNull();
    // Uma compra importada num mês com registro de Pago: o aviso aparece nos dados, mas a marca não vale (o registro vence).
    await repo.importRecords(key(), ctx, 'cartao', card, [importItem('c2', 1_500, '2026-04-20', 'Compra de abril importada')]);
    expect(await month('2026-04')).toMatchObject({ paidCount: 1, paidChecked: false, cardPurchaseCount: 1 });
    expect(plan(await month('2026-04'))).toMatchObject({ state: 'com_registros', cardNotice: null });
  });
});
