import { ERROR_TEXT, GOALS_TEXT, isRepoError, newOperationKey, organizeGoals, type Goal } from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ArrowDown, ArrowUp, CircleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Card, Screen, Txt, styles as ui } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useGoals, useView, useWork } from '@/state/data';
import { useRepo } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = GOALS_TEXT.order;

/**
 * Ordenar metas (D-093): a pessoa põe a meta mais importante em primeiro, com "Subir" e "Descer" em cada meta, e salva a lista
 * inteira (set_goal_order). Só as metas ativas, sem a reserva (que tem o card próprio). Na Família, a ordem vale para todas as pessoas.
 */
export default function OrdenarMetasScreen() {
  const work = useWork();
  const { space: kind } = useView();
  const contextId = work.data?.contextId;
  const goals = useGoals(contextId);
  const label = kind === 'familia' ? 'Família' : 'Pessoal';

  if (work.isError || goals.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.title} right={<ContextPill label={`Salvando em ${label}`} />} />
        <Screen contentStyle={{ padding: space[5] }}>
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => goals.refetch()} />
        </Screen>
      </View>
    );
  }
  if (!contextId || !goals.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.title} right={<ContextPill label={`Salvando em ${label}`} />} />
        <LoadingState />
      </View>
    );
  }
  return (
    <OrderForm
      contextId={contextId}
      active={organizeGoals(goals.data).active}
      family={kind === 'familia'}
      canWrite={work.data?.canWrite ?? false}
      onChanged={() => goals.refetch()}
    />
  );
}

function OrderForm({
  contextId,
  active,
  family,
  canWrite,
  onChanged,
}: {
  contextId: string;
  active: readonly Goal[];
  family: boolean;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const repo = useRepo();
  const qc = useQueryClient();
  const [order, setOrder] = useState<Goal[]>(() => [...active]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // As metas mudaram (outro aparelho, ou a recusa "lista_invalida"): a ordem escolhida fica para as que continuam, as novas entram no
  // fim, e a mensagem continua na tela (revisão de 11/11/2026: antes, a tela recomeçava e perdia a ordem e o aviso).
  const ids = active.map((g) => g.id).join(',');
  useEffect(() => {
    setOrder((o) => {
      const byId = new Map(active.map((g) => [g.id, g]));
      const kept = o.filter((g) => byId.has(g.id)).map((g) => byId.get(g.id)!);
      return [...kept, ...active.filter((g) => !kept.some((k) => k.id === g.id))];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const dirty = order.some((g, i) => g.id !== active[i]?.id);
  const guard = useLeaveGuard(dirty && !busy, '/metas');

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    setError(null);
    setOrder((o) => {
      const next = [...o];
      const [g] = next.splice(from, 1);
      next.splice(to, 0, g!);
      return next;
    });
  };

  async function submit() {
    if (busy) return;
    if (!canWrite) {
      setError(T.noPermission);
      return;
    }
    if (!dirty) {
      guard.leave(() => (router.canGoBack() ? router.back() : router.replace('/metas')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await repo.setGoalOrder(newOperationKey(), contextId, order.map((g) => g.id));
      await qc.invalidateQueries({ queryKey: ['goals', 'list'] });
      flash.set(T.saved);
      guard.leave(() => (router.canGoBack() ? router.back() : router.replace('/metas')));
    } catch (e) {
      const code = isRepoError(e) ? e.code : null;
      if (code === 'lista_invalida') {
        setError(T.changed);
        onChanged();
      } else setError(code === 'sem_permissao' ? T.noPermission : T.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} onBack={guard.requestCancel} right={<ContextPill label={`Salvando em ${family ? 'Família' : 'Pessoal'}`} />} />
      <Screen contentStyle={styles.body}>
        <Txt color={colors.textSecondary}>{family ? T.introFamily : T.intro}</Txt>
        {error ? (
          <Banner tone="erro" icon={CircleAlert}>
            <Txt variant="label" color={colors.error}>
              {error}
            </Txt>
          </Banner>
        ) : null}
        <Card style={{ paddingVertical: space[1] }}>
          <View accessibilityRole="list">
            {order.map((g, i) => (
              <View key={g.id} accessibilityRole="none" style={[styles.row, i < order.length - 1 && styles.divider]}>
                <Txt variant="label" color={colors.textSecondary} style={styles.position} aria-hidden>
                  {T.position(i + 1)}
                </Txt>
                <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16 }}>
                  {g.name}
                </Txt>
                <MoveButton label={T.up(g.name)} icon="up" disabled={i === 0 || busy} onPress={() => move(i, i - 1)} />
                <MoveButton label={T.down(g.name)} icon="down" disabled={i === order.length - 1 || busy} onPress={() => move(i, i + 1)} />
              </View>
            ))}
          </View>
        </Card>
      </Screen>
      <FormFooter error={null} onCancel={guard.requestCancel} submitLabel={T.save} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </View>
  );
}

function MoveButton({ label, icon, disabled, onPress }: { label: string; icon: 'up' | 'down'; disabled: boolean; onPress: () => void }) {
  const Icon = icon === 'up' ? ArrowUp : ArrowDown;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={(st) => [styles.move, disabled && { opacity: 0.35 }, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      <Icon size={20} color={colors.brand} strokeWidth={2.25} aria-hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56, paddingVertical: space[2] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  position: { width: 32, fontFamily: fonts.bold },
  move: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandTint },
});
