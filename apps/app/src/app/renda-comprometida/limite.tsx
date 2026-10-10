import {
  COMMITTED_TEXT,
  ERROR_TEXT,
  LIMIT_ERROR_TEXT,
  LIMIT_TEXT,
  addMonths,
  formatMonthBR,
  formatMonthYearBR,
  isRepoError,
  isValidIsoMonth,
  limitFor,
  limitMonthBounds,
  limitMonthError,
  monthOf,
  validateLimitDraft,
  type CommitmentLimit,
  type IsoMonth,
} from '@clarevo/core';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { AlertCircle } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { MonthStepper } from '@/components/month-stepper';
import { seriesStyles as styles } from '@/components/series-parts';
import { ErrorState } from '@/components/states';
import { Banner, Button, Card, Screen, Skeleton, TextField, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { flash } from '@/lib/flash';
import { isRefusal, useBudgetOperationKey, useCommitmentLimits, useDeleteCommitmentLimit, useSetCommitmentLimit, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * Seu limite (D-041): quanto da renda de referência a pessoa quer comprometer por mês com contas, de 10% a 100% em pontos
 * inteiros, valendo a partir de um mês. Nunca vem preenchido: é escolha da pessoa (a referência de 30% com dívidas continua só
 * na linha de dívidas). Formulário, sem barra inferior. Escrita só por set_commitment_limit e delete_commitment_limit, com chave
 * de operação guardada entre tentativas. `?mes=AAAA-MM` escolhe o mês inicial (sem ele, o mês atual).
 */
export default function LimiteScreen() {
  const contextId = useSpace().data?.personalContextId;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {contextId ? (
        <LimitForm contextId={contextId} />
      ) : (
        <>
          <SubHeader title={LIMIT_TEXT.form.title} right={<ContextPill label="Salvando em Pessoal" />} />
          <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
            <Skeleton width="100%" height={120} />
          </Screen>
        </>
      )}
    </View>
  );
}

const errorText = (code: string) =>
  code in LIMIT_ERROR_TEXT ? LIMIT_ERROR_TEXT[code as keyof typeof LIMIT_ERROR_TEXT] : ERROR_TEXT.salvar_falhou;

function LimitForm({ contextId }: { contextId: string }) {
  const { today } = useSession();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ mes?: string }>();
  const limits = useCommitmentLimits(contextId);
  const set = useSetCommitmentLimit();
  const del = useDeleteCommitmentLimit();
  const setKeys = useBudgetOperationKey();
  const delKeys = useBudgetOperationKey();

  const currentMonth = monthOf(today);
  const bounds = limitMonthBounds(today);
  const requested = typeof params.mes === 'string' && isValidIsoMonth(params.mes) && limitMonthError(params.mes, today) === null ? params.mes : null;
  const [month, setMonth] = useState<IsoMonth>(requested ?? currentMonth);
  // null: o campo segue o limite em vigor no mês escolhido; texto: a pessoa digitou.
  const [percentDraft, setPercentDraft] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<'percentText' | 'fromMonth', string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);
  const percentRef = useRef<TextInput>(null);
  const attempt = useRef<{ contentKey: string; expectedVersion: number } | null>(null);

  const list: CommitmentLimit[] | null = limits.data ?? null;
  const inEffect = list ? limitFor(list, month) : null;
  const exact = list ? (list.find((l) => l.fromMonth === month) ?? null) : null;
  const percentText = percentDraft ?? (inEffect ? String(inEffect.percent) : '');
  const dirty = percentDraft !== null;

  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });
  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);
  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/renda-comprometida'));

  const done = (text: string) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flash.set(text);
    leave(goBack);
  };

  const showRefusal = (code: string) => {
    if (code === 'percentual_invalido') {
      setErrors({ percentText: errorText(code) });
      percentRef.current?.focus();
      return;
    }
    if (code === 'mes_invalido' || code === 'vigencia_fora_do_intervalo') {
      setErrors({ fromMonth: errorText(code) });
      return;
    }
    if (code === 'versao_desatualizada' || code === 'nao_encontrado') limits.refetch();
    setBanner(errorText(code));
  };

  const submit = async () => {
    if (busy || !list) return;
    const v = validateLimitDraft({ percentText, fromMonth: month }, today);
    if (!v.ok) {
      setErrors(v.errors);
      if (v.errors.percentText) percentRef.current?.focus();
      return;
    }
    setErrors({});
    setBanner(null);
    setBusy(true);
    const contentKey = JSON.stringify([v.fromMonth, v.percent]);
    const prev = attempt.current;
    const expectedVersion = setKeys.hasPending() && prev?.contentKey === contentKey ? prev.expectedVersion : (exact?.version ?? 0);
    const snapshot = JSON.stringify([v.fromMonth, expectedVersion, v.percent]);
    const key = setKeys.keyFor(snapshot);
    try {
      const saved = await set.mutateAsync({ key, contextId, fromMonth: v.fromMonth, expectedVersion, percent: v.percent });
      setKeys.settled();
      attempt.current = null;
      setRetry(false);
      done(LIMIT_TEXT.form.saved(saved.percent, saved.fromMonth));
    } catch (e) {
      if (isRefusal(e) && isRepoError(e)) {
        setKeys.refused();
        attempt.current = null;
        setRetry(false);
        showRefusal(e.code);
      } else {
        setKeys.uncertain(key, snapshot);
        attempt.current = { contentKey, expectedVersion };
        setRetry(true);
        setBanner(ERROR_TEXT.salvar_falhou);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!exact || deleting) return;
    setDeleting(true);
    setBanner(null);
    const snapshot = JSON.stringify([exact.id, exact.version]);
    const key = delKeys.keyFor(snapshot);
    try {
      await del.mutateAsync({ key, id: exact.id, version: exact.version });
      delKeys.settled();
      setConfirmDelete(false);
      done(LIMIT_TEXT.form.removed);
    } catch (e) {
      setConfirmDelete(false);
      if (isRefusal(e) && isRepoError(e)) {
        delKeys.refused();
        showRefusal(e.code);
      } else {
        delKeys.uncertain(key, snapshot);
        setBanner(ERROR_TEXT.salvar_falhou);
      }
    } finally {
      setDeleting(false);
    }
  };

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => goBack);
    else goBack();
  };

  const prevMonth = month > bounds.min ? addMonths(month, -1) : null;
  const nextMonth = month < bounds.max ? addMonths(month, 1) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={LIMIT_TEXT.form.title} onBack={requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Txt>{LIMIT_TEXT.intro}</Txt>

        {limits.isPending ? (
          <View style={{ gap: space[3] }}>
            <Skeleton width="100%" height={72} />
            <Skeleton width="100%" height={72} />
          </View>
        ) : limits.isError || !list ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => limits.refetch()} />
        ) : (
          <>
            <Card style={{ gap: space[4] }}>
              <TextField
                ref={percentRef}
                label={LIMIT_TEXT.form.percentLabel}
                hint={LIMIT_TEXT.form.percentHint}
                value={percentText}
                onChangeText={(t) => {
                  setPercentDraft(t.replace(/[^\d%\s]/g, ''));
                  setErrors((e) => ({ ...e, percentText: undefined }));
                }}
                placeholder="Ex.: 40"
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={4}
                large
                error={errors.percentText}
              />
              <View style={{ gap: space[2] }}>
                <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                  {LIMIT_TEXT.form.fromLabel}
                </Txt>
                <MonthStepper
                  groupLabel={LIMIT_TEXT.form.fromLabel}
                  label={formatMonthBR(month)}
                  prevLabel={prevMonth ? LIMIT_TEXT.form.monthPrev(prevMonth) : 'Mês anterior'}
                  nextLabel={nextMonth ? LIMIT_TEXT.form.monthNext(nextMonth) : 'Próximo mês'}
                  onPrev={
                    prevMonth
                      ? () => {
                          setMonth(prevMonth);
                          setErrors((e) => ({ ...e, fromMonth: undefined }));
                          announceOnIOS(formatMonthYearBR(prevMonth));
                        }
                      : null
                  }
                  onNext={
                    nextMonth
                      ? () => {
                          setMonth(nextMonth);
                          setErrors((e) => ({ ...e, fromMonth: undefined }));
                          announceOnIOS(formatMonthYearBR(nextMonth));
                        }
                      : null
                  }
                />
                {errors.fromMonth ? (
                  <Txt variant="label" color={colors.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
                    {errors.fromMonth}
                  </Txt>
                ) : null}
              </View>
              {exact ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {LIMIT_TEXT.form.existing(exact.fromMonth)}
                </Txt>
              ) : null}
            </Card>
            {exact ? <Button label={LIMIT_TEXT.form.remove} tone="danger" onPress={() => setConfirmDelete(true)} /> : null}
          </>
        )}
      </Screen>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
        <View style={styles.footerInner}>
          {banner ? (
            <Banner tone="erro" icon={AlertCircle}>
              <Txt variant="label" color={colors.error} style={{ fontFamily: fonts.bold }}>
                {banner}
              </Txt>
            </Banner>
          ) : null}
          <View style={styles.footerRow}>
            <Button label={LIMIT_TEXT.form.cancel} tone="ghost" onPress={requestCancel} style={styles.cancel} />
            <Button
              label={retry ? COMMITTED_TEXT.retry : LIMIT_TEXT.form.save}
              busy={busy}
              busyLabel="Salvando…"
              disabled={!list}
              onPress={() => submit()}
              style={styles.save}
            />
          </View>
        </View>
      </View>

      <ConfirmDialog
        visible={confirmDelete && Boolean(exact)}
        title={LIMIT_TEXT.form.removeTitle(exact?.fromMonth ?? month)}
        cancelLabel={LIMIT_TEXT.form.cancel}
        confirmLabel={LIMIT_TEXT.form.removeConfirm}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove()}>
        <Txt color={colors.textSecondary}>{LIMIT_TEXT.form.removeBody}</Txt>
      </ConfirmDialog>

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
        <Txt color={colors.textSecondary}>Você tem alterações que ainda não foram salvas em Pessoal.</Txt>
      </ConfirmDialog>
    </KeyboardAvoidingView>
  );
}
