import {
  CARDS_TEXT,
  CATEGORIES,
  DESCRIPTION_MAX,
  ERROR_TEXT,
  MAX_RECORD_CENTS,
  NOTA_FLOW_TEXT,
  NOTA_TEXT,
  NO_CATEGORY_LABEL,
  addDays,
  cardErrorText,
  centsToInput,
  charCount,
  formatDateBR,
  installmentAmounts,
  installmentsNotice,
  invoiceMonthLabel,
  maskDateBR,
  parseBRL,
  validateCardPurchaseDraft,
  type Card as CardData,
  type CardEntry,
  type IsoMonth,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { Banner, Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { invoiceHref } from '@/lib/cards';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { openOfficialUrl, receiptLinks } from '@/lib/receipt-link';
import { useCardOperationKey, useUpdateCardEntry } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space, tabular } from '@/theme/tokens';

const S = CARDS_TEXT.screens;

type Field = 'description' | 'amountText' | 'dateText' | 'installmentsText';

/**
 * Editar uma compra no cartão (D-037): descrição, valor total, data da compra, categoria e parcelas. Mudar valor, data ou parcelas
 * recalcula as parcelas e pode levar a compra a outras faturas (o banco refaz tudo na mesma operação). Usa `update_card_entry`
 * com a versão da compra; compra em fatura já paga é recusada pelo banco com o texto de sempre. Nenhum dado de cartão é pedido.
 */
export function CardPurchaseForm({ card, month, entry }: { card: CardData; month: IsoMonth; entry: CardEntry }) {
  const { today } = useSession();
  const qc = useQueryClient();
  const updateEntry = useUpdateCardEntry();
  const keys = useCardOperationKey();

  const [initial] = useState(() => ({
    description: entry.description ?? '',
    amountText: centsToInput(entry.amountCents),
    dateText: entry.purchasedOn ? formatDateBR(entry.purchasedOn) : '',
    category: entry.category,
    installmentsText: String(entry.installments),
  }));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = {
    description: useRef<TextInput>(null),
    amountText: useRef<TextInput>(null),
    dateText: useRef<TextInput>(null),
    installmentsText: useRef<TextInput>(null),
  } satisfies Record<Field, React.RefObject<TextInput | null>>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty && !busy, `/cartoes/${card.id}/fatura/${month}`);
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(invoiceHref(card.id, month)));
  const focusFirst = (errs: Partial<Record<Field, string>>) => {
    const first = (['description', 'amountText', 'dateText', 'installmentsText'] as const).find((f) => errs[f]);
    if (first) refs[first].current?.focus();
  };

  const total = parseBRL(draft.amountText);
  const n = /^\d{1,3}$/.test(draft.installmentsText.trim()) ? Number(draft.installmentsText.trim()) : draft.installmentsText.trim() === '' ? 1 : Number.NaN;
  let installmentsLine: string | null = null;
  if (total !== null && total > 0 && total <= MAX_RECORD_CENTS && Number.isInteger(n) && n > 1 && n <= 48) {
    const first = installmentAmounts(total, n)[0]!;
    if (first >= 1) installmentsLine = installmentsNotice(n, first);
  }

  async function submit() {
    if (busy) return;
    const v = validateCardPurchaseDraft(draft, today);
    if (!v.ok) {
      setErrors(v.errors);
      setBanner(null);
      focusFirst(v.errors);
      return;
    }
    // A edição não troca a nota da compra: o resumo da chave não vai.
    const { receiptKey: _ignored, ...fields } = v.input;
    const input = { kind: 'compra' as const, ...fields };
    setErrors({});
    setBanner(null);
    setBusy(true);
    try {
      const r = await guardedWrite(
        keys,
        JSON.stringify([entry.id, entry.version, input]),
        (key) => updateEntry.mutateAsync({ key, entryId: entry.id, version: entry.version, input }),
        (s) => s.action === 'alterar_lancamento_cartao' && s.entryId === entry.id,
      );
      if (r.status === 'ok' || r.status === 'reconciled') {
        // Confirmação tátil e aviso só depois de o servidor confirmar.
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        flash.set(S.purchaseUpdated);
        guard.leave(goBack);
        return;
      }
      if (r.status === 'refused') {
        const field: Partial<Record<string, Field>> = {
          valor_invalido: 'amountText',
          valor_acima_do_limite: 'amountText',
          descricao_obrigatoria: 'description',
          descricao_longa: 'description',
          categoria_invalida: 'description',
          parcelas_invalidas: 'installmentsText',
          data_invalida: 'dateText',
          data_futura: 'dateText',
        };
        const f = field[r.code];
        if (f) {
          const errs = { [f]: cardErrorText(r.code, { purchase: true }) };
          setErrors(errs);
          focusFirst(errs);
          return;
        }
        if (r.code === 'versao_desatualizada' || r.code === 'nao_encontrado' || r.code === 'fatura_paga') await qc.invalidateQueries({ queryKey: ['cards'] });
        setBanner(cardErrorText(r.code, { purchase: true }));
        return;
      }
      setBanner(ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  const sefazUrl = receiptLinks.get(entry.receiptKey);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={S.purchaseEditTitle} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        <Card style={{ gap: space[4] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            {`Fatura de ${invoiceMonthLabel(month, today)} · ${card.name}`}
          </Txt>
          <Txt variant="label" color={colors.textSecondary}>
            {S.purchaseEditNote}
          </Txt>
          {entry.receiptKey ? (
            <Banner tone="info" live={false}>
              <Txt variant="label">{S.purchaseFromReceipt}</Txt>
              {sefazUrl ? (
                <Button
                  label={NOTA_TEXT.viewOnSefaz}
                  tone="soft"
                  onPress={() => openOfficialUrl(sefazUrl).then((ok) => ok || setBanner(NOTA_FLOW_TEXT.openFailed))}
                />
              ) : (
                <Txt variant="caption" color={colors.textSecondary}>
                  {NOTA_FLOW_TEXT.detailNoLink}
                </Txt>
              )}
            </Banner>
          ) : null}

          <TextField
            ref={refs.description}
            label="Descrição"
            value={draft.description}
            onChangeText={(t) => set('description', t)}
            maxLength={DESCRIPTION_MAX}
            error={errors.description}
            hint={charCount(draft.description) >= 60 ? `${charCount(draft.description)} de ${DESCRIPTION_MAX} caracteres` : undefined}
            returnKeyType="next"
            onSubmitEditing={() => refs.amountText.current?.focus()}
          />
          <TextField
            ref={refs.amountText}
            label="Valor total da compra"
            prefix="R$"
            large
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            onBlur={() => set('amountText', formatMoneyText(draft.amountText))}
            error={errors.amountText}
          />
          <View style={{ gap: space[2] }}>
            <TextField
              ref={refs.dateText}
              label={S.purchaseDateLabel}
              value={draft.dateText}
              onChangeText={(t) => set('dateText', maskDateBR(t))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              error={errors.dateText}
              hint="Digite só os números. Só datas até hoje."
            />
            <View style={styles.chips}>
              <Chip label="Hoje" selected={draft.dateText === formatDateBR(today)} onPress={() => set('dateText', formatDateBR(today))} />
              <Chip label="Ontem" selected={draft.dateText === formatDateBR(addDays(today, -1))} onPress={() => set('dateText', formatDateBR(addDays(today, -1)))} />
            </View>
          </View>
          <TextField
            ref={refs.installmentsText}
            label={CARDS_TEXT.expense.installments}
            value={draft.installmentsText}
            onChangeText={(t) => set('installmentsText', t.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            placeholder="1"
            hint={CARDS_TEXT.expense.installmentsHint}
            error={errors.installmentsText}
          />
          {installmentsLine ? (
            <Banner tone="info" live={false}>
              <MoneyTxt variant="label" style={tabular}>
                {installmentsLine}
              </MoneyTxt>
            </Banner>
          ) : null}
          <ChoiceGroup label="Categoria">
            <Chip label={NO_CATEGORY_LABEL} selected={draft.category === null} onPress={() => set('category', null)} />
            {CATEGORIES.despesa.map((c) => (
              <Chip key={c} label={c} selected={draft.category === c} onPress={() => set('category', c)} />
            ))}
          </ChoiceGroup>
        </Card>
      </Screen>
      <FormFooter error={banner} onCancel={guard.requestCancel} submitLabel={S.purchaseSave} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
