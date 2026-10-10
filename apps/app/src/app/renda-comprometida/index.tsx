import {
  CALC_UI_TEXT,
  COMMITTED_GROUPS,
  COMMITTED_TEXT,
  DEBT_REFERENCE,
  ERROR_TEXT,
  LIMIT_TEXT,
  addMonths,
  committedTexts,
  formatMonthYearBR,
  isValidIsoMonth,
  limitFor,
  limitNotesFor,
  limitStatus,
  monthOf,
  payablesMonthParams,
  type CommittedGroupLine,
  type CommittedSummary,
  type CommittedTexts,
  type IsoMonth,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { ExternalLink, ListChecks, ListOrdered, Repeat, ShieldCheck, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, ReduceMotion } from 'react-native-reanimated';

import { openCalc } from '@/components/calc/open';
import { CommitmentRow } from '@/components/commitment-row';
import { FitText, GroupBar, Meter, MeterLegend, useMoneyMask } from '@/components/committed-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { monthChipLabel } from '@/components/series-parts';
import { ErrorState } from '@/components/states';
import { TermHint } from '@/components/term-hint';
import { TopicLink } from '@/components/topic-link';
import { Banner, Button, Card, Chip, LinkButton, Screen, Skeleton, Txt, styles as ui } from '@/components/ui';
import { openCommitment } from '@/lib/cards';
import { LEARN_UI_TEXT } from '@/lib/learn';
import { HIDDEN_MONEY_A11Y } from '@/lib/privacy';
import { useCommitmentLimits, useCommittedGoalLines, useCommittedSummary, useCommittedUpcoming, useMonthRecords, useSpace, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space, tabular } from '@/theme/tokens';

/**
 * Renda comprometida de um mês (D-026): quanto das contas a pagar com vencimento no mês cabe na renda de referência.
 * Ordem da spec2 §4.5: destaque e medidor, composição (com a linha de dívidas), "Fora dos compromissos", metas (Ciclo C,
 * fora do percentual), renda de referência, contas do mês, próximos meses, critério escrito e links. Cor nunca julga e
 * "Fora dos compromissos" nunca é chamado de saldo. Falha de carga: erro com "Tentar novamente", nunca 0%.
 * `?mes=AAAA-MM` escolhe o mês (sem ele, o mês do Resumo). Os valores em reais seguem "Ocultar valores" (A2).
 */
export default function RendaComprometidaScreen() {
  const { today } = useSession();
  const { month: viewMonth } = useView();
  const params = useLocalSearchParams<{ mes?: string }>();
  const month: IsoMonth = typeof params.mes === 'string' && isValidIsoMonth(params.mes) ? params.mes : viewMonth;
  const contextId = useSpace().data?.personalContextId;
  const [notice] = useFlash();
  const [direction, setDirection] = useState<1 | -1>(1);
  // A primeira exibição não desliza; só a troca de mês, na direção escolhida (CL-V008).
  const [switched, setSwitched] = useState(false);

  // Mês em exibição e, no mês corrente, o seguinte; de um mês passado, o mês seguinte a ele.
  const current = monthOf(today);
  const base = month < current ? month : current;
  const months = [...new Set([base, addMonths(base, 1), month])].sort();

  const pick = (m: IsoMonth) => {
    if (m === month) return;
    setDirection(m > month ? 1 : -1);
    setSwitched(true);
    router.setParams({ mes: m });
  };
  const entering = switched ? (direction > 0 ? FadeInRight : FadeInLeft).duration(motion.context).reduceMotion(ReduceMotion.System) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={COMMITTED_TEXT.title} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <FlashBanner message={notice} />
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Mês">
          {months.map((m) => (
            <Chip
              key={m}
              label={monthChipLabel(m, today)}
              accessibilityLabel={`${COMMITTED_TEXT.title} de ${formatMonthYearBR(m)}`}
              selected={m === month}
              onPress={() => pick(m)}
            />
          ))}
        </View>
        <Animated.View key={month} entering={entering} style={{ gap: space[4] }}>
          <MonthBody contextId={contextId} month={month} />
        </Animated.View>
      </Screen>
    </View>
  );
}

function Title({ children }: { children: string }) {
  return (
    <Txt variant="title" accessibilityRole="header" aria-level={2}>
      {children}
    </Txt>
  );
}

function openReference(month: IsoMonth) {
  router.push({ pathname: '/renda-comprometida/referencia', params: { mes: month } });
}

function MonthBody({ contextId, month }: { contextId: string | undefined; month: IsoMonth }) {
  const { today } = useSession();
  const summary = useCommittedSummary(contextId, month, { withSeries: true });
  const records = useMonthRecords(contextId, month);
  const s = summary.data;
  if (summary.isPending) return <LoadingBlocks />;
  if (summary.isError || !s) {
    return (
      <Card>
        <ErrorState message={COMMITTED_TEXT.loadError} onRetry={() => summary.refetch()} />
      </Card>
    );
  }
  // O Recebido só entra na linha da referência quando os registros do mês carregaram (nunca um R$ 0,00 por falha) e
  // o mês já começou (de um mês futuro ainda não há o que mostrar).
  const received = month <= monthOf(today) ? (records.summary?.receivedCents ?? null) : null;
  const t = committedTexts(s, received);
  return (
    <>
      <Highlight s={s} t={t} />
      <LimitCard contextId={contextId} s={s} />
      <Composition s={s} t={t} />
      <Outside t={t} />
      <AnnualShareCard s={s} t={t} />
      <GoalLinesCard contextId={contextId} month={month} />
      <ReferenceCard s={s} t={t} />
      <MonthBills s={s} />
      <Upcoming contextId={contextId} month={month} />
      <HowWeCalculate t={t} />
      <Links month={month} currentMonth={monthOf(today)} />
    </>
  );
}

function LoadingBlocks() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Carregando a renda comprometida" style={{ gap: space[4] }}>
      <Card style={{ gap: space[3] }}>
        <Skeleton width={120} height={40} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="100%" height={16} />
      </Card>
      <Card style={{ gap: space[3] }}>
        <Skeleton width="100%" height={44} />
        <Skeleton width="100%" height={44} />
        <Skeleton width="100%" height={44} />
      </Card>
    </View>
  );
}

/** Percentual (o único número grande), medidor e legenda; sem referência, só o valor em reais e o convite. */
function Highlight({ s, t }: { s: CommittedSummary; t: CommittedTexts }) {
  const mask = useMoneyMask();
  if (t.noReference) {
    return (
      <Card style={{ gap: space[3] }}>
        <View style={{ gap: space[1] }}>
          <Txt variant="label" color={colors.textSecondary}>
            {t.noReference.label}
          </Txt>
          <FitText text={mask.text(t.noReference.amount)} accessibilityLabel={mask.hidden ? HIDDEN_MONEY_A11Y : undefined} />
        </View>
        <Txt>{t.noReference.hint}</Txt>
        <Button label={t.noReference.button} onPress={() => openReference(s.month)} />
        {t.empty ? <Txt color={colors.textSecondary}>{t.empty}</Txt> : null}
        <TermHint term="Renda comprometida" slug="renda-comprometida" />
      </Card>
    );
  }
  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ gap: space[1] }}>
        {t.highlight ? <FitText text={t.highlight} /> : null}
        <Txt color={colors.textSecondary}>{t.highlightCaption}</Txt>
        {t.highlightAmounts ? <MoneyTxt style={[tabular, { fontFamily: fonts.bold }]}>{t.highlightAmounts}</MoneyTxt> : null}
      </View>
      {t.empty ? <Txt>{t.empty}</Txt> : null}
      {s.meter ? (
        <Meter
          paidPermille={s.meter.paidPermille}
          openPermille={s.meter.openPermille}
          over={s.meter.over}
          height={16}
          label={t.meterA11y ? mask.label(t.meterA11y) : undefined}
        />
      ) : null}
      {s.count > 0 ? <MeterLegend paid={t.meterPaid} open={t.meterOpen} /> : null}
      <TermHint term="Renda comprometida" slug="renda-comprometida" />
    </Card>
  );
}

/**
 * "Seu limite" (D-041): o limite que a pessoa escolheu para a renda comprometida, de 10% a 100%, a partir de um mês. Só aparece com
 * a renda de referência definida. Nunca vem preenchido nem sugerido: sem limite, o convite "Escolher meu limite". Com limite,
 * "28,0% de 30% que você escolheu" e, a 5 pontos do limite ou depois dele, uma linha neutra com o mês ("Novembro passou 3,5 pontos
 * do limite de 30% que você escolheu."). Sem cor de alerta. A referência de 30% das dívidas continua só na linha de dívidas.
 */
function LimitCard({ contextId, s }: { contextId: string | undefined; s: CommittedSummary }) {
  const { today } = useSession();
  const limits = useCommitmentLimits(contextId);
  if (s.referenceCents === null) return null;
  const open = () => router.push({ pathname: '/renda-comprometida/limite', params: { mes: s.month } });
  if (limits.isPending) {
    return (
      <Card>
        <Skeleton width="60%" height={20} />
      </Card>
    );
  }
  if (limits.isError || !limits.data) {
    return (
      <Card>
        <ErrorState message={COMMITTED_TEXT.loadError} onRetry={() => limits.refetch()} />
      </Card>
    );
  }
  const limit = limitFor(limits.data, s.month);
  const status = limit ? limitStatus(s.month, s.committedPermille, s.committedCents, limit.percent, today) : null;
  return (
    <Card style={{ gap: space[2] }}>
      <Title>{LIMIT_TEXT.title}</Title>
      {status ? (
        <>
          <Txt style={[tabular, { fontFamily: fonts.bold }]}>{status.line}</Txt>
          {status.note ? <Txt>{status.note}</Txt> : null}
          <LinkButton label={LIMIT_TEXT.change} style={styles.inlineLink} onPress={open} />
        </>
      ) : (
        <>
          <Txt color={colors.textSecondary}>{LIMIT_TEXT.none}</Txt>
          <Button label={LIMIT_TEXT.choose} tone="soft" onPress={open} />
        </>
      )}
    </Card>
  );
}

/** Gastos fixos, contas do ano, parcelamentos e outras contas, cada um com a barra na escala da renda; depois, as dívidas. */
function Composition({ s, t }: { s: CommittedSummary; t: CommittedTexts }) {
  if (s.count === 0) return null;
  const hasReference = s.referenceCents !== null;
  return (
    <Card style={{ gap: space[1] }}>
      <Title>Composição</Title>
      {t.groups.map((g) => (
        <GroupRow key={g.group} g={g} hasReference={hasReference} />
      ))}
      {t.debt ? <DebtBlock s={s} debt={t.debt} /> : null}
      {t.invoiceNote ? (
        <Txt variant="caption" color={colors.textSecondary} style={{ paddingTop: space[2] }}>
          {t.invoiceNote}
        </Txt>
      ) : null}
      {/* Com dívidas ou faturas de cartão no mês: o caminho para a conta da ordem de pagamento (só a conta, nada é gravado). */}
      {t.debt || t.invoiceNote ? <OrderLink /> : null}
    </Card>
  );
}

/** "Em que ordem quitar? Fazer as contas": abre a calculadora (D-040), que lê os parcelamentos e não grava nada. */
function OrderLink() {
  return <LinkButton label={CALC_UI_TEXT.links.ordem} icon={ListOrdered} style={styles.inlineLink} onPress={() => openCalc('plano-dividas')} />;
}

function GroupRow({ g, hasReference }: { g: CommittedGroupLine; hasReference: boolean }) {
  return (
    <View style={styles.groupRow}>
      <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold }]} accessibilityLabel={g.a11yLabel}>
        {g.line}
      </MoneyTxt>
      {hasReference ? <GroupBar permille={g.permille ?? 0} /> : null}
    </View>
  );
}

/**
 * Linha de dívidas (parcelamentos de financiamento, empréstimo e compra parcelada; contas do ano nunca). A referência de
 * 30% da renda líquida (Serasa, P-024) aparece só aqui, com a fonte, e pode ser ocultada; é uma referência geral, não uma
 * regra. Sem renda de referência não há percentual, então também não há a marca de 30%.
 */
function DebtBlock({ s, debt }: { s: CommittedSummary; debt: string }) {
  const [shown, setShown] = useState(true);
  const [linkFailed, setLinkFailed] = useState(false);
  const hasReference = s.referenceCents !== null;
  const openSource = () => {
    setLinkFailed(false);
    // Linking do React Native: no aparelho abre o navegador; na web, uma janela nova (o app continua aberto).
    Linking.openURL(DEBT_REFERENCE.url).catch(() => setLinkFailed(true));
  };
  return (
    <View style={styles.debt}>
      <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold }]}>
        {debt}
      </MoneyTxt>
      {hasReference ? <GroupBar permille={s.debtPermille ?? 0} markPermille={shown ? DEBT_REFERENCE.permille : undefined} markLabel="30%" /> : null}
      {hasReference && shown ? (
        <View style={{ gap: space[1] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            {COMMITTED_TEXT.debtReference}
          </Txt>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={COMMITTED_TEXT.debtReferenceSource}
            accessibilityHint={LEARN_UI_TEXT.externalLinkHint}
            onPress={openSource}
            style={(st) => [styles.source, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
            <Txt variant="caption" color={colors.brand} style={{ fontFamily: fonts.bold, flexShrink: 1 }}>
              {COMMITTED_TEXT.debtReferenceSource}
            </Txt>
            <ExternalLink size={16} color={colors.brand} aria-hidden />
          </Pressable>
          {linkFailed ? (
            <Banner tone="info">
              <Txt variant="label">{LEARN_UI_TEXT.linkFailed}</Txt>
            </Banner>
          ) : null}
        </View>
      ) : null}
      {hasReference ? (
        <LinkButton
          label={shown ? COMMITTED_TEXT.hideReference : COMMITTED_TEXT.showReference}
          style={styles.inlineLink}
          accessibilityState={{ expanded: shown }}
          onPress={() => setShown((v) => !v)}
        />
      ) : null}
      <TermHint term="Custo efetivo total (CET)" slug="cet" />
    </View>
  );
}

/**
 * "Fora dos compromissos" (renda de referência menos o comprometido; não é saldo), os valores estimados, as vencidas de
 * meses anteriores (só no mês corrente, fora do percentual) e, acima da referência, a frase neutra no lugar do valor.
 */
function Outside({ t }: { t: CommittedTexts }) {
  if (!t.outside && !t.overReference && !t.estimated && !t.overdueBefore) return null;
  return (
    <Card style={{ gap: space[2] }}>
      {t.outside ? (
        <View style={{ gap: space[1] }}>
          <MoneyTxt variant="title" style={tabular}>
            {t.outside}
          </MoneyTxt>
          <Txt variant="caption" color={colors.textSecondary}>
            {t.outsideNote}
          </Txt>
        </View>
      ) : null}
      {t.overReference ? <MoneyTxt style={{ fontFamily: fonts.bold }}>{t.overReference}</MoneyTxt> : null}
      {t.estimated ? <MoneyTxt>{t.estimated}</MoneyTxt> : null}
      {t.overdueBefore ? (
        <View style={{ gap: space[1] }}>
          <MoneyTxt>{t.overdueBefore}</MoneyTxt>
          <LinkButton label={COMMITTED_TEXT.seeOverdue} icon={ListChecks} style={styles.inlineLink} onPress={() => router.push('/a-pagar/vencidas')} />
        </View>
      ) : null}
    </Card>
  );
}

/** Contas do ano ÷ 12 (P-019): só informativo, fora do percentual. */
function AnnualShareCard({ s, t }: { s: CommittedSummary; t: CommittedTexts }) {
  if (!t.annualShare) return null;
  return (
    <Card style={{ gap: space[1] }}>
      <MoneyTxt style={tabular}>{t.annualShare}</MoneyTxt>
      <Txt variant="caption" color={colors.textSecondary}>
        {t.annualShareNote}
        {s.annualShare?.estimated ? ` ${COMMITTED_TEXT.annualShareEstimated}` : ''}
      </Txt>
    </Card>
  );
}

/**
 * Metas (Ciclo C, D-027): guardado no mês, planejado por mês e o que fica fora dos compromissos depois do planejado.
 * Nada disso entra no percentual. Só aparece com alguma meta; falha de carga mostra o erro, nunca um valor.
 */
function GoalLinesCard({ contextId, month }: { contextId: string | undefined; month: IsoMonth }) {
  const goals = useCommittedGoalLines(contextId, month);
  if (goals.isPending) return null;
  if (goals.isError || !goals.data) {
    return (
      <Card>
        <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => goals.refetch()} />
      </Card>
    );
  }
  if (!goals.data.hasGoals) return null;
  const { lines } = goals.data;
  return (
    <Card style={{ gap: space[2] }}>
      <Title>Metas</Title>
      <MoneyTxt style={tabular}>{lines.saved}</MoneyTxt>
      {lines.planned ? <MoneyTxt style={tabular}>{lines.planned}</MoneyTxt> : null}
      {lines.outsideAfterPlanned ? <MoneyTxt style={[tabular, { fontFamily: fonts.bold }]}>{lines.outsideAfterPlanned}</MoneyTxt> : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {lines.note}
      </Txt>
    </Card>
  );
}

/** Renda de referência vigente: valor e desde quando, Recebido do mês ao lado e "Alterar" ou, se varia, "Revisar". */
function ReferenceCard({ s, t }: { s: CommittedSummary; t: CommittedTexts }) {
  if (!t.reference) return null;
  return (
    <Card style={{ gap: space[2] }}>
      <Title>Renda de referência</Title>
      <MoneyTxt style={[tabular, { fontFamily: fonts.bold }]}>{t.reference}</MoneyTxt>
      {t.received ? <MoneyTxt color={colors.textSecondary}>{t.received}</MoneyTxt> : null}
      {t.review ? (
        <>
          <Txt>{t.review}</Txt>
          <Button label={COMMITTED_TEXT.review} tone="soft" onPress={() => openReference(s.month)} />
        </>
      ) : (
        <LinkButton label={COMMITTED_TEXT.change} style={styles.inlineLink} onPress={() => openReference(s.month)} />
      )}
    </Card>
  );
}

/** As contas do mês, agrupadas como na composição; o toque abre a conta a pagar. */
function MonthBills({ s }: { s: CommittedSummary }) {
  const { today } = useSession();
  if (s.count === 0) return null;
  const groups = COMMITTED_GROUPS.filter((g) => s.items[g].length > 0);
  return (
    <Card style={{ gap: space[1] }}>
      <Title>{COMMITTED_TEXT.monthBills}</Title>
      {groups.map((g) => (
        <View key={g} style={{ gap: 0 }}>
          <Txt variant="label" color={colors.textSecondary} style={styles.groupTitle} accessibilityRole="header" aria-level={3}>
            {COMMITTED_TEXT.groupLabel[g]}
          </Txt>
          {s.items[g].map((c, i, all) => (
            <CommitmentRow key={c.id} commitment={c} today={today} last={i === all.length - 1} onPress={() => openCommitment(c)} />
          ))}
        </View>
      ))}
    </Card>
  );
}

/** Seis meses seguintes, sempre "Previsto", na mesma escala do medidor, e os marcos de "O que muda". */
function Upcoming({ contextId, month }: { contextId: string | undefined; month: IsoMonth }) {
  const { today } = useSession();
  const upcoming = useCommittedUpcoming(contextId, month);
  const limits = useCommitmentLimits(contextId);
  const p = upcoming.data;
  // Meses previstos que passam do limite escolhido, com a mesma frase curta; sem limite (ou sem leitura dele), nenhuma marca.
  const notes = p && limits.data ? limitNotesFor(p.months, limits.data, today) : {};
  return (
    <Card style={{ gap: space[2] }}>
      <Title>{COMMITTED_TEXT.upcomingTitle}</Title>
      {upcoming.isPending ? (
        <View style={{ gap: space[3] }}>
          <Skeleton width="100%" height={40} />
          <Skeleton width="100%" height={40} />
        </View>
      ) : upcoming.isError || !p ? (
        <ErrorState message={COMMITTED_TEXT.loadError} onRetry={() => upcoming.refetch()} />
      ) : (
        <>
          <Txt variant="caption" color={colors.textSecondary}>
            {COMMITTED_TEXT.upcomingLegend}
          </Txt>
          {p.months.map((m) => (
            <View key={m.month} style={styles.groupRow}>
              <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold }]} accessibilityLabel={m.a11yLabel}>
                {m.text}
              </MoneyTxt>
              {m.meter ? <Meter paidPermille={m.meter.paidPermille} openPermille={m.meter.openPermille} over={m.meter.over} height={8} /> : null}
              {notes[m.month] ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {notes[m.month]}
                </Txt>
              ) : null}
            </View>
          ))}
          {p.milestones.length > 0 ? (
            <View style={styles.milestones}>
              <Txt variant="label" accessibilityRole="header" aria-level={3} style={{ fontFamily: fonts.bold }}>
                {COMMITTED_TEXT.milestonesTitle}
              </Txt>
              {p.milestones.map((m) => (
                <MoneyTxt key={`${m.kind}-${m.seriesId}-${m.month}`} variant="label" style={tabular}>
                  {m.text}
                </MoneyTxt>
              ))}
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** O critério escrito do mês e o caminho para a explicação. */
function HowWeCalculate({ t }: { t: CommittedTexts }) {
  return (
    <Card style={{ gap: space[2] }}>
      <Title>{COMMITTED_TEXT.howTitle}</Title>
      <Txt>{t.how}</Txt>
      <TopicLink slug="renda-comprometida" label={COMMITTED_TEXT.howLink} style={styles.inlineLink} />
    </Card>
  );
}

/** "Contas a pagar" abre no mês da tela (e no endereço limpo quando é o mês atual). */
function Links({ month, currentMonth }: { month: IsoMonth; currentMonth: IsoMonth }) {
  return (
    <View style={{ gap: space[1], alignItems: 'center' }}>
      <LinkButton label={COMMITTED_TEXT.links.series} icon={Repeat} onPress={() => router.push('/gastos-fixos')} />
      <LinkButton label={COMMITTED_TEXT.links.payables} icon={Wallet} onPress={() => router.push({ pathname: '/a-pagar', params: payablesMonthParams(month, currentMonth) })} />
      <LinkButton label={COMMITTED_TEXT.links.whoSees} icon={ShieldCheck} color={colors.textSecondary} onPress={() => router.push('/quem-ve')} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  groupRow: { gap: space[2], paddingVertical: space[2] },
  groupTitle: { fontFamily: fonts.bold, paddingTop: space[2] },
  debt: { gap: space[2], paddingTop: space[3], marginTop: space[2], borderTopWidth: 1, borderTopColor: colors.border },
  source: { flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 44, borderRadius: radius.sm },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  milestones: { gap: space[1], paddingTop: space[3], marginTop: space[1], borderTopWidth: 1, borderTopColor: colors.border },
});
