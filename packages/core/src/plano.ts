/**
 * Assinatura paga (D-083, 04/11/2026). A Clarevo é paga: R$ 29,90 por mês (Individual) ou R$ 69,90 por mês (Família, até
 * FAMILY_MAX_PEOPLE pessoas), com 14 dias grátis sem cartão. Sem assinatura depois do teste, a conta fica só para ver e exportar.
 * O benefício pela empresa (D-056) continua sem pagar. O acesso vem do banco (`my_access`, migração 0023), que é quem trava a
 * escrita (gatilho de record_operations, `assinatura_necessaria`); aqui ficam a leitura da resposta, os preços e os textos das telas.
 * Plano anual (D-125 e D-127): R$ 269,90 por ano (Individual) ou R$ 629,90 por ano (Família), com o mesmo teste e os mesmos recursos; o
 * período da assinatura em vigor vem de `my_access` (`period`, migração 0047).
 */
import { addDays, daysBetween, formatDateBR, todayIn, type IsoDate } from './dates';
import { BENEFIT_TEXT } from './company';
import { FAMILY_MAX_PEOPLE } from './family';
import { formatBRL } from './money';
import { PIX_GRACE_DAYS, PIX_WARNING_DAYS_BY_PERIOD } from './assinatura-web/pix';
import type { WebSubscriptionStatus } from './assinatura-web/app';
import {
  BILLING_PERIODS,
  PERIOD_MONTHS,
  PERIOD_NAME,
  PLAN_NAME,
  PLAN_PERIOD_PRICE_CENTS,
  PLAN_PRICE_CENTS,
  parseBillingPeriod,
  type BillingPeriod,
  type PlanKind,
} from './plano-precos';

export { BILLING_PERIODS, PERIOD_MONTHS, PERIOD_NAME, PLAN_NAME, PLAN_PERIOD_PRICE_CENTS, PLAN_PRICE_CENTS, parseBillingPeriod, type BillingPeriod, type PlanKind };

/** Dias de teste grátis (o mesmo intervalo do banco, em clarevo_access). */
export const TRIAL_DAYS = 14;
/** A partir de quantos dias para o fim o teste ganha o aviso no Resumo. */
export const TRIAL_WARNING_DAYS = 3;



/**
 * A assinatura pelo app ainda não está aberta: a compra pelas lojas e pela web entra na fase 2, antes do início da cobrança. Até lá
 * a tela mostra os planos e os preços, sem botão de assinar.
 */
export const SUBSCRIBE_OPEN = false;

/**
 * Situação do acesso, na ordem em que o banco decide: assinatura própria, benefício da empresa ou cortesia; o plano Família da pessoa
 * titular; antes do início da cobrança; teste grátis; só leitura.
 */
export type AccessStatus = 'assinatura' | 'beneficio' | 'cortesia' | 'familia' | 'pre_lancamento' | 'teste' | 'leitura';
/** De onde vem o direito: as lojas, a web com cartão (Asaas, D-084), a web com Pix mês a mês (D-093, migração 0033) ou a equipe (cortesia). */
export type AccessProvider = 'apple' | 'google' | 'web' | 'pix' | 'equipe';

export interface Access {
  status: AccessStatus;
  /** O plano em vigor (assinatura, benefício, cortesia ou família); nulo no teste, antes do início e em só leitura. */
  plan: PlanKind | null;
  /**
   * Até quando vale, em ISO 8601: a renovação ou o fim do direito; o fim do teste (também em só leitura, quando acabou); o início da
   * cobrança, antes dele. Nulo quando não tem prazo (benefício ou cortesia sem fim, ou sem data de início marcada).
   */
  until: string | null;
  /** Se a pessoa anota e muda dados. Falso só em só leitura. */
  canWrite: boolean;
  /** De onde vem a assinatura, o benefício ou a cortesia (migração 0026); nulo nas outras situações. Só a da web é cancelada pelo app. */
  provider: AccessProvider | null;
  /**
   * O período da assinatura em vigor, mensal ou anual (D-127, migração 0047). Só na situação "assinatura"; ausente ou nulo nas outras e
   * com o banco de antes da 0047 (a tela então não diz o período).
   */
  period?: BillingPeriod | null;
}

const STATUSES: readonly AccessStatus[] = ['assinatura', 'beneficio', 'cortesia', 'familia', 'pre_lancamento', 'teste', 'leitura'];
const PROVIDERS: readonly AccessProvider[] = ['apple', 'google', 'web', 'pix', 'equipe'];

/** Acesso pleno, sem prazo: o que o app assume enquanto não sabe (o banco trava a escrita de qualquer forma). */
export const FULL_ACCESS: Access = { status: 'pre_lancamento', plan: null, until: null, canWrite: true, provider: null };

/** O instante que a demonstração usa como "agora": meio-dia UTC do dia dela (o mesmo relógio do repositório em memória). */
export function demoInstant(day: IsoDate): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

/**
 * O acesso da demonstração (dados fictícios): o teste grátis começando no dia da demonstração, para ela mostrar a assinatura como uma
 * conta nova a vê. As telas da assinatura, na demonstração, contam o prazo a partir do mesmo dia (`demoInstant`), e não do relógio real
 * (revisão de 16/11/2026: o prazo do teste e as datas da demonstração vinham de relógios diferentes).
 */
export function demoTrialAccess(day: IsoDate): Access {
  return { status: 'teste', plan: null, until: new Date(demoInstant(day).getTime() + TRIAL_DAYS * 86_400_000).toISOString(), canWrite: true, provider: null };
}

/** Lê a resposta de `my_access`. Resposta fora do formato vira erro: a tela mostra a falha, sem inventar situação. */
export function parseAccess(raw: unknown): Access {
  if (!raw || typeof raw !== 'object') throw new Error('acesso_invalido');
  const r = raw as Record<string, unknown>;
  const status = r.status;
  if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) throw new Error('acesso_invalido');
  const plan = r.plan === 'individual' || r.plan === 'familiar' ? r.plan : null;
  const until = typeof r.until === 'string' && !Number.isNaN(Date.parse(r.until)) ? r.until : null;
  if (typeof r.can_write !== 'boolean') throw new Error('acesso_invalido');
  // Só leitura nunca escreve, e nenhuma outra situação deixa de escrever.
  if (r.can_write !== (status !== 'leitura')) throw new Error('acesso_invalido');
  const provider = typeof r.provider === 'string' && (PROVIDERS as readonly string[]).includes(r.provider) ? (r.provider as AccessProvider) : null;
  // O período só vale para a assinatura (o banco o devolve nulo nas outras situações).
  const period = status === 'assinatura' ? parseBillingPeriod(r.period) : null;
  return { status: status as AccessStatus, plan, until, canWrite: r.can_write, provider, period };
}

/** O período da assinatura em vigor; sem ele (banco de antes da 0047 ou outra situação), mensal. */
export function accessPeriod(access: Access): BillingPeriod {
  return access.period === 'anual' ? 'anual' : 'mensal';
}

/** "Plano Individual", e com o período quando o banco o diz ("Plano Individual anual", D-127). */
function subscribedSituation(access: Access): string {
  const name = `Plano ${PLAN_NAME[access.plan ?? 'individual']}`;
  return access.period ? `${name} ${PERIOD_NAME[access.period]}` : name;
}

/** "Assinatura ativa", e com o período quando o banco o diz ("Assinatura anual ativa"). */
function activeSubscription(access: Access): string {
  return access.period ? `Assinatura ${PERIOD_NAME[access.period]} ativa` : 'Assinatura ativa';
}

/** O dia de `until` no fuso da pessoa. */
function untilDay(access: Access, timeZone: string): IsoDate | null {
  return access.until ? todayIn(timeZone, new Date(access.until)) : null;
}

/**
 * O último dia pago com Pix (D-093): o fim do acesso menos os PIX_GRACE_DAYS de tolerância. É esse o prazo que a tela mostra (a tolerância
 * não é anunciada, para não virar o prazo). Nulo sem data ou fora do Pix.
 */
export function pixPaidThrough(access: Access, timeZone: string): IsoDate | null {
  if (access.provider !== 'pix') return null;
  const end = untilDay(access, timeZone);
  return end ? addDays(end, -PIX_GRACE_DAYS) : null;
}

/** Quantos dias de calendário faltam para o fim do teste (0 no último dia); nulo fora do teste. */
export function trialDaysLeft(access: Access, now: Date, timeZone: string): number | null {
  if (access.status !== 'teste') return null;
  const end = untilDay(access, timeZone);
  if (!end) return null;
  return Math.max(0, daysBetween(todayIn(timeZone, now), end));
}

/** "termina hoje", "termina amanhã" ou "termina em 3 dias, em 18/11/2026". */
function trialEnds(days: number, end: IsoDate): string {
  if (days === 0) return 'termina hoje';
  if (days === 1) return 'termina amanhã';
  return `termina em ${days} dias, em ${formatDateBR(end)}`;
}


/** "R$ 29,90 por mês". */
export function planPrice(plan: PlanKind): string {
  return `${formatBRL(PLAN_PRICE_CENTS[plan])} por mês`;
}

/** "R$ 29,90": o preço do plano em destaque (é público; não passa pelos valores ocultos). */
export function planPriceAmount(plan: PlanKind): string {
  return formatBRL(PLAN_PRICE_CENTS[plan]);
}

/** "R$ 269,90" ou "R$ 29,90": o preço do plano no período (D-127). */
export function planPeriodPriceAmount(plan: PlanKind, period: BillingPeriod): string {
  return formatBRL(PLAN_PERIOD_PRICE_CENTS[plan][period]);
}

/** " por ano" ou " por mês", depois do preço. */
export function periodSuffix(period: BillingPeriod): string {
  return period === 'anual' ? ' por ano' : ' por mês';
}

/** "R$ 269,90 por ano" ou "R$ 29,90 por mês". */
export function planPeriodPrice(plan: PlanKind, period: BillingPeriod): string {
  return `${planPeriodPriceAmount(plan, period)}${periodSuffix(period)}`;
}

/**
 * Quanto o anual equivale por mês, em centavos, arredondado ao centavo mais próximo (R$ 269,90 / 12 = R$ 22,49; R$ 629,90 / 12 = R$ 52,49).
 * É só uma comparação: o anual é cobrado de uma vez.
 */
export function annualMonthlyEquivalentCents(plan: PlanKind): number {
  return Math.round(PLAN_PERIOD_PRICE_CENTS[plan].anual / PERIOD_MONTHS.anual);
}

/** Quanto o anual custa a menos que 12 mensalidades, em centavos (R$ 358,80 - R$ 269,90 = R$ 88,90; R$ 838,80 - R$ 629,90 = R$ 208,90). */
export function annualSavingCents(plan: PlanKind): number {
  return PLAN_PERIOD_PRICE_CENTS[plan].mensal * PERIOD_MONTHS.anual - PLAN_PERIOD_PRICE_CENTS[plan].anual;
}

/**
 * A escolha entre mensal e anual na tela Assinatura e no site (D-127). O anual vem primeiro, sem pressa e sem alarme: só os números, com o
 * equivalente por mês dito como equivalente (o anual é uma cobrança só) e a diferença exata para 12 mensalidades.
 */
export const PLAN_PERIOD_TEXT = {
  /** O nome do grupo de opções, para o leitor de tela. */
  choiceLabel: 'Período da assinatura',
  option: { anual: 'Anual', mensal: 'Mensal' } as Readonly<Record<BillingPeriod, string>>,
  /** Abaixo do nome de cada opção. */
  optionHint: { anual: 'Uma cobrança por ano', mensal: 'Uma cobrança por mês' } as Readonly<Record<BillingPeriod, string>>,
  /** "Equivale a R$ 22,49 por mês". */
  equivalent: (plan: PlanKind) => `Equivale a ${formatBRL(annualMonthlyEquivalentCents(plan))} por mês`,
  /** "R$ 88,90 a menos que 12 mensalidades". */
  saving: (plan: PlanKind) => `${formatBRL(annualSavingCents(plan))} a menos que 12 mensalidades`,
  /** A outra opção, em letra menor, para os dois preços ficarem sempre à vista. */
  other: (plan: PlanKind, period: BillingPeriod) =>
    period === 'anual' ? `No mensal: ${planPeriodPrice(plan, 'mensal')}` : `No anual: ${planPeriodPrice(plan, 'anual')}, equivale a ${formatBRL(annualMonthlyEquivalentCents(plan))} por mês`,
  /** O plano inteiro, lido de uma vez pelo leitor de tela. */
  planLabel: (plan: PlanKind, period: BillingPeriod, who: string) =>
    period === 'anual'
      ? `Plano ${PLAN_NAME[plan]} anual, ${planPeriodPrice(plan, 'anual')}, equivale a ${formatBRL(annualMonthlyEquivalentCents(plan))} por mês. No mensal, ${planPeriodPrice(plan, 'mensal')}. ${who}`
      : `Plano ${PLAN_NAME[plan]} mensal, ${planPeriodPrice(plan, 'mensal')}. No anual, ${planPeriodPrice(plan, 'anual')}. ${who}`,
  /**
   * A nota do anual, por canal (análise geral de 26/11/2026, D-129: "O anual é uma cobrança só, que vale por 12 meses." podia ser lida como
   * se o anual não renovasse). Sem falar do teste grátis (o teste da conta já está em `ACCESS_TEXT.plansNote`). Na web, o cartão renova e o
   * Pix não; no app das lojas, nada de Pix nem de pagamento na web (as lojas não aceitam app que aponte para pagamento fora delas), e o
   * cancelamento é nos ajustes da loja; na demonstração (o app das lojas abre a demonstração da web) e no guia de uso (que aparece também no
   * app das lojas), a nota neutra, sem canal (com "automaticamente": o guia não usa adjetivo com gênero, nem para a assinatura).
   */
  note: {
    web: 'No anual, os 12 meses são pagos de uma vez. No cartão, a assinatura renova sozinha a cada período até você cancelar; com Pix, não renova: você paga o próximo período se quiser continuar. Os dois períodos têm os mesmos recursos.',
    store: 'No anual, os 12 meses são cobrados de uma vez, e a assinatura renova sozinha a cada período até você cancelar nos ajustes da loja. Os dois períodos têm os mesmos recursos.',
    neutral: 'No anual, os 12 meses são cobrados de uma vez. A assinatura renova automaticamente a cada período até você cancelar, e o acesso continua até o fim do período já pago.',
  },
  /**
   * A mesma nota no site (os planos e a página de cada plano), sem nome de loja: o cartão e as lojas renovam, o Pix não.
   */
  noteSite:
    'No anual, os 12 meses são pagos de uma vez. No cartão e pelas lojas de aplicativos, a assinatura renova sozinha ao fim de cada período, pelo mesmo preço, até você cancelar; com Pix, não há renovação: você paga o próximo período se quiser continuar.',
} as const;

/** Os textos fixos da assinatura (Conta, tela Assinatura e avisos). */
export const ACCESS_TEXT = {
  cardTitle: 'Assinatura',
  cardOpen: 'Ver a assinatura',
  screenTitle: 'Assinatura',
  situation: 'Situação',
  plansTitle: 'Planos',
  plans: [
    { plan: 'individual' as const, who: 'Para você.' },
    { plan: 'familiar' as const, who: `Para você e as pessoas da sua Família na Clarevo, até ${FAMILY_MAX_PEOPLE} pessoas.` },
  ],
  plansNote: `Os dois planos têm tudo o que a Clarevo oferece. Toda conta começa com ${TRIAL_DAYS} dias grátis, sem cartão. Cancele quando quiser.`,
  /** Na web. No app das lojas vale `howToPayStore`: a Apple e o Google não aceitam app que aponte para pagamento fora da loja. */
  howToPay: 'No celular, a assinatura é feita pela App Store ou pelo Google Play. Na web, por cartão ou Pix.',
  howToPayStore: 'No celular, a assinatura é feita pela loja de aplicativos do aparelho.',
  /**
   * Com a compra fechada (SUBSCRIBE_OPEN), embaixo dos planos, quando os botões de assinar não aparecem (análise geral de 26/11/2026, D-129:
   * sem falar de lançamento). Só para quem tem o acesso completo (antes do início da cobrança ou no teste); em só ver e exportar, a curta.
   */
  notOpenYet: 'Assinatura em breve. Por enquanto, o acesso é completo e nada é cobrado.',
  notOpenYetShort: 'Assinatura em breve.',
  /**
   * Na demonstração, no lugar de como pagar e dos botões (revisão de 26/11/2026, diretriz 3.1.1 da App Store: o app das lojas abre a
   * demonstração da web, que não pode levar a um pagamento fora da loja).
   */
  demoNote: 'Na demonstração não há assinatura nem pagamento.',
  readOnlyWhat: 'Em só ver e exportar, os seus dados continuam guardados: você vê tudo, exporta e pode excluir a conta, mas não anota nem muda nada.',
  benefitNote: 'Se a sua empresa oferece a Clarevo como benefício, use o link do convite: com o benefício, nada a pagar.',
  loadFailed: 'Não foi possível carregar a assinatura. Tente de novo.',
  /** Recusa do banco ao gravar (assinatura_necessaria). */
  refused: 'A sua conta está só para ver e exportar. Para voltar a anotar, abra Conta e toque em Assinatura.',
  bannerAction: 'Ver os planos',
} as const;

/**
 * A tela Assinatura com mais cor e celebração (pedido do Enzo, 12/11/2026): o selo de cada situação no alto, a comemoração de quem assina
 * (e de quem acabou de pagar), o que a assinatura libera e os dias do teste. Neutros quanto ao meio de pagamento: aparecem também no app
 * das lojas, onde nada aponta para pagamento fora da loja.
 */
export const SUBSCRIPTION_SCREEN_TEXT = {
  /** O selo acima do título (o título é a situação de `accessView`; o selo não a repete). */
  eyebrow: {
    assinatura: 'Assinatura ativa',
    familia: 'Nada a pagar',
    beneficio: 'Nada a pagar',
    cortesia: 'Nada a pagar',
    teste: 'Sem cartão e sem cobrança',
    leitura: 'Seus dados continuam aqui',
    pre_lancamento: 'Sem cobrança por enquanto',
  } as Readonly<Record<AccessStatus, string>>,
  /** A assinatura no cartão cancelada, com o período pago ainda valendo (sem comemoração). */
  eyebrowCanceled: 'Assinatura cancelada',
  /** Quem tem acesso completo por assinatura, Família, benefício ou cortesia. */
  celebrate: 'Tudo liberado para você anotar, planejar e acompanhar. Que bom ter você aqui.',
  /** Voltou do pagamento e o acesso já mudou. */
  justPaidEyebrow: 'Assinatura confirmada',
  justPaidTitle: (plan: PlanKind) => `Boas-vindas ao plano ${PLAN_NAME[plan]}!`,
  /** Os dias do teste grátis, em destaque. */
  trialDays: (days: number) => (days <= 0 ? 'Último dia' : days === 1 ? '1 dia' : `${days} dias`),
  trialDaysCaption: (days: number) => (days <= 0 ? 'do teste grátis' : 'de teste grátis pela frente'),
  trialProgressLabel: 'Dias restantes do teste grátis',
  benefitsTitle: 'O que a assinatura libera',
  benefitsTitleSubscribed: 'Tudo isso é seu',
  benefits: [
    { icon: 'registros', text: 'Gastos, recebimentos e contas a pagar' },
    { icon: 'metas', text: 'Metas e a aba Investir, com o CDI e o IPCA' },
    { icon: 'lembretes', text: 'Lembretes, cartões e a fatura de cada mês' },
    { icon: 'analises', text: 'Seu mês em 30 segundos, a Evolução e as Análises' },
    { icon: 'familia', text: `Plano Família: até ${FAMILY_MAX_PEOPLE} pessoas na mesma assinatura` },
  ] as const,
  perMonth: ' por mês',
} as const;

/** Como cancelar a assinatura no cartão da web (D-129): na tela Assinatura, o botão vem logo abaixo; no card de Conta, por "Ver a assinatura". */
const WEB_CANCEL_BELOW = 'Para cancelar, toque em Cancelar assinatura, logo abaixo.';
const WEB_CANCEL_FROM_ACCOUNT = `Para cancelar, toque em ${ACCESS_TEXT.cardOpen} e depois em Cancelar assinatura.`;

export interface AccessView {
  /** "Teste grátis", "Só ver e exportar", "Plano Individual"... */
  situation: string;
  /** A explicação da situação, com datas. */
  body: string;
  /** Mostrar os planos e preços (quem ainda não paga nem tem quem pague). */
  showPlans: boolean;
}

/**
 * O que a tela Assinatura e o card de Conta mostram para a situação. `now` e o fuso da pessoa dão as datas. `web`: a tela está na web
 * (só lá se fala em pagar com Pix; no app das lojas, nada aponta para pagamento fora da loja). `webSubscription`: a assinatura no cartão
 * da web, lida no Asaas (a de quem assina e, desde a D-129, a de quem assinou no teste grátis, com a primeira cobrança no fim do teste).
 * `cancelBelow`: o botão "Cancelar assinatura" vem logo abaixo (a tela Assinatura); no card de Conta, o caminho passa por "Ver a assinatura".
 */
export function accessView(
  access: Access,
  now: Date,
  timeZone: string,
  opts: { web?: boolean; webSubscription?: WebSubscriptionStatus | null; cancelBelow?: boolean } = {},
): AccessView {
  const end = untilDay(access, timeZone);
  const date = end ? formatDateBR(end) : null;
  switch (access.status) {
    case 'pre_lancamento':
      // Antes do início da cobrança (billing_settings.enforced_from, no banco): o teste de quem já usa conta a partir dessa data (my_access,
      // migração 0047: o maior entre a criação da conta e o início da cobrança, mais TRIAL_DAYS). Sem falar de lançamento (D-129).
      return {
        situation: 'Acesso completo',
        body: date
          ? `A partir de ${date}, a Clarevo passa a ser paga. Quem já usa ganha ${TRIAL_DAYS} dias grátis a contar dessa data. Até essa data, o acesso é completo e sem cobrança.`
          : `Por enquanto, o acesso é completo e sem cobrança. Quando a Clarevo passar a ser paga, você terá ${TRIAL_DAYS} dias grátis antes de precisar assinar.`,
        showPlans: true,
      };
    case 'teste': {
      const days = trialDaysLeft(access, now, timeZone) ?? 0;
      // Assinou no cartão, na web, durante o teste (D-129): a assinatura existe no Asaas, com a primeira cobrança no fim do teste, e o
      // acesso continua no teste até lá. Sem os planos (como quem já assina): o cancelamento fica logo abaixo, na tela Assinatura.
      if (opts.web && opts.webSubscription?.active && opts.webSubscription.nextDueDate) {
        return {
          situation: 'Teste grátis',
          body: `O seu teste grátis ${trialEnds(days, end ?? todayIn(timeZone, now))}. A assinatura no cartão já está feita: a primeira cobrança é em ${formatDateBR(opts.webSubscription.nextDueDate)}, quando o teste grátis acaba. Até lá, nada é cobrado.`,
          showPlans: false,
        };
      }
      return {
        situation: 'Teste grátis',
        body: `O seu teste grátis ${trialEnds(days, end ?? todayIn(timeZone, now))}. Depois, sem assinatura, a conta fica só para ver e exportar. Nada é cobrado sem você assinar.`,
        showPlans: true,
      };
    }
    case 'leitura':
      return {
        situation: 'Só ver e exportar',
        // Neutro: só leitura vem do fim do teste, mas também do fim de uma assinatura ou do benefício da empresa.
        body: 'Sem assinatura ativa, a conta está só para ver e exportar. Os seus dados continuam aqui: você vê e exporta tudo. Para voltar a anotar, assine um dos planos.',
        showPlans: true,
      };
    case 'assinatura':
      if (access.provider === 'pix') {
        const paid = pixPaidThrough(access, timeZone);
        const ended = paid !== null && paid < todayIn(timeZone, now);
        // Pix de um ano (D-127): os mesmos avisos, com "ano" no lugar de "mês".
        const year = access.period === 'anual';
        const unit = year ? 'ano' : 'mês';
        return {
          situation: subscribedSituation(access),
          body: !opts.web
            ? `Acesso completo${date ? ` até ${date}` : ''}.`
            : ended
              ? `O ${unit} pago com Pix terminou em ${formatDateBR(paid!)}. Para continuar anotando, pague o próximo ${unit} aqui na tela Assinatura.`
              : `Pago com Pix até ${paid ? formatDateBR(paid) : `o fim do ${unit} pago`}. O Pix não renova sozinho: pague o próximo ${unit} até essa data, aqui na tela Assinatura.`,
          showPlans: false,
        };
      }
      // A assinatura no cartão da web, com a situação lida no Asaas (12/11/2026): a renovação de verdade (sem a tolerância) ou cancelada.
      if (access.provider === 'web' && opts.webSubscription) {
        const ws = opts.webSubscription;
        return {
          situation: subscribedSituation(access),
          // D-129: o caminho do cancelamento dito com o nome do botão (na tela Assinatura, ele vem logo abaixo).
          body: ws.active
            ? `${activeSubscription(access)}, renova em ${ws.nextDueDate ? formatDateBR(ws.nextDueDate) : (date ?? 'breve')}. ${opts.cancelBelow ? WEB_CANCEL_BELOW : WEB_CANCEL_FROM_ACCOUNT}`
            : `Assinatura cancelada: o acesso completo continua${date ? ` até ${date}` : ' até o fim do período já pago'}, sem nova cobrança.`,
          showPlans: false,
        };
      }
      return {
        situation: subscribedSituation(access),
        body: `${activeSubscription(access)}${date ? `, renova em ${date}` : ''}. Para cancelar ou mudar de plano, use o mesmo lugar onde assinou.`,
        showPlans: false,
      };
    case 'beneficio':
      return {
        situation: BENEFIT_TEXT.planCardSituation,
        body: `A sua empresa oferece a Clarevo${date ? ` até ${date}` : ''}. Enquanto o benefício valer, nada a pagar.`,
        showPlans: false,
      };
    case 'cortesia':
      return {
        situation: 'Cortesia',
        body: date ? `Acesso completo oferecido pela Clarevo até ${date}, sem cobrança.` : 'Acesso completo oferecido pela Clarevo, sem cobrança.',
        showPlans: false,
      };
    case 'familia':
      return {
        situation: 'Plano Família',
        body: 'O Plano Família da pessoa titular da sua Família cobre a sua conta. Se você sair da Família, vale o seu próprio acesso.',
        showPlans: false,
      };
  }
}

export interface AccessBanner {
  text: string;
  /** Só leitura pede mais destaque que o aviso do fim do teste. */
  tone: 'info' | 'aviso';
  /** O texto do atalho para a tela Assinatura (sem ele, "Ver os planos"). */
  action?: string;
}

/**
 * Aviso no Resumo: nos últimos TRIAL_WARNING_DAYS dias do teste, em só leitura e, na web, nos últimos dias do período pago com Pix (o Pix
 * não renova sozinho): 7 no mensal e 14 no anual (PIX_WARNING_DAYS_BY_PERIOD, D-127). Nulo nas outras situações.
 */
export function accessBanner(access: Access, now: Date, timeZone: string, opts: { web?: boolean } = {}): AccessBanner | null {
  if (access.status === 'assinatura' && access.provider === 'pix') {
    const paid = pixPaidThrough(access, timeZone);
    if (!opts.web || !paid) return null;
    const days = daysBetween(todayIn(timeZone, now), paid);
    const period = accessPeriod(access);
    if (days > PIX_WARNING_DAYS_BY_PERIOD[period]) return null;
    const unit = period === 'anual' ? 'ano' : 'mês';
    const action = `Pagar o próximo ${unit}`;
    if (days < 0) return { text: `O ${unit} pago com Pix terminou em ${formatDateBR(paid)}. Para continuar anotando, pague o próximo ${unit}.`, tone: 'aviso', action };
    const when = days === 0 ? 'termina hoje' : days === 1 ? 'termina amanhã' : `vai até ${formatDateBR(paid)}`;
    return { text: `O ${unit} pago com Pix ${when}. Para continuar anotando depois, pague o próximo ${unit}.`, tone: 'info', action };
  }
  if (access.status === 'leitura') {
    return { text: 'Sem assinatura ativa, a conta está só para ver e exportar. Para voltar a anotar, assine um dos planos.', tone: 'aviso' };
  }
  const days = trialDaysLeft(access, now, timeZone);
  if (days === null || days > TRIAL_WARNING_DAYS) return null;
  const when = days === 0 ? 'termina hoje' : days === 1 ? 'termina amanhã' : `termina em ${days} dias`;
  return { text: `O seu teste grátis ${when}. Depois, sem assinatura, a conta fica só para ver e exportar.`, tone: 'info' };
}
