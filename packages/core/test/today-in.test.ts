import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayIn } from '../src';

/**
 * `todayIn` (o dia de hoje no fuso da pessoa) monta a data pelas partes do Intl, e não pelo texto formatado: o Hermes de alguns Android não
 * formata 'en-CA' como AAAA-MM-DD. Sem partes que formem uma data válida, ou com o fuso desconhecido, vale o relógio do aparelho.
 */

const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Troca só o Intl.DateTimeFormat pelo de mentira; o resto do Intl continua o de verdade. */
function withFakeFormat(Fake: unknown) {
  vi.stubGlobal('Intl', Object.create(Intl, { DateTimeFormat: { value: Fake, configurable: true, writable: true } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('todayIn: a data pelas partes', () => {
  it('com o Intl de verdade: a data civil no fuso pedido, também na virada do dia em UTC', () => {
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-08T02:30:00Z'))).toBe('2026-10-07');
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-08T03:00:00Z'))).toBe('2026-10-08');
    expect(todayIn('Pacific/Kiritimati', new Date('2026-10-13T12:00:00Z'))).toBe('2026-10-14');
    expect(todayIn('UTC', new Date('2026-02-28T23:59:59Z'))).toBe('2026-02-28');
  });

  it('o texto formatado diferente (como no Hermes de alguns Android) não importa: valem as partes, com zero à esquerda', () => {
    const calls: unknown[] = [];
    withFakeFormat(
      class {
        constructor(locale: unknown, options: unknown) {
          calls.push([locale, options]);
        }
        format() {
          return '10/7/2026';
        }
        formatToParts() {
          return [
            { type: 'month', value: '10' },
            { type: 'literal', value: '/' },
            { type: 'day', value: '7' },
            { type: 'literal', value: '/' },
            { type: 'year', value: '2026' },
          ];
        }
      },
    );
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-07T15:00:00Z'))).toBe('2026-10-07');
    // O fuso vai junto, com o calendário gregoriano e os algarismos latinos pedidos à parte.
    expect(calls[0]).toEqual(['en-CA', expect.objectContaining({ timeZone: 'America/Sao_Paulo', calendar: 'gregory', numberingSystem: 'latn' })]);
  });
});

describe('todayIn: o relógio do aparelho quando as partes não servem', () => {
  const now = new Date('2026-10-07T15:00:00Z');

  it('partes sem uma data AAAA-MM-DD válida (algarismos de outro sistema, ano faltando, mês 13): a data local do aparelho', () => {
    const cases = [
      [{ type: 'year', value: '٢٠٢٦' }, { type: 'month', value: '١٠' }, { type: 'day', value: '٠٧' }],
      [{ type: 'month', value: '10' }, { type: 'day', value: '07' }],
      [{ type: 'year', value: '2026' }, { type: 'month', value: '13' }, { type: 'day', value: '07' }],
    ];
    for (const parts of cases) {
      withFakeFormat(
        class {
          formatToParts() {
            return parts;
          }
        },
      );
      expect(todayIn('America/Sao_Paulo', now), JSON.stringify(parts)).toBe(local(now));
      vi.unstubAllGlobals();
    }
  });

  it('Intl que lança (fuso desconhecido ou sem formatToParts): a data local do aparelho, sem erro', () => {
    expect(todayIn('Fuso/Que_Nao_Existe', now)).toBe(local(now));
    withFakeFormat(
      class {
        constructor() {
          throw new RangeError('Intl incompleto');
        }
      },
    );
    expect(todayIn('America/Sao_Paulo', now)).toBe(local(now));
    vi.unstubAllGlobals();
    withFakeFormat(class {});
    expect(todayIn('America/Sao_Paulo', now)).toBe(local(now));
  });
});
