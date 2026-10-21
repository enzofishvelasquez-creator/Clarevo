import type { WidgetWrite } from '@/lib/widget-bridge';

export type { WidgetWrite };

/**
 * Ponte do Android: grava o texto do snapshot no AsyncStorage e pede o desenho dos dois widgets (`src/widget-native/android.tsx`). O
 * módulo é carregado na primeira necessidade e dentro de um try: sem ele (Expo Go, build sem `CLAREVO_WIDGET=1`, em que o Metro entrega um
 * módulo vazio) a ponte vira "sem widget" e nada quebra.
 */
interface AndroidWidgets {
  writeAndroidWidgets(json: string): Promise<void>;
}

let loaded: AndroidWidgets | null | undefined;

function widgets(): AndroidWidgets | null {
  if (loaded === undefined) {
    try {
      const mod = require('../widget-native/android') as Partial<AndroidWidgets>;
      loaded = typeof mod.writeAndroidWidgets === 'function' ? (mod as AndroidWidgets) : null;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

export function widgetAvailable(): boolean {
  return widgets() !== null;
}

export async function writeWidget(plan: WidgetWrite, _now: Date): Promise<void> {
  const target = widgets();
  if (!target) return;
  await target.writeAndroidWidgets(plan.json);
}
