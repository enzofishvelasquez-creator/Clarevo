import {
  IMPORT_TEXT,
  categoriesFor,
  formatDateBR,
  lineProblem,
  parseAmountCents,
  parseFileDate,
  type CsvColumns,
  type CsvTable,
  type ReviewKind,
  type ReviewLine,
} from '@clarevo/core';
import { Check } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceGroup, CheckOption } from '@/components/series-parts';
import { Chip, LinkButton, Money, TextField, Txt, spaceKeyPress } from '@/components/ui';
import { HIDDEN_MONEY, maskMoneyText, moneyA11y, useValuesHidden } from '@/lib/privacy';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

/** Rótulo do tipo de cada linha no destino. */
export const KIND_LABEL: Record<ReviewKind, string> = {
  despesa: IMPORT_TEXT.kindOut,
  receita: IMPORT_TEXT.kindIn,
  compra: IMPORT_TEXT.kindPurchase,
  estorno: IMPORT_TEXT.kindRefund,
  pagamento: IMPORT_TEXT.kindPayment,
};

/**
 * Uma linha da revisão: caixa para incluir, descrição, valor, data, tipo e categoria, a marca ("Já anotado", "Parece pagamento de
 * fatura", "Parece transferência"...) e "Editar" (descrição e categoria). O valor respeita "Ocultar valores". Linha que não pode
 * ser importada (data futura, fatura paga, pagamento da fatura, chave já importada) tem a caixa desligada e a razão escrita.
 */
export const ReviewRow = memo(function ReviewRow({
  line,
  editing,
  last,
  onToggle,
  onEdit,
  onChange,
}: {
  line: ReviewLine;
  editing: boolean;
  last: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string | null) => void;
  onChange: (id: string, patch: { description?: string; category?: string | null }) => void;
}) {
  const hidden = useValuesHidden();
  const problem = lineProblem(line);
  const kind = KIND_LABEL[line.kind];
  const date = formatDateBR(line.date);
  const toggle = () => line.importable && onToggle(line.id);
  const label = IMPORT_TEXT.labels;
  const hint = line.label ? (IMPORT_TEXT.labelHints as Record<string, string>)[line.label] : undefined;
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: line.include, disabled: !line.importable }}
          aria-checked={line.include}
          accessibilityLabel={IMPORT_TEXT.lineInclude(line.description || IMPORT_TEXT.noDescription, moneyA11y(line.amountCents, hidden), date)}
          disabled={!line.importable}
          onPress={toggle}
          {...spaceKeyPress(toggle)}
          hitSlop={4}
          style={(st) => [styles.check, (st as { focused?: boolean }).focused && styles.focusRing]}>
          <View style={[styles.box, line.include && styles.boxChecked, !line.importable && styles.boxOff]}>
            {line.include ? <Check size={16} color={colors.textOnBrand} strokeWidth={3} /> : null}
          </View>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={styles.titleRow}>
            <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15, flex: 1, minWidth: 0 }} numberOfLines={2}>
              {line.description || IMPORT_TEXT.noDescription}
            </Txt>
            <Money cents={line.amountCents} variant="label" style={styles.amount} color={line.kind === 'receita' ? colors.success : colors.text} />
          </View>
          <Txt variant="caption" color={colors.textSecondary} style={tabular}>
            {maskMoneyText(`${date} · ${kind} · ${line.category ?? IMPORT_TEXT.noCategory}`, hidden)}
          </Txt>
          {line.label ? (
            <View style={[styles.badge, line.importable ? styles.badgeSoft : styles.badgeOff]}>
              <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold }}>
                {label[line.label]}
              </Txt>
            </View>
          ) : null}
          {hint ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {hint}
            </Txt>
          ) : null}
          {line.keyExists ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {IMPORT_TEXT.alreadyImportedHint}
            </Txt>
          ) : null}
          {problem ? (
            <Txt variant="label" color={colors.error} accessibilityRole="alert">
              {problem === 'descricao_obrigatoria' ? IMPORT_TEXT.needDescription : IMPORT_TEXT.descriptionTooLong}
            </Txt>
          ) : null}
        </View>
      </View>
      {line.importable && line.kind !== 'pagamento' ? (
        editing ? (
          <View style={styles.editor}>
            <TextField
              label={IMPORT_TEXT.descriptionLabel}
              value={line.description}
              maxLength={80}
              onChangeText={(t) => onChange(line.id, { description: t })}
              error={problem === 'descricao_obrigatoria' ? IMPORT_TEXT.needDescription : undefined}
            />
            <ChoiceGroup label={IMPORT_TEXT.categoryLabel} accessibilityLabel={`${IMPORT_TEXT.categoryLabel}: ${line.description}`}>
              <Chip label={IMPORT_TEXT.noCategory} selected={line.category === null} onPress={() => onChange(line.id, { category: null })} />
              {categoriesFor(line.kind).map((c) => (
                <Chip key={c} label={c} selected={line.category === c} onPress={() => onChange(line.id, { category: c })} />
              ))}
            </ChoiceGroup>
            <LinkButton label={IMPORT_TEXT.doneEditing} style={styles.link} onPress={() => onEdit(null)} />
          </View>
        ) : (
          <LinkButton
            label={IMPORT_TEXT.editLine}
            accessibilityLabel={`${IMPORT_TEXT.editLine}: ${line.description || IMPORT_TEXT.noDescription}`}
            style={styles.link}
            onPress={() => onEdit(line.id)}
          />
        )
      ) : null}
    </View>
  );
});

/** Chute das colunas de uma planilha sem cabeçalho conhecido: a data é a coluna com mais datas, o valor a com mais números, a descrição a com mais letras. */
export function guessColumns(table: CsvTable, firstRow: number): CsvColumns {
  const rows = table.rows.slice(firstRow, firstRow + 30);
  const width = Math.max(0, ...table.rows.slice(0, 30).map((r) => r.length));
  const score = (col: number, test: (v: string) => boolean) => rows.filter((r) => test(r[col] ?? '')).length;
  const pick = (test: (v: string) => boolean, taken: number[]) => {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < width; c++) {
      if (taken.includes(c)) continue;
      const s = score(c, test);
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    return best;
  };
  const date = pick((v) => parseFileDate(v) !== null, []);
  const amount = pick((v) => parseAmountCents(v) !== null && /\d[.,]\d{2}\s*[-)]?$/.test(v.trim()), [date]);
  const description = pick((v) => /[a-zA-ZÀ-ÿ]{3}/.test(v), [date, amount]);
  return { date: Math.max(0, date), description: Math.max(0, description), amount: Math.max(0, amount), debit: -1, credit: -1, kind: -1 };
}

/**
 * Texto de uma célula da planilha para mostrar. Com "Ocultar valores", a célula que é um valor ("-45,90", "1.234,56") ou traz um
 * valor em reais vira "R$ ••••": a prévia e as opções de coluna não podem mostrar o que a pessoa escondeu.
 */
export function maskCell(text: string, hidden: boolean): string {
  if (!hidden) return text;
  return parseAmountCents(text) !== null ? HIDDEN_MONEY : maskMoneyText(text, true);
}

/**
 * Escolha de uma coluna da planilha, com um exemplo do conteúdo. Mostra todas as colunas (a lista rola quando são muitas).
 * `noneLabel`: acrescenta a opção "sem coluna" (valor -1), para campos opcionais.
 */
export function ColumnChoice({
  label,
  table,
  sampleRow,
  value,
  onChange,
  error,
  hint,
  noneLabel,
}: {
  label: string;
  table: CsvTable;
  sampleRow: number;
  value: number;
  onChange: (column: number) => void;
  error?: string;
  hint?: string;
  noneLabel?: string;
}) {
  const hidden = useValuesHidden();
  const width = Math.max(1, ...table.rows.slice(0, 30).map((r) => r.length));
  const scrolls = width > 8;
  const chips = (
    <>
      {noneLabel ? <Chip label={noneLabel} accessibilityLabel={`${label}, ${noneLabel}`} selected={value < 0} onPress={() => onChange(-1)} /> : null}
      {Array.from({ length: width }, (_, c) => {
        // O exemplo é a primeira célula com conteúdo entre as primeiras linhas (débito e crédito costumam ficar em branco um do outro).
        const sample = table.rows.slice(sampleRow, sampleRow + 5).map((r) => r[c] ?? '').find((cell) => cell !== '') ?? '';
        const text = IMPORT_TEXT.columnOption(c + 1, maskCell(sample, hidden));
        // O nome inclui o campo ("Valor, Coluna 3: -45,90"): as escolhas listam as mesmas colunas.
        return <Chip key={c} label={text} accessibilityLabel={`${label}, ${text}`} selected={value === c} onPress={() => onChange(c)} />;
      })}
    </>
  );
  return (
    <ChoiceGroup label={label} error={error} hint={hint ?? (scrolls ? IMPORT_TEXT.columnsMoreHint : undefined)}>
      {scrolls ? (
        <ScrollView style={styles.columnsScroll} contentContainerStyle={styles.columnsContent} nestedScrollEnabled>
          {chips}
        </ScrollView>
      ) : (
        chips
      )}
    </ChoiceGroup>
  );
}

export { CheckOption };

const styles = StyleSheet.create({
  row: { paddingVertical: space[3], gap: space[2] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  check: { minHeight: 44, minWidth: 32, paddingTop: space[1], borderRadius: radius.sm },
  box: {
    width: 24,
    height: 24,
    marginTop: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  boxOff: { backgroundColor: colors.border, borderColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  amount: { fontFamily: fonts.extrabold, fontSize: 15, flexShrink: 0 },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 2 },
  badgeSoft: { backgroundColor: colors.accent },
  badgeOff: { backgroundColor: colors.border },
  columnsScroll: { width: '100%', maxHeight: 190 },
  columnsContent: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  editor: { gap: space[3], paddingLeft: 44 + space[1] },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0, marginLeft: 44 + space[1] },
  focusRing: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.brand, outlineOffset: 2 },
});
