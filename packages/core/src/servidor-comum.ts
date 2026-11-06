/**
 * O que as funções do servidor (WhatsApp, Telegram e assinatura na web) têm em comum, sem depender do resto do núcleo: cada função é
 * gerada num arquivo só por `scripts/gerar-funcoes.js`, que leva junto tudo o que o módulo de entrada importa. Este arquivo não importa
 * nada, para a função da assinatura não carregar as regras de leitura das mensagens.
 */

/** Comparação que leva o mesmo tempo para qualquer diferença (assinatura e segredos). */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Chave de serviço do banco: a chave secreta nova do Supabase (SUPABASE_SECRET_KEYS, um JSON por nome; vale a "default" ou, sem ela,
 * a primeira) e, sem ela, a chave antiga (SUPABASE_SERVICE_ROLE_KEY, que o painel já marca como antiga). Vazio: nenhuma.
 */
export function serviceKeyFrom(v: (name: string) => string): string {
  const keys = v('SUPABASE_SECRET_KEYS');
  if (keys !== '') {
    try {
      const parsed = JSON.parse(keys) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const values = parsed as Record<string, unknown>;
        const chosen = typeof values.default === 'string' ? values.default : Object.values(values).find((x) => typeof x === 'string');
        if (typeof chosen === 'string' && chosen.trim() !== '') return chosen.trim();
      }
    } catch {
      // JSON inválido: segue para a chave antiga.
    }
  }
  return v('SUPABASE_SERVICE_ROLE_KEY');
}

/** Cabeçalhos da chave de serviço na API do Supabase: a chave antiga (JWT) vai também em Authorization; a nova (sb_secret_...), só em apikey. */
export function serviceHeaders(serviceKey: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: serviceKey, 'Content-Type': 'application/json' };
  if (serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${serviceKey}`;
  return headers;
}
