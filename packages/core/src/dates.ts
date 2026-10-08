/** Data civil AAAA-MM-DD, sem hora e sem fuso. Nunca converter via Date local para não mudar o dia. */
export type IsoDate = string;
/** Mês AAAA-MM. */
export type IsoMonth = string;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function isValidIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

/** Dias do mês (mo de 1 a 12). */
function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** "07/10/2026" → "2026-10-07". Data impossível (31/09) ou formato inválido → null. */
export function parseDateBR(input: string): IsoDate | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(input);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** "2026-10-07" → "07/10/2026". */
export function formatDateBR(iso: IsoDate): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "2026-10-15" → "15/10". */
export function formatDayMonth(iso: IsoDate): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** "2026-10-07" → "7 out". */
export function formatShortDate(iso: IsoDate): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${(MONTHS[Number(m) - 1] ?? '').slice(0, 3)}`;
}

/** Fuso horário do aparelho (ex.: America/Rio_Branco); São Paulo se não for possível descobrir. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

/** Dia atual no fuso da pessoa (ex.: America/Sao_Paulo), como data civil. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Soma dias a uma data civil sem passar pelo fuso local. */
export function addDays(date: IsoDate, delta: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Máscara de data enquanto a pessoa digita: "06102026" vira "06/10/2026". */
export function maskDateBR(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  return d.slice(0, 2) + (d.length > 2 ? `/${d.slice(2, 4)}` : '') + (d.length > 4 ? `/${d.slice(4)}` : '');
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function isValidIsoMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Meses entre dois meses (to − from): meses(m1, m2) = (ano2·12 + mês2) − (ano1·12 + mês1). */
export function monthsBetween(from: IsoMonth, to: IsoMonth): number {
  const [y1, m1] = from.split('-').map(Number) as [number, number];
  const [y2, m2] = to.split('-').map(Number) as [number, number];
  return y2 * 12 + m2 - (y1 * 12 + m1);
}

/** Dia escolhido (1 a 31) no mês, limitado ao último dia: dia 31 em fevereiro de 2028 → "2028-02-29". */
export function dateInMonth(month: IsoMonth, day: number): IsoDate {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`;
}

/** "11/2026" → "2026-11". Mês impossível ou formato inválido → null. */
export function parseMonthBR(input: string): IsoMonth | null {
  const m = /^\s*(\d{1,2})\/(\d{4})\s*$/.exec(input);
  if (!m) return null;
  const month = `${m[2]}-${m[1]!.padStart(2, '0')}`;
  return isValidIsoMonth(month) ? month : null;
}

/** "2026-11" → "11/2026" (campo MM/AAAA). */
export function formatMonthInputBR(month: IsoMonth): string {
  const [y, m] = month.split('-');
  return `${m}/${y}`;
}

/** Máscara de mês enquanto a pessoa digita: "112026" vira "11/2026". */
export function maskMonthBR(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 6);
  return d.slice(0, 2) + (d.length > 2 ? `/${d.slice(2)}` : '');
}

export function addMonths(month: IsoMonth, delta: number): IsoMonth {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Soma meses a uma data civil; o dia fica limitado ao fim do mês ("2026-01-31" + 1 → "2026-02-28"). */
export function addMonthsToDate(date: IsoDate, delta: number): IsoDate {
  const month = addMonths(monthOf(date), delta);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = Math.min(Number(date.slice(8, 10)), daysInMonth(y, m));
  return `${month}-${String(d).padStart(2, '0')}`;
}

/** Soma anos como o Postgres (date ± interval 'n years'): "2028-02-29" − 1 → "2027-02-28". */
export function addYearsClamped(date: IsoDate, delta: number): IsoDate {
  return addMonthsToDate(date, delta * 12);
}

/** Diferença em dias civis (to − from), sem passar pelo fuso local. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const utc = (iso: IsoDate) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** Intervalo [início, fim) do mês, em datas civis. */
export function monthRange(month: IsoMonth): { start: IsoDate; endExclusive: IsoDate } {
  return { start: `${month}-01`, endExclusive: `${addMonths(month, 1)}-01` };
}

/** Instante (ISO) no fuso da pessoa: "07/10/2026 às 14:32". */
export function formatDateTimeBR(isoInstant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(isoInstant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`;
}

/** Título de grupo por dia em listas: "Hoje", "Ontem" ou "5 de outubro". */
export function formatDayHeader(date: IsoDate, today: IsoDate): string {
  if (date === today) return 'Hoje';
  if (date === addDays(today, -1)) return 'Ontem';
  const [, m, d] = date.split('-');
  return `${Number(d)} de ${MONTHS[Number(m) - 1] ?? ''}`;
}

/** "2026-10" → "outubro" (minúsculas, sem ano). */
export function formatMonthName(month: IsoMonth): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? '';
}

/** "2026-10" → "Outubro de 2026". */
export function formatMonthBR(month: IsoMonth): string {
  const [y, m] = month.split('-');
  const name = MONTHS[Number(m) - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

/** "2026-10" → "outubro de 2026". */
export function formatMonthYearBR(month: IsoMonth): string {
  return `${formatMonthName(month)} de ${month.slice(0, 4)}`;
}

/** Período entre dois meses: "de outubro a dezembro de 2026", "de outubro de 2026 a março de 2027" ou "em outubro de 2026". */
export function formatMonthSpanBR(from: IsoMonth, to: IsoMonth): string {
  if (from === to) return `em ${formatMonthYearBR(from)}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `de ${formatMonthName(from)} a ${formatMonthYearBR(to)}`;
  return `de ${formatMonthYearBR(from)} a ${formatMonthYearBR(to)}`;
}
