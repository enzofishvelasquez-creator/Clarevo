import { CircleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { seriesStyles } from '@/components/series-parts';
import { Banner, Button, Txt } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

/**
 * Rodapé fixo dos formulários (como Anotar gasto e Anotar conta a pagar): a ação principal fica sempre visível, acima do
 * teclado. `error` é o erro do servidor ou de rede (os de campo ficam no campo). `children` entra antes dos botões.
 */
export function FormFooter({
  error,
  onCancel,
  cancelLabel = 'Cancelar',
  submitLabel,
  submitAccessibilityLabel,
  onSubmit,
  busy,
  disabled,
  children,
}: {
  error?: string | null;
  onCancel: () => void;
  cancelLabel?: string;
  submitLabel: string;
  /** Nome acessível do botão principal quando difere do rótulo (valores ocultos: "valor oculto"). */
  submitAccessibilityLabel?: string;
  onSubmit: () => void;
  busy?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[seriesStyles.footer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
      <View style={seriesStyles.footerInner}>
        {error ? (
          <Banner tone="erro" icon={CircleAlert}>
            <Txt variant="label" color={colors.error}>
              {error}
            </Txt>
          </Banner>
        ) : null}
        {children}
        <View style={seriesStyles.footerRow}>
          <Button label={cancelLabel} tone="ghost" onPress={onCancel} style={seriesStyles.cancel} disabled={busy} />
          <Button
            label={submitLabel}
            accessibilityLabel={busy ? undefined : submitAccessibilityLabel}
            busy={busy}
            busyLabel="Salvando…"
            disabled={disabled}
            onPress={onSubmit}
            style={seriesStyles.save}
          />
        </View>
      </View>
    </View>
  );
}
