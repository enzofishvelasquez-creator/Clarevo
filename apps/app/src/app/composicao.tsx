import { CARDS_TEXT, ERROR_TEXT, formatBRL, formatMonthBR, type CategoryShare } from '@clarevo/core';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Check, Minus, Plus } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { RecordRow } from '@/components/record-row';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { EmptyState, ErrorState } from '@/components/states';
import { TopicLink } from '@/components/topic-link';
import { Button, Card, FitMoney, Money, Screen, Skeleton, spaceKeyPress, Txt } from '@/components/ui';
import { maskMoneyLabel, useValuesHidden } from '@/lib/privacy';
import { useCategoryBreakdown, useMonthRecords, useSpace, useView } from '@/state/data';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const COPY = {
  recebido: { title: 'Recebido', criterio: 'Recebimentos realizados com data de recebimento neste mês.' },
  pago: { title: 'Pago', criterio: 'Gastos pagos com data de pagamento neste mês.' },
  diferenca: {
    title: 'Diferença do mês',
    criterio:
      'Recebimentos menos pagamentos confirmados no período. Não é o saldo da conta nem dinheiro disponível: o saldo também depende do saldo inicial e de outros movimentos. Contas a pagar não entram.',
  },
} as const;

type Breakdown = 'registro' | 'categoria';
const BREAKDOWNS: { value: Breakdown; label: string }[] = [
  { value: 'registro', label: 'Por registro' },
  { value: 'categoria', label: 'Por categoria' },
];

/** Composição de cada total, com o mesmo critério e a mesma origem do resumo (CL C004). */
export default function ComposicaoScreen() {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  // Endereço antigo de "Ainda a pagar": a lista agora é /a-pagar.
  if (tipo === 'apagar') return <Redirect href="/a-pagar" />;
  return <Composicao kind={tipo && tipo in COPY ? (tipo as keyof typeof COPY) : 'pago'} />;
}

function Composicao({ kind }: { kind: keyof typeof COPY }) {
  const copy = COPY[kind];
  const { month } = useView();
  const personal = useSpace().data;
  const records = useMonthRecords(personal?.personalContextId, month);
  const s = records.summary;
  // "Por categoria" só existe em Pago (spec4 §2.2); a escolha fica só nesta tela.
  const [breakdown, setBreakdown] = useState<Breakdown>('registro');
  const byCategory = kind === 'pago' && breakdown === 'categoria';
  // Pagamentos de fatura de cartão entram divididos pelas categorias das compras da fatura (D-037); a consulta só lê as faturas
  // dos cartões que aparecem no Pago do mês e só roda aqui (kind 'pago').
  const categories = useCategoryBreakdown(kind === 'pago' ? personal?.personalContextId : undefined, month);
  const hasInvoicePayment = Boolean(s?.composition.paid.some((r) => r.invoice));

  const sections = !s
    ? []
    : kind === 'diferenca'
      ? [
          { label: 'Recebido', total: s.receivedCents, list: s.composition.received, kind: 'receita' as const },
          { label: 'Pago', total: s.paidCents, list: s.composition.paid, kind: 'despesa' as const },
        ]
      : [
          kind === 'recebido'
            ? { label: 'Recebido', total: s.receivedCents, list: s.composition.received, kind: 'receita' as const }
            : { label: 'Pago', total: s.paidCents, list: s.composition.paid, kind: 'despesa' as const },
        ];

  /** Estado vazio com a ação certa: anotar o que falta neste critério. */
  const emptyAction = (k: 'receita' | 'despesa') => (
    <Button
      label={k === 'receita' ? 'Registrar recebimento' : 'Anotar gasto'}
      icon={k === 'receita' ? Plus : Minus}
      tone="soft"
      onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: k } })}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={copy.title} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <View style={{ gap: space[1] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            Pessoal · {formatMonthBR(month)}
          </Txt>
          {records.isPending ? (
            <Skeleton width={180} height={40} />
          ) : records.isError || !s ? (
            <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => records.refetch()} />
          ) : (
            <FitMoney cents={kind === 'diferenca' ? s.differenceCents : sections[0]!.total} />
          )}
          <Txt color={colors.textSecondary}>{copy.criterio}</Txt>
        </View>

        {kind === 'pago' && s ? <Segment value={breakdown} onChange={setBreakdown} /> : null}

        {byCategory && s ? (
          categories.isPending ? (
            <Card>
              <Skeleton width="100%" height={120} />
            </Card>
          ) : categories.isError || !categories.data ? (
            <Card>
              <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => categories.refetch()} />
            </Card>
          ) : (
            <CategoryCard shares={categories.data} totalCents={s.paidCents} action={emptyAction('despesa')} invoiceNote={hasInvoicePayment} />
          )
        ) : (
          sections.map((sec) => (
            <Card key={sec.label}>
              <View style={styles.head}>
                <Txt variant="title">{sec.label}</Txt>
                <Money cents={sec.total} variant="title" />
              </View>
              {sec.list.length === 0 ? (
                <EmptyState title="Nenhum registro neste critério" action={emptyAction(sec.kind)} />
              ) : (
                sec.list.map((r, i) => (
                  <RecordRow key={r.id} record={r} last={i === sec.list.length - 1} onPress={() => router.push(`/registro/${r.id}`)} />
                ))
              )}
            </Card>
          ))
        )}

        <TopicLink slug="diferenca" label="Como este total é calculado?" color={colors.textSecondary} />
      </Screen>
    </View>
  );
}

/** "Por registro | Por categoria": grupo de rádios em forma de segmento, com alvos de 48 px. */
function Segment({ value, onChange }: { value: Breakdown; onChange: (v: Breakdown) => void }) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel="Mostrar Pago">
      {BREAKDOWNS.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            onPress={() => onChange(o.value)}
            {...spaceKeyPress(() => onChange(o.value))}
            style={(st) => [styles.option, selected && styles.optionSelected, (st as { focused?: boolean }).focused && styles.focusRing]}>
            {selected ? <Check size={16} color={colors.brand} strokeWidth={2.5} /> : null}
            <Txt variant="label" color={selected ? colors.brand : colors.text} style={{ fontFamily: fonts.bold, fontSize: 15, textAlign: 'center', flexShrink: 1 }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Pago por categoria: barras horizontais na cor da marca (sem cor de alerta), com valor e percentual; a soma dos valores
 * é igual a Pago e os percentuais somam 100% (core: categoryBreakdown). Cada barra tem um nome acessível só:
 * "Mercado, R$ 412,30, 23,4% do pago".
 */
function CategoryCard({ shares, totalCents, action, invoiceNote }: { shares: CategoryShare[]; totalCents: number; action: ReactNode; invoiceNote: boolean }) {
  const hidden = useValuesHidden();
  // Lista e item na web (o leitor de tela diz quantas categorias há); no app, cada barra é um elemento só.
  const listRole = Platform.OS === 'web' ? ({ role: 'list', 'aria-label': 'Pago por categoria' } as object) : {};
  const itemRole = Platform.OS === 'web' ? ({ role: 'listitem' } as object) : {};
  return (
    <Card style={{ gap: space[3] }}>
      <View style={styles.head}>
        <Txt variant="title">Pago</Txt>
        <Money cents={totalCents} variant="title" />
      </View>
      {shares.length === 0 ? (
        <EmptyState title="Nenhum registro neste critério" action={action} />
      ) : (
        <View style={{ gap: space[4] }} {...listRole}>
          {shares.map((sh) => (
            <View key={sh.label} accessible accessibilityLabel={maskMoneyLabel(sh.a11yLabel, hidden)} style={{ gap: space[2] }} {...itemRole}>
              <View style={styles.barHead}>
                <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15, flexShrink: 1 }}>
                  {sh.label}
                </Txt>
                <MoneyTxt variant="label" style={[{ fontFamily: fonts.bold, fontSize: 15, flexShrink: 0 }, tabular]}>
                  {`${formatBRL(sh.cents)} · ${sh.percentText}`}
                </MoneyTxt>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${sh.tenths / 10}%` }, sh.tenths === 0 && styles.barMin]} />
              </View>
            </View>
          ))}
        </View>
      )}
      {invoiceNote ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {CARDS_TEXT.screens.categoryInvoiceNote}
        </Txt>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[1], gap: space[2] },
  track: { flexDirection: 'row', backgroundColor: '#E6EBF5', borderRadius: radius.md, padding: 4, gap: 4 },
  option: { flex: 1, minHeight: 48, borderRadius: radius.sm, flexDirection: 'row', gap: space[1], alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2] },
  optionSelected: { backgroundColor: colors.surface },
  focusRing: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.brand, outlineOffset: 2 } as object,
  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3], flexWrap: 'wrap' },
  barTrack: { height: 12, borderRadius: radius.pill, backgroundColor: colors.brandTint, overflow: 'hidden' },
  barFill: { height: 12, borderRadius: radius.pill, backgroundColor: colors.brand },
  // Categoria com valor, mas abaixo de 0,1%: um traço visível.
  barMin: { width: 4 },
});
