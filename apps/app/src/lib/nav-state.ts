import type { NavState } from '@clarevo/core';
import { useNavigationContainerRef } from 'expo-router';
import { useEffect, useState } from 'react';

export { contaBelow, type NavState } from '@clarevo/core';

/**
 * A pilha de telas de agora, para `contaBelow` (core/navigation.ts). Pelo aviso de troca do roteador, não lida ao desenhar: na hora em
 * que o endereço muda, o estado guardado ainda é o de antes (voltar da Conta para uma tela de baixo deixaria a Conta marcada).
 */
export function useNavState(): NavState | undefined {
  const nav = useNavigationContainerRef();
  const [state, setState] = useState<NavState | undefined>(() => (nav.isReady() ? (nav.getRootState() as NavState) : undefined));
  useEffect(() => nav.addListener('state', (e) => setState(e.data.state as NavState | undefined)), [nav]);
  return state;
}
