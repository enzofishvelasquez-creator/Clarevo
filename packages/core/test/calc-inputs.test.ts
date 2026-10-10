import { describe, expect, it } from 'vitest';
import {
  CALCULATORS,
  CALC_DISCLAIMER,
  CALC_FIELDS,
  CALC_GROUPS,
  CALC_INTRO,
  CALC_SLUGS,
  CALC_ERROR_TEXT,
  calcErrorText,
  calcRowA11yLabel,
  calcTitle,
  calculatorBySlug,
  calculatorsInGroup,
  isCalcSlug,
  parseCount,
  parseMoney,
  parseOptionalMoney,
  parsePercentBp,
} from '../src';

const RATE = { min: 1, max: 9_999 };

describe('calculadoras: leitura dos campos', () => {
  it('parsePercentBp aceita "1,96", "1.96", "2", "2%", " 14 " e devolve bp inteiro', () => {
    expect(parsePercentBp('1,96', RATE)).toEqual({ ok: true, value: 196 });
    expect(parsePercentBp('1.96', RATE)).toEqual({ ok: true, value: 196 });
    expect(parsePercentBp('2', RATE)).toEqual({ ok: true, value: 200 });
    expect(parsePercentBp('2%', RATE)).toEqual({ ok: true, value: 200 });
    expect(parsePercentBp('2 %', RATE)).toEqual({ ok: true, value: 200 });
    expect(parsePercentBp(' 14 ', RATE)).toEqual({ ok: true, value: 1_400 });
    expect(parsePercentBp('1,5', RATE)).toEqual({ ok: true, value: 150 });
    expect(parsePercentBp('0,01', RATE)).toEqual({ ok: true, value: 1 });
    expect(parsePercentBp('99,99', RATE)).toEqual({ ok: true, value: 9_999 });
    expect(parsePercentBp('2,', RATE)).toEqual({ ok: true, value: 200 });
    expect(parsePercentBp(',5', RATE)).toEqual({ ok: true, value: 50 });
    expect(parsePercentBp('007', RATE)).toEqual({ ok: true, value: 700 });
  });

  it('parsePercentBp: vazio, invalido, casas_demais e fora_da_faixa', () => {
    expect(parsePercentBp('', RATE)).toEqual({ ok: false, error: 'vazio' });
    expect(parsePercentBp('   ', RATE)).toEqual({ ok: false, error: 'vazio' });
    expect(parsePercentBp('%', RATE)).toEqual({ ok: false, error: 'vazio' });
    expect(parsePercentBp('abc', RATE)).toEqual({ ok: false, error: 'invalido' });
    expect(parsePercentBp('1,2,3', RATE)).toEqual({ ok: false, error: 'invalido' });
    expect(parsePercentBp('-2', RATE)).toEqual({ ok: false, error: 'invalido' });
    expect(parsePercentBp(',', RATE)).toEqual({ ok: false, error: 'invalido' });
    expect(parsePercentBp('1 5', RATE)).toEqual({ ok: false, error: 'invalido' });
    expect(parsePercentBp('1,965', RATE)).toEqual({ ok: false, error: 'casas_demais' });
    expect(parsePercentBp('1,960', RATE)).toEqual({ ok: false, error: 'casas_demais' });
    expect(parsePercentBp('0', RATE)).toEqual({ ok: false, error: 'fora_da_faixa' });
    expect(parsePercentBp('100', RATE)).toEqual({ ok: false, error: 'fora_da_faixa' });
    expect(parsePercentBp('123456789', RATE)).toEqual({ ok: false, error: 'fora_da_faixa' });
    expect(parsePercentBp('0', { min: 0, max: 2_000 })).toEqual({ ok: true, value: 0 });
  });

  it('parseCount: inteiro na faixa, com milhar opcional', () => {
    expect(parseCount('12', 1, 480)).toEqual({ ok: true, value: 12 });
    expect(parseCount(' 36 ', 1, 480)).toEqual({ ok: true, value: 36 });
    expect(parseCount('3.650', 1, 3_650)).toEqual({ ok: true, value: 3_650 });
    expect(parseCount('', 1, 480)).toEqual({ ok: false, error: 'vazio' });
    expect(parseCount('12,5', 1, 480)).toEqual({ ok: false, error: 'invalido' });
    expect(parseCount('1 2', 1, 480)).toEqual({ ok: false, error: 'invalido' });
    expect(parseCount('-1', 1, 480)).toEqual({ ok: false, error: 'invalido' });
    expect(parseCount('0', 1, 480)).toEqual({ ok: false, error: 'fora_da_faixa' });
    expect(parseCount('481', 1, 480)).toEqual({ ok: false, error: 'fora_da_faixa' });
    expect(parseCount('99999999999', 1, 480)).toEqual({ ok: false, error: 'fora_da_faixa' });
  });

  it('parseMoney reaproveita parseBRL e MAX_RECORD_CENTS', () => {
    expect(parseMoney('1.080,00')).toEqual({ ok: true, value: 108_000 });
    expect(parseMoney('12.50')).toEqual({ ok: true, value: 1_250 });
    expect(parseMoney('R$ 80')).toEqual({ ok: true, value: 8_000 });
    expect(parseMoney('')).toEqual({ ok: false, error: 'vazio' });
    expect(parseMoney('1,234')).toEqual({ ok: false, error: 'invalido' });
    expect(parseMoney('0')).toEqual({ ok: false, error: 'zero' });
    expect(parseMoney('0', { allowZero: true })).toEqual({ ok: true, value: 0 });
    expect(parseMoney('10.000.000,00')).toEqual({ ok: false, error: 'acima_do_limite' });
    expect(parseOptionalMoney('')).toEqual({ ok: true, value: null });
    expect(parseOptionalMoney(undefined)).toEqual({ ok: true, value: null });
    expect(parseOptionalMoney('0')).toEqual({ ok: true, value: 0 });
  });
});

describe('calculadoras: catálogo e textos fixos', () => {
  it('9 calculadoras em 3 grupos, na ordem da tela', () => {
    expect(CALC_GROUPS.map((g) => g.title)).toEqual(['Decidir uma compra', 'Dívidas e atrasos', 'Guardar e dividir']);
    expect(CALC_SLUGS).toEqual([
      'parcelado-ou-a-vista',
      'custo-por-ano',
      'custo-da-divida',
      'quitar-antes',
      'multa-e-juros',
      'plano-dividas',
      'reserva',
      'juntar-para-objetivo',
      'dividir-contas',
    ]);
    expect(CALC_GROUPS.map((g) => calculatorsInGroup(g.id).length)).toEqual([2, 4, 3]);
    expect(CALCULATORS.map((c) => c.title)).toEqual([
      'Parcelado ou à vista?',
      'Quanto custa por ano?',
      'Quanto custa uma dívida?',
      'Quitar antes ou adiantar parcelas',
      'Multa e juros por atraso',
      'Em que ordem quitar as dívidas?',
      'Reserva para imprevistos',
      'Juntar para um objetivo',
      'Dividir as contas da casa',
    ]);
    expect(calculatorBySlug('quitar-antes')!.subtitle).toBe('Uma estimativa de quanto dos juros sai da conta');
    expect(calculatorBySlug('xyz')).toBeNull();
    expect(isCalcSlug('reserva')).toBe(true);
    expect(isCalcSlug('Reserva')).toBe(false);
    expect(calcTitle('parcelado-ou-a-vista', 'cota-unica')).toBe('Cota única ou parcelado?');
    expect(calcTitle('parcelado-ou-a-vista')).toBe('Parcelado ou à vista?');
  });

  it('nome acessível da linha: ponto entre título e legenda, sem "?." depois de pergunta', () => {
    const labels = CALCULATORS.map((c) => calcRowA11yLabel(c.title, c.subtitle));
    expect(labels[0]).toBe('Parcelado ou à vista? Descubra os juros embutidos no parcelado');
    expect(labels[2]).toBe('Quanto custa uma dívida? Rotativo, cheque especial ou empréstimo');
    expect(labels[5]).toBe('Em que ordem quitar as dívidas? Duas ordens de pagamento, lado a lado');
    expect(labels[6]).toBe('Reserva para imprevistos. Quantos meses seus gastos essenciais cobrem');
    for (const label of labels) expect(label).not.toMatch(/[?!.]\./);
    expect(calcRowA11yLabel('Todas as calculadoras')).toBe('Todas as calculadoras');
    expect(calcRowA11yLabel('Calculadoras', '')).toBe('Calculadoras');
  });

  it('aviso e introdução exatos', () => {
    expect(CALC_DISCLAIMER).toBe(
      'Simulação com os valores e as taxas que você informou. Não é recomendação de produto financeiro nem oferta de crédito.',
    );
    expect(CALC_INTRO).toBe('Contas rápidas com os valores que você informa. Nada é gravado.');
  });

  it('todo campo tem rótulo, e todo código tem mensagem', () => {
    for (const slug of CALC_SLUGS) {
      const fields = CALC_FIELDS[slug];
      expect(Object.keys(fields).length).toBeGreaterThan(1);
      for (const [name, spec] of Object.entries(fields)) {
        expect(spec.label.length).toBeGreaterThan(0);
        for (const code of Object.keys(CALC_ERROR_TEXT) as (keyof typeof CALC_ERROR_TEXT)[]) {
          expect(calcErrorText(slug, name, code).length).toBeGreaterThan(0);
        }
      }
    }
    expect(calcErrorText('reserva', 'nao-existe', 'vazio')).toBe(CALC_ERROR_TEXT.vazio);
  });
});
