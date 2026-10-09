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
import { Modal, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { PayRowError, codeOf, isUncertain, openRowFrom, useReturnWriter } from '@/components/retorno-acoes';
import { ReturnRow } from '@/components/retorno-linha';
import { yearA11yLabel } from '@/components/series-parts';
import { Button, Chip, Txt } from '@/components/ui';
import { useSpace } from '@/state/data';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

type Step = { type: 'linha' } | { type: 'pagar' } | { type: 'nao_houve' };

/**
 * "Registrar este mês" (ou "Registrar esta parcela") no detalhe do gasto fixo ou parcelamento: a mesma linha da revisão
 * dos últimos meses numa folha, com "Já paguei", "Não houve" (só gasto fixo mensal) e "Ainda não paguei". Valor que muda
 * abre o formulário de pagamento com o valor vazio. Só fecha com o resultado confirmado pelo servidor.
 */
export function RegisterMonthSheet({
  row: initialRow,
  onClose,
  onDone,
}: {
  row: ReviewRow;
  onClose: () => void;
  /** Resultado confirmado (texto do anúncio). */
  onDone: (text: string) => void;
}) {
  const reduced = useReducedMotion();
  const personal = useSpace().data;
  const writer = useReturnWriter();
  const [row, setRow] = useState(initialRow);
  const [step, setStep] = useState<Step>({ type: 'linha' });
  const [note, setNote] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const account = personal?.accounts.find((a) => a.id === accountChoice) ?? personal?.accounts[0] ?? null;
  const short = rowShortName(row);

  const failed = (e: unknown) => {
    setStep({ type: 'linha' });
    if (isUncertain(e)) {
      setNote(RETURN_TEXT.saveFailed);
      return;
    }
    // Recusa: o texto do código; conta já registrada ou série mudada em outro aparelho fecham a linha (a tela recarrega).
    const code = codeOf(e);
    setNote(returnErrorText(code));
    if (code === 'ocorrencia_existente' || code === 'mes_fora_da_revisao' || code === 'nao_encontrado') setClosed(true);
  };

  const act = async (fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      onDone(await fn());
    } catch (e) {
      if (e instanceof PayRowError) {
        if (e.created) {
          setRow(openRowFrom(row, e.created));
          setStep({ type: 'linha' });
          setNote(RETURN_TEXT.partialFailure(row.month));
          return;
        }
        failed(e.cause);
        return;
      }
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  const onAction = (action: ReviewAction) => {
    if (action === 'ja_paguei') {
      if (row.amountIsEstimate) {
        openForm();
        return;
      }
      setStep({ type: 'pagar' });
      return;
    }
    if (action === 'nao_houve') {
      setStep({ type: 'nao_houve' });
      return;
    }
    act(async () => {
      await writer.stillOpen(row);
      return RETURN_TEXT.announceStillOpen(short);
    });
  };

  /** Formulário de pagamento: conta já criada (falha parcial) ou registrar e pagar. */
  const openForm = () => {
    const created = row.commitment ?? writer.createdFor(row.key);
    onClose();
    if (created) router.push({ pathname: '/a-pagar/[id]/pagar', params: { id: created.id, data: 'vencimento' } });
    else if (row.series) router.push({ pathname: '/retomar/pagar', params: { serie: row.series.id, numero: String(row.series.number) } });
  };

  const pay = () =>
    act(async () => {
      const draft = rowPaymentDraft(row);
      await writer.payRow(row, { accountId: account!.id, amountCents: row.amountCents, paidOn: draft.paidOn, category: draft.category });
      return RETURN_TEXT.announcePaid(short);
    });

  const dialog = notHappenedDialog(row);
  const body = account ? RETURN_TEXT.payBody(short, row.amountCents, row.dueOn, account.name) : '';

  return (
    <Modal visible transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={busy ? () => {} : onClose}>
      <View style={styles.backdrop}>
        <View style={styles.box} accessibilityViewIsModal>
          {step.type === 'linha' ? (
            <>
              <Txt variant="title" accessibilityRole="header" accessibilityLabel={yearA11yLabel(short)}>
                {short}
              </Txt>
              <ReturnRow row={row} outcome={null} note={note} closed={closed} onAction={onAction} busy={busy} last />
              <Button label={RETURN_TEXT.back} tone="ghost" disabled={busy} onPress={onClose} />
            </>
          ) : step.type === 'pagar' ? (
            <>
              <Txt variant="title" accessibilityRole="header">
                {RETURN_TEXT.payTitle}
              </Txt>
              <Txt style={[{ fontFamily: fonts.bold }, tabular]} accessibilityLabel={yearA11yLabel(body)}>
                {body}
              </Txt>
              {personal && personal.accounts.length > 1 ? (
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={RETURN_TEXT.batchAccountLabel}>
                  {personal.accounts.map((a) => (
                    <Chip key={a.id} label={a.name} selected={account?.id === a.id} onPress={() => setAccountChoice(a.id)} />
                  ))}
                </View>
              ) : null}
              <View style={{ gap: space[2], marginTop: space[2] }}>
                <Button label={RETURN_TEXT.confirm} busy={busy} busyLabel="Aguarde…" disabled={!account} onPress={pay} />
                <Button label={RETURN_TEXT.payChange} tone="soft" disabled={busy} onPress={openForm} />
                <Button label={RETURN_TEXT.back} tone="ghost" disabled={busy} onPress={() => setStep({ type: 'linha' })} />
              </View>
            </>
          ) : (
            <>
              <Txt variant="title" accessibilityRole="header">
                {dialog.title}
              </Txt>
              <Txt color={colors.textSecondary}>{dialog.body}</Txt>
              <View style={{ gap: space[2], marginTop: space[2] }}>
                <Button label={RETURN_TEXT.back} tone="soft" disabled={busy} onPress={() => setStep({ type: 'linha' })} />
                <Button
                  label={dialog.confirm}
                  tone="danger"
                  busy={busy}
                  busyLabel="Aguarde…"
                  onPress={() =>
                    act(async () => {
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
