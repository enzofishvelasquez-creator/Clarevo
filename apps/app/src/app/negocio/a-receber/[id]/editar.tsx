import { useLocalSearchParams } from 'expo-router';

import { ReceivableFormScreen } from '@/components/receivable-parts';

/** Editar valor a receber (D-122): só em aberto, e só quem anotou ou quem administra o negócio. */
export default function EditarAReceberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReceivableFormScreen id={id} />;
}
