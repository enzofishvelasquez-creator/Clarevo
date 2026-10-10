import { GOALS_NAV_TEXT, SAVINGS_ERROR_TEXT, SAVINGS_STAGE_MONTHS, SAVINGS_TEXT, organizeGoals, savingsErrorText, savingsPlan, savingsPlanTexts, type Cents, type SavingsAnswer } from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CircleAlert, PiggyBank } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { ErrorState } from '@/components/states';
import { Banner, Button, Card, LinkButton, Skeleton, Txt } from '@/components/ui';
import { guardedWrite } from '@/lib/guarded-write';
import { useSavingsOperationKey, useSavingsPlanInputs, useSetSavingsAnswer, type SavingsCardData, type SyncedQuery } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Confirmações (a pergunta volta sozinha mais tarde: nada de contagem de dias, notificação ou e-mail). */
export const SAVINGS_NOTICE = {
  later: 'Tudo bem. A pergunta volta mais tarde.',
  kept: 'Valor por mês mantido.',
} as const;

/**
 * Card da pergunta no topo da aba Metas (spec7 §1 e §6). Estados do core (`savingsCardState`):
 * - pergunta: "Você consegue guardar algum valor por mês?" com "Sim, consigo" (abre /guardar), "Agora não" (grava a resposta e
 *   abre a reserva mínima) e "Responder depois" (grava e o card volta mais tarde);
 * - pergunta por mudança da renda de referência (a resposta era "consigo"): "Manter o valor" grava "consigo" com o mesmo valor
 *   e "Mudar valor" abre /guardar; sem "Responder depois", que apagaria o valor;
 * - plano: o resumo do plano com "Ver o plano" e "Mudar valor" (com a reserva criada, dentro do card da reserva, D-039);
 * - oculto: nada (a aba mostra só um link discreto).
 * A pergunta é compacta (D-039): título, "Sim, consigo" e "Agora não" lado a lado e "Responder depois" como link. A resposta é só da pessoa. Nada é gravado até o servidor confirmar; erros ficam no card, com o card inteiro mantido.
 */
export function SavingsCard({
  contextId,
  card,
  onNotice,
  planInReserve = false,
}: {
  contextId: string | undefined;
  card: SyncedQuery<SavingsCardData>;
  onNotice: (text: string) => void;
  /** Com reserva criada, o plano aparece dentro do card da reserva (SavingsPlanInReserve), não como um segundo card. */
  planInReserve?: boolean;
}) {
  const { today } = useSession();
  const qc = useQueryClient();
  const set = useSetSavingsAnswer();
  const keys = useSavingsOperationKey();
  const [busy, setBusy] = useState<SavingsAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = card.data?.state;
  const inputs = useSavingsPlanInputs(state?.kind === 'plano' ? contextId : undefined);

  async function answer(next: SavingsAnswer, monthlyCents: Cents | null, after: () => void) {
    if (!contextId || busy !== null) return;
    const version = card.data?.check?.version ?? 0;
    setBusy(next);
    setError(null);
    const result = await guardedWrite(keys, JSON.stringify([next, monthlyCents, version]), (key) =>
      set.mutateAsync({ key, contextId, expectedVersion: version, answer: next, monthlyCents }),
    undefined,
    { retryOnce: true },
    );
    setBusy(null);
    if (result.status === 'ok' || result.status === 'reconciled') {
      after();
      return;
    }
    if (result.status === 'refused') {
      if (result.code === 'versao_desatualizada') qc.invalidateQueries({ queryKey: ['savings'] });
      setError(savingsErrorText(result.code));
      return;
    }
    setError(SAVINGS_ERROR_TEXT.salvar_falhou);
  }

  if (card.isPending) {
    return (
      <Card style={{ gap: space[3] }}>
        <Skeleton width="80%" height={24} />
        <Skeleton width="100%" height={16} />
        <Skeleton width="100%" height={52} />
      </Card>
    );
  }
  if (card.isError || !state) {
    return (
      <Card>
        <ErrorState message="Não foi possível carregar sua resposta sobre guardar." onRetry={() => card.refetch()} />
      </Card>
    );
  }
  if (state.kind === 'oculto') return null;

  if (state.kind === 'plano') {
    if (planInReserve) return null;
    const planInputs = inputs.data;
    const reserve = planInputs ? organizeGoals(planInputs.goals).reserve : null;
    const headline = planInputs
      ? savingsPlanTexts(
          savingsPlan({
            monthlyCents: state.monthlyCents,
            essentialCents: planInputs.suggestedEssentialCents,
            goals: planInputs.goals,
            movements: planInputs.movements,
            today,
            // O resumo fala da etapa que a reserva já tem como alvo (1, 3 ou 6 meses), quando ela é uma das etapas do plano.
            chosenStageId: reserve && reserve.essentialMonths !== null && SAVINGS_STAGE_MONTHS.includes(reserve.essentialMonths) ? `reserva-${reserve.essentialMonths}` : null,
          }),
        ).headline
      : null;
    return (
      <Card style={styles.card}>
        <Head title={SAVINGS_TEXT.planTitle} />
        <MoneyTxt>{SAVINGS_TEXT.planMonthly(state.monthlyCents)}</MoneyTxt>
        {headline ? (
          <MoneyTxt variant="label" color={colors.textSecondary}>
            {headline}
          </MoneyTxt>
        ) : null}
        <View style={styles.actions}>
          <Button label="Ver o plano" onPress={() => router.push('/guardar')} />
          <Button label={SAVINGS_TEXT.changeValue} tone="soft" onPress={() => router.push({ pathname: '/guardar', params: { editar: '1' } })} />
        </View>
      </Card>
    );
  }

  // Pergunta compacta (cerca de 200 px). Com a resposta "consigo" (a renda de referência mudou), o valor pode ser mantido ou
  // mudado, nunca adiado.
  const changed = state.reason === 'renda_mudou';
  return (
    <Card style={styles.compact}>
      <Head title={state.title} />
      {changed && state.monthlyCents !== null ? (
        <MoneyTxt variant="caption" color={colors.textSecondary}>
          {SAVINGS_TEXT.planMonthly(state.monthlyCents)}
        </MoneyTxt>
      ) : (
        <Txt variant="caption" color={colors.textSecondary}>
          {GOALS_NAV_TEXT.askPrivacy}
        </Txt>
      )}
      {error ? (
        <Banner tone="erro" icon={CircleAlert}>
          <Txt variant="label" color={colors.error}>
            {error}
          </Txt>
        </Banner>
      ) : null}
      {changed ? (
        <View style={styles.sideBySide}>
          <Button
            label={SAVINGS_TEXT.keepValue}
            busy={busy === 'consigo'}
            busyLabel="Salvando…"
            disabled={busy !== null && busy !== 'consigo'}
            compact
            style={styles.half}
            onPress={() => {
              if (state.monthlyCents !== null) answer('consigo', state.monthlyCents, () => onNotice(SAVINGS_NOTICE.kept));
            }}
          />
          <Button
            label={SAVINGS_TEXT.changeValue}
            tone="soft"
            disabled={busy !== null}
            compact
            style={styles.half}
            onPress={() => router.push({ pathname: '/guardar', params: { editar: '1' } })}
          />
        </View>
      ) : (
        <>
          <View style={styles.sideBySide}>
            <Button
              label={SAVINGS_TEXT.yes}
              disabled={busy !== null}
              compact
              style={styles.half}
              onPress={() => router.push({ pathname: '/guardar', params: { editar: '1' } })}
            />
            <Button
              label={SAVINGS_TEXT.notNow}
              tone="soft"
              busy={busy === 'agora_nao'}
              busyLabel="Salvando…"
              disabled={busy !== null && busy !== 'agora_nao'}
              compact
              style={styles.half}
              onPress={() => answer('agora_nao', null, () => router.push('/guardar/minima'))}
            />
          </View>
          <LinkButton
            label={SAVINGS_TEXT.later}
            style={styles.later}
            disabled={busy !== null}
            onPress={() => answer('depois', null, () => onNotice(SAVINGS_NOTICE.later))}
          />
        </>
      )}
    </Card>
  );
}

/**
 * O plano de guardar dentro do card azul da reserva (D-039): "Seu plano de guardar", o valor por mês, a frase da etapa e
 * "Ver o plano" e "Mudar valor". Só no estado "plano" (nada nos demais). Texto claro sobre o azul.
 */
export function SavingsPlanInReserve({ contextId, card }: { contextId: string | undefined; card: SyncedQuery<SavingsCardData> }) {
  const { today } = useSession();
  const state = card.data?.state;
  const inputs = useSavingsPlanInputs(state?.kind === 'plano' ? contextId : undefined);
  if (state?.kind !== 'plano') return null;
  const planInputs = inputs.data;
  const reserve = planInputs ? organizeGoals(planInputs.goals).reserve : null;
  const headline = planInputs
    ? savingsPlanTexts(
        savingsPlan({
          monthlyCents: state.monthlyCents,
          essentialCents: planInputs.suggestedEssentialCents,
          goals: planInputs.goals,
          movements: planInputs.movements,
          today,
          chosenStageId: reserve && reserve.essentialMonths !== null && SAVINGS_STAGE_MONTHS.includes(reserve.essentialMonths) ? `reserva-${reserve.essentialMonths}` : null,
        }),
      ).headline
    : null;
  return (
    <View style={styles.inReserve}>
      <Txt variant="label" color={colors.textOnBrand} style={{ fontFamily: fonts.extrabold }} accessibilityRole="header" aria-level={3}>
        {SAVINGS_TEXT.planTitle}
      </Txt>
      <MoneyTxt color={colors.textOnBrand}>{SAVINGS_TEXT.planMonthly(state.monthlyCents)}</MoneyTxt>
      {headline ? (
        <MoneyTxt variant="label" color={colors.textOnBrandSoft}>
          {headline}
        </MoneyTxt>
      ) : null}
      <View style={styles.sideBySide}>
        <Button label="Ver o plano" tone="soft" compact style={styles.half} onPress={() => router.push('/guardar')} />
        <Button
          label={SAVINGS_TEXT.changeValue}
          tone="onBrand"
          compact
          style={styles.half}
          onPress={() => router.push({ pathname: '/guardar', params: { editar: '1' } })}
        />
      </View>
    </View>
  );
}

function Head({ title }: { title: string }) {
  return (
    <View style={styles.head}>
      <View style={styles.icon}>
        <PiggyBank size={20} color={colors.brand} strokeWidth={2.25} aria-hidden />
      </View>
      <Txt variant="title" style={{ flex: 1, fontFamily: fonts.bold }} accessibilityRole="header" aria-level={2}>
        {title}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3], paddingVertical: space[5] },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  icon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: space[2] },
  compact: { gap: space[2], paddingVertical: space[4] },
  sideBySide: { flexDirection: 'row', gap: space[2] },
  half: { flex: 1, minWidth: 0 },
  inReserve: { gap: space[2], borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.28)', paddingTop: space[3] },
  later: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
