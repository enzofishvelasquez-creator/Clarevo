/**
 * Relatório de falhas (D-093, decisão 11 das lojas em `docs/37`; `docs/46_RELATORIO_DE_FALHAS.md`). Só no app de celular e só com o
 * endereço do projeto configurado (`EXPO_PUBLIC_SENTRY_DSN`, nas variáveis do EAS), e só dos erros do JavaScript (sem a parte nativa do
 * SDK, que não passa pela limpeza). Antes de qualquer envio, `scrubCrashEvent` tira do
 * relatório tudo o que poderia identificar a pessoa ou mostrar um valor: quem é, o pedido de rede, os dados extras, o nome do aparelho,
 * o caminho de cada tela com identificadores e qualquer número, e-mail ou identificador no texto do erro. Ficam o tipo do erro, a pilha
 * de chamadas, o modelo e o sistema do aparelho e a versão do app.
 */

/** O que entra no relatório, como o Sentry descreve um evento (só as partes que a limpeza toca). */
export interface CrashEventLike {
  message?: string;
  user?: unknown;
  request?: unknown;
  extra?: unknown;
  server_name?: string;
  breadcrumbs?: CrashBreadcrumbLike[];
  contexts?: Record<string, unknown>;
  exception?: { values?: { type?: string; value?: string }[] };
  logentry?: { message?: string; formatted?: string; params?: unknown };
}

export interface CrashBreadcrumbLike {
  type?: string;
  category?: string;
  message?: string;
  timestamp?: number;
  data?: { [key: string]: unknown };
}

/**
 * Opções fixas do SDK: sem dado pessoal, sem gravação de tela, sem captura de tela, sem desempenho e sem sessões. **Sem a parte nativa**
 * (revisão independente de 11/11/2026): o SDK nativo não passa pelo `beforeSend` do JavaScript, e as falhas nativas, os travamentos e os
 * rastros de rede do sistema iriam sem a limpeza. Só os erros do JavaScript são enviados, sempre limpos; falha que derruba o app sem
 * passar pelo JavaScript não é relatada.
 */
export const CRASH_REPORT_OPTIONS = {
  enableNative: false,
  enableNativeCrashHandling: false,
  enableAppHangTracking: false,
  enableWatchdogTerminationTracking: false,
  enableNdk: false,
  enableCaptureFailedRequests: false,
  sendDefaultPii: false,
  attachScreenshot: false,
  attachViewHierarchy: false,
  enableAutoSessionTracking: false,
  tracesSampleRate: 0,
  maxBreadcrumbs: 20,
} as const;

/** Do contexto do aparelho, só o que ajuda a reproduzir a falha (nunca o nome que a pessoa deu ao aparelho). */
const DEVICE_KEYS = ['family', 'model', 'model_id', 'arch', 'simulator', 'memory_size', 'free_memory', 'orientation', 'low_memory'];
/** Do contexto do app, só nome, versão e build (nunca `device_app_hash` nem identificadores de instalação). */
const APP_KEYS = ['app_name', 'app_version', 'app_build'];
const KEPT_CONTEXTS = ['os', 'app', 'device', 'runtime', 'react_native_context'];
const PICK: Readonly<Record<string, readonly string[]>> = { device: DEVICE_KEYS, app: APP_KEYS };

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EMAIL = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]+/g;
// Números com ou sem separadores (R$ 1.234,56; 07/10/2026; 123456): viram "#".
const NUMBER = /\d+(?:[.,/:-]\d+)*/g;

/** Texto do erro sem e-mail, identificador nem número. */
export function scrubCrashText(text: string): string {
  return text.replace(UUID, '[id]').replace(EMAIL, '[e-mail]').replace(NUMBER, '#');
}

/** Caminho de tela sem os identificadores e sem o que vem depois de "?": /investimento/abc-123/movimento → /investimento/[id]/movimento. */
export function scrubCrashPath(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? '';
  return clean
    .split('/')
    .map((part, i) => (i === 0 || part === '' ? part : /\d/.test(part) || part.length > 24 ? '[id]' : part))
    .join('/');
}

/** Rastro antes de entrar no escopo: só a navegação, já com o caminho limpo (usado em `beforeBreadcrumb` e de novo no envio). */
export function scrubBreadcrumb(b: CrashBreadcrumbLike): CrashBreadcrumbLike | null {
  // Só a navegação entre telas, com o caminho limpo. Toques, console, rede e o resto saem (podem ter valores ou textos digitados).
  if (b.category !== 'navigation') return null;
  const data: Record<string, unknown> = {};
  for (const k of ['from', 'to']) if (typeof b.data?.[k] === 'string') data[k] = scrubCrashPath(b.data[k] as string);
  return { ...(typeof b.timestamp === 'number' ? { timestamp: b.timestamp } : {}), category: 'navigation', type: 'navigation', data };
}

/** O evento sem nada que identifique a pessoa ou mostre um valor (ver o comentário do arquivo). */
export function scrubCrashEvent<E extends CrashEventLike>(event: E): E {
  const out: CrashEventLike = { ...event };
  delete out.user;
  delete out.request;
  delete out.extra;
  delete out.server_name;
  if (typeof out.message === 'string') out.message = scrubCrashText(out.message);
  if (out.logentry) out.logentry = { message: scrubCrashText(out.logentry.formatted ?? out.logentry.message ?? '') };
  if (out.exception?.values) {
    out.exception = { ...out.exception, values: out.exception.values.map((v) => ({ ...v, ...(typeof v.value === 'string' ? { value: scrubCrashText(v.value) } : {}) })) };
  }
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb).filter((b): b is CrashBreadcrumbLike => b !== null);
  if (out.contexts) {
    const contexts: Record<string, unknown> = {};
    for (const k of KEPT_CONTEXTS) {
      const c = out.contexts[k];
      if (c === undefined) continue;
      const keys = PICK[k];
      if (keys && c && typeof c === 'object') {
        const picked: Record<string, unknown> = {};
        for (const pk of keys) if (pk in (c as Record<string, unknown>)) picked[pk] = (c as Record<string, unknown>)[pk];
        contexts[k] = picked;
      } else contexts[k] = c;
    }
    out.contexts = contexts;
  }
  return out as E;
}

/** Liga o relatório? Só com um endereço de projeto do Sentry válido (https, com a chave pública antes do "@"). */
export function crashReportDsn(value: string | undefined | null): string | null {
  const v = (value ?? '').trim();
  return /^https:\/\/[0-9a-f]{16,64}@[a-z0-9.-]+\/\d+$/i.test(v) ? v : null;
}
