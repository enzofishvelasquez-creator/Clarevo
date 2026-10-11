import {
  ANNUAL_HELP_TEXT,
  ANNUAL_SERIES_ERROR_TEXT,
  CATEGORIES,
  DESCRIPTION_MAX,
  INSTALLMENT_NATURES,
  MAX_RECORD_CENTS,
  NO_CATEGORY_LABEL,
  SERIES_ERROR_TEXT,
  SERIES_NATURE_LABEL,
  SUBSCRIPTION_TEXT,
  affectedByEditFrom,
  annualYearOf,
  centsToInput,
  charCount,
  currentTerm,
  editFromMaxNumber,
  fieldForErrorCode,
  formatDateBR,
  formatDayMonth,
  formatMonthInputBR,
  formatMonthName,
  formatMonthYearBR,
  isRepoError,
  lastNumberFromEndYear,
  maskMonthBR,
  mergeOccurrences,
  monthOf,
  newOperationKey,
  numberAtOrAfter,
  numberOfMonth,
  parseBRL,
  parseMonthBR,
  seriesErrorText,
  seriesMonthOf,
  seriesTermError,
  subscriptionErrorText,
  termFor,
  type AmountMode,
  type Commitment,
  type CommitmentSeries,
  type EditFromPlan,
  type SeriesEditInput,
  type SeriesField,
  type SeriesFieldErrors,
  type SeriesNature,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { AlertCircle } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup, monthChipLabel, seriesStyles as styles } from '@/components/series-parts';
import { SettingSwitch } from '@/components/setting-switch';
import { SumValues } from '@/components/sum-values';
import { Banner, Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import {
  useLimitWatch,
  useSeries,
  useSeriesOccurrences,
  useSeriesOpenOccurrences,
  useSeriesOperationKey,
  useSetSeriesSubscription,
  useUpdateSeriesFrom,
  withNotice,
} from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

interface EditDraft {
  nature: SeriesNature;
  description: string;
  amountText: string;
  amountMode: AmountMode;
  dueDayText: string;
  category: string | null;
}

type EditField = Extract<SeriesField, 'description' | 'nature' | 'amountText' | 'dueDayText'>;
const EDIT_FIELD_ORDER: EditField[] = ['description', 'nature', 'amountText', 'dueDayText'];

/** "Aplicar a partir de": um número da série ou "Outro mês" (campo MM/AAAA; na conta do ano, "Outro ano", AAAA). */
type FromPick = number | 'outro';

/** Confirmação aberta: o conjunto afetado e a versão que a pessoa viu. */
interface Pending {
  k: number;
  plan: Extract<EditFromPlan, { ok: true }>;
  version: number;
  input: SeriesEditInput;
}

/** Textos de erro do tipo da série (a conta do ano tem variantes próprias). */
const textsFor = (kind: CommitmentSeries['kind']): Record<keyof typeof SERIES_ERROR_TEXT, string> =>
  kind === 'anual' ? ANNUAL_SERIES_ERROR_TEXT : SERIES_ERROR_TEXT;

/** Mesma ordem do banco (clarevo_validate_series_term, depois natureza_invalida); um texto por campo. */
function validateEdit(d: EditDraft, kind: CommitmentSeries['kind']): { ok: true; input: SeriesEditInput } | { ok: false; errors: SeriesFieldErrors } {
  const texts = textsFor(kind);
  const errors: SeriesFieldErrors = {};
  const amount = parseBRL(d.amountText);
  if (amount === null || amount <= 0) errors.amountText = texts.valor_invalido;
  else if (amount > MAX_RECORD_CENTS) errors.amountText = texts.valor_acima_do_limite;
  const description = d.description.trim();
  if (description === '') errors.description = texts.descricao_obrigatoria;
  else if (charCount(description) > DESCRIPTION_MAX) errors.description = texts.descricao_longa;
  const day = /^\s*\d{1,2}\s*$/.test(d.dueDayText) ? Number(d.dueDayText.trim()) : null;
  if (day === null || day < 1 || day > 31) errors.dueDayText = texts.dia_invalido;
  // Gasto fixo e conta do ano são sempre do tipo 'conta'; o parcelamento nunca.
  if ((kind !== 'parcelada') !== (d.nature === 'conta')) errors.nature = texts.natureza_invalida;
  if (Object.keys(errors).length > 0 || amount === null || day === null) return { ok: false, errors };
  const input: SeriesEditInput = {
    nature: d.nature,
    description,
    category: d.category?.trim() ? d.category.trim() : null,
    amountCents: amount,
    amountMode: d.amountMode,
    dueDay: day,
  };
  // Conferência final com a regra do core (a mesma do banco).
  const code = seriesTermError(input);
  if (code) {
    const field = fieldForErrorCode(code, 'series');
    return { ok: false, errors: field ? { [field]: texts[code as keyof typeof SERIES_ERROR_TEXT] } : { amountText: texts.salvar_falhou } };
  }
  return { ok: true, input };
}

/**
 * "Esta e as próximas" (D-024, regra 5): vigência nova a partir da conta escolhida, que sempre muda; as contas em aberto
 * seguintes também mudam, menos as alteradas só no mês. A pessoa confirma o conjunto afetado; se ele mudar até gravar,
 * o banco recusa e a tela recalcula. Mesmos cuidados dos outros formulários: chave guardada, reconciliação e rodapé fixo.
 */
export function SeriesEditForm({
  series: opened,
  contextId,
  fromNumber,
  suggestedCents,
}: {
  series: CommitmentSeries;
  contextId: string;
  /** a-partir=<n> da rota. */
  fromNumber?: number;
  /** "Usar como novo valor de referência": valor sugerido, em centavos. */
  suggestedCents?: number;
}) {
  const { today } = useSession();
  const repo = useRepo();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const update = useUpdateSeriesFrom();
  const markSubscription = useSetSeriesSubscription();
  const limitWatch = useLimitWatch();
  const keys = useSeriesOperationKey();
  const live = useSeries(opened.id, contextId);
  const occ = useSeriesOccurrences(opened.id, contextId);
  const openOcc = useSeriesOpenOccurrences(opened.id, contextId);
  const s = live.data ?? opened;
  const occurrences = occ.data ? [...occ.data].reverse() : []; // número crescente, as 60 mais recentes (chips)
  // Conjunto afetado: todas as em aberto, também as que não cabem na lista de 60 (o banco confere o conjunto inteiro).
  const allOccurrences = mergeOccurrences(occ.data ?? [], openOcc.data ?? []).reverse();
  const parcelada = s.kind === 'parcelada';
  const anual = s.kind === 'anual';
  const k = s.partsPerYear ?? 1;
  const texts = textsFor(s.kind);
  const noun = parcelada ? 'Parcelamento' : anual ? 'Conta do ano' : 'Gasto fixo';
  const currentMonth = monthOf(today);
  // Mesmo limite do banco para séries sem término: até 12 meses depois do mês atual (conta do ano: até a última parcela
  // do ano que começa até 12 meses depois do mês atual).
  const maxNumber = editFromMaxNumber(s, today);

  /** Conta do ano: "2027" (cota única) ou "Parcela 3 de 2027". */
  const annualName = (n: number) => {
    const y = annualYearOf(s, n);
    return k === 1 ? y.label : `Parcela ${y.part} de ${y.label}`;
  };

  // Chips: as contas em aberto e até 6 meses depois da última conta criada (conta do ano: a próxima e o início dos dois
  // anos seguintes).
  const choices = useMemo(() => {
    const open = occurrences.filter((c) => c.status === 'aberto');
    const maxLive = Math.max(s.firstNumber - 1, ...occurrences.map((c) => c.series!.number));
    const start = Math.max(maxLive + 1, numberAtOrAfter(s, currentMonth), s.firstNumber);
    const future: number[] = [];
    if (anual) {
      const candidates = [start];
      for (let i = 1; i <= 2; i++) candidates.push((Math.floor((start - 1) / k) + i) * k + 1);
      for (const n of candidates) if (n <= maxNumber && !s.skippedNumbers.includes(n) && !future.includes(n)) future.push(n);
    } else {
      for (let n = start; n <= Math.min(maxNumber, start + 5); n++) if (!s.skippedNumbers.includes(n)) future.push(n);
    }
    const dueLabel = (c: Commitment, withYear: boolean) => {
      const date = withYear ? formatDateBR(c.dueOn) : formatDayMonth(c.dueOn);
      return c.dueOn < today ? `venceu em ${date}` : `vence em ${date}`;
    };
    return [
      ...open.map((c) => ({
        n: c.series!.number,
        label: anual
          ? `${annualName(c.series!.number)} (${dueLabel(c, k === 1)})`
          : `${monthChipLabel(monthOf(c.dueOn), today)} (${dueLabel(c, false)})`,
      })),
      ...future.map((n) => ({ n, label: anual ? annualName(n) : monthChipLabel(seriesMonthOf(s, n), today) })),
    ];
  }, [occ.data, live.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const initial = useMemo(() => {
    const requested = fromNumber !== undefined && fromNumber >= opened.firstNumber && fromNumber <= maxNumber ? fromNumber : null;
    const k0 = requested ?? choices[0]?.n ?? null;
    const term = (k0 !== null ? termFor(opened.terms, k0) : null) ?? currentTerm(opened, today);
    const draft: EditDraft = {
      nature: opened.nature,
      description: term.description,
      amountText: centsToInput(suggestedCents ?? term.amountCents),
      amountMode: term.amountMode,
      dueDayText: String(term.dueDay),
      category: term.category,
    };
    const pick: FromPick = k0 === null ? 'outro' : choices.some((c) => c.n === k0) ? k0 : 'outro';
    const otherText =
      pick === 'outro' && k0 !== null
        ? anual
          ? annualYearOf(opened, k0).firstMonth.slice(0, 4)
          : formatMonthInputBR(seriesMonthOf(opened, k0))
        : '';
    return { draft, pick, otherText };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<EditDraft>(initial.draft);
  const [pick, setPick] = useState<FromPick>(initial.pick);
  const [otherText, setOtherText] = useState(initial.otherText);
  const [errors, setErrors] = useState<SeriesFieldErrors>({});
  const [fromError, setFromError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);
  /** Gasto fixo mensal: "É uma assinatura?" (D-046). Gravado por set_series_subscription, depois da alteração das vigências. */
  const subscribable = s.kind === 'mensal';
  const [subscription, setSubscription] = useState(opened.subscription);
  /** Chave da gravação só da marca: a mesma em nova tentativa depois de falha de rede (o banco reconhece a repetição). */
  const subscriptionKey = useRef(newOperationKey());

  // O tipo é um grupo de chips, sem campo para receber o foco.
  const refs = {
    description: useRef<TextInput>(null),
    amountText: useRef<TextInput>(null),
    dueDayText: useRef<TextInput>(null),
  } satisfies Partial<Record<EditField, React.RefObject<TextInput | null>>>;
  const otherRef = useRef<TextInput>(null);

  const termsDirty = JSON.stringify({ draft, pick, otherText }) !== JSON.stringify(initial);
  const subscriptionDirty = subscribable && subscription !== opened.subscription;
  const dirty = termsDirty || subscriptionDirty;

  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);

  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/gastos-fixos/${s.id}`));

  const set = <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k in errors) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const focusFirst = (errs: SeriesFieldErrors) => {
    const first = EDIT_FIELD_ORDER.find((f) => errs[f] && f !== 'nature');
    if (first && first !== 'nature') refs[first].current?.focus();
  };

  /**
   * Onde a alteração começa, no texto: "a partir de novembro", "a partir de janeiro de 2027"; conta do ano: "a partir
   * de 2028" ou "a partir da parcela 3 de 2027".
   */
  const fromText = (n: number) => {
    if (anual) {
      const y = annualYearOf(s, n);
      return k === 1 || y.part === 1 || n === s.firstNumber ? `a partir de ${y.label}` : `a partir da parcela ${y.part} de ${y.label}`;
    }
    const m = seriesMonthOf(s, n);
    return `a partir de ${m.slice(0, 4) === today.slice(0, 4) ? formatMonthName(m) : formatMonthYearBR(m)}`;
  };

  /** Número escolhido em "Aplicar a partir de", ou null com o erro do campo. */
  const chosenNumber = (): number | null => {
    if (pick !== 'outro') return pick;
    let n: number | null = null;
    if (anual) {
      // "Outro ano": a partir da 1ª parcela daquele ano (no primeiro ano, da primeira parcela da série).
      const text = otherText.trim();
      if (/^\d{4}$/.test(text)) n = Math.max(s.firstNumber, lastNumberFromEndYear(s, Number(text)) - k + 1);
      if (n !== null && annualYearOf(s, n).firstMonth.slice(0, 4) !== text) n = null;
    } else {
      const m = parseMonthBR(otherText);
      n = m === null ? null : numberOfMonth(s, m);
    }
    if (n === null || n < s.firstNumber || n > maxNumber) {
      setFromError(texts.numero_fora_da_serie);
      otherRef.current?.focus();
      return null;
    }
    return n;
  };

  /** Monta a confirmação com os dados atuais: a conta escolhida e as afetadas, como o banco vai conferir. */
  const prepare = (series: CommitmentSeries, list: readonly Commitment[], k: number, input: SeriesEditInput) => {
    const plan = affectedByEditFrom(list, series, k);
    if (!plan.ok) {
      setFromError(texts.inicio_em_conta_paga);
      return;
    }
    setConfirm({ k, plan, version: series.version, input });
  };

  /** Recarrega a série e as contas (depois de uma recusa ou de uma gravação feita antes da falha de conexão). */
  const reload = async () => {
    const [fresh, list, open] = await Promise.all([repo.getSeries(s.id), repo.listSeriesOccurrences(s.id), repo.listOpenSeriesOccurrences(s.id)]);
    qc.setQueryData(['series', 'one', s.id], fresh);
    qc.setQueryData(['series', 'occurrences', s.id], list);
    qc.setQueryData(['series', 'open', s.id], open);
    qc.invalidateQueries({ queryKey: ['commitments'] });
    return fresh ? { series: fresh, list: mergeOccurrences(list, open).reverse() } : null;
  };

  /**
   * Grava só a marca de assinatura (nenhum campo das vigências mudou). Recusa do servidor mostra o texto do motivo; falha de rede
   * deixa tentar de novo com a mesma chave.
   */
  const saveSubscriptionOnly = async () => {
    setBusy(true);
    setBanner(null);
    try {
      await markSubscription.mutateAsync({ key: subscriptionKey.current, id: s.id, version: s.version, subscription });
      subscriptionKey.current = newOperationKey();
      setRetry(false);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      flash.set(subscription ? SUBSCRIPTION_TEXT.savedAs : SUBSCRIPTION_TEXT.savedAsNot);
      leave(goBack);
    } catch (e) {
      if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
        subscriptionKey.current = newOperationKey();
        setRetry(false);
        setBanner(subscriptionErrorText(e.code));
        if (e.code === 'versao_desatualizada') await reload().catch(() => null);
      } else {
        setRetry(true);
        setBanner(SERIES_ERROR_TEXT.salvar_falhou);
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * Depois de alterar as vigências: a marca de assinatura, em sequência, com a versão que a gravação devolveu. Se falhar, o gasto
   * fixo continua atualizado e o aviso diz que a marca não foi salva. Devolve o aviso, ou null se a marca não mudou.
   */
  const markAfter = async (series: Pick<CommitmentSeries, 'id' | 'version' | 'subscription'>): Promise<string | null> => {
    if (!subscribable || subscription === series.subscription) return null;
    try {
      await markSubscription.mutateAsync({ key: newOperationKey(), id: series.id, version: series.version, subscription });
      return subscription ? SUBSCRIPTION_TEXT.savedAs : SUBSCRIPTION_TEXT.savedAsNot;
    } catch {
      return SUBSCRIPTION_TEXT.markFailed;
    }
  };

  const submit = () => {
    if (busy) return;
    // Só a marca mudou: grava direto, sem escolher o mês nem confirmar (nenhuma conta muda).
    if (subscriptionDirty && !termsDirty) {
      saveSubscriptionOnly();
      return;
    }
    const v = validateEdit(draft, s.kind);
    if (!v.ok) {
      setErrors(v.errors);
      focusFirst(v.errors);
      return;
    }
    setErrors({});
    setBanner(null);
    setFromError(null);
    const k = chosenNumber();
    if (k === null) return;
    prepare(s, allOccurrences, k, v.input);
  };

  const finish = (k: number, notice: string | null = null) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flash.set(withNotice(`${noun} ${anual ? 'atualizada' : 'atualizado'} ${fromText(k)}.`, notice));
    leave(goBack);
  };

  const apply = async () => {
    if (!confirm || busy) return;
    const { k, plan, version, input } = confirm;
    const snapshot = JSON.stringify({ k, input, version, affected: plan.affected });
    setBusy(true);
    setBanner(null);
    try {
      if (keys.hasPending()) {
        const saved = await keys.findSaved();
        if (saved && saved.action === 'alterar_serie') {
          keys.settled();
          const prev = JSON.parse(saved.snapshot) as { k: number; input: SeriesEditInput };
          if (prev.k === k && JSON.stringify(prev.input) === JSON.stringify(input)) {
            setRetry(false);
            setConfirm(null);
            const fresh = await repo.getSeries(s.id).catch(() => null);
            finish(k, fresh ? await markAfter(fresh) : null);
            return;
          }
          // Outro preenchimento foi gravado antes da falha: recalcular com a versão atual e confirmar de novo.
          const fresh = await reload();
          setRetry(false);
          if (!fresh) {
            setConfirm(null);
            setBanner(texts.nao_encontrado);
            return;
          }
          const again = affectedByEditFrom(fresh.list, fresh.series, k);
          setConfirm(again.ok ? { k, plan: again, version: fresh.series.version, input } : null);
          if (!again.ok) setFromError(texts.inicio_em_conta_paga);
          return;
        }
      }
      const key = keys.keyFor(snapshot);
      // Aviso do limite pessoal (D-041): o comprometido dos próximos meses antes de gravar, com a previsão das séries.
      const limitBefore = await limitWatch.before(s.contextId);
      try {
        const written = await update.mutateAsync({ key, id: s.id, version, fromNumber: k, affected: plan.affected, input });
        keys.settled();
        setRetry(false);
        setConfirm(null);
        const limitNotice = await limitWatch.after(limitBefore);
        const markNotice = await markAfter(written.series);
        finish(k, [limitNotice, markNotice].filter(Boolean).join('\n') || null);
      } catch (e) {
        setConfirm(null);
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          keys.refused();
          setRetry(false);
          const field = fieldForErrorCode(e.code, 'series');
          if (field && (EDIT_FIELD_ORDER as SeriesField[]).includes(field)) {
            const errs = { [field]: seriesErrorText(e.code, today, s.kind) };
            setErrors(errs);
            focusFirst(errs);
            return;
          }
          if (e.code === 'inicio_em_conta_paga' || e.code === 'numero_fora_da_serie') {
            setFromError(seriesErrorText(e.code, today, s.kind));
            await reload().catch(() => null);
            return;
          }
          if (e.code === 'versao_desatualizada') await reload().catch(() => null);
          setBanner(seriesErrorText(e.code, today, s.kind));
          return;
        }
        // Falha de rede: a alteração pode ou não ter sido gravada. Guardar a tentativa para reconciliar.
        keys.uncertain(key, snapshot);
        setRetry(true);
        setBanner(SERIES_ERROR_TEXT.salvar_falhou);
      }
    } catch (e) {
      setConfirm(null);
      setRetry(true);
      setBanner(isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido' ? seriesErrorText(e.code, today, s.kind) : SERIES_ERROR_TEXT.salvar_falhou);
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

  const variable = draft.amountMode === 'variavel';
  const day = /^\d{1,2}$/.test(draft.dueDayText) ? Number(draft.dueDayText) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader
        title={parcelada ? 'Editar parcelamento' : anual ? 'Editar conta do ano' : 'Editar gasto fixo'}
        onBack={requestCancel}
        right={<ContextPill label="Salvando em Pessoal" />}
      />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Txt color={colors.textSecondary}>
          {anual
            ? `As alterações valem a partir da conta escolhida. Contas pagas e contas cujo valor você informou ou alterou só naquele ano não mudam. O mês do vencimento não muda aqui. ${ANNUAL_HELP_TEXT.editVsInform}`
            : 'As alterações valem a partir do mês escolhido. Contas pagas e contas alteradas só no mês delas não mudam.'}
        </Txt>
        <Card style={{ gap: space[4] }}>
          <View style={{ gap: space[2] }}>
            <ChoiceGroup label="Aplicar a partir de" error={pick !== 'outro' ? (fromError ?? undefined) : undefined}>
              {choices.map((c) => (
                <Chip
                  key={c.n}
                  label={c.label}
                  selected={pick === c.n}
                  onPress={() => {
                    setPick(c.n);
                    setFromError(null);
                  }}
                />
              ))}
              <Chip
                label={anual ? 'Outro ano' : 'Outro mês'}
                selected={pick === 'outro'}
                onPress={() => {
                  setPick('outro');
                  setFromError(null);
                }}
              />
            </ChoiceGroup>
            {pick === 'outro' ? (
              <TextField
                ref={otherRef}
                label={anual ? 'Ano (AAAA)' : 'Mês (MM/AAAA)'}
                value={otherText}
                onChangeText={(t) => {
                  setOtherText(anual ? t.replace(/\D/g, '').slice(0, 4) : maskMonthBR(t));
                  setFromError(null);
                }}
                placeholder={anual ? 'AAAA' : 'MM/AAAA'}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={anual ? 4 : 7}
                error={fromError ?? undefined}
                hint={anual ? 'A alteração vale a partir da primeira parcela desse ano.' : 'Por exemplo, um reajuste a partir de janeiro.'}
              />
            ) : null}
          </View>

          <TextField
            ref={refs.description}
            label="Descrição"
            value={draft.description}
            onChangeText={(t) => set('description', t)}
            maxLength={DESCRIPTION_MAX}
            error={errors.description}
            hint={charCount(draft.description) >= 60 ? `${charCount(draft.description)} de ${DESCRIPTION_MAX} caracteres` : undefined}
            returnKeyType="next"
            onSubmitEditing={() => refs.amountText.current?.focus()}
          />

          {parcelada ? (
            <ChoiceGroup label="Tipo do parcelamento" hint="O tipo vale para o parcelamento inteiro, inclusive parcelas já pagas." error={errors.nature}>
              {INSTALLMENT_NATURES.map((n) => (
                <Chip key={n} label={SERIES_NATURE_LABEL[n]} selected={draft.nature === n} onPress={() => set('nature', n)} />
              ))}
            </ChoiceGroup>
          ) : null}

          {anual ? (
            <ChoiceGroup label="O valor muda de um ano para outro?">
              <Chip label="Sim, muda todo ano (como IPVA e IPTU)" selected={variable} onPress={() => set('amountMode', 'variavel')} />
              <Chip label="Não, é sempre o mesmo" selected={!variable} onPress={() => set('amountMode', 'fixo')} />
            </ChoiceGroup>
          ) : (
            <ChoiceGroup label={parcelada ? 'A parcela muda de um mês para outro?' : 'O valor muda de um mês para outro?'}>
              <Chip label={parcelada ? 'Parcela igual todo mês' : 'Não, é sempre o mesmo'} selected={!variable} onPress={() => set('amountMode', 'fixo')} />
              <Chip
                label={parcelada ? 'Parcela muda (financiamento corrigido)' : 'Sim, muda (como luz e água)'}
                selected={variable}
                onPress={() => set('amountMode', 'variavel')}
              />
            </ChoiceGroup>
          )}

          <TextField
            ref={refs.amountText}
            label={
              variable
                ? 'Valor de referência'
                : parcelada
                  ? 'Valor da parcela'
                  : anual
                    ? k === 1
                      ? 'Valor da conta'
                      : 'Valor de cada parcela'
                    : 'Valor por mês'
            }
            prefix="R$"
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            onBlur={formatAmountOnBlur}
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            large
            error={errors.amountText}
            hint={
              variable
                ? anual
                  ? 'Use o valor do último ano. Ele aparece como estimado até você informar o valor do ano.'
                  : 'Use o valor de uma conta recente. Ele aparece como estimado até você informar o valor de cada conta.'
                : undefined
            }
          />
          <SumValues target={refs.amountText} onUse={(t) => set('amountText', t)} />

          <TextField
            ref={refs.dueDayText}
            label="Dia do vencimento"
            value={draft.dueDayText}
            onChangeText={(t) => set('dueDayText', t.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            error={errors.dueDayText}
            hint={day !== null && day >= 29 ? 'Nos meses mais curtos, vence no último dia do mês.' : 'De 1 a 31.'}
          />

          <ChoiceGroup label="Categoria">
            <Chip label={NO_CATEGORY_LABEL} selected={draft.category === null} onPress={() => set('category', null)} />
            {CATEGORIES.despesa.map((c) => (
              <Chip key={c} label={c} selected={draft.category === c} onPress={() => set('category', c)} />
            ))}
          </ChoiceGroup>

          {/* Assinatura (D-046): só gasto fixo mensal; vale para o gasto fixo inteiro, não só a partir do mês escolhido. */}
          {subscribable ? (
            <SettingSwitch label={SUBSCRIPTION_TEXT.switchLabel} caption={SUBSCRIPTION_TEXT.switchCaption} value={subscription} onChange={setSubscription} />
          ) : null}
        </Card>
      </Screen>

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
            <Button label={retry ? 'Tentar novamente' : 'Salvar alterações'} busy={busy} busyLabel="Salvando…" onPress={submit} style={styles.save} />
          </View>
        </View>
      </View>

      <ConfirmDialog
        visible={Boolean(confirm)}
        title={confirm ? `Aplicar ${fromText(confirm.k)}?` : ''}
        cancelLabel="Voltar"
        confirmLabel="Aplicar"
        confirmTone="brand"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={apply}>
        <MoneyTxt>{confirm?.plan.text ?? ''}</MoneyTxt>
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
