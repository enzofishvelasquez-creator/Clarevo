/**
 * Assinatura paga (D-083, 04/11/2026). A Clarevo é paga: R$ 29,90 por mês (Individual) ou R$ 69,90 por mês (Família, até
 * FAMILY_MAX_PEOPLE pessoas), com 14 dias grátis sem cartão. Sem assinatura depois do teste, a conta fica só para ver e exportar.
 * O benefício pela empresa (D-056) continua sem pagar. O acesso vem do banco (`my_access`, migração 0023), que é quem trava a
 * escrita (gatilho de record_operations, `assinatura_necessaria`); aqui ficam a leitura da resposta, os preços e os textos das telas.
 */
import { addDays, daysBetween, formatDateBR, todayIn, type IsoDate } from './dates';
import { BENEFIT_TEXT } from './company';
import { FAMILY_MAX_PEOPLE } from './family';
import { formatBRL } from './money';
import { PIX_GRACE_DAYS, PIX_WARNING_DAYS } from './assinatura-web/pix';
import type { WebSubscriptionStatus } from './assinatura-web/app';
import { PLAN_NAME, PLAN_PRICE_CENTS, type PlanKind } from './plano-precos';

export { PLAN_NAME, PLAN_PRICE_CENTS, type PlanKind };

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
}

const STATUSES: readonly AccessStatus[] = ['assinatura', 'beneficio', 'cortesia', 'familia', 'pre_lancamento', 'teste', 'leitura'];
const PROVIDERS: readonly AccessProvider[] = ['apple', 'google', 'web', 'pix', 'equipe'];

/** Acesso pleno, sem prazo: o que o app assume enquanto não sabe (o banco trava a escrita de qualquer forma). */
export const FULL_ACCESS: Access = { status: 'pre_lancamento', plan: null, until: null, canWrite: true, provider: null };

/**
 * O acesso da demonstração (dados fictícios): o teste grátis começando agora, para a demonstração mostrar a assinatura como uma conta
 * nova a vê. Conta a partir do relógio real, e não do dia fixo da demonstração, para o prazo não aparecer vencido.
 */
export function demoTrialAccess(now: number = Date.now()): Access {
  return { status: 'teste', plan: null, until: new Date(now + TRIAL_DAYS * 86_400_000).toISOString(), canWrite: true, provider: null };
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
  return { status: status as AccessStatus, plan, until, canWrite: r.can_write, provider };
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
  notOpenYet: 'A assinatura pelo app abre no lançamento. Até lá, nada é cobrado.',
  readOnlyWhat: 'Em só ver e exportar, os seus dados continuam guardados: você vê tudo, exporta e pode excluir a conta, mas não anota nem muda nada.',
  benefitNote: 'Se a sua empresa oferece a Clarevo como benefício, use o link do convite: com o benefício, nada a pagar.',
  loadFailed: 'Não foi possível carregar a assinatura. Tente novamente.',
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
    pre_lancamento: 'Antes do lançamento',
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
 * (só lá se fala em pagar com Pix; no app das lojas, nada aponta para pagamento fora da loja).
 */
export function accessView(access: Access, now: Date, timeZone: string, opts: { web?: boolean; webSubscription?: WebSubscriptionStatus | null } = {}): AccessView {
  const end = untilDay(access, timeZone);
  const date = end ? formatDateBR(end) : null;
  switch (access.status) {
    case 'pre_lancamento':
      return {
        situation: 'Acesso completo',
        body: date
          ? `A partir de ${date}, a Clarevo passa a ser paga. Quem já usa ganha ${TRIAL_DAYS} dias grátis a contar dessa data. Até lá, o acesso é completo e sem cobrança.`
          : `Até o lançamento, o acesso é completo e sem cobrança. Depois, a Clarevo passa a ser paga, com ${TRIAL_DAYS} dias grátis para começar.`,
        showPlans: true,
      };
    case 'teste': {
      const days = trialDaysLeft(access, now, timeZone) ?? 0;
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
        return {
          situation: `Plano ${PLAN_NAME[access.plan ?? 'individual']}`,
          body: !opts.web
            ? `Acesso completo${date ? ` até ${date}` : ''}.`
            : ended
              ? `O mês pago com Pix terminou em ${formatDateBR(paid!)}. Para continuar anotando, pague o próximo mês aqui na tela Assinatura.`
              : `Pago com Pix até ${paid ? formatDateBR(paid) : 'o fim do mês pago'}. O Pix não renova sozinho: pague o próximo mês até essa data, aqui na tela Assinatura.`,
          showPlans: false,
        };
      }
      // A assinatura no cartão da web, com a situação lida no Asaas (12/11/2026): a renovação de verdade (sem a tolerância) ou cancelada.
      if (access.provider === 'web' && opts.webSubscription) {
        const ws = opts.webSubscription;
        return {
          situation: `Plano ${PLAN_NAME[access.plan ?? 'individual']}`,
          body: ws.active
            ? `Assinatura ativa, renova em ${ws.nextDueDate ? formatDateBR(ws.nextDueDate) : (date ?? 'breve')}. Para cancelar ou mudar de plano, use o mesmo lugar onde assinou.`
            : `Assinatura cancelada: o acesso completo continua${date ? ` até ${date}` : ' até o fim do período já pago'}, sem nova cobrança.`,
          showPlans: false,
        };
      }
      return {
        situation: `Plano ${PLAN_NAME[access.plan ?? 'individual']}`,
        body: `Assinatura ativa${date ? `, renova em ${date}` : ''}. Para cancelar ou mudar de plano, use o mesmo lugar onde assinou.`,
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
 * Aviso no Resumo: nos últimos TRIAL_WARNING_DAYS dias do teste, em só leitura e, na web, nos últimos PIX_WARNING_DAYS dias do mês pago
 * com Pix (o Pix não renova sozinho). Nulo nas outras situações.
 */
export function accessBanner(access: Access, now: Date, timeZone: string, opts: { web?: boolean } = {}): AccessBanner | null {
  if (access.status === 'assinatura' && access.provider === 'pix') {
    const paid = pixPaidThrough(access, timeZone);
    if (!opts.web || !paid) return null;
    const days = daysBetween(todayIn(timeZone, now), paid);
    if (days > PIX_WARNING_DAYS) return null;
    const action = 'Pagar o próximo mês';
    if (days < 0) return { text: `O mês pago com Pix terminou em ${formatDateBR(paid)}. Para continuar anotando, pague o próximo mês.`, tone: 'aviso', action };
    const when = days === 0 ? 'termina hoje' : days === 1 ? 'termina amanhã' : `vai até ${formatDateBR(paid)}`;
    return { text: `O mês pago com Pix ${when}. Para continuar anotando depois, pague o próximo mês.`, tone: 'info', action };
  }
  if (access.status === 'leitura') {
    return { text: 'Sem assinatura ativa, a conta está só para ver e exportar. Para voltar a anotar, assine um dos planos.', tone: 'aviso' };
  }
  const days = trialDaysLeft(access, now, timeZone);
  if (days === null || days > TRIAL_WARNING_DAYS) return null;
  const when = days === 0 ? 'termina hoje' : days === 1 ? 'termina amanhã' : `termina em ${days} dias`;
  return { text: `O seu teste grátis ${when}. Depois, sem assinatura, a conta fica só para ver e exportar.`, tone: 'info' };
}
