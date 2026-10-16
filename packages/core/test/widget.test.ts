/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WIDGET_SHOW_VALUES,
  DEMO_TODAY,
  WIDGET_HIDDEN_A11Y,
  WIDGET_HIDDEN_MONEY,
  WIDGET_ROUTES,
  WIDGET_SNAPSHOT_VERSION,
  WIDGET_TEXT,
  buildWidgetContent,
  buildWidgetSnapshot,
  createDemoRepository,
  isWidgetSnapshotFresh,
  summarizeToPay,
  type Commitment,
  type WidgetInput,
} from '../src';

/**
 * Núcleo do widget (D-052): a demonstração (Ainda a pagar R$ 650,00; próxima conta Internet, 15/10), valores ocultos por padrão,
 * os estados (vazio, sem sessão, sem dados), a demonstração identificada e o formato guardado para o widget nativo ler.
 */

async function demoToPay() {
  const repo = await createDemoRepository();
  const ctx = (await repo.getSpace())!.personalContextId;
  return summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY);
}

const input = (over: Partial<WidgetInput>): WidgetInput => ({ today: DEMO_TODAY, signedIn: true, demo: false, showValues: false, toPay: null, ...over });

/** Conta a pagar mínima para montar casos que a demonstração não tem (estimada, vencida, vence hoje ou amanhã). */
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
const toPayOf = (list: Commitment[], today = DEMO_TODAY) => summarizeToPay(list, 'ctx', today.slice(0, 7), today);

describe('widget: demonstração de outubro', () => {
  it('com os valores à mostra: Ainda a pagar R$ 650,00 e a próxima conta é a Internet, em 15/10', async () => {
    const { medium, small } = buildWidgetContent(input({ toPay: await demoToPay(), demo: true, showValues: true }));
    expect(medium.state).toBe('normal');
    expect(medium.title).toBe('Ainda a pagar em outubro');
    expect(medium.value).toBe('R$ 650,00');
    expect(medium.next).toEqual({ name: 'Internet', when: '15/10', amount: 'R$ 150,00', estimated: false, line: 'Internet · 15/10 · R$ 150,00' });
    expect(medium.overdue).toBeNull();
    expect(medium.valuesShown).toBe(true);
    expect(medium.route).toBe('/a-pagar');
    expect(medium.a11y).toBe('Demonstração. Ainda a pagar em outubro, R$ 650,00. Próxima conta: Internet, vence em 15/10, R$ 150,00.');
    expect(small).toMatchObject({ size: 'pequeno', label: 'Anotar gasto', route: '/registro/novo?tipo=despesa', badge: 'Demonstração' });
  });

  it('a mesma conta na demonstração vem com o selo "Demonstração" nos dois tamanhos', async () => {
    const { small, medium } = buildWidgetContent(input({ toPay: await demoToPay(), demo: true }));
    expect(small.badge).toBe('Demonstração');
    expect(medium.badge).toBe('Demonstração');
    const real = buildWidgetContent(input({ toPay: await demoToPay(), demo: false }));
    expect(real.small.badge).toBeNull();
    expect(real.medium.badge).toBeNull();
  });

  it('é o mesmo total e a mesma conta do card "Ainda a pagar" do Resumo (summarizeToPay)', async () => {
    const toPay = await demoToPay();
    const { medium } = buildWidgetContent(input({ toPay, showValues: true }));
    expect(toPay.toPayCents).toBe(65_000);
    expect(medium.value).toBe('R$ 650,00');
    expect(medium.next?.name).toBe(toPay.nextDue?.description);
  });
});

describe('widget: valores ocultos por padrão', () => {
  it('a preferência "Mostrar valores no widget" começa desligada', () => {
    expect(DEFAULT_WIDGET_SHOW_VALUES).toBe(false);
  });

  it('desligada, o conteúdo montado nem chega a ter o valor: R$ •••• e "valor oculto"', async () => {
    const toPay = await demoToPay();
    const content = buildWidgetContent(input({ toPay, demo: true }));
    expect(content.medium.value).toBe(WIDGET_HIDDEN_MONEY);
    expect(content.medium.next?.amount).toBe(WIDGET_HIDDEN_MONEY);
    expect(content.medium.next?.line).toBe('Internet · 15/10 · R$ ••••');
    expect(content.medium.valuesShown).toBe(false);
    expect(content.medium.a11y).toBe('Demonstração. Ainda a pagar em outubro, valor oculto. Próxima conta: Internet, vence em 15/10, valor oculto.');
    // Nenhum valor em reais em lugar nenhum do que o widget nativo vai ler, nem no texto alternativo.
    const json = JSON.stringify(buildWidgetSnapshot(input({ toPay, demo: true })));
    expect(json).not.toMatch(/\d,\d{2}/);
    expect(json).not.toContain('650');
    expect(json).not.toContain('150');
    expect(json).not.toContain('15000');
    expect(json).toContain(WIDGET_HIDDEN_MONEY);
  });

  it('ligada, os valores aparecem (e só então)', async () => {
    const json = JSON.stringify(buildWidgetSnapshot(input({ toPay: await demoToPay(), showValues: true })));
    expect(json).toContain('R$ 650,00');
    expect(json).toContain('R$ 150,00');
    expect(json).not.toContain(WIDGET_HIDDEN_MONEY);
  });

  it('o nome da conta a vencer aparece nos dois casos (só os valores ficam ocultos)', async () => {
    const toPay = await demoToPay();
    for (const showValues of [true, false]) expect(buildWidgetContent(input({ toPay, showValues })).medium.next?.name).toBe('Internet');
  });
});

describe('widget: a próxima conta a vencer', () => {
  it('valor estimado: "≈ R$ 180,00 · estimado" (ou "≈ R$ ••••" com os valores ocultos, ainda dito estimado)', () => {
    const toPay = toPayOf([bill({ id: 'a', description: 'Luz', amountCents: 18_000, dueOn: '2026-10-12', amountIsEstimate: true })]);
    const shown = buildWidgetContent(input({ toPay, showValues: true })).medium;
    expect(shown.next).toEqual({ name: 'Luz', when: '12/10', amount: '≈ R$ 180,00', estimated: true, line: 'Luz · 12/10 · ≈ R$ 180,00 · estimado' });
    expect(shown.a11y).toContain('Próxima conta: Luz, vence em 12/10, cerca de R$ 180,00, valor estimado.');
    const hidden = buildWidgetContent(input({ toPay, showValues: false })).medium;
    expect(hidden.next?.line).toBe('Luz · 12/10 · ≈ R$ •••• · estimado');
    expect(hidden.next?.estimated).toBe(true);
    expect(hidden.a11y).toContain('Próxima conta: Luz, vence em 12/10, cerca de valor oculto, valor estimado.');
    expect(hidden.a11y).not.toMatch(/\d,\d{2}/);
  });

  it('vence hoje e vence amanhã são ditos assim, não com a data', () => {
    const today = toPayOf([bill({ id: 'a', description: 'Gás', amountCents: 9_000, dueOn: '2026-10-07' }), bill({ id: 'b', description: 'Água', amountCents: 5_000, dueOn: '2026-10-08' })]);
    const m = buildWidgetContent(input({ toPay: today, showValues: true })).medium;
    expect(m.next).toMatchObject({ name: 'Gás', when: 'hoje', line: 'Gás · hoje · R$ 90,00' });
    expect(m.a11y).toContain('Próxima conta: Gás, vence hoje, R$ 90,00.');
    const tomorrow = toPayOf([bill({ id: 'b', description: 'Água', amountCents: 5_000, dueOn: '2026-10-08' })]);
    const t = buildWidgetContent(input({ toPay: tomorrow, showValues: true })).medium;
    expect(t.next).toMatchObject({ name: 'Água', when: 'amanhã' });
    expect(t.a11y).toContain('Próxima conta: Água, vence amanhã, R$ 50,00.');
  });

  it('vencidas: quantas, e a próxima é a primeira que vence de hoje em diante', () => {
    const toPay = toPayOf([
      bill({ id: 'a', description: 'Gás', amountCents: 4_000, dueOn: '2026-09-28' }),
      bill({ id: 'b', description: 'Água', amountCents: 6_000, dueOn: '2026-10-05' }),
      bill({ id: 'c', description: 'Internet', amountCents: 15_000, dueOn: '2026-10-15' }),
    ]);
    const m = buildWidgetContent(input({ toPay, showValues: true })).medium;
    // As vencidas de meses anteriores entram no total do mês atual (D-021(5)).
    expect(m.value).toBe('R$ 250,00');
    expect(m.overdue).toBe('2 vencidas');
    expect(m.next?.name).toBe('Internet');
    expect(m.a11y).toBe('Ainda a pagar em outubro, R$ 250,00. Próxima conta: Internet, vence em 15/10, R$ 150,00. 2 vencidas.');
    const one = buildWidgetContent(input({ toPay: toPayOf([bill({ id: 'a', description: 'Gás', amountCents: 4_000, dueOn: '2026-10-05' })]), showValues: true })).medium;
    expect(one.overdue).toBe('1 vencida');
  });

  it('só vencidas: sem "próxima conta", só a quantidade', () => {
    const toPay = toPayOf([bill({ id: 'a', description: 'Gás', amountCents: 4_000, dueOn: '2026-10-05' })]);
    const m = buildWidgetContent(input({ toPay, showValues: true })).medium;
    expect(m.state).toBe('normal');
    expect(m.value).toBe('R$ 40,00');
    expect(m.next).toBeNull();
    expect(m.overdue).toBe('1 vencida');
    expect(m.a11y).toBe('Ainda a pagar em outubro, R$ 40,00. 1 vencida.');
  });
});

describe('widget: estados', () => {
  it('vazio: nada em aberto no mês', () => {
    const m = buildWidgetContent(input({ toPay: toPayOf([]), showValues: true })).medium;
    expect(m).toMatchObject({ state: 'vazio', title: 'Ainda a pagar em outubro', message: 'Nada em aberto neste mês', value: null, next: null, overdue: null, route: '/a-pagar' });
    expect(m.a11y).toBe('Ainda a pagar em outubro. Nada em aberto neste mês.');
    // Conta paga não conta como em aberto.
    const paid = toPayOf([bill({ id: 'a', description: 'Gás', amountCents: 4_000, dueOn: '2026-10-05', status: 'quitado' })]);
    expect(buildWidgetContent(input({ toPay: paid })).medium.state).toBe('vazio');
  });

  it('sem sessão: "Entre no Clarevo para ver", sem nenhum dado, mesmo que a leitura venha preenchida', async () => {
    const toPay = await demoToPay();
    const { small, medium } = buildWidgetContent(input({ signedIn: false, toPay, showValues: true }));
    expect(medium).toMatchObject({ state: 'sem_sessao', message: 'Entre no Clarevo para ver', title: null, value: null, next: null, overdue: null, route: '/entrar' });
    expect(medium.a11y).toBe('Entre no Clarevo para ver.');
    expect(small.route).toBe('/entrar');
    expect(small.label).toBe('Anotar gasto');
    const json = JSON.stringify(buildWidgetSnapshot(input({ signedIn: false, toPay, showValues: true })));
    for (const leak of ['Internet', 'Condomínio', '650', '150', 'R$ ']) expect(json, leak).not.toContain(leak);
  });

  it('sem dados (ainda não lidos) ou de outro mês: pede para abrir o app, sem valor', async () => {
    for (const toPay of [null, summarizeToPay([], 'ctx', '2026-11', DEMO_TODAY)]) {
      const m = buildWidgetContent(input({ toPay, showValues: true })).medium;
      expect(m).toMatchObject({ state: 'sem_dados', message: 'Abra o Clarevo para atualizar', value: null, next: null });
    }
  });

  it('a demonstração sem sessão e a vazia também levam o selo', () => {
    expect(buildWidgetContent(input({ signedIn: false, demo: true })).medium.a11y).toBe('Demonstração. Entre no Clarevo para ver.');
    expect(buildWidgetContent(input({ toPay: toPayOf([]), demo: true })).medium.a11y).toBe('Demonstração. Ainda a pagar em outubro. Nada em aberto neste mês.');
  });
});

describe('widget pequeno', () => {
  it('"Anotar gasto" abre o formulário de gasto, com sessão', () => {
    const { small } = buildWidgetContent(input({}));
    expect(small).toEqual({
      size: 'pequeno',
      label: 'Anotar gasto',
      route: WIDGET_ROUTES.note,
      a11y: 'Anotar gasto. Abre o Clarevo no formulário de gasto.',
      badge: null,
    });
    expect(WIDGET_ROUTES.note).toBe('/registro/novo?tipo=despesa');
  });
});

describe('o que o widget nativo lê', () => {
  it('o formato guardado tem versão, mês e o dia da montagem, e vai e volta por JSON sem perder nada', async () => {
    const snapshot = buildWidgetSnapshot(input({ toPay: await demoToPay(), demo: true, showValues: true }));
    expect(snapshot.version).toBe(WIDGET_SNAPSHOT_VERSION);
    expect(WIDGET_SNAPSHOT_VERSION).toBe(2);
    expect(snapshot.month).toBe('2026-10');
    expect(snapshot.builtOn).toBe(DEMO_TODAY);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(Object.keys(snapshot).sort()).toEqual(['builtOn', 'medium', 'month', 'small', 'version']);
  });

  it('o dia da montagem vale só naquele dia: no seguinte, e na virada de dezembro para janeiro, o widget pede para abrir o app', () => {
    const built = (today: string) => buildWidgetSnapshot(input({ today, toPay: null }));
    const snapshot = built('2026-10-07');
    expect(isWidgetSnapshotFresh(snapshot, '2026-10-07')).toBe(true);
    expect(isWidgetSnapshotFresh(snapshot, '2026-10-08')).toBe(false);
    // Mesmo dia do mês em outro mês, ou o dia anterior, também não vale.
    expect(isWidgetSnapshotFresh(snapshot, '2026-11-07')).toBe(false);
    expect(isWidgetSnapshotFresh(snapshot, '2026-10-06')).toBe(false);
    const newYearsEve = built('2026-12-31');
    expect(newYearsEve.builtOn).toBe('2026-12-31');
    expect(isWidgetSnapshotFresh(newYearsEve, '2026-12-31')).toBe(true);
    expect(isWidgetSnapshotFresh(newYearsEve, '2027-01-01')).toBe(false);
    // O estado que o widget nativo mostra quando não vale mais.
    expect(WIDGET_TEXT.medium.noData).toBe('Abra o Clarevo para atualizar');
  });

  it('é puro: a mesma entrada dá a mesma saída e nada da entrada muda', async () => {
    const toPay = await demoToPay();
    const before = JSON.stringify(toPay);
    const a = buildWidgetSnapshot(input({ toPay }));
    const b = buildWidgetSnapshot(input({ toPay }));
    expect(a).toEqual(b);
    expect(JSON.stringify(toPay)).toBe(before);
  });

  it('o leitor de tela diz "valor oculto", como em Ocultar valores', () => {
    expect(WIDGET_HIDDEN_A11Y).toBe('valor oculto');
    expect(WIDGET_HIDDEN_MONEY).toBe('R$ ••••');
  });

  it('os textos da tela de Conta', () => {
    expect(WIDGET_TEXT.section).toBe('Widget na tela inicial');
    expect(WIDGET_TEXT.availability).toBe('Disponível quando o app estiver nas lojas');
    expect(WIDGET_TEXT.showValues).toBe('Mostrar valores no widget');
  });
});

describe('a preferência do widget no app (D-052)', () => {
  const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
  const read = (rel: string) => readFileSync(`${APP_SRC}${rel}`, 'utf8');

  it('device-prefs guarda "Mostrar valores no widget" só no aparelho, desligada de início e lida só quando é true', () => {
    const prefs = read('lib/device-prefs.ts');
    expect(prefs).toContain('widgetShowValues: boolean;');
    expect(prefs).toContain('widgetShowValues: DEFAULT_WIDGET_SHOW_VALUES,');
    expect(prefs).toContain('widgetShowValues: v.widgetShowValues === true,');
    // Nada vai ao servidor: o arquivo não fala com a rede.
    expect(prefs).not.toMatch(/fetch\(|supabase/i);
  });

  it('Conta mostra o card "Widget na tela inicial" logo depois de "Privacidade neste aparelho", com o interruptor e a nota das lojas', () => {
    const conta = read('app/conta.tsx');
    expect(conta.indexOf('<PrivacyCard />')).toBeGreaterThan(0);
    expect(conta.indexOf('<WidgetCard />')).toBeGreaterThan(conta.indexOf('<PrivacyCard />'));
    const card = read('components/device-settings.tsx').match(/export function WidgetCard[\s\S]*$/)![0];
    for (const key of ['WIDGET_TEXT.section', 'WIDGET_TEXT.availability', 'WIDGET_TEXT.explain', 'WIDGET_TEXT.showValues', 'WIDGET_TEXT.showValuesCaption']) expect(card, key).toContain(key);
    expect(card).toContain('widgetShowValues: v');
    // Independente de "Ocultar valores ao abrir".
    expect(card).not.toMatch(/hideOnOpen|setValuesHidden/);
  });
});
