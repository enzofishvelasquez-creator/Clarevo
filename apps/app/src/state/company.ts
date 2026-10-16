import { type Benefit, type CompanyOverview, type CompanyUsage } from '@clarevo/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { useRepo, useSession } from '@/state/session';

/**
 * As organizações que a pessoa administra (D-056), com contratos e licenças. Lista vazia para quem não administra nenhuma: é o que
 * decide se o cartão "Painel da empresa" aparece em Conta. O painel é só da web (D-056): no celular a consulta nem é feita. Fica
 * desligada sem sessão.
 */
export function useCompanies() {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['companies', user?.id ?? null],
    queryFn: (): Promise<CompanyOverview[]> => repo!.listAdministeredCompanies(),
    enabled: Boolean(repo && user && Platform.OS === 'web'),
  });
}

/** Indicadores de uso da organização (só números, nunca quem entrou). */
export function useCompanyUsage(organizationId: string | undefined) {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['company-usage', user?.id ?? null, organizationId ?? null],
    queryFn: (): Promise<CompanyUsage> => repo!.getCompanyUsage(organizationId!),
    enabled: Boolean(repo && user && organizationId),
  });
}

/** O benefício que a própria pessoa recebe da empresa; null se nunca teve. */
export function useMyBenefit() {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['my-benefit', user?.id ?? null],
    queryFn: (): Promise<Benefit | null> => repo!.getMyBenefit(),
    enabled: Boolean(repo && user),
  });
}

/** Convidar, reenviar, cancelar e encerrar só mudam o painel (licenças e uso). */
function useReloadCompany() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['companies'] }), qc.invalidateQueries({ queryKey: ['company-usage'] })]);
}

export function useInviteLicenses() {
  const repo = useRepo();
  const reload = useReloadCompany();
  return useMutation({
    mutationFn: (v: { key: string; contractId: string; emails: readonly string[] }) => repo.inviteLicenses(v.key, v.contractId, v.emails),
    onSuccess: reload,
  });
}

export function useRenewLicenseInvite() {
  const repo = useRepo();
  const reload = useReloadCompany();
  return useMutation({ mutationFn: (v: { key: string; licenseId: string }) => repo.renewLicenseInvite(v.key, v.licenseId), onSuccess: reload });
}

export function useCancelLicenseInvite() {
  const repo = useRepo();
  const reload = useReloadCompany();
  return useMutation({ mutationFn: (v: { key: string; licenseId: string }) => repo.cancelLicenseInvite(v.key, v.licenseId), onSuccess: reload });
}

export function useEndLicense() {
  const repo = useRepo();
  const reload = useReloadCompany();
  return useMutation({ mutationFn: (v: { key: string; licenseId: string }) => repo.endLicense(v.key, v.licenseId), onSuccess: reload });
}

/** Aceitar o benefício muda o que a pessoa lê em Conta: recarrega o benefício (e o resto, que não depende dele). */
export function useAcceptLicense() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: string; code: string }) => repo.acceptLicense(v.key, v.code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-benefit'] }),
  });
}
