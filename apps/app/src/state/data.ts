import {
  ESSENTIAL_LOOKBACK_MONTHS,
  addMonths,
  annualCommitmentIds,
  committedGoalLines,
  essentialMonthly,
  goalPlan,
  isRepoError,
  isSavingsStepDone,
  lastIncomeReferenceChangeAt,
  reserveEssentialBaseCents,
  loadReturnReview,
  monthOf,
  newOperationKey,
  organizeGoals,
  paymentsForecast,
  plannedForGoals,
  projectCommitted,
  returnWindow,
  savedInMonth,
  savingsCardState,
  suggestReference,
  summarizeCommitted,
  summarizeMonth,
  summarizeToPay,
  upcomingCommittedMonths,
  type AffectedRef,
  type Cents,
  type Commitment,
  type CommitmentInput,
  type CommitmentWrite,
  type CommittedGoalLines,
  type CommittedProjection,
  type CommittedSummary,
  type EssentialEstimate,
  type FinancialRecord,
  type Goal,
  type GoalAction,
  type GoalInput,
  type GoalMovement,
  type GoalMovementInput,
  type GoalMovementKind,
  type GoalPlan,
  type GoalStatus,
  type GoalWrite,
  type IncomeReference,
  type IsoDate,
  type IsoMonth,
  type NewGoalInput,
  type OccurrenceMode,
  type PaymentInput,
  type PaymentsForecast,
  type RecordInput,
  type RecordKind,
  type ReferenceSuggestion,
  type ReturnDecision,
  type ReturnReview,
  type ReturnReviewState,
  type SavingsAnswer,
  type SavingsCardState,
  type SavingsCheck,
  type SeriesAction,
  type SeriesEditInput,
  type SeriesInput,
  type SeriesWrite,
} from '@clarevo/core';
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createContext, use, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

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
 * Uma vez por dia e por contexto: a chave inclui hoje, e a geração no banco é idempotente. As escritas de gasto fixo
 * não pedem outra: create_series, update_series_from e end_series já criam as contas da janela na mesma transação.
 * As contagens se somam no mesmo dia, para a faixa "O Clarevo criou 2 contas..." não sumir depois de uma
 * nova sincronização que não cria nada (por exemplo, ao tentar de novo depois de uma falha).
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
        // Uma conta criada agora deixa de ser "sem conta registrada" na revisão dos últimos meses.
        qc.invalidateQueries({ queryKey: ['returnReview'] });
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

/** A sincronização do dia já terminou bem uma vez: uma nova tentativa que falha depois não desfaz as contas criadas. */
const synced = (sync: UseQueryResult<SeriesSyncResult>) => sync.data !== undefined;

function afterSync<T>(sync: UseQueryResult<SeriesSyncResult>, query: UseQueryResult<T>): SyncedQuery<T> {
  const done = synced(sync);
  const refetch = () => (!done ? sync.refetch() : query.refetch());
  const isFetching = sync.isFetching || query.isFetching;
  // Sincronização já feita prevalece: uma falha dela em segundo plano não apaga listas carregadas. Uma falha da
  // própria consulta continua mostrando erro (por exemplo, depois de um pagamento), nunca um total antigo.
  if (done && query.isSuccess) return { data: query.data, error: null, isPending: false, isError: false, isSuccess: true, isFetching, refetch };
  const error = !done && sync.isError ? sync.error : query.isError ? query.error : null;
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
    enabled: Boolean(contextId) && synced(sync),
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
    // Toda escrita muda a revisão dos últimos meses (atividade, recebimentos e gastos do mês).
    qc.invalidateQueries({ queryKey: ['returnReview'] });
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
    qc.invalidateQueries({ queryKey: ['returnReview'] });
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

/**
 * Gastos fixos e parcelamentos do contexto (inclusive encerrados), depois da sincronização do dia. enabled: false só adia a
 * carga (a renda comprometida do Resumo não precisa da lista de séries).
 */
export function useSeriesList(contextId: string | undefined, enabled = true) {
  const repo = useRepo();
  const sync = useSeriesSync(contextId);
  const query = useQuery({
    queryKey: ['series', 'list', contextId],
    queryFn: () => repo.listSeries(contextId!),
    enabled: Boolean(contextId) && enabled && synced(sync),
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
    enabled: Boolean(id) && Boolean(contextId) && synced(sync),
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
    enabled: Boolean(id) && Boolean(contextId) && synced(sync),
  });
  return afterSync(sync, query);
}

/**
 * Contas vivas em aberto do gasto fixo, todas (sem o limite de 60), por número crescente. Junto da lista de
 * useSeriesOccurrences (mergeOccurrences), é o conjunto que o banco confere em "esta e as próximas", encerrar e
 * excluir, e as parcelas em aberto de "Faltam".
 */
export function useSeriesOpenOccurrences(id: string | undefined, contextId: string | undefined) {
  const repo = useRepo();
  const sync = useSeriesSync(contextId);
  const query = useQuery({
    queryKey: ['series', 'open', id],
    queryFn: () => repo.listOpenSeriesOccurrences(id!),
    enabled: Boolean(id) && Boolean(contextId) && synced(sync),
  });
  return afterSync(sync, query);
}

/**
 * Depois de gravar um gasto fixo: série, contas da série e o detalhe de cada conta confirmados pelo servidor na hora;
 * listas, contas a pagar e os detalhes de conta recarregam. Escritas de série não criam gastos, e a sincronização do
 * dia não roda de novo: a própria escrita cria as contas da janela.
 */
function useInvalidateSeries() {
  const qc = useQueryClient();
  return (w: SeriesWrite, deleted = false) => {
    const id = w.series.id;
    if (deleted) {
      qc.invalidateQueries({ queryKey: ['series', 'one', id], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['series', 'occurrences', id], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['series', 'open', id], refetchType: 'none' });
    } else {
      qc.setQueryData(['series', 'one', id], w.series);
      // O resultado vem em número crescente e com todas as contas vivas; a consulta guarda as 60 mais recentes, em
      // número decrescente, e a das em aberto, todas, em número crescente.
      qc.setQueryData<Commitment[]>(['series', 'occurrences', id], [...w.occurrences].reverse().slice(0, 60));
      qc.setQueryData<Commitment[]>(['series', 'open', id], w.occurrences.filter((c) => c.status === 'aberto'));
      // A conta aberta logo depois (detalhe em Contas a pagar) já mostra o valor e a versão novos.
      for (const c of w.occurrences) qc.setQueryData(['commitment', c.id], c);
    }
    qc.invalidateQueries({ queryKey: ['series', 'list'] });
    qc.invalidateQueries({ queryKey: ['commitments'] });
    // Contas tiradas por encerrar ou excluir recarregam como não encontradas.
    qc.invalidateQueries({ queryKey: ['commitment'] });
    qc.invalidateQueries({ queryKey: ['returnReview'] });
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

/**
 * Conta do ano, "Informar o valor de 2027": as parcelas do ano em aberto e estimadas recebem o valor (versão + 1 em cada
 * uma; a versão da série não muda). Mesmas invalidações das outras escritas de série.
 */
export function useInformSeriesYear() {
  const repo = useRepo();
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: (v: { key: string; seriesId: string; number: number; affected: AffectedRef[]; amountCents: number }) =>
      repo.informSeriesYear(v.key, v.seriesId, v.number, v.affected, v.amountCents),
    onSuccess: (w) => invalidate(w),
  });
}

/**
 * Conta do ano, "Tirar as parcelas de 2027" (e "Não houve em 2027"): as parcelas do ano em aberto saem de Contas a pagar
 * e nunca voltam. As contas tiradas recarregam como não encontradas (useInvalidateSeries invalida todas as contas).
 */
export function useSkipSeriesYear() {
  const repo = useRepo();
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: (v: { key: string; seriesId: string; number: number; affected: AffectedRef[] }) =>
      repo.skipSeriesYear(v.key, v.seriesId, v.number, v.affected),
    onSuccess: (w) => invalidate(w),
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
        qc.invalidateQueries({ queryKey: ['returnReview'] });
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
      qc.invalidateQueries({ queryKey: ['returnReview'] });
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
// Seus últimos meses (D-030, Ciclo A4)
// ---------------------------------------------------------------------------

/** Atividade, marca e revisão montada (review null: nenhuma revisão ativa; review.isEmpty: nada a conferir). */
export interface ReturnReviewData {
  state: ReturnReviewState;
  review: ReturnReview | null;
}

/**
 * Revisão dos últimos meses do contexto, com a chave ['returnReview', ctx, hoje]. Só depois da sincronização do dia dar
 * certo: sem ela, contas que a geração ainda vai criar apareceriam como "sem conta registrada". Se a sincronização ou a
 * carga falham, falha inteira (sem faixa no Resumo; /retomar mostra ErrorState), nunca uma lista parcial.
 * Toda escrita invalida ['returnReview']; ao voltar para o app (outro aparelho pode ter decidido), recarrega.
 */
export function useReturnReview(contextId: string | undefined) {
  const repo = useRepo();
  const qc = useQueryClient();
  const { today } = useSession();
  const sync = useSeriesSync(contextId);
  const query = useQuery({
    queryKey: ['returnReview', contextId, today],
    queryFn: (): Promise<ReturnReviewData> => loadReturnReview(repo, contextId!, today),
    enabled: Boolean(contextId) && synced(sync),
  });
  useEffect(() => {
    if (!contextId) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') qc.invalidateQueries({ queryKey: ['returnReview', contextId] });
    });
    return () => sub.remove();
  }, [qc, contextId]);
  return afterSync(sync, query);
}

/**
 * Conta de um mês passado de uma série ("Já paguei", "Ainda não paguei" e "Não houve" de uma linha sem conta
 * registrada). A versão da série não muda, mas a lista de contas dela muda: as mesmas invalidações das contas a pagar.
 */
export function useCreateSeriesOccurrence() {
  const repo = useRepo();
  const invalidate = useInvalidateCommitment();
  return useMutation({
    mutationFn: (v: { key: string; seriesId: string; seriesVersion: number; number: number; mode: OccurrenceMode }) =>
      repo.createSeriesOccurrence(v.key, v.seriesId, v.seriesVersion, v.number, v.mode),
    onSuccess: (w, v) => invalidate(w, v.mode === 'nao_houve'),
  });
}

/**
 * "Seguir adiante" e "Concluir": grava só a decisão. Confirmada pelo servidor, a revisão em cache passa a usar a marca
 * nova (a faixa some na hora, com a animação de saída) e depois recarrega. Nada mais muda: a decisão não é anotação.
 */
export function useDecideReturnReview() {
  const repo = useRepo();
  const qc = useQueryClient();
  const { today } = useSession();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; expectedVersion: number; reviewedThrough: IsoMonth; decision: ReturnDecision }) =>
      repo.decideReturnReview(v.key, v.contextId, v.expectedVersion, v.reviewedThrough, v.decision),
    onSuccess: (mark, v) => {
      qc.setQueryData<ReturnReviewData>(['returnReview', v.contextId, today], (old) => {
        if (!old) return old;
        const state = { ...old.state, mark };
        return { state, review: returnWindow(state, today) ? old.review : null };
      });
      qc.invalidateQueries({ queryKey: ['returnReview'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Consultas combinadas
// ---------------------------------------------------------------------------

/** O que uma consulta precisa ter para entrar numa combinação (UseQueryResult e SyncedQuery têm). */
interface QueryPart {
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * Junta consultas num resultado só, com a regra das demais: só há dado quando todas deram certo (value pronto); uma falha
 * falha tudo, nunca um valor parcial (nem R$ 0,00 nem 0%). Tentar de novo recarrega só as que falharam. value null é um
 * dado válido (por exemplo, "sem previsão"); undefined, não.
 */
function combineParts<T>(parts: readonly QueryPart[], value: T | undefined): SyncedQuery<T> {
  const isFetching = parts.some((p) => p.isFetching);
  const failed = parts.filter((p) => p.isError);
  const refetch = () => Promise.all((failed.length > 0 ? failed : parts).map((p) => p.refetch()));
  if (failed.length === 0 && value !== undefined && parts.every((p) => p.isSuccess)) {
    return { data: value, error: null, isPending: false, isError: false, isSuccess: true, isFetching, refetch };
  }
  return { data: undefined, error: failed[0]?.error ?? null, isPending: failed.length === 0, isError: failed.length > 0, isSuccess: false, isFetching, refetch };
}

/** Versão de um conjunto de consultas (instantes das últimas cargas): dependência estável para useMemo. */
const stamp = (results: readonly { dataUpdatedAt: number }[]) => results.map((r) => r.dataUpdatedAt).join('|');

/** Registros de vários meses do contexto, com as mesmas chaves de useMonthRecords (invalidadas junto com ['records']). */
function useRecordsOfMonths(contextId: string | undefined, months: readonly IsoMonth[]) {
  const repo = useRepo();
  return useQueries({
    queries: months.map((m) => ({ queryKey: ['records', contextId, m], queryFn: () => repo.listRecords(contextId!, m), enabled: Boolean(contextId) })),
  });
}

// ---------------------------------------------------------------------------
// Chaves de operação (padrão de useSeriesOperationKey, para renda de referência, metas e plano de guardar)
// ---------------------------------------------------------------------------

/** Tentativa de escrita com resultado incerto (falha de rede). snapshot = conteúdo enviado. */
export type OperationAttempt = SeriesAttempt;

/**
 * O servidor respondeu e recusou a escrita (nada foi gravado com a chave: use refused()). Falha de rede ou erro desconhecido,
 * não: o resultado é incerto (use uncertain()). Mesma regra das telas de gasto fixo e de conta a pagar.
 */
export function isRefusal(e: unknown): boolean {
  return isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido';
}

/**
 * Chave de operação guardada entre tentativas:
 * - o mesmo conteúdo depois de uma falha de rede vai com a mesma chave, e o banco reconhece a repetição (devolve o estado
 *   atual, sem gravar de novo);
 * - antes de repetir, findSaved confere com a busca da operação (quando existe) se alguma tentativa anterior foi gravada;
 * - as tentativas só são esquecidas depois de uma gravação confirmada ou reconciliada (settled).
 * Renda de referência e resposta do plano de guardar não têm busca de operação: a reconciliação é repetir a mesma chave com o
 * mesmo conteúdo (findSaved devolve sempre null).
 */
function useOperationAttempts<F extends object>(find: ((key: string) => Promise<F | null>) | null, refresh: (qc: QueryClient) => void) {
  const qc = useQueryClient();
  const current = useRef(newOperationKey());
  const pending = useRef<OperationAttempt[]>([]);
  return {
    hasPending: () => pending.current.length > 0,
    /** A tentativa incerta mais recente que foi gravada, com os dados da operação; null se nenhuma foi (ou sem busca). */
    findSaved: async (): Promise<(OperationAttempt & F) | null> => {
      if (!find) return null;
      for (const attempt of [...pending.current].reverse()) {
        const op = await find(attempt.key);
        if (!op) continue;
        refresh(qc);
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
      refresh(qc);
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

const refreshGoals = (qc: QueryClient) => {
  qc.invalidateQueries({ queryKey: ['goals'] });
  qc.invalidateQueries({ queryKey: ['returnReview'] });
};
const refreshReferences = (qc: QueryClient) => {
  qc.invalidateQueries({ queryKey: ['incomeRefs'] });
  qc.invalidateQueries({ queryKey: ['returnReview'] });
};
const refreshSavings = (qc: QueryClient) => {
  qc.invalidateQueries({ queryKey: ['savings'] });
};

/** Metas: findSaved usa findGoalOperation (goalId vazio quando a meta ou o movimento já não é legível; ver o repositório). */
export function useGoalOperationKey() {
  const repo = useRepo();
  return useOperationAttempts<{ action: GoalAction; goalId: string; movementId: string | null }>((key) => repo.findGoalOperation(key), refreshGoals);
}

/** Renda de referência: sem busca de operação; repetir a mesma chave com o mesmo conteúdo reconcilia. */
export function useIncomeReferenceOperationKey() {
  return useOperationAttempts<Record<never, never>>(null, refreshReferences);
}

/** Resposta do plano de guardar: sem busca de operação; repetir a mesma chave com o mesmo conteúdo reconcilia. */
export function useSavingsOperationKey() {
  return useOperationAttempts<Record<never, never>>(null, refreshSavings);
}

// ---------------------------------------------------------------------------
// Renda de referência e renda comprometida (D-026, Ciclo B)
// ---------------------------------------------------------------------------

/** Referências de renda vivas do contexto, por mês de início crescente. A renda comprometida deriva daqui. */
export function useIncomeReferences(contextId: string | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: ['incomeRefs', contextId],
    queryFn: () => repo.listIncomeReferences(contextId!),
    enabled: Boolean(contextId),
  });
}

/**
 * Renda comprometida do mês (summarizeCommitted): as contas de useCommitments (a mesma consulta do "Ainda a pagar", só depois
 * da sincronização do dia), as referências de renda e, com withSeries, a lista de séries (só para a linha de contas do ano
 * da tela /renda-comprometida; o Resumo não pede). Sem dado parcial: falha ou carregando, nunca 0%. Atualiza sozinha depois de
 * qualquer escrita de conta a pagar, pagamento, gasto fixo ou referência, porque deriva das consultas delas.
 */
export function useCommittedSummary(contextId: string | undefined, month: IsoMonth, options: { withSeries?: boolean } = {}) {
  const withSeries = options.withSeries === true;
  const { today } = useSession();
  const commitments = useCommitments(contextId, month);
  const refs = useIncomeReferences(contextId);
  const series = useSeriesList(contextId, withSeries);
  const parts: QueryPart[] = withSeries ? [commitments, refs, series] : [commitments, refs];
  const ready = parts.every((p) => p.isSuccess);
  const value = useMemo(
    () =>
      ready && contextId
        ? summarizeCommitted(commitments.data!, contextId, month, today, refs.data!, withSeries ? series.data! : [])
        : undefined,
    [ready, contextId, month, today, withSeries, commitments.data, refs.data, series.data],
  );
  return combineParts<CommittedSummary>(parts, value);
}

/**
 * "Próximos meses" e "O que muda" (projectCommitted): as contas já criadas dos 6 meses seguintes ao mês mostrado, as séries e as
 * referências. A consulta das contas usa a chave ['commitments', 'due', ...]: toda invalidação de ['commitments'] a recarrega.
 */
export function useCommittedUpcoming(contextId: string | undefined, month: IsoMonth) {
  const repo = useRepo();
  const { today } = useSession();
  const sync = useSeriesSync(contextId);
  const months = useMemo(() => upcomingCommittedMonths(month), [month]);
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const due = useQuery({
    queryKey: ['commitments', 'due', contextId, first, last],
    queryFn: () => repo.listCommitmentsDueBetween(contextId!, first, last),
    enabled: Boolean(contextId) && synced(sync),
  });
  const dueList = afterSync(sync, due);
  const refs = useIncomeReferences(contextId);
  const series = useSeriesList(contextId);
  const parts: QueryPart[] = [dueList, refs, series];
  const ready = parts.every((p) => p.isSuccess);
  const value = useMemo(
    () => (ready ? projectCommitted(series.data!, dueList.data!, refs.data!, months, today) : undefined),
    [ready, months, today, series.data, dueList.data, refs.data],
  );
  return combineParts<CommittedProjection>(parts, value);
}

/**
 * Sugestão de renda de referência (suggestReference) a partir dos 3 meses fechados anteriores ao atual. data null: nenhum
 * mês fechado com recebimentos (sem sugestão). Os registros usam as chaves de useMonthRecords.
 */
export function useReferenceSuggestion(contextId: string | undefined) {
  const { today } = useSession();
  const current = monthOf(today);
  const months = useMemo(() => [addMonths(current, -3), addMonths(current, -2), addMonths(current, -1)], [current]);
  const results = useRecordsOfMonths(contextId, months);
  const ready = results.every((r) => r.isSuccess);
  const version = stamp(results);
  const value = useMemo(
    () => (ready ? suggestReference(results.flatMap((r) => r.data ?? []), current) : undefined),
    [ready, current, version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return combineParts<ReferenceSuggestion | null>(results, value);
}

/**
 * Previsão dos pagamentos do mês (paymentsForecast): só em /a-pagar, só no mês de hoje e com algo em aberto (data null nos
 * outros casos). Pago do mês de useMonthRecords e "Ainda a pagar" de useCommitments.
 */
export function usePaymentsForecast(contextId: string | undefined, month: IsoMonth) {
  const { today } = useSession();
  const records = useMonthRecords(contextId, month);
  const commitments = useCommitments(contextId, month);
  const parts: QueryPart[] = [records, commitments];
  const value = useMemo(
    () =>
      contextId && records.data && commitments.data
        ? paymentsForecast(summarizeMonth(records.data, contextId, month).paidCents, summarizeToPay(commitments.data, contextId, month, today))
        : undefined,
    [contextId, month, today, records.data, commitments.data],
  );
  return combineParts<PaymentsForecast | null>(parts, value);
}

/** Depois de gravar uma referência: a lista confirmada pelo servidor entra na hora e recarrega; conta como anotação (atividade). */
function useInvalidateReferences() {
  const qc = useQueryClient();
  return (ref: IncomeReference, deleted = false) => {
    qc.setQueryData<IncomeReference[]>(['incomeRefs', ref.contextId], (old) => {
      if (!old) return old;
      const others = old.filter((r) => r.id !== ref.id);
      return deleted ? others : [...others, ref].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth) || a.id.localeCompare(b.id));
    });
    qc.invalidateQueries({ queryKey: ['incomeRefs'] });
    qc.invalidateQueries({ queryKey: ['returnReview'] });
  };
}

/** Salvar a renda de referência de um mês (versão 0 cria; a versão atual altera). A renda comprometida recalcula na hora. */
export function useSetIncomeReference() {
  const repo = useRepo();
  const invalidate = useInvalidateReferences();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; fromMonth: IsoMonth; expectedVersion: number; amountCents: Cents; varies: boolean }) =>
      repo.setIncomeReference(v.key, v.contextId, v.fromMonth, v.expectedVersion, v.amountCents, v.varies),
    onSuccess: (ref) => invalidate(ref),
  });
}

/** Excluir uma referência (a anterior volta a valer; sem nenhuma, só valores em reais). */
export function useDeleteIncomeReference() {
  const repo = useRepo();
  const invalidate = useInvalidateReferences();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number }) => repo.deleteIncomeReference(v.key, v.id, v.version),
    onSuccess: (ref) => invalidate(ref, true),
  });
}

// ---------------------------------------------------------------------------
// Metas e reserva para imprevistos (D-027, Ciclo C)
// ---------------------------------------------------------------------------

/** Metas vivas do contexto (todas as situações), por criação, com os totais dos movimentos. */
export function useGoals(contextId: string | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: ['goals', 'list', contextId], queryFn: () => repo.listGoals(contextId!), enabled: Boolean(contextId) });
}

/** Uma meta com os totais, ou null (excluída, inexistente ou sem leitura). */
export function useGoal(id: string | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: ['goals', 'one', id], queryFn: () => repo.getGoal(id!), enabled: Boolean(id) });
}

/** Movimentos vivos da meta, do mais recente ao mais antigo. */
export function useGoalMovements(goalId: string | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: ['goals', 'movements', goalId], queryFn: () => repo.listGoalMovements(goalId!), enabled: Boolean(goalId) });
}

/** Movimentos vivos de todas as metas do contexto com data no mês. */
export function useGoalMovementsInMonth(contextId: string | undefined, month: IsoMonth) {
  const repo = useRepo();
  return useQuery({
    queryKey: ['goals', 'month', contextId, month],
    queryFn: () => repo.listGoalMovementsInMonth(contextId!, month),
    enabled: Boolean(contextId),
  });
}

/** A aba Metas e os cartões: metas organizadas, plano de cada uma (goalPlan) e os totais do mês atual. */
export interface GoalsOverview {
  goals: Goal[];
  /** organizeGoals: a reserva não arquivada, as metas ativas e as concluídas e arquivadas. */
  reserve: Goal | null;
  active: Goal[];
  closed: Goal[];
  /** Mês atual (o de hoje): decide o P0 de cada plano e o "guardado no mês". */
  month: IsoMonth;
  /** Movimentos do mês atual (de todas as metas). */
  monthMovements: GoalMovement[];
  /** Aportes menos resgates do mês atual (savedInMonth). */
  savedInMonthCents: Cents;
  /** Plano por mês das metas ativas somado (plannedForGoals). */
  plannedCents: Cents;
  /** goalPlan de cada meta, pelo id. */
  plans: Record<string, GoalPlan>;
}

export function useGoalsOverview(contextId: string | undefined) {
  const { today } = useSession();
  const month = monthOf(today);
  const goals = useGoals(contextId);
  const movements = useGoalMovementsInMonth(contextId, month);
  const parts: QueryPart[] = [goals, movements];
  const ready = parts.every((p) => p.isSuccess);
  const value = useMemo((): GoalsOverview | undefined => {
    if (!ready) return undefined;
    const list = goals.data!;
    const inMonth = movements.data!;
    const plans: Record<string, GoalPlan> = {};
    for (const g of list) plans[g.id] = goalPlan(g, inMonth, today);
    return { goals: list, ...organizeGoals(list), month, monthMovements: inMonth, savedInMonthCents: savedInMonth(inMonth, month), plannedCents: plannedForGoals(list), plans };
  }, [ready, goals.data, movements.data, month, today]);
  return combineParts<GoalsOverview>(parts, value);
}

/** Detalhe de uma meta: a meta (null = excluída ou inexistente) e o histórico completo. */
export interface GoalDetailData {
  goal: Goal | null;
  movements: GoalMovement[];
}

export function useGoalDetail(id: string | undefined) {
  const goal = useGoal(id);
  const movements = useGoalMovements(id);
  const parts: QueryPart[] = [goal, movements];
  const ready = parts.every((p) => p.isSuccess);
  const value = useMemo((): GoalDetailData | undefined => (ready ? { goal: goal.data ?? null, movements: movements.data! } : undefined), [ready, goal.data, movements.data]);
  return combineParts<GoalDetailData>(parts, value);
}

/** Linhas de metas da tela /renda-comprometida (fora do percentual) e a renda comprometida do mês mostrado. */
export interface CommittedGoalData {
  summary: CommittedSummary;
  lines: CommittedGoalLines;
  /** Há alguma meta? Sem meta, a tela não mostra o bloco. */
  hasGoals: boolean;
}

export function useCommittedGoalLines(contextId: string | undefined, month: IsoMonth) {
  const summary = useCommittedSummary(contextId, month);
  const goals = useGoals(contextId);
  const movements = useGoalMovementsInMonth(contextId, month);
  const parts: QueryPart[] = [summary, goals, movements];
  const ready = parts.every((p) => p.isSuccess);
  const value = useMemo((): CommittedGoalData | undefined => {
    if (!ready) return undefined;
    const s = summary.data!;
    const list = goals.data!;
    return { summary: s, lines: committedGoalLines(s, savedInMonth(movements.data!, month), plannedForGoals(list)), hasGoals: list.length > 0 };
  }, [ready, summary.data, goals.data, movements.data, month]);
  return combineParts<CommittedGoalData>(parts, value);
}

/**
 * Gastos essenciais por mês (essentialMonthly): os 6 meses fechados anteriores ao atual (as mesmas consultas de registros de
 * useMonthRecords), sem os gastos gerados por pagamento de conta do ano (as contas de cada série anual) e, sem meses com
 * gastos, as contas do mês atual. source 'informado' (amountCents null): a pessoa digita.
 */
export function useEssentialEstimate(contextId: string | undefined) {
  const repo = useRepo();
  const { today } = useSession();
  const current = monthOf(today);
  const months = useMemo(() => Array.from({ length: ESSENTIAL_LOOKBACK_MONTHS }, (_, i) => addMonths(current, -(i + 1))), [current]);
  const records = useRecordsOfMonths(contextId, months);
  const series = useSeriesList(contextId);
  const annual = useMemo(() => (series.data ?? []).filter((s) => s.kind === 'anual'), [series.data]);
  const occurrences = useQueries({
    queries: annual.map((s) => ({ queryKey: ['series', 'occurrences', s.id], queryFn: () => repo.listSeriesOccurrences(s.id), enabled: series.isSuccess })),
  });
  const commitments = useCommitments(contextId, current);
  const parts: QueryPart[] = [...records, series, ...occurrences, commitments];
  const ready = parts.every((p) => p.isSuccess);
  const version = `${stamp(records)}#${stamp(occurrences)}`;
  const value = useMemo((): EssentialEstimate | undefined => {
    if (!ready || !contextId) return undefined;
    const committed = summarizeCommitted(commitments.data!, contextId, current, today, []).committedCents;
    const annualIds = annualCommitmentIds(occurrences.flatMap((o) => o.data ?? []));
    return essentialMonthly(records.flatMap((r) => r.data ?? []), current, committed, annualIds);
  }, [ready, contextId, current, today, commitments.data, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return combineParts<EssentialEstimate>(parts, value);
}

/** Depois de gravar uma meta ou um movimento: a meta confirmada entra na hora; listas e movimentos recarregam; conta como anotação. */
function useInvalidateGoals() {
  const qc = useQueryClient();
  return (w: GoalWrite, deleted = false) => {
    const id = w.goal.id;
    if (deleted) {
      // Confirmada a exclusão: a meta e o histórico dela já não existem para a pessoa.
      qc.setQueryData(['goals', 'one', id], null);
      qc.setQueryData(['goals', 'movements', id], []);
    } else {
      qc.setQueryData(['goals', 'one', id], w.goal);
      qc.invalidateQueries({ queryKey: ['goals', 'movements', id] });
    }
    qc.invalidateQueries({ queryKey: ['goals', 'list'] });
    qc.invalidateQueries({ queryKey: ['goals', 'month'] });
    // Toda escrita de metas é anotação: muda a atividade e, com ela, a revisão dos últimos meses.
    qc.invalidateQueries({ queryKey: ['returnReview'] });
  };
}

/** Criar meta ou reserva (com "já guardado" opcional). */
export function useCreateGoal() {
  const repo = useRepo();
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; input: NewGoalInput }) => repo.createGoal(v.key, v.contextId, v.input),
    onSuccess: (w) => invalidate(w),
  });
}

export function useUpdateGoal() {
  const repo = useRepo();
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number; input: GoalInput }) => repo.updateGoal(v.key, v.id, v.version, v.input),
    onSuccess: (w) => invalidate(w),
  });
}

/** Concluir, arquivar e reativar. */
export function useSetGoalStatus() {
  const repo = useRepo();
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number; status: GoalStatus }) => repo.setGoalStatus(v.key, v.id, v.version, v.status),
    onSuccess: (w) => invalidate(w),
  });
}

export function useDeleteGoal() {
  const repo = useRepo();
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (v: { key: string; id: string; version: number }) => repo.deleteGoal(v.key, v.id, v.version),
    onSuccess: (w) => invalidate(w, true),
  });
}

/** Aporte, resgate, rendimento recebido, valorização e desvalorização (sem versão: a versão da meta não sobe). */
export function useAddGoalMovement() {
  const repo = useRepo();
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (v: { key: string; goalId: string; kind: GoalMovementKind; input: GoalMovementInput }) =>
      repo.addGoalMovement(v.key, v.goalId, v.kind, v.input),
    onSuccess: (w) => invalidate(w),
  });
}

export function useUpdateGoalMovement() {
  const repo = useRepo();
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (v: { key: string; movementId: string; version: number; input: GoalMovementInput }) =>
      repo.updateGoalMovement(v.key, v.movementId, v.version, v.input),
    onSuccess: (w) => invalidate(w),
  });
}

export function useDeleteGoalMovement() {
  const repo = useRepo();
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (v: { key: string; movementId: string; version: number }) => repo.deleteGoalMovement(v.key, v.movementId, v.version),
    onSuccess: (w) => invalidate(w),
  });
}

// ---------------------------------------------------------------------------
// Plano de guardar (D-036)
// ---------------------------------------------------------------------------

/** Resposta da própria pessoa no contexto, ou null (nunca respondeu). Só dela: nem a Família nem a empresa leem. */
export function useSavingsCheck(contextId: string | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: ['savings', contextId], queryFn: () => repo.getSavingsCheck(contextId!), enabled: Boolean(contextId) });
}

/** 4º passo de "Primeiros passos" ("Planejar quanto guardar"): concluído com a resposta "consigo" ou "agora não". */
export function useSavingsStepDone(contextId: string | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: ['savings', contextId],
    queryFn: () => repo.getSavingsCheck(contextId!),
    enabled: Boolean(contextId),
    select: isSavingsStepDone,
  });
}

/** O card da pergunta na aba Metas: a resposta, o dia da última mudança da renda de referência e o estado (savingsCardState). */
export interface SavingsCardData {
  check: SavingsCheck | null;
  /** Instante da última mudança da renda de referência para outro valor (lastIncomeReferenceChangeAt), ou null. */
  incomeChangedAt: string | null;
  state: SavingsCardState;
}

export function useSavingsCard(contextId: string | undefined) {
  const { today } = useSession();
  const space = useSpace();
  const check = useSavingsCheck(contextId);
  const refs = useIncomeReferences(contextId);
  const parts: QueryPart[] = [space, check, refs];
  const ready = parts.every((p) => p.isSuccess);
  const value = useMemo((): SavingsCardData | undefined => {
    if (!ready) return undefined;
    const answer = check.data ?? null;
    const incomeChangedAt = lastIncomeReferenceChangeAt(refs.data!);
    return { check: answer, incomeChangedAt, state: savingsCardState(answer, today, incomeChangedAt) };
  }, [ready, check.data, refs.data, today]);
  return combineParts<SavingsCardData>(parts, value);
}

/**
 * O que savingsPlan precisa além do valor por mês, que a tela digita: as metas, os movimentos do mês atual e os gastos
 * essenciais. suggestedEssentialCents: a base da reserva que já existe ou, sem reserva, a sugestão (null = a pessoa informa);
 * a pessoa pode ajustá-la antes de chamar savingsPlan({ monthlyCents, essentialCents, goals, movements, today, chosenStageId }).
 */
export interface SavingsPlanInputs {
  goals: Goal[];
  movements: GoalMovement[];
  estimate: EssentialEstimate;
  suggestedEssentialCents: Cents | null;
}

export function useSavingsPlanInputs(contextId: string | undefined) {
  const { today } = useSession();
  const goals = useGoals(contextId);
  const movements = useGoalMovementsInMonth(contextId, monthOf(today));
  const estimate = useEssentialEstimate(contextId);
  const parts: QueryPart[] = [goals, movements, estimate];
  const ready = parts.every((p) => p.isSuccess);
  const value = useMemo((): SavingsPlanInputs | undefined => {
    if (!ready) return undefined;
    const list = goals.data!;
    const reserve = organizeGoals(list).reserve;
    const est = estimate.data!;
    return { goals: list, movements: movements.data!, estimate: est, suggestedEssentialCents: reserveEssentialBaseCents(reserve) ?? est.amountCents };
  }, [ready, goals.data, movements.data, estimate.data]);
  return combineParts<SavingsPlanInputs>(parts, value);
}

/**
 * Responder "Sim, consigo", "Agora não" ou "Responder depois" (versão 0 = ainda não respondeu). Confirmada pelo servidor, a
 * resposta entra na hora no cache (card, plano e passo 4 de Primeiros passos). Não é anotação: não mexe na revisão dos
 * últimos meses.
 */
export function useSetSavingsAnswer() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; expectedVersion: number; answer: SavingsAnswer; monthlyCents?: Cents | null }) =>
      repo.setSavingsAnswer(v.key, v.contextId, v.expectedVersion, v.answer, v.monthlyCents ?? null),
    onSuccess: (check) => {
      qc.setQueryData(['savings', check.contextId], check);
      qc.invalidateQueries({ queryKey: ['savings'] });
    },
  });
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
