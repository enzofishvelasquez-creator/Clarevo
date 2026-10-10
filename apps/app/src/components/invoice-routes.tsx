import { CARDS_TEXT, CARD_ERROR_TEXT, ERROR_TEXT, invoiceFor } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { CardPurchaseForm } from '@/components/card-purchase-form';
import { InvoiceEntryForm, type EntryKind } from '@/components/invoice-entry-form';
import { InvoicePayForm } from '@/components/invoice-pay-form';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { invoiceHref, readInvoiceMonth } from '@/lib/cards';
import { useCard, useCardEntry, useCardInvoices, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const S = CARDS_TEXT.screens;

/** Cabeçalho e corpo de uma tela de formulário da fatura que não pode abrir (carregando, falha, sem cartão ou fatura bloqueada). */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={title} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>{children}</Screen>
    </View>
  );
}

function Blocked({ text, label, onPress }: { text: string; label: string; onPress: () => void }) {
  return (
    <Card style={{ gap: space[3] }}>
      <Txt>{text}</Txt>
      <Button label={label} onPress={onPress} />
    </Card>
  );
}

/** /cartoes/[id]/fatura/[mes]/pagar */
export function InvoicePayRoute() {
  const { id, mes } = useLocalSearchParams<{ id: string; mes: string }>();
  const month = readInvoiceMonth(mes);
  const { today } = useSession();
  const card = useCard(id);
  const invoices = useCardInvoices(card.data ?? null);
  const personal = useSpace();
  const title = S.payTitle;

  if (card.isError || invoices.isError || personal.isError) {
    return (
      <Shell title={title}>
        <ErrorState
          message={ERROR_TEXT.carregar_falhou}
          onRetry={() => {
            card.refetch();
            invoices.refetch();
            personal.refetch();
          }}
        />
      </Shell>
    );
  }
  if (card.isPending || (card.data && invoices.isPending) || personal.isPending) {
    return (
      <Shell title={title}>
        <LoadingState />
      </Shell>
    );
  }
  if (!card.data || !month || !invoices.data || !personal.data) {
    return (
      <Shell title={title}>
        <Blocked text={CARD_ERROR_TEXT.nao_encontrado} label="Ir para Cartões" onPress={() => router.replace('/cartoes')} />
      </Shell>
    );
  }
  const invoice = invoiceFor(card.data, invoices.data, month, today);
  const paid = invoice.situation === 'paga' || invoice.situation === 'paga_em_parte';
  if (paid || invoice.commitmentVersion === null || invoice.totalCents <= 0) {
    return (
      <Shell title={title}>
        <Blocked
          text={paid ? CARD_ERROR_TEXT.compromisso_quitado : S.noPayable}
          label={CARDS_TEXT.openInvoice}
          onPress={() => router.replace(invoiceHref(card.data!.id, month))}
        />
      </Shell>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <InvoicePayForm card={card.data} invoice={invoice} space={personal.data} />
    </View>
  );
}

/** /cartoes/[id]/fatura/[mes]/encargo e /estorno (com ?lancamento=<id> para editar). */
export function InvoiceEntryRoute({ kind }: { kind: EntryKind }) {
  const { id, mes, lancamento } = useLocalSearchParams<{ id: string; mes: string; lancamento?: string }>();
  const month = readInvoiceMonth(mes);
  const { today } = useSession();
  const card = useCard(id);
  const invoices = useCardInvoices(card.data ?? null);
  const entry = useCardEntry(lancamento);
  const title = kind === 'encargo' ? (lancamento ? S.chargeEditTitle : S.chargeTitle) : lancamento ? S.refundEditTitle : S.refundTitle;

  if (card.isError || invoices.isError || entry.isError) {
    return (
      <Shell title={title}>
        <ErrorState
          message={ERROR_TEXT.carregar_falhou}
          onRetry={() => {
            card.refetch();
            invoices.refetch();
            entry.refetch();
          }}
        />
      </Shell>
    );
  }
  if (card.isPending || (card.data && invoices.isPending) || (lancamento && entry.isPending)) {
    return (
      <Shell title={title}>
        <LoadingState />
      </Shell>
    );
  }
  const found = lancamento ? entry.data : null;
  const wrongEntry = lancamento && (!found || found.cardId !== card.data?.id || found.kind !== kind || found.sourceMonth !== null);
  if (!card.data || !month || !invoices.data || wrongEntry) {
    return (
      <Shell title={title}>
        <Blocked text={CARD_ERROR_TEXT.nao_encontrado} label="Ir para Cartões" onPress={() => router.replace('/cartoes')} />
      </Shell>
    );
  }
  const invoice = invoiceFor(card.data, invoices.data, month, today);
  if (invoice.situation === 'paga' || invoice.situation === 'paga_em_parte') {
    return (
      <Shell title={title}>
        <Blocked text={CARD_ERROR_TEXT.fatura_paga} label={CARDS_TEXT.openInvoice} onPress={() => router.replace(invoiceHref(card.data!.id, month))} />
      </Shell>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <InvoiceEntryForm kind={kind} card={card.data} month={month} entry={found} />
    </View>
  );
}

/** /cartoes/[id]/fatura/[mes]/compra?lancamento=<id>: editar uma compra no cartão (descrição, valor, data, categoria e parcelas). */
export function CardPurchaseRoute() {
  const { id, mes, lancamento } = useLocalSearchParams<{ id: string; mes: string; lancamento?: string }>();
  const month = readInvoiceMonth(mes);
  const { today } = useSession();
  const card = useCard(id);
  const invoices = useCardInvoices(card.data ?? null);
  const entry = useCardEntry(lancamento);
  const title = S.purchaseEditTitle;

  if (card.isError || invoices.isError || entry.isError) {
    return (
      <Shell title={title}>
        <ErrorState
          message={ERROR_TEXT.carregar_falhou}
          onRetry={() => {
            card.refetch();
            invoices.refetch();
            entry.refetch();
          }}
        />
      </Shell>
    );
  }
  if (card.isPending || (card.data && invoices.isPending) || (lancamento && entry.isPending)) {
    return (
      <Shell title={title}>
        <LoadingState />
      </Shell>
    );
  }
  const found = entry.data;
  if (!card.data || !month || !invoices.data || !found || found.cardId !== card.data.id || found.kind !== 'compra') {
    return (
      <Shell title={title}>
        <Blocked text={CARD_ERROR_TEXT.nao_encontrado} label="Ir para Cartões" onPress={() => router.replace('/cartoes')} />
      </Shell>
    );
  }
  const invoice = invoiceFor(card.data, invoices.data, month, today);
  if (invoice.situation === 'paga' || invoice.situation === 'paga_em_parte') {
    return (
      <Shell title={title}>
        <Blocked text={CARD_ERROR_TEXT.fatura_paga} label={CARDS_TEXT.openInvoice} onPress={() => router.replace(invoiceHref(card.data!.id, month))} />
      </Shell>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <CardPurchaseForm card={card.data} month={month} entry={found} />
    </View>
  );
}
