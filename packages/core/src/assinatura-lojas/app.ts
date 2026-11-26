/**
 * Assinatura pelas lojas (D-090): o que o app do iPhone e do Android usa. A compra é feita pelo SDK do RevenueCat
 * (`apps/app/src/lib/store-purchases.ts`), com a loja do aparelho; depois, o app pede à função do servidor que sincronize, para a
 * assinatura aparecer sem esperar o aviso do RevenueCat. Na web nada daqui aparece (lá a assinatura é pelo Asaas, D-084). A função do
 * servidor fica em `servidor.ts` (não importa este arquivo: mudar um texto da tela não muda a função).
 */
import { PERIOD_NAME, PLAN_NAME, type BillingPeriod, type PlanKind } from '../plano-precos';
import type { AccessProvider, AccessStatus } from '../plano';

export {
  GOOGLE_BASE_PLAN,
  GOOGLE_BASE_PLANS,
  STORE_OFFERINGS,
  STORE_PACKAGES,
  STORE_PRODUCTS,
  STORE_PRODUCT_IDS,
  planOfStoreProduct,
  storeProductInfo,
  type StoreProductInfo,
} from './produtos';

/** O nome da função do servidor no Supabase (Edge Functions). */
export const STORE_SUBSCRIPTION_FUNCTION = 'assinatura-lojas';

/** A loja do aparelho. */
export type StoreName = 'apple' | 'google';

/** O que a função devolve ao app em "sincronizar". */
export type StoreSync = 'sincronizado' | 'sem_compra' | 'indisponivel' | 'tente_de_novo';

/** O que a função devolve ao app em "esquecer" (antes de excluir a conta). */
export type StoreForget = 'esquecido' | 'ativa' | 'sem_compra' | 'indisponivel' | 'tente_de_novo';

export function parseStoreForget(raw: unknown): StoreForget {
  const result = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).result : null;
  return result === 'esquecido' || result === 'ativa' || result === 'sem_compra' || result === 'indisponivel' ? result : 'tente_de_novo';
}

export function parseStoreSync(raw: unknown): StoreSync {
  const result = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).result : null;
  return result === 'sincronizado' || result === 'sem_compra' || result === 'indisponivel' ? result : 'tente_de_novo';
}

/** O resultado de uma compra ou troca de plano na loja (o SDK traduzido em `store-purchases.ts`). */
export type StorePurchaseResult =
  | 'comprado'
  | 'cancelado'
  | 'pendente'
  | 'nao_permitido'
  | 'ja_assinante_loja'
  | 'rede'
  | 'indisponivel'
  | 'tente_de_novo';

/** O resultado de "Restaurar compras". */
export type StoreRestoreResult = 'restaurado' | 'nada' | 'rede' | 'indisponivel' | 'tente_de_novo';

/**
 * Situações em que a tela oferece assinar pela loja (com a compra aberta): antes do início da cobrança, no teste, em só leitura e
 * coberta pelo Plano Família de outra pessoa. Antes do início da cobrança também, porque a revisão da Apple e do Google acontece antes
 * do lançamento e precisa achar a compra (a conta de teste da revisão está nessa situação até a cobrança começar).
 */
export function canSubscribeInStore(status: AccessStatus): boolean {
  return status === 'pre_lancamento' || status === 'teste' || status === 'leitura' || status === 'familia';
}

/** A assinatura da pessoa é desta loja (e então se gerencia e se troca de plano por aqui). */
export function isStoreSubscription(status: AccessStatus, provider: AccessProvider | null, store: StoreName | null): boolean {
  return status === 'assinatura' && store !== null && provider === store;
}

const STORE_LABEL: Readonly<Record<StoreName, string>> = { apple: 'App Store', google: 'Google Play' };
const STORE_ACCOUNT: Readonly<Record<StoreName, string>> = { apple: 'da sua conta Apple', google: 'da sua conta Google' };

/**
 * Para onde vai a troca na loja (D-090 e D-127), pela mesma regra nas duas lojas: para o Família (de um Individual, mensal ou anual), na
 * hora, com o que sobrou do período pago descontado; para o Individual ou entre mensal e anual do mesmo plano, na próxima renovação. Na
 * Apple, é o grupo de assinaturas que faz isso (o Família mensal e o anual no nível 1, o Individual mensal e o anual no nível 2); no
 * Google, o app diz o modo da troca.
 */
export function storeChangeIsImmediate(from: { plan: PlanKind }, to: { plan: PlanKind }): boolean {
  return from.plan === 'individual' && to.plan === 'familiar';
}

/** Os textos da assinatura pelas lojas (tela Assinatura e exclusão da conta). */
export const STORE_SUBSCRIPTION_TEXT = {
  /** "Assinar o plano Individual" e, com o período (D-127), "Assinar o plano Individual anual". */
  subscribe: (plan: PlanKind, period?: BillingPeriod) => `Assinar o plano ${PLAN_NAME[plan]}${period ? ` ${PERIOD_NAME[period]}` : ''}`,
  subscribeBusy: 'Abrindo a loja',
  /** Antes dos botões de assinar. */
  howItWorks: (store: StoreName) =>
    `A assinatura é feita pela ${STORE_LABEL[store]}, com a forma de pagamento ${STORE_ACCOUNT[store]}. Os dados do pagamento ficam com a loja: a Clarevo não vê nem guarda.`,
  /** A renovação automática, como a Apple e o Google pedem antes da compra (preço, período, renovação e como cancelar). */
  autoRenew:
    'Cada plano é uma assinatura mensal ou anual, com o preço acima. Ela renova sozinha ao fim de cada período, a cada mês ou a cada ano, pelo mesmo preço, até você cancelar. Para evitar a cobrança do período seguinte, cancele nos ajustes de assinatura da loja até 24 horas antes da renovação. O acesso completo continua até o fim do período já pago.',
  terms: 'Termos de uso',
  privacy: 'Política de privacidade',
  legalOpenFailed: 'Não foi possível abrir a página. Tente de novo.',
  restore: 'Restaurar compras',
  restoreBusy: 'Procurando compras',
  restoreHint: 'Já assinou com esta conta da loja, em outro aparelho ou antes de reinstalar? Restaure a compra.',
  restored: 'Assinatura encontrada e ligada a esta conta da Clarevo. Ela aparece aqui em instantes.',
  restoreNone: 'Nenhuma assinatura da Clarevo foi encontrada nesta conta da loja.',
  purchased: 'Compra feita. A assinatura aparece aqui em instantes; se não aparecer, toque em Atualizar.',
  changed: 'Troca de plano feita na loja. A situação aparece aqui em instantes; se não aparecer, toque em Atualizar.',
  pending: 'O pagamento ficou pendente na loja. Quando a loja confirmar, a assinatura aparece aqui.',
  refresh: 'Atualizar',
  manage: (store: StoreName) => `Gerenciar na ${STORE_LABEL[store]}`,
  manageHint: (store: StoreName) => `Para cancelar, use os ajustes de assinatura da ${STORE_LABEL[store]}. O acesso completo continua até o fim do período já pago.`,
  changePlan: (plan: PlanKind) => `Mudar para o plano ${PLAN_NAME[plan]}`,
  /** Mudar entre mensal e anual no mesmo plano (D-127). */
  changePeriod: (period: BillingPeriod) => `Mudar para o ${PERIOD_NAME[period]}`,
  changeBusy: 'Abrindo a loja',
  changeNote:
    'Ao mudar para o Família, a troca vale na hora, e a loja desconta o que sobrou do período pago. Ao voltar para o Individual ou trocar entre mensal e anual, a troca vale na próxima renovação.',
  manageFailed: 'Não foi possível abrir os ajustes da loja. Abra a loja de aplicativos e procure Assinaturas.',
  /** Excluir a conta: a assinatura da loja não é cancelada pela Clarevo. */
  deleteNote: (store: StoreName) =>
    `A sua assinatura é pela ${STORE_LABEL[store]}. Excluir a conta não cancela a cobrança da loja: antes de excluir, cancele a assinatura nos ajustes da ${STORE_LABEL[store]}.`,
  errors: {
    nao_permitido: 'Compras estão bloqueadas neste aparelho, por exemplo pelo controle dos pais. Libere nas configurações do aparelho e tente de novo.',
    ja_assinante_loja: 'Esta conta da loja já tem uma assinatura da Clarevo. Toque em Restaurar compras para ligá-la a esta conta.',
    rede: 'Sem conexão com a loja. Confira a internet e tente de novo.',
    indisponivel: 'A assinatura pela loja não está disponível agora. Tente de novo mais tarde.',
    tente_de_novo: 'Não foi possível concluir. Tente de novo em instantes.',
  },
} as const;
