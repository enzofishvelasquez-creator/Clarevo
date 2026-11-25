import {
  BUSINESS_ROLE_HELP,
  BUSINESS_TEXT,
  RECEIVABLE_CATEGORIES,
  RECEIVABLE_FIELD_ORDER,
  RECEIVABLE_KINDS,
  RECEIVABLE_KIND_HINT,
  RECEIVABLE_KIND_LABEL,
  RECEIVABLE_TEXT,
  RECEIVE_FIELD_ORDER,
  REMINDER_TEXT,
  MEI_REMINDER_KINDS,
  MEI_REMINDER_TEXT,
  activeAccounts,
  addDays,
  formatBRL,
  formatDateBR,
  maskDateBR,
  receivableCaption,
  receivableDraftOf,
  receivableErrorText,
  receivableFieldOf,
  receivableSituation,
  receivableTakesDebtor,
  receivablesSummary,
  centsToInput,
  validateReceivableDraft,
  validateReceiveDraft,
  type BusinessContext,
  type FinancialAccount,
  type IsoDate,
  type MeiReminderKind,
  type Receivable,
  type ReceivableDraft,
  type ReceivableField,
  type ReceivableKind,
  type ReceiveField,
} from '@clarevo/core';
import { router } from 'expo-router';
import { CalendarClock, Check, HandCoins, Plus } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, View, useWindowDimensions, type TextInput } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { RowActionButton } from '@/components/commitment-row';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { SettingSwitch } from '@/components/setting-switch';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Chip, Screen, Skeleton, TextField, Txt, clampLines } from '@/components/ui';
import { DEVICE_FEATURES, type NotificationPermission } from '@/lib/device';
import { loadPrefs, useDevicePrefs } from '@/lib/device-prefs';
import { flash } from '@/lib/flash';
import { KEYBOARD_BEHAVIOR } from '@/lib/keyboard';
import { moneyA11y, moneyText, useValuesHidden } from '@/lib/privacy';
import { disableMeiReminder, enableMeiReminder, getNotificationPermission } from '@/lib/reminders';
import { useAccessCanWrite } from '@/state/access';
import { useBusiness, useCreateReceivable, useReceivable, useReceivables, useReceiveReceivable, useUpdateReceivable } from '@/state/business';
import { useAccounts } from '@/state/data';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const T = RECEIVABLE_TEXT;
export const RECEIVABLES_PATH = '/negocio/a-receber';

/** Onde o "a receber" pode mudar (D-120): quem só vê, nada; quem anota e vê, o que anotou; quem administra, tudo. Receber: quem anota. */
export function useReceivableAccess(business: BusinessContext | null | undefined, createdBy: string | null | undefined) {
  const { user } = useSession();
  const accessCanWrite = useAccessCanWrite();
  const canWrite = Boolean(business) && business!.role !== 'leitor' && accessCanWrite;
  const canChange = canWrite && (business!.role === 'titular' || (Boolean(createdBy) && createdBy === user?.id));
  return { canWrite, canChange };
}

// ---------------------------------------------------------------------------
// O cartão "A receber" em "Seu negócio"
// ---------------------------------------------------------------------------

/**
 * O cartão "A receber" de "Seu negócio" (D-122): o total em aberto, quantos são e a próxima data, numa cor só; quantos passaram da data,
 * só como fato. Não entra em Entrou nem em Saiu. Leva à lista e, para quem anota, a anotar um novo.
 */
export function ReceivablesCard({ business, canWrite }: { business: BusinessContext; canWrite: boolean }) {
  const { today } = useSession();
  const list = useReceivables(business.id);
  const mask = useMoneyLabelMask();
  const summary = list.data ? receivablesSummary(list.data, today) : null;
  return (
    <Card style={{ gap: space[3] }}>
      <View style={styles.titleRow}>
        <HandCoins size={20} color={colors.brandText} aria-hidden />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          {T.cardTitle}
        </Txt>
      </View>
      {list.isError ? (
        <ErrorState message={T.loadFailed} onRetry={() => list.refetch()} />
      ) : !summary ? (
        <Skeleton width="100%" height={56} />
      ) : summary.openCount === 0 ? (
        <Txt color={colors.textSecondary}>{T.cardEmpty}</Txt>
      ) : (
        <View style={{ gap: space[1] }}>
          <View accessible accessibilityLabel={mask(T.cardA11y(summary.openCents, summary.openCount))} style={{ gap: 2 }}>
            <Txt variant="label" color={colors.textSecondary}>
              {T.openLabel}
            </Txt>
            <MoneyTxt variant="title" style={{ fontFamily: fonts.bold }}>
              {formatBRL(summary.openCents)}
            </MoneyTxt>
          </View>
          <Txt variant="label">{T.cardCount(summary.openCount, summary.nextOn, today)}</Txt>
          {summary.pastCount > 0 ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {T.cardPast(summary.pastCount)}
            </Txt>
          ) : null}
        </View>
      )}
      <Txt variant="caption" color={colors.textSecondary}>
        {T.cardNote}
      </Txt>
      {(list.data?.length ?? 0) > 0 ? (
        <Button label={T.cardOpen} icon={CalendarClock} tone="soft" onPress={() => router.push(RECEIVABLES_PATH)} />
      ) : null}
      {canWrite ? <Button label={T.add} icon={Plus} tone="soft" onPress={() => router.push(`${RECEIVABLES_PATH}/novo`)} /> : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// A linha da lista
// ---------------------------------------------------------------------------

/**
 * Uma linha da lista: a descrição, o tipo, quem deve (se houver), a data combinada ou prevista (ou "Passou da data combinada", em texto
 * neutro, sem cor de alerta) e o valor; recebido, a data e o valor que entraram. O toque abre o detalhe; "Recebi" fica embaixo, irmão.
 */
export function ReceivableRow({ r, today, last, onReceive }: { r: Receivable; today: IsoDate; last?: boolean; onReceive?: () => void }) {
  const hidden = useValuesHidden();
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const situation = receivableSituation(r, today);
  const received = situation === 'recebido';
  const cents = r.received?.amountCents ?? r.amountCents;
  const caption = receivableCaption(r, today);
  const label = `${r.description}, ${caption.charAt(0).toLowerCase()}${caption.slice(1)}, ${moneyA11y(cents, hidden)}`;
  const amount = (
    <Txt variant="label" style={[styles.amount, tabular]}>
      {moneyText(cents, hidden)}
    </Txt>
  );
  const row = (
    <Pressable
      onPress={() => router.push(`${RECEIVABLES_PATH}/${r.id}`)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={T.rowHint}
      style={(s) => [
        styles.row,
        onReceive ? styles.rowWithAction : !last && styles.divider,
        s.pressed && { opacity: 0.7 },
        (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid' },
      ]}>
      <View style={[styles.icon, { backgroundColor: received ? colors.successTint : colors.brandTint }]}>
        {received ? <Check size={18} color={colors.success} /> : <CalendarClock size={18} color={colors.brandText} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={clampLines(2)}>
          {r.description}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {caption}
        </Txt>
        {narrow ? amount : null}
      </View>
      {narrow ? null : amount}
    </Pressable>
  );
  if (!onReceive) return row;
  return (
    <View style={[styles.withAction, !last && styles.divider]}>
      {row}
      <RowActionButton label={T.receive} accessibilityLabel={T.receiveA11y(r.description, r.amountCents)} onPress={onReceive} icon={Check} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Telas com o negócio carregado
// ---------------------------------------------------------------------------

/** A moldura comum: o cabeçalho com a pílula do negócio e os estados de carregar, falhar e sem negócio. */
export function BusinessFrame({ title, children }: { title: string; children: (business: BusinessContext) => ReactNode }) {
  const business = useBusiness();
  if (business.data) return <>{children(business.data)}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={title} right={<ContextPill label={BUSINESS_TEXT.context} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {business.isError ? (
          <ErrorState message={BUSINESS_TEXT.loadFailed} onRetry={() => business.refetch()} />
        ) : business.isSuccess ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{BUSINESS_TEXT.loadFailed}</Txt>
            <Button label={BUSINESS_TEXT.accountOpen} tone="soft" onPress={() => router.replace('/negocio')} />
          </Card>
        ) : (
          <LoadingState label={BUSINESS_TEXT.loading} />
        )}
      </Screen>
    </View>
  );
}

/** Para quem só vê: a mensagem no lugar do formulário. */
function ReadOnly({ title, business }: { title: string; business: BusinessContext }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={title} right={<ContextPill label={business.name} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Card style={{ gap: space[3] }}>
          <Txt>{BUSINESS_ROLE_HELP.leitor}</Txt>
          <Button label={T.backToList} tone="soft" onPress={() => router.replace(RECEIVABLES_PATH)} />
        </Card>
      </Screen>
    </View>
  );
}

/** O "a receber" de uma rota: carregando, falhou, não existe ou o formulário. */
function WithReceivable({ id, title, children }: { id: string | undefined; title: string; children: (r: Receivable) => ReactNode }) {
  const one = useReceivable(id);
  const [opened, setOpened] = useState<Receivable | null>(null);
  // Aberto o formulário, ele fica na tela: um conflito mostra o aviso ali, sem perder o preenchimento.
  if (!opened && one.data) setOpened(one.data);
  if (opened) return <>{children(opened)}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={title} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {one.isError ? (
          <ErrorState message={T.loadFailed} onRetry={() => one.refetch()} />
        ) : one.isSuccess ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{T.notFound}</Txt>
            <Button label={T.backToList} tone="soft" onPress={() => router.replace(RECEIVABLES_PATH)} />
          </Card>
        ) : (
          <LoadingState label={T.loading} />
        )}
      </Screen>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Anotar e editar
// ---------------------------------------------------------------------------

/** "Anotar valor a receber" (sem `id`) e "Editar valor a receber" (com o `id` de um em aberto). */
export function ReceivableFormScreen({ id }: { id?: string }) {
  const title = id ? T.editTitle : T.newTitle;
  return (
    <BusinessFrame title={title}>
      {(business) =>
        business.role === 'leitor' ? (
          <ReadOnly title={title} business={business} />
        ) : id ? (
          <WithReceivable id={id} title={title}>
            {(r) => <ReceivableForm business={business} existing={r} />}
          </WithReceivable>
        ) : (
          <ReceivableForm business={business} existing={null} />
        )
      }
    </BusinessFrame>
  );
}

const EMPTY_DRAFT: ReceivableDraft = { kind: 'fiado', description: '', amountText: '', dateText: '', category: 'Vendas', debtor: '' };

function ReceivableForm({ business, existing }: { business: BusinessContext; existing: Receivable | null }) {
  const { today } = useSession();
  const repo = useRepo();
  const create = useCreateReceivable();
  const update = useUpdateReceivable();
  const keys = useFamilyKeys();
  const access = useReceivableAccess(business, existing?.createdBy ?? null);
  const initial = existing ? receivableDraftOf(existing) : EMPTY_DRAFT;
  const [draft, setDraft] = useState<ReceivableDraft>(initial);
  const [errors, setErrors] = useState<Partial<Record<ReceivableField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(existing?.version ?? 0);
  const refs: Partial<Record<ReceivableField, React.RefObject<TextInput | null>>> = {
    description: useRef<TextInput>(null),
    amountText: useRef<TextInput>(null),
    dateText: useRef<TextInput>(null),
    debtor: useRef<TextInput>(null),
  };
  const back = existing ? `${RECEIVABLES_PATH}/${existing.id}` : RECEIVABLES_PATH;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty && !busy, back);
  const set = <K extends keyof ReceivableDraft>(k: K, v: ReceivableDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const title = existing ? T.editTitle : T.newTitle;
  // Só o que está em aberto se altera, e só por quem anotou ou administra.
  if (existing && (existing.status !== 'aberto' || !access.canChange)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={title} right={<ContextPill label={business.name} fixed />} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card style={{ gap: space[3] }}>
            <Txt>{existing.status !== 'aberto' ? T.receivedOnly : receivableErrorText('sem_permissao')}</Txt>
            <Button label={T.backToList} tone="soft" onPress={() => router.replace(RECEIVABLES_PATH)} />
          </Card>
        </Screen>
      </View>
    );
  }

  async function submit() {
    if (busy) return;
    const v = validateReceivableDraft(draft);
    if (!v.ok) {
      setErrors(v.errors);
      const first = RECEIVABLE_FIELD_ORDER.find((f) => v.errors[f]);
      if (first) refs[first]?.current?.focus();
      return;
    }
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      const slot = `a-receber:${existing?.id ?? 'novo'}:${version}:${JSON.stringify(v.input)}`;
      const r = await attemptFamily(keys, slot, (key) =>
        existing
          ? update.mutateAsync({ key, id: existing.id, version, input: v.input })
          : create.mutateAsync({ key, contextId: business.id, input: v.input }),
      );
      if (r.ok) {
        flash.set(existing ? T.updated : T.saved);
        guard.leave(() => (router.canGoBack() ? router.back() : router.replace(existing ? `${RECEIVABLES_PATH}/${existing.id}` : RECEIVABLES_PATH)));
        return;
      }
      const field = receivableFieldOf(r.code);
      if (field) setErrors({ [field]: receivableErrorText(r.code) });
      else setError(receivableErrorText(r.code));
      // Mudou em outro aparelho: a versão nova vale para a próxima tentativa (a pessoa confere o aviso antes de salvar de novo).
      if (r.code === 'versao_desatualizada' && existing) {
        const fresh = await repo.getReceivable(existing.id).catch(() => null);
        if (fresh && fresh.status === 'aberto') setVersion(fresh.version);
      }
    } finally {
      setBusy(false);
    }
  }

  const kind = draft.kind;
  const debtorShown = kind !== null && receivableTakesDebtor(kind);
  const dateChoices: { label: string; date: IsoDate }[] = [
    { label: 'Hoje', date: today },
    { label: 'Em 7 dias', date: addDays(today, 7) },
    { label: 'Em 30 dias', date: addDays(today, 30) },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={KEYBOARD_BEHAVIOR}>
      <SubHeader title={title} onBack={guard.requestCancel} right={<ContextPill label={business.name} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label={T.kindLabel} hint={kind ? RECEIVABLE_KIND_HINT[kind] : undefined} error={errors.kind}>
            {RECEIVABLE_KINDS.map((k) => (
              <Chip key={k} label={RECEIVABLE_KIND_LABEL[k]} selected={kind === k} onPress={() => set('kind', k as ReceivableKind)} />
            ))}
          </ChoiceGroup>
          <TextField
            ref={refs.description}
            label={T.descriptionLabel}
            value={draft.description}
            onChangeText={(t) => set('description', t)}
            placeholder={T.descriptionPlaceholder(kind)}
            maxLength={80}
            autoFocus={!existing}
            error={errors.description}
            returnKeyType="next"
            onSubmitEditing={() => refs.amountText?.current?.focus()}
          />
          <TextField
            ref={refs.amountText}
            label={T.amountLabel}
            prefix="R$"
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            large
            error={errors.amountText}
          />
          <View style={{ gap: space[2] }}>
            <TextField
              ref={refs.dateText}
              label={T.dateLabel(kind)}
              value={draft.dateText}
              onChangeText={(t) => set('dateText', maskDateBR(t))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              error={errors.dateText}
              hint={T.dateHint}
            />
            <View style={styles.chips}>
              {dateChoices.map((c) => (
                <Chip key={c.label} label={c.label} selected={draft.dateText === formatDateBR(c.date)} onPress={() => set('dateText', formatDateBR(c.date))} />
              ))}
            </View>
          </View>
          <ChoiceGroup label={T.categoryLabel} error={errors.category}>
            {RECEIVABLE_CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={draft.category === c} onPress={() => set('category', c)} />
            ))}
          </ChoiceGroup>
          {debtorShown ? (
            <TextField
              ref={refs.debtor}
              label={T.debtorLabel}
              value={draft.debtor}
              onChangeText={(t) => set('debtor', t)}
              maxLength={60}
              hint={T.debtorHint}
              error={errors.debtor}
              autoComplete="off"
              returnKeyType="done"
              onSubmitEditing={submit}
            />
          ) : null}
        </Card>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.notCounted}
        </Txt>
      </Screen>
      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={existing ? T.submitEdit : T.submitNew} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// "Recebi"
// ---------------------------------------------------------------------------

/** "Recebi" (/negocio/a-receber/[id]/receber): o valor (pode ser diferente), a data (até hoje) e a conta do negócio. */
export function ReceiveScreen({ id }: { id: string | undefined }) {
  return (
    <BusinessFrame title={T.receiveTitle}>
      {(business) =>
        business.role === 'leitor' ? (
          <ReadOnly title={T.receiveTitle} business={business} />
        ) : (
          <WithReceivable id={id} title={T.receiveTitle}>
            {(r) => <ReceiveLoader business={business} r={r} />}
          </WithReceivable>
        )
      }
    </BusinessFrame>
  );
}

function ReceiveLoader({ business, r }: { business: BusinessContext; r: Receivable }) {
  const accounts = useAccounts(business.id);
  if (!accounts.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.receiveTitle} right={<ContextPill label={business.name} fixed />} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          {accounts.isError ? <ErrorState message={T.loadFailed} onRetry={() => accounts.refetch()} /> : <LoadingState label={T.loading} />}
        </Screen>
      </View>
    );
  }
  return <ReceiveForm business={business} r={r} accounts={activeAccounts(accounts.data)} />;
}

function ReceiveForm({ business, r, accounts }: { business: BusinessContext; r: Receivable; accounts: FinancialAccount[] }) {
  const { today } = useSession();
  const repo = useRepo();
  const receive = useReceiveReceivable();
  const keys = useFamilyKeys();
  const [version, setVersion] = useState(r.version);
  const initial = { amountText: centsToInput(r.amountCents), dateText: formatDateBR(today), accountId: accounts[0]?.id ?? '' };
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<ReceiveField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs: Partial<Record<ReceiveField, React.RefObject<TextInput | null>>> = { amountText: useRef<TextInput>(null), dateText: useRef<TextInput>(null) };
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty && !busy, `${RECEIVABLES_PATH}/${r.id}`);
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  if (r.status !== 'aberto') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.receiveTitle} right={<ContextPill label={business.name} fixed />} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card style={{ gap: space[3] }}>
            <Txt>{T.alreadyReceived}</Txt>
            <Button label={T.backToList} tone="soft" onPress={() => router.replace(RECEIVABLES_PATH)} />
          </Card>
        </Screen>
      </View>
    );
  }

  async function submit() {
    if (busy) return;
    const v = validateReceiveDraft(draft, today);
    if (!v.ok) {
      setErrors(v.errors);
      const first = RECEIVE_FIELD_ORDER.find((f) => v.errors[f]);
      if (first) refs[first]?.current?.focus();
      return;
    }
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      const r2 = await attemptFamily(keys, `receber:${r.id}:${version}:${JSON.stringify(v.input)}`, (key) =>
        receive.mutateAsync({ key, id: r.id, version, input: v.input }),
      );
      if (r2.ok) {
        flash.set(T.receiveDone);
        guard.leave(() => (router.canGoBack() ? router.back() : router.replace(RECEIVABLES_PATH)));
        return;
      }
      if (r2.code === 'valor_invalido' || r2.code === 'valor_acima_do_limite') setErrors({ amountText: receivableErrorText(r2.code) });
      else if (r2.code === 'data_futura' || r2.code === 'data_invalida') setErrors({ dateText: receivableErrorText(r2.code) });
      else if (r2.code === 'conta_invalida') setErrors({ accountId: receivableErrorText(r2.code) });
      else setError(receivableErrorText(r2.code));
      if (r2.code === 'versao_desatualizada') {
        const fresh = await repo.getReceivable(r.id).catch(() => null);
        if (fresh && fresh.status === 'aberto') setVersion(fresh.version);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={KEYBOARD_BEHAVIOR}>
      <SubHeader title={T.receiveTitle} onBack={guard.requestCancel} right={<ContextPill label={business.name} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Card style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {r.description}
          </Txt>
          <MoneyTxt variant="label" color={colors.textSecondary}>
            {T.receiveExpected(r)}
          </MoneyTxt>
          {r.debtor ? (
            <Txt variant="label" color={colors.textSecondary}>
              {`${T.rowDebtor}: ${r.debtor}`}
            </Txt>
          ) : null}
        </Card>
        <Txt color={colors.textSecondary}>{T.receiveIntro}</Txt>
        <Card style={{ gap: space[4] }}>
          <TextField
            ref={refs.amountText}
            label={T.receiveAmountLabel}
            prefix="R$"
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            large
            hint={T.receiveAmountHint}
            error={errors.amountText}
          />
          <View style={{ gap: space[2] }}>
            <TextField
              ref={refs.dateText}
              label={T.receiveDateLabel}
              value={draft.dateText}
              onChangeText={(t) => set('dateText', maskDateBR(t))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              hint={T.receiveDateHint}
              error={errors.dateText}
            />
            <View style={styles.chips}>
              <Chip label="Hoje" selected={draft.dateText === formatDateBR(today)} onPress={() => set('dateText', formatDateBR(today))} />
              <Chip
                label="Ontem"
                selected={draft.dateText === formatDateBR(addDays(today, -1))}
                onPress={() => set('dateText', formatDateBR(addDays(today, -1)))}
              />
            </View>
          </View>
          <AccountPicker
            accounts={accounts}
            value={draft.accountId}
            onChange={(id) => set('accountId', id ?? '')}
            label={T.receiveAccountLabel}
            error={errors.accountId}
            hideManage
          />
        </Card>
      </Screen>
      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={T.receiveSubmit} busy={busy} onSubmit={submit} stackWhenNarrow />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Lembretes do MEI (em "Seu negócio")
// ---------------------------------------------------------------------------

/**
 * Lembretes do MEI (D-122): só com o tipo MEI, dois interruptores neste aparelho ("DAS do mês" e "Declaração anual do MEI"), desligados por
 * padrão. A permissão do sistema só é pedida depois do toque. Na web e na demonstração, só o que são e por que não há interruptor.
 */
export function MeiRemindersCard() {
  const { user, auth } = useSession();
  const userId = user?.id;
  const demo = auth.mode === 'demo';
  const persist = !demo;
  const prefs = useDevicePrefs(userId);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (userId) loadPrefs(userId, persist);
  }, [userId, persist]);
  useEffect(() => {
    if (!DEVICE_FEATURES || demo) return;
    let alive = true;
    getNotificationPermission().then((p) => alive && setPermission(p));
    return () => {
      alive = false;
    };
  }, [demo]);
  const toggle = async (which: MeiReminderKind, next: boolean) => {
    if (!userId || busy) return;
    if (!next) {
      disableMeiReminder(userId, persist, which);
      return;
    }
    setBusy(true);
    try {
      setPermission(await enableMeiReminder(userId, persist, which));
    } finally {
      setBusy(false);
    }
  };
  const live = DEVICE_FEATURES && !demo && prefs && userId;
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {MEI_REMINDER_TEXT.title}
      </Txt>
      <Txt color={colors.textSecondary}>{MEI_REMINDER_TEXT.intro}</Txt>
      {live
        ? MEI_REMINDER_KINDS.map((k) => (
            <SettingSwitch
              key={k}
              label={MEI_REMINDER_TEXT.kinds[k].toggle}
              caption={MEI_REMINDER_TEXT.kinds[k].caption}
              value={prefs.meiReminders[k]}
              disabled={busy}
              onChange={(v) => toggle(k, v)}
            />
          ))
        : MEI_REMINDER_KINDS.map((k) => (
            <View key={k} style={{ gap: 2 }}>
              <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                {MEI_REMINDER_TEXT.kinds[k].toggle}
              </Txt>
              <Txt variant="caption" color={colors.textSecondary}>
                {MEI_REMINDER_TEXT.kinds[k].caption}
              </Txt>
            </View>
          ))}
      <Txt variant="caption" color={colors.textSecondary}>
        {live ? MEI_REMINDER_TEXT.hourNote : demo && DEVICE_FEATURES ? REMINDER_TEXT.demo : REMINDER_TEXT.web}
      </Txt>
      {live && (prefs.meiReminders.das || prefs.meiReminders.declaracao) && permission && !permission.granted ? (
        <Banner tone="info">
          <Txt variant="label">{REMINDER_TEXT.denied}</Txt>
        </Banner>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  rowWithAction: { paddingBottom: space[2] },
  withAction: { paddingBottom: space[3] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  amount: { fontFamily: fonts.bold, fontSize: 15, textAlign: 'right' },
});
