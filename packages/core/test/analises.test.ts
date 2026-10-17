/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ANALYSES_ROUTE,
  ANALYSES_TABS,
  ANALYSES_TEXT,
  ANALYSES_UPCOMING_MONTHS,
  APP_SCREENS,
  BUBBLE_FONT_SIZES,
  BUBBLE_GAP,
  BUBBLE_MIN_RADIUS,
  CATEGORIES,
  CATEGORY_CARD_ROWS,
  CATEGORY_VIEWS,
  DEFAULT_CATEGORY_VIEW,
  DEMO_TODAY,
  EVOLUTION_TEXT,
  GUIDE_ENTRIES,
  NO_CATEGORY_KEY,
  NO_CATEGORY_LABEL,
  analysesBudgetSummary,
  analysesEvolutionSummary,
  analysesParams,
  analysesStartMonth,
  analysesStep,
  analysesTabForKey,
  analysesTabFrom,
  analysesUpcomingSummary,
  barModeFor,
  buildEvolutionView,
  categoryAccessibleName,
  categoryBreakdown,
  categoryBubbles,
  categoryKey,
  createDemoRepository,
  evolutionFetchRange,
  fitBubbleLabel,
  guideEntry,
  guideWhere,
  isCategoryView,
  isUpcomingSection,
  labelWidthEm,
  layoutBubbles,
  monthOf,
  paidCategoryParts,
  projectCommitted,
  searchAppScreens,
  searchGuide,
  selectedCategoryCard,
  summarizeBudget,
  summarizeMonth,
  topicTabFor,
  upcomingCommittedMonths,
  type Bubble,
  type CategoryShare,
  type FinancialRecord,
} from '../src';

const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
const read = (rel: string) => readFileSync(`${APP_SRC}${rel}`, 'utf8');

/**
 * As larguras da área das bolhas nas telas de 320, 360 e 390 px: a tela menos 20 px de cada lado, menos 20 px de cada lado do card
 * (`space[5]`). É o que o roteiro web mede.
 */
const WIDTHS = [240, 280, 310] as const;

/** Gerador simples e repetível (o teste nunca depende de sorte). */
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Nenhum par de bolhas se toca: a distância entre os centros passa da soma dos raios, com a folga. */
function expectNoOverlap(bubbles: readonly Bubble[], label: string) {
  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i + 1; j < bubbles.length; j++) {
      const a = bubbles[i]!;
      const b = bubbles[j]!;
      const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      expect(dist, `${label}: ${i} e ${j}`).toBeGreaterThanOrEqual(a.r + b.r + BUBBLE_GAP - 0.1);
    }
  }
}

describe('Análises: abas e mês (D-059)', () => {
  it('quatro abas, na ordem do protótipo, com Categorias de início', () => {
    expect(ANALYSES_ROUTE).toBe('/analises');
    expect(ANALYSES_TABS).toEqual(['categorias', 'evolucao', 'proximos-meses', 'orcamento']);
    expect(ANALYSES_TABS.map((t) => ANALYSES_TEXT.tabs[t])).toEqual(['Categorias', 'Evolução', 'Próximos meses', 'Orçamento']);
    expect(analysesTabFrom(undefined)).toBe('categorias');
    expect(analysesTabFrom('orcamento')).toBe('orcamento');
    expect(analysesTabFrom(['proximos-meses', 'x'])).toBe('proximos-meses');
    expect(analysesTabFrom('qualquer coisa')).toBe('categorias');
  });

  it('as setas, Home e End escolhem a aba, com volta ao outro extremo; outra tecla não escolhe nada', () => {
    expect(analysesTabForKey('categorias', 'ArrowRight')).toBe('evolucao');
    expect(analysesTabForKey('orcamento', 'ArrowRight')).toBe('categorias');
    expect(analysesTabForKey('categorias', 'ArrowLeft')).toBe('orcamento');
    expect(analysesTabForKey('proximos-meses', 'ArrowLeft')).toBe('evolucao');
    expect(analysesTabForKey('evolucao', 'Home')).toBe('categorias');
    expect(analysesTabForKey('evolucao', 'End')).toBe('orcamento');
    expect(analysesTabForKey('evolucao', 'a')).toBeNull();
    expect(analysesTabForKey('evolucao', 'Enter')).toBeNull();
  });

  it('o mês abre no do endereço (do mais antigo ao mês de hoje) ou no de hoje, e o seletor para nos limites', () => {
    expect(analysesStartMonth(undefined, '2026-10')).toBe('2026-10');
    expect(analysesStartMonth('2026-08', '2026-10')).toBe('2026-08');
    for (const bad of ['2026-11', '1999-12', '2026-13', 'setembro', '', '2026-9']) expect(analysesStartMonth(bad, '2026-10'), bad).toBe('2026-10');
    expect(analysesStep('2026-10', '2026-10', 1)).toBeNull();
    expect(analysesStep('2026-10', '2026-10', -1)).toBe('2026-09');
    expect(analysesStep('2000-01', '2026-10', -1)).toBeNull();
    expect(analysesParams('2026-10', '2026-10')).toEqual({});
    expect(analysesParams('2026-08', '2026-10')).toEqual({ mes: '2026-08' });
  });

  it('Barras | Bolhas: Barras de início; só os dois valores existem', () => {
    expect(CATEGORY_VIEWS).toEqual(['barras', 'bolhas']);
    expect(DEFAULT_CATEGORY_VIEW).toBe('barras');
    expect(isCategoryView('bolhas')).toBe(true);
    expect(isCategoryView('pizza')).toBe(false);
    expect(isCategoryView(undefined)).toBe(false);
  });
});

describe('bolhas: o arranjo (layoutBubbles)', () => {
  const samples: Record<string, number[]> = {
    demonstração: [250_000, 140_000],
    seis: [300_000, 140_000, 60_000, 40_000, 30_000, 20_000],
    sete: [470_000, 200_000, 88_000, 40_000, 22_000, 15_000, 9_000],
    iguais: [100, 100, 100, 100, 100, 100, 100, 100],
    uma: [50_000],
    dominante: [900_000, 5_000, 4_000, 3_000],
  };

  it('é determinístico: os mesmos valores e a mesma largura dão as mesmas posições e os mesmos raios', () => {
    for (const [name, values] of Object.entries(samples)) {
      for (const width of WIDTHS) expect(layoutBubbles(values, width), `${name} ${width}`).toEqual(layoutBubbles([...values], width));
    }
  });

  it('nenhuma bolha toca outra em 320, 360 e 390 px, e todas ficam dentro da área', () => {
    for (const [name, values] of Object.entries(samples)) {
      for (const width of WIDTHS) {
        const layout = layoutBubbles(values, width);
        expect(layout.bubbles.length).toBe(values.length);
        expectNoOverlap(layout.bubbles, `${name} ${width}`);
        for (const b of layout.bubbles) {
          expect(b.cx - b.r, `${name} ${width} esquerda`).toBeGreaterThanOrEqual(0);
          expect(b.cx + b.r, `${name} ${width} direita`).toBeLessThanOrEqual(width);
          expect(b.cy - b.r, `${name} ${width} topo`).toBeGreaterThanOrEqual(0);
          expect(b.cy + b.r, `${name} ${width} base`).toBeLessThanOrEqual(layout.height);
        }
      }
    }
  });

  it('nenhuma sobreposição em 300 conjuntos de 1 a 9 valores sorteados (com semente), nas três larguras e com letra grande', () => {
    const random = lcg(2026);
    for (let n = 0; n < 300; n++) {
      const count = 1 + Math.floor(random() * 9);
      const values = Array.from({ length: count }, () => Math.round(100 + random() ** 3 * 900_000));
      for (const width of WIDTHS) {
        for (const scale of [1, 1.3, 1.5]) {
          const layout = layoutBubbles(values, width, { scale });
          expect(layout.bubbles.length).toBe(count);
          expectNoOverlap(layout.bubbles, `conjunto ${n} ${width} x${scale}`);
          for (const b of layout.bubbles) {
            expect(b.cx - b.r).toBeGreaterThanOrEqual(-0.01);
            expect(b.cx + b.r).toBeLessThanOrEqual(width + 0.01);
            expect(b.cy - b.r).toBeGreaterThanOrEqual(-0.01);
            expect(b.cy + b.r).toBeLessThanOrEqual(layout.height + 0.01);
          }
        }
      }
    }
  });

  it('a área é proporcional ao valor (raio pela raiz) em todas as bolhas acima do mínimo', () => {
    for (const width of WIDTHS) {
      const layout = layoutBubbles(samples.seis!, width);
      const free = layout.bubbles.filter((b) => !b.atMinimum);
      expect(free.length).toBeGreaterThanOrEqual(2);
      const constant = free[0]!.r ** 2 / free[0]!.value;
      for (const b of free) expect((b.r ** 2 / b.value) / constant, `${width}`).toBeCloseTo(1, 3);
      // A maior bolha é a do maior valor, e a ordem dos raios segue a dos valores.
      expect(layout.bubbles[0]!.r).toBe(layout.maxRadius);
      for (let i = 1; i < layout.bubbles.length; i++) expect(layout.bubbles[i]!.r).toBeLessThanOrEqual(layout.bubbles[i - 1]!.r);
    }
  });

  it('o raio nunca fica abaixo do mínimo legível; quem ficou no mínimo é marcado, e só ele', () => {
    for (const [name, values] of Object.entries(samples)) {
      for (const width of WIDTHS) {
        const layout = layoutBubbles(values, width);
        expect(layout.minRadius).toBe(BUBBLE_MIN_RADIUS);
        const top = Math.max(...values);
        for (const b of layout.bubbles) {
          expect(b.r, `${name} ${width}`).toBeGreaterThanOrEqual(BUBBLE_MIN_RADIUS);
          const ideal = layout.maxRadius * Math.sqrt(b.value / top);
          expect(b.atMinimum, `${name} ${width} ${b.index}`).toBe(ideal < BUBBLE_MIN_RADIUS);
          if (b.atMinimum) expect(b.r).toBe(BUBBLE_MIN_RADIUS);
        }
      }
    }
    // Com letra grande o mínimo cresce junto: 38 × 1,5.
    const big = layoutBubbles(samples.sete!, 310, { scale: 1.5 });
    expect(big.minRadius).toBe(57);
    for (const b of big.bubbles) expect(b.r).toBeGreaterThanOrEqual(57);
    // Escala fora do que vale (menor que 1, maior que 1,5, texto) é levada ao limite.
    expect(layoutBubbles(samples.sete!, 310, { scale: 0.2 }).minRadius).toBe(BUBBLE_MIN_RADIUS);
    expect(layoutBubbles(samples.sete!, 310, { scale: 9 }).minRadius).toBe(57);
    expect(layoutBubbles(samples.sete!, 310, { scale: Number.NaN }).minRadius).toBe(BUBBLE_MIN_RADIUS);
  });

  it('valor zero, negativo ou que não é número fica de fora, e o índice guarda o lugar do valor na lista', () => {
    const layout = layoutBubbles([300_000, 0, -5, Number.NaN, 100_000, Number.POSITIVE_INFINITY, 50_000], 310);
    expect(layout.bubbles.map((b) => b.index)).toEqual([0, 4, 6]);
    expect(layout.bubbles.map((b) => b.value)).toEqual([300_000, 100_000, 50_000]);
    expectNoOverlap(layout.bubbles, 'com zeros');
    expect(layoutBubbles([], 310)).toMatchObject({ bubbles: [], height: 0 });
    expect(layoutBubbles([0, 0], 310)).toMatchObject({ bubbles: [], height: 0 });
    expect(layoutBubbles([100], 0).bubbles).toEqual([]);
  });

  it('uma bolha só fica no meio da largura; com valores iguais, as bolhas têm o mesmo tamanho e cabem lado a lado', () => {
    const one = layoutBubbles([123], 310);
    expect(one.bubbles).toHaveLength(1);
    expect(one.bubbles[0]!.cx).toBe(155);
    const equal = layoutBubbles(samples.iguais!, 310);
    expect(new Set(equal.bubbles.map((b) => b.r)).size).toBe(1);
    // Oito bolhas iguais não formam uma coluna de 1.000 px: três por linha em 390 px.
    expect(equal.height).toBeLessThan(400);
    const rows = new Set(equal.bubbles.map((b) => Math.round(b.cy / 10)));
    expect(rows.size).toBeLessThan(equal.bubbles.length);
  });

  it('o conjunto é centralizado: sobra a mesma folga à esquerda e à direita', () => {
    for (const width of WIDTHS) {
      const layout = layoutBubbles(samples.seis!, width);
      const left = Math.min(...layout.bubbles.map((b) => b.cx - b.r));
      const right = width - Math.max(...layout.bubbles.map((b) => b.cx + b.r));
      expect(Math.abs(left - right)).toBeLessThan(0.1);
    }
  });

  it('a altura é razoável para uma tela de celular (até uns 340 px com oito categorias em 390 px)', () => {
    for (const width of WIDTHS) {
      const h = layoutBubbles(samples.sete!, width).height;
      expect(h).toBeGreaterThan(150);
      expect(h).toBeLessThan(380);
    }
  });
});

describe('bolhas: o nome e o percentual dentro de cada uma', () => {
  const share = (category: string | null, cents: number, tenths: number, percentText: string): CategoryShare => ({
    category,
    label: category ?? NO_CATEGORY_LABEL,
    cents,
    tenths,
    percentText,
    a11yLabel: '',
  });

  /** A estimativa de largura, conferida contra Manrope Bold medida num navegador (em múltiplos do tamanho da letra). */
  const MEASURED_EM: Record<string, number> = {
    Moradia: 3.909,
    Mercado: 4.224,
    Transporte: 5.326,
    Saúde: 3.078,
    Educação: 4.731,
    Lazer: 2.604,
    categoria: 4.64,
    Encargos: 4.487,
    'cartão': 3.169,
    '23,4%': 2.989,
    '100,0%': 3.616,
    '0,0%': 2.52,
    '64,1%': 2.732,
    Alimentação: 6.104,
  };

  it('a estimativa de largura nunca fica abaixo da medida em Manrope Bold e passa dela por pouco', () => {
    for (const [text, measured] of Object.entries(MEASURED_EM)) {
      const estimate = labelWidthEm(text);
      expect(estimate, text).toBeGreaterThanOrEqual(measured);
      expect(estimate, text).toBeLessThanOrEqual(measured * 1.2);
    }
  });

  it('o nome acessível é "Mercado, 23,4%, R$ 920,00", na bolha e na barra', () => {
    const mercado = share('Mercado', 92_000, 234, '23,4%');
    expect(categoryAccessibleName(mercado)).toBe('Mercado, 23,4%, R$ 920,00');
    const layout = categoryBubbles([mercado, share('Moradia', 300_000, 766, '76,6%')], 310);
    expect(layout.bubbles.map((b) => b.a11yLabel)).toEqual(['Mercado, 23,4%, R$ 920,00', 'Moradia, 76,6%, R$ 3.000,00']);
  });

  it('cada bolha traz o nome e o percentual escritos, e o texto cabe: toda linha passa na conta do círculo, em todos os tamanhos', () => {
    const names = [...CATEGORIES.despesa, NO_CATEGORY_LABEL, 'Encargos do cartão'];
    for (const scale of [1, 1.15, 1.3, 1.5]) {
      for (const name of names) {
        for (const percent of ['0,0%', '4,0%', '23,4%', '100%', '100,0%']) {
          for (let r = BUBBLE_MIN_RADIUS * scale; r <= 88 * scale; r += 6) {
            const label = fitBubbleLabel(name, percent, r, scale);
            expect(label.lines[label.lines.length - 1], `${name} ${r}`).toBe(percent);
            expect(label.lines.slice(0, -1).join(' '), `${name} ${r} x${scale}`).toBe(name);
            expect(BUBBLE_FONT_SIZES.map((f) => Math.round(f * scale * 100) / 100)).toContain(label.fontSize);
            const n = label.lines.length;
            label.lines.forEach((text, k) => {
              const reach = Math.abs(k - (n - 1) / 2) * label.lineHeight + label.lineHeight / 2;
              const half = Math.sqrt(r * r - reach * reach);
              expect((labelWidthEm(text) * label.fontSize) / 2, `${name} ${percent} r=${r} x${scale}: "${text}"`).toBeLessThanOrEqual(half);
            });
          }
        }
      }
    }
  });

  it('um nome comprido demais é cortado com reticências, e o nome inteiro segue no nome acessível', () => {
    const label = fitBubbleLabel('Mensalidade da escola de música', '4,0%', BUBBLE_MIN_RADIUS, 1);
    expect(label.lines[label.lines.length - 1]).toBe('4,0%');
    expect(label.lines.slice(0, -1).some((l) => l.endsWith('…'))).toBe(true);
    const layout = categoryBubbles([share('Mensalidade da escola de música', 10_000, 1000, '100%')], 310);
    expect(layout.bubbles[0]!.label).toBe('Mensalidade da escola de música');
    expect(layout.bubbles[0]!.a11yLabel).toBe('Mensalidade da escola de música, 100%, R$ 100,00');
  });

  it('com os números reais de "Por categoria", a soma dos percentuais das bolhas é 100,0% e nenhuma toca outra', () => {
    const random = lcg(59);
    const names = [...CATEGORIES.despesa, null];
    for (let n = 0; n < 60; n++) {
      const used = names.filter(() => random() < 0.7);
      if (used.length === 0) continue;
      const paid = used.map((category, i): FinancialRecord => ({
        id: `r${n}-${i}`,
        contextId: 'c',
        accountId: 'a',
        kind: 'despesa',
        status: 'realizado',
        amountCents: 100 + Math.floor(random() ** 2 * 900_000),
        currency: 'BRL',
        occurredOn: '2026-10-01',
        description: 'x',
        category,
        commitmentId: null,
        invoice: null,
        receiptKey: null,
        createdBy: 'p',
        version: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      }));
      const shares = categoryBreakdown(paid);
      for (const width of WIDTHS) {
        const layout = categoryBubbles(shares, width);
        expect(layout.bubbles).toHaveLength(shares.length);
        const sum = layout.bubbles.reduce((acc, b) => acc + Math.round(Number(b.percentText.replace(',', '.').replace('%', '')) * 10), 0);
        expect(sum, `${n} ${width}`).toBe(1000);
        expect(layout.bubbles.reduce((acc, b) => acc + b.cents, 0)).toBe(shares.reduce((acc, s) => acc + s.cents, 0));
        expectNoOverlap(layout.bubbles, `${n} ${width}`);
        expect(new Set(layout.bubbles.map((b) => b.key)).size).toBe(layout.bubbles.length);
        expect(layout.anyAtMinimum).toBe(layout.bubbles.some((b) => b.atMinimum));
      }
    }
  });

  it('categoria com valor zero fica fora das bolhas (a barra continua mostrando); as chaves de "Sem categoria" e de nome não se confundem', () => {
    const layout = categoryBubbles([share('Mercado', 90_000, 1000, '100%'), share('Lazer', 0, 0, '0%')], 310);
    expect(layout.bubbles.map((b) => b.label)).toEqual(['Mercado']);
    expect(categoryKey(null)).toBe(NO_CATEGORY_KEY);
    expect(categoryKey('Mercado')).toBe('c:Mercado');
    expect(categoryKey('sem-categoria')).not.toBe(categoryKey(null));
  });
});

describe('Categoria selecionada', () => {
  let seq = 0;
  const rec = (category: string | null, amountCents: number, description: string, occurredOn = '2026-10-01', invoice: FinancialRecord['invoice'] = null): FinancialRecord => ({
    id: `r${++seq}`,
    contextId: 'c',
    accountId: 'a',
    kind: 'despesa',
    status: 'realizado',
    amountCents,
    currency: 'BRL',
    occurredOn,
    description,
    category,
    commitmentId: null,
    invoice,
    receiptKey: null,
    createdBy: 'p',
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  });

  it('valor e percentual são os de "Por categoria", e os lançamentos vão do maior valor ao menor (empate: o mais recente)', () => {
    const paid = [
      rec('Mercado', 25_000, 'Feira', '2026-10-02'),
      rec('Mercado', 140_000, 'Mercado grande', '2026-10-06'),
      rec('Mercado', 25_000, 'Padaria', '2026-10-09'),
      rec('Moradia', 250_000, 'Aluguel', '2026-10-05'),
      rec(null, 1_000, 'Sem nome', '2026-10-03'),
    ];
    const shares = categoryBreakdown(paid);
    const parts = paidCategoryParts(paid);
    const card = selectedCategoryCard(shares, parts, categoryKey('Mercado'))!;
    const mercado = shares.find((s) => s.label === 'Mercado')!;
    expect(card.title).toBe('Categoria selecionada');
    expect(card.name).toBe('Mercado');
    expect(card.cents).toBe(mercado.cents);
    expect(card.valueText).toBe('R$ 1.900,00');
    expect(card.percentText).toBe(mercado.percentText);
    expect(card.shareText).toBe(`${mercado.percentText} do pago`);
    expect(card.a11y).toBe(`Mercado, ${mercado.percentText} do pago, R$ 1.900,00`);
    expect(card.announce).toBe(`Categoria selecionada: Mercado, ${mercado.percentText}, R$ 1.900,00.`);
    expect(card.countText).toBe('3 lançamentos');
    expect(card.rows.map((r) => [r.description, r.dateText, r.valueText, r.partialText])).toEqual([
      ['Mercado grande', '06/10/2026', 'R$ 1.400,00', null],
      ['Padaria', '09/10/2026', 'R$ 250,00', null],
      ['Feira', '02/10/2026', 'R$ 250,00', null],
    ]);
    // A soma das linhas é o valor do cartão, e cada linha leva ao lançamento.
    expect(card.rows.reduce((a, r) => a + r.cents, 0)).toBe(card.cents);
    expect(card.rows.map((r) => r.href)).toEqual(paid.filter((r) => r.category === 'Mercado').sort((a, b) => b.amountCents - a.amountCents || b.occurredOn.localeCompare(a.occurredOn)).map((r) => `/registro/${r.id}`));
    expect(card.rows[0]!.a11y).toBe('Mercado grande, 06/10/2026, R$ 1.400,00');
    expect(card.hiddenCount).toBe(0);
    expect(card.moreText).toBeNull();
    expect(selectedCategoryCard(shares, parts, categoryKey(null))!.name).toBe('Sem categoria');
    expect(selectedCategoryCard(shares, parts, categoryKey('Lazer'))).toBeNull();
    expect(selectedCategoryCard(shares, parts, 'qualquer')).toBeNull();
  });

  it('o pagamento de fatura entra só com a parte da categoria, sem contar nada duas vezes', () => {
    const invoices = [
      {
        cardId: 'cartao',
        month: '2026-10',
        mix: [
          { category: 'Mercado', charges: false, cents: 60_000 },
          { category: 'Lazer', charges: false, cents: 30_000 },
          { category: null, charges: true, cents: 10_000 },
        ],
      },
    ];
    const paid = [rec('Mercado', 25_000, 'Feira'), rec('Cartão', 100_000, 'Fatura do cartão', '2026-10-10', { cardId: 'cartao', month: '2026-10' })];
    const shares = categoryBreakdown(paid, invoices);
    const parts = paidCategoryParts(paid, invoices);
    const card = selectedCategoryCard(shares, parts, categoryKey('Mercado'))!;
    expect(card.cents).toBe(85_000);
    expect(card.rows.map((r) => [r.description, r.valueText, r.partialText])).toEqual([
      ['Fatura do cartão', 'R$ 600,00', 'Parte do pagamento da fatura'],
      ['Feira', 'R$ 250,00', null],
    ]);
    expect(card.rows[0]!.a11y).toBe('Fatura do cartão, 10/10/2026, R$ 600,00, parte do pagamento da fatura');
    expect(card.rows.reduce((a, r) => a + r.cents, 0)).toBe(card.cents);
    // A fatura aparece uma vez em cada categoria dela e a soma das categorias é o pago.
    const all = shares.map((s) => selectedCategoryCard(shares, parts, categoryKey(s.category))!);
    expect(all.reduce((acc, c) => acc + c.cents, 0)).toBe(125_000);
    expect(all.reduce((acc, c) => acc + c.rows.reduce((a, r) => a + r.cents, 0), 0)).toBe(125_000);
  });

  it('lista os maiores lançamentos e diz quantos ficaram de fora', () => {
    const paid = Array.from({ length: CATEGORY_CARD_ROWS + 3 }, (_, i) => rec('Lazer', 1_000 + i, `Lazer ${i}`));
    const shares = categoryBreakdown(paid);
    const card = selectedCategoryCard(shares, paidCategoryParts(paid), categoryKey('Lazer'))!;
    expect(card.rows).toHaveLength(CATEGORY_CARD_ROWS);
    expect(card.countText).toBe(`${CATEGORY_CARD_ROWS + 3} lançamentos`);
    expect(card.hiddenCount).toBe(3);
    expect(card.moreText).toBe('Mais 3 lançamentos nesta categoria.');
    expect(card.rows[0]!.cents).toBeGreaterThan(card.rows[CATEGORY_CARD_ROWS - 1]!.cents);
    const one = selectedCategoryCard(shares, paidCategoryParts(paid), categoryKey('Lazer'), 12)!;
    expect(one.hiddenCount).toBe(1);
    expect(one.moreText).toBe('Mais 1 lançamento nesta categoria.');
    expect(selectedCategoryCard(categoryBreakdown([rec('Lazer', 100, 'um')]), paidCategoryParts([rec('Lazer', 100, 'um')]), categoryKey('Lazer'))!.countText).toBe('1 lançamento');
  });
});

describe('Análises: os resumos das outras abas, com os números da demonstração', () => {
  it('Evolução: outubro (em andamento) não tem variação; setembro, o primeiro mês da comparação, também não', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const currentMonth = monthOf(DEMO_TODAY);
    const { from, to } = evolutionFetchRange(currentMonth);
    const overview = await repo.monthsOverview(ctx, from, to);
    const view = buildEvolutionView({ overview, metric: 'pago', windowMonths: 12, currentMonth, hiddenMonths: [] });
    const october = analysesEvolutionSummary(view, '2026-10')!;
    expect(october.title).toBe('Pago em outubro de 2026');
    expect(october.valueText).toBe('R$ 3.900,00');
    expect(october.stateText).toBe('Mês em andamento');
    expect(october.variationText).toBe('Variação não disponível: o mês ainda está em andamento.');
    expect(october.percentText).toBeNull();
    expect(october.basis).toBe(EVOLUTION_TEXT.subtitle);
    const september = analysesEvolutionSummary(view, '2026-09')!;
    expect(september.valueText).toBe('R$ 3.750,00');
    expect(september.variationText).toBe('Variação não disponível: não há outro mês na comparação antes deste.');
    const august = analysesEvolutionSummary(view, '2026-08')!;
    expect(august.valueText).toBeNull();
    expect(august.stateText).toContain('Sem registros');
    // Antes dos 12 meses que a Evolução mostra: sem resumo.
    expect(analysesEvolutionSummary(view, '2025-01')).toBeNull();
    expect(ANALYSES_TEXT.evolution.outside('2025-11')).toBe('A Evolução mostra os 12 meses até hoje, a partir de novembro de 2025. Este mês fica antes.');
  });

  it('Evolução, cenário "evolucao": de março para abril, R$ 4.500,00 a mais, as mesmas frases da tela Evolução', async () => {
    const repo = await createDemoRepository({ scenario: 'evolucao' });
    const ctx = (await repo.getSpace())!.personalContextId;
    const { from, to } = evolutionFetchRange(monthOf(DEMO_TODAY));
    const view = buildEvolutionView({ overview: await repo.monthsOverview(ctx, from, to), metric: 'pago', windowMonths: 12, currentMonth: monthOf(DEMO_TODAY), hiddenMonths: [] });
    const april = analysesEvolutionSummary(view, '2026-04')!;
    expect(april.valueText).toBe('R$ 7.800,00');
    expect(april.variationText).toBe('De março para abril: R$ 4.500,00 a mais');
    expect(april.percentText).toBe('136,4% a mais que março');
    // Com abril fora da comparação, maio compara com março, e a frase diz as duas datas.
    const without = buildEvolutionView({ overview: await repo.monthsOverview(ctx, from, to), metric: 'pago', windowMonths: 12, currentMonth: monthOf(DEMO_TODAY), hiddenMonths: ['2026-04'] });
    expect(analysesEvolutionSummary(without, '2026-05')!.variationText).toBe('De março para maio: R$ 150,00 a mais');
  });

  it('Próximos meses: novembro de 2026 previsto em R$ 4.380,00 (73,0% da renda de referência, já com as faturas do cartão), com os três primeiros meses', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const months = upcomingCommittedMonths('2026-10');
    const [series, due, refs] = await Promise.all([repo.listSeries(ctx), repo.listCommitmentsDueBetween(ctx, months[0]!, months[months.length - 1]!), repo.listIncomeReferences(ctx)]);
    const projection = projectCommitted(series, due, refs, months, DEMO_TODAY);
    const summary = analysesUpcomingSummary(projection, '2026-10');
    expect(summary.title).toBe('Previsto depois de outubro de 2026');
    expect(summary.rows).toHaveLength(ANALYSES_UPCOMING_MONTHS);
    expect(summary.rows.map((r) => r.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(summary.rows[0]!.text).toBe('Novembro de 2026 · R$ 4.380,00 · 73,0%');
    expect(summary.rows[0]!.text).toBe(projection.months[0]!.text);
    expect(summary.rows[0]!.a11y).toBe(projection.months[0]!.a11yLabel);
    expect(summary.emptyText).toBeNull();
    expect(summary.legend).toBe('Previsto: contas já criadas e repetições programadas. Valores estimados podem mudar.');
    // Conta nova: nada previsto, a frase diz isso e nunca mostra três meses de R$ 0,00 como se fossem uma previsão.
    const blank = projectCommitted([], [], [], months, DEMO_TODAY);
    expect(analysesUpcomingSummary(blank, '2026-10').emptyText).toBe('Nenhuma conta prevista nos próximos meses.');
  });

  it('Orçamento: orçado e usado de outubro, a categoria com o maior percentual, e a frase de mês sem orçamento', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const october = analysesBudgetSummary(summarizeBudget(await repo.getMonthBudget(ctx, '2026-10')));
    expect(october.title).toBe('Orçamento de outubro de 2026');
    expect(october.totalLine).toBe('Orçado R$ 4.600,00 · Usado R$ 4.300,00');
    expect(october.countText).toBe('3 categorias com orçamento');
    expect(october.nearestLine).toBe('Maior percentual usado: Lazer, R$ 400,00 de R$ 300,00 (133,3%)');
    expect(october.emptyText).toBeNull();
    const september = analysesBudgetSummary(summarizeBudget(await repo.getMonthBudget(ctx, '2026-09')));
    expect(september.totalLine).toBeNull();
    expect(september.emptyText).toBe('Nenhum orçamento definido em setembro de 2026.');
    expect(ANALYSES_TEXT.budget.count(1)).toBe('1 categoria com orçamento');
  });

  it('o mês de Categorias na demonstração: Moradia 64,1% e Mercado 35,9%, as bolhas e o cartão com os mesmos números', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const s = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    const shares = categoryBreakdown(s.composition.paid);
    const parts = paidCategoryParts(s.composition.paid);
    for (const width of WIDTHS) {
      const layout = categoryBubbles(shares, width);
      expect(layout.bubbles.map((b) => b.a11yLabel)).toEqual(['Moradia, 64,1%, R$ 2.500,00', 'Mercado, 35,9%, R$ 1.400,00']);
      expectNoOverlap(layout.bubbles, `${width}`);
    }
    const card = selectedCategoryCard(shares, parts, categoryKey('Mercado'))!;
    expect(card.valueText).toBe('R$ 1.400,00');
    expect(card.shareText).toBe('35,9% do pago');
    expect(card.rows.map((r) => [r.description, r.valueText])).toEqual([['Mercado', 'R$ 1.400,00']]);
  });
});

describe('Análises: textos do núcleo e ligações com o resto do app', () => {
  it('as frases pedidas por Enzo existem como estão', () => {
    expect(ANALYSES_TEXT.title).toBe('Análises');
    expect(ANALYSES_TEXT.categories.legend).toBe('Bolhas: visão exploratória. Barras: comparação mais precisa.');
    expect(ANALYSES_TEXT.categories.selected.title).toBe('Categoria selecionada');
    expect(ANALYSES_TEXT.categories.empty('2026-09')).toBe('Nenhum gasto anotado em setembro de 2026.');
    expect(ANALYSES_TEXT.retry).toBe('Tentar de novo');
    expect(ANALYSES_TEXT.categories.views).toEqual({ barras: 'Barras', bolhas: 'Bolhas' });
    expect(isUpcomingSection('proximos')).toBe(true);
    expect(isUpcomingSection(['proximos', 'x'])).toBe(true);
    expect(isUpcomingSection('outra')).toBe(false);
    expect(isUpcomingSection(undefined)).toBe(false);
  });

  it('é tela de consulta com a barra inferior e Movimentos como aba do assunto', () => {
    expect(barModeFor('/analises')).toBe('consulta');
    expect(barModeFor('/analises?aba=orcamento&mes=2026-09')).toBe('consulta');
    expect(topicTabFor('/analises')).toBe('/movimentacoes');
  });

  it('a busca "No app" de Aprender acha a tela por análises, bolhas e barras, com o título e a legenda do núcleo', () => {
    const screen = APP_SCREENS.find((s) => s.id === 'analises')!;
    expect(screen.title).toBe(ANALYSES_TEXT.title);
    expect(screen.caption).toBe(ANALYSES_TEXT.screenCaption);
    expect(screen.href).toBe(ANALYSES_ROUTE);
    for (const query of ['análises', 'analises', 'bolhas', 'barras', 'distribuição dos gastos', 'explorar']) {
      expect(searchAppScreens(query).map((s) => s.id), query).toContain('analises');
    }
    expect(searchAppScreens('análises')[0]!.id).toBe('analises');
    expect(searchAppScreens('bolhas')[0]!.id).toBe('analises');
    // As telas que já existiam continuam sendo as primeiras para os seus nomes.
    expect(searchAppScreens('evolução')[0]!.id).toBe('evolucao');
    expect(searchAppScreens('orçamento')[0]!.id).toBe('orcamento');
    expect(searchAppScreens('pago por categoria')[0]!.id).toBe('categoria');
  });

  it('o guia tem a entrada "Análises" em Dia a dia, logo depois de "Evolução", com o caminho e os botões reais', () => {
    const entry = guideEntry('analises')!;
    expect(entry.group).toBe('dia-a-dia');
    const ids = GUIDE_ENTRIES.map((e) => e.id);
    expect(ids.indexOf('analises')).toBe(ids.indexOf('evolucao') + 1);
    expect(entry.href).toBe('/analises');
    expect(entry.routes).toEqual(['/analises']);
    expect(guideWhere(entry.where)).toBe('Movimentos › Análises');
    expect(entry.screenshot).toBe('481_analises_categorias_barras.png');
    const steps = entry.steps.join(' ');
    for (const name of [
      '"Evolução"',
      '"Análises"',
      '"Categorias"',
      '"Próximos meses"',
      '"Orçamento"',
      '"Barras"',
      '"Bolhas"',
      '"Categoria selecionada"',
      '"Abrir Evolução"',
      '"Abrir Renda comprometida"',
      '"Abrir Orçamento"',
    ]) {
      expect(steps, name).toContain(name);
    }
    expect(steps).toContain('só neste aparelho');
    expect(steps).toContain('nada é gravado');
    for (const query of ['análises', 'bolhas', 'barras']) expect(searchGuide(query).map((e) => e.id), query).toContain('analises');
    // "cartão" continua levando só a Cartões e faturas.
    expect(searchGuide('cartão').map((e) => e.id)).toEqual(['cartoes']);
  });

  it('o app: a linha em Movimentos fica logo abaixo de "Evolução", a rota existe e abre direto pelo endereço, e a escolha fica só no aparelho', () => {
    const movimentos = read('app/(tabs)/movimentacoes.tsx');
    expect(movimentos.indexOf('<AnalysesEntry')).toBeGreaterThan(movimentos.indexOf('<EvolutionEntry'));
    expect(movimentos.indexOf('<AnalysesEntry')).toBeLessThan(movimentos.indexOf('Anotar gasto'));
    expect(movimentos).toContain("pathname: '/analises'");
    expect(read('app/_layout.tsx')).toContain('<Stack.Screen name="analises" />');
    expect(read('app/_layout.tsx')).toMatch(/seu-mes\|evolucao\|analises\|metas/);
    const prefs = read('lib/device-prefs.ts');
    expect(prefs).toContain('categoryView: CategoryView;');
    expect(prefs).toContain('categoryView: DEFAULT_CATEGORY_VIEW,');
    expect(prefs).toContain('categoryView: isCategoryView(v.categoryView) ? v.categoryView : DEFAULT_CATEGORY_VIEW,');
    expect(prefs).not.toMatch(/fetch\(|supabase/i);
  });

  it('o app só lê: nenhuma gravação no banco, nenhuma memória do aparelho fora da escolha Barras | Bolhas', () => {
    const files = { tela: read('app/analises.tsx'), partes: read('components/analises-parts.tsx'), escolha: read('lib/category-view.ts') };
    for (const [name, text] of Object.entries({ tela: files.tela, partes: files.partes })) {
      expect(text, name).not.toMatch(/useMutation|\buse(Create|Update|Delete|Set|Add|Pay|Undo|End|Skip|Inform|Import|Mark|Decide)[A-Z]\w*\(/);
      expect(text, name).not.toMatch(/AsyncStorage|localStorage|sessionStorage|device-prefs/);
    }
    expect(files.escolha).toContain('updatePrefs(userId, { categoryView: view }, persist)');
    expect(files.escolha).toContain("auth.mode !== 'demo'");
    // Os valores e o leitor de tela seguem a privacidade; o contexto vem do seletor.
    expect(files.partes).toMatch(/from '@\/lib\/privacy'/);
    expect(files.partes).toContain('maskMoneyLabel(b.a11yLabel, hidden)');
    expect(files.tela).toContain('useWork()');
  });
});
