/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import {
  DEMO_TODAY,
  WIDGET_HIDDEN_MONEY,
  WIDGET_NATIVE,
  WIDGET_ROUTES,
  WIDGET_SNAPSHOT_VERSION,
  WIDGET_TEXT,
  addDays,
  buildWidgetContent,
  buildWidgetSnapshot,
  createDemoRepository,
  isWidgetSnapshotFresh,
  parseWidgetSnapshot,
  planWidgetSync,
  summarizeToPay,
  widgetContentToday,
  widgetUrl,
  type Commitment,
  type WidgetInput,
} from '../src';

/**
 * Ponte do widget (D-063 item 3, Ciclo AA): o que o app grava no armazenamento compartilhado, quando grava e como o widget lê. A
 * demonstração de outubro de 2026 (Ainda a pagar R$ 650,00; próxima conta Internet, 15/10) é a base; nada aqui muda os totais.
 */

async function demoToPay() {
  const repo = await createDemoRepository();
  const ctx = (await repo.getSpace())!.personalContextId;
  return summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY);
}

const input = (over: Partial<WidgetInput>): WidgetInput => ({ today: DEMO_TODAY, signedIn: true, demo: false, showValues: false, toPay: null, ...over });

function bill(over: Partial<Commitment> & Pick<Commitment, 'id' | 'description' | 'amountCents' | 'dueOn'>): Commitment {
  return {
    contextId: 'ctx',
    currency: 'BRL',
    category: 'Moradia',
    status: 'aberto',
    payment: null,
    series: null,
    seriesOverride: false,
    amountIsEstimate: false,
    invoice: null,
    createdBy: 'pessoa',
    version: 1,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...over,
  };
}

describe('ponte do widget: o que é gravado', () => {
  it('o texto gravado é exatamente o WidgetSnapshot do núcleo (buildWidgetSnapshot)', async () => {
    const toPay = await demoToPay();
    const plan = planWidgetSync(input({ toPay }));
    expect(plan.write).toBe(true);
    if (!plan.write) return;
    expect(plan.snapshot).toEqual(buildWidgetSnapshot(input({ toPay })));
    expect(plan.json).toBe(JSON.stringify(buildWidgetSnapshot(input({ toPay }))));
    expect(JSON.parse(plan.json)).toEqual(plan.snapshot);
    expect(plan.snapshot.version).toBe(WIDGET_SNAPSHOT_VERSION);
    expect(plan.snapshot.builtOn).toBe(DEMO_TODAY);
  });

  it('na demonstração nada é gravado, mesmo com tudo lido e com os valores à mostra', async () => {
    const toPay = await demoToPay();
    expect(planWidgetSync(input({ toPay, demo: true }))).toEqual({ write: false, reason: 'demonstracao' });
    expect(planWidgetSync(input({ toPay, demo: true, showValues: true }))).toEqual({ write: false, reason: 'demonstracao' });
    expect(planWidgetSync(input({ toPay: null, demo: true, signedIn: false }))).toEqual({ write: false, reason: 'demonstracao' });
  });

  it('com sessão e sem a leitura das contas ainda, nada é gravado (o que já estava gravado fica)', () => {
    expect(planWidgetSync(input({ toPay: null }))).toEqual({ write: false, reason: 'sem_leitura' });
  });

  it('valores ocultos (padrão): nem valor em reais nem nome de conta no que é gravado', async () => {
    const toPay = await demoToPay();
    const plan = planWidgetSync(input({ toPay, showValues: false }));
    if (!plan.write) throw new Error('esperava gravar');
    expect(plan.json).not.toMatch(/\d,\d{2}/);
    expect(plan.json).not.toContain('650');
    expect(plan.json).not.toContain('Internet');
    expect(plan.json).toContain(WIDGET_HIDDEN_MONEY);
    expect(plan.snapshot.medium.next).toMatchObject({ name: 'Próxima conta', amount: WIDGET_HIDDEN_MONEY, line: 'Próxima conta · em 8 dias' });
    // O mesmo vale para o que fica pronto para a virada do dia.
    expect(JSON.stringify(plan.afterMidnight)).not.toMatch(/\d,\d{2}/);
  });

  it('valores à mostra só quando a preferência está ligada', async () => {
    const toPay = await demoToPay();
    const plan = planWidgetSync(input({ toPay, showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    expect(plan.snapshot.medium.value).toBe('R$ 650,00');
    expect(plan.snapshot.medium.next?.name).toBe('Internet');
  });

  it('sem sessão: grava só o estado "Entre no Clarevo para ver", sem nenhum dado, mesmo que a leitura venha preenchida', async () => {
    const toPay = await demoToPay();
    const plan = planWidgetSync(input({ toPay, signedIn: false, showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    expect(plan.snapshot.medium).toMatchObject({ state: 'sem_sessao', value: null, title: null, next: null, overdue: null, message: WIDGET_TEXT.medium.signedOut, route: WIDGET_ROUTES.signIn });
    expect(plan.snapshot.small.route).toBe(WIDGET_ROUTES.signIn);
    expect(plan.json).not.toMatch(/\d,\d{2}/);
    expect(plan.json).not.toContain('Internet');
    expect(plan.json).not.toContain('650');
    expect(plan.afterMidnight.medium.state).toBe('sem_sessao');
  });

  it('não leva identificador de pessoa, de conta nem de contexto', async () => {
    const repo = await createDemoRepository();
    const space = (await repo.getSpace())!;
    const toPay = summarizeToPay(await repo.listCommitments(space.personalContextId, '2026-10'), space.personalContextId, '2026-10', DEMO_TODAY);
    const plan = planWidgetSync(input({ toPay, showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    expect(plan.json).not.toContain(space.personalContextId);
    expect(Object.keys(plan.snapshot).sort()).toEqual(['builtOn', 'medium', 'month', 'small', 'version']);
  });

  it('o estado de cada tamanho é o do núcleo: vazio e sem dados também são gravados', () => {
    const empty = planWidgetSync(input({ toPay: summarizeToPay([], 'ctx', '2026-10', DEMO_TODAY) }));
    if (!empty.write) throw new Error('esperava gravar');
    expect(empty.snapshot.medium).toMatchObject({ state: 'vazio', message: WIDGET_TEXT.medium.empty });
    // Resumo de outro mês: o núcleo não aceita e o estado é "sem dados"; o app grava isso em vez de um valor errado.
    const other = planWidgetSync(input({ toPay: summarizeToPay([], 'ctx', '2026-09', DEMO_TODAY) }));
    if (!other.write) throw new Error('esperava gravar');
    expect(other.snapshot.medium.state).toBe('sem_dados');
  });
});

describe('ponte do widget: o dia seguinte não tem dados', () => {
  it('a virada do dia vem pronta: "Abra o Clarevo para atualizar", com o prazo de hoje já vencido', async () => {
    const plan = planWidgetSync(input({ toPay: await demoToPay(), showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    expect(plan.afterMidnight.builtOn).toBe(addDays(DEMO_TODAY, 1));
    expect(plan.afterMidnight.medium).toMatchObject({ state: 'sem_dados', message: WIDGET_TEXT.medium.noData, value: null, next: null, title: null });
    // "Anotar gasto" continua abrindo a tela de anotar.
    expect(plan.afterMidnight.small).toMatchObject({ label: 'Anotar gasto', route: WIDGET_ROUTES.note });
  });

  it('é o mesmo que o widget do Android mostra no dia seguinte (widgetContentToday)', async () => {
    const plan = planWidgetSync(input({ toPay: await demoToPay(), showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    const tomorrow = addDays(DEMO_TODAY, 1);
    expect(widgetContentToday(plan.json, tomorrow)).toEqual({ small: plan.afterMidnight.small, medium: plan.afterMidnight.medium });
  });

  it('no mesmo dia mostra o gravado; em outro dia (inclusive virada de mês e de ano) o estado sem dados', async () => {
    const plan = planWidgetSync(input({ toPay: await demoToPay(), showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    expect(isWidgetSnapshotFresh(plan.snapshot, DEMO_TODAY)).toBe(true);
    expect(widgetContentToday(plan.json, DEMO_TODAY)).toEqual({ small: plan.snapshot.small, medium: plan.snapshot.medium });
    for (const day of [addDays(DEMO_TODAY, 1), addDays(DEMO_TODAY, -1), '2026-11-01', '2027-01-01']) {
      expect(widgetContentToday(plan.json, day).medium).toMatchObject({ state: 'sem_dados', message: WIDGET_TEXT.medium.noData, value: null, next: null });
    }
  });

  it('virada do mês e do ano: o resumo de dezembro não vale em janeiro', () => {
    const dec31 = '2026-12-31';
    const toPay = summarizeToPay([bill({ id: 'a', description: 'Luz', amountCents: 8_000, dueOn: '2027-01-05' })], 'ctx', '2026-12', dec31);
    const plan = planWidgetSync(input({ today: dec31, toPay, showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    expect(plan.snapshot.month).toBe('2026-12');
    expect(widgetContentToday(plan.json, '2027-01-01').medium.state).toBe('sem_dados');
    expect(plan.afterMidnight.builtOn).toBe('2027-01-01');
    expect(plan.afterMidnight.month).toBe('2027-01');
  });

  it('o estado sem sessão continua sem sessão no dia seguinte', () => {
    const plan = planWidgetSync(input({ signedIn: false }));
    if (!plan.write) throw new Error('esperava gravar');
    expect(widgetContentToday(plan.json, addDays(DEMO_TODAY, 3)).medium).toMatchObject({ state: 'sem_sessao', message: WIDGET_TEXT.medium.signedOut });
  });

  it('nada gravado, texto que não é JSON ou versão diferente: sem dados, nunca erro', async () => {
    const plan = planWidgetSync(input({ toPay: await demoToPay(), showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    const noData = buildWidgetContent(input({ toPay: null }));
    for (const raw of [null, undefined, '', 'não é json', '{}', '[]', 42, JSON.stringify({ ...plan.snapshot, version: WIDGET_SNAPSHOT_VERSION - 1 }), JSON.stringify({ ...plan.snapshot, builtOn: 'ontem' })]) {
      expect(widgetContentToday(raw, DEMO_TODAY)).toEqual(noData);
    }
  });
});

describe('ponte do widget: leitura do texto gravado', () => {
  it('lê de volta o que foi gravado, no mesmo formato', async () => {
    const plan = planWidgetSync(input({ toPay: await demoToPay(), showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    expect(parseWidgetSnapshot(plan.json)).toEqual(plan.snapshot);
    expect(parseWidgetSnapshot(plan.snapshot)).toEqual(plan.snapshot);
  });

  it('recusa campos que faltam ou com tipo errado (o widget nunca desenha pela metade)', async () => {
    const plan = planWidgetSync(input({ toPay: await demoToPay(), showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    const broken = (patch: (s: Record<string, any>) => void) => {
      const copy = JSON.parse(plan.json);
      patch(copy);
      return parseWidgetSnapshot(copy);
    };
    expect(broken((s) => delete s.small)).toBeNull();
    expect(broken((s) => delete s.medium)).toBeNull();
    expect(broken((s) => (s.medium.state = 'outro'))).toBeNull();
    expect(broken((s) => (s.medium.route = 'a-pagar'))).toBeNull();
    expect(broken((s) => (s.small.label = 5))).toBeNull();
    expect(broken((s) => (s.medium.next = { name: 'x' }))).toBeNull();
    expect(broken((s) => (s.medium.valuesShown = 'sim'))).toBeNull();
    expect(broken(() => {})).not.toBeNull();
  });
});

describe('ponte do widget: nomes, endereços e atalho', () => {
  it('"Anotar gasto" abre direto a tela de anotar pelo esquema clarevo://', () => {
    expect(widgetUrl(WIDGET_ROUTES.note)).toBe('clarevo://registro/novo?tipo=despesa');
    expect(widgetUrl(WIDGET_ROUTES.payables)).toBe('clarevo://a-pagar');
    expect(widgetUrl(WIDGET_ROUTES.signIn)).toBe('clarevo://entrar');
    expect(widgetUrl('a-pagar')).toBe('clarevo://a-pagar');
  });

  it('a chave de armazenamento acompanha a versão do formato', () => {
    expect(WIDGET_NATIVE.storageKey).toBe(`clarevo.widget.v${WIDGET_SNAPSHOT_VERSION}`);
  });

  it('o widget médio mostra "Ainda a pagar em {mês}" e a próxima conta como o núcleo decide', async () => {
    const toPay = await demoToPay();
    const plan = planWidgetSync(input({ toPay, showValues: true }));
    if (!plan.write) throw new Error('esperava gravar');
    expect(plan.snapshot.medium.title).toBe('Ainda a pagar em outubro');
    expect(plan.snapshot.medium.next?.line).toBe('Internet · 15/10 · R$ 150,00');
    expect(plan.snapshot.medium.value).toBe(`R$ ${(toPay.toPayCents / 100).toFixed(2).replace('.', ',')}`);
  });
});
