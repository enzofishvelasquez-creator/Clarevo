import { describe, expect, it } from 'vitest';
import { IMPORT_SUGGESTION_TEXT, importSuggestions, recurringKey } from '../src';

/** Sugestões depois de importar (D-078 H). Linhas fictícias. */
type K = 'despesa' | 'receita' | 'compra' | 'estorno' | 'pagamento';
const line = (date: string, description: string, amountCents: number, kind: K = 'despesa', category: string | null = null) => ({ date, description, amountCents, kind, category });
const NONE = { seriesDescriptions: [], budgetCategories: [] };

describe('contas que se repetem → gasto fixo', () => {
  it('a mesma descrição (sem os números) em 2 meses ou mais, com valores parecidos, vira sugestão com o valor e o dia mais recentes', () => {
    const lines = [
      line('2026-08-12', 'PAG LUZ 0812 CIA EXEMPLO', 17_500, 'despesa', 'Moradia'),
      line('2026-09-11', 'PAG LUZ 0911 CIA EXEMPLO', 19_200, 'despesa', 'Moradia'),
      line('2026-10-13', 'PAG LUZ 1013 CIA EXEMPLO', 18_000, 'despesa', 'Moradia'),
      line('2026-10-05', 'PADARIA EXEMPLO', 2_300),
    ];
    expect(importSuggestions(lines, NONE).recurring).toEqual([
      { description: 'PAG LUZ 1013 CIA EXEMPLO', amountCents: 18_000, day: 13, months: 3, category: 'Moradia' },
    ]);
    expect(recurringKey('PAG*LUZ 0812 CIA')).toBe(recurringKey('pag luz 1013 cia'));
  });

  it('um mês só, valores muito diferentes, compra no cartão ou recebimento não viram gasto fixo', () => {
    const lines = [
      line('2026-10-01', 'ACADEMIA EXEMPLO', 9_900),
      line('2026-10-20', 'ACADEMIA EXEMPLO', 9_900),
      line('2026-09-05', 'MERCADO EXEMPLO', 10_000),
      line('2026-10-05', 'MERCADO EXEMPLO', 45_000),
      line('2026-09-08', 'STREAMING EXEMPLO', 3_990, 'compra'),
      line('2026-10-08', 'STREAMING EXEMPLO', 3_990, 'compra'),
      line('2026-09-05', 'SALARIO EMPRESA', 500_000, 'receita'),
      line('2026-10-05', 'SALARIO EMPRESA', 500_000, 'receita'),
    ];
    expect(importSuggestions(lines, NONE).recurring).toEqual([]);
  });

  it('o que já tem gasto fixo com descrição parecida fica de fora; no máximo 5, os de maior valor', () => {
    const many = ['ALUGUEL', 'CONDOMINIO', 'INTERNET', 'CELULAR', 'ESCOLA', 'SEGURO CARRO', 'ACADEMIA'].flatMap((d, i) => [
      line('2026-09-10', d, 10_000 * (i + 1)),
      line('2026-10-10', d, 10_000 * (i + 1)),
    ]);
    const r = importSuggestions(many, { seriesDescriptions: ['Aluguel do apartamento'], budgetCategories: [] }).recurring;
    expect(r.map((s) => s.description)).toEqual(['ACADEMIA', 'SEGURO CARRO', 'ESCOLA', 'CELULAR', 'INTERNET']);
  });
});

describe('média por categoria → orçamento', () => {
  it('soma gastos e compras de cada categoria, divide pelos meses do arquivo e arredonda para cima em R$ 10,00', () => {
    const lines = [
      line('2026-09-03', 'POSTO EXEMPLO', 15_000, 'despesa', 'Transporte'),
      line('2026-09-20', 'POSTO EXEMPLO', 12_000, 'compra', 'Transporte'),
      line('2026-10-03', 'POSTO EXEMPLO', 31_000, 'despesa', 'Transporte'),
      line('2026-10-04', 'MERCADO EXEMPLO', 40_000, 'despesa', 'Mercado'),
      line('2026-10-04', 'CINEMA', 2_000, 'despesa', 'Lazer'),
      line('2026-10-05', 'SALARIO', 500_000, 'receita', 'Salário'),
    ];
    // Transporte: 580,00 em 2 meses = 290,00. Mercado: 400,00 / 2 = 200,00. Lazer: 20,00 / 2 = 10,00 (abaixo de R$ 50,00).
    expect(importSuggestions(lines, NONE).budgets).toEqual([
      { category: 'Transporte', monthlyCents: 29_000 },
      { category: 'Mercado', monthlyCents: 20_000 },
    ]);
    // Com orçamento de Transporte, só Mercado.
    expect(importSuggestions(lines, { seriesDescriptions: [], budgetCategories: ['Transporte'] }).budgets).toEqual([{ category: 'Mercado', monthlyCents: 20_000 }]);
  });

  it('arredonda para cima e fica com as 3 maiores; sem categoria ou categoria desconhecida não entram', () => {
    const lines = [
      line('2026-10-01', 'A', 12_345, 'despesa', 'Transporte'),
      line('2026-10-01', 'B', 30_000, 'despesa', 'Mercado'),
      line('2026-10-01', 'C', 20_000, 'despesa', 'Moradia'),
      line('2026-10-01', 'D', 10_000, 'despesa', 'Lazer'),
      line('2026-10-01', 'E', 90_000, 'despesa', null),
      line('2026-10-01', 'F', 90_000, 'despesa', 'Categoria inventada'),
    ];
    expect(importSuggestions(lines, NONE).budgets).toEqual([
      { category: 'Mercado', monthlyCents: 30_000 },
      { category: 'Moradia', monthlyCents: 20_000 },
      { category: 'Transporte', monthlyCents: 13_000 },
    ]);
  });

  it('textos', () => {
    expect(IMPORT_SUGGESTION_TEXT.recurringLine({ description: 'Luz', amountCents: 18_000, day: 12, months: 3, category: null })).toBe('Luz · R$ 180,00 · todo dia 12 · em 3 meses');
    expect(IMPORT_SUGGESTION_TEXT.budgetLine({ category: 'Transporte', monthlyCents: 30_000 })).toBe('Transporte · R$ 300,00 por mês');
  });
});
