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
 * A chave do Plus (plus_status). Qualquer falha conta como fechado (o repositório já devolve {open: false}); a leitura fica guardada por
 * 5 minutos, para o app publicado sem a migração 0043 não pedir a função a cada tela.
 */
export function usePlusStatus() {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['plusStatus', user?.id ?? null],
    queryFn: (): Promise<PlusStatus> => repo!.getPlusStatus(),
    enabled: Boolean(repo && user),
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
 * As pessoas do negócio só quando podem existir outras (D-120): com o Plus aberto ou para quem não administra. Com o Plus fechado e quem
 * consulta administrando (o app publicado hoje), nada é lido além da chave do Plus (guardada por 5 minutos), e a tela fica como antes.
 */
export function useSharedBusinessPeople(business: BusinessContext | null | undefined) {
  const plus = usePlusStatus();
  const enabled = Boolean(business && (business.role !== 'titular' || plus.data?.open === true));
  return useBusinessPeople(enabled ? business!.id : null);
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
