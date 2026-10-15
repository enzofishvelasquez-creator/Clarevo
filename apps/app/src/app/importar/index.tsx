import { ERROR_TEXT, IMPORT_TEXT } from '@clarevo/core';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { ImportFlow } from '@/components/import-flow';
import { ErrorState, LoadingState } from '@/components/states';
import { Screen } from '@/components/ui';
import { useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/** Importar extrato ou fatura (D-048): arquivo OFX ou planilha CSV do banco, lido no aparelho, revisado e importado. Só no espaço Pessoal. */
export default function ImportarScreen() {
  const personal = useSpace();
  if (personal.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ImportFlow />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={IMPORT_TEXT.screenTitle} right={<ContextPill label="Importando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {personal.isError ? <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => personal.refetch()} /> : <LoadingState />}
      </Screen>
    </View>
  );
}
