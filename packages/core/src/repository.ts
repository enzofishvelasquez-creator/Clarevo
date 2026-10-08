import type { IsoMonth } from './dates';
import type { Commitment, CommitmentInput, FinancialRecord, PaymentInput, PersonalSpace, RecordInput, RecordKind } from './records';

/** Ações de conta a pagar gravadas em record_operations (mesmo espaço de chaves dos registros). */
export type CommitmentAction = 'criar_compromisso' | 'editar_compromisso' | 'excluir_compromisso' | 'pagar_compromisso' | 'desfazer_pagamento';

/** Resultado das escritas de conta a pagar: a conta no estado atual e, quando houver, o gasto envolvido. */
export interface CommitmentWrite {
  commitment: Commitment;
  record: FinancialRecord | null;
}

/**
 * Contrato de acesso a dados usado pelo app. Duas implementações:
 * - SupabaseRepository (app): produção, autorização no banco.
 * - MemoryRepository (core): demonstração e testes, com as mesmas regras de idempotência e versão.
 */
export interface RecordsRepository {
  /** Espaço pessoal da pessoa autenticada; null se ainda não passou por "Sua primeira conta". */
  getSpace(): Promise<PersonalSpace | null>;
  /** Cria (uma única vez) contexto pessoal e primeira conta. Idempotente. O fuso vem do aparelho. */
  ensurePersonalSpace(accountName: string, timeZone?: string): Promise<PersonalSpace>;
  renameAccount(accountId: string, name: string): Promise<void>;

  listRecords(contextId: string, month: IsoMonth): Promise<FinancialRecord[]>;
  getRecord(id: string): Promise<FinancialRecord | null>;

  createRecord(key: string, contextId: string, kind: RecordKind, input: RecordInput): Promise<FinancialRecord>;
  /** Num gasto de conta a pagar, também soma 1 à versão da conta (o previsto não muda). */
  updateRecord(key: string, id: string, expectedVersion: number, input: RecordInput): Promise<FinancialRecord>;
  /** Num gasto de conta a pagar, também reabre a conta (versão +1). */
  deleteRecord(key: string, id: string, expectedVersion: number): Promise<FinancialRecord>;
  /** Reconciliação: a operação de registro (criar, editar, excluir) com esta chave já foi concluída? */
  findOperation(key: string): Promise<{ recordId: string } | null>;

  /**
   * Contas a pagar do contexto, sem excluídas: todas com vencimento no mês (abertas e pagas),
   * as pagas com data de pagamento no mês (qualquer vencimento) e todas as abertas com vencimento
   * fora do mês. A seleção do total é feita por summarizeToPay.
   */
  listCommitments(contextId: string, month: IsoMonth): Promise<Commitment[]>;
  getCommitment(id: string): Promise<Commitment | null>;
  createCommitment(key: string, contextId: string, input: CommitmentInput): Promise<CommitmentWrite>;
  updateCommitment(key: string, id: string, expectedVersion: number, input: CommitmentInput): Promise<CommitmentWrite>;
  deleteCommitment(key: string, id: string, expectedVersion: number): Promise<CommitmentWrite>;
  /** Atômico: cria o gasto e quita a conta. record = gasto criado. */
  payCommitment(key: string, id: string, expectedVersion: number, input: PaymentInput): Promise<CommitmentWrite & { record: FinancialRecord }>;
  /** Atômico: exclui o gasto e reabre a conta. record = gasto excluído. */
  undoCommitmentPayment(key: string, id: string, expectedVersion: number): Promise<CommitmentWrite & { record: FinancialRecord }>;
  /** Reconciliação de conta a pagar: a operação com esta chave já foi concluída? */
  findCommitmentOperation(key: string): Promise<{ action: CommitmentAction; commitmentId: string; recordId: string | null } | null>;
}

export type RepoErrorCode =
  | 'versao_desatualizada'
  | 'chave_reutilizada'
  | 'nao_encontrado'
  | 'sem_permissao'
  | 'nao_autenticado'
  | 'email_nao_confirmado'
  | 'rede'
  | 'descricao_obrigatoria'
  | 'descricao_longa'
  | 'valor_invalido'
  | 'valor_acima_do_limite'
  | 'data_invalida'
  | 'data_futura'
  | 'conta_invalida'
  | 'categoria_invalida'
  | 'nome_da_conta_invalido'
  | 'vencimento_fora_do_intervalo'
  | 'compromisso_quitado'
  | 'compromisso_aberto'
  | 'desconhecido';

export class RepoError extends Error {
  constructor(
    readonly code: RepoErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'RepoError';
  }
}

export function isRepoError(e: unknown, code?: RepoErrorCode): e is RepoError {
  return e instanceof RepoError && (code === undefined || e.code === code);
}

let counter = 0;
/** Chave de idempotência por operação (uma por tentativa de salvar um conteúdo). */
export function newOperationKey(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `op-${Date.now().toString(36)}-${(counter++).toString(36)}-${rand}`;
}
