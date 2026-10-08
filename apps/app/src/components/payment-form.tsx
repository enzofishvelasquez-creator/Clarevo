import {
  CATEGORIES,
  COMMITMENT_ERROR_TEXT,
  MAX_RECORD_CENTS,
  NO_CATEGORY_LABEL,
  PAYMENT_ERROR_TEXT,
  PAYMENT_FIELD_ORDER,
  addDays,
  centsToInput,
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
  validatePaymentDraft,
  type Commitment,
  type DraftField,
  type FieldErrors,
  type PaymentDraft,
  type PaymentInput,
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
import { totalChange } from '@/lib/highlight';
import { usePayCommitment, useUpdateRecord } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const paymentText = (code: string) =>
  code in PAYMENT_ERROR_TEXT ? PAYMENT_ERROR_TEXT[code as keyof typeof PAYMENT_ERROR_TEXT] : PAYMENT_ERROR_TEXT.pagar_falhou;

/**
 * "Marcar como paga": uma única operação no banco cria o gasto realizado e quita a conta a pagar (D-021).
 * O gasto entra em Pago do mês da data do pagamento; a conta sai de "Ainda a pagar".
 */
export function PaymentForm({ commitment: c, space: personal }: { commitment: Commitment; space: PersonalSpace }) {
  const { today } = useSession();
  const repo = useRepo();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const pay = usePayCommitment();
  const updateRecord = useUpdateRecord();
  const qc = useQueryClient();
  const contextName = 'Pessoal';

  const initial = useMemo<PaymentDraft>(
    () => ({
      accountId: personal.accounts[0]?.id ?? '',
      amountText: centsToInput(c.amountCents),
      dateText: formatDateBR(today),
      category: c.category,
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [draft, setDraft] = useState<PaymentDraft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  // Conta mostrada: a aberta no início ou, depois de um conflito, a versão atual (mudou em outro aparelho e continua em aberto).
  const [shown, setShown] = useState<Commitment>(c);
  const [conflict, setConflict] = useState(false);
  const [paidElsewhere, setPaidElsewhere] = useState(false);
  const [baseVersion, setBaseVersion] = useState(c.version);
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

  // Sair com alterações não salvas pede confirmação (voltar, gesto, botão do sistema).
  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);

  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/a-pagar/${c.id}`));

  const set = <K extends keyof PaymentDraft>(k: K, v: PaymentDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k in errors) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const focusFirst = (errs: FieldErrors) => {
    const first = PAYMENT_FIELD_ORDER.find((f) => errs[f]);
    if (first) refs[first].current?.focus();
  };

  const finish = (saved?: { amountCents: number; occurredOn: string }) => {
    // Confirmação tátil e efeito em Pago só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (saved) totalChange.set({ total: 'pago', month: monthOf(saved.occurredOn), deltaCents: saved.amountCents });
    flash.set('Pagamento registrado');
    leave(goBack);
  };

  /**
   * Resultado de rede incerto: antes de repetir, conferir se alguma tentativa anterior foi gravada.
   * Se foi e o preenchimento mudou, aplica o preenchimento atual como edição do gasto gerado.
   * Nunca há um segundo pagamento. Devolve o gasto (ou só true, se ele já não existe), ou null se nada foi gravado.
   */
  const reconcile = async (input: PaymentInput, snapshot: string): Promise<{ amountCents: number; occurredOn: string } | true | null> => {
    for (const attempt of [...pending.current].reverse()) {
      const op = await repo.findCommitmentOperation(attempt.key);
      if (!op || op.action !== 'pagar_compromisso' || !op.recordId) continue;
      pending.current = [];
      qc.invalidateQueries({ queryKey: ['commitments'] });
      qc.invalidateQueries({ queryKey: ['commitment', op.commitmentId] });
      qc.invalidateQueries({ queryKey: ['records'] });
      const expense = await repo.getRecord(op.recordId);
      if (!expense) return true;
      if (attempt.snapshot === snapshot) return expense;
      // O useInvalidate dos registros já recarrega as contas a pagar.
      return updateRecord.mutateAsync({
        key: newOperationKey(),
        id: expense.id,
        version: expense.version,
        input: { accountId: input.accountId, amountCents: input.amountCents, occurredOn: input.paidOn, description: expense.description, category: input.category },
      });
    }
    return null;
  };

  /** Versão desatualizada ou conta já paga: recarrega para mostrar o estado atual sem perder o preenchimento. */
  const reload = async () => {
    try {
      const current = await repo.getCommitment(c.id);
      qc.invalidateQueries({ queryKey: ['commitments'] });
      if (!current) {
        setBanner(COMMITMENT_ERROR_TEXT.nao_encontrado);
        return;
      }
      // O detalhe mostra a versão atual ao voltar; a rota mantém este formulário aberto.
      qc.setQueryData(['commitment', current.id], current);
      if (current.status === 'quitado') {
        setPaidElsewhere(true);
        return;
      }
      setBaseVersion(current.version);
      setShown(current);
      setConflict(true);
    } catch {
      setBanner(`${COMMITMENT_ERROR_TEXT.versao_desatualizada} ${COMMITMENT_ERROR_TEXT.carregar_falhou}`);
    }
  };

  const submit = async () => {
    if (busy) return; // envio repetido bloqueado enquanto o anterior não termina
    const v = validatePaymentDraft(draft, today);
    if (!v.ok) {
      setErrors(v.errors);
      focusFirst(v.errors);
      return;
    }
    setErrors({});
    setBanner(null);
    setConflict(false);
    setBusy(true);
    const version = baseVersion;
    const snapshot = JSON.stringify([v.input, version]);
    try {
      if (pending.current.length > 0) {
        const saved = await reconcile(v.input, snapshot);
        if (saved) {
          setRetry(false);
          finish(saved === true ? undefined : saved);
          return;
        }
        // Nada foi gravado: repetir com a mesma chave se o conteúdo é o mesmo da última tentativa.
        const last = pending.current[pending.current.length - 1];
        if (!last || last.snapshot !== snapshot) opKey.current = newOperationKey();
      }
      const key = opKey.current;
      try {
        const saved = await pay.mutateAsync({ key, id: c.id, version, input: v.input });
        pending.current = [];
        setRetry(false);
        finish(saved.record);
      } catch (e) {
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          opKey.current = newOperationKey();
          setRetry(false);
          const field = fieldForErrorCode(e.code);
          if (field && PAYMENT_FIELD_ORDER.includes(field)) {
            const errs = { [field]: paymentText(e.code) };
            setErrors(errs);
            focusFirst(errs);
            return;
          }
          if (e.code === 'versao_desatualizada' || e.code === 'compromisso_quitado') {
            await reload();
            return;
          }
          setBanner(paymentText(e.code));
          return;
        }
        // Falha de rede: o pagamento pode ou não ter sido gravado. Guardar a tentativa para reconciliar.
        pending.current = [...pending.current, { key, snapshot }];
        setRetry(true);
        setBanner(PAYMENT_ERROR_TEXT.pagar_falhou);
      }
    } catch {
      setRetry(true);
      setBanner(PAYMENT_ERROR_TEXT.pagar_falhou);
    } finally {
      setBusy(false);
    }
  };

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => goBack);
    else goBack();
  };

  const formatAmountOnBlur = () => {
    const cents = parseBRL(draft.amountText);
    if (cents !== null && cents > 0 && cents <= MAX_RECORD_CENTS) setDraft((d) => ({ ...d, amountText: centsToInput(cents) }));
  };

  // Avisos ao vivo, só com valor e data válidos: o mês de Pago afetado e a diferença do previsto.
  const amount = parseBRL(draft.amountText);
  const paidOn = parseDateBR(draft.dateText);
  const valid = amount !== null && amount > 0 && amount <= MAX_RECORD_CENTS && paidOn !== null && paidOn <= today;
  const yesterday = addDays(today, -1);
  const overdue = shown.dueOn < today;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title="Marcar como paga" onBack={requestCancel} right={<ContextPill label={`Salvando em ${contextName}`} />} />
      <Screen contentStyle={styles.body}>
        {conflict ? (
          <Banner tone="erro" icon={AlertCircle}>
            <Txt variant="label" color={colors.error}>
              {COMMITMENT_ERROR_TEXT.versao_desatualizada}
            </Txt>
            <Txt variant="caption">
              Versão atual: {shown.description} · previsto {formatBRL(shown.amountCents)} · vence em {formatDateBR(shown.dueOn)}
            </Txt>
            <Txt variant="caption">Seu preenchimento foi mantido abaixo.</Txt>
            <Button label="Confirmar pagamento na versão atual" tone="soft" onPress={() => submit()} />
          </Banner>
        ) : null}
        {paidElsewhere ? (
          <Banner tone="erro" icon={AlertCircle}>
            <Txt variant="label" color={colors.error}>
              {COMMITMENT_ERROR_TEXT.ja_paga_em_outro_aparelho}
            </Txt>
            <Button label="Ver conta a pagar" tone="soft" onPress={() => leave(goBack)} />
          </Banner>
        ) : null}

        <Card style={{ gap: space[1] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {shown.description}
          </Txt>
          <Txt variant="caption" color={overdue ? colors.error : colors.textSecondary}>
            {overdue ? 'Venceu em' : 'Vence em'} {formatDateBR(shown.dueOn)} · previsto {formatBRL(shown.amountCents)}
          </Txt>
        </Card>

        <Card style={{ gap: space[4] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            Gasto já pago · {account?.name}
          </Txt>

          <TextField
            ref={refs.amountText}
            label="Valor pago"
            prefix="R$"
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            onBlur={formatAmountOnBlur}
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            large
            error={errors.amountText}
            hint="Use o valor que saiu da conta, com juros ou desconto, se houver."
          />

          <View style={{ gap: space[2] }}>
            <TextField
              ref={refs.dateText}
              label="Data do pagamento"
              value={draft.dateText}
              onChangeText={(t) => set('dateText', maskDateBR(t))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              error={errors.dateText}
              hint="Digite só os números. Só datas até hoje."
            />
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Atalhos da data do pagamento">
              <Chip label="Hoje" selected={draft.dateText === formatDateBR(today)} onPress={() => set('dateText', formatDateBR(today))} />
              <Chip label="Ontem" selected={draft.dateText === formatDateBR(yesterday)} onPress={() => set('dateText', formatDateBR(yesterday))} />
              {shown.dueOn < yesterday ? (
                <Chip
                  label="Dia do vencimento"
                  selected={draft.dateText === formatDateBR(shown.dueOn)}
                  onPress={() => set('dateText', formatDateBR(shown.dueOn))}
                />
              ) : null}
            </View>
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
          ) : errors.accountId ? (
            <Txt variant="label" color={colors.error}>
              {errors.accountId}
            </Txt>
          ) : null}

          <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Categoria">
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              Categoria
            </Txt>
            <View style={styles.chips}>
              <Chip label={NO_CATEGORY_LABEL} selected={draft.category === null} onPress={() => set('category', null)} />
              {CATEGORIES.despesa.map((cat) => (
                <Chip key={cat} label={cat} selected={draft.category === cat} onPress={() => set('category', cat)} />
              ))}
            </View>
          </View>

          {valid ? (
            <Banner tone="info" icon={Info}>
              <Txt variant="label">
                Um gasto de {formatBRL(amount)} será registrado em Pago de {formatMonthBR(monthOf(paidOn)).toLowerCase()}, e esta conta a pagar
                sai de Ainda a pagar.
              </Txt>
              {amount !== shown.amountCents ? (
                <Txt variant="label">O valor pago é diferente do previsto ({formatBRL(shown.amountCents)}). Pago usa o valor pago.</Txt>
              ) : null}
            </Banner>
          ) : null}
        </Card>

        <LinkButton
          label="Como o pagamento entra no mês?"
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
              label={retry ? 'Tentar novamente' : 'Confirmar pagamento'}
              busy={busy}
              busyLabel="Salvando…"
              disabled={paidElsewhere}
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
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3], paddingHorizontal: space[5] },
  footerInner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space[3] },
  footerRow: { flexDirection: 'row', gap: space[3], alignItems: 'center' },
  cancel: { alignSelf: 'auto', flexGrow: 0 },
  save: { alignSelf: 'auto', flex: 1 },
});
