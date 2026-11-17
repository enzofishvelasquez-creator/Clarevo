import { BUSINESS_TEXT, businessMonth, businessResultText, type FinancialRecord, type IsoMonth } from '@clarevo/core';
import { router } from 'expo-router';
import { ChartLine, HandCoins, Store } from 'lucide-react-native';
import { View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { useView } from '@/state/data';
import { colors, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;

/**
 * No Resumo do espaço Negócio (D-113): a frase do mês (entrou, saiu e sobrou, de fato), o atalho para "Como está o negócio" e a retirada
 * para o Pessoal. Só aparece com o negócio escolhido no seletor; o Resumo do Pessoal e da Família não muda.
 */
export function BusinessSummaryCard({ contextId, month, records, canWrite }: { contextId: string; month: IsoMonth; records: readonly FinancialRecord[] | undefined; canWrite: boolean }) {
  const m = records ? businessMonth(records, contextId, month) : null;
  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Store size={20} color={colors.brandText} aria-hidden />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          {T.overviewTitle}
        </Txt>
      </View>
      {m ? <MoneyTxt>{businessResultText(m)}</MoneyTxt> : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {T.overviewLinkHint}
      </Txt>
      <Button label={T.accountOpen} icon={ChartLine} tone="soft" onPress={() => router.push('/negocio')} />
      {canWrite ? <LinkButton label={T.withdraw} icon={HandCoins} onPress={() => router.push('/negocio/retirada')} /> : null}
    </Card>
  );
}

/**
 * Metas e Investir no espaço Negócio (D-113): a explicação curta de que ficam fora do negócio e "Ir para o Pessoal", que troca o seletor.
 */
export function NotInBusinessCard({ text }: { text: string }) {
  const { setSpace } = useView();
  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Store size={20} color={colors.brandText} aria-hidden />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          {T.accountTitle}
        </Txt>
      </View>
      <Txt>{text}</Txt>
      <Button label={T.goPersonal} tone="soft" onPress={() => setSpace('pessoal')} />
    </Card>
  );
}
