import type { ExpenseDraft, FieldErrors } from '@clarevo/core';
import { formatBRL } from '@clarevo/core';
import { router } from 'expo-router';
import { CheckCircle2, Users, User } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton, Screen, Txt } from '@/components/ui';
import { newKey, useFinance } from '@/state/finance';
import { colors, fonts, radius, space } from '@/theme/tokens';

const CATEGORIES = ['Mercado', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Outros'];

function today() {
  const d = new Date();
  // Protótipo usa outubro de 2026 como mês de referência dos dados fictícios.
  const iso = d.toISOString().slice(0, 10);
  return iso.startsWith('2026-10') ? iso : '2026-10-07';
}

/** Formulário "Anotar gasto" (CL-V004): contexto visível, erro junto ao campo, sem duplicar no reenvio. */
export default function AnotarScreen() {
  const { contexts, activeContext, saveExpense } = useFinance();
  const [draft, setDraft] = useState<ExpenseDraft>(() => ({
    contextId: activeContext.id,
    amountText: '',
    description: '',
    category: 'Mercado',
    paidOn: today(),
    idempotencyKey: newKey(),
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState<{ amount: number; context: string } | null>(null);
  const submitting = useRef(false);

  const target = contexts.find((c) => c.id === draft.contextId)!;
  const set = <K extends keyof ExpenseDraft>(k: K, v: ExpenseDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k as keyof FieldErrors]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = () => {
    if (submitting.current) return; // toque duplo
    submitting.current = true;
    const result = saveExpense(draft);
    submitting.current = false;
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaved({ amount: result.event.amountCents, context: target.name });
  };

  if (saved) {
    return (
      <View style={styles.done} accessibilityLiveRegion="polite">
        <CheckCircle2 size={56} color={colors.success} />
        <Txt variant="title" style={{ fontSize: 22 }}>Gasto salvo</Txt>
        <Txt color={colors.textSecondary} style={{ textAlign: 'center' }}>
          {formatBRL(saved.amount)} em {saved.context}. O resumo do mês já considera este pagamento.
        </Txt>
        <PrimaryButton label="Voltar ao resumo" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        <Pressable
          onPress={() => {
            setSaved(null);
            setDraft((d) => ({ ...d, amountText: '', description: '', idempotencyKey: newKey() }));
          }}
          accessibilityRole="button">
          <Txt variant="label" color={colors.brand}>Anotar outro gasto</Txt>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={styles.form}>
        <Field label="Onde salvar">
          <View style={styles.segment} accessibilityRole="radiogroup">
            {contexts.map((c) => {
              const sel = c.id === draft.contextId;
              const Icon = c.kind === 'familia' ? Users : User;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sel }}
                  onPress={() => set('contextId', c.id)}
                  style={[styles.segmentOption, sel && styles.segmentSelected]}>
                  <Icon size={18} color={sel ? colors.textOnBrand : colors.text} />
                  <Txt variant="label" color={sel ? colors.textOnBrand : colors.text}>{c.name}</Txt>
                </Pressable>
              );
            })}
          </View>
          {target.kind === 'familia' ? (
            <Txt variant="caption" color={colors.textSecondary}>
              Estes registros serão compartilhados com os membros autorizados desta família.
            </Txt>
          ) : null}
        </Field>

        <Field label="Valor em reais" error={errors.amountText}>
          <TextInput
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            accessibilityLabel="Valor em reais"
            style={[styles.input, styles.amountInput, errors.amountText && styles.inputError]}
            placeholderTextColor={colors.textSecondary}
          />
        </Field>

        <Field label="Com o que foi" error={errors.description}>
          <TextInput
            value={draft.description}
            onChangeText={(t) => set('description', t)}
            placeholder="Ex.: Farmácia"
            accessibilityLabel="Com o que foi"
            maxLength={120}
            style={[styles.input, errors.description && styles.inputError]}
            placeholderTextColor={colors.textSecondary}
          />
        </Field>

        <Field label="Categoria">
          <View style={styles.chips}>
            {CATEGORIES.map((c) => {
              const sel = draft.category === c;
              return (
                <Pressable
                  key={c}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sel }}
                  onPress={() => set('category', c)}
                  style={[styles.chip, sel && styles.chipSelected]}>
                  <Txt variant="label" color={sel ? colors.brand : colors.text}>{c}</Txt>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Data do pagamento" error={errors.paidOn}>
          <TextInput
            value={draft.paidOn}
            onChangeText={(t) => set('paidOn', t)}
            placeholder="AAAA-MM-DD"
            accessibilityLabel="Data do pagamento"
            style={[styles.input, errors.paidOn && styles.inputError]}
            placeholderTextColor={colors.textSecondary}
          />
          <Txt variant="caption" color={colors.textSecondary}>Situação: pago. Entra no total “Pago” do mês desta data.</Txt>
        </Field>

        <PrimaryButton label={`Salvar em ${target.name}`} onPress={submit} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label">{label}</Txt>
      {children}
      {error ? (
        <Txt variant="label" color={colors.error} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: space[6], gap: space[5] },
  segment: { flexDirection: 'row', gap: space[2] },
  segmentOption: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: space[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  input: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space[4],
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
  },
  amountInput: { fontFamily: fonts.extrabold, fontSize: 28, minHeight: 64, fontVariant: ['tabular-nums'] },
  inputError: { borderColor: colors.error, backgroundColor: colors.errorTint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    paddingHorizontal: space[4],
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[8], gap: space[4], backgroundColor: colors.background },
});
