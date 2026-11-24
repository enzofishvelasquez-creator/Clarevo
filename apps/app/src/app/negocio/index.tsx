import {
  BUSINESS_PEOPLE_TEXT,
  BUSINESS_PROFILES,
  BUSINESS_PROFILE_LABEL,
  BUSINESS_PROFILE_NONE_LABEL,
  BUSINESS_TEXT,
  BUSINESS_WORDS,
  PAYABLES_NAV_TEXT,
  addMonths,
  businessErrorText,
  businessPeopleVisible,
  canEndBusiness,
  businessMonthShort,
  businessPeriodText,
  businessResultText,
  formatBRL,
  formatMonthBR,
  formatMonthYearBR,
  meiLimit,
  type BusinessContext,
  type BusinessMonth,
  type BusinessProfile,
  type IsoMonth,
} from '@clarevo/core';
import { router, useFocusEffect } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, CalendarRange, Download, HandCoins, Pencil, Plus, ShieldCheck, Store, Trash2, Wallet } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BusinessPeopleSection } from '@/components/business-people';
import { ConfirmDialog } from '@/components/dialog';
import { useIsSeededDemo } from '@/components/family-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { MonthStepper } from '@/components/month-stepper';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Chip, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useValuesHidden } from '@/lib/privacy';
import { useAccessCanWrite } from '@/state/access';
import { useBusiness, useEndBusiness, useSetBusinessProfile, useSharedBusinessPeople } from '@/state/business';
import { useBusinessOverview, useBusinessYear, useView } from '@/state/data';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;

/**
 * Seu negócio (D-113, D-113b, D-121). Sem negócio: o que é o espaço Negócio e "Criar o espaço Negócio". Com negócio: o mês (entrou, saiu e
 * sobrou da operação, numa cor só, com a frase de fato), o que ficou fora da operação e as retiradas para o Pessoal à parte, com o que
 * ficou no negócio, a retirada e o dinheiro trazido do Pessoal, o limite do MEI (só com o tipo MEI), o "Resumo do ano", os últimos meses,
 * as maiores saídas do mês, o tipo do negócio, o nome e encerrar (com a oferta de exportar antes). Abrir esta tela escolhe o negócio no seletor: anotar daqui vai para o negócio. Negócio compartilhado (D-116, D-120):
 * "Pessoas do negócio" só com o Plus aberto, para quem não administra ou quando já há outras pessoas; quem só vê não encontra as ações
 * de anotar, e só quem administra muda o nome e encerra.
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
  // Quem só vê o negócio (leitor, D-116) não anota nem retira, como na Família; só quem administra muda o nome e encerra.
  const canWrite = useAccessCanWrite() && business.role !== 'leitor';
  const owner = business.role === 'titular';
  const people = useSharedBusinessPeople(business);
  const showPeople = people.data ? businessPeopleVisible(people.data) : false;
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
              <Button label={T.contribute} icon={Wallet} tone="soft" onPress={() => router.push('/negocio/trazer')} />
              <Txt variant="caption" color={colors.textSecondary}>
                {T.contributeHint}
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
          {business.businessProfile === 'mei' ? <MeiCard contextId={business.id} month={month} currentMonth={currentMonth} /> : null}
          <View style={{ gap: space[2] }}>
            <Button
              label={T.yearLink}
              icon={CalendarRange}
              tone="soft"
              onPress={() => router.push({ pathname: '/negocio/ano', params: { ano: month.slice(0, 4) } })}
            />
            <Txt variant="caption" color={colors.textSecondary}>
              {T.yearLinkHint}
            </Txt>
          </View>
          <LastMonthsCard months={overview.data.months} />
          <TopOutCard lines={overview.data.topOut} />
          <Txt variant="caption" color={colors.textSecondary}>
            {T.notAdvice}
          </Txt>
        </>
      )}

      {showPeople && people.data ? <BusinessPeopleSection business={business} people={people.data} setNotice={setNotice} /> : null}

      {owner && canWrite ? <ProfileCard business={business} /> : null}

      {owner ? (
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.settingsTitle}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.chatNote}
          </Txt>
          {canWrite ? <Button label={T.rename} icon={Pencil} tone="soft" onPress={() => router.push('/negocio/nome')} /> : null}
          {/* Com outras pessoas ativas, encerrar não vale (negocio_com_membros): a frase diz o que fazer antes. */}
          {people.data && !canEndBusiness(people.data.members) ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {BUSINESS_PEOPLE_TEXT.endBlocked}
            </Txt>
          ) : (
            <Button label={T.end} icon={Trash2} tone="danger" onPress={() => setConfirmEnd(true)} />
          )}
        </Card>
      ) : (
        <Txt variant="caption" color={colors.textSecondary}>
          {T.chatNote}
        </Txt>
      )}

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
        {/* D-121: antes de confirmar, a cópia dos lançamentos (a exportação de sempre, com o negócio e todo o período escolhidos). */}
        <Txt color={colors.textSecondary}>{T.endKeep}</Txt>
        <Button
          label={T.endExport}
          icon={Download}
          tone="soft"
          disabled={end.isPending}
          onPress={() => {
            setConfirmEnd(false);
            router.push({ pathname: '/conta/exportar', params: { espaco: 'negocio', periodo: 'tudo' } });
          }}
        />
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
          {/* Fora da operação (D-121): o que entrou ou saiu sem ser venda nem gasto do dia a dia, com a frase do porquê. */}
          {m.outside.length > 0 ? <OutsideBlock m={m} /> : null}
          {m.withdrawnCents > 0 || m.outside.length > 0 ? (
            <View style={{ gap: space[1] }}>
              {m.withdrawnCents > 0 ? (
                <MoneyTxt variant="label" color={colors.textSecondary}>
                  {T.withdrawnLine(m.withdrawnCents)}
                </MoneyTxt>
              ) : null}
              {hidden ? null : (
                <MoneyTxt variant="label" color={colors.textSecondary}>
                  {T.keptLine(m.keptCents, m.outside.length > 0, m.withdrawnCents > 0)}
                </MoneyTxt>
              )}
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Fora da operação no mês: cada categoria com o que entrou ou saiu, numa cor só, e a frase do porquê. */
function OutsideBlock({ m }: { m: BusinessMonth }) {
  const mask = useMoneyLabelMask();
  return (
    <View style={styles.outside}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
        {T.outsideTitle}
      </Txt>
      {m.outside.map((l) => (
        <View key={`${l.kind}|${l.category}`} style={styles.topRow} accessible accessibilityLabel={mask(T.outsideA11y(l))}>
          <Txt variant="label" style={{ flex: 1 }} numberOfLines={2}>
            {`${l.kind === 'receita' ? T.outsideIn : T.outsideOut} · ${l.category}`}
          </Txt>
          <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
            {formatBRL(l.cents)}
          </MoneyTxt>
        </View>
      ))}
      <Txt variant="caption" color={colors.textSecondary}>
        {T.outsideWhy}
      </Txt>
    </View>
  );
}

/**
 * Limite do MEI (D-121), só com o tipo MEI: as vendas e os serviços anotados no ano do mês mostrado e a parte do limite anual, como fato,
 * numa cor só. Acima de 100%, só o fato e "Converse com a sua contabilidade.". Com valores ocultos, sem a parte do limite.
 */
function MeiCard({ contextId, month, currentMonth }: { contextId: string; month: IsoMonth; currentMonth: IsoMonth }) {
  const hidden = useValuesHidden();
  const year = Number(month.slice(0, 4));
  const data = useBusinessYear(contextId, year, currentMonth);
  const limit = data.data ? meiLimit(year, data.data.salesCents, data.data.servicesCents) : null;
  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.meiTitle}
      </Txt>
      {data.isError ? (
        <ErrorState message={T.loadFailed} onRetry={() => data.refetch()} />
      ) : !limit ? (
        <Skeleton width="100%" height={48} />
      ) : (
        <>
          <MoneyTxt>{limit.revenueCents === 0 ? T.meiNone(year) : hidden ? T.meiLineHidden(limit) : T.meiLine(limit)}</MoneyTxt>
          {/* Com valores ocultos, também o limite por mês fica oculto (nenhum valor em reais à vista). */}
          <MoneyTxt variant="caption" color={colors.textSecondary}>
            {limit.over ? T.meiOver : `${T.meiCounts} ${T.meiNote}`}
          </MoneyTxt>
        </>
      )}
    </Card>
  );
}

/**
 * O tipo do negócio (D-121), opcional, só para quem administra: escolher grava na hora (set_business_profile). "Prefiro não dizer" grava
 * nulo. Sem número de CNPJ.
 */
function ProfileCard({ business }: { business: BusinessContext }) {
  const save = useSetBusinessProfile();
  const keys = useFamilyKeys();
  const [pending, setPending] = useState<BusinessProfile | null | undefined>(undefined);
  // O resultado fica no próprio card (a escolha está embaixo da tela; a faixa do topo ficaria fora da vista).
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = pending !== undefined ? pending : business.businessProfile;
  async function choose(profile: BusinessProfile | null) {
    if (save.isPending || profile === business.businessProfile) return;
    setPending(profile);
    setError(null);
    setSaved(null);
    const r = await attemptFamily(keys, `perfil:${business.id}:${profile ?? 'nenhum'}`, (key) => save.mutateAsync({ key, contextId: business.id, profile }));
    setPending(undefined);
    if (r.ok) setSaved(profile === null ? T.profileNoneSaved : T.profileSaved);
    else setError(businessErrorText(r.code));
  }
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.profileTitle}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.profileHint}
      </Txt>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={T.profileTitle}>
        {BUSINESS_PROFILES.map((p) => (
          <Chip key={p} label={BUSINESS_PROFILE_LABEL[p]} selected={current === p} onPress={() => choose(p)} />
        ))}
        <Chip label={BUSINESS_PROFILE_NONE_LABEL} selected={current === null} onPress={() => choose(null)} />
      </View>
      <FlashBanner message={saved} />
      {error ? (
        <Banner tone="erro">
          <Txt variant="label" color={colors.error}>
            {error}
          </Txt>
        </Banner>
      ) : null}
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
  outside: { gap: space[2], paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
