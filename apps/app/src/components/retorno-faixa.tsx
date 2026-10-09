import { RETURN_TEXT, lastClosedMonth, returnBannerText, returnErrorText, reviewExpectedVersion } from '@clarevo/core';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CalendarRange } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, ReduceMotion } from 'react-native-reanimated';

import { codeOf, isConflict, isUncertain, useReturnWriter } from '@/components/retorno-acoes';
import { Banner, Button, Txt } from '@/components/ui';
import { useReturnReview } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, space } from '@/theme/tokens';

/** A faixa sai em 240 ms (CL-V008), só depois da decisão confirmada; o resto do Resumo não anima. */
const bandExit = FadeOut.duration(motion.confirm).reduceMotion(ReduceMotion.System);

export type ReturnBandState = ReturnType<typeof useReturnBand>;

/**
 * Faixa "Seus últimos meses" no Resumo (D-030): só no Pessoal e no mês atual (contextId undefined desliga), no lugar dos
 * avisos temporários. status 'pendente' enquanto a revisão carrega (o card de Primeiros passos espera), 'visivel' com
 * algo a conferir e 'oculta' no resto, inclusive em falha de carga (nunca uma faixa parcial). Conta nova nunca vê.
 */
export function useReturnBand(contextId: string | undefined) {
  const query = useReturnReview(contextId);
  const data = query.data;
  const banner = data?.review ? returnBannerText(data.review) : null;
  const status: 'pendente' | 'visivel' | 'oculta' = !contextId
    ? 'oculta'
    : query.isPending
      ? 'pendente'
      : query.isSuccess && banner
        ? 'visivel'
        : 'oculta';
  return { status, banner, data, refetch: query.refetch, contextId };
}

/**
 * Sem valores, sem contar dias, sem cobrança. Título com papel de cabeçalho; a faixa não é anunciada como alerta
 * (live false). "Seguir adiante" grava só a decisão e, confirmada, a faixa some com o aviso de sucesso.
 */
export function ReturnBand({ band, onMovedOn }: { band: ReturnBandState; onMovedOn: (text: string) => void }) {
  const { today } = useSession();
  const writer = useReturnWriter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { banner, data, contextId } = band;
  if (!banner || !data || !contextId) return null;

  const moveOn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await writer.decide({
        contextId,
        expectedVersion: reviewExpectedVersion(data.state),
        reviewedThrough: lastClosedMonth(today),
        decision: 'seguiu',
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onMovedOn(RETURN_TEXT.movedOn);
    } catch (e) {
      // Recusa (outro aparelho decidiu antes): recarrega a revisão; rede: repetir com a mesma chave é seguro.
      setError(isUncertain(e) ? RETURN_TEXT.decideFailed : isConflict(e) ? returnErrorText(codeOf(e)) : RETURN_TEXT.decideFailed);
      if (!isUncertain(e)) band.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View exiting={bandExit}>
      <Banner tone="info" icon={CalendarRange} live={false}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {banner.title}
        </Txt>
        <Txt variant="label">{banner.body}</Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {banner.note}
        </Txt>
        {error ? (
          <Txt variant="label" color={colors.error} style={{ fontFamily: fonts.bold }} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        ) : null}
        <View style={styles.actions}>
          <Button label={banner.primary} disabled={busy} style={styles.action} onPress={() => router.push('/retomar')} />
          <Button label={banner.secondary} tone="ghost" busy={busy} busyLabel="Salvando…" style={styles.action} onPress={moveOn} />
        </View>
      </Banner>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 140 },
});
