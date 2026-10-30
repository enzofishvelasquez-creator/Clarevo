// Gerado por scripts/gerar-site.js a partir de packages/core/src/dates.ts. Não edite: rode "node scripts/gerar-site.js".
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function isValidIsoDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m)
        return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1)
        return false;
    return d <= daysInMonth(y, mo);
}
function daysInMonth(y, mo) {
    return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
export function parseDateBR(input) {
    const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(input);
    if (!m)
        return null;
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
}
export function formatDateBR(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}
export function formatDayMonth(iso) {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
}
export function formatListDate(iso, today) {
    return iso.slice(0, 4) === today.slice(0, 4) ? formatDayMonth(iso) : formatDateBR(iso);
}
export function formatShortDate(iso) {
    const [, m, d] = iso.split('-');
    return `${Number(d)} ${(MONTHS[Number(m) - 1] ?? '').slice(0, 3)}`;
}
export function deviceTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    }
    catch {
        return 'America/Sao_Paulo';
    }
}
export function todayIn(timeZone, now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(date, delta) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
export function maskDateBR(text) {
    const d = text.replace(/\D/g, '').slice(0, 8);
    return d.slice(0, 2) + (d.length > 2 ? `/${d.slice(2, 4)}` : '') + (d.length > 4 ? `/${d.slice(4)}` : '');
}
export function monthOf(date) {
    return date.slice(0, 7);
}
export function isValidIsoMonth(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
export function monthsBetween(from, to) {
    const [y1, m1] = from.split('-').map(Number);
    const [y2, m2] = to.split('-').map(Number);
    return y2 * 12 + m2 - (y1 * 12 + m1);
}
export function dateInMonth(month, day) {
    const [y, m] = month.split('-').map(Number);
    return `${month}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`;
}
export function parseMonthBR(input) {
    const m = /^\s*(\d{1,2})\/(\d{4})\s*$/.exec(input);
    if (!m)
        return null;
    const month = `${m[2]}-${m[1].padStart(2, '0')}`;
    return isValidIsoMonth(month) ? month : null;
}
export function formatMonthInputBR(month) {
    const [y, m] = month.split('-');
    return `${m}/${y}`;
}
export function maskMonthBR(text) {
    const d = text.replace(/\D/g, '').slice(0, 6);
    return d.slice(0, 2) + (d.length > 2 ? `/${d.slice(2)}` : '');
}
export function addMonths(month, delta) {
    const [y, m] = month.split('-').map(Number);
    const total = y * 12 + (m - 1) + delta;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
export function addMonthsToDate(date, delta) {
    const month = addMonths(monthOf(date), delta);
    const [y, m] = month.split('-').map(Number);
    const d = Math.min(Number(date.slice(8, 10)), daysInMonth(y, m));
    return `${month}-${String(d).padStart(2, '0')}`;
}
export function addYearsClamped(date, delta) {
    return addMonthsToDate(date, delta * 12);
}
export function daysBetween(from, to) {
    const utc = (iso) => {
        const [y, m, d] = iso.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((utc(to) - utc(from)) / 86_400_000);
}
export function monthRange(month) {
    return { start: `${month}-01`, endExclusive: `${addMonths(month, 1)}-01` };
}
export function formatDateTimeBR(isoInstant, timeZone) {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(isoInstant));
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`;
}
export function formatDayHeader(date, today) {
    if (date === today)
        return 'Hoje';
    if (date === addDays(today, -1))
        return 'Ontem';
    const [, m, d] = date.split('-');
    return `${Number(d)} de ${MONTHS[Number(m) - 1] ?? ''}`;
}
export function formatMonthName(month) {
    return MONTHS[Number(month.slice(5, 7)) - 1] ?? '';
}
export function formatMonthBR(month) {
    const [y, m] = month.split('-');
    const name = MONTHS[Number(m) - 1] ?? '';
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}
export function formatMonthYearBR(month) {
    return `${formatMonthName(month)} de ${month.slice(0, 4)}`;
}
export function formatMonthSpanBR(from, to) {
    if (from === to)
        return `em ${formatMonthYearBR(from)}`;
    if (from.slice(0, 4) === to.slice(0, 4))
        return `de ${formatMonthName(from)} a ${formatMonthYearBR(to)}`;
    return `de ${formatMonthYearBR(from)} a ${formatMonthYearBR(to)}`;
}
