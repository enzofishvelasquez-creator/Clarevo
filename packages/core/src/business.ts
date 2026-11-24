import type { IsoMonth } from './dates';
import { addMonths, formatDayMonth, formatMonthName, formatMonthSpanBR, formatMonthYearBR, monthOf, parseDateBR, type IsoDate } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, formatBRL, parseBRL } from './money';
import type { ContextKind, FinancialRecord, RecordKind } from './records';
import { CATEGORIES, NO_CATEGORY_LABEL, recordMonth } from './records';
import type { FamilyRole } from './family';
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
 * contabilidade. D-121 (24/11/2026, pesquisa de 18/11): "Divulgação", "Contabilidade e sistemas" e "Juros e multas" entram nas saídas da
 * operação (ainda fora do orçamento, que segue com as 9 de BUSINESS_BUDGET_CATEGORIES); "Empréstimo recebido", "Parcela de empréstimo" e "Equipamento" são categorias de
 * escolha que ficam fora da operação em "Seu negócio" (o dinheiro entrou ou saiu de verdade, mas não é venda nem gasto do dia a dia) e
 * fora do orçamento.
 */
export const BUSINESS_CATEGORIES: Readonly<Record<RecordKind, readonly string[]>> = {
  receita: ['Vendas', 'Serviços', 'Outras entradas', 'Empréstimo recebido'],
  despesa: [
    'Material e mercadoria',
    'Peças e ferramentas',
    'Combustível e transporte',
    'Funcionários e ajudantes',
    'Impostos e DAS',
    'Aluguel do ponto',
    'Contas do ponto',
    'Taxas e maquininha',
    'Divulgação',
    'Contabilidade e sistemas',
    'Juros e multas',
    'Outras saídas',
    'Parcela de empréstimo',
    'Equipamento',
  ],
};

/**
 * As 9 categorias do orçamento do negócio, na ordem do banco (clarevo_budget_categories, migração 0042). D-121: "Divulgação",
 * "Contabilidade e sistemas" e "Juros e multas" são saídas da operação que se anotam, mas ainda não entram no orçamento (decisão de
 * 24/11/2026: a 0044 não muda o orçamento, para o app publicado continuar lendo o orçamento do negócio; uma migração depois as acrescenta,
 * antes de "Outras saídas", quando esta versão do app estiver em todos os aparelhos). As de fora da operação e a retirada não têm orçamento.
 */
export const BUSINESS_BUDGET_CATEGORIES: readonly string[] = [
  'Material e mercadoria',
  'Peças e ferramentas',
  'Combustível e transporte',
  'Funcionários e ajudantes',
  'Impostos e DAS',
  'Aluguel do ponto',
  'Contas do ponto',
  'Taxas e maquininha',
  'Outras saídas',
];

/** A categoria do gasto da retirada no negócio (fora da lista de escolha: só a retirada usa). */
export const WITHDRAWAL_BUSINESS_CATEGORY = 'Retirada para o Pessoal';
/** A categoria do recebimento da retirada no Pessoal. */
export const WITHDRAWAL_PERSONAL_CATEGORY = 'Retirada do negócio';
/** A entrada no negócio do dinheiro trazido do Pessoal (D-121; fora da lista de escolha: só "Trazer dinheiro do Pessoal" usa). */
export const CONTRIBUTION_BUSINESS_CATEGORY = 'Dinheiro do Pessoal';
/** O gasto no Pessoal do dinheiro levado para o negócio (fora da lista de escolha). */
export const CONTRIBUTION_PERSONAL_CATEGORY = 'Dinheiro para o negócio';

/**
 * Fora da operação (D-121): o que entra ou sai do negócio sem ser venda nem gasto do dia a dia. Entradas: o dinheiro trazido do Pessoal e o
 * empréstimo recebido; saídas: a parcela de empréstimo e o equipamento. A retirada para o Pessoal fica à parte, como sempre.
 */
export const BUSINESS_OUTSIDE_CATEGORIES: Readonly<Record<RecordKind, readonly string[]>> = {
  receita: [CONTRIBUTION_BUSINESS_CATEGORY, 'Empréstimo recebido'],
  despesa: ['Parcela de empréstimo', 'Equipamento'],
};

/**
 * As categorias de uma compra no cartão (D-121): sem as saídas de fora da operação ("Parcela de empréstimo" e "Equipamento"). A compra no
 * cartão chega a "Seu negócio" só pelo pagamento da fatura, gravado sem categoria, que entra em Saiu: oferecer essas duas no cartão diria
 * "fora da operação" para um valor que fica na operação. Pagas por banco ou carteira (ou como conta a pagar), elas continuam à escolha.
 */
export function cardCategories(categories: readonly string[]): readonly string[] {
  return categories.filter((c) => !BUSINESS_OUTSIDE_CATEGORIES.despesa.includes(c));
}

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

/** As categorias do orçamento no contexto: as 7 de gasto do Pessoal e da Família; no negócio, as 9 de BUSINESS_BUDGET_CATEGORIES. */
export function budgetCategoriesFor(context: ContextKind): readonly string[] {
  return context === 'negocio' ? BUSINESS_BUDGET_CATEGORIES : CATEGORIES.despesa;
}

/**
 * O negócio como o app lê. `role` é o papel de quem consulta (D-120): quem criou administra ('titular'); com o negócio compartilhado
 * (Clarevo Plus, business-people.ts), as outras pessoas anotam e veem ('membro') ou só veem ('leitor'). No banco, vem do vínculo da
 * própria pessoa em context_memberships (a política memberships_read deixa ler o próprio vínculo), sem depender da migração 0043.
 */
export interface BusinessContext {
  id: string;
  name: string;
  createdAt: string;
  role: FamilyRole;
  /** O tipo do negócio (D-121), opcional: null é "Prefiro não dizer" (e o negócio de antes da migração 0044). */
  businessProfile: BusinessProfile | null;
}

/**
 * O tipo do negócio (D-121), opcional e sem número de CNPJ: muda só alguns textos e, no MEI, mostra o limite anual. Só quem administra
 * muda (set_business_profile). Os mesmos valores do banco (financial_contexts.business_profile).
 */
export type BusinessProfile = 'sem_cnpj' | 'mei' | 'me_epp';
export const BUSINESS_PROFILES: readonly BusinessProfile[] = ['sem_cnpj', 'mei', 'me_epp'];
export const BUSINESS_PROFILE_LABEL: Readonly<Record<BusinessProfile, string>> = {
  sem_cnpj: 'Sem CNPJ (por conta própria)',
  mei: 'MEI',
  me_epp: 'Microempresa ou empresa de pequeno porte',
};
/** A opção sem tipo ("Prefiro não dizer"): grava nulo. */
export const BUSINESS_PROFILE_NONE_LABEL = 'Prefiro não dizer';

export function isBusinessProfile(value: unknown): value is BusinessProfile {
  return typeof value === 'string' && (BUSINESS_PROFILES as readonly string[]).includes(value);
}

/** A vaga da chave de operação de cada escolha do tipo do negócio: uma por opção (a repetição depois de um resultado incerto usa a mesma). */
export function businessProfileSlot(businessId: string, profile: BusinessProfile | null): string {
  return `perfil:${businessId}:${profile ?? 'nenhum'}`;
}

/**
 * As vagas das outras opções, que a tela solta ao escolher uma: depois de um resultado incerto em "MEI", escolher outra opção e voltar a
 * "MEI" precisa gravar de novo (com a chave antiga, o banco só repetiria a operação antiga e devolveria o tipo de agora).
 */
export function otherBusinessProfileSlots(businessId: string, profile: BusinessProfile | null): string[] {
  return [...BUSINESS_PROFILES, null].filter((p) => p !== profile).map((p) => businessProfileSlot(businessId, p));
}

/** O tipo lido do banco: um dos três ou nulo (o que não for conhecido, inclusive a coluna ausente, vira nulo). */
export function businessProfileOf(value: unknown): BusinessProfile | null {
  return isBusinessProfile(value) ? value : null;
}

/** Ações do negócio gravadas em record_operations. Criar, renomear e encerrar não contam como anotação na atividade. */
export type BusinessAction =
  | 'criar_negocio'
  | 'renomear_negocio'
  | 'encerrar_negocio'
  | 'criar_retirada_negocio'
  | 'excluir_retirada_negocio'
  | 'mover_lancamento'
  | 'criar_aporte_negocio'
  | 'definir_perfil_negocio';

/** As seis da migração 0042 e as duas da 0044 (D-121): trazer dinheiro do Pessoal (conta como anotação) e definir o tipo (não conta). */
export const BUSINESS_ACTIONS: readonly BusinessAction[] = [
  'criar_negocio',
  'renomear_negocio',
  'encerrar_negocio',
  'criar_retirada_negocio',
  'excluir_retirada_negocio',
  'mover_lancamento',
  'criar_aporte_negocio',
  'definir_perfil_negocio',
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

/**
 * Trazer dinheiro do Pessoal (D-121), o inverso da retirada: o que a pessoa informa é o mesmo (as duas contas, valor, data e descrição
 * opcional). Sai do Pessoal (gasto "Dinheiro para o negócio") e entra no negócio (entrada "Dinheiro do Pessoal"), ligados.
 */
export type BusinessContributionInput = BusinessWithdrawalInput;
/** Os dois lados do dinheiro trazido do Pessoal: a entrada no negócio e o gasto no Pessoal. */
export type BusinessContribution = BusinessWithdrawal;

/** A descrição padrão de cada lado do dinheiro trazido do Pessoal (a mesma do banco, create_business_contribution). */
export function contributionDescriptions(businessName: string, description: string | null): { business: string; personal: string } {
  const own = typeof description === 'string' ? description.trim() : '';
  if (own !== '') return { business: own, personal: own };
  return { business: CONTRIBUTION_BUSINESS_CATEGORY, personal: [...`Dinheiro para ${businessName}`].slice(0, 80).join('') };
}

/** O par ligado entre o negócio e o Pessoal: a retirada (sai do negócio) ou o dinheiro trazido do Pessoal (entra no negócio). */
export type BusinessPairKind = 'retirada' | 'aporte';

/**
 * Que par é um lado ligado, pelo tipo do lançamento e o espaço em que está: no negócio, o gasto é a retirada e a entrada é o dinheiro
 * trazido do Pessoal; no Pessoal, o contrário (o mesmo critério do banco, que acha o lado do negócio pelo tipo do espaço).
 */
export function businessPairKind(kind: RecordKind, inBusiness: boolean): BusinessPairKind {
  return (kind === 'despesa') === inBusiness ? 'retirada' : 'aporte';
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
 * O gasto do negócio é uma retirada para o Pessoal, ligada ou não: a ligação ou a categoria "Retirada para o Pessoal", que só a função
 * da retirada grava (fora da lista de escolha). Depois de sair do negócio, ser removida ou encerrar (D-120), os dois lados deixam de ser
 * ligados, mas o gasto continua sendo uma retirada: "Seu negócio" não o passa para Saiu, e os meses que já passaram não mudam. Só gasto:
 * a entrada ligada no negócio é o dinheiro trazido do Pessoal (D-121).
 */
export function isBusinessWithdrawal(record: Pick<FinancialRecord, 'pairedRecordId' | 'kind' | 'category'>): boolean {
  return record.kind === 'despesa' && (isWithdrawal(record) || record.category === WITHDRAWAL_BUSINESS_CATEGORY);
}

/**
 * Onde um lançamento do negócio entra em "Seu negócio" (D-121): na operação (Entrou e Saiu), fora da operação (o dinheiro trazido do
 * Pessoal, ligado ou não, o empréstimo recebido, a parcela de empréstimo e o equipamento) ou nas retiradas. No Resumo, em Movimentos, nas
 * Análises e no orçamento nada muda: o dinheiro entrou ou saiu de verdade.
 */
export type BusinessFlow = 'operacao' | 'fora' | 'retirada';

export function businessFlowOf(record: Pick<FinancialRecord, 'pairedRecordId' | 'kind' | 'category'>): BusinessFlow {
  if (isBusinessWithdrawal(record)) return 'retirada';
  if (record.kind === 'receita' && isWithdrawal(record)) return 'fora';
  return record.category !== null && record.category !== undefined && BUSINESS_OUTSIDE_CATEGORIES[record.kind].includes(record.category) ? 'fora' : 'operacao';
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

/** Uma categoria de fora da operação, com o que entrou ou saiu nela. */
export interface BusinessOutsideLine {
  kind: RecordKind;
  category: string;
  cents: Cents;
}

/**
 * O mês do negócio. Entrou, Saiu e Sobrou são só da operação (D-121): as retiradas para o Pessoal ficam à parte, em withdrawnCents, e o que
 * entrou ou saiu fora da operação, em outsideInCents e outsideOutCents. "Ficou no negócio" (keptCents) soma tudo.
 */
export interface BusinessMonth {
  month: IsoMonth;
  /** As entradas da operação (vendas, serviços e outras entradas). */
  inCents: Cents;
  /** As saídas da operação, sem as retiradas e sem as de fora da operação. */
  outCents: Cents;
  /** Entrou menos saiu, na operação (pode ser negativo). */
  leftCents: Cents;
  /** O que entrou fora da operação (o dinheiro trazido do Pessoal e o empréstimo recebido). */
  outsideInCents: Cents;
  /** O que saiu fora da operação (a parcela de empréstimo e o equipamento). */
  outsideOutCents: Cents;
  /** Fora da operação, por categoria: as entradas primeiro, na ordem das categorias. */
  outside: BusinessOutsideLine[];
  /** O que foi para o Pessoal no mês (retiradas). */
  withdrawnCents: Cents;
  /**
   * O que ficou no negócio, contando tudo: sobrou, mais o que entrou e menos o que saiu fora da operação, menos as retiradas (é a Diferença
   * do Resumo do negócio).
   */
  keptCents: Cents;
  /** Lançamentos do mês, com as retiradas e os de fora da operação. */
  recordCount: number;
}

/** A ordem das categorias de fora da operação: as entradas, depois as saídas, cada uma na ordem da lista; uma desconhecida no fim. */
function outsideOrder(line: Pick<BusinessOutsideLine, 'kind' | 'category'>): number {
  const own = BUSINESS_OUTSIDE_CATEGORIES[line.kind].indexOf(line.category);
  return (line.kind === 'receita' ? 0 : 10) + (own < 0 ? 9 : own);
}

/** Entrou, saiu, fora da operação e retiradas dos lançamentos que `keep` aceita. */
function tallyBusiness(records: readonly FinancialRecord[], keep: (r: FinancialRecord) => boolean): Omit<BusinessMonth, 'month'> {
  let inCents = 0;
  let outCents = 0;
  let outsideInCents = 0;
  let outsideOutCents = 0;
  let withdrawnCents = 0;
  let recordCount = 0;
  const outside = new Map<string, BusinessOutsideLine>();
  for (const r of records) {
    if (!keep(r)) continue;
    recordCount += 1;
    const flow = businessFlowOf(r);
    if (flow === 'retirada') withdrawnCents += r.amountCents;
    else if (flow === 'fora') {
      if (r.kind === 'receita') outsideInCents += r.amountCents;
      else outsideOutCents += r.amountCents;
      const category = r.category ?? CONTRIBUTION_BUSINESS_CATEGORY;
      const key = `${r.kind}|${category}`;
      const line = outside.get(key) ?? { kind: r.kind, category, cents: 0 };
      outside.set(key, { ...line, cents: line.cents + r.amountCents });
    } else if (r.kind === 'receita') inCents += r.amountCents;
    else outCents += r.amountCents;
  }
  const leftCents = inCents - outCents;
  return {
    inCents,
    outCents,
    leftCents,
    outsideInCents,
    outsideOutCents,
    outside: [...outside.values()].sort((a, b) => outsideOrder(a) - outsideOrder(b) || a.category.localeCompare(b.category, 'pt-BR')),
    withdrawnCents,
    keptCents: leftCents + outsideInCents - outsideOutCents - withdrawnCents,
    recordCount,
  };
}

/** O mês do negócio pelos lançamentos do contexto (o mês em que cada um conta, como no Resumo). */
export function businessMonth(records: readonly FinancialRecord[], contextId: string, month: IsoMonth): BusinessMonth {
  return { month, ...tallyBusiness(records, (r) => r.contextId === contextId && r.status === 'realizado' && recordMonth(r) === month) };
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

/**
 * As maiores saídas do mês por categoria (só da operação: sem as retiradas e sem as de fora da operação), da maior para a menor; "Sem
 * categoria" para as sem categoria.
 */
export function businessTopOut(records: readonly FinancialRecord[], contextId: string, month: IsoMonth, limit = 5): BusinessOutLine[] {
  const by = new Map<string, number>();
  let total = 0;
  for (const r of records) {
    if (r.contextId !== contextId || r.status !== 'realizado' || r.kind !== 'despesa' || businessFlowOf(r) !== 'operacao' || recordMonth(r) !== month) continue;
    const key = r.category ?? NO_CATEGORY_LABEL;
    by.set(key, (by.get(key) ?? 0) + r.amountCents);
    total += r.amountCents;
  }
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, limit)
    .map(([category, cents]) => ({ category, cents, share: total > 0 ? cents / total : 0 }));
}

/** O mês tem algo anotado na operação (vendas, serviços e gastos do dia a dia)? Todo lançamento vale R$ 0,01 ou mais. */
function hasOperation(m: Pick<BusinessMonth, 'inCents' | 'outCents'>): boolean {
  return m.inCents > 0 || m.outCents > 0;
}

/**
 * A frase do mês, de fato e sem julgamento. Diz "na operação" (D-121): Entrou, Saiu e Sobrou de "Seu negócio" não contam o que fica fora da
 * operação nem as retiradas, e o Resumo do negócio conta. Um mês só com algo fora da operação (um empréstimo, por exemplo) ou só com
 * retiradas não vira "entrou o mesmo que saiu".
 */
export function businessResultText(m: BusinessMonth): string {
  if (m.recordCount === 0) return 'Nada anotado neste mês.';
  if (!hasOperation(m)) return 'Neste mês, nada foi anotado na operação (vendas, serviços e gastos do dia a dia).';
  if (m.leftCents > 0) return `Neste mês, na operação, entrou ${formatBRL(m.leftCents)} a mais do que saiu.`;
  if (m.leftCents < 0) return `Neste mês, na operação, saiu ${formatBRL(-m.leftCents)} a mais do que entrou.`;
  return 'Neste mês, na operação, entrou o mesmo que saiu.';
}

/**
 * Nos últimos meses: em quantos dos meses com anotação entrou mais do que saiu (a pergunta "o negócio está rendendo mais do que
 * custa?", respondida com fato). Nulo sem nenhum mês com anotação.
 */
export function businessPeriodText(months: readonly BusinessMonth[]): string | null {
  // Os meses com algo da operação (D-121: um mês só com empréstimo ou retirada não conta como mês em que entrou o mesmo que saiu).
  const noted = months.filter(hasOperation);
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
// Resumo do ano e limite do MEI (D-121)
// ---------------------------------------------------------------------------

/**
 * Limite anual de receita bruta do MEI: R$ 81.000,00, ou R$ 6.750,00 por mês de atividade no ano em que o MEI foi aberto (Lei Complementar
 * 123/2006, art. 18-A, §§ 1º e 2º). Valor em vigor em novembro de 2026, conferido na pesquisa de 18/11/2026: os projetos que sobem o limite
 * (PLP 108/2021 e PLP 186/2026) ainda não tinham aprovação final. Se a regra mudar, troque aqui e nos textos.
 */
export const MEI_ANNUAL_LIMIT_CENTS: Cents = 8_100_000;
/** O limite por mês no ano de abertura (R$ 81.000,00 dividido por 12). */
export const MEI_MONTHLY_LIMIT_CENTS: Cents = 675_000;
/** As duas categorias que o limite do MEI soma (as duas linhas de receita da declaração anual do MEI). */
export const MEI_REVENUE_CATEGORIES: readonly string[] = ['Vendas', 'Serviços'];

/** Uma categoria no resumo do ano, com o total. */
export interface BusinessYearLine {
  category: string;
  cents: Cents;
}

/** O ano do negócio (D-121): a operação por categoria, o que ficou fora da operação, as retiradas e o que ficou no negócio. */
export interface BusinessYear {
  year: number;
  /** As entradas da operação por categoria (na ordem da lista do negócio; "Sem categoria" e as desconhecidas no fim). */
  inLines: BusinessYearLine[];
  /** As saídas da operação por categoria, na mesma ordem. */
  outLines: BusinessYearLine[];
  inCents: Cents;
  outCents: Cents;
  leftCents: Cents;
  outside: BusinessOutsideLine[];
  outsideInCents: Cents;
  outsideOutCents: Cents;
  withdrawnCents: Cents;
  keptCents: Cents;
  /**
   * As vendas e os serviços do ano (as categorias "Vendas" e "Serviços"), para o MEI, pela data de cada entrada (occurredOn), e não pelo mês em
   * que contam: uma venda de 30/12 marcada para o mês seguinte fica no ano dela. Para isso, as leituras incluem janeiro do ano seguinte.
   */
  salesCents: Cents;
  servicesCents: Cents;
  recordCount: number;
}

/** Ordem de uma categoria do negócio na lista dela; "Sem categoria" e as desconhecidas no fim. */
function businessCategoryOrder(kind: RecordKind, category: string): number {
  const i = BUSINESS_CATEGORIES[kind].indexOf(category);
  return i < 0 ? 99 : i;
}

function sortedLines(by: Map<string, number>, kind: RecordKind): BusinessYearLine[] {
  return [...by.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => businessCategoryOrder(kind, a.category) - businessCategoryOrder(kind, b.category) || a.category.localeCompare(b.category, 'pt-BR'));
}

/**
 * O ano do negócio pelos lançamentos do contexto, mês a mês como em "Seu negócio" (o mês em que cada um conta): somar os doze meses dá o
 * mesmo. Um lançamento repetido (o mesmo id em duas leituras) conta uma vez.
 */
export function businessYear(records: readonly FinancialRecord[], contextId: string, year: number): BusinessYear {
  const seen = new Set<string>();
  const inBy = new Map<string, number>();
  const outBy = new Map<string, number>();
  const prefix = `${String(year).padStart(4, '0')}-`;
  const own: FinancialRecord[] = [];
  let salesCents = 0;
  let servicesCents = 0;
  for (const r of records) {
    if (r.contextId !== contextId || r.status !== 'realizado' || seen.has(r.id)) continue;
    seen.add(r.id);
    // O limite do MEI: pela data da entrada.
    if (r.occurredOn.startsWith(prefix) && r.kind === 'receita' && businessFlowOf(r) === 'operacao') {
      if (r.category === 'Vendas') salesCents += r.amountCents;
      else if (r.category === 'Serviços') servicesCents += r.amountCents;
    }
    if (!recordMonth(r).startsWith(prefix)) continue;
    own.push(r);
    if (businessFlowOf(r) !== 'operacao') continue;
    const key = r.category ?? NO_CATEGORY_LABEL;
    const by = r.kind === 'receita' ? inBy : outBy;
    by.set(key, (by.get(key) ?? 0) + r.amountCents);
  }
  // O que fica fora da operação e as retiradas, com as mesmas regras do mês.
  const total = tallyBusiness(own, () => true);
  return {
    year,
    inLines: sortedLines(inBy, 'receita'),
    outLines: sortedLines(outBy, 'despesa'),
    inCents: total.inCents,
    outCents: total.outCents,
    leftCents: total.leftCents,
    outside: total.outside,
    outsideInCents: total.outsideInCents,
    outsideOutCents: total.outsideOutCents,
    withdrawnCents: total.withdrawnCents,
    keptCents: total.keptCents,
    salesCents,
    servicesCents,
    recordCount: total.recordCount,
  };
}

/** O limite do MEI no ano: vendas e serviços anotados, a parte do limite anual (em %, para baixo) e se passou de 100%. */
export interface MeiLimit {
  year: number;
  revenueCents: Cents;
  /** Parte do limite anual em pontos inteiros, para baixo (79,9% vira 79%); acima de zero e abaixo de 1%, 0. */
  percent: number;
  over: boolean;
}

export function meiLimit(year: number, salesCents: Cents, servicesCents: Cents): MeiLimit {
  const revenueCents = Math.max(0, salesCents) + Math.max(0, servicesCents);
  return { year, revenueCents, percent: Math.floor((revenueCents * 100) / MEI_ANNUAL_LIMIT_CENTS), over: revenueCents > MEI_ANNUAL_LIMIT_CENTS };
}

/** A parte do limite como texto: "80%", "menos de 1%" ou "0%". */
function meiPercentText(m: MeiLimit): string {
  if (m.revenueCents > 0 && m.percent === 0) return 'menos de 1%';
  return `${m.percent}%`;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/**
 * Ajuda curta de algumas categorias do negócio, embaixo da escolha nos formulários (D-121). As de fora da operação dizem por que não
 * entram em Entrou e Saiu.
 */
export const BUSINESS_CATEGORY_HINTS: Readonly<Record<string, string>> = {
  'Contas do ponto': 'Luz, água, internet e gás do ponto, ou da parte da casa usada no trabalho.',
  Divulgação: 'Anúncios, panfletos, cartões de visita e posts pagos.',
  'Contabilidade e sistemas': 'Quem cuida da contabilidade e os sistemas ou aplicativos que o negócio paga.',
  'Juros e multas': 'Juros e multas por atraso, de contas, impostos ou do banco.',
  'Empréstimo recebido': 'Fica fora da operação em "Seu negócio": é dinheiro emprestado, não venda.',
  'Parcela de empréstimo': 'Fica fora da operação em "Seu negócio": é a volta de um empréstimo, não gasto do dia a dia.',
  Equipamento: 'Máquinas, ferramentas grandes e móveis. Fica fora da operação em "Seu negócio": é uma compra que dura.',
};

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
  outCaption: 'O que a operação gastou, sem as retiradas',
  monthLabel: (month: IsoMonth): string => `Mês: ${formatMonthYearBR(month)}`,
  withdrawnLine: (cents: Cents): string =>
    `Retiradas para o Pessoal: ${formatBRL(cents)}. Não entram em Saiu: é o dinheiro do negócio que foi para o Pessoal.`,
  /**
   * O que ficou no negócio, contando tudo (D-121). Só com retiradas, a frase de sempre ("depois das retiradas"); com o que entrou ou saiu
   * fora da operação, a frase diz que conta também com isso.
   */
  keptLine: (cents: Cents, outside = false, withdrawn = true): string => {
    const what = outside ? (withdrawn ? 'com o que ficou fora da operação e depois das retiradas' : 'com o que ficou fora da operação') : 'depois das retiradas';
    if (cents >= 0) return `Ficou no negócio, ${what}: ${formatBRL(cents)}.`;
    return `${what.charAt(0).toUpperCase()}${what.slice(1)}, saiu ${formatBRL(-cents)} a mais do que entrou.`;
  },
  /** Fora da operação (D-121): o que entrou ou saiu do negócio sem ser venda nem gasto do dia a dia, com uma frase do porquê. */
  outsideTitle: 'Fora da operação',
  outsideWhy: 'Não entram em Entrou nem em Saiu: o dinheiro entrou ou saiu do negócio, mas não é venda nem gasto do dia a dia.',
  outsideIn: 'Entrou',
  outsideOut: 'Saiu',
  outsideA11y: (line: BusinessOutsideLine): string => `${line.category}: ${line.kind === 'receita' ? 'entrou' : 'saiu'} ${formatBRL(line.cents)}, fora da operação`,
  lastMonthsTitle: 'Últimos meses',
  lastMonthsNote: 'Entrou, saiu e sobrou da operação em cada mês, sem as retiradas.',
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
  /** Rótulos das contas; com uma conta só, "Sai do negócio: Conta do negócio" (revisão de 23/11/2026: era "Sai de (conta do negócio): ..."). */
  withdrawFrom: 'Sai do negócio',
  withdrawTo: 'Entra no Pessoal',
  withdrawDescriptionLabel: 'Descrição (opcional)',
  withdrawDescriptionHint: (name: string): string => `Sem descrição, fica "Retirada para o Pessoal" no negócio e "Retirada de ${name}" no Pessoal.`,
  withdrawSubmit: 'Salvar retirada',
  withdrawSaved: 'Retirada salva: saiu do negócio e entrou no Pessoal.',
  withdrawalBusinessNote: 'Retirada para o Pessoal: este valor saiu do negócio e entrou no Pessoal como recebimento. Não entra em Saiu, em "Seu negócio".',
  withdrawalPersonalNote: (name: string | null): string =>
    name ? `Retirada do negócio: este valor saiu de ${name} e entrou no Pessoal.` : 'Retirada do negócio: este valor saiu do espaço Negócio e entrou no Pessoal.',
  withdrawalLocked: 'Uma retirada fica ligada nos dois espaços. Para mudar o valor ou a data, exclua a retirada e anote de novo.',
  /** A recusa retirada_ligada, para os dois pares (a retirada e o dinheiro trazido do Pessoal, D-121). */
  pairLocked: 'Este lançamento está ligado a outro espaço. Para mudar o valor ou a data, exclua e anote de novo.',
  /** A recusa nao_e_retirada: o lançamento deixou de estar ligado (outra tela ou outra pessoa mudou). */
  pairGone: 'Este lançamento não está mais ligado a outro espaço. Atualize a tela.',
  seeOtherSide: (where: string): string => `Ver em ${where}`,
  deleteWithdrawal: 'Excluir a retirada',
  deleteWithdrawalTitle: 'Excluir a retirada?',
  deleteWithdrawalBody: 'A retirada sai do negócio e do Pessoal, junto.',
  withdrawalDeleted: 'Retirada excluída do negócio e do Pessoal.',
  /** Trazer dinheiro do Pessoal (D-121), o inverso da retirada. */
  contribute: 'Trazer dinheiro do Pessoal',
  contributeHint: 'Para quando você põe dinheiro do Pessoal no negócio. Sai do Pessoal e entra no negócio, sem contar duas vezes, e fica fora da operação em "Seu negócio".',
  contributeTitle: 'Trazer dinheiro do Pessoal',
  contributeFrom: 'Sai do Pessoal',
  contributeTo: 'Entra no negócio',
  contributeDate: 'Data',
  contributeDescriptionHint: (name: string): string => `Sem descrição, fica "Dinheiro do Pessoal" no negócio e "Dinheiro para ${name}" no Pessoal.`,
  contributeSubmit: 'Salvar',
  contributeSaved: 'Salvo: saiu do Pessoal e entrou no negócio.',
  contributionBusinessNote: 'Dinheiro do Pessoal: este valor saiu do Pessoal e entrou no negócio. Fica fora da operação, em "Seu negócio".',
  contributionPersonalNote: (name: string | null): string =>
    name ? `Dinheiro para o negócio: este valor saiu do Pessoal e entrou em ${name}.` : 'Dinheiro para o negócio: este valor saiu do Pessoal e entrou no espaço Negócio.',
  contributionLocked: 'O dinheiro trazido do Pessoal fica ligado nos dois espaços. Para mudar o valor ou a data, exclua e anote de novo.',
  deleteContribution: 'Excluir dos dois espaços',
  deleteContributionTitle: 'Excluir o dinheiro trazido do Pessoal?',
  deleteContributionBody: 'Sai do negócio e do Pessoal, junto.',
  contributionDeleted: 'Excluído do negócio e do Pessoal.',
  /** Tipo do negócio (D-121), opcional; só quem administra muda. */
  profileTitle: 'Tipo do negócio',
  profileHint: 'Opcional. Com "MEI", "Seu negócio" mostra o limite anual de vendas e serviços. A Clarevo não pede o número do CNPJ.',
  profileSaved: 'Tipo do negócio salvo.',
  profileNoneSaved: 'Tipo do negócio tirado.',
  /** Limite do MEI (D-121): só com o tipo MEI; fato, sem cor de alerta e sem julgamento. */
  meiTitle: 'Limite do MEI',
  meiLine: (m: MeiLimit): string =>
    `Vendas e serviços anotados em ${m.year}: ${formatBRL(m.revenueCents)}, ${meiPercentText(m)} do limite anual do MEI (${formatBRL(MEI_ANNUAL_LIMIT_CENTS)}).`,
  /** Com valores ocultos, sem a parte do limite (ela diria o valor). */
  meiLineHidden: (m: MeiLimit): string => `Vendas e serviços anotados em ${m.year}: ${formatBRL(m.revenueCents)}. Limite anual do MEI: ${formatBRL(MEI_ANNUAL_LIMIT_CENTS)}.`,
  meiNone: (year: number): string => `Nenhuma venda ou serviço anotado em ${year}. O limite anual do MEI é ${formatBRL(MEI_ANNUAL_LIMIT_CENTS)}.`,
  meiNote: `Os valores são os que você anotou. No ano em que o MEI foi aberto, o limite é proporcional aos meses (${formatBRL(MEI_MONTHLY_LIMIT_CENTS)} por mês).`,
  meiOver: 'Os valores são os que você anotou. Se tiver dúvida, procure orientação de contabilidade.',
  /** Com valores ocultos, uma frase só, que não diz se passou do limite nem se não há venda anotada. */
  meiHiddenNote: 'Os valores são os que você anotou. Com os valores ocultos, a parte do limite não aparece.',
  meiCounts: 'Conta só as entradas em "Vendas" e "Serviços".',
  /** Resumo do ano (D-121). */
  yearLink: 'Resumo do ano',
  yearLinkHint: 'O ano por categoria, o que ficou fora da operação, as retiradas e o que ficou no negócio.',
  yearTitle: 'Resumo do ano',
  yearIntro: (year: number, current: boolean): string => (current ? `O que foi anotado no negócio em ${year}, até hoje.` : `O que foi anotado no negócio em ${year}.`),
  yearPrev: (year: number): string => `Ano anterior: ${year}`,
  yearNext: (year: number): string => `Próximo ano: ${year}`,
  yearBack: (year: number): string => `Voltar para ${year}`,
  yearStepper: 'Ano mostrado',
  yearNothing: (year: number): string => `Nada anotado no negócio em ${year}.`,
  yearInTitle: 'Entrou na operação',
  yearOutTitle: 'Saiu na operação',
  yearLeftLine: (cents: Cents): string =>
    cents > 0 ? `Sobrou na operação: ${formatBRL(cents)}.` : cents < 0 ? `Na operação, saiu ${formatBRL(-cents)} a mais do que entrou.` : 'Na operação, entrou o mesmo que saiu.',
  yearNoIn: 'Nenhuma entrada da operação anotada no ano.',
  yearNoOut: 'Nenhuma saída da operação anotada no ano.',
  yearOutsideNone: 'Nada anotado fora da operação no ano.',
  yearWithdrawnTitle: 'Retiradas para o Pessoal',
  yearWithdrawnNone: 'Nenhuma retirada para o Pessoal no ano.',
  yearKeptTitle: 'Ficou no negócio',
  yearKeptCaption: 'Somando tudo: a operação, o que ficou fora dela e as retiradas.',
  yearTotal: 'Total',
  yearMeiTitle: 'Vendas e serviços',
  /** Pela data de cada entrada (D-121): uma venda de 30/12 que conta no mês seguinte fica no ano dela. */
  yearMeiNote: 'Pela data de cada entrada. Os valores são os que você anotou e não são uma declaração pronta. Se tiver dúvida, procure orientação de contabilidade.',
  yearSales: 'Vendas',
  yearServices: 'Serviços',
  yearExport: 'Exportar os lançamentos do negócio',
  yearExportHint: 'A exportação que você já conhece, com o negócio escolhido: planilha ou PDF.',
  /** Ajuda das categorias do negócio, embaixo da escolha (D-121). */
  categoryHint: (category: string | null): string | null => (category ? (BUSINESS_CATEGORY_HINTS[category] ?? null) : null),
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
    'O espaço sai do app. Os lançamentos dele ficam guardados, sem leitura, e são apagados de vez depois de 6 meses. As retiradas e o dinheiro trazido do Pessoal continuam no Pessoal, como lançamentos comuns.',
  /** Antes de encerrar (D-121): exportar e guardar. */
  endKeep: 'Registros e comprovantes do negócio costumam precisar ser guardados por alguns anos. Se tiver dúvida, procure orientação de contabilidade.',
  endExport: 'Exportar os lançamentos',
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
  /** "Saiu em outubro de 2026", nas Análises do negócio. */
  outMonthYear: (month: IsoMonth): string => `Saiu em ${formatMonthYearBR(month)}`,
  emptyList: 'Entradas e saídas já feitas aparecem aqui, da mais recente para a mais antiga.',
  /** Exemplos de "Gastos fixos e parcelamentos" em Organizar, no negócio. */
  seriesExamples: 'Aluguel do ponto, DAS, maquininha e fornecedor',
} as const;

/** Textos de erro das telas do negócio (nomes e regras do banco). */
export const BUSINESS_ERROR_TEXT = {
  nome_do_negocio_invalido: 'Dê um nome de 1 a 60 caracteres para o negócio.',
  ja_tem_negocio: 'Você já tem um espaço Negócio. O plano inclui um negócio por pessoa.',
  negocio_com_membros: 'Só dá para encerrar o espaço Negócio quando só você participa dele.',
  retirada_ligada: BUSINESS_TEXT.pairLocked,
  nao_e_retirada: BUSINESS_TEXT.pairGone,
  lancamento_ligado: BUSINESS_TEXT.moveLinked,
  contexto_invalido: ERROR_TEXT.salvar_falhou,
  sem_permissao: 'Só quem é titular do negócio pode fazer isto.',
  perfil_invalido: ERROR_TEXT.salvar_falhou,
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
  'perfil_invalido',
];
