import { BUSINESS_TEXT, formatBRL, type BusinessContext, type BusinessYear, type BusinessYearLine, type ExportPeriod } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { Download } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { MonthStepper } from '@/components/month-stepper';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { useValuesHidden } from '@/lib/privacy';
import { useBusiness } from '@/state/business';
import { useBusinessYear, useView } from '@/state/data';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;

/** Quantos anos antes do ano de criação do negócio a troca de ano alcança (lançamentos anotados com data antiga). */
const YEARS_BEFORE_CREATION = 5;

/**
 * Resumo do ano do negócio (D-121), a partir de "Seu negócio": o ano com Entrou e Saiu da operação por categoria, o que ficou fora da
 * operação, as retiradas e o que ficou no negócio, com troca de ano e a exportação de sempre (com o negócio escolhido). Para o MEI, as
 * vendas e os serviços separados, com "Confira com a sua contabilidade antes de declarar.". Não é um documento contábil nem uma
 * declaração pronta: "Os valores são os que você anotou."
 */
export default function ResumoDoAnoScreen() {
  const business = useBusiness();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.yearTitle} right={<ContextPill label={business.data?.name ?? T.context} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {business.isPending ? (
          <LoadingState label={T.loading} />
        ) : business.isError ? (
          <ErrorState message={T.loadFailed} onRetry={() => business.refetch()} />
        ) : business.data ? (
          <YearView business={business.data} />
        ) : (
          <Card style={{ gap: space[3] }}>
            <Txt>{T.loadFailed}</Txt>
            <Button label={T.accountOpen} tone="soft" onPress={() => router.replace('/negocio')} />
          </Card>
        )}
      </Screen>
    </View>
  );
}

/** O período da exportação que cobre o ano: este ano, o ano passado ou, para os anteriores, tudo. */
function exportPeriodFor(year: number, currentYear: number): ExportPeriod {
  return year === currentYear ? 'ano' : year === currentYear - 1 ? 'ano_passado' : 'tudo';
}

function YearView({ business }: { business: BusinessContext }) {
  const { currentMonth } = useView();
  const params = useLocalSearchParams<{ ano?: string }>();
  const currentYear = Number(currentMonth.slice(0, 4));
  const firstYear = Math.min(currentYear, Number(business.createdAt.slice(0, 4)) || currentYear) - YEARS_BEFORE_CREATION;
  const asked = Number(params.ano);
  const [year, setYear] = useState(Number.isInteger(asked) && asked >= firstYear && asked <= currentYear ? asked : currentYear);
  const data = useBusinessYear(business.id, year, currentMonth);
  const hidden = useValuesHidden();
  const mei = business.businessProfile === 'mei';
  const prev = year > firstYear ? year - 1 : null;
  const next = year < currentYear ? year + 1 : null;

  return (
    <>
      <View style={{ gap: space[1] }}>
        <MonthStepper
          groupLabel={T.yearStepper}
          label={`${business.name} · ${year}`}
          prevLabel={prev !== null ? T.yearPrev(prev) : 'Ano anterior'}
          nextLabel={next !== null ? T.yearNext(next) : 'Próximo ano'}
          onPrev={prev !== null ? () => setYear(prev) : null}
          onNext={next !== null ? () => setYear(next) : null}
        />
        {year !== currentYear ? <LinkButton label={T.yearBack(currentYear)} style={styles.inlineLink} onPress={() => setYear(currentYear)} /> : null}
      </View>
      <Txt color={colors.textSecondary}>{T.yearIntro(year, year === currentYear)}</Txt>

      {data.isError ? (
        <Card>
          <ErrorState message={T.loadFailed} onRetry={() => data.refetch()} />
        </Card>
      ) : !data.data ? (
        <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel={T.loading}>
          <Skeleton width="100%" height={160} style={{ borderRadius: radius.lg }} />
          <Skeleton width="100%" height={160} style={{ borderRadius: radius.lg }} />
        </View>
      ) : data.data.recordCount === 0 ? (
        <Card>
          <Txt color={colors.textSecondary}>{T.yearNothing(year)}</Txt>
        </Card>
      ) : (
        <YearCards y={data.data} mei={mei} hidden={hidden} />
      )}

      <View style={{ gap: space[2] }}>
        <Button
          label={T.yearExport}
          icon={Download}
          tone="soft"
          onPress={() => router.push({ pathname: '/conta/exportar', params: { espaco: 'negocio', periodo: exportPeriodFor(year, currentYear) } })}
        />
        <Txt variant="caption" color={colors.textSecondary}>
          {T.yearExportHint}
        </Txt>
      </View>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.notAdvice}
      </Txt>
    </>
  );
}

function YearCards({ y, mei, hidden }: { y: BusinessYear; mei: boolean; hidden: boolean }) {
  return (
    <>
      <LinesCard title={T.yearInTitle} lines={y.inLines} total={y.inCents} empty={T.yearNoIn} />
      <LinesCard title={T.yearOutTitle} lines={y.outLines} total={y.outCents} empty={T.yearNoOut} />
      {/* Com valores ocultos, a frase que diz se entrou ou saiu a mais some (como em "Seu negócio", D-113a). */}
      {hidden ? null : <MoneyTxt style={{ fontFamily: fonts.semibold }}>{T.yearLeftLine(y.leftCents)}</MoneyTxt>}
      {mei ? (
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.yearMeiTitle}
          </Txt>
          <View>
            <AmountRow label={T.yearSales} cents={y.salesCents} line />
            <AmountRow label={T.yearServices} cents={y.servicesCents} line />
            <AmountRow label={T.yearTotal} cents={y.salesCents + y.servicesCents} strong />
          </View>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.yearMeiNote}
          </Txt>
        </Card>
      ) : null}
      <Card style={{ gap: space[3] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {T.outsideTitle}
        </Txt>
        {y.outside.length === 0 ? (
          <Txt color={colors.textSecondary}>{T.yearOutsideNone}</Txt>
        ) : (
          <View>
            {y.outside.map((l, i) => (
              <AmountRow
                key={`${l.kind}|${l.category}`}
                label={`${l.kind === 'receita' ? T.outsideIn : T.outsideOut} · ${l.category}`}
                a11y={T.outsideA11y(l)}
                cents={l.cents}
                line={i < y.outside.length - 1}
              />
            ))}
          </View>
        )}
        <Txt variant="caption" color={colors.textSecondary}>
          {T.outsideWhy}
        </Txt>
      </Card>
      <Card style={{ gap: space[3] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {T.yearWithdrawnTitle}
        </Txt>
        {y.withdrawnCents === 0 ? <Txt color={colors.textSecondary}>{T.yearWithdrawnNone}</Txt> : <AmountRow label={T.yearTotal} cents={y.withdrawnCents} strong />}
      </Card>
      <Card style={{ gap: space[2] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {T.yearKeptTitle}
        </Txt>
        <AmountRow label={T.yearTotal} a11y={T.yearKeptTitle} cents={y.keptCents} strong big />
        <Txt variant="caption" color={colors.textSecondary}>
          {T.yearKeptCaption}
        </Txt>
      </Card>
    </>
  );
}

/** Um card de categorias (entrou ou saiu na operação), com o total embaixo. */
function LinesCard({ title, lines, total, empty }: { title: string; lines: BusinessYearLine[]; total: number; empty: string }) {
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {title}
      </Txt>
      {lines.length === 0 ? (
        <Txt color={colors.textSecondary}>{empty}</Txt>
      ) : (
        <View>
          {lines.map((l) => (
            <AmountRow key={l.category} label={l.category} cents={l.cents} line />
          ))}
          <AmountRow label={T.yearTotal} cents={total} strong />
        </View>
      )}
    </Card>
  );
}

/** Uma linha "nome · valor", numa cor só (sem verde nem vermelho), com o nome acessível inteiro. */
function AmountRow({ label, cents, a11y, line, strong, big }: { label: string; cents: number; a11y?: string; line?: boolean; strong?: boolean; big?: boolean }) {
  const mask = useMoneyLabelMask();
  const hidden = useValuesHidden();
  // O que ficou no negócio pode ser negativo: o valor com o sinal, sem cor. Com valores ocultos, sem o sinal (não diz a direção, D-113a).
  const negative = cents < 0 && !hidden;
  const value = negative ? `- ${formatBRL(-cents)}` : formatBRL(Math.abs(cents));
  const name = a11y ?? label;
  const spoken = a11y && a11y.includes('R$') ? a11y : `${name}: ${negative ? 'menos ' : ''}${formatBRL(Math.abs(cents))}`;
  return (
    <View style={[styles.row, line && styles.rowLine]} accessible accessibilityLabel={mask(spoken)}>
      <Txt variant={big ? 'body' : 'label'} style={[{ flex: 1 }, strong && { fontFamily: fonts.bold }]} numberOfLines={2}>
        {label}
      </Txt>
      <MoneyTxt variant={big ? 'title' : 'label'} style={{ fontFamily: strong ? fonts.bold : fonts.semibold }}>
        {value}
      </MoneyTxt>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineLink: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2], minHeight: 44 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
