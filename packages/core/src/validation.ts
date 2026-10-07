import type { IsoDate } from './dates';
import { parseDateBR } from './dates';
import { MAX_RECORD_CENTS, parseBRL } from './money';
import type { RecordInput } from './records';

/**
 * Códigos de erro compartilhados entre app e banco (mesmas mensagens de exceção do Postgres).
 * Textos exatos do handoff "Primeiro ciclo" (07/10/2026), CL C002.
 */
export const ERROR_TEXT = {
  descricao_obrigatoria: 'Dê um nome para este registro.',
  descricao_longa: 'Use no máximo 80 caracteres.',
  valor_invalido: 'Informe um valor maior que zero, como 80,00.',
  valor_acima_do_limite: 'O valor máximo por registro é R$ 9.999.999,99.',
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

/** Ordem dos campos na tela: o foco vai para o primeiro erro. */
export const FIELD_ORDER: DraftField[] = ['description', 'amountText', 'dateText', 'accountId'];

export type DraftValidation = { ok: true; input: RecordInput } | { ok: false; errors: FieldErrors };

export function validateRecordDraft(draft: RecordDraft, today: IsoDate): DraftValidation {
  const errors: FieldErrors = {};

  const description = draft.description.trim();
  if (description === '') errors.description = ERROR_TEXT.descricao_obrigatoria;
  else if (description.length > DESCRIPTION_MAX) errors.description = ERROR_TEXT.descricao_longa;

  const amount = parseBRL(draft.amountText);
  if (amount === null || amount <= 0) errors.amountText = ERROR_TEXT.valor_invalido;
  else if (amount > MAX_RECORD_CENTS) errors.amountText = ERROR_TEXT.valor_acima_do_limite;

  const occurredOn = parseDateBR(draft.dateText);
  if (occurredOn === null) errors.dateText = ERROR_TEXT.data_invalida;
  else if (occurredOn > today) errors.dateText = ERROR_TEXT.data_futura;

  if (draft.accountId.trim() === '') errors.accountId = ERROR_TEXT.conta_invalida;

  if (Object.keys(errors).length > 0 || amount === null || occurredOn === null) return { ok: false, errors };
  const category = draft.category?.trim() ? draft.category.trim() : null;
  return { ok: true, input: { accountId: draft.accountId, amountCents: amount, occurredOn, description, category } };
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
      return 'dateText';
    case 'conta_invalida':
      return 'accountId';
    default:
      return null;
  }
}
