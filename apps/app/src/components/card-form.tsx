import {
  CARDS_TEXT,
  CARD_FIELD_ORDER,
  CARD_NAME_MAX,
  ERROR_TEXT,
  cardErrorText,
  centsToInput,
  formatBRL,
  validateCardDraft,
  type Card as CardData,
  type CardDraft,
  type CardField,
  type CardFieldErrors,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CircleAlert, ShieldCheck } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt } from '@/components/money-text';
import { Banner, Button, Card, Screen, TextField, Txt } from '@/components/ui';
import { cardHref } from '@/lib/cards';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { useCardOperationKey, useCreateCard, useUpdateCard } from '@/state/data';
import { colors, space } from '@/theme/tokens';

const T = CARDS_TEXT.form;

export type CardFormMode = { type: 'novo'; backToExpense?: boolean } | { type: 'editar'; card: CardData };

const FIELD_OF_CODE: Partial<Record<string, CardField>> = {
  apelido_invalido: 'name',
  final_invalido: 'lastDigits',
  dia_de_fechamento_invalido: 'closingDay',
  dia_de_vencimento_invalido: 'dueDay',
  limite_invalido: 'limitText',
};

/**
 * Novo cartão e Editar cartão (D-037): apelido, 4 últimos dígitos (opcional), dia do fechamento, dia do vencimento e limite
 * (opcional). Nunca o número completo, o código de segurança nem a validade: o apelido que parece número é recusado com a
 * mensagem do core, e o campo de final só aceita 4 dígitos. Rascunho preservado em qualquer erro; a chave de operação reconcilia
 * um resultado incerto; nada de aviso antes de o servidor confirmar.
 */
export function CardForm({ mode, contextId }: { mode: CardFormMode; contextId: string }) {
  const qc = useQueryClient();
  const create = useCreateCard();
  const update = useUpdateCard();
  const keys = useCardOperationKey();
  const card = mode.type === 'editar' ? mode.card : null;

  const [initial] = useState<CardDraft>(() => ({
    name: card?.name ?? '',
    lastDigits: card?.lastDigits ?? '',
    closingDay: card ? String(card.closingDay) : '',
    dueDay: card ? String(card.dueDay) : '',
    limitText: card?.limitCents != null ? centsToInput(card.limitCents) : '',
  }));
  const [draft, setDraft] = useState<CardDraft>(initial);
  const [errors, setErrors] = useState<CardFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const refs: Record<CardField, React.RefObject<TextInput | null>> = {
    name: useRef<TextInput>(null),
    lastDigits: useRef<TextInput>(null),
    closingDay: useRef<TextInput>(null),
    dueDay: useRef<TextInput>(null),
    limitText: useRef<TextInput>(null),
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty && !busy, card ? `/cartoes/${card.id}` : '/cartoes');

  const set = <K extends keyof CardDraft>(k: K, v: CardDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k as CardField]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function submit() {
    if (busy) return;
    const v = validateCardDraft(draft);
    if (!v.ok) {
      setErrors(v.errors);
      setError(null);
      const first = CARD_FIELD_ORDER.find((f) => v.errors[f]);
      if (first) refs[first].current?.focus();
      return;
    }
    setErrors({});
    setError(null);
    setConflict(false);
    setBusy(true);
    try {
      const r = await guardedWrite(
        keys,
        JSON.stringify([card?.id ?? null, card?.version ?? 0, v.input]),
        (key) =>
          card
            ? update.mutateAsync({ key, id: card.id, version: card.version, input: v.input })
            : create.mutateAsync({ key, contextId, input: v.input }),
        (s) => (card ? s.action === 'alterar_cartao' && s.cardId === card.id : s.action === 'criar_cartao'),
      );
      if (r.status === 'ok' || r.status === 'reconciled') {
        // Confirmação tátil e aviso só depois de o servidor confirmar.
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        flash.set(T.saved);
        const id = r.status === 'ok' ? r.value.card.id : r.saved.cardId || card?.id;
        if (card) guard.leave(() => (router.canGoBack() ? router.back() : router.replace(cardHref(card.id))));
        else if (mode.type === 'novo' && mode.backToExpense && router.canGoBack()) guard.leave(() => router.back());
        else guard.leave(() => (id ? router.replace(cardHref(id)) : router.replace('/cartoes')));
        return;
      }
      if (r.status === 'refused') {
        if (r.code === 'versao_desatualizada' && card) {
          // Recarrega o cartão e mostra o que mudou, sem perder o preenchimento.
          await qc.refetchQueries({ queryKey: ['cards', 'one', card.id] });
          setConflict(true);
          return;
        }
        const field = FIELD_OF_CODE[r.code];
        if (field) {
          setErrors({ [field]: cardErrorText(r.code, { nickname: draft.name }) });
          refs[field].current?.focus();
          return;
        }
        if (r.code === 'nao_encontrado') qc.invalidateQueries({ queryKey: ['cards'] });
        setError(cardErrorText(r.code));
        return;
      }
      setError(ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={card ? T.editTitle : T.newTitle} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        {conflict && card ? (
          <Banner tone="erro" icon={CircleAlert}>
            <Txt variant="label" color={colors.error}>
              {cardErrorText('versao_desatualizada')}
            </Txt>
            <MoneyTxt variant="caption">
              {`Versão atual: ${card.name} · fecha dia ${card.closingDay} · vence dia ${card.dueDay}${card.limitCents != null ? ` · limite ${formatBRL(card.limitCents)}` : ''}`}
            </MoneyTxt>
            <Txt variant="caption">Seu preenchimento foi mantido abaixo.</Txt>
            <Button label="Aplicar minhas alterações na versão atual" tone="soft" onPress={submit} />
            <Button
              label="Descartar minhas alterações"
              tone="ghost"
              onPress={() => guard.leave(() => (router.canGoBack() ? router.back() : router.replace(cardHref(card.id))))}
            />
          </Banner>
        ) : null}

        <Card style={{ gap: space[4] }}>
          <TextField
            ref={refs.name}
            label={T.name}
            hint={T.nameHint}
            value={draft.name}
            onChangeText={(t) => set('name', t)}
            maxLength={CARD_NAME_MAX}
            autoFocus={mode.type === 'novo'}
            error={errors.name}
            returnKeyType="next"
            onSubmitEditing={() => refs.lastDigits.current?.focus()}
          />

          <TextField
            ref={refs.lastDigits}
            label={T.lastDigits}
            hint={T.lastDigitsHint}
            placeholder="1234"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={4}
            // Só dígitos e no máximo 4: o número do cartão não chega a ser digitado aqui.
            value={draft.lastDigits}
            onChangeText={(t) => set('lastDigits', t.replace(/\D/g, '').slice(0, 4))}
            error={errors.lastDigits}
            autoComplete="off"
            textContentType="none"
          />

          <TextField
            ref={refs.closingDay}
            label={T.closingDay}
            hint={T.closingHint}
            placeholder="Ex.: 3"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            value={draft.closingDay}
            onChangeText={(t) => set('closingDay', t.replace(/\D/g, '').slice(0, 2))}
            error={errors.closingDay}
          />

          <TextField
            ref={refs.dueDay}
            label={T.dueDay}
            hint={T.dueHint}
            placeholder="Ex.: 10"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            value={draft.dueDay}
            onChangeText={(t) => set('dueDay', t.replace(/\D/g, '').slice(0, 2))}
            error={errors.dueDay}
          />

          <TextField
            ref={refs.limitText}
            label={T.limit}
            prefix="R$"
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={draft.limitText}
            onChangeText={(t) => set('limitText', t)}
            onBlur={() => set('limitText', formatMoneyText(draft.limitText))}
            error={errors.limitText}
          />
        </Card>

        <View style={styles.privacy}>
          <View style={{ marginTop: 2 }}>
            <ShieldCheck size={18} color={colors.textSecondary} aria-hidden />
          </View>
          <Txt variant="label" color={colors.textSecondary} style={{ flex: 1 }}>
            {CARDS_TEXT.privacy}
          </Txt>
        </View>
        {mode.type === 'novo' && mode.backToExpense ? (
          <Txt variant="label" color={colors.textSecondary}>
            {CARDS_TEXT.screens.registerHint}
          </Txt>
        ) : null}
      </Screen>

      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={T.save} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
});
