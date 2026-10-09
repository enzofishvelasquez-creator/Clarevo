import { MAX_RECORD_CENTS, SUM_MAX_VALUES, SUM_TEXT, centsToInput, parseBRL, sumAmounts } from '@clarevo/core';
import { Plus, Sigma, X } from 'lucide-react-native';
import { useRef, useState, type RefObject } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, LinkButton, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

type Item = { id: number; text: string };

const emptyItems = (): Item[] => [
  { id: 1, text: '' },
  { id: 2, text: '' },
];

/**
 * "Somar valores" logo abaixo de um campo Valor (docs/08 §2.2): campos para somar ("35,90" e "12,50"), o total
 * ("Total: R$ 48,40", anunciado ao leitor de tela) e "Usar o total", que preenche o campo com o total formatado
 * ("48,40") e fecha. A conta é do core (sumAmounts): centavos inteiros, até R$ 9.999.999,99 e até 10 valores.
 * Nada é gravado aqui; só o total vai para o campo, e o formulário segue igual.
 * target: o campo Valor. Ao usar o total ou fechar, o foco volta para ele (o painel sai da tela): na web, o foco do
 * teclado; no iOS e no Android, só o do leitor de tela, sem abrir o teclado. No iOS, o total usado também é anunciado.
 */
export function SumValues({ onUse, target }: { onUse: (text: string) => void; target?: RefObject<TextInput | null> }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>(emptyItems);
  /** Campos que já perderam o foco: o erro de um valor só aparece depois de sair dele. */
  const [touched, setTouched] = useState<number[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  /** Campo novo que recebe o foco ao aparecer ("Adicionar outro valor" e a abertura). */
  const [focusId, setFocusId] = useState<number | null>(null);
  const nextId = useRef(3);

  const result = sumAmounts(items.map((i) => i.text));
  const errorIndex = result.ok ? -1 : result.index;
  const errorShown = !result.ok && (result.error === 'total_alto' || touched.includes(items[result.index]!.id));
  const canUse = result.ok && result.count > 0;

  const reset = () => {
    setItems(emptyItems());
    setTouched([]);
    setFocused(null);
    setFocusId(null);
    nextId.current = 3;
  };

  const close = (applied?: string) => {
    setOpen(false);
    reset();
    if (Platform.OS === 'web') {
      target?.current?.focus();
      return;
    }
    // Depois de o painel sair da tela (o botão que tinha o foco sai junto).
    setTimeout(() => {
      const field = target?.current;
      if (field) AccessibilityInfo.sendAccessibilityEvent(field, 'focus');
      if (applied) announceOnIOS(applied, { queue: true });
    }, FOCUS_DELAY);
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    reset();
    setFocusId(1);
    setOpen(true);
  };

  const use = () => {
    if (!result.ok || result.count === 0) return;
    onUse(centsToInput(result.cents));
    close(SUM_TEXT.total(result.cents));
  };

  const setText = (id: number, text: string) => setItems((list) => list.map((i) => (i.id === id ? { ...i, text } : i)));

  const add = () => {
    if (items.length >= SUM_MAX_VALUES) return;
    const id = nextId.current;
    nextId.current += 1;
    setItems((list) => [...list, { id, text: '' }]);
    setFocusId(id);
  };

  const remove = (id: number) => {
    setItems((list) => list.filter((i) => i.id !== id));
    setTouched((t) => t.filter((x) => x !== id));
  };

  const blur = (item: Item) => {
    setFocused(null);
    setTouched((t) => (t.includes(item.id) ? t : [...t, item.id]));
    // "35,9" vira "35,90", como nos campos Valor.
    const cents = parseBRL(item.text);
    if (cents !== null && cents > 0 && cents <= MAX_RECORD_CENTS) setText(item.id, centsToInput(cents));
    // O iOS não tem região viva: o total é anunciado ao sair de um campo.
    if (Platform.OS === 'ios' && result.ok && result.count > 0) AccessibilityInfo.announceForAccessibility(SUM_TEXT.total(result.cents));
  };

  const errorText = !result.ok
    ? result.error === 'total_alto'
      ? SUM_TEXT.errors.total_alto
      : `${SUM_TEXT.itemLabel(result.index)}: ${SUM_TEXT.errors[result.error]}`
    : null;

  return (
    // Junto do campo Valor (os formulários separam os campos com 16 px).
    <View style={{ gap: space[2], marginTop: -space[2] }}>
      <LinkButton
        label={SUM_TEXT.open}
        icon={Sigma}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        style={styles.link}
        onPress={toggle}
      />
      {open ? (
        <View style={styles.panel}>
          <View style={styles.items}>
            {items.map((item, i) => {
              const invalid = errorShown && errorIndex === i;
              return (
                <View key={item.id} style={styles.item}>
                  <TextInput
                    accessibilityLabel={SUM_TEXT.itemLabel(i)}
                    {...({ 'aria-invalid': invalid } as object)}
                    value={item.text}
                    onChangeText={(t) => setText(item.id, t)}
                    onFocus={() => setFocused(item.id)}
                    onBlur={() => blur(item)}
                    autoFocus={focusId === item.id}
                    placeholder="0,00"
                    placeholderTextColor={colors.placeholder}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    maxLength={16}
                    style={[styles.input, tabular, focused === item.id && styles.inputFocused, invalid && styles.inputError]}
                  />
                  {items.length > 2 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={SUM_TEXT.remove(i)}
                      onPress={() => remove(item.id)}
                      style={(s) => [styles.remove, s.pressed && { opacity: 0.6 }, (s as { focused?: boolean }).focused && styles.focusRing]}>
                      <X size={18} color={colors.textSecondary} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {items.length < SUM_MAX_VALUES ? (
              <LinkButton label={SUM_TEXT.add} icon={Plus} style={styles.link} onPress={add} />
            ) : (
              <Txt variant="caption" color={colors.textSecondary} style={styles.max}>
                {SUM_TEXT.maxReached}
              </Txt>
            )}
          </View>

          {errorShown && errorText ? (
            <Txt variant="label" color={colors.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {errorText}
            </Txt>
          ) : null}

          {result.ok ? (
            // Muda enquanto a pessoa digita, como o resultado das calculadoras: região viva educada.
            <Txt variant="title" style={[{ fontFamily: fonts.extrabold }, tabular]} accessibilityLiveRegion="polite">
              {SUM_TEXT.total(result.cents)}
            </Txt>
          ) : null}

          <View style={styles.actions}>
            <Button label={SUM_TEXT.use} tone="soft" disabled={!canUse} onPress={use} style={styles.action} />
            <Button label={SUM_TEXT.close} tone="ghost" onPress={() => close()} style={styles.action} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Espera para mover o foco do leitor de tela: o painel já saiu da tela. */
const FOCUS_DELAY = 150;

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  panel: {
    gap: space[3],
    padding: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  items: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  item: { flexDirection: 'row', alignItems: 'center' },
  input: {
    width: 116,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
    outlineStyle: 'none',
  } as object,
  inputFocused: { borderColor: colors.text, borderWidth: 2 },
  inputError: { borderColor: colors.error, backgroundColor: colors.errorTint },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  max: { minHeight: 44, textAlignVertical: 'center', paddingTop: space[3] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 140 },
  focusRing: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.brand, outlineOffset: 2 } as object,
});
