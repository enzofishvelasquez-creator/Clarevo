import { DEMO_EMAIL, DEMO_TODAY, MemoryRepository, createDemoRepository, demoScenarioFrom, type DemoScenario, type RecordsRepository } from '@clarevo/core';

import { AuthError, type AuthService, type AuthState, type AuthUser } from './auth';

/**
 * Cenário fictício da conta de demonstração, lido uma vez do endereço de entrada na web ("?cenario=retorno", Ciclo A4).
 * Sem o parâmetro, fora da web ou com valor desconhecido: a demonstração padrão. Contas novas nunca recebem cenário.
 */
function scenarioFromAddress(): DemoScenario {
  try {
    const search = (globalThis as { location?: { search?: unknown } }).location?.search;
    return typeof search === 'string' ? demoScenarioFrom(new URLSearchParams(search).get('cenario')) : 'padrao';
  } catch {
    return 'padrao';
  }
}

interface DemoAccount {
  user: AuthUser;
  password: string;
  repo: MemoryRepository | null;
}

/**
 * Acesso SIMULADO para demonstração (sem Supabase configurado).
 * Nenhum e-mail é enviado; os links de confirmação e recuperação são simulados por botões.
 * Contas criadas aqui começam vazias. Só a conta de demonstração tem dados fictícios.
 */
export class DemoAuth implements AuthService {
  readonly mode = 'demo' as const;
  private accounts = new Map<string, DemoAccount>();
  private state: AuthState = { user: null, recovery: false };
  private listeners = new Set<(s: AuthState) => void>();
  private demoRepo: Promise<MemoryRepository> | null = null;
  private readonly scenario: DemoScenario = scenarioFromAddress();

  constructor() {
    this.accounts.set(DEMO_EMAIL, {
      user: { id: 'pessoa-demo', email: DEMO_EMAIL, displayName: 'Maria Alves', emailConfirmed: true },
      password: 'demo1234',
      repo: null,
    });
  }

  private emit(next: AuthState) {
    this.state = next;
    this.listeners.forEach((l) => l(next));
  }

  private async wait() {
    await new Promise((r) => setTimeout(r, 350));
  }

  async init() {
    return this.state;
  }

  subscribe(listener: (s: AuthState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signUp({ displayName, email, password }: { displayName: string; email: string; password: string }) {
    await this.wait();
    const key = email.trim().toLowerCase();
    // Como no provedor real, não revelamos se o e-mail já tem conta.
    if (this.accounts.has(key)) return;
    this.accounts.set(key, {
      user: { id: `pessoa-${this.accounts.size + 1}`, email: key, displayName: displayName.trim(), emailConfirmed: false },
      password,
      repo: null,
    });
  }

  /** Demonstração: equivale a abrir o link de confirmação recebido por e-mail. */
  simulateConfirmation(email: string) {
    const acc = this.accounts.get(email.trim().toLowerCase());
    if (acc) acc.user.emailConfirmed = true;
  }

  async signIn(email: string, password: string) {
    await this.wait();
    const acc = this.accounts.get(email.trim().toLowerCase());
    if (!acc || acc.password !== password) throw new AuthError('credenciais_invalidas');
    if (!acc.user.emailConfirmed) throw new AuthError('email_nao_confirmado');
    this.emit({ user: { ...acc.user }, recovery: false });
  }

  async signInDemo() {
    await this.signIn(DEMO_EMAIL, 'demo1234');
  }

  async resendConfirmation() {
    await this.wait();
  }

  async requestPasswordReset() {
    await this.wait();
  }

  /** Demonstração: equivale a abrir o link de recuperação recebido por e-mail. */
  simulateRecoveryLink(email: string) {
    const acc = this.accounts.get(email.trim().toLowerCase());
    if (!acc) return false;
    this.emit({ user: { ...acc.user }, recovery: true });
    return true;
  }

  async updatePassword(password: string) {
    await this.wait();
    const user = this.state.user;
    if (!user) throw new AuthError('sem_sessao');
    this.accounts.get(user.email)!.password = password;
  }

  async signOut() {
    this.emit({ user: null, recovery: false });
  }

  async handleLink() {
    return null;
  }

  repositoryFor(user: AuthUser): RecordsRepository {
    if (user.email === DEMO_EMAIL) {
      this.demoRepo ??= createDemoRepository({ latencyMs: 300, scenario: this.scenario });
      return lazy(this.demoRepo);
    }
    const acc = this.accounts.get(user.email)!;
    acc.repo ??= new MemoryRepository({ actorId: user.id, displayName: user.displayName, today: () => DEMO_TODAY, latencyMs: 300 });
    return acc.repo;
  }
}

/** Repositório que aguarda a criação assíncrona (semeadura) antes de cada chamada. */
function lazy(p: Promise<RecordsRepository>): RecordsRepository {
  return new Proxy({} as RecordsRepository, {
    get: (_t, prop: keyof RecordsRepository) =>
      async (...args: unknown[]) => {
        const repo = await p;
        return (repo[prop] as (...a: unknown[]) => unknown).apply(repo, args);
      },
  });
}
