import { dismissBudgetNotice, isBudgetNoticeDismissed, type IsoMonth } from '@clarevo/core';
import { useEffect } from 'react';

import { loadPrefs, updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { useSession } from '@/state/session';

/**
 * "Dispensar aviso" no card do orçamento (D-054, CL-10): o aviso de 80% some por categoria e mês, só neste aparelho (preferência do
 * aparelho, por pessoa; nada vai para o servidor). Volta no mês seguinte, porque a chave guarda o mês. `ready` é falso até a leitura
 * do aparelho terminar, e o aviso só aparece depois, para não piscar. Na demonstração fica só em memória.
 */
export function useBudgetNotices() {
  const { user, auth, today } = useSession();
  const userId = user?.id;
  const persist = auth.mode !== 'demo';
  const prefs = useDevicePrefs(userId);
  useEffect(() => {
    if (userId) loadPrefs(userId, persist);
  }, [userId, persist]);
  const dismissed = prefs?.budgetNoticesDismissed ?? [];
  return {
    ready: prefs !== undefined,
    isDismissed: (month: IsoMonth, category: string) => isBudgetNoticeDismissed(dismissed, month, category),
    dismiss: (month: IsoMonth, category: string) => {
      if (userId && prefs) updatePrefs(userId, { budgetNoticesDismissed: dismissBudgetNotice(prefs.budgetNoticesDismissed, month, category, today) }, persist);
    },
  };
}
