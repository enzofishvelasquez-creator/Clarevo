import { useMemo, useState, type ReactNode } from 'react';

import { currentMonthOf, ViewContext, type SpaceKind, type ViewState } from '@/state/data';
import { useSession } from '@/state/session';

export function ViewProvider({ children }: { children: ReactNode }) {
  const { today } = useSession();
  const currentMonth = currentMonthOf(today);
  const [space, setSpace] = useState<SpaceKind>('pessoal');
  const [month, setMonth] = useState(currentMonth);
  const value = useMemo<ViewState>(() => ({ space, setSpace, month, setMonth, currentMonth }), [space, month, currentMonth]);
  return <ViewContext value={value}>{children}</ViewContext>;
}
