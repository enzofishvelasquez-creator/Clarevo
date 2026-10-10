import {
  ANNUAL_SERIES_ERROR_TEXT,
  CATEGORIES,
  COMMITMENT_ERROR_TEXT,
  COMMITMENT_FIELD_ORDER,
  DESCRIPTION_MAX,
  MAX_RECORD_CENTS,
  NO_CATEGORY_LABEL,
  addDays,
  annualYearLabelOf,
  centsToInput,
  charCount,
  fieldForErrorCode,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  formatMonthName,
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
import { MoneyTxt } from '@/components/money-text';
import { SumValues } from '@/components/sum-values';
import { ChoiceGroup, ofSeries, SERIES_NOUN } from '@/components/series-parts';
import { TermHint } from '@/components/term-hint';
import { Banner, Button, Card, Chip, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { explanationHref } from '@/lib/learn';
import { useCreateCommitment, useLimitWatch, useUpdateCommitment, withNotice } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

export type CommitmentFormMode =
  | { type: 'nova'; prefill?: Partial<CommitmentInput> }
  /** informValue: "Informar o valor da conta" numa conta estimada (valor vazio com foco; envia amountIsEstimate: false). */
  | { type: 'editar'; commitment: Commitment; informValue?: boolean };

/** Descrição que sugere fatura de cartão: pagar a fatura como conta a pagar contaria as compras duas vezes. */
const INVOICE_HINT = /\bfatura\b|cart[aã]o/i;

const commitmentText = (code: string) =>
  code in COMMITMENT_ERROR_TEXT ? COMMITMENT_ERROR_TEXT[code as keyof typeof COMMITMENT_ERROR_TEXT] : COMMITMENT_ERROR_TEXT.salvar_falhou;

/** "novembro" no ano de hoje; "janeiro de 2027" em outro ano. */
const monthWord = (dueOn: string, today: string) => `${formatMonthName(monthOf(dueOn))}${dueOn.slice(0, 4) === today.slice(0, 4) ? '' : ` de ${dueOn.slice(0, 4)}`}`;

/**
 * Anotar e editar conta a pagar. Mesmos cuidados do RecordForm: rascunho preservado, chave por conteúdo e reconciliação.
 * Conta de gasto fixo ("Só esta conta"): o vencimento fica no mesmo mês (o banco recusa outro mês) e a conta passa a ser
 * alterada só neste mês. "Informar o valor da conta" tira a marca de estimado, mesmo com o valor igual à estimativa.
 */
export function CommitmentForm({ mode, space: personal }: { mode: CommitmentFormMode; space: PersonalSpace }) {
  const { today } = useSession();
  const repo = useRepo();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const create = useCreateCommitment();
  const update = useUpdateCommitment();
  const limitWatch = useLimitWatch();
  const qc = useQueryClient();

  const contextId = mode.type === 'nova' ? personal.personalContextId : mode.commitment.contextId;
  const contextName = 'Pessoal';
  /** Conta de gasto fixo em edição: o número e o mês nunca mudam. */
  const occurrence = mode.type === 'editar' && mode.commitment.series ? mode.commitment : null;
  const occurrenceMonth = occurrence ? monthOf(occurrence.dueOn) : null;
  const informValue = mode.type === 'editar' && Boolean(mode.informValue) && mode.commitment.amountIsEstimate;

  // O inicial já inclui o preenchimento da rota: abrir preenchido e sair sem mexer não pede confirmação.
  const initial = useMemo<CommitmentDraft>(() => {
    if (mode.type === 'editar') {
      const c = mode.commitment;
      // Informar o valor: o campo abre vazio, para a estimativa não passar por valor da conta.
      return { description: c.description, amountText: informValue ? '' : centsToInput(c.amountCents), dateText: formatDateBR(c.dueOn), category: c.category };
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

  const finish = (id: string, notice: string | null = null) => {
    // Confirmação tátil só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (mode.type === 'nova') {
      flash.set(withNotice('Conta a pagar salva', notice));
      leave(() => router.replace(`/a-pagar/${id}`));
    } else {
      flash.set(withNotice(informValue ? 'Valor da conta informado' : 'Alterações salvas', notice));
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
    // Conta de gasto fixo: o vencimento fica no mês dela (o banco confere de novo).
    if (occurrenceMonth && monthOf(v.input.dueOn) !== occurrenceMonth) {
      const errs = { dateText: annualName ? ANNUAL_SERIES_ERROR_TEXT.vencimento_fora_do_mes : COMMITMENT_ERROR_TEXT.vencimento_fora_do_mes };
      setErrors(errs);
      focusFirst(errs);
      return;
    }
    const input: CommitmentInput = informValue ? { ...v.input, amountIsEstimate: false } : v.input;
    setErrors({});
    setBanner(null);
    setPaidElsewhere(false);
    setBusy(true);
    const version = current?.version ?? 0;
    const snapshot = JSON.stringify([input, version]);
    try {
      if (pending.current.length > 0) {
        const savedId = await reconcile(input, snapshot);
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
      // Aviso do limite pessoal (D-041): o comprometido dos próximos meses antes de gravar, para ver se algum mês passou a ficar acima.
      const limitBefore = await limitWatch.before(contextId);
      try {
        const saved = await send(key, input, version);
        pending.current = [];
        setRetry(false);
        finish(saved.commitment.id, await limitWatch.after(limitBefore));
      } catch (e) {
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          opKey.current = newOperationKey();
          setRetry(false);
          const field = fieldForErrorCode(e.code);
          if (field && COMMITMENT_FIELD_ORDER.includes(field)) {
            const errs = {
              [field]: e.code === 'vencimento_fora_do_mes' && annualName ? ANNUAL_SERIES_ERROR_TEXT.vencimento_fora_do_mes : commitmentText(e.code),
            };
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

  /** "Todo mês", "Todo ano" e "Parcelado": abrem o formulário de série com o que já foi digitado (valores válidos, campo a campo). */
  const toSeries = (tipo: 'mensal' | 'anual' | 'parcelada') => {
    const params: Record<string, string> = { tipo };
    const description = draft.description.trim();
    if (description) params.descricao = description;
    const cents = parseBRL(draft.amountText);
    if (cents !== null && cents > 0 && cents <= MAX_RECORD_CENTS) params.valor = String(cents);
    if (draft.category) params.categoria = draft.category;
    const due = parseDateBR(draft.dateText);
    if (due) params.vencimento = due;
    // O que foi digitado aqui segue para o cadastro, que pede "Descartar o preenchimento?" antes de sair, como este pediria.
    if (dirty) params.origem = 'digitado';
    leave(() => router.replace({ pathname: '/gastos-fixos/novo', params }));
  };

  // Avisos ao vivo (informativos; a validação continua no salvar).
  const dueOn = parseDateBR(draft.dateText);
  const alreadyDue = dueOn !== null && dueOn < today;
  // Conta de gasto fixo não muda de mês: em vez do aviso, o salvar mostra o erro no campo.
  const movesFrom = !occurrence && base && dueOn && monthOf(dueOn) !== monthOf(base.dueOn) ? monthOf(base.dueOn) : null;
  const looksLikeInvoice = INVOICE_HINT.test(draft.description);
  const occurrenceWord = occurrence ? monthWord(occurrence.dueOn, today) : '';
  const occurrenceKind = occurrence?.series?.kind ?? 'mensal';
  const seriesNoun = SERIES_NOUN[occurrenceKind];
  /** Conta do ano: "a conta de 2027" (cota única) ou "a parcela 3 de 2027". */
  const annualName = (() => {
    if (!occurrence?.series || occurrence.series.kind !== 'anual') return null;
    const label = annualYearLabelOf(occurrence)!;
    const k = occurrence.series.partsPerYear ?? 1;
    const part = ((occurrence.series.number - 1) % k) + 1;
    return k === 1 ? `a conta de ${label}` : `a parcela ${part} de ${label}`;
  })();
  const tomorrow = addDays(today, 1);
  // Atalhos de vencimento: numa conta de gasto fixo, só os que ficam no mês dela.
  const showToday = !occurrenceMonth || monthOf(today) === occurrenceMonth;
  const showTomorrow = !occurrenceMonth || monthOf(tomorrow) === occurrenceMonth;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader
        title={mode.type === 'nova' ? 'Anotar conta a pagar' : informValue ? 'Informar o valor da conta' : 'Editar conta a pagar'}
        onBack={requestCancel}
        right={<ContextPill label={`Salvando em ${contextName}`} />}
      />
      <Screen contentStyle={styles.body}>
        {conflict ? (
          <Banner tone="erro" icon={AlertCircle}>
            <Txt variant="label" color={colors.error}>
              {COMMITMENT_ERROR_TEXT.versao_desatualizada}
            </Txt>
            <MoneyTxt variant="caption">
              {`Versão atual: ${conflict.description} · ${formatBRL(conflict.amountCents)} · vence em ${formatDateBR(conflict.dueOn)}`}
            </MoneyTxt>
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
          {mode.type === 'nova' ? (
            <>
              <ChoiceGroup label="Com que frequência?">
                <Chip label="Só uma vez" selected onPress={() => {}} />
                <Chip label="Todo mês" selected={false} onPress={() => toSeries('mensal')} />
                <Chip label="Todo ano" selected={false} onPress={() => toSeries('anual')} />
                <Chip label="Parcelado" selected={false} onPress={() => toSeries('parcelada')} />
              </ChoiceGroup>
              <TermHint term="Gasto fixo" slug="gasto-fixo" />
            </>
          ) : null}
          <Txt variant="caption" color={colors.textSecondary}>
            Prevista · só entra em Pago quando for marcada como paga
          </Txt>
          {occurrence ? (
            <Txt variant="label" color={colors.textSecondary}>
              {annualName
                ? informValue
                  ? `Informe o valor que veio n${annualName}. Ela deixa de ser estimada.`
                  : `Só ${annualName}. Ela fica marcada como alterada só nesta conta; a conta do ano continua igual nas outras.`
                : informValue
                  ? `Informe o valor que veio na conta de ${occurrenceWord}. Ela deixa de ser estimada.`
                  : `Só a conta de ${occurrenceWord}. Ela fica marcada como alterada só neste mês; o ${seriesNoun} continua igual nos outros meses.`}
            </Txt>
          ) : null}

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
              <LinkButton label="Fatura sem contar duas vezes" style={styles.inlineLink} onPress={() => router.push(explanationHref('fatura'))} />
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
            autoFocus={informValue}
            error={errors.amountText}
            moneyHint
            hint={
              informValue
                ? `A estimativa era ${formatBRL(occurrence?.amountCents ?? 0)}.`
                : occurrence?.amountIsEstimate
                  ? `Valor estimado pela referência ${ofSeries(occurrenceKind)}. Para tirar a marca de estimado, use Informar o valor da conta.`
                  : 'Valor previsto. Ao marcar como paga, você informa o valor que saiu da conta.'
            }
          />
          <SumValues target={refs.amountText} onUse={(t) => set('amountText', t)} />

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
              hint={
                occurrence
                  ? annualName
                    ? `O vencimento fica em ${occurrenceWord}. Para mudar o dia de todos os anos, edite a conta do ano.`
                    : `O vencimento fica em ${occurrenceWord}. Para mudar o dia de todos os meses, edite o ${seriesNoun}.`
                  : 'Digite só os números.'
              }
            />
            {showToday || showTomorrow ? (
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Atalhos de vencimento">
                {showToday ? (
                  <Chip label="Hoje" selected={draft.dateText === formatDateBR(today)} onPress={() => set('dateText', formatDateBR(today))} />
                ) : null}
                {showTomorrow ? (
                  <Chip label="Amanhã" selected={draft.dateText === formatDateBR(tomorrow)} onPress={() => set('dateText', formatDateBR(tomorrow))} />
                ) : null}
              </View>
            ) : null}
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
