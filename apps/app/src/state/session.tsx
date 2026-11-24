import { DEMO_TODAY, deviceTimeZone, todayIn, type IsoDate, type RecordsRepository } from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Text, View } from 'react-native';

import { pendingCredentials, type AuthService, type AuthState } from '@/lib/auth';
import { DemoAuth } from '@/lib/demo-auth';
import { forgetDevice } from '@/lib/device-forget';
import { comprovanteHandoff } from '@/lib/comprovante-handoff';
import { evolutionSelection } from '@/lib/evolution-memory';
import { pendingBenefit, pendingBusinessInvite, pendingInvite } from '@/lib/invite-target';
import { clearNotePrefsMemory } from '@/lib/note-prefs';
import { pendingAttempts } from '@/lib/pending-attempts';
import { receiptLinks } from '@/lib/receipt-link';
import { SupabaseAuth, supabaseConfigured } from '@/lib/supabase';
import { colors } from '@/theme/tokens';

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
  /**
   * Sair da conta. Por padrão apaga do aparelho as preferências e memórias da pessoa (A9). `keepDevice`: a saída que o app pede por conta
   * própria (depois de trocar a senha), em que a pessoa entra de novo em seguida e as preferências ficam.
   */
  signOut: (scope?: 'local' | 'global', options?: { keepDevice?: boolean }) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * O link que abriu o app é lido uma vez por abertura, por quem o trata (a sessão e o layout). Fica fora dos componentes de propósito (o React
 * Compiler trataria uma variável do módulo como constante dentro de um efeito).
 */
const initialLinkTaken = new Set<string>();
export function takeInitialLink(who: 'sessao' | 'layout'): boolean {
  if (initialLinkTaken.has(who)) return false;
  initialLinkTaken.add(who);
  return true;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  if (!auth) return <ConfigMissing />;
  return <SessionProviderInner auth={auth}>{children}</SessionProviderInner>;
}

function ConfigMissing() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.surface }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Configuração incompleta</Text>
      <Text style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginTop: 8 }}>
        Este aplicativo foi gerado sem a ligação com o servidor. Atualize o app ou fale com o suporte.
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

/**
 * Nada da nota lida (endereços da Sefaz, memória das lojas), do comprovante lido (D-051), das tentativas de escrita com
 * resultado incerto (CL-03 e CL-19) nem dos meses tirados da comparação em Evolução (D-057) sobrevive à saída da conta nem passa
 * para outra pessoa.
 */
function clearReceiptMemory() {
  receiptLinks.clear();
  comprovanteHandoff.clear();
  clearNotePrefsMemory();
  pendingAttempts.clear();
  evolutionSelection.clear();
}

function SessionProviderInner({ auth, children }: { auth: AuthService; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ user: null, recovery: false });
  const [ready, setReady] = useState(false);
  const [linkProblem, setLinkProblem] = useState(false);
  const today = useToday(auth.mode);

  useEffect(() => {
    let alive = true;
    auth
      .init()
      // Uma conferência que falhou é tratada como falta de conexão (lib/auth.ts, `offline`): o app segue sem apagar nada do aparelho.
      .catch((): AuthState => ({ user: null, recovery: false, offline: true }))
      .then((s) => {
        if (alive) {
          setState(s);
          setReady(true);
        }
      });
    const unsubscribe = auth.subscribe((s) => {
      setState((prev) => {
        // Outra pessoa ou sessão encerrada: nada do cache anterior pode aparecer.
        if (prev.user?.id !== s.user?.id) {
          queryClient.clear();
          clearReceiptMemory();
        }
        return s;
      });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [queryClient, auth]);

  // Links de confirmação e recuperação abertos a partir do e-mail. O link que abriu o app é tratado uma vez por abertura: ao desenhar o
  // layout de novo (a tela de erro, "Tentar de novo"), trocar o mesmo código outra vez falharia e desfaria a recuperação de senha.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      auth.handleLink(url).then((r) => r === 'invalido' && setLinkProblem(true));
    };
    if (takeInitialLink('sessao')) Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [auth]);

  const signOut = useCallback(async (scope: 'local' | 'global' = 'local', options?: { keepDevice?: boolean }) => {
    pendingCredentials.clear();
    // O convite que esperava a entrada não passa para outra pessoa (D-055).
    pendingInvite.clear();
    pendingBusinessInvite.clear();
    pendingBenefit.clear();
    // Sair da conta apaga do aparelho as preferências e memórias da pessoa e cancela os lembretes (A9, aprovada em 04/11/2026), como ao
    // excluir a conta. A sessão que termina sozinha (por tempo) não passa por aqui, e a saída depois de trocar a senha pede para manter:
    // o que está guardado fica para a mesma pessoa entrar de novo.
    const userId = state.user?.id;
    // Primeiro sair (a saída nos outros aparelhos pode falhar e a tela avisa); só depois esquecer o aparelho, para uma saída que não
    // aconteceu nunca apagar a trava da biometria nem os lembretes de quem continua na conta.
    await auth.signOut(scope);
    if (userId && !options?.keepDevice) await forgetDevice(userId);
    queryClient.clear();
    clearReceiptMemory();
  }, [queryClient, auth, state.user]);

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
