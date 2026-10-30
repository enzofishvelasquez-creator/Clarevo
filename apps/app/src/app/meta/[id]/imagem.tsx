import {
  ERROR_TEXT,
  GOAL_ERROR_TEXT,
  GOAL_IMAGES,
  GOAL_IMAGE_TEXT,
  goalImageOf,
  goalImageView,
  suggestGoalImage,
  isRepoError,
  newOperationKey,
  type GoalImageChoice,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, Check, ImagePlus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GoalImageView, SuggestedImage } from '@/components/goal-image';
import { SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Screen, Txt, styles as ui } from '@/components/ui';
import { pickGoalPhoto } from '@/lib/goal-photo';
import { useGoalDetail, useGoalImages, useSpace } from '@/state/data';
import { useRepo } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = GOAL_IMAGE_TEXT;

type Msg = { tone: 'erro' | 'sucesso'; text: string } | null;

/**
 * Imagem da meta (D-077): escolher uma das sugeridas, voltar à automática (pelo nome da meta) ou mandar uma foto da galeria, que o
 * aparelho reduz antes de enviar e a Clarevo guarda só para quem vê a meta (set_goal_image). Trocar a imagem não conta como anotação.
 */
export default function MetaImagemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repo = useRepo();
  const qc = useQueryClient();
  const detail = useGoalDetail(id);
  const goal = detail.data?.goal ?? null;
  const personal = useSpace().data?.personalContextId;
  const images = useGoalImages(goal?.contextId);
  const image = images.data?.find((i) => i.goalId === id) ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const save = async (choice: GoalImageChoice, tag: string) => {
    if (!goal || busy || !images.isSuccess) return;
    setBusy(tag);
    setMsg(null);
    try {
      await repo.setGoalImage(newOperationKey(), goal.id, image?.version ?? 0, choice);
      await qc.invalidateQueries({ queryKey: ['goals', 'images', goal.contextId] });
      setMsg({ tone: 'sucesso', text: T.saved });
    } catch (e) {
      const code = isRepoError(e) ? e.code : null;
      if (code === 'versao_desatualizada') await images.refetch();
      setMsg({ tone: 'erro', text: code === 'foto_grande' ? T.tooBig : code === 'foto_invalida' ? T.invalid : T.error });
    } finally {
      setBusy(null);
    }
  };

  const pick = async () => {
    if (busy) return;
    setMsg(null);
    const r = await pickGoalPhoto();
    if (r.ok) await save({ kind: 'foto', base64: r.base64 }, 'foto');
    else if (r.reason === 'foto_grande') setMsg({ tone: 'erro', text: T.tooBig });
    else if (r.reason === 'falha') setMsg({ tone: 'erro', text: T.invalid });
  };

  if (detail.isPending || (goal && images.isPending)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.title} />
        <LoadingState />
      </View>
    );
  }
  if (detail.isError || images.isError || !goal) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.title} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          {goal === null && detail.isSuccess ? (
            <Card style={{ gap: space[3] }}>
              <Txt>{GOAL_ERROR_TEXT.nao_encontrado}</Txt>
              <Button label="Ir para Metas" onPress={() => router.replace('/metas')} />
            </Card>
          ) : (
            <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => (detail.isError ? detail.refetch() : images.refetch())} />
          )}
        </Screen>
      </View>
    );
  }

  const view = goalImageView(goal, image);
  const autoKey = suggestGoalImage(goal.name, goal.goalType);
  const chosenKey = view.kind === 'sugestao' && view.chosen ? view.key : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <GoalImageView goal={goal} image={image} height={168} />
        <Txt color={colors.textSecondary}>{T.intro}</Txt>
        {goal.contextId !== personal ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {T.familyHint}
          </Txt>
        ) : null}
        {msg ? (
          <Banner tone={msg.tone} icon={msg.tone === 'erro' ? AlertCircle : Check}>
            <Txt variant="label" color={msg.tone === 'erro' ? colors.error : colors.successText}>
              {msg.text}
            </Txt>
          </Banner>
        ) : null}

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.suggestedTitle}
          </Txt>
          <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={T.suggestedTitle}>
            <Tile
              label={T.automatic(goalImageOf(autoKey).label)}
              selected={view.kind === 'sugestao' && !view.chosen}
              disabled={busy !== null}
              onPress={() => save({ kind: 'automatica' }, 'automatica')}>
              <SuggestedImage imageKey={autoKey} style={styles.thumb} label={null} />
            </Tile>
            {GOAL_IMAGES.map((g) => (
              <Tile key={g.key} label={g.label} selected={chosenKey === g.key} disabled={busy !== null} onPress={() => save({ kind: 'sugestao', key: g.key }, g.key)}>
                <SuggestedImage imageKey={g.key} style={styles.thumb} label={null} />
              </Tile>
            ))}
          </View>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.automaticHint}
          </Txt>
        </Card>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.photoTitle}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.photoHint}
          </Txt>
          <Button
            label={image?.hasPhoto ? T.replacePhoto : T.pickPhoto}
            icon={ImagePlus}
            busy={busy === 'foto'}
            busyLabel={T.saving}
            disabled={busy !== null && busy !== 'foto'}
            onPress={pick}
          />
          {image?.hasPhoto ? (
            <Button label={T.removePhoto} icon={Trash2} tone="soft" busy={busy === 'automatica'} disabled={busy !== null} onPress={() => save({ kind: 'automatica' }, 'automatica')} />
          ) : null}
        </Card>
      </Screen>
    </View>
  );
}

function Tile({ label, selected, disabled, onPress, children }: { label: string; selected: boolean; disabled: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onPress}
      style={(st) => [styles.tile, selected && styles.tileSelected, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      {children}
      <Txt variant="caption" numberOfLines={2} style={{ fontFamily: selected ? fonts.bold : fonts.medium, textAlign: 'center' }}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  tile: {
    width: '31%',
    minWidth: 92,
    flexGrow: 1,
    gap: space[1],
    padding: space[1],
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'stretch',
  },
  tileSelected: { borderColor: colors.brand },
  thumb: { height: 64, borderRadius: radius.sm - 4 },
});
