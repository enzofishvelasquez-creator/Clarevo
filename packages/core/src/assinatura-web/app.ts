/**
 * Assinatura na web pelo Asaas (D-084): o que o app usa. Só na web: no app das lojas a assinatura é pela loja (a Apple e o Google não
 * aceitam app que aponte para pagamento fora da loja), então nada daqui aparece lá. A função do servidor fica em `servidor.ts` (não
 * importa este arquivo: mudar um texto da tela não muda a função).
 */
import { formatBRL } from '../money';
import { PERIOD_NAME, PLAN_NAME, PLAN_PERIOD_PRICE_CENTS, type BillingPeriod, type PlanKind } from '../plano-precos';
import { trialEndPhrase, type TrialEndRelation } from './primeira-cobranca';

/** "mês" ou "ano", e o preço do plano no período ("R$ 29,90", "R$ 269,90"), para os botões do Pix de quem já paga com Pix. */
const pixUnit = (period: BillingPeriod) => (period === 'anual' ? 'ano' : 'mês');
const pixPrice = (plan: PlanKind, period: BillingPeriod) => formatBRL(PLAN_PERIOD_PRICE_CENTS[plan][period]);

/** O nome da função do servidor no Supabase (Edge Functions). */
export const WEB_SUBSCRIPTION_FUNCTION = 'assinatura-web';

/** O que a função devolve ao app em "assinar" e em "pix" (um mês com Pix, D-093). */
export type WebSubscriptionStart =
  | { result: 'checkout'; url: string }
  | { result: 'ja_assinante' | 'cartao_ativo' | 'assinatura_marcada' | 'ja_pago' | 'sem_necessidade' | 'muitas_tentativas' | 'indisponivel' | 'tente_de_novo' };

/** O que a função devolve ao app em "cancelar". */
export type WebSubscriptionCancel = 'cancelada' | 'sem_assinatura' | 'indisponivel' | 'tente_de_novo';

/** "situacao": se ainda há assinatura no cartão ativa no Asaas (e quando renova) ou se foi cancelada. null quando não deu para saber. */
export type WebSubscriptionStatus = { active: true; nextDueDate: string | null } | { active: false };

export function parseWebSubscriptionStatus(raw: unknown): WebSubscriptionStatus | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (r?.result === 'ativa') return { active: true, nextDueDate: typeof r.nextDueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.nextDueDate) ? r.nextDueDate : null };
  if (r?.result === 'sem_assinatura') return { active: false };
  return null;
}

/** O que a volta da página do Asaas diz (`/conta/assinatura?pagamento=...`). */
export type WebPaymentReturn = 'sucesso' | 'cancelado' | 'expirado';

export function parseWebPaymentReturn(v: unknown): WebPaymentReturn | null {
  return v === 'sucesso' || v === 'cancelado' || v === 'expirado' ? v : null;
}

/** Lê a resposta da função em "assinar". Resposta fora do formato vira "tente_de_novo". */
export function parseWebSubscriptionStart(raw: unknown): WebSubscriptionStart {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const result = r?.result;
  if (result === 'checkout' && typeof r?.url === 'string' && /^https:\/\/[a-z0-9.-]*asaas\.com\//.test(r.url)) return { result: 'checkout', url: r.url };
  if (
    result === 'ja_assinante' ||
    result === 'cartao_ativo' ||
    result === 'assinatura_marcada' ||
    result === 'ja_pago' ||
    result === 'sem_necessidade' ||
    result === 'muitas_tentativas' ||
    result === 'indisponivel'
  )
    return { result };
  return { result: 'tente_de_novo' };
}

export function parseWebSubscriptionCancel(raw: unknown): WebSubscriptionCancel {
  const result = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).result : null;
  return result === 'cancelada' || result === 'sem_assinatura' || result === 'indisponivel' ? result : 'tente_de_novo';
}

/** Textos da assinatura na web (tela Assinatura). */
export const WEB_SUBSCRIPTION_TEXT = {
  /** "Assinar o plano Individual" e, com o período (D-127), "Assinar o plano Individual anual". */
  subscribe: (plan: PlanKind, period?: BillingPeriod) => `Assinar o plano ${PLAN_NAME[plan]}${period ? ` ${PERIOD_NAME[period]}` : ''}`,
  subscribeBusy: 'Abrindo a página de pagamento',
  /**
   * Antes dos botões do cartão (análise geral de 26/11/2026, D-129, como a tela das lojas): a cobrança do período escolhido, a renovação
   * automática e como cancelar (o botão "Cancelar assinatura" desta tela, com o acesso até o fim do período pago, sem nova cobrança), e quem
   * guarda os dados do cartão. Os Termos e a Política vêm logo depois dos botões.
   */
  howItWorks: (period: BillingPeriod) =>
    `${
      period === 'anual'
        ? 'No cartão, o plano anual é cobrado de uma vez e renova sozinho a cada 12 meses, pelo mesmo preço, até você cancelar.'
        : 'No cartão, o plano mensal é cobrado todo mês e renova sozinho, pelo mesmo preço, até você cancelar.'
    } Para cancelar, volte a esta tela e toque em Cancelar assinatura, quando quiser: o acesso completo continua até o fim do período já pago, sem nova cobrança. O pagamento é feito na página do Asaas, parceiro de cobrança da Clarevo; os dados do cartão ficam só com o Asaas, e a Clarevo não vê nem guarda.`,
  /**
   * O que a página de pagamento do cartão pede (jornada de compra de 27/11/2026: o CPF pedido sem aviso fazia muita gente parar), dito antes
   * dos botões. É o que o Asaas pede no Checkout (docs/39, seção 1, item 2); a Clarevo não coleta nenhum desses dados.
   */
  paymentPageAsks: 'Na página de pagamento, você informa nome, CPF, e-mail e os dados do cartão.',
  /**
   * Quem assina no teste grátis (D-129): a primeira cobrança no cartão é no fim do teste (o dia de `paidStartDay`, do servidor, em Brasília),
   * e cancelar antes dela não cobra nada. `rel`: como esse dia fica perto do fim do teste no dia da pessoa (`trialEndRelation`).
   */
  firstChargeOn: (date: string, rel: TrialEndRelation = 'mesmo-dia') =>
    `A primeira cobrança é em ${date}, ${trialEndPhrase(rel)}. Se cancelar antes dessa data, nada é cobrado.`,
  afterPayment: 'Depois de pagar, você volta para esta tela e a assinatura aparece em alguns minutos.',
  /** Pix mês a mês (D-093, caminho B). */
  pixTitle: 'Ou pague um mês por vez, com Pix',
  pixHowItWorks:
    'Com Pix, você paga um mês por vez, na página do Asaas. Não renova sozinho e nada é cobrado automaticamente: perto do fim do período pago, a Clarevo avisa aqui para você pagar o próximo, se quiser continuar.',
  /** Pix de um ano (D-127): um pagamento vale 12 meses. */
  pixTitleAnnual: 'Ou pague o ano de uma vez, com Pix',
  pixHowItWorksAnnual:
    'Com Pix, você paga um ano de uma vez, na página do Asaas. Não renova sozinho e nada é cobrado automaticamente: perto do fim do período pago, a Clarevo avisa aqui para você pagar o próximo, se quiser continuar.',
  /** Quem paga com Pix no teste grátis (D-129): o período pago começa no fim do teste (billing_pix_apply, migração 0048). */
  pixStartsOn: (date: string, rel: TrialEndRelation = 'mesmo-dia') => `O período pago começa em ${date}, ${trialEndPhrase(rel)}.`,
  /** "Pagar um mês do plano Individual com Pix" ou, no anual, "Pagar um ano do plano Individual com Pix". */
  payPix: (plan: PlanKind, period: BillingPeriod = 'mensal') => `Pagar um ${period === 'anual' ? 'ano' : 'mês'} do plano ${PLAN_NAME[plan]} com Pix`,
  /** Quem paga com Pix, na janela do próximo período: "Pagar mais um mês com Pix (R$ 29,90)" ou "Pagar mais um ano com Pix (R$ 269,90)". */
  payNextPix: (plan: PlanKind, period: BillingPeriod = 'mensal') => `Pagar mais um ${pixUnit(period)} com Pix (${pixPrice(plan, period)})`,
  /** Quem paga com Pix pode trocar de período no próximo pagamento (o plano continua o mesmo), com o preço do outro período. */
  payOtherPix: (period: BillingPeriod, plan: PlanKind) => `Pagar um ${pixUnit(period)} com Pix (${pixPrice(plan, period)})`,
  pixBusy: 'Abrindo a página do Pix',
  /** Quem paga com Pix, antes da janela do próximo período. */
  pixNextFrom: (date: string, period: BillingPeriod = 'mensal') => `Você pode pagar o próximo ${period === 'anual' ? 'ano' : 'mês'} a partir de ${date}.`,
  pixChangePlan: 'Para mudar de plano ou passar para o cartão, espere o fim do período pago e escolha de novo.',
  /** A assinatura no cartão que ficou ativa sem pagar (cobrança recusada): cancelar para escolher de novo. */
  cancelCard: 'Cancelar a assinatura no cartão',
  cancelCardDone: 'Assinatura no cartão cancelada. Agora você pode escolher de novo.',
  returned: {
    sucesso: 'Pagamento concluído. A assinatura aparece aqui em alguns minutos; se não aparecer, toque em Atualizar.',
    cancelado: 'Pagamento cancelado. Nada foi cobrado.',
    expirado: 'A página de pagamento expirou e nada foi cobrado. Quando quiser, comece de novo.',
  } as Readonly<Record<WebPaymentReturn, string>>,
  refresh: 'Atualizar',
  cancel: 'Cancelar assinatura',
  cancelConfirmTitle: 'Cancelar a assinatura?',
  cancelConfirmBody: 'O acesso completo continua até o fim do período já pago. Depois, a conta fica só para ver e exportar, com os seus dados guardados.',
  cancelConfirmAction: 'Cancelar assinatura',
  cancelKeep: 'Manter a assinatura',
  cancelBusy: 'Cancelando',
  cancelDone: 'Assinatura cancelada. O acesso completo continua até o fim do período já pago.',
  /**
   * Quem assinou no teste grátis e cancela antes da primeira cobrança (D-129), antes do dia dela ou no próprio dia, antes da confirmação do
   * cartão: nada é cobrado, e o acesso completo acaba com o teste grátis (no dia da cobrança, o teste já pode ter acabado: depois do
   * cancelamento, sem assinatura, só ver e exportar). `date`: o dia da primeira cobrança, o do fim do teste.
   */
  cancelConfirmBodyTrial: (date: string) =>
    `Nada é cobrado. O acesso completo acaba com o teste grátis, em ${date}; depois, sem assinatura, a conta fica só para ver e exportar, com os seus dados guardados.`,
  cancelDoneTrial: (date: string) =>
    `Assinatura cancelada antes da primeira cobrança: nada foi cobrado. O acesso completo acaba com o teste grátis, em ${date}.`,
  changePlan: 'Para mudar de plano ou passar do mensal para o anual (ou do anual para o mensal), cancele a assinatura atual e, quando o período já pago terminar, assine de novo.',
  /** Excluir a conta: a assinatura da web precisa ser cancelada antes, e não deu. */
  cancelBeforeDeleteFailed: 'Não foi possível cancelar a assinatura feita na web. Tente de novo em instantes ou cancele em Conta, Assinatura, antes de excluir a conta.',
  /** Excluir a conta: não deu para conferir se há assinatura feita na web (D-129); nada foi excluído. */
  cancelBeforeDeleteUnknown: 'Não foi possível conferir a sua assinatura agora. Nada foi excluído. Tente de novo em instantes.',
  errors: {
    ja_assinante: 'Você já tem uma assinatura ativa. Para mudar de plano, cancele a atual e assine o outro plano quando o período pago terminar.',
    ja_pago: 'O período já está pago. Você pode pagar o próximo nos últimos dias do período pago.',
    cartao_ativo: 'Há uma assinatura no cartão ainda ativa, com a cobrança em aberto. Para escolher de novo, cancele essa assinatura primeiro.',
    /** Assinou no cartão durante o teste grátis (D-129): a primeira cobrança é no fim do teste. */
    assinatura_marcada: 'Você já assinou no cartão: a primeira cobrança é no fim do teste grátis. Para escolher de novo, cancele essa assinatura primeiro.',
    sem_necessidade: 'A sua conta já tem acesso completo, sem precisar assinar.',
    muitas_tentativas: 'Muitas tentativas em pouco tempo. Tente de novo daqui a uma hora.',
    sem_assinatura: 'Não há assinatura pela web para cancelar.',
    indisponivel: 'A assinatura pela web não está disponível agora. Tente de novo mais tarde.',
    tente_de_novo: 'Não foi possível concluir. Tente de novo em instantes.',
  },
} as const;
