import {
  ANNUAL_HELP_TEXT,
  CALC_UI_TEXT,
  CATEGORIES,
  DESCRIPTION_MAX,
  INSTALLMENT_NATURES,
  MAX_RECORD_CENTS,
  NO_CATEGORY_LABEL,
  SERIES_ERROR_TEXT,
  SERIES_NATURE_LABEL,
  addMonths,
  affectedByEditFrom,
  annualStartChoices,
  annualYearOf,
  calcLinkParams,
  centsToInput,
  charCount,
  fieldForErrorCode,
  findSeriesConflicts,
  firstMonthBounds,
  firstMonthChoices,
  firstMonthRangeText,
  formatDateBR,
  formatMonthInputBR,
  formatMonthName,
  formatMonthYearBR,
  isRepoError,
  maskMonthBR,
  monthOf,
  newOperationKey,
  parseBRL,
  parseCount,
  seriesErrorText,
  seriesPreview,
  validateSeriesDraft,
  type AmountMode,
  type AnnualStartChoice,
  type IsoDate,
  type IsoMonth,
  type PersonalSpace,
  type SeriesDraft,
  type SeriesField,
  type SeriesFieldErrors,
  type SeriesInput,
  type SeriesKind,
  type SeriesNature,
  type SeriesWrite,
} from '@clarevo/core';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Calculator, Check, Info } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import {
  ChoiceGroup,
  joinList,
  lastYearHint,
  MONTH_FULL,
  MONTH_SHORT,
  monthChipLabel,
  seriesStyles as styles,
  yearA11y,
  yearA11yLabel,
} from '@/components/series-parts';
import { SumValues } from '@/components/sum-values';
import { TermHint } from '@/components/term-hint';
import { TopicLink } from '@/components/topic-link';
import { Banner, Button, Card, Chip, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { explanationHref } from '@/lib/learn';
import { useCommitments, useCreateSeries, useMonthRecords, useSeriesList, useSeriesOperationKey, useUpdateSeriesFrom } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * Preenchimento vindo de outra tela: "Com que frequência?", "Repetir todo mês", "Repetir todo ano", "Tornar gasto fixo"
 * ou "Mudar a forma de pagamento" (conta do ano).
 */
export interface SeriesPrefill {
  description?: string;
  amountCents?: number;
  category?: string | null;
  dueDay?: number;
  firstMonth?: IsoMonth;
  /** "Tornar gasto fixo": data do gasto anotado que serviu de base. */
  basedOn?: IsoDate;
  /** Conta do ano: parcelas por ano (1 = cota única). */
  partsPerYear?: number;
  /** Conta do ano: mês da 1ª parcela do ano (1 a 12). */
  month?: number;
  /** Conta do ano: primeiro ano (o chip desse ano abre escolhido). */
  startYear?: number;
  amountMode?: AmountMode;
  /** "Mudar a forma de pagamento": rótulo do último ano da conta do ano encerrada. */
  endedYear?: string;
  /**
   * "Mudar a forma de pagamento": primeiro mês aceito para a nova conta do ano (o seguinte ao último vencimento da
   * encerrada). Os chips de início antes dele não aparecem: as duas contas do ano nunca criam contas no mesmo mês.
   */
  notBefore?: IsoMonth;
  /** Parcelamento ("Anotar como parcelamento" da calculadora): total de parcelas (2 a 480). */
  installmentTotal?: number;
  /** Parcelamento: tipo escolhido (compra parcelada, financiamento ou outro). */
  nature?: SeriesNature;
}

/** Descrição que sugere cartão ou fatura: parcelas do cartão já entram na fatura. */
const INVOICE_HINT = /\bfatura\b|cart[aã]o/i;

/** Primeira conta: o padrão (primeiro vencimento a partir de hoje), um dos chips ou "Outro mês" (campo MM/AAAA). */
type MonthPick = 'auto' | 'outro' | IsoMonth;

/**
 * Início da conta do ano: o padrão (primeiro vencimento a partir de hoje) ou o ano escolhido (ano civil da 1ª parcela do
 * ano) e a parcela (1, ou a próxima a pagar num ano já começado). O ano escolhido continua o mesmo quando o mês ou o
 * número de parcelas muda; se ele não couber mais, a tela diz por quê e não troca de ano sozinha.
 */
type AnnualStart = 'auto' | { year: number; part: number };

/** Trocar o mês ou o número de parcelas mantém o ano escolhido; a parcela de um ano já começado volta ao padrão. */
const keepYear = (st: AnnualStart): AnnualStart => (st === 'auto' || st.part === 1 ? st : 'auto');

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
const structureOf = (i: SeriesInput) => JSON.stringify([i.kind, i.firstDueMonth, i.firstNumber, i.installmentTotal, i.partsPerYear, i.lastMonth]);

/** Chave de um chip de início da conta do ano. */
const startKey = (c: Pick<AnnualStartChoice, 'firstDueMonth' | 'firstNumber'>) => `${c.firstDueMonth}|${c.firstNumber}`;

/** Faixa de "Mudar a forma de pagamento", com o último ano da conta do ano encerrada. */
const endedText = (year: string) => `Conta do ano encerrada em ${year}. Agora cadastre a nova forma de pagamento, a partir do ano seguinte.`;

/** Texto da faixa depois de salvar: o da prévia na conta do ano; nos outros, savedText(w). */
function savedTextFor(w: SeriesWrite, input: SeriesInput | null, today: IsoDate): string {
  if (w.series.kind !== 'anual') return savedText(w);
  return (input ? seriesPreview(input, today).savedText : null) ?? 'Conta do ano salva.';
}

/**
 * Novo gasto fixo ("Todo mês"), parcelamento ou conta do ano ("Todo ano", D-029). Mesmos cuidados do formulário de conta
 * a pagar: rascunho preservado, chave por conteúdo, reconciliação depois de rede incerta, confirmação ao sair e rodapé fixo.
 * As regras e a ordem de validação são as do banco (validateSeriesDraft).
 */
export function SeriesForm({
  kind: initialKind,
  prefill,
  typed = false,
  space: personal,
}: {
  kind: SeriesKind;
  prefill?: SeriesPrefill;
  /** O preenchimento veio do que a pessoa digitou em "Anotar conta a pagar": sair sem salvar pede confirmação. */
  typed?: boolean;
  space: PersonalSpace;
}) {
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

  // O inicial já inclui o preenchimento da rota: abrir preenchido e sair sem mexer não pede confirmação. Exceção: o que
  // a pessoa digitou em "Anotar conta a pagar" (typed) se perderia ao sair, então conta como alteração (blank).
  const initialFor = (p: SeriesPrefill) => {
    const first = p.firstMonth;
    const annualStart = initialKind === 'anual';
    const monthPick: MonthPick = annualStart || !first ? 'auto' : chipMonths.includes(first) ? first : 'outro';
    const parts = p.partsPerYear !== undefined && p.partsPerYear >= 2 && p.partsPerYear <= 12 ? p.partsPerYear : null;
    const draft: SeriesDraft = {
      kind: initialKind,
      nature: initialKind === 'parcelada' && p.nature && INSTALLMENT_NATURES.includes(p.nature) ? p.nature : null,
      description: p.description ?? '',
      amountText: p.amountCents ? centsToInput(p.amountCents) : '',
      // Conta do ano: por padrão o valor muda de um ano para outro (IPVA, IPTU).
      amountMode: p.amountMode ?? (annualStart ? 'variavel' : 'fixo'),
      dueDayText: p.dueDay ? String(p.dueDay) : '',
      firstMonthText: !annualStart && monthPick === 'outro' && first ? formatMonthInputBR(first) : '',
      firstNumberText: '',
      installmentTotalText:
        initialKind === 'parcelada' && p.installmentTotal !== undefined && p.installmentTotal >= 2 && p.installmentTotal <= 480 ? String(p.installmentTotal) : '',
      partsPerYearText: parts ? String(parts) : '',
      lastMonthText: '',
      category: p.category ?? null,
    };
    // Conta do ano: mês (1 a 12) e primeiro ano vindos da rota.
    const month = p.month ?? (first ? Number(first.slice(5, 7)) : null);
    const year = p.startYear ?? (first ? Number(first.slice(0, 4)) : null);
    const annual: { inParts: boolean; month: number | null; start: AnnualStart } = {
      inParts: parts !== null,
      month: month !== null && month >= 1 && month <= 12 ? month : null,
      start: month !== null && year !== null ? { year, part: 1 } : 'auto',
    };
    return { draft, monthPick, ending: false, annual };
  };
  const initial = useMemo(() => initialFor(prefill ?? {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  const blank = useMemo(() => (typed ? initialFor({}) : initial), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<SeriesDraft>(initial.draft);
  const [monthPick, setMonthPick] = useState<MonthPick>(initial.monthPick);
  /** Todo mês e todo ano: "Termina em…" escolhido. */
  const [ending, setEnding] = useState(initial.ending);
  /** Todo ano: "Em parcelas no ano", mês da 1ª parcela (1 a 12) e chip de início ("auto" = o padrão). */
  const [annual, setAnnual] = useState(initial.annual);
  /** A pessoa escolheu se o valor muda: trocar de frequência não muda mais o padrão. */
  const modeTouched = useRef(prefill?.amountMode !== undefined);
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
    partsPerYearText: useRef<TextInput>(null),
    firstNumberText: useRef<TextInput>(null),
    lastMonthText: useRef<TextInput>(null),
  } satisfies Partial<Record<SeriesField, React.RefObject<TextInput | null>>>;

  const parcelada = draft.kind === 'parcelada';
  const anual = draft.kind === 'anual';
  const dirty = JSON.stringify({ draft, monthPick, ending, annual }) !== JSON.stringify(blank);

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

  /** "Com que frequência?": a conta do ano começa com "Sim, muda todo ano"; as outras, com valor fixo (até a pessoa escolher). */
  const setKind = (k: SeriesKind) => {
    setDraft((d) => ({ ...d, kind: k, amountMode: modeTouched.current ? d.amountMode : k === 'anual' ? 'variavel' : 'fixo' }));
    setErrors({});
  };

  const setAnnualField = <K extends keyof typeof annual>(k: K, v: (typeof annual)[K]) => {
    // Mês e forma de pagamento mudam as parcelas: o ano escolhido fica, a parcela de um ano já começado volta ao padrão.
    setAnnual((a) => ({ ...a, [k]: v, ...(k === 'start' ? {} : { start: keepYear(a.start) }) }));
    setErrors((e) => ({ ...e, firstMonthText: undefined, firstNumberText: undefined, partsPerYearText: k === 'inParts' ? undefined : e.partsPerYearText }));
  };

  /** Chip de início tocado: o ano civil da 1ª parcela daquele ano e a parcela escolhida. */
  const pickStart = (c: Pick<AnnualStartChoice, 'firstDueMonth' | 'firstNumber'>) =>
    setAnnualField('start', { year: Number(addMonths(c.firstDueMonth, -(c.firstNumber - 1)).slice(0, 4)), part: c.firstNumber });

  // Primeira conta: com o dia válido, os chips mostram o vencimento; o padrão acompanha o dia até a pessoa escolher.
  const day = validDay(draft.dueDayText);
  const choices = firstMonthChoices(day ?? 1, today);
  const defaultMonth = day === null ? currentMonth : (choices.find((c) => c.isDefault)?.month ?? currentMonth);

  // Conta do ano: parcelas por ano, chips de início (anos e, num ano já começado, a próxima parcela a pagar).
  const partsTyped = /^\s*\d{1,2}\s*$/.test(draft.partsPerYearText) ? Number(draft.partsPerYearText.trim()) : null;
  const k = annual.inParts ? partsTyped : 1;
  const kOk = k !== null && k >= 1 && k <= 12 && (!annual.inParts || k >= 2);
  const startChoices = anual && kOk && annual.month !== null && day !== null ? annualStartChoices(k!, annual.month, day, today) : null;
  // "Mudar a forma de pagamento": só inícios depois do último vencimento da conta do ano encerrada.
  const notBefore = prefill?.notBefore ?? null;
  const fits = (c: AnnualStartChoice) => notBefore === null || c.firstDueMonth >= notBefore;
  const yearChips = startChoices ? startChoices.years.filter(fits) : [];
  const startedParts = startChoices?.started ? startChoices.started.parts.filter(fits) : [];
  const startedGroup = startChoices?.started && startedParts.length > 0 ? startChoices.started : null;
  const allStarts = [...yearChips, ...startedParts];
  // Padrão: o primeiro vencimento a partir de hoje entre os chips mostrados (sem chips depois de hoje, o último).
  const byDue = [...allStarts].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const autoStart = byDue.find((c) => c.dueOn >= today) ?? byDue[byDue.length - 1] ?? null;
  const chosenStart = annual.start === 'auto' ? null : annual.start;
  const mm = annual.month === null ? null : String(annual.month).padStart(2, '0');
  /** 1º mês do ano escolhido e o mês da parcela escolhida (num ano já começado, a próxima a pagar). */
  const chosenYearMonth: IsoMonth | null = chosenStart && mm ? `${chosenStart.year}-${mm}` : null;
  const chosenMonth = chosenStart && chosenYearMonth ? addMonths(chosenYearMonth, chosenStart.part - 1) : null;
  const start = chosenStart
    ? (allStarts.find((c) => chosenMonth !== null && startKey(c) === startKey({ firstDueMonth: chosenMonth, firstNumber: chosenStart.part })) ?? null)
    : autoStart;
  /** Ano escolhido (ou vindo de outra tela) sem chip: o motivo, sem trocar de ano sozinho. */
  const startMissing = (() => {
    if (!startChoices || start || k === null) return null;
    const afterEnded =
      notBefore !== null
        ? `A conta do ano encerrada vai até ${formatMonthYearBR(addMonths(notBefore, -1))}. Escolha um primeiro ano com vencimento depois disso.`
        : null;
    // Sem escolha e sem chip possível (só com o filtro da conta do ano encerrada).
    if (!chosenStart || !chosenYearMonth || !chosenMonth) return afterEnded ?? firstMonthRangeText(today, 'anual');
    const label = annualYearOf({ kind: 'anual', firstDueMonth: chosenYearMonth, firstNumber: 1, partsPerYear: k }, 1).label;
    const { min, max } = firstMonthBounds(today, 'anual');
    if (afterEnded && notBefore !== null && chosenMonth < notBefore) return afterEnded;
    if (chosenMonth > max) return `O primeiro ano ${label} só pode ser cadastrado a partir de ${formatMonthYearBR(addMonths(chosenMonth, -23))}.`;
    if (chosenMonth < min) return `Não é possível começar em ${label}: ${k === 1 ? 'a conta venceu' : 'a primeira parcela venceu'} em ${formatMonthYearBR(chosenMonth)}. Escolha outro ano.`;
    return firstMonthRangeText(today, 'anual');
  })();

  const firstMonthText = anual
    ? start
      ? formatMonthInputBR(start.firstDueMonth)
      : ''
    : monthPick === 'auto'
      ? formatMonthInputBR(defaultMonth)
      : monthPick === 'outro'
        ? draft.firstMonthText
        : formatMonthInputBR(monthPick);
  const effective: SeriesDraft = {
    ...draft,
    firstMonthText,
    firstNumberText: anual ? (start ? String(start.firstNumber) : '') : draft.firstNumberText,
    partsPerYearText: anual ? (annual.inParts ? draft.partsPerYearText : '1') : '',
    lastMonthText: !parcelada && ending ? draft.lastMonthText : '',
  };
  const checked = validateSeriesDraft(effective, today);
  // Conta do ano: sem mês, ou "Em parcelas" com menos de 2, não há prévia (o salvar mostra o erro).
  const annualReady = !anual || (annual.month !== null && kOk);
  const preview = checked.ok && annualReady ? seriesPreview(checked.input, today) : null;

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

  /** Rótulo do primeiro ano da conta do ano na prévia ("2027" ou "2026/2027"). */
  // Conta do ano: "Começar em 2028" só aparece se o ano seguinte tem chip (dentro da faixa aceita).
  const canStartNext =
    !anual ||
    (conflicts !== null &&
      allStarts.some((c) => startKey(c) === startKey({ firstDueMonth: conflicts.suggestedFirstMonth, firstNumber: conflicts.suggestedFirstNumber ?? 1 })));

  const firstYearLabel =
    anual && preview && k !== null
      ? annualYearOf({ kind: 'anual', firstDueMonth: preview.firstMonth, firstNumber: preview.firstNumber, partsPerYear: k }, preview.firstNumber).label
      : '';

  /**
   * "Começar em novembro": o mês seguinte. No parcelamento, também a parcela seguinte: a conta ou o gasto do primeiro
   * mês já é aquela parcela, e a numeração não pode ficar um número atrás. Conta do ano: o ano seguinte, desde a parcela 1.
   */
  const startNext = () => {
    if (!conflicts) return;
    if (anual) {
      pickStart({ firstDueMonth: conflicts.suggestedFirstMonth, firstNumber: conflicts.suggestedFirstNumber ?? 1 });
      return;
    }
    if (conflicts.suggestedFirstNumber !== null) set('firstNumberText', String(conflicts.suggestedFirstNumber));
    pickMonth(conflicts.suggestedFirstMonth);
  };

  /** Ordem visual dos campos: o foco vai para o primeiro erro com campo de texto na tela. */
  const visualOrder: SeriesField[] = parcelada
    ? ['description', 'nature', 'amountText', 'dueDayText', 'installmentTotalText', 'firstNumberText', 'firstMonthText']
    : anual
      ? ['description', 'partsPerYearText', 'dueDayText', 'amountText', 'firstMonthText', 'firstNumberText', 'lastMonthText']
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

  const finish = (w: SeriesWrite, input: SeriesInput | null) => {
    // Confirmação tátil só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flash.set(savedTextFor(w, input, today));
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
    if (saved.snapshot === snapshot) {
      keys.settled();
      finish({ series, occurrences, changed: 0 }, input);
      return true;
    }
    // O período não muda por edição, e uma primeira conta já paga não muda mais: mostrar o que foi salvo,
    // sem aplicar nada em silêncio.
    const savedInput = JSON.parse(saved.snapshot) as SeriesInput;
    const plan = affectedByEditFrom(occurrences, series, series.firstNumber);
    if (structureOf(savedInput) !== structureOf(input) || !plan.ok) {
      keys.settled();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const what = series.kind === 'parcelada' ? 'Parcelamento salvo' : series.kind === 'anual' ? 'Conta do ano salva' : 'Gasto fixo salvo';
      flash.set(`${what} antes da falha de conexão, com o preenchimento do primeiro envio. Confira abaixo.`);
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
    finish(w, input);
    return true;
  };

  /** Erros que só o formulário conhece (o banco recusaria com outro código ou nem chegaria a receber). */
  const formErrors = (): SeriesFieldErrors => {
    const errs: SeriesFieldErrors = {};
    if (anual) {
      if (annual.month === null) errs.firstMonthText = annual.inParts ? 'Escolha o mês da primeira parcela.' : 'Escolha o mês do vencimento.';
      if (annual.inParts && (partsTyped === null || partsTyped < 2 || partsTyped > 12)) errs.partsPerYearText = SERIES_ERROR_TEXT.parcelas_no_ano_invalidas;
      // O ano escolhido não cabe: nunca salvar em outro ano sem a pessoa escolher.
      if (startMissing) errs.firstMonthText = startMissing;
    }
    // "Termina em…" sem o mês (ou o ano): sem esta conferência, seria salvo sem término.
    if (!parcelada && ending && draft.lastMonthText.trim() === '') {
      errs.lastMonthText = anual ? 'Informe o último ano, como 2030.' : 'Informe o último mês, como 12/2026.';
    }
    return errs;
  };

  const submit = async () => {
    if (busy) return; // envio repetido bloqueado enquanto o anterior não termina
    const v = validateSeriesDraft(effective, today);
    const own = formErrors();
    if (!v.ok || Object.keys(own).length > 0) {
      const errs: SeriesFieldErrors = v.ok ? {} : { ...v.errors };
      // Conta do ano sem mês ou dia: o início não existe ainda; o erro aparece no mês, no dia ou nas parcelas.
      if (anual && !start) {
        delete errs.firstMonthText;
        delete errs.firstNumberText;
      }
      Object.assign(errs, own);
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
        finish(saved, v.input);
      } catch (e) {
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          keys.refused();
          setRetry(false);
          const field = fieldForErrorCode(e.code, 'series');
          if (field && visualOrder.includes(field)) {
            const errs = { [field]: seriesErrorText(e.code, today, draft.kind) };
            setErrors(errs);
            focusFirst(errs);
            return;
          }
          setBanner(seriesErrorText(e.code, today, draft.kind));
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
      setBanner(
        isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido' ? seriesErrorText(e.code, today, draft.kind) : SERIES_ERROR_TEXT.salvar_falhou,
      );
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

  const setMode = (m: AmountMode) => {
    modeTouched.current = true;
    set('amountMode', m);
  };
  const variable = draft.amountMode === 'variavel';
  const looksLikeCard = INVOICE_HINT.test(draft.description);
  const firstMonthName = preview ? (anual ? firstYearLabel : formatMonthName(preview.firstMonth)) : '';
  const showCommitmentConflict = Boolean(conflicts?.texts.commitment && preview && !kept.includes(preview.firstMonth));
  const amountLabel = variable
    ? 'Valor de referência'
    : parcelada
      ? 'Valor da parcela'
      : anual
        ? annual.inParts
          ? 'Valor de cada parcela'
          : 'Valor da conta'
        : 'Valor por mês';
  const saveLabel = parcelada ? 'Salvar parcelamento' : anual ? 'Salvar conta do ano' : 'Salvar gasto fixo';
  const title = parcelada ? 'Novo parcelamento' : anual ? 'Nova conta do ano' : 'Novo gasto fixo';

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

  const descriptionField = (
    <TextField
      ref={refs.description}
      label="Descrição"
      value={draft.description}
      onChangeText={(t) => set('description', t)}
      placeholder={parcelada ? 'Ex.: Financiamento do carro' : anual ? 'Ex.: IPVA' : 'Ex.: Aluguel'}
      maxLength={DESCRIPTION_MAX}
      autoFocus={!prefill?.description}
      error={errors.description}
      hint={
        charCount(draft.description) >= 60
          ? `${charCount(draft.description)} de ${DESCRIPTION_MAX} caracteres`
          : parcelada
            ? 'Ex.: Financiamento do carro, Parcelas do imóvel'
            : anual
              ? 'Ex.: IPVA, IPTU, Matrícula, Material escolar, Seguro do carro. Não é preciso citar pessoas.'
              : 'Ex.: Aluguel, Escola, Luz, Internet. Nomes curtos bastam; não é preciso citar pessoas.'
      }
      returnKeyType="next"
      onSubmitEditing={() => refs.amountText.current?.focus()}
    />
  );

  /**
   * "Parcelado ou à vista? Fazer a conta" (chip Parcelado): abre a calculadora com o valor da parcela e o número de
   * parcelas já digitados (só os válidos). Nada deste formulário muda; ele continua aberto ao voltar.
   */
  const openInstallmentCalc = () => {
    const parcela = parseBRL(draft.amountText);
    const parcelas = parseCount(draft.installmentTotalText, 2, 480);
    const params = calcLinkParams('parcelado-ou-a-vista', {
      parcelaCents: parcela !== null && parcela > 0 && parcela <= MAX_RECORD_CENTS ? parcela : undefined,
      parcelas: parcelas.ok ? parcelas.value : undefined,
    });
    router.push({ pathname: '/calcular/[slug]', params: { slug: 'parcelado-ou-a-vista', ...params } });
  };

  const amountField = (
    <>
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
        hint={
          variable
            ? anual
              ? `Use o valor do último ano. Ele aparece como estimado até você informar o valor do ano. ${annual.inParts ? ANNUAL_HELP_TEXT.amountExampleParts : ANNUAL_HELP_TEXT.amountExampleSingle}`
              : 'Use o valor de uma conta recente. Ele aparece como estimado até você informar o valor de cada conta.'
            : anual
              ? annual.inParts
                ? ANNUAL_HELP_TEXT.amountExampleParts
                : ANNUAL_HELP_TEXT.amountExampleSingle
              : undefined
        }
      />
      <SumValues target={refs.amountText} onUse={(t) => set('amountText', t)} />
      {variable && !anual ? (
        <LinkButton label="Contas que mudam de valor" style={styles.inlineLink} onPress={() => router.push(explanationHref('estimativa'))} />
      ) : null}
    </>
  );

  const dayField = (
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
      hint={
        day !== null && day >= 29
          ? 'Nos meses mais curtos, vence no último dia do mês.'
          : anual
            ? `De 1 a 31. ${ANNUAL_HELP_TEXT.dayExample}`
            : 'De 1 a 31.'
      }
    />
  );

  // Conta do ano que atravessa dezembro: o último ano é o do começo do período ("2027" para 2027/2028).
  const annualLastYearHint =
    anual && annual.month !== null && k !== null ? lastYearHint(annual.month, k, chosenStart?.year ?? Number(today.slice(0, 4))) : null;

  const endingBlock = !parcelada ? (
    <View style={{ gap: space[2] }}>
      <ChoiceGroup label="Até quando?" hint={anual ? 'Útil quando você vai vender o carro ou o imóvel.' : 'Útil para escola, curso ou contrato com prazo.'}>
        <Chip label="Sem data para terminar" selected={!ending} onPress={() => setEnding(false)} />
        <Chip label="Termina em…" selected={ending} onPress={() => setEnding(true)} />
      </ChoiceGroup>
      {ending ? (
        <TextField
          ref={refs.lastMonthText}
          label={anual ? 'Último ano (AAAA)' : 'Último mês (MM/AAAA)'}
          value={draft.lastMonthText}
          onChangeText={(t) => set('lastMonthText', anual ? t.replace(/\D/g, '').slice(0, 4) : maskMonthBR(t))}
          placeholder={anual ? 'AAAA' : 'MM/AAAA'}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={anual ? 4 : 7}
          error={errors.lastMonthText}
          hint={(anual ? annualLastYearHint : null) ?? 'Digite só os números.'}
        />
      ) : null}
    </View>
  ) : null;

  const startError = errors.firstNumberText ?? (annual.month !== null ? errors.firstMonthText : undefined);
  // O motivo de um ano sem chip aparece na hora, antes de salvar.
  const startErrorShown = startMissing ?? startError;

  /** Todo ano: forma, parcelas, mês, dia, modo, valor, primeiro ano (ou próxima parcela) e término (seção 1.7). */
  const annualFields = (
    <>
      <ChoiceGroup label="Como você paga?" hint={ANNUAL_HELP_TEXT.howPaysHint}>
        <Chip label="Uma vez no ano (cota única)" selected={!annual.inParts} onPress={() => setAnnualField('inParts', false)} />
        <Chip label="Em parcelas no ano" selected={annual.inParts} onPress={() => setAnnualField('inParts', true)} />
      </ChoiceGroup>

      {annual.inParts ? (
        <TextField
          ref={refs.partsPerYearText}
          label="Quantas parcelas por ano?"
          value={draft.partsPerYearText}
          onChangeText={(t) => {
            set('partsPerYearText', t.replace(/\D/g, '').slice(0, 2));
            setAnnual((a) => ({ ...a, start: keepYear(a.start) }));
            setErrors((e) => ({ ...e, firstMonthText: undefined, firstNumberText: undefined }));
          }}
          placeholder="Ex.: 10"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={2}
          error={errors.partsPerYearText}
          hint="As parcelas vencem em meses seguidos, como um IPTU de fevereiro a novembro. Parcelas no cartão já entram na fatura: anote aqui só carnê, boleto ou débito."
        />
      ) : null}

      <ChoiceGroup
        label={annual.inParts ? 'Mês da primeira parcela' : 'Mês do vencimento'}
        hint={annual.inParts ? ANNUAL_HELP_TEXT.monthHintParts : ANNUAL_HELP_TEXT.monthHintSingle}
        error={annual.month === null ? errors.firstMonthText : undefined}>
        {MONTH_SHORT.map((m, i) => (
          <Chip
            key={m}
            label={m}
            accessibilityLabel={MONTH_FULL[i]}
            compact
            style={styles.monthChip}
            selected={annual.month === i + 1}
            onPress={() => setAnnualField('month', i + 1)}
          />
        ))}
      </ChoiceGroup>

      {dayField}

      <ChoiceGroup label="O valor muda de um ano para outro?" hint={variable ? ANNUAL_HELP_TEXT.changesHint : ANNUAL_HELP_TEXT.sameHint}>
        <Chip label="Sim, muda todo ano (como IPVA e IPTU)" selected={variable} onPress={() => setMode('variavel')} />
        <Chip label="Não, é sempre o mesmo" selected={!variable} onPress={() => setMode('fixo')} />
      </ChoiceGroup>
      <TermHint term="Valor que muda" slug="estimativa" />

      {amountField}

      {startChoices ? (
        <>
          {yearChips.length > 0 ? (
            <ChoiceGroup label="Primeiro ano" hint={ANNUAL_HELP_TEXT.firstYearHint} error={startedGroup ? undefined : startErrorShown}>
              {yearChips.map((c) => (
                <Chip
                  key={startKey(c)}
                  label={c.label}
                  accessibilityLabel={yearA11y(c.label)}
                  selected={start !== null && startKey(start) === startKey(c)}
                  onPress={() => pickStart(c)}
                />
              ))}
            </ChoiceGroup>
          ) : !startedGroup ? (
            // Nenhum ano cabe (por exemplo, a nova forma de pagamento começaria longe demais): só o motivo.
            <View style={{ gap: space[2] }}>
              <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                Primeiro ano
              </Txt>
              <Txt variant="label" color={colors.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
                {startErrorShown ?? firstMonthRangeText(today, 'anual')}
              </Txt>
            </View>
          ) : null}
          {startedGroup ? (
            <ChoiceGroup label={startedGroup.title} hint={startedGroup.hint} error={startErrorShown}>
              {startedParts.map((c) => (
                <Chip
                  key={startKey(c)}
                  label={c.label}
                  selected={start !== null && startKey(start) === startKey(c)}
                  onPress={() => pickStart(c)}
                />
              ))}
            </ChoiceGroup>
          ) : null}
        </>
      ) : (
        <View style={{ gap: space[2] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            Primeiro ano
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {annual.inParts ? 'Informe as parcelas, o mês e o dia para escolher o primeiro ano.' : 'Escolha o mês e o dia para escolher o primeiro ano.'}
          </Txt>
        </View>
      )}

      {preview?.firstOverdue ? (
        <Banner tone="info" icon={Info}>
          <Txt variant="label">Esta conta já venceu. Ela vai aparecer em Vencidas até você marcar como paga.</Txt>
        </Banner>
      ) : null}

      {endingBlock}
    </>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={title} onBack={requestCancel} right={<ContextPill label={`Salvando em ${contextName}`} />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        {prefill?.endedYear ? (
          <Banner tone="sucesso" icon={Check}>
            <Txt
              variant="label"
              color={colors.successText}
              style={{ fontFamily: fonts.bold }}
              accessibilityLabel={yearA11yLabel(endedText(prefill.endedYear))}>
              {endedText(prefill.endedYear)}
            </Txt>
          </Banner>
        ) : null}
        {prefill?.basedOn ? (
          <Banner tone="info" icon={Info} live={false}>
            <Txt variant="label">
              Baseado no gasto de {formatDateBR(prefill.basedOn)}. Esse gasto continua como está; o gasto fixo começa no próximo vencimento.
            </Txt>
          </Banner>
        ) : null}

        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label="Com que frequência?">
            <Chip label="Todo mês" selected={draft.kind === 'mensal'} onPress={() => setKind('mensal')} />
            <Chip label="Todo ano" selected={anual} onPress={() => setKind('anual')} />
            <Chip label="Parcelado" selected={parcelada} onPress={() => setKind('parcelada')} />
          </ChoiceGroup>

          {anual ? (
            <Banner tone="info" icon={Info} live={false}>
              <Txt variant="label">{ANNUAL_HELP_TEXT.intro}</Txt>
              <TopicLink slug="contas-do-ano" label={ANNUAL_HELP_TEXT.whatIsThis} style={styles.inlineLink} />
            </Banner>
          ) : null}

          {descriptionField}

          {looksLikeCard ? (
            <Banner tone="info" icon={Info}>
              <Txt variant="label">
                Parcelas de compras no cartão já entram na fatura. Para não contar duas vezes, anote aqui só parcelamentos em boleto, débito ou
                financiamento.
              </Txt>
              <LinkButton label="Fatura sem contar duas vezes" style={styles.inlineLink} onPress={() => router.push(explanationHref('fatura'))} />
            </Banner>
          ) : null}

          {anual ? (
            annualFields
          ) : (
            <>
              {parcelada ? (
                <>
                  <ChoiceGroup label="Tipo do parcelamento" hint="Os dois primeiros contam como dívida na renda comprometida." error={errors.nature}>
                    {INSTALLMENT_NATURES.map((n) => (
                      <Chip key={n} label={SERIES_NATURE_LABEL[n]} selected={draft.nature === n} onPress={() => set('nature', n)} />
                    ))}
                  </ChoiceGroup>
                  <TermHint term="Juros nas parcelas" slug="amortizacao-price-sac" />
                </>
              ) : null}

              <ChoiceGroup label={parcelada ? 'A parcela muda de um mês para outro?' : 'O valor muda de um mês para outro?'}>
                <Chip label={parcelada ? 'Parcela igual todo mês' : 'Não, é sempre o mesmo'} selected={!variable} onPress={() => setMode('fixo')} />
                <Chip
                  label={parcelada ? 'Parcela muda (financiamento corrigido)' : 'Sim, muda (como luz e água)'}
                  selected={variable}
                  onPress={() => setMode('variavel')}
                />
              </ChoiceGroup>
              {parcelada ? null : <TermHint term="Valor que muda" slug="estimativa" />}

              {amountField}

              {dayField}

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
                  <LinkButton label={CALC_UI_TEXT.links.parcelado} icon={Calculator} style={styles.inlineLink} onPress={openInstallmentCalc} />
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
                  <TermHint term="Parcelas pagas antes" slug="parcelamentos" />
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

              {endingBlock}
            </>
          )}

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
            <MoneyTxt variant="label" accessibilityLabel={yearA11yLabel(preview.text)}>
              {preview.text}
            </MoneyTxt>
            {preview.lines.map((line) => (
              <MoneyTxt key={line} variant="caption" accessibilityLabel={yearA11yLabel(line)}>
                {line}
              </MoneyTxt>
            ))}
          </Banner>
        ) : null}

        {conflicts?.texts.record ? (
          <Banner tone="info" icon={Info}>
            <MoneyTxt variant="label">{conflicts.texts.record}</MoneyTxt>
            {conflicts.texts.startNext && canStartNext ? (
              <Button label={conflicts.texts.startNext} accessibilityLabel={yearA11yLabel(conflicts.texts.startNext)} tone="soft" onPress={startNext} />
            ) : null}
          </Banner>
        ) : null}
        {showCommitmentConflict && conflicts && preview ? (
          <Banner tone="info" icon={Info}>
            <MoneyTxt variant="label">{conflicts.texts.commitment ?? ''}</MoneyTxt>
            {conflicts.texts.startNext && canStartNext ? (
              <Button label={conflicts.texts.startNext} accessibilityLabel={yearA11yLabel(conflicts.texts.startNext)} tone="soft" onPress={startNext} />
            ) : null}
            <Button
              label={`Manter ${firstMonthName}`}
              accessibilityLabel={yearA11yLabel(`Manter ${firstMonthName}`)}
              tone="ghost"
              onPress={() => setKept((k) => [...k, preview.firstMonth])}
            />
          </Banner>
        ) : null}
        {conflicts?.texts.similar ? (
          <Banner tone="info" icon={Info}>
            <MoneyTxt variant="label">{conflicts.texts.similar}</MoneyTxt>
          </Banner>
        ) : null}

        {anual ? (
          <>
            <View style={{ gap: space[1] }}>
              <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={2}>
                {ANNUAL_HELP_TEXT.nextYearsTitle}
              </Txt>
              <Txt variant="label" color={colors.textSecondary}>
                {ANNUAL_HELP_TEXT.nextYears}
              </Txt>
            </View>
            <Txt variant="label" color={colors.textSecondary}>
              Será salva em <Txt variant="label" style={{ fontFamily: fonts.bold }}>{contextName}</Txt>. Cada conta do ano vira uma conta a pagar,
              e só o que você marca como paga entra em Pago.
            </Txt>
            <LinkButton
              label="Contas que chegam uma vez por ano"
              color={colors.textSecondary}
              onPress={() => router.push(explanationHref('contas-do-ano'))}
            />
          </>
        ) : (
          <>
            <Txt variant="label" color={colors.textSecondary}>
              Será salvo em <Txt variant="label" style={{ fontFamily: fonts.bold }}>{contextName}</Txt>. Cada mês vira uma conta a pagar, e só o
              que você marca como paga entra em Pago.
            </Txt>
            <LinkButton
              label="Gasto fixo, conta a pagar e gasto anotado"
              color={colors.textSecondary}
              onPress={() => router.push(explanationHref('gasto-fixo'))}
            />
          </>
        )}
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
