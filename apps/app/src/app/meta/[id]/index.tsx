import {
  ERROR_TEXT,
  GOALS_TEXT,
  GOAL_ERROR_TEXT,
  GOAL_STATUS_LABEL,
  GOAL_TYPE_LABEL,
  goalDetailTexts,
  goalErrorText,
  goalPlan,
  movementLine,
  movementsByMonth,
  simulateLinkParams,
  simulateValuesFromGoal,
  type Goal,
  type GoalMovement,
  type GoalStatus,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { ChartLine, CircleAlert, CircleCheck, Ellipsis, Minus, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { ChoiceDialog, type DialogChoice } from '@/components/choice-dialog';
import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { GoalProgress } from '@/components/goal-progress';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { ErrorState } from '@/components/states';
import { TermHint } from '@/components/term-hint';
import { Banner, Body, Button, Card, FitMoney, LinkButton, Screen, Skeleton, Txt, styles as ui } from '@/components/ui';
import { showsCoverage } from '@/lib/essentials';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { useDeleteGoal, useGoalDetail, useGoalOperationKey, useSetGoalStatus } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space, tabular } from '@/theme/tokens';

const D = GOALS_TEXT.detail;

/** Detalhe da meta ou da reserva (D-027, spec2 §4.6): faixa azul, plano, composição, ações e histórico de movimentos. */
export default function MetaDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { today } = useSession();
  const qc = useQueryClient();
  const detail = useGoalDetail(id);
  const setStatus = useSetGoalStatus();
  const remove = useDeleteGoal();
  const keys = useGoalOperationKey();
  const [notice, setNotice] = useFlash();
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const goal = detail.data?.goal ?? null;
  const movements = detail.data?.movements ?? [];
  const reserve = goal?.goalType === 'emergencia';

  function haptic() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  function fail(code: string) {
    if (code === 'versao_desatualizada' || code === 'nao_encontrado' || code === 'reserva_ja_existe') {
      qc.invalidateQueries({ queryKey: ['goals'] });
      detail.refetch();
    }
    setActionError(goalErrorText(code));
  }

  /** Concluir, arquivar e reativar: o aviso só aparece depois de o servidor confirmar. */
  async function changeStatus(g: Goal, status: GoalStatus, text: string) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const r = await guardedWrite(keys, JSON.stringify(['situacao', g.id, g.version, status]), (key) =>
        setStatus.mutateAsync({ key, id: g.id, version: g.version, status }),
      );
      if (r.status === 'ok' || r.status === 'reconciled') {
        haptic();
        setNotice(text);
      } else if (r.status === 'refused') fail(r.code);
      else setActionError(GOAL_ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(g: Goal) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const r = await guardedWrite(keys, JSON.stringify(['excluir', g.id, g.version]), (key) => remove.mutateAsync({ key, id: g.id, version: g.version }));
      setConfirmDelete(false);
      if (r.status === 'ok' || r.status === 'reconciled') {
        haptic();
        flash.set(D.deleted);
        router.dismissTo('/metas');
      } else if (r.status === 'refused') fail(r.code);
      else setActionError(GOAL_ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  const open = (pathname: '/meta/[id]/movimento' | '/meta/[id]/editar', params: Record<string, string> = {}) =>
    router.push({ pathname, params: { id, ...params } });

  const menuChoices = (g: Goal, reached: boolean): DialogChoice[] => {
    const choices: DialogChoice[] = [];
    const go = (fn: () => void) => () => {
      setMenu(false);
      fn();
    };
    if (g.status !== 'arquivada') choices.push({ label: D.addIncome, onPress: go(() => open('/meta/[id]/movimento', { tipo: 'rendimento' })) });
    choices.push({ label: D.edit, onPress: go(() => (g.goalType === 'emergencia' ? router.push('/reserva') : open('/meta/[id]/editar'))) });
    if (g.status === 'ativa' && !reached) choices.push({ label: D.conclude, onPress: go(() => changeStatus(g, 'concluida', D.concluded)) });
    if (g.status !== 'ativa') choices.push({ label: D.reactivate, onPress: go(() => changeStatus(g, 'ativa', D.reactivated)) });
    if (g.status !== 'arquivada') choices.push({ label: D.archive, onPress: go(() => changeStatus(g, 'arquivada', D.archived)) });
    choices.push({ label: D.delete, onPress: go(() => setConfirmDelete(true)) });
    return choices;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader
        title={goal?.goalType === 'emergencia' ? 'Reserva' : 'Meta'}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/metas'))}
        right={<ContextPill label="Pessoal" />}
      />
      <Screen wide>
        {detail.isPending ? (
          <View style={[styles.hero, { gap: space[3] }]}>
            <View style={styles.heroInner}>
              <Skeleton width="50%" height={24} onBrand />
              <Skeleton width="60%" height={40} onBrand />
              <Skeleton width="100%" height={12} onBrand />
            </View>
          </View>
        ) : detail.isError ? (
          <Body>
            <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => detail.refetch()} />
          </Body>
        ) : !goal ? (
          <Body>
            <Card style={{ gap: space[3] }}>
              <Txt>{GOAL_ERROR_TEXT.nao_encontrado}</Txt>
              <Button label="Ir para Metas" onPress={() => router.replace('/metas')} />
            </Card>
          </Body>
        ) : (
          <GoalBody
            goal={goal}
            movements={movements}
            today={today}
            notice={notice}
            actionError={actionError}
            busy={busy}
            reserve={Boolean(reserve)}
            onOpenMovement={(tipo) => open('/meta/[id]/movimento', { tipo })}
            onEditMovement={(movementId) => open('/meta/[id]/movimento', { movimento: movementId })}
            onConclude={() => changeStatus(goal, 'concluida', D.concluded)}
            onReactivate={() => changeStatus(goal, 'ativa', D.reactivated)}
            onMenu={() => setMenu(true)}
            onDelete={() => setConfirmDelete(true)}
          />
        )}
      </Screen>

      {goal ? (
        <>
          <ChoiceDialog
            visible={menu}
            title="Mais ações"
            cancelLabel="Fechar"
            onCancel={() => setMenu(false)}
            choices={menuChoices(goal, goal.savedCents >= goal.targetCents)}
          />
          <ConfirmDialog
            visible={confirmDelete}
            title={D.deleteTitle(goal.name)}
            cancelLabel={D.cancel}
            confirmLabel={D.deleteConfirm}
            busy={busy}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => doDelete(goal)}>
            <Txt color={colors.textSecondary}>{D.deleteBody}</Txt>
          </ConfirmDialog>
        </>
      ) : null}
    </View>
  );
}

function GoalBody({
  goal,
  movements,
  today,
  notice,
  actionError,
  busy,
  reserve,
  onOpenMovement,
  onEditMovement,
  onConclude,
  onReactivate,
  onMenu,
  onDelete,
}: {
  goal: Goal;
  movements: readonly GoalMovement[];
  today: string;
  notice: string | null;
  actionError: string | null;
  busy: boolean;
  reserve: boolean;
  onOpenMovement: (tipo: 'aporte' | 'resgate' | 'rendimento' | 'atualizar') => void;
  onEditMovement: (movementId: string) => void;
  onConclude: () => void;
  onReactivate: () => void;
  onMenu: () => void;
  onDelete: () => void;
}) {
  const maskLabel = useMoneyLabelMask();
  const plan = goalPlan(goal, movements, today);
  const t = goalDetailTexts(goal, movements, today);
  const archived = goal.status === 'arquivada';
  const reached = plan.progress.reached;
  // O selo só anima se a meta passar a ser alcançada com a tela aberta (primeira exibição sem animação).
  const [initiallyReached] = useState(reached);
  const groups = movementsByMonth(movements);
  const coverage = reserve && showsCoverage(goal) ? t.coverage : null;
  // "Simular com rendimento": só enquanto falta guardar (o simulador começa do guardado e do prazo da meta).
  const simulate = reached ? null : simulateLinkParams(simulateValuesFromGoal(plan));
  const planLines = [t.deadline, t.planned, coverage].filter((x): x is string => Boolean(x));
  const a11yBar = GOALS_TEXT.progressA11y(goal.name, plan.progress.percent, goal.savedCents, goal.targetCents);
  const a11yValue = `${GOALS_TEXT.savedOfTarget(goal.savedCents, goal.targetCents)}, ${GOALS_TEXT.percent(plan.progress.percent)}`;

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroInner}>
          <View style={styles.heroHead}>
            <Txt variant="title" color={colors.textOnBrand} style={{ flex: 1, fontSize: 22, lineHeight: 30 }} accessibilityRole="header" aria-level={2}>
              {goal.name}
            </Txt>
            {goal.status !== 'ativa' ? (
              <View style={styles.statusPill}>
                <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold }}>
                  {GOAL_STATUS_LABEL[goal.status]}
                </Txt>
              </View>
            ) : null}
          </View>
          <Txt variant="caption" color={colors.textOnBrandSoft}>
            {GOAL_TYPE_LABEL[goal.goalType]}
          </Txt>
          <FitMoney cents={goal.savedCents} color={colors.textOnBrand} />
          <GoalProgress percent={plan.progress.barPercent} tone="onBrand" label={a11yBar} valueText={a11yValue} />
          <MoneyTxt color={colors.textOnBrand} style={[tabular, { fontFamily: fonts.bold }]}>
            {t.ofTarget}
          </MoneyTxt>
          {t.missing ? (
            <MoneyTxt color={colors.textOnBrandSoft} variant="label">
              {t.missing}
            </MoneyTxt>
          ) : null}
          {t.reached ? (
            <Animated.View
              entering={initiallyReached ? undefined : FadeIn.duration(motion.context).reduceMotion(ReduceMotion.System)}
              style={{ gap: space[2] }}
              accessibilityLiveRegion="polite">
              <View style={styles.reachedPill} accessible accessibilityLabel={t.reached.badge}>
                <CircleCheck size={18} color={colors.text} strokeWidth={2.5} aria-hidden />
                <Txt variant="label" color={colors.text} style={{ fontFamily: fonts.bold }}>
                  {t.reached.badge}
                </Txt>
              </View>
              <Txt variant="label" color={colors.textOnBrand}>
                {t.reached.body}
              </Txt>
            </Animated.View>
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

        {planLines.length > 0 || simulate ? (
          <Card style={{ gap: space[2] }}>
            {planLines.map((line) => (
              <MoneyTxt key={line} style={tabular}>
                {line}
              </MoneyTxt>
            ))}
            {simulate ? (
              <LinkButton
                label={D.simulate}
                icon={ChartLine}
                style={styles.inlineLink}
                onPress={() => router.push({ pathname: '/simular', params: simulate })}
              />
            ) : null}
          </Card>
        ) : null}

        <Card style={{ gap: space[2] }}>
          {t.composition.map((line) => (
            <MoneyTxt key={line} variant="label" style={tabular}>
              {line}
            </MoneyTxt>
          ))}
          <Txt variant="caption" color={colors.textSecondary} style={{ paddingTop: space[1] }}>
            {D.rule}
          </Txt>
          <TermHint term="Aporte" slug="aporte" />
        </Card>

        <View style={{ gap: space[3] }}>
          {archived ? (
            <>
              <Button label={D.reactivate} icon={RefreshCw} disabled={busy} onPress={onReactivate} />
              <Button label={D.delete} icon={Trash2} tone="danger" disabled={busy} onPress={onDelete} />
            </>
          ) : (
            <>
              {reached && goal.status === 'ativa' ? <Button label={D.conclude} icon={CircleCheck} disabled={busy} onPress={onConclude} /> : null}
              <Button
                label={D.addDeposit}
                icon={Plus}
                tone={reached && goal.status === 'ativa' ? 'soft' : 'brand'}
                disabled={busy}
                onPress={() => onOpenMovement('aporte')}
              />
              <Button label={D.addWithdrawal} icon={Minus} tone="soft" disabled={busy} onPress={() => onOpenMovement('resgate')} />
              <Button label={D.updateSaved} icon={RefreshCw} tone="soft" disabled={busy} onPress={() => onOpenMovement('atualizar')} />
              <Button label="Mais ações" icon={Ellipsis} tone="ghost" disabled={busy} onPress={onMenu} />
            </>
          )}
        </View>

        <Card style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {D.historyTitle}
          </Txt>
          {groups.length === 0 ? (
            <Txt variant="label" color={colors.textSecondary} style={{ paddingVertical: space[2] }}>
              {D.historyEmpty}
            </Txt>
          ) : (
            groups.map((g) => (
              <View key={g.month}>
                <Txt variant="label" color={colors.textSecondary} style={styles.monthTitle} accessibilityRole="header" aria-level={3}>
                  {g.title}
                </Txt>
                {g.items.map((m, i) => {
                  const line = movementLine(m);
                  const last = i === g.items.length - 1;
                  const body = (
                    <MoneyTxt variant="label" style={[tabular, { flex: 1 }]}>
                      {line.text}
                    </MoneyTxt>
                  );
                  if (archived) {
                    return (
                      <View key={m.id} accessible accessibilityLabel={maskLabel(line.a11yLabel)} style={[styles.row, !last && styles.divider]}>
                        {body}
                      </View>
                    );
                  }
                  return (
                    <Pressable
                      key={m.id}
                      accessibilityRole="button"
                      accessibilityLabel={maskLabel(line.a11yLabel)}
                      accessibilityHint="Abre o movimento para editar ou excluir"
                      onPress={() => onEditMovement(m.id)}
                      style={(st) => [
                        styles.row,
                        !last && styles.divider,
                        st.pressed && { opacity: 0.7 },
                        (st as { focused?: boolean }).focused && ui.focusRing,
                      ]}>
                      {body}
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </Card>

        <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy} hitSlop={8}>
          <ShieldCheck size={18} color={colors.textSecondary} />
          <Txt variant="label" color={colors.textSecondary}>
            {GOALS_TEXT.whoSees}
          </Txt>
        </Pressable>
      </Body>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  heroInner: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space[6], paddingTop: space[2], paddingBottom: space[6], gap: space[3] },
  heroHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  statusPill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: 2 },
  reachedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[2],
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    minHeight: 32,
  },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  monthTitle: { paddingTop: space[3], fontFamily: fonts.bold },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingVertical: space[2], borderRadius: radius.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
});
