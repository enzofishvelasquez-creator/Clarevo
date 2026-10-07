import { EmptyState } from '@/components/states';
import { Card } from '@/components/ui';

/** Família ainda não existe neste ciclo: estado explicativo, sem membros simulados nem botões sem destino. */
export function FamilyNotLinked() {
  return (
    <Card>
      <EmptyState title="Nenhuma família vinculada">
        Em uma próxima versão você poderá convidar pessoas e escolher o que compartilhar. Seus registros pessoais continuam visíveis só para
        você.
      </EmptyState>
    </Card>
  );
}
