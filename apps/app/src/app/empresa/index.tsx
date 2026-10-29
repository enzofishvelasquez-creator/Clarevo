import { COMPANY_TEXT, currentContract, licenseLink, type InviteLinkRow, type License } from '@clarevo/core';
import { useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';

import { ContractCard, InviteCard, LicensesCard, LinksCard, OrganizationChoice, PromoCard, ReportCard, UsageCard } from '@/components/company-panel';
import { SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Card, Screen, Txt } from '@/components/ui';
import { inviteBaseUrl } from '@/lib/invite-share';
import { useCompanies } from '@/state/company';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = COMPANY_TEXT;

/**
 * Painel da empresa (D-056, Ciclo M), só na web e só para quem administra uma organização: contrato, convidar pessoas, links para
 * enviar, licenças, uso do app, relatório de adesão (D-062) e textos para divulgar. A empresa nunca vê finanças: nada aqui lê registros, contas, metas, cartões
 * nem a Família de ninguém. Na demonstração, mostra a "Empresa Exemplo (demonstração)", fictícia, que vive só na memória do aparelho.
 */
export default function EmpresaScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>{Platform.OS === 'web' ? <Panel /> : <Message text={T.webOnly} />}</Screen>
    </View>
  );
}

function Message({ text }: { text: string }) {
  return (
    <Card>
      <Txt>{text}</Txt>
    </Card>
  );
}

function Panel() {
  const companies = useCompanies();
  const { today } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  // Os links gerados nesta tela (ao convidar e ao reenviar): o código só existe na resposta do servidor.
  const [links, setLinks] = useState<InviteLinkRow[]>([]);

  const list = companies.data ?? [];
  const company = list.find((c) => c.organization.id === selected) ?? list[0];

  // Trocar de empresa ou sair da tela esquece os links: eles não são guardados em lugar nenhum.
  useEffect(() => {
    setLinks([]);
  }, [company?.organization.id]);

  // Só ficam os links de quem ainda tem convite pendente (quem aceitou, foi cancelado ou encerrado já não precisa do link).
  const pending = useMemo(() => new Set((company?.licenses ?? []).filter((l: License) => l.status === 'convidada').map((l) => l.email)), [company]);
  const shownLinks = links.filter((r) => pending.has(r.email));

  if (companies.isPending) return <LoadingState label={T.loading} />;
  if (companies.isError) return <ErrorState message={T.loadFailed} onRetry={() => companies.refetch()} />;
  if (!company) return <Message text={T.notAdmin} />;

  const contract = currentContract(company.contracts, today);
  const licenses = company.licenses;

  const addLinks = (rows: InviteLinkRow[]) =>
    setLinks((prev) => [...rows, ...prev.filter((p) => !rows.some((r) => r.email === p.email))]);

  return (
    <>
      {company.demo ? (
        <Banner tone="info" live={false}>
          <Txt variant="label">{T.demoBadge}</Txt>
        </Banner>
      ) : null}
      <Card style={{ gap: space[1] }}>
        <Txt variant="caption" color={colors.textSecondary}>
          Empresa
        </Txt>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {company.organization.name}
        </Txt>
      </Card>
      <OrganizationChoice companies={list} selectedId={company.organization.id} onSelect={setSelected} />
      {contract ? (
        <>
          <ContractCard contract={contract} licenses={licenses.filter((l) => l.contractId === contract.id)} today={today} />
          <InviteCard
            contract={contract}
            licenses={licenses}
            today={today}
            onInvited={(rows) => addLinks(rows)}
          />
          <LinksCard rows={shownLinks} today={today} />
        </>
      ) : null}
      <LicensesCard
        key={company.organization.id}
        licenses={licenses}
        onRenewed={(email, code) => addLinks([{ email, link: licenseLink(code, inviteBaseUrl()) }])}
        onRemoved={(email) => setLinks((prev) => prev.filter((r) => r.email !== email))}
      />
      <UsageCard organizationId={company.organization.id} />
      <ReportCard company={company} today={today} />
      <PromoCard today={today} />
    </>
  );
}
