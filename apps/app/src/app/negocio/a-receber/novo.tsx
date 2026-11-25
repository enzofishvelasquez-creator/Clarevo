import { ReceivableFormScreen } from '@/components/receivable-parts';

/**
 * Anotar valor a receber (D-122): a venda no fiado (com o nome de quem deve, opcional), a venda no cartão que ainda vai cair ou outro
 * valor, com a descrição, o valor, a data combinada ou prevista e a categoria de entrada. Não entra em Entrou nem em Saiu.
 */
export default function NovoAReceberScreen() {
  return <ReceivableFormScreen />;
}
