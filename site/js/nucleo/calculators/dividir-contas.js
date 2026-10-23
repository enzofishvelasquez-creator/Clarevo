// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/dividir-contas.ts. Não edite: rode "node scripts/gerar-site.js".
import { formatTenths } from '../learn/format.js';
import { percentTenths, sharesCents } from '../learn/math.js';
import { formatBRL } from '../money.js';
import { FieldReader, moneyField } from './common.js';
import { parseMoney } from './inputs.js';
export const DIVIDIR_MIN_PEOPLE = 2;
export const DIVIDIR_MAX_PEOPLE = 6;
export const NICKNAME_MAX = 20;
export const DIVIDIR_TEXT = {
    addPerson: 'Adicionar pessoa',
    removePerson: (name) => `Remover ${name}`,
    nicknameLabel: (index) => `Apelido da pessoa ${index + 1}`,
    nicknameHint: 'Opcional. Fica só nesta tela.',
    incomeLabel: (name) => `Renda de ${name}`,
    peopleRange: 'De 2 a 6 pessoas.',
};
export function personName(apelido, index) {
    const nick = (apelido ?? '').trim();
    return nick !== '' ? nick : `Pessoa ${index + 1}`;
}
export const DIVIDIR_FIELDS = {
    total: moneyField('Total das contas', 'o total das contas', '3.000,00'),
    modo: {
        label: 'Como dividir?',
        kind: 'opcao',
        default: 'iguais',
        options: [
            { value: 'iguais', label: 'Em partes iguais' },
            { value: 'renda', label: 'Pela renda de cada pessoa' },
        ],
        errors: { vazio: 'Escolha como dividir.' },
    },
    pessoas: {
        label: 'Pessoas',
        kind: 'inteiro',
        min: DIVIDIR_MIN_PEOPLE,
        max: DIVIDIR_MAX_PEOPLE,
        errors: { fora_da_faixa: 'Divida entre 2 e 6 pessoas.' },
    },
    apelido: { label: 'Apelido', hint: DIVIDIR_TEXT.nicknameHint, kind: 'texto', optional: true, errors: { longo: 'Use no máximo 20 caracteres.' } },
    renda: moneyField('Renda', 'a renda desta pessoa', '4.000,00'),
};
const incomeShareText = (tenths) => (tenths === 0 ? 'menos de 0,1%' : `cerca de ${formatTenths(tenths)}`);
export function calcDividirContas(input) {
    const r = new FieldReader();
    const total = r.read('total', parseMoney(input.total));
    const modo = input.modo === 'iguais' || input.modo === 'renda' ? input.modo : r.fail('modo', 'vazio');
    const n = input.pessoas.length;
    if (n < DIVIDIR_MIN_PEOPLE || n > DIVIDIR_MAX_PEOPLE)
        r.fail('pessoas', 'fora_da_faixa');
    const names = input.pessoas.map((p, i) => {
        if ([...(p.apelido ?? '').trim()].length > NICKNAME_MAX)
            r.fail(`apelido.${i}`, 'longo');
        return personName(p.apelido, i);
    });
    const incomes = modo === 'renda' ? input.pessoas.map((p, i) => r.read(`renda.${i}`, parseMoney(p.renda ?? ''))) : [];
    if (!r.ok || total === undefined || modo === undefined)
        return { ok: false, errors: r.errors };
    const weights = modo === 'renda' ? incomes : names.map(() => 1);
    const shares = sharesCents(total, weights);
    const people = shares.map((cents, i) => {
        const tenths = percentTenths(cents, total);
        return { name: names[i], cents, tenths, line: `${names[i]}: ${formatBRL(cents)} (${formatTenths(tenths)})` };
    });
    const incomeSum = weights.reduce((a, b) => a + b, 0);
    const hypotheses = modo === 'iguais'
        ? ['Partes iguais. Os centavos que sobram vão para as primeiras pessoas da lista.']
        : [
            `Cada pessoa põe a mesma parte da própria renda: ${incomeShareText(percentTenths(total, incomeSum))}.`,
            'Os centavos que sobram vão para quem tem a maior fração, para a soma fechar com o total.',
        ];
    return {
        ok: true,
        result: {
            modo,
            totalCents: total,
            people,
            resultLines: ['Com estes números, a divisão fica assim:', ...people.map((p) => p.line)],
            hypotheses,
            notes: [modo === 'renda' ? 'Os apelidos e as rendas ficam só nesta tela e não são gravados.' : 'Os apelidos ficam só nesta tela e não são gravados.'],
        },
    };
}
