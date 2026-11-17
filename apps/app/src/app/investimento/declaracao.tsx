import {
  DECLARATION_TEXT,
  ERROR_TEXT,
  INFORME_TEXT,
  declarationInforme,
  declarationYears,
  defaultInformeYear,
  informeLineTitle,
  type DeclarationInforme,
  type InformeIncomeSection,
} from '@clarevo/core';
import { router } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Body, Card, Chip, Screen, Txt } from '@/components/ui';
import { useContextInvestmentMovements, useInvestments, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

const T = DECLARATION_TEXT;
const I = INFORME_TEXT;

/**
 * Resumo para a declaração anual (D-099, item 9), no formato do informe de rendimentos (D-104, item 11): o selo "Resumo estimado. Confira com o
 * informe da instituição." no alto, o ano-calendário, a posição em 31/12 (o ano anterior e o ano), os rendimentos isentos e não tributáveis,
 * os sujeitos à tributação exclusiva e Bens e Direitos (o grupo e o código para conferir e uma discriminação sugerida sem CPF). Nunca
 * "declaração pronta": os informes das instituições dizem o valor a declarar.
 */
export default function DeclaracaoScreen() {
  const { today } = useSession();
  const space_ = useSpace();
  const contextId = space_.data?.personalContextId;
  const list = useInvestments(contextId);
  const movements = useContextInvestmentMovements(contextId);
  const years = declarationYears(movements.data ?? [], today);
  const [year, setYear] = useState<number>(() => defaultInformeYear(today));
  // "Escolher o ano" (D-104, item 11): sempre o ano de hoje e o anterior (o da declaração do ano que vem), mais os anos com movimento.
  const shownYears = [...new Set([...years, year, Number(today.slice(0, 4)) - 1])].sort((a, b) => b - a);
  const informe = list.data && movements.data ? declarationInforme(list.data, movements.data, year) : null;
  const current = year >= Number(today.slice(0, 4));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Resumo para a declaração" onBack={() => (router.canGoBack() ? router.back() : router.replace('/investimentos'))} right={<ContextPill label="Pessoal" fixed />} />
      <Screen>
        <Body>
          {list.isError || movements.isError || space_.isError ? (
            <ErrorState
              message={ERROR_TEXT.carregar_falhou}
              onRetry={() => {
                space_.refetch();
                list.refetch();
                movements.refetch();
              }}
            />
          ) : !informe ? (
            <LoadingState />
          ) : (
            <>
              <Banner tone="info" icon={FileText} live={false}>
                <View style={{ gap: 2, flexShrink: 1 }}>
                  <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                    {I.seal}
                  </Txt>
                  <Txt variant="caption">{I.sealDetail}</Txt>
                </View>
              </Banner>
              <View style={{ gap: space[1] }}>
                <Txt variant="title">{T.title(year)}</Txt>
                <Txt color={colors.textSecondary}>{T.subtitle(year)}</Txt>
              </View>
              <ChoiceGroup label={I.yearLabel} accessibilityLabel="Ano-calendário dos valores">
                {shownYears.map((y) => (
                  <Chip key={y} compact label={String(y)} selected={y === year} onPress={() => setYear(y)} />
                ))}
              </ChoiceGroup>
              {informe.assets.length === 0 ? (
                <Card>
                  <Txt color={colors.textSecondary}>{T.empty(year)}</Txt>
                </Card>
              ) : (
                <Sections informe={informe} year={year} current={current} />
              )}
              <View style={{ gap: space[1] }}>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.informe}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.noCpf}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.reminder}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  Os grupos e códigos mudam de um ano para outro: confira sempre no programa da Receita Federal. Não é orientação tributária.
                </Txt>
              </View>
            </>
          )}
        </Body>
      </Screen>
    </View>
  );
}

function Sections({ informe, year, current }: { informe: DeclarationInforme; year: number; current: boolean }) {
  const valued = informe.position.items.filter((it) => !it.costBased && !it.pgbl);
  return (
    <>
      {/* 1. Posição em 31/12 */}
      <Card style={{ gap: space[2] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {current ? I.positionCurrentTitle(year) : I.positionTitle(year)}
        </Txt>
        {informe.position.items.map((it) => (
          <View key={it.investmentId} style={styles.row}>
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              {informeLineTitle(it)}
            </Txt>
            {it.pgbl ? (
              <Txt variant="caption" color={colors.textSecondary}>
                {T.pgbl}
              </Txt>
            ) : it.costBased ? (
              <Txt variant="caption" color={colors.textSecondary}>
                {T.costBased}
              </Txt>
            ) : (
              <>
                <MoneyTxt variant="label" style={tabular}>
                  {T.values(it, year, current)}
                </MoneyTxt>
                {it.currentEstimated && !current ? (
                  <Txt variant="caption" color={colors.textSecondary}>
                    {T.estimated(year)}
                  </Txt>
                ) : null}
              </>
            )}
          </View>
        ))}
        {valued.length > 1 ? (
          <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold }]}>
            {I.positionTotal(year, informe.position.previousTotalCents, informe.position.currentTotalCents, current)}
          </MoneyTxt>
        ) : null}
      </Card>
      {/* 2. Isentos e 3. Tributação exclusiva (e o que fica para conferir) */}
      <IncomeCard title={I.exemptTitle} note={I.exemptNote} section={informe.income.isento} />
      <IncomeCard title={I.exclusiveTitle} note={I.exclusiveNote} section={informe.income.exclusiva} />
      {informe.income.conferir.lines.length > 0 ? <IncomeCard title={I.otherTitle} note={I.otherNote} section={informe.income.conferir} /> : null}
      {/* 4. Bens e Direitos */}
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {I.assetsTitle}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {I.assetsNote}
      </Txt>
      {informe.assets.map((it) => (
        <Card key={it.investmentId} style={{ gap: space[2] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }} accessibilityRole="header" aria-level={3}>
            {it.name}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {it.label}
          </Txt>
          {it.pgbl ? (
            <Txt variant="label">{T.pgbl}</Txt>
          ) : (
            <>
              <Txt variant="label">{T.code(it)}</Txt>
              <View style={styles.quote}>
                <Txt variant="caption" color={colors.textSecondary}>
                  Discriminação sugerida
                </Txt>
                <MoneyTxt variant="label" selectable>
                  {I.description(it)}
                </MoneyTxt>
              </View>
              {it.costBased ? <Txt variant="label">{T.costBased}</Txt> : <MoneyTxt variant="label">{T.values(it, year, current)}</MoneyTxt>}
            </>
          )}
        </Card>
      ))}
      {informe.institutions.length > 0 ? (
        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.institutionsTitle}
          </Txt>
          {informe.institutions.map((inst) => (
            <Txt key={inst} variant="label">
              {`Informe de rendimentos de ${year}: ${inst}`}
            </Txt>
          ))}
        </Card>
      ) : null}
    </>
  );
}

function IncomeCard({ title, note, section }: { title: string; note: string; section: InformeIncomeSection }) {
  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {title}
      </Txt>
      {section.lines.length === 0 ? (
        <Txt color={colors.textSecondary}>{I.none}</Txt>
      ) : (
        section.lines.map((l) => (
          <MoneyTxt key={l.investmentId} variant="label">
            {I.line(l)}
          </MoneyTxt>
        ))
      )}
      <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold }]}>
        {I.total(section.totalCents)}
      </MoneyTxt>
      <Txt variant="caption" color={colors.textSecondary}>
        {note}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2, paddingVertical: space[1], borderBottomWidth: 1, borderBottomColor: colors.border },
  quote: { gap: 2, borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: space[3] },
});
