/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COMMITTED_TEXT,
  DEMO_TODAY,
  DUE_DAY_TEXT,
  DUE_KINDS,
  DUE_RULE_CONSULTED_ON,
  DUE_RULE_LAW,
  DUE_RULE_SOURCES,
  NATIONAL_HOLIDAYS_CONSULTED_ON,
  NATIONAL_HOLIDAYS_REVIEWED_ON,
  NATIONAL_HOLIDAYS_REVIEW_EVERY_MONTHS,
  NATIONAL_HOLIDAY_LAWS,
  NATIONAL_HOLIDAY_SOURCES,
  MemoryRepository,
  REMINDER_NOT_BUSINESS_DAY,
  addDays,
  addMonthsToDate,
  buildInvoices,
  buildReturnReview,
  buildWidgetContent,
  commitmentDueNotice,
  commitmentSituation,
  committedTexts,
  createDemoRepository,
  dueDayNotice,
  dueKindOf,
  dueKindOfSeries,
  dueText,
  dueTextOf,
  effectiveOverdue,
  invoiceDueNotice,
  invoiceTexts,
  isAllowedSourceUrl,
  isBusinessDay,
  isCommitmentOverdue,
  isWeekend,
  lastOnTimeDay,
  multaLink,
  newOperationKey,
  nextBusinessDay,
  nextBusinessDayDueText,
  nextBusinessDayWhen,
  nationalHolidayOn,
  nationalHolidays,
  plannedDueNotice,
  quickPayAction,
  reminderBody,
  reminderPlan,
  reminderSignature,
  summarizeCommitted,
  summarizeToPay,
  toPayCaption,
  todayIn,
  weekdayName,
  weekdayOf,
  type Card,
  type Commitment,
  type IsoDate,
  type ReturnWindow,
} from '../src';

const DOCS = fileURLToPath(new URL('../../../docs/', import.meta.url));

/** Fim do aviso de conta, boleto, fatura, gasto fixo e parcelamento (D-061): a tolerância do próximo dia útil. */
const TAIL = ' Só depois desse dia ela passa a vencida.';

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

  it('antes de 2003: o 21 de abril já era feriado nacional desde 1951 (Lei 1.266/1950, art. 3, revogada pela Lei 10.607/2002, que manteve a data), o 12 de outubro vale de 1980 e o 2 de novembro, de 2003', () => {
    const datas = (year: number) => nationalHolidays(year).map((h) => h.date);
    // 2000: sete feriados, com o 21 de abril e o 12 de outubro, sem 2 e 20 de novembro.
    expect(datas(2000)).toEqual(['2000-01-01', '2000-04-21', '2000-05-01', '2000-09-07', '2000-10-12', '2000-11-15', '2000-12-25']);
    expect(datas(2002)).toEqual(['2002-01-01', '2002-04-21', '2002-05-01', '2002-09-07', '2002-10-12', '2002-11-15', '2002-12-25']);
    expect(datas(2003)).toContain('2003-11-02');
    expect(datas(2003)).toHaveLength(8);
    // 21 de abril: fora em 1950 (a Lei 1.266 é de 8/12/1950), dentro de 1951 em diante.
    expect(datas(1950)).not.toContain('1950-04-21');
    expect(datas(1951)).toEqual(['1951-01-01', '1951-04-21', '1951-05-01', '1951-09-07', '1951-11-15', '1951-12-25']);
    // 12 de outubro: a Lei 6.802 é de 30/06/1980.
    expect(datas(1979)).not.toContain('1979-10-12');
    expect(datas(1980)).toContain('1980-10-12');
    // 21/04/2000 foi uma sexta; 21/04/2001, um sábado.
    expect(nationalHolidayOn('2000-04-21')?.name).toBe('Tiradentes');
    expect(weekdayOf('2000-04-21')).toBe(5);
    expect(isBusinessDay('2000-04-21')).toBe(false);
    expect(nextBusinessDay('2000-04-21')).toBe('2000-04-24');
    expect(dueDayNotice('2000-04-21')!.text).toBe(`Vence na sexta, 21/04/2000, que não é dia útil (feriado nacional: Tiradentes). O próximo dia útil é segunda, 24/04/2000.${TAIL}`);
    const sat = dueDayNotice('2001-04-21')!;
    expect([sat.reason, sat.holiday?.name, sat.nextBusinessDay]).toEqual(['sabado', 'Tiradentes', '2001-04-23']);
    expect(nationalHolidayOn('1999-04-21')?.name).toBe('Tiradentes');
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
  it('sábado, domingo e feriado: as frases exatas, com o próximo dia útil e o fim da tolerância (D-061)', () => {
    expect(dueDayNotice('2026-10-10')!.text).toBe(`Vence no sábado, 10/10/2026, que não é dia útil. O próximo dia útil é terça, 13/10/2026.${TAIL}`);
    expect(dueDayNotice('2026-10-11')!.text).toBe(`Vence no domingo, 11/10/2026, que não é dia útil. O próximo dia útil é terça, 13/10/2026.${TAIL}`);
    expect(dueDayNotice('2026-10-12')!.text).toBe(
      `Vence na segunda, 12/10/2026, que não é dia útil (feriado nacional: Nossa Senhora Aparecida). O próximo dia útil é terça, 13/10/2026.${TAIL}`,
    );
    expect(dueDayNotice('2026-10-17')!.text).toBe(`Vence no sábado, 17/10/2026, que não é dia útil. O próximo dia útil é segunda, 19/10/2026.${TAIL}`);
    expect(dueDayNotice('2027-01-01')!.text).toBe(
      `Vence na sexta, 01/01/2027, que não é dia útil (feriado nacional: Confraternização Universal). O próximo dia útil é segunda, 04/01/2027.${TAIL}`,
    );
    expect(dueDayNotice('2026-11-02')!.text).toBe(`Vence na segunda, 02/11/2026, que não é dia útil (feriado nacional: Finados). O próximo dia útil é terça, 03/11/2026.${TAIL}`);
    expect(dueDayNotice('2026-11-20')!.text).toContain('(feriado nacional: Dia Nacional de Zumbi e da Consciência Negra)');
  });

  it('feriado que cai em fim de semana mantém o motivo "sábado" ou "domingo" e cita o feriado', () => {
    const sat = dueDayNotice('2027-12-25')!;
    expect([sat.reason, sat.holiday?.name, sat.nextBusinessDay]).toEqual(['sabado', 'Natal', '2027-12-27']);
    expect(sat.text).toBe(`Vence no sábado, 25/12/2027, que não é dia útil (feriado nacional: Natal). O próximo dia útil é segunda, 27/12/2027.${TAIL}`);
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

  it('o sinal da lista é texto e guarda a data cadastrada: "Não é dia útil · vencimento anotado: domingo, 11/10"', () => {
    const n = dueDayNotice('2026-10-11')!;
    expect(n.sign).toBe('Não é dia útil');
    expect(n.signLine).toBe('Não é dia útil · vencimento anotado: domingo, 11/10');
    expect(n.signA11y).toBe('não é dia útil, vencimento anotado domingo, 11/10');
    // Conta do ano (sem tolerância): o sinal manda conferir a data com o órgão.
    const ano = dueDayNotice('2026-10-11', 'conta_do_ano')!;
    expect(ano.signLine).toBe('Não é dia útil · confira a data no carnê ou no site do órgão');
    expect(ano.signA11y).toBe('não é dia útil, confira a data no carnê ou no site do órgão');
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
        expect(n!.text.endsWith(TAIL), d).toBe(true);
        expect(n!.text.includes('feriado nacional'), d).toBe(nationalHolidayOn(d) !== null);
      }
    }
    // 2026 a 2030 têm 1826 dias; 253 + os dias úteis dos outros quatro anos: o total de dias sem expediente fecha com os dois calendários.
    const useful = days('2026-01-01', '2030-12-31').filter(isBusinessDay).length;
    expect(withNotice + useful).toBe(days('2026-01-01', '2030-12-31').length);
  });
});

describe('quando o aviso aparece: conta a pagar, fatura e conta prevista', () => {
  const conta = (
    dueOn: IsoDate,
    over: Partial<Pick<Commitment, 'status' | 'series' | 'invoice'>> = {},
  ): Pick<Commitment, 'status' | 'dueOn' | 'invoice' | 'series'> => ({ status: 'aberto', dueOn, invoice: null, series: null, ...over });

  it('conta em aberto mostra o aviso até o fim do próximo dia útil (D-061); paga ou depois dele, não', () => {
    expect(commitmentDueNotice(conta('2026-10-11'), '2026-10-07')?.text).toContain('Vence no domingo, 11/10/2026');
    expect(commitmentDueNotice(conta('2026-10-11'), '2026-10-11')).not.toBeNull(); // vence hoje (no domingo)
    expect(commitmentDueNotice(conta('2026-10-11'), '2026-10-12')).not.toBeNull(); // segunda é feriado: ainda no prazo
    expect(commitmentDueNotice(conta('2026-10-11'), '2026-10-13')).not.toBeNull(); // terça, o próximo dia útil: último dia
    expect(commitmentDueNotice(conta('2026-10-11'), '2026-10-14')).toBeNull(); // quarta: vencida de verdade
    expect(commitmentDueNotice(conta('2026-10-11', { status: 'quitado' }), '2026-10-07')).toBeNull();
    expect(commitmentDueNotice(conta('2026-10-13'), '2026-10-07')).toBeNull(); // dia útil
  });

  it('o dia que vale é o da sessão: o mesmo instante é terça em São Paulo e quarta em Kiritimati', () => {
    // 2026-10-14T02:30Z: terça, 13/10, em São Paulo e em Rio Branco; quarta, 14/10, em Kiritimati.
    const instant = new Date('2026-10-14T02:30:00Z');
    expect(todayIn('America/Sao_Paulo', instant)).toBe('2026-10-13');
    expect(todayIn('America/Rio_Branco', instant)).toBe('2026-10-13');
    expect(todayIn('Pacific/Kiritimati', instant)).toBe('2026-10-14');
    const c = conta('2026-10-11');
    expect(commitmentDueNotice(c, todayIn('America/Sao_Paulo', instant))).not.toBeNull(); // ainda é o próximo dia útil
    expect(commitmentDueNotice(c, todayIn('Pacific/Kiritimati', instant))).toBeNull(); // lá o próximo dia útil já terminou
    // Meia-noite em São Paulo: um minuto antes ainda é terça.
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-14T02:59:00Z'))).toBe('2026-10-13');
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-14T03:00:00Z'))).toBe('2026-10-14');
    // Conta do ano (sem tolerância): o mesmo instante já a deixa vencida em Kiritimati e ainda no dia em São Paulo, no domingo.
    const sunday = new Date('2026-10-12T02:30:00Z');
    const ano = conta('2026-10-11', { series: { id: 's', number: 1, kind: 'anual', nature: 'conta', installmentTotal: null, partsPerYear: 1 } });
    expect(commitmentDueNotice(ano, todayIn('America/Sao_Paulo', sunday))).not.toBeNull(); // ainda domingo
    expect(commitmentDueNotice(ano, todayIn('Pacific/Kiritimati', sunday))).toBeNull(); // lá já é segunda
  });

  it('fatura de cartão: só aberta ou fechada, com valor a pagar, até o fim do próximo dia útil', () => {
    const f = (situation: 'aberta' | 'fechada' | 'paga' | 'paga_em_parte', dueOn: IsoDate, totalCents = 50_000) => ({ situation, dueOn, totalCents });
    expect(invoiceDueNotice(f('fechada', '2026-11-15'), '2026-11-05')?.text).toContain('Vence no domingo, 15/11/2026');
    expect(invoiceDueNotice(f('fechada', '2026-11-15'), '2026-11-05')?.text).toContain('(feriado nacional: Proclamação da República)');
    expect(invoiceDueNotice(f('aberta', '2026-11-15'), '2026-10-07')).not.toBeNull();
    expect(invoiceDueNotice(f('paga', '2026-11-15'), '2026-11-05')).toBeNull();
    expect(invoiceDueNotice(f('paga_em_parte', '2026-11-15'), '2026-11-05')).toBeNull();
    expect(invoiceDueNotice(f('fechada', '2026-11-15', 0), '2026-11-05')).toBeNull();
    expect(invoiceDueNotice(f('fechada', '2026-11-15'), '2026-11-16')).not.toBeNull(); // segunda, o próximo dia útil: ainda no prazo
    expect(invoiceDueNotice(f('fechada', '2026-11-15'), '2026-11-17')).toBeNull(); // terça: vencida
    expect(invoiceDueNotice(f('fechada', '2026-11-16'), '2026-11-05')).toBeNull(); // segunda útil
  });

  it('conta prevista de gasto fixo: aviso até o fim do próximo dia útil; conta do ano, só até a data', () => {
    expect(plannedDueNotice('2026-11-15', '2026-10-07')).not.toBeNull();
    expect(plannedDueNotice('2026-11-15', '2026-11-16')).not.toBeNull();
    expect(plannedDueNotice('2026-11-15', '2026-11-17')).toBeNull();
    expect(plannedDueNotice('2026-11-16', '2026-10-07')).toBeNull();
    expect(plannedDueNotice('2026-11-15', '2026-11-15', 'conta_do_ano')).not.toBeNull();
    expect(plannedDueNotice('2026-11-15', '2026-11-16', 'conta_do_ano')).toBeNull();
  });
});

describe('a data de vencimento calculada não muda (D-060 item 3)', () => {
  it('conta avulsa, gasto fixo, parcelamento e conta do ano em fim de semana ou feriado mantêm o vencimento e os totais de outubro a dezembro', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    // Ainda a pagar de outubro, novembro e dezembro de 2026 (a soma que a tela mostra para cada mês).
    const totals = async () => {
      const out: number[] = [];
      for (const m of ['2026-10', '2026-11', '2026-12'] as const) out.push(summarizeToPay(await repo.listCommitments(ctx, m), ctx, m, DEMO_TODAY).toPayCents);
      return out;
    };
    const before = await totals();
    const toPayBefore = before[0]!;

    // Conta avulsa em um domingo: continua em 11/10 e conta em Ainda a pagar de outubro.
    const avulsa = await repo.createCommitment(newOperationKey(), ctx, { description: 'Condomínio extra', amountCents: 10_000, dueOn: '2026-10-11', category: 'Moradia' });
    expect(avulsa.commitment.dueOn).toBe('2026-10-11');
    expect((await repo.getCommitment(avulsa.commitment.id))!.dueOn).toBe('2026-10-11');
    expect(summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY).toPayCents).toBe(toPayBefore + 10_000);
    expect(await totals()).toEqual([before[0]! + 10_000, before[1]!, before[2]!]);

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
    // Os totais contam as duas contas do gasto fixo nos meses do vencimento calculado (15/10 e 15/11), não no próximo dia útil (16/11).
    expect(await totals()).toEqual([before[0]! + 10_000 + 9_000, before[1]! + 9_000, before[2]!]);

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
    expect(commitmentDueNotice(parcelas[0]!, DEMO_TODAY)?.text).toBe(`Vence no sábado, 17/10/2026, que não é dia útil. O próximo dia útil é segunda, 19/10/2026.${TAIL}`);
    expect(await totals()).toEqual([before[0]! + 10_000 + 9_000 + 40_000, before[1]! + 9_000 + 40_000, before[2]!]);

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
    // A conta do ano entra em dezembro com o valor e o vencimento de sempre (25/12/2026), e os totais de outubro e novembro não mudam.
    expect(anuais[0]!.amountCents).toBe(120_000);
    expect(await totals()).toEqual([before[0]! + 10_000 + 9_000 + 40_000, before[1]! + 9_000 + 40_000, before[2]! + 120_000]);
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

  it('a assinatura do aviso agendado leva o corpo: um lembrete já agendado com o texto antigo é reagendado', () => {
    const [novo] = reminderPlan([conta('2026-10-11', 1)], '2026-10-07', 9);
    expect(reminderSignature(novo!)).toBe('2026-10-10T09:00|1|Você tem 1 conta com vencimento amanhã, que não é dia útil.');
    // O mesmo aviso, agendado antes da frase nova, tinha o corpo antigo: a assinatura difere e o aparelho troca o aviso.
    const antigo = { ...novo!, body: reminderBody(1) };
    expect(reminderSignature(antigo)).toBe('2026-10-10T09:00|1|Você tem 1 conta com vencimento amanhã.');
    expect(reminderSignature(antigo)).not.toBe(reminderSignature(novo!));
    // Aviso igual, assinatura igual; dia, hora e contagem seguem mudando a assinatura; dia útil não ganha a frase.
    expect(reminderSignature({ ...novo! })).toBe(reminderSignature(novo!));
    expect(reminderSignature({ ...novo!, fireAt: '2026-10-10T12:00' })).not.toBe(reminderSignature(novo!));
    expect(reminderSignature({ ...novo!, count: 2 })).not.toBe(reminderSignature(novo!));
    const [util] = reminderPlan([conta('2026-10-13', 2)], '2026-10-07', 9);
    expect(reminderSignature(util!)).toBe('2026-10-12T09:00|1|Você tem 1 conta com vencimento amanhã.');
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

// ---------------------------------------------------------------------------------------------------------------------
// D-061 (Ciclo T2): padrão de mercado para vencimento em dia que não é útil
// ---------------------------------------------------------------------------------------------------------------------

/** Conta a pagar completa, para montar casos de fim de semana e feriado sem passar pelo repositório. */
function bill(dueOn: IsoDate, over: Partial<Commitment> = {}): Commitment {
  return {
    id: `c-${dueOn}`,
    contextId: 'ctx',
    description: 'Escola',
    amountCents: 10_000,
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
    ...over,
  } as Commitment;
}

const serie = (kind: 'mensal' | 'parcelada' | 'anual') =>
  ({ id: 's1', number: 1, kind, nature: kind === 'parcelada' ? 'compra_parcelada' : 'conta', installmentTotal: kind === 'parcelada' ? 10 : null, partsPerYear: kind === 'anual' ? 1 : null }) as Commitment['series'];

const TOLERANT = ['conta', 'fatura', 'gasto_fixo', 'parcelamento'] as const;

describe('vencida só depois do próximo dia útil: effectiveOverdue (D-061)', () => {
  it('sábado, domingo e feriado na segunda (10, 11 e 12/10/2026): vence na terça 13/10 e só fica vencida na quarta 14/10, em todo tipo com tolerância', () => {
    for (const kind of TOLERANT) {
      for (const due of ['2026-10-10', '2026-10-11', '2026-10-12'] as const) {
        for (const today of ['2026-10-05', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'] as const) expect(effectiveOverdue(due, kind, today), `${kind} ${due} em ${today}`).toBe(false);
        expect(effectiveOverdue(due, kind, '2026-10-14'), `${kind} ${due}`).toBe(true);
        expect(lastOnTimeDay(due, kind)).toBe('2026-10-13');
      }
    }
  });

  it('dia útil não ganha nada: vencida no dia seguinte, como sempre', () => {
    for (const kind of DUE_KINDS) {
      expect(effectiveOverdue('2026-10-15', kind, '2026-10-15'), kind).toBe(false);
      expect(effectiveOverdue('2026-10-15', kind, '2026-10-16'), kind).toBe(true);
      expect(lastOnTimeDay('2026-10-15', kind)).toBe('2026-10-15');
    }
  });

  it('sexta feriado seguida de fim de semana: 01/05/2026, 20/11/2026, 25/12/2026 e 01/01/2027 só vencem depois da segunda útil', () => {
    const cases: [IsoDate, IsoDate][] = [
      ['2026-05-01', '2026-05-04'],
      ['2026-11-20', '2026-11-23'],
      ['2026-12-25', '2026-12-28'],
      ['2027-01-01', '2027-01-04'],
    ];
    for (const [due, monday] of cases) {
      expect(weekdayOf(due), due).toBe(5);
      expect(weekdayOf(monday), monday).toBe(1);
      for (const day of days(due, monday)) expect(effectiveOverdue(due, 'conta', day), `${due} em ${day}`).toBe(false);
      expect(effectiveOverdue(due, 'conta', addDays(monday, 1)), due).toBe(true);
      // Conta do ano: sem tolerância, vencida já no dia seguinte (sábado).
      expect(effectiveOverdue(due, 'conta_do_ano', due), due).toBe(false);
      expect(effectiveOverdue(due, 'conta_do_ano', addDays(due, 1)), due).toBe(true);
    }
  });

  it('31/12 em sábado ou domingo: vence no próximo dia útil do ano seguinte (02/01 ou 03/01) e fica vencida no dia depois dele', () => {
    const cases: [IsoDate, IsoDate][] = [
      ['2022-12-31', '2023-01-02'], // sábado; 01/01/2023 é domingo
      ['2033-12-31', '2034-01-02'], // sábado
      ['2028-12-31', '2029-01-02'], // domingo; 01/01/2029 é segunda e feriado
      ['2027-12-31', '2027-12-31'], // sexta útil: o próprio dia
    ];
    for (const [due, last] of cases) {
      expect(lastOnTimeDay(due, 'conta'), due).toBe(last);
      expect(effectiveOverdue(due, 'conta', last), due).toBe(false);
      expect(effectiveOverdue(due, 'conta', addDays(last, 1)), due).toBe(true);
    }
    // 2022-12-31 (sábado): em 01/01/2023 e 02/01/2023 ainda está no prazo; em 03/01/2023, vencida.
    expect(effectiveOverdue('2022-12-31', 'conta', '2023-01-01')).toBe(false);
    expect(effectiveOverdue('2022-12-31', 'conta', '2023-01-03')).toBe(true);
  });

  it('conta do ano (IPVA, IPTU, matrícula e outras): nenhuma tolerância, vencida a partir do dia seguinte à data cadastrada', () => {
    expect(hasGrace('conta_do_ano')).toBe(false);
    for (const due of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-12-25']) {
      expect(lastOnTimeDay(due, 'conta_do_ano'), due).toBe(due);
      expect(effectiveOverdue(due, 'conta_do_ano', due), due).toBe(false);
      expect(effectiveOverdue(due, 'conta_do_ano', addDays(due, 1)), due).toBe(true);
    }
    for (const kind of TOLERANT) expect(hasGrace(kind), kind).toBe(true);
  });

  it('data inválida: sem tolerância e sem erro (compara o texto, como antes)', () => {
    expect(lastOnTimeDay('2026-02-30', 'conta')).toBe('2026-02-30');
    expect(effectiveOverdue('2026-02-30', 'conta', '2026-10-07')).toBe(true);
  });

  it('o tipo de cobrança sai da conta: avulsa, fatura, gasto fixo, parcelamento e conta do ano', async () => {
    expect(dueKindOf(bill('2026-10-10'))).toBe('conta');
    expect(dueKindOf(bill('2026-10-10', { invoice: { cardId: 'k', month: '2026-10', closingOn: '2026-10-03' } }))).toBe('fatura');
    expect(dueKindOf(bill('2026-10-10', { series: serie('mensal') }))).toBe('gasto_fixo');
    expect(dueKindOf(bill('2026-10-10', { series: serie('parcelada') }))).toBe('parcelamento');
    expect(dueKindOf(bill('2026-10-10', { series: serie('anual') }))).toBe('conta_do_ano');
    expect([dueKindOfSeries('mensal'), dueKindOfSeries('parcelada'), dueKindOfSeries('anual')]).toEqual(['gasto_fixo', 'parcelamento', 'conta_do_ano']);
    // Contas de verdade, criadas pelo repositório: a mesma ocorrência, com a série lida pela junção.
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const mk = async (kind: 'mensal' | 'parcelada' | 'anual', description: string, extra: object) => {
      const w = await repo.createSeries(newOperationKey(), ctx, {
        kind,
        nature: kind === 'parcelada' ? 'compra_parcelada' : 'conta',
        description,
        category: 'Moradia',
        amountCents: 10_000,
        amountMode: 'fixo',
        dueDay: 10,
        firstDueMonth: '2026-10',
        firstNumber: 1,
        installmentTotal: kind === 'parcelada' ? 6 : null,
        partsPerYear: kind === 'anual' ? 1 : null,
        lastMonth: null,
        ...extra,
      });
      return (await repo.listSeriesOccurrences(w.series.id))[0]!;
    };
    expect(dueKindOf(await mk('mensal', 'Academia', {}))).toBe('gasto_fixo');
    expect(dueKindOf(await mk('parcelada', 'Sofá', {}))).toBe('parcelamento');
    expect(dueKindOf(await mk('anual', 'IPTU', {}))).toBe('conta_do_ano');
    const demoInvoice = (await repo.listCommitments(ctx, '2026-11')).find((c) => c.invoice);
    expect(demoInvoice && dueKindOf(demoInvoice)).toBe('fatura');
  });

  it('o dia da sessão decide: o mesmo instante é terça em São Paulo (último dia) e quarta em Kiritimati (vencida)', () => {
    const instant = new Date('2026-10-14T02:30:00Z');
    const sp = todayIn('America/Sao_Paulo', instant);
    const ki = todayIn('Pacific/Kiritimati', instant);
    expect([sp, ki]).toEqual(['2026-10-13', '2026-10-14']);
    expect(effectiveOverdue('2026-10-11', 'conta', sp)).toBe(false);
    expect(effectiveOverdue('2026-10-11', 'conta', ki)).toBe(true);
    // Muda com o TZ do aparelho? Não: a regra só usa a data civil recebida.
    const before = process.env.TZ;
    try {
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Honolulu', 'UTC']) {
        process.env.TZ = tz;
        expect(effectiveOverdue('2026-10-11', 'conta', '2026-10-13'), tz).toBe(false);
        expect(effectiveOverdue('2026-10-11', 'conta', '2026-10-14'), tz).toBe(true);
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

function hasGrace(kind: (typeof DUE_KINDS)[number]): boolean {
  return lastOnTimeDay('2026-10-10', kind) !== '2026-10-10';
}

describe('a etiqueta "Vence terça, 13/10 (próximo dia útil)" (D-061)', () => {
  it('nextBusinessDayDueText: o próximo dia útil com o dia da semana, "hoje" no último dia, e nada em dia útil, em conta do ano ou já vencida', () => {
    expect(nextBusinessDayDueText('2026-10-11', 'conta', '2026-10-07')).toBe('Vence terça, 13/10 (próximo dia útil)');
    expect(nextBusinessDayDueText('2026-10-10', 'fatura', '2026-10-12')).toBe('Vence terça, 13/10 (próximo dia útil)');
    expect(nextBusinessDayDueText('2026-10-11', 'gasto_fixo', '2026-10-13')).toBe('Vence hoje (próximo dia útil)');
    expect(nextBusinessDayDueText('2026-10-17', 'parcelamento', '2026-10-07')).toBe('Vence segunda, 19/10 (próximo dia útil)');
    expect(nextBusinessDayDueText('2026-10-11', 'conta', '2026-10-14')).toBeNull(); // vencida
    expect(nextBusinessDayDueText('2026-10-15', 'conta', '2026-10-07')).toBeNull(); // dia útil
    expect(nextBusinessDayDueText('2026-10-11', 'conta_do_ano', '2026-10-07')).toBeNull(); // sem tolerância
    expect(nextBusinessDayDueText('2026-02-30', 'conta', '2026-10-07')).toBeNull();
    expect(nextBusinessDayWhen('2026-12-31', 'conta', '2026-12-01')).toBeNull();
    expect(nextBusinessDayWhen('2028-12-31', 'conta', '2028-12-01')).toEqual({ lastOnTime: '2029-01-02', when: 'terça, 02/01 (próximo dia útil)' });
  });

  it('commitmentSituation e dueText: a vencer até o próximo dia útil, "vence hoje" nele e vencida depois; a data cadastrada segue em "Venceu em"', () => {
    const c = bill('2026-10-11');
    const row = (today: IsoDate) => [commitmentSituation(c, today), dueText(c, today)];
    expect(row('2026-10-07')).toEqual(['a_vencer', 'Vence terça, 13/10 (próximo dia útil)']);
    expect(row('2026-10-11')).toEqual(['a_vencer', 'Vence terça, 13/10 (próximo dia útil)']);
    expect(row('2026-10-12')).toEqual(['a_vencer', 'Vence terça, 13/10 (próximo dia útil)']);
    expect(row('2026-10-13')).toEqual(['vence_hoje', 'Vence hoje (próximo dia útil)']);
    expect(row('2026-10-14')).toEqual(['vencida', 'Venceu em 11/10/2026']);
    // Conta do ano: vencida a partir do dia seguinte à data cadastrada, e o texto de sempre.
    const ano = bill('2026-10-11', { series: serie('anual') });
    expect([commitmentSituation(ano, '2026-10-11'), dueText(ano, '2026-10-11')]).toEqual(['vence_hoje', 'Vence hoje']);
    expect([commitmentSituation(ano, '2026-10-12'), dueText(ano, '2026-10-12')]).toEqual(['vencida', 'Venceu em 11/10/2026']);
    // Paga nunca é vencida.
    expect(commitmentSituation(bill('2026-10-11', { status: 'quitado' }), '2026-10-20')).toBe('paga');
  });

  it('toPayCaption (Resumo e Seu mês): a conta no próximo dia útil não é vencida e a legenda usa a etiqueta', () => {
    const one = summarizeToPay([bill('2026-10-11')], 'ctx', '2026-10', '2026-10-07');
    expect(toPayCaption(one, '2026-10-07').main).toBe('Escola · vence terça, 13/10 (próximo dia útil)');
    const onThe13th = summarizeToPay([bill('2026-10-11')], 'ctx', '2026-10', '2026-10-13');
    expect(toPayCaption(onThe13th, '2026-10-13').main).toBe('Escola · vence hoje (próximo dia útil)');
    const late = summarizeToPay([bill('2026-10-11')], 'ctx', '2026-10', '2026-10-14');
    expect(toPayCaption(late, '2026-10-14').main).toBe('Escola · venceu em 11/10');
    const two = summarizeToPay([bill('2026-10-11'), bill('2026-10-20', { id: 'b', description: 'Luz' })], 'ctx', '2026-10', '2026-10-12');
    expect(toPayCaption(two, '2026-10-12')).toMatchObject({ main: '2 contas · próxima: Escola, terça, 13/10 (próximo dia útil)', overdue: null });
    const twoLate = summarizeToPay([bill('2026-10-11'), bill('2026-10-20', { id: 'b', description: 'Luz' })], 'ctx', '2026-10', '2026-10-14');
    expect(toPayCaption(twoLate, '2026-10-14')).toMatchObject({ main: '2 contas · próxima: Luz, 20/10', overdue: '1 conta vencida' });
  });

  it('o aviso do detalhe: com tolerância manda conferir com quem cobra; conta do ano manda conferir o carnê ou o site do órgão', () => {
    const grace = dueDayNotice('2026-12-25')!;
    expect(grace.grace).toBe(true);
    expect(grace.lastOnTimeDay).toBe('2026-12-28');
    expect(grace.advice).toBe('Confira com quem cobra se o pagamento pode ser feito no próximo dia útil.');
    const ano = dueDayNotice('2026-12-25', 'conta_do_ano')!;
    expect(ano.grace).toBe(false);
    expect(ano.lastOnTimeDay).toBe('2026-12-25');
    expect(ano.text).toBe(
      'Vence na sexta, 25/12/2026, que não é dia útil (feriado nacional: Natal). Em conta do ano, o Clarevo não usa o próximo dia útil: ela passa a vencida a partir do dia seguinte ao vencimento.',
    );
    expect(ano.advice).toBe('Impostos podem ter regra diferente. Confira a data no carnê ou no site do órgão.');
    expect(ano.a11y).toBe(`${ano.text} ${ano.advice}`);
    expect(DUE_DAY_TEXT.adviceYearBill).toBe(ano.advice);
    // O aviso da conta do ano some depois da data; o das outras, depois do próximo dia útil.
    const c = bill('2026-12-25', { series: serie('anual') });
    expect(commitmentDueNotice(c, '2026-12-25')?.advice).toBe(ano.advice);
    expect(commitmentDueNotice(c, '2026-12-26')).toBeNull();
    expect(commitmentDueNotice(bill('2026-12-25'), '2026-12-28')?.advice).toBe(grace.advice);
    expect(commitmentDueNotice(bill('2026-12-25'), '2026-12-29')).toBeNull();
  });

  it('"Saiba mais" cita a Lei 7.089/1983, a multa e as regras que variam, o juro desde a data original e o entendimento do STJ, com as fontes e a consulta', () => {
    const more = DUE_DAY_TEXT.learnMoreParagraphs.join(' ');
    expect(more).toContain('A Lei nº 7.089/1983 proíbe bancos e instituições financeiras de cobrar juros de mora');
    expect(more).toContain('A multa e as regras de cada cobrança podem variar');
    expect(more).toContain('confira com quem cobra');
    expect(more).toContain('Se o pagamento passar do primeiro dia útil, os juros podem contar desde a data original do vencimento: é o entendimento do STJ');
    expect(more).toContain('Contas do ano, como IPVA, IPTU e matrícula, costumam ser tributos e não ganham essa tolerância');
    expect(more).toContain('Impostos podem ter regra diferente. Confira a data no carnê ou no site do órgão.');
    expect(more).toContain('"Vence terça, 13/10 (próximo dia útil)"');
    expect(DUE_DAY_TEXT.source).toContain(DUE_RULE_LAW);
    expect(DUE_DAY_TEXT.source).toContain('REsp 1.954.924');
    expect(DUE_DAY_TEXT.source).toContain('Consultadas em 19/10/2026.');
  });
});

describe('os lugares que decidem "vencida" seguem a regra (D-061)', () => {
  it('Ainda a pagar: o total, a ordem e o mês não mudam; só a conta vencida passa de lugar depois do próximo dia útil', () => {
    const list = [bill('2026-10-10', { id: 'a', description: 'Sábado' }), bill('2026-10-05', { id: 'b', description: 'Segunda útil' }), bill('2026-10-20', { id: 'c', description: 'Terça' })];
    const names = (xs: Commitment[]) => xs.map((c) => c.description);
    const mon = summarizeToPay(list, 'ctx', '2026-10', '2026-10-12');
    const wed = summarizeToPay(list, 'ctx', '2026-10', '2026-10-14');
    for (const s of [mon, wed]) {
      expect(names(s.items)).toEqual(['Segunda útil', 'Sábado', 'Terça']);
      expect([s.toPayCents, s.dueInMonthCents, s.overdueBeforeCents]).toEqual([30_000, 30_000, 0]);
    }
    expect([names(mon.overdue), names(mon.upcomingInMonth), mon.overdueCount, mon.nextDue?.description]).toEqual([['Segunda útil'], ['Sábado', 'Terça'], 1, 'Sábado']);
    expect([names(wed.overdue), names(wed.upcomingInMonth), wed.overdueCount, wed.nextDue?.description]).toEqual([['Segunda útil', 'Sábado'], ['Terça'], 2, 'Terça']);
  });

  it('o mesmo total e a mesma renda comprometida com a conta em dia que não é útil, antes e depois do próximo dia útil', () => {
    const list = [bill('2026-10-10', { id: 'a' }), bill('2026-10-20', { id: 'c' })];
    const committed = (today: IsoDate) => summarizeCommitted(list, 'ctx', '2026-10', today, []);
    expect(committed('2026-10-12').committedCents).toBe(committed('2026-10-14').committedCents);
    expect(committed('2026-10-12').committedCents).toBe(20_000);
  });

  it('"vencidas antes do mês": o total segue a data cadastrada, e o texto só diz "vencidas" quando todas já venceram de verdade', () => {
    // 31/10/2026 é sábado e 02/11 é feriado: a conta fica no prazo até terça, 03/11.
    const list = [bill('2026-10-31', { id: 'a' }), bill('2026-11-10', { id: 'b', description: 'Luz' })];
    const early = summarizeToPay(list, 'ctx', '2026-11', '2026-11-02');
    expect(early.overdueBeforeCents).toBe(10_000);
    expect(early.overdueCount).toBe(0);
    expect(toPayCaption(early, '2026-11-02').includes).toBe('Inclui R$ 100,00 de contas com vencimento antes de novembro.');
    const late = summarizeToPay(list, 'ctx', '2026-11', '2026-11-04');
    expect(late.overdueBeforeCents).toBe(10_000);
    expect(late.overdueCount).toBe(1);
    expect(toPayCaption(late, '2026-11-04').includes).toBe('Inclui R$ 100,00 de contas vencidas antes de novembro.');
    // Renda comprometida: o mesmo critério no texto.
    expect(committedTexts(summarizeCommitted(list, 'ctx', '2026-11', '2026-11-02', [])).overdueBefore).toBe(
      'Além disso, R$ 100,00 de contas com vencimento antes de novembro continuam em aberto. Elas contam no mês do vencimento.',
    );
    expect(committedTexts(summarizeCommitted(list, 'ctx', '2026-11', '2026-11-04', [])).overdueBefore).toBe(
      'Além disso, R$ 100,00 de contas vencidas antes de novembro continuam em aberto. Elas contam no mês do vencimento.',
    );
    expect(COMMITTED_TEXT.overdueBefore(4_000, '2026-10')).toContain('contas vencidas antes de outubro');
  });

  it('"Já paguei" e "Informar valor e pagar" valem até o fim do próximo dia útil; depois, só a revisão de vencidas', () => {
    const c = bill('2026-10-10');
    expect(quickPayAction(c, '2026-10-12')).toBe('pagar');
    expect(quickPayAction(c, '2026-10-13')).toBe('pagar');
    expect(quickPayAction(c, '2026-10-14')).toBeNull();
    expect(quickPayAction(bill('2026-10-10', { amountIsEstimate: true }), '2026-10-13')).toBe('informar');
  });

  it('fatura do cartão: "Vencida" só depois do próximo dia útil (vencimento em 10/01/2027, domingo), e o texto da fatura usa a etiqueta', () => {
    const card: Card = {
      id: 'c1', contextId: 'x', name: 'Cartão', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null, status: 'ativo', createdBy: 'p', version: 1,
      createdAt: '', updatedAt: '', usedCents: 0, currentMonth: '2027-01', currentClosingOn: '2027-01-03', currentDueOn: '2027-01-10',
    };
    const entry = {
      id: 'e1', contextId: 'x', cardId: 'c1', kind: 'encargo' as const, description: null, category: null, chargeType: 'juros' as const, purchasedOn: null,
      amountCents: 30_000, installments: 1, invoiceMonth: '2027-01', sourceMonth: null, paymentRecordId: null, receiptKey: null, createdBy: 'p', version: 1,
      createdAt: '2026-12-07T00:00:00Z', updatedAt: '2026-12-07T00:00:00Z',
    };
    const at = (today: IsoDate) => buildInvoices(card, [entry], [], today)[0]!;
    expect(at('2027-01-05')).toMatchObject({ dueOn: '2027-01-10', situation: 'fechada', overdue: false });
    expect(at('2027-01-10').overdue).toBe(false);
    expect(at('2027-01-11').overdue).toBe(false); // segunda: o próximo dia útil
    expect(at('2027-01-12').overdue).toBe(true);
    expect(invoiceTexts(at('2027-01-05'), '2027-01-05').due).toBe('Vence segunda, 11/01 (próximo dia útil)');
    expect(invoiceTexts(at('2027-01-11'), '2027-01-11')).toMatchObject({ due: 'Vence hoje (próximo dia útil)', situation: 'Fechada' });
    expect(invoiceTexts(at('2027-01-12'), '2027-01-12')).toMatchObject({ due: 'Venceu em 10/01', situation: 'Vencida' });
    expect(dueTextOf('2027-01-10', '2027-01-07')).toBe('Vence segunda, 11/01 (próximo dia útil)');
    expect(dueTextOf('2026-11-10', '2026-11-05')).toBe('Vence em 10/11');
    expect(invoiceDueNotice(at('2027-01-11'), '2027-01-11')).not.toBeNull();
    expect(invoiceDueNotice(at('2027-01-12'), '2027-01-12')).toBeNull();
  });

  it('revisão dos últimos meses: em "Este mês" só entram as contas vencidas de verdade', () => {
    const window: ReturnWindow = { kind: 'ausencia', anchor: '2026-05-20', returnedOn: null, fromMonth: '2026-10', toMonth: '2026-09', currentMonth: '2026-10', cutBefore: null };
    const list = [
      bill('2026-10-10', { id: 'sab', description: 'Sábado' }),
      bill('2026-10-05', { id: 'seg', description: 'Segunda útil' }),
      bill('2026-10-10', { id: 'ano', description: 'IPTU', series: serie('anual') }),
    ];
    const rows = (today: IsoDate) => buildReturnReview(window, [], list, [], today).current.rows.map((r) => r.description);
    expect(rows('2026-10-12')).toEqual(['Segunda útil', 'IPTU']); // o sábado ainda está no prazo; a conta do ano já venceu
    expect(rows('2026-10-14')).toEqual(['Segunda útil', 'IPTU', 'Sábado']); // por vencimento; a série vem antes da avulsa no mesmo dia
  });

  it('widget: a contagem de vencidas e o prazo da próxima conta seguem o próximo dia útil', () => {
    const list = [bill('2026-10-10', { id: 'a', description: 'Escola' }), bill('2026-10-20', { id: 'c', description: 'Luz' })];
    const at = (today: IsoDate, showValues = true) =>
      buildWidgetContent({ today, signedIn: true, demo: false, showValues, toPay: summarizeToPay(list, 'ctx', '2026-10', today) }).medium;
    const inGrace = at('2026-10-08');
    expect([inGrace.overdue, inGrace.next?.line]).toEqual([null, 'Escola · 13/10 · R$ 100,00']);
    expect(at('2026-10-08', false).next?.line).toBe('Próxima conta · em 5 dias');
    const sunday = at('2026-10-12');
    expect([sunday.overdue, sunday.next?.line]).toEqual([null, 'Escola · amanhã · R$ 100,00']);
    const lastDay = at('2026-10-13');
    expect([lastDay.overdue, lastDay.next?.line]).toEqual([null, 'Escola · hoje · R$ 100,00']);
    const late = at('2026-10-14');
    expect([late.overdue, late.next?.line]).toEqual(['1 vencida', 'Luz · 20/10 · R$ 100,00']);
  });

  it('"Calcular multa e juros": só em conta vencida de verdade, com os dias contados da data cadastrada', () => {
    expect(multaLink({ status: 'aberto', dueOn: '2026-10-10', amountCents: 10_000 }, '2026-10-13')).toBeNull();
    expect(multaLink({ status: 'aberto', dueOn: '2026-10-10', amountCents: 10_000 }, '2026-10-14')).toMatchObject({ valorCents: 10_000, dias: 4 });
    expect(multaLink({ status: 'aberto', dueOn: '2026-10-10', amountCents: 10_000, series: serie('anual'), invoice: null }, '2026-10-11')).toMatchObject({ dias: 1 });
  });

  it('o lembrete continua na data original: o aviso de uma conta de domingo sai no sábado, e o corpo diz que não é dia útil', () => {
    const [item] = reminderPlan([bill('2026-10-11')], '2026-10-07', 9);
    expect([item!.fireAt, item!.dueOn]).toEqual(['2026-10-10T09:00', '2026-10-11']);
    expect(item!.body).toBe('Você tem 1 conta com vencimento amanhã, que não é dia útil.');
  });

  it('gasto fixo criado depois de um tempo: a conta no próximo dia útil não entra em "criou contas que já venceram"', async () => {
    const volta = async (back: IsoDate) => {
      let today = '2026-07-20';
      const repo = new MemoryRepository({ actorId: 'pessoa-1', displayName: 'Maria', today: () => today });
      const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
      await repo.createSeries(newOperationKey(), ctx, {
        kind: 'mensal', nature: 'conta', description: 'Clube', category: 'Lazer', amountCents: 5_000, amountMode: 'fixo', dueDay: 10,
        firstDueMonth: '2026-07', firstNumber: 1, installmentTotal: null, partsPerYear: null, lastMonth: null,
      });
      today = back;
      return repo.syncSeriesOccurrences(ctx);
    };
    // Volta em 12/10: setembro (quinta, 10/09), outubro (sábado, 10/10) e novembro entram; só a de setembro venceu de verdade.
    expect(await volta('2026-10-12')).toEqual({ created: 3, createdOverdue: 1 });
    // Em 14/10 a de outubro, que cai em sábado, também passou do próximo dia útil (terça, 13/10).
    expect(await volta('2026-10-14')).toEqual({ created: 3, createdOverdue: 2 });
  });
});

describe('fontes da regra do próximo dia útil (D-061)', () => {
  it('a Lei 7.089/1983 e a notícia do STJ têm domínio aceito, trecho que diz que a página não abriu, e a consulta de 19/10/2026', () => {
    expect(DUE_RULE_SOURCES).toHaveLength(2);
    expect(DUE_RULE_CONSULTED_ON).toBe('2026-10-19');
    for (const src of DUE_RULE_SOURCES) {
      expect(src.kind).toBe('oficial');
      expect(isAllowedSourceUrl(src.url, 'oficial', 'dia-util'), src.url).toBe(true);
      expect(src.locator).toContain('a página não abriu');
      expect(src.locator.length).toBeGreaterThan(60);
      expect(src.consultedOn).toBe(DUE_RULE_CONSULTED_ON);
    }
    expect(DUE_RULE_SOURCES[0]!.url).toBe('https://www.planalto.gov.br/ccivil_03/leis/l7089.htm');
    expect(DUE_RULE_SOURCES[0]!.title).toContain('Lei nº 7.089');
    expect(DUE_RULE_SOURCES[0]!.locator).toContain('juros de mora');
    expect(DUE_RULE_SOURCES[0]!.locator).toContain('não menciona multa');
    expect(DUE_RULE_SOURCES[1]!.url.startsWith('https://www.stj.jus.br/')).toBe(true);
    expect(DUE_RULE_SOURCES[1]!.title).toContain('Notícia do STJ');
    expect(DUE_RULE_SOURCES[1]!.title).toContain('não o acórdão');
    expect(DUE_RULE_LAW).toBe('Lei nº 7.089/1983');
  });

  it('docs/09 registra as duas fontes da regra, a consulta, o que a lei não diz e o 2 de novembro "a conferir"', () => {
    const text = readFileSync(`${DOCS}09_APRENDER.md`, 'utf8');
    for (const src of DUE_RULE_SOURCES) expect(text, src.url).toContain(src.url);
    for (const needle of ['Lei nº 7.089', 'REsp 1.954.924', 'entendimento do STJ', 'notícia', 'não menciona multa', '19/10/2026', 'a conferir']) expect(text, needle).toContain(needle);
    // Nenhuma data de início do 2 de novembro afirmada sem fonte: a tabela diz "a conferir".
    expect(text).toMatch(/2 de novembro \| Finados \|[^\n]*\| a conferir/);
  });

  it('docs/00 registra D-061 com a decisão de Enzo, a exceção das contas do ano e a ausência de migração', () => {
    const text = readFileSync(`${DOCS}00_VISAO_E_DECISOES.md`, 'utf8');
    expect(text).toContain('| D-061 | 19/10/2026 |');
    for (const needle of ['Podemos seguir por um padrão de mercado', 'Lei 7.089/1983', 'próximo dia útil', 'contas do ano', 'sem migração']) expect(text, needle).toContain(needle);
  });
});
