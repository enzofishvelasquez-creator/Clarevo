import { useEffect } from 'react';

import { warmUpStore } from '@/lib/store-purchases';
import { useAccess } from '@/state/access';
import { useSession } from '@/state/session';

/**
 * Assinatura pelas lojas (D-090), no iPhone e no Android: ao abrir o app (e ao trocar de conta), configura o SDK do RevenueCat para
 * quem já usou a loja, para a compra que terminou fora da tela chegar ao RevenueCat (`warmUpStore`). Não desenha nada. Na
 * demonstração e na web, nada.
 */
export function StoreWarmup() {
  const { user, auth } = useSession();
  const access = useAccess().data;
  const personId = auth.mode === 'demo' ? null : (user?.id ?? null);
  const storeAccess = access?.provider === 'apple' || access?.provider === 'google';
  useEffect(() => {
    if (personId) void warmUpStore(personId, storeAccess);
  }, [personId, storeAccess]);
  return null;
}
