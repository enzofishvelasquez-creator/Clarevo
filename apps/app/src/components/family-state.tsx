import { CALC_UI_TEXT } from '@clarevo/core';
import { Users } from 'lucide-react-native';

import { openCalc } from '@/components/calc/open';
import { EmptyState } from '@/components/states';
import { Card, LinkButton } from '@/components/ui';

/**
 * Família ainda não existe neste ciclo: estado explicativo, sem membros simulados nem botões sem destino.
 * "Enquanto isso, dividir as contas da casa" leva à calculadora, que não grava nada sobre outra pessoa (docs/08 §2.2).
 * O link só aparece quando a tela pede (splitLink): o Resumo fica como foi aprovado (D-022, D-034) e nunca o mostra,
 * nem durante a troca de telas.
 */
export function FamilyNotLinked({ splitLink = false }: { splitLink?: boolean } = {}) {
  return (
    <Card>
      <EmptyState
        title="Nenhuma família vinculada"
        art="familia"
        action={
          splitLink ? (
            <LinkButton label={CALC_UI_TEXT.links.familia} icon={Users} onPress={() => openCalc('dividir-contas', { origem: 'familia' })} />
          ) : undefined
        }>
        Em uma próxima versão você poderá convidar pessoas e escolher o que compartilhar. Seus registros pessoais continuam visíveis só para
        você.
      </EmptyState>
    </Card>
  );
}
