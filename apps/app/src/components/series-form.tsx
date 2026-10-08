import {
  CATEGORIES,
  DESCRIPTION_MAX,
  INSTALLMENT_NATURES,
  MAX_RECORD_CENTS,
  NO_CATEGORY_LABEL,
  SERIES_ERROR_TEXT,
  SERIES_NATURE_LABEL,
  addMonths,
  affectedByEditFrom,
  centsToInput,
  charCount,
  fieldForErrorCode,
  findSeriesConflicts,
  firstMonthChoices,
  formatDateBR,
  formatMonthInputBR,
  formatMonthName,
  formatMonthYearBR,
  isRepoError,
  maskMonthBR,
  monthOf,
  newOperationKey,
  parseBRL,
  seriesErrorText,
  seriesPreview,
  validateSeriesDraft,
  type AmountMode,
  type IsoDate,
  type IsoMonth,
  type PersonalSpace,
  type SeriesDraft,
  type SeriesField,
  type SeriesFieldErrors,
  type SeriesInput,
  type SeriesKind,
  type SeriesWrite,
} from '@clarevo/core';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Info } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { ChoiceGroup, joinList, monthChipLabel, seriesStyles as styles } from '@/components/series-parts';
import { Banner, Button, Card, Chip, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useCommitments, useCreateSeries, useMonthRecords, useSeriesList, useSeriesOperationKey, useUpdateSeriesFrom } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/** Preenchimento vindo de outra tela: "Com que frequência?", "Repetir todo mês" ou "Tornar gasto fixo". */
export interface SeriesPrefill {
  description?: string;
  amountCents?: number;
  category?: string | null;
  dueDay?: number;
  firstMonth?: IsoMonth;
  /** "Tornar gasto fixo": data do gasto anotado que serviu de base. */
  basedOn?: IsoDate;
}

/** Descrição que sugere cartão ou fatura: parcelas do cartão já entram na fatura. */
const INVOICE_HINT = /\bfatura\b|cart[aã]o/i;

/** Primeira conta: o padrão (primeiro vencimento a partir de hoje), um dos chips ou "Outro mês" (campo MM/AAAA). */
type MonthPick = 'auto' | 'outro' | IsoMonth;

const intOrNull = (text: string) => (/^\s*\d{1,2}\s*$/.test(text) ? Number(text.trim()) : null);
const validDay = (text: string) => {
  const d = intOrNull(text);
  return d !== null && d >= 1 && d <= 31 ? d : null;
};

/** O que foi salvo e onde as contas aparecem (4.3, "Depois de salvar"). */
function savedText(w: SeriesWrite): string {
  if (w.series.kind === 'parcelada') return 'Parcelamento salvo.';
  const months = w.occurrences.map((c) => formatMonthName(monthOf(c.dueOn)));
  if (months.length === 0) {
    return `Gasto fixo salvo. A primeira conta aparece em Contas a pagar a partir de ${formatMonthYearBR(addMonths(w.series.firstDueMonth, -1))}.`;
  }
  return months.length === 1
    ? `Gasto fixo salvo. A conta de ${months[0]} já está em Contas a pagar.`
    : `Gasto fixo salvo. As contas de ${joinList(months)} já estão em Contas a pagar.`;
}

/** Partes do cadastro que "Esta e as próximas" não muda (período e numeração). */
const structureOf = (i: SeriesInput) => JSON.stringify([i.kind, i.firstDueMonth, i.firstNumber, i.installmentTotal, i.lastMonth]);

/**
 * Novo gasto fixo ("Todo mês") ou parcelamento. Mesmos cuidados do formulário de conta a pagar: rascunho preservado,
 * chave por conteúdo, reconciliação depois de rede incerta, confirmação ao sair e rodapé fixo.
 * As regras e a ordem de validação são as do banco (validateSeriesDraft).
 */
export function SeriesForm({ kind: initialKind, prefill, space: personal }: { kind: SeriesKind; prefill?: SeriesPrefill; space: PersonalSpace }) {
  const { today } = useSession();
  const repo = useRepo();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const create = useCreateSeries();
  const updateFrom = useUpdateSeriesFrom();
  const keys = useSeriesOperationKey();
  const contextId = personal.personalContextId;
  const contextName = 'Pessoal';
  const currentMonth = monthOf(today);
  const chipMonths = [currentMonth, addMonths(currentMonth, 1)];

  // O inicial já inclui o preenchimento da rota: abrir preenchido e sair sem mexer não pede confirmação.
  const initial = useMemo(() => {
    const p = prefill ?? {};
    const first = p.firstMonth;
    const monthPick: MonthPick = !first ? 'auto' : chipMonths.includes(first) ? first : 'outro';
    const draft: SeriesDraft = {
      kind: initialKind,
      nature: null,
      description: p.description ?? '',
      amountText: p.amountCents ? centsToInput(p.amountCents) : '',
      amountMode: 'fixo',
      dueDayText: p.dueDay ? String(p.dueDay) : '',
      firstMonthText: monthPick === 'outro' && first ? formatMonthInputBR(first) : '',
      firstNumberText: '',
      installmentTotalText: '',
      lastMonthText: '',
      category: p.category ?? null,
    };
    return { draft, monthPick, ending: false };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<SeriesDraft>(initial.draft);
  const [monthPick, setMonthPick] = useState<MonthPick>(initial.monthPick);
  /** Todo mês: "Termina em…" escolhido. */
  const [ending, setEnding] = useState(initial.ending);
  const [errors, setErrors] = useState<SeriesFieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Meses em que a pessoa escolheu "Manter" diante de uma conta avulsa com a mesma descrição. */
  const [kept, setKept] = useState<IsoMonth[]>([]);
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);

  const refs = {
    description: useRef<TextInput>(null),
    amountText: useRef<TextInput>(null),
    dueDayText: useRef<TextInput>(null),
    firstMonthText: useRef<TextInput>(null),
    installmentTotalText: useRef<TextInput>(null),
    firstNumberText: useRef<TextInput>(null),
    lastMonthText: useRef<TextInput>(null),
  } satisfies Partial<Record<SeriesField, React.RefObject<TextInput | null>>>;

  const parcelada = draft.kind === 'parcelada';
  const dirty = JSON.stringify({ draft, monthPick, ending }) !== JSON.stringify(initial);

  // Sair com alterações não salvas pede confirmação (voltar, gesto, botão do sistema).
  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);

  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/gastos-fixos'));

  const set = <K extends keyof SeriesDraft>(k: K, v: SeriesDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k in errors) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  // Primeira conta: com o dia válido, os chips mostram o vencimento; o padrão acompanha o dia até a pessoa escolher.
  const day = validDay(draft.dueDayText);
  const choices = firstMonthChoices(day ?? 1, today);
  const defaultMonth = day === null ? currentMonth : (choices.find((c) => c.isDefault)?.month ?? currentMonth);
  const firstMonthText =
    monthPick === 'auto' ? formatMonthInputBR(defaultMonth) : monthPick === 'outro' ? draft.firstMonthText : formatMonthInputBR(monthPick);
  const effective: SeriesDraft = { ...draft, firstMonthText, lastMonthText: !parcelada && ending ? draft.lastMonthText : '' };
  const checked = validateSeriesDraft(effective, today);
  const preview = checked.ok ? seriesPreview(checked.input, today) : null;

  const pickMonth = (m: IsoMonth) => {
    if (chipMonths.includes(m)) setMonthPick(m);
    else {
      setMonthPick('outro');
      setDraft((d) => ({ ...d, firstMonthText: formatMonthInputBR(m) }));
    }
    if (errors.firstMonthText) setErrors((e) => ({ ...e, firstMonthText: undefined }));
  };

  // Avisos contra contar duas vezes: gasto anotado e conta avulsa no primeiro mês, gasto fixo parecido.
  const conflictMonth = preview?.firstMonth ?? currentMonth;
  const monthRecords = useMonthRecords(contextId, conflictMonth);
  const monthCommitments = useCommitments(contextId, conflictMonth);
  const seriesList = useSeriesList(contextId);
  const conflicts =
    preview && monthRecords.data && monthCommitments.data && seriesList.data
      ? findSeriesConflicts(preview, monthCommitments.data, monthRecords.data, seriesList.data)
      : null;

  /** Ordem visual dos campos: o foco vai para o primeiro erro com campo de texto na tela. */
  const visualOrder: SeriesField[] = parcelada
    ? ['description', 'nature', 'amountText', 'dueDayText', 'installmentTotalText', 'firstNumberText', 'firstMonthText']
    : ['description', 'amountText', 'dueDayText', 'firstMonthText', 'lastMonthText'];
  const focusFirst = (errs: SeriesFieldErrors) => {
    for (const f of visualOrder) {
      if (!errs[f]) continue;
      const ref = (refs as Partial<Record<SeriesField, React.RefObject<TextInput | null>>>)[f];
      if (ref?.current) {
        ref.current.focus();
        return;
      }
    }
  };

  const finish = (w: SeriesWrite) => {
    // Confirmação tátil só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flash.set(savedText(w));
    leave(() => router.replace(`/gastos-fixos/${w.series.id}`));
  };

  /**
   * Resultado de rede incerto: antes de repetir, conferir se alguma tentativa anterior foi gravada.
   * Se foi e só mudaram descrição, valor, dia, categoria ou tipo, aplica o preenchimento atual como
   * "esta e as próximas" desde a primeira conta (nunca cria um segundo gasto fixo). Se mudou o período,
   * abre o que foi salvo para a pessoa conferir. Devolve true se havia algo gravado.
   */
  const reconcile = async (input: SeriesInput, snapshot: string): Promise<boolean> => {
    const saved = await keys.findSaved();
    if (!saved || saved.action !== 'criar_serie') return false;
    const [series, list] = await Promise.all([repo.getSeries(saved.seriesId), repo.listSeriesOccurrences(saved.seriesId)]);
    if (!series) {
      keys.settled();
      setBanner(SERIES_ERROR_TEXT.nao_encontrado);
      return true;
    }
    const occurrences = [...list].reverse();
    const savedInput = JSON.parse(saved.snapshot) as SeriesInput;
    if (saved.snapshot === snapshot || structureOf(savedInput) !== structureOf(input)) {
      keys.settled();
      if (saved.snapshot !== snapshot) {
        // O período não muda por edição: mostrar o que foi salvo, sem aplicar nada em silêncio.
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        flash.set(`${series.kind === 'parcelada' ? 'Parcelamento salvo' : 'Gasto fixo salvo'} antes da falha de conexão, com o período do primeiro envio. Confira abaixo.`);
        leave(() => router.replace(`/gastos-fixos/${series.id}`));
        return true;
      }
      finish({ series, occurrences, changed: 0 });
      return true;
    }
    const plan = affectedByEditFrom(occurrences, series, series.firstNumber);
    if (!plan.ok) {
      keys.settled();
      leave(() => router.replace(`/gastos-fixos/${series.id}`));
      return true;
    }
    const { nature, description, category, amountCents, amountMode, dueDay } = input;
    const w = await updateFrom.mutateAsync({
      key: newOperationKey(),
      id: series.id,
      version: series.version,
      fromNumber: series.firstNumber,
      affected: plan.affected,
      input: { nature, description, category, amountCents, amountMode, dueDay },
    });
    keys.settled();
    finish(w);
    return true;
  };

  const submit = async () => {
    if (busy) return; // envio repetido bloqueado enquanto o anterior não termina
    const v = validateSeriesDraft(effective, today);
    // "Termina em…" sem o mês: sem esta conferência, o gasto fixo seria salvo sem término.
    const endMissing = !parcelada && ending && draft.lastMonthText.trim() === '';
    if (!v.ok || endMissing) {
      const errs: SeriesFieldErrors = v.ok ? {} : { ...v.errors };
      if (endMissing) errs.lastMonthText = 'Informe o último mês, como 12/2026.';
      setErrors(errs);
      focusFirst(errs);
      return;
    }
    setErrors({});
    setBanner(null);
    setBusy(true);
    const snapshot = JSON.stringify(v.input);
    try {
      if (keys.hasPending() && (await reconcile(v.input, snapshot))) {
        setRetry(false);
        return;
      }
      const key = keys.keyFor(snapshot);
      try {
        const saved = await create.mutateAsync({ key, contextId, input: v.input });
        keys.settled();
        setRetry(false);
        finish(saved);
      } catch (e) {
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          keys.refused();
          setRetry(false);
          const field = fieldForErrorCode(e.code, 'series');
          if (field && visualOrder.includes(field)) {
            const errs = { [field]: seriesErrorText(e.code, today) };
            setErrors(errs);
            focusFirst(errs);
            return;
          }
          setBanner(seriesErrorText(e.code, today));
          return;
        }
        // Falha de rede: a gravação pode ou não ter acontecido. Guardar a tentativa para reconciliar.
        keys.uncertain(key, snapshot);
        setRetry(true);
        setBanner(SERIES_ERROR_TEXT.salvar_falhou);
      }
    } catch (e) {
      // Falhou a reconciliação: a tentativa pendente continua guardada e é conferida de novo na próxima vez.
      setRetry(true);
      setBanner(isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido' ? seriesErrorText(e.code, today) : SERIES_ERROR_TEXT.salvar_falhou);
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

  const setMode = (m: AmountMode) => set('amountMode', m);
  const variable = draft.amountMode === 'variavel';
  const looksLikeCard = INVOICE_HINT.test(draft.description);
  const firstMonthName = preview ? formatMonthName(preview.firstMonth) : '';
  const suggestedName = conflicts ? formatMonthName(conflicts.suggestedFirstMonth) : '';
  const showCommitmentConflict = Boolean(conflicts?.texts.commitment && preview && !kept.includes(preview.firstMonth));
  const amountLabel = variable ? 'Valor de referência' : parcelada ? 'Valor da parcela' : 'Valor por mês';
  const saveLabel = parcelada ? 'Salvar parcelamento' : 'Salvar gasto fixo';

  const monthChips = (
    <>
      {chipMonths.map((m, i) => {
        const choice = choices[i]!;
        const selected = monthPick === m || (monthPick === 'auto' && m === defaultMonth);
        return (
          <Chip key={m} label={day === null ? monthChipLabel(m, today) : choice.label} selected={selected} onPress={() => pickMonth(m)} />
        );
      })}
      <Chip label="Outro mês" selected={monthPick === 'outro'} onPress={() => setMonthPick('outro')} />
    </>
  );
  const otherMonthField =
    monthPick === 'outro' ? (
      <TextField
        ref={refs.firstMonthText}
        label={parcelada ? 'Mês da próxima parcela (MM/AAAA)' : 'Mês da primeira conta (MM/AAAA)'}
        value={draft.firstMonthText}
        onChangeText={(t) => set('firstMonthText', maskMonthBR(t))}
        placeholder="MM/AAAA"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={7}
        error={errors.firstMonthText}
        hint="Digite só os números."
      />
    ) : errors.firstMonthText ? (
      <Txt variant="label" color={colors.error} accessibilityRole="alert">
        {errors.firstMonthText}
      </Txt>
    ) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader
        title={parcelada ? 'Novo parcelamento' : 'Novo gasto fixo'}
        onBack={requestCancel}
        right={<ContextPill label={`Salvando em ${contextName}`} />}
      />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        {prefill?.basedOn ? (
          <Banner tone="info" icon={Info} live={false}>
            <Txt variant="label">
              Baseado no gasto de {formatDateBR(prefill.basedOn)}. Esse gasto continua como está; o gasto fixo começa no próximo vencimento.
            </Txt>
          </Banner>
        ) : null}

        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label="Com que frequência?">
            <Chip label="Todo mês" selected={!parcelada} onPress={() => set('kind', 'mensal')} />
            <Chip label="Parcelado" selected={parcelada} onPress={() => set('kind', 'parcelada')} />
          </ChoiceGroup>

          <TextField
            ref={refs.description}
            label="Descrição"
            value={draft.description}
            onChangeText={(t) => set('description', t)}
            placeholder={parcelada ? 'Ex.: Financiamento do carro' : 'Ex.: Aluguel'}
            maxLength={DESCRIPTION_MAX}
            autoFocus={!prefill?.description}
            error={errors.description}
            hint={
              charCount(draft.description) >= 60
                ? `${charCount(draft.description)} de ${DESCRIPTION_MAX} caracteres`
                : parcelada
                  ? 'Ex.: Financiamento do carro, Parcelas do imóvel'
                  : 'Ex.: Aluguel, Escola, Luz, Internet. Nomes curtos bastam; não é preciso citar pessoas.'
            }
            returnKeyType="next"
            onSubmitEditing={() => refs.amountText.current?.focus()}
          />

          {looksLikeCard ? (
            <Banner tone="info" icon={Info}>
              <Txt variant="label">
                Parcelas de compras no cartão já entram na fatura. Para não contar duas vezes, anote aqui só parcelamentos em boleto, débito ou
                financiamento.
              </Txt>
              <LinkButton label="Fatura sem contar duas vezes" style={styles.inlineLink} onPress={() => router.push('/explicacao/fatura')} />
            </Banner>
          ) : null}

          {parcelada ? (
            <ChoiceGroup label="Tipo do parcelamento" hint="Os dois primeiros contam como dívida na renda comprometida." error={errors.nature}>
              {INSTALLMENT_NATURES.map((n) => (
                <Chip key={n} label={SERIES_NATURE_LABEL[n]} selected={draft.nature === n} onPress={() => set('nature', n)} />
              ))}
            </ChoiceGroup>
          ) : null}

          <ChoiceGroup label={parcelada ? 'A parcela muda de um mês para outro?' : 'O valor muda de um mês para outro?'}>
            <Chip label={parcelada ? 'Parcela igual todo mês' : 'Não, é sempre o mesmo'} selected={!variable} onPress={() => setMode('fixo')} />
            <Chip
              label={parcelada ? 'Parcela muda (financiamento corrigido)' : 'Sim, muda (como luz e água)'}
              selected={variable}
              onPress={() => setMode('variavel')}
            />
          </ChoiceGroup>

          <TextField
            ref={refs.amountText}
            label={amountLabel}
            prefix="R$"
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            onBlur={formatAmountOnBlur}
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            large
            error={errors.amountText}
            hint={variable ? 'Use o valor de uma conta recente. Ele aparece como estimado até você informar o valor de cada conta.' : undefined}
          />
          {variable ? (
            <LinkButton label="Contas que mudam de valor" style={styles.inlineLink} onPress={() => router.push('/explicacao/estimativa')} />
          ) : null}

          <TextField
            ref={refs.dueDayText}
            label="Dia do vencimento"
            value={draft.dueDayText}
            onChangeText={(t) => set('dueDayText', t.replace(/\D/g, '').slice(0, 2))}
            placeholder="Ex.: 10"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            error={errors.dueDayText}
            hint={day !== null && day >= 29 ? 'Nos meses mais curtos, vence no último dia do mês.' : 'De 1 a 31.'}
          />

          {parcelada ? (
            <>
              <TextField
                ref={refs.installmentTotalText}
                label="Total de parcelas"
                value={draft.installmentTotalText}
                onChangeText={(t) => set('installmentTotalText', t.replace(/\D/g, '').slice(0, 3))}
                placeholder="Ex.: 48"
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={3}
                error={errors.installmentTotalText}
                hint="De 2 a 480."
              />
              <TextField
                ref={refs.firstNumberText}
                label="Número da próxima parcela a pagar"
                value={draft.firstNumberText}
                onChangeText={(t) => set('firstNumberText', t.replace(/\D/g, '').slice(0, 3))}
                placeholder="Ex.: 1"
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={3}
                error={errors.firstNumberText}
                hint="Se você já pagou parcelas antes de usar o Clarevo, informe o número da próxima. As anteriores não viram gastos."
              />
              <ChoiceGroup label="Mês da próxima parcela">{monthChips}</ChoiceGroup>
              {otherMonthField}
            </>
          ) : (
            <>
              <ChoiceGroup label="Primeira conta">{monthChips}</ChoiceGroup>
              {otherMonthField}
            </>
          )}

          {preview?.firstOverdue ? (
            <Banner tone="info" icon={Info}>
              <Txt variant="label">Esta conta já venceu. Ela vai aparecer em Vencidas até você marcar como paga.</Txt>
            </Banner>
          ) : null}

          {!parcelada ? (
            <View style={{ gap: space[2] }}>
              <ChoiceGroup label="Até quando?" hint="Útil para escola, curso ou contrato com prazo.">
                <Chip label="Sem data para terminar" selected={!ending} onPress={() => setEnding(false)} />
                <Chip label="Termina em…" selected={ending} onPress={() => setEnding(true)} />
              </ChoiceGroup>
              {ending ? (
                <TextField
                  ref={refs.lastMonthText}
                  label="Último mês (MM/AAAA)"
                  value={draft.lastMonthText}
                  onChangeText={(t) => set('lastMonthText', maskMonthBR(t))}
                  placeholder="MM/AAAA"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={7}
                  error={errors.lastMonthText}
                  hint="Digite só os números."
                />
              ) : null}
            </View>
          ) : null}

          <ChoiceGroup label="Categoria">
            <Chip label={NO_CATEGORY_LABEL} selected={draft.category === null} onPress={() => set('category', null)} />
            {CATEGORIES.despesa.map((c) => (
              <Chip key={c} label={c} selected={draft.category === c} onPress={() => set('category', c)} />
            ))}
          </ChoiceGroup>
        </Card>

        {preview ? (
          // Prévia que muda a cada tecla: sem região viva, para não ser anunciada de novo a cada dígito.
          <Banner tone="info" icon={Info} live={false}>
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              Como vai ficar
            </Txt>
            <Txt variant="label">{preview.text}</Txt>
            {preview.lines.map((line) => (
              <Txt key={line} variant="caption">
                {line}
              </Txt>
            ))}
          </Banner>
        ) : null}

        {conflicts?.texts.record ? (
          <Banner tone="info" icon={Info}>
            <Txt variant="label">{conflicts.texts.record}</Txt>
            <Button label={conflicts.texts.startNext} tone="soft" onPress={() => pickMonth(conflicts.suggestedFirstMonth)} />
          </Banner>
        ) : null}
        {showCommitmentConflict && conflicts && preview ? (
          <Banner tone="info" icon={Info}>
            <Txt variant="label">{conflicts.texts.commitment}</Txt>
            <Button label={`Começar em ${suggestedName}`} tone="soft" onPress={() => pickMonth(conflicts.suggestedFirstMonth)} />
            <Button label={`Manter ${firstMonthName}`} tone="ghost" onPress={() => setKept((k) => [...k, preview.firstMonth])} />
          </Banner>
        ) : null}
        {conflicts?.texts.similar ? (
          <Banner tone="info" icon={Info}>
            <Txt variant="label">{conflicts.texts.similar}</Txt>
          </Banner>
        ) : null}

        <Txt variant="label" color={colors.textSecondary}>
          Será salvo em <Txt variant="label" style={{ fontFamily: fonts.bold }}>{contextName}</Txt>. Cada mês vira uma conta a pagar, e só o
          que você marca como paga entra em Pago.
        </Txt>
        <LinkButton label="Gasto fixo, conta a pagar e gasto anotado" color={colors.textSecondary} onPress={() => router.push('/explicacao/gasto-fixo')} />
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
            <Button label={retry ? 'Tentar novamente' : saveLabel} busy={busy} busyLabel="Salvando…" onPress={() => submit()} style={styles.save} />
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
