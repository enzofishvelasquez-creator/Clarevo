// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/antes-de-financiar.ts. Não edite: rode "node scripts/gerar-site.js".
import { COMMITTED_TEXT, formatPermille } from '../committed.js';
import { addMonths, formatMonthInputBR, formatMonthYearBR, monthOf } from '../dates.js';
import { formatBpCompact } from '../learn/format.js';
import { installmentCents, percentTenths, roundDivBig } from '../learn/math.js';
import { MAX_RECORD_CENTS, formatBRL } from '../money.js';
import { SIMULATE_MONTHS_MAX, monthlyRateText, monthsForTarget } from '../simulate.js';
import { FieldReader, countField, moneyField, monthsCount, monthsDuration, rateField } from './common.js';
import { parseCount, parseMoney, parsePercentBp } from './inputs.js';
export const ANTES_PARCELAS = { min: 1, max: 480 };
export const ANTES_RATE_RANGE = { min: 0, max: 9_999 };
export const ANTES_YIELD_MAX_BP = 3_000;
export const ANTES_EXTRA_ENTRY_PERCENTS = [10, 20];
const RATE_RANGE_TEXT = 'Use uma taxa de 0% a 99,99% ao mês.';
const YIELD_RANGE_TEXT = 'Use um rendimento de 0% a 30% ao ano, com até 2 casas.';
export const ANTES_ESTIMATE_TEXT = 'Estimativa. As condições oficiais são as da proposta; peça o CET.';
export const ANTES_RATE_HYPOTHESIS = 'Taxa de juros do contrato: tarifas, seguros e IOF ficam de fora; o CET da proposta inclui esses custos.';
export const ANTES_CET_HYPOTHESIS = 'Simulação de custo equivalente: o CET ao mês entra no lugar da taxa de juros, sobre o preço menos a entrada. A parcela e o custo podem ser diferentes dos do contrato, porque o CET também considera tarifas, seguros e IOF, que podem ser pagos à parte ou descontados do valor liberado.';
export const ANTES_TOTAL_HYPOTHESIS = 'Total: número de parcelas vezes a parcela, no centavo; o contrato pode acertar alguns centavos na última.';
export const ANTES_FIELDS = {
    preco: moneyField('Preço à vista do bem', 'o preço à vista', '50.000,00'),
    entrada: moneyField('Entrada', 'a entrada', '10.000,00', {
        optional: true,
        hint: 'Opcional. De R$ 0 até o preço à vista.',
        errors: { fora_da_faixa: 'A entrada não pode passar do preço à vista.' },
    }),
    parcelas: countField('Número de parcelas', 'o número de parcelas', ANTES_PARCELAS.min, ANTES_PARCELAS.max, 'Use de 1 a 480 parcelas.', 'De 1 a 480'),
    tipoTaxa: {
        label: 'Qual taxa você vai informar?',
        hint: 'A taxa de juros do contrato dá a parcela. O CET soma tarifas, seguros e IOF: com ele, a conta vira uma simulação de custo equivalente.',
        kind: 'opcao',
        default: 'juros',
        options: [
            { value: 'juros', label: 'Taxa de juros' },
            { value: 'cet', label: 'CET ao mês' },
        ],
    },
    taxaMes: rateField('Taxa de juros ao mês (%)', 'a taxa ao mês', '1,99', ANTES_RATE_RANGE.min, ANTES_RATE_RANGE.max, RATE_RANGE_TEXT, 'Está na proposta do banco ou da loja.'),
    primeiraEmUmMes: {
        label: 'A primeira parcela vence em 1 mês?',
        hint: 'Não: a primeira parcela é paga na compra.',
        kind: 'sim_nao',
        default: true,
        options: [
            { value: 'nao', label: 'Não' },
            { value: 'sim', label: 'Sim' },
        ],
    },
    renda: moneyField('Sua renda líquida por mês', 'sua renda líquida por mês', '4.500,00', {
        optional: true,
        hint: 'Opcional. Serve para mostrar quanto a parcela pesa na renda.',
    }),
    guardar: moneyField('Quanto você conseguiria guardar por mês', 'quanto conseguiria guardar por mês', '1.000,00', {
        optional: true,
        hint: 'Opcional. Em branco: o valor da parcela.',
    }),
    rendimento: {
        ...rateField('Rendimento ao ano (%)', 'o rendimento ao ano', '0', 0, ANTES_YIELD_MAX_BP, YIELD_RANGE_TEXT, 'Opcional. Você informa o que quer testar. Em branco: sem rendimento.'),
        optional: true,
        errors: {
            vazio: 'Digite o rendimento ao ano que quer testar, de 0% a 30%.',
            invalido: YIELD_RANGE_TEXT,
            casas_demais: YIELD_RANGE_TEXT,
            fora_da_faixa: YIELD_RANGE_TEXT,
        },
    },
};
export const ANTES_TEXT = {
    alternativeTitle: 'Alternativa: juntar antes',
    alternativeHint: 'Quanto tempo leva para juntar o que falta para comprar à vista: o preço menos a entrada que você já tem.',
    savingTitle: 'Juntar antes',
    entryTitle: 'Com uma entrada maior',
    noBiggerEntry: 'Com mais 10% do preço, a entrada já cobriria o preço inteiro.',
    cetRateLabel: 'CET ao mês (%)',
    otherEntry: 'Fazer a conta com outra entrada',
    noteInstallment: 'Anotar como parcelamento',
    noteInstallmentHint: 'Vai fazer este financiamento? As parcelas entram nas contas a pagar deste mês e dos próximos. Você confere antes de salvar.',
    createGoal: 'Criar meta com este valor',
    createGoalHint: 'A meta recebe o valor, o prazo e o valor por mês. A taxa de rendimento não é gravada.',
    rendaFromReference: 'Veio da sua renda de referência. Mudar aqui não altera a referência.',
    rendaHidden: 'Valor oculto. Mostre os valores para editar.',
    showValues: 'Mostrar valores',
    showValuesA11y: 'Mostrar valores para editar a renda',
    loadFailed: 'Não foi possível ler o comprometido do mês. A conta segue sem essa linha.',
};
const brl = formatBRL;
const parcelasText = (n) => (n === 1 ? '1 parcela' : `${n} parcelas`);
function optionalPositiveMoney(text) {
    if (text === undefined || text.trim() === '')
        return { ok: true, value: null };
    return parseMoney(text);
}
function optionalEntry(text) {
    if (text === undefined || text.trim() === '')
        return { ok: true, value: 0 };
    return parseMoney(text, { allowZero: true });
}
function optionalYield(text) {
    if (text === undefined || text.trim() === '')
        return { ok: true, value: 0 };
    return parsePercentBp(text, { min: 0, max: ANTES_YIELD_MAX_BP });
}
export function financePaymentCents(financedCents, monthlyBp, installments, firstInOneMonth) {
    if (!Number.isSafeInteger(financedCents) || financedCents < 0)
        throw new RangeError(`valor financiado inválido: ${financedCents}`);
    if (!Number.isSafeInteger(monthlyBp) || monthlyBp < 0)
        throw new RangeError(`taxa inválida: ${monthlyBp}`);
    if (!Number.isSafeInteger(installments) || installments < 1)
        throw new RangeError(`parcelas inválidas: ${installments}`);
    if (financedCents === 0)
        return 0;
    let payment;
    if (firstInOneMonth) {
        payment = installmentCents(financedCents, monthlyBp, installments);
    }
    else if (monthlyBp === 0) {
        payment = Number(roundDivBig(BigInt(financedCents), BigInt(installments)));
    }
    else {
        const base = 10000n;
        const q = base + BigInt(monthlyBp);
        const n = BigInt(installments);
        payment = Number(roundDivBig(BigInt(financedCents) * BigInt(monthlyBp) * q ** (n - 1n), q ** n - base ** n));
    }
    return Math.max(1, payment);
}
function monthsToSave(target, monthly, rateBp) {
    if (monthly >= target)
        return 1;
    return monthsForTarget(target, 0, monthly, rateBp);
}
function percentOfPrice(preco, percent) {
    return Number(roundDivBig(BigInt(preco) * BigInt(percent), 100n));
}
function financeSchedule(preco, entrada, taxaBp, n, firstInOneMonth) {
    const financed = preco - entrada;
    if (taxaBp !== 0 || financed === 0) {
        const parcela = financePaymentCents(financed, taxaBp, n, firstInOneMonth);
        const total = entrada + n * parcela;
        return { parcela, last: parcela, lastCount: 0, total, interest: Math.max(0, total - preco) };
    }
    const base = Math.floor(financed / n);
    const rest = financed - base * n;
    return { parcela: base, last: rest > 0 ? base + 1 : base, lastCount: rest, total: preco, interest: 0 };
}
function parcelaRange(s) {
    return s.last === s.parcela ? brl(s.parcela) : `${brl(s.parcela)} a ${brl(s.last)}`;
}
function installmentsText(n, s) {
    if (s.last === s.parcela)
        return `${n} × ${brl(s.parcela)}`;
    const tail = s.lastCount === 1 ? `uma última de ${brl(s.last)}` : `as ${s.lastCount} últimas de ${brl(s.last)}`;
    return `${n - s.lastCount} × ${brl(s.parcela)} e ${tail}`;
}
export function calcAntesDeFinanciar(input, today) {
    const r = new FieldReader();
    const preco = r.read('preco', parseMoney(input.preco));
    const entradaRead = r.read('entrada', optionalEntry(input.entrada));
    const n = r.read('parcelas', parseCount(input.parcelas, ANTES_PARCELAS.min, ANTES_PARCELAS.max));
    const taxaBp = r.read('taxaMes', parsePercentBp(input.taxaMes, ANTES_RATE_RANGE));
    const renda = r.read('renda', optionalPositiveMoney(input.renda));
    const guardarRead = r.read('guardar', optionalPositiveMoney(input.guardar));
    const rendimentoBp = r.read('rendimento', optionalYield(input.rendimento));
    if (preco !== undefined && entradaRead !== undefined && entradaRead > preco)
        r.fail('entrada', 'fora_da_faixa');
    if (!r.ok ||
        preco === undefined ||
        entradaRead === undefined ||
        n === undefined ||
        taxaBp === undefined ||
        renda === undefined ||
        guardarRead === undefined ||
        rendimentoBp === undefined) {
        return { ok: false, errors: r.errors };
    }
    const entrada = entradaRead;
    const taxaTipo = input.tipoTaxa === 'cet' ? 'cet' : 'juros';
    const cet = taxaTipo === 'cet';
    const firstInOneMonth = input.primeiraEmUmMes !== false;
    const financed = preco - entrada;
    const committed = input.comprometidoCents !== undefined && input.comprometidoCents !== null && Number.isSafeInteger(input.comprometidoCents) && input.comprometidoCents >= 0
        ? input.comprometidoCents
        : null;
    const calendar = (months) => (today === undefined ? null : addMonths(monthOf(today), months));
    const estimateNote = ANTES_ESTIMATE_TEXT;
    if (financed === 0) {
        return {
            ok: true,
            result: {
                precoCents: preco,
                entradaCents: entrada,
                financedCents: 0,
                parcelas: n,
                taxaBp,
                taxaTipo,
                firstInOneMonth,
                nothingToFinance: true,
                parcelaCents: 0,
                lastParcelaCents: 0,
                lastCount: 0,
                totalCents: entrada,
                interestCents: 0,
                noInterest: true,
                lastMonth: null,
                rendaCents: renda,
                parcelaPermille: null,
                committedBeforePermille: null,
                committedAfterPermille: null,
                savingTargetCents: 0,
                savingMonthlyCents: 0,
                savingMonths: null,
                rendimentoBp,
                biggerEntries: [],
                savingLines: [],
                entryLines: [],
                noteParams: null,
                goalParams: null,
                resultLines: [
                    'Com a entrada igual ao preço à vista, não há o que financiar.',
                    `Você paga ${brl(preco)} na compra, sem ${cet ? 'custo adicional' : 'juros'}.`,
                ],
                hypotheses: [],
                notes: [],
            },
        };
    }
    const schedule = financeSchedule(preco, entrada, taxaBp, n, firstInOneMonth);
    const { parcela, last: lastParcela, lastCount, total, interest } = schedule;
    const noInterest = taxaBp === 0 || total <= preco;
    const lastDiffers = lastParcela !== parcela;
    const lastOffset = firstInOneMonth ? n : n - 1;
    const lastMonth = calendar(lastOffset);
    const costName = cet ? 'custo adicional estimado' : 'juros';
    const resultLines = [];
    resultLines.push(`Com estes números, ${n === 1 ? 'é' : 'são'} ${parcelasText(n)} de ${parcelaRange(schedule)}.`);
    const paidAtPurchase = n === 1 && !firstInOneMonth;
    if (paidAtPurchase)
        resultLines.push('Você paga tudo na compra.');
    else
        resultLines.push(`Você paga por ${monthsDuration(n)}${firstInOneMonth ? '' : ', a primeira na compra'}${lastMonth ? `, até ${formatMonthYearBR(lastMonth)}` : ''}.`);
    resultLines.push(`Total pago: ${brl(total)} (${entrada > 0 ? `entrada de ${brl(entrada)} mais ` : ''}${installmentsText(n, schedule)}).`);
    resultLines.push(noInterest
        ? cet
            ? 'Sem custo adicional: o total pago é igual ou menor que o preço à vista.'
            : 'Sem juros: o total pago é igual ou menor que o preço à vista.'
        : cet
            ? `Custo adicional estimado: ${brl(interest)}.`
            : `Juros: ${brl(interest)}.`);
    let parcelaPermille = null;
    let beforePermille = null;
    let afterPermille = null;
    const notes = [estimateNote];
    const showImpact = !paidAtPurchase;
    const heaviest = Math.max(parcela, lastParcela);
    if (showImpact && renda !== null) {
        parcelaPermille = percentTenths(heaviest, renda);
        resultLines.push(`A parcela seria ${formatPermille(parcelaPermille, heaviest)} da sua renda.`);
        if (committed !== null) {
            beforePermille = percentTenths(committed, renda);
            afterPermille = percentTenths(committed + heaviest, renda);
            resultLines.push(`Sua renda comprometida iria de ${formatPermille(beforePermille, committed)} para ${formatPermille(afterPermille, committed + heaviest)} enquanto durar o financiamento.`);
        }
        notes.push(`${COMMITTED_TEXT.debtReference} ${COMMITTED_TEXT.debtReferenceSource}`);
    }
    else if (showImpact && committed !== null && committed > 0) {
        resultLines.push(`O total comprometido por mês iria de ${brl(committed)} para ${brl(committed + heaviest)} enquanto durar o financiamento.`);
    }
    const target = financed;
    const guardarIsDefault = guardarRead === null;
    const monthly = guardarRead ?? heaviest;
    const months = monthsToSave(target, monthly, rendimentoBp);
    const yieldText = rendimentoBp > 0 ? `com rendimento de ${formatBpCompact(rendimentoBp)} ao ano` : 'sem rendimento';
    const savingLines = [];
    const span = lastOffset === 0 ? '' : ` ao longo de ${monthsCount(n)}`;
    const financing = noInterest
        ? `Financiando: você usa o bem agora e não paga ${cet ? 'custo adicional' : 'juros'}${span}.`
        : `Financiando: você usa o bem agora e paga ${brl(interest)} de ${costName}${span}.`;
    if (months === null) {
        savingLines.push(`Guardando ${brl(monthly)} por mês, ${yieldText}, não dá para juntar ${brl(target)} em 50 anos.`);
        savingLines.push(financing);
    }
    else {
        savingLines.push(`Guardando ${brl(monthly)} por mês, ${yieldText}, você junta ${brl(target)} em ${monthsDuration(months)}.`);
        savingLines.push(financing);
        savingLines.push(`Juntando: leva ${monthsCount(months)} para juntar o que falta para comprar à vista e não paga ${cet ? 'o custo adicional' : 'juros'} do financiamento.`);
    }
    const biggerEntries = [];
    const entryLines = [];
    for (const percent of ANTES_EXTRA_ENTRY_PERCENTS) {
        const extra = percentOfPrice(preco, percent);
        const novaEntrada = entrada + extra;
        if (extra < 1)
            continue;
        if (novaEntrada >= preco) {
            if (biggerEntries.length > 0)
                entryLines.push(`Com mais ${percent}% do preço, a entrada já cobriria o preço inteiro.`);
            break;
        }
        const s = financeSchedule(preco, novaEntrada, taxaBp, n, firstInOneMonth);
        const e = {
            percent,
            extraCents: extra,
            entradaCents: novaEntrada,
            parcelaCents: s.parcela,
            interestCents: s.interest,
            parcelaDiffCents: Math.max(0, parcela - s.parcela),
            interestDiffCents: Math.max(0, interest - s.interest),
        };
        biggerEntries.push(e);
        const less = e.interestDiffCents > 0 ? ` (${brl(e.interestDiffCents)} a menos)` : '';
        entryLines.push(`Com mais ${e.percent}% do preço na entrada (${brl(e.extraCents)}): parcela de ${parcelaRange(s)} e ${costName} de ${brl(e.interestCents)}${less}.`);
    }
    const hypotheses = [
        firstInOneMonth ? 'Parcelas iguais (tabela Price), a primeira 1 mês depois da compra.' : 'Parcelas iguais (tabela Price), a primeira paga na compra e as outras a cada mês.',
    ];
    if (taxaBp === 0) {
        if (!lastDiffers)
            hypotheses.push('Sem juros informados: a parcela é o valor financiado dividido pelas parcelas, no centavo.');
        else if (parcela === 0)
            hypotheses.push(`Sem juros informados: com este valor, nem todas as parcelas têm valor. Só ${lastCount === 1 ? 'a última tem' : `as ${lastCount} últimas têm`} ${brl(lastParcela)}; as outras ficam em ${brl(0)}, e o total é o preço.`);
        else
            hypotheses.push(`Sem juros informados: a parcela é o valor financiado dividido pelas parcelas, para baixo no centavo, e os centavos que sobram vão para ${lastCount === 1 ? 'a última' : `as ${lastCount} últimas`} (${brl(lastParcela)}), para o total ser o preço.`);
        if (cet)
            hypotheses.push(ANTES_CET_HYPOTHESIS);
    }
    else {
        hypotheses.push(cet ? ANTES_CET_HYPOTHESIS : ANTES_RATE_HYPOTHESIS, ANTES_TOTAL_HYPOTHESIS);
    }
    if (showImpact && renda !== null)
        hypotheses.push('Percentuais sobre a renda líquida por mês que você informou aqui.');
    if (showImpact && committed !== null)
        hypotheses.push('O comprometido é o do mês atual, com as contas a pagar já criadas; os meses seguintes podem ser diferentes.');
    hypotheses.push(entrada > 0
        ? `Juntar para comprar à vista: o valor a juntar é o que falta, o preço menos a entrada de ${brl(entrada)} que você já tem: ${brl(financed)}.`
        : `Juntar para comprar à vista: o valor a juntar é o preço inteiro, ${brl(preco)}.`);
    hypotheses.push(guardarIsDefault
        ? lastDiffers
            ? 'Valor guardado por mês: o da maior parcela, a menos que você informe outro.'
            : 'Valor guardado por mês: o da parcela, a menos que você informe outro.'
        : 'Valor guardado por mês: o que você informou.');
    hypotheses.push(rendimentoBp > 0
        ? `Rendimento de ${formatBpCompact(rendimentoBp)} ao ano (${monthlyRateText(rendimentoBp)} ao mês, taxa equivalente), informado por você, constante no período e sem imposto ou taxas.`
        : 'Sem rendimento: o valor guardado não cresce.');
    hypotheses.push('Depósitos no início de cada mês, como na Calculadora do Cidadão do Banco Central; prazo em meses inteiros, para cima.');
    hypotheses.push('O preço do bem pode mudar enquanto você junta.');
    if (biggerEntries.length > 0)
        hypotheses.push('Entrada maior: soma 10% e 20% do preço à vista à entrada, com a mesma taxa e o mesmo número de parcelas.');
    const goalMonths = months;
    const goalParams = today !== undefined && goalMonths !== null && goalMonths >= 1 && goalMonths <= SIMULATE_MONTHS_MAX && target >= 1 && target <= MAX_RECORD_CENTS
        ? {
            tipo: 'objetivo',
            valor: target,
            prazo: formatMonthInputBR(addMonths(monthOf(today), goalMonths - 1)),
            mensal: monthly >= 1 && monthly <= MAX_RECORD_CENTS ? monthly : null,
        }
        : null;
    return {
        ok: true,
        result: {
            precoCents: preco,
            entradaCents: entrada,
            financedCents: financed,
            parcelas: n,
            taxaBp,
            taxaTipo,
            firstInOneMonth,
            nothingToFinance: false,
            parcelaCents: parcela,
            lastParcelaCents: lastParcela,
            lastCount,
            totalCents: total,
            interestCents: interest,
            noInterest,
            lastMonth,
            rendaCents: renda,
            parcelaPermille,
            committedBeforePermille: beforePermille,
            committedAfterPermille: afterPermille,
            savingTargetCents: target,
            savingMonthlyCents: monthly,
            savingMonths: months,
            rendimentoBp,
            biggerEntries,
            savingLines,
            entryLines,
            noteParams: n >= 2
                ? { tipo: 'parcelada', natureza: 'financiamento', parcelas: n, ...(parcela >= 1 && parcela <= MAX_RECORD_CENTS ? { valor: parcela } : {}) }
                : null,
            goalParams,
            resultLines,
            hypotheses,
            notes,
        },
    };
}
