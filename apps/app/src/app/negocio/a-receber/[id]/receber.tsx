import { useLocalSearchParams } from 'expo-router';

import { ReceiveScreen } from '@/components/receivable-parts';

/**
 * "Recebi" (D-122): o valor (pode ser diferente do combinado, como o que caiu depois da taxa do cartão), a data (até hoje) e a conta do
 * negócio. Grava uma entrada comum no negócio, ligada ao valor a receber, que passa a "Recebido".
 */
export default function ReceberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReceiveScreen id={id} />;
}
