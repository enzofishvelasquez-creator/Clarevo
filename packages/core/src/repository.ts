import type { IsoMonth } from './dates';
import type { Commitment, FinancialRecord, PersonalSpace, RecordInput, RecordKind } from './records';

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
  listCommitments(contextId: string, month: IsoMonth): Promise<Commitment[]>;

  createRecord(key: string, contextId: string, kind: RecordKind, input: RecordInput): Promise<FinancialRecord>;
  updateRecord(key: string, id: string, expectedVersion: number, input: RecordInput): Promise<FinancialRecord>;
  deleteRecord(key: string, id: string, expectedVersion: number): Promise<FinancialRecord>;
  /** Reconciliação: a operação com esta chave já foi concluída? Devolve o registro resultante. */
  findOperation(key: string): Promise<{ recordId: string } | null>;
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
