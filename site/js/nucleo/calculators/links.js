// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/links.ts. Não edite: rode "node scripts/gerar-site.js".
import { daysBetween } from '../dates.js';
import { isCommitmentOverdue } from '../dia-util.js';
import { MAX_RECORD_CENTS, centsToInput } from '../money.js';
import { DEBT_NATURES } from '../records.js';
import { currentTerm, remainingInstallments } from '../series.js';
import { isCalcSlug } from './catalog.js';
import { PARCELADO_RANGE } from './parcelado-ou-a-vista.js';
export const PRAZOS_MAX = 480;
const DAYS_MAX = 36_500;
const ORIGIN = /^[a-z0-9-]{1,30}$/;
const put = (out, key, value) => {
    if (value !== undefined)
        out[key] = String(value);
};
export function calcLinkParams(slug, values) {
    const out = {};
    const v = values;
    switch (slug) {
        case 'parcelado-ou-a-vista': {
            const x = v;
            put(out, 'modo', x.modo);
            put(out, 'avista', x.avistaCents);
            put(out, 'parcela', x.parcelaCents);
            put(out, 'parcelas', x.parcelas);
            break;
        }
        case 'custo-por-ano': {
            const x = v;
            put(out, 'valor', x.valorCents);
            put(out, 'frequencia', x.frequencia);
            break;
        }
        case 'custo-da-divida': {
            const x = v;
            put(out, 'modo', x.tipo);
            put(out, 'valor', x.valorCents);
            put(out, 'parcelas', x.parcelas);
            break;
        }
        case 'quitar-antes': {
            const x = v;
            put(out, 'parcela', x.parcelaCents);
            put(out, 'parcelas', x.restantes);
            put(out, 'modo', x.modo);
            if (x.prazosEmDias && x.prazosEmDias.length > 0)
                out.prazos = x.prazosEmDias.map((d) => Math.max(0, Math.round(d))).join(',');
            break;
        }
        case 'multa-e-juros': {
            const x = v;
            put(out, 'valor', x.valorCents);
            put(out, 'dias', x.dias);
            break;
        }
        case 'antes-de-financiar':
        case 'plano-dividas':
            break;
        case 'reserva':
            put(out, 'valor', v.essenciaisCents);
            break;
        case 'juntar-para-objetivo': {
            const x = v;
            put(out, 'total', x.alvoCents);
            put(out, 'modo', x.modo);
            break;
        }
        case 'dividir-contas': {
            const x = v;
            put(out, 'total', x.totalCents);
            put(out, 'modo', x.modo);
            break;
        }
    }
    put(out, 'origem', v.origem);
    return out;
}
function first(params, key) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' ? value.trim() : undefined;
}
function money(params, ...keys) {
    for (const key of keys) {
        const value = first(params, key);
        if (value === undefined)
            continue;
        if (!/^\d{1,10}$/.test(value))
            return undefined;
        const cents = Number(value);
        return cents >= 1 && cents <= MAX_RECORD_CENTS ? centsToInput(cents) : undefined;
    }
    return undefined;
}
function count(params, key, min, max) {
    const value = first(params, key);
    if (value === undefined || !/^\d{1,6}$/.test(value))
        return undefined;
    const n = Number(value);
    return n >= min && n <= max ? String(n) : undefined;
}
function oneOf(params, key, options) {
    const value = first(params, key);
    return options.find((o) => o === value);
}
function daysList(params) {
    const value = first(params, 'prazos');
    if (value === undefined || !/^\d{1,5}(,\d{1,5})*$/.test(value))
        return undefined;
    const list = value.split(',').map(Number);
    return list.length <= PRAZOS_MAX && list.every((d) => d <= DAYS_MAX) ? list : undefined;
}
function compact(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
export function calcPrefill(slug, params) {
    try {
        if (!isCalcSlug(slug))
            return {};
        const origemRaw = first(params, 'origem');
        const origem = origemRaw !== undefined && ORIGIN.test(origemRaw) ? origemRaw : undefined;
        let out;
        switch (slug) {
            case 'parcelado-ou-a-vista': {
                const modo = oneOf(params, 'modo', ['compra', 'cota-unica']);
                const range = PARCELADO_RANGE[modo ?? 'compra'];
                out = { modo, aVista: money(params, 'avista'), parcela: money(params, 'parcela', 'valor'), parcelas: count(params, 'parcelas', range.min, range.max) };
                break;
            }
            case 'custo-por-ano':
                out = { valor: money(params, 'valor'), frequencia: oneOf(params, 'frequencia', ['dia_util', 'semana', 'mes']) };
                break;
            case 'custo-da-divida':
                out = {
                    tipo: oneOf(params, 'modo', ['rotativo', 'cheque_especial', 'emprestimo']),
                    valor: money(params, 'valor'),
                    parcelas: count(params, 'parcelas', 1, 120),
                };
                break;
            case 'quitar-antes': {
                let restantes = count(params, 'parcelas', 1, PRAZOS_MAX);
                let prazos = daysList(params);
                if (prazos && restantes === undefined && first(params, 'parcelas') === undefined)
                    restantes = String(prazos.length);
                if (prazos && Number(restantes) !== prazos.length)
                    prazos = undefined;
                out = { parcela: money(params, 'parcela', 'valor'), restantes, modo: oneOf(params, 'modo', ['tudo', 'ultimas']), prazosEmDias: prazos };
                break;
            }
            case 'multa-e-juros':
                out = { valor: money(params, 'valor'), dias: count(params, 'dias', 1, 3_650) };
                break;
            case 'antes-de-financiar':
            case 'plano-dividas':
                out = {};
                break;
            case 'reserva':
                out = { essenciais: money(params, 'valor') };
                break;
            case 'juntar-para-objetivo':
                out = { alvo: money(params, 'total', 'valor'), modo: oneOf(params, 'modo', ['prazo', 'mensal']) };
                break;
            case 'dividir-contas':
                out = { total: money(params, 'total', 'valor'), modo: oneOf(params, 'modo', ['iguais', 'renda']) };
                break;
        }
        return compact({ ...out, origem });
    }
    catch {
        return {};
    }
}
export function quitarAntesLink(s, occurrences, open, today) {
    if (s.kind !== 'parcelada' || !DEBT_NATURES.includes(s.nature))
        return null;
    const items = remainingInstallments(s, occurrences, open, today);
    if (!items || items.length === 0 || items.length > PRAZOS_MAX)
        return null;
    return {
        parcelaCents: items[0].amountCents,
        restantes: items.length,
        prazosEmDias: items.map((x) => Math.max(0, daysBetween(today, x.dueOn))),
        origem: 'serie',
    };
}
export function multaLink(c, today) {
    if (c.status !== 'aberto' || !isCommitmentOverdue({ dueOn: c.dueOn, invoice: c.invoice ?? null, series: c.series ?? null }, today))
        return null;
    return { valorCents: c.amountCents, dias: Math.min(daysBetween(c.dueOn, today), 3_650), origem: 'conta' };
}
export function cotaUnicaLink(s, today) {
    if (s.kind !== 'anual' || s.partsPerYear === null)
        return null;
    const amount = currentTerm(s, today).amountCents;
    return s.partsPerYear >= 2
        ? { modo: 'cota-unica', parcelas: s.partsPerYear, parcelaCents: amount, origem: 'serie' }
        : { modo: 'cota-unica', avistaCents: amount, origem: 'serie' };
}
export function custoPorAnoLink(s, today) {
    if (s.kind !== 'mensal')
        return null;
    return { valorCents: currentTerm(s, today).amountCents, frequencia: 'mes', origem: 'serie' };
}
