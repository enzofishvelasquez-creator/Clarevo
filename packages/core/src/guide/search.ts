import { searchWords } from '../learn/search';
import { GUIDE_ENTRIES } from './catalog';
import type { GuideEntry } from './types';

/** Quantas entradas do guia o grupo "Como usar" da busca de Aprender mostra no máximo. */
export const GUIDE_SEARCH_LIMIT = 5;

/** Peso por campo: título 8 e palavras de busca 6 (o texto dos passos não entra). */
const GUIDE_WEIGHTS = { title: 8, keywords: 6 } as const;

function matches(queryWord: string, words: readonly string[]): boolean {
  return queryWord.length >= 3 ? words.some((w) => w.startsWith(queryWord)) : words.includes(queryWord);
}

/**
 * Entradas do guia que casam com a busca de Aprender, da mais à menos relevante (empate: ordem do catálogo). Mesma normalização
 * dos temas e das telas do app (sem acentos, minúsculas, palavras vazias fora, plural simples); todas as palavras precisam casar.
 * Sem palavra útil: []. Nada é gravado: é uma conta sobre texto fixo, no aparelho.
 */
export function searchGuide(query: string, entries: readonly GuideEntry[] = GUIDE_ENTRIES, limit: number = GUIDE_SEARCH_LIMIT): GuideEntry[] {
  const words = [...new Set(searchWords(query))];
  if (words.length === 0) return [];
  const scored: { entry: GuideEntry; score: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const fields = [
      { weight: GUIDE_WEIGHTS.title, words: searchWords(entry.title) },
      { weight: GUIDE_WEIGHTS.keywords, words: searchWords(entry.keywords.join(' ')) },
    ];
    let score = 0;
    for (const q of words) {
      const hit = fields.reduce((sum, f) => sum + (matches(q, f.words) ? f.weight : 0), 0);
      if (hit === 0) return;
      score += hit;
    }
    scored.push({ entry, score, order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.entry);
}
