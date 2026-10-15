import { COTA_UNICA_SUBTITLE, calcTitle, calculatorBySlug, type CalcSlug } from '../calculators/catalog';
import type { IsoDate } from '../dates';
import { formatMonthName } from '../dates';
import { topicBySlug } from './topics';
import type { Topic, TopicSlug } from './types';
import { SEASONAL_TEXT } from './ui-text';

/**
 * Conteúdo de época (Ciclo K2, D-053): o calendário fixo que diz quais temas de Aprender aparecem no card "Neste mês", no topo
 * da lista de temas. Só lê a data de hoje: nada é registrado (nem o que a pessoa abre), não há notificação e o conteúdo vem
 * do catálogo do aparelho, igual para todas as pessoas.
 *
 * Cada mês tem de 0 a 3 temas do catálogo, na ordem em que aparecem. Mês sem tema fica sem card. Todo tema citado existe, está
 * publicado e tem fonte e data de revisão (conferido em `learn-epoca.test.ts`); o que depende do ano (prazo do Imposto de Renda,
 * IPVA e IPTU de cada estado e município) é dito no tema com "confira a data oficial do ano" e o link da fonte.
 */
export interface SeasonalMonth {
  /** 1 (janeiro) a 12 (dezembro). */
  month: number;
  slugs: readonly TopicSlug[];
}

/** O card mostra no máximo três temas. */
export const SEASONAL_MAX_TOPICS = 3;

/**
 * Os doze meses. Janeiro e fevereiro: contas que chegam no começo do ano (IPVA, IPTU, matrícula e material escolar) e volta às
 * aulas; fevereiro a maio: Imposto de Renda (o informe de rendimentos sai até o fim de fevereiro; o prazo costuma terminar em
 * maio); junho e julho: férias; outubro a dezembro: 13º salário e as contas que chegam no começo do ano seguinte. Agosto e
 * setembro ficam sem tema.
 */
export const SEASONAL_CALENDAR: readonly SeasonalMonth[] = [
  { month: 1, slugs: ['contas-do-ano', 'volta-as-aulas'] },
  { month: 2, slugs: ['volta-as-aulas', 'contas-do-ano', 'imposto-de-renda'] },
  { month: 3, slugs: ['imposto-de-renda', 'volta-as-aulas'] },
  { month: 4, slugs: ['imposto-de-renda'] },
  { month: 5, slugs: ['imposto-de-renda'] },
  { month: 6, slugs: ['ferias'] },
  { month: 7, slugs: ['ferias'] },
  { month: 8, slugs: [] },
  { month: 9, slugs: [] },
  { month: 10, slugs: ['decimo-terceiro', 'contas-do-ano'] },
  { month: 11, slugs: ['decimo-terceiro', 'contas-do-ano'] },
  { month: 12, slugs: ['decimo-terceiro', 'contas-do-ano'] },
];

/** Calculadora ligada a um tema do mês, pronta para a linha do card. */
export interface SeasonalCalculator {
  slug: CalcSlug;
  params: Readonly<Record<string, string>>;
  /** "Cota única ou parcelado?". */
  title: string;
  /** Legenda da calculadora. */
  caption: string;
  /** Tema do mês que ligou a calculadora. */
  fromTopic: TopicSlug;
}

/** O card "Neste mês" de um dia: o mês, os temas publicados e as calculadoras ligadas a eles. */
export interface SeasonalCard {
  month: number;
  /** "outubro". */
  monthName: string;
  topics: Topic[];
  calculators: SeasonalCalculator[];
}

/** Mês (1 a 12) de uma data "AAAA-MM-DD". */
export function seasonalMonthOf(date: IsoDate): number {
  return Number(date.slice(5, 7));
}

/** Slugs do calendário para um mês de 1 a 12, na ordem do card; mês fora disso: lista vazia. */
export function seasonalSlugs(month: number): readonly TopicSlug[] {
  return SEASONAL_CALENDAR.find((m) => m.month === month)?.slugs ?? [];
}

/**
 * O card "Neste mês" para o dia de hoje, ou `null` quando o mês não tem tema publicado (o card some). Tema em rascunho fica
 * de fora. Uma calculadora ligada por mais de um tema aparece uma vez só.
 */
export function seasonalCard(today: IsoDate): SeasonalCard | null {
  const month = seasonalMonthOf(today);
  const topics = seasonalSlugs(month).flatMap((slug) => {
    const topic = topicBySlug(slug);
    return topic ? [topic] : [];
  });
  if (topics.length === 0) return null;
  const calculators: SeasonalCalculator[] = [];
  for (const topic of topics) {
    const link = topic.calculator;
    if (!link) continue;
    const key = `${link.slug}?${new URLSearchParams(link.params as Record<string, string>).toString()}`;
    if (calculators.some((c) => `${c.slug}?${new URLSearchParams(c.params as Record<string, string>).toString()}` === key)) continue;
    const info = calculatorBySlug(link.slug);
    if (!info) continue;
    const cotaUnica = link.slug === 'parcelado-ou-a-vista' && link.params.modo === 'cota-unica';
    calculators.push({
      slug: link.slug,
      params: link.params,
      title: calcTitle(link.slug, link.params.modo),
      caption: cotaUnica ? COTA_UNICA_SUBTITLE : info.subtitle,
      fromTopic: topic.slug,
    });
  }
  return { month, monthName: formatMonthName(`2000-${String(month).padStart(2, '0')}`), topics, calculators };
}

/** Textos do card com entradas de exemplo, para o teste de textos. */
export function seasonalTextSamples(): string[] {
  const out: string[] = [SEASONAL_TEXT.title];
  for (const m of SEASONAL_CALENDAR) {
    const card = seasonalCard(`2026-${String(m.month).padStart(2, '0')}-10`);
    if (card) out.push(SEASONAL_TEXT.caption(card.monthName), ...card.calculators.flatMap((c) => [c.title, c.caption]));
  }
  return out;
}
