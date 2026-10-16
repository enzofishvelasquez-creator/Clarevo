import { useLocalSearchParams } from 'expo-router';

import { RecordForm } from '@/components/record-form';
import { LoadingState } from '@/components/states';
import { useWork } from '@/state/data';

export default function NovoRegistro() {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const space = useWork().data;
  if (!space) return <LoadingState />;
  return <RecordForm mode={{ type: 'novo', kind: tipo === 'receita' ? 'receita' : 'despesa' }} space={space} />;
}
