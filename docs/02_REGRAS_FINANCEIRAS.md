# Regras financeiras do primeiro ciclo

07/10/2026 · código em `packages/core` e no banco (`supabase/migrations`). As mesmas regras valem nos dois lugares.

## Implementado e testado

| Regra | Como | Onde é testado |
|---|---|---|
| Precisão monetária | Centavos inteiros; nunca ponto flutuante | core |
| Valor digitado | Aceita `80`, `80,00`, `1.234,56`. Rejeita zero, negativo, ambíguo (`12.34`, `1,234`) e mais de duas casas | core |
| Limite por registro | R$ 9.999.999,99, com mensagem própria | core, banco |
| Data | DD/MM/AAAA, data civil sem fuso; 31/09 é recusada; data futura é recusada (dia atual no fuso da pessoa) | core, banco, web |
| Descrição | Obrigatória, 1 a 80 caracteres sem espaços nas pontas; `<` e `>` são texto | core, banco, web |
| Categoria | Opcional ("Sem categoria") | core, web |
| Conta | Conta e registro sempre do mesmo contexto e moeda | banco |
| Fonte única | Lista, detalhe e totais leem os mesmos registros | core, web |
| Diferença do mês | Recebidos menos pagos, mesmo contexto, data de pagamento/recebimento no mês. Não é saldo | core, banco, web |
| Ainda a pagar | Compromissos em origem separada; nunca entram em Recebido/Pago | core, web |
| Duplicidade | Chave por operação; repetir devolve o mesmo resultado; mesma chave com outro conteúdo é recusada | core, banco |
| Falha de rede incerta | Antes de repetir, o app consulta se a operação já foi concluída | core, web |
| Edição | Mantém o ID e soma 1 à versão; mudar a data move o registro entre meses e atualiza os dois | core, banco, web |
| Conflito | Versão antiga não sobrescreve: o app mostra a versão atual e mantém o preenchimento | core, banco |
| Exclusão | Lógica, após confirmação; muda o total uma única vez; registro excluído não pode ser editado | core, banco, web |
| Ausência de dado | Consulta que falhou mostra erro e "Tentar novamente", nunca R$ 0,00 | core, web |
| Saldo inicial | Opcional; desconhecido é diferente de zero; sem ele não há saldo calculado | core, banco |

## Sequência de aceite (reproduzida no core, no banco e na web)

| Operação no mesmo mês e contexto | Recebido | Pago | Diferença |
|---|---:|---:|---:|
| Base de teste | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 |
| Criar gasto de R$ 80,00 | R$ 6.000,00 | R$ 3.980,00 | R$ 2.020,00 |
| Editar o mesmo gasto para R$ 95,00 | R$ 6.000,00 | R$ 3.995,00 | R$ 2.005,00 |
| Excluir esse gasto | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 |
| Criar recebimento de R$ 200,00 | R$ 6.200,00 | R$ 3.900,00 | R$ 2.300,00 |
| Editar o mesmo recebimento para R$ 250,00 | R$ 6.250,00 | R$ 3.900,00 | R$ 2.350,00 |
| Excluir esse recebimento | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 |

R$ 650 em compromissos previstos ficam separados durante toda a sequência.

## Ainda não implementado (ciclos seguintes, exigem definição antes)

- Cadastro de compromissos previstos (hoje só leitura; conta nova mostra "Nenhum compromisso registrado").
- Cartão de crédito e fatura: parcelas, pagamento parcial, juros, estorno.
- Transferência entre contas próprias e empréstimos.
- Receita fixa, variável e pontual com revisão mensal.
- Saldo inicial informado como evento próprio (não é renda).
- Metas, reservas e aportes.
