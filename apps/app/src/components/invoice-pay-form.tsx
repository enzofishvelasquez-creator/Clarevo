import {
  ACCOUNTS_TEXT,
  CARDS_TEXT,
  CARD_ERROR_TEXT,
  ERROR_TEXT,
  addDays,
  addMonths,
  addYearsClamped,
  cardErrorText,
  chooseAccountId,
  formatBRL,
  formatDateBR,
  formatMonthName,
  invoiceTexts,
  maskDateBR,
  monthOf,
  partialPaymentCalcLink,
  partialPaymentText,
  validateInvoicePaymentDraft,
  type Card as CardData,
  type Invoice,
  type InvoicePaymentDraft,
  type PersonalSpace,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Info } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { formatMoneyText } from '@/components/calc/parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { Banner, Card, Chip, LinkButton, Money, Screen, TextField, Txt } from '@/components/ui';
import { invoiceHref } from '@/lib/cards';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { totalChange } from '@/lib/highlight';
import { useLastAccount } from '@/lib/last-account';
import { useCardOperationKey, usePayInvoice } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

const I = CARDS_TEXT.invoice;
const S = CARDS_TEXT.screens;

/**
 * Pagar fatura (D-037): o total ou "Outro valor" e a data do pagamento, que vale de até 1 ano atrás (ou do começo do período da
 * fatura, se for mais antigo) até hoje. Uma só operação do banco cria o gasto do pagamento (entra em Pago no mês da data) e quita a
 * conta da fatura. Pagamento parcial: a diferença vira "Saldo anterior" na fatura seguinte, sem juros; o texto diz isso e leva a
 * "Quanto custa pagar só uma parte?". Só se paga fatura fechada (a aberta mostra quando poderá ser paga); a data do pagamento pode
 * ser anterior ao fechamento, para quem pagou antes.
 */
export function InvoicePayForm({ card, invoice, space: personal }: { card: CardData; invoice: Invoice; space: PersonalSpace }) {
  const { today } = useSession();
  const lastAccount = useLastAccount();
  const qc = useQueryClient();
  const pay = usePayInvoice();
  const keys = useCardOperationKey();
  const t = invoiceTexts(invoice, today);

  const [initial] = useState<InvoicePaymentDraft & { accountId: string }>(() => ({
    mode: 'total',
    amountText: '',
    dateText: formatDateBR(today),
    accountId: chooseAccountId(personal.accounts, lastAccount.last),
  }));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<'amountText' | 'dateText', string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty && !busy, `/cartoes/${card.id}/fatura/${invoice.month}`);
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k === 'amountText' || k === 'dateText') setErrors((e) => ({ ...e, [k]: undefined }));
  };

  // Janela da data: do menor entre 1 ano atrás e o começo do período da fatura, até hoje.
  const oneYearAgo = addYearsClamped(today, -1);
  const earliest = invoice.periodStartOn < oneYearAgo ? invoice.periodStartOn : oneYearAgo;
  const checked = validateInvoicePaymentDraft(draft, invoice, today);
  const partial = checked.ok && checked.partial ? invoice.totalCents - checked.amountCents : null;
  const nextMonth = addMonths(invoice.month, 1);
  const calc = partial !== null ? partialPaymentCalcLink(partial) : null;
  const paidMonth = checked.ok ? formatMonthName(monthOf(checked.paidOn)) : null;
  const account = personal.accounts.find((a) => a.id === draft.accountId) ?? personal.accounts[0];

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(invoiceHref(card.id, invoice.month)));

  async function submit() {
    if (busy || invoice.commitmentVersion === null) return;
    const v = validateInvoicePaymentDraft(draft, invoice, today);
    if (!v.ok) {
      setErrors(v.errors);
      setBanner(null);
      if (v.errors.amountText) amountRef.current?.focus();
      else dateRef.current?.focus();
      return;
    }
    setErrors({});
    setBanner(null);
    setBusy(true);
    try {
      const version = invoice.commitmentVersion;
      const r = await guardedWrite(
        keys,
        JSON.stringify([card.id, invoice.month, version, v.amountCents, v.paidOn, draft.accountId]),
        (key) =>
          pay.mutateAsync({ key, cardId: card.id, month: invoice.month, version, amountCents: v.amountCents, paidOn: v.paidOn, accountId: draft.accountId || null }),
        (s) => s.action === 'pagar_fatura' && s.cardId === card.id,
      );
      if (r.status === 'ok' || r.status === 'reconciled') {
        // Confirmação tátil, aviso e efeito em Pago só depois de o servidor confirmar.
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        lastAccount.remember(draft.accountId);
        if (r.status === 'ok') totalChange.set({ total: 'pago', month: monthOf(v.paidOn), deltaCents: v.amountCents });
        const text =
          r.status === 'ok'
            ? `${v.partial ? I.paidPartial : I.paid} ${formatBRL(v.amountCents)} em Pago de ${formatMonthName(monthOf(v.paidOn))}.`
            : I.paidPartial;
        flash.set(text);
        guard.leave(goBack);
        return;
      }
      if (r.status === 'refused') {
        if (r.code === 'valor_invalido' || r.code === 'valor_acima_da_fatura') {
          setErrors({ amountText: cardErrorText(r.code) });
          amountRef.current?.focus();
          return;
        }
        if (r.code === 'data_invalida' || r.code === 'data_futura') {
          setErrors({ dateText: cardErrorText(r.code) });
          dateRef.current?.focus();
          return;
        }
        if (r.code === 'versao_desatualizada' || r.code === 'compromisso_quitado' || r.code === 'nao_encontrado') {
          // A fatura mudou em outro aparelho: recarrega e pede para conferir o total, sem perder o preenchimento.
          await qc.invalidateQueries({ queryKey: ['cards'] });
          setBanner(r.code === 'compromisso_quitado' ? CARD_ERROR_TEXT.compromisso_quitado : CARD_ERROR_TEXT.versao_desatualizada);
          return;
        }
        // fatura_aberta: o texto traz o dia do fechamento; a fatura é recarregada para a tela deixar de oferecer o pagamento.
        if (r.code === 'fatura_aberta') await qc.invalidateQueries({ queryKey: ['cards'] });
        setBanner(cardErrorText(r.code, { closingOn: invoice.closingOn }));
        return;
      }
      setBanner(CARD_ERROR_TEXT.pagar_falhou ?? ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={S.payTitle} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        <Card style={{ gap: space[1] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            {t.title} · {card.name}
          </Txt>
          <Txt variant="label" color={colors.textSecondary}>
            {I.totalLabel}
          </Txt>
          <Money cents={invoice.totalCents} variant="amount" />
          <Txt variant="caption" color={colors.textSecondary}>
            {t.closes} · {t.due}
          </Txt>
        </Card>

        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label="Quanto você pagou?">
            <Chip label={I.payTotal} selected={draft.mode === 'total'} onPress={() => set('mode', 'total')} />
            <Chip
              label={I.payOther}
              selected={draft.mode === 'outro'}
              onPress={() => {
                set('mode', 'outro');
                setTimeout(() => amountRef.current?.focus(), 0);
              }}
            />
          </ChoiceGroup>

          {draft.mode === 'outro' ? (
            <TextField
              ref={amountRef}
              label={I.payAmount}
              prefix="R$"
              large
              placeholder="0,00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={draft.amountText}
              onChangeText={(x) => set('amountText', x)}
              onBlur={() => set('amountText', formatMoneyText(draft.amountText))}
              error={errors.amountText}
              moneyHint
              hint={`Pode ser qualquer valor até ${formatBRL(invoice.totalCents)}, o total da fatura.`}
            />
          ) : null}

          <View style={{ gap: space[2] }}>
            <TextField
              ref={dateRef}
              label={I.payDate}
              value={draft.dateText}
              onChangeText={(x) => set('dateText', maskDateBR(x))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              error={errors.dateText}
              hint={`Digite só os números. De ${formatDateBR(earliest)} até hoje.`}
            />
            <View style={styles.chips}>
              <Chip label="Hoje" selected={draft.dateText === formatDateBR(today)} onPress={() => set('dateText', formatDateBR(today))} />
              <Chip
                label="Ontem"
                selected={draft.dateText === formatDateBR(addDays(today, -1))}
                onPress={() => set('dateText', formatDateBR(addDays(today, -1)))}
              />
            </View>
          </View>

          <AccountPicker accounts={personal.accounts} value={draft.accountId} label={ACCOUNTS_TEXT.out} onChange={(id) => set('accountId', id ?? '')} />

          <Txt variant="label" color={colors.textSecondary}>
            {S.payMonthNote}
          </Txt>
          {checked.ok && paidMonth ? (
            <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold }]}>
              {`O pagamento de ${formatBRL(checked.amountCents)} entra em Pago de ${paidMonth}${account && personal.accounts.length > 1 ? `, saindo da conta ${account.name}` : ''}.`}
            </MoneyTxt>
          ) : null}
        </Card>

        {partial !== null && calc ? (
          <Banner tone="info" icon={Info} live={false}>
            <MoneyTxt variant="label" style={tabular}>
              {partialPaymentText(partial, nextMonth, today)}
            </MoneyTxt>
            <LinkButton
              label={I.calcLink}
              style={styles.inlineLink}
              onPress={() => router.push({ pathname: '/calcular/[slug]', params: { slug: calc.slug, ...calc.params } })}
            />
          </Banner>
        ) : null}
      </Screen>

      <FormFooter error={banner} onCancel={guard.requestCancel} submitLabel={I.confirmPay} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
