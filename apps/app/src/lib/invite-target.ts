/**
 * Convite pendente (D-055): quem abre o link sem estar na conta vai entrar ou criar a conta e volta ao convite. O código fica só na
 * memória do app (nunca no aparelho, nunca no servidor) e é retomado quando o espaço da pessoa está pronto. Sai da memória ao
 * sair da conta.
 */
let pending: string | null = null;

export const pendingInvite = {
  set(code: string) {
    pending = code;
  },
  /** Devolve o código guardado uma única vez. */
  take(): string | null {
    const code = pending;
    pending = null;
    return code;
  },
  has(): boolean {
    return pending !== null;
  },
  clear() {
    pending = null;
  },
};
