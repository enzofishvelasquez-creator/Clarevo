import { unsavedChangesText } from '@clarevo/core';

import { Txt } from '@/components/ui';
import { useView } from '@/state/data';
import { colors } from '@/theme/tokens';

/** "Você tem alterações que ainda não foram salvas em Pessoal." (ou "em Família"): o contexto escolhido no seletor (D-055). */
export function UnsavedChangesText() {
  const { space } = useView();
  return <Txt color={colors.textSecondary}>{unsavedChangesText(space)}</Txt>;
}
