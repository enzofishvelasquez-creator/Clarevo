import {
  DEFAULT_SEARCH_DRAFT,
  SEARCH_KINDS,
  SEARCH_PAGE,
  SEARCH_PERIODS,
  SEARCH_TEXT,
  SEARCH_TEXT_MAX,
  ACCOUNTS_TEXT,
  effectiveSearchCategory,
  formatMonthBR,
  groupByMonth,
  isDefaultDraft,
  moreFiltersActive,
  recordAccountName,
  searchAccountOptions,
  searchCategoryOptions,
  searchFromDraft,
  searchResultPurchases,
  searchResultRecords,
  searchSummaryLines,
  summarizePurchases,
  summarizeSearch,
  type SearchDraft,
} from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { PurchaseRow } from '@/components/search-parts';
import { RecordRow } from '@/components/record-row';
import { ChoiceGroup } from '@/components/series-parts';
import { EmptyState, ErrorState } from '@/components/states';
import { Button, Card, Chip, Screen, Skeleton, TextField, Txt, styles as ui } from '@/components/ui';
import { maskMoneyText, spokenText, useValuesHidden } from '@/lib/privacy';
import { useAccounts, useCards, useRecordSearch, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = SEARCH_TEXT;

/** Valor que só chega depois de um instante sem mudar (o valor digitado nos campos de dinheiro não consulta a cada tecla). */
function useDebounced<V>(value: V, ms: number): V {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Buscar em Movimentações (D-045): gastos e recebimentos de todos os meses, por texto (sem diferenciar maiúsculas nem acentos),
 * tipo, período, categoria, conta e valor. O servidor filtra o que pode e devolve até 1.000 linhas; o texto é filtrado aqui, no
 * aparelho, e fica só na memória desta tela (nada é gravado nem registrado). Compras no cartão ficam num grupo à parte e não
 * entram na soma de gastos: o dinheiro sai quando a fatura é paga, e o pagamento da fatura já está na lista.
 */
export default function BuscarScreen() {
  const { today } = useSession();
  const hidden = useValuesHidden();
  const personal = useSpace().data;
  const contextId = personal?.personalContextId;
  const accounts = useAccounts(contextId);
  const cards = useCards(contextId);

  const [draft, setDraft] = useState<SearchDraft>(DEFAULT_SEARCH_DRAFT);
  const [expanded, setExpanded] = useState(false);
  const [recordLimit, setRecordLimit] = useState(SEARCH_PAGE);
  const [purchaseLimit, setPurchaseLimit] = useState(SEARCH_PAGE);
  const update = (patch: Partial<SearchDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setRecordLimit(SEARCH_PAGE);
    setPurchaseLimit(SEARCH_PAGE);
  };

  // Os valores digitados só valem depois de um instante parado; o texto, o tipo e o período valem na hora.
  const min = useDebounced(draft.min, 400);
  const max = useDebounced(draft.max, 400);
  const parsed = searchFromDraft({ ...draft, min, max });
  const params = parsed.ok ? parsed.params : null;
  const errors = parsed.ok ? {} : parsed.errors;
  const search = useRecordSearch(contextId, params);

  const category = effectiveSearchCategory(draft.kind, draft.category);
  const accountOptions = accounts.data ? searchAccountOptions(accounts.data) : [];
  const accountId = accountOptions.some((o) => o.id === draft.accountId) ? draft.accountId : null;
  const activeFilters = moreFiltersActive({ ...draft, accountId });
  const showMore = expanded || Boolean(errors.min) || Boolean(errors.max);

  const found = params && search.records.data ? searchResultRecords(search.records.data.items, params, today) : [];
  const summary = summarizeSearch(found);
  const purchases = params && search.withCards && search.purchases.data ? searchResultPurchases(search.purchases.data.items, params, today) : [];
  const truncated = Boolean(search.records.data?.truncated || (search.withCards && search.purchases.data?.truncated));
  const cardNames = new Map((cards.data ?? []).map((c) => [c.id, c.name]));
  const lines = searchSummaryLines(summary);
  const purchasesPending = search.withCards && search.purchases.isPending;
  const hiddenByAccount = params !== null && accountId !== null && draft.kind !== 'receita';
  const nothing = found.length === 0 && purchases.length === 0 && !purchasesPending;

  const shownRecords = found.slice(0, recordLimit);
  const shownPurchases = purchases.slice(0, purchaseLimit);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Txt color={colors.textSecondary}>{T.intro}</Txt>

        <Card style={{ gap: space[4] }}>
          <SearchField value={draft.text} onChange={(text) => update({ text })} />

          <ChoiceGroup label={T.kindLabel}>
            {SEARCH_KINDS.map((k) => (
              <Chip key={k} label={T.kinds[k]} selected={draft.kind === k} onPress={() => update({ kind: k })} />
            ))}
          </ChoiceGroup>

          <ChoiceGroup label={T.periodLabel}>
            {SEARCH_PERIODS.map((p) => (
              <Chip key={p} label={T.periods[p]} selected={draft.period === p} onPress={() => update({ period: p })} />
            ))}
          </ChoiceGroup>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showMore }}
            aria-expanded={showMore}
            onPress={() => setExpanded((e) => !e)}
            style={(s) => [styles.more, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
            <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold }}>
              {showMore ? T.lessFilters : T.moreFilters(activeFilters)}
            </Txt>
            {showMore ? <ChevronUp size={18} color={colors.brand} aria-hidden /> : <ChevronDown size={18} color={colors.brand} aria-hidden />}
          </Pressable>

          {showMore ? (
            <View style={{ gap: space[4] }}>
              <ChoiceGroup label={T.categoryLabel}>
                <Chip label={T.categoryAll} selected={category === null} onPress={() => update({ category: null })} />
                {searchCategoryOptions(draft.kind).map((c) => (
                  <Chip key={c} label={c} selected={category === c} onPress={() => update({ category: c })} />
                ))}
              </ChoiceGroup>

              {accountOptions.length > 0 ? (
                <ChoiceGroup label={ACCOUNTS_TEXT.filterLabel}>
                  {accountOptions.map((o) => (
                    <Chip key={o.id ?? 'todas'} label={o.label} selected={accountId === o.id} onPress={() => update({ accountId: o.id })} />
                  ))}
                </ChoiceGroup>
              ) : null}

              <TextField
                label={T.minLabel}
                prefix={T.amountPrefix}
                value={draft.min}
                onChangeText={(min) => update({ min })}
                placeholder="0,00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                hint={T.amountHint}
                error={errors.min}
              />
              <TextField
                label={T.maxLabel}
                prefix={T.amountPrefix}
                value={draft.max}
                onChangeText={(max) => update({ max })}
                placeholder="0,00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                hint={T.amountHint}
                error={errors.max}
              />
            </View>
          ) : null}

          {isDefaultDraft({ ...draft, accountId }) ? null : (
            <Button
              label={T.clearSearch}
              tone="soft"
              onPress={() => {
                setDraft(DEFAULT_SEARCH_DRAFT);
                setRecordLimit(SEARCH_PAGE);
                setPurchaseLimit(SEARCH_PAGE);
              }}
            />
          )}
        </Card>

        {params === null ? null : search.records.isPending ? (
          <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel={T.loading}>
            <Skeleton width="100%" height={72} />
            <Skeleton width="100%" height={150} />
          </View>
        ) : search.records.isError ? (
          <ErrorState message={T.loadFailed} onRetry={() => search.records.refetch()} />
        ) : nothing ? (
          <Card>
            <EmptyState title={T.emptyTitle}>
              {T.emptyBody}
            </EmptyState>
            {hiddenByAccount ? (
              <Txt variant="caption" color={colors.textSecondary} style={styles.note}>
                {T.cardsHiddenByAccount}
              </Txt>
            ) : null}
          </Card>
        ) : (
          <>
            <Card style={{ gap: space[1] }}>
              <View accessibilityLiveRegion="polite" style={{ gap: space[1] }}>
                {lines.length === 0 ? (
                  <Txt variant="label" accessibilityRole="text">
                    {T.noRecords}
                  </Txt>
                ) : (
                  lines.map((line, i) => (
                    <Txt
                      key={line}
                      variant={i === 0 ? 'title' : 'label'}
                      color={i === 0 ? colors.text : colors.textSecondary}
                      accessibilityLabel={spokenText(line, hidden)}>
                      {maskMoneyText(line, hidden)}
                    </Txt>
                  ))
                )}
              </View>
              {found.some((r) => r.invoice) ? (
                <Txt variant="caption" color={colors.textSecondary} style={styles.note}>
                  {T.invoiceNote}
                </Txt>
              ) : null}
              {purchases.length > 0 ? (
                <Txt variant="caption" color={colors.textSecondary} style={styles.note}>
                  {T.summaryCardsNote}
                </Txt>
              ) : null}
              {hiddenByAccount ? (
                <Txt variant="caption" color={colors.textSecondary} style={styles.note}>
                  {T.cardsHiddenByAccount}
                </Txt>
              ) : null}
              {truncated ? (
                <Txt variant="label" color={colors.textSecondary} style={styles.note} accessibilityRole="alert">
                  {T.truncated}
                </Txt>
              ) : null}
            </Card>

            {found.length > 0 ? (
              <Card style={{ gap: space[1] }}>
                {groupByMonth(shownRecords, (r) => r.occurredOn).map((g) => (
                  <View key={g.month}>
                    <Txt variant="caption" color={colors.textSecondary} style={styles.month} accessibilityRole="header" aria-level={2}>
                      {formatMonthBR(g.month)}
                    </Txt>
                    {g.items.map((r, i) => (
                      <RecordRow
                        key={r.id}
                        record={r}
                        last={i === g.items.length - 1}
                        accountName={accounts.data ? recordAccountName(accounts.data, r) : null}
                        onPress={() => router.push(`/registro/${r.id}`)}
                      />
                    ))}
                  </View>
                ))}
                {found.length > shownRecords.length ? (
                  <MoreButton shown={shownRecords.length} total={found.length} onPress={() => setRecordLimit((n) => n + SEARCH_PAGE)} />
                ) : null}
              </Card>
            ) : null}

            {search.withCards && search.purchases.isError ? (
              <ErrorState message={T.cardsLoadFailed} onRetry={() => search.purchases.refetch()} />
            ) : purchases.length > 0 ? (
              <Card style={{ gap: space[1] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {T.cardsTitle}
                </Txt>
                <Txt variant="label" color={colors.textSecondary} accessibilityLabel={spokenText(cardsLine(purchases), hidden)}>
                  {maskMoneyText(cardsLine(purchases), hidden)}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary} style={styles.note}>
                  {T.cardsNote}
                </Txt>
                {groupByMonth(shownPurchases, (e) => e.purchasedOn ?? '').map((g) => (
                  <View key={g.month}>
                    <Txt variant="caption" color={colors.textSecondary} style={styles.month} accessibilityRole="header" aria-level={3}>
                      {formatMonthBR(g.month)}
                    </Txt>
                    {g.items.map((e, i) => (
                      <PurchaseRow
                        key={e.id}
                        entry={e}
                        cardName={cardNames.get(e.cardId) ?? null}
                        last={i === g.items.length - 1}
                        onPress={() => router.push({ pathname: '/cartoes/[id]/fatura/[mes]', params: { id: e.cardId, mes: e.invoiceMonth } })}
                      />
                    ))}
                  </View>
                ))}
                {purchases.length > shownPurchases.length ? (
                  <MoreButton shown={shownPurchases.length} total={purchases.length} onPress={() => setPurchaseLimit((n) => n + SEARCH_PAGE)} />
                ) : null}
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}

const cardsLine = (purchases: Parameters<typeof summarizePurchases>[0]) => {
  const s = summarizePurchases(purchases);
  return SEARCH_TEXT.cardsSummary(s.count, s.totalCents);
};

/** "Mostrando 100 de 250" e o botão para trazer mais 100. */
function MoreButton({ shown, total, onPress }: { shown: number; total: number; onPress: () => void }) {
  const next = Math.min(SEARCH_PAGE, total - shown);
  return (
    <View style={{ gap: space[2], paddingTop: space[3] }}>
      <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }}>
        {T.shownOf(shown, total)}
      </Txt>
      <Button label={T.showMore(next)} tone="soft" onPress={onPress} />
    </View>
  );
}

/** Campo de busca: rótulo visível, dica e "Limpar texto" enquanto houver texto. O texto fica só na memória da tela. */
function SearchField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {T.textLabel}
      </Txt>
      <View style={[ui.input, focused && ui.inputFocused, { gap: space[2] }]}>
        <Search size={20} color={colors.textSecondary} aria-hidden />
        <TextInput
          value={value}
          onChangeText={onChange}
          accessibilityLabel={T.textLabel}
          placeholder={T.entry}
          placeholderTextColor={colors.placeholder}
          maxLength={SEARCH_TEXT_MAX}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          inputMode="search"
          enterKeyHint="search"
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={ui.inputText}
        />
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={T.clearText}
            onPress={() => onChange('')}
            style={(s) => [styles.clear, (s as { focused?: boolean }).focused && ui.focusRing]}>
            <X size={20} color={colors.textSecondary} aria-hidden />
          </Pressable>
        ) : null}
      </View>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.textHint}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  more: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, alignSelf: 'flex-start' },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -space[3], borderRadius: 22 },
  month: { fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: space[2] },
  note: { marginTop: space[2] },
});
