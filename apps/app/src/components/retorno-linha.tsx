import {
  CARDS_TEXT,
  RETURN_TEXT,
  batchEligible,
  looseExpenseFor,
  reviewRowA11yLabel,
  reviewRowText,
  rowActions,
  rowShortName,
  type FinancialRecord,
  type ReviewAction,
  type ReviewRow,
} from '@clarevo/core';
import { Check, Info } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { MoneyTxt } from '@/components/money-text';
import type { RowOutcome } from '@/components/retorno-acoes';
import { yearA11y, yearA11yLabel } from '@/components/series-parts';
import { Banner, Button, LinkButton, spaceKeyPress, Txt } from '@/components/ui';
import { openCommitment } from '@/lib/cards';
import { maskMoneyLabel, maskMoneyText, useValuesHidden } from '@/lib/privacy';
import { colors, fonts, motion, radius, space, tabular } from '@/theme/tokens';

/** Linha resolvida troca o conteúdo em 240 ms e a altura em 280 ms (CL-V008), só depois da resposta do servidor. */
const swapIn = FadeIn.duration(motion.confirm).reduceMotion(ReduceMotion.System);
export const rowLayout = LinearTransition.duration(motion.detail).reduceMotion(ReduceMotion.System);

/**
 * Uma conta a conferir em "Atualizar meses" (e no "Registrar este mês" do detalhe da série):
 * - situação sempre em texto ("em aberto", "sem conta registrada", "paga"), nunca só cor, e sem vermelho para vencidas;
 * - um nome acessível completo para a linha e botões com contexto ("Já paguei: Luz de julho");
 * - caixa de seleção do lote só em valor fixo (batchEligible);
 * - aviso de gasto solto (looseExpenseFor) quando o mesmo gasto já foi anotado no mês sem conta vinculada.
 */
export function ReturnRow({
  row,
  outcome,
  note,
  closed,
  monthRecords,
  selectable,
  selected,
  onToggle,
  onAction,
  onUndo,
  busy,
  inGroup,
  last,
}: {
  row: ReviewRow;
  /** Resultado confirmado nesta sessão; null enquanto a linha está a conferir. */
  outcome: RowOutcome | null;
  /** Texto de uma recusa ou falha desta linha (por exemplo, a falha parcial de "Já paguei"). */
  note: string | null;
  /** A linha não aceita mais ações (mudou em outro aparelho e saiu da revisão). */
  closed?: boolean;
  /** Registros do mês da linha (listRecords), para o aviso de gasto solto. */
  monthRecords?: readonly FinancialRecord[];
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onAction: (action: ReviewAction) => void;
  onUndo?: (outcome: Extract<RowOutcome, { type: 'paga' }>) => void;
  busy: boolean;
  inGroup?: boolean;
  last?: boolean;
}) {
  const hidden = useValuesHidden();
  const short = rowShortName(row);
  const text = reviewRowText(row);
  // reviewRowText começa pela descrição: a descrição fica em negrito e o resto abaixo.
  const details = text.startsWith(`${row.description} · `) ? text.slice(row.description.length + 3) : text;
  const actions = rowActions(row);
  const loose = !outcome && monthRecords ? looseExpenseFor(row, monthRecords) : null;
  const canSelect = Boolean(selectable && !outcome && !closed && batchEligible(row) && onToggle);

  return (
    <Animated.View layout={rowLayout} style={[styles.row, inGroup && styles.inGroup, !last && styles.divider]}>
      {outcome ? (
        <Animated.View key={outcome.type} entering={swapIn} style={styles.resolved}>
          <View style={styles.doneIcon}>
            <Check size={16} color={colors.success} strokeWidth={2.75} aria-hidden />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityLabel={yearA11yLabel(short)}>
              {short}
            </Txt>
            <MoneyTxt variant="caption" color={colors.textSecondary} style={tabular}>
              {outcome.type === 'paga' && outcome.commitment.payment
                ? RETURN_TEXT.resolvedPaid(outcome.commitment.payment.paidOn, outcome.commitment.payment.amountCents)
                : outcome.type === 'nao_houve'
                  ? RETURN_TEXT.resolvedNotHappened
                  : RETURN_TEXT.stillOpenDone}
            </MoneyTxt>
            {outcome.type === 'paga' && onUndo ? (
              <LinkButton
                label={RETURN_TEXT.undo}
                accessibilityLabel={`${RETURN_TEXT.undo}: ${yearA11y(short)}`}
                disabled={busy}
                style={styles.inlineLink}
                onPress={() => onUndo(outcome)}
              />
            ) : null}
          </View>
        </Animated.View>
      ) : (
        <View style={{ gap: space[2] }}>
          <View style={styles.head}>
            {canSelect ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: Boolean(selected), disabled: busy }}
                aria-checked={Boolean(selected)}
                accessibilityLabel={yearA11y(maskMoneyLabel(RETURN_TEXT.selectA11y(short, row.amountCents), hidden))}
                disabled={busy}
                onPress={onToggle}
                {...spaceKeyPress(() => onToggle?.())}
                hitSlop={4}
                style={(st) => [styles.check, (st as { focused?: boolean }).focused && styles.focusRing]}>
                <View style={[styles.box, selected && styles.boxChecked]}>
                  {selected ? <Check size={16} color={colors.textOnBrand} strokeWidth={3} /> : null}
                </View>
              </Pressable>
            ) : null}
            <View style={[{ flex: 1, minWidth: 0, gap: 2 }, !canSelect && selectable && styles.alignWithBox]} accessible accessibilityLabel={yearA11y(maskMoneyLabel(reviewRowA11yLabel(row), hidden))}>
              <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
                {row.description}
              </Txt>
              <Txt variant="caption" color={colors.textSecondary} style={tabular}>
                {maskMoneyText(details, hidden)}
              </Txt>
            </View>
          </View>

          {loose ? (
            <Banner tone="info" icon={Info} live={false}>
              <MoneyTxt variant="label">{RETURN_TEXT.looseExpense(loose)}</MoneyTxt>
            </Banner>
          ) : null}

          {note ? (
            <MoneyTxt variant="label" color={closed ? colors.textSecondary : colors.error} accessibilityLiveRegion="polite" style={!closed && { fontFamily: fonts.bold }}>
              {note}
            </MoneyTxt>
          ) : null}

          {/* Fatura de cartão: sem "Já paguei" nem "Não houve" (a fatura se paga pelo cartão); abre a fatura, como em Contas a pagar. */}
          {!closed && row.commitment?.invoice ? (
            <Button
              label={CARDS_TEXT.openInvoice}
              accessibilityLabel={yearA11y(`${CARDS_TEXT.openInvoice}: ${short}`)}
              tone="soft"
              disabled={busy}
              onPress={() => openCommitment(row.commitment!)}
            />
          ) : null}

          {closed ? null : (
            <>
              <View style={styles.actions}>
                {actions.includes('ja_paguei') ? (
                  <Button
                    label={RETURN_TEXT.paidButton}
                    accessibilityLabel={yearA11y(RETURN_TEXT.paidButtonA11y(short))}
                    tone="soft"
                    disabled={busy}
                    style={styles.action}
                    onPress={() => onAction('ja_paguei')}
                  />
                ) : null}
                {actions.includes('nao_houve') ? (
                  <Button
                    label={RETURN_TEXT.notHappenedButton}
                    accessibilityLabel={yearA11y(RETURN_TEXT.notHappenedA11y(short))}
                    tone="ghost"
                    disabled={busy}
                    style={styles.action}
                    onPress={() => onAction('nao_houve')}
                  />
                ) : null}
              </View>
              {actions.includes('ainda_nao_paguei') ? (
                <LinkButton
                  label={RETURN_TEXT.stillOpenButton}
                  accessibilityLabel={yearA11y(RETURN_TEXT.stillOpenA11y(short))}
                  disabled={busy}
                  style={styles.inlineLink}
                  onPress={() => onAction('ainda_nao_paguei')}
                />
              ) : null}
            </>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space[3] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  // Linhas de um grupo de conta do ano: recuo à esquerda, ligadas ao cabeçalho do ano.
  inGroup: { paddingLeft: space[3], borderLeftWidth: 3, borderLeftColor: colors.brandTint },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  check: { width: 44, height: 44, marginLeft: -10, marginTop: -10, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  alignWithBox: { paddingLeft: 0 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 140 },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  resolved: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  doneIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.successTint, alignItems: 'center', justifyContent: 'center' },
  focusRing: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.brand, outlineOffset: 2 } as object,
});
