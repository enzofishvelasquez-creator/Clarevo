import { BookOpen, CalendarClock, Flag, House, NotebookPen, type LucideIcon } from 'lucide-react-native';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useReturnBand } from '@/components/retorno-faixa';
import { Button, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { TOUR_CARDS, TOUR_TEXT, shouldShowTour, tourOffByHost, type TourIcon } from '@/lib/guide';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const ICON: Record<TourIcon, LucideIcon> = { resumo: House, anotar: NotebookPen, contas: CalendarClock, metas: Flag, ajuda: BookOpen };

/**
 * Tour de boas-vindas (D-049(2)): cinco cartões num modal, com um ícone simples e texto curto, "Pular" em todos e "Próximo" (no
 * último, "Começar"). Sem animação (também não depende de "reduzir movimento"). O nome acessível da janela é lido ao abrir, o
 * título e a posição ("1 de 5") ficam no próprio cartão, e a troca de cartão é anunciada numa região viva educada (no iOS, pelo
 * anúncio do sistema). Esc e o voltar do sistema pulam. O foco fica preso na janela e volta ao que estava antes (RN Web Modal).
 */
export function TourDialog({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const { height } = useWindowDimensions();
  const card = TOUR_CARDS[index]!;
  const total = TOUR_CARDS.length;
  const last = index === total - 1;
  const Icon = ICON[card.icon];
  const announce = TOUR_TEXT.announce(index + 1, total, card.title);

  // Na troca de cartão, o iOS (sem região viva) anuncia o cartão novo; o primeiro cartão é lido com a janela.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    announceOnIOS(announce, { queue: true });
  }, [announce]);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      // Na web, o Modal vira role="dialog"; o nome vai nele.
      {...({ 'aria-label': TOUR_TEXT.dialogLabel } as object)}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { maxHeight: Math.max(280, Math.round(height * 0.9)) }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.icon}>
              <Icon size={36} color={colors.text} strokeWidth={2.25} aria-hidden />
            </View>
            <View style={styles.progressRow}>
              <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
                {TOUR_CARDS.map((c, i) => (
                  <View key={c.id} style={[styles.dot, i === index && styles.dotOn]} />
                ))}
              </View>
              <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
                {TOUR_TEXT.progress(index + 1, total)}
              </Txt>
            </View>
            <Txt variant="title" accessibilityRole="header" aria-level={2} style={styles.title}>
              {card.title}
            </Txt>
            <View style={styles.lines}>
              {card.lines.map((line) => (
                <Txt key={line} color={colors.text}>
                  {line}
                </Txt>
              ))}
            </View>
          </ScrollView>
          {/* Região viva escondida só da vista (1×1 px cortado, sem opacity 0): a troca de cartão é dita uma vez. */}
          <View style={styles.liveClip} accessibilityElementsHidden={Platform.OS === 'ios'}>
            <Txt style={styles.liveText} accessibilityLiveRegion="polite" aria-live="polite">
              {announce}
            </Txt>
          </View>
          <View style={styles.actions}>
            <Button label={TOUR_TEXT.skip} tone="ghost" accessibilityHint={TOUR_TEXT.skipHint} style={styles.action} onPress={onClose} />
            <Button label={last ? TOUR_TEXT.start : TOUR_TEXT.next} style={styles.action} onPress={() => (last ? onClose() : setIndex(index + 1))} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * O tour da primeira entrada, montado no Resumo (D-049(2)). Abre uma vez por pessoa em cada aparelho (a preferência local
 * `tourSeen`, só em memória na demonstração), depois de as preferências serem lidas, e nunca sobre a faixa "Seus últimos meses"
 * (D-030) nem sobre formulários: as regras estão em `shouldShowTour` (core). "Pular" e "Começar" marcam como visto.
 * A revisão dos últimos meses só é consultada enquanto o tour ainda pode abrir; depois de visto, nada mais é lido para ele.
 */
export function WelcomeTour({ personal, contextId }: { personal: boolean; contextId: string | undefined }) {
  const { user, auth } = useSession();
  const pathname = usePathname();
  const userId = user?.id;
  const prefs = useDevicePrefs(userId);
  // Lido uma vez, ao montar (só o roteiro automatizado liga essa marca).
  const [hostOff] = useState(tourOffByHost);
  const pending = Boolean(userId) && personal && !hostOff && prefs !== undefined && !prefs.tourSeen;
  const band = useReturnBand(pending ? contextId : undefined);
  // Se a faixa "Seus últimos meses" apareceu neste Resumo, o tour espera até o Resumo abrir de novo: nunca abre sobre ela nem
  // logo depois de a pessoa decidir.
  const [sawBand, setSawBand] = useState(false);
  useEffect(() => {
    if (band.status === 'visivel') setSawBand(true);
  }, [band.status]);
  // Sem o contexto Pessoal carregado, a faixa ainda é desconhecida: o tour espera.
  const reviewBand = sawBand ? 'visivel' : personal && !contextId ? 'pendente' : band.status;
  if (!userId || !shouldShowTour({ pathname, prefsLoaded: prefs !== undefined, seen: prefs?.tourSeen ?? false, personal, reviewBand, disabled: hostOff })) return null;
  return <TourDialog onClose={() => updatePrefs(userId, { tourSeen: true }, auth.mode !== 'demo')} />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(23,34,59,0.55)', alignItems: 'center', justifyContent: 'center', padding: space[4] },
  box: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], gap: space[4] },
  content: { gap: space[3] },
  lines: { gap: space[2] },
  icon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  dots: { flexDirection: 'row', gap: space[1] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.brand, width: 20 },
  title: { fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 30 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], justifyContent: 'flex-end' },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 120 },
  liveClip: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  liveText: { width: 240 },
});
