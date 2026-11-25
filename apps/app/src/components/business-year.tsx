import {
  BUSINESS_TEXT,
  RECORD_MARKS_TEXT,
  formatBRL,
  type BusinessContext,
  type BusinessYear,
  type BusinessYearLine,
  type BusinessYearMarks,
  type ExportPeriod,
  type MarkLine,
} from '@clarevo/core';
import { useLocalSearchParams } from 'expo-router';
import { Download } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { MonthStepper } from '@/components/month-stepper';
import { ErrorState } from '@/components/states';
import { Button, Card, LinkButton, Skeleton, Txt } from '@/components/ui';
import { useValuesHidden } from '@/lib/privacy';
import { useBusinessYear, useView } from '@/state/data';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;

/** Quantos anos antes do ano de criação do negócio a troca de ano alcança (lançamentos anotados com data antiga). */
const YEARS_BEFORE_CREATION = 5;

/** O período da exportação que cobre o ano: este ano, o ano passado ou, para os anteriores, tudo. */
export function exportPeriodFor(year: number, currentYear: number): ExportPeriod {
  return year === currentYear ? 'ano' : year === currentYear - 1 ? 'ano_passado' : 'tudo';
}

/**
 * Os textos que mudam quando quem lê não é quem anotou (a Contabilidade, D-123): a frase do rodapé, a nota do MEI e o botão de exportar.
 * Sem eles, os de "Seu negócio".
 */
export interface BusinessYearTexts {
  exportLabel?: string;
  exportHint?: string;
  notAdvice?: string;
  meiNote?: string;
}

/**
 * O Resumo do ano de um negócio (D-121), com a troca de ano (?ano=AAAA na abertura) e o atalho para exportar: o mesmo em "Seu negócio" →
 * Resumo do ano e em "Negócios que você acompanha" (D-123, só leitura). `onExport` recebe o período que cobre o ano mostrado. O primeiro
 * ano da troca é o de criação do negócio (ou o de `createdAt` que a tela passar) menos 5.
 */
export function BusinessYearView({
  business,
  onExport,
  texts = {},
}: {
  business: Pick<BusinessContext, 'id' | 'name' | 'createdAt' | 'businessProfile'>;
  onExport: (period: ExportPeriod) => void;
  texts?: BusinessYearTexts;
}) {
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
        <YearCards y={data.data} marks={data.marks} mei={mei} hidden={hidden} meiNote={texts.meiNote ?? T.yearMeiNote} />
      )}

      <View style={{ gap: space[2] }}>
        <Button label={texts.exportLabel ?? T.yearExport} icon={Download} tone="soft" onPress={() => onExport(exportPeriodFor(year, currentYear))} />
        <Txt variant="caption" color={colors.textSecondary}>
          {texts.exportHint ?? T.yearExportHint}
        </Txt>
      </View>
      <Txt variant="caption" color={colors.textSecondary}>
        {texts.notAdvice ?? T.notAdvice}
      </Txt>
    </>
  );
}

function YearCards({ y, marks, mei, hidden, meiNote }: { y: BusinessYear; marks: BusinessYearMarks | undefined; mei: boolean; hidden: boolean; meiNote: string }) {
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
            {meiNote}
          </Txt>
        </Card>
      ) : null}
      {/* Nota e quem pagou (D-122): só quando alguma entrada da operação do ano tem marca. */}
      {marks && marks.anyMarked ? <MarksCard marks={marks} /> : null}
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

/** As entradas da operação do ano pelas marcas (D-122): nota fiscal (com, sem, não marcado) e quem pagou, numa cor só, sem imposto. */
function MarksCard({ marks }: { marks: BusinessYearMarks }) {
  const M = RECORD_MARKS_TEXT.year;
  const lines = (title: string, list: MarkLine[]) => (
    <View>
      <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
        {title}
      </Txt>
      {list.map((l, i) => (
        <AmountRow key={l.key} label={l.label} a11y={`${title}, ${l.label}`} cents={l.cents} line={i < list.length - 1} />
      ))}
    </View>
  );
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {M.title}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {M.intro}
      </Txt>
      {lines(M.invoiceTitle, marks.invoice)}
      {lines(M.payerTitle, marks.payer)}
    </Card>
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
