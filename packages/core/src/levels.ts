import { addDays, daysBetween, isValidIsoDate, type IsoDate } from './dates';
import { ROUTINE_REMINDER_ID_PREFIX } from './routine-reminders';

/**
 * Níveis de conta (pedido do Enzo em 12/11/2026, D-095, e a revisão de 17/11/2026, D-111; `docs/48_NIVEIS.md`). A conta tem um nível,
 * Bronze, Prata, Ouro, Diamante ou Esmeralda, pelo quanto a pessoa já usa a Clarevo: marcos do tipo "já fez alguma vez", lidos do banco
 * por `my_account_marks` (migrações 0034 e 0041), que guarda os alcançados (`account_marks`).
 *
 * - Os 18 marcos do dia a dia dão Bronze, Prata, Ouro e Diamante (D-095, sem mudança). A Esmeralda (D-111) pede o Diamante e 4 dos 6
 *   marcos do grupo "Investimentos e reserva", todos pelo uso, nunca pelo valor. Investir é só do Pessoal: na Família, os marcos de
 *   investimento não se aplicam (a reserva para imprevistos conta nos dois).
 * - O nível nunca mede dinheiro (nenhum valor entra na conta) e não cobra nada de ninguém.
 * - D-111: o nível mostrado desce um degrau depois de 60 dias sem anotar nenhum gasto ou recebimento (no Pessoal ou numa Família), mais
 *   um a cada 60 dias, nunca abaixo do Bronze, com aviso a partir do 45º dia. Os marcos continuam guardados: ao voltar a anotar, o nível
 *   volta ao que os marcos dão, sem comemorar de novo. Ninguém cai sem aviso: os 60 dias contam da última anotação ou, se for depois, do
 *   dia em que o app com a regra leu o nível da pessoa pela primeira vez (`idleSince`, calculado no banco).
 *
 * Aqui ficam os marcos, quantos dão cada nível, a queda e os textos; as cores ficam no app (`theme/tokens.ts`).
 */

/** Os 18 marcos do dia a dia (D-095): dão Bronze, Prata, Ouro e Diamante. */
export const BASIC_MARK_KEYS = [
  'gasto',
  'recebimento',
  'gasto_fixo',
  'guardar',
  'meta',
  'aporte',
  'orcamento',
  'renda',
  'cartao',
  'investimento',
  'pagou',
  'tres_meses',
  'importou',
  'telegram',
  'familia',
  'conta',
  'limite',
  'imagem',
] as const;
export type BasicMarkKey = (typeof BASIC_MARK_KEYS)[number];

/**
 * Os 6 marcos de "Investimentos e reserva" (D-111), para a Esmeralda. Todos pelo uso (já fez alguma vez), nunca pelo valor: um aporte, uma
 * atualização de valor e um rendimento registrados num investimento já criado, o plano de aportes, um investimento ligado a uma meta e
 * a reserva para imprevistos com um plano por mês. O primeiro investimento já é o marco "investimento" do dia a dia.
 */
export const INVESTING_MARK_KEYS = ['inv_aporte', 'inv_valor', 'inv_rendimento', 'inv_plano', 'inv_meta', 'reserva_plano'] as const;
export type InvestingMarkKey = (typeof INVESTING_MARK_KEYS)[number];

/** Todos os marcos, na ordem da resposta do banco: os 18 do dia a dia e os 6 de investimentos e reserva. */
export const ACCOUNT_MARK_KEYS = [...BASIC_MARK_KEYS, ...INVESTING_MARK_KEYS] as const;
export type AccountMarkKey = BasicMarkKey | InvestingMarkKey;
export type AccountMarks = Readonly<Record<AccountMarkKey, boolean>>;

/** Os marcos de investimento (os do grupo, menos o da reserva): só valem no Pessoal, onde fica a aba Investir. */
export const PERSONAL_ONLY_MARK_KEYS: readonly InvestingMarkKey[] = ['inv_aporte', 'inv_valor', 'inv_rendimento', 'inv_plano', 'inv_meta'];

export const ACCOUNT_LEVELS = ['bronze', 'prata', 'ouro', 'diamante', 'esmeralda'] as const;
export type AccountLevel = (typeof ACCOUNT_LEVELS)[number];

/**
 * Quantos marcos do dia a dia dão cada nível (um quarto, metade e três quartos dos 18). Toda conta começa no Bronze; o Diamante pede 14
 * dos 18, e dá para chegar lá sem cartão, sem investimento, sem dinheiro guardado em meta e sem Família (há marcos que não envolvem
 * dinheiro: conta de origem, limite pessoal, imagem da meta, Telegram). A Esmeralda pede o mesmo que o Diamante e mais
 * `LEVEL_INVESTING_THRESHOLD.esmeralda` marcos de investimentos e reserva.
 */
export const LEVEL_THRESHOLD: Readonly<Record<AccountLevel, number>> = { bronze: 0, prata: 4, ouro: 9, diamante: 14, esmeralda: 14 };
/** Quantos marcos de investimentos e reserva cada nível pede: só a Esmeralda, 4 dos 6 (a maior parte do grupo). */
export const LEVEL_INVESTING_THRESHOLD: Readonly<Record<AccountLevel, number>> = { bronze: 0, prata: 0, ouro: 0, diamante: 0, esmeralda: 4 };
export const LEVEL_NAME: Readonly<Record<AccountLevel, string>> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  diamante: 'Diamante',
  esmeralda: 'Esmeralda',
};

/** Nenhum marco feito (a conta nova, e o que o app assume quando a leitura falha). */
export const NO_MARKS: AccountMarks = Object.fromEntries(ACCOUNT_MARK_KEYS.map((k) => [k, false])) as AccountMarks;

/** Lê os marcos da resposta de `my_account_marks`. Marco ausente ou que não é `true` conta como não feito; resposta que não é objeto vira erro. */
export function parseAccountMarks(raw: unknown): AccountMarks {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('marcos_invalidos');
  const r = raw as Record<string, unknown>;
  return Object.fromEntries(ACCOUNT_MARK_KEYS.map((k) => [k, r[k] === true])) as AccountMarks;
}

/** Quantos dos 18 marcos do dia a dia estão feitos. */
export function basicMarksDone(marks: AccountMarks): number {
  return BASIC_MARK_KEYS.filter((k) => marks[k]).length;
}

/** Quantos dos 6 marcos de investimentos e reserva estão feitos. */
export function investingMarksDone(marks: AccountMarks): number {
  return INVESTING_MARK_KEYS.filter((k) => marks[k]).length;
}

export function levelRank(level: AccountLevel): number {
  return ACCOUNT_LEVELS.indexOf(level);
}

/** O nível que os marcos dão: o mais alto cujo número de marcos do dia a dia e de investimentos e reserva já foi alcançado. */
export function accountLevel(marks: AccountMarks): AccountLevel {
  const basic = basicMarksDone(marks);
  const investing = investingMarksDone(marks);
  return [...ACCOUNT_LEVELS].reverse().find((l) => basic >= LEVEL_THRESHOLD[l] && investing >= LEVEL_INVESTING_THRESHOLD[l]) ?? 'bronze';
}

export interface AccountLevelProgress {
  level: AccountLevel;
  /** Marcos do dia a dia feitos, de `total` (18). */
  done: number;
  total: number;
  /** Marcos de investimentos e reserva feitos, de `investingTotal` (6). */
  investingDone: number;
  investingTotal: number;
  /** O próximo nível e quantos marcos faltam para ele; nulo na Esmeralda. */
  next: AccountLevel | null;
  missing: number;
  /** De que grupo são os marcos que faltam: os do dia a dia até o Diamante; os de investimentos e reserva do Diamante para a Esmeralda. */
  missingGroup: 'dia_a_dia' | 'investimentos' | null;
  /** De 0 a 1: o caminho já feito dentro do nível atual, até o próximo (1 na Esmeralda). */
  fraction: number;
}

export function accountLevelProgress(marks: AccountMarks): AccountLevelProgress {
  const level = accountLevel(marks);
  const done = basicMarksDone(marks);
  const investingDone = investingMarksDone(marks);
  const base = { level, done, total: BASIC_MARK_KEYS.length, investingDone, investingTotal: INVESTING_MARK_KEYS.length };
  const next = ACCOUNT_LEVELS[levelRank(level) + 1] ?? null;
  if (!next) return { ...base, next: null, missing: 0, missingGroup: null, fraction: 1 };
  // Do Diamante para a Esmeralda, só os marcos de investimentos e reserva faltam (os do dia a dia já bastam).
  if (LEVEL_INVESTING_THRESHOLD[next] > LEVEL_INVESTING_THRESHOLD[level]) {
    const to = LEVEL_INVESTING_THRESHOLD[next];
    return { ...base, next, missing: Math.max(0, to - investingDone), missingGroup: 'investimentos', fraction: Math.min(1, investingDone / to) };
  }
  const from = LEVEL_THRESHOLD[level];
  const to = LEVEL_THRESHOLD[next];
  return { ...base, next, missing: to - done, missingGroup: 'dia_a_dia', fraction: (done - from) / (to - from) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// A queda por tempo sem anotar (D-111)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Dias sem anotar até cada degrau a menos (60 para o primeiro, 120 para o segundo...). */
export const LEVEL_IDLE_STEP_DAYS = 60;
/** Dias de aviso antes de cada degrau: o aviso começa no 45º dia (e no 105º, no 165º...). */
export const LEVEL_WARNING_DAYS = 15;

/**
 * As operações que contam como anotar um gasto ou um recebimento (as mesmas de my_account_marks no banco): um lançamento (também pelo
 * WhatsApp e pelo Telegram), uma compra ou um encargo no cartão, uma conta ou uma fatura paga (o pagamento vira gasto) e uma importação.
 * Valem no Pessoal e em qualquer Família, pelo que a própria pessoa anotou.
 */
export const LEVEL_NOTE_ACTIONS: readonly string[] = ['criar', 'criar_compra_cartao', 'criar_encargo_cartao', 'pagar_compromisso', 'pagar_fatura', 'importar_extrato'];

/**
 * O que o app lê do banco para mostrar o nível (`my_account_marks(true)`): os marcos e o tempo sem anotar.
 * - `idleSince`: o dia a partir do qual contam os 60 dias: a última anotação de gasto ou recebimento ou, se for depois, o dia em que o
 *   app com a regra leu o nível da pessoa pela primeira vez (quem já estava parado quando a regra chegou tem os 60 dias inteiros, com o
 *   aviso antes). Nulo sem a informação (banco sem a migração 0041 ou a pessoa no meio da exclusão da conta): o nível não desce.
 * - `lastNoteOn`: o dia da última anotação de gasto ou recebimento, só para o texto do aviso; nulo se nunca houve.
 */
export interface AccountLevelState {
  marks: AccountMarks;
  idleSince: IsoDate | null;
  lastNoteOn: IsoDate | null;
}

/** Sem a regra da queda (banco antigo): só os marcos. */
export function levelStateOf(marks: AccountMarks): AccountLevelState {
  return { marks, idleSince: null, lastNoteOn: null };
}

function isoDay(v: unknown): IsoDate | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && isValidIsoDate(v) ? v : null;
}

/**
 * Lê a resposta de `my_account_marks(true)`: `{ marks, idle_since, last_note_on }`. Os dias que não são datas válidas viram nulos (o nível
 * não desce); resposta sem `marks` ou que não é objeto vira erro.
 */
export function parseAccountLevelState(raw: unknown): AccountLevelState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('marcos_invalidos');
  const r = raw as Record<string, unknown>;
  return { marks: parseAccountMarks(r.marks), idleSince: isoDay(r.idle_since), lastNoteOn: isoDay(r.last_note_on) };
}

/** O aviso antes de um degrau a menos. */
export interface LevelWarning {
  /** Dias desde a última anotação (para o texto; sem anotação nenhuma, desde o começo da contagem). */
  idleDays: number;
  /** Dias até o degrau a menos (de 1 a 15). */
  daysLeft: number;
  from: AccountLevel;
  to: AccountLevel;
  /** O nível que volta ao anotar, quando o nível já desceu algum degrau; nulo quando ainda está no que os marcos dão. */
  restores: AccountLevel | null;
  /** Identifica este aviso ("começo da contagem|degrau") para o "Agora não" valer só até o próximo marco de tempo. */
  key: string;
}

export interface ShownAccountLevel {
  /** O nível mostrado. */
  level: AccountLevel;
  /** O nível que os marcos dão (volta a ele ao anotar). */
  marksLevel: AccountLevel;
  /** Quantos degraus abaixo do que os marcos dão (0 enquanto a pessoa anota). */
  stepsDown: number;
  /** O aviso do próximo degrau a menos, a partir do 45º dia; nulo fora dele e no Bronze. */
  warning: LevelWarning | null;
}

/**
 * O nível mostrado hoje (D-111): o dos marcos, menos um degrau a cada 60 dias desde `idleSince`, nunca abaixo do Bronze; e o aviso nos
 * 15 dias antes do próximo degrau. Sem `idleSince` ou com hoje inválido, o nível dos marcos, sem aviso.
 */
export function shownAccountLevel(state: AccountLevelState, today: IsoDate): ShownAccountLevel {
  const marksLevel = accountLevel(state.marks);
  const rank = levelRank(marksLevel);
  const since = isoDay(state.idleSince);
  if (!since || !isValidIsoDate(today)) return { level: marksLevel, marksLevel, stepsDown: 0, warning: null };
  const idle = Math.max(0, daysBetween(since, today));
  const due = Math.floor(idle / LEVEL_IDLE_STEP_DAYS);
  const stepsDown = Math.min(due, rank);
  const level = ACCOUNT_LEVELS[rank - stepsDown]!;
  let warning: LevelWarning | null = null;
  if (rank - stepsDown > 0) {
    const daysLeft = (due + 1) * LEVEL_IDLE_STEP_DAYS - idle;
    if (daysLeft <= LEVEL_WARNING_DAYS) {
      // O texto conta da última anotação (quem já estava parado quando a regra chegou tem mais dias sem anotar que a contagem).
      const last = isoDay(state.lastNoteOn);
      warning = {
        idleDays: last && last <= since ? Math.max(idle, daysBetween(last, today)) : idle,
        daysLeft,
        from: level,
        to: ACCOUNT_LEVELS[rank - stepsDown - 1]!,
        restores: stepsDown > 0 ? marksLevel : null,
        key: `${since}|${due + 1}`,
      };
    }
  }
  return { level, marksLevel, stepsDown, warning };
}

/**
 * O próximo dia, a partir de hoje (inclusive), em que começa um aviso (o 45º dia sem anotar, o 105º...) e o aviso desse dia, para o
 * lembrete local no celular; nulo sem a contagem ou quando não há mais degrau a descer até lá (Bronze).
 */
export function nextLevelWarning(state: AccountLevelState, today: IsoDate): { date: IsoDate; warning: LevelWarning } | null {
  const since = isoDay(state.idleSince);
  if (!since || !isValidIsoDate(today)) return null;
  const idle = Math.max(0, daysBetween(since, today));
  const step = Math.max(1, Math.ceil((idle + LEVEL_WARNING_DAYS) / LEVEL_IDLE_STEP_DAYS));
  const date = addDays(since, step * LEVEL_IDLE_STEP_DAYS - LEVEL_WARNING_DAYS);
  const warning = shownAccountLevel(state, date).warning;
  return warning ? { date, warning } : null;
}

/** O lembrete local do aviso de queda (mesma forma dos lembretes do dia a dia, `RoutineReminderItem`, sem o tipo). */
export interface LevelReminderItem {
  /** "clarevo-lembrete-rotina-nivel-AAAA-MM-DD": o app cancela só os seus avisos. */
  id: string;
  date: IsoDate;
  /** Hora local do aparelho: "AAAA-MM-DDTHH:00". */
  fireAt: string;
  hour: number;
  title: string;
  body: string;
  route: string;
}

/**
 * O lembrete local no celular no dia em que o aviso de queda começa (D-111), para quem permitiu lembretes: no horário dos lembretes do dia a
 * dia, abrindo a tela do nível. O texto é neutro, sem contagem de dias e sem nível (`LEVEL_TEXT.reminderBody`): o lembrete é montado no dia
 * em que é agendado e só é refeito quando o app abre ou grava, e uma anotação pelo WhatsApp ou pelo Telegram conta no banco sem passar pelo
 * aparelho; a contagem fica só dentro do app, recalculada a cada leitura do nível. Também respeita a tela bloqueada (D-087): nada de valor,
 * descrição nem nível. Quando o horário de hoje já passou (`nowMinutes`, minutos desde a meia-noite) no dia em que um aviso começa, vale o
 * marco seguinte (o próximo dia em que um aviso começa). Nulo sem próximo aviso (sem contagem ou já no Bronze) e com hora inválida. O app
 * reagenda a cada abertura e escrita: anotar tira o lembrete.
 */
export function levelWarningReminder(state: AccountLevelState, today: IsoDate, hour: number, nowMinutes?: number): LevelReminderItem | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  let next = nextLevelWarning(state, today);
  if (next && next.date === today && nowMinutes !== undefined && nowMinutes >= hour * 60) next = nextLevelWarning(state, addDays(today, 1));
  if (!next) return null;
  const hh = String(hour).padStart(2, '0');
  return {
    id: `${ROUTINE_REMINDER_ID_PREFIX}nivel-${next.date}`,
    date: next.date,
    fireAt: `${next.date}T${hh}:00`,
    hour,
    title: LEVEL_TEXT.reminderTitle,
    body: LEVEL_TEXT.reminderBody,
    route: '/conta/nivel',
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// A comemoração (uma vez por nível em cada aparelho)
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * Se a troca de nível merece o card de comemoração: o nível mostrado agora é maior que o último que este aparelho já comemorou. Sem nível
 * guardado (primeira vez neste aparelho), não comemora: o app só guarda o nível (`levelToRemember`), para uma conta antiga não comemorar
 * de novo a cada aparelho. Uma conta nova começa no Bronze guardado, então a subida para o Prata comemora. A volta depois de uma queda
 * não comemora, porque o aparelho guarda o maior nível já visto (nunca um menor).
 */
export function shouldCelebrateLevel(lastSeen: AccountLevel | null, current: AccountLevel): boolean {
  return lastSeen !== null && levelRank(current) > levelRank(lastSeen);
}

/**
 * O nível que o aparelho guarda como visto: na primeira vez, o que os marcos dão (mesmo com o nível mostrado abaixo, para a volta não
 * comemorar); depois, o maior entre o guardado e o mostrado. Nunca desce.
 */
export function levelToRemember(lastSeen: AccountLevel | null, shown: Pick<ShownAccountLevel, 'level' | 'marksLevel'>): AccountLevel {
  if (lastSeen === null) return shown.marksLevel;
  return levelRank(shown.level) > levelRank(lastSeen) ? shown.level : lastSeen;
}

export function isAccountLevel(v: unknown): v is AccountLevel {
  return typeof v === 'string' && (ACCOUNT_LEVELS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------------------------------------------

/** Cada marco: o nome (no infinitivo, como convite) e para onde o app leva quem ainda não fez (nulo: acontece com o uso). */
export const ACCOUNT_MARK_TEXT: Readonly<Record<AccountMarkKey, { title: string; href: string | null }>> = {
  gasto: { title: 'Anotar um gasto', href: '/registro/novo?tipo=despesa' },
  recebimento: { title: 'Registrar um recebimento', href: '/registro/novo?tipo=receita' },
  gasto_fixo: { title: 'Cadastrar um gasto fixo ou uma conta a pagar', href: '/gastos-fixos' },
  guardar: { title: 'Responder ao plano de guardar', href: '/guardar' },
  meta: { title: 'Criar uma meta', href: '/meta/nova' },
  aporte: { title: 'Registrar um aporte numa meta', href: '/metas' },
  orcamento: { title: 'Definir o orçamento de uma categoria', href: '/orcamento' },
  renda: { title: 'Informar a renda de referência', href: '/renda-comprometida' },
  cartao: { title: 'Cadastrar um cartão', href: '/cartoes' },
  investimento: { title: 'Registrar um investimento', href: '/investimento/novo' },
  pagou: { title: 'Marcar uma conta como paga', href: '/a-pagar' },
  tres_meses: { title: 'Anotar em três meses diferentes', href: null },
  importou: { title: 'Importar um extrato ou uma fatura', href: '/importar' },
  telegram: { title: 'Ligar o Telegram', href: '/conta/telegram' },
  familia: { title: 'Criar ou entrar numa Família', href: '/familia' },
  conta: { title: 'Cadastrar um banco ou carteira', href: '/contas/nova' },
  limite: { title: 'Definir o seu limite de renda comprometida', href: '/renda-comprometida/limite' },
  imagem: { title: 'Escolher a imagem de uma meta', href: '/metas' },
  inv_aporte: { title: 'Registrar um aporte num investimento', href: '/investimentos' },
  inv_valor: { title: 'Atualizar o valor de um investimento', href: '/investimentos' },
  inv_rendimento: { title: 'Registrar um rendimento recebido', href: '/investimentos' },
  inv_plano: { title: 'Criar o plano de aportes', href: '/investimento/plano' },
  inv_meta: { title: 'Ligar um investimento a uma meta', href: '/investimentos' },
  reserva_plano: { title: 'Definir quanto guardar por mês na reserva para imprevistos', href: '/reserva' },
};

const N = LEVEL_NAME;
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** "A partir de" de cada nível na lista: os marcos do dia a dia; na Esmeralda, o Diamante e os de investimentos e reserva. */
function levelFrom(level: AccountLevel): string {
  if (LEVEL_INVESTING_THRESHOLD[level] > 0) {
    return `A partir do ${N.diamante} e de ${LEVEL_INVESTING_THRESHOLD[level]} dos ${INVESTING_MARK_KEYS.length} marcos de investimentos e reserva`;
  }
  return LEVEL_THRESHOLD[level] === 0 ? 'Toda conta começa aqui' : `A partir de ${LEVEL_THRESHOLD[level]} marcos`;
}

export const LEVEL_TEXT = {
  cardTitle: 'Nível da conta',
  screenTitle: 'Nível da conta',
  level: (level: AccountLevel) => `Nível ${N[level]}`,
  progress: (done: number, total: number) => `${done} de ${total} marcos`,
  next: (missing: number, next: AccountLevel) =>
    missing === 1 ? `Falta 1 marco para o nível ${N[next]}.` : `Faltam ${missing} marcos para o nível ${N[next]}.`,
  /** Do Diamante para a Esmeralda: o que falta é do grupo de investimentos e reserva. */
  nextInvesting: (missing: number, next: AccountLevel) =>
    missing === 1
      ? `Falta 1 marco de investimentos e reserva para o nível ${N[next]}.`
      : `Faltam ${missing} marcos de investimentos e reserva para o nível ${N[next]}.`,
  top: 'Você chegou ao nível mais alto da Clarevo.',
  /** O que é o nível, sempre junto dele (D-111: desce um degrau depois de 60 dias sem anotar e volta ao anotar). */
  what: `O nível mostra o quanto da Clarevo você já usa e não tem a ver com quanto dinheiro você tem. O nível desce um degrau depois de ${LEVEL_IDLE_STEP_DAYS} dias sem anotar nada e volta assim que você voltar a anotar.`,
  open: 'Ver meu nível',
  doneTitle: 'Já feitos',
  todoTitle: 'Para conhecer',
  todoNote: 'Nada aqui é obrigatório: use só o que ajudar no seu dia a dia.',
  markDone: (title: string) => `${title}: feito`,
  markTodo: (title: string) => `${title}: ainda não`,
  progressLabel: 'Caminho até o próximo nível',
  progressLabelTop: 'Nível mais alto alcançado',
  levelsTitle: 'Os níveis',
  levelFrom,
  /** O que o leitor de tela diz de cada nível da lista: o mesmo que a tela mostra. */
  levelRowLabel: (level: AccountLevel, current: boolean) => {
    const from = levelFrom(level);
    return `${N[level]}, ${from.charAt(0).toLowerCase()}${from.slice(1)}${current ? ', seu nível' : ''}`;
  },
  yourLevel: 'Seu nível',
  loadFailed: 'Não foi possível carregar o nível da conta. Tente de novo.',
  /** O grupo de investimentos e reserva (D-111), na tela do nível. */
  investingTitle: 'Investimentos e reserva',
  investingIntro: `Para o nível ${N.esmeralda}: com o ${N.diamante}, ${LEVEL_INVESTING_THRESHOLD.esmeralda} destes ${INVESTING_MARK_KEYS.length} marcos. Eles contam pelo uso, nunca pelo valor.`,
  investingProgress: (done: number, total: number) => `${done} de ${total} marcos de investimentos e reserva`,
  /** Investir é só do Pessoal: o recado no Pessoal e o da Família (onde os marcos de investimento não se aplicam). */
  investingPersonal: 'Investir fica só no seu Pessoal: os marcos de investimento contam pelo que você faz lá. A reserva para imprevistos conta no Pessoal e na Família.',
  investingFamily:
    'Você está vendo a Família, onde os marcos de investimento não se aplicam: investir fica só no seu Pessoal, e os atalhos de investimento abrem o Pessoal. A reserva para imprevistos conta no Pessoal e na Família.',
  /** O card de comemoração da troca de nível (Resumo). */
  celebrateEyebrow: 'Novo nível',
  celebrateTitle: (level: AccountLevel) => `Sua conta chegou ao nível ${N[level]}!`,
  celebrateBody: {
    bronze: 'A sua conta está pronta para começar.',
    prata: 'Você já deu os primeiros passos para ver o seu mês de verdade.',
    ouro: 'Você já usa boa parte da Clarevo para planejar e acompanhar.',
    diamante: 'A Clarevo já faz parte do seu dia a dia. Que bom ter você aqui.',
    esmeralda: 'Além do dia a dia, você acompanha investimentos e reserva por aqui. Que bom ter você aqui.',
  } as Readonly<Record<AccountLevel, string>>,
  celebrateDismiss: 'Fechar',
  /**
   * O aviso a partir do 45º dia sem anotar (D-111), no card do nível em Conta, na tela do nível e na fila de avisos do Resumo. Em tom de
   * fato, sem cor de alerta e sem pressão; é o único lugar em que aparece a contagem de dias sem anotar.
   */
  warningEyebrow: 'Nível da conta',
  warning: (w: Pick<LevelWarning, 'idleDays' | 'daysLeft' | 'from' | 'to' | 'restores'>) =>
    `Faz ${w.idleDays} dias que nada é anotado. Em ${plural(w.daysLeft, 'dia', 'dias')}, o nível passa de ${N[w.from]} para ${N[w.to]}. ` +
    (w.restores ? `Anotar um gasto ou recebimento traz de volta o nível ${N[w.restores]}.` : 'Anotar um gasto ou recebimento mantém o nível.'),
  warningDismiss: 'Agora não',
  /** Com o nível abaixo do que os marcos dão (sem contar dias). */
  below: (stepsDown: number, marksLevel: AccountLevel) =>
    `Como nada foi anotado por um tempo, o nível está ${stepsDown === 1 ? 'um degrau' : `${stepsDown} degraus`} abaixo do que os seus marcos dão. Anotar um gasto ou recebimento traz de volta o nível ${N[marksLevel]}.`,
  /** Título do lembrete local no celular no dia em que o aviso começa. */
  reminderTitle: 'Nível da conta',
  /**
   * O corpo do lembrete local: neutro, sem contagem de dias e sem nível (o lembrete é montado quando é agendado, e uma anotação pelo
   * WhatsApp ou pelo Telegram pode ter zerado a contagem desde então); a contagem aparece só dentro do app, recalculada.
   */
  reminderBody: 'Veja como está o nível da sua conta na Clarevo.',
} as const;
