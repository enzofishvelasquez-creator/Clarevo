import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { currentMonthOf, ViewContext, type SpaceKind, type ViewState } from '@/state/data';
import { useSession } from '@/state/session';

export function ViewProvider({ children }: { children: ReactNode }) {
  const { today, user } = useSession();
  const currentMonth = currentMonthOf(today);
  const [space, setSpace] = useState<SpaceKind>('pessoal');
  const [month, setMonthState] = useState(currentMonth);
  const [monthDirection, setDirection] = useState<1 | -1>(1);
  const setMonth = useCallback((m: string) => {
    setMonthState((prev) => {
      setDirection(m >= prev ? 1 : -1);
      return m;
    });
  }, []);

  // Cada pessoa começa em Pessoal, no mês atual (nada da sessão anterior permanece).
  useEffect(() => {
    setSpace('pessoal');
    setMonthState(currentMonthOf(today));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo<ViewState>(
    () => ({ space, setSpace, month, setMonth, monthDirection, currentMonth }),
    [space, month, setMonth, monthDirection, currentMonth],
  );
  return <ViewContext value={value}>{children}</ViewContext>;
}
