import { CARDS_TEXT, NEXT_MONTH_TEXT, formatDateBR, recordMonth, type FinancialRecord } from '@clarevo/core';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RecordRow, kindLabel } from '@/components/record-row';
import { useBusiness } from '@/state/business';
import { Money, Txt } from '@/components/ui';
import { moneyA11y, useValuesHidden } from '@/lib/privacy';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Larguras da tabela (revisão visual de 23/11/2026: em 1280 px a descrição ficava com 90 px e quebrava no meio da palavra, "Merca/do"; em
 * 1024 px, "DESCRIÇÃO" virava uma letra por linha). Abaixo de `TABLE_MIN`, a lista volta às linhas do celular; abaixo de `ACCOUNT_MIN`, a
 * coluna Conta sai e a conta vai para a legenda da descrição.
 */
const TABLE_MIN = 520;
const ACCOUNT_MIN = 640;

/**
 * A lista do mês em tabela, na versão para computador (pedido do Enzo em 12/11/2026): data, descrição, categoria, conta (com 2 ou mais
 * contas ativas) e valor, uma linha por lançamento, do mais recente para o mais antigo. Cada linha é um botão com o mesmo nome acessível
 * da linha do celular (`RecordRow`); o cabeçalho da tabela é só visual. Os valores seguem "ocultar valores". A tabela mede a própria
 * largura: estreita demais, vira a lista do celular (as mesmas linhas, com a data na legenda).
 */
export function RecordsTable({
  records,
  accountName,
  onOpen,
}: {
  records: readonly FinancialRecord[];
  /** A conta de origem do lançamento, ou null (com uma conta só, a coluna não aparece). */
  accountName: ((r: FinancialRecord) => string | null) | null;
  onOpen: (r: FinancialRecord) => void;
}) {
  const hidden = useValuesHidden();
  const businessId = useBusiness().data?.id ?? null;
  const [width, setWidth] = useState(0);
  const asRows = width > 0 && width < TABLE_MIN;
  const showAccount = accountName !== null && (width === 0 || width >= ACCOUNT_MIN);
  const onLayout = (e: { nativeEvent: { layout: { width: number } } }) => setWidth(Math.round(e.nativeEvent.layout.width));
  // Antes da primeira medida, só o espaço (sem desenhar a tabela que talvez vire lista: a troca aparecia por dois quadros).
  if (width === 0) return <View onLayout={onLayout} style={{ minHeight: 1 }} />;
  if (asRows) {
    return (
      <View onLayout={onLayout}>
        {records.map((r, i) => (
          <RecordRow key={r.id} record={r} last={i === records.length - 1} accountName={accountName ? accountName(r) : null} onPress={() => onOpen(r)} />
        ))}
      </View>
    );
  }
  return (
    <View onLayout={onLayout}>
      <View style={[styles.row, styles.head]} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Txt variant="caption" color={colors.textSecondary} style={[styles.date, styles.headText]} numberOfLines={1}>
          Data
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} style={[styles.desc, styles.headText]} numberOfLines={1}>
          Descrição
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} style={[styles.cat, styles.headText]} numberOfLines={1}>
          Categoria
        </Txt>
        {showAccount ? (
          <Txt variant="caption" color={colors.textSecondary} style={[styles.acc, styles.headText]} numberOfLines={1}>
            Conta
          </Txt>
        ) : null}
        <Txt variant="caption" color={colors.textSecondary} style={[styles.value, styles.headText, { textAlign: 'right' }]} numberOfLines={1}>
          Valor
        </Txt>
      </View>
      {records.map((r, i) => {
        const isIn = r.kind === 'receita';
        const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
        const origin = r.invoice ? CARDS_TEXT.paymentOrigin : r.commitmentId ? 'conta a pagar' : null;
        const counted = r.nextMonth ? NEXT_MONTH_TEXT.rowNote(recordMonth(r)) : null;
        const account = accountName ? accountName(r) : null;
        const kind = kindLabel(r, r.contextId === businessId);
        // Sem a coluna Conta (tabela estreita), a conta vem na legenda, como na linha do celular.
        const note = [kind, counted, origin, showAccount ? null : account].filter(Boolean).join(' · ');
        const when = `${kind} · ${formatDateBR(r.occurredOn)}${counted ? ` · ${counted}` : ''}${origin ? ` · ${origin}` : ''}${account ? ` · ${account}` : ''}`;
        return (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={`${r.description}, ${when}, ${r.category ?? 'sem categoria'}, ${moneyA11y(r.amountCents, hidden)}`}
            onPress={() => onOpen(r)}
            style={(s) => [
              styles.row,
              i < records.length - 1 && styles.divider,
              (s as { hovered?: boolean }).hovered && { backgroundColor: colors.background },
              s.pressed && { opacity: 0.7 },
              (s as { focused?: boolean }).focused && styles.focusRing,
            ]}>
            <Txt variant="label" color={colors.textSecondary} style={styles.date}>
              {formatDateBR(r.occurredOn).slice(0, 5)}
            </Txt>
            <View style={[styles.desc, styles.descCell]}>
              <View style={[styles.icon, isIn && { backgroundColor: colors.successTint }]}>
                <Icon size={16} color={isIn ? colors.success : colors.brandText} aria-hidden />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* Como na linha do celular: a descrição e a legenda quebram em vez de terminar em "…". */}
                <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                  {r.description}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {note}
                </Txt>
              </View>
            </View>
            {/* Categoria e conta em até duas linhas (auditoria de 18/11/2026: "Taxas e maquinin…" e "Conta princi…" no computador). Com as
                larguras mínimas, a quebra é sempre entre palavras. */}
            <Txt variant="label" color={r.category ? colors.text : colors.textSecondary} style={styles.cat} numberOfLines={2}>
              {r.category ?? 'Sem categoria'}
            </Txt>
            {showAccount ? (
              <Txt variant="label" color={colors.textSecondary} style={styles.acc} numberOfLines={2}>
                {account ?? ''}
              </Txt>
            ) : null}
            <View style={styles.value}>
              <Money cents={r.amountCents} variant="label" style={{ fontFamily: fonts.bold, textAlign: 'right' }} color={colors.text} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2], paddingHorizontal: space[2], borderRadius: radius.sm },
  head: { minHeight: 36, paddingVertical: 0, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: 0 },
  headText: { fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.2 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: 0 },
  date: { width: 48 },
  // 180 px no mínimo: a descrição quebra entre palavras, nunca no meio de uma (TABLE_MIN e ACCOUNT_MIN somam estas larguras).
  desc: { flex: 1.6, minWidth: 180 },
  descCell: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  // Largura mínima para "Conta principal" numa linha e as categorias do negócio em duas ("Taxas e / maquininha"), sempre entre palavras.
  cat: { flex: 1.2, minWidth: 112 },
  acc: { flex: 1, minWidth: 112 },
  value: { width: 124, alignItems: 'flex-end' },
  icon: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  focusRing: { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid', outlineOffset: -3 } as object,
});
