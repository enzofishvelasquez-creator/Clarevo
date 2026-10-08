import {
  addMonths,
  monthOf,
  newOperationKey,
  summarizeMonth,
  summarizeToPay,
  type AffectedRef,
  type Commitment,
  type CommitmentInput,
  type CommitmentWrite,
  type FinancialRecord,
  type IsoMonth,
  type PaymentInput,
  type RecordInput,
  type RecordKind,
  type SeriesAction,
  type SeriesEditInput,
  type SeriesInput,
  type SeriesWrite,
} from '@clarevo/core';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createContext, use, useRef } from 'react';

import { useRepo, useSession } from '@/state/session';

/** Lista, detalhe e totais leem a mesma origem: os registros do contexto no mês. */
export function useSpace() {
  const repo = useRepo();
  const { user } = useSession();
  return useQuery({ queryKey: ['space', user?.id], queryFn: () => repo.getSpace() });
}

export function useMonthRecords(contextId: string | undefined, month: IsoMonth) {
  const repo = useRepo();
  const query = useQuery({
    queryKey: ['records', contextId, month],
    queryFn: () => repo.listRecords(contextId!, month),
    enabled: Boolean(contextId),
  });
  const summary = query.data && contextId ? summarizeMonth(query.data, contextId, month) : null;
  return { ...query, summary };
}

/** Resultado da sincronização do dia: contas de gastos fixos criadas e, entre elas, as já vencidas. */
export interface SeriesSyncResult {
  created: number;
  createdOverdue: number;
}

/**
 * Cria as contas dos gastos fixos do contexto que entram na janela de hoje (do mês anterior ao seguinte).
 * Uma vez por dia e por contexto: a chave inclui hoje, e a geração no banco é idempotente.
 * As contagens se somam no mesmo dia, para a faixa "O Clarevo criou 2 contas..." não sumir depois de uma
 * nova sincronização que não cria nada (as escritas de gasto fixo pedem uma).
 */
export function useSeriesSync(contextId: string | undefined) {
  const repo = useRepo();
  const qc = useQueryClient();
  const { today } = useSession();
  const queryKey = ['seriesSync', contextId, today];
  return useQuery({
    queryKey,
    queryFn: async (): Promise<SeriesSyncResult> => {
      const r = await repo.syncSeriesOccurrences(contextId!);
      if (r.created > 0) {
        // Listas carregadas antes desta sincronização (por exemplo, na virada do dia) recarregam.
        qc.invalidateQueries({ queryKey: ['commitments'] });
        qc.invalidateQueries({ queryKey: ['series'] });
      }
      const prev = qc.getQueryData<SeriesSyncResult>(queryKey);
      return prev ? { created: prev.created + r.created, createdOverdue: prev.createdOverdue + r.createdOverdue } : r;
    },
    enabled: Boolean(contextId),
    staleTime: Infinity,
  });
}

/** Consulta que só vale depois da sincronização do dia. Se a sincronização falha, falha inteira (nunca lista ou total parcial). */
export type SyncedQuery<T> = {
  isFetching: boolean;
  /** Tenta de novo a sincronização, se foi ela que falhou; senão, a consulta. */
  refetch: () => Promise<unknown>;
} & (
  | { data: T; error: null; isPending: false; isError: false; isSuccess: true }
  | { data: undefined; error: Error | null; isPending: boolean; isError: boolean; isSuccess: false }
);

function afterSync<T>(sync: UseQueryResult<SeriesSyncResult>, query: UseQueryResult<T>): SyncedQuery<T> {
  const refetch = () => (sync.isError ? sync.refetch() : query.refetch());
  const isFetching = sync.isFetching || query.isFetching;
  // Dados já carregados prevalecem: uma falha de atualização em segundo plano não apaga a lista.
  if (sync.isSuccess && query.isSuccess) return { data: query.data, error: null, isPending: false, isError: false, isSuccess: true, isFetching, refetch };
  const error = sync.isError ? sync.error : query.isError ? query.error : null;
  return { data: undefined, error, isPending: !error, isError: Boolean(error), isSuccess: false, isFetching, refetch };
}

/**
 * Contas a pagar com vencimento no mês (abertas e pagas), as pagas com data de pagamento no mês e as abertas de outros meses;
 * o total sai de summarizeToPay. Só depois da sincronização dos gastos fixos do dia: sem ela, o total poderia faltar uma conta.
 */
export function useCommitments(contextId: string | undefined, month: IsoMonth) {
  const repo = useRepo();
  const { today } = useSession();
  const sync = useSeriesSync(contextId);
  const query = useQuery({
    queryKey: ['commitments', contextId, month],
    queryFn: () => repo.listCommitments(contextId!, month),
    enabled: Boolean(contextId) && sync.isSuccess,
  });
  const result = afterSync(sync, query);
  const summary = result.data && contextId ? summarizeToPay(result.data, contextId, month, today) : null;
  return { ...result, summary };
}

export function useCommitment(id: string | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: ['commitment', id], queryFn: () => repo.getCommitment(id!), enabled: Boolean(id) });
}

export function useRecord(id: string | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: ['record', id], queryFn: () => repo.getRecord(id!), enabled: Boolean(id) });
}

/** Depois de gravar, os totais de todos os meses afetados são recarregados. */
function useInvalidate() {
  const qc = useQueryClient();
  return (record: FinancialRecord, deleted = false) => {
    // O detalhe mostra na hora a versão confirmada pelo servidor; listas e totais recarregam.
    if (deleted) qc.invalidateQueries({ queryKey: ['record', record.id], refetchType: 'none' });
    else qc.setQueryData(['record', record.id], record);
    qc.invalidateQueries({ queryKey: ['records'] });
    // Editar ou excluir o gasto de uma conta a pagar muda a conta (versão, reabertura): sempre recarregar.
    qc.invalidateQueries({ queryKey: ['commitments'] });
    qc.invalidateQueries({ queryKey: ['commitment'] });
    // Reabrir a conta de um gasto fixo muda as contagens e a lista de contas da série.
    if (record.commitmentId) qc.invalidateQueries({ queryKey: ['series'] });
  };
}

export function useCreateRecord() {
  const repo = useRepo();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; kind: RecordKind; input: RecordInput }) =>
      repo.createRecord(v.key, v.contextId, v.kind, v.input),
    onSuccess: (r) => invalidate(r),
  });
}

export function useUpdateRecord() {
  const repo = useRepo();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number; input: RecordInput }) =>
      repo.updateRecord(v.key, v.id, v.version, v.input),
    onSuccess: (r) => invalidate(r),
  });
}

export function useDeleteRecord() {
  const repo = useRepo();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number }) => repo.deleteRecord(v.key, v.id, v.version),
    onSuccess: (r) => invalidate(r, true),
  });
}

// ---------------------------------------------------------------------------
// Contas a pagar
// ---------------------------------------------------------------------------

/** Depois de gravar uma conta a pagar; pagar e desfazer também mexem no gasto e nos totais realizados. */
function useInvalidateCommitment() {
  const qc = useQueryClient();
  return (w: CommitmentWrite, deleted = false) => {
    if (deleted) qc.invalidateQueries({ queryKey: ['commitment', w.commitment.id], refetchType: 'none' });
    else qc.setQueryData(['commitment', w.commitment.id], w.commitment);
    qc.invalidateQueries({ queryKey: ['commitments'] });
    // Conta de gasto fixo: pagar, desfazer, alterar ou excluir só este mês muda a série (contagens, números pulados).
    if (w.commitment.series) qc.invalidateQueries({ queryKey: ['series'] });
    if (w.record) {
      qc.invalidateQueries({ queryKey: ['records'] });
      qc.invalidateQueries({ queryKey: ['record', w.record.id] });
    }
  };
}

export function useCreateCommitment() {
  const repo = useRepo();
  const invalidate = useInvalidateCommitment();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; input: CommitmentInput }) => repo.createCommitment(v.key, v.contextId, v.input),
    onSuccess: (w) => invalidate(w),
  });
}

export function useUpdateCommitment() {
  const repo = useRepo();
  const invalidate = useInvalidateCommitment();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number; input: CommitmentInput }) =>
      repo.updateCommitment(v.key, v.id, v.version, v.input),
    onSuccess: (w) => invalidate(w),
  });
}

export function useDeleteCommitment() {
  const repo = useRepo();
  const invalidate = useInvalidateCommitment();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number }) => repo.deleteCommitment(v.key, v.id, v.version),
    onSuccess: (w) => invalidate(w, true),
  });
}

export function usePayCommitment() {
  const repo = useRepo();
  const invalidate = useInvalidateCommitment();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number; input: PaymentInput }) =>
      repo.payCommitment(v.key, v.id, v.version, v.input),
    onSuccess: (w) => invalidate(w),
  });
}

export function useUndoCommitmentPayment() {
  const repo = useRepo();
  const invalidate = useInvalidateCommitment();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number }) => repo.undoCommitmentPayment(v.key, v.id, v.version),
    onSuccess: (w) => invalidate(w),
  });
}

// ---------------------------------------------------------------------------
// Gastos fixos e parcelamentos (D-024)
// ---------------------------------------------------------------------------

/** Gastos fixos e parcelamentos do contexto (inclusive encerrados), depois da sincronização do dia. */
export function useSeriesList(contextId: string | undefined) {
  const repo = useRepo();
  const sync = useSeriesSync(contextId);
  const query = useQuery({
    queryKey: ['series', 'list', contextId],
    queryFn: () => repo.listSeries(contextId!),
    enabled: Boolean(contextId) && sync.isSuccess,
  });
  return afterSync(sync, query);
}

/** Um gasto fixo, depois da sincronização do dia do contexto (as contagens de contas dependem dela). */
export function useSeries(id: string | undefined, contextId: string | undefined) {
  const repo = useRepo();
  const sync = useSeriesSync(contextId);
  const query = useQuery({
    queryKey: ['series', 'one', id],
    queryFn: () => repo.getSeries(id!),
    enabled: Boolean(id) && Boolean(contextId) && sync.isSuccess,
  });
  return afterSync(sync, query);
}

/** Contas vivas do gasto fixo (abertas e pagas), por número decrescente, até 60. */
export function useSeriesOccurrences(id: string | undefined, contextId: string | undefined) {
  const repo = useRepo();
  const sync = useSeriesSync(contextId);
  const query = useQuery({
    queryKey: ['series', 'occurrences', id],
    queryFn: () => repo.listSeriesOccurrences(id!),
    enabled: Boolean(id) && Boolean(contextId) && sync.isSuccess,
  });
  return afterSync(sync, query);
}

/**
 * Depois de gravar um gasto fixo: série e contas confirmadas pelo servidor na hora; listas, contas a pagar,
 * a sincronização do dia e os detalhes de conta recarregam. Escritas de série não criam gastos.
 */
function useInvalidateSeries() {
  const qc = useQueryClient();
  return (w: SeriesWrite, deleted = false) => {
    const id = w.series.id;
    if (deleted) {
      qc.invalidateQueries({ queryKey: ['series', 'one', id], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['series', 'occurrences', id], refetchType: 'none' });
    } else {
      qc.setQueryData(['series', 'one', id], w.series);
      // O resultado vem em número crescente; a consulta guarda as 60 mais recentes, em número decrescente.
      qc.setQueryData<Commitment[]>(['series', 'occurrences', id], [...w.occurrences].reverse().slice(0, 60));
    }
    qc.invalidateQueries({ queryKey: ['series', 'list'] });
    qc.invalidateQueries({ queryKey: ['seriesSync'] });
    qc.invalidateQueries({ queryKey: ['commitments'] });
    qc.invalidateQueries({ queryKey: ['commitment'] });
  };
}

export function useCreateSeries() {
  const repo = useRepo();
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; input: SeriesInput }) => repo.createSeries(v.key, v.contextId, v.input),
    onSuccess: (w) => invalidate(w),
  });
}

export function useUpdateSeriesFrom() {
  const repo = useRepo();
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number; fromNumber: number; affected: AffectedRef[]; input: SeriesEditInput }) =>
      repo.updateSeriesFrom(v.key, v.id, v.version, v.fromNumber, v.affected, v.input),
    onSuccess: (w) => invalidate(w),
  });
}

export function useEndSeries() {
  const repo = useRepo();
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number; lastNumber: number | null; affected: AffectedRef[] }) =>
      repo.endSeries(v.key, v.id, v.version, v.lastNumber, v.affected),
    onSuccess: (w) => invalidate(w),
  });
}

export function useDeleteSeries() {
  const repo = useRepo();
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number; affected: AffectedRef[] }) =>
      repo.deleteSeries(v.key, v.id, v.version, v.affected),
    onSuccess: (w) => invalidate(w, true),
  });
}

/** Tentativa de escrita de gasto fixo com resultado incerto (falha de rede). snapshot = conteúdo enviado. */
export interface SeriesAttempt {
  key: string;
  snapshot: string;
}

/**
 * Chave de operação das escritas de gasto fixo, guardada entre tentativas (padrão das contas a pagar):
 * - o mesmo conteúdo depois de uma falha de rede vai com a mesma chave, e o banco reconhece a repetição;
 * - antes de repetir, findSaved confere com findSeriesOperation se alguma tentativa anterior foi gravada;
 * - as tentativas só são esquecidas depois de uma gravação confirmada ou reconciliada (settled).
 */
export function useSeriesOperationKey() {
  const repo = useRepo();
  const qc = useQueryClient();
  const current = useRef(newOperationKey());
  const pending = useRef<SeriesAttempt[]>([]);
  return {
    hasPending: () => pending.current.length > 0,
    /** A tentativa incerta mais recente que foi gravada, com a ação e a série; null se nenhuma foi. */
    findSaved: async (): Promise<(SeriesAttempt & { action: SeriesAction; seriesId: string }) | null> => {
      for (const attempt of [...pending.current].reverse()) {
        const op = await repo.findSeriesOperation(attempt.key);
        if (!op) continue;
        qc.invalidateQueries({ queryKey: ['series'] });
        qc.invalidateQueries({ queryKey: ['commitments'] });
        qc.invalidateQueries({ queryKey: ['commitment'] });
        return { ...attempt, ...op };
      }
      return null;
    },
    /** Chave do envio: a da última tentativa incerta, se o conteúdo é o mesmo; senão, uma nova. */
    keyFor: (snapshot: string) => {
      const last = pending.current[pending.current.length - 1];
      if (last && last.snapshot !== snapshot) current.current = newOperationKey();
      return current.current;
    },
    /** Falha de rede: a gravação pode ou não ter acontecido. */
    uncertain: (key: string, snapshot: string) => {
      pending.current = [...pending.current, { key, snapshot }];
      qc.invalidateQueries({ queryKey: ['series'] });
      qc.invalidateQueries({ queryKey: ['commitments'] });
    },
    /** Gravação confirmada ou reconciliada: nada fica pendente e a próxima operação usa outra chave. */
    settled: () => {
      pending.current = [];
      current.current = newOperationKey();
    },
    /** Recusa do servidor: nada foi gravado com esta chave; a próxima tentativa usa outra. */
    refused: () => {
      current.current = newOperationKey();
    },
  };
}

// ---------------------------------------------------------------------------
// Contexto ativo (Pessoal/Família) e mês em exibição
// ---------------------------------------------------------------------------

export type SpaceKind = 'pessoal' | 'familia';

export interface ViewState {
  space: SpaceKind;
  setSpace: (s: SpaceKind) => void;
  month: IsoMonth;
  setMonth: (m: IsoMonth) => void;
  /** Direção da última troca de mês (1 = adiante, -1 = para trás), para a transição. */
  monthDirection: 1 | -1;
  currentMonth: IsoMonth;
}

export const ViewContext = createContext<ViewState | null>(null);

export function useView() {
  const v = use(ViewContext);
  if (!v) throw new Error('useView fora do ViewProvider');
  return v;
}

export function canGoForward(month: IsoMonth, currentMonth: IsoMonth) {
  return addMonths(month, 1) <= currentMonth;
}

export function currentMonthOf(today: string) {
  return monthOf(today);
}
