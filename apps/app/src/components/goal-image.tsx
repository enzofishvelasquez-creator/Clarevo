import { goalImageOf, goalImageView, suggestGoalImage, GOAL_IMAGE_TEXT, type Goal, type GoalImage, type GoalImageKey } from '@clarevo/core';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react-native';
import {
  Baby,
  Car,
  GraduationCap,
  Heart,
  HeartPulse,
  House,
  Mountain,
  PawPrint,
  PiggyBank,
  Plane,
  Smartphone,
  Sunrise,
} from 'lucide-react-native';
import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { GOAL_IMAGE_ASSETS } from '@/lib/goal-image-assets';
import { useRepo } from '@/state/session';
import { colors, radius } from '@/theme/tokens';

/** Ícone de cada sugestão: aparece sobre a cor da marca enquanto a foto sugerida não existe no app (ou não carrega). */
export const GOAL_IMAGE_ICONS: Record<GoalImageKey, LucideIcon> = {
  viagem: Plane,
  reserva: PiggyBank,
  carro: Car,
  casa: House,
  estudos: GraduationCap,
  casamento: Heart,
  bebe: Baby,
  tecnologia: Smartphone,
  saude: HeartPulse,
  aposentadoria: Sunrise,
  pet: PawPrint,
  objetivo: Mountain,
};

/** A foto da pessoa (goal_photo), lida uma vez por versão. */
function useGoalPhoto(goalId: string, version: number, enabled: boolean) {
  const repo = useRepo();
  return useQuery({
    queryKey: ['goals', 'photo', goalId, version],
    queryFn: () => repo.getGoalPhoto(goalId),
    enabled,
    staleTime: Infinity,
  });
}

/** Uma sugestão: a foto do app, se existe, ou o ícone sobre a cor da marca. */
export function SuggestedImage({ imageKey, style, label }: { imageKey: GoalImageKey; style?: StyleProp<ViewStyle>; label?: string | null }) {
  const source: ImageSourcePropType | undefined = GOAL_IMAGE_ASSETS[imageKey];
  const Icon = GOAL_IMAGE_ICONS[imageKey];
  const a11y = label === null ? { accessible: false, 'aria-hidden': true } : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label ?? goalImageOf(imageKey).alt };
  return (
    <View style={[{ backgroundColor: colors.brand, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]} {...a11y}>
      {source ? (
        <Image source={source} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : (
        <Icon size={36} color={colors.textOnBrand} strokeWidth={1.75} aria-hidden />
      )}
    </View>
  );
}

/**
 * Imagem de uma meta (D-077): a foto da pessoa, a sugestão escolhida ou a automática (pelo nome e pelo tipo). Na lista, decorativa
 * (o cartão já diz o nome); na tela da meta, com texto alternativo.
 */
export function GoalImageView({
  goal,
  image,
  height,
  decorative,
  style,
}: {
  goal: Pick<Goal, 'id' | 'name' | 'goalType'>;
  image: GoalImage | null | undefined;
  height: number;
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const view = goalImageView(goal, image);
  const photo = useGoalPhoto(goal.id, view.kind === 'foto' ? view.version : 0, view.kind === 'foto');
  const box: StyleProp<ViewStyle> = [{ height, width: '100%', borderRadius: radius.md, overflow: 'hidden' }, style];
  if (view.kind === 'foto' && photo.data) {
    const a11y = decorative
      ? { accessible: false, 'aria-hidden': true }
      : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: GOAL_IMAGE_TEXT.photoAlt(goal.name) };
    return (
      <View style={box} {...a11y}>
        <Image source={{ uri: `data:${photo.data.mime};base64,${photo.data.base64}` }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }
  // Foto carregando ou que não veio: a sugestão automática no lugar.
  const key = view.kind === 'sugestao' ? view.key : suggestGoalImage(goal.name, goal.goalType);
  return <SuggestedImage imageKey={key} style={box} label={decorative ? null : undefined} />;
}
