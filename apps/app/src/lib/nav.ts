/**
 * Destino a retomar depois de entrar (sessão expirada ou link direto para uma tela interna).
 * Guardado só em memória.
 */
let destination: string | null = null;
let manualSignOut = false;

export const afterLogin = {
  set(path: string | null) {
    destination = path && path !== '/' && !path.startsWith('/carregando') ? path : null;
  },
  take(): string | null {
    const d = destination;
    destination = null;
    return d;
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
