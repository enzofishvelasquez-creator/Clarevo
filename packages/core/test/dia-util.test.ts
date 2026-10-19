/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEMO_TODAY,
  DUE_DAY_TEXT,
  NATIONAL_HOLIDAYS_CONSULTED_ON,
  NATIONAL_HOLIDAYS_REVIEWED_ON,
  NATIONAL_HOLIDAYS_REVIEW_EVERY_MONTHS,
  NATIONAL_HOLIDAY_LAWS,
  NATIONAL_HOLIDAY_SOURCES,
  REMINDER_NOT_BUSINESS_DAY,
  addDays,
  addMonthsToDate,
  commitmentDueNotice,
  createDemoRepository,
  dueDayNotice,
  invoiceDueNotice,
  isAllowedSourceUrl,
  isBusinessDay,
  isWeekend,
  newOperationKey,
  nextBusinessDay,
  nationalHolidayOn,
  nationalHolidays,
  plannedDueNotice,
  reminderBody,
  reminderPlan,
  summarizeToPay,
  todayIn,
  weekdayName,
  weekdayOf,
  type Commitment,
  type IsoDate,
} from '../src';

const DOCS = fileURLToPath(new URL('../../../docs/', import.meta.url));

/** Todos os dias de um intervalo fechado, em datas civis. */
function days(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), só para provar que Carnaval, Sexta-feira Santa e Corpus Christi ficam de fora. */
function easter(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Os nove feriados nacionais de cada ano de 2026 a 2030, escritos à mão (não saem do código que se testa). */
const HOLIDAYS: Record<number, [IsoDate, string][]> = {
  2026: [
    ['2026-01-01', 'Confraternização Universal'],
    ['2026-04-21', 'Tiradentes'],
    ['2026-05-01', 'Dia do Trabalho'],
    ['2026-09-07', 'Independência do Brasil'],
    ['2026-10-12', 'Nossa Senhora Aparecida'],
    ['2026-11-02', 'Finados'],
    ['2026-11-15', 'Proclamação da República'],
    ['2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
    ['2026-12-25', 'Natal'],
  ],
  2027: [
    ['2027-01-01', 'Confraternização Universal'],
    ['2027-04-21', 'Tiradentes'],
    ['2027-05-01', 'Dia do Trabalho'],
    ['2027-09-07', 'Independência do Brasil'],
    ['2027-10-12', 'Nossa Senhora Aparecida'],
    ['2027-11-02', 'Finados'],
    ['2027-11-15', 'Proclamação da República'],
    ['2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
    ['2027-12-25', 'Natal'],
  ],
  2028: [
    ['2028-01-01', 'Confraternização Universal'],
    ['2028-04-21', 'Tiradentes'],
    ['2028-05-01', 'Dia do Trabalho'],
    ['2028-09-07', 'Independência do Brasil'],
    ['2028-10-12', 'Nossa Senhora Aparecida'],
    ['2028-11-02', 'Finados'],
    ['2028-11-15', 'Proclamação da República'],
    ['2028-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
    ['2028-12-25', 'Natal'],
  ],
  2029: [
    ['2029-01-01', 'Confraternização Universal'],
    ['2029-04-21', 'Tiradentes'],
    ['2029-05-01', 'Dia do Trabalho'],
    ['2029-09-07', 'Independência do Brasil'],
    ['2029-10-12', 'Nossa Senhora Aparecida'],
    ['2029-11-02', 'Finados'],
    ['2029-11-15', 'Proclamação da República'],
    ['2029-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
    ['2029-12-25', 'Natal'],
  ],
  2030: [
    ['2030-01-01', 'Confraternização Universal'],
    ['2030-04-21', 'Tiradentes'],
    ['2030-05-01', 'Dia do Trabalho'],
    ['2030-09-07', 'Independência do Brasil'],
    ['2030-10-12', 'Nossa Senhora Aparecida'],
    ['2030-11-02', 'Finados'],
    ['2030-11-15', 'Proclamação da República'],
    ['2030-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
    ['2030-12-25', 'Natal'],
  ],
};

/** Dia da semana de cada feriado, conferido à mão no calendário (0 domingo a 6 sábado). */
const WEEKDAY_OF_HOLIDAY: Record<number, number[]> = {
  2026: [4, 2, 5, 1, 1, 1, 0, 5, 5],
  2027: [5, 3, 6, 2, 2, 2, 1, 6, 6],
  2028: [6, 5, 1, 4, 4, 4, 3, 1, 1],
  2029: [1, 6, 2, 5, 5, 5, 4, 2, 2],
  2030: [2, 0, 3, 6, 6, 6, 5, 3, 3],
};

describe('feriados nacionais (D-060 item 3)', () => {
  it('são nove por ano, de 2026 a 2030, nas datas das leis, em ordem, cada um com a lei que o define', () => {
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      const list = nationalHolidays(year);
      expect(list.map((h) => [h.date, h.name]), String(year)).toEqual(HOLIDAYS[year]);
      expect(list).toHaveLength(9);
      expect(list.map((h) => h.date)).toEqual([...list.map((h) => h.date)].sort());
      expect(list.map((h) => h.month * 100 + h.day)).toEqual([101, 421, 501, 907, 1012, 1102, 1115, 1120, 1225]);
      for (const h of list) {
        expect(NATIONAL_HOLIDAY_LAWS).toContain(h.law);
        expect(NATIONAL_HOLIDAY_SOURCES[h.source]).toBeDefined();
      }
    }
  });

  it('cada feriado cai no dia da semana conferido à mão e é a lei certa: 12 de outubro na Lei 6.802, 20 de novembro na Lei 14.759, o resto na Lei 662 com a redação da Lei 10.607', () => {
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      expect(nationalHolidays(year).map((h) => weekdayOf(h.date)), String(year)).toEqual(WEEKDAY_OF_HOLIDAY[year]);
    }
    const byDate = Object.fromEntries(nationalHolidays(2026).map((h) => [h.date.slice(5), h.law]));
    expect(byDate['10-12']).toBe('Lei nº 6.802/1980');
    expect(byDate['11-20']).toBe('Lei nº 14.759/2023');
    for (const day of ['01-01', '04-21', '05-01', '09-07', '11-02', '11-15', '12-25']) expect(byDate[day], day).toBe('Lei nº 662/1949, com a redação da Lei nº 10.607/2002');
  });

  it('o 20 de novembro só vale de 2024 em diante (a Lei 14.759 entrou em vigor em 22/12/2023); anos inválidos dão lista vazia', () => {
    expect(nationalHolidays(2023).map((h) => h.date)).not.toContain('2023-11-20');
    expect(nationalHolidays(2023)).toHaveLength(8);
    expect(nationalHolidays(2024).map((h) => h.date)).toContain('2024-11-20');
    expect(nationalHolidays(2025)).toHaveLength(9);
    for (const bad of [0, 99, 10_000, 2026.5, Number.NaN, -2026]) expect(nationalHolidays(bad), String(bad)).toEqual([]);
  });

  it('Carnaval, Sexta-feira Santa, Corpus Christi e as datas de estados e municípios não entram', () => {
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      const pascoa = easter(year);
      const outros = [addDays(pascoa, -48), addDays(pascoa, -47), addDays(pascoa, -2), addDays(pascoa, 60)];
      for (const d of outros) expect(nationalHolidayOn(d), d).toBeNull();
      // Também não entram dias estaduais e municipais conhecidos (9 de julho em SP, 20 de janeiro no RJ, 25 de janeiro em SP, 19 de março, 13 de junho).
      for (const md of ['01-20', '01-25', '03-19', '06-13', '07-09', '08-15', '12-08']) expect(nationalHolidayOn(`${year}-${md}`), `${year}-${md}`).toBeNull();
    }
    // Páscoa de 2026: 5 de abril; Carnaval em 16 e 17 de fevereiro; Sexta-feira Santa em 3 de abril; Corpus Christi em 4 de junho.
    expect(easter(2026)).toBe('2026-04-05');
    for (const d of ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04']) expect(isBusinessDay(d), d).toBe(true);
  });

  it('nationalHolidayOn acha o feriado da data e devolve null em dia comum e em data inválida', () => {
    expect(nationalHolidayOn('2026-10-12')?.name).toBe('Nossa Senhora Aparecida');
    expect(nationalHolidayOn('2026-10-13')).toBeNull();
    expect(nationalHolidayOn('2026-02-30')).toBeNull();
    expect(nationalHolidayOn('12/10/2026')).toBeNull();
  });
});

describe('dia da semana e dia útil (D-060 item 3)', () => {
  it('weekdayOf confere com datas conhecidas e anda um dia da semana por dia, de 2026 a 2030', () => {
    const known: [IsoDate, number][] = [
      ['2026-01-01', 4],
      ['2026-10-07', 3],
      ['2026-10-10', 6],
      ['2026-10-11', 0],
      ['2026-10-12', 1],
      ['2026-10-19', 1],
      ['2027-01-01', 5],
      ['2028-02-29', 2],
      ['2028-12-31', 0],
      ['2022-12-31', 6],
      ['2000-01-01', 6],
    ];
    for (const [d, w] of known) expect(weekdayOf(d), d).toBe(w);
    let w = weekdayOf('2026-01-01')!;
    for (const d of days('2026-01-02', '2030-12-31')) {
      w = (w + 1) % 7;
      expect(weekdayOf(d), d).toBe(w);
    }
    expect(weekdayOf('2026-02-29')).toBeNull();
    expect(weekdayOf('')).toBeNull();
    expect(weekdayName('2026-10-12')).toBe('segunda');
    expect(weekdayName('2026-10-13')).toBe('terça');
    expect(weekdayName('2026-10-17')).toBe('sábado');
    expect(weekdayName('2026-10-18')).toBe('domingo');
    expect(weekdayName('nada')).toBe('');
  });

  it('isBusinessDay: sábado, domingo e os nove feriados nacionais não são dia útil, de 2026 a 2030; o resto é', () => {
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      const holidays = new Set(HOLIDAYS[year]!.map(([d]) => d));
      for (const d of days(`${year}-01-01`, `${year}-12-31`)) {
        const w = weekdayOf(d)!;
        const expected = w !== 0 && w !== 6 && !holidays.has(d);
        expect(isBusinessDay(d), d).toBe(expected);
      }
    }
    expect(isBusinessDay('2026-02-30')).toBe(false);
    expect(isBusinessDay('hoje')).toBe(false);
  });

  it('dias úteis de 2026: 365 dias, menos 104 de fim de semana e menos 8 feriados em dia de semana (o de 15 de novembro é domingo) = 253', () => {
    const all = days('2026-01-01', '2026-12-31');
    expect(all).toHaveLength(365);
    expect(all.filter(isWeekend)).toHaveLength(104);
    expect(all.filter((d) => !isWeekend(d) && nationalHolidayOn(d) !== null)).toHaveLength(8);
    expect(all.filter(isBusinessDay)).toHaveLength(253);
  });

  it('o dia útil não depende do fuso do aparelho nem da hora: a mesma resposta com TZ de Kiritimati a Honolulu', () => {
    const before = process.env.TZ;
    const sample = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-12-31', '2027-01-01', '2028-12-31', '2029-01-01'];
    const run = () => sample.map((d) => [d, isBusinessDay(d), nextBusinessDay(d), weekdayOf(d)]);
    const baseline = run();
    try {
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Honolulu', 'America/Sao_Paulo', 'America/Rio_Branco', 'UTC']) {
        process.env.TZ = tz;
        expect(run(), tz).toEqual(baseline);
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe('próximo dia útil (D-060 item 3)', () => {
  it('é sempre o dia útil DEPOIS da data, nunca a própria data', () => {
    expect(nextBusinessDay('2026-10-13')).toBe('2026-10-14'); // terça útil → quarta
    expect(nextBusinessDay('2026-10-14')).toBe('2026-10-15');
    expect(nextBusinessDay('2026-10-09')).toBe('2026-10-13'); // sexta útil → o sábado, o domingo e a segunda (feriado) ficam para trás
  });

  it('sábado, domingo e feriado na segunda: 10, 11 e 12/10/2026 apontam para terça 13/10/2026', () => {
    expect(nextBusinessDay('2026-10-10')).toBe('2026-10-13');
    expect(nextBusinessDay('2026-10-11')).toBe('2026-10-13');
    expect(nextBusinessDay('2026-10-12')).toBe('2026-10-13');
  });

  it('feriado na sexta: o fim de semana também pula (1/5/2026, 20/11/2026, 25/12/2026 e 1/1/2027)', () => {
    expect(nextBusinessDay('2026-05-01')).toBe('2026-05-04');
    expect(nextBusinessDay('2026-11-20')).toBe('2026-11-23');
    expect(nextBusinessDay('2026-12-25')).toBe('2026-12-28');
    expect(nextBusinessDay('2027-01-01')).toBe('2027-01-04');
  });

  it('feriado no sábado seguido de domingo (1/5/2027 e 25/12/2027) vai para a segunda; no domingo (15/11/2026), também', () => {
    expect(weekdayOf('2027-05-01')).toBe(6);
    expect(nextBusinessDay('2027-05-01')).toBe('2027-05-03');
    expect(weekdayOf('2027-12-25')).toBe(6);
    expect(nextBusinessDay('2027-12-25')).toBe('2027-12-27');
    expect(nextBusinessDay('2026-11-15')).toBe('2026-11-16');
    expect(nextBusinessDay('2026-11-14')).toBe('2026-11-16'); // sábado antes do feriado de domingo
  });

  it('viradas de ano: 31/12 em sábado (2022 e 2033), em domingo (2028) e em sexta útil (2027)', () => {
    expect(weekdayOf('2022-12-31')).toBe(6);
    expect(nextBusinessDay('2022-12-31')).toBe('2023-01-02'); // 1/1 é domingo; 2/1 é segunda e útil
    expect(weekdayOf('2033-12-31')).toBe(6);
    expect(nextBusinessDay('2033-12-31')).toBe('2034-01-02');
    expect(weekdayOf('2028-12-31')).toBe(0);
    expect(nextBusinessDay('2028-12-31')).toBe('2029-01-02'); // 1/1/2029 é segunda e feriado
    expect(isBusinessDay('2027-12-31')).toBe(true);
    expect(nextBusinessDay('2027-12-31')).toBe('2028-01-03'); // 1/1/2028 é sábado, 2/1 domingo
    expect(nextBusinessDay('2026-12-31')).toBe('2027-01-04'); // 31/12/2026 é quinta e útil; 1/1/2027 é sexta e feriado
  });

  it('data inválida: null', () => {
    expect(nextBusinessDay('2026-02-30')).toBeNull();
    expect(nextBusinessDay('amanhã')).toBeNull();
  });

  it('o resultado é sempre um dia útil, depois da data, a no máximo 5 dias, de 2026 a 2030', () => {
    for (const d of days('2026-01-01', '2030-12-31')) {
      const next = nextBusinessDay(d)!;
      expect(isBusinessDay(next), d).toBe(true);
      expect(next > d, d).toBe(true);
      expect(next <= addDays(d, 5), d).toBe(true);
    }
  });
});

describe('aviso de vencimento em dia que não é útil (D-060 item 3)', () => {
  it('sábado, domingo e feriado: as frases exatas, com o próximo dia útil', () => {
    expect(dueDayNotice('2026-10-10')!.text).toBe('Vence no sábado, 10/10/2026, que não é dia útil. O próximo dia útil é terça, 13/10/2026.');
    expect(dueDayNotice('2026-10-11')!.text).toBe('Vence no domingo, 11/10/2026, que não é dia útil. O próximo dia útil é terça, 13/10/2026.');
    expect(dueDayNotice('2026-10-12')!.text).toBe(
      'Vence na segunda, 12/10/2026, que não é dia útil (feriado nacional: Nossa Senhora Aparecida). O próximo dia útil é terça, 13/10/2026.',
    );
    expect(dueDayNotice('2026-10-17')!.text).toBe('Vence no sábado, 17/10/2026, que não é dia útil. O próximo dia útil é segunda, 19/10/2026.');
    expect(dueDayNotice('2027-01-01')!.text).toBe(
      'Vence na sexta, 01/01/2027, que não é dia útil (feriado nacional: Confraternização Universal). O próximo dia útil é segunda, 04/01/2027.',
    );
    expect(dueDayNotice('2026-11-02')!.text).toBe('Vence na segunda, 02/11/2026, que não é dia útil (feriado nacional: Finados). O próximo dia útil é terça, 03/11/2026.');
    expect(dueDayNotice('2026-11-20')!.text).toContain('(feriado nacional: Dia Nacional de Zumbi e da Consciência Negra)');
  });

  it('feriado que cai em fim de semana mantém o motivo "sábado" ou "domingo" e cita o feriado', () => {
    const sat = dueDayNotice('2027-12-25')!;
    expect([sat.reason, sat.holiday?.name, sat.nextBusinessDay]).toEqual(['sabado', 'Natal', '2027-12-27']);
    expect(sat.text).toBe('Vence no sábado, 25/12/2027, que não é dia útil (feriado nacional: Natal). O próximo dia útil é segunda, 27/12/2027.');
    const sun = dueDayNotice('2026-11-15')!;
    expect([sun.reason, sun.holiday?.name, sun.nextBusinessDay]).toEqual(['domingo', 'Proclamação da República', '2026-11-16']);
    const mon = dueDayNotice('2026-10-12')!;
    expect([mon.reason, mon.holiday?.name]).toEqual(['feriado', 'Nossa Senhora Aparecida']);
    const plain = dueDayNotice('2026-10-10')!;
    expect([plain.reason, plain.holiday]).toEqual(['sabado', null]);
  });

  it('a frase neutra é sempre a mesma e nunca promete nada sobre encargos', () => {
    expect(DUE_DAY_TEXT.advice).toBe('Confira com quem cobra se o pagamento pode ser feito no próximo dia útil.');
    for (const d of ['2026-10-10', '2026-10-12', '2027-01-01']) {
      const n = dueDayNotice(d)!;
      expect(n.advice).toBe(DUE_DAY_TEXT.advice);
      expect(n.a11y).toBe(`${n.text} ${DUE_DAY_TEXT.advice}`);
    }
  });

  it('o sinal da lista é texto: "Não é dia útil · próximo dia útil: terça, 13/10"', () => {
    const n = dueDayNotice('2026-10-11')!;
    expect(n.sign).toBe('Não é dia útil');
    expect(n.signLine).toBe('Não é dia útil · próximo dia útil: terça, 13/10');
    expect(n.signA11y).toBe('não é dia útil, próximo dia útil terça, 13/10');
  });

  it('dia útil e data inválida: sem aviso', () => {
    for (const d of ['2026-10-09', '2026-10-13', '2026-12-31', '2027-12-31']) expect(dueDayNotice(d), d).toBeNull();
    for (const d of ['2026-02-30', '', '12/10/2026']) expect(dueDayNotice(d), d).toBeNull();
  });

  it('todo sábado, domingo e feriado de 2026 a 2030 tem aviso, e nenhum dia útil tem', () => {
    let withNotice = 0;
    for (const d of days('2026-01-01', '2030-12-31')) {
      const n = dueDayNotice(d);
      if (isBusinessDay(d)) expect(n, d).toBeNull();
      else {
        withNotice += 1;
        expect(n, d).not.toBeNull();
        expect(n!.dueOn).toBe(d);
        expect(isBusinessDay(n!.nextBusinessDay), d).toBe(true);
        expect(n!.text.startsWith('Vence '), d).toBe(true);
        expect(n!.text.includes(', que não é dia útil'), d).toBe(true);
        expect(n!.text.includes('feriado nacional'), d).toBe(nationalHolidayOn(d) !== null);
      }
    }
    // 2026 a 2030 têm 1826 dias; 253 + os dias úteis dos outros quatro anos: o total de dias sem expediente fecha com os dois calendários.
    const useful = days('2026-01-01', '2030-12-31').filter(isBusinessDay).length;
    expect(withNotice + useful).toBe(days('2026-01-01', '2030-12-31').length);
  });
});

describe('quando o aviso aparece: conta a pagar, fatura e conta prevista', () => {
  const conta = (dueOn: IsoDate, over: Partial<Pick<Commitment, 'status'>> = {}): Pick<Commitment, 'status' | 'dueOn'> => ({ status: 'aberto', dueOn, ...over });

  it('conta em aberto que vence hoje ou depois mostra o aviso; paga ou vencida, não', () => {
    expect(commitmentDueNotice(conta('2026-10-11'), '2026-10-07')?.text).toContain('Vence no domingo, 11/10/2026');
    expect(commitmentDueNotice(conta('2026-10-11'), '2026-10-11')).not.toBeNull(); // vence hoje
    expect(commitmentDueNotice(conta('2026-10-11'), '2026-10-12')).toBeNull(); // venceu ontem
    expect(commitmentDueNotice(conta('2026-10-11', { status: 'quitado' }), '2026-10-07')).toBeNull();
    expect(commitmentDueNotice(conta('2026-10-13'), '2026-10-07')).toBeNull(); // dia útil
  });

  it('o dia que vale é o da sessão: o mesmo instante é domingo em São Paulo e segunda em Kiritimati', () => {
    const instant = new Date('2026-10-12T02:30:00Z');
    expect(todayIn('America/Sao_Paulo', instant)).toBe('2026-10-11');
    expect(todayIn('America/Rio_Branco', instant)).toBe('2026-10-11');
    expect(todayIn('Pacific/Kiritimati', instant)).toBe('2026-10-12');
    const c = conta('2026-10-11');
    expect(commitmentDueNotice(c, todayIn('America/Sao_Paulo', instant))).not.toBeNull(); // ainda vence hoje
    expect(commitmentDueNotice(c, todayIn('Pacific/Kiritimati', instant))).toBeNull(); // lá já venceu
    // Meia-noite em São Paulo: um minuto antes ainda é sábado.
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-11T02:59:00Z'))).toBe('2026-10-10');
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-11T03:00:00Z'))).toBe('2026-10-11');
  });

  it('fatura de cartão: só aberta ou fechada, com valor a pagar, que vence hoje ou depois', () => {
    const f = (situation: 'aberta' | 'fechada' | 'paga' | 'paga_em_parte', dueOn: IsoDate, totalCents = 50_000) => ({ situation, dueOn, totalCents });
    expect(invoiceDueNotice(f('fechada', '2026-11-15'), '2026-11-05')?.text).toContain('Vence no domingo, 15/11/2026');
    expect(invoiceDueNotice(f('fechada', '2026-11-15'), '2026-11-05')?.text).toContain('(feriado nacional: Proclamação da República)');
    expect(invoiceDueNotice(f('aberta', '2026-11-15'), '2026-10-07')).not.toBeNull();
    expect(invoiceDueNotice(f('paga', '2026-11-15'), '2026-11-05')).toBeNull();
    expect(invoiceDueNotice(f('paga_em_parte', '2026-11-15'), '2026-11-05')).toBeNull();
    expect(invoiceDueNotice(f('fechada', '2026-11-15', 0), '2026-11-05')).toBeNull();
    expect(invoiceDueNotice(f('fechada', '2026-11-15'), '2026-11-16')).toBeNull();
    expect(invoiceDueNotice(f('fechada', '2026-11-16'), '2026-11-05')).toBeNull(); // segunda útil
  });

  it('conta prevista de gasto fixo: aviso enquanto o vencimento é hoje ou depois', () => {
    expect(plannedDueNotice('2026-11-15', '2026-10-07')).not.toBeNull();
    expect(plannedDueNotice('2026-11-15', '2026-11-16')).toBeNull();
    expect(plannedDueNotice('2026-11-16', '2026-10-07')).toBeNull();
  });
});

describe('a data de vencimento calculada não muda (D-060 item 3)', () => {
  it('conta avulsa, gasto fixo, parcelamento e conta do ano em fim de semana ou feriado mantêm o vencimento e os totais do mês', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const toPayBefore = summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY).toPayCents;

    // Conta avulsa em um domingo: continua em 11/10 e conta em Ainda a pagar de outubro.
    const avulsa = await repo.createCommitment(newOperationKey(), ctx, { description: 'Condomínio extra', amountCents: 10_000, dueOn: '2026-10-11', category: 'Moradia' });
    expect(avulsa.commitment.dueOn).toBe('2026-10-11');
    expect((await repo.getCommitment(avulsa.commitment.id))!.dueOn).toBe('2026-10-11');
    expect(summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY).toPayCents).toBe(toPayBefore + 10_000);

    // Gasto fixo no dia 15: novembro de 2026 cai em domingo e feriado; dezembro, em terça. O dia escolhido segue sendo o do cálculo.
    const w = await repo.createSeries(newOperationKey(), ctx, {
      kind: 'mensal',
      nature: 'conta',
      description: 'Academia do bairro',
      category: 'Saúde',
      amountCents: 9_000,
      amountMode: 'fixo',
      dueDay: 15,
      firstDueMonth: '2026-10',
      firstNumber: 1,
      installmentTotal: null,
      partsPerYear: null,
      lastMonth: null,
    });
    const all = (await repo.listSeriesOccurrences(w.series.id)).sort((a, b) => a.series!.number - b.series!.number);
    expect(all.map((c) => [c.series!.number, c.dueOn])).toEqual([
      [1, '2026-10-15'],
      [2, '2026-11-15'],
    ]);
    expect(commitmentDueNotice(all[1]!, DEMO_TODAY)?.holiday?.name).toBe('Proclamação da República');
    expect(commitmentDueNotice(all[0]!, DEMO_TODAY)).toBeNull(); // 15/10/2026 é quinta

    // Parcelamento no dia 17: a parcela de outubro vence em sábado, 17/10/2026, e a de novembro, em terça.
    const p = await repo.createSeries(newOperationKey(), ctx, {
      kind: 'parcelada',
      nature: 'compra_parcelada',
      description: 'Geladeira',
      category: 'Moradia',
      amountCents: 40_000,
      amountMode: 'fixo',
      dueDay: 17,
      firstDueMonth: '2026-10',
      firstNumber: 1,
      installmentTotal: 10,
      partsPerYear: null,
      lastMonth: null,
    });
    const parcelas = (await repo.listSeriesOccurrences(p.series.id)).sort((a, b) => a.series!.number - b.series!.number);
    expect(parcelas.map((c) => c.dueOn)).toEqual(['2026-10-17', '2026-11-17']);
    expect(commitmentDueNotice(parcelas[0]!, DEMO_TODAY)?.text).toBe('Vence no sábado, 17/10/2026, que não é dia útil. O próximo dia útil é segunda, 19/10/2026.');

    // Conta do ano em cota única, dia 25 de dezembro de 2026 (sexta e feriado): o vencimento segue 25/12/2026.
    const ano = await repo.createSeries(newOperationKey(), ctx, {
      kind: 'anual',
      nature: 'conta',
      description: 'Seguro do ano',
      category: 'Transporte',
      amountCents: 120_000,
      amountMode: 'variavel',
      dueDay: 25,
      firstDueMonth: '2026-12',
      firstNumber: 1,
      installmentTotal: null,
      partsPerYear: 1,
      lastMonth: null,
    });
    const anuais = await repo.listSeriesOccurrences(ano.series.id);
    expect(anuais.map((c) => c.dueOn)).toEqual(['2026-12-25']);
    expect(commitmentDueNotice(anuais[0]!, DEMO_TODAY)?.holiday?.name).toBe('Natal');
    expect(commitmentDueNotice(anuais[0]!, DEMO_TODAY)?.nextBusinessDay).toBe('2026-12-28');
  });
});

describe('fontes e revisão da lista (D-060 item 3)', () => {
  it('as três leis têm fonte oficial em domínio aceito por Aprender, endereço, trecho que diz se a página abriu e data de consulta', () => {
    expect(NATIONAL_HOLIDAY_SOURCES).toHaveLength(3);
    expect(NATIONAL_HOLIDAY_LAWS).toHaveLength(3);
    for (const s of NATIONAL_HOLIDAY_SOURCES) {
      expect(s.kind).toBe('oficial');
      expect(isAllowedSourceUrl(s.url, 'oficial', 'dia-util'), s.url).toBe(true);
      expect(s.url.startsWith('https://www.planalto.gov.br/')).toBe(true);
      expect(s.locator.length).toBeGreaterThan(60);
      expect(s.locator).toContain('a página não abriu');
      expect(s.consultedOn).toBe('2026-10-19');
    }
    expect(NATIONAL_HOLIDAY_SOURCES[0]!.title).toContain('Lei nº 662');
    expect(NATIONAL_HOLIDAY_SOURCES[0]!.title).toContain('Lei nº 10.607');
    expect(NATIONAL_HOLIDAY_SOURCES[1]!.title).toContain('Lei nº 6.802');
    expect(NATIONAL_HOLIDAY_SOURCES[2]!.title).toContain('Lei nº 14.759');
    expect(NATIONAL_HOLIDAYS_CONSULTED_ON).toBe('2026-10-19');
  });

  it('o trecho de cada fonte cita as datas que ela define', () => {
    const [a, b, c] = NATIONAL_HOLIDAY_SOURCES;
    for (const d of ['1º de janeiro', '21 de abril', '1º de maio', '7 de setembro', '2 de novembro', '15 de novembro', '25 de dezembro']) expect(a!.locator, d).toContain(d);
    expect(b!.locator).toContain('12 de outubro');
    expect(c!.locator).toContain('20 de novembro');
  });

  it('a revisão tem prazo: depois de 12 meses da data da última, este teste reprova de propósito, como os temas de Aprender', () => {
    const due = addMonthsToDate(NATIONAL_HOLIDAYS_REVIEWED_ON, NATIONAL_HOLIDAYS_REVIEW_EVERY_MONTHS);
    const today = new Date().toISOString().slice(0, 10);
    expect(today <= due, `dia-util: revisar a lista de feriados nacionais (prazo ${due}), conferir as três leis e atualizar docs/09`).toBe(true);
  });

  it('docs/09 registra as fontes, a data da consulta e o que não entra', () => {
    const text = readFileSync(`${DOCS}09_APRENDER.md`, 'utf8');
    expect(text).toContain('Feriados nacionais do aviso de dia útil');
    for (const needle of ['Lei nº 662', 'Lei nº 10.607', 'Lei nº 6.802', 'Lei nº 14.759', '19/10/2026', 'Carnaval', 'Sexta-feira Santa', 'Corpus Christi']) expect(text, needle).toContain(needle);
    for (const s of NATIONAL_HOLIDAY_SOURCES) expect(text, s.url).toContain(s.url);
  });
});

describe('lembrete (D-025(3)): o corpo diz que o vencimento não é dia útil, sem valor nem descrição', () => {
  const conta = (dueOn: IsoDate, n: number): Commitment =>
    ({
      id: `c${n}`,
      contextId: 'ctx',
      description: `Conta secreta ${n}`,
      amountCents: 1_234_567,
      currency: 'BRL',
      dueOn,
      category: 'Moradia',
      status: 'aberto',
      payment: null,
      series: null,
      seriesOverride: false,
      invoice: null,
      amountIsEstimate: false,
      createdBy: 'p',
      version: 1,
      createdAt: '2026-10-01T12:00:00Z',
      updatedAt: '2026-10-01T12:00:00Z',
    }) as Commitment;

  it('reminderBody só muda quando o vencimento avisado não é dia útil', () => {
    expect(reminderBody(1)).toBe('Você tem 1 conta com vencimento amanhã.');
    expect(reminderBody(3)).toBe('Você tem 3 contas com vencimento amanhã.');
    expect(reminderBody(1, '2026-10-13')).toBe('Você tem 1 conta com vencimento amanhã.');
    expect(reminderBody(1, '2026-10-11')).toBe('Você tem 1 conta com vencimento amanhã, que não é dia útil.');
    expect(reminderBody(3, '2026-10-12')).toBe('Você tem 3 contas com vencimento amanhã, que não é dia útil.');
    expect(reminderBody(2, 'inválida')).toBe('Você tem 2 contas com vencimento amanhã.');
    expect(REMINDER_NOT_BUSINESS_DAY).toBe(', que não é dia útil');
  });

  it('o plano agenda o mesmo dia e hora de antes e só o corpo ganha a frase; nada de valor, nome ou data', () => {
    const plan = reminderPlan([conta('2026-10-11', 1), conta('2026-10-11', 2), conta('2026-10-13', 3), conta('2026-10-17', 4)], '2026-10-07', 9);
    expect(plan.map((p) => [p.id, p.fireAt, p.dueOn, p.count, p.body])).toEqual([
      ['clarevo-lembrete-2026-10-10', '2026-10-10T09:00', '2026-10-11', 2, 'Você tem 2 contas com vencimento amanhã, que não é dia útil.'],
      ['clarevo-lembrete-2026-10-12', '2026-10-12T09:00', '2026-10-13', 1, 'Você tem 1 conta com vencimento amanhã.'],
      ['clarevo-lembrete-2026-10-16', '2026-10-16T09:00', '2026-10-17', 1, 'Você tem 1 conta com vencimento amanhã, que não é dia útil.'],
    ]);
    for (const item of plan) {
      const shown = `${item.title} ${item.body}`;
      expect(shown).not.toMatch(/secreta|1\.234|R\$|\d{2}\/\d{2}|sábado|domingo|segunda|terça|feriado/i);
      expect(shown).not.toMatch(/sem (multa|juros|encargo)/i);
    }
  });
});
