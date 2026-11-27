import type { RecordKind } from './records';

/**
 * Categorias do negócio (D-113). Entradas: vendas, serviços e outras. Saídas: o que um pequeno negócio costuma gastar, sem termos de
 * contabilidade. D-121 (24/11/2026, pesquisa de 18/11): "Divulgação", "Contabilidade e sistemas" e "Juros e multas" entram nas saídas da
 * operação (ainda fora do orçamento, que segue com as 9 de BUSINESS_BUDGET_CATEGORIES); "Empréstimo recebido", "Parcela de empréstimo" e "Equipamento" são categorias de
 * escolha que ficam fora da operação em "Seu negócio" (o dinheiro entrou ou saiu de verdade, mas não é venda nem gasto do dia a dia) e
 * fora do orçamento.
 *
 * Arquivo sem dependências (só o tipo): a leitura das mensagens do Telegram e do WhatsApp (packages/core/src/whatsapp/mensagem.ts), que
 * vai inteira para as funções do servidor, usa a mesma lista sem levar o resto de business.ts. business.ts reexporta.
 */
export const BUSINESS_CATEGORIES: Readonly<Record<RecordKind, readonly string[]>> = {
  receita: ['Vendas', 'Serviços', 'Outras entradas', 'Empréstimo recebido'],
  despesa: [
    'Material e mercadoria',
    'Peças e ferramentas',
    'Combustível e transporte',
    'Funcionários e ajudantes',
    'Impostos e DAS',
    'Aluguel do ponto',
    'Contas do ponto',
    'Taxas e maquininha',
    'Divulgação',
    'Contabilidade e sistemas',
    'Juros e multas',
    'Outras saídas',
    'Parcela de empréstimo',
    'Equipamento',
  ],
};

/**
 * As saídas que ficam fora de uma compra no cartão do negócio (D-121; as mesmas de BUSINESS_OUTSIDE_CATEGORIES.despesa, em business.ts,
 * que `cardCategories` tira da escolha do cartão): a compra no cartão chega a "Seu negócio" pelo pagamento da fatura, que fica na operação.
 */
export const BUSINESS_NOT_ON_CARD: readonly string[] = ['Parcela de empréstimo', 'Equipamento'];
