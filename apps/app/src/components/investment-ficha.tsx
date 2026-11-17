import {
  DETAILS_TEXT,
  ESTIMATE_PREMISE_TEXT,
  ESTIMATE_TEXT,
  INVESTMENT_GOAL_TEXT,
  INVESTMENT_KIND_LABEL,
  INVESTMENT_TAX_RULES,
  LIQUIDITY_EXPLANATION,
  NET_INCOME_TEXT,
  SUBKIND_LABEL,
  TAX_TEXT,
  VALUE_DATE_TEXT,
  VALUE_SOURCE_NOTE,
  netEstimateWhen,
  addDays,
  calendarDaysBetween,
  currentRateBp,
  detailsEmpty,
  estimateNetIncome,
  estimateValueWithRateStep,
  formatDateBR,
  guaranteeExplanation,
  guaranteeOf,
  investmentErrorText,
  isRepoError,
  isStackedLayout,
  liquiditySummary,
  monthOf,
  netIncomeLines,
  newOperationKey,
  rateSummaryWithStep,
  relativeDays,
  taxExplanation,
  taxExplanationLink,
  taxRegimeOf,
  UNUSUAL_RATE_TEXT,
  addMonths,
  unusualRate,
  valueDateCaption,
  type DetailExplanation,
  type Investment,
  type InvestmentMovement,
} from '@clarevo/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { explanationHref } from '@/lib/learn';
import { Button, Card, Skeleton, Txt } from '@/components/ui';
import { useGoals, useInvalidateInvestments, useMarketIndices } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

/** O tipo exato e a instituição ("Ação · Corretora Sol"), ou o tipo, sem a ficha. */
export function investmentCaption(i: Pick<Investment, 'kind' | 'subkind' | 'institution'>): string {
  const what = i.subkind ? SUBKIND_LABEL[i.subkind] : INVESTMENT_KIND_LABEL[i.kind];
  return i.institution ? `${what} · ${i.institution}` : what;
}

/** Uma linha da ficha. `money`: texto da pessoa que pode ter valores em reais (descrição, condição), com "Ocultar valores" valendo. */
function Line({ label, value, money = false }: { label: string; value: string; money?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="caption" color={colors.textSecondary}>
        {label}
      </Txt>
      {money ? <MoneyTxt variant="label">{value}</MoneyTxt> : <Txt variant="label">{value}</Txt>}
    </View>
  );
}

/** A frase curta de explicação e o caminho para o tema de Aprender (D-104, item 3). */
function Explain({ e }: { e: DetailExplanation }) {
  return (
    <View style={{ gap: space[1], alignItems: 'flex-start' }}>
      <Txt variant="caption" color={colors.textSecondary}>
        {e.text}
      </Txt>
      <Button label={e.link} tone="ghost" compact onPress={() => router.push(explanationHref(e.slug))} />
    </View>
  );
}

/**
 * "Sobre este investimento" (D-099): o que a ficha diz (tipo exato, descrição, onde está, como rende, a condição da taxa, vencimento,
 * resgate) e o que ela deduz (garantia e regra de imposto). D-104: a taxa com a data de fim (item 13), a descrição (item 12) e as frases
 * curtas de liquidez e garantia com o tema de Aprender (item 3). Sem ficha, o convite para completar em Editar.
 */
export function InvestmentFichaCard({ investment: i }: { investment: Investment }) {
  const { today } = useSession();
  const rateNow = currentRateBp(i, today);
  // O CDI dos últimos 12 meses, para o aviso de taxa fora do comum (o % do CDI não precisa dele).
  const needsCdi = rateNow !== null && (i.indexKind === 'prefixado' || i.indexKind === 'ipca' || i.indexKind === 'selic');
  const indices = useMarketIndices(needsCdi ? addMonths(monthOf(today), -14) : null);
  const unusual = i.status === 'ativo' && unusualRate({ indexKind: i.indexKind, rateBp: rateNow }, indices.data ?? null);
  const regime = taxRegimeOf(i.kind, i.subkind);
  const guarantee = guaranteeOf(i.kind, i.subkind);
  const rate = rateSummaryWithStep(i, today);
  const liquidity = liquiditySummary(i);
  const empty = detailsEmpty(i);
  // Meta ligada (D-099, item 13): só informação, com o caminho para a meta.
  const goals = useGoals(i.goalId ? i.contextId : undefined);
  const goal = i.goalId ? (goals.data ?? []).find((g) => g.id === i.goalId) : undefined;
  const maturity = i.maturityOn
    ? (() => {
        const days = calendarDaysBetween(today, i.maturityOn);
        return days < 0 ? `Venceu em ${formatDateBR(i.maturityOn)}` : `${formatDateBR(i.maturityOn)}, ${relativeDays(days)}`;
      })()
    : null;
  const guaranteeWhy = guaranteeExplanation(guarantee);
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        Sobre este investimento
      </Txt>
      {empty ? (
        <>
          <Txt color={colors.textSecondary}>Complete a ficha para ver o vencimento, a garantia, o imposto estimado e o valor pela taxa que você contratou.</Txt>
          {i.status === 'ativo' ? (
            <Button label="Completar a ficha" tone="soft" onPress={() => router.push({ pathname: '/investimento/[id]/editar', params: { id: i.id } })} />
          ) : null}
        </>
      ) : (
        <>
          <Line label="Investimento" value={i.subkind ? SUBKIND_LABEL[i.subkind] : INVESTMENT_KIND_LABEL[i.kind]} />
          {i.description ? <Line label="Descrição" value={i.description} money /> : null}
          {i.institution ? <Line label="Onde está" value={i.institution} /> : null}
          {rate ? <Line label="Como rende" value={rate} /> : null}
          {i.rateCondition ? <Line label="Condição da taxa" value={i.rateCondition} money /> : null}
          {maturity ? <Line label="Vencimento" value={maturity} /> : null}
          {liquidity ? (
            <View style={{ gap: space[1] }}>
              <Line label="Resgate" value={liquidity} />
              <Explain e={LIQUIDITY_EXPLANATION} />
            </View>
          ) : null}
        </>
      )}
      {goal ? (
        <View style={{ gap: space[1] }}>
          <Line label={INVESTMENT_GOAL_TEXT.fichaLabel} value={goal.name} />
          <Button
            label={goal.goalType === 'emergencia' ? INVESTMENT_GOAL_TEXT.openReserve : INVESTMENT_GOAL_TEXT.openGoal}
            tone="ghost"
            compact
            onPress={() => router.push({ pathname: '/meta/[id]', params: { id: goal.id } })}
          />
        </View>
      ) : null}
      {unusual ? (
        <View style={{ gap: space[2] }}>
          <Txt variant="label">{UNUSUAL_RATE_TEXT}</Txt>
          <Button
            label="Ler sobre golpes com promessa de rentabilidade"
            tone="ghost"
            onPress={() => router.push(explanationHref('golpes-rentabilidade'))}
          />
        </View>
      ) : null}
      {regime || guarantee ? (
        <View style={{ gap: space[1] }}>
          {guarantee ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {DETAILS_TEXT.guaranteeLine(guarantee)}
            </Txt>
          ) : null}
          {guaranteeWhy ? <Explain e={guaranteeWhy} /> : null}
          {regime ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {DETAILS_TEXT.regimeLine(regime)}
            </Txt>
          ) : null}
          <Txt variant="caption" color={colors.textSecondary}>
            {DETAILS_TEXT.checkStatement}
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}

/**
 * "Se resgatasse hoje" (D-099, item 7; "No vencimento, em 10/01/2027 (estimativa)" quando o resgate só vale no vencimento). D-104, item 3: três
 * linhas alinhadas (rendimento bruto, IR e IOF estimados, rendimento líquido estimado) na tabela regressiva e nos isentos de IR; nas outras
 * regras, o rendimento bruto e a explicação, sem cálculo. A data e a premissa da estimativa ficam junto dos números (item 4), e a frase do
 * imposto leva ao tema de Aprender. Sempre "estimativa pela regra em vigor".
 */
export function InvestmentNetCard({ investment: i, movements }: { investment: Investment; movements: readonly InvestmentMovement[] }) {
  const { today } = useSession();
  const { width, fontScale } = useWindowDimensions();
  const stacked = isStackedLayout(width, fontScale);
  const regime = taxRegimeOf(i.kind, i.subkind);
  if (i.status !== 'ativo' || i.valueCents <= 0) return null;
  // Resgate só no vencimento: a estimativa é na data do vencimento (com o que já aconteceu até hoje), nunca "se resgatasse hoje".
  const when = netEstimateWhen(i, today);
  const live = movements.filter((m) => m.occurredOn <= today);
  const estimate = when.on !== null ? estimateNetIncome(regime, i.subkind, live, when.on) : null;
  const why = taxExplanationLink(regime);
  const gross = i.valueCents + i.withdrawalsCents - i.depositsCents;
  const computed = regime !== null && estimate !== null && estimate.gainCents > 0;
  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {when.title}
      </Txt>
      {when.on !== null ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {VALUE_DATE_TEXT.estimateFor(when.on, today)}
        </Txt>
      ) : null}
      {when.note ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {when.note}
        </Txt>
      ) : null}
      {regime === null ? (
        <Txt color={colors.textSecondary}>{i.kind === 'outro' ? TAX_TEXT.noRegimeOther : TAX_TEXT.noRegime}</Txt>
      ) : estimate === null ? (
        <>
          {gross > 0 && when.on !== null ? <MoneyTxt variant="label">{NET_INCOME_TEXT.grossOnly(gross)}</MoneyTxt> : null}
          <Txt>{taxExplanation(regime, i.kind, i.subkind)}</Txt>
        </>
      ) : estimate.gainCents <= 0 ? (
        <Txt color={colors.textSecondary}>{TAX_TEXT.noGain}</Txt>
      ) : (
        <>
          <View style={{ gap: space[1] }}>
            {netIncomeLines(estimate, regime).map((l, idx) => (
              <View
                key={l.label}
                style={[
                  { flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'flex-start' : 'baseline', gap: stacked ? 0 : space[3] },
                  idx === 2 && { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[1] },
                ]}>
                <Txt variant="label" style={[stacked ? undefined : { flex: 1 }, idx === 2 ? { fontFamily: fonts.bold } : undefined]}>
                  {l.label}
                </Txt>
                <MoneyTxt variant="label" style={[tabular, idx === 2 ? { fontFamily: fonts.bold } : undefined]} accessibilityLabel={NET_INCOME_TEXT.a11y(l)}>
                  {NET_INCOME_TEXT.value(l)}
                </MoneyTxt>
              </View>
            ))}
          </View>
          <MoneyTxt variant="label">{TAX_TEXT.net(estimate.netCents)}</MoneyTxt>
          <Txt variant="caption" color={colors.textSecondary}>
            {NET_INCOME_TEXT.grossNote}
          </Txt>
          {estimate.rates && regime === 'regressiva' ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {TAX_TEXT.rates(estimate.rates)}
            </Txt>
          ) : null}
        </>
      )}
      {computed && when.on !== null ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {when.on === today ? ESTIMATE_PREMISE_TEXT.todayPremise(today) : ESTIMATE_PREMISE_TEXT.maturityPremise(when.on)}
        </Txt>
      ) : null}
      {why ? <Explain e={why} /> : null}
      {regime !== null ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {TAX_TEXT.rule(INVESTMENT_TAX_RULES.reviewedOn)}
        </Txt>
      ) : null}
    </Card>
  );
}

/**
 * "Valor pela taxa contratada" (D-099, item 8): a estimativa pela taxa que a pessoa registrou e o botão "Usar este valor", que só registra
 * a atualização de valor de hoje quando a pessoa toca (com a observação "Pela taxa contratada (estimativa)", D-104, item 1). D-104: a
 * taxa que muda na data de fim (item 13), a data e a premissa da estimativa (item 4). Some quando a forma de render não tem taxa ou o índice
 * não veio; numa falha do índice, o último valor registrado com a data (nunca zero).
 */
export function InvestmentEstimateCard({ investment: i, movements, onNotice }: { investment: Investment; movements: readonly InvestmentMovement[]; onNotice: (m: string | null) => void }) {
  const repo = useRepo();
  const { today } = useSession();
  const invalidate = useInvalidateInvestments();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usesSeries = i.indexKind === 'cdi' || i.indexKind === 'selic' || i.indexKind === 'ipca' || i.indexKind === 'poupanca';
  const live = movements.filter((m) => m.occurredOn <= today);
  const lastValue = live.filter((m) => m.kind === 'valor').reduce<string | null>((a, m) => (a === null || m.occurredOn > a ? m.occurredOn : a), null);
  const firstOn = live.reduce<string | null>((a, m) => (a === null || m.occurredOn < a ? m.occurredOn : a), null);
  const startMonth = lastValue ?? firstOn;
  // A partir de um mês antes da base: a poupança usa o mês de cada aniversário.
  const indices = useMarketIndices(usesSeries && startMonth ? monthOf(addDays(startMonth, -31)) : null);
  if (i.status !== 'ativo' || i.indexKind === null || i.indexKind === 'variavel' || live.length === 0) return null;
  if (usesSeries && indices.isPending) {
    return (
      <Card style={{ gap: space[2] }}>
        <View style={{ gap: space[2] }} accessibilityRole="progressbar" accessibilityLabel="Buscando o índice">
          <Skeleton width="50%" height={18} />
          <Skeleton width="80%" height={14} />
        </View>
      </Card>
    );
  }
  const estimate = estimateValueWithRateStep(i, movements, indices.data ?? null, today);
  if (!estimate) {
    return usesSeries && indices.isError ? (
      <Card style={{ gap: space[2] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {ESTIMATE_TEXT.title}
        </Txt>
        <Txt color={colors.textSecondary}>{ESTIMATE_TEXT.unavailable}</Txt>
        <MoneyTxt variant="caption" color={colors.textSecondary}>
          {VALUE_DATE_TEXT.lastRegistered(i.valueCents, valueDateCaption(movements))}
        </MoneyTxt>
      </Card>
    ) : null;
  }
  const projected = ESTIMATE_TEXT.projected(estimate);
  const differs = estimate.valueCents !== i.valueCents || i.lastValueOn !== today;

  async function use() {
    if (busy || !estimate) return;
    setBusy(true);
    setError(null);
    onNotice(null);
    try {
      await repo.addInvestmentMovement(newOperationKey(), i.id, 'valor', { amountCents: estimate.valueCents, occurredOn: today, note: VALUE_SOURCE_NOTE.rate() });
      invalidate();
      onNotice(ESTIMATE_TEXT.used);
    } catch (e) {
      invalidate();
      setError(investmentErrorText(isRepoError(e) ? e.code : 'desconhecido'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {ESTIMATE_TEXT.title}
      </Txt>
      <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold, fontSize: 18 }]}>
        {ESTIMATE_TEXT.value(estimate.valueCents)}
      </MoneyTxt>
      <Txt variant="caption" color={colors.textSecondary}>
        {ESTIMATE_PREMISE_TEXT.forDay(today)}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {ESTIMATE_PREMISE_TEXT.premise(i, estimate, indices.data?.example === true)}
      </Txt>
      {projected ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {projected}
        </Txt>
      ) : null}
      {indices.data?.example ? (
        <Txt variant="caption" color={colors.textSecondary}>
          Na demonstração, os índices são valores de exemplo, não os reais.
        </Txt>
      ) : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {ESTIMATE_TEXT.rule}
      </Txt>
      {differs ? (
        <>
          <Button label={ESTIMATE_TEXT.use} tone="soft" busy={busy} onPress={use} accessibilityHint={ESTIMATE_TEXT.useHint} />
          <Txt variant="caption" color={colors.textSecondary}>
            {ESTIMATE_TEXT.useHint}
          </Txt>
        </>
      ) : null}
      {error ? (
        <Txt variant="label" color={colors.error}>
          {error}
        </Txt>
      ) : null}
    </Card>
  );
}
