/**
 * Assinatura na web pelo Asaas (D-084): o que o app usa. Só na web: no app das lojas a assinatura é pela loja (a Apple e o Google não
 * aceitam app que aponte para pagamento fora da loja), então nada daqui aparece lá. A função do servidor fica em `servidor.ts` (não
 * importa este arquivo: mudar um texto da tela não muda a função).
 */
import { PLAN_NAME, type PlanKind } from '../plano-precos';

/** O nome da função do servidor no Supabase (Edge Functions). */
export const WEB_SUBSCRIPTION_FUNCTION = 'assinatura-web';

/** O que a função devolve ao app em "assinar". */
export type WebSubscriptionStart =
  | { result: 'checkout'; url: string }
  | { result: 'ja_assinante' | 'sem_necessidade' | 'indisponivel' | 'tente_de_novo' };

/** O que a função devolve ao app em "cancelar". */
export type WebSubscriptionCancel = 'cancelada' | 'sem_assinatura' | 'indisponivel' | 'tente_de_novo';

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
  if (result === 'ja_assinante' || result === 'sem_necessidade' || result === 'indisponivel') return { result };
  return { result: 'tente_de_novo' };
}

export function parseWebSubscriptionCancel(raw: unknown): WebSubscriptionCancel {
  const result = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).result : null;
  return result === 'cancelada' || result === 'sem_assinatura' || result === 'indisponivel' ? result : 'tente_de_novo';
}

/** Textos da assinatura na web (tela Assinatura). */
export const WEB_SUBSCRIPTION_TEXT = {
  subscribe: (plan: PlanKind) => `Assinar o plano ${PLAN_NAME[plan]}`,
  subscribeBusy: 'Abrindo a página de pagamento',
  /** Antes dos botões de assinar. */
  howItWorks:
    'O pagamento é feito na página do Asaas, parceiro de cobrança da Clarevo, com cartão de crédito. Os dados do cartão ficam só com o Asaas: a Clarevo não vê nem guarda.',
  afterPayment: 'Depois de pagar, você volta para esta tela e a assinatura aparece em alguns minutos.',
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
  changePlan: 'Para mudar de plano, cancele a assinatura atual e assine o outro plano.',
  /** A assinatura da web vista no app das lojas, ou a da loja vista na web. */
  manageElsewhere: 'Para cancelar ou mudar de plano, use o mesmo lugar onde assinou.',
  errors: {
    ja_assinante: 'Você já tem uma assinatura ativa. Para mudar de plano, cancele a atual primeiro.',
    sem_necessidade: 'A sua conta já tem acesso completo, sem precisar assinar.',
    sem_assinatura: 'Não há assinatura pela web para cancelar.',
    indisponivel: 'A assinatura pela web não está disponível agora. Tente de novo mais tarde.',
    tente_de_novo: 'Não foi possível concluir. Tente de novo em instantes.',
  },
} as const;
