import { STACK_BELOW_WIDTH, STACK_FROM_FONT_SCALE } from '@clarevo/core';
import { CircleAlert } from 'lucide-react-native';
import { useContext, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InPanelContext } from '@/components/form-panel';
import { seriesStyles } from '@/components/series-parts';
import { Banner, Button, Txt } from '@/components/ui';
import { useWideLayout } from '@/lib/layout';
import { colors, space } from '@/theme/tokens';

/** Rodapé fixo de uma tela cheia no computador (fora do painel dos formulários): segue a coluna dos cartões. */
export function useWideFooter(): boolean {
  const inPanel = useContext(InPanelContext);
  return useWideLayout() && !inPanel;
}

/**
 * Rodapé fixo dos formulários (como Anotar gasto e Anotar conta a pagar): a ação principal fica sempre visível, acima do
 * teclado. `error` é o erro do servidor ou de rede (os de campo ficam no campo). `children` entra antes dos botões.
 * Com a letra do aparelho acima de 1,3 (e, com `stackWhenNarrow`, em tela abaixo de 360 px), os dois botões ficam um embaixo do outro,
 * a ação principal primeiro: um rótulo longo, como "Registrar rendimento recebido", não cabe ao lado de "Cancelar" com a letra grande.
 * Nas telas cheias do computador, o miolo tem a largura e a borda esquerda dos cartões e os botões ficam à direita (revisão de
 * 23/11/2026: a coluna de 560 px no meio da barra não batia com os cartões); no painel dos formulários, fica como no celular.
 */
export function FormFooter({
  error,
  onCancel,
  cancelLabel = 'Cancelar',
  cancelAccessibilityLabel,
  submitLabel,
  submitAccessibilityLabel,
  onSubmit,
  busy,
  disabled,
  stackWhenNarrow,
  children,
}: {
  error?: string | null;
  onCancel: () => void;
  cancelLabel?: string;
  /** Nome acessível do botão de voltar quando o rótulo é curto ("Voltar" lido como "Voltar ao destino"). */
  cancelAccessibilityLabel?: string;
  submitLabel: string;
  /** Nome acessível do botão principal quando difere do rótulo (valores ocultos: "valor oculto"). */
  submitAccessibilityLabel?: string;
  onSubmit: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** Rótulo principal longo: empilha também em tela estreita (abaixo de 360 px), onde ele não cabe ao lado de "Cancelar" com a letra grande. */
  stackWhenNarrow?: boolean;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_FROM_FONT_SCALE || (stackWhenNarrow === true && width < STACK_BELOW_WIDTH);
  const desktop = useWideFooter();
  const cancel = (
    <Button
      label={cancelLabel}
      accessibilityLabel={cancelAccessibilityLabel}
      tone="ghost"
      onPress={onCancel}
      style={stacked ? undefined : seriesStyles.cancel}
      disabled={busy}
    />
  );
  const submit = (
    <Button
      label={submitLabel}
      accessibilityLabel={busy ? undefined : submitAccessibilityLabel}
      busy={busy}
      busyLabel="Salvando…"
      disabled={disabled}
      onPress={onSubmit}
      style={stacked ? undefined : desktop ? seriesStyles.saveWide : seriesStyles.save}
    />
  );
  return (
    <View style={[seriesStyles.footer, desktop && seriesStyles.footerWide, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
      <View style={[seriesStyles.footerInner, desktop && seriesStyles.footerInnerWide]}>
        {error ? (
          <Banner tone="erro" icon={CircleAlert}>
            <Txt variant="label" color={colors.error}>
              {error}
            </Txt>
          </Banner>
        ) : null}
        {children}
        {stacked ? (
          <View style={{ gap: space[2] }}>
            {submit}
            {cancel}
          </View>
        ) : (
          <View style={[seriesStyles.footerRow, desktop && seriesStyles.footerRowWide]}>
            {cancel}
            {submit}
          </View>
        )}
      </View>
    </View>
  );
}
