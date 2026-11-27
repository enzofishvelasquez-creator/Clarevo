/**
 * A desistência em 7 dias na web (direito de arrependimento, CDC art. 49, e Decreto 7.962/2013, art. 5º; D-131, item F): o que o app usa. Só
 * na web e só para a compra feita na web (a assinatura no cartão ou um pagamento por Pix); nas lojas, o reembolso é pedido à loja. As regras
 * do prazo ficam em `desistencia.ts`, que vai na função do servidor; este arquivo não vai (mudar um texto da tela não muda a função).
 *
 * TEXTOS PENDENTES DA REVISÃO DO ADVOGADO (pergunta 64 do resumo para o advogado, seção m; D-131, item F: "ligado com o texto do advogado").
 * Nada daqui aparece enquanto WITHDRAWAL_OPEN (`plano-precos.ts`) for falso, a não ser no teste da equipe com a chave do sandbox
 * (`/conta/assinatura?assinar=teste`) e no roteiro de telas. Qualquer mudança pedida pelo advogado entra aqui, com os testes, antes de ligar.
 */
import { addDays, formatDateBR, formatDateTimeBR, todayIn, type IsoDate } from '../dates';
import { SUPPORT_EMAIL } from '../legal';
import { formatBRL } from '../money';
import type { Access } from '../plano';
import type { BillingPeriod, PlanKind } from '../plano-precos';
import { PIX_GRACE_DAYS } from './pix';
import type { WithdrawalAfter, WithdrawalMethod } from './servidor';

/** "desistencia": a compra no prazo, com o valor, o último dia (Brasília) e o acesso que fica depois. */
export interface WebWithdrawalOffer {
  result: 'pode';
  meio: WithdrawalMethod;
  plan: PlanKind;
  period: BillingPeriod;
  amountCents: number;
  lastDay: IsoDate;
  after: WithdrawalAfter | null;
}

/** O pedido recebido, com a hora em que chegou ao servidor (a confirmação imediata do Decreto 7.962/2013, art. 5º, § 4º). */
export interface WebWithdrawalReceipt {
  result: 'recebida';
  meio: WithdrawalMethod;
  requestedAt: string;
  amountCents: number | null;
  after: WithdrawalAfter | null;
}

/** O que a tela sabe da desistência: há compra no prazo, o pedido já foi recebido, ou nada a oferecer. */
export type WebWithdrawalState = WebWithdrawalOffer | WebWithdrawalReceipt | { result: 'sem_direito' };

/** O que "desistir" devolve ao app. */
export type WebWithdrawalResult =
  | WebWithdrawalReceipt
  | { result: 'tente_de_novo'; requestedAt: string | null }
  | { result: 'em_andamento' | 'fora_do_prazo' | 'nada_cobrado' | 'sem_compra' | 'muitas_tentativas' | 'indisponivel' };

const rec = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null);
const instant = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const amount = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null);
const method = (v: unknown): WithdrawalMethod | null => (v === 'cartao' || v === 'pix' ? v : null);

function parseAfter(v: unknown): WithdrawalAfter | null {
  const a = rec(v);
  if (!a || typeof a.status !== 'string' || a.status === '') return null;
  return { status: a.status, until: instant(a.until), provider: typeof a.provider === 'string' ? a.provider : null };
}

function parseReceipt(r: Record<string, unknown>): WebWithdrawalReceipt | null {
  const meio = method(r.meio);
  const requestedAt = instant(r.requestedAt);
  if (r.result !== 'recebida' || !meio || !requestedAt) return null;
  return { result: 'recebida', meio, requestedAt, amountCents: amount(r.amountCents), after: parseAfter(r.after) };
}

/** Lê a resposta de "desistencia". null quando não deu para saber (indisponível, falha): a tela não mostra nada. */
export function parseWebWithdrawalState(raw: unknown): WebWithdrawalState | null {
  const r = rec(raw);
  if (!r) return null;
  if (r.result === 'sem_direito') return { result: 'sem_direito' };
  if (r.result === 'recebida') return parseReceipt(r);
  if (r.result !== 'pode') return null;
  const meio = method(r.meio);
  const cents = amount(r.amountCents);
  const plan = r.plan === 'individual' || r.plan === 'familiar' ? r.plan : null;
  const lastDay = typeof r.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lastDay) ? r.lastDay : null;
  if (!meio || !cents || !plan || !lastDay) return null;
  return { result: 'pode', meio, plan, period: r.period === 'anual' ? 'anual' : 'mensal', amountCents: cents, lastDay, after: parseAfter(r.after) };
}

/** Lê a resposta de "desistir". Fora do formato: "tente_de_novo", sem hora. */
export function parseWebWithdrawalResult(raw: unknown): WebWithdrawalResult {
  const r = rec(raw);
  if (!r) return { result: 'tente_de_novo', requestedAt: null };
  if (r.result === 'recebida') return parseReceipt(r) ?? { result: 'tente_de_novo', requestedAt: null };
  if (r.result === 'em_andamento' || r.result === 'fora_do_prazo' || r.result === 'nada_cobrado' || r.result === 'sem_compra' || r.result === 'muitas_tentativas' || r.result === 'indisponivel') {
    return { result: r.result };
  }
  return { result: 'tente_de_novo', requestedAt: instant(r.requestedAt) };
}

/** Quem pode ter compra pela web no prazo: a assinatura em vigor no cartão ou com Pix. Nas lojas, cortesia, benefício e Família, nunca. */
export function withdrawalMayApply(access: Access): boolean {
  return access.status === 'assinatura' && (access.provider === 'web' || access.provider === 'pix');
}

/** Quem assina pela App Store ou pelo Google Play: sem botão; a tela diz que o reembolso é pedido à loja. */
export function storeRefundNoteApplies(access: Access): boolean {
  return access.status === 'assinatura' && (access.provider === 'apple' || access.provider === 'google');
}

/** O dia de um instante no fuso da pessoa, em dd/mm/aaaa. */
const dayOf = (iso: string, timeZone: string, minusDays = 0) => formatDateBR(addDays(todayIn(timeZone, new Date(iso)), -minusDays));

/**
 * O acesso que fica depois da desistência, dito com a data quando o servidor a calculou (no banco, como se a compra fosse devolvida): o teste
 * grátis que ainda tem dias, o período pago antes com Pix (o último dia pago, sem a tolerância, como a tela do Pix), só ver e exportar, ou o
 * acesso que a conta já tem por outro caminho. Sem o cálculo, a regra dos Termos.
 */
export function withdrawalAfterText(after: WithdrawalAfter | null, timeZone: string): string {
  switch (after?.status) {
    case 'teste':
      return after.until ? `Depois, a conta volta ao teste grátis, que vai até ${dayOf(after.until, timeZone)}.` : WITHDRAWAL_AFTER_RULE;
    case 'leitura':
      return 'Depois, a conta fica só para ver e exportar, com os seus dados guardados.';
    case 'assinatura':
      return after.until
        ? `O período pago antes continua valendo: o acesso completo vai até ${dayOf(after.until, timeZone, after.provider === 'pix' ? PIX_GRACE_DAYS : 0)}.`
        : 'O período pago antes continua valendo.';
    case 'pre_lancamento':
      return 'Depois, o acesso continua completo e sem cobrança, como antes de assinar.';
    case 'familia':
      return 'Depois, o acesso completo continua pelo Plano Família da sua Família.';
    case 'beneficio':
      return 'Depois, o acesso completo continua pelo benefício da sua empresa.';
    case 'cortesia':
      return 'Depois, o acesso completo continua pela cortesia da Clarevo.';
    default:
      return WITHDRAWAL_AFTER_RULE;
  }
}

/** A regra dos Termos, quando o servidor não disse o acesso que fica (pergunta 63 do resumo para o advogado). */
const WITHDRAWAL_AFTER_RULE = 'Depois, a conta volta ao teste grátis, se ainda houver dias dele, ou fica só para ver e exportar, com os seus dados guardados.';

/**
 * Os textos da desistência na tela Assinatura (web). PENDENTES DA REVISÃO DO ADVOGADO (pergunta 64, seção m). Calmos e sem pressa: nada de
 * "tem certeza", nada de perda, nada de culpa; dizem o que acontece (a devolução integral no mesmo meio de pagamento, o prazo do cartão, o
 * acesso depois) e confirmam o pedido na hora, com a data e a hora.
 */
export const WEB_WITHDRAWAL_TEXT = {
  title: 'Desistência em até 7 dias',
  /**
   * Antes do botão: até quando e quanto volta. `lastDay` em dd/mm/aaaa; o valor, em centavos (é o preço do plano, público como na tela dos
   * planos, e por isso formatado aqui, como os botões do Pix).
   */
  intro: (meio: WithdrawalMethod, lastDay: string, amountCents: number) =>
    meio === 'pix'
      ? `Você pode desistir do pagamento feito com Pix até ${lastDay} e receber de volta o valor pago, ${formatBRL(amountCents)}, como prevê o Código de Defesa do Consumidor (art. 49).`
      : `Você pode desistir da assinatura até ${lastDay} e receber de volta o valor pago, ${formatBRL(amountCents)}, como prevê o Código de Defesa do Consumidor (art. 49).`,
  action: 'Desistir e receber de volta',
  busy: 'Pedindo a devolução',
  /** O diálogo de confirmação. */
  confirmTitle: (amountCents: number) => `Desistir e receber ${formatBRL(amountCents)} de volta?`,
  confirmRefund: (meio: WithdrawalMethod, amountCents: number) =>
    meio === 'pix'
      ? `A Clarevo devolve o valor integral, ${formatBRL(amountCents)}, por Pix, para a conta de onde saiu o pagamento.`
      : `A Clarevo devolve o valor integral, ${formatBRL(amountCents)}, no mesmo cartão usado na compra.`,
  cardTiming: 'O estorno aparece na fatura do cartão no prazo do banco ou da administradora do cartão, que não depende da Clarevo.',
  cardCancel: 'A assinatura é cancelada na hora, e nada mais é cobrado.',
  whenChanges: 'A situação muda nesta tela em alguns minutos, quando o Asaas confirmar a devolução.',
  confirmAction: 'Desistir e receber de volta',
  back: 'Voltar',
  /** A confirmação imediata do pedido, com a data e a hora (no fuso da pessoa). `when`: "27/11/2026 às 14:05". */
  received: (when: string) => `Pedido de desistência recebido em ${when}.`,
  receivedRefund: (meio: WithdrawalMethod, amountCents: number | null) =>
    meio === 'pix'
      ? `A devolução${amountCents ? ` de ${formatBRL(amountCents)}` : ''} foi pedida ao Asaas, por Pix, para a conta de onde saiu o pagamento.`
      : `A devolução${amountCents ? ` de ${formatBRL(amountCents)}` : ''} foi pedida ao Asaas, no mesmo cartão da compra, e a assinatura foi cancelada. O estorno aparece na fatura no prazo do banco ou da administradora do cartão.`,
  receivedHelp: `Se tiver alguma dúvida sobre a devolução, escreva para ${SUPPORT_EMAIL}.`,
  /**
   * O alto da tela depois do pedido, enquanto o aviso de estorno do Asaas não chega (a situação ainda é "assinatura"): o selo e a frase, no
   * lugar de "renova em" e de "Cancelar assinatura, logo abaixo" (a assinatura já foi cancelada).
   */
  heroEyebrow: 'Desistência pedida',
  heroBody: 'A desistência foi pedida, e a devolução está com o Asaas. A situação muda aqui em alguns minutos.',
  /** Quem assina pelas lojas (sem botão): o texto dos Termos (seção 12, direito de arrependimento). */
  storeRefund: `Nas compras pela App Store ou pelo Google Play, o reembolso é pedido à loja; se ela não atender, escreva para ${SUPPORT_EMAIL}.`,
  errors: {
    em_andamento: 'O pedido de desistência já está em andamento. Volte a esta tela em instantes para ver a confirmação.',
    fora_do_prazo: `O prazo de 7 dias para desistir desta compra terminou. Se tiver dúvida, escreva para ${SUPPORT_EMAIL}.`,
    nada_cobrado: 'Nada foi cobrado até agora, então não há valor a devolver. Para encerrar a assinatura sem cobrança, use Cancelar assinatura.',
    sem_compra: `Não foi encontrada uma compra pela web para devolver nesta conta. Se tiver dúvida, escreva para ${SUPPORT_EMAIL}.`,
    muitas_tentativas: `Muitas tentativas em pouco tempo. Escreva para ${SUPPORT_EMAIL} para concluir a devolução.`,
    indisponivel: `A desistência pela tela não está disponível agora. Para desistir, escreva para ${SUPPORT_EMAIL}.`,
    /** A falha do Asaas (ou da rede), com a hora do pedido quando ele já ficou gravado. */
    tente_de_novo: (when: string | null) =>
      when
        ? `O pedido de desistência ficou registrado em ${when}, mas a devolução não foi concluída agora. Tente de novo em instantes; se continuar assim, escreva para ${SUPPORT_EMAIL}.`
        : `Não foi possível concluir agora. Tente de novo em instantes; se continuar assim, escreva para ${SUPPORT_EMAIL}.`,
  },
} as const;

/**
 * As frases da confirmação do pedido, na ordem da tela: o recebimento com a data e a hora, a devolução, o acesso depois, quando a situação
 * muda (até o aviso de estorno do Asaas chegar, o alto da tela ainda mostra a assinatura) e a ajuda.
 */
export function withdrawalReceiptLines(receipt: WebWithdrawalReceipt, timeZone: string): string[] {
  const T = WEB_WITHDRAWAL_TEXT;
  return [
    T.received(formatDateTimeBR(receipt.requestedAt, timeZone)),
    T.receivedRefund(receipt.meio, receipt.amountCents),
    withdrawalAfterText(receipt.after, timeZone),
    T.whenChanges,
    T.receivedHelp,
  ];
}

/** As frases do diálogo de confirmação, na ordem: a devolução integral, no cartão o prazo do estorno e o cancelamento, o acesso depois e quando muda. */
export function withdrawalConfirmLines(offer: WebWithdrawalOffer, timeZone: string): string[] {
  const T = WEB_WITHDRAWAL_TEXT;
  return [
    T.confirmRefund(offer.meio, offer.amountCents),
    ...(offer.meio === 'cartao' ? [T.cardTiming, T.cardCancel] : []),
    withdrawalAfterText(offer.after, timeZone),
    T.whenChanges,
  ];
}
