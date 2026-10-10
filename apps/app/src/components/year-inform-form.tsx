import {
  ANNUAL_HELP_TEXT,
  ANNUAL_SERIES_ERROR_TEXT,
  ERROR_TEXT,
  MAX_RECORD_CENTS,
  affectedByYear,
  annualYearErrorText,
  centsToInput,
  currentTerm,
  formatBRL,
  isRepoError,
  mergeOccurrences,
  parseBRL,
  seriesCaption,
  type CommitmentSeries,
} from '@clarevo/core';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Info } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { seriesStyles as styles, yearA11y, yearA11yLabel } from '@/components/series-parts';
import { ErrorState } from '@/components/states';
import { SumValues } from '@/components/sum-values';
import { Banner, Button, Card, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useInformSeriesYear, useSeriesOccurrences, useSeriesOpenOccurrences, useSeriesOperationKey } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * "Informar o valor de 2027" (D-029, regra 3): as parcelas do ano em aberto e com valor estimado recebem o valor do
 * carnê ou do boleto, deixam de ser estimadas e ficam alteradas só naquele ano. As pagas e as já informadas não mudam,
 * nem a referência dos anos seguintes. O conjunto afetado vai junto (o banco recusa se ele mudar até gravar); falha de
 * rede guarda a chave, e a próxima tentativa confere com findSeriesOperation antes de repetir.
 */
export function YearInformForm({ series: s, number, contextId }: { series: CommitmentSeries; number: number; contextId: string }) {
  const { today } = useSession();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const inform = useInformSeriesYear();
  const keys = useSeriesOperationKey();
  const occ = useSeriesOccurrences(s.id, contextId);
  const openOcc = useSeriesOpenOccurrences(s.id, contextId);
  const k = s.partsPerYear ?? 1;

  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);
  const amountRef = useRef<TextInput>(null);

  // Todas as em aberto (o banco confere o conjunto inteiro do ano) e as pagas recentes (total do ano).
  const list = occ.data && openOcc.data ? mergeOccurrences(occ.data, openOcc.data) : null;
  const amount = parseBRL(amountText);
  const validAmount = amount !== null && amount > 0 && amount <= MAX_RECORD_CENTS ? amount : undefined;
  const plan = list ? affectedByYear(list, s, number, 'informar', validAmount) : null;
  const yearLabel = plan && plan.ok ? plan.year.label : plan && plan.code === 'nada_a_mudar' ? plan.year.label : '';
  /** Uma das listas falhou ao carregar: sem elas não há prévia nem envio; a pessoa tenta de novo ali mesmo. */
  const loadFailed = !list && (occ.isError || openOcc.isError);
  const dirty = amountText.trim() !== '';

  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);

  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/gastos-fixos/${s.id}`));

  const done = (text: string) => {
    // Confirmação tátil só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flash.set(text);
    leave(goBack);
  };

  const reloadLists = () => {
    occ.refetch();
    openOcc.refetch();
  };

  const submit = async () => {
    if (busy || !plan) return;
    if (amount === null || amount <= 0) {
      setError(ANNUAL_SERIES_ERROR_TEXT.valor_invalido);
      amountRef.current?.focus();
      return;
    }
    if (amount > MAX_RECORD_CENTS) {
      setError(ANNUAL_SERIES_ERROR_TEXT.valor_acima_do_limite);
      amountRef.current?.focus();
      return;
    }
    setError(null);
    setBanner(null);
    setBusy(true);
    try {
      // Resultado incerto antes: conferir se alguma tentativa foi gravada, antes de repetir.
      if (keys.hasPending()) {
        const saved = await keys.findSaved();
        if (saved?.action === 'informar_ano') {
          keys.settled();
          setRetry(false);
          const [savedAmount] = JSON.parse(saved.snapshot) as [number];
          done(
            savedAmount === amount && plan.ok
              ? plan.doneText
              : `O valor de ${yearLabel} foi informado antes da falha de conexão, com o preenchimento do primeiro envio. Confira na conta do ano.`,
          );
          return;
        }
      }
      if (!plan.ok) {
        // Nada mais em aberto e estimado no ano (mudou em outro aparelho ou já foi informado).
        setRetry(false);
        setBanner(plan.code === 'nada_a_mudar' ? plan.text : ANNUAL_SERIES_ERROR_TEXT.numero_fora_da_serie);
        return;
      }
      const snapshot = JSON.stringify([amount, s.id, number, plan.affected]);
      const key = keys.keyFor(snapshot);
      try {
        const w = await inform.mutateAsync({ key, seriesId: s.id, number, affected: plan.affected, amountCents: amount });
        keys.settled();
        setRetry(false);
        // O texto do plano com o total confirmado pelo servidor (contas alteradas).
        done(w.changed > 0 ? plan.doneText : `Valor de ${yearLabel} informado.`);
      } catch (e) {
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          keys.refused();
          setRetry(false);
          if (e.code === 'valor_invalido' || e.code === 'valor_acima_do_limite') {
            setError(annualYearErrorText(e.code, yearLabel));
            amountRef.current?.focus();
            return;
          }
          // Conjunto afetado mudou: a prévia recalcula com as contas atuais e a pessoa confirma de novo.
          if (e.code === 'versao_desatualizada') reloadLists();
          setBanner(annualYearErrorText(e.code, yearLabel));
          return;
        }
        // Falha de rede: a gravação pode ou não ter acontecido. Guardar a tentativa para reconciliar.
        keys.uncertain(key, snapshot);
        setRetry(true);
        setBanner(ANNUAL_SERIES_ERROR_TEXT.salvar_falhou);
      }
    } catch (e) {
      setRetry(true);
      setBanner(isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido' ? annualYearErrorText(e.code, yearLabel) : ANNUAL_SERIES_ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  };

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => goBack);
    else goBack();
  };

  const formatAmountOnBlur = () => {
    if (validAmount !== undefined) setAmountText(centsToInput(validAmount));
  };

  const term = currentTerm(s, today);
  const title = yearLabel ? `Informar o valor de ${yearLabel}` : 'Informar o valor do ano';
  const fieldLabel = k > 1 ? `Valor de cada parcela de ${yearLabel}` : `Valor da conta de ${yearLabel}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={title} onBack={requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Card style={{ gap: space[1] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {term.description}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {seriesCaption(s, today)}
          </Txt>
        </Card>

        {loadFailed ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={reloadLists} />
        ) : !plan ? (
          <Txt color={colors.textSecondary}>Carregando as contas do ano…</Txt>
        ) : !plan.ok && plan.code !== 'nada_a_mudar' ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{ANNUAL_SERIES_ERROR_TEXT.numero_fora_da_serie}</Txt>
            <Button label="Ver conta do ano" tone="soft" onPress={() => leave(() => router.replace(`/gastos-fixos/${s.id}`))} />
          </Card>
        ) : (
          <Card style={{ gap: space[4] }}>
            <Txt accessibilityLabel={yearA11yLabel(`Use o valor do carnê ou do boleto de ${yearLabel}.`)}>
              Use o valor do carnê ou do boleto de {yearLabel}.
            </Txt>
            <Txt variant="label" color={colors.textSecondary} accessibilityLabel={yearA11yLabel(ANNUAL_HELP_TEXT.informOnlyYear(yearLabel))}>
              {ANNUAL_HELP_TEXT.informOnlyYear(yearLabel)}
            </Txt>
            <TextField
              ref={amountRef}
              label={fieldLabel}
              // Sempre um texto: o campo repassa o nome ao TextInput (undefined apagaria o rótulo).
              accessibilityLabel={yearA11y(fieldLabel)}
              prefix="R$"
              value={amountText}
              onChangeText={(t) => {
                setAmountText(t);
                setError(null);
              }}
              onBlur={formatAmountOnBlur}
              placeholder="0,00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              large
              autoFocus
              error={error ?? undefined}
              moneyHint
              hint={
                k > 1
                  ? 'Se as parcelas têm valores diferentes, informe o valor mais comum e ajuste as outras em cada conta.'
                  : `A referência era ${formatBRL(term.amountCents)}.`
              }
            />
            <SumValues
              target={amountRef}
              onUse={(t) => {
                setAmountText(t);
                setError(null);
              }}
            />
            {/* Prévia que muda a cada tecla: sem região viva, para não ser anunciada de novo a cada dígito. */}
            <Banner tone="info" icon={Info} live={false}>
              <MoneyTxt variant="label" accessibilityLabel={yearA11yLabel(plan.text)}>
                {plan.text}
              </MoneyTxt>
            </Banner>
          </Card>
        )}
      </Screen>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
        <View style={styles.footerInner}>
          {banner ? (
            <Banner tone="erro" icon={AlertCircle}>
              <MoneyTxt variant="label" color={colors.error}>
                {banner}
              </MoneyTxt>
            </Banner>
          ) : null}
          <View style={styles.footerRow}>
            <Button label="Cancelar" tone="ghost" onPress={requestCancel} style={styles.cancel} />
            <Button
              label={retry ? 'Tentar novamente' : 'Informar valor'}
              busy={busy}
              busyLabel="Salvando…"
              disabled={!plan || (!plan.ok && !retry)}
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
        <Txt color={colors.textSecondary}>Você tem alterações que ainda não foram salvas em Pessoal.</Txt>
      </ConfirmDialog>
    </KeyboardAvoidingView>
  );
}
