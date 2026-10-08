import {
  CATEGORIES,
  COMMITMENT_ERROR_TEXT,
  COMMITMENT_FIELD_ORDER,
  DESCRIPTION_MAX,
  MAX_RECORD_CENTS,
  NO_CATEGORY_LABEL,
  addDays,
  centsToInput,
  charCount,
  fieldForErrorCode,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  isRepoError,
  maskDateBR,
  monthOf,
  newOperationKey,
  parseBRL,
  parseDateBR,
  validateCommitmentDraft,
  type Commitment,
  type CommitmentDraft,
  type CommitmentInput,
  type DraftField,
  type FieldErrors,
  type PersonalSpace,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Info } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { Banner, Button, Card, Chip, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useCreateCommitment, useUpdateCommitment } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

export type CommitmentFormMode = { type: 'nova'; prefill?: Partial<CommitmentInput> } | { type: 'editar'; commitment: Commitment };

/** Descrição que sugere fatura de cartão: pagar a fatura como conta a pagar contaria as compras duas vezes. */
const INVOICE_HINT = /\bfatura\b|cart[aã]o/i;

const commitmentText = (code: string) =>
  code in COMMITMENT_ERROR_TEXT ? COMMITMENT_ERROR_TEXT[code as keyof typeof COMMITMENT_ERROR_TEXT] : COMMITMENT_ERROR_TEXT.salvar_falhou;

/** Anotar e editar conta a pagar. Mesmos cuidados do RecordForm: rascunho preservado, chave por conteúdo e reconciliação. */
export function CommitmentForm({ mode, space: personal }: { mode: CommitmentFormMode; space: PersonalSpace }) {
  const { today } = useSession();
  const repo = useRepo();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const create = useCreateCommitment();
  const update = useUpdateCommitment();
  const qc = useQueryClient();

  const contextId = mode.type === 'nova' ? personal.personalContextId : mode.commitment.contextId;
  const contextName = 'Pessoal';

  // O inicial já inclui o preenchimento da rota: abrir preenchido e sair sem mexer não pede confirmação.
  const initial = useMemo<CommitmentDraft>(() => {
    if (mode.type === 'editar') {
      const c = mode.commitment;
      return { description: c.description, amountText: centsToInput(c.amountCents), dateText: formatDateBR(c.dueOn), category: c.category };
    }
    const p = mode.prefill ?? {};
    return {
      description: p.description ?? '',
      amountText: p.amountCents ? centsToInput(p.amountCents) : '',
      dateText: p.dueOn ? formatDateBR(p.dueOn) : '',
      category: p.category ?? null,
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<CommitmentDraft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const [conflict, setConflict] = useState<Commitment | null>(null);
  const [paidElsewhere, setPaidElsewhere] = useState(false);
  // Versão e vencimento de base: os da versão em que as alterações serão aplicadas.
  const [base, setBase] = useState(mode.type === 'editar' ? { version: mode.commitment.version, dueOn: mode.commitment.dueOn } : null);
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
  const editingId = mode.type === 'editar' ? mode.commitment.id : null;

  // Sair com alterações não salvas pede confirmação (voltar, gesto, botão do sistema).
  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);

  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(editingId ? `/a-pagar/${editingId}` : '/a-pagar'));

  const set = <K extends keyof CommitmentDraft>(k: K, v: CommitmentDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k in errors) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const focusFirst = (errs: FieldErrors) => {
    const first = COMMITMENT_FIELD_ORDER.find((f) => errs[f]);
    if (first) refs[first].current?.focus();
  };

  const finish = (id: string) => {
    // Confirmação tátil só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (mode.type === 'nova') {
      flash.set('Conta a pagar salva');
      leave(() => router.replace(`/a-pagar/${id}`));
    } else {
      flash.set('Alterações salvas');
      leave(() => (router.canGoBack() ? router.back() : router.replace(`/a-pagar/${id}`)));
    }
  };

  const send = async (key: string, input: CommitmentInput, version: number) => {
    if (mode.type === 'nova') return create.mutateAsync({ key, contextId, input });
    return update.mutateAsync({ key, id: mode.commitment.id, version, input });
  };

  /**
   * Resultado de rede incerto: antes de repetir, conferir se alguma tentativa anterior foi gravada.
   * Se foi e o preenchimento mudou depois da falha, aplica o preenchimento atual como edição
   * dessa mesma conta a pagar (nunca cria uma segunda). Devolve o ID, ou null se nada foi gravado.
   * As tentativas só são esquecidas depois que a leitura e a edição de acompanhamento dão certo: se uma delas
   * falhar, a próxima tentativa reconcilia de novo em vez de repetir a criação.
   */
  const reconcile = async (input: CommitmentInput, snapshot: string): Promise<string | null> => {
    for (const attempt of [...pending.current].reverse()) {
      const op = await repo.findCommitmentOperation(attempt.key);
      if (!op || (op.action !== 'criar_compromisso' && op.action !== 'editar_compromisso')) continue;
      qc.invalidateQueries({ queryKey: ['commitments'] });
      qc.invalidateQueries({ queryKey: ['commitment', op.commitmentId] });
      const current = await repo.getCommitment(op.commitmentId);
      if (attempt.snapshot === snapshot || !current) {
        pending.current = [];
        return op.commitmentId;
      }
      const saved = await update.mutateAsync({ key: newOperationKey(), id: current.id, version: current.version, input });
      pending.current = [];
      return saved.commitment.id;
    }
    return null;
  };

  /** Versão desatualizada na edição: recarrega e mostra o que mudou, sem perder o preenchimento. */
  const showConflict = async (id: string) => {
    try {
      const current = await repo.getCommitment(id);
      qc.invalidateQueries({ queryKey: ['commitments'] });
      if (!current) {
        setBanner(COMMITMENT_ERROR_TEXT.nao_encontrado);
        return;
      }
      qc.setQueryData(['commitment', current.id], current);
      if (current.status === 'quitado') setPaidElsewhere(true);
      else setConflict(current);
    } catch {
      setBanner(`${COMMITMENT_ERROR_TEXT.versao_desatualizada} ${COMMITMENT_ERROR_TEXT.carregar_falhou}`);
    }
  };

  const submit = async (override?: { version: number; dueOn: string }) => {
    if (busy) return; // envio repetido bloqueado enquanto o anterior não termina
    const current = override ?? base;
    const v = validateCommitmentDraft(draft, today, { originalDueOn: current?.dueOn });
    if (!v.ok) {
      setErrors(v.errors);
      focusFirst(v.errors);
      return;
    }
    setErrors({});
    setBanner(null);
    setPaidElsewhere(false);
    setBusy(true);
    const version = current?.version ?? 0;
    const snapshot = JSON.stringify([v.input, version]);
    try {
      if (pending.current.length > 0) {
        const savedId = await reconcile(v.input, snapshot);
        if (savedId) {
          setRetry(false);
          finish(savedId);
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
        setRetry(false);
        finish(saved.commitment.id);
      } catch (e) {
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          opKey.current = newOperationKey();
          setRetry(false);
          const field = fieldForErrorCode(e.code);
          if (field && COMMITMENT_FIELD_ORDER.includes(field)) {
            const errs = { [field]: commitmentText(e.code) };
            setErrors(errs);
            focusFirst(errs);
            return;
          }
          if (e.code === 'versao_desatualizada' && editingId) {
            await showConflict(editingId);
            return;
          }
          if (e.code === 'compromisso_quitado') {
            setPaidElsewhere(true);
            return;
          }
          setBanner(commitmentText(e.code));
          return;
        }
        // Falha de rede: a gravação pode ou não ter acontecido. Guardar a tentativa para reconciliar.
        pending.current = [...pending.current, { key, snapshot }];
        // Se foi gravada, a lista e o Resumo que ficaram abertos recarregam e mostram a conta.
        qc.invalidateQueries({ queryKey: ['commitments'] });
        if (editingId) qc.invalidateQueries({ queryKey: ['commitment', editingId] });
        setRetry(true);
        setBanner(COMMITMENT_ERROR_TEXT.salvar_falhou);
      }
    } catch (e) {
      // Falhou a reconciliação: a tentativa pendente continua guardada e é conferida de novo na próxima vez.
      setRetry(true);
      if (isRepoError(e) && e.code === 'compromisso_quitado') {
        setPaidElsewhere(true);
        return;
      }
      setBanner(isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido' ? commitmentText(e.code) : COMMITMENT_ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  };

  const applyOverConflict = () => {
    if (!conflict) return;
    const next = { version: conflict.version, dueOn: conflict.dueOn };
    setBase(next);
    setConflict(null);
    submit(next);
  };

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => goBack);
    else goBack();
  };

  const formatAmountOnBlur = () => {
    const cents = parseBRL(draft.amountText);
    if (cents !== null && cents > 0 && cents <= MAX_RECORD_CENTS) setDraft((d) => ({ ...d, amountText: centsToInput(cents) }));
  };

  // Avisos ao vivo (informativos; a validação continua no salvar).
  const dueOn = parseDateBR(draft.dateText);
  const alreadyDue = dueOn !== null && dueOn < today;
  const movesFrom = base && dueOn && monthOf(dueOn) !== monthOf(base.dueOn) ? monthOf(base.dueOn) : null;
  const looksLikeInvoice = INVOICE_HINT.test(draft.description);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader
        title={mode.type === 'nova' ? 'Anotar conta a pagar' : 'Editar conta a pagar'}
        onBack={requestCancel}
        right={<ContextPill label={`Salvando em ${contextName}`} />}
      />
      <Screen contentStyle={styles.body}>
        {conflict ? (
          <Banner tone="erro" icon={AlertCircle}>
            <Txt variant="label" color={colors.error}>
              {COMMITMENT_ERROR_TEXT.versao_desatualizada}
            </Txt>
            <Txt variant="caption">
              Versão atual: {conflict.description} · {formatBRL(conflict.amountCents)} · vence em {formatDateBR(conflict.dueOn)}
            </Txt>
            <Txt variant="caption">Seu preenchimento foi mantido abaixo.</Txt>
            <Button label="Aplicar minhas alterações na versão atual" tone="soft" onPress={applyOverConflict} />
            <Button label="Descartar minhas alterações" tone="ghost" onPress={() => leave(goBack)} />
          </Banner>
        ) : null}
        {paidElsewhere && editingId ? (
          <Banner tone="erro" icon={AlertCircle}>
            <Txt variant="label" color={colors.error}>
              {COMMITMENT_ERROR_TEXT.compromisso_quitado}
            </Txt>
            <Button label="Ver conta a pagar" tone="soft" onPress={() => leave(goBack)} />
          </Banner>
        ) : null}

        <Card style={{ gap: space[4] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            Prevista · só entra em Pago quando for marcada como paga
          </Txt>

          <TextField
            ref={refs.description}
            label="Descrição"
            value={draft.description}
            onChangeText={(t) => set('description', t)}
            placeholder="Ex.: Internet"
            maxLength={DESCRIPTION_MAX}
            autoFocus={mode.type === 'nova' && !mode.prefill?.description}
            error={errors.description}
            hint={charCount(draft.description) >= 60 ? `${charCount(draft.description)} de ${DESCRIPTION_MAX} caracteres` : undefined}
            returnKeyType="next"
            onSubmitEditing={() => refs.amountText.current?.focus()}
          />

          {looksLikeInvoice ? (
            <Banner tone="info" icon={Info}>
              <Txt variant="label">
                Se as compras do cartão já foram anotadas como gastos, não anote a fatura como conta a pagar: ao pagar, o valor contaria duas
                vezes em Pago.
              </Txt>
              <LinkButton label="Fatura sem contar duas vezes" style={styles.inlineLink} onPress={() => router.push('/explicacao/fatura')} />
            </Banner>
          ) : null}

          <TextField
            ref={refs.amountText}
            label="Valor em reais"
            prefix="R$"
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            onBlur={formatAmountOnBlur}
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            large
            error={errors.amountText}
            hint="Valor previsto. Ao marcar como paga, você informa o valor que saiu da conta."
          />

          <View style={{ gap: space[2] }}>
            <TextField
              ref={refs.dateText}
              label="Data de vencimento"
              value={draft.dateText}
              onChangeText={(t) => set('dateText', maskDateBR(t))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              error={errors.dateText}
              hint="Digite só os números."
            />
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Atalhos de vencimento">
              <Chip label="Hoje" selected={draft.dateText === formatDateBR(today)} onPress={() => set('dateText', formatDateBR(today))} />
              <Chip
                label="Amanhã"
                selected={draft.dateText === formatDateBR(addDays(today, 1))}
                onPress={() => set('dateText', formatDateBR(addDays(today, 1)))}
              />
            </View>
          </View>

          <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Categoria">
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              Categoria
            </Txt>
            <View style={styles.chips}>
              <Chip label={NO_CATEGORY_LABEL} selected={draft.category === null} onPress={() => set('category', null)} />
              {CATEGORIES.despesa.map((c) => (
                <Chip key={c} label={c} selected={draft.category === c} onPress={() => set('category', c)} />
              ))}
            </View>
          </View>

          {alreadyDue ? (
            <Banner tone="info" icon={Info}>
              <Txt variant="label">Esta conta a pagar já venceu. Ela aparece como vencida até ser marcada como paga.</Txt>
            </Banner>
          ) : null}
          {movesFrom && dueOn ? (
            <Banner tone="info" icon={Info}>
              <Txt variant="label">
                A conta a pagar sai de {formatMonthBR(movesFrom).toLowerCase()} e passa a contar em {formatMonthBR(monthOf(dueOn)).toLowerCase()}.
              </Txt>
            </Banner>
          ) : null}
        </Card>

        <Txt variant="label" color={colors.textSecondary}>
          Será salva em <Txt variant="label" style={{ fontFamily: fonts.bold }}>{contextName}</Txt> como conta a pagar prevista.
        </Txt>
        <LinkButton
          label="Como uma conta a pagar entra no mês?"
          color={colors.textSecondary}
          onPress={() => router.push('/explicacao/realizado-previsto')}
        />
      </Screen>

      {/* Rodapé fixo: a ação principal fica sempre visível, acima do teclado. */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
        <View style={styles.footerInner}>
          {banner ? (
            <Banner tone="erro" icon={AlertCircle}>
              <Txt variant="label" color={colors.error}>
                {banner}
              </Txt>
            </Banner>
          ) : null}
          <View style={styles.footerRow}>
            <Button label="Cancelar" tone="ghost" onPress={requestCancel} style={styles.cancel} />
            <Button
              label={retry ? 'Tentar novamente' : 'Salvar conta a pagar'}
              busy={busy}
              busyLabel="Salvando…"
              onPress={() => submit()}
              style={styles.save}
            />
          </View>
        </View>
      </View>

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

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3], paddingHorizontal: space[5] },
  footerInner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space[3] },
  footerRow: { flexDirection: 'row', gap: space[3], alignItems: 'center' },
  cancel: { alignSelf: 'auto', flexGrow: 0 },
  save: { alignSelf: 'auto', flex: 1 },
});
