import {
  RETURN_TEXT,
  notHappenedDialog,
  returnErrorText,
  rowPaymentDraft,
  rowShortName,
  type ReviewAction,
  type ReviewRow,
} from '@clarevo/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { MoneyTxt } from '@/components/money-text';
import { PayRowError, codeOf, isUncertain, openRowFrom, useReturnWriter } from '@/components/retorno-acoes';
import { ReturnRow } from '@/components/retorno-linha';
import { yearA11yLabel } from '@/components/series-parts';
import { Button, Chip, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { useSpace } from '@/state/data';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

type Step = { type: 'linha' } | { type: 'pagar' } | { type: 'nao_houve' };

/** Espera para o anúncio de falha no iOS: o conteúdo da folha troca (volta à linha) e o VoiceOver precisa assentar antes. */
const ANNOUNCE_DELAY = 500;

/**
 * "Registrar este mês" (ou "Registrar esta parcela" e "Registrar parcelas") no detalhe do gasto fixo, parcelamento ou
 * conta do ano: a mesma linha da revisão dos últimos meses numa folha, com "Já paguei", "Não houve" (só gasto fixo
 * mensal) e "Ainda não paguei". Com várias linhas (parcelas de um ano), cada uma tem as suas ações e a folha fecha ao
 * confirmar uma; as que faltam continuam no detalhe. Valor que muda abre o formulário de pagamento com o valor vazio.
 * Só fecha com o resultado confirmado pelo servidor; quem recebe o texto (onDone) o mostra num FlashBanner, que o anuncia
 * no iOS. As falhas ficam na folha e são anunciadas aqui.
 */
export function RegisterMonthSheet({
  rows,
  title,
  onClose,
  onDone,
}: {
  /** Pelo menos uma linha "sem conta registrada" (seriesGapsInRange). */
  rows: readonly ReviewRow[];
  /** Título com várias linhas ("IPTU de 2026"); com uma só, o nome dela ("Aluguel de julho"). */
  title?: string;
  onClose: () => void;
  /** Resultado confirmado (texto do aviso, mostrado e anunciado por um FlashBanner de quem recebe). */
  onDone: (text: string) => void;
}) {
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const personal = useSpace().data;
  const writer = useReturnWriter();
  /** Dados atuais de cada linha (conta criada e pagamento que falhou), pela chave da linha recebida. */
  const [current, setCurrent] = useState<Record<string, ReviewRow>>({});
  const [activeKey, setActiveKey] = useState(rows[0]!.key);
  const [step, setStep] = useState<Step>({ type: 'linha' });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [closedRows, setClosedRows] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState(false);
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const account = personal?.accounts.find((a) => a.id === accountChoice) ?? personal?.accounts[0] ?? null;
  const view = (r: ReviewRow) => current[r.key] ?? r;
  const several = rows.length > 1;
  const active = rows.find((r) => r.key === activeKey) ?? rows[0]!;
  const row = view(active);
  const short = rowShortName(row);

  /**
   * Falha de uma linha: abaixo dela e, no iOS (sem região viva), anunciada. Com a espera, porque o conteúdo da folha
   * muda ao mesmo tempo (de "Marcar como paga?" de volta à linha) e a troca cortaria o anúncio.
   */
  const note = (key: string, text: string) => {
    setNotes((cur) => ({ ...cur, [key]: text }));
    announceOnIOS(text, { delay: ANNOUNCE_DELAY });
  };

  const failed = (key: string, e: unknown) => {
    setStep({ type: 'linha' });
    if (isUncertain(e)) {
      note(key, RETURN_TEXT.saveFailed);
      return;
    }
    // Recusa: o texto do código; conta já registrada ou série mudada em outro aparelho fecham a linha (a tela recarrega).
    const code = codeOf(e);
    note(key, returnErrorText(code));
    if (code === 'ocorrencia_existente' || code === 'mes_fora_da_revisao' || code === 'nao_encontrado') setClosedRows((cur) => ({ ...cur, [key]: true }));
  };

  const act = async (target: ReviewRow, fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setNotes(({ [target.key]: _gone, ...rest }) => rest);
    try {
      // O resultado vai para o FlashBanner do detalhe, que o anuncia no iOS depois de a folha fechar.
      onDone(await fn());
    } catch (e) {
      if (e instanceof PayRowError) {
        if (e.created) {
          const created = e.created;
          setCurrent((cur) => ({ ...cur, [target.key]: openRowFrom(view(target), created) }));
          setStep({ type: 'linha' });
          note(target.key, RETURN_TEXT.partialFailure(target.month));
          return;
        }
        failed(target.key, e.cause);
        return;
      }
      failed(target.key, e);
    } finally {
      setBusy(false);
    }
  };

  /** Formulário de pagamento: conta já criada (falha parcial) ou registrar e pagar. */
  const openForm = (target: ReviewRow) => {
    const created = target.commitment ?? writer.createdFor(target.key);
    onClose();
    if (created) router.push({ pathname: '/a-pagar/[id]/pagar', params: { id: created.id, data: 'vencimento' } });
    else if (target.series) router.push({ pathname: '/retomar/pagar', params: { serie: target.series.id, numero: String(target.series.number) } });
  };

  const onAction = (target: ReviewRow, action: ReviewAction) => {
    const data = view(target);
    setActiveKey(target.key);
    if (action === 'ja_paguei') {
      if (data.amountIsEstimate) {
        openForm(data);
        return;
      }
      setStep({ type: 'pagar' });
      return;
    }
    if (action === 'nao_houve') {
      setStep({ type: 'nao_houve' });
      return;
    }
    act(target, async () => {
      await writer.stillOpen(data);
      return RETURN_TEXT.announceStillOpen(rowShortName(data));
    });
  };

  const pay = () =>
    act(active, async () => {
      const draft = rowPaymentDraft(row);
      await writer.payRow(row, { accountId: account!.id, amountCents: row.amountCents, paidOn: draft.paidOn, category: draft.category });
      return RETURN_TEXT.announcePaid(short);
    });

  const lines = rows.map((r, i) => (
    <ReturnRow
      key={r.key}
      row={view(r)}
      outcome={null}
      note={notes[r.key] ?? null}
      closed={Boolean(closedRows[r.key])}
      onAction={(a) => onAction(r, a)}
      busy={busy}
      last={i === rows.length - 1}
    />
  ));
  const dialog = notHappenedDialog(row);
  const body = account ? RETURN_TEXT.payBody(short, row.amountCents, row.dueOn, account.name) : '';

  return (
    <Modal visible transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={busy ? () => {} : onClose}>
      <View style={styles.backdrop}>
        <View style={styles.box} accessibilityViewIsModal>
          {step.type === 'linha' ? (
            <>
              <Txt variant="title" accessibilityRole="header" accessibilityLabel={yearA11yLabel(several ? (title ?? short) : short)}>
                {several ? (title ?? RETURN_TEXT.registerParts) : short}
              </Txt>
              {several ? <ScrollView style={{ maxHeight: Math.round(height * 0.55) }}>{lines}</ScrollView> : lines}
              <Button label={RETURN_TEXT.back} tone="ghost" disabled={busy} onPress={onClose} />
            </>
          ) : step.type === 'pagar' ? (
            <>
              <Txt variant="title" accessibilityRole="header">
                {RETURN_TEXT.payTitle}
              </Txt>
              <MoneyTxt style={[{ fontFamily: fonts.bold }, tabular]} accessibilityLabel={yearA11yLabel(body)}>
                {body}
              </MoneyTxt>
              {personal && personal.accounts.length > 1 ? (
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={RETURN_TEXT.batchAccountLabel}>
                  {personal.accounts.map((a) => (
                    <Chip key={a.id} label={a.name} selected={account?.id === a.id} onPress={() => setAccountChoice(a.id)} />
                  ))}
                </View>
              ) : null}
              <View style={{ gap: space[2], marginTop: space[2] }}>
                <Button label={RETURN_TEXT.confirm} busy={busy} busyLabel="Aguarde…" disabled={!account} onPress={pay} />
                <Button label={RETURN_TEXT.payChange} tone="soft" disabled={busy} onPress={() => openForm(row)} />
                <Button label={RETURN_TEXT.back} tone="ghost" disabled={busy} onPress={() => setStep({ type: 'linha' })} />
              </View>
            </>
          ) : (
            <>
              <Txt variant="title" accessibilityRole="header">
                {dialog.title}
              </Txt>
              <MoneyTxt color={colors.textSecondary}>{dialog.body}</MoneyTxt>
              <View style={{ gap: space[2], marginTop: space[2] }}>
                <Button label={RETURN_TEXT.back} tone="soft" disabled={busy} onPress={() => setStep({ type: 'linha' })} />
                <Button
                  label={dialog.confirm}
                  tone="danger"
                  busy={busy}
                  busyLabel="Aguarde…"
                  onPress={() =>
                    act(active, async () => {
                      await writer.notHappened(row);
                      return RETURN_TEXT.announceNotHappened(short);
                    })
                  }
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(23,34,59,0.55)', alignItems: 'center', justifyContent: 'center', padding: space[6] },
  box: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], gap: space[3] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
