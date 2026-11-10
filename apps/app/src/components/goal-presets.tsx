import { GOAL_PRESETS_EMPTY, GOAL_PRESET_TEXT, goalPresetById, type GoalPreset, type GoalPresetLink } from '@clarevo/core';
import { router } from 'expo-router';
import { PencilLine } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SuggestedImage } from '@/components/goal-image';
import { Button, LinkButton, Txt, spaceKeyPress, styles as ui } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** A escolha de "Nova meta": `id` de uma meta pronta, "outra" (nome livre) ou nada escolhido ainda. */
export type PresetChoice = GoalPreset['id'] | 'outra' | null;

/** Largura mínima de uma opção: abaixo dela, a grade passa de 3 para 2 colunas ("Aposentadoria" inteira, sem quebrar a palavra). */
const TILE_MIN = 92;
const GAP = space[2];

/**
 * Colunas de largura igual, medidas pela largura da grade: 3 quando cabem opções de TILE_MIN, senão 2. Largura fixa (sem esticar), para
 * a última opção de uma linha incompleta não ocupar a linha inteira.
 */
function useTileWidth() {
  const [width, setWidth] = useState<number | null>(null);
  const columns = width !== null && width >= 3 * TILE_MIN + 2 * GAP ? 3 : 2;
  const tileWidth = width === null ? undefined : Math.floor((width - (columns - 1) * GAP) / columns);
  return { tileWidth, onLayout: (e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width) };
}

/**
 * Grade das metas prontas (D-092): uma opção por meta, com a imagem que o nome puxa, e "Outra meta" no fim, como botões de opção (a
 * escolhida fica marcada). A reserva para imprevistos não entra na grade: tem tela própria (GoalPresetReserve, abaixo dela).
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
  const { tileWidth, onLayout } = useTileWidth();
  return (
    <View style={styles.grid} onLayout={onLayout} accessibilityRole="radiogroup" accessibilityLabel={GOAL_PRESET_TEXT.title}>
      {presets.map((p) => (
        <Tile key={p.id} label={p.name} role="radio" width={tileWidth} selected={choice === p.id} onPress={() => onChoose(p.id)}>
          <SuggestedImage imageKey={p.image} style={styles.thumb} label={null} iconSize={26} />
        </Tile>
      ))}
      <Tile label={GOAL_PRESET_TEXT.other} role="radio" width={tileWidth} selected={choice === 'outra'} onPress={() => onChoose('outra')}>
        <View style={[styles.thumb, styles.otherThumb]} aria-hidden>
          <PencilLine size={26} color={colors.brand} strokeWidth={1.75} />
        </View>
      </Tile>
    </View>
  );
}

/**
 * Para quem ainda não tem a reserva para imprevistos: o caminho até a tela própria dela, logo abaixo da grade. Troca "Nova meta" pela
 * reserva (em vez de abrir por cima): ao salvar, a reserva volta para Metas sem um formulário esquecido embaixo.
 */
export function GoalPresetReserve({ preset }: { preset: GoalPreset }) {
  return (
    <View style={styles.hint}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {preset.name}
      </Txt>
      <Txt variant="label">{preset.hint}</Txt>
      <Button label={GOAL_PRESET_TEXT.reserveOpen} tone="soft" onPress={() => router.replace('/reserva')} />
    </View>
  );
}

function Tile({
  label,
  role,
  width,
  selected,
  onPress,
  children,
}: {
  label: string;
  role: 'radio' | 'button';
  width: number | undefined;
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const radio = role === 'radio';
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={radio ? { checked: selected } : undefined}
      aria-checked={radio ? selected : undefined}
      {...(radio ? spaceKeyPress(onPress) : {})}
      onPress={onPress}
      style={(st) => [
        styles.tile,
        width === undefined ? styles.tileUnmeasured : { width },
        selected && styles.tileSelected,
        st.pressed && { opacity: 0.85 },
        (st as { focused?: boolean }).focused && ui.focusRing,
      ]}>
      {children}
      {/* 12 px: "Aposentadoria" cabe inteira numa opção de 92 px (com 13 px, quebrava no meio da palavra). */}
      <Txt variant="caption" numberOfLines={2} style={{ fontFamily: selected ? fonts.bold : fonts.medium, textAlign: 'center', fontSize: 12, lineHeight: 16 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Metas sem nenhuma meta (D-092): as mais comuns, cada uma abre "Nova meta" já com ela escolhida; "Ver todas" abre a grade inteira. */
export function GoalPresetShortcuts() {
  const presets = GOAL_PRESETS_EMPTY.map((id) => goalPresetById(id)!);
  const { tileWidth, onLayout } = useTileWidth();
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {GOAL_PRESET_TEXT.emptyShortcuts}
      </Txt>
      <View style={styles.grid} onLayout={onLayout}>
        {presets.map((p) => (
          <Tile
            key={p.id}
            label={p.name}
            role="button"
            width={tileWidth}
            selected={false}
            onPress={() => router.push({ pathname: '/meta/nova', params: { modelo: p.id } })}>
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

/**
 * Abre por cima de "Nova meta": o formulário continua preenchido na volta. A calculadora e o simulador veem "Nova meta" embaixo e não
 * oferecem criar uma segunda meta por cima (useOpenedOverForm).
 */
function openLink(link: GoalPresetLink) {
  if (link.kind === 'simular') router.push('/simular');
  else router.push({ pathname: '/calcular/[slug]', params: { slug: link.slug } });
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    gap: space[1],
    padding: 2,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'stretch',
  },
  // Antes da primeira medida (um quadro): 3 colunas aproximadas, sem esticar.
  tileUnmeasured: { width: '31%' },
  tileSelected: { borderColor: colors.brand },
  thumb: { height: 56, borderRadius: radius.sm - 4 },
  otherThumb: { backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  hint: { gap: space[1], padding: space[3], borderRadius: radius.sm, backgroundColor: colors.brandTint },
  hintLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
