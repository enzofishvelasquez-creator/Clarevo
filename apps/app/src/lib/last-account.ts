import { getPrefs, updatePrefs } from '@/lib/device-prefs';
import { useSession } from '@/state/session';

/**
 * A última conta de origem usada neste aparelho (D-043), só para abrir os formulários já nela, como a última forma de pagamento.
 * Nada vai para o servidor. As preferências do aparelho são lidas quando o app abre, então o valor já está em memória quando um
 * formulário se abre; `chooseAccountId` (core) ignora uma conta que já não está ativa.
 */
export function useLastAccount() {
  const { user, auth } = useSession();
  const userId = user?.id;
  const persist = auth.mode !== 'demo';
  return {
    last: userId ? (getPrefs(userId)?.lastAccount ?? null) : null,
    remember: (accountId: string | null | undefined) => {
      if (userId && accountId) updatePrefs(userId, { lastAccount: accountId }, persist);
    },
  };
}
