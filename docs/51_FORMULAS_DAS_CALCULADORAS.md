# Fórmulas das calculadoras da Clarevo

Revisão de 17/11/2026 (D-109). Este documento explica, em português simples, a conta de cada calculadora do app e do site: o que ela responde, o que a pessoa informa, a fórmula, as convenções (taxa, começo ou fim do mês, arredondamento), um exemplo completo e o que mudou nesta revisão. Foi escrito para quem não é da área técnica e para ser enviado a outra pessoa ou outra IA revisar.

Todos os exemplos numéricos abaixo são conferidos pelos testes automáticos do núcleo (`packages/core/test/calc-*.test.ts` e `packages/core/test/simulate.test.ts`). Se um número deste documento mudar no código, o teste falha. O código das contas fica em `packages/core/src/calculators/` e, para o simulador, em `packages/core/src/simulate.ts`; o app e o site usam o mesmo código.

## Convenções que valem para todas

**Dinheiro em centavos inteiros.** Toda conta guarda os valores em centavos (R$ 10,00 = 1.000 centavos), sem casas decimais escondidas. Isso evita diferenças de 1 centavo que aparecem quando se calcula com números "quebrados".

**Arredondamento.** Salvo quando dito outra coisa, o resultado é arredondado para o centavo mais próximo, e o meio centavo sobe ("metade para cima": 0,5 centavo vira 1 centavo). Algumas contas arredondam sempre para cima ou sempre para baixo, e isso está escrito em cada uma e nas hipóteses da tela. Regra geral: o que a pessoa precisa guardar ou pagar arredonda para cima (para não faltar), e o que ela terá no fim arredonda para baixo (para não prometer a mais).

**Taxas.** A pessoa digita a taxa em percentual, com até 2 casas depois da vírgula ("1,96"). A Clarevo nunca sugere taxa: o campo começa vazio.

**Taxa ao mês e taxa ao ano (taxa equivalente).** Quando a pessoa informa uma taxa ao ano e a conta é mês a mês, a taxa ao mês é a equivalente em juros compostos:

> taxa ao mês = (1 + taxa ao ano) elevado a 1/12, menos 1

Exemplo: 10% ao ano viram 0,80% ao mês, porque 1,0080 multiplicado por ele mesmo 12 vezes dá 1,10. Não se divide a taxa ao ano por 12 (isso daria 0,83% e um resultado maior que o certo). No caminho contrário, uma taxa ao mês vira taxa ao ano assim:

> taxa ao ano = (1 + taxa ao mês) elevado a 12, menos 1

Exemplo: 2% ao mês equivalem a 26,82% ao ano.

**Juros compostos.** Os juros de cada mês entram no saldo e passam a render (ou a custar) juros no mês seguinte: valor depois de n meses = valor × (1 + i) elevado a n.

**Tabela Price.** Parcelas iguais que já incluem os juros. Para um valor P financiado em n parcelas à taxa i ao mês, com a primeira parcela 1 mês depois:

> parcela = P × i × (1 + i)^n ÷ ((1 + i)^n - 1)

Com a primeira parcela paga no dia da compra (antecipada), a parcela é a mesma conta dividida por (1 + i).

**Valor presente.** Quanto vale hoje um pagamento futuro, descontando os juros: um pagamento daqui a t meses vale hoje pagamento ÷ (1 + i)^t. Várias parcelas valem a soma disso.

**Mês e dias.** Quando a conta é por dias (multa e juros por atraso, prazos pelos vencimentos), o mês tem 30 dias.

**Limites.** Valores em reais vão de R$ 0,01 a R$ 9.999.999,99 (alguns campos opcionais aceitam zero). Cada calculadora tem a sua faixa de taxa e de prazo, escrita abaixo. Com números extremos, quando o resultado passaria do que a tela mostra, aparece "Com estes números, o resultado passa do que a calculadora mostra." em vez de um número errado.

**Estimativa sempre rotulada.** Toda tela mostra as hipóteses usadas logo abaixo do resultado, e as contas de dívida dizem que o valor oficial é o da instituição.

## 1. Antes de financiar

**O que responde.** Quanto fica a parcela de um financiamento, quanto se paga de juros, quanto a parcela pesa na renda, em quanto tempo daria para juntar o dinheiro e comprar à vista, e o que muda com uma entrada maior.

**O que a pessoa informa.** Preço à vista; entrada (opcional, de R$ 0 até o preço); número de parcelas (1 a 480); taxa de juros ao mês (0% a 99,99%; a dica pede o CET ao mês, se a pessoa tiver); se a primeira parcela vence em 1 mês (padrão Sim) ou é paga na compra; renda líquida por mês (opcional); quanto conseguiria guardar por mês (opcional, em branco vale a parcela); rendimento ao ano para juntar (opcional, 0% a 30%, em branco é sem rendimento).

**Fórmulas.**

- valor financiado = preço - entrada
- parcela pela tabela Price (veja as convenções), com i = taxa ao mês e n = número de parcelas; primeira na compra: a mesma parcela ÷ (1 + i)
- taxa 0%: parcela = valor financiado ÷ n, no centavo, e a última parcela absorve a diferença do arredondamento (o total fica igual ao preço)
- total pago = entrada + n × parcela
- juros = total pago - preço (nunca negativo)
- peso na renda = parcela ÷ renda, com uma casa decimal
- juntar antes: o menor número de meses em que os depósitos alcançam o que falta (preço - entrada), com os depósitos no começo de cada mês e o rendimento pela taxa mensal equivalente (a mesma conta do simulador, item 11)
- entrada maior: a mesma conta com a entrada somada de 10% e de 20% do preço

**Convenções.** Parcela arredondada metade para cima. Prazo para juntar em meses inteiros, para cima. Depósitos no começo do mês.

**Exemplo (conferido nos testes).** Preço R$ 1.200,00, entrada R$ 200,00, 12 parcelas a 1% ao mês, primeira em 1 mês. Valor financiado R$ 1.000,00. Parcela = 1.000 × 0,01 × 1,01^12 ÷ (1,01^12 - 1) = R$ 88,85. Total pago = 200,00 + 12 × 88,85 = R$ 1.266,20. Juros = 1.266,20 - 1.200,00 = R$ 66,20. Com a primeira parcela na compra, R$ 87,97. Com renda de R$ 4.000,00: a parcela é 2,2% da renda. Juntar antes, guardando R$ 88,85 por mês sem rendimento: R$ 1.000,00 ÷ R$ 88,85 = 11,25, ou seja 12 meses; guardando R$ 90,00 com 12% ao ano, 11 meses. Entrada maior (preço R$ 1.200,00 sem entrada, 12 × a 1%): parcela de R$ 106,62 e juros de R$ 79,44; com mais 10% (R$ 120,00), R$ 95,96 e R$ 71,52; com mais 20% (R$ 240,00), R$ 85,29 e R$ 63,48.

**O que mudou nesta revisão.** As contas estavam certas. Uma hipótese contradizia a dica do campo: a dica pede "Use o CET ao mês, se tiver" e a hipótese dizia "Só a taxa de juros informada, sem tarifas, seguros e IOF". Agora a hipótese diz: "A conta usa só a taxa informada: com a taxa de juros, ficam de fora tarifas, seguros e IOF; com o CET ao mês, eles já estão dentro."

## 2. Parcelado ou à vista? (e "Cota única ou parcelado?")

**O que responde.** Quanto o parcelado custa a mais que o preço à vista e qual é a taxa de juros que está embutida nas parcelas.

**O que a pessoa informa.** Preço à vista (ou valor da cota única); número de parcelas (2 a 480; na cota única, 2 a 12); valor de cada parcela; se a primeira parcela é paga na compra (na cota única, se vence junto com a cota).

**Fórmulas.**

- total parcelado = n × parcela
- diferença = total parcelado - preço à vista
- taxa embutida: a taxa ao mês i que faz as parcelas valerem hoje o preço à vista, pela tabela Price: preço à vista = parcela × (1 - (1 + i)^-n) ÷ i. Essa equação não tem fórmula direta; a taxa é achada por tentativas sucessivas (bisseção), com precisão bem abaixo de 0,01%.
- primeira parcela na compra: financiado = preço à vista - parcela, em n - 1 parcelas
- taxa ao ano = (1 + i)^12 - 1
- total parcelado igual ou menor que o preço à vista: "Não há juros embutidos" (nenhuma taxa é mostrada)

**Convenções.** Taxa mostrada com 2 casas; uma taxa positiva que arredondaria para 0,00% aparece como "menos de 0,01%".

**Exemplo (conferido nos testes).** R$ 1.080,00 à vista ou 10 × R$ 120,00, primeira em 1 mês: o parcelado custa R$ 120,00 a mais, com juros embutidos de 1,96% ao mês (26,27% ao ano). Com a primeira na compra (R$ 960,00 financiados em 9 parcelas): 2,42% ao mês (33,28% ao ano).

**O que mudou nesta revisão.** Nada: fórmulas, arredondamentos, limites e textos conferidos.

## 3. Quanto custa por ano?

**O que responde.** Quanto um gasto que se repete soma por ano, por mês e por dia.

**O que a pessoa informa.** O valor e a frequência: por dia útil, por semana ou por mês.

**Fórmulas.**

- por dia útil: por mês = valor × 22; por ano = por mês × 12
- por semana: por ano = valor × 52; por mês = por ano ÷ 12
- por mês: por ano = valor × 12
- por dia (na semana e no mês) = por ano ÷ 365

**Convenções.** 22 dias úteis por mês, 52 semanas e 365 dias por ano. Divisões arredondadas metade para cima.

**Exemplo (conferido nos testes).** R$ 25,00 por semana: R$ 1.300,00 por ano, R$ 108,33 por mês (1.300,00 ÷ 12) e R$ 3,56 por dia (1.300,00 ÷ 365 = 3,5616). R$ 130,60 por mês: R$ 1.567,20 por ano e R$ 4,29 por dia. R$ 18,00 por dia útil: R$ 396,00 por mês e R$ 4.752,00 por ano.

**O que mudou nesta revisão.** Nada.

## 4. Quanto custa uma dívida?

**O que responde.** Quanto uma dívida cresce com os juros, conforme o tipo.

**O que a pessoa informa.** O tipo (rotativo do cartão, cheque especial, empréstimo ou outra dívida); o valor; a taxa de juros ao mês (0,01% a 99,99%; a dica pede a taxa de juros, não o CET); no cheque especial, por quantos meses (1 a 24); no empréstimo, o número de parcelas (1 a 120); no rotativo, opcionalmente a taxa e as parcelas de "E se parcelar a fatura?" (1 a 24).

**Fórmulas.**

- rotativo (1 ciclo, até a fatura seguinte): juros = valor × i; valor na fatura seguinte = valor + juros
- parcelar a fatura: parcela pela tabela Price sobre o valor da fatura seguinte; total = n × parcela; juros e encargos = total - valor original. Pela Lei 14.690/2023, juros e encargos do rotativo e do parcelamento somados não passam do valor original: total máximo = 2 × valor original (o IOF fica fora desse limite)
- cheque especial: total = valor × (1 + i)^meses (juros compostos, sem pagamentos no período); acima de 8% ao mês, o aviso do teto da Res. CMN 4.765/2019
- empréstimo: parcela pela tabela Price; total = n × parcela; juros = total - valor
- em todos: a taxa ao ano equivalente, (1 + i)^12 - 1

**Convenções.** Contas exatas em inteiros, arredondadas metade para cima só no fim. Sem IOF, multa e tarifas (dito nas hipóteses e no aviso sobre o CET).

**Exemplo (conferido nos testes).** Cheque especial de R$ 1.000,00 a 8% ao mês por 3 meses: 1.000 × 1,08^3 = R$ 1.259,71, com R$ 259,71 de juros (151,82% ao ano). Empréstimo de R$ 5.000,00 a 2% em 12 parcelas: R$ 472,80 por mês, R$ 5.673,60 no total. Rotativo de R$ 700,00 a 14%: R$ 98,00 de juros e R$ 798,00 na fatura seguinte; parcelar esses R$ 798,00 em 24 × a 8% daria 24 × R$ 75,79 = R$ 1.818,96, mas pelo limite o total fica em no máximo R$ 1.400,00; em 12 × R$ 105,89, R$ 1.270,68, dentro do limite.

**O que mudou nesta revisão.** Nada.

## 5. Quitar antes ou adiantar parcelas

**O que responde.** Uma estimativa de quanto pagar hoje para quitar as parcelas que faltam (ou adiantar as últimas) e quanto de juros sai da conta.

**O que a pessoa informa.** Valor da parcela; quantas faltam (1 a 480); a taxa de juros ao mês do contrato (0,01% a 99,99%); "Quitar tudo" ou "Adiantar as últimas" (quantas). Aberta a partir de um parcelamento, a conta recebe também os dias até cada vencimento.

**Fórmulas.**

- valor para pagar hoje = soma de parcela ÷ (1 + i)^t, para cada parcela antecipada; t = 1, 2, 3... meses (a próxima em 1 mês). Ao adiantar as últimas N, entram as de t = faltam - N + 1 até faltam
- com os vencimentos: t = dias até o vencimento ÷ 30 (vencida conta 0)
- soma das parcelas = parcela × quantidade
- desconto estimado = soma - valor para pagar hoje

**Convenções.** Juros compostos pela taxa do contrato (a regra do CDC, art. 52, § 2º, é a redução proporcional dos juros). Arredondamento metade para cima, só no fim. Sempre com "Estimativa. O valor oficial é o que a instituição informar; peça o valor atualizado."

**Exemplo (conferido nos testes).** 36 × R$ 850,00 a 1,5% ao mês: soma R$ 30.600,00; valor estimado para quitar hoje R$ 23.511,58; desconto estimado R$ 7.088,42. Adiantar as 3 últimas: R$ 1.514,47 em vez de R$ 2.550,00.

**O que mudou nesta revisão.** Nada.

## 6. Multa e juros por atraso

**O que responde.** Quanto fica uma conta, um boleto ou a fatura do cartão depois do vencimento.

**O que a pessoa informa.** Conta ou boleto: valor, multa (0% a 20%), juros ao mês (0% a 99,99%) e dias depois do vencimento (1 a 3.650). Fatura do cartão: valor que ficou sem pagar, juros do rotativo ao mês, juros de mora ao mês (0% a 20%), multa e dias.

**Fórmulas.**

- multa = valor × multa (cobrada uma vez)
- juros = valor × juros ao mês × dias ÷ 30 (juros simples, proporcionais aos dias)
- conta: total = valor + multa + juros
- fatura: rotativo e mora pela mesma conta dos juros; teto da Lei 14.690/2023 e da Res. CMN 5.112/2023: rotativo + mora + multa não passam do valor sem pagar (quando passam, os juros são cortados na proporção de cada um e a multa fica); IOF estimado de pessoa física = valor × (0,38% + 0,0082% × dias, até 365 dias), fora do teto; total = valor + rotativo + mora + multa + IOF

**Convenções.** 30 dias por mês. Cada parcela da conta arredondada metade para cima. Na fatura, a hipótese avisa que o banco costuma cobrar juros sobre juros, então a fatura pode vir um pouco maior.

**Exemplo (conferido nos testes).** Conta de R$ 200,00, multa de 2%, juros de 1% ao mês, 10 dias: multa R$ 4,00; juros 200 × 0,01 × 10 ÷ 30 = R$ 0,67; total R$ 204,67. Fatura com R$ 1.000,00 sem pagar, rotativo de 15%, mora de 1%, multa de 2%, 30 dias: rotativo R$ 150,00, mora R$ 10,00, multa R$ 20,00 e IOF R$ 6,26 (1.000 × (0,38% + 0,0082% × 30)); total R$ 1.186,26. Com 365 dias, juros e multa param no teto (R$ 1.000,00) e o IOF é R$ 33,73: total R$ 2.033,73.

**O que mudou nesta revisão.** Nada.

## 7. Em que ordem quitar as dívidas?

**O que responde.** Um plano para quitar várias dívidas: com o dinheiro que a pessoa já paga e um valor a mais por mês (opcional), em quanto tempo tudo termina e quanto de juros sai da conta, em duas ordens lado a lado, com o plano passo a passo de cada uma: por qual dívida começar, onde vai o valor a mais, quando cada dívida acaba e para onde vai o pagamento dela depois. A calculadora mostra as duas ordens como fatos e não diz qual escolher.

**O que a pessoa informa.** De 1 a 10 dívidas, cada uma com um apelido opcional e o tipo:

- parcelada: valor da parcela (o que já paga por mês), parcelas que faltam (1 a 480) e a taxa ao mês do contrato (opcional, 0% a 99,99%; em branco, conta só as parcelas);
- saldo com juros: saldo de hoje, taxa ao mês (0,01% a 99,99%) e quanto paga por mês (precisa passar dos juros do mês para o saldo diminuir).

E, opcional, quanto a mais por mês consegue pôr nas dívidas.

**As duas ordens.** "Maior taxa primeiro": o que sobra vai antes para a dívida com a maior taxa ao mês (empate: a de menor saldo, depois a ordem da lista). "Menor dívida primeiro": vai antes para a dívida com o menor saldo hoje (empate: a de maior taxa, depois a ordem da lista).

**Fórmulas (mês a mês).**

- pagamentos no fim de cada mês, a partir do mês seguinte
- dívida com saldo: juros do mês = saldo × i; pagamento = o informado, limitado a saldo + juros; saldo novo = saldo + juros - pagamento
- dívida parcelada: o saldo inicial é o valor presente das parcelas que faltam, soma de parcela ÷ (1 + i)^t, t = 1 até o número de parcelas (sem taxa, a soma das parcelas). Ela segue a tabela do contrato: a parcela é sempre a do contrato e, depois de k parcelas, o saldo é o valor presente das que restam. O valor a mais aplicado nela rende a taxa do contrato e abate o saldo; a dívida acaba quando ele cobre o valor presente do que falta
- com o plano (nas duas ordens): total do mês = valor a mais + todos os pagamentos de sempre. Cada dívida aberta recebe o seu pagamento de sempre; o que sobra (o valor a mais e os pagamentos das dívidas que já acabaram) vai para a primeira dívida aberta da ordem, e o que sobrar dela passa para a seguinte no mesmo mês
- referência "Sem valor a mais": cada dívida só com os pagamentos de sempre, sem passar nada adiante
- juros estimados = total pago - soma dos saldos iniciais
- ganho = meses e juros a menos em relação à referência
- pagamento menor ou igual aos juros do primeiro mês: "Com este pagamento, o saldo não diminui." e a dívida fica fora da comparação
- mais de 600 meses (50 anos): "as dívidas não terminam em 50 anos"

**Convenções.** Juros do mês em centavos, metade para cima, em inteiros exatos. Pagamentos no fim do mês. Sempre com "Estimativa. O valor oficial de cada dívida é o que a instituição informar; peça o valor atualizado." Sem IOF nem tarifas, taxas fixas, sem compras novas nem atrasos.

**Como o resultado aparece (nesta ordem).**

1. A resposta em uma frase, com o ganho em meses e em juros estimados. Exemplo: "Com R$ 100,00 a mais por mês, tudo termina em 24 meses (outubro de 2028), em vez de 36 meses (outubro de 2029), com R$ 2.209,96 a R$ 2.216,64 a menos de juros estimados, conforme a ordem."
2. As duas ordens lado a lado: por qual dívida começa, a primeira a acabar, quando tudo termina e os juros estimados; e as diferenças como fatos ("Na ordem Maior taxa primeiro, os juros estimados são R$ 6,68 menores." "Na ordem Menor dívida primeiro, a primeira dívida acaba 2 meses antes.").
3. O plano passo a passo de cada ordem, por exemplo: "A partir de novembro de 2026 (mês 1): o pagamento de sempre de cada dívida e os R$ 100,00 a mais em Cartão azul." "Fevereiro de 2027 (mês 4): Cartão azul acaba. O pagamento dela (R$ 300,00) passa para Financiamento do carro, que fica com R$ 400,00 por mês além do pagamento de sempre." "Outubro de 2028 (mês 24): Financiamento do carro acaba, e tudo está quitado." e o ganho estimado da ordem.
4. O aviso de estimativa, as hipóteses e os detalhes de cada ordem (total pago e juros estimados; em "Sem valor a mais", em que ordem cada dívida termina).

**Exemplo conferido à mão (e nos testes).** Dívida A: R$ 1.000,00 a 10% ao mês, pagando R$ 600,00. Dívida B: R$ 500,00 a 5% ao mês, pagando R$ 300,00. Valor a mais: R$ 100,00 (total do mês R$ 1.000,00).

- Sem valor a mais: A tem juros de R$ 100,00 no mês 1 (saldo 1.100,00 - 600,00 = 500,00) e de R$ 50,00 no mês 2, quando é paga (R$ 550,00). B tem juros de R$ 25,00 (saldo 225,00) e de R$ 11,25, paga no mês 2 (R$ 236,25). Total pago R$ 1.686,25, juros R$ 186,25.
- Maior taxa primeiro (A recebe o que sobra): mês 1, A fica com 500,00 - 100,00 = 400,00; mês 2, A paga 440,00 e B 236,25. Total pago R$ 1.676,25, juros R$ 176,25.
- Menor dívida primeiro (B recebe o que sobra): mês 1, B fica com 225,00 - 100,00 = 125,00; mês 2, A paga 550,00 e B 131,25. Total pago R$ 1.681,25, juros R$ 181,25.

**Exemplo com duas parceladas (o caso do teste de 09/11/2026, com valor a mais; conferido nos testes).** Acordo: 9 parcelas de R$ 265,00 a 1% ao mês. Empréstimo: 60 parcelas de R$ 100,00 a 1,88% ao mês. Com R$ 300,00 a mais por mês, a partir de 09/11/2026: "Com R$ 300,00 a mais por mês, tudo termina em 10 meses (setembro de 2027), em vez de 60 meses (novembro de 2031), com R$ 1.989,83 a R$ 2.043,82 a menos de juros estimados, conforme a ordem." Maior taxa primeiro começa pelo Empréstimo, o Acordo acaba em agosto de 2027 e os juros estimados são R$ 491,87; Menor dívida primeiro começa pelo Acordo, que acaba em abril de 2027, e os juros estimados são R$ 545,86. No plano de Menor dívida primeiro: "Abril de 2027 (mês 5): Acordo acaba. O pagamento dela (R$ 265,00) passa para Empréstimo, que fica com R$ 565,00 por mês além do pagamento de sempre."

**O que mudou nesta revisão.** As contas estavam certas (inclusive a conservação: total pago = saldos iniciais + juros, conferida em centenas de combinações). O que mudou foi a página inteira, pelo retorno "a página falha em demonstrar o seu objetivo e o que cada informação muda na resposta": no topo, para que serve; cada campo diz o que muda (a parcela é o que já se paga e passa para a próxima quando a dívida acaba; a taxa define o lugar em "Maior taxa primeiro"; o saldo, em "Menor dívida primeiro"; o valor a mais vai para a dívida por onde o plano começa e encurta o prazo); e o resultado deixou de empilhar frases: agora responde primeiro o ganho, depois compara as ordens lado a lado e mostra o plano passo a passo, e só depois as hipóteses e os detalhes. As diferenças viraram fatos neutros, e as hipóteses explicam as duas ordens e com o que o ganho é comparado.

## 8. Quanto guardar para imprevistos? (reserva)

**O que responde.** De quanto é a reserva para cobrir alguns meses de gastos essenciais, quanto do que já está guardado cobre e em quanto tempo ela fica completa.

**O que a pessoa informa.** Gastos essenciais por mês; quantos meses cobrir (1 a 24); quanto já tem guardado (opcional); quanto guarda por mês (opcional).

**Fórmulas.**

- reserva = gastos essenciais × meses
- meses cobertos = já guardado ÷ gastos essenciais, em décimos de mês, para baixo
- falta = reserva - já guardado (nunca negativo)
- prazo = falta ÷ por mês, em meses inteiros, para cima

**Convenções.** Sem rendimento. O mesmo valor guardado todo mês. Meses cobertos para baixo; prazo para cima (no último mês, falta menos que o valor de cada mês).

**Exemplo (conferido nos testes).** Gastos essenciais de R$ 3.750,00 e 6 meses: reserva de R$ 22.500,00. Com R$ 4.500,00 guardados: cobre 1,2 mês (4.500 ÷ 3.750 = 1,2) e faltam R$ 18.000,00. Guardando R$ 500,00 por mês: 18.000 ÷ 500 = 36 meses (3 anos). Guardando R$ 700,00 por mês: 18.000 ÷ 700 = 25,7, ou seja 26 meses.

**O que mudou nesta revisão.** As contas estavam certas. As hipóteses não diziam que o prazo é arredondado para cima nem que o valor guardado é o mesmo todo mês. Agora, quando a pessoa informa quanto guarda por mês, aparecem "O mesmo valor guardado todo mês." e, se a divisão não for exata, "Prazo em meses inteiros, para cima: no último mês, falta menos que o valor de cada mês."

## 9. Juntar para um objetivo

**O que responde.** Quanto guardar por mês para chegar a um valor num prazo, ou em quanto tempo se chega guardando um valor por mês. É a conta simples, sem rendimento e sem inflação; o botão "Simular com rendimento" leva os mesmos números ao simulador (item 11), que tem a taxa e a inflação.

**O que a pessoa informa.** Quanto quer juntar; quanto já tem (opcional); e "Quanto guardar por mês" (com o prazo, de 1 a 600 meses) ou "Em quanto tempo" (com o valor por mês).

**Fórmulas.**

- falta = quanto quer juntar - quanto já tem
- por mês = falta ÷ meses, para cima no centavo
- prazo = falta ÷ por mês, em meses inteiros, para cima

**Convenções.** Sem rendimento e sem inflação. Valor por mês para cima (para não faltar).

**Exemplo (conferido nos testes).** Juntar R$ 22.500,00 em 14 meses, já tendo R$ 4.500,00: falta R$ 18.000,00; por mês, 18.000 ÷ 14 = 1.285,714..., para cima R$ 1.285,72. Guardando R$ 1.000,00 por mês: 18 meses. Juntar R$ 10.000,00 em 60 meses (o exemplo do retorno, sem rendimento): R$ 166,67 por mês.

**O que mudou nesta revisão.** As contas estavam certas. A tela não dizia que a conta não considera inflação, e o retorno mostrou que isso confundia. Agora as hipóteses trazem "Sem inflação: o valor que você quer juntar fica o mesmo até o fim do prazo."

## 10. Dividir as contas da casa

**O que responde.** Quanto cada pessoa da casa põe nas contas, em partes iguais ou pela renda de cada uma.

**O que a pessoa informa.** O total das contas; como dividir; de 2 a 6 pessoas, com apelido opcional e, na divisão pela renda, a renda de cada uma.

**Fórmulas.**

- partes iguais: total ÷ número de pessoas
- pela renda: parte de cada pessoa = total × renda dela ÷ soma das rendas (cada pessoa põe a mesma fração da própria renda: total ÷ soma das rendas)
- percentual de cada parte = parte ÷ total, com uma casa

**Convenções.** Divisão pelo maior resto: cada parte recebe o valor arredondado para baixo, e os centavos que sobram vão para quem tem a maior fração que ficou de fora (em partes iguais, para as primeiras pessoas da lista). Assim a soma das partes sempre fecha com o total.

**Exemplo (conferido nos testes).** R$ 3.000,00 com rendas de R$ 4.000,00 e R$ 6.000,00: R$ 1.200,00 (40%) e R$ 1.800,00 (60%); cada pessoa põe cerca de 30% da própria renda. R$ 100,00 por 3 pessoas: R$ 33,34, R$ 33,33 e R$ 33,33.

**O que mudou nesta revisão.** Nada.

## 11. Simular um plano (o simulador, aberto por "Simular com rendimento")

**O que responde.** Com uma taxa de rendimento que a pessoa quer testar: quanto guardar por mês para chegar a um valor num prazo, em quanto tempo se chega guardando um valor por mês, ou quanto se pode ter. Opcionalmente, o efeito da inflação. Nada é gravado, e a taxa nunca é sugerida.

**O que a pessoa informa.** O que quer saber; quanto quer juntar (nos dois primeiros modos); quanto já tem (opcional); em quantos meses (1 a 600) ou quanto vai guardar por mês; a taxa de rendimento ao ano (0% a 30%, sempre digitada); e a inflação (opcional), com três escolhas:

- "Sem inflação";
- "Mostrar em dinheiro de hoje": só informa; a meta e o valor por mês não mudam, e o resultado diz quanto o total vale em dinheiro de hoje;
- "Corrigir a meta pela inflação" (só quando há meta): para manter o poder de compra, a meta sobe com a inflação até o fim do prazo, e o valor por mês (ou o prazo) é recalculado.

Mais a inflação ao ano (0% a 30%).

**Fórmulas.**

- taxa ao mês: i = (1 + taxa ao ano)^(1/12) - 1 (taxa equivalente)
- inflação ao mês: π = (1 + inflação ao ano)^(1/12) - 1
- valor no fim de n meses, com os aportes no começo de cada mês (a convenção da "Aplicação com depósitos regulares" da Calculadora do Cidadão do Banco Central): final = inicial × (1 + i)^n + aporte × (1 + i) × ((1 + i)^n - 1) ÷ i; com taxa 0%, final = inicial + aporte × n
- quanto guardar por mês: o menor valor, em centavos, cujo final alcança a meta
- em quanto tempo: o menor número de meses (até 600) cujo final alcança a meta; se não alcança em 50 anos, a tela diz isso
- em dinheiro de hoje = final ÷ (1 + π)^n, para baixo
- meta corrigida pela inflação = meta × (1 + π)^n, no centavo mais próximo (é o mesmo que meta × (1 + inflação ao ano)^(n ÷ 12)); em "Em quanto tempo", a meta corrigida é a do próprio mês: o menor n em que o final alcança meta × (1 + π)^n
- sem rendimento (o número ao lado): a mesma conta com taxa 0%

**Convenções.** Taxa mensal equivalente (não a taxa ao ano dividida por 12). Aportes no começo de cada mês (o aporte do mês já rende no mês). Valor por mês para cima e valores finais para baixo, no centavo. Valores brutos, sem imposto de renda, IOF ou taxas. Tudo isso aparece nas hipóteses da tela.

**Exemplo do retorno (conferido nos testes e, à parte, com 50 dígitos de precisão).** Juntar R$ 10.000,00 em 60 meses com 3,4% ao ano (0,28% ao mês) e inflação de 12% ao ano (0,95% ao mês).

- Fator dos aportes no começo do mês: (1 + i) × ((1 + i)^60 - 1) ÷ i = 65,3978. Por mês: 10.000,00 ÷ 65,3978 = 152,9104, para cima R$ 152,92 (com os aportes no fim do mês seriam R$ 153,34). Total no fim: R$ 10.000,63. Sem rendimento: 10.000,00 ÷ 60 = R$ 166,67.
- "Mostrar em dinheiro de hoje": 10.000,63 ÷ 1,12^5 = 10.000,63 ÷ 1,762342 = R$ 5.674,62. A tela diz: "Em dinheiro de hoje, com inflação de 12% ao ano, o total de R$ 10.000,63 equivale a R$ 5.674,62." e "Para manter o poder de compra de R$ 10.000,00, escolha "Corrigir a meta pela inflação"."
- "Corrigir a meta pela inflação": meta corrigida = 10.000,00 × 1,12^5 = 17.623,4168, no centavo R$ 17.623,42. Por mês: 17.623,42 ÷ 65,3978 = 269,4803, para cima R$ 269,49. Sem rendimento: 17.623,42 ÷ 60 = R$ 293,73. Total no fim: R$ 17.624,05, que equivale a R$ 10.000,35 de hoje.

**Outros exemplos (conferidos nos testes, com 10% ao ano).** Juntar R$ 22.500,00 em 14 meses com R$ 4.500,00 iniciais: R$ 1.175,15 por mês (sem rendimento, R$ 1.285,72). Com R$ 1.000,00 por mês: 17 meses (sem rendimento, 18). Quanto posso ter com R$ 1.000,00 por mês, 14 meses e R$ 4.500,00 iniciais: R$ 19.896,17 (aportado R$ 18.500,00). R$ 500,00 por mês por 120 meses: R$ 100.728,79; com inflação de 4,5% ao ano, equivale a R$ 64.862,05 de hoje.

**O que mudou nesta revisão.** As contas estavam certas (o exemplo da captura confere centavo por centavo). O texto "Descontar inflação?" era ambíguo: não dizia se só mostrava o valor em dinheiro de hoje ou se corrigia a meta. Agora são escolhas separadas, cada uma com a sua dica e a sua hipótese, e a correção da meta é uma conta nova: sobe a meta e recalcula o valor por mês (ou o prazo). Com a meta corrigida, "Criar meta com estes valores" leva a meta corrigida e o valor por mês recalculado. A frase do dinheiro de hoje passou a dizer de qual total ela fala.

## Resumo do que estava errado ou confuso, por calculadora

| Calculadora | O que estava errado ou confuso | O que mudou |
|---|---|---|
| Antes de financiar | A hipótese da taxa contradizia a dica do campo (a dica pede o CET; a hipótese dizia que tarifas, seguros e IOF ficavam de fora) | Hipótese nova, que vale para a taxa de juros e para o CET |
| Parcelado ou à vista? | Nada | Nada |
| Quanto custa por ano? | Nada | Nada |
| Quanto custa uma dívida? | Nada | Nada |
| Quitar antes ou adiantar parcelas | Nada | Nada |
| Multa e juros por atraso | Nada | Nada |
| Em que ordem quitar as dívidas? | Contas certas; a página não mostrava para que servia nem o que cada campo mudava, e o resultado empilhava frases sem uma resposta prática | Página refeita: propósito no topo, dicas que dizem o que cada campo muda, resposta em uma frase, as duas ordens lado a lado e o plano passo a passo de cada ordem, hipóteses e detalhes no fim |
| Quanto guardar para imprevistos? | Hipóteses não diziam que o prazo é para cima nem que o valor por mês é constante | Duas hipóteses novas, quando há valor por mês |
| Juntar para um objetivo | A tela não dizia que a conta não considera inflação | Hipótese "Sem inflação" |
| Dividir as contas da casa | Nada | Nada |
| Simular um plano | "Descontar inflação?" ambíguo | Duas escolhas separadas ("Mostrar em dinheiro de hoje" e "Corrigir a meta pela inflação"), com a conta da meta corrigida |

## Como conferir

No repositório: `cd packages/core && npx vitest run test/calc-*.test.ts test/simulate.test.ts`. Cada exemplo deste documento está num teste com o mesmo número.
