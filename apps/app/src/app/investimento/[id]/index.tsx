import {
  ERROR_TEXT,
  HISTORY_TEXT,
  INCOME_KIND_LABEL,
  INVESTMENT_REMINDER_TEXT,
  INVESTMENT_TEXT,
  VALUE_DATE_TEXT,
  detailReminder,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  investmentGain,
  investmentHistory,
  isStackedLayout,
  investmentErrorText,
  isRepoError,
  monthlyReturns,
  newOperationKey,
  valueDateCaption,
  type DetailReminder,
  type Investment,
  type InvestmentMovement,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { InvestmentEstimateCard, InvestmentFichaCard, InvestmentNetCard, investmentCaption } from '@/components/investment-ficha';
import { InvestmentReturns, InvestmentTotalsLines } from '@/components/investment-parts';
import { InvestmentPublicPriceCard } from '@/components/investment-public-price';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Body, Button, Card, Screen, Txt, styles as ui } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useInvestmentReminderHolds } from '@/lib/investment-reminder-holds';
import { useInvalidateInvestments, useInvestment, useInvestmentMovements } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const T = INVESTMENT_TEXT;
const D = T.detail;

/**
 * Detalhe de um investimento (D-093): o valor de hoje, os totais, a rentabilidade com o CDI e o IPCA, as ações (aporte, resgate,
 * rendimento recebido, atualizar valor), o valor no fim de cada mês, o histórico e editar, encerrar ou reabrir e excluir. Com a ficha
 * ampliada (D-099): "Sobre este investimento", o valor pela taxa contratada (com "Usar este valor") e "Se resgatasse hoje".
 * D-104: a data de cada valor (item 1; numa falha ao recarregar, os últimos valores carregados com a data, nunca zero), o lembrete com adiar
 * e pausar (item 6) e o histórico com o saldo depois de cada linha (item 16).
 */
export default function InvestimentoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const one = useInvestment(id);
  const movements = useInvestmentMovements(id);
  const [notice, setNotice] = useFlash();
  // Com dados já carregados, uma falha ao recarregar mantém o detalhe (com o aviso): nunca troca os valores por zero nem pelo erro.
  if (one.data && movements.data) {
    return <Detail investment={one.data} movements={movements.data} notice={notice} onNotice={setNotice} stale={one.isError || movements.isError} />;
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
            <Button label="Ir para Investir" onPress={() => router.replace('/investimentos')} />
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
  stale,
}: {
  investment: Investment;
  movements: readonly InvestmentMovement[];
  notice: string | null;
  onNotice: (m: string | null) => void;
  stale: boolean;
}) {
  const repo = useRepo();
  const { today } = useSession();
  const invalidate = useInvalidateInvestments();
  const maskLabel = useMoneyLabelMask();
  // Tela estreita ou letra grande: valores embaixo do nome e um botão por linha (Editar, Encerrar e Excluir).
  const { width, fontScale } = useWindowDimensions();
  const stacked = isStackedLayout(width, fontScale);
  const action = stacked ? styles.actionStacked : styles.action;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = i.status === 'ativo';
  const months = monthlyReturns([movements], today).slice(-12).reverse();
  const history = investmentHistory(movements);
  const holds = useInvestmentReminderHolds();
  const reminder = holds.ready ? detailReminder(i, today, holds.holds) : null;
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
            {`${investmentCaption(i)}${active ? '' : ' · Encerrado'}`}
          </Txt>
          <MoneyTxt color={colors.textOnBrand} style={[tabular, styles.big]}>
            {formatBRL(i.valueCents)}
          </MoneyTxt>
          <InvestmentTotalsLines depositsCents={i.depositsCents} withdrawalsCents={i.withdrawalsCents} incomeCents={i.incomeCents} gainCents={investmentGain(i)} onBrand />
          <Txt variant="caption" color={colors.textOnBrandSoft}>
            {valueDateCaption(movements)}
          </Txt>
        </View>
        <Body>
          <FlashBanner message={notice} />
          {stale ? (
            <Banner tone="info">
              <Txt variant="label">{VALUE_DATE_TEXT.staleLoad}</Txt>
            </Banner>
          ) : null}
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
          {reminder ? (
            <ReminderCard
              reminder={reminder}
              onAction={() => go(reminder.kind === 'atualizar' ? 'valor' : 'resgate')}
              onHold={(how) => onNotice(how === 'snooze' ? holds.snooze(reminder.kind) : holds.pause(reminder.kind))}
            />
          ) : null}
          {/* Um botão por linha, na largura toda (revisão das telas, 16/11/2026): em duas colunas, "Registrar rendimento recebido"
              quebrava em linhas de tamanhos diferentes. */}
          {active ? (
            <View style={styles.mainActions}>
              <Button label={D.updateValue} onPress={() => go('valor')} />
              <Button label={D.addDeposit} tone="soft" onPress={() => go('aporte')} />
              <Button label={D.addWithdrawal} tone="soft" onPress={() => go('resgate')} />
              <Button label={D.addIncome} tone="soft" onPress={() => go('rendimento')} />
            </View>
          ) : (
            <Button label={D.reopen} tone="soft" busy={busy} onPress={() => setStatus('ativo')} />
          )}
          <InvestmentEstimateCard investment={i} movements={movements} onNotice={onNotice} />
          <InvestmentPublicPriceCard investment={i} movements={movements} onNotice={onNotice} />
          <InvestmentNetCard investment={i} movements={movements} />
          <InvestmentFichaCard investment={i} />
          {months.length > 0 ? (
            <Card style={{ gap: space[1], paddingVertical: space[3] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {D.monthsTitle}
              </Txt>
              {months.map((m) => (
                <View key={m.month} style={[styles.monthRow, stacked && styles.rowStacked]}>
                  <Txt variant="label" style={stacked ? undefined : { flex: 1 }}>
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
              {HISTORY_TEXT.title}
            </Txt>
            {history.length === 0 ? (
              <Txt color={colors.textSecondary}>{D.historyEmpty}</Txt>
            ) : (
              <Txt variant="caption" color={colors.textSecondary}>
                {HISTORY_TEXT.intro}
              </Txt>
            )}
            {history.map(({ movement: m, balanceAfterCents, changeCents }, idx) => {
              const title = m.incomeKind ? `${T.movementLabel[m.kind]} · ${INCOME_KIND_LABEL[m.incomeKind]}` : T.movementLabel[m.kind];
              const label = `${title}, ${formatDateBR(m.occurredOn)}, ${formatBRL(m.amountCents)}${m.note ? `, ${m.note}` : ''}, ${HISTORY_TEXT.balanceA11y(balanceAfterCents)}`;
              const detail = m.kind === 'rendimento' ? HISTORY_TEXT.income : changeCents !== null ? HISTORY_TEXT.change(changeCents) : null;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  accessibilityLabel={maskLabel(label)}
                  accessibilityHint={active ? 'Abre para alterar ou excluir' : undefined}
                  disabled={!active}
                  onPress={() => router.push({ pathname: '/investimento/[id]/movimento', params: { id: i.id, movimento: m.id } })}
                  style={(st) => [styles.histRow, idx < history.length - 1 && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                      {title}
                    </Txt>
                    <Txt variant="caption" color={colors.textSecondary}>
                      {m.note ? `${formatDateBR(m.occurredOn)} · ${m.note}` : formatDateBR(m.occurredOn)}
                    </Txt>
                    {stacked ? (
                      <MoneyTxt variant="label" style={tabular}>
                        {formatBRL(m.amountCents)}
                      </MoneyTxt>
                    ) : null}
                    <MoneyTxt variant="caption" color={colors.textSecondary} style={tabular}>
                      {HISTORY_TEXT.balance(balanceAfterCents)}
                    </MoneyTxt>
                    {detail ? (
                      <MoneyTxt variant="caption" color={colors.textSecondary}>
                        {detail}
                      </MoneyTxt>
                    ) : null}
                  </View>
                  {stacked ? null : (
                    <MoneyTxt variant="label" style={tabular}>
                      {formatBRL(m.amountCents)}
                    </MoneyTxt>
                  )}
                  {active ? <ChevronRight size={18} color={colors.textSecondary} aria-hidden /> : null}
                </Pressable>
              );
            })}
          </Card>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.rule}
          </Txt>
          <View style={styles.actions}>
            <Button label={D.edit} icon={Pencil} tone="ghost" onPress={() => router.push({ pathname: '/investimento/[id]/editar', params: { id: i.id } })} style={action} />
            {active ? <Button label={D.close} tone="ghost" busy={busy} onPress={() => setStatus('encerrado')} style={action} /> : null}
            <Button label={D.delete} icon={Trash2} tone="ghost" onPress={() => setConfirmDelete(true)} style={action} />
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

/**
 * O lembrete do detalhe (D-104, item 6), em tom de fato: o vencimento de até 7 dias ou já passado, ou o valor sem o extrato do mês passado.
 * "Lembrar de novo em 3 dias" e "Pausar este lembrete por 30 dias" valem para o tipo (também para o aviso no celular), só neste aparelho.
 */
function ReminderCard({ reminder, onAction, onHold }: { reminder: DetailReminder; onAction: () => void; onHold: (how: 'snooze' | 'pause') => void }) {
  const R = INVESTMENT_REMINDER_TEXT;
  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {R.kindTitle[reminder.kind]}
      </Txt>
      <Txt>{reminder.kind === 'vencimentos' ? R.card.due(reminder.due) : R.card.stale(reminder.lastValueOn, reminder.since)}</Txt>
      {reminder.kind === 'atualizar' || (reminder.due.days < 0 && !reminder.due.release) ? (
        <Button label={reminder.kind === 'atualizar' ? R.card.update : R.card.resgate} tone="soft" onPress={onAction} />
      ) : null}
      <Button label={R.snooze} tone="ghost" onPress={() => onHold('snooze')} />
      <Button label={R.pause} tone="ghost" onPress={() => onHold('pause')} />
      <Txt variant="caption" color={colors.textSecondary}>
        {R.note}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, padding: space[5], gap: space[2], borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  big: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 38 },
  mainActions: { gap: space[2] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 150 },
  actionStacked: { alignSelf: 'auto', flexGrow: 1, flexBasis: '100%' },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 2, paddingVertical: space[1] },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 36 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
