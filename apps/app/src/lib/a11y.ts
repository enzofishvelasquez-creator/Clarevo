import { AccessibilityInfo, Platform } from 'react-native';

import { maskMoneyLabel, valuesHidden } from '@/lib/privacy';

/**
 * O iOS não tem região viva (accessibilityLiveRegion é só do Android, e aria-live é da web): lá o texto que aparece
 * sozinho na tela é anunciado ao VoiceOver.
 * - delay: deixa o leitor terminar de mover o foco antes (um diálogo que fecha), para o anúncio não ser cortado;
 * - queue: espera o VoiceOver terminar o que está lendo (o campo que acabou de receber o foco) em vez de interromper.
 * Com "Ocultar valores" (lib/privacy.ts), os valores em reais do texto saem como "valor oculto".
 */
export function announceOnIOS(text: string, { delay = 0, queue = false }: { delay?: number; queue?: boolean } = {}) {
  if (Platform.OS !== 'ios' || !text) return;
  const spoken = maskMoneyLabel(text, valuesHidden());
  const say = () => AccessibilityInfo.announceForAccessibilityWithOptions(spoken, { queue });
  if (delay > 0) setTimeout(say, delay);
  else say();
}
