/**
 * Sugestões e problemas, versão do app e telas de erro (teste com pessoas, 16/11/2026; `docs/50_ATUALIZACOES.md`).
 *
 * "Enviar sugestão ou problema" abre o programa de e-mail com o endereço do suporte, o assunto e um corpo com espaço para a pessoa
 * escrever e, abaixo de uma linha, só o que ajuda a equipe a reproduzir: versão e build do app, a atualização em uso, o perfil do build,
 * o sistema e o modelo do aparelho e o caminho da tela sem identificadores. **Nada da conta**: sem nome, e-mail, valores, categorias
 * nem identificadores. Cada campo passa por uma lista fechada de caracteres antes de entrar no texto (`supportReportLines`), e o caminho
 * da tela passa pela mesma limpeza do relatório de falhas (`scrubCrashPath`). Testes em `test/feedback.test.ts`.
 */
import { scrubCrashPath } from './crash-report';
import { ERROR_TEXT } from './validation';
import { SUPPORT_EMAIL } from './legal';

/** "Enviar sugestão ou problema" (Conta, logo abaixo do perfil) e "Enviar um problema" (telas de erro). */
export const FEEDBACK_TEXT = {
  title: 'Sugestão ou problema',
  hint: 'Conte o que achou, o que faltou ou o que deu errado. O e-mail já vai com a versão do app e o modelo do aparelho, sem nenhum dado da sua conta.',
  button: 'Enviar sugestão ou problema',
  report: 'Enviar um problema',
  subject: 'Clarevo · sugestão ou problema',
  bodyIntro: 'Escreva aqui a sua sugestão ou o que aconteceu:',
  /** A linha que separa o texto da pessoa das informações técnicas (hífens comuns, sem travessão). */
  separator: '--------------------',
  techTitle: 'Para a equipe da Clarevo (sem dados da sua conta):',
  label: {
    version: 'Versão do app',
    update: 'Atualização',
    profile: 'Perfil do build',
    system: 'Sistema',
    device: 'Aparelho',
    screen: 'Tela',
  },
  /** Quando o aparelho não abre o e-mail: o endereço aparece logo abaixo, para copiar. */
  openFailed: 'Não foi possível abrir o e-mail neste aparelho. Escreva para este endereço:',
  address: SUPPORT_EMAIL,
} as const;

/** A versão do app, na última linha de Conta. */
export const VERSION_TEXT = {
  original: 'original do build',
  version: (version: string, build: string | null) => (build ? `Versão ${version} (build ${build})` : `Versão ${version}`),
  update: (shortId: string) => `atualização ${shortId}`,
} as const;

/** A tela de erro do app inteiro (`ErrorBoundary` de `apps/app/src/app/_layout.tsx`). */
export const SCREEN_ERROR_TEXT = {
  title: 'Algo deu errado nesta tela.',
  body: 'O que já estava salvo continua guardado. Tente de novo ou volte ao Resumo. Se acontecer outra vez, envie um problema para a equipe.',
  retry: 'Tentar de novo',
  home: 'Voltar ao Resumo',
  report: FEEDBACK_TEXT.report,
} as const;

/** A falha ao carregar a conta (`apps/app/src/app/carregando.tsx`). */
export const LOAD_ERROR_TEXT = {
  offline: 'Sem conexão no momento. Confira a internet do aparelho e tente de novo. Se a internet já voltou, espere um minuto antes de tentar.',
  failed: ERROR_TEXT.carregar_falhou,
  signOut: 'Sair da conta',
  report: FEEDBACK_TEXT.report,
} as const;

/** O texto da falha ao carregar: sem conexão (código `rede` do repositório) ou a mensagem de sempre. */
export function loadErrorText(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return code === 'rede' ? LOAD_ERROR_TEXT.offline : LOAD_ERROR_TEXT.failed;
}

/** O que o app sabe de si e do aparelho (nada da pessoa). Tudo opcional: na web e no desenvolvimento, boa parte não existe. */
export interface AppReportInfo {
  /** Versão do app instalado (a da loja, `1.0.1`). */
  version?: string | null;
  /** Número do build (o `versionCode` do Android ou o build do iPhone). */
  build?: string | null;
  /** Identificador da atualização em uso (EAS Update). */
  updateId?: string | null;
  /** `true` quando roda o JavaScript que veio dentro do build, sem atualização baixada. */
  embedded?: boolean;
  /** Perfil do build (o canal de atualizações, que tem o mesmo nome do perfil em `eas.json`). */
  profile?: string | null;
  /** Sistema, já descrito por `systemLabel` ("Android 14 (API 34)", "iOS 18.1"). */
  system?: string | null;
  /** Modelo do aparelho, já descrito por `deviceLabel` ("samsung SM-A515F", "iPhone"). */
  device?: string | null;
  /** Caminho da tela, de preferência com os segmentos da rota (`/orcamento/[categoria]`); a limpeza tira o que sobrar. */
  screen?: string | null;
}

/** Só letras e números ASCII, espaço e `. _ + - ( ) ,`, sem arroba (nunca um e-mail), até `max` caracteres. */
function safe(value: unknown, max: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  if (text.includes('@')) return null;
  const clean = text
    .replace(/[^A-Za-z0-9 ._+(),-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return clean || null;
}

/** Cada campo só entra se tiver a forma esperada (versão, número do build, nome de perfil, sistema); o resto fica de fora. */
const FIELD = {
  version: /^\d{1,4}(\.\d{1,4}){0,3}$/,
  build: /^\d{1,10}(\.\d{1,4}){0,2}$/,
  profile: /^[a-z0-9][a-z0-9-]{0,39}$/,
  system: /^(Android [0-9A-Za-z.]{1,12}( \(API \d{1,3}\))?|iOS [0-9.]{1,12}|Navegador)$/,
};

const field = (value: unknown, re: RegExp, max: number): string | null => {
  const text = safe(value, max);
  return text && re.test(text) ? text : null;
};

const SHORT_ID = /^[0-9a-f]{8}/i;

/** Os 8 primeiros caracteres do identificador da atualização, ou "original do build" (sem atualização baixada, ou sem identificador). */
export function updateLabel(updateId: string | null | undefined, embedded: boolean | undefined): string {
  const id = typeof updateId === 'string' ? updateId.trim() : '';
  if (embedded || !SHORT_ID.test(id)) return VERSION_TEXT.original;
  return id.slice(0, 8).toLowerCase();
}

/** Perfil do build para o relatório de falhas (o `environment` do Sentry, sem espaço nem barra): o canal, ou "desconhecido". */
export function buildProfileName(channel: string | null | undefined): string {
  const name = typeof channel === 'string' ? channel.trim() : '';
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(name) ? name : 'desconhecido';
}

/** A última linha de Conta: "Versão 1.0.1 (build 7) · atualização 1a2b3c4d", ou só a versão (na web, sem build nem atualização). */
export function appVersionLine(info: Pick<AppReportInfo, 'version' | 'build' | 'updateId' | 'embedded'>, withUpdate = true): string {
  const version = VERSION_TEXT.version(field(info.version, FIELD.version, 20) ?? '?', field(info.build, FIELD.build, 20));
  if (!withUpdate) return version;
  const update = updateLabel(info.updateId, info.embedded);
  return `${version} · ${update === VERSION_TEXT.original ? update : VERSION_TEXT.update(update)}`;
}

/** As constantes do sistema que interessam (`Platform.constants` do React Native; o resto é ignorado). */
interface PlatformConstantsLike {
  Release?: unknown;
  Model?: unknown;
  Manufacturer?: unknown;
  Brand?: unknown;
  interfaceIdiom?: unknown;
}

/** "Android 14 (API 34)", "iOS 18.1" ou "Navegador". */
export function systemLabel(os: string, version: unknown, constants?: object | null): string {
  if (os === 'android') {
    const release = safe((constants as PlatformConstantsLike | null | undefined)?.Release, 12);
    const api = safe(version, 6);
    return [`Android ${release ?? '?'}`, api ? `(API ${api})` : null].filter(Boolean).join(' ');
  }
  if (os === 'ios') return `iOS ${safe(version, 12) ?? '?'}`;
  if (os === 'web') return 'Navegador';
  return safe(os, 20) ?? '?';
}

/**
 * O modelo do aparelho: no Android, fabricante e modelo ("samsung SM-A515F"); no iPhone, só "iPhone" ou "iPad" (o React Native não diz o
 * modelo, e o nome que a pessoa deu ao aparelho, como "iPhone de Maria", nunca é lido). Na web, nada.
 */
export function deviceLabel(os: string, platformConstants?: object | null): string | null {
  const constants = platformConstants as PlatformConstantsLike | null | undefined;
  if (os === 'android') {
    const maker = safe(constants?.Manufacturer, 20) ?? safe(constants?.Brand, 20);
    const model = safe(constants?.Model, 30);
    if (!model) return maker;
    return maker && !model.toLowerCase().startsWith(maker.toLowerCase()) ? `${maker} ${model}` : model;
  }
  if (os === 'ios') return constants?.interfaceIdiom === 'pad' ? 'iPad' : 'iPhone';
  return null;
}

/** O caminho da tela a partir dos segmentos da rota (`['orcamento', '[categoria]']` vira `/orcamento/[categoria]`), já limpo. */
export function screenFromSegments(segments: readonly string[]): string {
  return scrubCrashPath(`/${segments.join('/')}`);
}

/** As linhas técnicas do corpo, cada campo limpo; o que não se sabe fica de fora. */
export function supportReportLines(info: AppReportInfo): string[] {
  const L = FEEDBACK_TEXT.label;
  const version = field(info.version, FIELD.version, 20);
  const build = field(info.build, FIELD.build, 20);
  const profile = field(info.profile, FIELD.profile, 40);
  const system = field(info.system, FIELD.system, 40);
  const device = safe(info.device, 50);
  const screen = typeof info.screen === 'string' && info.screen.startsWith('/') ? safeScreen(info.screen) : null;
  return [
    `${L.version}: ${version ?? '?'}${build ? ` (build ${build})` : ''}`,
    `${L.update}: ${updateLabel(info.updateId, info.embedded)}`,
    profile ? `${L.profile}: ${profile}` : null,
    system ? `${L.system}: ${system}` : null,
    device ? `${L.device}: ${device}` : null,
    screen ? `${L.screen}: ${screen}` : null,
  ].filter((line): line is string => line !== null);
}

/** Caminho limpo e só com os caracteres de uma rota (`/a-pagar/[id]/editar`, `/(tabs)/index`). */
function safeScreen(path: string): string | null {
  const clean = scrubCrashPath(path).replace(/[^a-z0-9/()[\].-]/gi, '').slice(0, 80);
  return clean.startsWith('/') ? clean : null;
}

/** O corpo do e-mail: o espaço para a pessoa escrever, a linha e as informações técnicas. Quebras de linha como o `mailto:` pede (CRLF). */
export function feedbackBody(info: AppReportInfo): string {
  return [FEEDBACK_TEXT.bodyIntro, '', '', '', FEEDBACK_TEXT.separator, FEEDBACK_TEXT.techTitle, ...supportReportLines(info)].join('\r\n');
}

/** O endereço `mailto:` completo, com o assunto e o corpo codificados. */
export function feedbackMailto(info: AppReportInfo): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(FEEDBACK_TEXT.subject)}&body=${encodeURIComponent(feedbackBody(info))}`;
}
