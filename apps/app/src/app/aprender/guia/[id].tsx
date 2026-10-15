import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Calculator } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { CalcNavRow } from '@/components/calc/parts';
import { SubHeader } from '@/components/header';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { GUIDE_GROUPS, GUIDE_TEXT, guideEntry, guideWhere, openGuideScreen, type GuideEntry } from '@/lib/guide';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Uma entrada do guia (D-049(1)): "Para que serve", "Onde fica" (o caminho com os nomes das telas, e "Também em" quando há outro),
 * "Como usar" (de 3 a 6 passos) e o botão "Abrir {tela}". Endereço desconhecido mostra "Esta função não está no guia." com o caminho
 * de volta à lista. O app não registra qual entrada a pessoa abre.
 */
export default function GuiaEntradaScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const entry = guideEntry(typeof params.id === 'string' ? params.id : '');
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={entry?.title ?? GUIDE_TEXT.screenTitle} onBack={() => (router.canGoBack() ? router.back() : router.replace('/aprender/guia'))} />
      {entry ? <EntryBody entry={entry} /> : <NotFound />}
    </View>
  );
}

function NotFound() {
  return (
    <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
      <Card style={{ gap: space[3] }}>
        <Txt variant="title">{GUIDE_TEXT.notFoundTitle}</Txt>
        <Button label={GUIDE_TEXT.notFoundAction} tone="soft" onPress={() => router.replace('/aprender/guia')} />
      </Card>
    </Screen>
  );
}

function EntryBody({ entry }: { entry: GuideEntry }) {
  const group = GUIDE_GROUPS.find((g) => g.id === entry.group);
  return (
    <Screen contentStyle={{ padding: space[5], gap: space[5] }}>
      {group ? (
        <Txt variant="label" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
          {group.title}
        </Txt>
      ) : null}

      <View style={styles.section}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {GUIDE_TEXT.purposeTitle}
        </Txt>
        <Txt>{entry.purpose}</Txt>
      </View>

      <View style={styles.section}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {GUIDE_TEXT.whereTitle}
        </Txt>
        <Path path={entry.where} />
        {entry.alsoWhere && entry.alsoWhere.length > 0 ? (
          <View style={{ gap: space[1] }}>
            <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
              {GUIDE_TEXT.alsoTitle}
            </Txt>
            {entry.alsoWhere.map((p) => (
              <Path key={guideWhere(p)} path={p} quiet />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {GUIDE_TEXT.stepsTitle}
        </Txt>
        <View style={{ gap: space[3] }}>
          {entry.steps.map((step, i) => (
            <View key={step} style={styles.step} accessible accessibilityLabel={GUIDE_TEXT.stepA11y(i + 1, step)}>
              <View style={styles.number} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
                <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.extrabold }}>
                  {i + 1}
                </Txt>
              </View>
              <Txt style={{ flex: 1 }}>{step}</Txt>
            </View>
          ))}
        </View>
      </View>

      {entry.lines && entry.lines.length > 0 ? (
        <View style={styles.section}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {GUIDE_TEXT.linesTitle}
          </Txt>
          <Card style={{ paddingVertical: space[1] }}>
            {entry.lines.map((line, i) => (
              <CalcNavRow
                key={line.href}
                icon={Calculator}
                title={line.title}
                caption={line.caption}
                last={i === entry.lines!.length - 1}
                onPress={() => openGuideScreen(line.href)}
              />
            ))}
          </Card>
        </View>
      ) : null}

      <Button label={GUIDE_TEXT.open(entry.screenName)} icon={ArrowRight} onPress={() => openGuideScreen(entry.href)} />
    </Screen>
  );
}

/** O caminho "Movimentos › Organizar › Cartões" numa faixa; o leitor de tela lê os nomes separados por vírgula. */
function Path({ path, quiet }: { path: readonly string[]; quiet?: boolean }) {
  return (
    <View style={[styles.path, quiet && styles.pathQuiet]} accessible accessibilityLabel={GUIDE_TEXT.whereA11y(path)}>
      <Txt variant="label" color={quiet ? colors.textSecondary : colors.brand} style={{ fontFamily: fonts.bold }}>
        {guideWhere(path)}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[2] },
  step: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  number: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  path: { backgroundColor: colors.brandTint, borderRadius: radius.sm, paddingVertical: space[3], paddingHorizontal: space[4], alignSelf: 'stretch' },
  pathQuiet: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: space[2] },
});
