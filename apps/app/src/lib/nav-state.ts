import { useNavigationContainerRef } from 'expo-router';
import { useEffect, useState } from 'react';

/** O estado do roteador, só com o que a barra precisa ler. */
export type NavState = { routes?: readonly { name: string; state?: NavState }[]; routeNames?: readonly string[]; index?: number };

/**
 * A tela de agora foi aberta por cima da Conta (a Conta está mais abaixo na pilha das telas que têm as abas)? Assim, uma tela aberta da
 * Conta, como Seu negócio ou Quem vê estes dados, também fica sem aba marcada, na barra de baixo e na barra lateral do computador.
 */
export function contaBelow(state: NavState | undefined): boolean {
  // A pilha das telas é a que tem as abas; o roteador guarda a pilha dentro de uma rota de fora.
  let s = state;
  for (let depth = 0; s && depth < 4 && !(s.routeNames ?? s.routes?.map((r) => r.name) ?? []).includes('(tabs)'); depth++) s = s.routes?.[s.index ?? 0]?.state;
  if (!s?.routes) return false;
  return s.routes.slice(0, s.index ?? 0).some((r) => r.name === 'conta' || r.name.startsWith('conta/'));
}

/**
 * A pilha de telas de agora. Pelo aviso de troca do roteador, não lida ao desenhar: na hora em que o endereço muda, o estado guardado
 * ainda é o de antes (voltar da Conta para uma tela de baixo deixaria a Conta marcada).
 */
export function useNavState(): NavState | undefined {
  const nav = useNavigationContainerRef();
  const [state, setState] = useState<NavState | undefined>(() => (nav.isReady() ? (nav.getRootState() as NavState) : undefined));
  useEffect(() => nav.addListener('state', (e) => setState(e.data.state as NavState | undefined)), [nav]);
  return state;
}
