import {
  IMPORT_ERROR_TEXT,
  IMPORT_TEXT,
  allSelected,
  applyMapping,
  buildReview,
  chunkItems,
  importSaveErrorText,
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
  type ImportDestination,
  type ImportParse,
  type ImportResult,
  type ReviewLine,
} from '@clarevo/core';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CircleAlert, FileUp, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { ColumnChoice, ReviewRow, guessColumns } from '@/components/import-parts';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt } from '@/components/money-text';
import { CheckOption, ChoiceGroup } from '@/components/series-parts';
import { Banner, Button, Card, Chip, LinkButton, Screen, Txt } from '@/components/ui';
import { getPrefs, updatePrefs } from '@/lib/device-prefs';
import { flash } from '@/lib/flash';
import { latestMonthOf, loadImportContext, type ImportContext } from '@/lib/import-context';
import { pickImportFile, type PickedImport } from '@/lib/import-file';
import { isRefusal, useCards, useImportRecords, useSpace, useView } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

type Step = 'arquivo' | 'colunas' | 'destino' | 'revisar' | 'pronto';

/** Quantas linhas a lista mostra de cada vez (um arquivo pode ter até 5.000). */
const PAGE = 100;

/** O mapeamento de colunas que a pessoa escolhe, em índices a partir de zero. */
interface Mapping {
  date: number;
  description: number;
  amount: number;
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
  const personal = useSpace();
  const contextId = personal.data?.personalContextId;
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
  /** Lotes já gravados nesta tentativa (por posição) e a chave do conjunto: repetir com o mesmo conteúdo repete as mesmas chaves. */
  const attempt = useRef<{ snapshot: string; base: string; results: ImportResult[] } | null>(null);
  /** Linhas gravadas por tentativas anteriores que depois foram refeitas (recusa no meio): somam no resumo final. */
  const carried = useRef<ImportResult>({ created: 0, skipped: 0 });

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
      setMapping({ date: guess.date, description: guess.description, amount: guess.amount, header });
      setMappingError(null);
      setStep('colunas');
      return;
    }
    setParse(r.parse);
    setTable(r.table);
    startDestination(r.parse);
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
      const picked = await pickImportFile();
      if (!picked.cancelled) accept(picked);
    } finally {
      setReading(false);
    }
  }

  // ---- 2. Colunas -----------------------------------------------------------------------------------------------------------
  function applyColumns() {
    if (!table || !mapping) return;
    if (new Set([mapping.date, mapping.description, mapping.amount]).size < 3) {
      setMappingError(IMPORT_TEXT.columnsNeedAll);
      return;
    }
    const out = applyMapping(table, {
      firstRow: mapping.header ? 1 : 0,
      columns: { date: mapping.date, description: mapping.description, amount: mapping.amount, debit: -1, credit: -1, kind: -1 },
    });
    if ('error' in out) {
      setMappingError(IMPORT_ERROR_TEXT[out.error]);
      return;
    }
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
    const snapshot = JSON.stringify([destination, target, items.map((i) => [i.importKey, i.description, i.category, i.amountCents, i.occurredOn, i.kind])]);
    if (!attempt.current || attempt.current.snapshot !== snapshot) attempt.current = { snapshot, base: newOperationKey(), results: [] };
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
      if (isRefusal(e)) {
        const err = e as { code: string; detail?: string };
        // O que já entrou fica (com a chave de cada linha); o lote recusado não foi gravado. Refaz a revisão com o que mudou.
        setSaveError(
          `${importSaveErrorText(err.code, err.detail)}${done > 0 ? ` ${IMPORT_TEXT.partial(chunks.slice(0, done).reduce((n, c) => n + c.length, 0), items.length)}` : ''}`,
        );
        if (done > 0) {
          carried.current = {
            created: carried.current.created + current.results.reduce((n, r) => n + r.created, 0),
            skipped: carried.current.skipped + current.results.reduce((n, r) => n + r.skipped, 0),
          };
          attempt.current = null;
          await prepare(lines);
        }
      } else {
        setSaveError(done > 0 ? IMPORT_TEXT.partial(chunks.slice(0, done).reduce((n, c) => n + c.length, 0), items.length) : importSaveErrorText('rede'));
      }
      return;
    } finally {
      setSaving(false);
      setProgress(null);
    }
    const total = {
      created: carried.current.created + current.results.reduce((n, r) => n + r.created, 0),
      skipped: carried.current.skipped + current.results.reduce((n, r) => n + r.skipped, 0),
    };
    attempt.current = null;
    carried.current = { created: 0, skipped: 0 };
    if (user) {
      updatePrefs(user.id, { importCategories: rememberCategories(memory(), chosen.map((l) => ({ description: l.description.trim(), category: l.category }))) }, persist);
    }
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setMonth(latestMonthOf(chosen.map((l) => l.date), currentMonth));
    setResult(total);
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
    carried.current = { created: 0, skipped: 0 };
  }

  function seeMovements() {
    flash.set(importedSummary(result?.created ?? 0, result?.skipped ?? 0));
    router.replace('/movimentacoes');
  }

  const counts = reviewCounts(lines);
  const visible = lines.slice(0, shown);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={IMPORT_TEXT.screenTitle} onBack={guard.requestCancel} right={<ContextPill label="Importando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
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
                  {r.slice(0, 6).join(' | ')}
                </Txt>
              ))}
            </View>
            <CheckOption
              label={IMPORT_TEXT.firstRowHeader}
              checked={mapping.header}
              onPress={() => setMapping({ ...mapping, header: !mapping.header })}
            />
            <ColumnChoice label={IMPORT_TEXT.columnDate} table={table} sampleRow={mapping.header ? 1 : 0} value={mapping.date} onChange={(c) => setMapping({ ...mapping, date: c })} />
            <ColumnChoice
              label={IMPORT_TEXT.columnDescription}
              table={table}
              sampleRow={mapping.header ? 1 : 0}
              value={mapping.description}
              onChange={(c) => setMapping({ ...mapping, description: c })}
            />
            <ColumnChoice label={IMPORT_TEXT.columnAmount} table={table} sampleRow={mapping.header ? 1 : 0} value={mapping.amount} onChange={(c) => setMapping({ ...mapping, amount: c })} />
            {mappingError ? (
              <Txt variant="label" color={colors.error} accessibilityRole="alert">
                {mappingError}
              </Txt>
            ) : null}
            <Button label={IMPORT_TEXT.columnsApply} onPress={applyColumns} />
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
            <Card style={{ paddingVertical: space[2] }}>
              {visible.map((l, i) => (
                <ReviewRow key={l.id} line={l} editing={editing === l.id} last={i === visible.length - 1} onToggle={toggle} onEdit={setEditing} onChange={change} />
              ))}
              {shown < lines.length ? (
                <Button label={IMPORT_TEXT.showMore(Math.min(PAGE, lines.length - shown), lines.length - shown)} tone="ghost" onPress={() => setShown((n) => n + PAGE)} />
              ) : null}
            </Card>
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

