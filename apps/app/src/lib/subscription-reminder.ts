import { subscriptionSnoozeUntil } from '@clarevo/core';
import { useEffect } from 'react';

import { loadPrefs, updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { useSession } from '@/state/session';

/**
 * "Agora não" no aviso de assinaturas (D-046): esconde o aviso por 30 dias, só neste aparelho (preferência do aparelho, por
 * pessoa; nada vai para o servidor). `ready` é falso até a leitura do aparelho terminar, e o aviso só aparece depois, para não
 * piscar nem ser gravado por cima da escolha de antes. Na demonstração fica só em memória.
 */
export function useSubscriptionSnooze() {
  const { user, auth, today } = useSession();
  const userId = user?.id;
  const persist = auth.mode !== 'demo';
  const prefs = useDevicePrefs(userId);
  useEffect(() => {
    if (userId) loadPrefs(userId, persist);
  }, [userId, persist]);
  return {
    ready: prefs !== undefined,
    snoozedUntil: prefs?.subscriptionSnoozedUntil ?? null,
    snooze: () => {
      if (userId && prefs) updatePrefs(userId, { subscriptionSnoozedUntil: subscriptionSnoozeUntil(today) }, persist);
    },
  };
}
