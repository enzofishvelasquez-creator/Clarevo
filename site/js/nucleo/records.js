// Gerado por scripts/gerar-site.js a partir de packages/core/src/records.ts. Não edite: rode "node scripts/gerar-site.js".
import { addMonths, daysInMonth, formatMonthYearBR, monthOf } from './dates.js';
export const NEXT_MONTH_WINDOW_DAYS = 7;
export function nextMonthAllowed(date) {
    const [y, m, d] = date.split('-').map(Number);
    return d > daysInMonth(y, m) - NEXT_MONTH_WINDOW_DAYS;
}
export function recordMonth(record) {
    const month = monthOf(record.occurredOn);
    return record.nextMonth === true ? addMonths(month, 1) : month;
}
function firstDayLine(month) {
    const name = formatMonthYearBR(month).replace(/ de \d{4}$/, '');
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} aparece no Resumo a partir de 01/${month.slice(5, 7)}/${month.slice(0, 4)}.`;
}
export const NEXT_MONTH_TEXT = {
    toggle: 'Este valor é do mês seguinte',
    caption: (date, today) => {
        const own = monthOf(date);
        const next = addMonths(own, 1);
        const base = `Entra no Recebido de ${formatMonthYearBR(next)}, não no de ${formatMonthYearBR(own)}.`;
        return today !== undefined && own === monthOf(today) ? `${base} ${firstDayLine(next)}` : base;
    },
    futureNotice: (month) => `Conta no Recebido de ${formatMonthYearBR(month)}, que aparece no Resumo a partir de 01/${month.slice(5, 7)}/${month.slice(0, 4)}.`,
    rowNote: (month) => `conta em ${formatMonthYearBR(month).replace(/ de \d{4}$/, '')}`,
    detailSuffix: ' (mês seguinte)',
};
export const ANNUAL_LEAD_MONTHS = 2;
export const PARTS_PER_YEAR_MAX = 12;
export const DEBT_NATURES = ['financiamento', 'compra_parcelada'];
export const INSTALLMENT_NATURES = ['financiamento', 'compra_parcelada', 'outro_parcelamento'];
export const MONTH_CHECK_KINDS = ['recebimentos', 'pagamentos'];
export const NO_CATEGORY_LABEL = 'Sem categoria';
export const CATEGORIES = {
    despesa: ['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Crédito e parcelas'],
    receita: ['Salário', 'Renda extra', 'Reembolso'],
};
