import { DEFAULT_CATEGORY_VIEW, type CategoryView } from '@clarevo/core';
import { useEffect } from 'react';

import { loadPrefs, updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { useSession } from '@/state/session';

/**
 * "Barras | Bolhas" em Análises › Categorias (D-059): a escolha fica só neste aparelho, por pessoa (preferências locais de
 * `lib/device-prefs.ts`), sem banco. Barras de início. `ready` é falso até a leitura do aparelho terminar, e a tela só desenha depois,
 * para não piscar na forma errada. Na demonstração fica só em memória, como as outras preferências.
 */
export function useCategoryViewPref() {
  const { user, auth } = useSession();
  const userId = user?.id;
  const persist = auth.mode !== 'demo';
  const prefs = useDevicePrefs(userId);
  useEffect(() => {
    if (userId) loadPrefs(userId, persist);
  }, [userId, persist]);
  return {
    ready: prefs !== undefined,
    view: prefs?.categoryView ?? DEFAULT_CATEGORY_VIEW,
    setView: (view: CategoryView) => {
      if (userId) updatePrefs(userId, { categoryView: view }, persist);
    },
  };
}
