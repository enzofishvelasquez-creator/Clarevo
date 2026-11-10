/**
 * Compra da assinatura pelas lojas (D-090), no iPhone e no Android, pelo SDK do RevenueCat (`react-native-purchases`). A versão web
 * (`store-purchases.web.ts`) não tem nada disso: na web a assinatura é pelo Asaas (D-084), e o pacote nativo fica fora do site.
 *
 * O SDK só é configurado quando a pessoa toca em assinar, mudar de plano ou "Restaurar compras", já com o identificador da conta da
 * Clarevo (o mesmo `persons.id`, um código aleatório; nunca nome nem e-mail): quem só olha os planos não aparece no RevenueCat. Sem
 * coleta de identificadores do aparelho. As chaves públicas do SDK (uma por loja, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` e
 * `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, nos ambientes do EAS) são feitas para ir no app, como a chave pública do Supabase; sem elas,
 * os botões de assinar não aparecem. `EXPO_PUBLIC_STORE_TEST=sim` (só em builds de teste) mostra os botões antes de a compra abrir.
 */
import {
  GOOGLE_BASE_PLAN,
  STORE_PRODUCT_IDS,
  planOfStoreProduct,
  type PlanKind,
  type StoreName,
  type StorePurchaseResult,
  type StoreRestoreResult,
} from '@clarevo/core';
import { Linking, Platform } from 'react-native';
import Purchases, { PRODUCT_CATEGORY, PURCHASES_ERROR_CODE, STORE_REPLACEMENT_MODE } from 'react-native-purchases';

const RAW_KEY = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : Platform.OS === 'android' ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY : undefined;
const KEY = typeof RAW_KEY === 'string' && /^[A-Za-z0-9_]{10,200}$/.test(RAW_KEY.trim()) ? RAW_KEY.trim() : null;

/** A loja do aparelho. */
export const DEVICE_STORE: StoreName | null = Platform.OS === 'ios' ? 'apple' : Platform.OS === 'android' ? 'google' : null;

/** Se a compra pela loja pode ser usada neste app (aparelho com loja e a chave pública configurada no build). */
export const STORE_PURCHASES_READY = DEVICE_STORE !== null && KEY !== null;

/** Build de teste da equipe: os botões aparecem antes de a compra abrir (`SUBSCRIBE_OPEN`), para testar com as compras de teste. */
export const STORE_TEST = process.env.EXPO_PUBLIC_STORE_TEST === 'sim';

let configured = false;
let currentPerson: string | null = null;

/**
 * Configura o SDK na primeira vez, já com a pessoa; depois, troca de pessoa se outra conta entrou no mesmo aparelho (o SDK só é
 * configurado uma vez por abertura do app).
 */
async function ready(personId: string): Promise<void> {
  if (!KEY) throw new Error('sem_chave');
  if (!configured) {
    Purchases.configure({ apiKey: KEY, appUserID: personId, automaticDeviceIdentifierCollectionEnabled: false });
    configured = true;
    currentPerson = personId;
    return;
  }
  if (currentPerson !== personId) {
    await Purchases.logIn(personId);
    currentPerson = personId;
  }
}

function errorCode(e: unknown): string | null {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : null;
  return typeof code === 'string' ? code : null;
}

function purchaseError(e: unknown): StorePurchaseResult {
  switch (errorCode(e)) {
    case PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR:
      return 'cancelado';
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return 'pendente';
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return 'nao_permitido';
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
    case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
    case PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR:
    case PURCHASES_ERROR_CODE.PURCHASE_BELONGS_TO_OTHER_USER:
      return 'ja_assinante_loja';
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
      return 'rede';
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
    case PURCHASES_ERROR_CODE.CONFIGURATION_ERROR:
    case PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR:
      return 'indisponivel';
    default:
      return 'tente_de_novo';
  }
}

/**
 * Compra o plano na loja. `current`: o plano que a pessoa já assina nesta loja, para a troca de plano. No iPhone, os dois produtos
 * estão no mesmo grupo de assinaturas, e a própria App Store faz a troca (o Família vale na hora; o Individual, na renovação). No
 * Android, a troca diz ao Google qual assinatura substituir: para o Família, na hora, com o tempo que sobrou descontado; para o
 * Individual, na próxima renovação.
 */
export async function buyPlan(personId: string, plan: PlanKind, current: PlanKind | null = null): Promise<StorePurchaseResult> {
  if (!STORE_PURCHASES_READY) return 'indisponivel';
  try {
    await ready(personId);
    const products = await Purchases.getProducts([STORE_PRODUCT_IDS[plan]], PRODUCT_CATEGORY.SUBSCRIPTION);
    // No Google, o produto vem com o plano básico ("clarevo_individual_mensal:mensal"); fica o mensal.
    const product =
      products.find((p) => p.identifier === STORE_PRODUCT_IDS[plan]) ??
      products.find((p) => p.identifier === `${STORE_PRODUCT_IDS[plan]}:${GOOGLE_BASE_PLAN}`) ??
      products.find((p) => planOfStoreProduct(p.identifier) === plan);
    if (!product) return 'indisponivel';
    const change =
      Platform.OS === 'android' && current && current !== plan
        ? {
            oldProductIdentifier: STORE_PRODUCT_IDS[current],
            replacementMode: plan === 'familiar' ? STORE_REPLACEMENT_MODE.WITH_TIME_PRORATION : STORE_REPLACEMENT_MODE.DEFERRED,
          }
        : null;
    await Purchases.purchaseStoreProduct(product, change);
    return 'comprado';
  } catch (e) {
    return purchaseError(e);
  }
}

/** "Restaurar compras": liga à conta da Clarevo a assinatura que a conta da loja já tem (em outro aparelho ou antes de reinstalar). */
export async function restorePurchases(personId: string): Promise<StoreRestoreResult> {
  if (!STORE_PURCHASES_READY) return 'indisponivel';
  try {
    await ready(personId);
    const info = await Purchases.restorePurchases();
    return info.activeSubscriptions.some((id) => planOfStoreProduct(id) !== null) ? 'restaurado' : 'nada';
  } catch (e) {
    const r = purchaseError(e);
    return r === 'rede' || r === 'indisponivel' ? r : 'tente_de_novo';
  }
}

/** Abre os ajustes de assinatura da loja (sem o SDK: nada vai ao RevenueCat). Devolve `false` se o sistema não conseguiu abrir. */
export async function openStoreSubscriptions(): Promise<boolean> {
  const url =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : Platform.OS === 'android'
        ? 'https://play.google.com/store/account/subscriptions'
        : null;
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
