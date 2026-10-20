import {
  COMMITTED_TEXT,
  ERROR_TEXT,
  INCOME_AVERAGE_CHOICES,
  INCOME_AVERAGE_DEFAULT_CHOICE,
  INCOME_AVERAGE_TEXT,
  INCOME_REFERENCE_ERROR_TEXT,
  UNCERTAIN_TEXT,
  centsToInput,
  formatBRL,
  formatMonthYearBR,
  incomeAverageTexts,
  isRepoError,
  isValidIsoMonth,
  loadIncomeAverage,
  monthOf,
  referenceFor,
  referenceMonthChoices,
  referenceMonthError,
  validateIncomeReferenceDraft,
  type IncomeAverageChoice,
  type IncomeAverageOutcome,
  type IncomeReference,
  type IsoMonth,
} from '@clarevo/core';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { AlertCircle } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMoneyMask } from '@/components/committed-parts';
import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup, monthChipLabel, seriesStyles as styles } from '@/components/series-parts';
import { ErrorState } from '@/components/states';
import { TermHint } from '@/components/term-hint';
import { Banner, Button, Card, Chip, Screen, Skeleton, TextField, Txt } from '@/components/ui';
import { UnsavedChangesText } from '@/components/context-text';
import { announceOnIOS } from '@/lib/a11y';
import { flash } from '@/lib/flash';
import {
  isRefusal,
  useDeleteIncomeReference,
  useIncomeReferenceOperationKey,
  useIncomeReferences,
  useReferenceSuggestion,
  useSetIncomeReference,
  useWork,
} from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

/**
 * Renda de referência (D-026): quanto costuma cair na conta por mês, já com descontos. Serve só para calcular percentuais
 * e nunca conta como recebido. Vale a partir de um mês (setembro, este mês ou o seguinte; o mês de uma referência já salva
 * também aparece, para alterar ou excluir). A sugestão (média dos meses fechados, sem reembolsos) só preenche o campo
 * quando a pessoa toca em "Usar": nunca é aplicada sozinha. Escrita só por set_income_reference e delete_income_reference,
 * com chave de operação: depois de falha de rede a tentativa fica guardada e repetir o mesmo conteúdo reconcilia.
 * `?mes=AAAA-MM` escolhe o mês de vigência inicial (sem ele, este mês).
 *
 * "Calcular pela média" (D-062, renda variável): a média do Recebido dos 3 ou dos 6 meses fechados anteriores ao mês de hoje
 * (`months_overview` do contexto escolhido, com os meses conferidos como zero e sem os meses sem registros: `loadIncomeAverage`). Só
 * preenche o campo, como "Usar": quem grava é a pessoa, pela mesma `set_income_reference`, e o texto diz que é uma estimativa.
 */
export default function ReferenciaScreen() {
  const contextId = useWork().data?.contextId;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {contextId ? (
        <ReferenceForm contextId={contextId} />
      ) : (
        <>
          <SubHeader title={COMMITTED_TEXT.reference.title} right={<ContextPill label="Salvando em Pessoal" />} />
          <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
            <Skeleton width="100%" height={120} />
          </Screen>
        </>
      )}
    </View>
  );
}

/** Texto do erro do servidor; o que não tem texto próprio vira a falha genérica de salvar. */
const errorText = (code: string) =>
  code in INCOME_REFERENCE_ERROR_TEXT ? INCOME_REFERENCE_ERROR_TEXT[code as keyof typeof INCOME_REFERENCE_ERROR_TEXT] : ERROR_TEXT.salvar_falhou;

function ReferenceForm({ contextId }: { contextId: string }) {
  const { today } = useSession();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const mask = useMoneyMask();
  const params = useLocalSearchParams<{ mes?: string }>();
  const refs = useIncomeReferences(contextId);
  const suggestion = useReferenceSuggestion(contextId);
  const set = useSetIncomeReference();
  const del = useDeleteIncomeReference();
  const setKeys = useIncomeReferenceOperationKey();
  const delKeys = useIncomeReferenceOperationKey();
  const repo = useRepo();

  const defaultMonth = referenceMonthChoices(today).find((c) => c.isDefault)!.month;
  const requested = typeof params.mes === 'string' && isValidIsoMonth(params.mes) && referenceMonthError(params.mes, today) === null ? params.mes : null;
  const [month, setMonth] = useState<IsoMonth>(requested ?? defaultMonth);
  // null: o campo segue a referência em vigor no mês escolhido; texto: a pessoa digitou ou usou a sugestão.
  const [amountDraft, setAmountDraft] = useState<string | null>(null);
  const [variesDraft, setVariesDraft] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Partial<Record<'amountText' | 'fromMonth', string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);
  const amountRef = useRef<TextInput>(null);
  // "Calcular pela média": a escolha de 3 ou 6 meses, a leitura em andamento e o resultado (ou a falha) da última conta.
  const [avgChoice, setAvgChoice] = useState<IncomeAverageChoice>(INCOME_AVERAGE_DEFAULT_CHOICE);
  const [avgBusy, setAvgBusy] = useState(false);
  const [avgOutcome, setAvgOutcome] = useState<IncomeAverageOutcome | null>(null);
  const [avgFailed, setAvgFailed] = useState(false);
  /** Qual pedido de média vale: trocar de 3 para 6 meses no meio da leitura descarta a resposta antiga. */
  const avgRun = useRef(0);
  /** Tentativa de salvar com resultado incerto: o conteúdo e a versão enviados, para repetir idêntico (mesma chave). */
  const attempt = useRef<{ contentKey: string; expectedVersion: number } | null>(null);

  const list = refs.data ?? null;
  const inEffect: IncomeReference | null = list ? referenceFor(list, month) : null;
  /** A referência que começa exatamente neste mês: é ela que o salvar altera e o excluir apaga (versão 0 se não existe). */
  const exact: IncomeReference | null = list ? (list.find((r) => r.fromMonth === month) ?? null) : null;
  const amountText = amountDraft ?? (inEffect ? centsToInput(inEffect.amountCents) : '');
  const varies = variesDraft ?? inEffect?.varies ?? false;
  const dirty = amountDraft !== null || variesDraft !== null;

  // Chips: setembro, este mês e o seguinte, mais o mês pedido e o de cada referência salva (para alterar ou excluir).
  const months = [...new Set([...referenceMonthChoices(today).map((c) => c.month), ...(requested ? [requested] : []), ...(list ?? []).map((r) => r.fromMonth), month])].sort();

  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });
  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);
  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/renda-comprometida'));

  const done = (text: string) => {
    // Confirmação tátil só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flash.set(text);
    leave(goBack);
  };

  const showRefusal = (code: string) => {
    if (code === 'valor_invalido' || code === 'valor_acima_do_limite') {
      setErrors({ amountText: errorText(code) });
      amountRef.current?.focus();
      return;
    }
    if (code === 'mes_invalido' || code === 'referencia_fora_do_intervalo') {
      setErrors({ fromMonth: errorText(code) });
      return;
    }
    // Outra pessoa ou outro aparelho mudou a referência: recarrega para a próxima tentativa usar a versão atual.
    if (code === 'versao_desatualizada' || code === 'nao_encontrado') refs.refetch();
    setBanner(errorText(code));
  };

  const submit = async () => {
    if (busy || !list) return;
    const v = validateIncomeReferenceDraft({ amountText, fromMonth: month, varies }, today);
    if (!v.ok) {
      setErrors(v.errors);
      if (v.errors.amountText) amountRef.current?.focus();
      return;
    }
    setErrors({});
    setBanner(null);
    setBusy(true);
    // Repetir depois de falha de rede: o mesmo conteúdo, com a versão da primeira tentativa, para o banco reconhecer a chave.
    const contentKey = JSON.stringify([v.fromMonth, v.amountCents, v.varies]);
    const prev = attempt.current;
    const expectedVersion = setKeys.hasPending() && prev?.contentKey === contentKey ? prev.expectedVersion : (exact?.version ?? 0);
    const snapshot = JSON.stringify([v.fromMonth, expectedVersion, v.amountCents, v.varies]);
    const key = setKeys.keyFor(snapshot);
    try {
      const saved = await set.mutateAsync({ key, contextId, fromMonth: v.fromMonth, expectedVersion, amountCents: v.amountCents, varies: v.varies });
      setKeys.settled();
      attempt.current = null;
      setRetry(false);
      done(COMMITTED_TEXT.reference.saved(saved.fromMonth));
    } catch (e) {
      if (isRefusal(e) && isRepoError(e)) {
        setKeys.refused();
        attempt.current = null;
        setRetry(false);
        showRefusal(e.code);
      } else {
        // Falha de rede: a gravação pode ou não ter acontecido. Guardar a tentativa para reconciliar.
        setKeys.uncertain(key, snapshot);
        attempt.current = { contentKey, expectedVersion };
        setRetry(true);
        setBanner(UNCERTAIN_TEXT.renda);
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
      done(COMMITTED_TEXT.reference.deleted);
    } catch (e) {
      setConfirmDelete(false);
      if (isRefusal(e) && isRepoError(e)) {
        delKeys.refused();
        showRefusal(e.code);
      } else {
        delKeys.uncertain(key, snapshot);
        setBanner(UNCERTAIN_TEXT.renda);
      }
    } finally {
      setDeleting(false);
    }
  };

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => goBack);
    else goBack();
  };

  const fillSuggestion = (cents: number) => {
    setAmountDraft(centsToInput(cents));
    setErrors((e) => ({ ...e, amountText: undefined }));
    announceOnIOS(`Valor por mês preenchido com ${formatBRL(cents)}.`);
  };

  const pickAverageChoice = (n: IncomeAverageChoice) => {
    if (n === avgChoice) return;
    avgRun.current += 1;
    setAvgChoice(n);
    setAvgOutcome(null);
    setAvgFailed(false);
    setAvgBusy(false);
  };

  /** Lê months_overview dos meses da janela e, havendo média, só preenche o campo (nada é gravado aqui). */
  const calculateAverage = async () => {
    if (avgBusy) return;
    const run = ++avgRun.current;
    setAvgBusy(true);
    setAvgFailed(false);
    setAvgOutcome(null);
    try {
      const outcome = await loadIncomeAverage(repo, contextId, monthOf(today), avgChoice);
      if (run !== avgRun.current) return;
      setAvgOutcome(outcome);
      if (outcome.ok) {
        setAmountDraft(centsToInput(outcome.averageCents));
        setErrors((e) => ({ ...e, amountText: undefined }));
      }
      announceOnIOS(incomeAverageTexts(outcome).announce);
    } catch {
      // Leitura que falhou (rede ou permissão): nada é preenchido, e tocar de novo repete a leitura.
      if (run === avgRun.current) setAvgFailed(true);
    } finally {
      if (run === avgRun.current) setAvgBusy(false);
    }
  };

  const avgTexts = avgOutcome ? incomeAverageTexts(avgOutcome) : null;
  const chosen = suggestion.data;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={COMMITTED_TEXT.reference.title} onBack={requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Txt>{COMMITTED_TEXT.reference.intro}</Txt>

        {refs.isPending ? (
          <View style={{ gap: space[3] }}>
            <Skeleton width="100%" height={72} />
            <Skeleton width="100%" height={72} />
          </View>
        ) : refs.isError || !list ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => refs.refetch()} />
        ) : (
          <>
            {chosen ? (
              <Card style={{ gap: space[3] }}>
                <MoneyTxt>{COMMITTED_TEXT.reference.suggestion(chosen.amountCents, chosen.months)}</MoneyTxt>
                <Button
                  label={mask.text(COMMITTED_TEXT.reference.useSuggestion(chosen.amountCents))}
                  accessibilityLabel={mask.label(COMMITTED_TEXT.reference.useSuggestion(chosen.amountCents))}
                  tone="soft"
                  onPress={() => fillSuggestion(chosen.amountCents)}
                />
              </Card>
            ) : null}

            <Card style={{ gap: space[4] }}>
              <TextField
                ref={amountRef}
                label={COMMITTED_TEXT.reference.amountLabel}
                prefix="R$"
                value={amountText}
                onChangeText={(t) => {
                  setAmountDraft(t);
                  setErrors((e) => ({ ...e, amountText: undefined }));
                }}
                onBlur={() => {
                  const v = validateIncomeReferenceDraft({ amountText, fromMonth: month, varies }, today);
                  if (v.ok) setAmountDraft(centsToInput(v.amountCents));
                }}
                placeholder="0,00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                large
                error={errors.amountText}
              />

              <ChoiceGroup label={COMMITTED_TEXT.reference.fromLabel} error={errors.fromMonth}>
                {months.map((m) => (
                  <Chip
                    key={m}
                    label={monthChipLabel(m, today)}
                    accessibilityLabel={`${COMMITTED_TEXT.reference.fromLabel} ${formatMonthYearBR(m)}`}
                    selected={m === month}
                    onPress={() => {
                      setMonth(m);
                      setErrors((e) => ({ ...e, fromMonth: undefined }));
                    }}
                  />
                ))}
              </ChoiceGroup>
              {exact ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  Já existe uma renda de referência a partir de {formatMonthYearBR(exact.fromMonth)}. Ao salvar, ela é alterada.
                </Txt>
              ) : null}

              <ChoiceGroup label="Tipo de renda" hint={varies ? COMMITTED_TEXT.reference.variesHint : undefined}>
                <Chip label={COMMITTED_TEXT.reference.fixed} selected={!varies} onPress={() => setVariesDraft(false)} />
                <Chip label={COMMITTED_TEXT.reference.varies} selected={varies} onPress={() => setVariesDraft(true)} />
              </ChoiceGroup>
              <TermHint term="Minha renda varia" slug="renda-variavel" />
            </Card>

            <Card style={{ gap: space[3] }}>
              <Txt color={colors.textSecondary}>{INCOME_AVERAGE_TEXT.intro}</Txt>
              <ChoiceGroup label={INCOME_AVERAGE_TEXT.choiceLabel}>
                {INCOME_AVERAGE_CHOICES.map((n) => (
                  <Chip key={n} label={INCOME_AVERAGE_TEXT.choices[n]} selected={n === avgChoice} onPress={() => pickAverageChoice(n)} />
                ))}
              </ChoiceGroup>
              <Button label={INCOME_AVERAGE_TEXT.action} busyLabel={INCOME_AVERAGE_TEXT.busy} busy={avgBusy} tone="soft" onPress={() => calculateAverage()} />
              {/* Sempre montada: o resultado e a explicação de "sem mês com recebimentos" são ditos quando aparecem (no iOS, por announceOnIOS). */}
              <View collapsable={false} style={{ gap: space[2] }} accessibilityLiveRegion="polite" aria-live="polite">
                {avgFailed ? (
                  <Txt variant="label" color={colors.error} style={{ fontFamily: fonts.bold }}>
                    {INCOME_AVERAGE_TEXT.failed}
                  </Txt>
                ) : null}
                {avgTexts?.empty ? <Txt color={colors.textSecondary}>{avgTexts.empty}</Txt> : null}
                {avgTexts?.headline ? (
                  <>
                    <MoneyTxt style={[tabular, { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 26 }]}>{avgTexts.headline}</MoneyTxt>
                    {avgTexts.count ? <Txt>{avgTexts.count}</Txt> : null}
                    {avgTexts.zero ? <MoneyTxt>{avgTexts.zero}</MoneyTxt> : null}
                    {avgTexts.basis ? (
                      <Txt variant="caption" color={colors.textSecondary}>
                        {avgTexts.basis}
                      </Txt>
                    ) : null}
                    {avgTexts.notice ? (
                      <Txt variant="caption" color={colors.textSecondary}>
                        {avgTexts.notice}
                      </Txt>
                    ) : null}
                    {avgTexts.filled ? (
                      <Txt variant="caption" color={colors.textSecondary}>
                        {avgTexts.filled}
                      </Txt>
                    ) : null}
                  </>
                ) : null}
              </View>
            </Card>

            {exact ? <Button label={COMMITTED_TEXT.reference.delete} tone="danger" onPress={() => setConfirmDelete(true)} /> : null}
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
            <Button label={COMMITTED_TEXT.reference.cancel} tone="ghost" onPress={requestCancel} style={styles.cancel} />
            <Button
              label={retry ? COMMITTED_TEXT.retry : COMMITTED_TEXT.reference.save}
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
        title={COMMITTED_TEXT.reference.deleteTitle(exact?.fromMonth ?? month)}
        cancelLabel={COMMITTED_TEXT.reference.cancel}
        confirmLabel={COMMITTED_TEXT.reference.deleteConfirm}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove()}>
        <Txt color={colors.textSecondary}>{COMMITTED_TEXT.reference.deleteBody}</Txt>
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
        <UnsavedChangesText />
      </ConfirmDialog>
    </KeyboardAvoidingView>
  );
}
