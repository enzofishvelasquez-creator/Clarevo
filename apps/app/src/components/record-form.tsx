import {
  CATEGORIES,
  DESCRIPTION_MAX,
  ERROR_TEXT,
  addDays,
  charCount,
  maskDateBR,
  FIELD_ORDER,
  NO_CATEGORY_LABEL,
  centsToInput,
  fieldForErrorCode,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  isRepoError,
  monthOf,
  newOperationKey,
  parseDateBR,
  validateRecordDraft,
  type DraftField,
  type FieldErrors,
  type FinancialRecord,
  type PersonalSpace,
  type RecordDraft,
  type RecordInput,
  type RecordKind,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { AlertCircle, ArrowLeft, Info, User } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { BrandHeader, ContextSwitch } from '@/components/header';
import { Banner, Button, Card, Chip, LinkButton, Screen, TextField, TopInset, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useCreateRecord, useUpdateRecord, useView, type SpaceKind } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

type Mode = { type: 'novo'; kind: RecordKind } | { type: 'editar'; record: FinancialRecord };

const COPY = {
  despesa: {
    newTitle: 'Anotar gasto',
    editTitle: 'Editar gasto',
    situation: 'Gasto já pago',
    dateLabel: 'Data do pagamento',
    save: 'Salvar gasto',
  },
  receita: {
    newTitle: 'Registrar recebimento',
    editTitle: 'Editar recebimento',
    situation: 'Recebimento já realizado',
    dateLabel: 'Data do recebimento',
    save: 'Salvar recebimento',
  },
} as const;

/** Formulário único de criar e editar (CL C002, C003, C005). */
export function RecordForm({ mode, space: personal }: { mode: Mode; space: PersonalSpace }) {
  const { today } = useSession();
  const repo = useRepo();
  const view = useView();
  const navigation = useNavigation();
  const create = useCreateRecord();
  const update = useUpdateRecord();
  const qc = useQueryClient();

  const kind = mode.type === 'novo' ? mode.kind : mode.record.kind;
  const copy = COPY[kind];
  const contextId = mode.type === 'novo' ? personal.personalContextId : mode.record.contextId;

  const initial = useMemo<RecordDraft>(
    () =>
      mode.type === 'novo'
        ? { accountId: personal.accounts[0]?.id ?? '', amountText: '', description: '', category: null, dateText: formatDateBR(today) }
        : {
            accountId: mode.record.accountId,
            amountText: centsToInput(mode.record.amountCents),
            description: mode.record.description,
            category: mode.record.category,
            dateText: formatDateBR(mode.record.occurredOn),
          },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [draft, setDraft] = useState<RecordDraft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [conflict, setConflict] = useState<FinancialRecord | null>(null);
  const [baseVersion, setBaseVersion] = useState(mode.type === 'editar' ? mode.record.version : 0);
  const [busy, setBusy] = useState(false);
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);

  const opKey = useRef(newOperationKey());
  /** Tentativas com resultado incerto (falha de rede), da mais antiga para a mais recente. */
  const pending = useRef<{ key: string; snapshot: string }[]>([]);
  const refs = {
    description: useRef<TextInput>(null),
    amountText: useRef<TextInput>(null),
    dateText: useRef<TextInput>(null),
    accountId: useRef<TextInput>(null),
  } satisfies Record<DraftField, React.RefObject<TextInput | null>>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const account = personal.accounts.find((a) => a.id === draft.accountId) ?? personal.accounts[0];
  const contextName = 'Pessoal';

  // Sair com alterações não salvas pede confirmação (voltar, gesto, botão do sistema).
  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);

  const leave = (fn: () => void) => setLeaveTo(() => fn);

  const set = <K extends keyof RecordDraft>(k: K, v: RecordDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k in errors) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const focusFirst = (errs: FieldErrors) => {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) refs[first].current?.focus();
  };

  const finish = (recordId: string) => {
    if (mode.type === 'novo') {
      flash.set(kind === 'despesa' ? 'Gasto salvo' : 'Recebimento salvo');
      leave(() => router.replace(`/registro/${recordId}`));
    } else {
      flash.set('Alterações salvas');
      leave(() => router.back());
    }
  };

  const send = async (key: string, input: RecordInput, version: number) => {
    if (mode.type === 'novo') return create.mutateAsync({ key, contextId, kind, input });
    return update.mutateAsync({ key, id: mode.record.id, version, input });
  };

  /**
   * Resultado de rede incerto: antes de repetir, conferir se alguma tentativa anterior foi gravada.
   * Se foi, e o preenchimento mudou depois da falha, aplica o preenchimento atual como edição
   * desse mesmo registro (nunca cria um segundo). Devolve o ID do registro, ou null se nada foi gravado.
   */
  const reconcile = async (input: RecordInput, snapshot: string): Promise<string | null> => {
    for (const attempt of [...pending.current].reverse()) {
      const op = await repo.findOperation(attempt.key);
      if (!op) continue;
      pending.current = [];
      qc.invalidateQueries({ queryKey: ['records'] });
      qc.invalidateQueries({ queryKey: ['record', op.recordId] });
      if (attempt.snapshot === snapshot) return op.recordId;
      const current = await repo.getRecord(op.recordId);
      if (!current) return op.recordId;
      const updated = await update.mutateAsync({ key: newOperationKey(), id: current.id, version: current.version, input });
      return updated.id;
    }
    return null;
  };

  const submit = async (versionOverride?: number) => {
    if (busy) return; // envio repetido bloqueado enquanto o anterior não termina
    const v = validateRecordDraft(draft, today);
    if (!v.ok) {
      setErrors(v.errors);
      focusFirst(v.errors);
      return;
    }
    setErrors({});
    setBanner(null);
    setBusy(true);
    const version = versionOverride ?? baseVersion;
    const snapshot = JSON.stringify([v.input, version]);
    try {
      if (pending.current.length > 0) {
        const saved = await reconcile(v.input, snapshot);
        if (saved) {
          finish(saved);
          return;
        }
        // Nada foi gravado: repetir com a mesma chave se o conteúdo é o mesmo da última tentativa.
        const last = pending.current[pending.current.length - 1];
        if (!last || last.snapshot !== snapshot) opKey.current = newOperationKey();
      }
      const key = opKey.current;
      try {
        const saved = await send(key, v.input, version);
        pending.current = [];
        finish(saved.id);
      } catch (e) {
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          opKey.current = newOperationKey();
          const field = fieldForErrorCode(e.code);
          if (field) {
            const errs = { [field]: ERROR_TEXT[e.code as keyof typeof ERROR_TEXT] };
            setErrors(errs);
            focusFirst(errs);
            return;
          }
          if (e.code === 'versao_desatualizada' && mode.type === 'editar') {
            try {
              const current = await repo.getRecord(mode.record.id);
              qc.invalidateQueries({ queryKey: ['records'] });
              if (current) {
                qc.setQueryData(['record', current.id], current);
                setConflict(current);
              } else setBanner(ERROR_TEXT.nao_encontrado);
            } catch {
              setBanner(`${ERROR_TEXT.versao_desatualizada} ${ERROR_TEXT.carregar_falhou}`);
            }
            return;
          }
          setBanner(e.code in ERROR_TEXT ? ERROR_TEXT[e.code as keyof typeof ERROR_TEXT] : ERROR_TEXT.salvar_falhou);
          return;
        }
        // Falha de rede: a gravação pode ou não ter acontecido. Guardar a tentativa para reconciliar.
        pending.current = [...pending.current, { key, snapshot }];
        setBanner(ERROR_TEXT.salvar_falhou);
      }
    } catch {
      setBanner(ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  };

  const applyOverConflict = () => {
    if (!conflict) return;
    setBaseVersion(conflict.version);
    setConflict(null);
    submit(conflict.version);
  };

  const requestSwitch = (next: SpaceKind) => {
    const go = () => {
      view.setSpace(next);
      router.back();
    };
    if (dirty) setConfirmDiscard(() => go);
    else go();
  };

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => () => router.back());
    else router.back();
  };

  const parsedDate = parseDateBR(draft.dateText);
  const movesMonth = mode.type === 'editar' && parsedDate && monthOf(parsedDate) !== monthOf(mode.record.occurredOn);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopInset color={colors.brand} />
      <Screen>
        <View style={styles.hero}>
          <BrandHeader />
          <ContextSwitch onRequest={requestSwitch} />
        </View>

        <View style={styles.body}>
          <View style={styles.navRow}>
            <LinkButtonWithIcon label="Voltar" onPress={requestCancel} />
            <View style={styles.contextChip} accessibilityLabel={`Contexto: ${contextName}`}>
              <User size={16} color={colors.brand} />
              <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold }}>
                {contextName}
              </Txt>
            </View>
          </View>

          <Txt variant="title" style={{ fontSize: 24, lineHeight: 32 }} accessibilityRole="header">
            {mode.type === 'novo' ? copy.newTitle : copy.editTitle}
          </Txt>

          {conflict ? (
            <Banner tone="erro" icon={AlertCircle}>
              <Txt variant="label" color={colors.error}>
                {ERROR_TEXT.versao_desatualizada}
              </Txt>
              <Txt variant="caption">
                Versão atual: {conflict.description} · {formatBRL(conflict.amountCents)} · {formatDateBR(conflict.occurredOn)}
              </Txt>
              <Txt variant="caption">Seu preenchimento foi mantido abaixo.</Txt>
              <Button label="Aplicar minhas alterações na versão atual" tone="soft" onPress={applyOverConflict} />
              <Button label="Descartar minhas alterações" tone="ghost" onPress={() => leave(() => router.back())} />
            </Banner>
          ) : null}

          <Card style={{ gap: space[4] }}>
            <Txt variant="caption" color={colors.textSecondary}>
              {copy.situation} · {account?.name}
            </Txt>

            <TextField
              ref={refs.description}
              label="Descrição"
              value={draft.description}
              onChangeText={(t) => set('description', t)}
              placeholder={kind === 'despesa' ? 'Ex.: Café' : 'Ex.: Salário'}
              maxLength={DESCRIPTION_MAX}
              autoFocus={mode.type === 'novo'}
              error={errors.description}
              hint={charCount(draft.description) >= 60 ? `${charCount(draft.description)} de ${DESCRIPTION_MAX} caracteres` : undefined}
              returnKeyType="next"
              onSubmitEditing={() => refs.amountText.current?.focus()}
            />

            <TextField
              ref={refs.amountText}
              label="Valor em reais"
              value={draft.amountText}
              onChangeText={(t) => set('amountText', t)}
              placeholder="0,00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              large
              error={errors.amountText}
            />

            <TextField
              ref={refs.dateText}
              label={copy.dateLabel}
              value={draft.dateText}
              onChangeText={(t) => set('dateText', maskDateBR(t))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              error={errors.dateText}
              hint="Digite só os números. Só datas até hoje."
            />
            <View style={styles.chips}>
              <Chip label="Hoje" selected={draft.dateText === formatDateBR(today)} onPress={() => set('dateText', formatDateBR(today))} />
              <Chip
                label="Ontem"
                selected={draft.dateText === formatDateBR(addDays(today, -1))}
                onPress={() => set('dateText', formatDateBR(addDays(today, -1)))}
              />
            </View>

            {personal.accounts.length > 1 ? (
              <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Conta">
                <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                  Conta
                </Txt>
                <View style={styles.chips}>
                  {personal.accounts.map((a) => (
                    <Chip key={a.id} label={a.name} selected={draft.accountId === a.id} onPress={() => set('accountId', a.id)} />
                  ))}
                </View>
                {errors.accountId ? (
                  <Txt variant="label" color={colors.error}>
                    {errors.accountId}
                  </Txt>
                ) : null}
              </View>
            ) : null}

            <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Categoria">
              <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                Categoria
              </Txt>
              <View style={styles.chips}>
                <Chip label={NO_CATEGORY_LABEL} selected={draft.category === null} onPress={() => set('category', null)} />
                {CATEGORIES[kind].map((c) => (
                  <Chip key={c} label={c} selected={draft.category === c} onPress={() => set('category', c)} />
                ))}
              </View>
            </View>

            {movesMonth && parsedDate ? (
              <Banner tone="info" icon={Info}>
                <Txt variant="label">
                  O registro sai de {formatMonthBR(monthOf(mode.record.occurredOn)).toLowerCase()} e passa a contar em{' '}
                  {formatMonthBR(monthOf(parsedDate)).toLowerCase()}.
                </Txt>
              </Banner>
            ) : null}

            <Txt variant="label" color={colors.textSecondary}>
              Será salvo em <Txt variant="label" style={{ fontFamily: fonts.bold }}>{contextName}</Txt>, {account?.name}.
            </Txt>

            {banner ? (
              <Banner tone="erro" icon={AlertCircle}>
                <Txt variant="label" color={colors.error}>
                  {banner}
                </Txt>
              </Banner>
            ) : null}

            <Button label={banner && !conflict ? 'Tentar novamente' : copy.save} busy={busy} busyLabel="Salvando…" onPress={() => submit()} />
            <LinkButton label="Cancelar" onPress={requestCancel} />
          </Card>

          <LinkButton label="Como este registro entra no mês?" color={colors.textSecondary} onPress={() => router.push('/explicacao/diferenca')} />
        </View>
      </Screen>

      <ConfirmDialog
        visible={Boolean(confirmDiscard)}
        title="Descartar o preenchimento?"
        cancelLabel="Continuar editando"
        confirmLabel="Descartar alterações"
        onCancel={() => setConfirmDiscard(null)}
        onConfirm={() => {
          const action = confirmDiscard;
          setConfirmDiscard(null);
          if (action) leave(action);
        }}>
        <Txt color={colors.textSecondary}>Você tem alterações que ainda não foram salvas em {contextName}.</Txt>
      </ConfirmDialog>
    </KeyboardAvoidingView>
  );
}

function LinkButtonWithIcon({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button label={label} icon={ArrowLeft} tone="ghost" onPress={onPress} style={{ alignSelf: 'flex-start', paddingHorizontal: space[2], minHeight: 44 }} />
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[5] },
  body: { padding: space[6], gap: space[4] },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    backgroundColor: colors.brandTint,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radius.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
