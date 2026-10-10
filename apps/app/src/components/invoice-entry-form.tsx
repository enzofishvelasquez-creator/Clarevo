import {
  CARDS_TEXT,
  CARD_CHARGE_LABEL,
  CARD_CHARGE_TYPES,
  CATEGORIES,
  DESCRIPTION_MAX,
  ERROR_TEXT,
  NO_CATEGORY_LABEL,
  cardErrorText,
  centsToInput,
  invoiceMonthLabel,
  validateCardChargeDraft,
  validateCardRefundDraft,
  type Card as CardData,
  type CardChargeType,
  type CardEntry,
  type CardEntryInput,
  type IsoMonth,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { ChoiceGroup } from '@/components/series-parts';
import { Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { invoiceHref } from '@/lib/cards';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { useAddCardCharge, useAddCardRefund, useCardOperationKey, useUpdateCardEntry } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const I = CARDS_TEXT.invoice;
const S = CARDS_TEXT.screens;

export type EntryKind = 'encargo' | 'estorno';

/**
 * "Informar encargos" e "Registrar estorno" numa fatura (D-037). Encargos: juros, multa, IOF, anuidade ou tarifa que o banco
 * cobrou (o Clarevo não calcula juros sozinho). Estorno: devolução de uma compra, que abate a categoria escolhida. Com `entry`,
 * edita o lançamento (versão conferida). A fatura paga não aceita lançamentos novos: o banco recusa e o texto diz como desfazer.
 */
export function InvoiceEntryForm({ kind, card, month, entry }: { kind: EntryKind; card: CardData; month: IsoMonth; entry?: CardEntry | null }) {
  const { today } = useSession();
  const qc = useQueryClient();
  const addCharge = useAddCardCharge();
  const addRefund = useAddCardRefund();
  const updateEntry = useUpdateCardEntry();
  const keys = useCardOperationKey();
  const editing = entry ?? null;
  const charge = kind === 'encargo';

  const [initial] = useState(() => ({
    chargeType: (editing?.chargeType ?? null) as CardChargeType | null,
    amountText: editing ? centsToInput(editing.amountCents) : '',
    description: editing?.description ?? '',
    category: editing?.category ?? null,
  }));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<'chargeType' | 'amountText' | 'description', string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty && !busy, `/cartoes/${card.id}/fatura/${month}`);
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(invoiceHref(card.id, month)));
  const invoiceName = `Fatura de ${invoiceMonthLabel(month, today)}`;

  async function submit() {
    if (busy) return;
    let input: CardEntryInput;
    if (charge) {
      const v = validateCardChargeDraft({ chargeType: draft.chargeType, amountText: draft.amountText }, month, today);
      if (!v.ok) {
        setErrors({ chargeType: v.errors.chargeType, amountText: v.errors.amountText ?? v.errors.month });
        setBanner(null);
        if (!v.errors.chargeType) amountRef.current?.focus();
        return;
      }
      input = { kind: 'encargo', ...v.input };
    } else {
      const v = validateCardRefundDraft({ description: draft.description, amountText: draft.amountText, category: draft.category }, month, today);
      if (!v.ok) {
        setErrors({ description: v.errors.description, amountText: v.errors.amountText ?? v.errors.month });
        setBanner(null);
        if (v.errors.description) descriptionRef.current?.focus();
        else amountRef.current?.focus();
        return;
      }
      input = { kind: 'estorno', ...v.input };
    }
    setErrors({});
    setBanner(null);
    setBusy(true);
    try {
      const r = await guardedWrite(
        keys,
        JSON.stringify([editing?.id ?? null, editing?.version ?? 0, input]),
        (key) => {
          if (editing) return updateEntry.mutateAsync({ key, entryId: editing.id, version: editing.version, input });
          if (input.kind === 'encargo') return addCharge.mutateAsync({ key, cardId: card.id, input });
          return addRefund.mutateAsync({ key, cardId: card.id, input });
        },
        (s) =>
          editing
            ? s.action === 'alterar_lancamento_cartao' && s.entryId === editing.id
            : s.action === (charge ? 'criar_encargo_cartao' : 'criar_estorno_cartao') && s.cardId === card.id,
      );
      if (r.status === 'ok' || r.status === 'reconciled') {
        // Confirmação tátil e aviso só depois de o servidor confirmar.
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        flash.set(charge ? (editing ? S.chargeUpdated : S.chargeSaved) : editing ? S.refundUpdated : S.refundSaved);
        guard.leave(goBack);
        return;
      }
      if (r.status === 'refused') {
        if (r.code === 'valor_invalido' || r.code === 'valor_acima_do_limite') {
          setErrors({ amountText: cardErrorText(r.code) });
          amountRef.current?.focus();
          return;
        }
        if (r.code === 'tipo_de_encargo_invalido') {
          setErrors({ chargeType: cardErrorText(r.code) });
          return;
        }
        if (r.code === 'descricao_obrigatoria' || r.code === 'descricao_longa' || r.code === 'categoria_invalida') {
          setErrors({ description: cardErrorText(r.code) });
          descriptionRef.current?.focus();
          return;
        }
        if (r.code === 'versao_desatualizada' || r.code === 'nao_encontrado' || r.code === 'fatura_paga') {
          await qc.invalidateQueries({ queryKey: ['cards'] });
        }
        setBanner(cardErrorText(r.code));
        return;
      }
      setBanner(ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  const title = charge ? (editing ? S.chargeEditTitle : S.chargeTitle) : editing ? S.refundEditTitle : S.refundTitle;
  const submitLabel = charge ? S.chargeSave : S.refundSave;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={title} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        <Card style={{ gap: space[4] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            {invoiceName} · {card.name}
          </Txt>
          <Txt variant="label" color={colors.textSecondary}>
            {charge ? I.chargesHint : I.refundHint}
          </Txt>

          {charge ? (
            <ChoiceGroup label={I.chargeType} error={errors.chargeType}>
              {CARD_CHARGE_TYPES.map((t) => (
                <Chip key={t} label={CARD_CHARGE_LABEL[t]} selected={draft.chargeType === t} onPress={() => set('chargeType', t)} />
              ))}
            </ChoiceGroup>
          ) : (
            <TextField
              ref={descriptionRef}
              label={I.refundDescription}
              value={draft.description}
              onChangeText={(x) => set('description', x)}
              placeholder={S.refundDescriptionPlaceholder}
              maxLength={DESCRIPTION_MAX}
              autoFocus={!editing}
              error={errors.description}
              returnKeyType="next"
              onSubmitEditing={() => amountRef.current?.focus()}
            />
          )}

          <TextField
            ref={amountRef}
            label={charge ? I.chargeAmount : I.refundAmount}
            prefix="R$"
            large
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={draft.amountText}
            onChangeText={(x) => set('amountText', x)}
            onBlur={() => set('amountText', formatMoneyText(draft.amountText))}
            error={errors.amountText}
          />

          {charge ? null : (
            <ChoiceGroup label={I.refundCategory}>
              <Chip label={NO_CATEGORY_LABEL} selected={draft.category === null} onPress={() => set('category', null)} />
              {CATEGORIES.despesa.map((c) => (
                <Chip key={c} label={c} selected={draft.category === c} onPress={() => set('category', c)} />
              ))}
            </ChoiceGroup>
          )}
        </Card>
      </Screen>

      <FormFooter error={banner} onCancel={guard.requestCancel} submitLabel={submitLabel} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
});
