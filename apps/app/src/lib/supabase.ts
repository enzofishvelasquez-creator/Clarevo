import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecordsRepository } from '@clarevo/core';
import { createClient, type AuthError as SupabaseAuthError, type SupabaseClient, type User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { AppState, Platform } from 'react-native';

import { AuthError, type AuthService, type AuthState, type AuthUser } from './auth';
import { SupabaseRepository } from './supabase-repository';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/** Supabase só é usado quando as variáveis públicas estão configuradas (ver docs/05_SUPABASE.md). */
export const supabaseConfigured = Boolean(url && key);

function createSupabase(): SupabaseClient {
  const client = createClient(url!, key!, {
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
    this.client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') this.setRecovery(true);
      if (event === 'SIGNED_OUT') this.setRecovery(false);
    });
  }

  private setRecovery(on: boolean) {
    this.recovery = on;
    webSession.set(on);
  }

  private redirect(path: string) {
    return Linking.createURL(path);
  }

  async init(): Promise<AuthState> {
    const { data } = await this.client.auth.getSession();
    return { user: data.session ? toUser(data.session.user) : null, recovery: this.recovery };
  }

  subscribe(listener: (s: AuthState) => void) {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') this.setRecovery(true);
      if (event === 'SIGNED_OUT') this.setRecovery(false);
      // Evita chamar o Supabase dentro do callback (recomendação da biblioteca): agenda a notificação.
      setTimeout(() => listener({ user: session ? toUser(session.user) : null, recovery: this.recovery }), 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async signUp({ displayName, email, password }: { displayName: string; email: string; password: string }) {
    const { error } = await this.client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() }, emailRedirectTo: this.redirect('/confirmado') },
    });
    if (error) throw authError(error);
  }

  async signIn(email: string, password: string) {
    const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw authError(error);
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

  async signOut() {
    this.setRecovery(false);
    // 'local': encerra a sessão neste aparelho e apaga o que ela guardou aqui.
    await this.client.auth.signOut({ scope: 'local' });
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
    return error ? (isRecovery ? 'invalido' : null) : 'ok';
  }

  repositoryFor(user: AuthUser): RecordsRepository {
    return new SupabaseRepository(this.client, user);
  }
}
