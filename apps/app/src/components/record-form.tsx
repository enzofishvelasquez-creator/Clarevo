import {
  CARDS_TEXT,
  CATEGORIES,
  DESCRIPTION_MAX,
  MAX_RECORD_CENTS,
  parseBRL,
  ERROR_TEXT,
  addDays,
  cardErrorText,
  cardTitle,
  charCount,
  maskDateBR,
  FIELD_ORDER,
  GOALS_TEXT,
  NO_CATEGORY_LABEL,
  RETURN_TEXT,
  centsToInput,
  dayErrorText,
  dayInMonthDate,
  fieldForErrorCode,
  formatBRL,
  installmentAmounts,
  installmentsNotice,
  formatDateBR,
  formatMonthBR,
  formatMonthName,
  formatMonthYearBR,
  isRepoError,
  looksLikeSavings,
  monthOf,
  newOperationKey,
  paidInvoiceMonths,
  parseDateBR,
  purchaseFirstInvoiceMonth,
  purchaseNotice,
  seriesGapForExpense,
  validateCardPurchaseDraft,
  validateRecordDraft,
  type DraftField,
  type FieldErrors,
  type Card as CardData,
  type FinancialRecord,
  type IsoMonth,
  type PersonalSpace,
  type RecordDraft,
  type RecordInput,
  type RecordKind,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Check, Info } from 'lucide-react-native';
import { useEffect, useId, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { returnSession } from '@/components/retorno-acoes';
import { ChoiceGroup } from '@/components/series-parts';
import { SumValues } from '@/components/sum-values';
import { Banner, Button, Card, Chip, LinkButton, Screen, TextField, Txt, styles as ui } from '@/components/ui';
import { cardHref, invoiceHref } from '@/lib/cards';
import { loadPrefs, updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { totalChange } from '@/lib/highlight';
import { explanationHref } from '@/lib/learn';
import { useAddCardPurchase, useCardInvoices, useCardOperationKey, useCards, useCommitments, useCreateRecord, useReturnReview, useUpdateRecord } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

type Mode = { type: 'novo'; kind: RecordKind } | { type: 'editar'; record: FinancialRecord };

/** Mês fechado vindo da revisão dos últimos meses (?mes=AAAA-MM). */
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

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

/**
 * Formulário único de criar e editar (CL C002, C003, C005).
 * Modo "Dia" (D-030, revisão dos últimos meses): /registro/novo?tipo=…&mes=AAAA-MM&origem=retomar abre com um mês
 * fechado já escolhido; o campo de data vira "Dia" ("/06/2026"), com "Usar outra data", e o rodapé ganha "Salvar e
 * anotar outro" (limpa descrição, valor e categoria; mantém tipo, conta e mês) e "Salvar" (volta à revisão).
 */
export function RecordForm({ mode, space: personal }: { mode: Mode; space: PersonalSpace }) {
  const { today, user, auth } = useSession();
  const params = useLocalSearchParams<{ mes?: string; origem?: string; cartao?: string }>();
  /** Mês fechado do modo "Dia" (só ao criar); null no formulário comum. */
  const dayMonth: IsoMonth | null =
    mode.type === 'novo' && typeof params.mes === 'string' && ISO_MONTH.test(params.mes) && params.mes < monthOf(today) ? params.mes : null;
  const fromReview = dayMonth !== null && params.origem === 'retomar';
  const repo = useRepo();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const create = useCreateRecord();
  const update = useUpdateRecord();
  const qc = useQueryClient();

  const kind = mode.type === 'novo' ? mode.kind : mode.record.kind;
  const copy = COPY[kind];
  const contextId = mode.type === 'novo' ? personal.personalContextId : mode.record.contextId;

  // Como você pagou? (D-037): só em gasto novo, fora do modo "Dia". Dinheiro, débito ou Pix é o jeito de sempre; cartão de
  // crédito anota a compra na fatura (ela só entra em Pago quando a fatura for paga).
  const cardMode = mode.type === 'novo' && kind === 'despesa' && dayMonth === null;
  const cards = useCards(cardMode ? contextId : undefined);
  const activeCards = (cards.data ?? []).filter((c) => c.status === 'ativo');
  const userId = user?.id;
  const persistPrefs = auth.mode !== 'demo';
  const prefs = useDevicePrefs(userId);
  const addPurchase = useAddCardPurchase();
  const cardKeys = useCardOperationKey();
  const [payWith, setPayWith] = useState<'dinheiro' | 'cartao'>('dinheiro');
  const [chosenCardId, setChosenCardId] = useState<string | null>(null);
  const [installmentsText, setInstallmentsText] = useState('1');
  const [installmentsError, setInstallmentsError] = useState<string | undefined>();
  const [cardError, setCardError] = useState<string | undefined>();
  /** A pessoa já escolheu a forma de pagamento: a escolha lembrada só vale até aí. */
  const paymentTouched = useRef(false);
  /** Cartões ativos no momento de "Cadastrar cartão": o que aparecer depois vem escolhido ao voltar. */
  const registering = useRef<string[] | null>(null);
  const selectedCard: CardData | null =
    payWith === 'cartao' ? (activeCards.find((c) => c.id === chosenCardId) ?? (activeCards.length === 1 ? activeCards[0]! : null)) : null;
  const cardPurchase = cardMode && payWith === 'cartao';

  const [initial, setInitial] = useState<RecordDraft>(() =>
      mode.type === 'novo'
        ? { accountId: personal.accounts[0]?.id ?? '', amountText: '', description: '', category: null, dateText: formatDateBR(today) }
        : {
            accountId: mode.record.accountId,
            amountText: centsToInput(mode.record.amountCents),
            description: mode.record.description,
            category: mode.record.category,
            dateText: formatDateBR(mode.record.occurredOn),
          },
  );
  const [dayMode, setDayMode] = useState(dayMonth !== null);
  const [dayText, setDayText] = useState('');
  const [initialDay, setInitialDay] = useState('');
  /** "Anotado: Salário, R$ 6.000,00 em 01/06/2026." depois de "Salvar e anotar outro". */
  const [noted, setNoted] = useState<string | null>(null);

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
  const installmentsRef = useRef<TextInput>(null);

  useEffect(() => {
    if (userId && cardMode) loadPrefs(userId, persistPrefs);
  }, [userId, persistPrefs, cardMode]);

  // Forma de pagamento: o cartão pedido pelo endereço (?cartao=) ou a última escolha deste aparelho, se ainda existir.
  const wantedCard = typeof params.cartao === 'string' ? params.cartao : prefs?.lastPayment && prefs.lastPayment !== 'dinheiro' ? prefs.lastPayment : null;
  const wantedActive = wantedCard !== null && activeCards.some((c) => c.id === wantedCard);
  useEffect(() => {
    if (!cardMode || paymentTouched.current || !cards.isSuccess) return;
    if (wantedActive) {
      setPayWith('cartao');
      setChosenCardId(wantedCard);
    }
  }, [cardMode, cards.isSuccess, wantedActive, wantedCard]);

  // Voltou de "Cadastrar cartão": o cartão novo já vem escolhido.
  const activeIds = activeCards.map((c) => c.id).join(',');
  useEffect(() => {
    const before = registering.current;
    if (!before) return;
    const created = activeCards.find((c) => !before.includes(c.id));
    if (created) {
      registering.current = null;
      paymentTouched.current = true;
      setPayWith('cartao');
      setChosenCardId(created.id);
    }
  }, [activeIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || (dayMode && dayText !== initialDay) || installmentsText !== '1';
  const day = dayMode && dayMonth ? dayInMonthDate(dayMonth, dayText) : null;
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
  // Aberto por atalho ou endereço recarregado, o formulário pode ser a única tela da pilha: volta ao registro ou ao Resumo.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(mode.type === 'editar' ? `/registro/${mode.record.id}` : '/'));

  const set = <K extends keyof RecordDraft>(k: K, v: RecordDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k in errors) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const focusFirst = (errs: FieldErrors) => {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) refs[first].current?.focus();
  };

  /** Modo "Dia": gravação confirmada. another: "Salvar e anotar outro" (o formulário fica, limpo); senão volta à revisão. */
  const finishDay = (input: RecordInput, another: boolean) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (fromReview) returnSession.noteAction();
    const text = RETURN_TEXT.noted(input);
    if (!another) {
      flash.set(text);
      leave(goBack);
      return;
    }
    const next: RecordDraft = { ...draft, description: '', amountText: '', category: null };
    setInitial(next);
    setDraft(next);
    setInitialDay(dayText);
    setErrors({});
    setNoted(text);
    opKey.current = newOperationKey();
    refs.description.current?.focus();
  };

  const finish = (recordId: string, saved?: Pick<FinancialRecord, 'amountCents' | 'occurredOn'>) => {
    // Confirmação tátil só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (saved) {
      const total = kind === 'despesa' ? 'pago' : 'recebido';
      const month = monthOf(saved.occurredOn);
      if (mode.type === 'novo') totalChange.set({ total, month, deltaCents: saved.amountCents });
      else if (monthOf(mode.record.occurredOn) === month) totalChange.set({ total, month, deltaCents: saved.amountCents - mode.record.amountCents });
      else totalChange.set({ total, month, deltaCents: saved.amountCents });
    }
    if (mode.type === 'novo') {
      // Só quem tem cartão ativo tem o que lembrar: a escolha vale só neste aparelho.
      if (cardMode && userId && activeCards.length > 0) updatePrefs(userId, { lastPayment: 'dinheiro' }, persistPrefs);
      flash.set(kind === 'despesa' ? 'Gasto salvo' : 'Recebimento salvo');
      leave(() => router.replace(`/registro/${recordId}`));
    } else {
      flash.set('Alterações salvas');
      leave(goBack);
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
   * As tentativas só são esquecidas depois que a leitura e a edição de acompanhamento dão certo: se uma delas
   * falhar, a próxima tentativa reconcilia de novo em vez de repetir a criação.
   */
  const reconcile = async (input: RecordInput, snapshot: string): Promise<{ id: string } & Partial<FinancialRecord> | null> => {
    for (const attempt of [...pending.current].reverse()) {
      const op = await repo.findOperation(attempt.key);
      if (!op) continue;
      qc.invalidateQueries({ queryKey: ['records'] });
      qc.invalidateQueries({ queryKey: ['record', op.recordId] });
      // Editar o gasto de uma conta a pagar muda a conta (versão e valor pago): o detalhe e a lista recarregam.
      qc.invalidateQueries({ queryKey: ['commitments'] });
      qc.invalidateQueries({ queryKey: ['commitment'] });
      qc.invalidateQueries({ queryKey: ['returnReview'] });
      const current = await repo.getRecord(op.recordId);
      if (attempt.snapshot === snapshot || !current) {
        pending.current = [];
        return current ?? { id: op.recordId };
      }
      const saved = await update.mutateAsync({ key: newOperationKey(), id: current.id, version: current.version, input });
      pending.current = [];
      return saved;
    }
    return null;
  };

  /**
   * Compra no cartão de crédito (D-037): vai para a fatura, não para Pago. Usa a chave de operação dos cartões (a mesma depois de
   * uma falha de rede, e o banco reconhece a repetição); nada é anunciado antes de o servidor confirmar.
   */
  const submitCard = async () => {
    if (busy) return;
    const card = selectedCard;
    if (!card) {
      setCardError(CARDS_TEXT.expense.chooseCard);
      return;
    }
    const v = validateCardPurchaseDraft(
      { description: draft.description, amountText: draft.amountText, dateText: draft.dateText, category: draft.category, installmentsText },
      today,
    );
    if (!v.ok) {
      const errs: FieldErrors = {};
      if (v.errors.description) errs.description = v.errors.description;
      if (v.errors.amountText) errs.amountText = v.errors.amountText;
      if (v.errors.dateText) errs.dateText = v.errors.dateText;
      setErrors(errs);
      setInstallmentsError(v.errors.installmentsText);
      setCardError(undefined);
      if (v.errors.installmentsText && !Object.keys(errs).length) installmentsRef.current?.focus();
      else focusFirst(errs);
      return;
    }
    setErrors({});
    setInstallmentsError(undefined);
    setCardError(undefined);
    setBanner(null);
    setBusy(true);
    try {
      const r = await guardedWrite(
        cardKeys,
        JSON.stringify([card.id, v.input]),
        (key) => addPurchase.mutateAsync({ key, cardId: card.id, input: v.input }),
        (s) => s.action === 'criar_compra_cartao' && s.cardId === card.id,
      );
      if (r.status === 'ok' || r.status === 'reconciled') {
        // Confirmação tátil, aviso e lembrança da escolha só depois de o servidor confirmar.
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (userId) updatePrefs(userId, { lastPayment: card.id }, persistPrefs);
        let invoiceMonth: IsoMonth | null = r.status === 'ok' ? (r.value.entry?.invoiceMonth ?? null) : null;
        if (r.status === 'reconciled' && r.saved.entryId) {
          // A tentativa anterior foi gravada: a fatura real vem do lançamento.
          try {
            invoiceMonth = (await repo.getCardEntry(r.saved.entryId))?.invoiceMonth ?? null;
          } catch {
            invoiceMonth = null;
          }
        }
        // A compra vai para a fatura: o aviso diz isso e que só conta em Pago quando a fatura for paga.
        flash.set(invoiceMonth ? `${CARDS_TEXT.expense.savedFor(invoiceMonth, today)} ${CARDS_TEXT.screens.cardPurchaseNote}` : CARDS_TEXT.expense.saved);
        leave(() => router.replace(invoiceMonth ? invoiceHref(card.id, invoiceMonth) : cardHref(card.id)));
        return;
      }
      if (r.status === 'refused') {
        const field: Partial<Record<string, 'description' | 'amountText' | 'dateText'>> = {
          valor_invalido: 'amountText',
          valor_acima_do_limite: 'amountText',
          descricao_obrigatoria: 'description',
          descricao_longa: 'description',
          categoria_invalida: 'description',
          data_invalida: 'dateText',
          data_futura: 'dateText',
        };
        const f = field[r.code];
        if (f) {
          const errs: FieldErrors = { [f]: cardErrorText(r.code, { purchase: true }) };
          setErrors(errs);
          focusFirst(errs);
          return;
        }
        if (r.code === 'parcelas_invalidas') {
          setInstallmentsError(cardErrorText(r.code));
          installmentsRef.current?.focus();
          return;
        }
        if (r.code === 'cartao_arquivado' || r.code === 'nao_encontrado' || r.code === 'fatura_paga') qc.invalidateQueries({ queryKey: ['cards'] });
        setBanner(cardErrorText(r.code, { purchase: true }));
        return;
      }
      setBanner(ERROR_TEXT.salvar_falhou);
    } catch {
      setBanner(ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (versionOverride?: number, another = false) => {
    if (busy) return; // envio repetido bloqueado enquanto o anterior não termina
    if (cardPurchase) {
      await submitCard();
      return;
    }
    // Modo "Dia": o dia vira a data do mês fechado; erro do dia ("Informe o dia.", "Junho tem 30 dias.") no lugar da data.
    const dayError = day && 'error' in day ? dayErrorText(day.error, dayMonth!) : null;
    const effective = day ? { ...draft, dateText: 'date' in day ? formatDateBR(day.date) : '' } : draft;
    const v = validateRecordDraft(effective, today);
    if (!v.ok || dayError) {
      const errs = { ...(v.ok ? {} : v.errors), ...(dayError ? { dateText: dayError } : {}) };
      setErrors(errs);
      focusFirst(errs);
      return;
    }
    setErrors({});
    setBanner(null);
    setNoted(null);
    setBusy(true);
    const version = versionOverride ?? baseVersion;
    const snapshot = JSON.stringify([v.input, version]);
    try {
      if (pending.current.length > 0) {
        const saved = await reconcile(v.input, snapshot);
        if (saved) {
          if (dayMode || fromReview) finishDay(v.input, another);
          else finish(saved.id, saved.amountCents !== undefined && saved.occurredOn ? { amountCents: saved.amountCents, occurredOn: saved.occurredOn } : undefined);
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
        // Vindo da revisão, sempre volta a ela e anota a ação, também depois de "Usar outra data".
        if (dayMode || fromReview) finishDay(v.input, another);
        else finish(saved.id, saved);
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

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => goBack);
    else goBack();
  };

  const parsedDate = day ? ('date' in day ? day.date : null) : parseDateBR(draft.dateText);
  const movesMonth = mode.type === 'editar' && parsedDate && monthOf(parsedDate) !== monthOf(mode.record.occurredOn);

  // Aviso contra contar duas vezes (D-024): gasto com a descrição de uma conta de gasto fixo em aberto no mês da data.
  // Gasto que já é o pagamento de uma conta a pagar não precisa do aviso.
  const seriesCheckMonth =
    kind === 'despesa' && !cardPurchase && !(mode.type === 'editar' && mode.record.commitmentId) && parsedDate ? monthOf(parsedDate) : null;
  const monthBills = useCommitments(seriesCheckMonth ? contextId : undefined, seriesCheckMonth ?? monthOf(today));
  const typed = draft.description.trim().toLocaleLowerCase('pt-BR');
  const openSeriesBill =
    seriesCheckMonth && typed
      ? (monthBills.data?.find(
          (c) => c.series !== null && c.status === 'aberto' && monthOf(c.dueOn) === seriesCheckMonth && c.description.trim().toLocaleLowerCase('pt-BR') === typed,
        ) ?? null)
      : null;
  const billMonth = openSeriesBill
    ? `${formatMonthName(monthOf(openSeriesBill.dueOn))}${openSeriesBill.dueOn.slice(0, 4) === today.slice(0, 4) ? '' : ` de ${openSeriesBill.dueOn.slice(0, 4)}`}`
    : '';

  // Modo "Dia" a partir da revisão: gasto com a descrição de um gasto fixo sem conta registrada no mês (use Já paguei).
  const returnReview = useReturnReview(fromReview && kind === 'despesa' ? contextId : undefined);
  // O mês é o da data efetiva: depois de "Usar outra data", o da data digitada.
  const gapMonth = parsedDate ? monthOf(parsedDate) : dayMonth;
  const gapRow = fromReview && gapMonth && returnReview.data?.review ? seriesGapForExpense(returnReview.data.review, gapMonth, draft.description) : null;

  // Compra no cartão: em qual fatura entra (a real, que pode ser a seguinte se a do ciclo já foi paga) e as parcelas.
  const cardInvoices = useCardInvoices(cardPurchase ? selectedCard : null);
  const installments = /^\d{1,3}$/.test(installmentsText.trim()) ? Number(installmentsText.trim()) : installmentsText.trim() === '' ? 1 : Number.NaN;
  const purchaseAmount = parseBRL(draft.amountText);
  let purchaseText: string | null = null;
  let installmentsLine: string | null = null;
  if (cardPurchase && selectedCard && cardInvoices.data && parsedDate && parsedDate <= today && Number.isInteger(installments) && installments >= 1 && installments <= 48) {
    try {
      const first = purchaseFirstInvoiceMonth(selectedCard, parsedDate, installments, paidInvoiceMonths(cardInvoices.data), today);
      purchaseText = purchaseNotice(first, selectedCard.name, today);
    } catch {
      purchaseText = null;
    }
  }
  if (cardPurchase && purchaseAmount !== null && purchaseAmount > 0 && purchaseAmount <= MAX_RECORD_CENTS && Number.isInteger(installments) && installments > 1 && installments <= 48) {
    const first = installmentAmounts(purchaseAmount, installments)[0]!;
    if (first >= 1) installmentsLine = installmentsNotice(installments, first);
  }

  const choosePayment = (next: 'dinheiro' | 'cartao') => {
    paymentTouched.current = true;
    setPayWith(next);
    setCardError(undefined);
    setBanner(null);
  };

  const formatAmountOnBlur = () => {
    const cents = parseBRL(draft.amountText);
    if (cents !== null && cents > 0 && cents <= MAX_RECORD_CENTS) setDraft((d) => ({ ...d, amountText: centsToInput(cents) }));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader
        title={mode.type === 'novo' ? copy.newTitle : copy.editTitle}
        onBack={requestCancel}
        right={<ContextPill label={`Salvando em ${contextName}`} />}
      />
      <Screen contentStyle={styles.body}>
        {noted ? (
          <Banner tone="sucesso" icon={Check}>
            <MoneyTxt variant="label" color={colors.successText} style={{ fontFamily: fonts.bold }}>
              {noted}
            </MoneyTxt>
          </Banner>
        ) : null}
        {conflict ? (
          <Banner tone="erro" icon={AlertCircle}>
            <Txt variant="label" color={colors.error}>
              {ERROR_TEXT.versao_desatualizada}
            </Txt>
            <MoneyTxt variant="caption">
              {`Versão atual: ${conflict.description} · ${formatBRL(conflict.amountCents)} · ${formatDateBR(conflict.occurredOn)}`}
            </MoneyTxt>
            <Txt variant="caption">Seu preenchimento foi mantido abaixo.</Txt>
            <Button label="Aplicar minhas alterações na versão atual" tone="soft" onPress={applyOverConflict} />
            <Button label="Descartar minhas alterações" tone="ghost" onPress={() => leave(goBack)} />
          </Banner>
        ) : null}

        {mode.type === 'editar' && mode.record.commitmentId ? (
          <Banner tone="info" icon={Info}>
            <Txt variant="label">
              Este gasto é o pagamento de uma conta a pagar. Mudar valor, data ou conta altera Pago; o valor previsto da conta a pagar não muda.
            </Txt>
          </Banner>
        ) : null}

        <Card style={{ gap: space[4] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            {cardPurchase ? `${CARDS_TEXT.screens.purchaseSituation} · ${selectedCard ? cardTitle(selectedCard) : CARDS_TEXT.expense.credit}` : `${copy.situation} · ${account?.name}`}
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

          {openSeriesBill ? (
            <Banner tone="info" icon={Info}>
              <Txt variant="label">
                Você tem a conta {openSeriesBill.description} de {billMonth} em aberto. Se este gasto é o pagamento dela, marque a conta como paga
                para não contar duas vezes.
              </Txt>
              <LinkButton
                label={`Abrir a conta de ${billMonth}`}
                style={styles.inlineLink}
                onPress={() => router.push(`/a-pagar/${openSeriesBill.id}`)}
              />
            </Banner>
          ) : null}

          {/* Dinheiro guardado não é gasto (D-027): a descrição lembra reserva, poupança, aporte etc. Só um lembrete, nada é bloqueado. */}
          {kind === 'despesa' && looksLikeSavings(draft.description) ? (
            <Banner tone="info" icon={Info} live={false}>
              <Txt variant="label">{GOALS_TEXT.savingsHint}</Txt>
              <LinkButton label={GOALS_TEXT.savingsHintLink} style={styles.inlineLink} onPress={() => router.navigate('/metas')} />
            </Banner>
          ) : null}

          {gapRow ? (
            <Banner tone="info" icon={Info}>
              <Txt variant="label">{RETURN_TEXT.dayGapHint(gapRow)}</Txt>
              <LinkButton label={RETURN_TEXT.backToReview} style={styles.inlineLink} onPress={requestCancel} />
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
          />
          <SumValues target={refs.amountText} onUse={(t) => set('amountText', t)} />

          {cardMode ? (
            <View style={{ gap: space[3] }}>
              <ChoiceGroup label={CARDS_TEXT.screens.payHow}>
                <Chip label={CARDS_TEXT.expense.cash} selected={payWith === 'dinheiro'} onPress={() => choosePayment('dinheiro')} />
                <Chip label={CARDS_TEXT.expense.credit} selected={payWith === 'cartao'} onPress={() => choosePayment('cartao')} />
              </ChoiceGroup>

              {payWith === 'cartao' ? (
                cards.isPending ? (
                  <Txt variant="label" color={colors.textSecondary}>
                    Carregando seus cartões…
                  </Txt>
                ) : cards.isError ? (
                  <Banner tone="erro" icon={AlertCircle}>
                    <Txt variant="label" color={colors.error}>
                      {ERROR_TEXT.carregar_falhou}
                    </Txt>
                    <Button label="Tentar novamente" tone="soft" onPress={() => cards.refetch()} />
                  </Banner>
                ) : activeCards.length === 0 ? (
                  <Banner tone="info" icon={Info} live={false}>
                    <Txt variant="label">{CARDS_TEXT.screens.noCardsInline}</Txt>
                    <Button
                      label={CARDS_TEXT.expense.registerCard}
                      tone="soft"
                      onPress={() => {
                        registering.current = activeCards.map((c) => c.id);
                        router.push({ pathname: '/cartoes/novo', params: { origem: 'gasto' } });
                      }}
                    />
                  </Banner>
                ) : (
                  <>
                    {activeCards.length > 1 ? (
                      <ChoiceGroup label={CARDS_TEXT.expense.chooseCard} error={cardError}>
                        {activeCards.map((c) => (
                          <Chip
                            key={c.id}
                            label={cardTitle(c)}
                            selected={selectedCard?.id === c.id}
                            onPress={() => {
                              paymentTouched.current = true;
                              setChosenCardId(c.id);
                              setCardError(undefined);
                            }}
                          />
                        ))}
                      </ChoiceGroup>
                    ) : null}
                    <TextField
                      ref={installmentsRef}
                      label={CARDS_TEXT.expense.installments}
                      value={installmentsText}
                      onChangeText={(t) => {
                        setInstallmentsText(t.replace(/\D/g, '').slice(0, 2));
                        setInstallmentsError(undefined);
                      }}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={2}
                      placeholder="1"
                      hint={CARDS_TEXT.expense.installmentsHint}
                      error={installmentsError}
                    />
                    {purchaseText || installmentsLine ? (
                      <Banner tone="info" icon={Info} live={false}>
                        {purchaseText ? <Txt variant="label">{purchaseText}</Txt> : null}
                        {installmentsLine ? (
                          <MoneyTxt variant="label" style={tabular}>
                            {installmentsLine}
                          </MoneyTxt>
                        ) : null}
                      </Banner>
                    ) : null}
                  </>
                )
              ) : null}
            </View>
          ) : null}

          {dayMode && dayMonth ? (
            <View style={{ gap: space[2] }}>
              <DayField
                inputRef={refs.dateText}
                month={dayMonth}
                kind={kind}
                value={dayText}
                onChange={(t) => {
                  setDayText(t);
                  if (errors.dateText) setErrors((e) => ({ ...e, dateText: undefined }));
                }}
                error={errors.dateText}
              />
              <LinkButton
                label={RETURN_TEXT.otherDate}
                style={styles.inlineLink}
                onPress={() => {
                  // A data do dia já digitado (ou a de hoje) passa para o campo de data comum.
                  if (day && 'date' in day) set('dateText', formatDateBR(day.date));
                  setDayMode(false);
                  setErrors((e) => ({ ...e, dateText: undefined }));
                }}
              />
            </View>
          ) : (
            <View style={{ gap: space[2] }}>
              <TextField
                ref={refs.dateText}
                label={cardPurchase ? CARDS_TEXT.screens.purchaseDateLabel : copy.dateLabel}
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
            </View>
          )}

          {personal.accounts.length > 1 && !cardPurchase ? (
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

          {cardPurchase ? (
            <Txt variant="label" color={colors.textSecondary}>
              Será salvo em <Txt variant="label" style={{ fontFamily: fonts.bold }}>{contextName}</Txt>, na fatura do cartão. {CARDS_TEXT.screens.cardPurchaseNote}
            </Txt>
          ) : (
            <Txt variant="label" color={colors.textSecondary}>
              Será salvo em <Txt variant="label" style={{ fontFamily: fonts.bold }}>{contextName}</Txt>, {account?.name}.
            </Txt>
          )}
        </Card>

        <LinkButton label="Como este registro entra no mês?" color={colors.textSecondary} onPress={() => router.push(explanationHref('diferenca'))} />
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
          {dayMode ? (
            // Modo "Dia": "Salvar e anotar outro" mantém o formulário (tipo, conta e mês); "Salvar" volta à revisão.
            <View style={styles.footerRow}>
              <Button
                label={RETURN_TEXT.saveAndAnother}
                tone="soft"
                disabled={busy}
                onPress={() => submit(undefined, true)}
                style={styles.save}
              />
              <Button
                label={banner && !conflict ? 'Tentar novamente' : RETURN_TEXT.save}
                busy={busy}
                busyLabel="Salvando…"
                onPress={() => submit()}
                style={styles.save}
              />
            </View>
          ) : (
            <View style={styles.footerRow}>
              <Button label="Cancelar" tone="ghost" onPress={requestCancel} style={styles.cancel} />
              <Button
                label={banner && !conflict ? 'Tentar novamente' : cardPurchase ? CARDS_TEXT.expense.save : copy.save}
                busy={busy}
                busyLabel="Salvando…"
                onPress={() => submit()}
                style={styles.save}
              />
            </View>
          )}
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

/**
 * Campo "Dia" do modo "Dia": só o dia, com o mês fechado como sufixo ("/06/2026"), dica e erro ligados ao campo (o
 * erro é anunciado ao aparecer, como nos campos de texto).
 */
function DayField({
  inputRef,
  month,
  kind,
  value,
  onChange,
  error,
}: {
  inputRef: React.RefObject<TextInput | null>;
  month: IsoMonth;
  kind: RecordKind;
  value: string;
  onChange: (text: string) => void;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const id = useId().replace(/:/g, '');
  const hint = RETURN_TEXT.dayHint(kind, month);
  const aria = { 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-erro` : `${id}-dica` } as object;
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {RETURN_TEXT.dayLabel}
      </Txt>
      {/* A caixa toda leva o foco ao campo (o dia é só 1 ou 2 algarismos); sem papel próprio para o leitor de tela. */}
      <Pressable
        accessible={false}
        tabIndex={-1}
        onPress={() => inputRef.current?.focus()}
        style={[ui.input, focused && ui.inputFocused, error ? ui.inputError : null]}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={`${RETURN_TEXT.dayLabel} de ${formatMonthYearBR(month)}`}
          accessibilityHint={error ?? hint}
          value={value}
          onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 2))}
          placeholder="DD"
          placeholderTextColor={colors.placeholder}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={2}
          {...aria}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.dayInput}
        />
        <Txt color={colors.textSecondary} style={tabular} accessibilityElementsHidden importantForAccessibility="no">
          {RETURN_TEXT.daySuffix(month)}
        </Txt>
      </Pressable>
      {error ? (
        <Animated.View entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}>
          <Txt variant="label" color={colors.error} accessibilityLiveRegion="polite" accessibilityRole="alert" nativeID={`${id}-erro`}>
            {error}
          </Txt>
        </Animated.View>
      ) : (
        <Txt variant="caption" color={colors.textSecondary} nativeID={`${id}-dica`}>
          {hint}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  // Só o dia (2 algarismos), alinhado à direita, colado ao sufixo "/06/2026"; alvo de pelo menos 44 px.
  dayInput: {
    width: 44,
    minWidth: 44,
    alignSelf: 'stretch',
    paddingVertical: space[3],
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    outlineStyle: 'none',
  } as object,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3], paddingHorizontal: space[5] },
  footerInner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space[3] },
  footerRow: { flexDirection: 'row', gap: space[3], alignItems: 'center' },
  cancel: { alignSelf: 'auto', flexGrow: 0 },
  save: { alignSelf: 'auto', flex: 1 },
});
