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
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= daysInMonth;
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

/** "2026-10-07" → "7 out". */
export function formatShortDate(iso: IsoDate): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${(MONTHS[Number(m) - 1] ?? '').slice(0, 3)}`;
}

/** Dia atual no fuso da pessoa (ex.: America/Sao_Paulo), como data civil. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function addMonths(month: IsoMonth, delta: number): IsoMonth {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Intervalo [início, fim) do mês, em datas civis. */
export function monthRange(month: IsoMonth): { start: IsoDate; endExclusive: IsoDate } {
  return { start: `${month}-01`, endExclusive: `${addMonths(month, 1)}-01` };
}

/** "2026-10" → "Outubro de 2026". */
export function formatMonthBR(month: IsoMonth): string {
  const [y, m] = month.split('-');
  const name = MONTHS[Number(m) - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}
