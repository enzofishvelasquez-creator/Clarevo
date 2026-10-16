import { isRepoError, newOperationKey, type FamilyOverview, type InviteRole } from '@clarevo/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { useRepo, useSession } from '@/state/session';

/**
 * A Família da pessoa (D-055): o contexto, o papel dela, as pessoas (ativas e ex-membros, só com o primeiro nome) e, para o titular,
 * os convites válidos. Null quando a pessoa não está em nenhuma Família. Funciona sem sessão (fica desligada), porque o
 * ViewProvider a lê para decidir se o seletor "Pessoal | Família" aparece.
 */
export function useFamily() {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['family', user?.id ?? null],
    queryFn: (): Promise<FamilyOverview | null> => repo!.getFamily(),
    enabled: Boolean(repo && user),
  });
}

/**
 * Chaves de operação da Família: uma por ação e alvo, a mesma enquanto a tentativa não teve resposta do servidor (a conexão caiu, e
 * tocar de novo repete a operação sem duplicar) e nova depois de salvar ou de uma recusa. O banco devolve o mesmo resultado para a
 * mesma chave. Ficam só na memória da tela.
 */
export function useFamilyKeys() {
  const keys = useRef(new Map<string, string>());
  return {
    key(slot: string): string {
      let k = keys.current.get(slot);
      if (!k) {
        k = newOperationKey();
        keys.current.set(slot, k);
      }
      return k;
    },
    done(slot: string) {
      keys.current.delete(slot);
    },
  };
}

/** O servidor não respondeu (a conexão caiu): o resultado é incerto e a mesma chave deve ser reenviada. */
const UNCERTAIN_CODES: readonly string[] = ['rede', 'desconhecido'];

export type FamilyAttempt<T> = { ok: true; value: T } | { ok: false; code: string };

/**
 * Uma escrita da Família com chave de operação: sucesso ou recusa definitiva trocam a chave do espaço (`slot`); só o resultado
 * incerto a mantém, para que tocar de novo repita a operação sem duplicar.
 */
export async function attemptFamily<T>(keys: ReturnType<typeof useFamilyKeys>, slot: string, run: (key: string) => Promise<T>): Promise<FamilyAttempt<T>> {
  try {
    const value = await run(keys.key(slot));
    keys.done(slot);
    return { ok: true, value };
  } catch (e) {
    const code = isRepoError(e) ? e.code : 'salvar_falhou';
    if (!UNCERTAIN_CODES.includes(code)) keys.done(slot);
    return { ok: false, code };
  }
}

/** Criar, entrar, sair e encerrar mudam o que a pessoa lê: recarregar tudo. */
function useReloadAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

/** Convidar, cancelar, remover, mudar papel e passar a titularidade só mudam a Família. */
function useReloadFamily() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['family'] });
}

export function useCreateFamily() {
  const repo = useRepo();
  const reload = useReloadAll();
  return useMutation({ mutationFn: (v: { key: string; name: string }) => repo.createFamily(v.key, v.name), onSuccess: reload });
}

export function useCreateFamilyInvite() {
  const repo = useRepo();
  const reload = useReloadFamily();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; role: InviteRole }) => repo.createFamilyInvite(v.key, v.contextId, v.role),
    onSuccess: reload,
  });
}

export function useCancelFamilyInvite() {
  const repo = useRepo();
  const reload = useReloadFamily();
  return useMutation({ mutationFn: (v: { key: string; inviteId: string }) => repo.cancelFamilyInvite(v.key, v.inviteId), onSuccess: reload });
}

export function useAcceptFamilyInvite() {
  const repo = useRepo();
  const reload = useReloadAll();
  return useMutation({ mutationFn: (v: { key: string; code: string }) => repo.acceptFamilyInvite(v.key, v.code), onSuccess: reload });
}

export function useLeaveFamily() {
  const repo = useRepo();
  const reload = useReloadAll();
  return useMutation({ mutationFn: (v: { key: string; contextId: string }) => repo.leaveFamily(v.key, v.contextId), onSuccess: reload });
}

export function useRemoveFamilyMember() {
  const repo = useRepo();
  const reload = useReloadFamily();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; personId: string }) => repo.removeFamilyMember(v.key, v.contextId, v.personId),
    onSuccess: reload,
  });
}

export function useSetMemberRole() {
  const repo = useRepo();
  const reload = useReloadFamily();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; personId: string; role: InviteRole }) => repo.setMemberRole(v.key, v.contextId, v.personId, v.role),
    onSuccess: reload,
  });
}

export function useTransferFamilyOwnership() {
  const repo = useRepo();
  const reload = useReloadFamily();
  return useMutation({
    mutationFn: (v: { key: string; contextId: string; personId: string }) => repo.transferFamilyOwnership(v.key, v.contextId, v.personId),
    onSuccess: reload,
  });
}

export function useEndFamily() {
  const repo = useRepo();
  const reload = useReloadAll();
  return useMutation({ mutationFn: (v: { key: string; contextId: string }) => repo.endFamily(v.key, v.contextId), onSuccess: reload });
}
