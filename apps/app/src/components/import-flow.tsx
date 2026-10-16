import {
  EMPTY_TALLY,
  IMPORT_ERROR_TEXT,
  IMPORT_TEXT,
  allSelected,
  applyMapping,
  attemptProgress,
  attemptSnapshot,
  bankAttempt,
  buildReview,
  chunkItems,
  failedItemIndex,
  formatDateBR,
  importSaveErrorText,
  importSummaryOf,
  importedSummary,
  includedLines,
  lineProblem,
  newOperationKey,
  parseFileDate,
  rememberCategories,
  reviewCounts,
  setAll,
  toImportItems,
  updateLine,
  type CsvTable,
  type ImportAttempt,
  type ImportDestination,
  type ImportTally,
  type ImportParse,
  type ImportResult,
  type ReviewLine,
} from '@clarevo/core';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CircleAlert, FileUp, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { ColumnChoice, ReviewRow, guessColumns, maskCell } from '@/components/import-parts';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt } from '@/components/money-text';
import { CheckOption, ChoiceGroup } from '@/components/series-parts';
import { Banner, Button, Card, Chip, LinkButton, Screen, Txt } from '@/components/ui';
import { getPrefs, updatePrefs } from '@/lib/device-prefs';
import { flash } from '@/lib/flash';
import { latestMonthOf, loadImportContext, type ImportContext } from '@/lib/import-context';
import { moneyText, useValuesHidden } from '@/lib/privacy';
import { pickImportFile, type PickedImport } from '@/lib/import-file';
import { isRefusal, useCards, useImportRecords, useWork, useView } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

type Step = 'arquivo' | 'colunas' | 'destino' | 'revisar' | 'pronto';

/** Quantas linhas a lista mostra de cada vez (um arquivo pode ter até 5.000). */
const PAGE = 100;

/**
 * O mapeamento de colunas que a pessoa escolhe, em índices a partir de zero. `two`: débito e crédito em colunas separadas (em vez
 * de uma coluna de valor); `kind`: coluna de tipo (D ou C), ou -1 quando não há.
 */
interface Mapping {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  kind: number;
  two: boolean;
  header: boolean;
}

/**
 * Importar extrato ou fatura (D-048), em um fluxo só: escolher o arquivo (OFX ou planilha, lido no aparelho), escolher as colunas se a
 * planilha não tem cabeçalho conhecido, escolher o destino (conta ou cartão), revisar as linhas e importar. O arquivo nunca é enviado
 * nem guardado: só as linhas que a pessoa confirma, em lotes de até 500, com o resumo de cada uma. O saldo do arquivo é ignorado.
 */
export function ImportFlow() {
  const repo = useRepo();
  const { today, user, auth } = useSession();
  const { setMonth, currentMonth } = useView();
  const personal = useWork();
  const hidden = useValuesHidden();
  const timeZone = personal.data?.timeZone;
  const contextId = personal.data?.contextId;
  const accounts = personal.data?.accounts ?? [];
  const cards = useCards(contextId);
  const importer = useImportRecords();
  const persist = auth.mode !== 'demo';

  const [step, setStep] = useState<Step>('arquivo');
  const [fileName, setFileName] = useState('');
  const [parse, setParse] = useState<ImportParse | null>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);
  /** A planilha escolhida não tem sinal nem tipo: a pessoa precisa confirmar que as linhas serão lidas todas como entrada (ou compra). */
  const [noSignAsk, setNoSignAsk] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [destination, setDestination] = useState<ImportDestination | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [ctxData, setCtxData] = useState<ImportContext | null>(null);
  const [invert, setInvert] = useState(false);
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  /** A tentativa em curso: lotes já gravados (por posição) e a chave do conjunto; repetir com o mesmo conteúdo repete as mesmas chaves. */
  const attempt = useRef<ImportAttempt | null>(null);
  /** O que tentativas anteriores já gravaram e que depois foram refeitas (recusa no meio, ou linhas mudadas): soma no resumo final. */
  const tally = useRef<ImportTally>(EMPTY_TALLY);
  /** Rolagem até a linha que o banco recusou: a posição do cartão da lista e a de cada linha, medidas ao desenhar. */
  const scroller = useRef<ScrollView>(null);
  const listY = useRef(0);
  const rowY = useRef<Map<string, number>>(new Map());
  const pendingScroll = useRef<string | null>(null);
  const target = destination === 'conta' ? accountId : cardId;
  const activeCards = (cards.data ?? []).filter((c) => c.status === 'ativo');
  const reviewing = step === 'revisar' && !result;
  const guard = useLeaveGuard(reviewing && !saving, '/movimentacoes');

  // A conta principal já vem escolhida; um cartão só, também.
  useEffect(() => {
    if (accountId === null && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);
  useEffect(() => {
    if (cardId === null && activeCards.length === 1) setCardId(activeCards[0]!.id);
  }, [activeCards, cardId]);

  const memory = useCallback(() => (user ? (getPrefs(user.id)?.importCategories ?? {}) : {}), [user]);

  // ---- 1. Arquivo -----------------------------------------------------------------------------------------------------------
  function accept(read: Extract<PickedImport, { cancelled: false }>) {
    setFileName(read.name);
    const r = read.read;
    if (r.kind === 'erro') {
      setReadError(IMPORT_ERROR_TEXT[r.code]);
      return;
    }
    if (r.kind === 'mapear') {
      setTable(r.table);
      // Planilha sem cabeçalho: se a primeira linha já tem uma data, ela é um lançamento, não os nomes das colunas.
      const header = !(r.table.rows[0] ?? []).some((cell) => parseFileDate(cell) !== null);
      const guess = guessColumns(r.table, header ? 1 : 0);
      setMapping({ date: guess.date, description: guess.description, amount: guess.amount, debit: -1, credit: -1, kind: -1, two: false, header });
      setMappingError(null);
      setNoSignAsk(false);
      setStep('colunas');
      return;
    }
    setParse(r.parse);
    setTable(r.table);
    startDestination(r.parse);
  }

  function changeMapping(next: Mapping) {
    setMapping(next);
    setNoSignAsk(false);
    setMappingError(null);
  }

  function startDestination(p: ImportParse) {
    setDestination(p.statement);
    setPrepareError(null);
    setStep('destino');
  }

  async function chooseFile() {
    if (reading) return;
    setReadError(null);
    setReading(true);
    try {
      const picked = await pickImportFile(timeZone);
      if (!picked.cancelled) accept(picked);
    } finally {
      setReading(false);
    }
  }

  // ---- 2. Colunas -----------------------------------------------------------------------------------------------------------
  function applyColumns() {
    if (!table || !mapping) return;
    const chosen = mapping.two ? [mapping.date, mapping.description, mapping.debit, mapping.credit] : [mapping.date, mapping.description, mapping.amount];
    const kindClash = !mapping.two && mapping.kind >= 0 && chosen.includes(mapping.kind);
    if (new Set(chosen).size < chosen.length || chosen.some((c) => c < 0) || kindClash) {
      setMappingError(IMPORT_TEXT.columnsNeedAll);
      return;
    }
    const out = applyMapping(table, {
      firstRow: mapping.header ? 1 : 0,
      columns: mapping.two
        ? { date: mapping.date, description: mapping.description, amount: -1, debit: mapping.debit, credit: mapping.credit, kind: -1 }
        : { date: mapping.date, description: mapping.description, amount: mapping.amount, debit: -1, credit: -1, kind: mapping.kind },
    });
    if ('error' in out) {
      setMappingError(IMPORT_ERROR_TEXT[out.error]);
      return;
    }
    // Sem sinal e sem tipo, todas as linhas têm o mesmo sentido: pede a confirmação antes de seguir.
    if (!mapping.two && !noSignAsk && out.lines.every((l) => l.amountCents > 0)) {
      setNoSignAsk(true);
      setMappingError(null);
      return;
    }
    setNoSignAsk(false);
    setMappingError(null);
    setParse(out);
    startDestination(out);
  }

  // ---- 3. Destino e revisão -------------------------------------------------------------------------------------------------
  /** As linhas da revisão com o que o banco já tem. `keepEdits`: depois de uma recusa no meio do envio, as escolhas da pessoa voltam. */
  function makeLines(data: ImportContext, invertSigns: boolean, keepEdits: ReviewLine[] | null): ReviewLine[] {
    const card = destination === 'cartao' ? (cards.data ?? []).find((c) => c.id === target) : undefined;
    const built = buildReview({
      parse: parse!,
      destination: destination!,
      targetId: target!,
      today,
      invertSigns,
      memory: memory(),
      existing: data.existing,
      importedKeys: data.importedKeys,
      card: card ? { days: card, paidMonths: data.paidMonths } : null,
    });
    const kept = keepEdits ? new Map(keepEdits.map((l) => [l.id, l])) : null;
    return kept
      ? built.map((l) => {
          const old = kept.get(l.id);
          // O que já foi importado vem como "Já anotado" (não entra de novo); o resto mantém descrição, categoria e seleção.
          return old && l.importable ? { ...l, description: old.description, category: old.category, include: old.include } : l;
        })
      : built;
  }

  async function prepare(keepEdits: ReviewLine[] | null) {
    if (!parse || !contextId || !destination || !target) return;
    setPreparing(true);
    setPrepareError(null);
    try {
      const card = destination === 'cartao' ? (cards.data ?? []).find((c) => c.id === target) : undefined;
      if (destination === 'cartao' && !card) throw new Error('cartao');
      const data = await loadImportContext(repo, contextId, destination, target, parse, card ?? null);
      setCtxData(data);
      setLines(makeLines(data, invert, keepEdits));
      setShown(PAGE);
      setEditing(null);
      setStep('revisar');
    } catch {
      setPrepareError(IMPORT_TEXT.prepareFailed);
    } finally {
      setPreparing(false);
    }
  }

  /** Trocar entradas e saídas refaz as linhas com o que já foi lido (as edições dessas linhas se perdem). */
  function toggleInvert(next: boolean) {
    if (!ctxData) return;
    setInvert(next);
    const data = ctxData;
    const card = destination === 'cartao' ? (cards.data ?? []).find((c) => c.id === target) : undefined;
    setLines(
      buildReview({
        parse: parse!,
        destination: destination!,
        targetId: target!,
        today,
        invertSigns: next,
        memory: memory(),
        existing: data.existing,
        importedKeys: data.importedKeys,
        card: card ? { days: card, paidMonths: data.paidMonths } : null,
      }),
    );
    setShown(PAGE);
    setEditing(null);
  }

  const toggle = useCallback((id: string) => setLines((all) => updateLine(all, id, { include: !all.find((l) => l.id === id)!.include })), []);
  const change = useCallback(
    (id: string, patch: { description?: string; category?: string | null }) => setLines((all) => updateLine(all, id, patch)),
    [],
  );

  // ---- 4. Importar ----------------------------------------------------------------------------------------------------------
  /** Rola até a linha pedida, se já foi desenhada (senão, quando ela aparecer). */
  const scrollToPending = useCallback(() => {
    const id = pendingScroll.current;
    const y = id ? rowY.current.get(id) : undefined;
    if (id === null || y === undefined) return;
    pendingScroll.current = null;
    scroller.current?.scrollTo({ y: Math.max(0, listY.current + y - space[4]), animated: false });
  }, []);
  const onListLayout = useCallback(
    (y: number) => {
      listY.current = y;
      scrollToPending();
    },
    [scrollToPending],
  );
  const onRowLayout = useCallback(
    (id: string, y: number) => {
      rowY.current.set(id, y);
      if (pendingScroll.current === id) scrollToPending();
    },
    [scrollToPending],
  );

  async function runImport() {
    if (saving || !contextId || !destination || !target) return;
    const chosen = includedLines(lines);
    if (chosen.length === 0) {
      setSaveError(IMPORT_TEXT.nothingSelected);
      return;
    }
    const bad = chosen.find((l) => lineProblem(l));
    if (bad) {
      const at = lines.findIndex((l) => l.id === bad.id);
      setShown((n) => Math.max(n, at + 1));
      setEditing(bad.id);
      setSaveError(lineProblem(bad) === 'descricao_obrigatoria' ? IMPORT_TEXT.needDescription : IMPORT_TEXT.descriptionTooLong);
      return;
    }
    const items = toImportItems(lines);
    const chunks = chunkItems(items);
    const snapshot = attemptSnapshot(destination, target, items);
    const total = items.length;
    if (attempt.current && attempt.current.snapshot !== snapshot) {
      if (attempt.current.results.length > 0) {
        // A pessoa mudou as linhas depois de uma falha de rede no meio: os lotes que já entraram ficam contados (a chave dos novos
        // lotes é outra) e a revisão é refeita, para as linhas que já entraram não irem de novo.
        const gone = attempt.current;
        const progress = attemptProgress(gone);
        tally.current = bankAttempt(tally.current, gone);
        attempt.current = null;
        setSaveError(IMPORT_TEXT.partial(progress.sent, progress.total));
        await prepare(lines);
        return;
      }
      attempt.current = null;
    }
    if (!attempt.current) attempt.current = { snapshot, base: newOperationKey(), results: [], chunks };
    const current = attempt.current;
    setSaveError(null);
    setSaving(true);
    setProgress({ done: current.results.length, total: chunks.length });
    try {
      for (let i = current.results.length; i < chunks.length; i++) {
        const r = await importer.mutateAsync({ key: `${current.base}-${i}`, contextId, destination, targetId: target, items: chunks[i]! });
        current.results.push(r);
        setProgress({ done: current.results.length, total: chunks.length });
      }
    } catch (e) {
      const done = current.results.length;
      const sentCount = attemptProgress(current).sent;
      if (isRefusal(e)) {
        const err = e as { code: string; detail?: string };
        // A linha que o banco recusou (item=N dentro do lote): o texto a cita e a tela abre a edição dela.
        const at = failedItemIndex(err.detail, done);
        const refused = at === null ? undefined : chosen[at];
        const shownLine = refused
          ? { description: refused.description.trim(), amount: moneyText(refused.amountCents, hidden), date: formatDateBR(refused.date) }
          : undefined;
        setSaveError(`${importSaveErrorText(err.code, shownLine)}${done > 0 ? ` ${IMPORT_TEXT.partial(sentCount, total)}` : ''}`);
        // O que já entrou fica (com a chave de cada linha); o lote recusado não foi gravado. Refaz a revisão com o que mudou.
        if (done > 0) {
          tally.current = bankAttempt(tally.current, current);
          attempt.current = null;
          await prepare(lines);
        }
        if (refused) {
          const position = lines.findIndex((l) => l.id === refused.id);
          setShown((n) => Math.max(n, position + 1));
          setEditing(refused.id);
          pendingScroll.current = refused.id;
          scrollToPending();
        }
      } else {
        setSaveError(done > 0 ? IMPORT_TEXT.partial(sentCount, total) : importSaveErrorText('rede'));
      }
      return;
    } finally {
      setSaving(false);
      setProgress(null);
    }
    // O resumo soma o que o banco criou e pulou (chave repetida) com as linhas "Já anotado" que ficaram de fora da seleção.
    const summary = importSummaryOf(tally.current, current, lines);
    attempt.current = null;
    tally.current = EMPTY_TALLY;
    rowY.current = new Map();
    if (user) {
      updatePrefs(user.id, { importCategories: rememberCategories(memory(), chosen.map((l) => ({ description: l.description.trim(), category: l.category }))) }, persist);
    }
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setMonth(latestMonthOf(chosen.map((l) => l.date), currentMonth));
    setResult(summary);
    setStep('pronto');
  }

  function backToDestination() {
    setStep('destino');
    setSaveError(null);
  }

  function again() {
    setStep('arquivo');
    setParse(null);
    setTable(null);
    setMapping(null);
    setLines([]);
    setResult(null);
    setFileName('');
    setReadError(null);
    setInvert(false);
    attempt.current = null;
    tally.current = EMPTY_TALLY;
    setNoSignAsk(false);
  }

  function seeMovements() {
    flash.set(importedSummary(result?.created ?? 0, result?.skipped ?? 0));
    router.replace('/movimentacoes');
  }

  const sample = mapping?.header ? 1 : 0;
  const counts = reviewCounts(lines);
  const visible = lines.slice(0, shown);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={IMPORT_TEXT.screenTitle} onBack={guard.requestCancel} right={<ContextPill label="Importando em Pessoal" />} help="importar" />
      <Screen scrollRef={scroller} contentStyle={styles.body}>
        {step === 'arquivo' ? (
          <Card style={{ gap: space[4] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {IMPORT_TEXT.pickTitle}
            </Txt>
            <Txt color={colors.textSecondary}>{IMPORT_TEXT.intro}</Txt>
            <Txt variant="caption" color={colors.textSecondary}>
              {IMPORT_TEXT.limits}
            </Txt>
            {readError ? (
              <Banner tone="erro" icon={CircleAlert}>
                <Txt variant="label" color={colors.error}>
                  {readError}
                </Txt>
              </Banner>
            ) : null}
            <Button label={IMPORT_TEXT.pickFile} icon={FileUp} busy={reading} busyLabel={IMPORT_TEXT.reading} onPress={chooseFile} />
          </Card>
        ) : null}

        {step === 'colunas' && table && mapping ? (
          <Card style={{ gap: space[4] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {IMPORT_TEXT.columnsTitle}
            </Txt>
            <Txt color={colors.textSecondary}>{IMPORT_TEXT.columnsIntro}</Txt>
            <View style={{ gap: space[1] }} accessibilityLabel={IMPORT_TEXT.columnsPreview}>
              <Txt variant="label">{IMPORT_TEXT.columnsPreview}</Txt>
              {table.rows.slice(0, 4).map((r, i) => (
                <Txt key={i} variant="caption" color={colors.textSecondary} numberOfLines={2}>
                  {r.slice(0, 6).map((cell) => maskCell(cell, hidden)).join(' | ')}
                </Txt>
              ))}
            </View>
            <CheckOption label={IMPORT_TEXT.firstRowHeader} checked={mapping.header} onPress={() => changeMapping({ ...mapping, header: !mapping.header })} />
            <ColumnChoice label={IMPORT_TEXT.columnDate} table={table} sampleRow={sample} value={mapping.date} onChange={(c) => changeMapping({ ...mapping, date: c })} />
            <ColumnChoice label={IMPORT_TEXT.columnDescription} table={table} sampleRow={sample} value={mapping.description} onChange={(c) => changeMapping({ ...mapping, description: c })} />
            <ChoiceGroup label={IMPORT_TEXT.columnsAmountTitle}>
              <Chip label={IMPORT_TEXT.columnsAmountOne} selected={!mapping.two} onPress={() => changeMapping({ ...mapping, two: false })} />
              <Chip label={IMPORT_TEXT.columnsAmountTwo} selected={mapping.two} onPress={() => changeMapping({ ...mapping, two: true })} />
            </ChoiceGroup>
            {mapping.two ? (
              <>
                <ColumnChoice label={IMPORT_TEXT.columnDebit} table={table} sampleRow={sample} value={mapping.debit} onChange={(c) => changeMapping({ ...mapping, debit: c })} />
                <ColumnChoice label={IMPORT_TEXT.columnCredit} table={table} sampleRow={sample} value={mapping.credit} onChange={(c) => changeMapping({ ...mapping, credit: c })} />
              </>
            ) : (
              <>
                <ColumnChoice label={IMPORT_TEXT.columnAmount} table={table} sampleRow={sample} value={mapping.amount} onChange={(c) => changeMapping({ ...mapping, amount: c })} />
                <ColumnChoice
                  label={IMPORT_TEXT.columnKind}
                  hint={IMPORT_TEXT.columnKindHint}
                  noneLabel={IMPORT_TEXT.columnKindNone}
                  table={table}
                  sampleRow={sample}
                  value={mapping.kind}
                  onChange={(c) => changeMapping({ ...mapping, kind: c })}
                />
              </>
            )}
            {noSignAsk ? (
              <Banner tone="info" icon={CircleAlert}>
                <Txt variant="label" accessibilityRole="alert">
                  {IMPORT_TEXT.columnsNoSign}
                </Txt>
              </Banner>
            ) : null}
            {mappingError ? (
              <Txt variant="label" color={colors.error} accessibilityRole="alert">
                {mappingError}
              </Txt>
            ) : null}
            <Button label={noSignAsk ? IMPORT_TEXT.columnsNoSignConfirm : IMPORT_TEXT.columnsApply} onPress={applyColumns} />
            <LinkButton label={IMPORT_TEXT.pickFileOther} onPress={again} />
          </Card>
        ) : null}

        {step === 'destino' && parse ? (
          <>
            <Card style={{ gap: space[2] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {IMPORT_TEXT.fileRead(fileName)}
              </Txt>
              <Txt color={colors.textSecondary}>{IMPORT_TEXT.linesRead(parse.lines.length)}</Txt>
              {parse.ignored > 0 ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {IMPORT_TEXT.ignoredLines(parse.ignored)}
                </Txt>
              ) : null}
              {parse.balanceIgnored ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {IMPORT_TEXT.balanceIgnored}
                </Txt>
              ) : null}
              <LinkButton label={IMPORT_TEXT.pickFileOther} style={styles.link} onPress={again} />
            </Card>

            <Card style={{ gap: space[4] }}>
              <ChoiceGroup label={IMPORT_TEXT.destinationTitle}>
                <Chip label={IMPORT_TEXT.destinationAccount} selected={destination === 'conta'} onPress={() => setDestination('conta')} />
                <Chip label={IMPORT_TEXT.destinationCard} selected={destination === 'cartao'} onPress={() => setDestination('cartao')} />
              </ChoiceGroup>
              {destination === 'conta' ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {IMPORT_TEXT.destinationAccountHint}
                </Txt>
              ) : destination === 'cartao' ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {IMPORT_TEXT.destinationCardHint}
                </Txt>
              ) : null}
              {parse.statement && destination && parse.statement !== destination ? (
                <Txt variant="label" color={colors.textSecondary}>
                  {parse.statement === 'cartao' ? IMPORT_TEXT.fileLooksCard : IMPORT_TEXT.fileLooksAccount}
                </Txt>
              ) : null}

              {destination === 'conta' ? (
                <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} label={IMPORT_TEXT.pickAccount} hideManage />
              ) : null}
              {destination === 'cartao' ? (
                activeCards.length === 0 ? (
                  <View style={{ gap: space[2] }}>
                    <Txt color={colors.textSecondary}>{cards.isPending ? IMPORT_TEXT.reading : IMPORT_TEXT.noCards}</Txt>
                    {cards.isPending ? null : <Button label={IMPORT_TEXT.addCard} tone="soft" onPress={() => router.push('/cartoes/novo')} />}
                  </View>
                ) : (
                  <ChoiceGroup label={IMPORT_TEXT.pickCard}>
                    {activeCards.map((c) => (
                      <Chip key={c.id} label={c.name} selected={cardId === c.id} onPress={() => setCardId(c.id)} />
                    ))}
                  </ChoiceGroup>
                )
              ) : null}

              {prepareError ? (
                <Txt variant="label" color={colors.error} accessibilityRole="alert">
                  {prepareError}
                </Txt>
              ) : null}
              <Button
                label={IMPORT_TEXT.continueToReview}
                disabled={!destination || !target}
                busy={preparing}
                busyLabel={IMPORT_TEXT.reading}
                onPress={() => prepare(null)}
              />
              <View style={styles.privacy}>
                <View style={{ marginTop: 2 }}>
                  <ShieldCheck size={18} color={colors.textSecondary} aria-hidden />
                </View>
                <Txt variant="label" color={colors.textSecondary} style={{ flex: 1 }}>
                  {IMPORT_TEXT.neverSaved}
                </Txt>
              </View>
            </Card>
          </>
        ) : null}

        {step === 'revisar' && parse ? (
          <>
            <Card style={{ gap: space[2] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {IMPORT_TEXT.reviewTitle}
              </Txt>
              <Txt color={colors.textSecondary}>{IMPORT_TEXT.reviewIntro}</Txt>
              <Txt variant="label" accessibilityLiveRegion="polite">
                {IMPORT_TEXT.counts(counts.total, counts.included)}
              </Txt>
              {parse.ignored > 0 ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {IMPORT_TEXT.ignoredLines(parse.ignored)}
                </Txt>
              ) : null}
              {parse.balanceIgnored ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {IMPORT_TEXT.balanceIgnored}
                </Txt>
              ) : null}
              {destination === 'cartao' ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {IMPORT_TEXT.cardPurchaseNote}
                </Txt>
              ) : null}
              <CheckOption label={IMPORT_TEXT.invertSigns} hint={IMPORT_TEXT.invertSignsHint} checked={invert} onPress={() => toggleInvert(!invert)} />
              <Button
                label={allSelected(lines) ? IMPORT_TEXT.clearAll : IMPORT_TEXT.selectAll}
                tone="soft"
                onPress={() => setLines((all) => setAll(all, !allSelected(all)))}
              />
            </Card>
            <View onLayout={(e: LayoutChangeEvent) => onListLayout(e.nativeEvent.layout.y)}>
            <Card style={{ paddingVertical: space[2] }}>
              {visible.map((l, i) => (
                <View key={l.id} onLayout={(e) => onRowLayout(l.id, e.nativeEvent.layout.y)}>
                  <ReviewRow line={l} editing={editing === l.id} last={i === visible.length - 1} onToggle={toggle} onEdit={setEditing} onChange={change} />
                </View>
              ))}
              {shown < lines.length ? (
                <Button label={IMPORT_TEXT.showMore(Math.min(PAGE, lines.length - shown), lines.length - shown)} tone="ghost" onPress={() => setShown((n) => n + PAGE)} />
              ) : null}
            </Card>
            </View>
          </>
        ) : null}

        {step === 'pronto' && result ? (
          <Card style={{ gap: space[4] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {IMPORT_TEXT.doneTitle}
            </Txt>
            <Banner tone="sucesso">
              <Txt variant="label" color={colors.successText} accessibilityLiveRegion="polite">
                {importedSummary(result.created, result.skipped)}
              </Txt>
            </Banner>
            {destination === 'cartao' && cardId ? (
              <Button label={IMPORT_TEXT.seeInCard} onPress={() => router.replace({ pathname: '/cartoes/[id]', params: { id: cardId } })} />
            ) : null}
            <Button label={IMPORT_TEXT.seeInMovements} tone={destination === 'cartao' ? 'soft' : 'brand'} onPress={seeMovements} />
            <LinkButton label={IMPORT_TEXT.importAnother} onPress={again} />
          </Card>
        ) : null}
      </Screen>

      {step === 'revisar' ? (
        <FormFooter
          error={saveError}
          onCancel={backToDestination}
          cancelLabel={IMPORT_TEXT.back}
          submitLabel={IMPORT_TEXT.importButton(counts.included)}
          onSubmit={runImport}
          busy={saving}
          disabled={counts.included === 0}>
          {saving && progress ? (
            <MoneyTxt variant="caption" color={colors.textSecondary} accessibilityLiveRegion="polite">
              {IMPORT_TEXT.importing(progress.done, progress.total)}
            </MoneyTxt>
          ) : null}
        </FormFooter>
      ) : null}
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
});

