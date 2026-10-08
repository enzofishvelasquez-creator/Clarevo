import {
  addMonths,
  monthOf,
  summarizeMonth,
  summarizeToPay,
  type CommitmentInput,
  type CommitmentWrite,
  type FinancialRecord,
  type IsoMonth,
  type PaymentInput,
  type RecordInput,
  type RecordKind,
} from '@clarevo/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use } from 'react';

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

/** Contas a pagar com vencimento no mês (abertas e pagas), as pagas com data de pagamento no mês e as abertas de outros meses; o total sai de summarizeToPay. */
export function useCommitments(contextId: string | undefined, month: IsoMonth) {
  const repo = useRepo();
  const { today } = useSession();
  const query = useQuery({
    queryKey: ['commitments', contextId, month],
    queryFn: () => repo.listCommitments(contextId!, month),
    enabled: Boolean(contextId),
  });
  const summary = query.data && contextId ? summarizeToPay(query.data, contextId, month, today) : null;
  return { ...query, summary };
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
