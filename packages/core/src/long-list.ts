import type { IsoDate } from './dates';
import type { FinancialRecord } from './records';

/**
 * Lista longa de registros (D-062 item 5, `docs/19`): a partir de `LONG_LIST_MIN` linhas, a tela deixa de montar tudo de uma vez
 * e passa a montar só as linhas perto da área visível (FlatList). Abaixo disso, a lista é a de sempre, um cartão só.
 * A conta de agrupar por dia e de transformar os grupos em linhas é do core, para ser testada sem tela.
 */
export const LONG_LIST_MIN = 80;

/** A lista é longa o bastante para montar só a parte visível? */
export function isLongList(count: number): boolean {
  return count >= LONG_LIST_MIN;
}

export interface DayGroup {
  day: IsoDate;
  items: FinancialRecord[];
}

/** Agrupa por dia, na ordem recebida (a lista já vem do mais recente para o mais antigo); dias iguais e vizinhos formam um grupo. */
export function groupRecordsByDay(list: readonly FinancialRecord[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const r of list) {
    const last = groups[groups.length - 1];
    if (last && last.day === r.occurredOn) last.items.push(r);
    else groups.push({ day: r.occurredOn, items: [r] });
  }
  return groups;
}

/** Uma linha da lista longa: o título do dia ou um registro. `first` e `last` são do cartão inteiro (cantos e respiro). */
export type DayRow =
  | { type: 'day'; key: string; day: IsoDate; first: boolean; last: boolean }
  | { type: 'record'; key: string; record: FinancialRecord; first: boolean; last: boolean; lastInDay: boolean };

/** Grupos de dia em linhas: o título do dia e, depois, um registro por linha. As chaves são estáveis (`d:` dia, `r:` id do registro). */
export function dayRows(groups: readonly DayGroup[]): DayRow[] {
  const rows: DayRow[] = [];
  for (const g of groups) {
    rows.push({ type: 'day', key: `d:${g.day}`, day: g.day, first: false, last: false });
    g.items.forEach((record, i) => rows.push({ type: 'record', key: `r:${record.id}`, record, first: false, last: false, lastInDay: i === g.items.length - 1 }));
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first) first.first = true;
  if (last) last.last = true;
  return rows;
}

/** Uma linha de um cartão com título e itens (a fatura, a composição): o título e depois um item por linha. */
export type TitledRow<T> =
  | { type: 'title'; key: string; first: boolean; last: boolean }
  | { type: 'item'; key: string; item: T; first: boolean; last: boolean; lastItem: boolean };

/**
 * Linhas de um cartão com título e itens, com `first` e `last` do cartão inteiro. O prefixo deixa as chaves únicas quando a tela tem
 * mais de um cartão (a composição da diferença do mês tem dois). Sem itens, só o título.
 */
export function titledRows<T>(prefix: string, items: readonly T[], keyOf: (item: T) => string): TitledRow<T>[] {
  const rows: TitledRow<T>[] = [{ type: 'title', key: `${prefix}:titulo`, first: true, last: items.length === 0 }];
  items.forEach((item, i) => rows.push({ type: 'item', key: `${prefix}:${keyOf(item)}`, item, first: false, last: i === items.length - 1, lastItem: i === items.length - 1 }));
  return rows;
}
