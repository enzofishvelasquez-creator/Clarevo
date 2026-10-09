import { CALC_UI_TEXT, SIMULATE_TEXT, type LearnSection, type LearnSectionId } from '@clarevo/core';
import { router } from 'expo-router';
import { ArrowRight, Calculator, ChartLine, Search, SearchX, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, TextInput, View, type ScrollView } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { CalcNavRow } from '@/components/calc/parts';
import { FaqItem } from '@/components/faq-item';
import { AppHeader } from '@/components/header';
import { LearnArt } from '@/components/learn-art';
import { TopicRow } from '@/components/topic-link';
import { Body, Card, LinkButton, Screen, Txt, styles as ui } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { LEARN_ACTIONS, LEARN_UI_TEXT, START_HERE, explanationHref, learnSection, searchTopics, topicBySlug, topicsBySection, type Topic } from '@/lib/learn';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Quanto esperar depois da última tecla para anunciar a contagem de resultados (spec3 §3.9). */
const ANNOUNCE_DELAY_MS = 400;

const open = (t: Topic) => router.push(explanationHref(t.slug, 'aprender'));

/**
 * Aprender e dúvidas (spec3 §3.2, com spec5_notes §2): introdução, busca, card "Calculadoras", card lima "Comece por
 * aqui", atalhos de seção, as seções, Dúvidas frequentes e o rodapé. Com busca ativa, os resultados substituem tudo
 * do card "Calculadoras" para baixo.
 *
 * Privacidade (R11): o termo buscado fica só no estado desta tela, na memória; nada é gravado no aparelho nem
 * enviado, e a busca não faz requisição de rede.
 */
export default function AprenderScreen() {
  const [query, setQuery] = useState('');
  const [announced, setAnnounced] = useState('');
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const bodyY = useRef(0);
  const sectionsY = useRef(0);
  const sectionY = useRef<Partial<Record<LearnSectionId, number>>>({});
  const headings = useRef<Partial<Record<LearnSectionId, View | null>>>({});
  const reduced = useReducedMotion();

  const results = searchTopics(query);
  const countText =
    results === null ? '' : results.length === 0 ? `${LEARN_UI_TEXT.noResultTitle}. ${LEARN_UI_TEXT.noResultBody}` : LEARN_UI_TEXT.resultCount(results.length, query);

  // A contagem é anunciada uma vez, quando a pessoa para de digitar (região viva educada; no iOS, anúncio na fila).
  useEffect(() => {
    const id = setTimeout(() => {
      setAnnounced(countText);
      announceOnIOS(countText, { queue: true });
    }, ANNOUNCE_DELAY_MS);
    return () => clearTimeout(id);
  }, [countText]);

  const clear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  // Atalho de seção: rola até a seção (não filtra) e leva o foco ao título dela.
  const goToSection = (id: LearnSectionId) => {
    const y = bodyY.current + sectionsY.current + (sectionY.current[id] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - space[2]), animated: !reduced });
    const node = headings.current[id];
    if (!node) return;
    if (Platform.OS === 'web') (node as unknown as { focus?: (o?: { preventScroll?: boolean }) => void }).focus?.({ preventScroll: true });
    else AccessibilityInfo.sendAccessibilityEvent(node as unknown as Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0], 'focus');
  };

  const sections = topicsBySection().filter((s) => s.topics.length > 0);
  const startHere = START_HERE.flatMap((slug) => {
    const t = topicBySlug(slug);
    return t ? [t] : [];
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen wide scrollRef={scrollRef}>
        <AppHeader title={LEARN_UI_TEXT.title} />
        <View onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
          <Body>
            <Txt color={colors.textSecondary}>{LEARN_UI_TEXT.intro}</Txt>

            <SearchField inputRef={inputRef} value={query} onChange={setQuery} onClear={clear} />
            {/*
              Região viva escondida só da vista: 1×1 px cortado, sem opacity 0 (no Android, o TalkBack ignora região com
              alfa 0). No iOS o anúncio é de announceOnIOS, e o VoiceOver não precisa ler este texto de novo.
            */}
            <View style={styles.liveClip} accessibilityElementsHidden={Platform.OS === 'ios'}>
              <Txt style={styles.liveText} accessibilityLiveRegion="polite" aria-live="polite">
                {announced}
              </Txt>
            </View>

            {results !== null ? (
              <SearchResults query={query} results={results} onShowAll={clear} />
            ) : (
              <>
                {/* Calculadoras no topo (D-034; spec5_notes §2): card branco, ícone azul, entre a busca e "Comece por aqui". */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${CALC_UI_TEXT.learnCardTitle}. ${CALC_UI_TEXT.learnCardCaption}`}
                  onPress={() => router.push('/calcular')}
                  style={(s) => [styles.calc, s.pressed && { opacity: 0.85 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
                  <View style={styles.calcIcon}>
                    <Calculator size={22} color={colors.brand} strokeWidth={2.25} aria-hidden />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="label" style={{ fontFamily: fonts.extrabold, fontSize: 17 }}>
                      {CALC_UI_TEXT.learnCardTitle}
                    </Txt>
                    <Txt variant="caption">{CALC_UI_TEXT.learnCardCaption}</Txt>
                  </View>
                  <ArrowRight size={20} color={colors.brand} aria-hidden />
                </Pressable>

                {startHere.length > 0 ? (
                  <View style={styles.startHere}>
                    <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ fontFamily: fonts.extrabold }}>
                      {LEARN_UI_TEXT.startHere}
                    </Txt>
                    <View>
                      {startHere.map((t, i) => (
                        <TopicRow key={t.slug} topic={t} onAccent last={i === startHere.length - 1} onPress={() => open(t)} />
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={{ gap: space[2] }}>
                  <Txt variant="label" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
                    {LEARN_UI_TEXT.goTo}
                  </Txt>
                  <View style={styles.shortcuts}>
                    {sections.map(({ section }) => (
                      <Pressable
                        key={section.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${LEARN_UI_TEXT.goTo} ${section.title}`}
                        onPress={() => goToSection(section.id)}
                        style={(s) => [styles.shortcut, s.pressed && { opacity: 0.8 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
                        <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold }}>
                          {section.title}
                        </Txt>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={{ gap: space[4] }} onLayout={(e) => (sectionsY.current = e.nativeEvent.layout.y)}>
                  {sections.map(({ section, topics }) => (
                    <View key={section.id} onLayout={(e) => (sectionY.current[section.id] = e.nativeEvent.layout.y)}>
                      <Card style={{ gap: space[2] }}>
                        <SectionHeading
                          section={section}
                          headingRef={(n) => {
                            headings.current[section.id] = n;
                          }}
                        />
                        <View>
                          {/* Simulador (D-028, Ciclo D): atalho no topo de "Dinheiro no tempo". */}
                          {section.id === 'tempo' ? (
                            <CalcNavRow
                              icon={ChartLine}
                              title={SIMULATE_TEXT.learnShortcut}
                              caption={SIMULATE_TEXT.learnShortcutHint}
                              onPress={() => router.push({ pathname: '/simular', params: { origem: 'aprender' } })}
                            />
                          ) : null}
                          {section.id === 'duvidas'
                            ? topics.map((t, i) => <FaqItem key={t.slug} topic={t} actions={LEARN_ACTIONS[t.slug]} last={i === topics.length - 1} />)
                            : topics.map((t, i) => <TopicRow key={t.slug} topic={t} last={i === topics.length - 1} onPress={() => open(t)} />)}
                        </View>
                      </Card>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Txt variant="caption" color={colors.textSecondary} style={styles.footer}>
              {LEARN_UI_TEXT.footer}
            </Txt>
          </Body>
        </View>
      </Screen>
    </View>
  );
}

/** Busca no aparelho: rótulo visível, dica e "Limpar busca" (ícone X) enquanto houver texto. */
function SearchField({
  inputRef,
  value,
  onChange,
  onClear,
}: {
  inputRef: RefObject<TextInput | null>;
  value: string;
  onChange: (text: string) => void;
  onClear: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {LEARN_UI_TEXT.searchLabel}
      </Txt>
      <View style={[ui.input, focused && ui.inputFocused, styles.search]}>
        <Search size={20} color={colors.textSecondary} aria-hidden />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          accessibilityLabel={LEARN_UI_TEXT.searchLabel}
          placeholder={LEARN_UI_TEXT.searchHint}
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          inputMode="search"
          enterKeyHint="search"
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={ui.inputText}
        />
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={LEARN_UI_TEXT.clearSearch}
            onPress={onClear}
            style={(s) => [styles.clear, (s as { focused?: boolean }).focused && ui.focusRing]}>
            <X size={20} color={colors.textSecondary} aria-hidden />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Resultados da busca: contagem e linhas de tema; sem resultado, a sugestão e "Ver todos os temas". Sem animação. */
function SearchResults({ query, results, onShowAll }: { query: string; results: Topic[]; onShowAll: () => void }) {
  if (results.length === 0) {
    return (
      <Card style={styles.empty}>
        <SearchX size={32} color={colors.brand} aria-hidden />
        <Txt variant="title" style={{ textAlign: 'center' }}>
          {LEARN_UI_TEXT.noResultTitle}
        </Txt>
        <Txt color={colors.textSecondary} style={{ textAlign: 'center' }}>
          {LEARN_UI_TEXT.noResultBody}
        </Txt>
        <LinkButton label={LEARN_UI_TEXT.showAll} onPress={onShowAll} />
      </Card>
    );
  }
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" color={colors.textSecondary}>
        {LEARN_UI_TEXT.resultCount(results.length, query)}
      </Txt>
      <Card style={{ paddingVertical: space[1] }}>
        {results.map((t, i) => (
          <TopicRow key={t.slug} topic={t} caption={t.subtitle ?? learnSection(t.section).title} last={i === results.length - 1} onPress={() => open(t)} />
        ))}
      </Card>
    </View>
  );
}

/** Título da seção (nível 2) com ilustração e descrição; recebe o foco quando a pessoa usa o atalho "Ir para". */
function SectionHeading({ section, headingRef }: { section: LearnSection; headingRef: (node: View | null) => void }) {
  return (
    <View style={styles.sectionHead}>
      <LearnArt section={section.id} />
      <View ref={headingRef} tabIndex={-1} style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {section.title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {section.description}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  liveClip: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  liveText: { width: 240 },
  search: { gap: space[2] },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -space[3], borderRadius: 22 },
  calc: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space[5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
  },
  calcIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  // No estilo do card lima do Resumo.
  startHere: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingTop: space[5], paddingBottom: space[2], paddingHorizontal: space[6], gap: space[1] },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  shortcut: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    maxWidth: '100%',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  empty: { alignItems: 'center', gap: space[2] },
  footer: { textAlign: 'center', marginTop: space[2] },
});
