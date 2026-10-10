import {
  CALC_DISCLAIMER,
  CALC_UI_TEXT,
  MAX_RECORD_CENTS,
  calcErrorText,
  calcFields,
  calcRowA11yLabel,
  calcTitle,
  centsToInput,
  parseBRL,
  parsePercentBp,
  type CalcErrorCode,
  type CalcFieldSpec,
  type CalcSlug,
  type CalcTexts,
} from '@clarevo/core';
import { router, useNavigation } from 'expo-router';
import { Check, ChevronRight, Info, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, type TextInput } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { SubHeader } from '@/components/header';
import { ChoiceGroup } from '@/components/series-parts';
import { LinkButton, Screen, TextField, Txt, spaceKeyPress, styles as ui } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { maskMoneyLabel, maskMoneyText, useValuesHidden } from '@/lib/privacy';
import { colors, fonts, motion, radius, space, tabular } from '@/theme/tokens';

/**
 * Peças comuns das calculadoras (spec4 §2.1; contrato do core §3 e §10). As contas e os textos vêm prontos do core;
 * aqui só ficam a tela, os campos, a regra de quando mostrar um erro e o cartão do resultado.
 * Nada é gravado: nenhuma peça chama o repositório nem guarda o que foi digitado (nem no aparelho).
 */

/** Alvo de toque das calculadoras (docs/08 §3.1: 48 px). */
export const CALC_TARGET = 48;

/** Tela de uma calculadora: título, aviso fixo no topo, conteúdo e o caminho para a lista. */
export function CalcScreen({ slug, modo, children }: { slug: CalcSlug; modo?: string; children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={calcTitle(slug, modo)} onBack={() => (router.canGoBack() ? router.back() : router.replace('/calcular'))} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <CalcDisclaimer />
        {children}
        {/* Aberta por um link de contexto ou pelo endereço: a lista fica a um toque (volta para ela se já estiver na pilha). */}
        <LinkButton label={CALC_UI_TEXT.seeAll} style={styles.link48} onPress={() => router.dismissTo('/calcular')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

/**
 * "Anotar como parcelamento" e "Anotar como gasto fixo" não aparecem quando a calculadora foi aberta de um cadastro
 * ou de algo que já existe: com origem no link (detalhe, conta, Família) ou com o cadastro de gasto fixo aberto logo
 * abaixo na pilha (o link do chip "Parcelado"), para não abrir um segundo cadastro por cima do primeiro.
 */
export function useNoteHidden(origem: string | undefined): boolean {
  const navigation = useNavigation();
  // Conferido uma vez, ao abrir: a calculadora está no topo, então o que há na pilha está abaixo dela.
  const [hidden] = useState(() => {
    const routes = (navigation.getState()?.routes ?? []) as readonly { name: string }[];
    return origem !== undefined || routes.some((r) => r.name === 'gastos-fixos/novo');
  });
  return hidden;
}

/** Aviso fixo (CALC_DISCLAIMER), sem animação nem anúncio a cada mudança: é parte da tela. */
export function CalcDisclaimer() {
  return (
    <View style={styles.disclaimer}>
      <Info size={18} color={colors.brand} style={{ marginTop: 1 }} aria-hidden />
      <Txt variant="caption" style={{ flex: 1 }}>
        {CALC_DISCLAIMER}
      </Txt>
    </View>
  );
}

/** Caixa de aviso dentro do resultado (estimativa, teto do cheque especial, CET, boleto atualizado). */
export function CalcNote({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <View style={styles.note}>
      <Info size={18} color={colors.brand} style={{ marginTop: 1 }} aria-hidden />
      <View style={{ flex: 1, gap: space[1] }}>
        {typeof children === 'string' ? (
          <Txt variant="label" accessibilityLabel={label}>
            {children}
          </Txt>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/**
 * Cartão do resultado. As linhas do resultado (ou o texto de espera) ficam numa região viva educada, sem o título, os
 * avisos e as hipóteses, para o leitor de tela não reler tudo a cada tecla. Fica sempre na tela, para a troca ser
 * anunciada. No iOS, sem região viva, a linha de destaque é anunciada quando a pessoa para de digitar.
 * A primeira linha é o destaque; depois vêm as outras linhas, os avisos e as hipóteses.
 */
export function CalcResult({
  texts,
  title = CALC_UI_TEXT.resultTitle,
  level = 2,
  waiting = CALC_UI_TEXT.waiting,
  maskMoney = false,
  children,
}: {
  texts: CalcTexts | null;
  title?: string;
  level?: 2 | 3;
  waiting?: string;
  /** Com "Ocultar valores" ligado, os valores em reais do resultado aparecem como "R$ ••••" (só para o que vem de dados guardados). */
  maskMoney?: boolean;
  children?: ReactNode;
}) {
  const hidden = useValuesHidden() && maskMoney;
  const [lead, ...rest] = (texts?.resultLines ?? []).map((l) => maskMoneyText(l, hidden));
  const shown = texts && lead !== undefined;
  // Anuncia o resultado inteiro: uma troca que mantém a primeira linha (como a taxa) também é dita.
  const spoken = shown ? (texts.resultLines.map((l) => maskMoneyLabel(l, hidden)).join(' ')) : waiting;
  // O que já foi dito (ou estava na tela ao abrir): só uma troca é anunciada.
  const lastSpoken = useRef(spoken);
  useEffect(() => {
    if (Platform.OS !== 'ios' || spoken === lastSpoken.current) return;
    const timer = setTimeout(() => {
      lastSpoken.current = spoken;
      announceOnIOS(spoken, { queue: true });
    }, ANNOUNCE_DELAY);
    return () => clearTimeout(timer);
  }, [spoken]);
  return (
    <View style={[ui.card, { gap: space[3] }]}>
      <Txt variant="title" accessibilityRole="header" aria-level={level}>
        {title}
      </Txt>
      <View collapsable={false} style={{ gap: space[3] }} accessibilityLiveRegion="polite" aria-live="polite">
        {shown ? (
          <>
            <Txt style={[styles.lead, tabular]} accessibilityLabel={hidden ? maskMoneyLabel(texts.resultLines[0]!, true) : undefined}>
              {lead}
            </Txt>
            {rest.length > 0 ? (
              <View style={{ gap: space[1] }}>
                {rest.map((line, i) => (
                  <Txt key={`${i}-${line}`} style={tabular} accessibilityLabel={hidden ? maskMoneyLabel(texts.resultLines[i + 1]!, true) : undefined}>
                    {line}
                  </Txt>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Txt color={colors.textSecondary}>{waiting}</Txt>
        )}
      </View>
      {texts && shown ? (
        <>
          {texts.notes.map((n, i) => (
            <CalcNote key={`${i}-${n}`} label={hidden ? maskMoneyLabel(n, true) : undefined}>
              {maskMoneyText(n, hidden)}
            </CalcNote>
          ))}
          {texts.hypotheses.length > 0 ? (
            <View style={{ gap: space[1] }}>
              <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={level + 1}>
                {CALC_UI_TEXT.hypothesesTitle}
              </Txt>
              {texts.hypotheses.map((h, i) => (
                <View key={`${i}-${h}`} style={styles.bullet}>
                  <Txt variant="label" color={colors.textSecondary} aria-hidden accessibilityElementsHidden importantForAccessibility="no">
                    •
                  </Txt>
                  <Txt variant="label" color={colors.textSecondary} style={{ flex: 1 }} accessibilityLabel={hidden ? maskMoneyLabel(h, true) : undefined}>
                    {maskMoneyText(h, hidden)}
                  </Txt>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      {children}
    </View>
  );
}

/** Pausa na digitação antes do anúncio no iOS: um anúncio por resultado, não um por tecla. */
const ANNOUNCE_DELAY = 600;

// ---------------------------------------------------------------------------------------------------------------
// Estado dos campos e regra dos erros

/** O que foi digitado e o que já foi tocado. Fica só na memória da tela. */
export interface CalcForm<K extends string> {
  values: Record<K, string>;
  set: (key: K, text: string) => void;
  /** Saiu do campo (vale também para campos dinâmicos, como "renda.<id>"). */
  blur: (key: string) => void;
  /** Mudou um campo dinâmico (os fixos usam set). */
  touch: (key: string) => void;
  blurred: (key: string) => boolean;
  edited: (key: string) => boolean;
}

export function useCalcForm<K extends string>(initial: () => Record<K, string>): CalcForm<K> {
  const [values, setValues] = useState<Record<K, string>>(initial);
  const [blurredKeys, setBlurred] = useState<Record<string, true>>({});
  const [editedKeys, setEdited] = useState<Record<string, true>>({});
  const touch = (key: string) => setEdited((e) => (e[key] ? e : { ...e, [key]: true }));
  return {
    values,
    set: (key, text) => {
      setValues((v) => ({ ...v, [key]: text }));
      touch(key);
    },
    blur: (key) => setBlurred((b) => (b[key] ? b : { ...b, [key]: true })),
    touch,
    blurred: (key) => Boolean(blurredKeys[key]),
    edited: (key) => Boolean(editedKeys[key]),
  };
}

/** O número digitado já passa do máximo (mais dígitos não corrigem). */
function aboveMax(text: string, spec: CalcFieldSpec): boolean {
  if (spec.max === undefined) return false;
  if (spec.kind === 'inteiro') {
    const digits = text.replace(/\D/g, '');
    return digits !== '' && Number(digits) > spec.max;
  }
  if (spec.kind === 'taxa') {
    const bp = parsePercentBp(text, { min: 0, max: Number.MAX_SAFE_INTEGER });
    return bp.ok && bp.value > spec.max;
  }
  return false;
}

/** Erros que continuar digitando não corrige: aparecem já durante a digitação. */
const FINAL_CODES: readonly CalcErrorCode[] = ['casas_demais', 'acima_do_limite', 'longo', 'resultado_alto'];

/**
 * Quando mostrar o erro de um campo de texto (spec4 §2.1: "erros só depois de sair do campo ou com o campo completo"):
 * - "vazio" só depois de a pessoa mexer no campo e sair dele (passar por um campo em branco não acusa nada);
 * - os outros depois de sair do campo;
 * - durante a digitação, só os que mais dígitos não corrigem (casas demais, acima do limite, número acima da faixa).
 */
export function showError(code: CalcErrorCode | undefined, spec: CalcFieldSpec, text: string, blurred: boolean, edited: boolean): boolean {
  if (!code) return false;
  if (code === 'vazio') return blurred && edited;
  if (blurred || FINAL_CODES.includes(code)) return true;
  return code === 'fora_da_faixa' && aboveMax(text, spec);
}

/** Valor em reais formatado ao sair do campo ("1080" → "1.080,00"), como nos formulários. */
export function formatMoneyText(text: string): string {
  const cents = parseBRL(text);
  return cents !== null && cents >= 0 && cents <= MAX_RECORD_CENTS ? centsToInput(cents) : text;
}

/** Ligação de uma calculadora: campos (rótulos e faixas do core), o que foi digitado e os erros do último cálculo. */
export interface CalcBinding<K extends string> {
  slug: CalcSlug;
  modo?: string;
  form: CalcForm<K>;
  errors: Partial<Record<string, CalcErrorCode>>;
}

/** Campo de texto livre de uma calculadora, já com teclado, prefixo "R$" e erro conforme o tipo do campo. */
export function CalcTextField({
  spec,
  label,
  hint,
  value,
  onChangeText,
  onBlur,
  error,
  accessibilityLabel,
  editable,
  inputRef,
}: {
  spec: CalcFieldSpec;
  label?: string;
  hint?: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  error?: string;
  /** Nome acessível mais longo que o rótulo visível (que continua no começo), para campos repetidos por dívida ou pessoa. */
  accessibilityLabel?: string;
  /** false: mostra o valor sem deixar editar (valores ocultos). */
  editable?: boolean;
  /** Para levar o foco ao campo (por exemplo, "Fazer a conta com outra entrada"). */
  inputRef?: Ref<TextInput>;
}) {
  const money = spec.kind === 'dinheiro';
  const integer = spec.kind === 'inteiro';
  const free = spec.kind === 'texto';
  return (
    <TextField
      ref={inputRef}
      label={label ?? spec.label}
      hint={hint ?? spec.hint}
      prefix={money ? 'R$' : undefined}
      placeholder={money ? '0,00' : undefined}
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      keyboardType={free ? 'default' : integer ? 'number-pad' : 'decimal-pad'}
      inputMode={free ? 'text' : integer ? 'numeric' : 'decimal'}
      autoCorrect={false}
      autoComplete="off"
      error={error}
      {...(accessibilityLabel !== undefined ? { accessibilityLabel } : {})}
      {...(editable === false ? { editable: false } : {})}
    />
  );
}

/** Campo ligado a uma chave da calculadora (rótulo, dica, faixa e mensagens de calcFields). */
export function CalcField<K extends string>({
  calc,
  name,
  label,
  hint,
  inputRef,
}: {
  calc: CalcBinding<K>;
  name: K;
  label?: string;
  hint?: string;
  inputRef?: Ref<TextInput>;
}) {
  const spec = calcFields(calc.slug, calc.modo)[name]!;
  const value = calc.form.values[name];
  const code = calc.errors[name];
  const visible = showError(code, spec, value, calc.form.blurred(name), calc.form.edited(name));
  return (
    <CalcTextField
      spec={spec}
      label={label}
      hint={hint}
      inputRef={inputRef}
      value={value}
      onChangeText={(t) => calc.form.set(name, t)}
      onBlur={() => {
        if (spec.kind === 'dinheiro' && value.trim() !== '') {
          const formatted = formatMoneyText(value);
          if (formatted !== value) calc.form.set(name, formatted);
        }
        calc.form.blur(name);
      }}
      error={visible && code ? calcErrorText(calc.slug, name, code, calc.modo) : undefined}
    />
  );
}

/**
 * Escolha em chips (rádio) com as opções do core. O erro "vazio" de uma escolha só aparece quando ela é a única coisa
 * que falta para o resultado (antes disso, o cartão já diz "Preencha os campos para ver o resultado.").
 */
export function CalcChoice({
  spec,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  spec: CalcFieldSpec;
  label?: string;
  hint?: string;
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <ChoiceGroup label={label ?? spec.label} hint={hint ?? spec.hint} error={error}>
      {(spec.options ?? []).map((o) => (
        <CalcChip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
      ))}
    </ChoiceGroup>
  );
}

/** Pergunta de sim ou não ("Não" | "Sim"), com as opções do core. */
export function CalcYesNo({ spec, value, onChange }: { spec: CalcFieldSpec; value: boolean; onChange: (value: boolean) => void }) {
  return <CalcChoice spec={spec} value={value ? 'sim' : 'nao'} onChange={(v) => onChange(v === 'sim')} />;
}

/** Só faltam escolhas (todos os erros são "vazio" em campos de escolha): hora de dizer qual falta. */
export function onlyChoicesMissing(errors: Partial<Record<string, CalcErrorCode>>, choices: readonly string[]): boolean {
  const entries = Object.entries(errors);
  return entries.length > 0 && entries.every(([k, c]) => c === 'vazio' && choices.includes(k));
}

/**
 * Chip das calculadoras: o mesmo desenho do Chip do kit, com alvo de 48 px (docs/08 §3.1). Responde ao toque com a
 * mesma leve redução de escala, parada com "reduzir movimento".
 */
export function CalcChip({ label, selected, onPress, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const timing = { duration: motion.press, reduceMotion: ReduceMotion.System };
  return (
    <Animated.View style={[anim, ui.chipWrap]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        aria-checked={selected}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        {...spaceKeyPress(onPress)}
        onPressIn={() => {
          if (!reduced) scale.value = withTiming(0.98, timing);
        }}
        onPressOut={() => {
          scale.value = reduced ? 1 : withTiming(1, timing);
        }}
        style={(s) => [ui.chip, styles.chip48, selected && ui.chipSelected, (s as { focused?: boolean }).focused && ui.focusRing]}>
        {selected ? <Check size={16} color={colors.brand} strokeWidth={2.5} style={{ flexShrink: 0 }} /> : null}
        <Txt variant="label" color={selected ? colors.brand : colors.text} style={{ flexShrink: 1 }}>
          {label}
        </Txt>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Linhas com seta (lista de calculadoras, Metas)

/**
 * Linha com ícone, nome, legenda e seta; nome acessível com a legenda ("Reserva para imprevistos. Quantos meses…").
 * Nome que já termina em pontuação não ganha ponto ("Parcelado ou à vista? Descubra…").
 */
export function CalcNavRow({
  icon: Icon,
  title,
  caption,
  onPress,
  last,
}: {
  icon: LucideIcon;
  title: string;
  caption?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={calcRowA11yLabel(title, caption)}
      onPress={onPress}
      style={(st) => [styles.row, !last && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      <View style={styles.rowIcon}>
        <Icon size={20} color={colors.brand} strokeWidth={2.25} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          {title}
        </Txt>
        {caption ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {caption}
          </Txt>
        ) : null}
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disclaimer: { flexDirection: 'row', gap: space[2], padding: space[3], borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: 'flex-start' },
  note: { flexDirection: 'row', gap: space[2], padding: space[3], borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'flex-start' },
  lead: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 28 },
  bullet: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  chip48: { minHeight: CALC_TARGET },
  link48: { minHeight: CALC_TARGET },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: CALC_TARGET },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});

/**
 * Link dentro de uma calculadora, alinhado ao texto, com alvo de 48 px também na web (lá o Pressable ignora o hitSlop
 * do LinkButton).
 */
export const calcInlineLink = styles.inlineLink;
