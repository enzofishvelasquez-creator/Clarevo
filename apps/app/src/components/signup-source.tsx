import {
  SIGNUP_SOURCES,
  SIGNUP_SOURCE_LABEL,
  SIGNUP_SOURCE_TEXT,
  newAttemptSlot,
  keyForSend,
  recordUncertain,
  refuseKey,
  settleSlot,
  shouldAskSignupSource,
  signupSourceErrorText,
  type SignupSource,
  type SignupSourceOption,
} from '@clarevo/core';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { codeOf, isUncertain } from '@/components/retorno-acoes';
import { Card, Chip, LinkButton, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { useSignupSourceDevice } from '@/lib/signup-source-prefs';
import { useSetSignupSource, useSignupSource } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, space } from '@/theme/tokens';

/**
 * "Como você conheceu o Clarevo?" (D-067, item 2): a pergunta OPCIONAL que deixa a equipe contar, sem identificar ninguém, de onde as
 * pessoas chegam. As seis opções são chips de escolha única; tocar numa opção grava na hora (sem botão de enviar) e a resposta pode
 * ser mudada depois em Conta. Nada aqui é condição de nada, não conta como anotação e não mexe em nenhum valor.
 *
 * `useSignupSourceWriter` cuida da gravação: a chave da operação é a mesma enquanto o resultado é incerto (a conexão caiu depois de
 * enviar) e muda quando o servidor recusa ou confirma; a versão é a da resposta que a tela leu (0 sem resposta). Uma recusa por
 * versão antiga (outro aparelho respondeu antes) explica em uma frase, e a leitura é recarregada por `useSetSignupSource` (state/data.ts),
 * de modo que o toque seguinte já manda a versão certa.
 */
function useSignupSourceWriter(current: SignupSource | null) {
  const set = useSetSignupSource();
  const slot = useRef(newAttemptSlot());
  const [busy, setBusy] = useState<SignupSourceOption | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (source: SignupSourceOption): Promise<boolean> => {
    if (busy) return false;
    const expectedVersion = current?.version ?? 0;
    const snapshot = `${source}|${expectedVersion}`;
    const key = keyForSend(slot.current, snapshot);
    setBusy(source);
    setError(null);
    try {
      await set.mutateAsync({ key, expectedVersion, source });
      settleSlot(slot.current);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return true;
    } catch (e) {
      if (isUncertain(e)) {
        // A gravação pode ter acontecido: a próxima tentativa com a mesma escolha usa a mesma chave e o banco devolve o que já gravou.
        recordUncertain(slot.current, key, snapshot);
        setError(SIGNUP_SOURCE_TEXT.uncertain);
      } else {
        refuseKey(slot.current);
        setError(signupSourceErrorText(codeOf(e)));
      }
      return false;
    } finally {
      setBusy(null);
    }
  };

  return { choose, busy, error };
}

/** As seis opções, em chips de escolha única; `selected` marca a resposta de agora (Conta) ou nenhuma (Resumo). */
function SignupSourceChoices({
  selected,
  busy,
  onChoose,
}: {
  selected: SignupSourceOption | null;
  busy: SignupSourceOption | null;
  onChoose: (source: SignupSourceOption) => void;
}) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={SIGNUP_SOURCE_TEXT.groupA11y}>
      {SIGNUP_SOURCES.map((s) => (
        <Chip
          key={s}
          label={busy === s ? SIGNUP_SOURCE_TEXT.saving : SIGNUP_SOURCE_LABEL[s]}
          accessibilityLabel={SIGNUP_SOURCE_TEXT.optionA11y(s)}
          selected={selected === s}
          onPress={() => onChoose(s)}
        />
      ))}
    </View>
  );
}

/** Mensagem de erro do cartão e de Conta: lida ao aparecer. */
function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Txt variant="label" color={colors.error} style={{ fontFamily: fonts.bold }} accessibilityLiveRegion="polite" accessibilityRole="alert">
      {text}
    </Txt>
  );
}

/**
 * O cartão do Resumo, na área dos avisos temporários (depois de "Anotar gasto"). Aparece só quando TUDO isto vale: conta real (nunca a
 * demonstração), Pessoal no mês de hoje (`eligible`), nenhum outro aviso na vez (`blocked` falso: "Seus últimos meses" e "Primeiros
 * passos" vão antes, um por vez), a resposta carregou e ainda não existe, este aparelho já viu o Resumo da pessoa em um dia anterior ao de
 * hoje (o primeiro dia de uso passa sem a pergunta) e "Agora não" não está valendo (30 dias, guardado no aparelho). Falha de leitura
 * nunca vira "não respondeu": o cartão fica de fora. Responder some para sempre, com a faixa "Resposta guardada. Você pode mudar em
 * Conta."; "Agora não" fecha por 30 dias.
 */
export function SignupSourceCard({ eligible, blocked, onSaved }: { eligible: boolean; blocked: boolean; onSaved: (text: string) => void }) {
  const { user, auth, today } = useSession();
  const real = auth.mode !== 'demo' && Boolean(user);
  const device = useSignupSourceDevice(real ? user?.id : undefined);
  // A resposta só é lida quando o cartão poderia aparecer (nenhuma consulta nos outros meses, na Família nem com outro aviso na vez).
  const source = useSignupSource(real && eligible && !blocked);
  const writer = useSignupSourceWriter(source.data ?? null);
  const { ready, markSeen } = device;

  // O primeiro dia de uso neste aparelho: guarda o dia em que o Resumo desta pessoa foi visto pela primeira vez.
  useEffect(() => {
    if (real && ready) markSeen(today);
  }, [real, ready, markSeen, today]);

  const show =
    real &&
    eligible &&
    !blocked &&
    ready &&
    source.isSuccess &&
    shouldAskSignupSource({ answered: source.data !== null, today, device: device.device });
  if (!show) return null;

  const choose = async (s: SignupSourceOption) => {
    if (await writer.choose(s)) {
      onSaved(SIGNUP_SOURCE_TEXT.saved);
      announceOnIOS(SIGNUP_SOURCE_TEXT.saved, { queue: true });
    }
  };

  return (
    <Animated.View entering={enter} exiting={exit}>
      <Card style={styles.card}>
        <View style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {SIGNUP_SOURCE_TEXT.title}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {SIGNUP_SOURCE_TEXT.note}
          </Txt>
        </View>
        <SignupSourceChoices selected={null} busy={writer.busy} onChoose={choose} />
        <ErrorLine text={writer.error} />
        <LinkButton
          label={SIGNUP_SOURCE_TEXT.notNow}
          accessibilityLabel={SIGNUP_SOURCE_TEXT.notNowA11y}
          style={styles.dismiss}
          disabled={writer.busy !== null}
          onPress={() => device.notNow(today)}
        />
      </Card>
    </Animated.View>
  );
}

/**
 * O card de Conta: a resposta de agora (ou "Você ainda não respondeu."), as seis opções com a escolhida marcada e a linha curta. Tocar
 * em outra opção muda a resposta (inclusive para "Prefiro não dizer"); tocar na que já vale não faz nada. Só em conta real; sem a
 * leitura (falha, ou o banco ainda sem a migração 0018), o card não aparece.
 */
export function SignupSourceAccountCard() {
  const { user, auth } = useSession();
  const real = auth.mode !== 'demo' && Boolean(user);
  const source = useSignupSource(real);
  const writer = useSignupSourceWriter(source.data ?? null);
  const [saved, setSaved] = useState(false);
  if (!real || !source.isSuccess) return null;
  const current = source.data;

  const choose = async (s: SignupSourceOption) => {
    if (current?.source === s) return;
    setSaved(false);
    if (await writer.choose(s)) {
      setSaved(true);
      announceOnIOS(SIGNUP_SOURCE_TEXT.accountSaved, { queue: true });
    }
  };

  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {SIGNUP_SOURCE_TEXT.accountTitle}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {SIGNUP_SOURCE_TEXT.note}
      </Txt>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {current ? SIGNUP_SOURCE_TEXT.accountCurrent(current.source) : SIGNUP_SOURCE_TEXT.accountNone}
      </Txt>
      <SignupSourceChoices selected={current?.source ?? null} busy={writer.busy} onChoose={choose} />
      <ErrorLine text={writer.error} />
      {saved && !writer.error ? (
        <Txt variant="caption" color={colors.successText} accessibilityLiveRegion="polite">
          {SIGNUP_SOURCE_TEXT.accountSaved}
        </Txt>
      ) : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {SIGNUP_SOURCE_TEXT.accountChange}
      </Txt>
    </Card>
  );
}

/** O cartão entra depois de o aviso anterior sair (240 ms) e sai em 240 ms, sem animação com "Reduzir movimento". */
const enter = FadeIn.delay(motion.confirm).duration(motion.confirm).reduceMotion(ReduceMotion.System);
const exit = FadeOut.duration(motion.confirm).reduceMotion(ReduceMotion.System);

const styles = StyleSheet.create({
  card: { gap: space[3], paddingVertical: space[4] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  dismiss: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
