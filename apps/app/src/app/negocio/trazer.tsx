import { BusinessPairScreen } from '@/components/business-pair-form';

/**
 * Trazer dinheiro do Pessoal (D-121), o inverso da retirada: o valor sai do Pessoal (gasto "Dinheiro para o negócio") e entra no negócio
 * (entrada "Dinheiro do Pessoal"), gravados juntos e ligados por create_business_contribution. Cada lado conta uma vez no próprio espaço;
 * em "Seu negócio" a entrada fica fora da operação. Excluir: o mesmo "excluir dos dois espaços" da retirada.
 */
export default function TrazerScreen() {
  return <BusinessPairScreen kind="aporte" />;
}
