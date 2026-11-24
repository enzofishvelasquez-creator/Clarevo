import { BusinessPairScreen } from '@/components/business-pair-form';

/**
 * Retirada para o Pessoal (D-113): o valor sai do negócio (gasto "Retirada para o Pessoal") e entra no Pessoal como recebimento
 * ("Retirada do negócio"), gravados juntos e ligados. Cada lado conta uma vez no próprio espaço, e em "Seu negócio" a retirada
 * fica fora de Saiu. O formulário é o mesmo de "Trazer dinheiro do Pessoal" (components/business-pair-form.tsx).
 */
export default function RetiradaScreen() {
  return <BusinessPairScreen kind="retirada" />;
}
