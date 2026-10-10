import { InvoiceEntryRoute } from '@/components/invoice-routes';

/** Registrar estorno numa fatura (D-037); com ?lancamento=<id>, edita o estorno. */
export default function EstornoScreen() {
  return <InvoiceEntryRoute kind="estorno" />;
}
