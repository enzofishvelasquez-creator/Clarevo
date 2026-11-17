import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { evolutionSelection } from '@/lib/evolution-memory';
import { currentMonthOf, ViewContext, type SpaceKind, type ViewState } from '@/state/data';
import { useBusiness } from '@/state/business';
import { useFamily } from '@/state/family';
import { useSession } from '@/state/session';

export function ViewProvider({ children }: { children: ReactNode }) {
  const { today, user } = useSession();
  const currentMonth = currentMonthOf(today);
  // O contexto escolhido ("Pessoal | Família | negócio"). A Família e o negócio (D-113) só valem enquanto a pessoa tem um: sair, ser
  // removida ou encerrar devolve ao Pessoal sem mais nada a fazer, e escolher um espaço que a pessoa não tem não muda a tela.
  const [wanted, setSpace] = useState<SpaceKind>('pessoal');
  const family = useFamily();
  const business = useBusiness();
  const hasFamily = Boolean(family.data);
  const hasBusiness = Boolean(business.data);
  const space: SpaceKind = wanted === 'familia' && hasFamily ? 'familia' : wanted === 'negocio' && hasBusiness ? 'negocio' : 'pessoal';
  const [month, setMonthState] = useState(currentMonth);
  const [monthDirection, setDirection] = useState<1 | -1>(1);
  const setMonth = useCallback((m: string) => {
    setMonthState((prev) => {
      setDirection(m >= prev ? 1 : -1);
      return m;
    });
  }, []);

  // Saiu, foi removida ou a Família acabou: o pedido de ver a Família também acaba (entrar em outra não pula direto para ela).
  const familyGone = family.isSuccess && !family.data;
  useEffect(() => {
    if (familyGone) setSpace((s) => (s === 'familia' ? 'pessoal' : s));
  }, [familyGone]);
  // O negócio encerrado: o pedido de ver o negócio também acaba.
  const businessGone = business.isSuccess && !business.data;
  useEffect(() => {
    if (businessGone) setSpace((s) => (s === 'negocio' ? 'pessoal' : s));
  }, [businessGone]);

  // Os meses tirados da comparação em Evolução (D-057) valem para o contexto em que foram tirados: trocar de contexto os esquece.
  useEffect(() => {
    evolutionSelection.clear();
  }, [space]);

  // Cada pessoa começa em Pessoal, no mês atual (nada da sessão anterior permanece: o contexto escolhido é limpo ao sair da conta).
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
