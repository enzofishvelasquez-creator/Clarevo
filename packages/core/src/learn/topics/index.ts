import { LEARN_SECTIONS } from '../sections';
import type { LearnSection, Topic, TopicCalculatorLink, TopicSlug } from '../types';
import { TOPIC_SLUGS } from '../types';
import { DUVIDAS_TOPICS } from './duvidas';
import { JUROS_TOPICS } from './juros';
import { ORGANIZAR_TOPICS } from './organizar';
import { TEMPO_TOPICS } from './tempo';
import { USAR_TOPICS } from './usar';

/** Catálogo completo (publicados e rascunhos), na ordem de TOPIC_SLUGS. */
export const TOPICS: readonly Topic[] = [...USAR_TOPICS, ...ORGANIZAR_TOPICS, ...JUROS_TOPICS, ...TEMPO_TOPICS, ...DUVIDAS_TOPICS];

const BY_SLUG = new Map<string, Topic>(TOPICS.map((t) => [t.slug, t]));
const BY_ALIAS = new Map<string, Topic>(TOPICS.flatMap((t) => (t.aliases ?? []).map((a) => [a, t] as const)));

export function isTopicSlug(value: unknown): value is TopicSlug {
  return typeof value === 'string' && (TOPIC_SLUGS as readonly string[]).includes(value);
}

/** Slug do catálogo para um slug ou apelido ("reservas" → "reserva-imprevistos"); desconhecido: null. */
export function resolveTopicSlug(slugOrAlias: string): TopicSlug | null {
  return (BY_SLUG.get(slugOrAlias) ?? BY_ALIAS.get(slugOrAlias))?.slug ?? null;
}

/** Qualquer tema do catálogo, inclusive rascunho, por slug ou apelido. Para testes e documentos, nunca para a tela. */
export function anyTopicBySlug(slugOrAlias: string): Topic | null {
  return BY_SLUG.get(slugOrAlias) ?? BY_ALIAS.get(slugOrAlias) ?? null;
}

/**
 * Tema publicado por slug ou apelido (R12). Rascunho ou desconhecido: null, e a tela mostra
 * "Este conteúdo não está disponível.". Apelido abre o tema novo.
 */
export function topicBySlug(slugOrAlias: string): Topic | null {
  const topic = anyTopicBySlug(slugOrAlias);
  return topic && topic.status === 'publicado' ? topic : null;
}

/** O tema está publicado? `TopicLink` e `TermHint` não desenham nada para rascunho (R12). */
export function isTopicPublished(slug: TopicSlug): boolean {
  return BY_SLUG.get(slug)?.status === 'publicado';
}

/** Só os publicados, na ordem do catálogo. */
export function publishedTopics(topics: readonly Topic[] = TOPICS): Topic[] {
  return topics.filter((t) => t.status === 'publicado');
}

/** As cinco seções, cada uma com os temas publicados, na ordem da tela. */
export function topicsBySection(topics: readonly Topic[] = TOPICS): { section: LearnSection; topics: Topic[] }[] {
  return LEARN_SECTIONS.map((section) => ({ section, topics: publishedTopics(topics).filter((t) => t.section === section.id) }));
}

/** Relacionados publicados de um tema, na ordem declarada; rascunhos e o próprio tema ficam fora. */
export function relatedTopics(slug: TopicSlug): Topic[] {
  const topic = BY_SLUG.get(slug);
  if (!topic) return [];
  return topic.related.filter((r) => r !== slug).flatMap((r) => (isTopicPublished(r) ? [BY_SLUG.get(r)!] : []));
}

/** Ação "Fazer a conta com os seus números" de um tema publicado; sem calculadora: null. */
export function topicCalculator(slug: TopicSlug): TopicCalculatorLink | null {
  const topic = BY_SLUG.get(slug);
  return topic && topic.status === 'publicado' && topic.calculator ? topic.calculator : null;
}
