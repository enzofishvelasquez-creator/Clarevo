import { BookOpen, CalendarClock, Flag, House, NotebookPen, type LucideIcon } from 'lucide-react-native';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReturnBand } from '@/components/retorno-faixa';
import { Button, LinkButton, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { TOUR_CARDS, TOUR_TEXT, shouldShowTour, tourOffByHost, type TourIcon } from '@/lib/guide';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const ICON: Record<TourIcon, LucideIcon> = { resumo: House, anotar: NotebookPen, contas: CalendarClock, metas: Flag, ajuda: BookOpen };

/**
 * Tour de boas-vindas (D-049(2)): cinco cartões numa folha presa ao pé da tela (revisão das telas, 16/11/2026: o cartão no meio cobria o
 * que descrevia; a folha deixa a tela de cima à vista). Cada cartão tem um ícone simples e texto curto; "Pular" no topo da folha, menos
 * no último cartão; "Voltar" do segundo cartão em diante e "Próximo" (no último, "Começar"). Sem animação (também não depende de
 * "reduzir movimento"). O nome acessível da janela é lido ao abrir, o título e a posição ("1 de 5") ficam no próprio cartão, e a troca de
 * cartão é anunciada numa região viva educada (no iOS, pelo anúncio do sistema). Esc e o voltar do sistema fecham. O foco fica preso
 * na janela e volta ao que estava antes (RN Web Modal).
 */
export function TourDialog({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
        <View
          style={[styles.sheet, { maxHeight: Math.max(280, Math.round(height * 0.75)), paddingBottom: Math.max(insets.bottom, space[4]) }]}
          accessibilityViewIsModal>
          <View style={styles.head}>
            <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
              {TOUR_CARDS.map((c, i) => (
                <View key={c.id} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>
            <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold, flex: 1 }}>
              {TOUR_TEXT.progress(index + 1, total)}
            </Txt>
            {last ? null : <LinkButton label={TOUR_TEXT.skip} accessibilityHint={TOUR_TEXT.skipHint} style={styles.skip} onPress={onClose} />}
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.titleRow}>
              <View style={styles.icon}>
                <Icon size={24} color={colors.textOnAccent} strokeWidth={2.25} aria-hidden />
              </View>
              <Txt variant="title" accessibilityRole="header" aria-level={2} style={styles.title}>
                {card.title}
              </Txt>
            </View>
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
            {index > 0 ? <Button label={TOUR_TEXT.back} tone="soft" style={styles.action} onPress={() => setIndex(index - 1)} /> : null}
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
 * (D-030) nem sobre formulários: as regras estão em `shouldShowTour` (core). "Pular", Esc e "Começar" marcam como visto.
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
  // Sem véu escuro: a tela de cima continua à vista. A folha tem sombra e borda para se separar do fundo.
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingHorizontal: space[5],
    paddingTop: space[3],
    gap: space[3],
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
  skip: { paddingHorizontal: space[1] },
  content: { gap: space[3] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  lines: { gap: space[2] },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: space[1] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.brandMark, width: 20 },
  title: { flex: 1, fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 28 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 120 },
  liveClip: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  liveText: { width: 240 },
});
