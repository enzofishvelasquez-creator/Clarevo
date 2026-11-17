import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEGAL_VERSION, type RecordsRepository } from '@clarevo/core';
import { createClient, type AuthError as SupabaseAuthError, type SupabaseClient, type User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { AppState, Platform } from 'react-native';

import { AuthError, signInMark, type AuthService, type AuthState, type AuthUser } from './auth';
import { fetchWithTimeout, withSessionGuard } from './net-fetch';
import { SupabaseRepository } from './supabase-repository';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/** Supabase só é usado quando as variáveis públicas estão configuradas (ver docs/05_SUPABASE.md). */
export const supabaseConfigured = Boolean(url && key);

/**
 * Há uma pessoa na sessão do app (a sessão aberta, ou a guardada no aparelho quando o app abriu sem conexão)? Enquanto houver, nenhuma
 * leitura ou escrita sai só com a chave pública (lib/net-fetch.ts). Volta a falso quando a sessão termina.
 */
let sessionExpected = false;

function createSupabase(): SupabaseClient {
  // O fetch global é lido a cada chamada (como a biblioteca faz sem fetch próprio): o relatório de falhas pode envolvê-lo depois.
  const base = (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init);
  const client = createClient(url!, key!, {
    global: { fetch: withSessionGuard(fetchWithTimeout(base), { publicKey: key!, sessionExpected: () => sessionExpected }) },
    auth: {
      // Na web o cliente usa o localStorage do navegador; no celular, AsyncStorage.
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
  });
  if (Platform.OS !== 'web') {
    // Renova a sessão só com o app em primeiro plano.
    AppState.addEventListener('change', (s) => (s === 'active' ? client.auth.startAutoRefresh() : client.auth.stopAutoRefresh()));
  }
  return client;
}

function toUser(u: User): AuthUser {
  const meta = (u.user_metadata ?? {}) as { display_name?: string };
  return {
    id: u.id,
    email: u.email ?? '',
    displayName: meta.display_name?.trim() || (u.email ?? '').split('@')[0] || '',
    emailConfirmed: Boolean(u.email_confirmed_at),
  };
}

/** A chave em que o cliente guarda a sessão no aparelho (a padrão da biblioteca, `sb-<projeto>-auth-token`). */
function sessionStorageKey(client: SupabaseClient): string {
  const own = (client as unknown as { storageKey?: unknown }).storageKey;
  if (typeof own === 'string' && own) return own;
  return `sb-${new URL(url!).hostname.split('.')[0]}-auth-token`;
}

function authError(e: SupabaseAuthError | Error | null | undefined): AuthError {
  if (!e) return new AuthError('desconhecido');
  const err = e as SupabaseAuthError & { status?: number; code?: string };
  if (err.name === 'AuthRetryableFetchError' || /fetch|network/i.test(err.message)) return new AuthError('rede');
  if (err.code === 'email_not_confirmed') return new AuthError('email_nao_confirmado');
  if (err.code === 'invalid_credentials') return new AuthError('credenciais_invalidas');
  if (err.code === 'weak_password') return new AuthError('senha_fraca');
  if (err.status === 429 || err.code === 'over_email_send_rate_limit' || err.code === 'over_request_rate_limit') {
    const secs = /(\d+)\s*seconds?/i.exec(err.message)?.[1];
    return secs ? new AuthError('aguarde', Number(secs)) : new AuthError('muitas_tentativas');
  }
  if (err.code === 'otp_expired' || err.code === 'flow_state_expired' || err.code === 'bad_code_verifier') {
    return new AuthError('link_invalido');
  }
  return new AuthError('desconhecido');
}

const RECOVERY_KEY = 'clarevo.recuperacao';

/** Na web, a marca de recuperação sobrevive a recarregar a página até a nova senha ser salva. */
const webSession = {
  get: () => (Platform.OS === 'web' && typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(RECOVERY_KEY) === '1' : false),
  set: (on: boolean) => {
    if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return;
    if (on) sessionStorage.setItem(RECOVERY_KEY, '1');
    else sessionStorage.removeItem(RECOVERY_KEY);
  },
};

export class SupabaseAuth implements AuthService {
  readonly mode = 'producao' as const;
  readonly client = createSupabase();
  private recovery = webSession.get();

  constructor() {
    // Na web, o link de recuperação abre /nova-senha?code=...; a troca do código acontece ao criar o cliente.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.pathname.includes('nova-senha') && url.searchParams.has('code')) this.setRecovery(true);
    }
    // Ouvinte criado junto com o cliente, para não perder o evento de recuperação.
    this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') this.setRecovery(true);
      if (event === 'SIGNED_OUT') this.setRecovery(false);
      // Só o fim da sessão (SIGNED_OUT) tira a pessoa: o "sem sessão" inicial pode ser só falta de conexão (init).
      if (session) sessionExpected = true;
      else if (event === 'SIGNED_OUT') sessionExpected = false;
    });
  }

  private setRecovery(on: boolean) {
    this.recovery = on;
    webSession.set(on);
  }

  private redirect(path: string) {
    return Linking.createURL(path);
  }

  /**
   * A sessão ao abrir o app. Com o token vencido (cerca de uma hora sem usar) e sem conexão, a biblioteca responde "sem sessão" mas mantém a
   * sessão guardada no aparelho, esperando a conexão para renová-la. Nesse caso, e se a conferência falhar por qualquer motivo, vale a
   * pessoa da sessão guardada, marcada `offline`: o app mostra "Não foi possível carregar" com "Tentar novamente", e não a tela de boas-vindas;
   * os lembretes e o widget ficam; a biometria é pedida. A sessão só acaba de verdade quando o servidor recusa a renovação (SIGNED_OUT).
   */
  async init(): Promise<AuthState> {
    try {
      const { data, error } = await this.client.auth.getSession();
      if (data.session) {
        sessionExpected = true;
        return { user: toUser(data.session.user), recovery: this.recovery };
      }
      // Sem sessão guardada, ou a renovação recusada pelo servidor (a biblioteca já apagou a sessão).
      if (!error || authError(error).code !== 'rede') return { user: null, recovery: this.recovery };
    } catch {
      // Conferência que não terminou: tratada como falta de conexão.
    }
    const stored = await this.storedUser();
    if (stored) sessionExpected = true;
    return { user: stored, recovery: this.recovery, offline: true };
  }

  /** A pessoa da sessão guardada no aparelho pelo cliente, sem conferir com o servidor (null se não houver ou não der para ler). */
  private async storedUser(): Promise<AuthUser | null> {
    try {
      const storageKey = sessionStorageKey(this.client);
      const raw = Platform.OS === 'web' ? (globalThis.localStorage?.getItem(storageKey) ?? null) : await AsyncStorage.getItem(storageKey);
      if (!raw) return null;
      const stored = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown; user?: Partial<User> | null } | null;
      const user = stored?.user;
      if (typeof stored?.refresh_token !== 'string' || typeof stored.access_token !== 'string' || !user || typeof user.id !== 'string') return null;
      return toUser(user as User);
    } catch {
      return null;
    }
  }

  /** Quem ouve a sessão (session.tsx), para avisar o fim quando a saída neste aparelho é feita sem o servidor. */
  private listeners = new Set<(s: AuthState) => void>();

  subscribe(listener: (s: AuthState) => void) {
    this.listeners.add(listener);
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') this.setRecovery(true);
      if (event === 'SIGNED_OUT') this.setRecovery(false);
      // O estado inicial vem de init(): sem conexão, o aviso inicial da biblioteca diria "sem sessão" mesmo com a sessão guardada.
      if (event === 'INITIAL_SESSION') return;
      // Evita chamar o Supabase dentro do callback (recomendação da biblioteca): agenda a notificação.
      setTimeout(() => listener({ user: session ? toUser(session.user) : null, recovery: this.recovery }), 0);
    });
    return () => {
      this.listeners.delete(listener);
      data.subscription.unsubscribe();
    };
  }

  async signUp({ displayName, email, password }: { displayName: string; email: string; password: string }) {
    const { error } = await this.client.auth.signUp({
      email: email.trim(),
      password,
      // A versão dos termos e da política mostrada no cadastro (A1): o banco grava o aceite quando a pessoa entra pela primeira vez.
      options: { data: { display_name: displayName.trim(), terms_version: String(LEGAL_VERSION) }, emailRedirectTo: this.redirect('/confirmado') },
    });
    if (error) throw authError(error);
  }

  async signIn(email: string, password: string) {
    const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw authError(error);
    // Quem acabou de entrar não passa pela biometria ao abrir (components/device-features.tsx).
    signInMark.set();
  }

  async resendConfirmation(email: string) {
    const { error } = await this.client.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: this.redirect('/confirmado') },
    });
    if (error) throw authError(error);
  }

  async requestPasswordReset(email: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), { redirectTo: this.redirect('/nova-senha') });
    // Resposta neutra: só limite de envio e falha de rede são informados.
    if (error) {
      const e = authError(error);
      if (e.code === 'aguarde' || e.code === 'muitas_tentativas' || e.code === 'rede') throw e;
    }
  }

  async updatePassword(password: string) {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw authError(error);
    // A marca de recuperação só sai com o encerramento da sessão (feito em seguida pela tela),
    // para a pessoa não entrar no app com a sessão do link.
  }

  async signOut(scope: 'local' | 'global' = 'local') {
    this.setRecovery(false);
    // 'local': encerra a sessão neste aparelho e apaga o que ela guardou aqui; 'global': também nos outros aparelhos.
    const { error } = await this.client.auth.signOut({ scope });
    if (!error) return;
    // Nos outros aparelhos depende do servidor: a tela diz que não foi possível.
    if (scope === 'global') throw authError(error);
    // Neste aparelho, sair não depende do servidor. Sem conexão (token vencido), a biblioteca devolve o erro da renovação sem apagar a sessão
    // guardada nem avisar o fim: apagamos aqui e avisamos quem ouve, para a pessoa sair de verdade (revisão independente, 17/11/2026).
    await this.forgetStoredSession();
  }

  /** Apaga a sessão guardada pelo cliente neste aparelho e avisa os ouvintes que a sessão terminou. */
  private async forgetStoredSession() {
    const key = sessionStorageKey(this.client);
    const keys = [key, `${key}-user`, `${key}-code-verifier`];
    try {
      if (Platform.OS === 'web') for (const k of keys) globalThis.localStorage?.removeItem(k);
      else await AsyncStorage.multiRemove(keys);
    } catch {
      // Sem armazenamento: o fim avisado abaixo vale enquanto o app estiver aberto.
    }
    sessionExpected = false;
    for (const listener of this.listeners) setTimeout(() => listener({ user: null, recovery: this.recovery }), 0);
  }

  async handleLink(link: string) {
    const parsed = Linking.parse(link.replace('#', '?'));
    const params = (parsed.queryParams ?? {}) as Record<string, string | undefined>;
    const isRecovery = Boolean(parsed.path?.includes('nova-senha'));
    // Link de confirmação aberto em outro aparelho: o e-mail pode já estar confirmado,
    // então a pessoa só precisa entrar. Só o link de recuperação inválido vira aviso.
    if (params.error || params.error_code) return isRecovery ? 'invalido' : null;
    if (!params.code) return null;
    if (Platform.OS === 'web') return 'ok'; // detectSessionInUrl já troca o código
    if (isRecovery) this.setRecovery(true);
    const { error } = await this.client.auth.exchangeCodeForSession(params.code);
    if (error) this.setRecovery(false);
    // A sessão aberta pelo link do e-mail é uma entrada na conta neste uso do app.
    else signInMark.set();
    return error ? (isRecovery ? 'invalido' : null) : 'ok';
  }

  repositoryFor(user: AuthUser): RecordsRepository {
    return new SupabaseRepository(this.client, user);
  }
}
