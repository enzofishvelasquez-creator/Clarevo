import {
  CATEGORIES,
  RECORD_LINK_TEXT,
  SUBCATEGORY_MAX,
  formatBRL,
  subcategoryChoices,
  type PaymentLinkOption,
  type RecordKind,
  type SubcategoryMemory,
} from '@clarevo/core';
import { Check, Info, X } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { SettingSwitch } from '@/components/setting-switch';
import { Banner, Chip, LinkButton, TextField, Txt, spaceKeyPress } from '@/components/ui';
import { maskMoneyLabel, useValuesHidden } from '@/lib/privacy';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Partes do formulário de gasto e recebimento do retorno de 17/11/2026 (D-107): "O que este gasto pagou?", a subcategoria, o
 * rendimento de investimento e a troca de tipo ao editar. Os textos ficam no núcleo (RECORD_LINK_TEXT).
 */

/** Quantas contas aparecem de início em "O que este gasto pagou?". */
const LINK_OPTIONS_SHOWN = 5;

/** Uma linha de escolha (rádio) com o nome, uma legenda e, opcional, um valor em reais (escondido com "Ocultar valores"). */
function OptionRow({ title, caption, selected, onPress }: { title: string; caption?: string; selected: boolean; onPress: () => void }) {
  const hidden = useValuesHidden();
  const label = maskMoneyLabel(caption ? `${title}, ${caption}` : title, hidden);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={label}
      onPress={onPress}
      {...spaceKeyPress(onPress)}
      style={(s) => [styles.row, selected && styles.rowSelected, (s as { focused?: boolean }).focused && styles.focusRing]}>
      <View style={[styles.dot, selected && styles.dotSelected]}>{selected ? <Check size={14} color={colors.brandText} strokeWidth={3} /> : null}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }} color={selected ? colors.brandText : colors.text}>
          {title}
        </Txt>
        {caption ? (
          <MoneyTxt variant="caption" color={colors.textSecondary}>
            {caption}
          </MoneyTxt>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * "O que este gasto pagou?" (item 1): as contas a pagar e parcelas em aberto e as faturas fechadas dos cartões, mais "Nenhuma destas".
 * Escolher uma conta a marca como paga por este gasto (sem outro gasto); escolher uma fatura registra o pagamento dela com este valor
 * e esta data. Os atalhos levam ao cadastro e voltam para cá com o preenchimento guardado.
 */
export function PaymentLinkBlock({
  options,
  value,
  onChange,
  loading,
  linkedNow,
  onRegisterCommitment,
  onRegisterInstallment,
}: {
  options: readonly PaymentLinkOption[];
  value: string | null;
  onChange: (key: string | null) => void;
  loading?: boolean;
  /** O vínculo que o gasto já tem (na edição): a linha ganha "Ligado agora." */
  linkedNow?: string | null;
  onRegisterCommitment: () => void;
  onRegisterInstallment: () => void;
}) {
  const chosen = options.find((o) => o.key === value) ?? null;
  // Muitas contas em aberto: as primeiras (as de valor igual vêm antes) e a escolhida; o resto num toque.
  const [all, setAll] = useState(false);
  const shown = all || options.length <= LINK_OPTIONS_SHOWN ? options : options.filter((o, i) => i < LINK_OPTIONS_SHOWN || o.key === value);
  return (
    <View style={styles.block}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={2}>
        {RECORD_LINK_TEXT.paidTitle}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {RECORD_LINK_TEXT.paidHint}
      </Txt>
      {loading ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {RECORD_LINK_TEXT.paidLoading}
        </Txt>
      ) : (
        <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel={RECORD_LINK_TEXT.paidTitle}>
          {shown.map((o) => (
            <OptionRow
              key={o.key}
              title={o.label}
              caption={`${formatBRL(o.amountCents)} · ${RECORD_LINK_TEXT.optionDue(o.dueOn)}${o.key === linkedNow ? ` · ${RECORD_LINK_TEXT.paidLinkedNow}` : ''}`}
              selected={value === o.key}
              onPress={() => onChange(o.key)}
            />
          ))}
          {shown.length < options.length ? (
            <LinkButton label={RECORD_LINK_TEXT.showMoreOptions(options.length - shown.length)} style={styles.inlineLink} onPress={() => setAll(true)} />
          ) : null}
          <OptionRow title={RECORD_LINK_TEXT.paidNone} selected={value === null} onPress={() => onChange(null)} />
          {options.length === 0 ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {RECORD_LINK_TEXT.paidEmpty}
            </Txt>
          ) : null}
        </View>
      )}
      {chosen?.type === 'fatura' ? (
        <Banner tone="info" icon={Info} live={false}>
          <Txt variant="label">{RECORD_LINK_TEXT.paidInvoiceNote}</Txt>
        </Banner>
      ) : null}
      <View>
        <LinkButton label={RECORD_LINK_TEXT.registerCommitment} style={styles.inlineLink} onPress={onRegisterCommitment} />
        <LinkButton label={RECORD_LINK_TEXT.registerInstallment} style={styles.inlineLink} onPress={onRegisterInstallment} />
      </View>
    </View>
  );
}

/**
 * Subcategoria opcional (item 2): as sugestões da categoria, as próprias da pessoa (guardadas no aparelho) e "Outra" com texto curto.
 * "Editar minhas subcategorias" tira as próprias da lista, sem sair do formulário.
 */
export const SubcategoryPicker = forwardRef<
  TextInput,
  {
    category: string;
    value: string | null;
    other: boolean;
    memory: SubcategoryMemory;
    editing: boolean;
    error?: string;
    onPick: (value: string | null, other: boolean) => void;
    onOtherText: (text: string) => void;
    onToggleEdit: () => void;
    onForget: (name: string) => void;
  }
>(function SubcategoryPicker({ category, value, other, memory, editing, error, onPick, onOtherText, onToggleEdit, onForget }, ref) {
  const { suggested, own } = subcategoryChoices(category, memory);
  return (
    <View style={{ gap: space[2] }}>
      <ChoiceGroup label={RECORD_LINK_TEXT.subcategoryLabel} accessibilityLabel={`${RECORD_LINK_TEXT.subcategoryLabel}, ${category}`}>
        <Chip label={RECORD_LINK_TEXT.subcategoryNone} selected={value === null && !other} onPress={() => onPick(null, false)} />
        {[...suggested, ...own].map((s) => (
          <Chip key={s} label={s} selected={!other && value === s} onPress={() => onPick(s, false)} />
        ))}
        <Chip label={RECORD_LINK_TEXT.subcategoryOther} selected={other} onPress={() => onPick(null, true)} />
      </ChoiceGroup>
      {other ? (
        <TextField
          ref={ref}
          label={RECORD_LINK_TEXT.subcategoryOtherLabel}
          value={value ?? ''}
          onChangeText={onOtherText}
          maxLength={SUBCATEGORY_MAX}
          hint={RECORD_LINK_TEXT.subcategoryOtherHint}
          error={error}
        />
      ) : null}
      {own.length > 0 ? (
        <View style={{ gap: space[1] }}>
          <LinkButton label={editing ? RECORD_LINK_TEXT.subcategoryEditDone : RECORD_LINK_TEXT.subcategoryEdit} style={styles.inlineLink} onPress={onToggleEdit} />
          {editing ? (
            <View style={{ gap: space[1] }}>
              <Txt variant="caption" color={colors.textSecondary}>
                {RECORD_LINK_TEXT.subcategoryEditHint}
              </Txt>
              {own.map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  accessibilityLabel={RECORD_LINK_TEXT.subcategoryRemove(s)}
                  onPress={() => onForget(s)}
                  {...spaceKeyPress(() => onForget(s))}
                  style={(st) => [styles.removeRow, (st as { focused?: boolean }).focused && styles.focusRing]}>
                  <X size={18} color={colors.brandText} />
                  <Txt variant="label" color={colors.brandText} style={{ fontFamily: fonts.bold, flexShrink: 1 }}>
                    {RECORD_LINK_TEXT.subcategoryRemove(s)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

/**
 * Rendimento de investimento (item 4), só no recebimento do espaço Pessoal: liga o recebimento a um investimento cadastrado. Ao salvar,
 * o rendimento recebido fica registrado no investimento, sem contar duas vezes; "Cadastrar investimento" volta para cá.
 */
export function InvestmentIncomeBlock({
  on,
  onToggle,
  investments,
  value,
  onChange,
  onRegister,
  error,
  removing,
}: {
  on: boolean;
  onToggle: (next: boolean) => void;
  investments: readonly { id: string; name: string }[];
  value: string | null;
  onChange: (id: string) => void;
  onRegister: () => void;
  error?: string;
  /** Na edição, desligar tira o rendimento que já estava no investimento: a frase avisa. */
  removing?: boolean;
}) {
  const chosen = investments.find((i) => i.id === value) ?? null;
  return (
    <View style={styles.block}>
      <SettingSwitch label={RECORD_LINK_TEXT.incomeToggle} caption={RECORD_LINK_TEXT.incomeCaption} value={on} onChange={onToggle} />
      {on ? (
        <View style={{ gap: space[2] }}>
          {investments.length === 0 ? (
            <Txt variant="label" color={colors.textSecondary}>
              {RECORD_LINK_TEXT.incomeEmpty}
            </Txt>
          ) : (
            <ChoiceGroup label={RECORD_LINK_TEXT.incomeChoose} error={error}>
              {investments.map((i) => (
                <Chip key={i.id} label={i.name} selected={value === i.id} onPress={() => onChange(i.id)} />
              ))}
            </ChoiceGroup>
          )}
          {investments.length === 0 && error ? (
            <Txt variant="label" color={colors.error} accessibilityRole="alert">
              {error}
            </Txt>
          ) : null}
          {chosen ? (
            <Banner tone="info" icon={Info} live={false}>
              <Txt variant="label">{RECORD_LINK_TEXT.incomeEffect(chosen.name)}</Txt>
            </Banner>
          ) : null}
          <LinkButton label={RECORD_LINK_TEXT.registerInvestment} style={styles.inlineLink} onPress={onRegister} />
        </View>
      ) : removing ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {RECORD_LINK_TEXT.incomeRemovedNote}
        </Txt>
      ) : null}
    </View>
  );
}

/** Trocar entre gasto e recebimento ao editar (item 3), com a frase do efeito no mês; travado no gasto ligado a uma conta ou nota. */
export function KindChoice({
  value,
  onChange,
  locked,
  notice,
}: {
  value: RecordKind;
  onChange: (kind: RecordKind) => void;
  locked: string | null;
  notice: string | null;
}) {
  return (
    <View style={{ gap: space[2] }}>
      {locked ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {locked}
        </Txt>
      ) : (
        <ChoiceGroup label={RECORD_LINK_TEXT.kindTitle}>
          <Chip label={RECORD_LINK_TEXT.kindExpense} selected={value === 'despesa'} onPress={() => onChange('despesa')} />
          <Chip label={RECORD_LINK_TEXT.kindIncome} selected={value === 'receita'} onPress={() => onChange('receita')} />
        </ChoiceGroup>
      )}
      {notice ? (
        <Banner tone="info" icon={Info}>
          <Txt variant="label">{notice}</Txt>
        </Banner>
      ) : null}
    </View>
  );
}

/** As categorias do tipo, para conferir uma categoria trazida de outro tipo (troca de tipo). */
export function categoryOfKind(kind: RecordKind, category: string | null): string | null {
  return category !== null && CATEGORIES[kind].includes(category) ? category : null;
}

const styles = StyleSheet.create({
  block: { gap: space[2] },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  rowSelected: { borderColor: colors.brandText, backgroundColor: colors.brandTint },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotSelected: { borderColor: colors.brandText },
  focusRing: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.brandText, outlineOffset: 2 } as object,
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  removeRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[2], alignSelf: 'flex-start' },
});
