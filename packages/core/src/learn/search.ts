import { TOPICS, publishedTopics } from './topics';
import type { Topic } from './types';

/**
 * Busca de Aprender (spec3 §3.11), toda no aparelho: nenhum termo buscado sai do app nem fica guardado (R11).
 *
 * - Normalização: sem acentos (NFD), minúsculas; o que não é letra ou número vira espaço.
 * - Palavras vazias saem; o "s" final sai de palavras com 4 letras ou mais, nos dois lados ("parcelas" → "parcela").
 * - Palavra buscada com 3 letras ou mais casa com o início de uma palavra do tema; com menos de 3, só igual.
 * - Pesos por campo: título 8, dúvida 6, palavras-chave 6, subtítulo 4, resumo 2, parágrafos 1.
 * - Todas as palavras buscadas precisam casar; ordem pela pontuação e depois pelo catálogo.
 */
export const SEARCH_STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'o',
  'as',
  'os',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'um',
  'uma',
  'que',
  'para',
  'por',
  'com',
  'meu',
  'minha',
  'meus',
  'minhas',
  'como',
  'qual',
  'se',
  'ao',
]);

export const SEARCH_WEIGHTS = { title: 8, question: 6, keywords: 6, subtitle: 4, short: 2, paragraphs: 1 } as const;

/** Texto em palavras normalizadas, sem as palavras vazias: "Quanto é o IOF?" → ["quanto", "iof"]. */
export function searchWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w !== '' && !SEARCH_STOPWORDS.has(w))
    .map((w) => (w.length >= 4 && w.endsWith('s') ? w.slice(0, -1) : w));
}

function matches(queryWord: string, words: readonly string[]): boolean {
  return queryWord.length >= 3 ? words.some((w) => w.startsWith(queryWord)) : words.includes(queryWord);
}

interface Indexed {
  topic: Topic;
  order: number;
  fields: { weight: number; words: string[] }[];
}

function indexTopic(topic: Topic, order: number): Indexed {
  return {
    topic,
    order,
    fields: [
      { weight: SEARCH_WEIGHTS.title, words: searchWords(topic.title) },
      { weight: SEARCH_WEIGHTS.question, words: searchWords(topic.question ?? '') },
      { weight: SEARCH_WEIGHTS.keywords, words: searchWords(topic.keywords.join(' ')) },
      { weight: SEARCH_WEIGHTS.subtitle, words: searchWords(topic.subtitle ?? '') },
      { weight: SEARCH_WEIGHTS.short, words: searchWords(topic.short) },
      { weight: SEARCH_WEIGHTS.paragraphs, words: searchWords(topic.paragraphs.join(' ')) },
    ],
  };
}

const CATALOG_ORDER = new Map(TOPICS.map((t, i) => [t.slug, i]));

/**
 * Temas publicados que casam com a busca, do mais ao menos relevante. Sem palavra útil ("", "de"): null, e a tela
 * mostra a lista completa. Nenhum resultado: [].
 */
export function searchTopics(query: string, topics: readonly Topic[] = TOPICS): Topic[] | null {
  const words = [...new Set(searchWords(query))];
  if (words.length === 0) return null;
  const scored: { topic: Topic; score: number; order: number }[] = [];
  for (const item of publishedTopics(topics).map((t, i) => indexTopic(t, CATALOG_ORDER.get(t.slug) ?? 1_000 + i))) {
    let score = 0;
    let all = true;
    for (const q of words) {
      const hit = item.fields.reduce((sum, f) => sum + (matches(q, f.words) ? f.weight : 0), 0);
      if (hit === 0) {
        all = false;
        break;
      }
      score += hit;
    }
    if (all) scored.push({ topic: item.topic, score, order: item.order });
  }
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.topic);
}
