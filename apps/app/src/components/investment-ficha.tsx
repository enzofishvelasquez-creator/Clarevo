import {
  DETAILS_TEXT,
  ESTIMATE_TEXT,
  INVESTMENT_KIND_LABEL,
  INVESTMENT_TAX_RULES,
  SUBKIND_LABEL,
  TAX_TEXT,
  addDays,
  calendarDaysBetween,
  detailsEmpty,
  estimateRegressiveNet,
  estimateValueByRate,
  formatDateBR,
  guaranteeOf,
  investmentErrorText,
  isRepoError,
  liquiditySummary,
  monthOf,
  newOperationKey,
  rateSummary,
  relativeDays,
  taxExplanation,
  taxRegimeOf,
  UNUSUAL_RATE_TEXT,
  addMonths,
  unusualRate,
  type Investment,
  type InvestmentMovement,
} from '@clarevo/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { explanationHref } from '@/lib/learn';
import { Button, Card, Skeleton, Txt } from '@/components/ui';
import { useInvalidateInvestments, useMarketIndices } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

/** O tipo exato e a instituição ("Ação · Corretora Sol"), ou o tipo, sem a ficha. */
export function investmentCaption(i: Pick<Investment, 'kind' | 'subkind' | 'institution'>): string {
  const what = i.subkind ? SUBKIND_LABEL[i.subkind] : INVESTMENT_KIND_LABEL[i.kind];
  return i.institution ? `${what} · ${i.institution}` : what;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="caption" color={colors.textSecondary}>
        {label}
      </Txt>
      <Txt variant="label">{value}</Txt>
    </View>
  );
}

/**
 * "Sobre este investimento" (D-099): o que a ficha diz (tipo exato, onde está, como rende, vencimento, resgate) e o que ela deduz
 * (garantia e regra de imposto). Sem ficha, o convite para completar em Editar.
 */
export function InvestmentFichaCard({ investment: i }: { investment: Investment }) {
  const { today } = useSession();
  // O CDI dos últimos 12 meses, para o aviso de taxa fora do comum (o % do CDI não precisa dele).
  const needsCdi = i.rateBp !== null && (i.indexKind === 'prefixado' || i.indexKind === 'ipca' || i.indexKind === 'selic');
  const indices = useMarketIndices(needsCdi ? addMonths(monthOf(today), -14) : null);
  const unusual = i.status === 'ativo' && unusualRate(i, indices.data ?? null);
  const regime = taxRegimeOf(i.kind, i.subkind);
  const guarantee = guaranteeOf(i.kind, i.subkind);
  const rate = rateSummary(i.indexKind, i.rateBp);
  const liquidity = liquiditySummary(i);
  const empty = detailsEmpty(i);
  const maturity = i.maturityOn
    ? (() => {
        const days = calendarDaysBetween(today, i.maturityOn);
        return days < 0 ? `Venceu em ${formatDateBR(i.maturityOn)}` : `${formatDateBR(i.maturityOn)}, ${relativeDays(days)}`;
      })()
    : null;
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
          {i.institution ? <Line label="Onde está" value={i.institution} /> : null}
          {rate ? <Line label="Como rende" value={rate} /> : null}
          {maturity ? <Line label="Vencimento" value={maturity} /> : null}
          {liquidity ? <Line label="Resgate" value={liquidity} /> : null}
        </>
      )}
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
 * "Se resgatasse hoje" (D-099, item 7): na tabela regressiva, o imposto e o IOF estimados por aporte; nas outras regras, a explicação, sem
 * cálculo. Sempre "estimativa pela regra em vigor".
 */
export function InvestmentNetCard({ investment: i, movements }: { investment: Investment; movements: readonly InvestmentMovement[] }) {
  const { today } = useSession();
  const regime = taxRegimeOf(i.kind, i.subkind);
  if (i.status !== 'ativo' || i.valueCents <= 0) return null;
  const estimate = regime === 'regressiva' ? estimateRegressiveNet(movements, today) : null;
  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {TAX_TEXT.title}
      </Txt>
      {regime === null ? (
        <Txt color={colors.textSecondary}>{TAX_TEXT.noRegime}</Txt>
      ) : estimate === null ? (
        <Txt>{taxExplanation(regime, i.kind, i.subkind)}</Txt>
      ) : estimate.gainCents <= 0 ? (
        <Txt color={colors.textSecondary}>{TAX_TEXT.noGain}</Txt>
      ) : (
        <>
          <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold, fontSize: 18 }]}>
            {TAX_TEXT.net(estimate.netCents)}
          </MoneyTxt>
          <MoneyTxt variant="label">{TAX_TEXT.ir(estimate.irCents)}</MoneyTxt>
          {estimate.iofCents > 0 ? <MoneyTxt variant="label">{TAX_TEXT.iof(estimate.iofCents)}</MoneyTxt> : null}
          {estimate.rates ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {TAX_TEXT.rates(estimate.rates)}
            </Txt>
          ) : null}
        </>
      )}
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
 * a atualização de valor de hoje quando a pessoa toca. Some quando a forma de render não tem taxa ou o índice não veio.
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
  const estimate = estimateValueByRate(i, movements, indices.data ?? null, today);
  if (!estimate) {
    return usesSeries && indices.isError ? (
      <Card style={{ gap: space[2] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {ESTIMATE_TEXT.title}
        </Txt>
        <Txt color={colors.textSecondary}>{ESTIMATE_TEXT.unavailable}</Txt>
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
      await repo.addInvestmentMovement(newOperationKey(), i.id, 'valor', { amountCents: estimate.valueCents, occurredOn: today, note: null });
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
        {ESTIMATE_TEXT.basis(estimate)}
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
