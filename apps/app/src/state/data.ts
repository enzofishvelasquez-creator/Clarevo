import {
  addMonths,
  monthOf,
  summarizeCommitments,
  summarizeMonth,
  type FinancialRecord,
  type IsoMonth,
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

export function useCommitments(contextId: string | undefined, month: IsoMonth) {
  const repo = useRepo();
  const query = useQuery({
    queryKey: ['commitments', contextId, month],
    queryFn: () => repo.listCommitments(contextId!, month),
    enabled: Boolean(contextId),
  });
  const summary = query.data && contextId ? summarizeCommitments(query.data, contextId, month) : null;
  return { ...query, summary };
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
// Contexto ativo (Pessoal/Família) e mês em exibição
// ---------------------------------------------------------------------------

export type SpaceKind = 'pessoal' | 'familia';

export interface ViewState {
  space: SpaceKind;
  setSpace: (s: SpaceKind) => void;
  month: IsoMonth;
  setMonth: (m: IsoMonth) => void;
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
