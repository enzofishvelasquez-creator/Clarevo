import { daysBetween, type IsoDate } from '../dates';
import { sha256Hex } from '../sha256';
import type { ParsedLine } from './tipos';

/**
 * Chave de cada linha importada (`import_key`) e a marca "Já anotado". A chave é um resumo SHA-256 calculado no aparelho a partir
 * da conta ou do cartão e do que identifica a linha; o banco só guarda o resumo (64 hexadecimais), nunca o texto da linha nem o
 * identificador do arquivo. A mesma linha em outro arquivo (por exemplo, um extrato que repete dias já importados) dá a mesma chave.
 */

/** Descrição sem acento, em minúsculas, só com letras e números separados por um espaço. */
export function normalizeDescription(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Palavras que aparecem em quase toda linha de banco e não dizem de que lançamento se trata. */
const FILLER = new Set([
  'compra', 'compras', 'debito', 'credito', 'pagamento', 'pagto', 'pgto', 'pix', 'transferencia', 'transf', 'recebida', 'recebido',
  'enviada', 'enviado', 'cartao', 'online', 'line', 'em', 'de', 'da', 'do', 'das', 'dos', 'no', 'na', 'com', 'por', 'para', 'ltda',
  'sa', 'epp', 'cia', 'ted', 'doc', 'saque', 'tarifa', 'parcela', 'lancamento', 'deb', 'cred', 'aut', 'automatico', 'conta',
]);

/** Palavras que distinguem a linha: só letras, de 3 caracteres ou mais, sem as palavras comuns de banco. */
export function descriptionTokens(text: string): string[] {
  return normalizeDescription(text)
    .split(' ')
    .filter((w) => w.length >= 3 && /^[a-z]+$/.test(w) && !FILLER.has(w));
}

function sameToken(a: string, b: string): boolean {
  return a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
}

/**
 * Duas descrições parecem ser do mesmo lançamento: dividem ao menos metade das palavras da menor (só letras, sem as comuns de
 * banco, e uma palavra pode ser o começo da outra) ou uma contém a outra. Sem palavras úteis, só o texto igual vale.
 */
export function similarDescriptions(a: string, b: string): boolean {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (na === '' || nb === '') return false;
  if (na === nb) return true;
  const ta = descriptionTokens(a);
  const tb = descriptionTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if ((na.length >= 4 && nb.includes(na)) || (nb.length >= 4 && na.includes(nb))) return true;
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const shared = small.filter((w) => big.some((x) => sameToken(w, x))).length;
  return shared / small.length >= 0.5;
}

/** Quantas linhas iguais (mesmo identificador, ou mesmos dia, valor e descrição) vieram antes desta no arquivo: 0 para a primeira. */
export function occurrences(lines: readonly Pick<ParsedLine, 'date' | 'amountCents' | 'description' | 'fitId'>[]): number[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const id = l.fitId ? `f|${l.fitId}|${l.date}|${l.amountCents}` : `d|${l.date}|${l.amountCents}|${normalizeDescription(l.description)}`;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n;
  });
}

/** As chaves de todas as linhas lidas, na ordem do arquivo (para perguntar ao banco quais já foram importadas). */
export function importKeys(targetId: string, lines: readonly Pick<ParsedLine, 'date' | 'amountCents' | 'description' | 'fitId'>[]): string[] {
  const occ = occurrences(lines);
  return lines.map((l, i) => importKey(targetId, l, occ[i]!));
}

/**
 * import_key da linha: SHA-256 de "imp1|destino|..." com o identificador do arquivo (FITID), o dia e o valor, ou, sem
 * identificador, dia, valor, descrição normalizada e ordem entre as iguais. O identificador sozinho não basta: alguns bancos
 * recomeçam a numeração a cada arquivo, e dois lançamentos diferentes não podem virar o mesmo. `targetId` é a conta ou o cartão.
 */
export function importKey(targetId: string, line: Pick<ParsedLine, 'date' | 'amountCents' | 'description' | 'fitId'>, occurrence: number): string {
  const base = line.fitId
    ? `imp1|${targetId}|f|${line.fitId}|${line.date}|${line.amountCents}|${occurrence}`
    : `imp1|${targetId}|d|${line.date}|${line.amountCents}|${normalizeDescription(line.description)}|${occurrence}`;
  return sha256Hex(base);
}

/** Um registro que já existe na conta (gasto ou recebimento) ou no cartão (compra ou estorno), para a marca "Já anotado". */
export interface ExistingEntry {
  date: IsoDate;
  /** Positivo; o tipo diz se saiu ou entrou. */
  amountCents: number;
  description: string;
  kind: 'despesa' | 'receita' | 'compra' | 'estorno';
}

export const DUPLICATE_WINDOW_DAYS = 3;

/**
 * Quais linhas parecem já anotadas: existe um registro do mesmo tipo e do mesmo valor, com dia a até 3 dias de diferença e
 * descrição parecida. Cada registro existente cobre uma linha só (duas compras iguais no mesmo dia, com um registro, marcam uma),
 * a mais próxima no dia primeiro.
 */
export function findLookalikes(
  lines: readonly { date: IsoDate; amountCents: number; description: string; kind: ExistingEntry['kind'] }[],
  existing: readonly ExistingEntry[],
): boolean[] {
  const pairs: { line: number; entry: number; gap: number }[] = [];
  lines.forEach((l, i) => {
    existing.forEach((e, j) => {
      if (e.kind !== l.kind || e.amountCents !== l.amountCents) return;
      const gap = Math.abs(daysBetween(e.date, l.date));
      if (gap > DUPLICATE_WINDOW_DAYS || !similarDescriptions(e.description, l.description)) return;
      pairs.push({ line: i, entry: j, gap });
    });
  });
  pairs.sort((a, b) => a.gap - b.gap || a.line - b.line || a.entry - b.entry);
  const flagged: boolean[] = lines.map(() => false);
  const used = new Set<number>();
  for (const p of pairs) {
    if (flagged[p.line] || used.has(p.entry)) continue;
    flagged[p.line] = true;
    used.add(p.entry);
  }
  return flagged;
}
