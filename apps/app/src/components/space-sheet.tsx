import { SPACE_TEXT, spaceChoices, type CreatableSpace, type SpaceChoice } from '@clarevo/core';
import { router } from 'expo-router';
import { Check, ChevronRight, Store, User, Users, type LucideIcon } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button, Txt, spaceKeyPress } from '@/components/ui';
import { useView } from '@/state/data';
import { useBusiness } from '@/state/business';
import { useFamily } from '@/state/family';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Os espaços da pessoa e os que ela pode criar (D-113b), pelas leituras da Família e do negócio. Enquanto uma leitura não chegou (ou
 * falhou), aquele espaço não aparece nem é oferecido para criar.
 */
export function useSpaceChoices(): { spaces: SpaceChoice[]; creatable: CreatableSpace[] } {
  const family = useFamily();
  const business = useBusiness();
  return spaceChoices(family.isSuccess ? Boolean(family.data) : family.data ? true : undefined, business.isSuccess ? (business.data ?? null) : (business.data ?? undefined));
}

const CHOICE_ICON: Record<SpaceChoice['kind'], LucideIcon> = { pessoal: User, familia: Users, negocio: Store };
const CREATE_ICON: Record<CreatableSpace, LucideIcon> = { negocio: Store, familia: Users };

/** Criar o negócio abre o formulário do espaço Negócio; criar a Família abre a tela Família, a mesma do card de Conta. */
function openCreate(kind: CreatableSpace) {
  router.push(kind === 'negocio' ? '/negocio/novo' : '/familia');
}

/**
 * A folha de espaços (D-113b). `criar` (o "+" do seletor das abas): só o que dá para criar, o espaço Negócio primeiro e depois a Família,
 * cada um com uma frase de para quem é. `trocar` (a pílula das telas de consulta): com mais de um espaço, a escolha do espaço (tocar troca
 * o espaço de todas as telas, que leem de novo os dados dele) e, abaixo, o que ainda dá para criar. Mesmo desenho da folha "Como usar"
 * (HelpSheet): caixa central, sem animação com "reduzir movimento", Esc e o voltar do sistema fecham, foco preso na folha (RN Web Modal).
 */
export function SpaceSheet({ mode, onClose }: { mode: 'criar' | 'trocar'; onClose: () => void }) {
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const { space: active, setSpace } = useView();
  const { spaces, creatable } = useSpaceChoices();
  const switching = mode === 'trocar' && spaces.length > 1;
  const title = switching ? SPACE_TEXT.switchTitle : SPACE_TEXT.createTitle;

  const choose = (kind: SpaceChoice['kind']) => {
    if (kind !== active) setSpace(kind);
    onClose();
  };
  const create = (kind: CreatableSpace) => {
    onClose();
    openCreate(kind);
  };

  return (
    <Modal visible transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose} {...({ 'aria-label': title } as object)}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { maxHeight: Math.max(320, Math.round(height * 0.86)) }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={{ gap: space[3] }} style={{ flexShrink: 1 }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {title}
            </Txt>
            {switching ? (
              <View accessibilityRole="radiogroup" accessibilityLabel={SPACE_TEXT.switchGroup}>
                {spaces.map((s, i) => (
                  <ChoiceRow key={s.kind} choice={s} selected={s.kind === active} last={i === spaces.length - 1} onPress={() => choose(s.kind)} />
                ))}
              </View>
            ) : (
              <Txt color={colors.textSecondary}>{SPACE_TEXT.createIntro}</Txt>
            )}
            {creatable.length > 0 ? (
              <View style={{ gap: space[1] }}>
                {switching ? (
                  <Txt variant="label" color={colors.textSecondary} accessibilityRole="header" aria-level={3} style={{ fontFamily: fonts.bold, marginTop: space[2] }}>
                    {SPACE_TEXT.createTitle}
                  </Txt>
                ) : null}
                {creatable.map((k, i) => (
                  <CreateRow key={k} kind={k} last={i === creatable.length - 1} onPress={() => create(k)} />
                ))}
              </View>
            ) : null}
          </ScrollView>
          <Button label={SPACE_TEXT.close} tone="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/** Um espaço da pessoa: o ícone, o nome (cortado com reticências se for longo) e o visto no escolhido. */
function ChoiceRow({ choice, selected, last, onPress }: { choice: SpaceChoice; selected: boolean; last: boolean; onPress: () => void }) {
  const Icon = CHOICE_ICON[choice.kind];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={SPACE_TEXT.choiceA11y(choice)}
      onPress={onPress}
      {...spaceKeyPress(onPress)}
      style={(st) => [styles.row, !last && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
      <View style={[styles.icon, selected && styles.iconSelected]}>
        <Icon size={18} color={selected ? colors.textOnBrand : colors.brandText} strokeWidth={2.25} aria-hidden />
      </View>
      <Txt variant="label" numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: fonts.bold, fontSize: 16 }}>
        {choice.label}
      </Txt>
      {selected ? <Check size={20} color={colors.brandText} strokeWidth={2.75} aria-hidden /> : null}
    </Pressable>
  );
}

/** Uma opção de criar: o ícone, o nome do espaço, a frase de para quem é e a seta de "abre outra tela". */
function CreateRow({ kind, last, onPress }: { kind: CreatableSpace; last: boolean; onPress: () => void }) {
  const Icon = CREATE_ICON[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={SPACE_TEXT.optionA11y(kind)}
      onPress={onPress}
      style={(st) => [styles.row, !last && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
      <View style={styles.icon}>
        <Icon size={18} color={colors.brandText} strokeWidth={2.25} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
          {kind === 'negocio' ? SPACE_TEXT.businessOption : SPACE_TEXT.familyOption}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {kind === 'negocio' ? SPACE_TEXT.businessHint : SPACE_TEXT.familyHint}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: space[4] },
  box: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  // O espaço escolhido: o ícone no azul cheio da marca, com o desenho branco (5,59:1), e o visto à direita.
  iconSelected: { backgroundColor: colors.brand },
  focusRing: { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
