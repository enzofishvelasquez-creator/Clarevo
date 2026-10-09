import { CALC_UI_TEXT } from '@clarevo/core';
import { usePathname } from 'expo-router';
import { Users } from 'lucide-react-native';

import { openCalc } from '@/components/calc/open';
import { EmptyState } from '@/components/states';
import { Card, LinkButton } from '@/components/ui';

/**
 * Família ainda não existe neste ciclo: estado explicativo, sem membros simulados nem botões sem destino.
 * "Enquanto isso, dividir as contas da casa" leva à calculadora, que não grava nada sobre outra pessoa (docs/08 §2.2).
 * O Resumo fica como foi aprovado (D-022, D-034): por padrão, o link não aparece lá, só nas outras telas.
 */
export function FamilyNotLinked({ splitLink }: { splitLink?: boolean } = {}) {
  const pathname = usePathname();
  const showSplit = splitLink ?? pathname !== '/';
  return (
    <Card>
      <EmptyState
        title="Nenhuma família vinculada"
        art="familia"
        action={
          showSplit ? (
            <LinkButton label={CALC_UI_TEXT.links.familia} icon={Users} onPress={() => openCalc('dividir-contas', { origem: 'familia' })} />
          ) : undefined
        }>
        Em uma próxima versão você poderá convidar pessoas e escolher o que compartilhar. Seus registros pessoais continuam visíveis só para
        você.
      </EmptyState>
    </Card>
  );
}
