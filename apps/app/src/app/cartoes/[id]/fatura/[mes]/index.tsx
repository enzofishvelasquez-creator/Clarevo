import {
  CARDS_TEXT,
  CARD_ERROR_TEXT,
  ERROR_TEXT,
  addMonths,
  cardErrorText,
  formatBRL,
  formatDayMonth,
  invoiceFor,
  invoiceLineText,
  invoiceMonthLabel,
  invoiceTexts,
  monthOf,
  partialPaymentCalcLink,
  type Invoice,
  type InvoiceLine,
} from '@clarevo/core';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleAlert, Plus, Receipt, Undo2, Wallet } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ChoiceDialog, type DialogChoice } from '@/components/choice-dialog';
import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { ErrorState } from '@/components/states';
import { Banner, Body, Button, Card, FitMoney, LinkButton, Money, Screen, Skeleton, Txt, styles as ui } from '@/components/ui';
import { cap } from '@/components/series-parts';
import { cardHref, invoiceHref, readInvoiceMonth } from '@/lib/cards';
import { announceOnIOS } from '@/lib/a11y';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { totalChange } from '@/lib/highlight';
import { useCard, useCardInvoices, useCardOperationKey, useDeleteCardEntry, useUndoInvoicePayment } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const T = CARDS_TEXT;
const I = CARDS_TEXT.invoice;
const S = CARDS_TEXT.screens;

/**
 * Fatura (D-037): faixa azul com o mês, a situação e o total (estimado enquanto aberta), fechamento, vencimento e período; o que
 * foi pago e, no pagamento parcial, o que ficou para a fatura seguinte com o caminho para "Quanto custa pagar só uma parte?";
 * os lançamentos (parcelas com "parcela 3 de 10", encargos, estornos, saldo anterior); "Pagar fatura", "Informar encargos",
 * "Registrar estorno" e "Desfazer pagamento". A fatura paga não muda os lançamentos. Nenhuma cor de alerta.
 */
export default function FaturaScreen() {
  const { id, mes } = useLocalSearchParams<{ id: string; mes: string }>();
  const month = readInvoiceMonth(mes);
  const { today } = useSession();
  const card = useCard(id);
  const invoices = useCardInvoices(card.data ?? null);
  const undo = useUndoInvoicePayment();
  const removeEntry = useDeleteCardEntry();
  const keys = useCardOperationKey();
  const [notice, setNotice] = useFlash();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // O iOS não tem região viva: o erro de uma ação é anunciado ao aparecer.
  useEffect(() => {
    if (actionError) announceOnIOS(actionError, { delay: 300 });
  }, [actionError]);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [line, setLine] = useState<InvoiceLine | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const c = card.data ?? null;
  const invoice = c && invoices.data && month ? invoiceFor(c, invoices.data, month, today) : null;
  const list = invoices.data ?? [];
  const hasPrev = month !== null && list.some((i) => i.month < month);
  const hasNext = month !== null && list.some((i) => i.month > month);

  const back = () => (router.canGoBack() ? router.back() : c ? router.replace(cardHref(c.id)) : router.replace('/cartoes'));

  function haptic() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  function fail(code: string) {
    // Recusa por versão, exclusão ou pagamento em outro aparelho: recarrega e mostra o motivo.
    if (code === 'versao_desatualizada' || code === 'nao_encontrado' || code === 'fatura_paga' || code === 'fatura_seguinte_paga') {
      card.refetch();
      invoices.refetch();
    }
    setActionError(code === 'desconhecido' || code === 'rede' ? ERROR_TEXT.salvar_falhou : cardErrorText(code));
  }

  async function doUndo(inv: Invoice) {
    if (busy || inv.commitmentVersion === null || !c) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const version = inv.commitmentVersion;
      const r = await guardedWrite(
        keys,
        JSON.stringify(['desfazer', c.id, inv.month, version]),
        (key) => undo.mutateAsync({ key, cardId: c.id, month: inv.month, version }),
        (s) => s.action === 'desfazer_pagamento_fatura' && s.cardId === c.id,
      );
      setConfirmUndo(false);
      if (r.status === 'ok' || r.status === 'reconciled') {
        haptic();
        if (inv.paidOn && inv.paidCents) totalChange.set({ total: 'pago', month: monthOf(inv.paidOn), deltaCents: -inv.paidCents });
        setNotice(I.undone);
      } else if (r.status === 'refused') fail(r.code);
      else setActionError(CARD_ERROR_TEXT.desfazer_falhou);
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteEntry(target: InvoiceLine) {
    if (busy || !target.entryId || target.version === null) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const entryId = target.entryId;
      const version = target.version;
      const r = await guardedWrite(
        keys,
        JSON.stringify(['excluir-lancamento', entryId, version]),
        (key) => removeEntry.mutateAsync({ key, entryId, version }),
        (s) => s.action === 'excluir_lancamento_cartao' && s.entryId === entryId,
      );
      setConfirmDelete(false);
      setLine(null);
      if (r.status === 'ok' || r.status === 'reconciled') {
        haptic();
        setNotice(I.entryDeleted);
      } else if (r.status === 'refused') fail(r.code);
      else setActionError(ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  const editable = (l: InvoiceLine) => l.entryId !== null && l.version !== null && (l.kind === 'parcela' || l.kind === 'encargo' || l.kind === 'estorno');

  const lineChoices = (l: InvoiceLine, inv: Invoice): DialogChoice[] => {
    const choices: DialogChoice[] = [];
    // Compra no cartão: descrição, valor, data, categoria e parcelas (as parcelas são recalculadas).
    if (l.kind === 'parcela' && c) {
      choices.push({
        label: I.purchaseEdit,
        onPress: () => {
          setLine(null);
          router.push({ pathname: '/cartoes/[id]/fatura/[mes]/compra', params: { id: c.id, mes: inv.month, lancamento: l.entryId! } });
        },
      });
    }
    if ((l.kind === 'encargo' || l.kind === 'estorno') && c) {
      choices.push({
        label: I.entryEdit,
        onPress: () => {
          setLine(null);
          router.push({
            pathname: l.kind === 'encargo' ? '/cartoes/[id]/fatura/[mes]/encargo' : '/cartoes/[id]/fatura/[mes]/estorno',
            params: { id: c.id, mes: inv.month, lancamento: l.entryId! },
          });
        },
      });
    }
    choices.push({ label: I.entryDelete, onPress: () => setConfirmDelete(true) });
    return choices;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={S.invoiceHeader} onBack={back} right={<ContextPill label="Pessoal" />} />
      <Screen wide>
        {card.isPending || (c && invoices.isPending) ? (
          <View style={[styles.hero, { gap: space[3] }]}>
            <View style={styles.heroInner}>
              <Skeleton width="50%" height={24} onBrand />
              <Skeleton width="60%" height={40} onBrand />
              <Skeleton width="100%" height={16} onBrand />
            </View>
          </View>
        ) : card.isError || invoices.isError ? (
          <Body>
            <ErrorState
              message={ERROR_TEXT.carregar_falhou}
              onRetry={() => {
                card.refetch();
                invoices.refetch();
              }}
            />
          </Body>
        ) : !c || !month || !invoice ? (
          <Body>
            <Card style={{ gap: space[3] }}>
              <Txt>{CARD_ERROR_TEXT.nao_encontrado}</Txt>
              <Button label="Ir para Cartões" onPress={() => router.replace('/cartoes')} />
            </Card>
          </Body>
        ) : (
          <InvoiceBody
            cardName={c.name}
            cardId={c.id}
            cardActive={c.status === 'ativo'}
            invoice={invoice}
            today={today}
            notice={notice}
            actionError={actionError}
            busy={busy}
            hasPrev={hasPrev}
            hasNext={hasNext}
            editable={editable}
            onLine={(l) => {
              setActionError(null);
              setLine(l);
            }}
            onUndo={() => setConfirmUndo(true)}
          />
        )}
      </Screen>

      {invoice ? (
        <>
          <ConfirmDialog
            visible={confirmUndo}
            title={I.undoTitle}
            cancelLabel="Cancelar"
            confirmLabel={I.undoPayment}
            confirmTone="brand"
            busy={busy}
            onCancel={() => setConfirmUndo(false)}
            onConfirm={() => doUndo(invoice)}>
            <Txt color={colors.textSecondary}>{I.undoBody}</Txt>
          </ConfirmDialog>
          <ChoiceDialog
            visible={line !== null && !confirmDelete}
            title={S.entryMenuTitle}
            cancelLabel="Fechar"
            onCancel={() => setLine(null)}
            choices={line ? lineChoices(line, invoice) : []}>
            {line ? <MoneyTxt style={[{ fontFamily: fonts.bold }, tabular]}>{invoiceLineText(line)}</MoneyTxt> : null}
          </ChoiceDialog>
          <ConfirmDialog
            visible={line !== null && confirmDelete}
            title={I.entryDeleteTitle}
            cancelLabel="Cancelar"
            confirmLabel={I.entryDelete}
            busy={busy}
            onCancel={() => {
              setConfirmDelete(false);
              setLine(null);
            }}
            onConfirm={() => (line ? doDeleteEntry(line) : undefined)}>
            {line ? <MoneyTxt style={[{ fontFamily: fonts.bold }, tabular]}>{invoiceLineText(line)}</MoneyTxt> : null}
            <Txt color={colors.textSecondary}>{line?.kind === 'parcela' ? S.entryDeletePurchaseBody : S.entryDeleteBody}</Txt>
          </ConfirmDialog>
        </>
      ) : null}
    </View>
  );
}

function InvoiceBody({
  cardName,
  cardId,
  cardActive,
  invoice,
  today,
  notice,
  actionError,
  busy,
  hasPrev,
  hasNext,
  editable,
  onLine,
  onUndo,
}: {
  cardName: string;
  cardId: string;
  cardActive: boolean;
  invoice: Invoice;
  today: string;
  notice: string | null;
  actionError: string | null;
  busy: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  editable: (l: InvoiceLine) => boolean;
  onLine: (l: InvoiceLine) => void;
  onUndo: () => void;
}) {
  const t = invoiceTexts(invoice, today);
  const paid = invoice.situation === 'paga' || invoice.situation === 'paga_em_parte';
  const canPay = !paid && invoice.commitmentVersion !== null && invoice.totalCents > 0;
  const canUndo = paid && invoice.commitmentVersion !== null;
  const calc = invoice.situation === 'paga_em_parte' ? partialPaymentCalcLink(invoice.remainingCents) : null;
  const sub = (m: string) => ({ pathname: '/cartoes/[id]/fatura/[mes]/pagar' as const, params: { id: cardId, mes: m } });
  const prev = addMonths(invoice.month, -1);
  const next = addMonths(invoice.month, 1);

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroInner}>
          <View style={styles.heroHead}>
            <Txt variant="title" color={colors.textOnBrand} style={{ flex: 1, fontSize: 22, lineHeight: 30 }} accessibilityRole="header" aria-level={2}>
              {t.title}
            </Txt>
            <View style={styles.statusPill}>
              <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold }}>
                {t.situation}
              </Txt>
            </View>
          </View>
          <Txt variant="caption" color={colors.textOnBrandSoft}>
            {cardName}
          </Txt>
          <FitMoney cents={invoice.totalCents} color={colors.textOnBrand} />
          {t.estimated ? (
            <Txt variant="label" color={colors.textOnBrand}>
              {t.estimated}
            </Txt>
          ) : null}
          <Txt color={colors.textOnBrand} style={{ fontFamily: fonts.bold }}>
            {t.closes} · {t.due}
          </Txt>
          <Txt variant="label" color={colors.textOnBrandSoft}>
            {t.period}
          </Txt>
          {t.paid ? (
            <MoneyTxt variant="label" color={colors.textOnBrand} style={[tabular, { fontFamily: fonts.bold }]}>
              {t.paid}
            </MoneyTxt>
          ) : null}
          {t.credit ? (
            <MoneyTxt variant="label" color={colors.textOnBrand} style={tabular}>
              {t.credit}
            </MoneyTxt>
          ) : null}
        </View>
      </View>

      <Body>
        <FlashBanner message={notice} />
        {actionError ? (
          <Banner tone="erro" icon={CircleAlert}>
            <Txt variant="label" color={colors.error}>
              {actionError}
            </Txt>
          </Banner>
        ) : null}

        {t.partial ? (
          <Card style={{ gap: space[2] }}>
            <MoneyTxt style={tabular}>{t.partial}</MoneyTxt>
            {calc ? (
              <LinkButton
                label={I.calcLink}
                style={styles.inlineLink}
                onPress={() => router.push({ pathname: '/calcular/[slug]', params: { slug: calc.slug, ...calc.params } })}
              />
            ) : null}
          </Card>
        ) : null}

        <View style={{ gap: space[3] }}>
          {canPay ? <Button label={I.payInvoice} icon={Wallet} disabled={busy} onPress={() => router.push(sub(invoice.month))} /> : null}
          {canUndo ? <Button label={I.undoPayment} icon={Undo2} tone="soft" disabled={busy} onPress={onUndo} /> : null}
          {!paid ? (
            <>
              <Button
                label={I.addCharges}
                icon={Receipt}
                tone="soft"
                disabled={busy}
                onPress={() => router.push({ pathname: '/cartoes/[id]/fatura/[mes]/encargo', params: { id: cardId, mes: invoice.month } })}
              />
              <Button
                label={I.addRefund}
                icon={Plus}
                tone="soft"
                disabled={busy}
                onPress={() => router.push({ pathname: '/cartoes/[id]/fatura/[mes]/estorno', params: { id: cardId, mes: invoice.month } })}
              />
            </>
          ) : null}
          {cardActive && !paid ? (
            <LinkButton
              label={S.noteOnCard}
              onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa', cartao: cardId } })}
              style={{ alignSelf: 'center' }}
            />
          ) : null}
        </View>
        {paid ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {I.paidInvoiceNote}
          </Txt>
        ) : invoice.situation === 'fechada' ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {I.closedInvoiceNote}
          </Txt>
        ) : null}
        {!paid && invoice.commitmentVersion === null ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {S.noPayable}
          </Txt>
        ) : null}

        <Card style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {S.entriesTitle}
          </Txt>
          {invoice.lines.length === 0 ? (
            <Txt variant="label" color={colors.textSecondary} style={{ paddingVertical: space[2] }}>
              {t.empty ?? CARDS_TEXT.invoiceEmpty}
            </Txt>
          ) : (
            invoice.lines.map((l, i) => (
              <LineRow key={l.key} line={l} last={i === invoice.lines.length - 1} locked={paid} editable={editable(l)} onPress={() => onLine(l)} />
            ))
          )}
        </Card>

        <Card style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {S.compositionTitle}
          </Txt>
          <SumRow label={S.installmentsLine} cents={invoice.installmentsCents} />
          {invoice.chargesCents > 0 ? <SumRow label={S.chargesLine} cents={invoice.chargesCents} /> : null}
          {invoice.balanceCents > 0 ? <SumRow label={S.balanceLine} cents={invoice.balanceCents} /> : null}
          {invoice.refundsCents > 0 ? <SumRow label={S.refundsLine} cents={invoice.refundsCents} negative /> : null}
          {invoice.creditInCents > 0 ? <SumRow label={S.creditLine} cents={invoice.creditInCents} negative /> : null}
          <SumRow label={S.totalLine} cents={invoice.totalCents} strong last />
          <Txt variant="caption" color={colors.textSecondary} style={{ paddingTop: space[1] }}>
            {I.invoiceFormula}
          </Txt>
        </Card>

        {hasPrev || hasNext ? (
          <View style={styles.nav}>
            {hasPrev ? (
              <LinkButton
                label={`‹ ${cap(invoiceMonthLabel(prev, today))}`}
                accessibilityLabel={`Fatura anterior: ${invoiceMonthLabel(prev, today)}`}
                onPress={() => router.replace(invoiceHref(cardId, prev))}
              />
            ) : (
              <View />
            )}
            {hasNext ? (
              <LinkButton
                label={`${cap(invoiceMonthLabel(next, today))} ›`}
                accessibilityLabel={`Próxima fatura: ${invoiceMonthLabel(next, today)}`}
                onPress={() => router.replace(invoiceHref(cardId, next))}
              />
            ) : null}
          </View>
        ) : null}
      </Body>
    </>
  );
}

/** Lançamento da fatura: nome, "parcela 3 de 10" e a data da compra à esquerda; o valor à direita (estorno com "−"). */
function LineRow({ line: l, last, locked, editable, onPress }: { line: InvoiceLine; last: boolean; locked: boolean; editable: boolean; onPress: () => void }) {
  const maskLabel = useMoneyLabelMask();
  const negative = l.amountCents < 0;
  const caption =
    l.kind === 'saldo_anterior'
      ? I.automaticEntry
      : l.kind === 'credito_anterior'
        ? I.derivedCredit
        : [
            l.label,
            l.purchasedOn ? `compra em ${formatDayMonth(l.purchasedOn)}` : null,
            l.kind === 'estorno' && l.category ? l.category : null,
            l.kind === 'parcela' && l.category ? l.category : null,
          ]
            .filter(Boolean)
            .join(' · ');
  const body = (
    <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={2}>
          {l.description}
        </Txt>
        {caption ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {caption}
          </Txt>
        ) : null}
      </View>
      <View style={styles.amountCol}>
        {negative ? (
          <MoneyTxt variant="label" style={[styles.amount, tabular]}>{`− ${formatBRL(-l.amountCents)}`}</MoneyTxt>
        ) : (
          <Money cents={l.amountCents} variant="label" style={[styles.amount, tabular]} />
        )}
      </View>
    </>
  );
  const label = maskLabel(invoiceLineText(l));
  if (!editable || locked) {
    return (
      <View accessible accessibilityLabel={label} style={[styles.row, !last && styles.divider]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={S.editEntryHint}
      onPress={onPress}
      style={(st) => [styles.row, !last && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      {body}
    </Pressable>
  );
}

function SumRow({ label, cents, negative, strong, last }: { label: string; cents: number; negative?: boolean; strong?: boolean; last?: boolean }) {
  return (
    <View style={[styles.sum, !last && styles.divider]}>
      <Txt variant="label" style={strong ? { fontFamily: fonts.bold } : undefined}>
        {label}
      </Txt>
      {negative ? (
        <MoneyTxt variant="label" style={tabular}>{`− ${formatBRL(cents)}`}</MoneyTxt>
      ) : (
        <Money cents={cents} variant="label" style={[tabular, strong ? { fontFamily: fonts.bold } : null]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  heroInner: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space[6], paddingTop: space[2], paddingBottom: space[6], gap: space[2] },
  heroHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  statusPill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: 2 },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingVertical: space[2] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  amountCol: { flexShrink: 0, alignItems: 'flex-end' },
  amount: { fontFamily: fonts.bold, fontSize: 15 },
  sum: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 40, paddingVertical: space[1] },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
