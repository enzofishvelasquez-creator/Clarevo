import {
  contextCategories,
  type BusinessContext,
  type BusinessInviteRole,
  type BusinessPeople,
  type BusinessWithdrawalInput,
  type PlusStatus,
  type RecordKind,
} from '@clarevo/core';
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

// ---------------------------------------------------------------------------
// Negócio compartilhado (D-116, Clarevo Plus; D-120: pronto e desligado). As escritas usam as mesmas chaves de operação da Família
// (`useFamilyKeys` e `attemptFamily`, em state/family.ts).
// ---------------------------------------------------------------------------

/**
 * A chave do Plus (plus_status), só para quem tem um negócio (quem não tem nunca pede a função). A função ausente (banco sem a migração
 * 0043) vem como fechado; outra falha é repetida pela consulta e, enquanto isso, a tela trata como fechado (`data` indefinido). A leitura
 * fica guardada por 5 minutos.
 */
export function usePlusStatus() {
  const { repo, user } = useSession();
  const business = useBusiness();
  return useQuery({
    queryKey: ['plusStatus', user?.id ?? null],
    queryFn: (): Promise<PlusStatus> => repo!.getPlusStatus(),
    enabled: Boolean(repo && user && business.data),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * As pessoas do negócio (D-120): o papel de quem consulta, as pessoas e, para quem administra, os convites, mais a chave do Plus. Com o
 * Plus fechado e quem consulta administrando, vem só a própria pessoa (o app não lê nada da migração 0043). `contextId` indefinido: desligada.
 */
export function useBusinessPeople(contextId: string | null | undefined) {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['businessPeople', user?.id ?? null, contextId ?? null],
    queryFn: (): Promise<BusinessPeople> => repo!.getBusinessPeople(contextId!),
    enabled: Boolean(repo && user && contextId),
  });
}

/**
 * As pessoas do negócio que a pessoa tem (D-120). O repositório decide o que ler: com o Plus fechado, quem administra e ninguém mais no
 * negócio (o app publicado hoje), só o próprio vínculo e a conferência de outras pessoas, sem nada da migração 0043, e a tela fica como
 * antes; havendo (ou tendo havido) outras pessoas, a lista vem mesmo com o Plus fechado, para quem administra continuar vendo quem lê.
 */
export function useSharedBusinessPeople(business: BusinessContext | null | undefined) {
  return useBusinessPeople(business?.id ?? null);
}

/**
 * O que a pessoa pode fazer com um item (lançamento, conta a pagar, gasto fixo, cartão) do negócio compartilhado (D-120): `canWrite`, anotar
 * e pagar (quem administra e quem anota e vê; quem só vê, não); `canChange`, editar, excluir e mover o próprio item, ou qualquer um para
 * quem administra (só ela edita o que é de outras pessoas). Fora do negócio (Pessoal e Família) nada muda: os dois valem. Num negócio sem
 * outras pessoas, quem consulta administra e anotou tudo: também nada muda.
 */
export function useBusinessItemAccess(contextId: string | null | undefined, createdBy: string | null | undefined): { canWrite: boolean; canChange: boolean } {
  const business = useBusiness().data;
  const { user } = useSession();
  if (!business || !contextId || business.id !== contextId) return { canWrite: true, canChange: true };
  const canWrite = business.role !== 'leitor';
  return { canWrite, canChange: canWrite && (business.role === 'titular' || (Boolean(createdBy) && createdBy === user?.id)) };
}

/** Convidar, cancelar, remover e mudar o papel só mudam as pessoas do negócio (e o papel de quem consulta, lido em `business`). */
function useReloadBusinessPeople() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['businessPeople'] }), qc.invalidateQueries({ queryKey: ['business'] })]);
}

export function useCreateBusinessInvite() {
  const repo = useRepo();
  const reload = useReloadBusinessPeople();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; role: BusinessInviteRole }) => repo.createBusinessInvite(v.key, v.contextId, v.role),
    onSuccess: reload,
  });
}

export function useCancelBusinessInvite() {
  const repo = useRepo();
  const reload = useReloadBusinessPeople();
  return useMutation({ mutationFn: (v: { key: string; inviteId: string }) => repo.cancelBusinessInvite(v.key, v.inviteId), onSuccess: reload });
}

/** Aceitar e sair mudam o que a pessoa lê (o seletor, as contas e os lançamentos): recarregar tudo. */
export function useAcceptBusinessInvite() {
  const repo = useRepo();
  const reload = useReloadAll();
  return useMutation({ mutationFn: (v: { key: string; code: string }) => repo.acceptBusinessInvite(v.key, v.code), onSuccess: reload });
}

export function useLeaveBusiness() {
  const repo = useRepo();
  const reload = useReloadAll();
  return useMutation({ mutationFn: (v: { key: string; contextId: string }) => repo.leaveBusiness(v.key, v.contextId), onSuccess: reload });
}

export function useRemoveBusinessMember() {
  const repo = useRepo();
  const reload = useReloadBusinessPeople();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; personId: string }) => repo.removeBusinessMember(v.key, v.contextId, v.personId),
    onSuccess: reload,
  });
}

export function useSetBusinessMemberRole() {
  const repo = useRepo();
  const reload = useReloadBusinessPeople();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; personId: string; role: BusinessInviteRole }) =>
      repo.setBusinessMemberRole(v.key, v.contextId, v.personId, v.role),
    onSuccess: reload,
  });
}
