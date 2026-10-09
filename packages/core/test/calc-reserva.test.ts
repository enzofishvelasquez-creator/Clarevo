import { describe, expect, it } from 'vitest';
import { RESERVA_MONTH_CHIPS, RESERVA_REFERENCIA, RESERVA_TEXT, calcErrorText, calcReserva, type ReservaInput } from '../src';

const run = (input: ReservaInput) => {
  const out = calcReserva(input);
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};

describe('5. Reserva para imprevistos (docs/08 §3.2)', () => {
  it('R$ 3.750,00 × 6 = R$ 22.500,00', () => {
    const r = run({ essenciais: '3.750,00', meses: '6' });
    expect(r.targetCents).toBe(2_250_000);
    expect(r.resultLines).toEqual(['Com estes números, a reserva de 6 meses é de R$ 22.500,00.']);
    expect(r.coverageTenths).toBeNull();
    expect(r.monthsToTarget).toBeNull();
    expect(r.hypotheses[0]).toBe('Sem rendimento: o valor guardado não cresce com juros.');
  });

  it('com R$ 4.500,00 guardados, cobre 1,2 mês; guardando R$ 500,00 por mês, chega lá em 36 meses', () => {
    const r = run({ essenciais: '3.750,00', meses: '6', guardado: '4.500,00', mensal: '500,00' });
    expect([r.coverageTenths, r.missingCents, r.monthsToTarget]).toEqual([12, 1_800_000, 36]);
    expect(r.resultLines).toEqual([
      'Com estes números, a reserva de 6 meses é de R$ 22.500,00.',
      'O que você já guardou cobre 1,2 mês de gastos essenciais.',
      'Faltam R$ 18.000,00.',
      'Guardando R$ 500,00 por mês, a reserva fica completa em 36 meses (3 anos).',
    ]);
  });

  it('chips 1, 3, 6 e 12; 1 a 24 meses; 1 mês no singular', () => {
    expect(RESERVA_MONTH_CHIPS).toEqual([1, 3, 6, 12]);
    // Nenhum chip marcado: escolha, sem pedir para digitar; o campo "Outro" pede para digitar.
    expect(RESERVA_TEXT.chooseMonths).toBe('Escolha quantos meses cobrir.');
    expect(calcErrorText('reserva', 'meses', 'vazio')).toBe('Digite quantos meses cobrir, de 1 a 24.');
    expect([1, 3, 6, 12].map((m) => run({ essenciais: '3.750,00', meses: String(m) }).targetCents)).toEqual([
      375_000, 1_125_000, 2_250_000, 4_500_000,
    ]);
    expect(run({ essenciais: '3.750,00', meses: '1' }).resultLines[0]).toBe('Com estes números, a reserva de 1 mês é de R$ 3.750,00.');
    const out = calcReserva({ essenciais: '3.750,00', meses: '25' });
    expect(out.ok ? null : out.errors).toEqual({ meses: 'fora_da_faixa' });
    const empty = calcReserva({ essenciais: '', meses: '' });
    expect(empty.ok ? null : empty.errors).toEqual({ essenciais: 'vazio', meses: 'vazio' });
  });

  it('guardado que já cobre, menos de 0,1 mês e plural a partir de 2 meses', () => {
    const full = run({ essenciais: '1.000,00', meses: '3', guardado: '3.500,00', mensal: '100,00' });
    expect(full.resultLines[1]).toBe('O que você já guardou cobre a reserva de 3 meses.');
    expect(full.monthsToTarget).toBeNull();
    expect(full.missingCents).toBe(0);
    expect(run({ essenciais: '1.000,00', meses: '3', guardado: '50,00' }).resultLines[1]).toBe(
      'O que você já guardou cobre menos de 0,1 mês de gastos essenciais.',
    );
    expect(run({ essenciais: '1.000,00', meses: '3', guardado: '2.500,00' }).resultLines[1]).toBe(
      'O que você já guardou cobre 2,5 meses de gastos essenciais.',
    );
    expect(run({ essenciais: '1.000,00', meses: '3', guardado: '2.000,00' }).resultLines[1]).toBe(
      'O que você já guardou cobre 2 meses de gastos essenciais.',
    );
    // Opcionais em branco ou zero não geram linhas.
    expect(run({ essenciais: '1.000,00', meses: '3', guardado: '0', mensal: '' }).resultLines).toHaveLength(1);
  });

  it('referência com fonte: sem link enquanto o endereço não for conferido, e sem número', () => {
    const r = run({ essenciais: '3.750,00', meses: '6' });
    expect(r.reference).toBe(RESERVA_REFERENCIA);
    expect(RESERVA_REFERENCIA.text).toContain('Portal do Investidor, da CVM');
    if (RESERVA_REFERENCIA.url === null) {
      expect(RESERVA_REFERENCIA.text).not.toMatch(/\d/);
      expect(RESERVA_REFERENCIA.checkedOn).toBeNull();
    } else {
      expect(RESERVA_REFERENCIA.url).toMatch(/^https:\/\/www\.gov\.br\//);
      expect(RESERVA_REFERENCIA.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
