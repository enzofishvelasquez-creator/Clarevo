import {
  BENEFIT_PLAN_LABEL,
  COMPANY_TEXT,
  LICENSE_FILTERS,
  LICENSE_FILTER_LABEL,
  LICENSE_KIND_LABEL,
  buildInviteCsv,
  buildInviteListText,
  companyErrorText,
  contractState,
  dayOf,
  deviceTimeZone,
  filterLicenses,
  formatDateBR,
  inviteCsvFileName,
  inviteLinkRows,
  licenseCounts,
  licenseKind,
  parseEmailList,
  planInvites,
  promoTexts,
  seatsOf,
  usageJoinedLine,
  type BenefitContract,
  type CompanyOverview,
  type InviteLinkRow,
  type IsoDate,
  type License,
  type LicenseFilter,
  type LicenseKind,
} from '@clarevo/core';
import { Check, CircleAlert, Copy, Download, Plus } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { ChoiceGroup } from '@/components/series-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Chip, TextField, Txt } from '@/components/ui';
import { CAN_DOWNLOAD, downloadTextFile } from '@/lib/company-file';
import { CAN_COPY, copyInvite, inviteBaseUrl } from '@/lib/invite-share';
import {
  useCancelLicenseInvite,
  useCompanyUsage,
  useEndLicense,
  useInviteLicenses,
  useRenewLicenseInvite,
} from '@/state/company';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { colors, fonts, space } from '@/theme/tokens';

const T = COMPANY_TEXT;

type Notice = { tone: 'sucesso' | 'erro'; text: string } | null;

/** Aviso de uma ação: verde quando deu certo, vermelho quando não. */
function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <Banner tone={notice.tone} icon={notice.tone === 'sucesso' ? Check : CircleAlert}>
      <Txt variant="label" color={notice.tone === 'sucesso' ? colors.successText : colors.error} style={{ fontFamily: fonts.bold }}>
        {notice.text}
      </Txt>
    </Banner>
  );
}

/** Uma linha "rótulo e valor" do contrato e do uso. */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Txt variant="label" color={colors.textSecondary} style={{ flexShrink: 1 }}>
        {label}
      </Txt>
      <Txt variant="label" style={{ fontFamily: strong ? fonts.extrabold : fonts.bold, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Txt variant="title" accessibilityRole="header" aria-level={2}>
      {children}
    </Txt>
  );
}

/** Dia (no fuso do aparelho) de um instante gravado, "07/10/2026". */
const dayText = (instant: string): string => formatDateBR(dayOf(instant, deviceTimeZone()));

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

/** Contrato: plano, vagas, vagas em uso, início e fim. */
export function ContractCard({ contract, licenses, today }: { contract: BenefitContract; licenses: readonly License[]; today: IsoDate }) {
  const seats = seatsOf(contract, licenses);
  const state = contractState(contract, today);
  return (
    <Card style={{ gap: space[2] }}>
      <SectionTitle>{T.contractTitle}</SectionTitle>
      <Row label={T.plan} value={BENEFIT_PLAN_LABEL[contract.plan]} />
      <Row label={T.seats} value={String(seats.seats)} />
      <Row label={T.seatsUsed} value={T.seatsLine(seats.used, seats.seats)} />
      <Row label={T.seatsFree} value={String(seats.free)} />
      <Row label={T.startsOn} value={formatDateBR(contract.startsOn)} />
      <Row label={T.endsOn} value={contract.endsOn ? formatDateBR(contract.endsOn) : T.noEnd} />
      <Row label="Situação" value={T.state[state]} strong />
      <Txt variant="caption" color={colors.textSecondary}>
        {T.contractNote}
      </Txt>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Convidar pessoas
// ---------------------------------------------------------------------------

/**
 * "Convidar pessoas": cola os e-mails, confere (válidos, repetidos, já convidados e inválidos) e confirma. O botão só vale sem
 * item inválido, com ao menos uma pessoa nova e dentro das vagas. Os links voltam para a tela (`onInvited`) e não são guardados.
 */
export function InviteCard({
  contract,
  licenses,
  today,
  onInvited,
}: {
  contract: BenefitContract;
  licenses: readonly License[];
  today: IsoDate;
  onInvited: (rows: InviteLinkRow[], total: number) => void;
}) {
  const invite = useInviteLicenses();
  const keys = useFamilyKeys();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const preview = useMemo(() => parseEmailList(text), [text]);
  const plan = useMemo(() => planInvites(text, contract, licenses, today), [text, contract, licenses, today]);
  const empty = preview.total === 0;

  async function submit() {
    if (busy || plan.problem !== null) return;
    setBusy(true);
    setNotice(null);
    try {
      const emails = plan.newEmails;
      const r = await attemptFamily(keys, `convidar:${contract.id}:${emails.join(',')}`, (key) =>
        invite.mutateAsync({ key, contractId: contract.id, emails }),
      );
      if (!r.ok) {
        setNotice({ tone: 'erro', text: companyErrorText(r.code) });
        return;
      }
      const rows = inviteLinkRows(r.value.results, inviteBaseUrl());
      setText('');
      setNotice({ tone: 'sucesso', text: rows.length > 0 ? T.invited(rows.length) : T.invitedNone });
      onInvited(rows, rows.length);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: space[3] }}>
      <SectionTitle>{T.inviteTitle}</SectionTitle>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.inviteHelp}
      </Txt>
      <NoticeBanner notice={notice} />
      <TextField
        label={T.inviteLabel}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setNotice(null);
        }}
        placeholder={T.invitePlaceholder}
        multiline
        numberOfLines={5}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />
      <View style={{ gap: space[1] }} accessibilityLiveRegion="polite">
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {T.previewTitle}
        </Txt>
        {empty ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {T.previewNone}
          </Txt>
        ) : (
          <>
            <Txt variant="label">{T.previewValid(plan.newEmails.length)}</Txt>
            {plan.alreadyInvited.length > 0 ? (
              <Txt variant="label" color={colors.textSecondary}>
                {T.previewAlready(plan.alreadyInvited.length)}
              </Txt>
            ) : null}
            {plan.repeated.length > 0 ? (
              <Txt variant="label" color={colors.textSecondary}>
                {T.previewRepeated(plan.repeated.length)}
              </Txt>
            ) : null}
            {plan.invalid.length > 0 ? (
              <>
                <Txt variant="label" color={colors.error} style={{ fontFamily: fonts.bold }}>
                  {T.previewInvalid(plan.invalid.length)}
                </Txt>
                {plan.invalid.slice(0, 5).map((item) => (
                  <Txt key={item} variant="caption" color={colors.error}>
                    {item.length > 60 ? `${item.slice(0, 60)}…` : item}
                  </Txt>
                ))}
                {plan.invalid.length > 5 ? (
                  <Txt variant="caption" color={colors.error}>
                    {`e mais ${plan.invalid.length - 5}`}
                  </Txt>
                ) : null}
              </>
            ) : null}
            <Txt variant="caption" color={colors.textSecondary}>
              {T.previewSeats(plan.seatsFree)}
            </Txt>
            {plan.problem !== null && plan.problem !== 'vazia' ? (
              <Txt variant="label" color={colors.error}>
                {T.problem[plan.problem]}
              </Txt>
            ) : plan.problem === 'vazia' ? (
              <Txt variant="caption" color={colors.textSecondary}>
                {T.problem.vazia}
              </Txt>
            ) : null}
          </>
        )}
      </View>
      <Button
        label={T.confirm(plan.newEmails.length)}
        icon={Plus}
        disabled={plan.problem !== null}
        busy={busy}
        busyLabel={T.confirmBusy}
        onPress={submit}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Links para enviar (só nesta tela)
// ---------------------------------------------------------------------------

/**
 * "Links para enviar": os links gerados nesta tela (ao convidar e ao reenviar). O código existe só na resposta do servidor, por isso
 * a lista vive só aqui, na memória, e some ao sair da tela. "Copiar todos" monta uma linha por pessoa (e-mail e link) e "Baixar
 * lista" leva o mesmo em CSV, para o RH enviar pelo canal interno da empresa.
 */
export function LinksCard({ rows, today }: { rows: readonly InviteLinkRow[]; today: IsoDate }) {
  const [notice, setNotice] = useState<Notice>(null);
  if (rows.length === 0) return null;

  async function copy(text: string, done: string) {
    const ok = await copyInvite(text);
    setNotice(ok ? { tone: 'sucesso', text: done } : { tone: 'erro', text: T.copyFailed });
  }

  async function download() {
    const r = await downloadTextFile(inviteCsvFileName(today), buildInviteCsv(rows), 'text/csv;charset=utf-8');
    setNotice(r === 'ok' ? { tone: 'sucesso', text: T.downloaded } : { tone: 'erro', text: T.downloadFailed });
  }

  return (
    <Card style={{ gap: space[3] }}>
      <SectionTitle>{T.linksTitle}</SectionTitle>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.linksNote}
      </Txt>
      <NoticeBanner notice={notice} />
      <View style={{ gap: space[3] }}>
        {rows.map((row) => (
          <View key={row.email} style={{ gap: space[1] }}>
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              {row.email}
            </Txt>
            <Txt
              variant="caption"
              selectable
              accessibilityLabel={T.linkFor(row.email) + ': ' + row.link}
              style={[{ flexShrink: 1 }, { wordBreak: 'break-all' } as object]}>
              {row.link}
            </Txt>
            {CAN_COPY ? (
              <Button
                label={T.copy}
                icon={Copy}
                tone="soft"
                compact
                accessibilityLabel={T.copyA11y(row.email)}
                onPress={() => copy(row.link, T.copied)}
              />
            ) : null}
          </View>
        ))}
      </View>
      {CAN_COPY ? <Button label={T.copyAll} icon={Copy} onPress={() => copy(buildInviteListText(rows), T.copyAllDone)} /> : null}
      {CAN_DOWNLOAD ? <Button label={T.download} icon={Download} tone="soft" onPress={download} /> : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Licenças
// ---------------------------------------------------------------------------

/** A linha de data de uma licença: quando o convite saiu, desde quando está ativa, quando encerrou ou quando o convite foi cancelado. */
function licenseWhen(license: License, kind: LicenseKind): string {
  if (kind === 'ativa') return T.activeSince(dayOf(license.activatedAt!, deviceTimeZone()));
  if (kind === 'encerrada') return T.endedOn(dayOf(license.endedAt!, deviceTimeZone()));
  if (kind === 'cancelada') return T.cancelledOn(dayOf(license.cancelledAt!, deviceTimeZone()));
  return T.invitedOn(dayOf(license.invitedAt, deviceTimeZone()));
}

type Confirm = { kind: 'cancelar' | 'encerrar'; license: License };

/**
 * "Licenças": filtro por situação, e-mail, situação e datas de cada uma. Convite pendente: reenviar (gera um link novo e o anterior
 * deixa de valer) e cancelar. Licença ativa: encerrar, com a explicação dos 30 dias e de que nada é apagado. Cada ação só vale
 * depois de o servidor confirmar.
 */
export function LicensesCard({
  licenses,
  onRenewed,
  onRemoved,
}: {
  licenses: readonly License[];
  onRenewed: (email: string, code: string) => void;
  onRemoved: (email: string) => void;
}) {
  const renew = useRenewLicenseInvite();
  const cancel = useCancelLicenseInvite();
  const end = useEndLicense();
  const keys = useFamilyKeys();
  const [filter, setFilter] = useState<LicenseFilter>('todas');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const counts = licenseCounts(licenses);
  const shown = filterLicenses(licenses, filter);

  async function run(slot: string, work: (key: string) => Promise<unknown>, done: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    try {
      const r = await attemptFamily(keys, slot, work);
      setNotice(r.ok ? { tone: 'sucesso', text: done } : { tone: 'erro', text: companyErrorText(r.code) });
      return r.ok;
    } finally {
      setBusy(false);
    }
  }

  async function doRenew(l: License) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await attemptFamily(keys, `reenviar:${l.id}`, (key) => renew.mutateAsync({ key, licenseId: l.id }));
      if (!r.ok) {
        setNotice({ tone: 'erro', text: companyErrorText(r.code) });
        return;
      }
      setNotice({ tone: 'sucesso', text: T.renewed });
      if (r.value.code) onRenewed(l.email, r.value.code);
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction() {
    if (!confirm) return;
    const c = confirm;
    const ok =
      c.kind === 'cancelar'
        ? await run(`cancelar:${c.license.id}`, (key) => cancel.mutateAsync({ key, licenseId: c.license.id }), T.cancelled)
        : await run(`encerrar:${c.license.id}`, (key) => end.mutateAsync({ key, licenseId: c.license.id }), T.ended);
    if (ok && c.kind === 'cancelar') onRemoved(c.license.email);
    setConfirm(null);
  }

  return (
    <Card style={{ gap: space[3] }}>
      <SectionTitle>{T.licensesTitle}</SectionTitle>
      <NoticeBanner notice={notice} />
      {licenses.length === 0 ? (
        <Txt color={colors.textSecondary}>{T.licensesEmpty}</Txt>
      ) : (
        <>
          <ChoiceGroup label={T.filterLabel}>
            {LICENSE_FILTERS.map((f) => (
              <Chip
                key={f}
                label={`${LICENSE_FILTER_LABEL[f]} (${counts[f]})`}
                accessibilityLabel={T.filterCount(LICENSE_FILTER_LABEL[f], counts[f])}
                selected={filter === f}
                onPress={() => setFilter(f)}
              />
            ))}
          </ChoiceGroup>
          {shown.length === 0 ? (
            <Txt color={colors.textSecondary}>{T.licensesNone}</Txt>
          ) : (
            <View>
              {shown.map((l, i) => {
                const kind = licenseKind(l);
                const when = licenseWhen(l, kind);
                return (
                  <View key={l.id} style={[styles.license, i < shown.length - 1 && styles.licenseDivider]}>
                    <View accessible accessibilityLabel={T.licenseA11y(l.email, kind, when)} style={{ gap: 2 }}>
                      <Txt variant="label" style={{ fontFamily: fonts.bold }} selectable>
                        {l.email}
                      </Txt>
                      <Txt variant="caption" color={kind === 'ativa' ? colors.successText : colors.textSecondary} style={{ fontFamily: fonts.bold }}>
                        {LICENSE_KIND_LABEL[kind]}
                      </Txt>
                      <Txt variant="caption" color={colors.textSecondary}>
                        {when}
                      </Txt>
                    </View>
                    {kind === 'convidada' ? (
                      <View style={styles.actions}>
                        <Button label={T.renew} tone="soft" compact disabled={busy} accessibilityLabel={T.renewA11y(l.email)} onPress={() => doRenew(l)} />
                        <Button
                          label={T.cancelInvite}
                          tone="soft"
                          compact
                          disabled={busy}
                          accessibilityLabel={T.cancelInviteA11y(l.email)}
                          onPress={() => setConfirm({ kind: 'cancelar', license: l })}
                        />
                      </View>
                    ) : null}
                    {kind === 'ativa' ? (
                      <View style={styles.actions}>
                        <Button
                          label={T.end}
                          tone="danger"
                          compact
                          disabled={busy}
                          accessibilityLabel={T.endA11y(l.email)}
                          onPress={() => setConfirm({ kind: 'encerrar', license: l })}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      <ConfirmDialog
        visible={confirm !== null}
        title={confirm?.kind === 'cancelar' ? T.cancelTitle : T.endTitle}
        cancelLabel={T.keep}
        confirmLabel={confirm?.kind === 'cancelar' ? T.cancelConfirm : T.endConfirm}
        confirmTone={confirm?.kind === 'cancelar' ? 'brand' : 'danger'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={confirmAction}>
        {confirm ? (
          <>
            <Txt style={{ fontFamily: fonts.bold }}>{confirm.license.email}</Txt>
            <Txt color={colors.textSecondary}>{confirm.kind === 'cancelar' ? T.cancelBody : T.endBody}</Txt>
          </>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Uso do app
// ---------------------------------------------------------------------------

/** "Uso do app": só números do uso e das licenças (nunca quem entrou) e a explicação de privacidade. */
export function UsageCard({ organizationId }: { organizationId: string }) {
  const usage = useCompanyUsage(organizationId);
  const joined = usage.data ? usageJoinedLine(usage.data) : null;
  return (
    <Card style={{ gap: space[2] }}>
      <SectionTitle>{T.usageTitle}</SectionTitle>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.usageIntro}
      </Txt>
      {usage.isError ? (
        <ErrorState message={T.usageLoadFailed} onRetry={() => usage.refetch()} />
      ) : !usage.data || !joined ? (
        <LoadingState />
      ) : (
        <>
          <Row label={T.usageSeats} value={String(usage.data.seats)} />
          <Row label={T.usageInvited} value={String(usage.data.invited)} />
          <Row label={T.usageActive} value={String(usage.data.active)} />
          <Row label={T.usageEnded} value={String(usage.data.ended)} />
          <Row label={joined.label} value={joined.value} strong />
        </>
      )}
      <Txt variant="label" style={{ marginTop: space[2] }}>
        {T.privacy}
      </Txt>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Textos para divulgar
// ---------------------------------------------------------------------------

/** "Textos para divulgar" (P-028): textos prontos e neutros, com "Copiar"; nos meses de época, um do mês. Nenhum leva dado de ninguém. */
export function PromoCard({ today }: { today: IsoDate }) {
  const [notice, setNotice] = useState<Notice>(null);
  const texts = useMemo(() => promoTexts(today), [today]);
  async function copy(text: string) {
    const ok = await copyInvite(text);
    setNotice(ok ? { tone: 'sucesso', text: T.promoCopied } : { tone: 'erro', text: T.copyFailed });
  }
  return (
    <Card style={{ gap: space[3] }}>
      <SectionTitle>{T.promoTitle}</SectionTitle>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.promoIntro}
      </Txt>
      <NoticeBanner notice={notice} />
      {texts.map((p) => (
        <View key={p.id} style={{ gap: space[2] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            {p.title}
          </Txt>
          <Txt selectable>{p.text}</Txt>
          {CAN_COPY ? (
            <Button label={T.promoCopy} icon={Copy} tone="soft" compact accessibilityLabel={T.promoCopyA11y(p.title)} onPress={() => copy(p.text)} />
          ) : null}
        </View>
      ))}
    </Card>
  );
}

/** Troca de organização, quando a pessoa administra mais de uma. */
export function OrganizationChoice({
  companies,
  selectedId,
  onSelect,
}: {
  companies: readonly CompanyOverview[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (companies.length < 2) return null;
  return (
    <Card>
      <ChoiceGroup label={T.organizationChoose}>
        {companies.map((c) => (
          <Chip key={c.organization.id} label={c.organization.name} selected={c.organization.id === selectedId} onPress={() => onSelect(c.organization.id)} />
        ))}
      </ChoiceGroup>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3], minHeight: 28 },
  license: { gap: space[2], paddingVertical: space[3] },
  licenseDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
