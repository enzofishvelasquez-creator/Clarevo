import type { ProfilePhotoRead, ProfilePhotoState } from '@clarevo/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/state/session';

/** A chave da foto do perfil no cache: uma por pessoa. */
export const profilePhotoKey = (userId: string | null | undefined) => ['my-photo', userId ?? null] as const;

/**
 * A versão e a foto do perfil de quem está na sessão (my_photo, 0038); a foto é null sem foto. A mesma consulta no cabeçalho, na barra lateral e em Conta
 * (uma leitura só). Sem sessão, nada é buscado.
 */
export function useMyPhoto() {
  const { repo, user } = useSession();
  return useQuery<ProfilePhotoRead>({
    queryKey: profilePhotoKey(user?.id),
    queryFn: () => repo!.getMyPhoto(),
    enabled: Boolean(repo && user),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/**
 * Pôr, trocar (base64) ou remover (null) a foto, com a versão que o app leu. Depois de gravar, ou de uma recusa, a foto é lida de novo
 * (uma troca em outro aparelho aparece aqui).
 */
export function useSetMyPhoto() {
  const { repo, user } = useSession();
  const qc = useQueryClient();
  return useMutation<ProfilePhotoState, Error, { base64: string | null; expectedVersion: number }>({
    mutationFn: ({ base64, expectedVersion }) => repo!.setMyPhoto(base64, expectedVersion),
    onSettled: () => qc.invalidateQueries({ queryKey: profilePhotoKey(user?.id) }),
  });
}
