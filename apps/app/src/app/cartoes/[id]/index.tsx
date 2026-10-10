import {
  CARDS_TEXT,
  CARD_ERROR_TEXT,
  ERROR_TEXT,
  cardErrorText,
  invoiceMonthOf,
  limitUsedText,
  summarizeCard,
  type Card as CardData,
  type CardStatus,
  type Invoice,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Archive, CircleAlert, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { InvoiceRow, finalText } from '@/components/card-parts';
import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { GoalProgress } from '@/components/goal-progress';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { ErrorState } from '@/components/states';
import { Banner, Body, Button, Card, Screen, Skeleton, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import {
  useCard,
  useCardEntries,
  useCardInvoices,
  useCardOperationKey,
  useDeleteCard,
  useSetCardStatus,
} from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const T = CARDS_TEXT;
const F = CARDS_TEXT.form;

/**
 * Cartão (D-037): faixa azul com o apelido, o final, os dias e o limite usado; as faturas por mês (atual, próximas com as
 * parcelas das compras já feitas e anteriores); anotar compra, editar, arquivar e excluir (só sem lançamentos). Sem cor de alerta.
 */
export default function CartaoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { today } = useSession();
  const qc = useQueryClient();
  const card = useCard(id);
  const invoices = useCardInvoices(card.data ?? null);
  const entries = useCardEntries(card.data ? id : undefined);
  const setStatus = useSetCardStatus();
  const remove = useDeleteCard();
  const keys = useCardOperationKey();
  const [notice, setNotice] = useFlash();
  const [confirming, setConfirming] = useState<null | 'arquivar' | 'excluir'>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // O iOS não tem região viva: o erro de uma ação é anunciado ao aparecer.
  useEffect(() => {
    if (actionError) announceOnIOS(actionError, { delay: 300 });
  }, [actionError]);

  const c = card.data ?? null;

  function haptic() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  function fail(code: string) {
    if (code === 'versao_desatualizada' || code === 'nao_encontrado') {
      qc.invalidateQueries({ queryKey: ['cards'] });
      card.refetch();
    }
    setActionError(cardErrorText(code));
  }

  /** Arquivar e reativar: o aviso só aparece depois de o servidor confirmar. */
  async function changeStatus(target: CardData, status: CardStatus, text: string) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const r = await guardedWrite(
        keys,
        JSON.stringify(['situacao', target.id, target.version, status]),
        (key) => setStatus.mutateAsync({ key, id: target.id, version: target.version, status }),
        (s) => s.action === 'situacao_cartao' && s.cardId === target.id,
      );
      setConfirming(null);
      if (r.status === 'ok' || r.status === 'reconciled') {
        haptic();
        setNotice(text);
      } else if (r.status === 'refused') fail(r.code);
      else setActionError(ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(target: CardData) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const r = await guardedWrite(
        keys,
        JSON.stringify(['excluir', target.id, target.version]),
        (key) => remove.mutateAsync({ key, id: target.id, version: target.version }),
        (s) => s.action === 'excluir_cartao',
      );
      setConfirming(null);
      if (r.status === 'ok' || r.status === 'reconciled') {
        haptic();
        flash.set(F.deleted);
        router.dismissTo('/cartoes');
      } else if (r.status === 'refused') fail(r.code);
      else setActionError(ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/cartoes'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.screens.cardHeader} onBack={back} right={<ContextPill label="Pessoal" />} />
      <Screen wide>
        {card.isPending ? (
          <View style={[styles.hero, { gap: space[3] }]}>
            <View style={styles.heroInner}>
              <Skeleton width="50%" height={24} onBrand />
              <Skeleton width="70%" height={20} onBrand />
              <Skeleton width="100%" height={12} onBrand />
            </View>
          </View>
        ) : card.isError ? (
          <Body>
            <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => card.refetch()} />
          </Body>
        ) : !c ? (
          <Body>
            <Card style={{ gap: space[3] }}>
              <Txt>{CARD_ERROR_TEXT.nao_encontrado}</Txt>
              <Button label="Ir para Cartões" onPress={() => router.replace('/cartoes')} />
            </Card>
          </Body>
        ) : (
          <CardBody
            card={c}
            invoices={invoices.data}
            invoicesPending={invoices.isPending}
            invoicesError={invoices.isError}
            onRetryInvoices={() => invoices.refetch()}
            noEntries={entries.isSuccess ? entries.data.length === 0 : null}
            today={today}
            notice={notice}
            actionError={actionError}
            busy={busy}
            onArchive={() => setConfirming('arquivar')}
            onReactivate={() => changeStatus(c, 'ativo', F.reactivated)}
            onDelete={() => setConfirming('excluir')}
          />
        )}
      </Screen>

      {c ? (
        <>
          <ConfirmDialog
            visible={confirming === 'arquivar'}
            title={F.archiveTitle}
            cancelLabel={F.cancel}
            confirmLabel={F.archive}
            confirmTone="brand"
            busy={busy}
            onCancel={() => setConfirming(null)}
            onConfirm={() => changeStatus(c, 'arquivado', F.archived)}>
            <Txt color={colors.textSecondary}>{F.archiveBody}</Txt>
          </ConfirmDialog>
          <ConfirmDialog
            visible={confirming === 'excluir'}
            title={F.deleteTitle}
            cancelLabel={F.cancel}
            confirmLabel={F.delete}
            busy={busy}
            onCancel={() => setConfirming(null)}
            onConfirm={() => doDelete(c)}>
            <Txt color={colors.textSecondary}>{F.deleteBody}</Txt>
          </ConfirmDialog>
        </>
      ) : null}
    </View>
  );
}

function CardBody({
  card,
  invoices,
  invoicesPending,
  invoicesError,
  onRetryInvoices,
  noEntries,
  today,
  notice,
  actionError,
  busy,
  onArchive,
  onReactivate,
  onDelete,
}: {
  card: CardData;
  invoices: Invoice[] | undefined;
  invoicesPending: boolean;
  invoicesError: boolean;
  onRetryInvoices: () => void;
  /** true: sem lançamentos (pode excluir); false: com lançamentos; null: ainda não se sabe. */
  noEntries: boolean | null;
  today: string;
  notice: string | null;
  actionError: string | null;
  busy: boolean;
  onArchive: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const archived = card.status === 'arquivado';
  const fin = finalText(card);
  const summary = invoices ? summarizeCard(card, invoices, today) : null;
  const limit = summary ? limitUsedText(summary.limitUsedCents, card.limitCents) : null;
  const limitPercent = summary && card.limitCents ? Math.min(100, Math.round((summary.limitUsedCents / card.limitCents) * 100)) : null;
  // A fatura atual nunca é uma fatura paga (summarizeCard): as próximas e as anteriores se dividem por ela.
  const current = summary?.current ?? null;
  const currentMonth = current?.month ?? invoiceMonthOf(card, today);
  const upcoming = (invoices ?? []).filter((i) => i.month > currentMonth && (i.lines.length > 0 || i.commitmentId));
  const previous = (invoices ?? []).filter((i) => i.month < currentMonth).reverse();

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroInner}>
          <View style={styles.heroHead}>
            <Txt variant="title" color={colors.textOnBrand} style={{ flex: 1, fontSize: 22, lineHeight: 30 }} accessibilityRole="header" aria-level={2}>
              {card.name}
            </Txt>
            {archived ? (
              <View style={styles.statusPill}>
                <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold }}>
                  {T.archivedBadge}
                </Txt>
              </View>
            ) : null}
          </View>
          {fin ? (
            <Txt variant="caption" color={colors.textOnBrandSoft}>
              {fin}
            </Txt>
          ) : null}
          <Txt color={colors.textOnBrand} style={{ fontFamily: fonts.bold }}>
            {`Fecha no dia ${card.closingDay} · vence no dia ${card.dueDay}`}
          </Txt>
          {limit ? (
            <MoneyTxt color={colors.textOnBrand} style={tabular}>
              {limit}
            </MoneyTxt>
          ) : null}
          {limitPercent !== null ? <GoalProgress percent={limitPercent} tone="onBrand" decorative /> : null}
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
        {archived ? <Txt color={colors.textSecondary}>{T.screens.archivedNote}</Txt> : null}

        {!archived ? (
          <Button
            label={T.screens.noteOnCard}
            icon={Plus}
            onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa', cartao: card.id } })}
          />
        ) : null}

        {invoicesPending ? (
          <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel="Carregando as faturas">
            <Skeleton width="100%" height={56} />
            <Skeleton width="100%" height={56} />
          </View>
        ) : invoicesError || !current ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={onRetryInvoices} />
        ) : (
          <>
            <Card>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {T.currentInvoice}
              </Txt>
              <InvoiceRow invoice={current} today={today} last />
              {invoices!.length === 0 ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.noInvoices}
                </Txt>
              ) : null}
            </Card>
            {upcoming.length > 0 ? (
              <Card>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {T.nextInvoices}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.screens.futureLegend}
                </Txt>
                {upcoming.map((i, k) => (
                  <InvoiceRow key={i.month} invoice={i} today={today} last={k === upcoming.length - 1} />
                ))}
              </Card>
            ) : null}
            {previous.length > 0 ? (
              <Card>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {T.previousInvoices}
                </Txt>
                {previous.map((i, k) => (
                  <InvoiceRow key={i.month} invoice={i} today={today} last={k === previous.length - 1} />
                ))}
              </Card>
            ) : null}
          </>
        )}

        <View style={{ gap: space[3] }}>
          <Button label={F.editTitle} icon={Pencil} tone="soft" disabled={busy} onPress={() => router.push({ pathname: '/cartoes/[id]/editar', params: { id: card.id } })} />
          {archived ? (
            <Button label={F.reactivate} icon={RefreshCw} tone="soft" disabled={busy} onPress={onReactivate} />
          ) : (
            <Button label={F.archive} icon={Archive} tone="soft" disabled={busy} onPress={onArchive} />
          )}
          {noEntries === true ? (
            <Button label={F.delete} icon={Trash2} tone="danger" disabled={busy} onPress={onDelete} />
          ) : noEntries === false ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {T.screens.deleteBlocked}
            </Txt>
          ) : null}
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy} hitSlop={8}>
          <ShieldCheck size={18} color={colors.textSecondary} />
          <Txt variant="label" color={colors.textSecondary}>
            {T.links.whoSees}
          </Txt>
        </Pressable>
      </Body>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  heroInner: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space[6], paddingTop: space[2], paddingBottom: space[6], gap: space[2] },
  heroHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  statusPill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: 2 },
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
});
