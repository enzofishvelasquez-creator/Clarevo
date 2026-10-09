import type { Topic } from './types';

/** Palavras por minuto do tempo de leitura (D-032(4)). */
export const READING_WORDS_PER_MINUTE = 200;
/** Limite de palavras por tema: título, subtítulo, parágrafos e exemplo (R3). */
export const TOPIC_MAX_WORDS = 320;

/** Palavras de um texto: sequências separadas por espaço que têm ao menos uma letra ou um número. */
export function wordCount(text: string): number {
  return text
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Palavras que contam para o tempo de leitura e para R3: título, subtítulo, parágrafos e exemplo. */
export function topicWordCount(topic: Pick<Topic, 'title' | 'subtitle' | 'paragraphs' | 'example'>): number {
  return [topic.title, topic.subtitle ?? '', ...topic.paragraphs, topic.example ?? ''].reduce((n, t) => n + wordCount(t), 0);
}

/** Tempo de leitura em minutos, calculado e nunca digitado (R4): max(1, ⌈palavras ÷ 200⌉). 150 → 1; 201 e 320 → 2. */
export function readingMinutes(words: number): number {
  if (!Number.isSafeInteger(words) || words < 0) throw new RangeError(`palavras inválidas: ${words}`);
  return Math.max(1, Math.ceil(words / READING_WORDS_PER_MINUTE));
}

/** Tempo de leitura de um tema, em minutos. */
export function topicReadingMinutes(topic: Pick<Topic, 'title' | 'subtitle' | 'paragraphs' | 'example'>): number {
  return readingMinutes(topicWordCount(topic));
}
