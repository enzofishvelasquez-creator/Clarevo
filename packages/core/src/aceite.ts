/**
 * Aceite dos termos de uso e da política de privacidade (A1, aprovada em 04/11/2026; migração 0024). Fica fora de legal.ts porque as
 * funções do servidor (WhatsApp e Telegram) embutem aquele arquivo.
 */
import { formatDateBR, type IsoDate } from './dates';

// ---------------------------------------------------------------------------
// Aceite dos termos e da política (A1, migração 0024)
// ---------------------------------------------------------------------------

/**
 * Versão vigente dos termos de uso e da política de privacidade: a mesma de `clarevo_legal_version()` no banco (o teste confere a
 * última migração). Vai nos metadados do cadastro, e o banco grava o aceite quando a pessoa entra pela primeira vez. Muda só quando os
 * textos mudarem de um jeito que peça novo aceite (A5), junto com uma migração nova.
 */
export const LEGAL_VERSION = 1;

/** O aceite da própria pessoa, como `my_legal_acceptance` devolve: a versão vigente, a última aceita (nula se nenhuma) e quando. */
export interface LegalAcceptance {
  current: number;
  version: number | null;
  acceptedAt: string | null;
}

/** Lê a resposta de `my_legal_acceptance` e de `accept_legal_terms`. Fora do formato, erro (o app não mostra o aviso). */
export function parseLegalAcceptance(raw: unknown): LegalAcceptance {
  if (!raw || typeof raw !== 'object') throw new Error('aceite_invalido');
  const r = raw as Record<string, unknown>;
  const current = r.current;
  const version = r.version ?? null;
  const acceptedAt = r.accepted_at ?? null;
  if (typeof current !== 'number' || !Number.isInteger(current) || current < 1) throw new Error('aceite_invalido');
  if (version !== null && (typeof version !== 'number' || !Number.isInteger(version) || version < 1)) throw new Error('aceite_invalido');
  if (acceptedAt !== null && (typeof acceptedAt !== 'string' || Number.isNaN(Date.parse(acceptedAt)))) throw new Error('aceite_invalido');
  return { current, version: version as number | null, acceptedAt: acceptedAt as string | null };
}

/** Se a pessoa precisa aceitar a versão vigente: nunca aceitou, ou aceitou uma versão anterior. */
export function legalAcceptanceNeeded(a: LegalAcceptance): boolean {
  return a.version === null || a.version < a.current;
}

/** O aviso de aceite: aparece uma vez, por cima do app, até a pessoa aceitar (ou sair da conta). */
export const LEGAL_ACCEPT_TEXT = {
  title: 'Termos de uso e política de privacidade',
  /** Quem ainda não tem aceite guardado (contas criadas antes do registro do aceite). */
  first: 'Para continuar, confirme que tem 18 anos ou mais e que concorda com os termos de uso e a política de privacidade da Clarevo.',
  /** Versão nova que pede novo aceite (A5). */
  updated:
    'Os termos de uso e a política de privacidade mudaram. Leia o que mudou e confirme que concorda para continuar usando a Clarevo.',
  terms: 'Ler os termos de uso',
  privacy: 'Ler a política de privacidade',
  accept: 'Concordo e continuar',
  signOut: 'Sair da conta',
  failed: 'Não foi possível guardar o aceite agora. Tente de novo em instantes.',
  openFailed: 'Não foi possível abrir a página agora. Tente de novo em instantes.',
} as const;

/**
 * Próxima versão dos textos, anunciada com pelo menos 30 dias de antecedência (A5): a versão, o dia em que passa a valer e um resumo
 * curto do que muda. `null` quando não há mudança marcada. Junto com a troca, a equipe manda o aviso por e-mail.
 */
export interface LegalNextVersion {
  version: number;
  effectiveOn: IsoDate;
  summary: string;
}

export const LEGAL_NEXT: LegalNextVersion | null = null;

/** Antecedência mínima do aviso, em dias (A5). */
export const LEGAL_NOTICE_DAYS = 30;

/** O aviso no Resumo enquanto a próxima versão não vale; nulo sem mudança marcada ou depois que ela passa a valer. */
export function legalChangeNotice(next: LegalNextVersion | null, today: IsoDate): string | null {
  if (!next || today >= next.effectiveOn) return null;
  return `Os termos de uso e a política de privacidade mudam em ${formatDateBR(next.effectiveOn)}. ${next.summary}`;
}

/** O link do aviso: a página de versões do site. */
export const LEGAL_NOTICE_LINK = 'Ver o que muda';
