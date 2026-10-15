import { alreadyNotedLeftOut, type ReviewLine } from './revisao';
import type { ImportDestination, ImportItem, ImportResult } from './tipos';

/**
 * A conta de uma importação em lotes (D-048), sem tela e sem rede. A tela manda os lotes um a um; se um falha no meio, o que já
 * entrou fica, e o resumo final ("18 lançamentos importados, 4 já estavam anotados.") precisa somar tudo sem contar nenhuma linha
 * duas vezes: o que o banco criou e pulou em cada tentativa e as linhas "Já anotado" que ficaram de fora da seleção.
 */

/** Uma tentativa: os lotes do conteúdo de agora e o resultado dos que já foram gravados, por posição. */
export interface ImportAttempt {
  /** Resume o conteúdo (destino, alvo e itens): repetir a tentativa com o mesmo conteúdo repete as mesmas chaves de operação. */
  snapshot: string;
  /** Prefixo das chaves de operação dos lotes (`<base>-<posição>`). */
  base: string;
  results: ImportResult[];
  chunks: ImportItem[][];
}

/** O que tentativas anteriores já gravaram e a conta de tudo: criados, pulados e as chaves das linhas dos lotes gravados. */
export interface ImportTally {
  created: number;
  skipped: number;
  sentKeys: ReadonlySet<string>;
}

export const EMPTY_TALLY: ImportTally = { created: 0, skipped: 0, sentKeys: new Set() };

/** Resumo do conteúdo de uma tentativa. */
export function attemptSnapshot(destination: ImportDestination, targetId: string, items: readonly ImportItem[]): string {
  return JSON.stringify([destination, targetId, items.map((i) => [i.importKey, i.description, i.category, i.amountCents, i.occurredOn, i.kind])]);
}

/** Quantas linhas os lotes já gravados de uma tentativa levavam, e quantas ela levava no total. */
export function attemptProgress(attempt: Pick<ImportAttempt, 'results' | 'chunks'>): { sent: number; total: number } {
  const size = (chunks: readonly ImportItem[][]) => chunks.reduce((n, c) => n + c.length, 0);
  return { sent: size(attempt.chunks.slice(0, attempt.results.length)), total: size(attempt.chunks) };
}

/**
 * Guarda no total o que os lotes já gravados de uma tentativa criaram e pularam, e as chaves das linhas deles; usada quando a
 * tentativa é abandonada (a revisão é refeita depois de uma recusa, ou a pessoa mudou as linhas depois de uma falha de rede).
 */
export function bankAttempt(tally: ImportTally, attempt: Pick<ImportAttempt, 'results' | 'chunks'>): ImportTally {
  const sentKeys = new Set(tally.sentKeys);
  for (const chunk of attempt.chunks.slice(0, attempt.results.length)) for (const item of chunk) sentKeys.add(item.importKey);
  return {
    created: tally.created + attempt.results.reduce((n, r) => n + r.created, 0),
    skipped: tally.skipped + attempt.results.reduce((n, r) => n + r.skipped, 0),
    sentKeys,
  };
}

/**
 * O resumo da importação concluída: criados e pulados de todas as tentativas, mais as linhas "Já anotado" deixadas de fora da
 * seleção. As linhas que lotes já gravados enviaram não entram na conta das deixadas de fora: elas viram "Já anotado" quando a
 * revisão é refeita, mas o banco já as contou como criadas (ou puladas).
 */
export function importSummaryOf(tally: ImportTally, finalAttempt: Pick<ImportAttempt, 'results' | 'chunks'>, lines: readonly ReviewLine[]): ImportResult {
  const total = bankAttempt(tally, finalAttempt);
  return { created: total.created, skipped: total.skipped + alreadyNotedLeftOut(lines, total.sentKeys) };
}
