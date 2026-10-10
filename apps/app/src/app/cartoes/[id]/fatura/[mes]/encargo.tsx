import { InvoiceEntryRoute } from '@/components/invoice-routes';

/** Informar encargos de uma fatura (D-037); com ?lancamento=<id>, edita o encargo. */
export default function EncargoScreen() {
  return <InvoiceEntryRoute kind="encargo" />;
}
