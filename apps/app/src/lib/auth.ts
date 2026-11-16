import type { RecordsRepository } from '@clarevo/core';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailConfirmed: boolean;
}

export type AuthMode = 'demo' | 'producao';

export type AuthErrorCode =
  | 'credenciais_invalidas'
  | 'email_nao_confirmado'
  | 'senha_fraca'
  | 'aguarde'
  | 'muitas_tentativas'
  | 'link_invalido'
  | 'sem_sessao'
  | 'rede'
  | 'desconhecido';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface AuthState {
  user: AuthUser | null;
  /** Sessão aberta por link de recuperação: a pessoa precisa definir a nova senha. */
  recovery: boolean;
  /**
   * Sem conexão ao conferir a sessão guardada no aparelho (ao abrir o app). Com `user`, é a pessoa da sessão guardada, ainda não conferida
   * pelo servidor: as telas mostram a falha ao carregar com "Tentar novamente", nunca a entrada. Sem `user`, não se sabe se a sessão
   * acabou: nada do aparelho (lembretes, widget) é apagado por isso.
   */
  offline?: boolean;
}

/**
 * Serviço de autenticação. Produção usa o Supabase Auth (confirmação de e-mail e recuperação reais).
 * Demonstração simula o acesso localmente e deixa isso visível na interface.
 */
export interface AuthService {
  readonly mode: AuthMode;
  init(): Promise<AuthState>;
  subscribe(listener: (state: AuthState) => void): () => void;
  signUp(input: { displayName: string; email: string; password: string }): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** 'local': só neste aparelho; 'global': em todos os aparelhos. */
  signOut(scope?: 'local' | 'global'): Promise<void>;
  /** Trata o link aberto a partir do e-mail (confirmação ou recuperação). */
  handleLink(url: string): Promise<'ok' | 'invalido' | null>;
  repositoryFor(user: AuthUser): RecordsRepository;
}

/** Intervalo mínimo entre reenvios de e-mail, em segundos (padrão do Supabase Auth). */
export const RESEND_INTERVAL_SECONDS = 60;

export const PASSWORD_RULE = 'Use pelo menos 8 caracteres, com letras e números.';

export function passwordProblem(password: string): string | null {
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return PASSWORD_RULE;
  return null;
}

export function emailProblem(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? null : 'Confira o e-mail informado.';
}

/**
 * Entradas na conta neste uso do app (com e-mail e senha ou pelo link do e-mail). A biometria ao abrir (components/device-features.tsx)
 * guarda o número de quando começou a contar e trava toda sessão que não veio de uma entrada depois disso: a que já estava no aparelho,
 * inclusive a que só volta depois de o app abrir sem conexão, e a de quem entrou antes de o Android recriar a tela do app (o voltar na tela
 * de trava, por exemplo). Só na memória do app.
 */
let signIns = 0;
export const signInMark = {
  set() {
    signIns += 1;
  },
  count(): number {
    return signIns;
  },
};

/**
 * Credenciais da tentativa em andamento, mantidas só em memória para o botão
 * "Já confirmei meu e-mail" consultar o estado real da conta. Nunca são gravadas nem registradas em log.
 */
let pending: { email: string; password: string } | null = null;
export const pendingCredentials = {
  set(email: string, password: string) {
    pending = { email, password };
  },
  get() {
    return pending;
  },
  clear() {
    pending = null;
  },
};
