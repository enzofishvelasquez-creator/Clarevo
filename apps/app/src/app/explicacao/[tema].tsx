import type { IsoDate } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { SubHeader } from '@/components/header';
import { LearnArt } from '@/components/learn-art';
import { TopicExample } from '@/components/topic-example';
import { EmptyArt } from '@/components/states';
import { TopicRow } from '@/components/topic-link';
import { Banner, Button, Card, LinkButton, Screen, Txt, styles as ui } from '@/components/ui';
import { useWideLayout } from '@/lib/layout';
import {
  LEARN_DISCLAIMER_SECTIONS,
  LEARN_UI_TEXT,
  explanationHref,
  learnOrigin,
  learnSection,
  relatedTopics,
  topicActions,
  topicBySlug,
  topicCalculator,
  topicReadingMinutes,
  type LearnOrigin,
  type LearnSource,
  type Topic,
} from '@/lib/learn';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Explicação de um tema (spec3 §3.8), aberta por cima da tarefa ou da aba Aprender: voltar mantém o preenchimento
 * do formulário. `?origem=aprender` troca "Voltar para a tarefa" por "Voltar para Aprender". Apelido abre o tema novo;
 * rascunho ou endereço desconhecido mostram "Este conteúdo não está disponível." (R12). Nada é gravado nem enviado
 * sobre o tema aberto (R11).
 */
export default function ExplicacaoScreen() {
  const params = useLocalSearchParams<{ tema?: string; origem?: string }>();
  const topic = topicBySlug(typeof params.tema === 'string' ? params.tema : '');
  const origem = learnOrigin(params.origem);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={LEARN_UI_TEXT.backHeader} plainTitle={topic !== null} />
      {topic ? <TopicBody key={topic.slug} topic={topic} origem={origem} /> : <Unavailable />}
    </View>
  );
}

/** Fechamento: "Voltar para a tarefa" volta um passo na pilha; "Voltar para Aprender" volta para a aba. */
function goBack(origem: LearnOrigin) {
  if (router.canGoBack()) router.back();
  else router.navigate(origem === 'aprender' ? '/aprender' : '/');
}

function TopicBody({ topic, origem }: { topic: Topic; origem: LearnOrigin }) {
  const [linkFailed, setLinkFailed] = useState(false);
  const section = learnSection(topic.section);
  const minutes = topicReadingMinutes(topic);
  const actions = topicActions(topic.slug, topicCalculator(topic.slug), LEARN_UI_TEXT.calculatorAction);
  const related = relatedTopics(topic.slug);
  // As fontes internas (as decisões do projeto) viram uma linha só, "Como o app da Clarevo funciona", sem os códigos (auditoria de 18/11/2026).
  // Só com fontes internas, a linha leva a data de revisão, que então não se repete embaixo.
  const external = topic.sources.filter((s) => s.kind !== 'clarevo');
  const hasInternal = topic.sources.some((s) => s.kind === 'clarevo');
  const onlyInternal = hasInternal && external.length === 0;
  // Computador: a coluna de leitura fica em 640 px (com 720, as linhas passavam de 90 caracteres) e a ilustração vai ao lado do título,
  // sem a faixa lima de 720 px (revisão de 23/11/2026). O celular segue como era.
  const wide = useWideLayout();

  const openSource = (url: string) => {
    setLinkFailed(false);
    // Linking do React Native: no aparelho abre o navegador; na web, uma janela nova (o app continua aberto).
    Linking.openURL(url).catch(() => setLinkFailed(true));
  };

  return (
    <Screen contentStyle={[{ padding: space[5], gap: space[4] }, wide && styles.readingColumn]}>
      {wide ? null : (
        <View style={styles.art}>
          <LearnArt section={topic.section} size={88} background={colors.surface} />
        </View>
      )}
      <View style={wide ? styles.headWide : undefined}>
        {wide ? <LearnArt section={topic.section} size={64} /> : null}
        <View style={{ gap: space[1], flex: wide ? 1 : undefined, minWidth: 0 }}>
          <Txt
            variant="label"
            color={colors.textSecondary}
            style={{ fontFamily: fonts.bold }}
            accessibilityLabel={`${section.title}. ${LEARN_UI_TEXT.readingA11y(minutes)}`}>
            {LEARN_UI_TEXT.sectionReading(section.title, minutes)}
          </Txt>
          <Txt variant="title" style={styles.title} accessibilityRole="header" aria-level={1}>
            {topic.title}
          </Txt>
          {topic.subtitle ? <Txt color={colors.textSecondary}>{topic.subtitle}</Txt> : null}
        </View>
      </View>

      <Txt style={{ fontFamily: fonts.bold }}>{topic.short}</Txt>
      {topic.paragraphs.map((p) => (
        <Txt key={p}>{p}</Txt>
      ))}

      <TopicExample topic={topic} />

      {actions.length > 0 ? (
        <View style={styles.block}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {LEARN_UI_TEXT.inClarevo}
          </Txt>
          {actions.map((a) => (
            <Button key={a.label} label={a.label} tone="soft" onPress={() => router.push(a.href)} />
          ))}
        </View>
      ) : null}

      {related.length > 0 ? (
        <View style={styles.block}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {LEARN_UI_TEXT.related}
          </Txt>
          <Card style={{ paddingVertical: space[1] }}>
            {related.map((r, i) => (
              // Relacionado troca a explicação no lugar: "Voltar para a tarefa" continua a um passo da tarefa.
              <TopicRow key={r.slug} topic={r} last={i === related.length - 1} onPress={() => router.replace(explanationHref(r.slug, origem))} />
            ))}
          </Card>
        </View>
      ) : null}

      <View style={styles.block}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {LEARN_UI_TEXT.sources}
        </Txt>
        {linkFailed ? (
          <Banner tone="info">
            <Txt variant="label">{LEARN_UI_TEXT.linkFailed}</Txt>
          </Banner>
        ) : null}
        <Card style={{ paddingVertical: space[2] }}>
          {external.map((s, i) => (
            <SourceLine key={`${i}-${LEARN_UI_TEXT.sourceLine(s)}`} source={s} last={i === external.length - 1 && !hasInternal} onOpen={openSource} />
          ))}
          {hasInternal ? <InternalSourceLine reviewedOn={onlyInternal ? topic.reviewedOn : null} /> : null}
        </Card>
      </View>

      <View style={{ gap: space[2] }}>
        {onlyInternal ? null : (
          <Txt variant="caption" color={colors.textSecondary}>
            {LEARN_UI_TEXT.reviewedOn(topic.reviewedOn)}
          </Txt>
        )}
        {LEARN_DISCLAIMER_SECTIONS.includes(topic.section) ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {LEARN_UI_TEXT.disclaimer}
          </Txt>
        ) : null}
      </View>

      <Button label={origem === 'aprender' ? LEARN_UI_TEXT.backToLearn : LEARN_UI_TEXT.backToTask} onPress={() => goBack(origem)} />
    </Screen>
  );
}

/**
 * Uma fonte. Oficial ou de mercado: link para o site (papel link, ícone e dica "Abre o site fora do app"), com a data
 * de consulta; mercado leva o rótulo "Referência de mercado". Obra: só texto, sem link. As decisões internas ficam em InternalSourceLine.
 */
function SourceLine({ source, last, onOpen }: { source: LearnSource; last: boolean; onOpen: (url: string) => void }) {
  const line = LEARN_UI_TEXT.sourceLine(source);
  const consulted = source.kind !== 'clarevo' && source.consultedOn ? LEARN_UI_TEXT.consultedOn(source.consultedOn) : null;
  const market = source.kind === 'mercado';
  const meta = [market ? LEARN_UI_TEXT.marketLabel : null, consulted].filter((t): t is string => !!t);
  const texts = (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Txt variant="label" color={source.kind === 'oficial' || market ? colors.brandText : colors.text} style={{ fontFamily: fonts.bold }}>
        {line}
      </Txt>
      {meta.map((m) => (
        <Txt key={m} variant="caption" color={colors.textSecondary}>
          {m}
        </Txt>
      ))}
    </View>
  );
  if (source.kind === 'oficial' || source.kind === 'mercado') {
    const url = source.url;
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={[line, ...meta].join('. ')}
        accessibilityHint={LEARN_UI_TEXT.externalLinkHint}
        onPress={() => onOpen(url)}
        style={(s) => [styles.source, !last && styles.divider, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
        {texts}
        <ExternalLink size={18} color={colors.brandText} aria-hidden />
      </Pressable>
    );
  }
  return <View style={[styles.source, !last && styles.divider]}>{texts}</View>;
}

/** A fonte interna, sem os códigos das decisões: "Como o app da Clarevo funciona" e, quando é a única fonte, a data de revisão. */
function InternalSourceLine({ reviewedOn }: { reviewedOn: IsoDate | null }) {
  return (
    <View style={styles.source}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {LEARN_UI_TEXT.internalSource}
        </Txt>
        {reviewedOn ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {LEARN_UI_TEXT.reviewedOn(reviewedOn)}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Tema que não existe ou ainda é rascunho: o mesmo desenho dos outros estados vazios (a ilustração, o título no centro e as ações).
 * Não usa o `EmptyState` porque o título aqui é o título de nível 2 da tela (o nível 1 é "Aprender", na barra).
 */
function Unavailable() {
  return (
    <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
      <Card>
        <View style={styles.unavailable}>
          <EmptyArt kind="registros" />
          <Txt variant="title" style={{ textAlign: 'center' }} accessibilityRole="header" aria-level={2}>
            {LEARN_UI_TEXT.unavailable}
          </Txt>
          <View style={{ gap: space[2], alignSelf: 'stretch' }}>
            <Button label={LEARN_UI_TEXT.unavailableAction} onPress={() => router.navigate('/aprender')} />
            <LinkButton label={LEARN_UI_TEXT.back} style={{ alignSelf: 'center' }} onPress={() => goBack('aprender')} />
          </View>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  art: { backgroundColor: colors.accent, borderRadius: radius.lg, height: 120, alignItems: 'center', justifyContent: 'center' },
  // 640 px de texto mais as margens de 20 px.
  readingColumn: { maxWidth: 680 },
  headWide: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  unavailable: { alignItems: 'center', gap: space[3], paddingVertical: space[2] },
  title: { fontSize: 22, lineHeight: 30 },
  block: { gap: space[2] },
  source: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
