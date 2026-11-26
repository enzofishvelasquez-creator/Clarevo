import type { ComponentProps } from 'react';

import { FitTxt, Txt } from '@/components/ui';
import { maskMoneyLabel, maskMoneyText, useValuesHidden } from '@/lib/privacy';

/**
 * Frases montadas pelo core com valores em reais ("R$ 3.500,00 de R$ 22.500,00") respeitam "Ocultar valores" (A2): na tela
 * os valores viram "R$ ••••" e o leitor de tela diz "valor oculto". Campos que a pessoa digita não passam por aqui.
 */
export function useMoneyMask(): (text: string) => string {
  const hidden = useValuesHidden();
  return (text) => maskMoneyText(text, hidden);
}

/** Frase para o leitor de tela com os valores trocados por "valor oculto" quando ocultos. */
export function useMoneyLabelMask(): (text: string) => string {
  const hidden = useValuesHidden();
  return (text) => maskMoneyLabel(text, hidden);
}

/**
 * Txt cujo texto (e nome acessível) pode ter valores em reais: com valores ocultos, mostra "R$ ••••". `fit`: um valor sozinho (o total de
 * um card), numa linha só que diminui a letra para caber (`FitTxt`), para nunca quebrar no meio com a letra grande.
 */
export function MoneyTxt({ children, accessibilityLabel, fit, ...props }: Omit<ComponentProps<typeof Txt>, 'children' | 'ref'> & { children: string; fit?: boolean }) {
  const hidden = useValuesHidden();
  const label = hidden ? maskMoneyLabel(accessibilityLabel ?? children, true) : accessibilityLabel;
  const Comp = fit ? FitTxt : Txt;
  return (
    <Comp {...props} accessibilityLabel={label}>
      {maskMoneyText(children, hidden)}
    </Comp>
  );
}
