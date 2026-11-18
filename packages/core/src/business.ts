import type { IsoMonth } from './dates';
import { addMonths, formatDayMonth, formatMonthName, formatMonthSpanBR, formatMonthYearBR, monthOf, parseDateBR, type IsoDate } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, formatBRL, parseBRL } from './money';
import type { ContextKind, FinancialRecord, RecordKind } from './records';
import { CATEGORIES, NO_CATEGORY_LABEL, recordMonth } from './records';
import type { RepoErrorCode } from './repository';
import { charCount, DESCRIPTION_MAX, ERROR_TEXT } from './validation';

/**
 * Espaço Negócio (D-113, 17/11/2026; docs/52_ESPACO_NEGOCIO.md). Para quem tem CNPJ ou trabalha por conta (a loja de conserto de
 * ar-condicionado, a mãe que vende sacolé) e mistura as contas do negócio com as pessoais. Decisões do Enzo: um espaço separado (e não
 * uma marca nos lançamentos), incluído no plano Individual, um negócio por pessoa, sem custo a mais. Pedido da Elis: leve, sem virar
 * contabilidade. A pessoa dá o nome, anota o que entrou e o que saiu, com as categorias do negócio, e vê, numa visão separada, quanto
 * entrou, quanto saiu e quanto sobrou, sem cor de alerta e sem julgamento.
 *
 * Regras repetidas no banco (migração 0042): create_business, rename_business e end_business; a retirada para o Pessoal
 * (create_business_withdrawal e delete_business_withdrawal: o gasto "Retirada para o Pessoal" no negócio e o recebimento "Retirada do
 * negócio" no Pessoal, ligados e gravados juntos); mover um lançamento entre o Pessoal e o negócio (move_record). Metas e investimentos
 * ficam fora do negócio; WhatsApp e Telegram anotam só no Pessoal.
 *
 * Clarevo Plus (preparar agora, lançar depois): o modelo já aceita vários negócios por pessoa, sócios e ajudantes com papéis (os vínculos
 * da Família) e a exportação para o contador; nada disso aparece no app enquanto o Enzo não definir (docs/52, seção 6).
 */

/** Tamanho do nome do negócio (o mesmo da Família). */
export const BUSINESS_NAME_MAX = 60;
/** Negócios ativos por pessoa no plano Individual (o Plus, depois, pode ter mais). */
export const BUSINESS_MAX_PER_PERSON = 1;
/** A conta com que o negócio nasce (bancos e carteira, D-043). */
export const BUSINESS_DEFAULT_ACCOUNT = 'Conta do negócio';

/**
 * Categorias do negócio. Entradas: vendas, serviços e outras. Saídas: o que um pequeno negócio costuma gastar, sem termos de
 * contabilidade. As de gasto são as do orçamento do negócio (a mesma lista do banco, clarevo_budget_categories).
 */
export const BUSINESS_CATEGORIES: Readonly<Record<RecordKind, readonly string[]>> = {
  receita: ['Vendas', 'Serviços', 'Outras entradas'],
  despesa: [
    'Material e mercadoria',
    'Peças e ferramentas',
    'Combustível e transporte',
    'Funcionários e ajudantes',
    'Impostos e DAS',
    'Aluguel do ponto',
    'Contas do ponto',
    'Taxas e maquininha',
    'Outras saídas',
  ],
};

/** A categoria do gasto da retirada no negócio (fora da lista de escolha: só a retirada usa). */
export const WITHDRAWAL_BUSINESS_CATEGORY = 'Retirada para o Pessoal';
/** A categoria do recebimento da retirada no Pessoal. */
export const WITHDRAWAL_PERSONAL_CATEGORY = 'Retirada do negócio';

/** As categorias de escolha de um tipo de lançamento no contexto: as do negócio no negócio; as de sempre no Pessoal e na Família. */
export function contextCategories(context: ContextKind, kind: RecordKind): readonly string[] {
  return context === 'negocio' ? BUSINESS_CATEGORIES[kind] : CATEGORIES[kind];
}

/**
 * A categoria é uma das de gasto de escolha, de qualquer espaço (para os atalhos que levam a categoria de um formulário a outro, como
 * "Cadastrar como conta a pagar"; o formulário de destino é do mesmo espaço).
 */
export function isChoosableExpenseCategory(category: string | null | undefined): category is string {
  return typeof category === 'string' && (CATEGORIES.despesa.includes(category) || BUSINESS_CATEGORIES.despesa.includes(category));
}

/** As categorias do orçamento no contexto (as de gasto). */
export function budgetCategoriesFor(context: ContextKind): readonly string[] {
  return contextCategories(context, 'despesa');
}

/** O negócio como o app lê. */
export interface BusinessContext {
  id: string;
  name: string;
  createdAt: string;
}

/** Ações do negócio gravadas em record_operations. Criar, renomear e encerrar não contam como anotação na atividade. */
export type BusinessAction =
  | 'criar_negocio'
  | 'renomear_negocio'
  | 'encerrar_negocio'
  | 'criar_retirada_negocio'
  | 'excluir_retirada_negocio'
  | 'mover_lancamento';

export const BUSINESS_ACTIONS: readonly BusinessAction[] = [
  'criar_negocio',
  'renomear_negocio',
  'encerrar_negocio',
  'criar_retirada_negocio',
  'excluir_retirada_negocio',
  'mover_lancamento',
];

export function isBusinessAction(action: string): action is BusinessAction {
  return (BUSINESS_ACTIONS as readonly string[]).includes(action);
}

/** O que a pessoa informa na retirada para o Pessoal. Descrição vazia: "Retirada para o Pessoal" no negócio e "Retirada de <negócio>" no Pessoal. */
export interface BusinessWithdrawalInput {
  businessAccountId: string;
  personalAccountId: string;
  amountCents: Cents;
  occurredOn: string;
  description: string | null;
}

/** Os dois lados de uma retirada. */
export interface BusinessWithdrawal {
  businessRecord: FinancialRecord;
  personalRecord: FinancialRecord;
}

/** A descrição padrão de cada lado da retirada (a mesma do banco). */
export function withdrawalDescriptions(businessName: string, description: string | null): { business: string; personal: string } {
  const own = typeof description === 'string' ? description.trim() : '';
  if (own !== '') return { business: own, personal: own };
  return { business: 'Retirada para o Pessoal', personal: [...`Retirada de ${businessName}`].slice(0, 80).join('') };
}

/** O preenchimento da retirada (texto como a pessoa digita). */
export interface WithdrawalDraft {
  amountText: string;
  dateText: string;
  description: string;
  businessAccountId: string;
  personalAccountId: string;
}

export type WithdrawalField = 'amountText' | 'dateText' | 'description' | 'businessAccountId' | 'personalAccountId';
export type WithdrawalValidation = { ok: true; input: BusinessWithdrawalInput } | { ok: false; errors: Partial<Record<WithdrawalField, string>> };

/** Ordem dos campos na tela: o foco vai para o primeiro erro. */
export const WITHDRAWAL_FIELD_ORDER: readonly WithdrawalField[] = ['amountText', 'dateText', 'businessAccountId', 'personalAccountId', 'description'];

/** As mesmas regras de createRecord nos dois lados: valor de R$ 0,01 a R$ 9.999.999,99, data até hoje, as duas contas e descrição até 80. */
export function validateWithdrawalDraft(d: WithdrawalDraft, today: IsoDate): WithdrawalValidation {
  const errors: Partial<Record<WithdrawalField, string>> = {};
  const amount = parseBRL(d.amountText);
  if (amount === null || amount <= 0) errors.amountText = ERROR_TEXT.valor_invalido;
  else if (amount > MAX_RECORD_CENTS) errors.amountText = ERROR_TEXT.valor_acima_do_limite;
  const occurredOn = parseDateBR(d.dateText);
  if (occurredOn === null) errors.dateText = ERROR_TEXT.data_invalida;
  else if (occurredOn > today) errors.dateText = ERROR_TEXT.data_futura;
  if (d.businessAccountId.trim() === '') errors.businessAccountId = ERROR_TEXT.conta_invalida;
  if (d.personalAccountId.trim() === '') errors.personalAccountId = ERROR_TEXT.conta_invalida;
  const description = d.description.trim();
  if (charCount(description) > DESCRIPTION_MAX) errors.description = ERROR_TEXT.descricao_longa;
  if (Object.keys(errors).length > 0 || amount === null || occurredOn === null) return { ok: false, errors };
  return {
    ok: true,
    input: { businessAccountId: d.businessAccountId, personalAccountId: d.personalAccountId, amountCents: amount, occurredOn, description: description === '' ? null : description },
  };
}

/** Nome do negócio sem os espaços das pontas. */
export function normalizeBusinessName(name: string): string {
  return typeof name === 'string' ? name.trim() : '';
}

/** Nome de 1 a 60 caracteres (depois de tirar os espaços das pontas), contados como o banco conta. */
export function businessNameError(name: string): 'nome_do_negocio_invalido' | null {
  const size = charCount(normalizeBusinessName(name));
  return size >= 1 && size <= BUSINESS_NAME_MAX ? null : 'nome_do_negocio_invalido';
}

/** O lançamento é um lado de uma retirada (no negócio ou no Pessoal). */
export function isWithdrawal(record: Pick<FinancialRecord, 'pairedRecordId'>): boolean {
  return typeof record.pairedRecordId === 'string' && record.pairedRecordId !== '';
}

/**
 * O lançamento pode mudar de espaço: o comum, sem conta a pagar, fatura, rendimento de investimento ou retirada ligados (a mesma regra
 * de move_record, lancamento_ligado).
 */
export function canMoveRecord(record: FinancialRecord): boolean {
  return record.commitmentId === null && record.invoice === null && !record.investmentId && !record.investmentMovementId && !isWithdrawal(record);
}

/** Pares de categorias que se correspondem entre o Pessoal e o negócio, ao mover. */
const MOVE_PAIRS: readonly (readonly [string, string])[] = [['Transporte', 'Combustível e transporte']];

/**
 * A categoria sugerida ao mover: a mesma, se existe no outro espaço; o par conhecido (Transporte e Combustível e transporte); senão,
 * nenhuma (a pessoa escolhe; sem escolha, fica "Sem categoria").
 */
export function suggestMoveCategory(category: string | null, kind: RecordKind, to: ContextKind): string | null {
  if (!category) return null;
  const list = contextCategories(to, kind);
  if (list.includes(category)) return category;
  for (const [personal, business] of MOVE_PAIRS) {
    if (to === 'negocio' && category === personal && list.includes(business)) return business;
    if (to !== 'negocio' && category === business && list.includes(personal)) return personal;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Seu negócio: entrou, saiu e sobrou
// ---------------------------------------------------------------------------

/** O mês do negócio. As retiradas para o Pessoal não entram em "Saiu": ficam à parte, em withdrawnCents. */
export interface BusinessMonth {
  month: IsoMonth;
  inCents: Cents;
  /** As saídas do negócio, sem as retiradas. */
  outCents: Cents;
  /** Entrou menos saiu (pode ser negativo). */
  leftCents: Cents;
  /** O que foi para o Pessoal no mês (retiradas). */
  withdrawnCents: Cents;
  /** O que ficou no negócio depois das retiradas: sobrou menos retiradas (é a Diferença do Resumo do negócio). */
  keptCents: Cents;
  /** Lançamentos do mês, com as retiradas. */
  recordCount: number;
}

/** O mês do negócio pelos lançamentos do contexto (o mês em que cada um conta, como no Resumo). */
export function businessMonth(records: readonly FinancialRecord[], contextId: string, month: IsoMonth): BusinessMonth {
  let inCents = 0;
  let outCents = 0;
  let withdrawnCents = 0;
  let recordCount = 0;
  for (const r of records) {
    if (r.contextId !== contextId || r.status !== 'realizado' || recordMonth(r) !== month) continue;
    recordCount += 1;
    if (r.kind === 'receita') inCents += r.amountCents;
    else if (isWithdrawal(r)) withdrawnCents += r.amountCents;
    else outCents += r.amountCents;
  }
  const leftCents = inCents - outCents;
  return { month, inCents, outCents, leftCents, withdrawnCents, keptCents: leftCents - withdrawnCents, recordCount };
}

/** Os últimos `count` meses até `last` (do mais antigo ao mais novo). */
export function businessMonths(records: readonly FinancialRecord[], contextId: string, last: IsoMonth, count = 6): BusinessMonth[] {
  const out: BusinessMonth[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(businessMonth(records, contextId, addMonths(last, -i)));
  return out;
}

/** Uma categoria de saída do mês, com a parte do total (0 a 1). */
export interface BusinessOutLine {
  category: string;
  cents: Cents;
  share: number;
}

/** As maiores saídas do mês por categoria (sem as retiradas), da maior para a menor; "Sem categoria" para as sem categoria. */
export function businessTopOut(records: readonly FinancialRecord[], contextId: string, month: IsoMonth, limit = 5): BusinessOutLine[] {
  const by = new Map<string, number>();
  let total = 0;
  for (const r of records) {
    if (r.contextId !== contextId || r.status !== 'realizado' || r.kind !== 'despesa' || isWithdrawal(r) || recordMonth(r) !== month) continue;
    const key = r.category ?? NO_CATEGORY_LABEL;
    by.set(key, (by.get(key) ?? 0) + r.amountCents);
    total += r.amountCents;
  }
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, limit)
    .map(([category, cents]) => ({ category, cents, share: total > 0 ? cents / total : 0 }));
}

/** A frase do mês, de fato e sem julgamento. */
export function businessResultText(m: BusinessMonth): string {
  if (m.recordCount === 0) return 'Nada anotado neste mês.';
  if (m.leftCents > 0) return `Neste mês, entrou ${formatBRL(m.leftCents)} a mais do que saiu.`;
  if (m.leftCents < 0) return `Neste mês, saiu ${formatBRL(-m.leftCents)} a mais do que entrou.`;
  return 'Neste mês, entrou o mesmo que saiu.';
}

/**
 * Nos últimos meses: em quantos dos meses com anotação entrou mais do que saiu (a pergunta "o negócio está rendendo mais do que
 * custa?", respondida com fato). Nulo sem nenhum mês com anotação.
 */
export function businessPeriodText(months: readonly BusinessMonth[]): string | null {
  const noted = months.filter((m) => m.recordCount > 0);
  if (noted.length === 0 || months.length === 0) return null;
  const more = noted.filter((m) => m.leftCents > 0).length;
  const span = formatMonthSpanBR(months[0]!.month, months[months.length - 1]!.month);
  const total = noted.reduce((s, m) => s + m.leftCents, 0);
  const sum =
    total > 0
      ? `Somando, entrou ${formatBRL(total)} a mais do que saiu.`
      : total < 0
        ? `Somando, saiu ${formatBRL(-total)} a mais do que entrou.`
        : 'Somando, entrou o mesmo que saiu.';
  const head = span.charAt(0).toUpperCase() + span.slice(1);
  if (noted.length === 1) return `${head}, só um mês tem anotações. ${sum}`;
  return `${head}, entrou mais do que saiu em ${more} dos ${noted.length} meses com anotações. ${sum}`;
}

/** "nov." para as colunas dos últimos meses: o nome curto do mês. */
export function businessMonthShort(month: IsoMonth): string {
  return `${formatMonthName(month).slice(0, 3)}.`;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const BUSINESS_TEXT = {
  /** Nome genérico do espaço (quando o nome do negócio ainda não carregou). */
  context: 'Negócio',
  /** Card em Conta. */
  accountTitle: 'Espaço Negócio',
  accountHintNone:
    'Para quem tem CNPJ ou trabalha por conta: anote o que entra e o que sai do negócio num espaço separado do Pessoal e veja quanto sobrou no mês. Incluído no plano, um negócio por pessoa.',
  accountHintIn: (name: string): string => `${name}. Só você vê e anota. O Pessoal continua separado.`,
  accountCreate: 'Criar o espaço Negócio',
  accountOpen: 'Ver seu negócio',
  /** A linha do espaço Negócio na folha "Criar um espaço" (D-113b): para quem é, numa frase. */
  spaceHint: 'Para quem tem CNPJ ou trabalha por conta.',
  /** A linha no fim de "Primeiros passos" (D-113b), para quem ainda não tem negócio: leva a criar o espaço. Não é um passo. */
  firstStepsTip: 'Tem um negócio? Crie o espaço Negócio',
  /** Criar. */
  createTitle: 'Espaço Negócio',
  intro:
    'Para quem tem CNPJ ou trabalha por conta, como uma loja de conserto ou quem vende sacolé. Anote o que entrou (vendas e serviços) e o que saiu (material, peças, combustível, ajudantes, impostos e DAS, aluguel do ponto) e veja quanto sobrou, separado do Pessoal.',
  light: 'É leve: não é contabilidade e não substitui quem cuida dos impostos do negócio.',
  nameLabel: 'Nome do negócio',
  nameHint: 'Por exemplo: Sacolé da Mãe. O nome aparece no seletor de espaço.',
  createSubmit: 'Criar o espaço Negócio',
  created: 'Espaço Negócio criado. Toque no nome dele, no alto da tela, para anotar no negócio.',
  privacy: 'Só você vê e anota no espaço Negócio. O Pessoal continua separado: nada passa de um para o outro sem você pedir.',
  included: 'O plano inclui um negócio por pessoa, sem custo a mais.',
  demoOnly: 'Na demonstração, o negócio criado fica só nesta visita: recarregar a página volta a demonstração ao começo, com os dados fictícios de sempre.',
  loading: 'Carregando o espaço Negócio…',
  loadFailed: 'Não foi possível carregar o espaço Negócio. Tente de novo.',
  /** Seu negócio (/negocio, D-113b). */
  overviewTitle: 'Seu negócio',
  overviewLink: 'Seu negócio',
  overviewLinkHint: 'Entrou, saiu e sobrou no mês e nos últimos meses.',
  inLabel: 'Entrou',
  outLabel: 'Saiu',
  leftLabel: 'Sobrou',
  inCaption: 'Vendas, serviços e outras entradas',
  outCaption: 'O que o negócio gastou, sem as retiradas',
  monthLabel: (month: IsoMonth): string => `Mês: ${formatMonthYearBR(month)}`,
  withdrawnLine: (cents: Cents): string =>
    `Retiradas para o Pessoal: ${formatBRL(cents)}. Não entram em Saiu: é o dinheiro do negócio que foi para o Pessoal.`,
  keptLine: (cents: Cents): string =>
    cents >= 0 ? `Ficou no negócio, depois das retiradas: ${formatBRL(cents)}.` : `Depois das retiradas, saiu ${formatBRL(-cents)} a mais do que entrou.`,
  lastMonthsTitle: 'Últimos meses',
  lastMonthsNote: 'Entrou, saiu e sobrou em cada mês, sem as retiradas.',
  /** Com valores ocultos (`hidden`), sem o "menos": o nome acessível não revela se o mês ficou negativo (D-113a). */
  monthRowA11y: (m: BusinessMonth, hidden = false): string =>
    `${formatMonthYearBR(m.month)}: entrou ${formatBRL(m.inCents)}, saiu ${formatBRL(m.outCents)}, sobrou ${m.leftCents < 0 && !hidden ? `menos ${formatBRL(-m.leftCents)}` : formatBRL(Math.abs(m.leftCents))}`,
  topOutTitle: 'Maiores saídas do mês',
  noOut: 'Nenhuma saída anotada neste mês.',
  topOutA11y: (line: BusinessOutLine): string => `${line.category}: ${formatBRL(line.cents)}, ${Math.round(line.share * 100)}% das saídas`,
  emptyMonth: 'Nada anotado neste mês. Anote uma venda, um serviço ou um gasto do negócio em Movimentos.',
  notAdvice: 'Os valores são os que você anotou. A Clarevo não faz contabilidade nem cálculo de impostos.',
  /** Retirada para o Pessoal. */
  withdraw: 'Retirada para o Pessoal',
  withdrawHint: 'Para quando você leva dinheiro do negócio para o Pessoal. Sai do negócio e entra no Pessoal como recebimento, sem contar duas vezes.',
  withdrawTitle: 'Retirada para o Pessoal',
  withdrawFrom: 'Sai de (conta do negócio)',
  withdrawTo: 'Entra em (conta do Pessoal)',
  withdrawDescriptionLabel: 'Descrição (opcional)',
  withdrawDescriptionHint: (name: string): string => `Sem descrição, fica "Retirada para o Pessoal" no negócio e "Retirada de ${name}" no Pessoal.`,
  withdrawSubmit: 'Salvar retirada',
  withdrawSaved: 'Retirada salva: saiu do negócio e entrou no Pessoal.',
  withdrawalBusinessNote: 'Retirada para o Pessoal: este valor saiu do negócio e entrou no Pessoal como recebimento. Não entra em Saiu, em "Seu negócio".',
  withdrawalPersonalNote: (name: string | null): string =>
    name ? `Retirada do negócio: este valor saiu de ${name} e entrou no Pessoal.` : 'Retirada do negócio: este valor saiu do espaço Negócio e entrou no Pessoal.',
  withdrawalLocked: 'Uma retirada fica ligada nos dois espaços. Para mudar o valor ou a data, exclua a retirada e anote de novo.',
  seeOtherSide: (where: string): string => `Ver em ${where}`,
  deleteWithdrawal: 'Excluir a retirada',
  deleteWithdrawalTitle: 'Excluir a retirada?',
  deleteWithdrawalBody: 'A retirada sai do negócio e do Pessoal, junto.',
  withdrawalDeleted: 'Retirada excluída do negócio e do Pessoal.',
  /** Mover. */
  moveToBusiness: 'Mover para o espaço Negócio',
  moveToPersonal: 'Mover para o Pessoal',
  moveTitle: (to: string): string => `Mover para ${to}`,
  moveHint: 'Para o que foi anotado no lugar errado. O lançamento sai daqui e passa para o outro espaço, com a categoria e a conta que você escolher.',
  moveCategory: 'Categoria no outro espaço',
  moveAccount: 'Banco ou carteira no outro espaço',
  moveSubmit: 'Mover',
  moved: (to: string): string => `Lançamento movido para ${to}.`,
  moveLinked: 'Este lançamento está ligado a uma conta a pagar, uma fatura, um investimento ou uma retirada e não muda de espaço.',
  /** Abas que não são do negócio. */
  goalsHidden: 'Metas ficam no Pessoal e na Família. O espaço Negócio é só para o que entra e sai do negócio.',
  investHidden: 'Investimentos ficam no Pessoal. O espaço Negócio é só para o que entra e sai do negócio.',
  goPersonal: 'Ir para o Pessoal',
  /** Nome e encerrar. */
  settingsTitle: 'Nome e encerrar',
  rename: 'Mudar o nome',
  renameSubmit: 'Salvar o nome',
  renamed: 'Nome do negócio atualizado.',
  end: 'Encerrar o espaço Negócio',
  endTitle: 'Encerrar o espaço Negócio?',
  endBody:
    'O espaço sai do app. Os lançamentos dele ficam guardados, sem leitura, e são apagados de vez depois de 6 meses. As retiradas que já estão no Pessoal continuam lá, como recebimentos. Antes, se quiser, exporte os dados em Conta.',
  endConfirm: 'Encerrar',
  ended: 'Espaço Negócio encerrado.',
  /** Quem vê e conversas. */
  whoSees: 'Só você vê e anota no espaço Negócio. O Pessoal e a Família, se houver, continuam separados.',
  /** O canal pode estar ligado ao Pessoal ou à Família (D-113a): a frase diz só que o negócio fica de fora. */
  chatNote: 'O WhatsApp e o Telegram não anotam no espaço Negócio.',
} as const;

/**
 * O vocabulário do espaço Negócio nas telas de sempre (auditoria visual de 18/11/2026): entradas e saídas, como em "Seu negócio", nunca
 * Recebido e Pago, "Anotar gasto" ou "Registrar recebimento". O Pessoal e a Família continuam com o vocabulário de sempre. No Resumo do
 * negócio, o total da direita inclui as retiradas para o Pessoal (o dinheiro saiu do negócio); "Seu negócio" mostra Saiu sem elas e as
 * retiradas à parte (D-113(3)). Por isso, num mês com retirada, o Resumo diz "Saiu, com retiradas" e "Ficou no negócio".
 */
export const BUSINESS_WORDS = {
  in: 'Entrou',
  out: 'Saiu',
  outWithWithdrawals: 'Saiu, com retiradas',
  left: 'Sobrou',
  kept: 'Ficou no negócio',
  /** "Entrou menos saiu até 07/10 · não é saldo" (com retirada: "Entrou menos saiu, com as retiradas, ..."). */
  leftCaption: (viewedMonth: IsoMonth, today: IsoDate, withWithdrawals = false): string =>
    `Entrou menos saiu${withWithdrawals ? ', com as retiradas,' : ''} ${monthOf(today) === viewedMonth ? `até ${formatDayMonth(today)}` : 'no mês'} · não é saldo`,
  leftCaptionA11y: (viewedMonth: IsoMonth, today: IsoDate, withWithdrawals = false): string =>
    `Entrou menos saiu${withWithdrawals ? ', com as retiradas,' : ''} ${monthOf(today) === viewedMonth ? `até ${formatDayMonth(today)}` : 'no mês'}. Não é saldo.`,
  negative: 'Saídas acima das entradas no período',
  inHint: 'Abre as entradas do mês',
  outHint: 'Abre as saídas do mês, com a divisão por categoria',
  addOut: 'Anotar saída',
  addIn: 'Anotar entrada',
  editOut: 'Editar saída',
  editIn: 'Editar entrada',
  saveOut: 'Salvar saída',
  saveIn: 'Salvar entrada',
  outDone: 'Saída já feita',
  inDone: 'Entrada já feita',
  outDate: 'Data da saída',
  inDate: 'Data da entrada',
  /** O tipo na linha de um lançamento ("Saída · 06/10/2026"). */
  outRow: 'Saída',
  inRow: 'Entrada',
  outsTitle: 'Saídas do mês',
  noOuts: (month: IsoMonth): string => `Nenhuma saída em ${formatMonthName(month)}`,
  noOutsBody: 'Anote uma saída já feita para ver o efeito no mês.',
  filterIn: 'Entradas',
  filterOut: 'Saídas',
  /** "Entrou em outubro" e "Saiu em outubro", nos totais de Movimentos. */
  inMonth: (month: IsoMonth): string => `Entrou em ${formatMonthName(month)}`,
  outMonth: (month: IsoMonth): string => `Saiu em ${formatMonthName(month)}`,
  emptyList: 'Entradas e saídas já feitas aparecem aqui, da mais recente para a mais antiga.',
  /** Exemplos de "Gastos fixos e parcelamentos" em Organizar, no negócio. */
  seriesExamples: 'Aluguel do ponto, DAS, maquininha e fornecedor',
} as const;

/** Textos de erro das telas do negócio (nomes e regras do banco). */
export const BUSINESS_ERROR_TEXT = {
  nome_do_negocio_invalido: 'Dê um nome de 1 a 60 caracteres para o negócio.',
  ja_tem_negocio: 'Você já tem um espaço Negócio. O plano inclui um negócio por pessoa.',
  negocio_com_membros: 'Só dá para encerrar o espaço Negócio quando só você participa dele.',
  retirada_ligada: BUSINESS_TEXT.withdrawalLocked,
  nao_e_retirada: ERROR_TEXT.salvar_falhou,
  lancamento_ligado: BUSINESS_TEXT.moveLinked,
  contexto_invalido: ERROR_TEXT.salvar_falhou,
  sem_permissao: 'Só quem é titular do negócio pode fazer isto.',
  nao_encontrado: 'Este espaço Negócio ou lançamento não está mais disponível. Atualize a tela.',
  chave_reutilizada: ERROR_TEXT.salvar_falhou,
  versao_desatualizada: ERROR_TEXT.versao_desatualizada,
  conta_invalida: ERROR_TEXT.conta_invalida,
  valor_invalido: ERROR_TEXT.valor_invalido,
  valor_acima_do_limite: ERROR_TEXT.valor_acima_do_limite,
  data_invalida: ERROR_TEXT.data_invalida,
  data_futura: ERROR_TEXT.data_futura,
  descricao_longa: ERROR_TEXT.descricao_longa,
  categoria_invalida: ERROR_TEXT.categoria_invalida,
  rede: 'Sem conexão no momento. Tente de novo.',
  salvar_falhou: ERROR_TEXT.salvar_falhou,
  carregar_falhou: ERROR_TEXT.carregar_falhou,
} as const;

/** Texto de um erro das telas do negócio; o que não é conhecido cai em "Não foi possível salvar...". */
export function businessErrorText(code: string): string {
  return (BUSINESS_ERROR_TEXT as Record<string, string>)[code] ?? BUSINESS_ERROR_TEXT.salvar_falhou;
}

/** Os códigos que as funções do negócio lançam, além dos comuns. */
export const BUSINESS_ERROR_CODES: readonly RepoErrorCode[] = [
  'nome_do_negocio_invalido',
  'ja_tem_negocio',
  'negocio_com_membros',
  'retirada_ligada',
  'nao_e_retirada',
  'lancamento_ligado',
];
