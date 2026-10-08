import type { IsoDate } from './dates';
import { addYearsClamped, parseDateBR } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, parseBRL } from './money';
import type { CommitmentInput, PaymentInput, RecordInput } from './records';

/**
 * Códigos de erro compartilhados entre app e banco (mesmas mensagens de exceção do Postgres).
 * Textos exatos do handoff "Primeiro ciclo" (07/10/2026), CL C002.
 */
export const ERROR_TEXT = {
  descricao_obrigatoria: 'Dê um nome para este registro.',
  descricao_longa: 'Use no máximo 80 caracteres.',
  valor_invalido: 'Informe um valor maior que zero, como 80,00.',
  valor_acima_do_limite: 'O valor máximo por registro é R$ 9.999.999,99.',
  categoria_invalida: 'Use uma categoria de até 40 caracteres.',
  data_invalida: 'Confira a data informada.',
  data_futura: 'Use uma data até hoje. Aqui entram só valores já pagos ou recebidos.',
  conta_invalida: 'Escolha a conta.',
  salvar_falhou: 'Não foi possível salvar. Seu preenchimento foi mantido. Tente novamente.',
  carregar_falhou: 'Não foi possível carregar. Tente novamente.',
  versao_desatualizada: 'Este registro foi alterado em outro aparelho. Confira a versão atual antes de salvar.',
  nao_encontrado: 'Este registro não está mais disponível.',
  sem_permissao: 'Você não tem permissão para esta ação.',
} as const;

export type ErrorCode = keyof typeof ERROR_TEXT;

/** Textos de conta a pagar. ERROR_TEXT continua fixo para registros; aqui só o que muda ou é novo. */
export const COMMITMENT_ERROR_TEXT = {
  ...ERROR_TEXT,
  descricao_obrigatoria: 'Dê um nome para esta conta a pagar.',
  valor_acima_do_limite: 'O valor máximo por conta a pagar é R$ 9.999.999,99.',
  vencimento_fora_do_intervalo: 'Use um vencimento entre 1 ano atrás e 2 anos à frente.',
  versao_desatualizada: 'Esta conta a pagar foi alterada em outro aparelho. Confira a versão atual antes de salvar.',
  nao_encontrado: 'Esta conta a pagar não está mais disponível.',
  compromisso_quitado: 'Esta conta a pagar já foi paga. Para alterar, desfaça o pagamento.',
  compromisso_aberto: 'Este pagamento já foi desfeito.',
  ja_paga_em_outro_aparelho: 'Esta conta a pagar já foi marcada como paga em outro aparelho.',
  pagar_falhou: 'Não foi possível registrar o pagamento. Seu preenchimento foi mantido. Tente novamente.',
  desfazer_falhou: 'Não foi possível desfazer o pagamento. Tente novamente.',
  excluir_falhou: 'Não foi possível excluir a conta a pagar. Tente novamente.',
} as const;

/** Textos do formulário "Marcar como paga". */
export const PAYMENT_ERROR_TEXT = {
  ...COMMITMENT_ERROR_TEXT,
  data_futura: 'Use uma data até hoje. A conta só é marcada como paga depois do pagamento.',
  conta_invalida: 'Escolha a conta usada no pagamento.',
} as const;

export type DraftField = 'description' | 'amountText' | 'dateText' | 'accountId';
export type FieldErrors = Partial<Record<DraftField, string>>;

/** Rascunho do formulário. Guarda o texto digitado, para nunca perder o preenchimento. */
export interface RecordDraft {
  accountId: string;
  amountText: string;
  description: string;
  category: string | null;
  /** DD/MM/AAAA */
  dateText: string;
}

export const DESCRIPTION_MAX = 80;
export const CATEGORY_MAX = 40;

/** Conta caracteres como a pessoa vê (emoji conta 1), igual ao banco. */
export function charCount(text: string): number {
  return [...text].length;
}

/** Ordem dos campos na tela: o foco vai para o primeiro erro. */
export const FIELD_ORDER: DraftField[] = ['description', 'amountText', 'dateText', 'accountId'];

export type DraftValidation = { ok: true; input: RecordInput } | { ok: false; errors: FieldErrors };

export function validateRecordDraft(draft: RecordDraft, today: IsoDate): DraftValidation {
  const errors: FieldErrors = {};

  const description = draft.description.trim();
  if (description === '') errors.description = ERROR_TEXT.descricao_obrigatoria;
  else if (charCount(description) > DESCRIPTION_MAX) errors.description = ERROR_TEXT.descricao_longa;

  const amount = checkAmount(draft.amountText, ERROR_TEXT, errors);

  const occurredOn = parseDateBR(draft.dateText);
  if (occurredOn === null) errors.dateText = ERROR_TEXT.data_invalida;
  else if (occurredOn > today) errors.dateText = ERROR_TEXT.data_futura;

  if (draft.accountId.trim() === '') errors.accountId = ERROR_TEXT.conta_invalida;

  if (Object.keys(errors).length > 0 || amount === null || occurredOn === null) return { ok: false, errors };
  return {
    ok: true,
    input: { accountId: draft.accountId, amountCents: amount, occurredOn, description, category: normalizeCategory(draft.category) },
  };
}

/** Rascunho do formulário de conta a pagar. dateText é o vencimento (DD/MM/AAAA). */
export interface CommitmentDraft {
  description: string;
  amountText: string;
  dateText: string;
  category: string | null;
}

/** Rascunho de "Marcar como paga". dateText é a data do pagamento (DD/MM/AAAA). */
export interface PaymentDraft {
  accountId: string;
  amountText: string;
  dateText: string;
  category: string | null;
}

export const COMMITMENT_FIELD_ORDER: DraftField[] = ['description', 'amountText', 'dateText'];
export const PAYMENT_FIELD_ORDER: DraftField[] = ['amountText', 'dateText', 'accountId'];

/** Janela de vencimento aceita (igual ao banco): de 1 ano antes a 2 anos depois de hoje. */
export function dueDateBounds(today: IsoDate): { min: IsoDate; max: IsoDate } {
  return { min: addYearsClamped(today, -1), max: addYearsClamped(today, 2) };
}

/**
 * Conta a pagar. A janela de vencimento só é conferida quando o vencimento é novo ou muda
 * (opts.originalDueOn), para uma conta antiga continuar editável. Datas passadas e futuras são aceitas.
 * A categoria vem dos chips; o limite de 40 caracteres é conferido no repositório e no banco.
 */
export function validateCommitmentDraft(
  draft: CommitmentDraft,
  today: IsoDate,
  opts: { originalDueOn?: IsoDate } = {},
): { ok: true; input: CommitmentInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const description = draft.description.trim();
  if (description === '') errors.description = COMMITMENT_ERROR_TEXT.descricao_obrigatoria;
  else if (charCount(description) > DESCRIPTION_MAX) errors.description = COMMITMENT_ERROR_TEXT.descricao_longa;

  const amount = checkAmount(draft.amountText, COMMITMENT_ERROR_TEXT, errors);

  const dueOn = parseDateBR(draft.dateText);
  if (dueOn === null) errors.dateText = COMMITMENT_ERROR_TEXT.data_invalida;
  else if (dueOn !== opts.originalDueOn) {
    const { min, max } = dueDateBounds(today);
    if (dueOn < min || dueOn > max) errors.dateText = COMMITMENT_ERROR_TEXT.vencimento_fora_do_intervalo;
  }

  if (Object.keys(errors).length > 0 || amount === null || dueOn === null) return { ok: false, errors };
  return { ok: true, input: { description, amountCents: amount, dueOn, category: normalizeCategory(draft.category) } };
}

/** Pagamento: valor que saiu da conta, data até hoje e conta de saída. */
export function validatePaymentDraft(
  draft: PaymentDraft,
  today: IsoDate,
): { ok: true; input: PaymentInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const amount = checkAmount(draft.amountText, PAYMENT_ERROR_TEXT, errors);

  const paidOn = parseDateBR(draft.dateText);
  if (paidOn === null) errors.dateText = PAYMENT_ERROR_TEXT.data_invalida;
  else if (paidOn > today) errors.dateText = PAYMENT_ERROR_TEXT.data_futura;

  if (draft.accountId.trim() === '') errors.accountId = PAYMENT_ERROR_TEXT.conta_invalida;

  if (Object.keys(errors).length > 0 || amount === null || paidOn === null) return { ok: false, errors };
  return { ok: true, input: { accountId: draft.accountId, amountCents: amount, paidOn, category: normalizeCategory(draft.category) } };
}

function checkAmount(
  text: string,
  texts: { valor_invalido: string; valor_acima_do_limite: string },
  errors: FieldErrors,
): Cents | null {
  const amount = parseBRL(text);
  if (amount === null || amount <= 0) errors.amountText = texts.valor_invalido;
  else if (amount > MAX_RECORD_CENTS) errors.amountText = texts.valor_acima_do_limite;
  return amount;
}

function normalizeCategory(category: string | null): string | null {
  return category?.trim() ? category.trim() : null;
}

/** Erro de servidor que corresponde a um campo do formulário. */
export function fieldForErrorCode(code: string): DraftField | null {
  switch (code) {
    case 'descricao_obrigatoria':
    case 'descricao_longa':
      return 'description';
    case 'valor_invalido':
    case 'valor_acima_do_limite':
      return 'amountText';
    case 'data_invalida':
    case 'data_futura':
    case 'vencimento_fora_do_intervalo':
      return 'dateText';
    case 'conta_invalida':
      return 'accountId';
    default:
      return null;
  }
}
