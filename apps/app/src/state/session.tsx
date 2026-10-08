import { DEMO_TODAY, deviceTimeZone, todayIn, type IsoDate, type RecordsRepository } from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Text, View } from 'react-native';

import { pendingCredentials, type AuthService, type AuthState } from '@/lib/auth';
import { DemoAuth } from '@/lib/demo-auth';
import { SupabaseAuth, supabaseConfigured } from '@/lib/supabase';

/**
 * Demonstração pedida explicitamente (EXPO_PUBLIC_MODO_DEMO=1, como em `npm run export:demo`) sempre usa dados
 * fictícios, mesmo com o Supabase configurado. Sem Supabase configurado, a demonstração só roda em
 * desenvolvimento. Um build de produção sem configuração não vira demonstração em silêncio.
 */
const demoRequested = process.env.EXPO_PUBLIC_MODO_DEMO === '1';
const auth: AuthService | null = demoRequested
  ? new DemoAuth()
  : supabaseConfigured
    ? new SupabaseAuth()
    : __DEV__
      ? new DemoAuth()
      : null;

interface SessionValue extends AuthState {
  ready: boolean;
  auth: AuthService;
  repo: RecordsRepository | null;
  /** Dia atual da pessoa (data civil). Demonstração fixa 07/10/2026. */
  today: IsoDate;
  /** Link de e-mail inválido ou expirado aberto no app. */
  linkProblem: boolean;
  clearLinkProblem: () => void;
  signOut: (scope?: 'local' | 'global') => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  if (!auth) return <ConfigMissing />;
  return <SessionProviderInner auth={auth}>{children}</SessionProviderInner>;
}

function ConfigMissing() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#17223B', textAlign: 'center' }}>Configuração incompleta</Text>
      <Text style={{ fontSize: 16, color: '#4B5873', textAlign: 'center', marginTop: 8 }}>
        Este aplicativo foi gerado sem a ligação com o servidor. Consulte docs/05_SUPABASE.md.
      </Text>
    </View>
  );
}

/** Dia atual no fuso do aparelho, recalculado a cada minuto e ao voltar para o app. */
function useToday(mode: AuthService['mode']): IsoDate {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return mode === 'demo' ? DEMO_TODAY : todayIn(deviceTimeZone(), new Date(now));
}

function SessionProviderInner({ auth, children }: { auth: AuthService; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ user: null, recovery: false });
  const [ready, setReady] = useState(false);
  const [linkProblem, setLinkProblem] = useState(false);
  const today = useToday(auth.mode);

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
  }, [queryClient, auth]);

  // Links de confirmação e recuperação abertos a partir do e-mail.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      auth.handleLink(url).then((r) => r === 'invalido' && setLinkProblem(true));
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [auth]);

  const signOut = useCallback(async (scope: 'local' | 'global' = 'local') => {
    pendingCredentials.clear();
    await auth.signOut(scope);
    queryClient.clear();
  }, [queryClient, auth]);

  const repo = useMemo(() => (state.user ? auth.repositoryFor(state.user) : null), [state.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<SessionValue>(
    () => ({
      ...state,
      ready,
      auth,
      repo,
      today,
      linkProblem,
      clearLinkProblem: () => setLinkProblem(false),
      signOut,
    }),
    [state, ready, repo, linkProblem, signOut, today, auth],
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
