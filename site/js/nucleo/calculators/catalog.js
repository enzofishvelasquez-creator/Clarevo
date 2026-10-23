// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/catalog.ts. Não edite: rode "node scripts/gerar-site.js".
export const CALC_GROUPS = [
    { id: 'compra', title: 'Decidir uma compra' },
    { id: 'dividas', title: 'Dívidas e atrasos' },
    { id: 'guardar', title: 'Guardar e dividir' },
];
export const CALCULATORS = [
    { slug: 'antes-de-financiar', title: 'Antes de financiar', subtitle: 'Parcela, juros e o que muda se juntar antes', group: 'compra' },
    { slug: 'parcelado-ou-a-vista', title: 'Parcelado ou à vista?', subtitle: 'Descubra os juros embutidos no parcelado', group: 'compra' },
    { slug: 'custo-por-ano', title: 'Quanto custa por ano?', subtitle: 'Assinaturas e gastos que se repetem', group: 'compra' },
    { slug: 'custo-da-divida', title: 'Quanto custa uma dívida?', subtitle: 'Rotativo, cheque especial ou empréstimo', group: 'dividas' },
    { slug: 'quitar-antes', title: 'Quitar antes ou adiantar parcelas', subtitle: 'Uma estimativa de quanto dos juros sai da conta', group: 'dividas' },
    { slug: 'multa-e-juros', title: 'Multa e juros por atraso', subtitle: 'Com os valores do boleto', group: 'dividas' },
    { slug: 'plano-dividas', title: 'Em que ordem quitar as dívidas?', subtitle: 'Duas ordens de pagamento, lado a lado', group: 'dividas' },
    { slug: 'reserva', title: 'Reserva para imprevistos', subtitle: 'Quantos meses seus gastos essenciais cobrem', group: 'guardar' },
    { slug: 'juntar-para-objetivo', title: 'Juntar para um objetivo', subtitle: 'Quanto guardar por mês ou em quanto tempo', group: 'guardar' },
    { slug: 'dividir-contas', title: 'Dividir as contas da casa', subtitle: 'Partes iguais ou pela renda de cada pessoa', group: 'guardar' },
];
export const CALC_SLUGS = CALCULATORS.map((c) => c.slug);
export function isCalcSlug(value) {
    return typeof value === 'string' && CALC_SLUGS.includes(value);
}
export function calculatorBySlug(slug) {
    return CALCULATORS.find((c) => c.slug === slug) ?? null;
}
export function calculatorsInGroup(group) {
    return CALCULATORS.filter((c) => c.group === group);
}
export const CALC_DISCLAIMER = 'Simulação com os valores e as taxas que você informou. Não é recomendação de produto financeiro nem oferta de crédito.';
export const CALC_INTRO = 'Contas rápidas com os valores que você informa. Nada é gravado.';
export const COTA_UNICA_TITLE = 'Cota única ou parcelado?';
export const COTA_UNICA_SUBTITLE = 'Descubra os juros embutidos no parcelamento da conta do ano';
export function calcTitle(slug, modo) {
    if (slug === 'parcelado-ou-a-vista' && modo === 'cota-unica')
        return COTA_UNICA_TITLE;
    return calculatorBySlug(slug).title;
}
export function calcRowA11yLabel(title, caption) {
    if (!caption)
        return title;
    return `${title}${/[?!.]$/.test(title) ? '' : '.'} ${caption}`;
}
export const CALC_UI_TEXT = {
    screenTitle: 'Calculadoras',
    intro: CALC_INTRO,
    disclaimer: CALC_DISCLAIMER,
    unavailable: 'Esta calculadora não está disponível.',
    seeAll: 'Ver todas as calculadoras',
    resultTitle: 'Resultado',
    hypothesesTitle: 'Hipóteses',
    waiting: 'Preencha os campos para ver o resultado.',
    shortcutTitle: 'Calculadoras',
    shortcutCaption: 'Parcelado ou à vista, dívidas, reserva e outras contas',
    learnCardTitle: 'Calculadoras',
    learnCardCaption: 'Parcelado ou à vista, dívidas, reserva e outras contas com os seus números',
    goalsCardTitle: 'Enquanto isso, faça as contas',
    goalsSlugs: ['reserva', 'juntar-para-objetivo'],
    goalsAll: 'Todas as calculadoras',
    noteInstallment: 'Anotar como parcelamento',
    noteFixed: 'Anotar como gasto fixo',
    links: {
        parcelado: 'Parcelado ou à vista? Fazer a conta',
        cotaUnica: 'Cota única ou parcelado? Fazer a conta',
        multa: 'Calcular multa e juros',
        quitar: 'Quanto economizo se quitar antes?',
        ordem: 'Em que ordem quitar? Fazer as contas',
        financiar: 'Antes de financiar? Fazer as contas',
        custoAno: 'Quanto custa por ano?',
        dividir: 'Dividir estas contas',
        familia: 'Enquanto isso, dividir as contas da casa',
    },
};
