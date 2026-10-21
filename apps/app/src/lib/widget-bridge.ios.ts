import { nextLocalMidnight, type WidgetSnapshot } from '@clarevo/core';

import type { WidgetWrite } from '@/lib/widget-bridge';

export type { WidgetWrite };

/**
 * Ponte do iOS: `expo-widgets` guarda a linha do tempo no App Group e a extensão WidgetKit a desenha (`src/widget-native/ios.tsx`).
 * O módulo é carregado na primeira necessidade e dentro de um try: sem ele (Expo Go, build sem `CLAREVO_WIDGET=1`, em que o Metro entrega
 * um módulo vazio) a ponte vira "sem widget" e nada quebra.
 */
interface IosWidget {
  updateTimeline(entries: { date: Date; props: WidgetSnapshot }[]): void;
}

let loaded: IosWidget | null | undefined;

function widget(): IosWidget | null {
  if (loaded === undefined) {
    try {
      const mod = require('../widget-native/ios') as { default?: IosWidget };
      loaded = mod.default && typeof mod.default.updateTimeline === 'function' ? mod.default : null;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

export function widgetAvailable(): boolean {
  return widget() !== null;
}

/**
 * Duas entradas na linha do tempo: o que vale hoje, a partir de agora, e o estado sem dados, a partir da meia-noite do aparelho. O widget
 * não troca de dia sozinho; é a segunda entrada que faz "Abra o Clarevo para atualizar" aparecer no dia seguinte.
 */
export async function writeWidget(plan: WidgetWrite, now: Date): Promise<void> {
  const target = widget();
  if (!target) return;
  target.updateTimeline([
    { date: now, props: plan.snapshot },
    { date: nextLocalMidnight(now), props: plan.afterMidnight },
  ]);
}
