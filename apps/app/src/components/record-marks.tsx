import { PAYER_KINDS, PAYER_KIND_LABEL, RECORD_MARKS_TEXT, type PayerKind } from '@clarevo/core';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceGroup } from '@/components/series-parts';
import { Chip, Txt } from '@/components/ui';
import { colors, fonts, space } from '@/theme/tokens';

const T = RECORD_MARKS_TEXT;

/**
 * "Mais detalhes (opcional)" na entrada do negócio (D-122): duas marcas, "Teve nota fiscal?" (Sim ou Não) e "Quem pagou" (Pessoa física,
 * Empresa ou Exterior). Recolhido de início; aberto quando a entrada já tem alguma marca. Tocar de novo na opção marcada desmarca. As
 * marcas não mudam nenhum total e não calculam imposto: aparecem no detalhe, no "Resumo do ano" e na exportação do negócio.
 */
export function RecordMarksBlock({
  hasInvoice,
  payerKind,
  onInvoice,
  onPayer,
}: {
  hasInvoice: boolean | null;
  payerKind: PayerKind | null;
  onInvoice: (value: boolean | null) => void;
  onPayer: (value: PayerKind | null) => void;
}) {
  const [open, setOpen] = useState(hasInvoice !== null || payerKind !== null);
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        accessibilityLabel={open ? T.close : T.open}
        onPress={() => setOpen((o) => !o)}
        style={(s) => [styles.head, (s as { focused?: boolean }).focused && styles.focusRing]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            {T.section}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.sectionHint}
          </Txt>
        </View>
        <Icon size={20} color={colors.brandText} aria-hidden />
      </Pressable>
      {open ? (
        <View style={{ gap: space[3] }}>
          <ChoiceGroup label={T.invoiceLabel}>
            <Chip label={T.yes} selected={hasInvoice === true} onPress={() => onInvoice(hasInvoice === true ? null : true)} />
            <Chip label={T.no} selected={hasInvoice === false} onPress={() => onInvoice(hasInvoice === false ? null : false)} />
          </ChoiceGroup>
          <ChoiceGroup label={T.payerLabel}>
            {PAYER_KINDS.map((k) => (
              <Chip key={k} label={PAYER_KIND_LABEL[k]} selected={payerKind === k} onPress={() => onPayer(payerKind === k ? null : k)} />
            ))}
          </ChoiceGroup>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.unmarkHint}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[3], paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
  focusRing: { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid' } as object,
});
