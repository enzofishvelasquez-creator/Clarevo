import { DEMO_TODAY, todayIn, type IsoDate, type RecordsRepository } from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { pendingCredentials, type AuthService, type AuthState } from '@/lib/auth';
import { DemoAuth } from '@/lib/demo-auth';
import { SupabaseAuth, supabaseConfigured } from '@/lib/supabase';

const auth: AuthService = supabaseConfigured ? new SupabaseAuth() : new DemoAuth();

interface SessionValue extends AuthState {
  ready: boolean;
  auth: AuthService;
  repo: RecordsRepository | null;
  /** Dia atual da pessoa (data civil). Demonstração fixa 07/10/2026. */
  today: IsoDate;
  /** Link de e-mail inválido ou expirado aberto no app. */
  linkProblem: boolean;
  clearLinkProblem: () => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ user: null, recovery: false });
  const [ready, setReady] = useState(false);
  const [linkProblem, setLinkProblem] = useState(false);

  useEffect(() => {
    let alive = true;
    auth.init().then((s) => {
      if (alive) {
        setState(s);
        setReady(true);
      }
    });
    const unsubscribe = auth.subscribe((s) => {
      setState((prev) => {
        // Outra pessoa ou sessão encerrada: nada do cache anterior pode aparecer.
        if (prev.user?.id !== s.user?.id) queryClient.clear();
        return s;
      });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [queryClient]);

  // Links de confirmação e recuperação abertos a partir do e-mail.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      auth.handleLink(url).then((r) => r === 'invalido' && setLinkProblem(true));
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  const signOut = useCallback(async () => {
    pendingCredentials.clear();
    await auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const repo = useMemo(() => (state.user ? auth.repositoryFor(state.user) : null), [state.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<SessionValue>(
    () => ({
      ...state,
      ready,
      auth,
      repo,
      today: auth.mode === 'demo' ? DEMO_TODAY : todayIn('America/Sao_Paulo'),
      linkProblem,
      clearLinkProblem: () => setLinkProblem(false),
      signOut,
    }),
    [state, ready, repo, linkProblem, signOut],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const v = use(SessionContext);
  if (!v) throw new Error('useSession fora do SessionProvider');
  return v;
}

/** Repositório da pessoa autenticada (as telas internas só existem com sessão). */
export function useRepo(): RecordsRepository {
  const { repo } = useSession();
  if (!repo) throw new Error('Sem sessão');
  return repo;
}
