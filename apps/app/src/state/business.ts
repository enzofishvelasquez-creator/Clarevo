import { contextCategories, type BusinessContext, type BusinessWithdrawalInput, type RecordKind } from '@clarevo/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRepo, useSession } from '@/state/session';

/**
 * O espaço Negócio da pessoa (D-113): o contexto (nome e criação) ou null, quando ela não tem um. Funciona sem sessão (fica desligado),
 * porque o ViewProvider o lê para decidir se o seletor de espaço mostra o negócio. As escritas usam as chaves de operação da Família
 * (`useFamilyKeys` e `attemptFamily`, em state/family.ts), que valem para qualquer escrita com chave.
 */
export function useBusiness() {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['business', user?.id ?? null],
    queryFn: (): Promise<BusinessContext | null> => repo!.getBusiness(),
    enabled: Boolean(repo && user),
  });
}

/**
 * As categorias de escolha de um item pelo contexto dele (D-113): as do negócio quando o item é do negócio da pessoa; as de sempre no
 * Pessoal e na Família. Para os formulários que recebem o item (cartão, gasto fixo), e não o espaço de trabalho.
 */
export function useContextCategories(contextId: string | null | undefined, kind: RecordKind = 'despesa'): readonly string[] {
  const business = useBusiness();
  return contextCategories(contextId && business.data?.id === contextId ? 'negocio' : 'pessoal', kind);
}

/** Criar e encerrar mudam o que a pessoa lê (o seletor, as contas e os lançamentos): recarregar tudo. */
function useReloadAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useCreateBusiness() {
  const repo = useRepo();
  const reload = useReloadAll();
  return useMutation({ mutationFn: (v: { key: string; name: string }) => repo.createBusiness(v.key, v.name), onSuccess: reload });
}

export function useRenameBusiness() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; name: string }) => repo.renameBusiness(v.key, v.contextId, v.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business'] }),
  });
}

export function useEndBusiness() {
  const repo = useRepo();
  const reload = useReloadAll();
  return useMutation({ mutationFn: (v: { key: string; contextId: string }) => repo.endBusiness(v.key, v.contextId), onSuccess: reload });
}

/** A retirada muda os lançamentos do negócio e do Pessoal (os dois meses, os totais e a busca). */
function useReloadRecords() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ['records', 'record', 'returnReview', 'budgetRows', 'monthBudget'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}

export function useCreateWithdrawal() {
  const repo = useRepo();
  const reload = useReloadRecords();
  return useMutation({
    mutationFn: (v: { key: string; businessContextId: string; input: BusinessWithdrawalInput }) => repo.createBusinessWithdrawal(v.key, v.businessContextId, v.input),
    onSuccess: reload,
  });
}

export function useDeleteWithdrawal() {
  const repo = useRepo();
  const reload = useReloadRecords();
  return useMutation({
    mutationFn: (v: { key: string; recordId: string; version: number }) => repo.deleteBusinessWithdrawal(v.key, v.recordId, v.version),
    onSuccess: reload,
  });
}

export function useMoveRecord() {
  const repo = useRepo();
  const reload = useReloadRecords();
  return useMutation({
    mutationFn: (v: { key: string; recordId: string; version: number; targetContextId: string; accountId: string; category: string | null }) =>
      repo.moveRecord(v.key, v.recordId, v.version, v.targetContextId, v.accountId, v.category),
    onSuccess: reload,
  });
}
