import { MONTH_CHECK_TEXT, monthCheckErrorText, newOperationKey, type MonthCheckPlan } from '@clarevo/core';
import * as Haptics from 'expo-haptics';
import { Check, Undo2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, StyleSheet, View } from 'react-native';

import { codeOf, isUncertain } from '@/components/retorno-acoes';
import { Button, LinkButton, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { useClearMonthCheck, useSetMonthCheck } from '@/state/data';
import { colors, fonts, space } from '@/theme/tokens';

/** Leva o foco a um botão (o que a pessoa acabou de tocar sai da tela): web com `focus()`, apps com o foco do leitor de tela. */
function focusNode(node: View | null) {
  if (!node) return;
  if (Platform.OS === 'web') (node as unknown as HTMLElement).focus?.();
  else {
    const handle = findNodeHandle(node);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }
}

/**
 * "Conferi este mês" (D-060, item 2; resolve P-022) num lugar da tela: o botão "Conferi: não houve gastos em agosto de 2026" para o mês
 * fechado sem registros, ou a frase "Você conferiu: não houve gastos em agosto de 2026." com "Desfazer a conferência". Quem só lê o
 * contexto vê a frase, sem os botões (o plano vem do core, que decide pela escrita). Marcar não muda nenhum valor e não conta como
 * anotação; nada aparece como feito antes da confirmação do servidor. A chave da operação fica entre as tentativas: depois de uma falha
 * de rede, repetir com a mesma chave é seguro (o banco reconhece a repetição e devolve a marca). Uma recusa (algo mudou em outro
 * aparelho) recarrega a leitura e explica em uma frase. O sucesso é dito uma vez ao leitor de tela, e o foco vai para o botão que
 * passa a valer (desfazer depois de marcar, conferir depois de desfazer).
 */
export function MonthCheckBlock({ contextId, plan, style }: { contextId: string | undefined; plan: MonthCheckPlan | null; style?: object }) {
  const set = useSetMonthCheck();
  const clear = useClearMonthCheck();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState('');
  // Uma chave por tentativa de cada ação e mês; só se guarda depois de um resultado incerto.
  const keys = useRef(new Map<string, string>());
  const actionRef = useRef<View>(null);
  const undoRef = useRef<View>(null);
  const focusNext = useRef<'undo' | 'action' | null>(null);
  const state = plan?.state ?? null;

  useEffect(() => {
    // O botão novo só existe depois de a leitura recarregar: o foco vai para ele nesse momento.
    if (focusNext.current === 'undo' && state === 'conferido') {
      focusNext.current = null;
      focusNode(undoRef.current);
    } else if (focusNext.current === 'action' && state === 'sem_registros') {
      focusNext.current = null;
      focusNode(actionRef.current);
    }
  }, [state]);

  if (!plan || !contextId) return null;
  if (!plan.action && !plan.doneText) return null;

  const run = async (kind: 'marcar' | 'desfazer') => {
    if (busy) return;
    const slot = `${kind}|${plan.month}|${plan.kind}`;
    const key = keys.current.get(slot) ?? newOperationKey();
    keys.current.set(slot, key);
    setBusy(true);
    setError(null);
    try {
      const v = { key, contextId, month: plan.month, kind: plan.kind };
      if (kind === 'marcar') await set.mutateAsync({ ...v, expectedVersion: 0 });
      else await clear.mutateAsync({ ...v, expectedVersion: 1 });
      keys.current.delete(slot);
      focusNext.current = kind === 'marcar' ? 'undo' : 'action';
      const text = kind === 'marcar' ? MONTH_CHECK_TEXT.announceDone(plan.kind, plan.month) : MONTH_CHECK_TEXT.announceUndone(plan.kind, plan.month);
      setLive(text);
      announceOnIOS(text, { queue: true });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      if (isUncertain(e)) {
        // A gravação pode ter acontecido: a próxima tentativa usa a mesma chave e o banco devolve o que já gravou.
        setError(MONTH_CHECK_TEXT.uncertain);
      } else {
        keys.current.delete(slot);
        setError(monthCheckErrorText(codeOf(e)));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.block, style]}>
      {plan.doneText ? (
        <>
          <View style={styles.done}>
            <Check size={18} color={colors.text} strokeWidth={2.25} aria-hidden style={{ marginTop: 2 }} />
            <Txt style={{ flex: 1, minWidth: 0 }}>{plan.doneText}</Txt>
          </View>
          {plan.undo ? (
            <LinkButton
              // @ts-expect-error O LinkButton repassa `ref` ao Pressable (React 19), como o Button.
              ref={undoRef}
              label={busy ? MONTH_CHECK_TEXT.saving : plan.undo}
              accessibilityLabel={plan.undoA11y ?? undefined}
              icon={Undo2}
              disabled={busy}
              onPress={() => run('desfazer')}
              style={styles.link}
            />
          ) : null}
        </>
      ) : plan.action ? (
        <>
          <Button
            ref={actionRef}
            label={plan.action}
            icon={Check}
            tone="soft"
            busy={busy}
            busyLabel={MONTH_CHECK_TEXT.saving}
            onPress={() => run('marcar')}
          />
          {plan.actionNote ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {plan.actionNote}
            </Txt>
          ) : null}
        </>
      ) : null}
      {error ? (
        <Txt variant="label" color={colors.error} style={{ fontFamily: fonts.bold }} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
      {/* Região viva escondida só da vista: o resultado é dito uma vez (leitores de tela da web e do Android). */}
      <View style={styles.liveClip}>
        <Txt style={styles.liveText} accessibilityLiveRegion="polite" aria-live="polite">
          {live}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[2] },
  done: { flexDirection: 'row', alignItems: 'flex-start', columnGap: space[2] },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 48 },
  liveClip: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  liveText: { width: 240 },
});
