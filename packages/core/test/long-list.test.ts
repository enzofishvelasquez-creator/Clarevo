import { describe, expect, it } from 'vitest';
import { LONG_LIST_MIN, dayRows, groupRecordsByDay, isLongList, sortNewestFirst, titledRows, type FinancialRecord } from '../src';

function rec(id: string, occurredOn: string, kind: 'despesa' | 'receita' = 'despesa'): FinancialRecord {
  return {
    id,
    contextId: 'c1',
    accountId: 'a1',
    kind,
    status: 'realizado',
    amountCents: 1000,
    currency: 'BRL',
    occurredOn,
    description: `Registro ${id}`,
    category: null,
    commitmentId: null,
    invoice: null,
    receiptKey: null,
    createdBy: 'p1',
    version: 1,
    createdAt: `${occurredOn}T10:00:00.000Z`,
    updatedAt: `${occurredOn}T10:00:00.000Z`,
  };
}

describe('lista longa de registros (D-062 item 5)', () => {
  it('só é longa a partir de 80 linhas: 79 montam tudo como sempre, 80 montam só o que está perto da tela', () => {
    expect(LONG_LIST_MIN).toBe(80);
    expect(isLongList(0)).toBe(false);
    expect(isLongList(79)).toBe(false);
    expect(isLongList(80)).toBe(true);
    expect(isLongList(500)).toBe(true);
  });

  it('agrupa por dia na ordem recebida: dias iguais e vizinhos formam um grupo, e a lista vazia não tem grupo', () => {
    expect(groupRecordsByDay([])).toEqual([]);
    const groups = groupRecordsByDay([rec('a', '2026-10-07'), rec('b', '2026-10-07'), rec('c', '2026-10-05'), rec('d', '2026-10-01')]);
    expect(groups.map((g) => [g.day, g.items.map((r) => r.id)])).toEqual([
      ['2026-10-07', ['a', 'b']],
      ['2026-10-05', ['c']],
      ['2026-10-01', ['d']],
    ]);
  });

  it('o mesmo dia fora de ordem abre outro grupo (a ordenação é de quem chama: sortNewestFirst)', () => {
    const groups = groupRecordsByDay([rec('a', '2026-10-07'), rec('b', '2026-10-05'), rec('c', '2026-10-07')]);
    expect(groups.map((g) => g.day)).toEqual(['2026-10-07', '2026-10-05', '2026-10-07']);
    const sorted = groupRecordsByDay(sortNewestFirst([rec('a', '2026-10-07'), rec('b', '2026-10-05'), rec('c', '2026-10-07')]));
    expect(sorted.map((g) => [g.day, g.items.length])).toEqual([
      ['2026-10-07', 2],
      ['2026-10-05', 1],
    ]);
  });

  it('linhas: o título de cada dia e depois um registro por linha, com a primeira e a última do cartão e o fim de cada dia marcados', () => {
    const rows = dayRows(groupRecordsByDay([rec('a', '2026-10-07'), rec('b', '2026-10-07'), rec('c', '2026-10-05')]));
    expect(rows.map((r) => r.key)).toEqual(['d:2026-10-07', 'r:a', 'r:b', 'd:2026-10-05', 'r:c']);
    expect(rows.map((r) => r.type)).toEqual(['day', 'record', 'record', 'day', 'record']);
    expect(rows.map((r) => r.first)).toEqual([true, false, false, false, false]);
    expect(rows.map((r) => r.last)).toEqual([false, false, false, false, true]);
    expect(rows.flatMap((r) => (r.type === 'record' ? [[r.record.id, r.lastInDay]] : []))).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
    ]);
  });

  it('sem registros não há linhas; com um só, a linha do dia é a primeira e o registro é a última', () => {
    expect(dayRows([])).toEqual([]);
    const rows = dayRows(groupRecordsByDay([rec('a', '2026-10-07')]));
    expect(rows.map((r) => [r.type, r.first, r.last])).toEqual([
      ['day', true, false],
      ['record', false, true],
    ]);
  });

  it('500 lançamentos em 30 dias: 530 linhas (500 registros e 30 títulos), chaves únicas e nenhum registro perdido', () => {
    const list = Array.from({ length: 500 }, (_, i) => rec(`r${String(i).padStart(3, '0')}`, `2026-09-${String((i % 30) + 1).padStart(2, '0')}`));
    const rows = dayRows(groupRecordsByDay(sortNewestFirst(list)));
    expect(rows).toHaveLength(530);
    expect(new Set(rows.map((r) => r.key)).size).toBe(530);
    expect(rows.filter((r) => r.type === 'record')).toHaveLength(500);
    expect(rows.filter((r) => r.type === 'day')).toHaveLength(30);
    expect(rows.filter((r) => r.first)).toHaveLength(1);
    expect(rows.filter((r) => r.last)).toHaveLength(1);
    expect(isLongList(list.length)).toBe(true);
  });

  it('cartão com título (fatura, composição): o título e depois um item por linha, o primeiro é o título e o último é o último item', () => {
    const rows = titledRows('fatura', ['a', 'b', 'c'], (x) => x);
    expect(rows.map((r) => r.key)).toEqual(['fatura:titulo', 'fatura:a', 'fatura:b', 'fatura:c']);
    expect(rows.map((r) => r.first)).toEqual([true, false, false, false]);
    expect(rows.map((r) => r.last)).toEqual([false, false, false, true]);
    expect(rows.flatMap((r) => (r.type === 'item' ? [r.lastItem] : []))).toEqual([false, false, true]);
  });

  it('cartão com título e sem itens: só o título, que é a primeira e a última linha; prefixos diferentes não repetem chave', () => {
    const rows = titledRows('x', [], (v: string) => v);
    expect(rows).toEqual([{ type: 'title', key: 'x:titulo', first: true, last: true }]);
    const keys = [...titledRows('recebido', ['1', '2'], (v) => v), ...titledRows('pago', ['1', '2'], (v) => v)].map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
