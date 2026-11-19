import {
  BUSINESS_TEXT,
  BUSINESS_WORDS,
  PAYABLES_NAV_TEXT,
  addMonths,
  businessErrorText,
  businessMonthShort,
  businessPeriodText,
  businessResultText,
  formatBRL,
  formatMonthBR,
  formatMonthYearBR,
  type BusinessContext,
  type BusinessMonth,
} from '@clarevo/core';
import { router, useFocusEffect } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, HandCoins, Pencil, Plus, ShieldCheck, Store, Trash2 } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { useIsSeededDemo } from '@/components/family-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { MonthStepper } from '@/components/month-stepper';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useValuesHidden } from '@/lib/privacy';
import { useAccessCanWrite } from '@/state/access';
import { useBusiness, useEndBusiness } from '@/state/business';
import { useBusinessOverview, useView } from '@/state/data';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;

/**
 * Seu negócio (D-113, D-113b). Sem negócio: o que é o espaço Negócio e "Criar o espaço Negócio". Com negócio: o mês (entrou, saiu e
 * sobrou, numa cor só, com a frase de fato), as retiradas para o Pessoal à parte, os últimos meses, as maiores saídas do mês, a retirada,
 * o nome e encerrar. Abrir esta tela escolhe o negócio no seletor: anotar daqui vai para o negócio.
 */
export default function NegocioScreen() {
  const business = useBusiness();
  const [notice, setNotice] = useFlash();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.overviewTitle} right={<ContextPill label={business.data?.name ?? T.context} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {business.isPending ? (
          <LoadingState label={T.loading} />
        ) : business.isError ? (
          <ErrorState message={T.loadFailed} onRetry={() => business.refetch()} />
        ) : business.data ? (
          <BusinessOverview business={business.data} notice={notice} setNotice={setNotice} />
        ) : (
          <NoBusiness notice={notice} />
        )}
        <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
          <ShieldCheck size={18} color={colors.textSecondary} />
          <Txt variant="label" color={colors.textSecondary}>
            Quem vê estes dados?
          </Txt>
        </Pressable>
      </Screen>
    </View>
  );
}

/** Sem negócio: para que serve e "Criar o espaço Negócio". */
function NoBusiness({ notice }: { notice: string | null }) {
  const demo = useIsSeededDemo();
  const canWrite = useAccessCanWrite();
  return (
    <>
      <FlashBanner message={notice} />
      <Card>
        <EmptyState
          title={T.accountTitle}
          action={canWrite ? <Button label={T.accountCreate} icon={Plus} onPress={() => router.push('/negocio/novo')} /> : undefined}>
          {T.intro}
        </EmptyState>
      </Card>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.light}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.included}
      </Txt>
      {demo ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {T.demoOnly}
        </Txt>
      ) : null}
    </>
  );
}

function BusinessOverview({ business, notice, setNotice }: { business: BusinessContext; notice: string | null; setNotice: (t: string | null) => void }) {
  const { month, setMonth, currentMonth, space: active, setSpace } = useView();
  const canWrite = useAccessCanWrite();
  const overview = useBusinessOverview(business.id, month);
  const end = useEndBusiness();
  const keys = useFamilyKeys();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Abrir (ou voltar a) "Seu negócio" escolhe o negócio no seletor: anotar daqui vai para o negócio. Só ao ganhar o foco
  // (D-113a): com esta tela embaixo na pilha, mover um lançamento para o Pessoal troca o seletor, e a troca precisa ficar.
  const activeRef = useRef(active);
  activeRef.current = active;
  useFocusEffect(
    useCallback(() => {
      if (activeRef.current !== 'negocio') setSpace('negocio');
    }, [setSpace]),
  );

  const prev = addMonths(month, -1);
  const next = month < currentMonth ? addMonths(month, 1) : null;

  async function doEnd() {
    setError(null);
    setNotice(null);
    const r = await attemptFamily(keys, `encerrar:${business.id}`, (key) => end.mutateAsync({ key, contextId: business.id }));
    setConfirmEnd(false);
    if (r.ok) {
      setSpace('pessoal');
      flash.set(T.ended);
      router.replace('/conta');
      return;
    }
    setError(businessErrorText(r.code));
  }

  return (
    <>
      <FlashBanner message={notice} />
      {error ? (
        <Banner tone="erro">
          <Txt variant="label" color={colors.error}>
            {error}
          </Txt>
        </Banner>
      ) : null}
      <View style={{ gap: space[1] }}>
        <MonthStepper
          groupLabel="Mês mostrado"
          label={`${business.name} · ${formatMonthBR(month)}`}
          prevLabel={PAYABLES_NAV_TEXT.previous(prev)}
          nextLabel={next ? PAYABLES_NAV_TEXT.next(next) : 'Próximo mês'}
          onPrev={() => setMonth(prev)}
          onNext={next ? () => setMonth(next) : null}
        />
        {month !== currentMonth ? (
          <LinkButton label={PAYABLES_NAV_TEXT.backToCurrent(currentMonth)} style={styles.inlineLink} onPress={() => setMonth(currentMonth)} />
        ) : null}
      </View>

      {overview.isPending ? (
        <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel={T.loading}>
          <Skeleton width="100%" height={180} style={{ borderRadius: radius.lg }} />
          <Skeleton width="100%" height={220} style={{ borderRadius: radius.lg }} />
        </View>
      ) : overview.isError || !overview.data ? (
        <Card>
          <ErrorState message={T.loadFailed} onRetry={() => overview.refetch()} />
        </Card>
      ) : (
        <>
          <MonthCard m={overview.data.current} />
          {canWrite ? (
            <View style={{ gap: space[3] }}>
              <Button label={T.withdraw} icon={HandCoins} tone="soft" onPress={() => router.push('/negocio/retirada')} />
              <Txt variant="caption" color={colors.textSecondary}>
                {T.withdrawHint}
              </Txt>
              <View style={styles.actions}>
                <Button
                  label={BUSINESS_WORDS.addIn}
                  icon={ArrowDownLeft}
                  tone="soft"
                  style={{ flexGrow: 1 }}
                  onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'receita' } })}
                />
                <Button
                  label={BUSINESS_WORDS.addOut}
                  icon={ArrowUpRight}
                  tone="soft"
                  style={{ flexGrow: 1 }}
                  onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa' } })}
                />
              </View>
            </View>
          ) : null}
          <LastMonthsCard months={overview.data.months} />
          <TopOutCard lines={overview.data.topOut} />
          <Txt variant="caption" color={colors.textSecondary}>
            {T.notAdvice}
          </Txt>
        </>
      )}

      <Card style={{ gap: space[3] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {T.settingsTitle}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.chatNote}
        </Txt>
        {canWrite ? <Button label={T.rename} icon={Pencil} tone="soft" onPress={() => router.push('/negocio/nome')} /> : null}
        <Button label={T.end} icon={Trash2} tone="danger" onPress={() => setConfirmEnd(true)} />
      </Card>

      <ConfirmDialog
        visible={confirmEnd}
        title={T.endTitle}
        cancelLabel="Cancelar"
        confirmLabel={T.endConfirm}
        busy={end.isPending}
        onCancel={() => setConfirmEnd(false)}
        onConfirm={doEnd}>
        <Txt style={{ fontFamily: fonts.bold }}>{business.name}</Txt>
        <Txt color={colors.textSecondary}>{T.endBody}</Txt>
      </ConfirmDialog>
    </>
  );
}

/** O mês: entrou, saiu e sobrou numa cor só, a frase de fato e, se houver, as retiradas à parte. */
function MonthCard({ m }: { m: BusinessMonth }) {
  // Com valores ocultos, as frases que dizem se entrou ou saiu a mais somem (D-113a): o valor fica R$ ••••, e a direção não aparece.
  const hidden = useValuesHidden();
  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Store size={20} color={colors.brandText} aria-hidden />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          {formatMonthBR(m.month)}
        </Txt>
      </View>
      {m.recordCount === 0 ? (
        <Txt color={colors.textSecondary}>{T.emptyMonth}</Txt>
      ) : (
        <>
          <View style={styles.figures}>
            <Figure label={T.inLabel} caption={T.inCaption} cents={m.inCents} />
            <Figure label={T.outLabel} caption={T.outCaption} cents={m.outCents} />
            <Figure label={T.leftLabel} cents={m.leftCents} strong />
          </View>
          {hidden ? null : <MoneyTxt>{businessResultText(m)}</MoneyTxt>}
          {m.withdrawnCents > 0 ? (
            <View style={{ gap: space[1] }}>
              <MoneyTxt variant="label" color={colors.textSecondary}>
                {T.withdrawnLine(m.withdrawnCents)}
              </MoneyTxt>
              {hidden ? null : (
                <MoneyTxt variant="label" color={colors.textSecondary}>
                  {T.keptLine(m.keptCents)}
                </MoneyTxt>
              )}
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

function Figure({ label, caption, cents, strong }: { label: string; caption?: string; cents: number; strong?: boolean }) {
  const mask = useMoneyLabelMask();
  return (
    <View style={styles.figure} accessible accessibilityLabel={mask(`${label}: ${formatBRL(cents)}`)}>
      <Txt variant="label" color={colors.textSecondary}>
        {label}
      </Txt>
      <MoneyTxt variant="title" style={{ fontFamily: strong ? fonts.bold : fonts.semibold }}>
        {formatBRL(cents)}
      </MoneyTxt>
      {caption ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {caption}
        </Txt>
      ) : null}
    </View>
  );
}

/** Os últimos meses: entrou, saiu e sobrou de cada um, sem as retiradas, e a frase do período. */
function LastMonthsCard({ months }: { months: BusinessMonth[] }) {
  const hidden = useValuesHidden();
  // Com valores ocultos, a frase do período (em quantos meses entrou mais do que saiu) some, como as frases do mês (D-113a).
  const period = hidden ? null : businessPeriodText(months);
  const mask = useMoneyLabelMask();
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.lastMonthsTitle}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.lastMonthsNote}
      </Txt>
      <View>
        {months.map((m, i) => (
          <View key={m.month} style={[styles.monthRow, i < months.length - 1 && styles.rowLine]} accessible accessibilityLabel={mask(T.monthRowA11y(m, hidden))}>
            <Txt variant="label" style={{ fontFamily: fonts.bold, minWidth: 44 }} accessibilityLabel={formatMonthYearBR(m.month)}>
              {businessMonthShort(m.month)}
            </Txt>
            <View style={{ flex: 1, gap: 2 }}>
              <MoneyTxt variant="caption" color={colors.textSecondary}>
                {`${T.inLabel} ${formatBRL(m.inCents)} · ${T.outLabel} ${formatBRL(m.outCents)}`}
              </MoneyTxt>
              <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
                {m.recordCount === 0 ? 'Nada anotado' : `${T.leftLabel} ${formatBRL(m.leftCents)}`}
              </MoneyTxt>
            </View>
          </View>
        ))}
      </View>
      {period ? <MoneyTxt variant="label">{period}</MoneyTxt> : null}
    </Card>
  );
}

/** As maiores saídas do mês por categoria, com uma barra numa cor só. */
function TopOutCard({ lines }: { lines: { category: string; cents: number; share: number }[] }) {
  const mask = useMoneyLabelMask();
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.topOutTitle}
      </Txt>
      {lines.length === 0 ? (
        <Txt color={colors.textSecondary}>{T.noOut}</Txt>
      ) : (
        lines.map((l) => (
          <View key={l.category} style={{ gap: space[1] }} accessible accessibilityLabel={mask(T.topOutA11y(l))}>
            <View style={styles.topRow}>
              <Txt variant="label" style={{ flex: 1 }} numberOfLines={2}>
                {l.category}
              </Txt>
              <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
                {formatBRL(l.cents)}
              </MoneyTxt>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(2, Math.round(l.share * 100))}%` }]} />
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
  inlineLink: { alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4] },
  figure: { flexGrow: 1, flexBasis: 120, gap: 2 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2], minHeight: 44 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.border },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
