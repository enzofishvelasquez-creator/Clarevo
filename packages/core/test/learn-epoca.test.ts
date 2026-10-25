/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COTA_UNICA_SUBTITLE,
  DEMO_TODAY,
  SEASONAL_CALENDAR,
  SEASONAL_MAX_TOPICS,
  SEASONAL_TEXT,
  TOPICS,
  TOPIC_SLUGS,
  calcPrefill,
  calculatorBySlug,
  canonicalNumber,
  guideEntry,
  expectedExampleNumbers,
  incomeTaxQuotas,
  learnReviewWarnings,
  monthlyShareCents,
  numbersInText,
  publishedTopics,
  reviewDueOn,
  seasonalCard,
  seasonalMonthOf,
  seasonalSlugs,
  seasonalTextSamples,
  thirteenthCents,
  thirteenthFirstCents,
  topicBySlug,
  topicDisplayTexts,
  topicReadingMinutes,
  topicWordCount,
  vacationPayCents,
  validateLearnCatalog,
  type Topic,
  type TopicSlug,
} from '../src';

const CORE_SRC = fileURLToPath(new URL('../src/', import.meta.url));
const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
const DOCS = fileURLToPath(new URL('../../../docs/', import.meta.url));

const EPOCA_SLUGS = ['decimo-terceiro', 'ferias', 'volta-as-aulas', 'imposto-de-renda'] as const;
const day = (month: number) => `2026-${String(month).padStart(2, '0')}-10`;
const topic = (slug: string): Topic => topicBySlug(slug)!;

describe('conteúdo de época: o calendário (D-053)', () => {
  it('cobre os 12 meses, cada um uma vez, de janeiro a dezembro', () => {
    expect(SEASONAL_CALENDAR.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('cada mês tem de 0 a 3 temas, sem repetir tema no mês; agosto e setembro ficam sem tema', () => {
    for (const m of SEASONAL_CALENDAR) {
      expect(m.slugs.length, `mês ${m.month}`).toBeLessThanOrEqual(SEASONAL_MAX_TOPICS);
      expect(new Set(m.slugs).size, `mês ${m.month}`).toBe(m.slugs.length);
    }
    expect(SEASONAL_MAX_TOPICS).toBe(3);
    expect(SEASONAL_CALENDAR.filter((m) => m.slugs.length === 0).map((m) => m.month)).toEqual([8, 9]);
  });

  it('o que cada época traz: contas do começo do ano, volta às aulas, Imposto de Renda de fevereiro a maio, férias em junho e julho e 13º de outubro a dezembro', () => {
    const slugsOf = (month: number) => [...seasonalSlugs(month)];
    expect(slugsOf(1)).toEqual(['contas-do-ano', 'volta-as-aulas']);
    expect(slugsOf(2)).toEqual(['volta-as-aulas', 'contas-do-ano', 'imposto-de-renda']);
    expect(slugsOf(3)).toEqual(['imposto-de-renda', 'volta-as-aulas']);
    expect(slugsOf(4)).toEqual(['imposto-de-renda']);
    expect(slugsOf(5)).toEqual(['imposto-de-renda']);
    expect(slugsOf(6)).toEqual(['ferias']);
    expect(slugsOf(7)).toEqual(['ferias']);
    expect(slugsOf(8)).toEqual([]);
    expect(slugsOf(9)).toEqual([]);
    for (const month of [10, 11, 12]) expect(slugsOf(month)).toEqual(['decimo-terceiro', 'contas-do-ano']);
    // Mês fora de 1 a 12 não tem tema.
    expect(slugsOf(0)).toEqual([]);
    expect(slugsOf(13)).toEqual([]);
  });

  it('todo tema citado existe no catálogo, está publicado, tem fonte externa com data de consulta e data de revisão', () => {
    const cited = new Set(SEASONAL_CALENDAR.flatMap((m) => m.slugs));
    expect(cited.size).toBe(5);
    for (const slug of cited) {
      expect(TOPIC_SLUGS as readonly string[], slug).toContain(slug);
      const t = topic(slug);
      expect(t, slug).not.toBeNull();
      expect(t.status, slug).toBe('publicado');
      expect(t.reviewedOn, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const external = t.sources.filter((s) => s.kind !== 'clarevo');
      expect(external.length, slug).toBeGreaterThan(0);
      for (const s of external) expect(s.consultedOn, `${slug}: ${s.kind === 'obra' ? s.title : s.url}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Os quatro temas de época novos estão no calendário.
    for (const slug of EPOCA_SLUGS) expect(cited.has(slug), slug).toBe(true);
  });

  it('seasonalMonthOf lê o mês da data', () => {
    expect(seasonalMonthOf('2026-10-07')).toBe(10);
    expect(seasonalMonthOf('2027-01-31')).toBe(1);
    expect(seasonalMonthOf('2026-12-01')).toBe(12);
  });
});

describe('conteúdo de época: o card "Neste mês" (D-053)', () => {
  it('na demonstração (07/10/2026), outubro: 13º salário e contas do ano, com o link da calculadora "Cota única ou parcelado?"', () => {
    expect(DEMO_TODAY).toBe('2026-10-07');
    const card = seasonalCard(DEMO_TODAY)!;
    expect(card.month).toBe(10);
    expect(card.monthName).toBe('outubro');
    expect(card.topics.map((t) => t.slug)).toEqual(['decimo-terceiro', 'contas-do-ano']);
    expect(card.topics.map((t) => t.title)).toEqual(['13º salário', 'Contas que chegam uma vez por ano']);
    expect(card.calculators).toEqual([
      {
        slug: 'parcelado-ou-a-vista',
        params: { modo: 'cota-unica' },
        title: 'Cota única ou parcelado?',
        caption: COTA_UNICA_SUBTITLE,
        fromTopic: 'contas-do-ano',
      },
    ]);
  });

  it('mês sem tema não tem card (o card some): agosto e setembro', () => {
    expect(seasonalCard('2026-08-01')).toBeNull();
    expect(seasonalCard('2026-08-31')).toBeNull();
    expect(seasonalCard('2026-09-15')).toBeNull();
  });

  it('os outros dez meses têm card com os temas do calendário, só publicados, até três, e o nome do mês', () => {
    const names = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    for (const m of SEASONAL_CALENDAR) {
      const card = seasonalCard(day(m.month));
      if (m.slugs.length === 0) {
        expect(card, `mês ${m.month}`).toBeNull();
        continue;
      }
      expect(card!.month).toBe(m.month);
      expect(card!.monthName).toBe(names[m.month - 1]);
      expect(card!.topics.map((t) => t.slug)).toEqual([...m.slugs]);
      expect(card!.topics.length).toBeLessThanOrEqual(3);
      for (const t of card!.topics) expect(t.status).toBe('publicado');
    }
    expect(seasonalCard('2027-01-02')!.topics.map((t) => t.slug)).toEqual(['contas-do-ano', 'volta-as-aulas']);
  });

  it('o card do ano seguinte é o mesmo do ano: só o mês conta', () => {
    for (const m of SEASONAL_CALENDAR) {
      const a = seasonalCard(`2026-${String(m.month).padStart(2, '0')}-05`);
      const b = seasonalCard(`2031-${String(m.month).padStart(2, '0')}-28`);
      expect(a?.topics.map((t) => t.slug)).toEqual(b?.topics.map((t) => t.slug));
    }
  });

  it('as calculadoras do card: uma por link, sem repetir, com título e legenda do catálogo', () => {
    // Janeiro, fevereiro e outubro a dezembro: "Cota única ou parcelado?" (do tema de contas do ano), uma vez só.
    for (const month of [1, 2, 10, 11, 12]) {
      const calcs = seasonalCard(day(month))!.calculators;
      expect(calcs.map((c) => c.title), `mês ${month}`).toEqual(['Cota única ou parcelado?']);
    }
    // Junho e julho: "Juntar para um objetivo", ligada ao tema de férias.
    for (const month of [6, 7]) {
      const calcs = seasonalCard(day(month))!.calculators;
      expect(calcs).toEqual([
        {
          slug: 'juntar-para-objetivo',
          params: {},
          title: 'Juntar para um objetivo',
          caption: calculatorBySlug('juntar-para-objetivo')!.subtitle,
          fromTopic: 'ferias',
        },
      ]);
    }
    // Março a maio: Imposto de Renda e volta às aulas não ligam calculadora.
    for (const month of [3, 4, 5]) expect(seasonalCard(day(month))!.calculators).toEqual([]);
    // Todo link é lido pela calculadora.
    for (const m of SEASONAL_CALENDAR)
      for (const c of seasonalCard(day(m.month))?.calculators ?? []) expect(Object.keys(calcPrefill(c.slug, c.params)).length, `${m.month}: ${c.slug}`).toBe(Object.keys(c.params).length);
  });

  it('textos do card: título "Neste mês" e legenda "Temas para outubro"', () => {
    expect(SEASONAL_TEXT.title).toBe('Neste mês');
    expect(SEASONAL_TEXT.caption('outubro')).toBe('Temas para outubro');
    expect(seasonalTextSamples()).toContain('Temas para junho');
    expect(seasonalTextSamples()).not.toContain('Temas para agosto');
  });

  it('o card não registra nada: o código do calendário não usa armazenamento, rede nem relógio', () => {
    const text = readFileSync(join(CORE_SRC, 'learn', 'epoca.ts'), 'utf8');
    for (const word of ['fetch(', 'localStorage', 'AsyncStorage', 'sessionStorage', 'XMLHttpRequest', 'Date.now', 'new Date', 'console.']) expect(text, word).not.toContain(word);
  });

  it('o app lê o card pelo dia da sessão e o desenha entre "Calculadoras" e "Comece por aqui", sem estado nem gravação', () => {
    const screen = readFileSync(join(APP_SRC, 'app', '(tabs)', 'aprender.tsx'), 'utf8');
    // O card é um componente só (D-054): Aprender e Metas o usam; o título e a legenda ficam nele.
    const card = readFileSync(join(APP_SRC, 'components', 'season-card.tsx'), 'utf8');
    expect(screen).toContain('seasonalCard(today)');
    expect(screen).toContain("import { SeasonCardView } from '@/components/season-card'");
    expect(card).toContain('SEASONAL_TEXT.title');
    expect(card).toContain('SEASONAL_TEXT.caption(card.monthName)');
    const calc = screen.indexOf('CALC_UI_TEXT.learnCardTitle');
    const season = screen.indexOf('<SeasonCardView card={season}');
    const start = screen.indexOf('{LEARN_UI_TEXT.startHere}');
    expect(calc).toBeGreaterThan(0);
    expect(season).toBeGreaterThan(calc);
    expect(start).toBeGreaterThan(season);
    expect(screen).not.toMatch(/AsyncStorage|localStorage|device-prefs/);
  });
});

describe('conteúdo de época: os quatro temas novos (D-053)', () => {
  const today = '2026-10-15';

  it('estão na seção "Organizar o mês", publicados, com revisão em 15/10/2026 e fontes consultadas nesse dia', () => {
    for (const slug of EPOCA_SLUGS) {
      const t = topic(slug);
      expect(t.section, slug).toBe('organizar');
      expect(t.kind, slug).toBe('tema');
      expect(t.reviewedOn, slug).toBe('2026-10-15');
      expect(t.sources.some((s) => s.kind === 'clarevo' && s.refs.includes('D-053')), slug).toBe(true);
      for (const s of t.sources) if (s.kind !== 'clarevo') expect(s.consultedOn, `${slug}: ${s.kind === 'obra' ? s.title : s.url}`).toBe('2026-10-15');
    }
    expect(publishedTopics().filter((t) => (EPOCA_SLUGS as readonly string[]).includes(t.slug)).length).toBe(4);
  });

  it('cada fonte externa tem endereço e o trecho (locator) que diz o que foi visto e o que não abriu', () => {
    for (const slug of EPOCA_SLUGS)
      for (const s of topic(slug).sources) {
        if (s.kind !== 'oficial') continue;
        expect(s.url.startsWith('https://'), s.url).toBe(true);
        expect(s.locator, s.url).not.toBeNull();
        expect(s.locator!.length, s.url).toBeGreaterThan(30);
        // Os sites oficiais não abrem do ambiente de trabalho: todo trecho diz que veio de resultado de busca.
        expect(s.locator!, s.url).toMatch(/resultado de busca/);
      }
  });

  it('o catálogo inteiro segue sem problema de validação, com a revisão do Imposto de Renda a cada 6 meses', () => {
    const decisions = ['D-011', 'D-029', 'D-053'];
    const own = TOPICS.filter((t) => (EPOCA_SLUGS as readonly string[]).includes(t.slug));
    // Só os quatro, com as decisões que citam; os slugs relacionados vêm do catálogo inteiro.
    const problems = validateLearnCatalog(TOPICS, { today, decisionIds: [...decisions, 'D-005', 'D-006', 'D-007', 'D-008', 'D-012', 'D-013', 'D-016', 'D-020', 'D-021', 'D-023', 'D-024', 'D-026', 'D-027', 'D-028', 'D-030', 'D-031', 'D-032', 'D-034', 'D-037', 'D-041'] });
    expect(problems.filter((p) => (EPOCA_SLUGS as readonly string[]).includes(p.slug))).toEqual([]);
    expect(own.length).toBe(4);
    expect(topic('imposto-de-renda').reviewEveryMonths).toBe(6);
    expect(reviewDueOn(topic('imposto-de-renda'))).toBe('2027-04-15');
    for (const slug of ['decimo-terceiro', 'ferias', 'volta-as-aulas']) {
      expect(topic(slug).reviewEveryMonths, slug).toBe(12);
      expect(reviewDueOn(topic(slug)), slug).toBe('2027-10-15');
    }
    // O aviso de revisão do Imposto de Renda começa 30 dias antes (16/03/2027), a tempo de ver o calendário do ano.
    expect(learnReviewWarnings(TOPICS, '2027-03-15').map((w) => w.slug)).not.toContain('imposto-de-renda');
    expect(learnReviewWarnings(TOPICS, '2027-03-16').map((w) => w.slug)).toContain('imposto-de-renda');
  });

  it('leitura de no máximo 2 minutos e 320 palavras; nenhum texto sem hipóteses fictícias', () => {
    for (const slug of EPOCA_SLUGS) {
      const t = topic(slug);
      expect(topicReadingMinutes(t), slug).toBeLessThanOrEqual(2);
      expect(topicWordCount(t), slug).toBeLessThanOrEqual(320);
      expect(t.hypotheses, slug).toMatch(/fict[ií]ci/i);
      expect(t.example, slug).not.toBeNull();
      expect(t.calculation, slug).not.toBeNull();
    }
  });

  it('13º salário: R$ 3.000,00 e 7 meses = R$ 1.750,00; primeira parcela R$ 1.500,00, segunda R$ 1.500,00', () => {
    const t = topic('decimo-terceiro');
    expect(thirteenthCents(300_000, 7)).toBe(175_000);
    expect(thirteenthFirstCents(300_000)).toBe(150_000);
    for (const n of ['R$ 3.000,00', 'R$ 1.500,00', 'R$ 250,00', 'R$ 1.750,00']) expect(t.example, n).toContain(n);
    for (const n of ['3.000,00 ÷ 2 = 1.500,00', '3.000,00 − 1.500,00 = 1.500,00', '3.000,00 ÷ 12 = 250,00', '250,00 × 7 = 1.750,00']) expect(t.calculation, n).toContain(n);
    const expected = expectedExampleNumbers('decimo-terceiro');
    for (const n of [300_000, 150_000, 25_000, 175_000]) expect(expected.has(`R$:${n}`), String(n)).toBe(true);
  });

  it('13º salário: prazos da lei no texto (30 de novembro e 20 de dezembro), os descontos só mandam conferir o contracheque e "confira" o ano', () => {
    const text = topicDisplayTexts(topic('decimo-terceiro')).join(' ');
    expect(text).toContain('30 de novembro');
    expect(text).toContain('20 de dezembro');
    expect(text).toContain('1/12 da remuneração por mês de serviço');
    expect(text).toContain('15 dias ou mais conta como mês inteiro');
    // Quando cada desconto incide não tem fonte conferida: o texto manda conferir o contracheque e não afirma o momento.
    expect(text).toContain('Confira no contracheque quais descontos incidem em cada parcela');
    expect(text).toContain('Confira os descontos de cada parcela no contracheque');
    expect(text).not.toMatch(/sai sem desconto|sem tributos|Na segunda entram|ficam na segunda|só na segunda/i);
    expect(text).toContain('Confira os prazos do ano');
    // Sem número de faixa, alíquota ou tabela: o app só explica e não calcula imposto.
    expect(numbersInText(text).filter((n) => !n.startsWith('R$'))).toEqual([]);
    expect(text).toContain('A Clarevo não calcula os descontos');
  });

  it('férias: R$ 3.000,00 mais um terço (R$ 1.000,00) = R$ 4.000,00; liga "Juntar para um objetivo"', () => {
    const t = topic('ferias');
    expect(vacationPayCents(300_000)).toEqual({ baseCents: 300_000, thirdCents: 100_000, totalCents: 400_000 });
    for (const n of ['R$ 3.000,00', 'R$ 1.000,00', 'R$ 4.000,00']) expect(t.example, n).toContain(n);
    expect(t.calculator).toEqual({ slug: 'juntar-para-objetivo', params: {} });
    const text = topicDisplayTexts(t).join(' ');
    for (const part of ['30 dias corridos', 'pelo menos um terço', 'até dois dias antes do início', 'abono pecuniário', 'até 15 dias antes do fim do período aquisitivo', 'até três períodos', 'pelo menos 14 dias corridos', 'pedir em janeiro'])
      expect(text, part).toContain(part);
  });

  it('volta às aulas: R$ 14.400,00 em 12 parcelas = R$ 1.200,00; com R$ 600,00 de material, R$ 1.800,00', () => {
    const t = topic('volta-as-aulas');
    const parcel = monthlyShareCents(1_440_000, 12);
    expect(parcel).toBe(120_000);
    expect(parcel + 60_000).toBe(180_000);
    for (const n of ['R$ 14.400,00', 'R$ 1.200,00', 'R$ 600,00', 'R$ 1.800,00']) expect(t.example, n).toContain(n);
    // Os números do texto são os calculados pelas funções do core (os mesmos que o validador do catálogo confere).
    const expected = expectedExampleNumbers('volta-as-aulas');
    for (const n of [1_440_000, parcel, 60_000, parcel + 60_000]) expect(expected.has(`R$:${n}`), String(n)).toBe(true);
    for (const n of numbersInText(`${t.example} ${t.calculation}`)) expect(expected.has(canonicalNumber(n)!), n).toBe(true);
    const text = topicDisplayTexts(t).join(' ');
    for (const part of ['12 parcelas mensais iguais', '45 dias antes do fim do prazo de matrícula', 'itens de uso coletivo', 'Lei 12.886/2013', 'Procons'])
      expect(text, part).toContain(part);
    // A lei e os Procons estão entre as fontes.
    const urls = t.sources.flatMap((s) => (s.kind === 'clarevo' || s.kind === 'obra' ? [] : [s.url]));
    expect(urls.some((u) => u.includes('lei-9870'))).toBe(true);
    expect(urls.some((u) => u.includes('lei-12886'))).toBe(true);
    expect(urls.some((u) => u.includes('procon'))).toBe(true);
  });

  it('Imposto de Renda: R$ 1.200,00 em 8 quotas de R$ 150,00; os limites de norma estão nos fatos, com a fonte certa', () => {
    const t = topic('imposto-de-renda');
    expect(incomeTaxQuotas(120_000, 8)).toEqual(Array(8).fill(15_000));
    for (const n of ['R$ 1.200,00', 'R$ 150,00', 'R$ 50,00']) expect(t.example, n).toContain(n);
    const facts = Object.fromEntries(t.facts.map((f) => [f.text, f.source]));
    expect(Object.keys(facts).sort()).toEqual(['1%', '20%', 'R$ 100,00', 'R$ 165,74', 'R$ 50,00']);
    const title = (i: number) => {
      const s = t.sources[i]!;
      return s.kind === 'clarevo' ? '' : s.kind === 'obra' ? s.title : s.title;
    };
    for (const f of ['1%', '20%', 'R$ 165,74']) expect(title(facts[f]!), f).toBe('Multa por Atraso (Meu Imposto de Renda)');
    for (const f of ['R$ 50,00', 'R$ 100,00']) expect(title(facts[f]!), f).toBe('Perguntas e Respostas IRPF 2026');
    // Todo "R$" e todo "%" do texto está entre os números do exemplo e os fatos.
    const allowed = expectedExampleNumbers('imposto-de-renda');
    for (const f of t.facts) allowed.add(canonicalNumber(f.text)!);
    for (const text of topicDisplayTexts(t)) for (const n of numbersInText(text)) expect(allowed.has(canonicalNumber(n)!), n).toBe(true);
  });

  it('Imposto de Renda: o prazo de 2026 vem com fonte e o texto manda conferir a data oficial do ano; nada de data do ano seguinte', () => {
    const t = topic('imposto-de-renda');
    const text = topicDisplayTexts(t).join(' ');
    expect(text).toContain('em 2026, o prazo foi de 23 de março a 29 de maio');
    expect(text).toContain('Confira a data oficial do ano no site da Receita');
    expect(text).not.toMatch(/2027|2028/);
    const first = t.sources[0]!;
    expect(first.kind).toBe('oficial');
    if (first.kind === 'oficial') {
      expect(first.url).toContain('23-de-marco');
      expect(first.url).toContain('29-de-maio');
      expect(first.locator).toContain('de 23 de março a 29 de maio');
    }
    // O Clarevo não calcula nem entrega a declaração.
    expect(text).toContain('A Clarevo não calcula nem entrega a declaração');
  });

  it('toda data com dia e mês e todo ano escrito nos textos aparece no trecho de alguma fonte do tema (nada de data sem fonte)', () => {
    const months = 'janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
    for (const slug of EPOCA_SLUGS) {
      const t = topic(slug);
      const evidence = t.sources
        .map((s) => (s.kind === 'clarevo' ? '' : `${s.title} ${s.locator ?? ''} ${s.kind === 'obra' ? '' : s.url}`))
        .join(' ')
        .toLowerCase();
      const urlText = evidence.replace(/-/g, ' ');
      const display = topicDisplayTexts(t).join(' ');
      for (const m of display.matchAll(new RegExp(`\\b(\\d{1,2}) de (${months})\\b`, 'gi'))) {
        const [, d, mo] = m;
        // "30 de novembro" no texto ↔ "30 de novembro" no trecho; "23 de março" ↔ "23 de março" no trecho (com acento) ou 23/03.
        const asText = `${d} de ${mo}`.toLowerCase();
        const monthNumber = String(['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'].indexOf(mo!.toLowerCase()) + 1).padStart(2, '0');
        const asSlash = `${String(d).padStart(2, '0')}/${monthNumber}`;
        expect(evidence.includes(asText) || evidence.includes(asSlash) || urlText.includes(`${d} de ${mo!.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()}`), `${slug}: ${m[0]}`).toBe(true);
      }
      for (const m of display.matchAll(/\b(20\d{2})\b/g)) expect(evidence, `${slug}: ${m[1]}`).toContain(m[1]!);
    }
  });

  it('não recomendam produto financeiro nem oferta de crédito, e não pedem dado pessoal', () => {
    for (const slug of EPOCA_SLUGS) {
      const text = topicDisplayTexts(topic(slug)).join(' ').toLowerCase();
      for (const word of ['empréstimo', 'financiamento', 'cartão de crédito', 'consignado', 'investimento', 'tesouro', 'cdb', 'poupança', 'antecipe', 'antecipação do 13', 'cpf', 'senha']) expect(text, `${slug}: ${word}`).not.toContain(word);
    }
  });

  it('os temas relacionados dos quatro são publicados, e os de época se ligam entre si', () => {
    expect(topic('decimo-terceiro').related).toEqual(['ferias', 'imposto-de-renda', 'contas-do-ano']);
    expect(topic('ferias').related).toEqual(['decimo-terceiro', 'reserva-imprevistos']);
    expect(topic('volta-as-aulas').related).toEqual(['contas-do-ano', 'gasto-fixo-variavel', 'parcelado-ou-a-vista']);
    expect(topic('imposto-de-renda').related).toEqual(['decimo-terceiro', 'selic', 'contas-do-ano']);
    for (const slug of EPOCA_SLUGS) for (const r of topic(slug).related) expect(topicBySlug(r), `${slug} → ${r}`).not.toBeNull();
  });

  it('a busca de Aprender acha os quatro por palavras comuns (13º, férias, matrícula e imposto de renda)', async () => {
    const { searchTopics } = await import('../src');
    const first = (q: string) => searchTopics(q)?.map((t) => t.slug) ?? [];
    expect(first('décimo terceiro')[0]).toBe('decimo-terceiro');
    expect(first('13o salário')).toContain('decimo-terceiro');
    expect(first('férias')[0]).toBe('ferias');
    expect(first('abono pecuniário')[0]).toBe('ferias');
    expect(first('material escolar')).toEqual(expect.arrayContaining(['volta-as-aulas', 'contas-do-ano']));
    expect(first('volta às aulas')[0]).toBe('volta-as-aulas');
    expect(first('imposto de renda')[0]).toBe('imposto-de-renda');
    expect(first('declaração')).toContain('imposto-de-renda');
    expect(first('informe de rendimentos')[0]).toBe('imposto-de-renda');
  });

  it('o calendário é só um dado: nenhum tema de época fora do catálogo e a ordem do catálogo põe os quatro depois de "essenciais" e de "Média e mediana" (Ciclo W, D-062)', () => {
    const i = TOPIC_SLUGS.indexOf('essenciais');
    expect(TOPIC_SLUGS[i + 1]).toBe('media-e-mediana');
    expect(TOPIC_SLUGS.slice(i + 2, i + 6)).toEqual([...EPOCA_SLUGS]);
    for (const m of SEASONAL_CALENDAR) for (const slug of m.slugs as readonly TopicSlug[]) expect(TOPIC_SLUGS).toContain(slug);
  });

  it('o guia (D-049) descreve o card com os mesmos meses do calendário e continua com no máximo seis passos', () => {
    const entry = guideEntry('aprender')!;
    expect(entry.steps.length).toBeLessThanOrEqual(6);
    const step = entry.steps.find((x) => x.includes('"Neste mês"'))!;
    expect(step).toContain('Imposto de Renda de fevereiro a maio');
    expect(step).toContain('férias em junho e julho');
    expect(step).toContain('O card some nos meses sem tema.');
    const monthsOf = (slug: string) => SEASONAL_CALENDAR.filter((m) => (m.slugs as readonly string[]).includes(slug)).map((m) => m.month);
    expect(monthsOf('imposto-de-renda')).toEqual([2, 3, 4, 5]);
    expect(monthsOf('ferias')).toEqual([6, 7]);
    expect(monthsOf('decimo-terceiro')).toEqual([10, 11, 12]);
    expect(monthsOf('contas-do-ano')).toEqual([1, 2, 10, 11, 12]);
    expect(monthsOf('volta-as-aulas')).toEqual([1, 2, 3]);
    expect(entry.where).toEqual(['Aprender']);
  });

  it('docs: a decisão D-053 está registrada e o catálogo de docs/09 lista os quatro temas', () => {
    const decisions = readFileSync(join(DOCS, '00_VISAO_E_DECISOES.md'), 'utf8');
    expect(decisions).toMatch(/^\| D-053 \|/m);
    const learn = readFileSync(join(DOCS, '09_APRENDER.md'), 'utf8');
    for (const slug of EPOCA_SLUGS) {
      expect(learn, slug).toContain(`\`${slug}\``);
      expect(learn, slug).toContain(`### \`${slug}\``);
    }
  });
});
