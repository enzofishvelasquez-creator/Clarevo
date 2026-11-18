import { unsavedChangesText } from '@clarevo/core';

import { Txt } from '@/components/ui';
import { useBusiness } from '@/state/business';
import { useView } from '@/state/data';
import { colors } from '@/theme/tokens';

/**
 * "Você tem alterações que ainda não foram salvas em Pessoal." (ou "em Família", ou, no espaço Negócio, com o nome do negócio, D-113a):
 * o contexto escolhido no seletor (D-055).
 */
export function UnsavedChangesText() {
  const { space } = useView();
  const business = useBusiness();
  return <Txt color={colors.textSecondary}>{unsavedChangesText(space, space === 'negocio' ? business.data?.name : null)}</Txt>;
}
