import {
  ACCOUNTS_TEXT,
  CATEGORIES,
  COMMITMENT_ERROR_TEXT,
  MAX_RECORD_CENTS,
  NO_CATEGORY_LABEL,
  PAYMENT_ERROR_TEXT,
  PAYMENT_FIELD_ORDER,
  addDays,
  annualYearLabelOf,
  centsToInput,
  chooseAccountId,
  fieldForErrorCode,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  isRepoError,
  maskDateBR,
  mergeOccurrences,
  monthOf,
  newOperationKey,
  parseBRL,
  parseDateBR,
  validatePaymentDraft,
  wholeYearPayment,
  type Commitment,
  type DraftField,
  type FieldErrors,
  type PaymentDraft,
  type PaymentInput,
  type PersonalSpace,
  type WholeYearPayment,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Info } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountPicker } from '@/components/account-picker';
import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { CheckOption, yearA11yLabel } from '@/components/series-parts';
import { SumValues } from '@/components/sum-values';
import { TermHint } from '@/components/term-hint';
import { Banner, Button, Card, Chip, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { explanationHref } from '@/lib/learn';
import { totalChange } from '@/lib/highlight';
import { useLastAccount } from '@/lib/last-account';
import {
  useBudgetWatch,
  usePayCommitment,
  useSeries,
  useSeriesOccurrences,
  useSeriesOpenOccurrences,
  useSeriesOperationKey,
  useSkipSeriesYear,
  useUpdateRecord,
  withNotice,
} from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/** "R$" e os dígitos na mesma linha em textos corridos. */
const keepTogether = (money: string) => money.replace(' ', '\u00A0');

const paymentText = (code: string) =>
  code in PAYMENT_ERROR_TEXT ? PAYMENT_ERROR_TEXT[code as keyof typeof PAYMENT_ERROR_TEXT] : PAYMENT_ERROR_TEXT.pagar_falhou;

/**
 * "Marcar como paga": uma única operação no banco cria o gasto realizado e quita a conta a pagar (D-021).
 * O gasto entra em Pago do mês da data do pagamento; a conta sai de "Ainda a pagar".
 * Conta com valor estimado (gasto fixo que muda): o valor abre vazio, porque o valor pago é o real (D-024, regra 4).
 * paidOnDue: a data abre no vencimento ("Mudar valor ou data" em Contas vencidas).
 * Parcela de conta do ano com outras em aberto no ano (D-029, regra 4): "Paguei o ano todo de uma vez (cota única)" paga
 * esta parcela com o valor total e, só depois do pagamento confirmado, tira as outras (skip_series_year). Se a segunda
 * escrita falhar, o pagamento continua registrado e a faixa diz o que fazer.
 */
export function PaymentForm({ commitment: c, space: personal, paidOnDue }: { commitment: Commitment; space: PersonalSpace; paidOnDue?: boolean }) {
  const { today } = useSession();
  const lastAccount = useLastAccount();
  const repo = useRepo();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const pay = usePayCommitment();
  const budgetWatch = useBudgetWatch();
  const updateRecord = useUpdateRecord();
  const skipYear = useSkipSeriesYear();
  const skipKeys = useSeriesOperationKey();
  const qc = useQueryClient();
  const contextName = 'Pessoal';
  // Conta do ano com parcelas: a série e todas as contas dela, para a caixa "Paguei o ano todo de uma vez".
  const yearParts = c.series?.kind === 'anual' && (c.series.partsPerYear ?? 1) > 1;
  const seriesId = yearParts ? c.series!.id : undefined;
  const yearSeries = useSeries(seriesId, c.contextId);
  const yearOcc = useSeriesOccurrences(seriesId, c.contextId);
  const yearOpen = useSeriesOpenOccurrences(seriesId, c.contextId);

  const initial = useMemo<PaymentDraft>(
    () => ({
      accountId: chooseAccountId(personal.accounts, lastAccount.last),
      amountText: c.amountIsEstimate ? '' : centsToInput(c.amountCents),
      dateText: formatDateBR(paidOnDue && c.dueOn <= today ? c.dueOn : today),
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
  /** "Paguei o ano todo de uma vez" marcada. */
  const [wholeYear, setWholeYear] = useState(false);
  /** A caixa foi desmarcada sozinha: as outras parcelas do ano deixaram de estar em aberto (em outro aparelho). */
  const [wholeGone, setWholeGone] = useState(false);
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

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || wholeYear;
  const whole =
    yearParts && yearSeries.data && yearOcc.data && yearOpen.data
      ? wholeYearPayment(mergeOccurrences(yearOcc.data, yearOpen.data), yearSeries.data, shown)
      : null;
  /** As três listas carregadas: só então "nenhuma outra parcela em aberto" é um fato, e não uma falha ao carregar. */
  const yearListsLoaded = yearParts && yearSeries.isSuccess && yearOcc.isSuccess && yearOpen.isSuccess;
  // Textos da caixa do último plano conhecido: marcada, ela continua na tela (e pode ser desmarcada) mesmo se uma lista
  // falhar ao recarregar; enviar fica bloqueado até as listas voltarem.
  const [lastBox, setLastBox] = useState<{ label: string; hint: string; yearLabel: string } | null>(null);
  const boxLabel = whole?.label;
  const boxHint = whole?.hint;
  const boxYear = whole?.year.label;
  useEffect(() => {
    if (boxLabel !== undefined && boxHint !== undefined && boxYear !== undefined) setLastBox({ label: boxLabel, hint: boxHint, yearLabel: boxYear });
  }, [boxLabel, boxHint, boxYear]);
  const box = whole ? { label: whole.label, hint: whole.hint, yearLabel: whole.year.label } : wholeYear ? lastBox : null;
  const account = personal.accounts.find((a) => a.id === draft.accountId) ?? personal.accounts[0];

  // Sair com alterações não salvas pede confirmação (voltar, gesto, botão do sistema).
  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);

  // Listas carregadas e nenhuma outra parcela do ano em aberto (pagas ou tiradas em outro aparelho): a caixa sai da tela
  // desmarcada, com um aviso, em vez de bloquear o pagamento sem ter como desmarcar.
  const hasWhole = whole !== null;
  useEffect(() => {
    if (wholeYear && yearListsLoaded && !hasWhole) {
      setWholeYear(false);
      setWholeGone(true);
    }
  }, [wholeYear, yearListsLoaded, hasWhole]);

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

  const finish = (saved?: { amountCents: number; occurredOn: string }, text = 'Pagamento registrado') => {
    // Confirmação tátil e efeito em Pago só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (saved) totalChange.set({ total: 'pago', month: monthOf(saved.occurredOn), deltaCents: saved.amountCents });
    lastAccount.remember(draft.accountId);
    flash.set(text);
    leave(goBack);
  };

  /**
   * "Paguei o ano todo de uma vez", passo 2 (o pagamento já está confirmado): tirar as outras parcelas do ano em aberto.
   * Devolve o texto da faixa: o de sucesso ou, se a escrita falhar, o que diz que o pagamento ficou e como repetir.
   * Resultado incerto: confere uma vez com findSeriesOperation se a escrita foi gravada.
   */
  const skipOthers = async (plan: WholeYearPayment): Promise<string> => {
    const ref = c.series!;
    const snapshot = JSON.stringify([ref.id, ref.number, plan.affectedAfterPayment]);
    const key = skipKeys.keyFor(snapshot);
    try {
      await skipYear.mutateAsync({ key, seriesId: ref.id, number: ref.number, affected: plan.affectedAfterPayment });
      skipKeys.settled();
      return plan.doneText;
    } catch (e) {
      if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
        skipKeys.refused();
        return plan.failedText;
      }
      skipKeys.uncertain(key, snapshot);
      try {
        const saved = await skipKeys.findSaved();
        if (saved?.action === 'tirar_ano') {
          skipKeys.settled();
          return plan.doneText;
        }
      } catch {
        // A conferência também falhou: o pagamento está registrado; a pessoa repete pela conta do ano.
      }
      return plan.failedText;
    }
  };

  /** Depois do pagamento confirmado: com a caixa marcada, tira as outras parcelas e mostra o texto certo. */
  const afterPayment = async (saved: { amountCents: number; occurredOn: string } | undefined, plan: WholeYearPayment | null, notice: string | null = null) => {
    if (!plan) {
      finish(saved, withNotice('Pagamento registrado', notice));
      return;
    }
    finish(saved, withNotice(await skipOthers(plan), notice));
  };

  /**
   * Resultado de rede incerto: antes de repetir, conferir se alguma tentativa anterior foi gravada.
   * Se foi e o preenchimento mudou, aplica o preenchimento atual como edição do gasto gerado.
   * Nunca há um segundo pagamento. Devolve o gasto (ou só true, se ele já não existe), ou null se nada foi gravado.
   * As tentativas só são esquecidas depois que a leitura e a edição do gasto dão certo: se uma delas falhar,
   * a próxima tentativa reconcilia de novo em vez de repetir o pagamento.
   */
  const reconcile = async (input: PaymentInput, snapshot: string): Promise<{ amountCents: number; occurredOn: string } | true | null> => {
    for (const attempt of [...pending.current].reverse()) {
      const op = await repo.findCommitmentOperation(attempt.key);
      if (!op || op.action !== 'pagar_compromisso' || !op.recordId) continue;
      qc.invalidateQueries({ queryKey: ['commitments'] });
      qc.invalidateQueries({ queryKey: ['commitment', op.commitmentId] });
      qc.invalidateQueries({ queryKey: ['records'] });
      const expense = await repo.getRecord(op.recordId);
      if (!expense || attempt.snapshot === snapshot) {
        pending.current = [];
        return expense ?? true;
      }
      // O useInvalidate dos registros já recarrega as contas a pagar.
      const saved = await updateRecord.mutateAsync({
        key: newOperationKey(),
        id: expense.id,
        version: expense.version,
        input: { accountId: input.accountId, amountCents: input.amountCents, occurredOn: input.paidOn, description: expense.description, category: input.category },
      });
      pending.current = [];
      return saved;
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
        // O gasto do pagamento já conta em Pago: o Resumo e as Movimentações abertos recarregam.
        qc.invalidateQueries({ queryKey: ['records'] });
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
    // "Paguei o ano todo": o plano é o das listas atuais, congelado no envio; sem as listas, nada é enviado.
    const plan = wholeYear ? whole : null;
    if (wholeYear && !plan) {
      yearSeries.refetch();
      yearOcc.refetch();
      yearOpen.refetch();
      setBanner(COMMITMENT_ERROR_TEXT.carregar_falhou);
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
          await afterPayment(saved === true ? undefined : saved, plan);
          return;
        }
        // Nada foi gravado: repetir com a mesma chave se o conteúdo é o mesmo da última tentativa.
        const last = pending.current[pending.current.length - 1];
        if (!last || last.snapshot !== snapshot) opKey.current = newOperationKey();
      }
      const key = opKey.current;
      // Aviso do orçamento (D-041): o gasto do pagamento conta na categoria e no mês da data do pagamento.
      const budgetBefore = await budgetWatch.before(c.contextId, v.input.category, v.input.paidOn);
      try {
        const saved = await pay.mutateAsync({ key, id: c.id, version, input: v.input });
        pending.current = [];
        setRetry(false);
        await afterPayment(saved.record, plan, await budgetWatch.after(budgetBefore));
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
        // Se foi gravado, o detalhe, a lista e o Resumo que ficaram abertos recarregam e mostram a conta paga.
        qc.invalidateQueries({ queryKey: ['commitments'] });
        qc.invalidateQueries({ queryKey: ['commitment', c.id] });
        qc.invalidateQueries({ queryKey: ['records'] });
        setRetry(true);
        setBanner(PAYMENT_ERROR_TEXT.pagar_falhou);
      }
    } catch (e) {
      // Falhou a reconciliação: a tentativa pendente continua guardada e é conferida de novo na próxima vez.
      setRetry(true);
      setBanner(isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido' ? paymentText(e.code) : PAYMENT_ERROR_TEXT.pagar_falhou);
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
  const sumText = (w: WholeYearPayment) =>
    `Soma das ${w.others.length + 1} parcelas de ${w.year.label} em aberto: ${w.approximate ? 'cerca de ' : ''}${formatBRL(w.openTotalCents)}. Informe o valor que saiu da conta, com desconto, se houver.`;
  const afterText = (w: WholeYearPayment) =>
    `Depois, ${w.others.length === 1 ? 'a outra parcela' : `as outras ${w.others.length} parcelas`} de ${w.year.label} em aberto ${w.others.length === 1 ? 'sai' : 'saem'} de Contas a pagar.`;
  const goneLabel = shown.series?.kind === 'anual' ? annualYearLabelOf(shown) : null;
  const goneText = `As outras parcelas${goneLabel ? ` de ${goneLabel}` : ''} não estão mais em aberto, então a opção Paguei o ano todo foi desmarcada. Confira o valor pago.`;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title="Marcar como paga" onBack={requestCancel} right={<ContextPill label={`Salvando em ${contextName}`} />} />
      <Screen contentStyle={styles.body}>
        {conflict ? (
          <Banner tone="erro" icon={AlertCircle}>
            <Txt variant="label" color={colors.error}>
              {COMMITMENT_ERROR_TEXT.versao_desatualizada}
            </Txt>
            <MoneyTxt variant="caption">
              {`Versão atual: ${shown.description} · previsto ${formatBRL(shown.amountCents)} · vence em ${formatDateBR(shown.dueOn)}`}
            </MoneyTxt>
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
          <MoneyTxt variant="caption" color={overdue ? colors.error : colors.textSecondary}>
            {`${overdue ? 'Venceu em' : 'Vence em'} ${formatDateBR(shown.dueOn)} · ${
              shown.amountIsEstimate ? `estimado ≈ ${keepTogether(formatBRL(shown.amountCents))}` : `previsto ${keepTogether(formatBRL(shown.amountCents))}`
            }`}
          </MoneyTxt>
        </Card>

        <Card style={{ gap: space[4] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            Gasto já pago · {account?.name}
          </Txt>

          {box ? (
            <View style={{ gap: space[1] }}>
              <CheckOption
                label={box.label}
                hint={box.hint}
                checked={wholeYear}
                onPress={() => {
                  setWholeGone(false);
                  setWholeYear((w) => !w);
                }}
              />
              {wholeYear && whole ? (
                <MoneyTxt variant="caption" color={colors.textSecondary} style={{ paddingLeft: 24 + space[3] }} accessibilityLabel={yearA11yLabel(sumText(whole))}>
                  {sumText(whole)}
                </MoneyTxt>
              ) : wholeYear ? (
                <Txt variant="caption" color={colors.error} style={{ paddingLeft: 24 + space[3] }}>
                  {`Não foi possível carregar as parcelas de ${box.yearLabel}. Toque em Confirmar pagamento para tentar de novo ou desmarque a opção.`}
                </Txt>
              ) : null}
            </View>
          ) : wholeGone ? (
            <Banner tone="info" icon={Info}>
              <Txt variant="label" accessibilityLabel={yearA11yLabel(goneText)}>
                {goneText}
              </Txt>
            </Banner>
          ) : null}

          <TextField
            ref={refs.amountText}
            label={wholeYear ? 'Valor total pago' : 'Valor pago'}
            prefix="R$"
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            onBlur={formatAmountOnBlur}
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            large
            autoFocus={c.amountIsEstimate}
            error={errors.amountText}
            moneyHint
            hint={
              c.amountIsEstimate
                ? `Digite o valor da conta. A estimativa era ${formatBRL(c.amountCents)}.`
                : 'Use o valor que saiu da conta, com juros ou desconto, se houver.'
            }
          />
          <SumValues target={refs.amountText} onUse={(t) => set('amountText', t)} />
          <TermHint term="Pagou com multa ou desconto?" slug="multa-juros-atraso" />

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

          <AccountPicker
            accounts={personal.accounts}
            value={draft.accountId}
            label={ACCOUNTS_TEXT.out}
            error={errors.accountId}
            onChange={(id) => set('accountId', id ?? '')}
          />

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
            // Prévia que muda a cada tecla: sem região viva, para não ser anunciada de novo a cada dígito.
            <Banner tone="info" icon={Info} live={false}>
              <MoneyTxt variant="label">
                {`Um gasto de ${formatBRL(amount)} será registrado em Pago de ${formatMonthBR(monthOf(paidOn)).toLowerCase()}, e esta conta a pagar sai de Ainda a pagar.`}
              </MoneyTxt>
              {wholeYear && whole ? (
                <Txt variant="label" accessibilityLabel={yearA11yLabel(afterText(whole))}>
                  {afterText(whole)}
                </Txt>
              ) : amount !== shown.amountCents && !shown.amountIsEstimate ? (
                <MoneyTxt variant="label">{`O valor pago é diferente do previsto (${formatBRL(shown.amountCents)}). Pago usa o valor pago.`}</MoneyTxt>
              ) : null}
            </Banner>
          ) : null}
        </Card>

        <LinkButton
          label="Como o pagamento entra no mês?"
          color={colors.textSecondary}
          onPress={() => router.push(explanationHref('realizado-previsto'))}
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
