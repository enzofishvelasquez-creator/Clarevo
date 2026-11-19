import type { AccountInput, AccountKind, AccountStatus, FinancialAccount, FinancialRecord } from './records';
import type { PaymentForm } from './nota-pagamento';
import { uniquePaymentForms } from './nota-pagamento';
import type { RepoErrorCode } from './repository';
import { ERROR_TEXT } from './validation';

/**
 * Contas de origem do dinheiro (D-043, Ciclo G1; pedido de Enzo em 10/10/2026: "adicionar a origem do dinheiro nos pagamentos e
 * nos aportes, informando a origem da conta", resposta "Contas cadastradas"). A pessoa cadastra de onde sai o dinheiro (por exemplo
 * uma conta do banco e a carteira) e escolhe uma em cada gasto, pagamento de conta, pagamento de fatura e aporte ou resgate de
 * meta; a primeira vem marcada. Regras puras, repetidas no banco pelas funções create_account, update_account,
 * set_default_account, set_account_status e delete_account (migração 0010).
 *
 * É só a origem informada: não existe saldo por conta (fica para P-018, com transferências e saldo inicial), nada aqui entra em
 * Recebido, Pago, Diferença, Ainda a pagar nem na renda comprometida, e o Clarevo não guarda nem movimenta dinheiro.
 *
 * Conta: nome de 1 a 40 caracteres (único entre as não excluídas, sem diferenciar maiúsculas de minúsculas), tipo (conta bancária,
 * dinheiro ou outra), no máximo 10 ativas, uma principal (sempre ativa) e situação ativa ou arquivada. Arquivar tira a conta dos
 * seletores e mantém o histórico; excluir só vale sem lançamentos. Conta nova nunca recebe contas de exemplo: nasce só a
 * "Conta principal".
 */

export const ACCOUNT_KINDS: readonly AccountKind[] = ['banco', 'dinheiro', 'outra'];
/** Como o tipo aparece nos chips e nas linhas. */
export const ACCOUNT_KIND_LABEL: Readonly<Record<AccountKind, string>> = {
  banco: 'Banco',
  dinheiro: 'Dinheiro',
  outra: 'Outro',
};
export const ACCOUNT_NAME_MAX = 40;
/** Contas ativas por contexto. */
export const ACCOUNTS_ACTIVE_MAX = 10;
/** Nome da conta criada na primeira entrada. */
export const DEFAULT_ACCOUNT_NAME = 'Conta principal';

export const ACCOUNT_STATUSES: readonly AccountStatus[] = ['ativa', 'arquivada'];

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const ACCOUNTS_TEXT = {
  /** Card em Conta (decisão de 16/11/2026: "Bancos e carteira" no lugar de "Contas de origem"). */
  title: 'Bancos e carteira',
  intro:
    'Cadastre de onde sai o dinheiro, como o banco ou a carteira, e escolha de onde saiu em cada gasto, pagamento e aporte. É só a origem informada: a Clarevo não guarda saldo nem movimenta dinheiro.',
  principal: 'Principal',
  archived: 'Arquivada',
  add: 'Adicionar banco ou carteira',
  manage: 'Gerenciar bancos e carteira',
  limitNote: 'Você tem 10 bancos e carteiras ativos. Arquive um para adicionar outro.',
  /** No formulário de banco ou carteira. No card de Conta, a introdução já diz que não há saldo (auditoria de 18/11/2026: a frase se repetia). */
  balanceNote: 'A Clarevo não calcula o saldo do banco nem da carteira.',
  /** Tela "Sua primeira conta": não há campo de saldo (o app não calcula saldo). */
  firstAccountNote: 'A Clarevo mostra o que entrou e o que saiu no mês. Ela não mostra o saldo do banco.',
  /** Seletores. */
  out: 'Saiu de',
  into: 'Entrou em',
  to: 'Foi para',
  none: 'Sem banco ou carteira',
  notFound: 'Banco ou carteira não encontrado',
  /** Filtro de Movimentos. */
  filterLabel: 'Banco ou carteira',
  filterAll: 'Todas',
  /** Formulário. */
  newTitle: 'Adicionar banco ou carteira',
  editTitle: 'Editar banco ou carteira',
  nameLabel: 'Nome',
  nameHint: 'Por exemplo: Carteira ou o nome do banco.',
  kindLabel: 'Tipo',
  save: 'Salvar alterações',
  create: 'Adicionar',
  /** Situação da conta aberta. */
  statusTitle: 'Situação',
  makeDefault: 'Tornar principal',
  archive: 'Arquivar',
  reactivate: 'Reativar',
  delete: 'Excluir',
  /** Avisos depois de gravar. */
  created: 'Adicionado em Bancos e carteira.',
  saved: 'Alterações salvas.',
  defaultSet: 'Marcado como principal.',
  archivedDone: 'Arquivado.',
  reactivated: 'Reativado.',
  deleted: 'Excluído de Bancos e carteira.',
  /** Arquivar a principal: escolher a nova. */
  chooseDefaultTitle: 'Qual fica como principal?',
  chooseDefaultBody: 'A opção principal vem marcada nos gastos, pagamentos e aportes. Escolha outra antes de arquivar esta.',
  chooseDefaultChoice: (name: string): string => `Tornar ${name} a principal e arquivar`,
  cancel: 'Cancelar',
  /** Excluir. */
  deleteTitle: 'Excluir de Bancos e carteira?',
  deleteBody: 'Só é possível excluir o que ainda não tem lançamentos. Se já tem gastos ou aportes, arquive: o histórico continua.',
  deleteConfirm: 'Excluir',
  loadFailed: 'Não foi possível carregar bancos e carteira. Tente de novo.',
  loading: 'Carregando bancos e carteira…',
  /** Linha da lista: tipo e, se houver, a marca. */
  rowCaption: (kind: AccountKind, isDefault: boolean, status: AccountStatus): string =>
    [ACCOUNT_KIND_LABEL[kind], isDefault ? 'Principal' : null, status === 'arquivada' ? 'Arquivada' : null].filter(Boolean).join(' · '),
  rowA11y: (name: string, kind: AccountKind, isDefault: boolean, status: AccountStatus): string =>
    `${name}, ${ACCOUNTS_TEXT.rowCaption(kind, isDefault, status)}. Abrir para editar.`,
  /** Com uma conta só, o seletor mostra o nome como texto, sem chip. */
  single: (label: string, name: string): string => `${label}: ${name}`,
  /** Com a conta escolhida num resumo: "saindo de Carteira" (nunca "conta Conta principal"). */
  leavingFrom: (name: string): string => `saindo de ${name}`,
  /** Aviso da conta arquivada de um registro antigo. */
  archivedName: (name: string): string => `${name} (arquivada)`,
  /** A nota fiscal escolheu a conta. */
  fromNote: (name: string): string => `Escolhido pela forma de pagamento da nota: ${name}. Mude se o dinheiro saiu de outro lugar.`,
} as const;

/** Textos de erro das telas de contas (nomes e regras do banco). */
export const ACCOUNT_ERROR_TEXT = {
  nome_da_conta_invalido: 'Dê um nome de 1 a 40 caracteres.',
  tipo_da_conta_invalido: 'Escolha o tipo.',
  nome_da_conta_repetido: 'Você já tem um banco ou carteira com este nome. Use outro nome.',
  limite_de_contas: 'Você pode ter até 10 bancos e carteiras ativos. Arquive um para adicionar ou reativar outro.',
  conta_principal: 'A opção principal não pode ser excluída. Torne outra a principal antes.',
  ultima_conta_ativa: 'É preciso manter pelo menos uma opção ativa em Bancos e carteira. Adicione outra antes de arquivar esta.',
  conta_com_lancamentos: 'Já há lançamentos aqui. Arquive em vez de excluir: o histórico continua.',
  conta_arquivada: 'Reative antes de tornar principal.',
  conta_invalida: 'Escolha outra opção ativa como principal.',
  situacao_invalida: ERROR_TEXT.salvar_falhou,
  campo_nao_se_aplica: ERROR_TEXT.salvar_falhou,
  versao_desatualizada: 'Isto foi alterado em outro aparelho. Confira o que mudou antes de salvar.',
  nao_encontrado: 'Este banco ou carteira não está mais disponível.',
  sem_permissao: ERROR_TEXT.sem_permissao,
  salvar_falhou: ERROR_TEXT.salvar_falhou,
  carregar_falhou: ERROR_TEXT.carregar_falhou,
} as const;

/** Texto de um erro das telas de contas; o que não é conhecido cai em "Não foi possível salvar...". */
export function accountErrorText(code: string): string {
  return (ACCOUNT_ERROR_TEXT as Record<string, string>)[code] ?? ACCOUNT_ERROR_TEXT.salvar_falhou;
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

export function isAccountKind(kind: unknown): kind is AccountKind {
  return typeof kind === 'string' && (ACCOUNT_KINDS as readonly string[]).includes(kind);
}

/** Número de caracteres como o banco conta (pontos de código), sem partir pares substitutos. */
function charCount(text: string): number {
  return [...text].length;
}

/** Nome aparado, como create_account e update_account gravam. */
export function normalizeAccountName(name: string): string {
  return name.trim();
}

export function normalizeAccountInput(input: AccountInput): AccountInput {
  return { name: normalizeAccountName(input.name), kind: input.kind };
}

/** O primeiro erro de nome ou tipo, na ordem do banco (nome antes do tipo); null se está certo. */
export function accountInputError(input: AccountInput): 'nome_da_conta_invalido' | 'tipo_da_conta_invalido' | null {
  const name = normalizeAccountName(typeof input.name === 'string' ? input.name : '');
  if (charCount(name) < 1 || charCount(name) > ACCOUNT_NAME_MAX) return 'nome_da_conta_invalido';
  if (!isAccountKind(input.kind)) return 'tipo_da_conta_invalido';
  return null;
}

/** Já existe outra conta (não excluída) com este nome, sem diferenciar maiúsculas de minúsculas? `accounts` vem de listAccounts. */
export function accountNameTaken(accounts: readonly Pick<FinancialAccount, 'id' | 'name'>[], name: string, exceptId?: string | null): boolean {
  const wanted = normalizeAccountName(name).toLowerCase();
  return accounts.some((a) => a.id !== exceptId && a.name.toLowerCase() === wanted);
}

export type AccountField = 'name' | 'kind';
export const ACCOUNT_FIELD_ORDER: AccountField[] = ['name', 'kind'];
export type AccountFieldErrors = Partial<Record<AccountField, string>>;

export interface AccountDraft {
  name: string;
  /** Nulo até a pessoa escolher o tipo (no formulário novo o tipo vem em "Conta bancária"). */
  kind: AccountKind | null;
}

/**
 * Valida o formulário na ordem do banco: nome (1 a 40 caracteres), tipo e nome repetido entre as contas que a pessoa já tem
 * (o banco repete a conferência). Devolve o texto de cada campo com erro.
 */
export function validateAccountDraft(
  draft: AccountDraft,
  accounts: readonly Pick<FinancialAccount, 'id' | 'name'>[] = [],
  exceptId?: string | null,
): { ok: true; input: AccountInput } | { ok: false; errors: AccountFieldErrors; code: RepoErrorCode } {
  const errors: AccountFieldErrors = {};
  let code: RepoErrorCode | null = null;
  const name = normalizeAccountName(draft.name);
  if (charCount(name) < 1 || charCount(name) > ACCOUNT_NAME_MAX) {
    errors.name = ACCOUNT_ERROR_TEXT.nome_da_conta_invalido;
    code = 'nome_da_conta_invalido';
  }
  if (!isAccountKind(draft.kind)) {
    errors.kind = ACCOUNT_ERROR_TEXT.tipo_da_conta_invalido;
    code ??= 'tipo_da_conta_invalido';
  }
  if (errors.name === undefined && accountNameTaken(accounts, name, exceptId)) {
    errors.name = ACCOUNT_ERROR_TEXT.nome_da_conta_repetido;
    code ??= 'nome_da_conta_repetido';
  }
  if (code !== null) return { ok: false, errors, code };
  return { ok: true, input: { name, kind: draft.kind as AccountKind } };
}

// ---------------------------------------------------------------------------
// Escolha e exibição
// ---------------------------------------------------------------------------

/** Contas ativas, a principal primeiro e as demais na ordem em que vieram (a de criação). */
export function activeAccounts<A extends Pick<FinancialAccount, 'status' | 'isDefault'>>(accounts: readonly A[]): A[] {
  const active = accounts.filter((a) => a.status === 'ativa');
  return [...active.filter((a) => a.isDefault), ...active.filter((a) => !a.isDefault)];
}

/** A conta principal (ativa) ou, se faltar, a primeira ativa; null sem contas ativas. */
export function defaultAccountOf<A extends Pick<FinancialAccount, 'status' | 'isDefault'>>(accounts: readonly A[]): A | null {
  return activeAccounts(accounts)[0] ?? null;
}

/**
 * A conta que vem marcada: a pedida (por exemplo a que a nota escolheu), se ainda está ativa; senão a última usada neste aparelho,
 * se ainda está ativa; senão a principal. Vazio sem contas ativas.
 */
export function chooseAccountId(
  accounts: readonly Pick<FinancialAccount, 'id' | 'status' | 'isDefault'>[],
  lastUsedId?: string | null,
  preferredId?: string | null,
): string {
  const active = activeAccounts(accounts);
  for (const wanted of [preferredId, lastUsedId]) {
    if (wanted && active.some((a) => a.id === wanted)) return wanted;
  }
  return active[0]?.id ?? '';
}

/**
 * Contas do seletor ao editar algo que já tem conta: as ativas e, se a conta que o registro já tem foi arquivada, ela também
 * ("Carteira (arquivada)"), para a pessoa manter a conta sem ter de trocá-la. `all` vem de listAccounts.
 */
export function accountsForPicker(
  active: readonly FinancialAccount[],
  all: readonly FinancialAccount[] | undefined,
  keepId?: string | null,
): FinancialAccount[] {
  if (!keepId || active.some((a) => a.id === keepId)) return [...active];
  const kept = all?.find((a) => a.id === keepId);
  return kept ? [...active, { ...kept, name: ACCOUNTS_TEXT.archivedName(kept.name) }] : [...active];
}

/**
 * A conta que vale num formulário de pagamento: a que a pessoa escolheu, se ainda está ativa; senão a última usada neste aparelho, se
 * ainda está ativa; senão a principal. Nulo sem contas ativas.
 */
export function selectedAccount<A extends Pick<FinancialAccount, 'id' | 'status' | 'isDefault'>>(
  accounts: readonly A[],
  choiceId: string | null | undefined,
  lastUsedId?: string | null,
): A | null {
  const id = chooseAccountId(accounts, lastUsedId, choiceId);
  return accounts.find((a) => a.id === id) ?? null;
}

/** O seletor só aparece como chips quando há mais de uma conta ativa; com uma só, o nome vai como texto. */
export function hasAccountChoice(accounts: readonly Pick<FinancialAccount, 'status'>[]): boolean {
  return accounts.filter((a) => a.status === 'ativa').length > 1;
}

/**
 * O seletor mostra chips (e não só o nome como texto) quando há o que escolher: mais de uma conta, a opção "Sem conta" (aporte e
 * resgate), ou um valor que não é a primeira conta da lista (por exemplo a conta arquivada que o registro já tem). Só com uma
 * conta, escolhida e sem "Sem conta", o seletor vira o texto "Saiu de: Conta principal". `accounts` é a lista do seletor.
 */
export function pickerShowsChips(accounts: readonly Pick<FinancialAccount, 'id'>[], value: string | null | undefined, allowNone = false): boolean {
  const first = accounts[0];
  return accounts.length > 1 || (first !== undefined && (allowNone || (value ?? null) !== first.id));
}

/** A conta que o seletor em texto mostra: a escolhida (`value`) e, na falta dela, a primeira da lista. */
export function pickerShownAccount<A extends Pick<FinancialAccount, 'id'>>(accounts: readonly A[], value: string | null | undefined): A | null {
  return accounts.find((a) => a.id === value) ?? accounts[0] ?? null;
}

/** Nome da conta pelo id (também a arquivada); null se não achar. */
export function accountNameOf(accounts: readonly Pick<FinancialAccount, 'id' | 'name' | 'status'>[], id: string | null | undefined): string | null {
  if (!id) return null;
  return accounts.find((a) => a.id === id)?.name ?? null;
}

/** Nome da conta no detalhe de um registro ou de um pagamento: a arquivada leva "(arquivada)"; sem a conta, "Conta não encontrada". */
export function accountDisplayName(accounts: readonly Pick<FinancialAccount, 'id' | 'name' | 'status'>[], id: string | null | undefined): string {
  const a = id ? accounts.find((x) => x.id === id) : undefined;
  if (!a) return ACCOUNTS_TEXT.notFound;
  return a.status === 'arquivada' ? ACCOUNTS_TEXT.archivedName(a.name) : a.name;
}

/**
 * Conta que a forma de pagamento da nota indica (D-042 e D-043): dinheiro escolhe a conta do tipo dinheiro, se houver uma só ativa;
 * Pix e débito escolhem a principal, se ela for do tipo banco. Mais de uma forma, vale, "outra forma" ou nenhuma: a nota não escolhe a conta.
 */
export function accountForPaymentForms(accounts: readonly FinancialAccount[], forms: readonly PaymentForm[]): string | null {
  const list = uniquePaymentForms(forms);
  if (list.length !== 1) return null;
  const active = activeAccounts(accounts);
  const only = list[0]!;
  if (only === 'dinheiro') {
    const cash = active.filter((a) => a.kind === 'dinheiro');
    return cash.length === 1 ? cash[0]!.id : null;
  }
  if (only === 'pix' || only === 'debito') {
    const main = active[0];
    return main && main.isDefault && main.kind === 'banco' ? main.id : null;
  }
  return null;
}

/** A conta do registro nas linhas e no detalhe, só quando há mais de uma conta ativa ("Carteira"); null nos outros casos. */
export function recordAccountName(
  accounts: readonly Pick<FinancialAccount, 'id' | 'name' | 'status'>[],
  record: Pick<FinancialRecord, 'accountId'>,
): string | null {
  if (!hasAccountChoice(accounts)) return null;
  return accountNameOf(accounts, record.accountId);
}

export interface AccountFilterOption {
  /** Nulo = "Todas". */
  id: string | null;
  label: string;
}

/**
 * Chips do filtro de Movimentos: "Todas" e cada conta, quando há 2 ou mais contas ativas (senão, nenhum). Uma conta arquivada só
 * entra se algum registro do mês é dela.
 */
export function accountFilterOptions(
  accounts: readonly FinancialAccount[],
  records: readonly Pick<FinancialRecord, 'accountId'>[],
): AccountFilterOption[] {
  if (!hasAccountChoice(accounts)) return [];
  const used = new Set(records.map((r) => r.accountId));
  const shown = [...activeAccounts(accounts), ...accounts.filter((a) => a.status === 'arquivada' && used.has(a.id))];
  return [{ id: null, label: ACCOUNTS_TEXT.filterAll }, ...shown.map((a) => ({ id: a.id, label: a.status === 'arquivada' ? ACCOUNTS_TEXT.archivedName(a.name) : a.name }))];
}

/** Registros da conta escolhida (nulo = todas). */
export function filterByAccount<R extends Pick<FinancialRecord, 'accountId'>>(records: readonly R[], accountId: string | null): R[] {
  return accountId === null ? [...records] : records.filter((r) => r.accountId === accountId);
}

/**
 * O que impede arquivar ou excluir a conta, olhando só a lista (o banco repete a conferência): a última ativa nunca se arquiva; a
 * principal só se arquiva escolhendo outra; a principal nunca se exclui. null = pode.
 */
export function accountBlock(
  accounts: readonly FinancialAccount[],
  account: Pick<FinancialAccount, 'id' | 'status' | 'isDefault'>,
  action: 'archive' | 'delete',
): 'ultima_conta_ativa' | 'conta_principal' | null {
  if (action === 'delete') return account.isDefault ? 'conta_principal' : null;
  if (account.status !== 'ativa') return null;
  if (accounts.filter((a) => a.status === 'ativa').length <= 1) return 'ultima_conta_ativa';
  return null;
}

/** Cabe mais uma conta ativa? */
export function canAddActiveAccount(accounts: readonly Pick<FinancialAccount, 'status'>[]): boolean {
  return accounts.filter((a) => a.status === 'ativa').length < ACCOUNTS_ACTIVE_MAX;
}
