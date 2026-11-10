import { GOAL_PRESETS_EMPTY, GOAL_PRESET_TEXT, goalPresetById, type GoalPreset, type GoalPresetLink } from '@clarevo/core';
import { router } from 'expo-router';
import { PencilLine } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { SuggestedImage } from '@/components/goal-image';
import { LinkButton, Txt, styles as ui } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** A escolha de "Nova meta": `id` de uma meta pronta, "outra" (nome livre) ou nada escolhido ainda. */
export type PresetChoice = GoalPreset['id'] | 'outra' | null;

/**
 * Grade das metas prontas (D-092): uma opção por meta, com a imagem que o nome puxa, e "Outra meta" no fim. As metas são botões de
 * opção (a escolhida fica marcada); a reserva para imprevistos é um botão que abre a tela da reserva.
 */
export function GoalPresetGrid({
  presets,
  choice,
  onChoose,
}: {
  presets: readonly GoalPreset[];
  choice: PresetChoice;
  onChoose: (choice: Exclude<PresetChoice, null>) => void;
}) {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={GOAL_PRESET_TEXT.title}>
      {presets.map((p) =>
        p.id === 'reserva' ? (
          <Tile key={p.id} label={p.name} role="button" selected={false} onPress={() => router.push('/reserva')}>
            <SuggestedImage imageKey={p.image} style={styles.thumb} label={null} iconSize={26} />
          </Tile>
        ) : (
          <Tile key={p.id} label={p.name} role="radio" selected={choice === p.id} onPress={() => onChoose(p.id)}>
            <SuggestedImage imageKey={p.image} style={styles.thumb} label={null} iconSize={26} />
          </Tile>
        ),
      )}
      <Tile label={GOAL_PRESET_TEXT.other} role="radio" selected={choice === 'outra'} onPress={() => onChoose('outra')}>
        <View style={[styles.thumb, styles.otherThumb]} aria-hidden>
          <PencilLine size={26} color={colors.brand} strokeWidth={1.75} />
        </View>
      </Tile>
    </View>
  );
}

function Tile({
  label,
  role,
  selected,
  onPress,
  children,
}: {
  label: string;
  role: 'radio' | 'button';
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const radio = role === 'radio';
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={radio ? { selected, checked: selected } : undefined}
      aria-checked={radio ? selected : undefined}
      onPress={onPress}
      style={(st) => [styles.tile, selected && styles.tileSelected, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      {children}
      {/* 12 px: "Aposentadoria" cabe inteira na grade de 3 colunas de um celular de 390 px (com 13 px, quebrava no meio da palavra). */}
      <Txt variant="caption" numberOfLines={2} style={{ fontFamily: selected ? fonts.bold : fonts.medium, textAlign: 'center', fontSize: 12, lineHeight: 16 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Metas sem nenhuma meta (D-092): as mais comuns, cada uma abre "Nova meta" já com ela escolhida; "Ver todas" abre a grade inteira. */
export function GoalPresetShortcuts() {
  const presets = GOAL_PRESETS_EMPTY.map((id) => goalPresetById(id)!);
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {GOAL_PRESET_TEXT.emptyShortcuts}
      </Txt>
      <View style={styles.grid}>
        {presets.map((p) => (
          <Tile key={p.id} label={p.name} role="button" selected={false} onPress={() => router.push({ pathname: '/meta/nova', params: { modelo: p.id } })}>
            <SuggestedImage imageKey={p.image} style={styles.thumb} label={null} iconSize={26} />
          </Tile>
        ))}
      </View>
      <LinkButton label={GOAL_PRESET_TEXT.seeAll} style={styles.hintLink} onPress={() => router.push('/meta/nova')} />
    </View>
  );
}

/** O que costuma entrar na conta da meta escolhida, com o atalho para a calculadora ou o simulador quando há. */
export function GoalPresetHint({ preset }: { preset: GoalPreset }) {
  return (
    <View style={styles.hint}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {GOAL_PRESET_TEXT.hintTitle}
      </Txt>
      <Txt variant="label">{preset.hint}</Txt>
      {preset.link ? <LinkButton label={preset.link.label} style={styles.hintLink} onPress={() => openLink(preset.link!)} /> : null}
    </View>
  );
}

/** Abre por cima de "Nova meta": o formulário continua preenchido na volta. */
function openLink(link: GoalPresetLink) {
  if (link.kind === 'simular') router.push('/simular');
  else router.push({ pathname: '/calcular/[slug]', params: { slug: link.slug } });
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  tile: {
    width: '31%',
    minWidth: 92,
    flexGrow: 1,
    gap: space[1],
    padding: 2,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'stretch',
  },
  tileSelected: { borderColor: colors.brand },
  thumb: { height: 56, borderRadius: radius.sm - 4 },
  otherThumb: { backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  hint: { gap: space[1], padding: space[3], borderRadius: radius.sm, backgroundColor: colors.brandTint },
  hintLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
