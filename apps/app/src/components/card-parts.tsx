import {
  CARDS_TEXT,
  cardSummaryTexts,
  formatBRL,
  invoiceMonthLabel,
  invoiceTexts,
  type Card as CardData,
  type CardSummary,
  type Invoice,
  type IsoDate,
} from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronRight, CreditCard, Receipt } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { GoalProgress } from '@/components/goal-progress';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { Money, Txt, styles as ui } from '@/components/ui';
import { cardHref, invoiceHref } from '@/lib/cards';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const focusRing = { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as const;

/** "final 1234" ou nada (o número completo nunca existe no app). */
export const finalText = (card: Pick<CardData, 'lastDigits'>) => (card.lastDigits ? `final ${card.lastDigits}` : null);

/**
 * Cartão na lista (D-037): apelido e final, a fatura atual (mês, total e situação), fechamento e vencimento, o limite usado e as
 * faturas fechadas ainda sem pagamento. O cartão inteiro abre o cartão e carrega a frase completa; a barra do limite é só desenho.
 * Sem cor de alerta: usar mais que o limite continua a mesma barra azul cheia, e o texto diz o resto.
 */
export function CardTile({ summary, today }: { summary: CardSummary; today: IsoDate }) {
  const maskLabel = useMoneyLabelMask();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const { card } = summary;
  const t = cardSummaryTexts(summary, today);
  const inv = invoiceTexts(summary.current, today);
  const fin = finalText(card);
  const limitPercent = card.limitCents ? Math.min(100, Math.round((summary.limitUsedCents / card.limitCents) * 100)) : null;
  const archived = card.status === 'arquivado';
  const amount = (
    <View style={stacked ? undefined : styles.amountCol}>
      <Money cents={summary.current.totalCents} variant="label" style={[styles.amount, tabular]} />
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={maskLabel(t.a11yLabel)}
      accessibilityHint={CARDS_TEXT.screens.openCardHint}
      onPress={() => router.push(cardHref(card.id))}
      style={(st) => [ui.card, styles.tile, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && focusRing]}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <CreditCard size={20} color={colors.brand} strokeWidth={2.25} aria-hidden />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="title" numberOfLines={2} style={{ fontSize: 17, lineHeight: 24 }}>
            {card.name}
          </Txt>
          {fin || archived ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {[fin, archived ? CARDS_TEXT.archivedBadge : null].filter(Boolean).join(' · ')}
            </Txt>
          ) : null}
        </View>
        <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
      </View>

      {archived ? null : (
        <View style={styles.invoice}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              {inv.title}
            </Txt>
            <Txt variant="caption" color={colors.textSecondary}>
              {inv.situation}
              {inv.estimated ? ' · valor estimado' : ''}
            </Txt>
            {stacked ? amount : null}
          </View>
          {stacked ? null : amount}
        </View>
      )}
      {archived ? null : (
        <Txt variant="caption" color={colors.textSecondary}>
          {t.closes} · {t.due}
        </Txt>
      )}

      <MoneyTxt variant="label" style={tabular}>
        {t.limit}
      </MoneyTxt>
      {limitPercent !== null ? <GoalProgress percent={limitPercent} decorative /> : null}
      {t.closed.map((line) => (
        <MoneyTxt key={line} variant="caption" color={colors.textSecondary} style={tabular}>
          {line}
        </MoneyTxt>
      ))}
    </Pressable>
  );
}

/**
 * Fatura numa lista (a do cartão): "Fatura de novembro", situação, fechamento e vencimento, e o total à direita. O toque abre
 * a fatura; um nome acessível só descreve a linha.
 */
export function InvoiceRow({ invoice, today, last }: { invoice: Invoice; today: IsoDate; last: boolean }) {
  const maskLabel = useMoneyLabelMask();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const t = invoiceTexts(invoice, today);
  const amount = (
    <View style={stacked ? undefined : styles.amountCol}>
      <Money cents={invoice.totalCents} variant="label" style={[styles.amount, tabular]} />
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={maskLabel(t.a11yLabel)}
      accessibilityHint={CARDS_TEXT.screens.openInvoiceHint}
      onPress={() => router.push(invoiceHref(invoice.cardId, invoice.month))}
      style={(st) => [
        styles.row,
        !last && styles.divider,
        st.pressed && { opacity: 0.7 },
        (st as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid' },
      ]}>
      <View style={styles.rowIcon}>
        <Receipt size={18} color={colors.brand} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={2}>
          {t.title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {invoice.isFuture && invoice.situation === 'aberta' ? CARDS_TEXT.screens.notStarted : t.situation}
          {invoice.estimated && invoice.totalCents > 0 ? ' · estimado' : ''}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {t.closes} · {t.due}
        </Txt>
        {stacked ? amount : null}
      </View>
      {stacked ? null : amount}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { gap: space[2] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  invoice: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingTop: space[1] },
  amountCol: { flexShrink: 0, alignItems: 'flex-end' },
  amount: { fontFamily: fonts.bold, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});

/**
 * Legenda de "Cartões" em Movimentos > Organizar. Sem cartão ativo: o convite; com um: "Cartão Exemplo · fatura de novembro
 * R$ 550,00"; com vários: "2 cartões · R$ 900,00 nas faturas atuais". A lista de cartões vem de useCardsOverview (null enquanto
 * carrega ou em erro: a legenda fixa). Os valores passam por maskMoneyText e maskMoneyLabel na linha de Organizar (MoneyTxt).
 */
export function cardsCaption(overview: readonly { card: CardData; summary: { current: Invoice } }[] | null, today: IsoDate): string {
  if (overview === null) return CARDS_TEXT.organizeHint;
  const active = overview.filter((o) => o.card.status === 'ativo');
  if (active.length === 0) return CARDS_TEXT.screens.organizeNone;
  if (active.length === 1) {
    const o = active[0]!;
    return `${o.card.name} · fatura de ${invoiceMonthLabel(o.summary.current.month, today)} ${formatBRL(o.summary.current.totalCents)}`;
  }
  const total = active.reduce((acc, o) => acc + o.summary.current.totalCents, 0);
  return `${active.length} cartões · ${formatBRL(total)} nas faturas atuais`;
}
