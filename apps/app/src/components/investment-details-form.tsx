import {
  DETAILS_TEXT,
  FUND_CNPJ_KINDS,
  INDEX_KIND_LABEL,
  QUANTITY_KINDS,
  INSTITUTION_MAX,
  INVESTMENT_DESCRIPTION_MAX,
  INVESTMENT_INDEX_KINDS,
  INVESTMENT_RATE_CONDITION_MAX,
  INVESTMENT_LIQUIDITIES,
  LIQUIDITY_LABEL,
  SUBKINDS_BY_KIND,
  SUBKIND_LABEL,
  guaranteeOf,
  indexNeedsRate,
  maskDateBR,
  suggestedIndexKind,
  taxRegimeOf,
  type InvestmentDetailsDraft,
  type InvestmentDetailsField,
  type InvestmentKind,
} from '@clarevo/core';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { CheckOption, ChoiceGroup } from '@/components/series-parts';
import { Card, Chip, TextField, Txt, styles as ui } from '@/components/ui';
import { colors, fonts, space } from '@/theme/tokens';

const T = DETAILS_TEXT;

export interface DetailsSectionHandle {
  /** Abre o bloco e põe o foco no campo (erro de validação). */
  focus: (field: InvestmentDetailsField) => void;
}

/**
 * Bloco "Mais detalhes (opcional)" do formulário de investimento (D-099, ficha ampliada). Recolhido por padrão; aberto quando a ficha já
 * tem algo. Tudo opcional: tipo exato (os títulos públicos com os nomes oficiais, decisão do Enzo), onde está, como rende, a taxa,
 * o vencimento e quando pode resgatar. Embaixo, o que a ficha deduz (imposto e garantia), sempre com "confira". D-104: a descrição livre
 * (item 12, logo depois do tipo exato) e, com a taxa, "A taxa muda numa data" (a data de fim e a taxa de depois) e a condição (item 13).
 */
export const InvestmentDetailsSection = forwardRef<
  DetailsSectionHandle,
  {
    kind: InvestmentKind | null;
    draft: InvestmentDetailsDraft;
    onChange: (next: InvestmentDetailsDraft) => void;
    errors: Partial<Record<InvestmentDetailsField, string>>;
    initiallyOpen: boolean;
  }
>(function InvestmentDetailsSection({ kind, draft, onChange, errors, initiallyOpen }, ref) {
  const [open, setOpen] = useState(initiallyOpen);
  const refs = {
    institutionText: useRef<TextInput>(null),
    rateText: useRef<TextInput>(null),
    maturityText: useRef<TextInput>(null),
    liquidityOnText: useRef<TextInput>(null),
    liquidityDaysText: useRef<TextInput>(null),
    quantityText: useRef<TextInput>(null),
    fundCnpjText: useRef<TextInput>(null),
    descriptionText: useRef<TextInput>(null),
    rateUntilText: useRef<TextInput>(null),
    rateAfterText: useRef<TextInput>(null),
    rateConditionText: useRef<TextInput>(null),
  };
  useImperativeHandle(ref, () => ({
    focus: (field) => {
      setOpen(true);
      const r = (refs as Record<string, React.RefObject<TextInput | null>>)[field];
      setTimeout(() => r?.current?.focus(), 0);
    },
  }));
  const set = (patch: Partial<InvestmentDetailsDraft>) => onChange({ ...draft, ...patch });
  const subkinds = kind ? SUBKINDS_BY_KIND[kind] : [];
  const subkind = draft.subkind !== null && subkinds.includes(draft.subkind) ? draft.subkind : null;
  const regime = kind ? taxRegimeOf(kind, subkind) : null;
  const guarantee = kind ? guaranteeOf(kind, subkind) : null;

  return (
    <Card style={{ gap: space[4] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={(st) => [styles.toggle, (st as { focused?: boolean }).focused && ui.focusRing]}>
        <View style={{ flex: 1, gap: space[1] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {T.sectionTitle}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.sectionHint}
          </Txt>
        </View>
        {open ? <ChevronUp size={20} color={colors.textSecondary} aria-hidden /> : <ChevronDown size={20} color={colors.textSecondary} aria-hidden />}
      </Pressable>
      {open ? (
        <>
          {subkinds.length > 0 ? (
            <ChoiceGroup label={T.subkindLabel} hint="Toque de novo para desmarcar." error={errors.subkind}>
              {subkinds.map((s) => (
                <Chip
                  key={s}
                  label={SUBKIND_LABEL[s]}
                  selected={subkind === s}
                  onPress={() => {
                    if (subkind === s) set({ subkind: null });
                    else set({ subkind: s, indexKind: draft.indexKind ?? suggestedIndexKind(s) });
                  }}
                />
              ))}
            </ChoiceGroup>
          ) : null}
          <TextField
            ref={refs.descriptionText}
            label={T.descriptionLabel}
            hint={T.descriptionHint(kind)}
            value={draft.descriptionText}
            onChangeText={(t) => set({ descriptionText: t })}
            maxLength={INVESTMENT_DESCRIPTION_MAX}
            error={errors.descriptionText}
          />
          {kind !== null && FUND_CNPJ_KINDS.includes(kind) ? (
            <TextField
              ref={refs.fundCnpjText}
              label={T.fundCnpjLabel}
              hint={T.fundCnpjHint}
              placeholder="00.000.000/0001-00"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={18}
              value={draft.fundCnpjText}
              onChangeText={(t) => set({ fundCnpjText: t })}
              error={errors.fundCnpjText}
            />
          ) : null}
          <TextField
            ref={refs.institutionText}
            label={T.institutionLabel}
            hint={T.institutionHint}
            value={draft.institutionText}
            onChangeText={(t) => set({ institutionText: t })}
            maxLength={INSTITUTION_MAX}
            error={errors.institutionText}
          />
          <ChoiceGroup label={T.indexLabel} hint="Toque de novo para desmarcar." error={errors.indexKind}>
            {INVESTMENT_INDEX_KINDS.map((k) => (
              <Chip key={k} label={INDEX_KIND_LABEL[k]} selected={draft.indexKind === k} onPress={() => set({ indexKind: draft.indexKind === k ? null : k })} />
            ))}
          </ChoiceGroup>
          {draft.indexKind && indexNeedsRate(draft.indexKind) ? (
            <TextField
              ref={refs.rateText}
              label={`${T.rateLabel(draft.indexKind)} (%)`}
              hint={T.rateHint(draft.indexKind)}
              keyboardType="numbers-and-punctuation"
              inputMode="decimal"
              maxLength={8}
              value={draft.rateText}
              onChangeText={(t) => set({ rateText: t })}
              error={errors.rateText}
            />
          ) : null}
          {draft.indexKind && indexNeedsRate(draft.indexKind) ? (
            <>
              <CheckOption label={T.rateStepLabel} hint={T.rateStepHint} checked={draft.rateStep} onPress={() => set({ rateStep: !draft.rateStep })} />
              {draft.rateStep ? (
                <>
                  <TextField
                    ref={refs.rateUntilText}
                    label={T.rateUntilLabel}
                    placeholder="dd/mm/aaaa"
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={10}
                    value={draft.rateUntilText}
                    onChangeText={(t) => set({ rateUntilText: maskDateBR(t) })}
                    error={errors.rateUntilText}
                  />
                  <TextField
                    ref={refs.rateAfterText}
                    label={`${T.rateAfterLabel(draft.indexKind)} (%)`}
                    hint={T.rateAfterHint}
                    keyboardType="numbers-and-punctuation"
                    inputMode="decimal"
                    maxLength={8}
                    value={draft.rateAfterText}
                    onChangeText={(t) => set({ rateAfterText: t })}
                    error={errors.rateAfterText}
                  />
                </>
              ) : null}
              <TextField
                ref={refs.rateConditionText}
                label={T.rateConditionLabel}
                hint={T.rateConditionHint}
                value={draft.rateConditionText}
                onChangeText={(t) => set({ rateConditionText: t })}
                maxLength={INVESTMENT_RATE_CONDITION_MAX}
                error={errors.rateConditionText}
              />
            </>
          ) : null}
          <TextField
            ref={refs.maturityText}
            label={T.maturityLabel}
            hint={T.maturityHint}
            placeholder="dd/mm/aaaa"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={10}
            value={draft.maturityText}
            onChangeText={(t) => set({ maturityText: maskDateBR(t) })}
            error={errors.maturityText}
          />
          {kind !== null && QUANTITY_KINDS.includes(kind) ? (
            <TextField
              ref={refs.quantityText}
              label={T.quantityLabel(kind)}
              hint={T.quantityHint(kind)}
              placeholder="0,00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              maxLength={24}
              value={draft.quantityText}
              onChangeText={(t) => set({ quantityText: t })}
              error={errors.quantityText}
            />
          ) : null}
          <ChoiceGroup label={T.liquidityLabel} hint="Toque de novo para desmarcar." error={errors.liquidity}>
            {INVESTMENT_LIQUIDITIES.map((l) => (
              <Chip key={l} label={LIQUIDITY_LABEL[l]} selected={draft.liquidity === l} onPress={() => set({ liquidity: draft.liquidity === l ? null : l })} />
            ))}
          </ChoiceGroup>
          {draft.liquidity === 'a_partir_de' ? (
            <TextField
              ref={refs.liquidityOnText}
              label={T.liquidityOnLabel}
              placeholder="dd/mm/aaaa"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              value={draft.liquidityOnText}
              onChangeText={(t) => set({ liquidityOnText: maskDateBR(t) })}
              error={errors.liquidityOnText}
            />
          ) : null}
          {draft.liquidity === 'dias' ? (
            <TextField
              ref={refs.liquidityDaysText}
              label={T.liquidityDaysLabel}
              hint={T.liquidityDaysHint}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={4}
              value={draft.liquidityDaysText}
              onChangeText={(t) => set({ liquidityDaysText: t.replace(/\D/g, '') })}
              error={errors.liquidityDaysText}
            />
          ) : null}
          {regime || guarantee ? (
            <View style={styles.derived}>
              {regime ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.regimeLine(regime)}
                </Txt>
              ) : null}
              {guarantee ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.guaranteeLine(guarantee)}
                </Txt>
              ) : null}
              <Txt variant="caption" color={colors.textSecondary}>
                {T.checkStatement}
              </Txt>
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
  derived: { gap: space[1], borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3] },
});
