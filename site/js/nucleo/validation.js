// Gerado por scripts/gerar-site.js a partir de packages/core/src/validation.ts. Não edite: rode "node scripts/gerar-site.js".
import { addMonths, addYearsClamped, formatMonthYearBR, isValidIsoMonth, monthOf, monthsBetween, parseDateBR, parseMonthBR } from './dates.js';
import { MAX_RECORD_CENTS, parseBRL } from './money.js';
import { PARTS_PER_YEAR_MAX } from './records.js';
import { ANNUAL_MAX_YEARS, annualLastMonth } from './series.js';
export const ERROR_TEXT = {
    descricao_obrigatoria: 'Dê um nome para este registro.',
    descricao_longa: 'Use no máximo 80 caracteres.',
    valor_invalido: 'Informe um valor maior que zero, como 80,00.',
    valor_acima_do_limite: 'O valor máximo por registro é R$ 9.999.999,99.',
    categoria_invalida: 'Use uma categoria de até 40 caracteres.',
    data_invalida: 'Confira a data informada.',
    data_futura: 'Use uma data até hoje. Aqui entram só valores já pagos ou recebidos.',
    conta_invalida: 'Escolha a conta.',
    salvar_falhou: 'Não foi possível salvar. Seu preenchimento foi mantido. Tente novamente.',
    carregar_falhou: 'Não foi possível carregar. Tente novamente.',
    versao_desatualizada: 'Este registro foi alterado em outro aparelho. Confira a versão atual antes de salvar.',
    nao_encontrado: 'Este registro não está mais disponível.',
    sem_permissao: 'Você não tem permissão para esta ação.',
};
export const UNCERTAIN_TEXT = {
    movimentos: 'Não deu para confirmar se salvou. Confira em Movimentos antes de anotar de novo.',
    metas: 'Não deu para confirmar se salvou. Confira em Metas antes de tentar de novo.',
    cartoes: 'Não deu para confirmar se salvou. Confira em Cartões antes de tentar de novo.',
    conta: 'Não deu para confirmar se salvou. Confira em Conta antes de tentar de novo.',
    orcamento: 'Não deu para confirmar se salvou. Confira em Orçamento por categoria antes de tentar de novo.',
    renda: 'Não deu para confirmar se salvou. Confira em Renda comprometida antes de tentar de novo.',
};
export const COMMITMENT_ERROR_TEXT = {
    ...ERROR_TEXT,
    descricao_obrigatoria: 'Dê um nome para esta conta a pagar.',
    valor_acima_do_limite: 'O valor máximo por conta a pagar é R$ 9.999.999,99.',
    vencimento_fora_do_intervalo: 'Use um vencimento entre 1 ano atrás e 2 anos à frente.',
    vencimento_obrigatorio: 'Informe a data de vencimento, como 15/10/2026.',
    versao_desatualizada: 'Esta conta a pagar foi alterada em outro aparelho. Confira a versão atual antes de salvar.',
    nao_encontrado: 'Esta conta a pagar não está mais disponível.',
    compromisso_quitado: 'Esta conta a pagar já foi paga. Para alterar, desfaça o pagamento.',
    compromisso_aberto: 'Este pagamento já foi desfeito.',
    ja_paga_em_outro_aparelho: 'Esta conta a pagar já foi marcada como paga em outro aparelho.',
    pagar_falhou: 'Não foi possível registrar o pagamento. Seu preenchimento foi mantido. Tente novamente.',
    desfazer_falhou: 'Não foi possível desfazer o pagamento. Tente novamente.',
    excluir_falhou: 'Não foi possível excluir a conta a pagar. Tente novamente.',
    vencimento_fora_do_mes: 'Numa conta de gasto fixo, o vencimento fica no mesmo mês. Para mudar o dia de todos os meses, edite o gasto fixo.',
    estimativa_invalida: ERROR_TEXT.salvar_falhou,
};
export const PAYMENT_ERROR_TEXT = {
    ...COMMITMENT_ERROR_TEXT,
    data_futura: 'Use uma data até hoje. A conta só é marcada como paga depois do pagamento.',
    conta_invalida: 'Escolha a conta usada no pagamento.',
};
export const SERIES_ERROR_TEXT = {
    ...COMMITMENT_ERROR_TEXT,
    descricao_obrigatoria: 'Dê um nome para este gasto fixo ou parcelamento.',
    dia_invalido: 'Informe um dia de 1 a 31.',
    inicio_fora_do_intervalo: 'Escolha um primeiro mês entre o mês passado e 12 meses à frente.',
    parcelas_invalidas: 'Informe de 2 a 480 parcelas.',
    parcelas_no_ano_invalidas: 'Informe de 2 a 12 parcelas por ano.',
    parcela_inicial_invalida: 'A próxima parcela precisa estar entre 1 e o total de parcelas.',
    fim_invalido: 'O último mês precisa ser igual ou depois do primeiro, em até 50 anos.',
    natureza_invalida: 'Escolha o tipo do parcelamento.',
    numero_fora_da_serie: 'Este mês está fora do período do gasto fixo.',
    inicio_em_conta_paga: 'A conta deste mês já foi paga. Escolha uma conta em aberto ou um mês seguinte.',
    limite_de_gastos_fixos: 'Você chegou a 100 contas que se repetem (gastos fixos, parcelamentos e contas do ano). Encerre alguma para adicionar outra.',
    serie_tem_pagamento_posterior: 'Há conta paga depois do mês escolhido. Desfaça esse pagamento ou escolha um mês depois dele.',
    serie_tem_pagamentos: 'Este gasto fixo já tem conta paga. Para parar a repetição, use Encerrar.',
    versao_desatualizada: 'Algo mudou neste gasto fixo em outro aparelho. Confira as contas afetadas e confirme de novo.',
    nao_encontrado: 'Este gasto fixo não está mais disponível.',
    tipo_invalido: ERROR_TEXT.salvar_falhou,
    modo_de_valor_invalido: ERROR_TEXT.salvar_falhou,
    serie_inconsistente: ERROR_TEXT.salvar_falhou,
};
export const ANNUAL_SERIES_ERROR_TEXT = {
    ...SERIES_ERROR_TEXT,
    descricao_obrigatoria: 'Dê um nome para esta conta do ano.',
    inicio_fora_do_intervalo: 'Escolha um primeiro vencimento entre o mês passado e 23 meses à frente.',
    fim_invalido: 'O último ano precisa ser igual ou depois do primeiro, em até 50 anos.',
    numero_fora_da_serie: 'Este ano está fora do período da conta do ano.',
    inicio_em_conta_paga: 'Esta conta já foi paga. Escolha uma conta em aberto ou uma seguinte.',
    vencimento_fora_do_mes: 'Numa conta do ano, o vencimento fica no mesmo mês. Para mudar o dia de todos os anos, edite a conta do ano.',
    serie_tem_pagamentos: 'Esta conta do ano já tem conta paga. Para parar a repetição, use Encerrar.',
    serie_tem_pagamento_posterior: 'Há conta paga depois do ano escolhido. Desfaça esse pagamento ou escolha um ano depois dele.',
    versao_desatualizada: 'Algo mudou nesta conta do ano em outro aparelho. Confira as contas afetadas e confirme de novo.',
    nao_encontrado: 'Esta conta do ano não está mais disponível.',
};
export function firstMonthRangeText(today, kind) {
    const { min, max } = firstMonthBounds(today, kind);
    const what = kind === 'anual' ? 'vencimento' : 'mês';
    return `Escolha um primeiro ${what} entre ${formatMonthYearBR(min)} e ${formatMonthYearBR(max)}.`;
}
export function seriesErrorText(code, today, kind) {
    if (code === 'inicio_fora_do_intervalo')
        return firstMonthRangeText(today, kind);
    const texts = kind === 'anual' ? ANNUAL_SERIES_ERROR_TEXT : SERIES_ERROR_TEXT;
    return code in texts ? texts[code] : SERIES_ERROR_TEXT.salvar_falhou;
}
export function annualYearErrorText(code, yearLabel) {
    if (code === 'versao_desatualizada')
        return `Algo mudou nas contas de ${yearLabel} em outro aparelho. Confira e tente de novo.`;
    const texts = ANNUAL_SERIES_ERROR_TEXT;
    return code in texts ? texts[code] : SERIES_ERROR_TEXT.salvar_falhou;
}
export const DESCRIPTION_MAX = 80;
export const CATEGORY_MAX = 40;
export function charCount(text) {
    return [...text].length;
}
export const FIELD_ORDER = ['description', 'amountText', 'dateText', 'accountId'];
export function validateRecordDraft(draft, today) {
    const errors = {};
    const description = draft.description.trim();
    if (description === '')
        errors.description = ERROR_TEXT.descricao_obrigatoria;
    else if (charCount(description) > DESCRIPTION_MAX)
        errors.description = ERROR_TEXT.descricao_longa;
    const amount = checkAmount(draft.amountText, ERROR_TEXT, errors);
    const occurredOn = parseDateBR(draft.dateText);
    if (occurredOn === null)
        errors.dateText = ERROR_TEXT.data_invalida;
    else if (occurredOn > today)
        errors.dateText = ERROR_TEXT.data_futura;
    if (draft.accountId.trim() === '')
        errors.accountId = ERROR_TEXT.conta_invalida;
    if (Object.keys(errors).length > 0 || amount === null || occurredOn === null)
        return { ok: false, errors };
    return {
        ok: true,
        input: { accountId: draft.accountId, amountCents: amount, occurredOn, description, category: normalizeCategory(draft.category) },
    };
}
export const COMMITMENT_FIELD_ORDER = ['description', 'amountText', 'dateText'];
export const PAYMENT_FIELD_ORDER = ['amountText', 'dateText', 'accountId'];
export function dueDateBounds(today) {
    return { min: addYearsClamped(today, -1), max: addYearsClamped(today, 2) };
}
export function validateCommitmentDraft(draft, today, opts = {}) {
    const errors = {};
    const description = draft.description.trim();
    if (description === '')
        errors.description = COMMITMENT_ERROR_TEXT.descricao_obrigatoria;
    else if (charCount(description) > DESCRIPTION_MAX)
        errors.description = COMMITMENT_ERROR_TEXT.descricao_longa;
    const amount = checkAmount(draft.amountText, COMMITMENT_ERROR_TEXT, errors);
    const dueOn = parseDateBR(draft.dateText);
    if (draft.dateText.trim() === '')
        errors.dateText = COMMITMENT_ERROR_TEXT.vencimento_obrigatorio;
    else if (dueOn === null)
        errors.dateText = COMMITMENT_ERROR_TEXT.data_invalida;
    else if (dueOn !== opts.originalDueOn) {
        const { min, max } = dueDateBounds(today);
        if (dueOn < min || dueOn > max)
            errors.dateText = COMMITMENT_ERROR_TEXT.vencimento_fora_do_intervalo;
    }
    if (Object.keys(errors).length > 0 || amount === null || dueOn === null)
        return { ok: false, errors };
    return { ok: true, input: { description, amountCents: amount, dueOn, category: normalizeCategory(draft.category) } };
}
export function validatePaymentDraft(draft, today) {
    const errors = {};
    const amount = checkAmount(draft.amountText, PAYMENT_ERROR_TEXT, errors);
    const paidOn = parseDateBR(draft.dateText);
    if (paidOn === null)
        errors.dateText = PAYMENT_ERROR_TEXT.data_invalida;
    else if (paidOn > today)
        errors.dateText = PAYMENT_ERROR_TEXT.data_futura;
    if (draft.accountId.trim() === '')
        errors.accountId = PAYMENT_ERROR_TEXT.conta_invalida;
    if (Object.keys(errors).length > 0 || amount === null || paidOn === null)
        return { ok: false, errors };
    return { ok: true, input: { accountId: draft.accountId, amountCents: amount, paidOn, category: normalizeCategory(draft.category) } };
}
export function firstMonthBounds(today, kind) {
    const m = monthOf(today);
    return { min: addMonths(m, -1), max: addMonths(m, kind === 'anual' ? 23 : 12) };
}
export const SERIES_CODE_ORDER = [
    'tipo_invalido',
    'natureza_invalida',
    'valor_invalido',
    'valor_acima_do_limite',
    'descricao_obrigatoria',
    'descricao_longa',
    'categoria_invalida',
    'modo_de_valor_invalido',
    'dia_invalido',
    'inicio_fora_do_intervalo',
    'parcelas_invalidas',
    'parcelas_no_ano_invalidas',
    'parcela_inicial_invalida',
    'fim_invalido',
];
const SERIES_KINDS = ['mensal', 'parcelada', 'anual'];
const NATURES = ['conta', 'financiamento', 'compra_parcelada', 'outro_parcelamento'];
const isInt = (n) => typeof n === 'number' && Number.isSafeInteger(n);
export function seriesTermError(term) {
    if (!isInt(term.amountCents) || term.amountCents < 1)
        return 'valor_invalido';
    if (term.amountCents > MAX_RECORD_CENTS)
        return 'valor_acima_do_limite';
    if (!term.description)
        return 'descricao_obrigatoria';
    if (charCount(term.description) > DESCRIPTION_MAX)
        return 'descricao_longa';
    if (term.category && charCount(term.category) > CATEGORY_MAX)
        return 'categoria_invalida';
    if (term.amountMode !== 'fixo' && term.amountMode !== 'variavel')
        return 'modo_de_valor_invalido';
    if (!isInt(term.dueDay) || term.dueDay < 1 || term.dueDay > 31)
        return 'dia_invalido';
    return null;
}
export function seriesInputError(input, today) {
    const { kind, nature } = input;
    if (!SERIES_KINDS.includes(kind))
        return 'tipo_invalido';
    const natureOk = kind === 'parcelada' ? nature !== 'conta' && NATURES.includes(nature) : nature === 'conta';
    if (!natureOk)
        return 'natureza_invalida';
    const term = seriesTermError(input);
    if (term)
        return term;
    const { min, max } = firstMonthBounds(today, kind);
    const first = input.firstDueMonth;
    if (typeof first !== 'string' || !isValidIsoMonth(first) || first < min || first > max)
        return 'inicio_fora_do_intervalo';
    const total = input.installmentTotal;
    if (kind === 'parcelada' ? !isInt(total) || total < 2 || total > 480 : total !== null)
        return 'parcelas_invalidas';
    const k = input.partsPerYear ?? null;
    if (kind === 'anual' ? !isInt(k) || k < 1 || k > PARTS_PER_YEAR_MAX : k !== null)
        return 'parcelas_no_ano_invalidas';
    const n = input.firstNumber;
    const nMax = kind === 'parcelada' ? total : kind === 'anual' ? k : 1;
    if (kind === 'mensal' ? n !== 1 : !isInt(n) || n < 1 || n > nMax)
        return 'parcela_inicial_invalida';
    const last = input.lastMonth;
    switch (kind) {
        case 'parcelada':
            return last !== null ? 'fim_invalido' : null;
        case 'mensal':
            if (last !== null) {
                if (typeof last !== 'string' || !isValidIsoMonth(last))
                    return 'fim_invalido';
                const months = monthsBetween(first, last);
                if (months < 0 || months > 599)
                    return 'fim_invalido';
            }
            return null;
        case 'anual':
            if (last !== null) {
                if (typeof last !== 'string' || !isValidIsoMonth(last))
                    return 'fim_invalido';
                const d = monthsBetween(addMonths(first, -(n - 1)), last);
                if (d < 0 || d % 12 !== k - 1 || Math.floor(d / 12) > ANNUAL_MAX_YEARS - 1)
                    return 'fim_invalido';
            }
            return null;
        default:
            return 'tipo_invalido';
    }
}
export const SERIES_FIELD_ORDER = [
    'description',
    'nature',
    'amountText',
    'dueDayText',
    'firstMonthText',
    'installmentTotalText',
    'partsPerYearText',
    'firstNumberText',
    'lastMonthText',
];
const intText = (text) => (/^\s*\d{1,9}\s*$/.test(text) ? Number(text.trim()) : null);
export function annualLastYearHint(k, month, firstYear, yearText = '') {
    if (!isInt(k) || k < 2 || k > PARTS_PER_YEAR_MAX || !isInt(month) || month < 1 || month > 12 || month + k - 1 <= 12)
        return null;
    const typed = /^\d{4}$/.test(yearText.trim()) ? Number(yearText.trim()) : null;
    const y = typed !== null && typed >= firstYear && typed - firstYear <= ANNUAL_MAX_YEARS - 1 ? typed : firstYear;
    return `Digite o ano em que começa o último período, como ${y} para ${y}/${y + 1}.`;
}
export function validateSeriesDraft(draft, today) {
    const codes = new Set();
    const errors = {};
    const kind = draft.kind;
    const texts = kind === 'anual' ? ANNUAL_SERIES_ERROR_TEXT : SERIES_ERROR_TEXT;
    const fail = (code, field) => {
        codes.add(code);
        if (field && !errors[field])
            errors[field] = code === 'inicio_fora_do_intervalo' ? firstMonthRangeText(today, kind) : texts[code];
    };
    const parcelada = kind === 'parcelada';
    const anual = kind === 'anual';
    if (!SERIES_KINDS.includes(kind))
        fail('tipo_invalido', null);
    const nature = parcelada ? draft.nature : 'conta';
    if (parcelada && (nature === null || nature === 'conta' || !NATURES.includes(nature)))
        fail('natureza_invalida', 'nature');
    const amount = parseBRL(draft.amountText);
    if (amount === null || amount <= 0)
        fail('valor_invalido', 'amountText');
    else if (amount > MAX_RECORD_CENTS)
        fail('valor_acima_do_limite', 'amountText');
    const description = draft.description.trim();
    if (description === '')
        fail('descricao_obrigatoria', 'description');
    else if (charCount(description) > DESCRIPTION_MAX)
        fail('descricao_longa', 'description');
    const category = normalizeCategory(draft.category);
    if (category && charCount(category) > CATEGORY_MAX)
        fail('categoria_invalida', null);
    if (draft.amountMode !== 'fixo' && draft.amountMode !== 'variavel')
        fail('modo_de_valor_invalido', null);
    const dueDay = intText(draft.dueDayText);
    if (dueDay === null || dueDay < 1 || dueDay > 31)
        fail('dia_invalido', 'dueDayText');
    const { min, max } = firstMonthBounds(today, kind);
    const first = parseMonthBR(draft.firstMonthText);
    if (first === null || first < min || first > max)
        fail('inicio_fora_do_intervalo', 'firstMonthText');
    let total = null;
    let firstNumber = 1;
    let lastMonth = null;
    let partsPerYear = null;
    if (anual) {
        partsPerYear = intText(draft.partsPerYearText);
        const kOk = partsPerYear !== null && partsPerYear >= 1 && partsPerYear <= PARTS_PER_YEAR_MAX;
        if (!kOk)
            fail('parcelas_no_ano_invalidas', 'partsPerYearText');
        const n = draft.firstNumberText.trim() === '' ? 1 : intText(draft.firstNumberText);
        const nOk = n !== null && n >= 1 && n <= (kOk ? partsPerYear : PARTS_PER_YEAR_MAX);
        if (!nOk)
            fail('parcela_inicial_invalida', 'firstNumberText');
        firstNumber = n ?? 0;
        const yearText = draft.lastMonthText.trim();
        if (yearText !== '') {
            if (!/^\d{4}$/.test(yearText))
                fail('fim_invalido', 'lastMonthText');
            else if (first !== null && kOk && nOk) {
                const input = { firstDueMonth: first, firstNumber: n, partsPerYear: partsPerYear };
                const firstYear = Number(addMonths(first, -(n - 1)).slice(0, 4));
                const years = Number(yearText) - firstYear;
                if (years < 0 || years > ANNUAL_MAX_YEARS - 1)
                    fail('fim_invalido', 'lastMonthText');
                else
                    lastMonth = annualLastMonth(input, Number(yearText));
            }
            if (errors.lastMonthText && first !== null && kOk && nOk) {
                const anchor = addMonths(first, -(n - 1));
                const hint = annualLastYearHint(partsPerYear, Number(anchor.slice(5, 7)), Number(anchor.slice(0, 4)));
                if (hint)
                    errors.lastMonthText = `${errors.lastMonthText} ${hint}`;
            }
        }
    }
    else if (parcelada) {
        total = intText(draft.installmentTotalText);
        const totalOk = total !== null && total >= 2 && total <= 480;
        if (!totalOk)
            fail('parcelas_invalidas', 'installmentTotalText');
        const n = intText(draft.firstNumberText);
        if (n === null || n < 1 || n > (totalOk ? total : 480))
            fail('parcela_inicial_invalida', 'firstNumberText');
        firstNumber = n ?? 0;
    }
    else if (draft.lastMonthText.trim() !== '') {
        lastMonth = parseMonthBR(draft.lastMonthText);
        const months = lastMonth !== null && first !== null ? monthsBetween(first, lastMonth) : 0;
        if (lastMonth === null || months < 0 || months > 599)
            fail('fim_invalido', 'lastMonthText');
    }
    const code = SERIES_CODE_ORDER.find((c) => codes.has(c));
    if (code)
        return { ok: false, errors, code };
    return {
        ok: true,
        input: {
            kind,
            nature: nature,
            description,
            category,
            amountCents: amount,
            amountMode: draft.amountMode,
            dueDay: dueDay,
            firstDueMonth: first,
            firstNumber,
            installmentTotal: total,
            partsPerYear,
            lastMonth,
        },
    };
}
function checkAmount(text, texts, errors) {
    const amount = parseBRL(text);
    if (amount === null || amount <= 0)
        errors.amountText = texts.valor_invalido;
    else if (amount > MAX_RECORD_CENTS)
        errors.amountText = texts.valor_acima_do_limite;
    return amount;
}
function normalizeCategory(category) {
    return category?.trim() ? category.trim() : null;
}
export function fieldForErrorCode(code, form) {
    if (form === 'series')
        return seriesFieldForErrorCode(code);
    switch (code) {
        case 'descricao_obrigatoria':
        case 'descricao_longa':
            return 'description';
        case 'valor_invalido':
        case 'valor_acima_do_limite':
            return 'amountText';
        case 'data_invalida':
        case 'data_futura':
        case 'vencimento_fora_do_intervalo':
        case 'vencimento_fora_do_mes':
            return 'dateText';
        case 'conta_invalida':
            return 'accountId';
        default:
            return null;
    }
}
function seriesFieldForErrorCode(code) {
    switch (code) {
        case 'descricao_obrigatoria':
        case 'descricao_longa':
            return 'description';
        case 'natureza_invalida':
            return 'nature';
        case 'valor_invalido':
        case 'valor_acima_do_limite':
            return 'amountText';
        case 'dia_invalido':
            return 'dueDayText';
        case 'inicio_fora_do_intervalo':
            return 'firstMonthText';
        case 'parcelas_invalidas':
            return 'installmentTotalText';
        case 'parcelas_no_ano_invalidas':
            return 'partsPerYearText';
        case 'parcela_inicial_invalida':
            return 'firstNumberText';
        case 'fim_invalido':
            return 'lastMonthText';
        default:
            return null;
    }
}
