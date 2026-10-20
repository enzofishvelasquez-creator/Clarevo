/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EVOLUTION_TEXT,
  LEARN_UI_TEXT,
  TOPICS,
  TOPIC_SLUGS,
  averageCents,
  canonicalNumber,
  comparisonStats,
  expectedExampleNumbers,
  guideEntry,
  isAllowedSourceUrl,
  learnReviewWarnings,
  medianCents,
  numbersInText,
  publishedTopics,
  relatedTopics,
  reviewDueOn,
  searchTopics,
  topicBySlug,
  topicDisplayTexts,
  topicReadingMinutes,
  topicWordCount,
  topicsBySection,
  validateLearnCatalog,
  type EvolutionPoint,
  type Topic,
} from '../src';

/**
 * Tema de Aprender "Média e mediana" (Ciclo W, D-062 item 3): a explicação dos dois números da tela Evolução, com fonte pública do
 * IBGE, o exemplo do caso de referência da Evolução (EF §6) calculado pelas mesmas funções da tela, e a ligação nos dois sentidos
 * ("Ver na Evolução" no tema; "O que é mediana?" na Evolução).
 */
const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
const DOCS = fileURLToPath(new URL('../../../docs/', import.meta.url));
const read = (rel: string) => readFileSync(join(APP_SRC, rel), 'utf8');

const SLUG = 'media-e-mediana';
const topic = (): Topic => topicBySlug(SLUG)!;
/** Os seis meses do caso de referência (Pago de janeiro a junho; abril com um conserto) e as mesmas contas sem abril, em centavos. */
const SIX = [320_000, 340_000, 330_000, 780_000, 345_000, 360_000];
const WITHOUT_APRIL = [320_000, 340_000, 330_000, 345_000, 360_000];
const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
const point = (month: string, cents: number): EvolutionPoint => ({ month, cents, count: 3, state: 'com_registros' });

describe('Média e mediana: as contas do exemplo (EF §6)', () => {
  it('seis meses: média R$ 4.125,00 e mediana R$ 3.425,00; sem abril, média R$ 3.390,00 e mediana R$ 3.400,00', () => {
    expect(averageCents(SIX)).toBe(412_500);
    expect(medianCents(SIX)).toBe(342_500);
    expect(averageCents(WITHOUT_APRIL)).toBe(339_000);
    expect(medianCents(WITHOUT_APRIL)).toBe(340_000);
    expect(SIX.reduce((a, b) => a + b, 0)).toBe(2_475_000);
    expect(WITHOUT_APRIL.reduce((a, b) => a + b, 0)).toBe(1_695_000);
  });

  it('são as mesmas contas da tela Evolução: comparisonStats devolve a média e a mediana do exemplo, com e sem abril', () => {
    const points = MONTHS.map((m, i) => point(m, SIX[i]!));
    const all = comparisonStats(points, []);
    expect([all.average, all.median, all.visibleCount, all.eligibleCount]).toEqual([412_500, 342_500, 6, 6]);
    const noApril = comparisonStats(points, ['2026-04']);
    expect([noApril.average, noApril.median, noApril.visibleCount, noApril.eligibleCount]).toEqual([339_000, 340_000, 5, 6]);
    expect(noApril.canonicalTotal).toBe(2_475_000n);
    // O anúncio da tela usa os mesmos números que o tema mostra.
    expect(EVOLUTION_TEXT.stats.announce(noApril.average!, noApril.median!, 5, 6)).toBe('Média R$ 3.390,00, mediana R$ 3.400,00, 5 de 6 meses.');
  });

  it('a ordem dos meses não muda a mediana (a posição vem dos valores em ordem)', () => {
    const shuffled = [780_000, 345_000, 320_000, 360_000, 330_000, 340_000];
    expect(medianCents(shuffled)).toBe(medianCents(SIX));
    expect(averageCents(shuffled)).toBe(averageCents(SIX));
  });

  it('o mês fora do comum puxa a média (R$ 735,00 a mais sem mexer em nenhum dos outros cinco) e a mediana muda R$ 25,00', () => {
    expect(412_500 - 339_000).toBe(73_500);
    expect(342_500 - 340_000).toBe(2_500);
    // Com um valor ainda maior em abril, a média sobe e a mediana fica onde estava.
    const bigger = [320_000, 340_000, 330_000, 7_800_000, 345_000, 360_000];
    expect(averageCents(bigger)).toBeGreaterThan(averageCents(SIX));
    expect(medianCents(bigger)).toBe(medianCents(SIX));
  });
});

describe('Média e mediana: o tema no catálogo', () => {
  it('está publicado em "Organizar o mês", logo depois de "essenciais" e antes dos temas de época', () => {
    const t = topic();
    expect(t.section).toBe('organizar');
    expect(t.kind).toBe('tema');
    expect(t.status).toBe('publicado');
    expect(t.title).toBe('Média e mediana');
    const i = TOPIC_SLUGS.indexOf(SLUG);
    expect(TOPIC_SLUGS[i - 1]).toBe('essenciais');
    expect(TOPIC_SLUGS[i + 1]).toBe('decimo-terceiro');
    expect(TOPICS.map((x) => x.slug)).toEqual([...TOPIC_SLUGS]);
    expect(TOPIC_SLUGS.length).toBe(47);
    expect(publishedTopics().length).toBe(45);
    expect(topicsBySection()[1]!.topics.map((x) => x.slug)).toContain(SLUG);
    expect(topicsBySection()[1]!.topics.length).toBe(12);
  });

  it('passa na validação do catálogo (R1 a R7, R9 e R12), com D-057 e D-062 registradas', () => {
    const decisions = readFileSync(join(DOCS, '00_VISAO_E_DECISOES.md'), 'utf8');
    const ids = [...decisions.matchAll(/^\|\s*(D-\d{3})\s*\|/gm)].map((m) => m[1]!);
    expect(ids).toEqual(expect.arrayContaining(['D-057', 'D-062']));
    const problems = validateLearnCatalog(TOPICS, { today: '2026-10-20', decisionIds: ids });
    expect(problems.filter((p) => p.slug === SLUG)).toEqual([]);
  });

  it('fontes: duas páginas do IBGE Educa (domínio gov.br), consultadas em 20/10/2026, cada uma com o trecho e o aviso de que a página não abriu', () => {
    const t = topic();
    const external = t.sources.filter((s) => s.kind !== 'clarevo');
    expect(external.length).toBe(2);
    for (const s of external) {
      expect(s.kind).toBe('oficial');
      if (s.kind !== 'oficial') continue;
      expect(s.publisher).toBe('IBGE');
      expect(s.url.startsWith('https://educa.ibge.gov.br/')).toBe(true);
      expect(isAllowedSourceUrl(s.url, 'oficial', SLUG)).toBe(true);
      expect(s.consultedOn).toBe('2026-10-20');
      expect(s.locator!.length).toBeGreaterThan(60);
      expect(s.locator!).toMatch(/Trecho de resultado de busca; a página não abriu/);
    }
    expect(external.map((s) => (s.kind === 'oficial' ? s.url : ''))).toEqual([
      'https://educa.ibge.gov.br/jovens/conheca-o-brasil/populacao/17870-a-mediana.html',
      'https://educa.ibge.gov.br/jovens/conheca-o-brasil/populacao/17862-media-pagina-inicial.html',
    ]);
    const refs = t.sources.flatMap((s) => (s.kind === 'clarevo' ? s.refs : []));
    expect(refs).toEqual(['D-057', 'D-062']);
  });

  it('revisão em 20/10/2026 e prazo de 12 meses (20/10/2027), com aviso 30 dias antes', () => {
    const t = topic();
    expect(t.reviewedOn).toBe('2026-10-20');
    expect(t.reviewEveryMonths).toBe(12);
    expect(reviewDueOn(t)).toBe('2027-10-20');
    expect(learnReviewWarnings(TOPICS, '2027-09-19').map((w) => w.slug)).not.toContain(SLUG);
    expect(learnReviewWarnings(TOPICS, '2027-09-20').map((w) => w.slug)).toContain(SLUG);
    expect(learnReviewWarnings(TOPICS, '2027-10-20').map((w) => w.slug)).toContain(SLUG);
  });

  it('leitura de no máximo 2 minutos e 320 palavras, com hipóteses fictícias e "Ver a conta"', () => {
    const t = topic();
    expect(topicReadingMinutes(t)).toBeLessThanOrEqual(2);
    expect(topicWordCount(t)).toBeLessThanOrEqual(320);
    expect(t.hypotheses).toMatch(/fict[ií]cio/i);
    expect(t.example).not.toBeNull();
    expect(t.calculation).not.toBeNull();
    expect(t.subtitle!.length).toBeLessThanOrEqual(80);
    expect(t.short.length).toBeLessThanOrEqual(220);
  });

  it('o exemplo traz os seis meses, a média e a mediana, e tudo bate com as contas do core', () => {
    const t = topic();
    for (const n of ['R$ 3.200,00', 'R$ 3.400,00', 'R$ 3.300,00', 'R$ 7.800,00', 'R$ 3.450,00', 'R$ 3.600,00', 'R$ 4.125,00', 'R$ 3.425,00', 'R$ 3.390,00']) expect(t.example, n).toContain(n);
    expect(t.example).toContain('a mediana é R$ 3.425,00');
    expect(t.example).toContain('A média é R$ 4.125,00');
    expect(t.example).toContain('Sem abril, a média é R$ 3.390,00 e a mediana, R$ 3.400,00');
    // "Em ordem, os dois do meio são R$ 3.400,00 e R$ 3.450,00": os valores em ordem, no meio.
    const sorted = [...SIX].sort((a, b) => a - b);
    expect(sorted.slice(2, 4)).toEqual([340_000, 345_000]);
    expect(t.example).toContain('os dois do meio são R$ 3.400,00 e R$ 3.450,00');
    const expected = expectedExampleNumbers(SLUG);
    for (const cents of [...SIX, averageCents(SIX), medianCents(SIX), averageCents(WITHOUT_APRIL), medianCents(WITHOUT_APRIL), 2_475_000, 1_695_000]) expect(expected.has(`R$:${cents}`), String(cents)).toBe(true);
    // Todo "R$" do texto e da conta está entre os números calculados.
    for (const text of topicDisplayTexts(t)) for (const n of numbersInText(text)) expect(expected.has(canonicalNumber(n)!), n).toBe(true);
    for (const n of numbersInText(`${t.example} ${t.calculation}`)) expect(expected.has(canonicalNumber(n)!), n).toBe(true);
  });

  it('"Ver a conta" mostra a soma, a divisão, os valores em ordem, os dois do meio e as mesmas contas sem abril', () => {
    const c = topic().calculation!;
    for (const part of [
      '3.200,00 + 3.400,00 + 3.300,00 + 7.800,00 + 3.450,00 + 3.600,00 = 24.750,00',
      '24.750,00 ÷ 6 = 4.125,00',
      'em ordem: 3.200,00, 3.300,00, 3.400,00, 3.450,00, 3.600,00 e 7.800,00',
      '(3.400,00 + 3.450,00) ÷ 2 = 3.425,00',
      'sem abril: 16.950,00 ÷ 5 = 3.390,00',
      'o valor do meio de 3.200,00, 3.300,00, 3.400,00, 3.450,00 e 3.600,00 é 3.400,00',
    ])
      expect(c, part).toContain(part);
    // Os números da conta, em centavos, conferem com as funções.
    expect(2_475_000 / 100).toBe(24_750);
    expect(1_695_000 / 100).toBe(16_950);
    expect((340_000 + 345_000) / 2).toBe(342_500);
  });

  it('o texto explica o que cada uma é, a diferença com o mês fora do comum, o que a Evolução faz e a fonte do IBGE', () => {
    const text = topicDisplayTexts(topic()).join(' ');
    for (const part of [
      'A média soma todos os valores e divide pela quantidade deles',
      'A mediana põe os valores em ordem e pega o do meio',
      'com quantidade par de valores, é a média dos dois do meio',
      'medidas de tendência central',
      'não é afetada por valores extremos',
      'Na Evolução, o Clarevo mostra as duas lado a lado',
      'Uma não é melhor que a outra',
      'nenhum lançamento muda',
      'O mês em andamento e os meses sem registros ficam de fora',
      'o mês conferido, sem lançamentos, entra como zero',
    ])
      expect(text, part).toContain(part);
    // Sem julgamento do mês nem recomendação de produto.
    expect(text).not.toMatch(/atípic|anormal|outlier|ruim|exagero|gastou demais|alto demais|invest|poupan|empréstimo|financiamento/i);
    expect(text).not.toMatch(/—|–/);
    expect(text).not.toMatch(/faz sentido|fazer sentido/i);
  });

  it('relacionados: renda que muda, gastos essenciais (média de três meses) e mês sem registro, todos publicados', () => {
    expect(topic().related).toEqual(['renda-variavel', 'essenciais', 'sem-registro']);
    expect(relatedTopics(SLUG).map((t) => t.slug)).toEqual(['renda-variavel', 'essenciais', 'sem-registro']);
  });

  it('a busca de Aprender acha o tema por "mediana", "média", "valor do meio" e "tendência central"', () => {
    const first = (q: string) => searchTopics(q)?.map((t) => t.slug) ?? [];
    expect(first('mediana')[0]).toBe(SLUG);
    expect(first('média e mediana')[0]).toBe(SLUG);
    expect(first('média')[0]).toBe(SLUG);
    expect(first('valor do meio')[0]).toBe(SLUG);
    expect(first('tendência central')[0]).toBe(SLUG);
    // As telas e temas que já falavam de média seguem achados.
    expect(first('média')).toEqual(expect.arrayContaining(['essenciais', 'estimativa', 'renda-variavel']));
  });
});

describe('Média e mediana: a ligação nos dois sentidos', () => {
  it('o tema tem a ação "Ver na Evolução", que abre /evolucao, na seção "No Clarevo"', () => {
    const learn = read('lib/learn.ts');
    expect(learn).toContain("'media-e-mediana': [{ label: 'Ver na Evolução', href: '/evolucao' }]");
    // A tela de explicação desenha as ações de topicActions sob "No Clarevo".
    const screen = read('app/explicacao/[tema].tsx');
    expect(screen).toContain('topicActions(topic.slug');
    expect(screen).toContain('LEARN_UI_TEXT.inClarevo');
  });

  it('a Evolução tem "O que é mediana?", o padrão "O que é isso?" que abre o resumo e leva ao tema', () => {
    expect(EVOLUTION_TEXT.stats.whatIsMedian).toBe('O que é mediana?');
    const parts = read('components/evolucao-parts.tsx');
    expect(parts).toContain('<TermHint term="Mediana" slug="media-e-mediana" label={T.stats.whatIsMedian} />');
    // Fica junto da média e da mediana (só quando elas aparecem), não nos estados sem meses.
    const stats = parts.slice(parts.indexOf('export function StatsSection'));
    expect(stats.indexOf('StatCard title={T.stats.median}')).toBeLessThan(stats.indexOf('<TermHint'));
    expect(stats.indexOf('<TermHint')).toBeLessThan(stats.indexOf('T.stats.onlyOne'));
    const hint = read('components/term-hint.tsx');
    expect(hint).toContain('label?: string');
    expect(hint).toContain('label={label ?? LEARN_UI_TEXT.termHint}');
    expect(hint).toContain('accessibilityLabel={label ?? LEARN_UI_TEXT.termHintA11y(term)}');
    // O botão abre e fecha o painel no próprio lugar e a explicação completa vem de "Ler explicação completa".
    expect(hint).toContain('LEARN_UI_TEXT.readFull');
    expect(LEARN_UI_TEXT.readFull).toBe('Ler explicação completa');
  });

  it('o tema que a Evolução liga está publicado, e o resumo do painel é o do tema (sem valores da pessoa)', () => {
    expect(topicBySlug(SLUG)).not.toBeNull();
    expect(topic().short).not.toMatch(/R\$|%/);
  });

  it('o guia da Evolução cita "O que é mediana?", e o nome existe na tela', () => {
    const steps = guideEntry('evolucao')!.steps.join(' ');
    expect(steps).toContain('"O que é mediana?"');
    expect(steps).toContain('abrir o tema completo em Aprender');
  });

  it('docs: a decisão D-062 cita o tema, e docs/09 lista o catálogo de 47 temas e o tema com fontes e prazo', () => {
    const decisions = readFileSync(join(DOCS, '00_VISAO_E_DECISOES.md'), 'utf8');
    expect(decisions).toMatch(/^\| D-062 \|/m);
    expect(decisions).toContain('Média e mediana');
    const learn = readFileSync(join(DOCS, '09_APRENDER.md'), 'utf8');
    expect(learn).toContain(`### \`${SLUG}\``);
    expect(learn).toContain('47 temas: 45 publicados e 2 rascunhos');
    expect(learn).toContain('20/10/2027');
    for (const url of ['17870-a-mediana', '17862-media-pagina-inicial']) expect(learn, url).toContain(url);
  });
});
