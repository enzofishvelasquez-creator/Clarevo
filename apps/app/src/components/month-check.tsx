import { MONTH_CHECK_TEXT, MonthCheckKeys, monthCheckErrorText, monthCheckOutcome, newOperationKey, type MonthCheckMove, type MonthCheckPlan } from '@clarevo/core';
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
 * "Conferi este mês" (D-060, item 2; resolve P-022) num lugar da tela: o botão "Conferi: não houve pagamentos em agosto de 2026" para o
 * mês fechado sem registros, ou a frase "Você conferiu: não houve pagamentos em agosto de 2026." com "Desfazer a conferência". Em
 * pagamentos, quando o mês tem compras no cartão, o aviso "Há compras no cartão em agosto de 2026. Elas entram no Pago quando a fatura é
 * paga." vem junto (compra no cartão não é pagamento: só a fatura paga entra no Pago). Quem só lê o contexto vê a frase, sem os botões
 * (o plano vem do core, que decide pela escrita). Marcar não muda nenhum valor e não conta como anotação; nada aparece como feito antes
 * da confirmação do servidor, e o resultado é conferido (`checked`) antes de anunciar "Conferência registrada" ou "Conferência
 * desfeita": a repetição de uma chave devolve o estado de agora, que pode não ser o pedido. A tela manda a versão da marca que leu; a
 * versão antiga é recusada. A chave da operação fica entre as tentativas só depois de um resultado incerto: repetir com a mesma chave
 * e a mesma versão é seguro (o banco reconhece a repetição e devolve a marca), e as chaves guardadas são esquecidas quando o estado
 * muda. Uma recusa (algo mudou em outro aparelho) recarrega a leitura e explica em uma frase. O sucesso é dito uma vez ao leitor de
 * tela, e o foco vai para o botão que passa a valer (desfazer depois de marcar, conferir depois de desfazer).
 */
export function MonthCheckBlock({ contextId, plan, style }: { contextId: string | undefined; plan: MonthCheckPlan | null; style?: object }) {
  const set = useSetMonthCheck();
  const clear = useClearMonthCheck();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState('');
  // Uma chave por tentativa de cada ação; só se guarda depois de um resultado incerto, e se esquece quando o estado muda.
  const keys = useRef(new MonthCheckKeys(newOperationKey));
  const actionRef = useRef<View>(null);
  const undoRef = useRef<View>(null);
  const focusNext = useRef<'undo' | 'action' | null>(null);
  const state = plan?.state ?? null;
  const version = plan?.version ?? 0;
  const month = plan?.month;
  const checkKind = plan?.kind;

  // O estado mudou (outro mês, outro tipo, outro estado ou outra versão da marca): as chaves guardadas já não servem.
  useEffect(() => {
    if (month && checkKind && state) keys.current.sync({ month, kind: checkKind, state, version });
  }, [month, checkKind, state, version]);

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

  const run = async (move: MonthCheckMove) => {
    if (busy) return;
    const key = keys.current.keyFor(move, plan);
    setBusy(true);
    setError(null);
    try {
      // A versão é a da marca que esta tela leu: marcar manda a da linha (0 sem linha); desfazer, a da linha ligada.
      const v = { key, contextId, month: plan.month, kind: plan.kind, expectedVersion: plan.version };
      const result = move === 'marcar' ? await set.mutateAsync(v) : await clear.mutateAsync(v);
      keys.current.settle(move);
      // O banco respondeu, mas a marca pode não ter ficado como pedida (a mesma chave devolve o estado de agora, e outro aparelho pode
      // ter desfeito ou refeito): nada é anunciado como feito, e a leitura recarregada mostra o que está valendo.
      if (monthCheckOutcome(move, result) === 'mudou') {
        setError(MONTH_CHECK_TEXT.changedElsewhere);
        return;
      }
      focusNext.current = move === 'marcar' ? 'undo' : 'action';
      const text = move === 'marcar' ? MONTH_CHECK_TEXT.announceDone(plan.kind, plan.month) : MONTH_CHECK_TEXT.announceUndone(plan.kind, plan.month);
      setLive(text);
      announceOnIOS(text, { queue: true });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      if (isUncertain(e)) {
        // A gravação pode ter acontecido: a próxima tentativa usa a mesma chave e a mesma versão, e o banco devolve o que já gravou.
        keys.current.keep(move, plan, key);
        setError(MONTH_CHECK_TEXT.uncertain);
      } else {
        keys.current.settle(move);
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
          {plan.cardNotice ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {plan.cardNotice}
            </Txt>
          ) : null}
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
          {plan.cardNotice ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {plan.cardNotice}
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
