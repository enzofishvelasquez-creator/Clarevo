/**
 * Níveis de conta (pedido do Enzo em 12/11/2026, D-095; `docs/48_NIVEIS.md`). A conta tem um nível, Bronze, Prata, Ouro ou Diamante,
 * pelo quanto a pessoa já usa a Clarevo: 18 marcos do tipo "já fez alguma vez", lidos do banco por `my_account_marks` (migração 0034),
 * que guarda os alcançados (`account_marks`).
 * O nível nunca mede dinheiro (nenhum valor entra na conta), nunca desce e não cobra nada de ninguém: é um reconhecimento do que já foi
 * feito, com a lista do que ainda dá para conhecer. A troca de nível gera um card de comemoração, e alguns itens da tela ganham a cor
 * do nível. Aqui ficam os marcos, quantos dão cada nível e os textos; as cores ficam no app (`theme/tokens.ts`).
 */

export const ACCOUNT_MARK_KEYS = [
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
export type AccountMarkKey = (typeof ACCOUNT_MARK_KEYS)[number];
export type AccountMarks = Readonly<Record<AccountMarkKey, boolean>>;

export const ACCOUNT_LEVELS = ['bronze', 'prata', 'ouro', 'diamante'] as const;
export type AccountLevel = (typeof ACCOUNT_LEVELS)[number];

/**
 * Quantos marcos dão cada nível (um quarto, metade e três quartos dos 18). Toda conta começa no Bronze; o Diamante pede 14 dos 18, e dá
 * para chegar lá sem cartão, sem investimento, sem dinheiro guardado em meta e sem Família (há marcos que não envolvem dinheiro: conta
 * de origem, limite pessoal, imagem da meta, Telegram).
 */
export const LEVEL_THRESHOLD: Readonly<Record<AccountLevel, number>> = { bronze: 0, prata: 4, ouro: 9, diamante: 14 };
export const LEVEL_NAME: Readonly<Record<AccountLevel, string>> = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', diamante: 'Diamante' };

/** Nenhum marco feito (a conta nova, e o que o app assume quando a leitura falha). */
export const NO_MARKS: AccountMarks = Object.fromEntries(ACCOUNT_MARK_KEYS.map((k) => [k, false])) as AccountMarks;

/** Lê a resposta de `my_account_marks`. Marco ausente ou que não é `true` conta como não feito; resposta que não é objeto vira erro. */
export function parseAccountMarks(raw: unknown): AccountMarks {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('marcos_invalidos');
  const r = raw as Record<string, unknown>;
  return Object.fromEntries(ACCOUNT_MARK_KEYS.map((k) => [k, r[k] === true])) as AccountMarks;
}

export function accountMarksDone(marks: AccountMarks): number {
  return ACCOUNT_MARK_KEYS.filter((k) => marks[k]).length;
}

export function levelRank(level: AccountLevel): number {
  return ACCOUNT_LEVELS.indexOf(level);
}

export function accountLevel(marks: AccountMarks): AccountLevel {
  const done = accountMarksDone(marks);
  return [...ACCOUNT_LEVELS].reverse().find((l) => done >= LEVEL_THRESHOLD[l]) ?? 'bronze';
}

export interface AccountLevelProgress {
  level: AccountLevel;
  done: number;
  total: number;
  /** O próximo nível e quantos marcos faltam para ele; nulo no Diamante. */
  next: AccountLevel | null;
  missing: number;
  /** De 0 a 1: o caminho já feito dentro do nível atual, até o próximo (1 no Diamante). */
  fraction: number;
}

export function accountLevelProgress(marks: AccountMarks): AccountLevelProgress {
  const level = accountLevel(marks);
  const done = accountMarksDone(marks);
  const next = ACCOUNT_LEVELS[levelRank(level) + 1] ?? null;
  if (!next) return { level, done, total: ACCOUNT_MARK_KEYS.length, next: null, missing: 0, fraction: 1 };
  const from = LEVEL_THRESHOLD[level];
  const to = LEVEL_THRESHOLD[next];
  return { level, done, total: ACCOUNT_MARK_KEYS.length, next, missing: to - done, fraction: (done - from) / (to - from) };
}

/**
 * Se a troca de nível merece o card de comemoração: o nível de agora é maior que o último que este aparelho já comemorou. Sem nível
 * guardado (primeira vez neste aparelho), não comemora: o app só guarda o nível de agora, para uma conta antiga não comemorar de novo
 * a cada aparelho. Uma conta nova começa no Bronze guardado, então a subida para o Prata comemora.
 */
export function shouldCelebrateLevel(lastSeen: AccountLevel | null, current: AccountLevel): boolean {
  return lastSeen !== null && levelRank(current) > levelRank(lastSeen);
}

export function isAccountLevel(v: unknown): v is AccountLevel {
  return typeof v === 'string' && (ACCOUNT_LEVELS as readonly string[]).includes(v);
}

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
  conta: { title: 'Cadastrar uma conta de origem', href: '/contas/nova' },
  limite: { title: 'Definir o seu limite de renda comprometida', href: '/renda-comprometida/limite' },
  imagem: { title: 'Escolher a imagem de uma meta', href: '/metas' },
};

export const LEVEL_TEXT = {
  cardTitle: 'Nível da conta',
  screenTitle: 'Nível da conta',
  level: (level: AccountLevel) => `Nível ${LEVEL_NAME[level]}`,
  progress: (done: number, total: number) => `${done} de ${total} marcos`,
  next: (missing: number, next: AccountLevel) =>
    missing === 1 ? `Falta 1 marco para o nível ${LEVEL_NAME[next]}.` : `Faltam ${missing} marcos para o nível ${LEVEL_NAME[next]}.`,
  top: 'Você chegou ao nível mais alto da Clarevo.',
  /** O que é o nível, sempre junto dele. */
  what: 'O nível mostra o quanto da Clarevo você já usa. Não tem a ver com quanto dinheiro você tem, e nunca desce.',
  open: 'Ver meu nível',
  doneTitle: 'Já feitos',
  todoTitle: 'Para conhecer',
  todoNote: 'Nada aqui é obrigatório: use só o que ajudar no seu dia a dia.',
  markDone: (title: string) => `${title}: feito`,
  markTodo: (title: string) => `${title}: ainda não`,
  progressLabel: 'Caminho até o próximo nível',
  progressLabelTop: 'Nível mais alto alcançado',
  levelsTitle: 'Os níveis',
  levelFrom: (n: number) => (n === 0 ? 'Toda conta começa aqui' : `A partir de ${n} marcos`),
  yourLevel: 'Seu nível',
  loadFailed: 'Não foi possível carregar o nível da conta. Tente novamente.',
  /** O card de comemoração da troca de nível (Resumo). */
  celebrateEyebrow: 'Novo nível',
  celebrateTitle: (level: AccountLevel) => `Sua conta chegou ao nível ${LEVEL_NAME[level]}!`,
  celebrateBody: {
    bronze: 'A sua conta está pronta para começar.',
    prata: 'Você já deu os primeiros passos para ver o seu mês de verdade.',
    ouro: 'Você já usa boa parte da Clarevo para planejar e acompanhar.',
    diamante: 'A Clarevo já faz parte do seu dia a dia. Que bom ter você aqui.',
  } as Readonly<Record<AccountLevel, string>>,
  celebrateDismiss: 'Fechar',
} as const;
