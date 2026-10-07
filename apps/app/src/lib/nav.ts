/**
 * Destino a retomar depois que a sessão expira e a mesma pessoa entra de novo.
 * Guardado só em memória.
 */
let destination: { path: string; userId: string } | null = null;
let manualSignOut = false;

export const afterLogin = {
  set(path: string | null, userId: string) {
    destination = path && path !== '/' && !path.startsWith('/carregando') ? { path, userId } : null;
  },
  /** Há um destino pendente (para decidir entre Entrar e Boas-vindas)? */
  pending(): boolean {
    return destination !== null;
  },
  take(userId: string): string | null {
    const d = destination;
    destination = null;
    return d && d.userId === userId ? d.path : null;
  },
};

export const signOutIntent = {
  mark() {
    manualSignOut = true;
  },
  consume(): boolean {
    const m = manualSignOut;
    manualSignOut = false;
    return m;
  },
};
