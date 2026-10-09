/** Lista da tela "Calculadoras" (docs/08 §2.2; spec4 §1.2), na ordem da tela. */
export type CalcGroup = 'compra' | 'dividas' | 'guardar';

export type CalcSlug =
  | 'parcelado-ou-a-vista'
  | 'custo-por-ano'
  | 'custo-da-divida'
  | 'quitar-antes'
  | 'multa-e-juros'
  | 'reserva'
  | 'juntar-para-objetivo'
  | 'dividir-contas';

export interface CalcInfo {
  slug: CalcSlug;
  title: string;
  subtitle: string;
  group: CalcGroup;
}

export const CALC_GROUPS: readonly { id: CalcGroup; title: string }[] = [
  { id: 'compra', title: 'Decidir uma compra' },
  { id: 'dividas', title: 'Dívidas e atrasos' },
  { id: 'guardar', title: 'Guardar e dividir' },
];

export const CALCULATORS: readonly CalcInfo[] = [
  { slug: 'parcelado-ou-a-vista', title: 'Parcelado ou à vista?', subtitle: 'Descubra os juros embutidos no parcelado', group: 'compra' },
  { slug: 'custo-por-ano', title: 'Quanto custa por ano?', subtitle: 'Assinaturas e gastos que se repetem', group: 'compra' },
  { slug: 'custo-da-divida', title: 'Quanto custa uma dívida?', subtitle: 'Rotativo, cheque especial ou empréstimo', group: 'dividas' },
  { slug: 'quitar-antes', title: 'Quitar antes ou adiantar parcelas', subtitle: 'Uma estimativa de quanto dos juros sai da conta', group: 'dividas' },
  { slug: 'multa-e-juros', title: 'Multa e juros por atraso', subtitle: 'Com os valores do boleto', group: 'dividas' },
  { slug: 'reserva', title: 'Reserva para imprevistos', subtitle: 'Quantos meses seus gastos essenciais cobrem', group: 'guardar' },
  { slug: 'juntar-para-objetivo', title: 'Juntar para um objetivo', subtitle: 'Quanto guardar por mês ou em quanto tempo', group: 'guardar' },
  { slug: 'dividir-contas', title: 'Dividir as contas da casa', subtitle: 'Partes iguais ou pela renda de cada pessoa', group: 'guardar' },
];

export const CALC_SLUGS: readonly CalcSlug[] = CALCULATORS.map((c) => c.slug);

export function isCalcSlug(value: unknown): value is CalcSlug {
  return typeof value === 'string' && (CALC_SLUGS as readonly string[]).includes(value);
}

/** Calculadora pelo endereço; desconhecida: null ("Esta calculadora não está disponível."). */
export function calculatorBySlug(slug: string): CalcInfo | null {
  return CALCULATORS.find((c) => c.slug === slug) ?? null;
}

/** Calculadoras de um grupo, na ordem da tela. */
export function calculatorsInGroup(group: CalcGroup): CalcInfo[] {
  return CALCULATORS.filter((c) => c.group === group);
}

/** Aviso fixo, visível sem rolar em 360 px, na lista e em cada calculadora. */
export const CALC_DISCLAIMER =
  'Simulação com os valores e as taxas que você informou. Não é recomendação de produto financeiro nem oferta de crédito.';

/** Texto de abertura da tela "Calculadoras". */
export const CALC_INTRO = 'Contas rápidas com os valores que você informa. Nada é gravado.';

/** Título e subtítulo de "Parcelado ou à vista?" no modo cota única (contas do ano, D-034(3)). */
export const COTA_UNICA_TITLE = 'Cota única ou parcelado?';
export const COTA_UNICA_SUBTITLE = 'Descubra os juros embutidos no parcelamento da conta do ano';

/** Título da tela de uma calculadora; "Parcelado ou à vista?" no modo cota-unica vira "Cota única ou parcelado?". */
export function calcTitle(slug: CalcSlug, modo?: string): string {
  if (slug === 'parcelado-ou-a-vista' && modo === 'cota-unica') return COTA_UNICA_TITLE;
  return calculatorBySlug(slug)!.title;
}

/** Textos fixos das telas e das portas para as calculadoras. */
export const CALC_UI_TEXT = {
  screenTitle: 'Calculadoras',
  intro: CALC_INTRO,
  disclaimer: CALC_DISCLAIMER,
  unavailable: 'Esta calculadora não está disponível.',
  seeAll: 'Ver todas as calculadoras',
  resultTitle: 'Resultado',
  hypothesesTitle: 'Hipóteses',
  /** Antes do primeiro resultado (campos obrigatórios em branco). */
  waiting: 'Preencha os campos para ver o resultado.',
  /** Movimentos › Organizar: legenda fixa da linha "Calculadoras". */
  shortcutTitle: 'Calculadoras',
  shortcutCaption: 'Parcelado ou à vista, dívidas, reserva e outras contas',
  /** Aprender: card branco no topo. */
  learnCardTitle: 'Calculadoras',
  learnCardCaption: 'Parcelado ou à vista, dívidas, reserva e outras contas com os seus números',
  /** Metas: card com as duas calculadoras de guardar e a lista inteira. */
  goalsCardTitle: 'Enquanto isso, faça as contas',
  goalsSlugs: ['reserva', 'juntar-para-objetivo'] as readonly CalcSlug[],
  goalsAll: 'Todas as calculadoras',
  /** Botões depois do resultado. */
  noteInstallment: 'Anotar como parcelamento',
  noteFixed: 'Anotar como gasto fixo',
  /** Links na hora da decisão. */
  links: {
    parcelado: 'Parcelado ou à vista? Fazer a conta',
    cotaUnica: 'Cota única ou parcelado? Fazer a conta',
    multa: 'Calcular multa e juros',
    quitar: 'Quanto economizo se quitar antes?',
    custoAno: 'Quanto custa por ano?',
    dividir: 'Dividir estas contas',
    familia: 'Enquanto isso, dividir as contas da casa',
  },
} as const;
