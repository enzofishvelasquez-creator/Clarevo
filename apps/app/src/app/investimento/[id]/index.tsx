import {
  ERROR_TEXT,
  INVESTMENT_KIND_LABEL,
  INVESTMENT_TEXT,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  investmentGain,
  investmentErrorText,
  isRepoError,
  monthlyReturns,
  newOperationKey,
  type Investment,
  type InvestmentMovement,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { InvestmentReturns, InvestmentTotalsLines } from '@/components/investment-parts';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Body, Button, Card, Screen, Txt, styles as ui } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useInvalidateInvestments, useInvestment, useInvestmentMovements } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const T = INVESTMENT_TEXT;
const D = T.detail;

/**
 * Detalhe de um investimento (D-093): o valor de hoje, os totais, a rentabilidade com o CDI e o IPCA, as ações (aporte, resgate,
 * rendimento recebido, atualizar valor), o valor no fim de cada mês, o histórico e editar, encerrar ou reabrir e excluir.
 */
export default function InvestimentoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const one = useInvestment(id);
  const movements = useInvestmentMovements(id);
  const [notice, setNotice] = useFlash();
  if (one.isSuccess && one.data && movements.isSuccess) {
    return <Detail investment={one.data} movements={movements.data} notice={notice} onNotice={setNotice} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.tabTitle} right={<ContextPill label="Pessoal" fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {one.isError || movements.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => (one.isError ? one.refetch() : movements.refetch())} />
        ) : one.isSuccess && movements.isSuccess ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{T.errors.notFound}</Txt>
            <Button label="Ir para Investimentos" onPress={() => router.replace('/investimentos')} />
          </Card>
        ) : (
          <LoadingState />
        )}
      </Screen>
    </View>
  );
}

function Detail({
  investment: i,
  movements,
  notice,
  onNotice,
}: {
  investment: Investment;
  movements: readonly InvestmentMovement[];
  notice: string | null;
  onNotice: (m: string | null) => void;
}) {
  const repo = useRepo();
  const { today } = useSession();
  const invalidate = useInvalidateInvestments();
  const maskLabel = useMoneyLabelMask();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = i.status === 'ativo';
  const months = monthlyReturns([movements], today).slice(-12).reverse();
  const go = (tipo: string) => router.push({ pathname: '/investimento/[id]/movimento', params: { id: i.id, tipo } });

  async function setStatus(status: 'ativo' | 'encerrado') {
    if (busy) return;
    setBusy(true);
    setError(null);
    onNotice(null);
    try {
      await repo.setInvestmentStatus(newOperationKey(), i.id, i.version, status);
      invalidate();
      // A tela continua aberta: a faixa aparece aqui mesmo (o flash é só para a próxima tela).
      onNotice(status === 'ativo' ? D.reopened : D.closed);
    } catch (e) {
      invalidate();
      setError(investmentErrorText(isRepoError(e) ? e.code : 'desconhecido'));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await repo.deleteInvestment(newOperationKey(), i.id, i.version);
      invalidate();
      setConfirmDelete(false);
      flash.set(D.deleted);
      router.replace('/investimentos');
    } catch (e) {
      setConfirmDelete(false);
      invalidate();
      setError(investmentErrorText(isRepoError(e) ? e.code : 'desconhecido'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={i.name} right={<ContextPill label="Pessoal" fixed />} />
      <Screen>
        <View style={styles.hero}>
          <Txt variant="caption" color={colors.textOnBrandSoft}>
            {`${INVESTMENT_KIND_LABEL[i.kind]}${active ? '' : ' · Encerrado'}`}
          </Txt>
          <MoneyTxt color={colors.textOnBrand} style={[tabular, styles.big]}>
            {formatBRL(i.valueCents)}
          </MoneyTxt>
          <InvestmentTotalsLines depositsCents={i.depositsCents} withdrawalsCents={i.withdrawalsCents} incomeCents={i.incomeCents} gainCents={investmentGain(i)} onBrand />
          <Txt variant="caption" color={colors.textOnBrandSoft}>
            {i.lastValueOn ? T.lastValue(i.lastValueOn) : T.noValueYet}
          </Txt>
        </View>
        <Body>
          <FlashBanner message={notice} />
          {error ? (
            <Banner tone="erro">
              <Txt variant="label" color={colors.error}>
                {error}
              </Txt>
            </Banner>
          ) : null}
          <Card style={{ gap: space[2] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              Rentabilidade
            </Txt>
            <InvestmentReturns groups={[movements]} hasValue={i.lastValueOn !== null} />
            <Txt variant="caption" color={colors.textSecondary}>
              {T.disclaimer}
            </Txt>
          </Card>
          {active ? (
            <View style={styles.actions}>
              <Button label={D.updateValue} onPress={() => go('valor')} style={styles.action} />
              <Button label={D.addDeposit} tone="soft" onPress={() => go('aporte')} style={styles.action} />
              <Button label={D.addWithdrawal} tone="soft" onPress={() => go('resgate')} style={styles.action} />
              <Button label={D.addIncome} tone="soft" onPress={() => go('rendimento')} style={styles.action} />
            </View>
          ) : (
            <Button label={D.reopen} tone="soft" busy={busy} onPress={() => setStatus('ativo')} />
          )}
          {months.length > 0 ? (
            <Card style={{ gap: space[1], paddingVertical: space[3] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {D.monthsTitle}
              </Txt>
              {months.map((m) => (
                <View key={m.month} style={styles.monthRow}>
                  <Txt variant="label" style={{ flex: 1 }}>
                    {m.partial ? `${formatMonthBR(m.month)} (até hoje)` : formatMonthBR(m.month)}
                  </Txt>
                  <MoneyTxt variant="label" style={tabular}>
                    {formatBRL(m.endValueCents)}
                  </MoneyTxt>
                </View>
              ))}
            </Card>
          ) : null}
          <Card style={{ gap: space[1], paddingVertical: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {D.historyTitle}
            </Txt>
            {movements.length === 0 ? <Txt color={colors.textSecondary}>{D.historyEmpty}</Txt> : null}
            {movements.map((m, idx) => {
              const label = `${T.movementLabel[m.kind]}, ${formatDateBR(m.occurredOn)}, ${formatBRL(m.amountCents)}${m.note ? `, ${m.note}` : ''}`;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  accessibilityLabel={maskLabel(label)}
                  accessibilityHint={active ? 'Abre para alterar ou excluir' : undefined}
                  disabled={!active}
                  onPress={() => router.push({ pathname: '/investimento/[id]/movimento', params: { id: i.id, movimento: m.id } })}
                  style={(st) => [styles.histRow, idx < movements.length - 1 && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                      {T.movementLabel[m.kind]}
                    </Txt>
                    <Txt variant="caption" color={colors.textSecondary}>
                      {m.note ? `${formatDateBR(m.occurredOn)} · ${m.note}` : formatDateBR(m.occurredOn)}
                    </Txt>
                  </View>
                  <MoneyTxt variant="label" style={tabular}>
                    {formatBRL(m.amountCents)}
                  </MoneyTxt>
                  {active ? <ChevronRight size={18} color={colors.textSecondary} aria-hidden /> : null}
                </Pressable>
              );
            })}
          </Card>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.rule}
          </Txt>
          <View style={styles.actions}>
            <Button label={D.edit} icon={Pencil} tone="ghost" onPress={() => router.push({ pathname: '/investimento/[id]/editar', params: { id: i.id } })} style={styles.action} />
            {active ? <Button label={D.close} tone="ghost" busy={busy} onPress={() => setStatus('encerrado')} style={styles.action} /> : null}
            <Button label={D.delete} icon={Trash2} tone="ghost" onPress={() => setConfirmDelete(true)} style={styles.action} />
          </View>
        </Body>
      </Screen>
      <ConfirmDialog
        visible={confirmDelete}
        title={D.deleteTitle(i.name)}
        cancelLabel={D.cancel}
        confirmLabel={D.deleteConfirm}
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}>
        <Txt color={colors.textSecondary}>{D.deleteBody}</Txt>
      </ConfirmDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, padding: space[5], gap: space[2], borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  big: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 38 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 150 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 36 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
