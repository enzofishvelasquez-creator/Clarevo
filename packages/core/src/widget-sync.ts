import type { IsoDate } from './dates';
import { addDays, isValidIsoDate } from './dates';
import {
  WIDGET_SNAPSHOT_VERSION,
  buildWidgetContent,
  buildWidgetSnapshot,
  isWidgetSnapshotFresh,
  type WidgetContent,
  type WidgetInput,
  type WidgetSnapshot,
} from './widget';

/**
 * Ponte do widget nativo (D-063 item 3, Ciclo AA): o que o app grava no armazenamento compartilhado com o widget, quando grava, e como o
 * widget lê. Tudo puro e testado aqui; o lado nativo (`apps/app/src/widget-native`) só desenha o que sai daqui, sem regra financeira.
 *
 * - O que se grava é o `WidgetSnapshot` de `buildWidgetSnapshot`, em texto JSON, e nada além dele: com os valores ocultos (padrão) não há
 *   valor em reais nem nome de conta; sem sessão não há dado nenhum; nenhum identificador da pessoa ou da conta entra no texto.
 * - Na demonstração nada é gravado. Com sessão e sem a leitura das contas ainda, também nada: o que já estava gravado continua valendo
 *   (o mesmo dia) ou vira "sem dados" sozinho (outro dia).
 * - O texto gravado traz "hoje" e "amanhã" e as vencidas contadas até `builtOn`. Por isso o widget só mostra o conteúdo no dia em que ele foi
 *   montado (`isWidgetSnapshotFresh`); em outro dia mostra "Abra o Clarevo para atualizar". No iOS, o app deixa pronta, no mesmo texto de
 *   linha do tempo, a entrada da virada do dia (`afterMidnight`); no Android, o widget confere a data a cada atualização (`widgetContentToday`).
 */

/** Nomes combinados entre o app, a configuração de build (`apps/app/widget.config.js`) e o lado nativo. */
export const WIDGET_NATIVE = {
  /** Chave do armazenamento compartilhado (Android: o AsyncStorage que o JavaScript do widget lê). Muda junto com a versão do formato. */
  storageKey: `clarevo.widget.v${WIDGET_SNAPSHOT_VERSION}`,
  /** iOS: um widget, nos tamanhos pequeno e médio. */
  ios: 'ClarevoWidget',
  /** Android: um widget por tamanho. */
  androidSmall: 'ClarevoAnotar',
  androidMedium: 'ClarevoAPagar',
  /** Esquema do link do app (`scheme` de app.json). */
  scheme: 'clarevo',
} as const;

/**
 * A virada do dia no aparelho: 00:00 do dia seguinte a `now`, na hora local do aparelho (o mesmo fuso de `todayIn(deviceTimeZone())`). É
 * a data da segunda entrada da linha do tempo do iOS.
 */
export function nextLocalMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
}

/** "/registro/novo?tipo=despesa" vira "clarevo://registro/novo?tipo=despesa", o endereço que o widget abre. */
export function widgetUrl(route: string): string {
  return `${WIDGET_NATIVE.scheme}:/${route.startsWith('/') ? route : `/${route}`}`;
}

export type WidgetSyncPlan =
  | {
      /** Nada a gravar: demonstração (dados fictícios) ou contas ainda não lidas. */
      write: false;
      reason: 'demonstracao' | 'sem_leitura';
    }
  | {
      write: true;
      /** O que vale hoje. */
      snapshot: WidgetSnapshot;
      /** `JSON.stringify(snapshot)`: o texto que vai para o armazenamento compartilhado. */
      json: string;
      /** O que vale a partir da virada do dia (sem dados, ou sem sessão), para a linha do tempo do iOS. */
      afterMidnight: WidgetSnapshot;
    };

/**
 * Decide o que o app grava para o widget. `input.toPay` é o `summarizeToPay` do mês de hoje no contexto Pessoal (nunca o da Família);
 * `input.signedIn` falso monta o estado "Entre no Clarevo para ver", que apaga do widget o que a pessoa anterior viu.
 */
export function planWidgetSync(input: WidgetInput): WidgetSyncPlan {
  if (input.demo) return { write: false, reason: 'demonstracao' };
  if (input.signedIn && !input.toPay) return { write: false, reason: 'sem_leitura' };
  const snapshot = buildWidgetSnapshot(input);
  // O dia seguinte não tem leitura: o conteúdo é o do estado sem dados (ou sem sessão), montado pelo próprio núcleo.
  const afterMidnight = buildWidgetSnapshot({ ...input, today: addDays(input.today, 1), toPay: null });
  return { write: true, snapshot, json: JSON.stringify(snapshot), afterMidnight };
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string';
const isTextOrNull = (v: unknown): boolean => v === null || typeof v === 'string';
const isRoute = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/');
const STATES = ['normal', 'vazio', 'sem_sessao', 'sem_dados'];

function isNext(v: unknown): boolean {
  return v === null || (isRecord(v) && isText(v.name) && isText(v.when) && isText(v.amount) && typeof v.estimated === 'boolean' && isText(v.line));
}

/**
 * Lê o texto gravado. Devolve null para qualquer coisa que o widget não deva desenhar: texto que não é JSON, versão diferente de
 * `WIDGET_SNAPSHOT_VERSION`, data de montagem inválida ou campo que falta. Nunca lança.
 */
export function parseWidgetSnapshot(raw: unknown): WidgetSnapshot | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(value) || value.version !== WIDGET_SNAPSHOT_VERSION) return null;
  if (!isText(value.builtOn) || !isValidIsoDate(value.builtOn) || !isText(value.month)) return null;
  const { small, medium } = value;
  if (!isRecord(small) || small.size !== 'pequeno' || !isText(small.label) || !isRoute(small.route) || !isText(small.a11y) || !isTextOrNull(small.badge)) {
    return null;
  }
  if (
    !isRecord(medium) ||
    medium.size !== 'medio' ||
    !STATES.includes(medium.state as string) ||
    !isRoute(medium.route) ||
    !isText(medium.a11y) ||
    typeof medium.valuesShown !== 'boolean' ||
    !isTextOrNull(medium.title) ||
    !isTextOrNull(medium.value) ||
    !isTextOrNull(medium.message) ||
    !isTextOrNull(medium.overdue) ||
    !isTextOrNull(medium.badge) ||
    !isNext(medium.next)
  ) {
    return null;
  }
  return value as unknown as WidgetSnapshot;
}

/**
 * O que o widget mostra em `today` (o dia do aparelho, no fuso da pessoa), a partir do texto gravado: o conteúdo gravado, só se ele foi
 * montado hoje (`isWidgetSnapshotFresh`). Sem nada gravado, com texto que não se lê ou de outro dia, o estado sem dados, "Abra o Clarevo
 * para atualizar"; se o que estava gravado era o estado sem sessão, continua sem sessão. Em qualquer caso, "Anotar gasto" segue abrindo
 * a tela de anotar.
 */
export function widgetContentToday(raw: unknown, today: IsoDate): WidgetContent {
  const snapshot = parseWidgetSnapshot(raw);
  if (snapshot && isWidgetSnapshotFresh(snapshot, today)) return { small: snapshot.small, medium: snapshot.medium };
  const signedIn = snapshot ? snapshot.medium.state !== 'sem_sessao' : true;
  return buildWidgetContent({ today, signedIn, demo: false, showValues: false, toPay: null });
}
