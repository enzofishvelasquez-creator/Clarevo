/**
 * Assinatura na web pelo Asaas (D-084, fase 2 da D-083): a função do servidor "assinatura-web" (Edge Function do Supabase), gerada
 * num arquivo só por `scripts/gerar-funcoes.js`. Faz duas coisas, pelo mesmo endereço:
 *
 * 1. **Para o app (web), com a sessão da pessoa** (Authorization: Bearer <token da sessão>): "assinar" cria um Checkout recorrente no
 *    Asaas (cartão de crédito, cobrança mensal ou anual, primeira cobrança hoje ou, no teste grátis, no fim do teste) com a referência da pessoa e devolve o link da página de
 *    pagamento do Asaas; "cancelar" remove no Asaas a assinatura ativa da pessoa (o mês pago continua valendo). A pessoa informa os
 *    dados do cartão e o CPF na página do Asaas: a Clarevo não coleta nem guarda nada disso.
 * 2. **Para o Asaas (avisos, webhooks)**, com o token combinado no cabeçalho `asaas-access-token`: a cada aviso de assinatura ou de
 *    cobrança de assinatura, consulta o estado atual no Asaas (a assinatura e as cobranças dela), calcula até quando o acesso vale e
 *    chama `billing_apply` no banco (idempotente pelo identificador do aviso e na ordem dos eventos). Responde 200 a todo aviso
 *    autenticado que não precisa ser repetido, porque 15 falhas seguidas param a fila do Asaas; só falha passageira responde 500, e
 *    antes de o Asaas desistir (10 segundos): cada pedido tem um prazo e o aviso inteiro tem um orçamento de tempo.
 *
 * Quem é a pessoa: a referência `clarevo:<id da pessoa>:<plano>` vai no Checkout (`externalReference`) e, por garantia, o Checkout fica
 * ligado à pessoa no banco (`billing_checkout_record`, só o resumo SHA-256 do identificador). O aviso traz a assinatura com a
 * referência ou com o identificador do Checkout (`checkoutSession`); sem referência, a função a grava na assinatura do Asaas para as
 * próximas vezes. Assinatura já aplicada antes é achada também pelo resumo dela no banco (`billing_person_by_external_ref`), o que
 * cobre estorno depois de cancelar. Ninguém de fora cria assinatura na conta da Clarevo no Asaas, então a referência é confiável.
 *
 * Até quando vale: o fim do período coberto pela última cobrança paga (vencimento mais um ciclo) e, com a assinatura ativa, mais
 * WEB_GRACE_DAYS de tolerância para a renovação; cancelada, vale até o fim do período pago; estorno ou contestação tira o período da
 * cobrança na hora. Sem cobrança paga, nada vale.
 *
 * Assinar no teste grátis (D-129, decisão do Enzo de 26/11/2026): quem assina no cartão durante o teste não perde os dias que faltam. A
 * primeira cobrança do Checkout fica para o dia do fim do teste (`paidStartDay`, com o `my_access` lido com a sessão da pessoa, nunca com
 * o que o app manda), e o acesso continua no teste até lá. Os avisos dessa assinatura chegam antes de haver cobrança paga: com a primeira
 * cobrança pendente e marcada para depois de hoje, o direito vai ao banco valendo só do começo do dia dela até o fim dele mais
 * WEB_GRACE_DAYS (`p_valid_from`, migração 0048), para não haver buraco entre o fim do teste e a confirmação do cartão; antes desse dia, o
 * banco continua dizendo "teste". Cancelada antes da primeira cobrança, nada é cobrado, e o acesso acaba com o teste. O período pago conta
 * do vencimento da primeira cobrança, o fim do teste. O Pix pago no teste começa no fim do teste pelo próprio banco (`billing_pix_apply`,
 * migração 0048), sem nada novo aqui.
 *
 * Plano anual (D-127): "assinar" e "pix" aceitam o período (`period`: `mensal`, o padrão do app de antes, ou `anual`). No cartão, a
 * assinatura do Asaas é anual (`cycle: YEARLY`), e o fim do período pago já segue o ciclo (`periodEnd`); a consulta das cobranças olha os
 * últimos 14 meses numa assinatura anual (a última cobrança paga pode ter quase um ano). No Pix, um pagamento vale 12 meses (referência
 * `clarevo-pix:<id da pessoa>:<plano>:anual`). O período vai ao banco só quando é anual (`p_period`, migração 0047; sem ele, mensal).
 *
 * Pix mês a mês (D-093, caminho B, docs/39 seção 6): "pix" cria um Checkout do Asaas com Pix avulso (`chargeTypes: DETACHED`) de um mês,
 * com a referência `clarevo-pix:<id da pessoa>:<plano>`; a pessoa informa os dados na página do Asaas. Os avisos de cobrança sem assinatura
 * (`PAYMENT_*`) e o `CHECKOUT_PAID` levam à cobrança atual no Asaas, que acha a pessoa pela referência, pelo Checkout no banco ou pelo
 * pagamento já gravado, e chamam `billing_pix_apply` (só o resumo SHA-256 do identificador da cobrança e o dia do pagamento), que
 * recalcula até quando o acesso vale (origem 'pix'). Pagar o próximo mês só nos últimos PIX_PAY_AHEAD_DAYS dias do mês pago.
 *
 * Desistência em 7 dias (direito de arrependimento, CDC art. 49; D-131, item F; regras em `desistencia.ts`): "desistencia" diz ao app se há uma
 * compra pela web no prazo (o valor, o último dia e o acesso que fica depois) e "desistir" grava o pedido no banco (`billing_withdrawal_begin`,
 * migração 0050, uma linha por compra: dois toques ou uma repetição nunca devolvem duas vezes), remove a assinatura do cartão no Asaas e pede
 * a devolução integral da cobrança paga (`POST /v3/payments/{id}/refund`); o período pago sai pelo aviso de estorno do Asaas, como antes, e
 * esse aviso também marca o pedido como devolvido (`billing_withdrawal_finish`), inclusive quando a equipe devolve pelo painel. O pedido
 * gravado no prazo continua depois dele (a devolução que ficou sem resposta no 7º dia é concluída no dia seguinte). Fechada por
 * WITHDRAWAL_OPEN (`plano-precos.ts`) até o advogado aprovar o texto: com ela fechada, as duas respondem 503 "indisponivel", menos com a
 * chave do sandbox (o teste da equipe).
 *
 * Segredos (painel do Supabase, Edge Functions, Secrets, só o Enzo): ASAAS_API_KEY (começa com $aact_prod_ em produção e $aact_hmlg_ no
 * sandbox, que define o ambiente) e ASAAS_WEBHOOK_TOKEN (32 a 255 caracteres, inventado, diferente da chave). SUPABASE_URL, a chave de
 * serviço e a chave pública (SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY, usada nas chamadas feitas como a pessoa) o Supabase fornece.
 * Opcional: CLAREVO_APP_URL (padrão https://app.clarevo.app.br), de onde o app chama e para onde o Asaas devolve a pessoa. Nenhum
 * segredo entra no app nem no repositório, e nenhum identificador da pessoa vai para o registro (logs).
 */
import { addDays, addMonthsToDate, todayIn, type IsoDate } from '../dates';
import { PLAN_NAME, PLAN_PERIOD_PRICE_CENTS, SUBSCRIBE_OPEN, WITHDRAWAL_OPEN, type BillingPeriod, type PlanKind } from '../plano-precos';
import { obj, sameText, serviceHeaders, serviceKeyFrom } from '../servidor-comum';
import { sha256Hex, utf8Bytes } from '../sha256';
import {
  REFUNDABLE_STATUSES,
  REFUND_STATUSES,
  WITHDRAWAL_REFUND_DESCRIPTION,
  cardWithdrawal,
  pixWithdrawal,
  withdrawalLastDay,
  type PixPurchaseRow,
  type WithdrawalCheck,
} from './desistencia';
import { parsePixReference, pixCanPayNext, pixReference } from './pix';
import { paidStartDay } from './primeira-cobranca';

export const ASAAS_PRODUCTION_URL = 'https://api.asaas.com/v3';
export const ASAAS_SANDBOX_URL = 'https://api-sandbox.asaas.com/v3';
/** Prefixos das chaves de API do Asaas por ambiente (documentação "Autentique suas requisições", lida em 06/11/2026). */
export const ASAAS_KEY_PRODUCTION = '$aact_prod_';
export const ASAAS_KEY_SANDBOX = '$aact_hmlg_';
/** O token dos avisos: 32 a 255 caracteres (o Asaas aceita isso; letras, algarismos, _ e -, como os outros segredos da Clarevo). */
export const ASAAS_WEBHOOK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,255}$/;
export const APP_URL_DEFAULT = 'https://app.clarevo.app.br';
/** Dias de tolerância depois do fim do período pago, com a assinatura ativa (a renovação no cartão pode atrasar). */
export const WEB_GRACE_DAYS = 3;
/** O Checkout do Asaas vale por 60 minutos (o Asaas aceita de 10 a 1440). */
export const CHECKOUT_MINUTES = 60;
export const ASAAS_MAX_BODY_BYTES = 256 * 1024;
export const APP_MAX_BODY_BYTES = 4 * 1024;
/** Orçamento de tempo de um pedido (o Asaas conta como falha a resposta depois de 10 segundos) e o prazo de cada chamada. */
export const REQUEST_BUDGET_MS = 8500;
export const CALL_TIMEOUT_MS = 3000;
/** Só as cobranças com vencimento nos últimos meses interessam (a última paga e as seguintes); evita a página de 100 do Asaas. */
export const PAYMENTS_LOOKBACK_MONTHS = 4;
/** Na assinatura anual (D-127), a última cobrança paga pode ter vencido quase um ano antes: 14 meses cobrem o ano pago e a tolerância. */
export const PAYMENTS_LOOKBACK_MONTHS_YEARLY = 14;

/** Quantos meses de cobranças consultar numa assinatura, pelo ciclo dela. */
export function paymentsLookbackMonths(cycle: string): number {
  return cycle === 'YEARLY' ? PAYMENTS_LOOKBACK_MONTHS_YEARLY : PAYMENTS_LOOKBACK_MONTHS;
}

/** O período da Clarevo de uma assinatura do Asaas, pelo ciclo (a Clarevo só cria mensal e anual). */
export function periodOfCycle(cycle: string): BillingPeriod {
  return cycle === 'YEARLY' ? 'anual' : 'mensal';
}

/** O ciclo da assinatura do Asaas de cada período. */
export const ASAAS_CYCLE: Readonly<Record<BillingPeriod, 'MONTHLY' | 'YEARLY'>> = { mensal: 'MONTHLY', anual: 'YEARLY' };
/** Fuso do Asaas (datas dos avisos e vencimentos): Brasília, sem horário de verão desde 2019. */
export const ASAAS_TIME_ZONE = 'America/Sao_Paulo';
const ASAAS_OFFSET = '-03:00';
/** Situações de cobrança que contam como pagas (a disputa de contestação vencida pela Clarevo continua paga). */
export const PAID_STATUSES: ReadonlySet<string> = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED', 'AWAITING_CHARGEBACK_REVERSAL']);
export const PLANS: readonly PlanKind[] = ['individual', 'familiar'];

export interface AssinaturaWebConfig {
  apiKey: string;
  apiBase: string;
  sandbox: boolean;
  webhookToken: string;
  supabaseUrl: string;
  serviceKey: string;
  /** A chave pública do projeto, para as chamadas feitas como a pessoa (com o token da sessão dela); sem ela, a de serviço. */
  userApiKey: string;
  /** Origem do app na web (sem barra no fim): de onde a tela chama e para onde o Asaas devolve a pessoa. */
  appUrl: string;
}

/** Configuração lida dos segredos. null quando falta algum ou a chave não é do Asaas (a função responde 503 e não faz nada). */
export function assinaturaWebConfigFrom(env: (name: string) => string | undefined): AssinaturaWebConfig | null {
  const v = (name: string) => (env(name) ?? '').trim();
  const apiKey = v('ASAAS_API_KEY');
  const sandbox = apiKey.startsWith(ASAAS_KEY_SANDBOX);
  if (!sandbox && !apiKey.startsWith(ASAAS_KEY_PRODUCTION)) return null;
  const webhookToken = v('ASAAS_WEBHOOK_TOKEN');
  if (!ASAAS_WEBHOOK_TOKEN_PATTERN.test(webhookToken) || webhookToken === apiKey) return null;
  const supabaseUrl = v('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = serviceKeyFrom(v);
  if (supabaseUrl === '' || serviceKey === '') return null;
  const userApiKey = v('SUPABASE_PUBLISHABLE_KEY') || v('SUPABASE_ANON_KEY') || serviceKey;
  const appUrl = (v('CLAREVO_APP_URL') || APP_URL_DEFAULT).replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(appUrl) && !/^http:\/\/localhost(:\d+)?$/.test(appUrl)) return null;
  return { apiKey, apiBase: sandbox ? ASAAS_SANDBOX_URL : ASAAS_PRODUCTION_URL, sandbox, webhookToken, supabaseUrl, serviceKey, userApiKey, appUrl };
}

// ---------------------------------------------------------------------------
// Referência da pessoa e leitura dos objetos do Asaas
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WebReference {
  personId: string;
  plan: PlanKind;
  /** O período (D-127): o do Pix pela referência ou pelo banco; no cartão, quem decide é o ciclo da assinatura. Sem ele, mensal. */
  period?: BillingPeriod;
}

/** `externalReference` do Checkout e da assinatura no Asaas: a pessoa e o plano. Nunca nome nem e-mail. */
export function webReference(personId: string, plan: PlanKind): string {
  return `clarevo:${personId.toLowerCase()}:${plan}`;
}

export function parseWebReference(ref: unknown): WebReference | null {
  if (typeof ref !== 'string') return null;
  const m = /^clarevo:([0-9a-f-]{36}):(individual|familiar)$/i.exec(ref.trim());
  if (!m || !UUID.test(m[1] ?? '')) return null;
  return { personId: (m[1] ?? '').toLowerCase(), plan: m[2] as PlanKind };
}

export interface AsaasSubscription {
  id: string;
  status: string;
  deleted: boolean;
  cycle: string;
  value: number | null;
  nextDueDate: IsoDate | null;
  /** O dia em que a assinatura foi criada no Asaas (D-129: a primeira cobrança de quem assinou no teste é num dia depois dele). */
  dateCreated: IsoDate | null;
  externalReference: string | null;
  checkoutSession: string | null;
}

export interface AsaasPayment {
  id: string;
  status: string;
  deleted: boolean;
  dueDate: IsoDate | null;
  subscription: string | null;
  /** A referência da Clarevo, quando o Asaas a leva do Checkout para a cobrança (a documentação não garante). */
  externalReference: string | null;
  /** O Checkout que criou a cobrança (cobrança avulsa do Pix). */
  checkoutSession: string | null;
  /** O dia do pagamento: a liquidação no Asaas e, sem ela, o dia informado pelo pagador ou a confirmação. */
  paidOn: IsoDate | null;
  /** PIX, CREDIT_CARD, BOLETO ou UNDEFINED (nulo quando o Asaas não diz). */
  billingType: string | null;
  /**
   * O dia da confirmação do pagamento (no cartão, o dia da cobrança; o `paymentDate` do cartão é o do crédito, 32 dias depois), para o prazo
   * da desistência (D-131, item F). Ausente nos objetos montados à mão.
   */
  confirmedOn?: IsoDate | null;
  /** O valor da cobrança, em centavos (o Asaas manda em reais), para a devolução integral na desistência. */
  valueCents?: number | null;
}

const isoDate = (v: unknown): IsoDate | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function asaasSubscriptionFrom(raw: unknown): AsaasSubscription | null {
  const s = obj(raw);
  const id = text(s?.id);
  if (!s || !id) return null;
  return {
    id,
    status: text(s.status) ?? 'ACTIVE',
    deleted: s.deleted === true,
    cycle: text(s.cycle) ?? 'MONTHLY',
    value: typeof s.value === 'number' && Number.isFinite(s.value) ? s.value : null,
    nextDueDate: isoDate(s.nextDueDate),
    dateCreated: isoDate(s.dateCreated),
    externalReference: text(s.externalReference),
    checkoutSession: text(s.checkoutSession),
  };
}

/**
 * Uma assinatura que o Asaas já não devolve (removida): só o identificador; nada vale além do período pago. O ciclo mensal é provisório:
 * o aviso troca pelo do período já aplicado no banco, depois de achar a pessoa (D-127).
 */
export function goneSubscription(id: string): AsaasSubscription {
  return { id, status: 'INACTIVE', deleted: true, cycle: 'MONTHLY', value: null, nextDueDate: null, dateCreated: null, externalReference: null, checkoutSession: null };
}

export function asaasPaymentFrom(raw: unknown): AsaasPayment | null {
  const p = obj(raw);
  const id = text(p?.id);
  if (!p || !id) return null;
  return {
    id,
    status: text(p.status) ?? 'PENDING',
    deleted: p.deleted === true,
    dueDate: isoDate(p.dueDate),
    subscription: text(p.subscription),
    externalReference: text(p.externalReference),
    checkoutSession: text(p.checkoutSession),
    paidOn: isoDate(p.paymentDate) ?? isoDate(p.clientPaymentDate) ?? isoDate(p.confirmedDate),
    billingType: text(p.billingType),
    confirmedOn: isoDate(p.confirmedDate) ?? isoDate(p.clientPaymentDate),
    valueCents: typeof p.value === 'number' && Number.isFinite(p.value) && p.value > 0 ? Math.round(p.value * 100) : null,
  };
}

/** O dia que conta de uma cobrança de Pix: o do pagamento, se está paga (sem a data, hoje em Brasília); null se não está paga. */
export function pixPaidOn(p: AsaasPayment, today: IsoDate): IsoDate | null {
  if (p.deleted || !PAID_STATUSES.has(p.status)) return null;
  return p.paidOn && p.paidOn <= today ? p.paidOn : today;
}

/** O fim do período que uma cobrança com vencimento `dueDate` cobre, pelo ciclo da assinatura (mensal ou anual na Clarevo). */
export function periodEnd(dueDate: IsoDate, cycle: string): IsoDate {
  switch (cycle) {
    case 'WEEKLY':
      return addDays(dueDate, 7);
    case 'BIWEEKLY':
      return addDays(dueDate, 14);
    case 'BIMONTHLY':
      return addMonthsToDate(dueDate, 2);
    case 'QUARTERLY':
      return addMonthsToDate(dueDate, 3);
    case 'SEMIANNUALLY':
      return addMonthsToDate(dueDate, 6);
    case 'YEARLY':
      return addMonthsToDate(dueDate, 12);
    default:
      return addMonthsToDate(dueDate, 1);
  }
}

/** O fim de um dia civil em Brasília, em UTC. */
export function endOfDayBrasilia(day: IsoDate): Date {
  return new Date(`${day}T23:59:59.999${ASAAS_OFFSET}`);
}

/** O começo de um dia civil em Brasília, em UTC. */
export function startOfDayBrasilia(day: IsoDate): Date {
  return new Date(`${day}T00:00:00.000${ASAAS_OFFSET}`);
}

/** Até quantos dias à frente uma primeira cobrança marcada conta como a de quem assinou no teste grátis (o teste tem 14; o banco aceita 31). */
export const SCHEDULED_FIRST_CHARGE_MAX_DAYS = 31;

export interface WebValidity {
  /** O último dia do período já pago (nulo sem cobrança paga). */
  paidThrough: IsoDate | null;
  /**
   * Desde quando o direito vale, só na assinatura de quem assinou no teste grátis e ainda não pagou a primeira cobrança, marcada para depois
   * de hoje (D-129): o começo do dia dela. Nulo nas outras situações (o banco grava o agora, ou mantém o que já tinha).
   */
  validFrom: Date | null;
  /**
   * Até quando o acesso vale: o fim do período pago, mais a tolerância com a assinatura ativa; com a primeira cobrança marcada para depois de
   * hoje, o fim do dia dela mais a tolerância; sem cobrança paga, agora.
   */
  validUntil: Date;
}

/** Situações de uma primeira cobrança ainda por acontecer: pendente ou em análise de risco (a análise do cartão no dia da cobrança). */
const FIRST_CHARGE_PENDING: ReadonlySet<string> = new Set(['PENDING', 'AWAITING_RISK_ANALYSIS']);
/** Os avisos de cartão recusado na primeira cobrança: o acesso acaba (o teste já acabou), sem a janela do dia da cobrança. */
export const REFUSED_EVENTS: ReadonlySet<string> = new Set(['PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'PAYMENT_REPROVED_BY_RISK_ANALYSIS']);

/**
 * O dia da primeira cobrança de quem assinou no teste grátis (D-129), enquanto ela ainda não foi paga: a assinatura ativa, nenhuma cobrança
 * paga nem com outro desfecho (vencida, estornada), e a cobrança já gerada pelo Asaas, pendente (ou em análise de risco), marcada para
 * depois de hoje, em até SCHEDULED_FIRST_CHARGE_MAX_DAYS dias, ou para hoje numa assinatura criada antes de hoje (o próprio dia da
 * cobrança: qualquer aviso antes da confirmação do cartão, como o da cobrança atualizada ou uma repetição, mantém a janela, e o acesso não
 * acaba antes da hora). null nas outras situações: a cobrança de hoje numa assinatura de hoje (a de quem assina fora do teste, cobrada no
 * Checkout), o aviso de cartão recusado (`refused`), a cobrança vencida (OVERDUE, no dia seguinte) e a assinatura sem cobrança gerada (o
 * aviso da cobrança, quando ela for gerada, refaz a conta).
 */
export function scheduledFirstCharge(sub: AsaasSubscription, payments: readonly AsaasPayment[], now: Date, refused = false): IsoDate | null {
  if (refused || sub.status !== 'ACTIVE' || sub.deleted) return null;
  const live = payments.filter((p) => !p.deleted);
  if (live.length === 0 || live.some((p) => !FIRST_CHARGE_PENDING.has(p.status))) return null;
  const due = live.map((p) => p.dueDate).filter((d): d is IsoDate => d !== null).sort()[0];
  if (!due) return null;
  const today = todayIn(ASAAS_TIME_ZONE, now);
  if (due > addDays(today, SCHEDULED_FIRST_CHARGE_MAX_DAYS)) return null;
  if (due > today) return due;
  return due === today && sub.dateCreated !== null && sub.dateCreated < due ? due : null;
}

/**
 * Até quando o acesso vale, pelo estado atual da assinatura e das cobranças dela no Asaas. `refused`: o aviso é de cartão recusado (D-129:
 * a primeira cobrança recusada não guarda a janela do dia da cobrança).
 */
export function webValidity(sub: AsaasSubscription, payments: readonly AsaasPayment[], now: Date, refused = false): WebValidity {
  let paidThrough: IsoDate | null = null;
  for (const p of payments) {
    if (p.deleted || !p.dueDate || !PAID_STATUSES.has(p.status)) continue;
    const end = periodEnd(p.dueDate, sub.cycle);
    if (!paidThrough || end > paidThrough) paidThrough = end;
  }
  if (!paidThrough) {
    // Assinou no teste grátis (D-129): vale do começo do dia da primeira cobrança ao fim dele mais a tolerância, para não haver buraco entre
    // o fim do teste e a confirmação do cartão. Antes desse dia, o banco continua no teste.
    const first = scheduledFirstCharge(sub, payments, now, refused);
    if (first) return { paidThrough: null, validFrom: startOfDayBrasilia(first), validUntil: endOfDayBrasilia(addDays(first, WEB_GRACE_DAYS)) };
    return { paidThrough: null, validFrom: null, validUntil: now };
  }
  const grace = sub.status === 'ACTIVE' && !sub.deleted ? WEB_GRACE_DAYS : 0;
  return { paidThrough, validFrom: null, validUntil: endOfDayBrasilia(addDays(paidThrough, grace)) };
}

/** "2024-06-12 16:45:03" (Brasília) ou ISO 8601. null quando não é data. */
export function parseAsaasDate(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(v.trim());
  if (!m) return null;
  const zone = m[3] ? m[3].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') : ASAAS_OFFSET;
  const d = new Date(`${m[1]}T${m[2]}${zone}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface AsaasEvent {
  id: string;
  event: string;
  /** Quando o evento aconteceu no Asaas (sem data válida, a hora do recebimento). */
  at: Date;
  /** A assinatura do aviso (eventos SUBSCRIPTION_*) ou a da cobrança (PAYMENT_* de assinatura); nula nos outros avisos. */
  subscriptionId: string | null;
  subscription: AsaasSubscription | null;
  /** A cobrança do aviso (PAYMENT_*), com ou sem assinatura. */
  payment: AsaasPayment | null;
  /** O Checkout do aviso (CHECKOUT_*). */
  checkoutId: string | null;
}

export function asaasEventFrom(payload: unknown, now: Date): AsaasEvent | null {
  const e = obj(payload);
  const id = text(e?.id);
  const event = text(e?.event);
  if (!e || !id || id.length > 200 || !event) return null;
  const subscription = asaasSubscriptionFrom(e.subscription);
  const payment = asaasPaymentFrom(e.payment);
  const checkoutId = event.startsWith('CHECKOUT_') ? text(obj(e.checkout)?.id) : null;
  return { id, event, at: parseAsaasDate(e.dateCreated) ?? now, subscriptionId: subscription?.id ?? payment?.subscription ?? null, subscription, payment, checkoutId };
}

// ---------------------------------------------------------------------------
// Pedidos ao Asaas e ao banco
// ---------------------------------------------------------------------------

export interface HttpResponse {
  status: number;
  text(): Promise<string>;
}
export interface HttpInit {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  /** Prazo da chamada; quem liga a função ao `fetch` o transforma em `AbortSignal.timeout`. */
  timeoutMs: number;
}
export type HttpFetch = (url: string, init: HttpInit) => Promise<HttpResponse>;

interface JsonResponse {
  status: number;
  json: unknown;
}

/** Falha passageira (rede, prazo, 5xx): quem chamou pode tentar de novo (o Asaas entrega o aviso de novo). */
export class TransientError extends Error {}
/** A chamada ao Asaas saiu e ficou sem resposta clara (rede, prazo, 5xx): o Asaas pode ter feito o que foi pedido. */
export class AsaasCallError extends TransientError {}
/** O pedido de devolução ao Asaas ficou sem resposta clara: a devolução pode ter saído (a trava da desistência fica por alguns minutos). */
export class RefundUnclearError extends TransientError {}

/** O orçamento de tempo de um pedido: cada chamada recebe o que falta, até CALL_TIMEOUT_MS; esgotado, nem começa. */
export function budget(startedAt: number, clock: () => number = Date.now) {
  return (): number => {
    const left = REQUEST_BUDGET_MS - (clock() - startedAt);
    if (left < 200) throw new TransientError('sem tempo para concluir o pedido');
    return Math.min(CALL_TIMEOUT_MS, left);
  };
}

async function readJson(res: HttpResponse): Promise<JsonResponse> {
  const body = await res.text();
  let json: unknown = null;
  try {
    json = body === '' ? null : (JSON.parse(body) as unknown);
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** O caminho sem a consulta (a consulta pode levar a referência da pessoa; o registro não a recebe). */
const bare = (path: string) => path.replace(/\?.*$/, '');

function asaasClient(config: AssinaturaWebConfig, fetcher: HttpFetch, timeLeft: () => number) {
  return async (method: HttpInit['method'], path: string, body?: unknown): Promise<JsonResponse> => {
    const init: HttpInit = {
      method,
      headers: { access_token: config.apiKey, 'User-Agent': 'Clarevo', 'Content-Type': 'application/json' },
      timeoutMs: timeLeft(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    let res: HttpResponse;
    try {
      res = await fetcher(`${config.apiBase}${path}`, init);
    } catch {
      throw new AsaasCallError(`Asaas indisponível em ${method} ${bare(path)}`);
    }
    const out = await readJson(res);
    if (out.status >= 500) throw new AsaasCallError(`Asaas respondeu ${out.status} em ${method} ${bare(path)}`);
    return out;
  };
}
type AsaasCall = ReturnType<typeof asaasClient>;

function supabaseClient(config: AssinaturaWebConfig, fetcher: HttpFetch, timeLeft: () => number) {
  const call = async (what: string, url: string, init: Omit<HttpInit, 'timeoutMs'>): Promise<JsonResponse> => {
    const timeoutMs = timeLeft();
    let res: HttpResponse;
    try {
      res = await fetcher(url, { ...init, timeoutMs });
    } catch {
      throw new TransientError(`banco indisponível em ${what}`);
    }
    const out = await readJson(res);
    if (out.status >= 500) throw new TransientError(`banco respondeu ${out.status} em ${what}`);
    return out;
  };
  return {
    /** Função do banco com a chave de serviço (billing_apply, billing_checkout_*, billing_person_by_external_ref). */
    rpcService: (fn: string, args: Record<string, unknown>) =>
      call(fn, `${config.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: serviceHeaders(config.serviceKey), body: JSON.stringify(args) }),
    /** Função do banco como a pessoa (my_access), com o token da sessão dela e a chave pública do projeto. */
    rpcAsUser: (fn: string, jwt: string) =>
      call(fn, `${config.supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: config.userApiKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: '{}',
      }),
    /** Quem é a pessoa do token (o Supabase confere a assinatura e a validade). null quando o token não vale. */
    userId: async (jwt: string): Promise<string | null> => {
      const r = await call('auth', `${config.supabaseUrl}/auth/v1/user`, { method: 'GET', headers: { apikey: config.userApiKey, Authorization: `Bearer ${jwt}` } });
      const id = text(obj(r.json)?.id);
      return r.status === 200 && id && UUID.test(id) ? id.toLowerCase() : null;
    },
  };
}

/**
 * A volta da página do Asaas para a tela Assinatura (`?pagamento=sucesso|cancelado|expirado`). No sandbox (D-129), com `&assinar=teste`:
 * o teste da equipe continua vendo a área de compra e o cancelamento depois de pagar.
 */
function backUrl(appUrl: string, sandbox: boolean): (result: string) => string {
  return (result) => `${appUrl}/conta/assinatura?pagamento=${result}${sandbox ? '&assinar=teste' : ''}`;
}

/**
 * O corpo do Checkout recorrente: cartão, mensal ou anual (D-127), a primeira cobrança no dia `firstDue` (hoje ou, para quem assina no teste
 * grátis, o dia do fim do teste, D-129), a referência da pessoa e a volta para a tela Assinatura. A referência é a mesma nos dois períodos:
 * o período da assinatura é o ciclo dela no Asaas.
 */
export function checkoutRequest(
  personId: string,
  plan: PlanKind,
  appUrl: string,
  firstDue: IsoDate,
  period: BillingPeriod = 'mensal',
  sandbox = false,
): Record<string, unknown> {
  const back = backUrl(appUrl, sandbox);
  return {
    billingTypes: ['CREDIT_CARD'],
    chargeTypes: ['RECURRENT'],
    minutesToExpire: CHECKOUT_MINUTES,
    externalReference: webReference(personId, plan),
    callback: { successUrl: back('sucesso'), cancelUrl: back('cancelado'), expiredUrl: back('expirado') },
    items: [
      {
        name: `Clarevo, plano ${PLAN_NAME[plan]}`,
        description: period === 'anual' ? 'Assinatura anual' : 'Assinatura mensal',
        quantity: 1,
        value: PLAN_PERIOD_PRICE_CENTS[plan][period] / 100,
      },
    ],
    subscription: { cycle: ASAAS_CYCLE[period], nextDueDate: firstDue },
  };
}

/**
 * O corpo do Checkout de um mês (ou, no anual, de um ano, D-127) com Pix (D-093, caminho B): Pix avulso, a referência de Pix da pessoa e a
 * mesma volta para a tela Assinatura. O nome do item tem até 30 caracteres (documentação do Asaas).
 */
export function checkoutPixRequest(personId: string, plan: PlanKind, appUrl: string, period: BillingPeriod = 'mensal', sandbox = false): Record<string, unknown> {
  const back = backUrl(appUrl, sandbox);
  return {
    billingTypes: ['PIX'],
    chargeTypes: ['DETACHED'],
    minutesToExpire: CHECKOUT_MINUTES,
    externalReference: pixReference(personId, plan, period),
    callback: { successUrl: back('sucesso'), cancelUrl: back('cancelado'), expiredUrl: back('expirado') },
    items: [
      {
        name: `Clarevo, plano ${PLAN_NAME[plan]}`,
        description: period === 'anual' ? 'Um ano de acesso, pago com Pix' : 'Um mês de acesso, pago com Pix',
        quantity: 1,
        value: PLAN_PERIOD_PRICE_CENTS[plan][period] / 100,
      },
    ],
  };
}

/** O período só vai ao banco quando é anual: sem ele, o banco grava mensal, e a função segue funcionando com o banco de antes da 0047. */
function periodArg(period: BillingPeriod | undefined): Record<string, string> {
  return period === 'anual' ? { p_period: 'anual' } : {};
}

/**
 * O começo do direito só vai ao banco na assinatura de quem assinou no teste grátis, antes da primeira cobrança (D-129, migração 0048): nos
 * outros avisos, a função segue funcionando com o banco de antes da 0048.
 */
function validFromArg(validFrom: Date | null): Record<string, string> {
  return validFrom ? { p_valid_from: validFrom.toISOString() } : {};
}

/** O link da página de pagamento: o que o Asaas devolve ou, sem ele, o endereço padrão com o identificador. */
export function checkoutLink(response: unknown, sandbox: boolean): string | null {
  const r = obj(response);
  const link = text(r?.link);
  if (link && /^https:\/\/[a-z0-9.-]*asaas\.com\//.test(link)) return link;
  const id = text(r?.id);
  return id ? `https://${sandbox ? 'sandbox.' : ''}asaas.com/checkoutSession/show?id=${encodeURIComponent(id)}` : null;
}

// ---------------------------------------------------------------------------
// A função
// ---------------------------------------------------------------------------

export interface AssinaturaWebRequest {
  method: string;
  header(name: string): string | null;
  /** O corpo, em texto. */
  body(): Promise<string>;
}

export interface AssinaturaWebResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface AssinaturaWebDeps {
  config: AssinaturaWebConfig | null;
  fetch: HttpFetch;
  log?: (message: string) => void;
  now?: () => Date;
}

/** O acesso que fica depois da desistência (o de `clarevo_access`, calculado no banco como se a compra fosse devolvida): situação, fim e origem. */
export interface WithdrawalAfter {
  status: string;
  until: string | null;
  provider: string | null;
}

/** O meio de pagamento da compra: a assinatura no cartão ou um pagamento por Pix. */
export type WithdrawalMethod = 'cartao' | 'pix';

/** "desistencia": a compra pela web que está no prazo, com o valor, o último dia (Brasília) e o acesso que fica depois. */
export interface WithdrawalOfferReply {
  result: 'pode';
  meio: WithdrawalMethod;
  plan: PlanKind;
  period: BillingPeriod;
  amountCents: number;
  lastDay: IsoDate;
  after: WithdrawalAfter | null;
}

/** "desistir" (e "desistencia" depois dele): o pedido recebido, com a hora em que chegou (a confirmação imediata, Decreto 7.962/2013, art. 5º, § 4º). */
export interface WithdrawalReceiptReply {
  result: 'recebida';
  meio: WithdrawalMethod;
  requestedAt: string;
  amountCents: number | null;
  after: WithdrawalAfter | null;
}

/** As respostas da função ao app. */
export type AssinaturaWebResult =
  | { result: 'checkout'; url: string }
  | { result: 'ativa'; nextDueDate: IsoDate | null }
  | WithdrawalOfferReply
  | WithdrawalReceiptReply
  /** A desistência que ficou pela metade (o Asaas não respondeu): o pedido continua gravado, com a hora. */
  | { result: 'tente_de_novo'; requestedAt: string }
  | { result: 'em_andamento'; requestedAt: string | null }
  | {
      result:
        | 'ja_assinante'
        | 'cartao_ativo'
        | 'assinatura_marcada'
        | 'ja_pago'
        | 'sem_necessidade'
        | 'muitas_tentativas'
        | 'cancelada'
        | 'sem_assinatura'
        | 'nao_autenticado'
        | 'pedido_invalido'
        | 'indisponivel'
        | 'tente_de_novo'
        | 'sem_direito'
        | 'fora_do_prazo'
        | 'nada_cobrado'
        | 'sem_compra';
    };

const JSON_TYPE = 'application/json; charset=utf-8';

/** Cabeçalhos de CORS para a origem do app (e o app em desenvolvimento no próprio computador). Outra origem não recebe nada. */
export function corsHeaders(origin: string | null, appUrl: string): Record<string, string> {
  if (origin === null) return {};
  const allowed = origin === appUrl || /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (!allowed) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): AssinaturaWebResponse {
  return { status, body: JSON.stringify(body), headers: { 'Content-Type': JSON_TYPE, ...extra } };
}

/** O que a função fez com um aviso (para o registro e os testes; a resposta ao Asaas é 200 em todos). */
export type WebhookOutcome = 'aplicado' | 'ignorado' | 'sem_referencia' | 'recusado' | 'cancelada_sem_pessoa' | 'sem_pessoa';

/** A pessoa, o plano e o período (mensal sem ele) devolvidos por billing_checkout_person, billing_person_by_external_ref ou billing_pix_person. */
function referenceFromRpc(r: JsonResponse): WebReference | null {
  const found = obj(r.json);
  const personId = text(found?.person_id);
  const plan = found?.plan;
  if (r.status !== 200 || !personId || !UUID.test(personId) || (plan !== 'individual' && plan !== 'familiar')) return null;
  return { personId: personId.toLowerCase(), plan, period: found?.period === 'anual' ? 'anual' : 'mensal' };
}

/** Uma assinatura no cartão da pessoa com direito começando nos últimos dias (pode estar no prazo da desistência). */
export interface WithdrawalWebCandidate {
  externalRef: string;
  plan: PlanKind;
  after: WithdrawalAfter | null;
}

/**
 * Um pagamento por Pix da pessoa feito nos últimos dias (pode estar no prazo da desistência) ou com um pedido 'pedida', qualquer que seja a
 * idade. `paidOn` nulo: já devolvido pelo aviso de estorno (o dia de onde o prazo contou fica no pedido).
 */
export interface WithdrawalPixCandidate extends Omit<PixPurchaseRow, 'paidOn'> {
  paidOn: IsoDate | null;
  after: WithdrawalAfter | null;
}

/** Um pedido de desistência já gravado (`billing_withdrawals`). 'abandonada': encerrado pela equipe, sem devolução pela tela. */
export interface WithdrawalRecord {
  provider: 'web' | 'pix';
  purchaseHash: string;
  status: 'pedida' | 'devolvida' | 'abandonada';
  requestedAt: string;
  amountCents: number | null;
  /** O dia de onde o prazo contou. */
  contractedOn: IsoDate | null;
}

/** O que o banco sabe das compras da pessoa que podem estar no prazo (`billing_withdrawal_options`, migração 0050). */
export interface WithdrawalOptions {
  web: WithdrawalWebCandidate[];
  pix: WithdrawalPixCandidate[];
  withdrawals: WithdrawalRecord[];
}

const HASH = /^[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const list = (json: unknown): unknown[] => {
  const data = obj(json)?.data;
  return Array.isArray(data) ? data : [];
};

/** O acesso que fica depois, como o banco devolve (`clarevo_access`); fora do formato, null (a tela diz a regra, sem a data). */
export function parseWithdrawalAfter(raw: unknown): WithdrawalAfter | null {
  const a = obj(raw);
  const status = text(a?.status);
  if (!a || !status) return null;
  const until = typeof a.until === 'string' && !Number.isNaN(Date.parse(a.until)) ? a.until : null;
  return { status, until, provider: text(a.provider) };
}

/** Lê a resposta de `billing_withdrawal_options`. 'sem_pessoa': conta excluída ou inexistente; null: fora do formato. */
export function parseWithdrawalOptions(raw: unknown): WithdrawalOptions | 'sem_pessoa' | null {
  const r = obj(raw);
  if (r?.result === 'sem_pessoa') return 'sem_pessoa';
  if (r?.result !== 'ok') return null;
  const rows = (v: unknown) => (Array.isArray(v) ? v.map(obj).filter((x): x is Record<string, unknown> => x !== null) : []);
  const plan = (v: unknown): PlanKind | null => (v === 'individual' || v === 'familiar' ? v : null);
  const web: WithdrawalWebCandidate[] = [];
  for (const w of rows(r.web)) {
    const p = plan(w.plan);
    if (typeof w.external_ref === 'string' && HASH.test(w.external_ref) && p) web.push({ externalRef: w.external_ref, plan: p, after: parseWithdrawalAfter(w.access_after) });
  }
  const day = (v: unknown): IsoDate | null => (typeof v === 'string' && DAY.test(v) ? v : null);
  const withdrawals: WithdrawalRecord[] = [];
  for (const w of rows(r.withdrawals)) {
    if ((w.provider !== 'web' && w.provider !== 'pix') || typeof w.purchase_hash !== 'string' || !HASH.test(w.purchase_hash)) continue;
    if ((w.status !== 'pedida' && w.status !== 'devolvida' && w.status !== 'abandonada') || typeof w.requested_at !== 'string' || Number.isNaN(Date.parse(w.requested_at))) continue;
    const amount = typeof w.amount_cents === 'number' && Number.isSafeInteger(w.amount_cents) && w.amount_cents > 0 ? w.amount_cents : null;
    withdrawals.push({ provider: w.provider, purchaseHash: w.purchase_hash, status: w.status, requestedAt: w.requested_at, amountCents: amount, contractedOn: day(w.contracted_on) });
  }
  const pix: WithdrawalPixCandidate[] = [];
  for (const x of rows(r.pix)) {
    const p = plan(x.plan);
    const paidOn = day(x.paid_on);
    if (typeof x.payment_hash !== 'string' || !HASH.test(x.payment_hash) || !p) continue;
    // Sem o dia pago (já devolvido), só com um pedido 'pedida' que diga o dia de onde o prazo contou.
    const hash = x.payment_hash;
    if (!paidOn && !withdrawals.some((w) => w.provider === 'pix' && w.purchaseHash === hash && w.status === 'pedida' && w.contractedOn)) continue;
    pix.push({ paymentHash: hash, plan: p, period: x.period === 'anual' ? 'anual' : 'mensal', paidOn, startsOn: day(x.starts_on), after: parseWithdrawalAfter(x.access_after) });
  }
  return { web, pix, withdrawals };
}

/**
 * Até quantas páginas de 100 cobranças de Pix a desistência procura pelos dias de pagamento que o banco diz (a cobrança da pessoa, pelo
 * resumo), quando a busca pela referência da pessoa não acha (o Asaas pode não levar a referência do Checkout para a cobrança).
 */
export const WITHDRAWAL_PIX_PAGES = 5;
/** Os avisos de estorno do Asaas que, com a cobrança já estornada, marcam como devolvido o pedido de desistência da compra (se houver). */
export const WITHDRAWAL_REFUND_EVENTS: ReadonlySet<string> = new Set(['PAYMENT_REFUNDED', 'PAYMENT_REFUND_IN_PROGRESS']);

export function createAssinaturaWebHandler(deps: AssinaturaWebDeps): (req: AssinaturaWebRequest) => Promise<AssinaturaWebResponse> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());
  const config = deps.config;

  interface Clients {
    asaas: AsaasCall;
    db: ReturnType<typeof supabaseClient>;
  }

  /** As assinaturas ativas da pessoa no Asaas (uma por plano, no máximo; a busca é pela referência exata). */
  async function activeSubscriptions(asaas: AsaasCall, personId: string): Promise<AsaasSubscription[]> {
    const found: AsaasSubscription[] = [];
    for (const plan of PLANS) {
      const r = await asaas('GET', `/subscriptions?externalReference=${encodeURIComponent(webReference(personId, plan))}&status=ACTIVE&limit=10`);
      if (r.status !== 200) throw new TransientError('Asaas não listou as assinaturas');
      const data = obj(r.json)?.data;
      for (const raw of Array.isArray(data) ? data : []) {
        const s = asaasSubscriptionFrom(raw);
        if (s && !s.deleted && s.status === 'ACTIVE' && !found.some((f) => f.id === s.id)) found.push(s);
      }
    }
    return found;
  }

  /** A pessoa e o plano de uma assinatura: a referência; sem ela, o Checkout no banco; por fim, a própria assinatura já aplicada. */
  async function resolveReference({ asaas, db }: Clients, sub: AsaasSubscription): Promise<WebReference | null> {
    const direct = parseWebReference(sub.externalReference);
    if (direct) return direct;
    const fromRpc = referenceFromRpc;
    let ref: WebReference | null = null;
    if (sub.checkoutSession) ref = fromRpc(await db.rpcService('billing_checkout_person', { p_checkout_hash: sha256Hex(sub.checkoutSession) }));
    if (!ref) ref = fromRpc(await db.rpcService('billing_person_by_external_ref', { p_provider: 'web', p_external_ref: sha256Hex(sub.id) }));
    if (ref && !sub.deleted) {
      // Grava a referência na assinatura do Asaas, para os próximos avisos e para o cancelamento acharem a pessoa.
      const put = await asaas('PUT', `/subscriptions/${encodeURIComponent(sub.id)}`, { externalReference: webReference(ref.personId, ref.plan) });
      if (put.status !== 200) log(`não gravou a referência na assinatura (${put.status})`);
    }
    return ref;
  }

  /**
   * O aviso de estorno de uma compra já estornada no Asaas marca como devolvido o pedido de desistência dela, se houver (a devolução pedida
   * pela função cuja marca se perdeu, a feita pela equipe no painel do Asaas, a que saiu depois de uma tentativa sem resposta). Sem pedido,
   * nada muda ('sem_pedido'); sem a migração 0050, a função do banco não existe (404). Nunca falha o aviso: o tratamento do aviso já foi feito.
   */
  async function closeWithdrawal(db: Clients['db'], personId: string, provider: 'web' | 'pix', purchaseHash: string): Promise<void> {
    try {
      const r = await db.rpcService('billing_withdrawal_finish', { p_person: personId, p_provider: provider, p_purchase_hash: purchaseHash, p_refunded: true });
      if (r.status === 200 && obj(r.json)?.result === 'devolvida') log('aviso de estorno: pedido de desistência marcado como devolvido');
      else if (r.status !== 200 && r.status !== 404) log(`banco não marcou o pedido de desistência no aviso de estorno (${r.status})`);
    } catch {
      log('banco indisponível ao marcar o pedido de desistência no aviso de estorno');
    }
  }

  /**
   * Uma cobrança de Pix mês a mês (D-093): lê a cobrança atual no Asaas, acha a pessoa (a referência de Pix; sem ela, o Checkout no banco;
   * por fim, o pagamento já gravado) e grava a situação com billing_pix_apply. Cobrança de assinatura fica com o fluxo da assinatura.
   */
  async function applyPixPayment(clients: Clients, ev: AsaasEvent, paymentId: string, eventId: string): Promise<WebhookOutcome> {
    const { asaas, db } = clients;
    const got = await asaas('GET', `/payments/${encodeURIComponent(paymentId)}`);
    let p = got.status === 200 ? asaasPaymentFrom(got.json) : null;
    // Removida no Asaas (404): conta como não paga.
    if (!p && got.status === 404 && ev.payment?.id === paymentId) p = { ...ev.payment, deleted: true };
    if (!p) {
      if (got.status === 200 || got.status === 404) return 'ignorado';
      throw new TransientError(`Asaas respondeu ${got.status} ao ler a cobrança`);
    }
    // Só cobrança de Pix sem assinatura (revisão independente de 11/11/2026): cartão, boleto ou cobrança de assinatura não viram mês de Pix.
    if (p.subscription || (p.billingType !== null && p.billingType !== 'PIX')) return 'ignorado';
    let ref: WebReference | null = parsePixReference(p.externalReference);
    if (!ref && p.checkoutSession) ref = referenceFromRpc(await db.rpcService('billing_checkout_person', { p_checkout_hash: sha256Hex(p.checkoutSession) }));
    if (!ref) ref = referenceFromRpc(await db.rpcService('billing_pix_person', { p_payment_hash: sha256Hex(p.id) }));
    if (!ref) {
      // Paga e sem pessoa achada: conferir à mão no Asaas (o registro não leva identificador de ninguém).
      log(PAID_STATUSES.has(p.status) ? `cobrança de Pix PAGA sem referência da Clarevo (${ev.event}): conferir no Asaas` : `aviso ${ev.event} de cobrança avulsa sem referência da Clarevo`);
      return 'sem_referencia';
    }
    const applied = await db.rpcService('billing_pix_apply', {
      p_event_id: eventId,
      p_person: ref.personId,
      p_plan: ref.plan,
      p_payment_hash: sha256Hex(p.id),
      p_paid_on: pixPaidOn(p, todayIn(ASAAS_TIME_ZONE, now())),
      p_event_at: ev.at.toISOString(),
      ...periodArg(ref.period),
    });
    // Estornada no Asaas (a desistência, a equipe no painel): o pedido de desistência do pagamento, se houver, fica devolvido.
    if (WITHDRAWAL_REFUND_EVENTS.has(ev.event) && !p.deleted && REFUND_STATUSES.has(p.status)) await closeWithdrawal(db, ref.personId, 'pix', sha256Hex(p.id));
    if (applied.status !== 200) {
      log(`banco recusou o aviso ${ev.event} de Pix (${applied.status})`);
      return 'recusado';
    }
    // Conta excluída: o Pix não renova sozinho, então não há o que cancelar.
    return obj(applied.json)?.result === 'sem_pessoa' ? 'sem_pessoa' : 'aplicado';
  }

  /** Avisos sem assinatura: a cobrança avulsa (PAYMENT_*) ou o Checkout pago (CHECKOUT_PAID, com as cobranças dele). */
  async function applyPixEvent(clients: Clients, ev: AsaasEvent): Promise<WebhookOutcome> {
    if (ev.payment && ev.event.startsWith('PAYMENT_')) return applyPixPayment(clients, ev, ev.payment.id, ev.id);
    if (!ev.checkoutId || ev.event !== 'CHECKOUT_PAID') return 'ignorado';
    const list = await clients.asaas('GET', `/payments?checkoutSession=${encodeURIComponent(ev.checkoutId)}&limit=10`);
    if (list.status !== 200) throw new TransientError(`Asaas respondeu ${list.status} ao listar as cobranças do Checkout`);
    const data = obj(list.json)?.data;
    let outcome: WebhookOutcome = 'ignorado';
    for (const raw of Array.isArray(data) ? data : []) {
      const p = asaasPaymentFrom(raw);
      // Só as cobranças deste Checkout, mesmo que o Asaas ignore o filtro (revisão independente de 11/11/2026).
      if (!p || p.checkoutSession !== ev.checkoutId) continue;
      const o = await applyPixPayment(clients, ev, p.id, `${ev.id}:${p.id}`.slice(0, 200));
      if (outcome === 'ignorado' || o === 'aplicado') outcome = o;
    }
    return outcome;
  }

  async function applyEvent(clients: Clients, ev: AsaasEvent): Promise<WebhookOutcome> {
    const { asaas, db } = clients;
    if (!ev.subscriptionId) return applyPixEvent(clients, ev);
    // O estado atual, não o do aviso (os avisos chegam repetidos e fora de ordem). Assinatura removida pode não ser devolvida: vale o
    // aviso ou, sem ele, só o que já está pago.
    const got = await asaas('GET', `/subscriptions/${encodeURIComponent(ev.subscriptionId)}`);
    let sub = got.status === 200 ? asaasSubscriptionFrom(got.json) : null;
    // Removida e sem o objeto no aviso (os PAYMENT_* trazem só o identificador dela): o Asaas não diz o ciclo.
    const cycleUnknown = !sub && got.status === 404 && !ev.subscription;
    if (!sub && got.status === 404) sub = ev.subscription ?? goneSubscription(ev.subscriptionId);
    if (!sub) {
      if (got.status === 200) return 'ignorado';
      throw new TransientError(`Asaas respondeu ${got.status} ao ler a assinatura`);
    }
    const ref = await resolveReference(clients, sub);
    if (!ref) {
      log(`aviso ${ev.event} de assinatura sem referência da Clarevo`);
      return 'sem_referencia';
    }
    // Então o ciclo vem do período já aplicado no banco (billing_person_by_external_ref, D-127): numa anual removida, a consulta olha 14
    // meses de cobranças, o período pago vai até 12 meses depois do vencimento e o banco continua com o anual (um estorno ou o
    // PAYMENT_RECEIVED que chega 32 dias depois do cartão não a transformam em mensal). Sem o período (banco de antes da 0047), mensal.
    if (cycleUnknown) sub = { ...sub, cycle: ASAAS_CYCLE[ref.period ?? 'mensal'] };
    const since = addMonthsToDate(todayIn(ASAAS_TIME_ZONE, now()), -paymentsLookbackMonths(sub.cycle));
    const list = await asaas('GET', `/payments?subscription=${encodeURIComponent(sub.id)}&dueDate%5Bge%5D=${since}&limit=100`);
    if (list.status !== 200) throw new TransientError(`Asaas respondeu ${list.status} ao listar cobranças`);
    const data = obj(list.json)?.data;
    const payments = (Array.isArray(data) ? data : []).map(asaasPaymentFrom).filter((p): p is AsaasPayment => p !== null);
    const { validFrom, validUntil } = webValidity(sub, payments, now(), REFUSED_EVENTS.has(ev.event));
    const applied = await db.rpcService('billing_apply', {
      p_event_id: ev.id,
      p_provider: 'web',
      p_person: ref.personId,
      p_external_ref: sha256Hex(sub.id),
      p_plan: ref.plan,
      p_valid_until: validUntil.toISOString(),
      p_event_at: ev.at.toISOString(),
      ...periodArg(periodOfCycle(sub.cycle)),
      ...validFromArg(validFrom),
    });
    // A cobrança do aviso de estorno, já estornada no Asaas (a desistência, a equipe no painel): o pedido de desistência da assinatura, se
    // houver, fica devolvido.
    const refunded = WITHDRAWAL_REFUND_EVENTS.has(ev.event) ? payments.find((p) => p.id === ev.payment?.id) : undefined;
    if (refunded && !refunded.deleted && REFUND_STATUSES.has(refunded.status)) await closeWithdrawal(db, ref.personId, 'web', sha256Hex(sub.id));
    if (applied.status !== 200) {
      // Recusa do banco (aviso inválido, assinatura de outra pessoa): repetir não resolve; fica no registro.
      log(`banco recusou o aviso ${ev.event} (${applied.status})`);
      return 'recusado';
    }
    if (obj(applied.json)?.result === 'sem_pessoa') {
      // Conta excluída: a assinatura não pode continuar cobrando (rede de segurança da exclusão da conta, docs/39).
      if (sub.status === 'ACTIVE' && !sub.deleted) {
        const del = await asaas('DELETE', `/subscriptions/${encodeURIComponent(sub.id)}`);
        if (del.status !== 200 && del.status !== 404) throw new TransientError(`Asaas respondeu ${del.status} ao remover a assinatura`);
      }
      return 'cancelada_sem_pessoa';
    }
    return 'aplicado';
  }

  async function webhook(clients: Clients, req: AssinaturaWebRequest, token: string): Promise<AssinaturaWebResponse> {
    if (!config || !sameText(token, config.webhookToken)) return json(401, { result: 'recusado' });
    if (Number(req.header('content-length') ?? 0) > ASAAS_MAX_BODY_BYTES) return json(413, { result: 'grande_demais' });
    const body = await req.body();
    if (utf8Bytes(body).length > ASAAS_MAX_BODY_BYTES) return json(413, { result: 'grande_demais' });
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return json(400, { result: 'corpo_invalido' });
    }
    const ev = asaasEventFrom(payload, now());
    if (!ev) return json(200, { received: true, outcome: 'ignorado' });
    try {
      const outcome = await applyEvent(clients, ev);
      return json(200, { received: true, outcome });
    } catch (e) {
      log(`falha ao tratar o aviso ${ev.event}: ${e instanceof Error ? e.message : 'erro'}`);
      // Passageira: 500, e o Asaas entrega de novo. Qualquer outra não se repete com proveito: 200, para a fila não parar.
      if (e instanceof TransientError) return json(500, { result: 'tente_de_novo' });
      return json(200, { received: true, outcome: 'recusado' });
    }
  }

  // -------------------------------------------------------------------------------------------------------------------------------------
  // Desistência em 7 dias (D-131, item F; regras em desistencia.ts)
  // -------------------------------------------------------------------------------------------------------------------------------------

  /** Uma compra da pessoa conferida no Asaas: de onde veio, o resumo, o plano, o período, o acesso que fica depois e o que o Asaas diz. */
  interface WithdrawalFound {
    provider: 'web' | 'pix';
    purchaseHash: string;
    plan: PlanKind;
    period: BillingPeriod;
    after: WithdrawalAfter | null;
    check: WithdrawalCheck;
    /** A assinatura do cartão (para removê-la antes da devolução). */
    sub?: AsaasSubscription;
  }

  /**
   * As compras da pessoa que o banco diz poderem estar no prazo (e as que têm pedido 'pedida', qualquer que seja a idade), conferidas no
   * Asaas. Cartão: as assinaturas pela referência da pessoa, também as já removidas (quem cancelou e depois desiste), só as que o banco liga a
   * ela (o resumo do identificador), com as cobranças. Pix: as cobranças pela referência do Checkout de Pix da pessoa (`pixReference`, a do
   * mês ou a do ano) e, se o Asaas não levou a referência para a cobrança, as cobranças de Pix pagas nos dias que o banco diz; só as que o
   * banco liga a ela (o resumo). Nada do que o app manda entra aqui.
   */
  async function findWithdrawals({ asaas }: Clients, personId: string, o: WithdrawalOptions): Promise<WithdrawalFound[]> {
    const found: WithdrawalFound[] = [];
    const pending = (provider: 'web' | 'pix', hash: string) => o.withdrawals.find((w) => w.provider === provider && w.purchaseHash === hash && w.status === 'pedida') ?? null;
    for (const plan of PLANS) {
      const candidates = o.web.filter((w) => w.plan === plan);
      if (candidates.length === 0) continue;
      const r = await asaas('GET', `/subscriptions?externalReference=${encodeURIComponent(webReference(personId, plan))}&includeDeleted=true&limit=100`);
      if (r.status !== 200) throw new TransientError('Asaas não listou as assinaturas');
      for (const raw of list(r.json)) {
        const s = asaasSubscriptionFrom(raw);
        if (!s || parseWebReference(s.externalReference)?.personId !== personId) continue;
        const w = candidates.find((c) => c.externalRef === sha256Hex(s.id));
        if (!w || found.some((f) => f.purchaseHash === w.externalRef)) continue;
        const pays = await asaas('GET', `/payments?subscription=${encodeURIComponent(s.id)}&limit=100`);
        if (pays.status !== 200) throw new TransientError(`Asaas respondeu ${pays.status} ao listar cobranças`);
        const payments = list(pays.json)
          .map(asaasPaymentFrom)
          .filter((p): p is AsaasPayment => p !== null && (p.subscription === null || p.subscription === s.id));
        const check = cardWithdrawal(payments, now(), pending('web', w.externalRef) !== null);
        found.push({ provider: 'web', purchaseHash: w.externalRef, plan: w.plan, period: periodOfCycle(s.cycle), after: w.after, check, sub: s });
      }
    }
    if (o.pix.length === 0) return found;
    // Os pagamentos ainda procurados, com o dia de onde o prazo conta (o pago ou, já devolvido, o do pedido) e se há pedido 'pedida'.
    const wanted = new Map<string, { row: WithdrawalPixCandidate; paidOn: IsoDate; recorded: boolean }>();
    for (const row of o.pix) {
      const rec = pending('pix', row.paymentHash);
      const paidOn = row.paidOn ?? rec?.contractedOn ?? null;
      if (paidOn) wanted.set(row.paymentHash, { row, paidOn, recorded: rec !== null });
    }
    const take = (raw: unknown) => {
      const p = asaasPaymentFrom(raw);
      const hit = p && !p.subscription ? wanted.get(sha256Hex(p.id)) : undefined;
      if (!p || !hit) return;
      wanted.delete(hit.row.paymentHash);
      const { row } = hit;
      found.push({ provider: 'pix', purchaseHash: row.paymentHash, plan: row.plan, period: row.period, after: row.after, check: pixWithdrawal({ paidOn: hit.paidOn, startsOn: row.startsOn }, p, now(), hit.recorded) });
    };
    // 1. Pela referência do Checkout de Pix da pessoa (a mesma de quando ela pagou: o plano e, no anual, ":anual").
    for (const ref of new Set([...wanted.values()].map((x) => pixReference(personId, x.row.plan, x.row.period)))) {
      if (wanted.size === 0) break;
      const r = await asaas('GET', `/payments?externalReference=${encodeURIComponent(ref)}&limit=100`);
      if (r.status !== 200) throw new TransientError(`Asaas respondeu ${r.status} ao listar cobranças de Pix pela referência`);
      for (const raw of list(r.json)) take(raw);
    }
    if (wanted.size === 0) return found;
    // 2. Sem a referência na cobrança: pelos dias de pagamento (o dia pago, com um dia de folga; já devolvido e pago no teste, até 31 dias
    //    antes do começo do período pago). O registro leva só as contagens.
    const missing = wanted.size;
    const ranges = [...wanted.values()].map(({ row, paidOn }) => [
      addDays(paidOn, row.paidOn === null && row.startsOn ? -SCHEDULED_FIRST_CHARGE_MAX_DAYS : -1),
      addDays(paidOn, 1),
    ]);
    const from = ranges.map((x) => x[0]!).sort()[0]!;
    const to = ranges.map((x) => x[1]!).sort().reverse()[0]!;
    let pages = 0;
    for (let page = 0; page < WITHDRAWAL_PIX_PAGES && wanted.size > 0; page++) {
      pages++;
      const r = await asaas('GET', `/payments?billingType=PIX&paymentDate%5Bge%5D=${from}&paymentDate%5Ble%5D=${to}&limit=100&offset=${page * 100}`);
      if (r.status !== 200) throw new TransientError(`Asaas respondeu ${r.status} ao listar cobranças de Pix`);
      for (const raw of list(r.json)) take(raw);
      if (obj(r.json)?.hasMore !== true) break;
    }
    log(`desistência: ${missing} pagamento(s) de Pix sem a referência na cobrança do Asaas; ${missing - wanted.size} achado(s) pelos dias de pagamento, em ${pages} página(s)`);
    return found;
  }

  /** O pedido já gravado de uma compra. */
  const recordOf = (o: WithdrawalOptions, f: WithdrawalFound) => o.withdrawals.find((w) => w.provider === f.provider && w.purchaseHash === f.purchaseHash) ?? null;
  const methodOf = (f: WithdrawalFound): WithdrawalMethod => (f.provider === 'pix' ? 'pix' : 'cartao');

  /** Remove a assinatura do cartão que ainda está ativa no Asaas (nada mais é cobrado). */
  async function removeSubscription(asaas: AsaasCall, sub: AsaasSubscription | undefined): Promise<void> {
    if (!sub || sub.status !== 'ACTIVE' || sub.deleted) return;
    const del = await asaas('DELETE', `/subscriptions/${encodeURIComponent(sub.id)}`);
    if (del.status !== 200 && del.status !== 404) throw new TransientError(`Asaas respondeu ${del.status} ao remover a assinatura`);
  }

  /** A cobrança como o Asaas a mostra agora (null se o Asaas não a devolveu). */
  async function currentPayment(asaas: AsaasCall, path: string): Promise<AsaasPayment | null> {
    const r = await asaas('GET', path);
    return r.status === 200 ? asaasPaymentFrom(r.json) : null;
  }

  /**
   * Pede a devolução integral de cada cobrança paga (sem valor no pedido: o Asaas devolve o integral, no mesmo meio de pagamento). Na
   * repetição de um pedido (`resumed`), relê a cobrança antes: já devolvida (ou com a devolução em andamento) conta como feita, sem pedir de
   * novo. Se o Asaas recusar, confere a cobrança de novo: já devolvida conta como feita, e nunca se pede outra. Se o pedido de devolução
   * ficar sem resposta clara (prazo, rede, erro do Asaas), a devolução pode ter saído: RefundUnclearError (a trava fica por alguns minutos).
   */
  async function refund(asaas: AsaasCall, payments: readonly AsaasPayment[], resumed: boolean): Promise<void> {
    for (const p of payments) {
      const path = `/payments/${encodeURIComponent(p.id)}`;
      if (resumed) {
        const before = await currentPayment(asaas, path);
        if (before && REFUND_STATUSES.has(before.status)) continue;
        if (!before || before.deleted || !REFUNDABLE_STATUSES.has(before.status)) throw new TransientError('a cobrança relida não está paga para devolver');
      }
      let r: JsonResponse;
      try {
        r = await asaas('POST', `${path}/refund`, { description: WITHDRAWAL_REFUND_DESCRIPTION });
      } catch (e) {
        if (e instanceof AsaasCallError) throw new RefundUnclearError(`devolução sem resposta clara: ${e.message}`);
        throw e;
      }
      if (r.status === 200) continue;
      const again = await currentPayment(asaas, path).catch(() => null);
      if (again && REFUND_STATUSES.has(again.status)) continue;
      throw new TransientError(`Asaas recusou a devolução (${r.status})`);
    }
  }

  /**
   * "desistencia" (só leitura) e "desistir". O pedido é gravado no banco antes de qualquer devolução (`billing_withdrawal_begin`, uma linha por
   * compra, com uma trava curta de tentativa): dois toques, duas abas ou uma repetição não devolvem duas vezes, e a hora do pedido fica guardada
   * mesmo que o Asaas falhe. No cartão, a assinatura sai antes da devolução (nada mais é cobrado; a já removida é achada de novo na
   * repetição). Uma falha do Asaas responde "tente_de_novo" com a hora do pedido: antes do pedido de devolução, ou numa recusa clara, a trava
   * sai na hora; com o pedido de devolução sem resposta clara, a trava fica por 5 minutos (o Asaas pode estar devolvendo). A repetição relê o
   * Asaas (as cobranças e, antes de pedir, a própria cobrança) e nunca pede outra devolução de uma cobrança já devolvida. O pedido gravado no
   * prazo continua depois dele; o abandonado pela equipe não volta para a tela.
   */
  async function withdrawal(clients: Clients, personId: string, act: boolean): Promise<[number, AssinaturaWebResult]> {
    const { asaas, db } = clients;
    const res = await db.rpcService('billing_withdrawal_options', { p_person: personId });
    // Sem a migração 0050 no banco, a função do banco não existe (404): indisponível, sem chamar o Asaas.
    if (res.status === 404) {
      log('billing_withdrawal_options não existe: falta a migração 0050');
      return [503, { result: 'indisponivel' }];
    }
    if (res.status !== 200) throw new TransientError(`banco respondeu ${res.status} em billing_withdrawal_options`);
    const o = parseWithdrawalOptions(res.json);
    if (o === 'sem_pessoa') return [401, { result: 'nao_autenticado' }];
    if (!o) throw new TransientError('resposta inesperada de billing_withdrawal_options');
    // O pedido abandonado pela equipe (clarevo_staff_close_withdrawal) não volta para a tela.
    const found = (o.web.length + o.pix.length > 0 ? await findWithdrawals(clients, personId, o) : []).filter((f) => recordOf(o, f)?.status !== 'abandonada');
    const pendingFirst = (f: WithdrawalFound) => (recordOf(o, f)?.status === 'pedida' ? 0 : 1);
    // A compra com pedido 'pedida' (que continua depois do prazo) e, depois, a mais recente no prazo; sem nenhuma, a já devolvida que tem
    // pedido gravado (uma tentativa anterior deu certo, ou a equipe devolveu pelo painel).
    const best = found
      .flatMap((f) => (f.check.state === 'pode' ? [{ offer: f, check: f.check }] : []))
      .sort((a, b) => pendingFirst(a.offer) - pendingFirst(b.offer) || b.check.startDay.localeCompare(a.check.startDay))[0];
    const done = found.find((f) => f.check.state === 'devolvida' && recordOf(o, f) !== null);
    const receipt = (f: WithdrawalFound, requestedAt: string, amountCents: number | null): WithdrawalReceiptReply => ({
      result: 'recebida',
      meio: methodOf(f),
      requestedAt,
      amountCents,
      after: f.after,
    });

    if (!act) {
      if (best) {
        const { offer, check } = best;
        return [200, { result: 'pode', meio: methodOf(offer), plan: offer.plan, period: offer.period, amountCents: check.amountCents, lastDay: withdrawalLastDay(check.startDay), after: offer.after }];
      }
      if (done) {
        const rec = recordOf(o, done)!;
        return [200, receipt(done, rec.requestedAt, rec.amountCents)];
      }
      return [200, { result: 'sem_direito' }];
    }

    if (!best) {
      if (done) {
        // Devolvida no Asaas por uma tentativa anterior: a assinatura que ficou ativa sai, e o banco marca a devolução feita.
        const rec = recordOf(o, done)!;
        await removeSubscription(asaas, done.sub);
        if (rec.status === 'pedida') {
          await db.rpcService('billing_withdrawal_finish', { p_person: personId, p_provider: done.provider, p_purchase_hash: done.purchaseHash, p_refunded: true });
        }
        return [200, receipt(done, rec.requestedAt, rec.amountCents)];
      }
      const reason = found.some((f) => f.check.state === 'nada_cobrado') ? 'nada_cobrado' : found.some((f) => f.check.state === 'fora_do_prazo') ? 'fora_do_prazo' : 'sem_compra';
      return [200, { result: reason }];
    }

    const { offer, check } = best;
    const begun = await db.rpcService('billing_withdrawal_begin', {
      p_person: personId,
      p_provider: offer.provider,
      p_purchase_hash: offer.purchaseHash,
      p_plan: offer.plan,
      p_period: offer.period,
      p_amount_cents: check.amountCents,
      p_contracted_on: check.startDay,
    });
    if (begun.status !== 200) {
      log(`banco não gravou o pedido de desistência (${begun.status})`);
      return [500, { result: 'tente_de_novo' }];
    }
    const b = obj(begun.json);
    const requestedAt = text(b?.requested_at);
    switch (b?.result) {
      case 'nova':
      case 'retomar':
        break;
      case 'encerrada':
        // Abandonado pela equipe entre a leitura e o pedido: fica com o suporte.
        return [200, { result: 'sem_compra' }];
      case 'concluida':
        return [200, receipt(offer, requestedAt ?? now().toISOString(), check.amountCents)];
      case 'em_andamento':
        return [200, { result: 'em_andamento', requestedAt }];
      case 'fora_do_prazo':
        return [200, { result: 'fora_do_prazo' }];
      case 'sem_pagamento':
        return [200, { result: 'sem_compra' }];
      case 'muitas_tentativas':
        return [429, { result: 'muitas_tentativas' }];
      case 'sem_pessoa':
        return [401, { result: 'nao_autenticado' }];
      default:
        log('resposta inesperada de billing_withdrawal_begin');
        return [500, { result: 'tente_de_novo' }];
    }
    const at = requestedAt ?? now().toISOString();
    try {
      await removeSubscription(asaas, offer.sub);
      await refund(asaas, check.refundable, b?.result === 'retomar');
    } catch (e) {
      // O pedido continua gravado, com a hora. A falha antes do pedido de devolução (ou a recusa clara) solta a trava na hora, e a próxima
      // tentativa relê o Asaas; o pedido de devolução sem resposta clara deixa a trava por 5 minutos (p_unclear), para uma repetição ou outra
      // aba não pedirem de novo enquanto o Asaas pode estar devolvendo.
      const unclear = e instanceof RefundUnclearError;
      await db
        .rpcService('billing_withdrawal_finish', { p_person: personId, p_provider: offer.provider, p_purchase_hash: offer.purchaseHash, p_refunded: false, p_unclear: unclear })
        .catch(() => undefined);
      log(`desistência sem devolução concluída${unclear ? ' (devolução sem resposta clara: trava de 5 minutos)' : ''}: ${e instanceof Error ? e.message : 'erro'}`);
      return [e instanceof TransientError ? 503 : 500, { result: 'tente_de_novo', requestedAt: at }];
    }
    const finished = await db
      .rpcService('billing_withdrawal_finish', { p_person: personId, p_provider: offer.provider, p_purchase_hash: offer.purchaseHash, p_refunded: true })
      .catch(() => null);
    // A devolução já foi pedida ao Asaas: sem a marca no banco, o aviso de estorno do Asaas (PAYMENT_REFUNDED ou PAYMENT_REFUND_IN_PROGRESS)
    // marca o pedido como devolvido, e uma repetição de "desistir" também (a leitura da tela não grava nada; a pessoa já tem a confirmação).
    if (!finished || finished.status !== 200) log('desistência devolvida sem a marca no banco');
    return [200, receipt(offer, at, check.amountCents)];
  }

  async function app({ asaas, db }: Clients, req: AssinaturaWebRequest, cors: Record<string, string>): Promise<AssinaturaWebResponse> {
    const reply = (status: number, body: AssinaturaWebResult) => json(status, body, cors);
    if (!config) return reply(503, { result: 'indisponivel' });
    const auth = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
    if (!auth) return reply(401, { result: 'nao_autenticado' });
    if (Number(req.header('content-length') ?? 0) > APP_MAX_BODY_BYTES) return reply(413, { result: 'pedido_invalido' });
    const body = await req.body();
    if (utf8Bytes(body).length > APP_MAX_BODY_BYTES) return reply(413, { result: 'pedido_invalido' });
    let payload: Record<string, unknown> | null;
    try {
      payload = obj(JSON.parse(body));
    } catch {
      payload = null;
    }
    const action = payload?.action;
    const plan = payload?.plan;
    // O período (D-127): sem ele, mensal (o app de antes do plano anual não manda).
    const period: BillingPeriod | null = payload?.period === undefined ? 'mensal' : payload.period === 'mensal' || payload.period === 'anual' ? payload.period : null;
    if (
      (action !== 'assinar' && action !== 'cancelar' && action !== 'pix' && action !== 'situacao' && action !== 'desistencia' && action !== 'desistir') ||
      ((action === 'assinar' || action === 'pix') && ((plan !== 'individual' && plan !== 'familiar') || period === null))
    ) {
      return reply(400, { result: 'pedido_invalido' });
    }
    // A desistência fechada (WITHDRAWAL_OPEN, D-131, item F): com a chave de produção, nada; só o sandbox do Asaas (o teste da equipe).
    if ((action === 'desistencia' || action === 'desistir') && !WITHDRAWAL_OPEN && !config.sandbox) return reply(503, { result: 'indisponivel' });
    try {
      const personId = await db.userId(auth[1] ?? '');
      if (!personId) return reply(401, { result: 'nao_autenticado' });
      if (action === 'desistencia' || action === 'desistir') {
        const [status, body] = await withdrawal({ asaas, db }, personId, action === 'desistir');
        return reply(status, body);
      }
      // "situacao" (12/11/2026, teste no sandbox): se ainda há assinatura no cartão ativa no Asaas e quando renova. O acesso continua até
      // o fim do período pago depois de cancelar, então só o Asaas diz se ela foi cancelada (a tela esconde o botão e diz que não renova).
      if (action === 'situacao') {
        const subs = await activeSubscriptions(asaas, personId);
        const next = subs.map((s) => s.nextDueDate).filter((d): d is IsoDate => d !== null).sort()[0] ?? null;
        return reply(200, subs.length > 0 ? { result: 'ativa', nextDueDate: next } : { result: 'sem_assinatura' });
      }
      if (action === 'cancelar') {
        let removed = 0;
        for (const s of await activeSubscriptions(asaas, personId)) {
          const del = await asaas('DELETE', `/subscriptions/${encodeURIComponent(s.id)}`);
          if (del.status !== 200 && del.status !== 404) throw new TransientError(`Asaas respondeu ${del.status} ao remover a assinatura`);
          removed++;
        }
        return reply(200, { result: removed > 0 ? 'cancelada' : 'sem_assinatura' });
      }
      // A compra fechada (SUBSCRIBE_OPEN, D-129): com a chave de produção, nenhum Checkout, nem com `?assinar=teste` na tela; só o sandbox
      // do Asaas (o teste da equipe, que não cobra ninguém) cria Checkout antes de a compra abrir.
      if (!SUBSCRIBE_OPEN && !config.sandbox) return reply(503, { result: 'indisponivel' });
      const access = await db.rpcAsUser('my_access', auth[1] ?? '');
      if (access.status === 401 || access.status === 403) return reply(401, { result: 'nao_autenticado' });
      if (access.status !== 200) throw new TransientError(`banco respondeu ${access.status} em my_access`);
      const current = obj(access.json);
      const status = current?.status;
      // Quem paga com Pix pode pagar o próximo período (só com Pix, e só nos últimos dias do período pago: 10 no mensal, 30 no anual, pelo
      // período em vigor, `period` de my_access); qualquer outra assinatura bloqueia.
      const paysWithPix = action === 'pix' && current?.provider === 'pix';
      if (status === 'assinatura' && !paysWithPix) return reply(200, { result: 'ja_assinante' });
      if (status === 'beneficio' || status === 'cortesia') return reply(200, { result: 'sem_necessidade' });
      const currentPeriod: BillingPeriod = current?.period === 'anual' ? 'anual' : 'mensal';
      if (status === 'assinatura' && !pixCanPayNext(typeof current?.until === 'string' ? current.until : null, now(), currentPeriod)) return reply(200, { result: 'ja_pago' });
      // Assinatura no cartão ainda ativa no Asaas: com o acesso valendo, já assinante; no teste grátis, a assinatura feita no teste, com a
      // primeira cobrança no fim dele (D-129), "assinatura_marcada"; sem acesso (cobrança recusada ou em aberto), a tela oferece cancelar a do
      // cartão antes de pagar de outro jeito (revisão independente de 11/11/2026). (O próximo vencimento do Asaas não serve para separar os
      // dois: ele já é o do ciclo seguinte quando a primeira cobrança é gerada.)
      if ((await activeSubscriptions(asaas, personId)).length > 0) {
        return reply(200, { result: status === 'assinatura' ? 'ja_assinante' : status === 'teste' ? 'assinatura_marcada' : 'cartao_ativo' });
      }
      const chosen: BillingPeriod = period ?? 'mensal';
      // No cartão, a primeira cobrança é hoje ou, no teste grátis, no dia do fim do teste (D-129), pelo my_access lido acima, do banco.
      const firstDue = paidStartDay(status, current?.until, now()) ?? todayIn(ASAAS_TIME_ZONE, now());
      const request =
        action === 'pix'
          ? checkoutPixRequest(personId, plan as PlanKind, config.appUrl, chosen, config.sandbox)
          : checkoutRequest(personId, plan as PlanKind, config.appUrl, firstDue, chosen, config.sandbox);
      const created = await asaas('POST', '/checkouts', request);
      const checkoutId = text(obj(created.json)?.id);
      const url = created.status === 200 ? checkoutLink(created.json, config.sandbox) : null;
      if (!checkoutId || !url) {
        log(`Asaas não criou o Checkout (${created.status})`);
        return reply(502, { result: 'indisponivel' });
      }
      // Sem a ligação no banco, o aviso poderia não achar a pessoa: qualquer falha cancela o Checkout e pede para tentar de novo.
      const cancelCheckout = () => asaas('POST', `/checkouts/${encodeURIComponent(checkoutId)}/cancel`).catch(() => undefined);
      let recorded: JsonResponse;
      try {
        recorded = await db.rpcService('billing_checkout_record', { p_checkout_hash: sha256Hex(checkoutId), p_person: personId, p_plan: plan, ...periodArg(chosen) });
      } catch (e) {
        await cancelCheckout();
        throw e;
      }
      if (recorded.status !== 200) {
        await cancelCheckout();
        log(`banco não gravou o Checkout (${recorded.status})`);
        return reply(500, { result: 'tente_de_novo' });
      }
      if (obj(recorded.json)?.result === 'muitas_tentativas') {
        // Mais de alguns Checkouts na última hora: o banco recusa (protege a cota da API do Asaas); o Checkout criado sai.
        await cancelCheckout();
        return reply(429, { result: 'muitas_tentativas' });
      }
      return reply(200, { result: 'checkout', url });
    } catch (e) {
      log(`falha no pedido ${String(action)}: ${e instanceof Error ? e.message : 'erro'}`);
      return reply(e instanceof TransientError ? 503 : 500, { result: 'tente_de_novo' });
    }
  }

  return async (req) => {
    const cors = corsHeaders(req.header('origin'), config?.appUrl ?? APP_URL_DEFAULT);
    if (req.method === 'OPTIONS') return { status: 204, body: '', headers: cors };
    if (!config) {
      log('configuração incompleta: faltam segredos da função');
      return json(503, { result: 'indisponivel' }, cors);
    }
    if (req.method !== 'POST') return json(405, { result: 'metodo_nao_aceito' }, cors);
    const timeLeft = budget(now().getTime(), () => now().getTime());
    const clients: Clients = { asaas: asaasClient(config, deps.fetch, timeLeft), db: supabaseClient(config, deps.fetch, timeLeft) };
    const token = req.header('asaas-access-token');
    if (token !== null) return webhook(clients, req, token);
    return app(clients, req, cors);
  };
}
