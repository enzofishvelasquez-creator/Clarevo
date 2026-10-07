# Regras financeiras implementadas

07/10/2026 · código em `packages/core`, testes em `packages/core/test`.

## Implementado e testado

| Regra | Como | Teste |
|---|---|---|
| Precisão monetária | Centavos inteiros; nunca ponto flutuante | `dinheiro` |
| Leitura do valor digitado | "1.400,00", "1400", "80,5", "R$ 80". Ponto é milhar, vírgula é decimal. Rejeita ambíguos ("1,234", "12.34") | `lê` / `rejeita` |
| Previsto x confirmado | Confirmado exige data de pagamento; previsto não pode tê-la (também garantido no banco) | banco |
| Diferença do mês | Recebimentos menos pagamentos **confirmados** com data no mês. Não é saldo | cenário de aceite |
| Ainda a pagar | Saídas previstas com vencimento no mês; separadas do pago | cenário de aceite |
| Composição | Cada total lista os eventos que o compõem, pelo mesmo critério; a soma fecha | `composição` |
| Contextos isolados | Família não entra no Pessoal e vice-versa | `contextos` |
| Duplicidade | Mesma chave de envio no mesmo contexto não cria segundo registro (app e banco) | `envio repetido` |
| Edição e exclusão | Atualizam o resumo; exclusão é lógica | `edição` / `exclusão` |
| Ausência de dado | Mês sem registros informa "Sem registros", não R$ 0,00 | `mês sem registros` |

Cenário de aceite do CL-V003 verificado: R$ 6.000 recebidos − R$ 3.900 pagos = R$ 2.100. Novo pagamento de R$ 80 → pago R$ 3.980, diferença R$ 2.020; R$ 650 a pagar permanecem separados.

## Ainda não implementado (precisa de definição antes)

- Cartão de crédito e fatura: parcelas, pagamento parcial, juros, estorno.
- Transferência entre contas próprias e empréstimos.
- Receita fixa / variável / pontual com revisão mensal.
- Reservas e aportes de metas; rendimento x resgate.
- Contas bancárias e saldo inicial (necessários para mostrar saldo, que hoje não mostramos).
