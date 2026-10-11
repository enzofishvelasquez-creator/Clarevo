import {
  existingMonths,
  importKeys,
  type Card,
  type ExistingEntry,
  type ImportDestination,
  type ImportParse,
  type IsoMonth,
  type RecordsRepository,
} from '@clarevo/core';

/**
 * O que o banco já tem e a revisão precisa para marcar "Já anotado" e as faturas pagas (D-048): as chaves do arquivo que já foram
 * importadas e os registros (da conta) ou compras (do cartão) perto das datas do arquivo. Só leitura.
 */
export interface ImportContext {
  existing: ExistingEntry[];
  importedKeys: Set<string>;
  paidMonths: Set<IsoMonth>;
}

export async function loadImportContext(
  repo: RecordsRepository,
  contextId: string,
  destination: ImportDestination,
  targetId: string,
  parse: ImportParse,
  card: Pick<Card, 'id'> | null,
): Promise<ImportContext> {
  const keys = importKeys(targetId, parse.lines);
  const importedKeys = new Set(await repo.findImportedKeys(contextId, keys));
  if (destination === 'conta') {
    const months = existingMonths(parse.lines);
    const lists = await Promise.all(months.map((m) => repo.listRecords(contextId, m)));
    const existing: ExistingEntry[] = [];
    const seen = new Set<string>();
    for (const r of lists.flat()) {
      if (seen.has(r.id) || r.accountId !== targetId) continue;
      seen.add(r.id);
      existing.push({ date: r.occurredOn, amountCents: r.amountCents, description: r.description, kind: r.kind });
    }
    return { existing, importedKeys, paidMonths: new Set() };
  }
  const [entries, invoices] = await Promise.all([repo.listCardEntries(targetId), card ? repo.listInvoiceItems(card.id) : Promise.resolve([])]);
  const existing: ExistingEntry[] = [];
  for (const e of entries) {
    if (e.kind === 'compra' && e.purchasedOn) existing.push({ date: e.purchasedOn, amountCents: e.amountCents, description: e.description ?? '', kind: 'compra' });
  }
  const paidMonths = new Set(invoices.filter((i) => i.status === 'paga' || i.status === 'paga_em_parte').map((i) => i.month));
  return { existing, importedKeys, paidMonths };
}

/** O mês mais novo das linhas, para "Ver em Movimentos" abrir onde estão os lançamentos. */
export function latestMonthOf(dates: readonly string[], currentMonth: IsoMonth): IsoMonth {
  const latest = dates.reduce((a, b) => (a > b ? a : b), '');
  const month = latest.slice(0, 7);
  return month === '' ? currentMonth : month > currentMonth ? currentMonth : month;
}

