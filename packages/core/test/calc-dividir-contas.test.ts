import { describe, expect, it } from 'vitest';
import { calcDividirContas, calcErrorText, type DividirInput } from '../src';

const run = (input: DividirInput) => {
  const out = calcDividirContas(input);
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};

describe('7. Dividir as contas da casa (docs/08 §3.2)', () => {
  it('R$ 3.000,00 com rendas de R$ 4.000,00 e R$ 6.000,00: R$ 1.200,00 (40%) e R$ 1.800,00 (60%)', () => {
    const r = run({ total: '3.000,00', modo: 'renda', pessoas: [{ renda: '4.000,00' }, { renda: '6.000,00' }] });
    expect(r.people.map((p) => [p.name, p.cents, p.tenths])).toEqual([
      ['Pessoa 1', 120_000, 400],
      ['Pessoa 2', 180_000, 600],
    ]);
    expect(r.resultLines).toEqual(['Com estes números, a divisão fica assim:', 'Pessoa 1: R$ 1.200,00 (40%)', 'Pessoa 2: R$ 1.800,00 (60%)']);
    expect(r.hypotheses[0]).toBe('Cada pessoa põe a mesma parte da própria renda: cerca de 30%.');
  });

  it('R$ 100,00 por 3: R$ 33,34, R$ 33,33 e R$ 33,33', () => {
    const r = run({ total: '100,00', modo: 'iguais', pessoas: [{}, {}, {}] });
    expect(r.people.map((p) => p.cents)).toEqual([3_334, 3_333, 3_333]);
    expect(r.people.map((p) => p.line)).toEqual(['Pessoa 1: R$ 33,34 (33,3%)', 'Pessoa 2: R$ 33,33 (33,3%)', 'Pessoa 3: R$ 33,33 (33,3%)']);
  });

  it('apelidos opcionais até 20 caracteres; soma sempre fecha com o total', () => {
    const r = run({ total: '1.000,01', modo: 'renda', pessoas: [{ apelido: '  Ana ', renda: '1,00' }, { apelido: '', renda: '2,00' }, { apelido: 'Bê', renda: '3,00' }] });
    expect(r.people.map((p) => p.name)).toEqual(['Ana', 'Pessoa 2', 'Bê']);
    expect(r.people.reduce((a, p) => a + p.cents, 0)).toBe(100_001);
    const out = calcDividirContas({ total: '10', modo: 'iguais', pessoas: [{ apelido: 'x'.repeat(21) }, {}] });
    expect(out.ok ? null : out.errors).toEqual({ 'apelido.0': 'longo' });
    expect(calcErrorText('dividir-contas', 'apelido.0', 'longo')).toBe('Use no máximo 20 caracteres.');
    expect(run({ total: '10', modo: 'iguais', pessoas: [{ apelido: 'x'.repeat(20) }, {}] }).people[0]!.name).toHaveLength(20);
  });

  it('de 2 a 6 pessoas; renda obrigatória e maior que zero no modo renda', () => {
    const e = (input: DividirInput) => {
      const out = calcDividirContas(input);
      return out.ok ? null : out.errors;
    };
    expect(e({ total: '10', modo: 'iguais', pessoas: [{}] })).toEqual({ pessoas: 'fora_da_faixa' });
    expect(e({ total: '10', modo: 'iguais', pessoas: Array.from({ length: 7 }, () => ({})) })).toEqual({ pessoas: 'fora_da_faixa' });
    expect(e({ total: '10', modo: 'renda', pessoas: [{ renda: '' }, { renda: '0' }] })).toEqual({ 'renda.0': 'vazio', 'renda.1': 'zero' });
    expect(e({ total: '10', modo: 'iguais', pessoas: [{ renda: '' }, { renda: 'x' }] })).toBeNull();
    expect(calcErrorText('dividir-contas', 'renda.1', 'zero')).toBe('Informe um valor maior que zero, como 4.000,00.');
    expect(calcErrorText('dividir-contas', 'pessoas', 'fora_da_faixa')).toBe('Divida entre 2 e 6 pessoas.');
  });

  it('nada é gravado: o aviso diz isso', () => {
    expect(run({ total: '10', modo: 'iguais', pessoas: [{}, {}] }).notes).toEqual(['Os apelidos ficam só nesta tela e não são gravados.']);
  });
});
