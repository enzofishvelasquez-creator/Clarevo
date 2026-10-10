import { CardPurchaseRoute } from '@/components/invoice-routes';

/** Editar uma compra no cartão (D-037), aberta pela linha da compra na fatura: ?lancamento=<id da compra>. */
export default function EditarCompraScreen() {
  return <CardPurchaseRoute />;
}
