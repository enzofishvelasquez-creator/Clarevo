# Regras financeiras do primeiro ciclo

08/10/2026 · código em `packages/core` e no banco (`supabase/migrations`). As mesmas regras valem nos dois lugares.

## Implementado e testado

| Regra | Como | Onde é testado |
|---|---|---|
| Precisão monetária | Centavos inteiros; nunca ponto flutuante | core |
| Valor digitado | Aceita `80`, `80,00`, `1.234,56` e, sem vírgula, `12.50` (ponto com 1 ou 2 casas). Rejeita zero, negativo, ambíguo (`1,234`), espaço no meio e mais de duas casas | core |
| Limite por registro | R$ 9.999.999,99, com mensagem própria | core, banco |
| Data | DD/MM/AAAA com barras automáticas e atalhos Hoje/Ontem; data civil sem fuso; 31/09 é recusada; data futura é recusada (dia atual no fuso do aparelho, guardado no primeiro acesso) | core, banco, web |
| Descrição | Obrigatória, 1 a 80 caracteres (emoji conta 1) sem espaços, tabulações ou quebras nas pontas; `<` e `>` são texto | core, banco, web |
| Categoria | Opcional ("Sem categoria"), listas diferentes para gasto e recebimento, até 40 caracteres | core, banco, web |
| Conta | Conta e registro sempre do mesmo contexto e moeda | banco |
| Fonte única | Lista, detalhe e totais leem os mesmos registros | core, web |
| Diferença do mês | Recebidos menos pagos, mesmo contexto, data de pagamento/recebimento no mês. Não é saldo | core, banco, web |
| Ainda a pagar | Contas a pagar em origem separada; nunca entram em Recebido, Pago ou Diferença. No mês corrente, "Ainda a pagar neste mês" soma as contas em aberto com vencimento no mês e as vencidas de meses anteriores ainda em aberto, mostradas em linha própria ("Inclui R$ 40,00 de contas vencidas antes de outubro."). Nos outros meses ("Previsto para setembro de 2026"), soma as em aberto com vencimento naquele mês. É estoque em aberto hoje, não fluxo: uma conta de setembro ainda em aberto aparece em setembro e em outubro, e esses totais não se somam entre meses. O banco repete a regra em `month_to_pay`, e o teste de API compara os dois | core, banco, API, web |
| Duplicidade | Chave por operação; repetir devolve o mesmo resultado; mesma chave com outro conteúdo é recusada. Registros e contas a pagar usam o mesmo espaço de chaves: a mesma chave em outra ação também é recusada. Nas funções de contas a pagar, o conteúdo é comparado pelos argumentos codificados em JSON (texto escapado, nulo diferente de vazio, data em ISO): uma barra vertical ("\|") na descrição ou na categoria não faz pedidos diferentes parecerem repetição | core, banco, API |
| Falha de rede incerta | Antes de repetir, o app consulta se alguma tentativa anterior foi gravada; se foi e o preenchimento mudou, aplica a mudança como edição do mesmo registro. Em conta a pagar e pagamento vale o mesmo: nunca cria uma segunda conta a pagar nem um segundo pagamento | core, banco (a tela ainda sem teste automatizado de queda de rede) |
| Edição | Mantém o ID e soma 1 à versão; mudar a data move o registro entre meses e atualiza os dois | core, banco, web |
| Conflito | Versão antiga não sobrescreve: o app mostra a versão atual e mantém o preenchimento | core, banco |
| Exclusão | Lógica, após confirmação; muda o total uma única vez; registro excluído não pode ser editado | core, banco, web |
| Ausência de dado | Consulta que falhou mostra erro e "Tentar novamente", nunca R$ 0,00; meses grandes são lidos em páginas, sem total incompleto | core, web |
| Saldo inicial | Opcional; desconhecido é diferente de zero; sem ele não há saldo calculado | core, banco |
| Conta a pagar | Descrição (mesmas regras do registro), valor previsto (mesmo limite), vencimento e categoria opcional. Editar mantém o ID e soma 1 à versão; mudar o vencimento pode mudar o mês. Exclusão lógica, com confirmação, só para conta em aberto. Situação calculada: A vencer, Vence hoje, Vencida ou Paga (paga nunca é vencida) | core, banco, API, web |
| Vencimento | DD/MM/AAAA, no passado ou no futuro, de 1 ano antes até 2 anos depois de hoje, com aritmética de calendário (com hoje em 29/02/2028, vai de 28/02/2027 a 28/02/2030). A janela só é conferida quando o vencimento é novo ou muda, para uma conta antiga continuar editável. Vencida é calculada (em aberto com vencimento antes de hoje), nunca gravada. "Hoje" é o dia no fuso da pessoa (D-017): o app usa o fuso do aparelho e o banco, o fuso guardado no primeiro acesso; perto da meia-noite, uma conta pode mudar de grupo ou a data de pagamento "Hoje" pode ser recusada. Em branco, o app mostra "Informe a data de vencimento, como 15/10/2026."; preenchido e inválido, "Confira a data informada." O banco recusa os dois como `data_invalida` | core, banco, API, web |
| Marcar como paga | Uma única operação atômica e idempotente (`pay_commitment`): cria um gasto realizado com o valor pago, a data do pagamento (até hoje, antes ou depois do vencimento), a conta de saída (ativa, do mesmo contexto e moeda), a categoria e a descrição da conta a pagar, e muda a conta a pagar para paga. O valor pago pode diferir do previsto (juros, multa ou desconto) e sempre quita a conta inteira. O gasto entra em Pago do mês da data do pagamento, mesmo com vencimento em outro mês. Recusa não grava nada | core, banco, API, web |
| Desfazer pagamento | `undo_commitment_payment` exclui o gasto logicamente (o vínculo fica como rastro) e reabre a conta a pagar na mesma operação; excluir o gasto em Movimentações tem o mesmo efeito. Conta paga não é editada nem excluída sem antes desfazer o pagamento | core, banco, API, web |
| Pagas na lista | Em "Contas a pagar" de um mês, "Pagas" mostra as contas pagas com vencimento no mês e as pagas com data do pagamento no mês, qualquer que seja o vencimento. Quando vencimento e pagamento caem em meses diferentes, a conta aparece nos dois. Só a lista muda: "Ainda a pagar", Recebido, Pago e Diferença continuam iguais. Desfazer o pagamento ou mudar a data do gasto atualiza os meses em que ela aparece | core, API, web |
| Conta do próximo mês | Em uma conta paga, "Adicionar a conta do próximo mês" preenche descrição, valor previsto e categoria, com vencimento um mês depois (31/01 vira 28/02). Antes, o app confere as contas do mês desse vencimento, em aberto ou pagas (excluídas não contam), com o mesmo vencimento e a mesma descrição, sem diferenciar maiúsculas e minúsculas nem espaços nas pontas. Se achar uma, mostra, por exemplo, "A conta a pagar de novembro de 2026 já foi anotada." e o caminho para ela, em vez do atalho | core, web |
| Gasto de conta a pagar | Gasto comum em Movimentações, na composição de Pago e nos totais, identificado como "conta a pagar". Continua editável (valor, data, conta, descrição e categoria); editar soma 1 à versão da conta a pagar e não muda o valor previsto. O vínculo com a conta a pagar nunca muda | core, banco, API, web |
| Versão ausente | Editar, excluir, pagar ou desfazer sem informar a versão é recusado como versão desatualizada, em registros e em contas a pagar (antes, editar ou excluir registro sem versão passava sem conferir conflito) | banco, API |

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

R$ 650 em contas a pagar ficam separados durante toda a sequência ("Ainda a pagar" não muda).

## Sequência de aceite de contas a pagar (reproduzida no core, no banco, na API e na web)

Contexto Pessoal, outubro, hoje = 07/10/2026. Base da demonstração: Internet R$ 150,00 (vence 15/10), Condomínio R$ 500,00 (vence 20/10) e Seguro do carro R$ 300,00 (vence 10/11, fora do mês).

| Operação | Recebido | Pago | Diferença | Ainda a pagar |
|---|---:|---:|---:|---:|
| Base | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 | R$ 650,00 |
| Anotar Água R$ 90,00, vence 05/10 | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 | R$ 740,00 |
| Anotar Gás R$ 40,00, vence 28/09 | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 | R$ 780,00 (inclui R$ 40,00 de setembro) |
| Marcar Internet como paga: R$ 155,00 em 07/10 | R$ 6.000,00 | R$ 4.055,00 | R$ 1.945,00 | R$ 630,00 |
| Repetir a mesma operação (mesma chave) | R$ 6.000,00 | R$ 4.055,00 | R$ 1.945,00 | R$ 630,00 |
| Desfazer o pagamento | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 | R$ 780,00 |
| Marcar Internet como paga: R$ 150,00 em 07/10 | R$ 6.000,00 | R$ 4.050,00 | R$ 1.950,00 | R$ 630,00 |
| Adicionar a conta do próximo mês (Internet, R$ 150,00, vence 15/11) | R$ 6.000,00 | R$ 4.050,00 | R$ 1.950,00 | R$ 630,00 |
| Excluir o gasto gerado (Movimentações) | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 | R$ 780,00 |
| Excluir Água, Gás e a Internet de 15/11 | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 | R$ 650,00 |

O passo "Adicionar a conta do próximo mês" é do app e é conferido no core e na web. Setembro durante toda a sequência: Pago R$ 3.750,00; "Previsto para setembro de 2026" mostra R$ 40,00 enquanto o Gás existir. Pagar em 30/09 uma conta que vence em 02/10 muda o Pago de setembro e tira a conta de "Ainda a pagar" de outubro; o formulário anuncia o mês antes de confirmar. Essa conta aparece em "Pagas" de setembro (mês do pagamento) e de outubro (mês do vencimento).

## Ainda não implementado (ciclos seguintes, exigem definição antes)

- Contas a pagar: recorrência e lembretes (P-011), pagamento parcial, juros e multa em registro próprio, código de boleto e Pix (P-013).
- Contas a receber previstas.
- Cartão de crédito e fatura: parcelas, pagamento parcial, juros, estorno.
- Transferência entre contas próprias e empréstimos.
- Receita fixa, variável e pontual com revisão mensal.
- Saldo inicial informado como evento próprio (não é renda).
- Metas, reservas e aportes.
