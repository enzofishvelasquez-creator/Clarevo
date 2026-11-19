# Fórmulas das calculadoras da Clarevo

Revisão de 19/11/2026, depois da revisão externa de 18/11/2026 (D-109a; a anterior era a de 17/11/2026, D-109). Este documento explica, em português simples, a conta de cada calculadora do app e do site: o que ela responde, o que a pessoa informa, a fórmula, as convenções (taxa, começo ou fim do mês, arredondamento), as hipóteses e limitações que a tela mostra, um exemplo completo e o que mudou nesta revisão. Foi escrito para quem não é da área técnica e para ser enviado a outra pessoa ou outra IA revisar.

Todos os exemplos numéricos abaixo são conferidos pelos testes automáticos do núcleo (`packages/core/test/calc-*.test.ts`, `packages/core/test/simulate.test.ts` e, para os casos da revisão externa, `packages/core/test/revisao-externa-18-11.test.ts`). Se um número deste documento mudar no código, o teste falha. Os testes da revisão externa calculam o valor de referência no próprio teste, à mão, com aritmética racional exata ou com 40 algarismos de precisão, sem chamar a função conferida. O código das contas fica em `packages/core/src/calculators/` e, para o simulador, em `packages/core/src/simulate.ts`; o app e o site usam o mesmo código (o site roda o núcleo transpilado no navegador).

## Conclusão (o que esta revisão valida)

As fórmulas elementares conferem com as referências independentes para as hipóteses escritas em cada calculadora: tabela Price (inclusive com a primeira parcela na compra), juros compostos por meses inteiros, valor presente, taxa equivalente, taxa embutida por bisseção, anuidade com aportes no começo do mês (o exemplo de R$ 152,92 do simulador está certo nessa convenção) e a divisão pelo maior resto. A revisão externa mostrou problemas de modelagem, de parâmetros e de arredondamento em casos permitidos pela tela, e eles foram corrigidos ou passaram a ser ditos como limitação (a lista completa está em "Revisão externa de 18/11/2026", no fim).

O que isto **não** afirma: que as calculadoras reproduzem o contrato, a fatura ou o boleto de uma instituição. Elas estimam com as hipóteses mostradas na tela (taxa fixa, parcelas iguais, datas em meses ou em 30 dias por mês, sem tarifas, seguros, IOF ou correção monetária, salvo quando dito), e o valor oficial é sempre o da instituição. A validação vale para o modelo descrito aqui, testado no núcleo; as telas do app são conferidas pelo teste de telas (`scripts/e2e-web.js`) e as do site por `scripts/e2e-site.js`.

## Convenções que valem para todas

**Dinheiro em centavos inteiros.** Toda entrada e todo resultado em reais é guardado em centavos (R$ 10,00 = 1.000 centavos). Contas intermediárias podem ter mais precisão (veja a política de arredondamento).

**Taxas.** A pessoa digita a taxa em percentual, com até 2 casas depois da vírgula ("1,96"). O percentual vira fração uma vez só, na leitura: "2" é 2% (200 pontos-base), nunca 200%. A Clarevo nunca sugere taxa: o campo começa vazio e nenhum link a preenche.

**Taxa ao mês e taxa ao ano (taxa equivalente).** Quando a pessoa informa uma taxa ao ano e a conta é mês a mês, a taxa ao mês é a equivalente em juros compostos:

> taxa ao mês = (1 + taxa ao ano) elevado a 1/12, menos 1

Exemplo: 10% ao ano viram cerca de 0,7974% ao mês, que a tela mostra como 0,80%: 1,0080 multiplicado por ele mesmo 12 vezes dá **aproximadamente** 1,10 (1,10034). A conta usa a taxa completa, nunca os 0,80% da tela. Não se divide a taxa ao ano por 12 (isso daria 0,83% e um resultado maior que o certo). No caminho contrário:

> taxa ao ano = (1 + taxa ao mês) elevado a 12, menos 1

Exemplo: 2% ao mês equivalem a 26,82% ao ano.

**Juros compostos.** Os juros de cada mês entram no saldo e passam a render (ou a custar) juros no mês seguinte: valor depois de n meses = valor × (1 + i) elevado a n.

**Tabela Price.** Parcelas iguais que já incluem os juros. Para um valor P financiado em n parcelas à taxa i ao mês, com a primeira parcela 1 mês depois:

> parcela = P × i × (1 + i)^n ÷ ((1 + i)^n - 1)

Com a primeira parcela paga no dia da compra (antecipada), a parcela é a mesma conta dividida por (1 + i).

**Valor presente.** Quanto vale hoje um pagamento futuro, descontando os juros: um pagamento daqui a t meses vale hoje pagamento ÷ (1 + i)^t. Várias parcelas valem a soma disso.

**Mês e dias.** Quando a conta é por dias (multa e juros, prazos pelos vencimentos), o mês tem 30 dias. É uma convenção: o contrato pode contar os dias de outro jeito, e as hipóteses da tela dizem isso.

**Limites.** Valores em reais vão de R$ 0,01 a R$ 9.999.999,99 (alguns campos opcionais aceitam zero). Cada calculadora tem a sua faixa de taxa e de prazo, escrita abaixo. Com números extremos, quando o resultado passaria do que a tela mostra, aparece "Com estes números, o resultado passa do que a calculadora mostra." em vez de um número errado.

**Estimativa sempre rotulada.** Toda tela mostra as hipóteses usadas logo abaixo do resultado, e as contas de dívida dizem que o valor oficial é o da instituição.

### Política de arredondamento e precisão

1. **Entradas e saídas em centavos inteiros.** Nenhum resultado em reais tem casas escondidas.
2. **Contas exatas quando o expoente é inteiro.** Tabela Price, juros compostos por meses inteiros, valor presente com prazos em meses inteiros, IOF, multa e juros simples são calculados com aritmética racional exata (inteiros grandes, `BigInt`) e arredondados uma vez só, no fim.
3. **Ponto flutuante só onde o expoente é fracionário ou a conta é por tentativas.** Taxa equivalente ao mês, fator do simulador ((1 + i)^n com i da taxa ao ano), inflação ao mês, valor presente com dias ÷ 30 e a taxa embutida (bisseção) usam ponto flutuante de 64 bits (15 a 16 algarismos), com `log1p` e `expm1` para não perder precisão em taxas pequenas e prazos longos. A taxa usada é sempre a completa; a de 2 casas é só da tela.
4. **Direção do arredondamento.** Padrão: metade para cima (0,5 centavo vira 1). O que a pessoa precisa guardar arredonda para cima (valor por mês, prazo em meses), para não faltar. O que ela terá no fim arredonda para baixo (valores finais do simulador, meses cobertos da reserva), para não prometer a mais. Divisões que precisam fechar com o total usam o piso e distribuem os centavos que sobram (parcelas com taxa zero, divisão da casa pelo maior resto). A parcela do teto do cartão é para baixo, para nunca passar do teto.
5. **Contas encadeadas partem do valor mostrado.** Cada valor da tela é calculado a partir dos valores mostrados antes dele, para a pessoa conseguir refazer a conta com os números da tela: total = número de parcelas × parcela mostrada; valor em dinheiro de hoje = total mostrado ÷ (1 + inflação)^anos, para baixo; meta corrigida arredondada no centavo e o valor por mês calculado sobre ela. Exemplo: R$ 500,00 por mês por 120 meses a 10% ao ano dão R$ 100.728,7995...; a tela mostra R$ 100.728,79, e 100.728,79 ÷ 1,045^10 = 64.862,054..., para baixo R$ 64.862,05. Do total sem arredondar daria R$ 64.862,06: a diferença de 1 centavo é desta política, não erro de inflação.
6. **Estouro numérico.** Os produtos de valores grandes (valor × taxa^n, total × renda, valor presente) são feitos em `BigInt`. Nenhum resultado passa do maior inteiro seguro do JavaScript (2^53 - 1): o cheque especial acima de R$ 10 trilhões e o simulador acima de R$ 999.999.999.999,99 mostram o aviso de resultado alto, e o plano das dívidas para uma dívida que passaria de R$ 10 trilhões (ela não termina em 50 anos).
7. **Leitura compartilhada dos campos** (`calculators/inputs.ts` e `money.ts`). Valores em reais: recusa negativo, texto, "NaN", "Infinity", notação científica ("1e3") e formato ambíguo ("1,234", "0.500", "1.2345,00"); aceita a vírgula decimal brasileira ("1.234,56", "12,5") e o ponto decimal com 1 ou 2 casas ("12.50"); campo vazio é diferente de zero (vazio pede o valor; zero só vale onde a tela aceita). Taxas: até 2 casas, sem sinal, convertidas para pontos-base uma vez. Prazos e quantidades: inteiros na faixa ("12,5" é recusado). Além das entradas, as contas conferem os resultados (aviso de resultado alto, parcela nunca negativa, saldo que só cresce). Ao mudar um campo, o resultado antigo deixa de valer: as calculadoras refazem a conta a cada tecla, e o simulador limpa o resultado até a pessoa tocar em Simular de novo.

## 1. Antes de financiar

**O que responde.** Quanto fica a parcela de um financiamento, quanto se paga de juros (ou de custo adicional estimado, com o CET), quanto a parcela pesa na renda, em quanto tempo daria para juntar o dinheiro e comprar à vista, e o que muda com uma entrada maior.

**O que a pessoa informa.** Preço à vista; entrada (opcional, de R$ 0 até o preço); número de parcelas (1 a 480); qual taxa vai informar ("Taxa de juros", o padrão, ou "CET ao mês"); a taxa ao mês (0% a 99,99%); se a primeira parcela vence em 1 mês (padrão Sim) ou é paga na compra; renda líquida por mês (opcional, maior que zero quando preenchida); quanto conseguiria guardar por mês (opcional, em branco vale a parcela); rendimento ao ano para juntar (opcional, 0% a 30%, em branco é sem rendimento).

**Fórmulas.**

- valor financiado = preço - entrada (entrada igual ao preço: nada a financiar, sem parcela nem juros)
- taxa positiva: parcela pela tabela Price, com i = taxa ao mês e n = número de parcelas; primeira na compra: a mesma parcela ÷ (1 + i); total pago = entrada + n × parcela (a parcela já arredondada)
- taxa 0%: cada parcela é o valor financiado ÷ n, para baixo no centavo, e os centavos que sobram vão, um a um, para as últimas parcelas; o total pago é exatamente o preço e nenhuma parcela fica negativa
- juros (ou custo adicional estimado, com o CET) = total pago - preço (nunca negativo)
- peso na renda = maior parcela ÷ renda, com uma casa decimal
- juntar antes: o menor número de meses em que os depósitos alcançam o que falta (preço - entrada), com os depósitos no começo de cada mês e o rendimento pela taxa mensal equivalente (a mesma conta do simulador, item 11)
- entrada maior: a mesma conta com a entrada somada de 10% e de 20% do preço; a que chegaria ao preço inteiro só é citada ("Com mais 20% do preço, a entrada já cobriria o preço inteiro."), sem conta

**Taxa de juros ou CET.** O CET (custo efetivo total) não é a taxa de juros do contrato: ele inclui tarifas, seguros e IOF, que podem ser pagos à parte ou descontados do valor liberado. Com "Taxa de juros", a conta reproduz a tabela Price do contrato, e a hipótese diz que tarifas, seguros e IOF ficam de fora. Com "CET ao mês", a conta é uma **simulação de custo equivalente**: o CET entra no lugar da taxa, sobre o preço menos a entrada; o resultado fala em "custo adicional estimado" e a hipótese diz que a parcela e o custo podem ser diferentes dos do contrato. Exemplo da revisão externa: empréstimo de R$ 1.000,00 a 2% ao mês em 12 parcelas de R$ 94,56, com R$ 100,00 de tarifa paga no início. O fluxo líquido é R$ 900,00, e a taxa que iguala 900,00 às 12 parcelas é cerca de 3,7588% ao mês; aplicada a R$ 1.000,00 ela daria uma parcela fictícia de R$ 105,07. Por isso, com o CET, a calculadora não promete a parcela do contrato.

**Convenções.** Parcela com taxa positiva arredondada metade para cima; o contrato pode acertar alguns centavos na última (dito na hipótese). Prazo para juntar em meses inteiros, para cima. Depósitos no começo do mês: n meses são n depósitos, e o valor é alcançado no fim do mês n.

**Hipóteses e limitações ditas na tela.** Parcelas iguais (tabela Price); só a taxa informada; o comprometido do mês atual pode mudar nos meses seguintes; o preço do bem pode mudar enquanto a pessoa junta; o rendimento informado é constante e sem imposto. O peso de uma parcela na renda não mede, sozinho, a capacidade de assumir um financiamento (a referência de 30% aparece só como referência, com a fonte); juntar antes mantém o preço e a entrada constantes e não considera custo de esperar.

**Exemplo (conferido nos testes).** Preço R$ 1.200,00, entrada R$ 200,00, 12 parcelas a 1% ao mês, primeira em 1 mês. Valor financiado R$ 1.000,00. Parcela = 1.000 × 0,01 × 1,01^12 ÷ (1,01^12 - 1) = R$ 88,85. Total pago = 200,00 + 12 × 88,85 = R$ 1.266,20. Juros = 1.266,20 - 1.200,00 = R$ 66,20. Com a primeira parcela na compra, R$ 87,97. Com renda de R$ 4.000,00: a parcela é 2,2% da renda. Juntar antes, guardando R$ 88,85 por mês sem rendimento: R$ 1.000,00 ÷ R$ 88,85 = 11,25, ou seja 12 meses; guardando R$ 90,00 com 12% ao ano, 11 meses. Entrada maior (preço R$ 1.200,00 sem entrada, 12 × a 1%): parcela de R$ 106,62 e juros de R$ 79,44; com mais 10% (R$ 120,00), R$ 95,96 e R$ 71,52; com mais 20% (R$ 240,00), R$ 85,29 e R$ 63,48.

Taxa zero: R$ 100,00 em 3 vezes = R$ 33,33 + R$ 33,33 + R$ 33,34 (total R$ 100,00, a última identificada); R$ 1.000,00 em 12 vezes = 8 × R$ 83,33 e as 4 últimas de R$ 83,34; R$ 0,02 em 4 vezes = R$ 0,00 + R$ 0,00 + R$ 0,01 + R$ 0,01, e a hipótese diz que nem todas as parcelas têm valor.

**O que mudou nesta revisão.** A taxa de juros e o CET passaram a ser escolhas separadas ("Qual taxa você vai informar?"): com o CET, "custo adicional estimado" no lugar de juros e a hipótese da simulação de custo equivalente (antes, a dica pedia o CET e a hipótese dizia que com ele "eles já estão dentro", como se o CET reproduzisse o contrato). Com taxa zero, os centavos passaram a ser distribuídos nas últimas parcelas (antes, a última absorvia a diferença, e em valores pequenos o total passava do preço: R$ 0,05 em 10 vezes mostrava 10 × R$ 0,01). A entrada maior que chegaria ao preço passou a ser citada, e o total com taxa positiva ganhou a hipótese do acerto de centavos.

## 2. Parcelado ou à vista? (e "Cota única ou parcelado?")

**O que responde.** Quanto o parcelado custa a mais (ou a menos) que o preço à vista e qual é a taxa de juros que está embutida nas parcelas.

**O que a pessoa informa.** Preço à vista (ou valor da cota única); número de parcelas (2 a 480; na cota única, 2 a 12); valor de cada parcela; se a primeira parcela é paga na compra (na cota única, se vence junto com a cota).

**Fórmulas.**

- total parcelado = n × parcela
- diferença = total parcelado - preço à vista
- taxa embutida: a taxa ao mês i que faz as parcelas valerem hoje o preço à vista, pela tabela Price: preço à vista = parcela × (1 - (1 + i)^-n) ÷ i. Essa equação não tem fórmula direta; a taxa é achada por tentativas sucessivas (bisseção): o limite de cima começa em 100% ao mês e dobra até passar da raiz, e a busca vai até a precisão do ponto flutuante
- primeira parcela na compra: financiado = preço à vista - parcela, em n - 1 parcelas
- taxa ao ano = (1 + i)^12 - 1, com a taxa ao mês completa, antes do arredondamento da tela
- total igual ao preço à vista: taxa de 0% ao mês ("Parcelar só adia os pagamentos, sem custo a mais em reais.")
- total menor que o preço à vista: "O total parcelado é R$ X menor que o preço à vista." e "Não há juros positivos nas parcelas." (a taxa seria negativa e não é mostrada)
- primeira parcela na compra igual ou maior que o preço à vista: nenhuma taxa não negativa finita iguala as parcelas ao preço; a busca nem começa e a tela diz isso

**Convenções.** Taxa mostrada com 2 casas; uma taxa positiva que arredondaria para 0,00% aparece como "menos de 0,01%"; acima de 10.000% (ao mês ou ao ano), "mais de 10.000%".

**Limitação.** A calculadora responde ao custo nominal das parcelas: a diferença e a taxa embutida não dizem, sozinhas, qual forma é mais vantajosa. Ela não considera o rendimento do dinheiro enquanto as parcelas não vencem, tributos, parcelas reajustadas nem datas irregulares (a hipótese diz que a taxa é calculada só com estes números).

**Exemplo (conferido nos testes).** R$ 1.080,00 à vista ou 10 × R$ 120,00, primeira em 1 mês: o parcelado custa R$ 120,00 a mais, com juros embutidos de 1,96% ao mês (26,27% ao ano; com os 1,96% arredondados daria 26,23%). Com a primeira na compra (R$ 960,00 financiados em 9 parcelas): 2,42% ao mês (33,28% ao ano). 10 × R$ 108,00: igual ao preço, 0% ao mês. 10 × R$ 100,00: "O total parcelado é R$ 80,00 menor que o preço à vista." R$ 1.000,00 à vista e 2 × R$ 999,99 com a primeira na compra: financia R$ 0,01 numa parcela de R$ 999,99, taxa de 9.999.800% ao mês, mostrada como "mais de 10.000%".

**O que mudou nesta revisão.** Total igual ao preço passou a dar 0% ao mês; total menor passou a dizer quanto é menor, no lugar de "Não há juros embutidos"; a frase da primeira parcela que cobre o preço diz que nenhuma taxa de juros iguala as parcelas ao preço.

## 3. Quanto custa por ano?

**O que responde.** Quanto um gasto que se repete soma por ano, por mês e, em média, por dia corrido.

**O que a pessoa informa.** O valor e a frequência: por dia útil, por semana ou por mês.

**Fórmulas.**

- por dia útil: por mês = valor × 22; por ano = por mês × 12 (264 dias úteis por ano); sem média por dia, para não confundir com o valor digitado
- por semana: por ano = valor × 52 (364 dias); por mês = por ano ÷ 12
- por mês: por ano = valor × 12
- média por dia corrido (na semana e no mês) = por ano ÷ 365

**Convenções.** São médias convencionais, não o calendário: 22 dias úteis por mês, sem feriados; 52 semanas por ano, sem as semanas incompletas; 365 dias por ano. Divisões arredondadas metade para cima. O total do ano é a referência: na semana, 12 vezes o valor por mês arredondado pode diferir do ano em alguns centavos, e a hipótese diz isso. A média por dia corrido não é o gasto de um dia de consumo.

**Exemplo (conferido nos testes).** R$ 25,00 por semana: R$ 1.300,00 por ano, R$ 108,33 por mês (1.300,00 ÷ 12; 12 × 108,33 = 1.299,96) e média de R$ 3,56 por dia corrido (1.300,00 ÷ 365 = 3,5616). R$ 130,60 por mês: R$ 1.567,20 por ano e R$ 4,29 por dia corrido. R$ 18,00 por dia útil: R$ 396,00 por mês e R$ 4.752,00 por ano.

**O que mudou nesta revisão.** "Por dia" virou "Média por dia corrido"; as hipóteses dizem 264 dias úteis e 364 dias nas 52 semanas, e que o total do ano é a referência.

## 4. Quanto custa uma dívida?

**O que responde.** Quanto uma dívida cresce com os juros, conforme o tipo.

**O que a pessoa informa.** O tipo (rotativo do cartão, cheque especial, empréstimo ou outra dívida); o valor; a taxa de juros ao mês (0,01% a 99,99%; a dica pede a taxa de juros, não o CET); no cheque especial, por quantos meses (1 a 24); no empréstimo, o número de parcelas (1 a 120); no rotativo, opcionalmente a taxa e as parcelas de "E se parcelar a fatura?" (1 a 24).

**Fórmulas.**

- rotativo (1 ciclo, até a fatura seguinte): juros = valor × i; valor na fatura seguinte = valor + juros
- parcelar a fatura: parcela pela tabela Price sobre o valor da fatura seguinte; total = n × parcela; juros e encargos = total - valor original. Pela Lei 14.690/2023 e pela Res. CMN 5.112/2023, juros e encargos do rotativo e do parcelamento somados não passam do valor original: teto = 2 × valor original (o IOF fica fora). Quando o total passaria do teto, a conta mostra as parcelas iguais que cabem nele: parcela com o limite = teto ÷ n, para baixo no centavo; total com o limite = n × essa parcela, que nunca passa do teto
- cheque especial: total = valor × (1 + i)^meses (juros compostos, sem pagamentos no período); acima de 8% ao mês, o aviso do teto da Res. CMN 4.765/2019, que vale para o cheque especial de pessoas físicas e MEI; a taxa acima do teto é mostrada como simulação fora dessa regra, sem dizer que a cobrança vale
- empréstimo: parcela pela tabela Price; total = n × parcela; juros = total - valor
- em todos: a taxa ao ano equivalente, (1 + i)^12 - 1

**Convenções.** Contas exatas em inteiros, arredondadas metade para cima só no fim. Sem IOF, multa e tarifas (dito nas hipóteses e no aviso sobre o CET, que pode deixar o custo real maior).

**Limitações.** O parcelamento da fatura é um cenário novo, a partir desta fatura: numa dívida que já vem de antes, os juros e encargos já cobrados (e migrações ou renegociações) também entram no limite, e a conta não sabe deles. Com o limite aplicado, a conta supõe parcelas iguais reduzidas até caber no teto; a instituição pode aplicar o limite de outro jeito (no valor ou no número das parcelas), e vale o que está no contrato.

**Exemplo (conferido nos testes).** Cheque especial de R$ 1.000,00 a 8% ao mês por 3 meses: 1.000 × 1,08^3 = R$ 1.259,71, com R$ 259,71 de juros (151,82% ao ano). Empréstimo de R$ 5.000,00 a 2% em 12 parcelas: R$ 472,80 por mês, R$ 5.673,60 no total. Rotativo de R$ 700,00 a 14%: R$ 98,00 de juros e R$ 798,00 na fatura seguinte; parcelar esses R$ 798,00 em 24 × a 8% daria 24 × R$ 75,79 = R$ 1.818,96, acima do teto de R$ 1.400,00: com o limite, 24 parcelas de até R$ 58,33 (140.000 ÷ 24 = 5.833,3, para baixo), R$ 1.399,92 no total; em 12 × R$ 105,89, R$ 1.270,68, dentro do limite.

**O que mudou nesta revisão.** O teto do parcelamento passou a fechar o fluxo inteiro (antes, a tela mostrava 24 × R$ 75,79 e um total de R$ 1.400,00, que não podem coexistir); as hipóteses dizem que é um cenário novo e como o limite foi aplicado. O aviso do cheque especial diz que o teto é de pessoas físicas e MEI e trata a taxa acima dele como cenário fora da regra. "O custo real tende a ser um pouco maior" virou "pode ser maior".

## 5. Quitar antes ou adiantar parcelas

**O que responde.** Uma estimativa de quanto pagar hoje para quitar as parcelas a vencer (ou adiantar as últimas) e quanto de juros sai da conta.

**O que a pessoa informa.** Valor da parcela; quantas faltam (1 a 480); a taxa efetiva de juros ao mês do contrato (0% a 99,99%; a dica diz que não é o CET); "Quitar tudo" ou "Adiantar as últimas" (quantas). Aberta a partir de um parcelamento, a conta recebe também os dias até cada vencimento; as parcelas já vencidas (pela regra do próximo dia útil, D-061) vêm com dias negativos.

**Fórmulas.**

- valor para pagar hoje = soma de parcela ÷ (1 + i)^t, para cada parcela a vencer escolhida; t = 1, 2, 3... meses (a próxima em 1 mês). Ao adiantar as últimas N, entram as de t = faltam - N + 1 até faltam
- com os vencimentos: t = dias até o vencimento ÷ 30; vencendo hoje, t = 0 (sem desconto)
- parcelas vencidas: ficam fora do valor presente, sem desconto e sem multa e juros calculados; aparecem à parte ("Fora desta conta: 1 parcela vencida (R$ 850,00, sem multa e juros). A instituição soma os encargos delas; por isso, este valor não é a quitação completa.")
- soma das parcelas = parcela × quantidade a vencer
- desconto estimado = soma - valor para pagar hoje; taxa 0%: desconto zero

**Convenções.** Juros compostos pela taxa efetiva do contrato (a regra do CDC, art. 52, § 2º, é a redução proporcional dos juros). Arredondamento metade para cima, só no fim. Sempre com "Estimativa. O valor oficial é o que a instituição informar; peça o valor atualizado."

**Limitações ditas na tela.** Parcelas e taxa fixas, sem tarifas e IOF: em contratos pela tabela SAC, corrigidos por índice (como IPCA ou TR), com seguros variáveis ou parcelas diferentes, o valor da instituição pode ser bem diferente. Os 30 dias por mês são uma convenção. Adiantar as últimas encurta o prazo: as parcelas que continuam ficam com o mesmo valor, e reduzir o valor da parcela em vez do prazo depende do contrato.

**Exemplo (conferido nos testes).** 36 × R$ 850,00 a 1,5% ao mês: soma R$ 30.600,00; valor estimado para quitar hoje R$ 23.511,58; desconto estimado R$ 7.088,42. Adiantar as 3 últimas: R$ 1.514,47 em vez de R$ 2.550,00. Duas parcelas, uma vencida há 10 dias e outra em 20 dias: só a de 20 dias entra, 850,00 ÷ 1,015^(20 ÷ 30) = R$ 841,60, desconto de R$ 8,40, e a vencida aparece à parte.

**O que mudou nesta revisão.** A dica pede a taxa efetiva do contrato, não o CET; a taxa 0% passou a ser aceita (desconto zero); as parcelas vencidas saíram do valor presente (antes contavam como "hoje" e o total aparecia como quitação completa) e aparecem à parte; as hipóteses ganharam SAC, índice, parcelas diferentes, a convenção dos 30 dias e o efeito de adiantar as últimas.

## 6. Multa e juros por atraso

**O que responde.** Quanto fica uma conta, um boleto ou a fatura do cartão depois do vencimento.

**O que a pessoa informa.** Conta ou boleto: valor, multa (0% a 20%), juros ao mês (0% a 99,99%) e dias depois do vencimento (1 a 3.650). Fatura do cartão: valor que ficou sem pagar, juros do rotativo ao mês, juros de mora ao mês (0% a 20%), multa e dias.

**Fórmulas.**

- multa = valor × multa (cobrada uma vez)
- juros = valor × juros ao mês × dias ÷ 30 (juros simples, proporcionais aos dias)
- conta: total = valor + multa + juros
- fatura: só o primeiro ciclo do rotativo, até a próxima fatura: dias da conta = o menor entre os dias informados e 30. Rotativo e mora pela mesma conta dos juros; teto da Lei 14.690/2023 e da Res. CMN 5.112/2023: rotativo + mora + multa não passam do valor sem pagar (quando passam, a multa fica e os juros são reduzidos na mesma proporção); IOF estimado = valor × (0,38% + 0,0082% × dias), fora do teto; total = valor + rotativo + mora + multa + IOF

**Convenções.** 30 dias por mês. Cada parcela da conta arredondada metade para cima.

**Hipóteses e limitações ditas na tela.**

- Fatura: o rotativo só vale até a próxima fatura (Res. CMN 4.549/2017). Com mais de 30 dias, a conta para no primeiro ciclo e diz: "Você informou 365 dias. O rotativo só vale até a próxima fatura: depois, o que falta passa para o parcelamento ou outra modalidade, com outra taxa e outros pagamentos, e a conta não projeta esse período." Parcelamento, atraso de parcelamento e renegociação ficam de fora.
- A instituição pode capitalizar os juros e usar outras datas e outra taxa: o valor dela pode ser diferente desta estimativa (a frase antiga "a fatura pode vir um pouco maior" saiu, porque a diferença não é necessariamente pequena).
- IOF: é uma hipótese simplificada, com o valor parado e sem pagamentos. Não é o valor legal (o Decreto 6.306/2007 distingue principal definido e saldo devedor diário), e o IOF pode já estar na fatura; nesse caso, não se soma de novo.
- Multa acima de 2%: em relações de consumo abrangidas pelo Código de Defesa do Consumidor (art. 52, § 1º), a multa é limitada a 2%; outras obrigações, como aluguel e tributos, têm regras próprias. A conta usa o valor informado e diz isso, sem dizer se a cobrança vale. Na fatura do cartão, uma relação de consumo, o aviso diz que o limite é 2%.
- Conta ou boleto: sem correção monetária nem regras próprias, como as de tributos e de alguns contratos.

**Exemplo (conferido nos testes).** Conta de R$ 200,00, multa de 2%, juros de 1% ao mês, 10 dias: multa R$ 4,00; juros 200 × 0,01 × 10 ÷ 30 = R$ 0,67; total R$ 204,67. Fatura com R$ 1.000,00 sem pagar, rotativo de 15%, mora de 1%, multa de 2%, 30 dias: rotativo R$ 150,00, mora R$ 10,00, multa R$ 20,00 e IOF estimado R$ 6,26 (1.000 × (0,38% + 0,0082% × 30)); total R$ 1.186,26. Com 365 dias, o mesmo R$ 1.186,26 (até a próxima fatura), com o aviso. Com 99% de rotativo e 30 dias, juros e multa param no teto: rotativo R$ 970,20, mora R$ 9,80, multa R$ 20,00 (somam R$ 1.000,00) e IOF R$ 6,26, total R$ 2.006,26.

**O que mudou nesta revisão.** A fatura passou a ir só até a próxima fatura (antes, 365 dias aplicavam o mesmo rotativo o ano todo, com o exemplo de R$ 2.033,73); o IOF virou hipótese simplificada declarada; saiu "a fatura pode vir um pouco maior"; multa acima de 2% ganhou o aviso das relações de consumo; a conta ou boleto ganhou a hipótese da correção monetária.

## 7. Em que ordem quitar as dívidas?

**O que responde.** Um plano para quitar várias dívidas: com o dinheiro que a pessoa já paga e um valor a mais por mês (opcional), em quanto tempo tudo termina e quanto de juros sai da conta, em duas ordens lado a lado, com o plano passo a passo de cada uma. A calculadora mostra as duas ordens como fatos e não diz qual escolher.

**O que a pessoa informa.** De 1 a 10 dívidas, cada uma com um apelido opcional e o tipo:

- parcelada: valor da parcela (o que já paga por mês), parcelas que faltam (1 a 480) e a taxa ao mês do contrato (opcional, 0% a 99,99%; em branco, conta só as parcelas);
- saldo com juros: saldo de hoje, taxa ao mês (0,01% a 99,99%) e quanto paga por mês.

E, opcional, quanto a mais por mês consegue pôr nas dívidas.

**As duas ordens.** "Maior taxa primeiro": o que sobra vai antes para a dívida com a maior taxa ao mês (empate: a de menor saldo, depois a ordem da lista). "Menor dívida primeiro": vai antes para a dívida com o menor saldo hoje (empate: a de maior taxa, depois a ordem da lista).

**Fórmulas (mês a mês).**

- pagamentos no fim de cada mês, a partir do mês seguinte
- dívida com saldo: juros do mês = saldo × i, no centavo; pagamento = o informado, limitado a saldo + juros; saldo novo = saldo + juros - pagamento
- dívida parcelada: o saldo inicial é o valor presente das parcelas que faltam, soma de parcela ÷ (1 + i)^t, t = 1 até o número de parcelas (sem taxa, a soma das parcelas). Ela segue a tabela do contrato: a parcela é sempre a do contrato e, depois de k parcelas, o saldo é o valor presente das que restam. O valor a mais aplicado nela cresce pela taxa do contrato e abate o saldo; a dívida acaba quando ele cobre o valor presente do que falta
- com o plano (nas duas ordens): total do mês = valor a mais + todos os pagamentos de sempre. Cada dívida aberta recebe o seu pagamento de sempre; o que sobra (o valor a mais e os pagamentos das dívidas que já acabaram) vai para a primeira dívida aberta da ordem, e o que sobrar dela passa para a seguinte no mesmo mês
- referência "Pagamentos atuais, sem repasse": cada dívida só com o pagamento de sempre, sem o valor a mais e sem passar adiante o pagamento das que acabam (com uma dívida só, "Sem valor a mais")
- com valor a mais e duas ou mais dívidas, cada ordem diz também o ganho só do repasse: a mesma ordem, os mesmos pagamentos passados adiante, sem o valor a mais. Assim a tela separa o efeito do valor a mais do efeito do repasse
- juros estimados = total pago - soma dos saldos iniciais
- ganho = meses e juros a menos em relação à referência; quando a referência não termina em 50 anos, nenhum ganho em reais é calculado ("Com os pagamentos atuais, sem repasse, as dívidas não terminariam em 50 anos.")
- dívida com saldo cujo pagamento não passa dos juros do primeiro mês: "Com este pagamento, o saldo não diminui." junto do campo e uma nota no resultado; ela continua no plano, porque o valor a mais ou o pagamento de uma dívida que acaba pode amortizá-la
- parcelada sem taxa: a conta usa só as parcelas, como se não houvesse juros, e a nota diz que o saldo real, os juros estimados e o lugar dela em "Maior taxa primeiro" ficam incertos (sem taxa não é taxa zero); as diferenças entre as ordens valem só com essa hipótese
- mais de 600 meses (50 anos): "as dívidas não terminam em 50 anos"; uma dívida que passaria de R$ 10 trilhões também (a conta para antes do limite numérico)

**Convenção do centavo e trilha mês a mês.** Juros de cada mês no centavo, metade para cima, em inteiros exatos. O saldo de uma parcelada segue a tabela do contrato, com cada valor presente arredondado uma vez a partir do valor exato; os juros do mês são o que fecha a conta (saldo depois + pagamento - saldo antes), e por isso diferem do exato em cerca de 1 centavo, sem efeito acumulado. O valor a mais aplicado numa parcelada cresce pela taxa do contrato, com os juros do mês metade para cima; o saldo líquido (tabela menos o aplicado) é o saldo anterior × (1 + i) menos os pagamentos, a menos de centavos: é um recurso de cálculo, equivalente a amortizar o saldo, não um rendimento à parte. A função `planoTrail` do núcleo dá, para cada mês e cada dívida aberta, saldo inicial, juros, pagamento de sempre, valor a mais, saldo final e o que sobrou sem uso no mês; em cada linha, saldo final = saldo inicial + juros - pagamento - valor a mais, exatamente. Esta é a convenção do app; a revisão externa mostrou que outras convenções (juros arredondados mês a mês sobre a tabela, ou a tabela teórica em alta precisão) mudam o último centavo de exemplos como os R$ 491,87 e R$ 545,86 abaixo.

**Hipóteses ditas na tela.** "Estimativa. O valor oficial de cada dívida é o que a instituição informar; peça o valor atualizado." Sem IOF nem tarifas, taxas fixas, sem compras novas nem atrasos; pagamentos no fim do mês; como as duas ordens funcionam; com o que o ganho é comparado (e que, com valor a mais, ele junta os dois efeitos); a convenção do centavo.

**Como o resultado aparece (nesta ordem).**

1. A resposta em uma frase, com o ganho em meses e em juros estimados. Exemplo: "Com R$ 100,00 a mais por mês, tudo termina em 24 meses (outubro de 2028), em vez de 36 meses (outubro de 2029), com R$ 2.209,96 a R$ 2.216,64 a menos de juros estimados, conforme a ordem."
2. As duas ordens lado a lado: por qual dívida começa, a primeira a acabar, quando tudo termina e os juros estimados; e as diferenças como fatos.
3. O plano passo a passo de cada ordem e o ganho estimado da ordem, com a frase do ganho só do repasse.
4. O aviso de estimativa, as notas (taxa em branco, saldo que não diminui sozinho), as hipóteses e os detalhes de cada ordem.

**Exemplo conferido à mão (e nos testes).** Dívida A: R$ 1.000,00 a 10% ao mês, pagando R$ 600,00. Dívida B: R$ 500,00 a 5% ao mês, pagando R$ 300,00. Valor a mais: R$ 100,00 (total do mês R$ 1.000,00).

- Pagamentos atuais, sem repasse: A tem juros de R$ 100,00 no mês 1 (saldo 1.100,00 - 600,00 = 500,00) e de R$ 50,00 no mês 2, quando é paga (R$ 550,00). B tem juros de R$ 25,00 (saldo 225,00) e de R$ 11,25, paga no mês 2 (R$ 236,25). Total pago R$ 1.686,25, juros R$ 186,25.
- Maior taxa primeiro (A recebe o que sobra): mês 1, A fica com 500,00 - 100,00 = 400,00; mês 2, A paga 440,00 e B 236,25. Total pago R$ 1.676,25, juros R$ 176,25.
- Menor dívida primeiro (B recebe o que sobra): mês 1, B fica com 225,00 - 100,00 = 125,00; mês 2, A paga 550,00 e B 131,25. Total pago R$ 1.681,25, juros R$ 181,25.

**Exemplo da dívida que não diminui sozinha (T09).** Saldo de R$ 1.000,00 a 10% ao mês, pagando R$ 80,00, com R$ 50,00 a mais: os juros do primeiro mês são R$ 100,00, e com R$ 130,00 no mês o saldo cai para 1.000,00 + 100,00 - 80,00 - 50,00 = R$ 970,00. A dívida fica no plano; a referência (só os R$ 80,00) não termina, e a frase diz isso.

**Exemplo do ganho só do repasse.** R$ 2.000,00 a 2% pagando R$ 60,00 e R$ 4.000,00 a 5% pagando R$ 300,00, com R$ 200,00 a mais: na referência, tudo termina em 56 meses, com R$ 4.085,82 de juros. Maior taxa primeiro: 14 meses e R$ 1.712,26 (ganho de 42 meses e R$ 2.373,56). Só passando adiante os pagamentos, sem o valor a mais: 27 meses e R$ 3.621,81 (ganho de 29 meses e R$ 464,01).

**Exemplo com duas parceladas (o caso do teste de 09/11/2026, com valor a mais; conferido nos testes).** Acordo: 9 parcelas de R$ 265,00 a 1% ao mês. Empréstimo: 60 parcelas de R$ 100,00 a 1,88% ao mês. Com R$ 300,00 a mais por mês, a partir de 09/11/2026: "Com R$ 300,00 a mais por mês, tudo termina em 10 meses (setembro de 2027), em vez de 60 meses (novembro de 2031), com R$ 1.989,83 a R$ 2.043,82 a menos de juros estimados, conforme a ordem." Maior taxa primeiro começa pelo Empréstimo, o Acordo acaba em agosto de 2027 e os juros estimados são R$ 491,87; Menor dívida primeiro começa pelo Acordo, que acaba em abril de 2027, e os juros estimados são R$ 545,86. Sem valor a mais, as duas ordens dão no mesmo, e o ganho é dito como do repasse: "Ganho estimado, só por passar adiante os pagamentos das dívidas que acabam, sem dinheiro a mais: 41 meses antes e R$ 1.495,19 a menos de juros."

**O que mudou nesta revisão.** A dívida cujo pagamento não passa dos juros deixou de sair da comparação (antes, "fica fora da comparação"); a parcelada sem taxa ganhou o aviso de incerteza; a referência passou a se chamar "Pagamentos atuais, sem repasse", e com valor a mais cada ordem diz o ganho só do repasse; a convenção do centavo foi escrita e a trilha mês a mês (`planoTrail`) foi criada, com a conservação conferida linha a linha nos testes.

## 8. Quanto guardar para imprevistos? (reserva)

**O que responde.** De quanto é a reserva para cobrir alguns meses de gastos essenciais, quanto do que já está guardado cobre e em quanto tempo ela fica completa.

**O que a pessoa informa.** Gastos essenciais por mês (maior que zero); quantos meses cobrir (1 a 24); quanto já tem guardado (opcional, zero ou mais); quanto guarda por mês (opcional).

**Fórmulas.**

- reserva = gastos essenciais × meses
- meses cobertos = já guardado ÷ gastos essenciais, em décimos de mês, para baixo
- falta = máximo(reserva - já guardado, 0)
- falta 0: "O que você já guardou cobre a reserva" e prazo 0
- prazo = falta ÷ por mês, em meses inteiros, para cima; com R$ 0,00 por mês e algo faltando, não há divisão: "Guardando R$ 0,00 por mês, não há previsão para completar a reserva."

**Convenções e limitações.** Sem rendimento e sem inflação. O mesmo valor guardado todo mês e gastos essenciais iguais em todos os meses: em prazos longos, os gastos mudam, e a cobertura futura é uma estimativa. Meses cobertos para baixo; prazo para cima (no último mês, falta menos que o valor de cada mês). Os limites de 24 meses e das escolhas da tela são decisões de interface, não limites da conta.

**Exemplo (conferido nos testes).** Gastos essenciais de R$ 3.750,00 e 6 meses: reserva de R$ 22.500,00. Com R$ 4.500,00 guardados: cobre 1,2 mês (4.500 ÷ 3.750 = 1,2) e faltam R$ 18.000,00. Guardando R$ 500,00 por mês: 18.000 ÷ 500 = 36 meses (3 anos). Guardando R$ 700,00 por mês: 18.000 ÷ 700 = 25,7, ou seja 26 meses.

**O que mudou nesta revisão.** Reserva completa passou a ter prazo 0 (antes, sem prazo); com algo faltando e R$ 0,00 por mês, a frase diz que não há previsão.

## 9. Juntar para um objetivo

**O que responde.** Quanto guardar por mês para chegar a um valor num prazo, ou em quanto tempo se chega guardando um valor por mês. É a conta simples, sem rendimento e sem inflação; o botão "Simular com rendimento" leva os mesmos números ao simulador (item 11), com a meta, o valor já guardado, o modo e o prazo ou o valor por mês, sem a taxa.

**O que a pessoa informa.** Quanto quer juntar; quanto já tem (opcional); e "Quanto guardar por mês" (com o prazo, de 1 a 600 meses) ou "Em quanto tempo" (com o valor por mês, maior que zero).

**Fórmulas.**

- falta = máximo(quanto quer juntar - quanto já tem, 0)
- falta 0: "meta atingida", R$ 0,00 por mês e prazo 0 (nunca valor ou prazo negativo)
- por mês = falta ÷ meses, para cima no centavo
- prazo = falta ÷ por mês, em meses inteiros, para cima (o campo do valor por mês recusa zero, então não há divisão por zero)

**Convenções.** Sem rendimento e sem inflação (o valor que a pessoa quer juntar fica o mesmo até o fim do prazo). Valor por mês para cima (para não faltar). O mesmo valor todo mês; no último mês, falta menos que o valor de cada mês.

**Exemplo (conferido nos testes).** Juntar R$ 22.500,00 em 14 meses, já tendo R$ 4.500,00: falta R$ 18.000,00; por mês, 18.000 ÷ 14 = 1.285,714..., para cima R$ 1.285,72. Guardando R$ 1.000,00 por mês: 18 meses. Juntar R$ 10.000,00 em 60 meses (sem rendimento): R$ 166,67 por mês. Já tendo R$ 11.000,00 para juntar R$ 10.000,00: meta atingida, R$ 0,00 por mês, prazo 0.

**O que mudou nesta revisão.** O documento passou a dizer falta = máximo(..., 0), como o código já fazia; com a meta atingida, o resultado traz R$ 0,00 por mês e prazo 0 (antes, sem valores).

## 10. Dividir as contas da casa

**O que responde.** Quanto cada pessoa da casa põe nas contas, em partes iguais ou pela renda de cada uma.

**O que a pessoa informa.** O total das contas; como dividir; de 2 a 6 pessoas, com apelido opcional e, na divisão pela renda, a renda de cada uma (zero ou mais, com ao menos uma maior que zero).

**Fórmulas.**

- partes iguais: total ÷ número de pessoas
- pela renda: parte de cada pessoa = total × renda dela ÷ soma das rendas (cada pessoa põe a mesma fração da própria renda: total ÷ soma das rendas); uma renda zero dá parte zero, e a hipótese diz isso
- todas as rendas zero: a proporção não existe, e cada campo pede uma renda maior que zero ou a escolha "Em partes iguais"; renda negativa é recusada na leitura
- percentual de cada parte = parte ÷ total, com uma casa

**Convenções.** Divisão pelo maior resto: cada parte recebe o valor arredondado para baixo, e os centavos que sobram vão para quem tem a maior fração que ficou de fora (em partes iguais, para as primeiras pessoas da lista). Assim a soma das partes sempre fecha com o total. Os percentuais exibidos, cada um com uma casa, podem somar 99,9% ou 100,1%; a hipótese diz isso (os valores em reais não mudam). Total das contas acima da soma das rendas: a conta continua, com o aviso de que a divisão pede mais de 100% da renda de cada pessoa, sem dizer se dá para pagar. Os produtos total × renda são feitos em `BigInt` (dois valores perto de 1 bilhão de centavos chegam a 10^18). Até 6 pessoas é decisão de interface.

**Exemplo (conferido nos testes).** R$ 3.000,00 com rendas de R$ 4.000,00 e R$ 6.000,00: R$ 1.200,00 (40%) e R$ 1.800,00 (60%); cada pessoa põe cerca de 30% da própria renda. R$ 100,00 por 3 pessoas: R$ 33,34, R$ 33,33 e R$ 33,33 (33,3% cada, somando 99,9%). R$ 1.000,00 com rendas de R$ 3.000,00 e R$ 0,00: R$ 1.000,00 e R$ 0,00.

**O que mudou nesta revisão.** Renda zero passou a ser aceita (antes, todo zero era erro); todas zero pedem uma renda ou partes iguais; os percentuais que não somam 100,0% são explicados; contas acima da soma das rendas ganham o aviso.

## 11. Simular um plano (o simulador, aberto por "Simular com rendimento")

**O que responde.** Com uma taxa de rendimento que a pessoa quer testar: quanto guardar por mês para chegar a um valor num prazo, em quanto tempo se chega guardando um valor por mês, ou quanto se pode ter. Opcionalmente, o efeito da inflação. Nada é gravado, e a taxa nunca é sugerida.

**O que a pessoa informa.** O que quer saber; quanto quer juntar (nos dois primeiros modos); quanto já tem (opcional); em quantos meses (1 a 600) ou quanto vai guardar por mês (maior que zero em "Em quanto tempo"; em "Quanto posso ter", zero só com algo já guardado); a taxa de rendimento ao ano (0% a 30%, sempre digitada); e a inflação (opcional), com três escolhas:

- "Sem inflação";
- "Mostrar em dinheiro de hoje": só informa; a meta e o valor por mês não mudam, e o resultado diz quanto o total vale em dinheiro de hoje;
- "Corrigir a meta pela inflação" (só quando há meta): para manter o poder de compra, a meta sobe com a inflação até o fim do prazo, e o valor por mês (ou o prazo) é recalculado.

Mais a inflação ao ano (0% a 30%).

**Fórmulas.**

- taxa ao mês: i = (1 + taxa ao ano)^(1/12) - 1 (taxa equivalente, completa)
- inflação ao mês: π = (1 + inflação ao ano)^(1/12) - 1
- valor no fim de n meses, com os aportes no começo de cada mês (a convenção da "Aplicação com depósitos regulares" da Calculadora do Cidadão do Banco Central): final = inicial × (1 + i)^n + aporte × (1 + i) × ((1 + i)^n - 1) ÷ i; com taxa 0%, final = inicial + aporte × n
- valor já guardado que cumpre a meta da conta: prazo 0 e R$ 0,00 por mês, antes de qualquer busca. Em "Quanto guardar por mês" com "Corrigir a meta", a meta da conta é a corrigida até o fim do prazo (quem já tem a meta de hoje pode precisar guardar para acompanhar a inflação); em "Em quanto tempo", no mês 0 a meta corrigida é a de hoje
- quanto guardar por mês: o menor valor, em centavos, cujo final alcança a meta (o valor A alcança; A - R$ 0,01 não, quando A é maior que zero)
- em quanto tempo: os meses de 1 a 600 são examinados em ordem, e a resposta é o primeiro que alcança a meta; se nenhum alcança em 50 anos, a tela diz isso. Com tudo zero e meta positiva, o campo do valor por mês recusa zero, e a conta, chamada sozinha, responde "não alcança" sem travar
- em dinheiro de hoje = final mostrado ÷ (1 + π)^n, para baixo
- meta corrigida pela inflação = meta × (1 + π)^n, no centavo mais próximo (é o mesmo que meta × (1 + inflação ao ano)^(n ÷ 12)); em "Em quanto tempo", a meta corrigida é a do próprio mês: o primeiro n em que o final alcança meta × (1 + π)^n
- sem rendimento (o número ao lado): a mesma conta com taxa 0%

**O prazo com meta corrigida pode não ser monotônico.** Com inflação acima do rendimento e aportes fixos, a condição "final alcança a meta corrigida" pode ficar verdadeira e depois voltar a falsa. Contraprova da revisão externa: meta de R$ 10.000,00 de hoje, sem saldo inicial, R$ 1.000,00 por mês, sem rendimento e 30% de inflação ao ano. No mês 13, R$ 13.000,00 não bastam (a meta corrigida é cerca de R$ 13.287); no mês 14, R$ 14.000,00 bastam (cerca de R$ 13.581); no mês 120, R$ 120.000,00 já são menores que a meta corrigida de cerca de R$ 137,9 mil, e no mês 600 também não bastam. Por isso o código examina os meses em ordem e para no primeiro alcance (resposta: 14 meses), sem bisseção e sem olhar o mês 600 para decidir se houve alcance antes.

**Convenções.** Taxa mensal equivalente (não a taxa ao ano dividida por 12), sempre a completa. Aportes no começo de cada mês (o aporte do mês já rende no mês). Valor por mês para cima e valores finais para baixo, no centavo, encadeados a partir do valor mostrado (veja a política de arredondamento). Valores brutos, sem imposto de renda, IOF ou taxas. Tudo isso aparece nas hipóteses da tela.

**Exemplo da revisão de 17/11/2026 (conferido nos testes e, à parte, com 40 dígitos de precisão).** Juntar R$ 10.000,00 em 60 meses com 3,4% ao ano (cerca de 0,28% ao mês) e inflação de 12% ao ano (cerca de 0,95% ao mês).

- Fator dos aportes no começo do mês: (1 + i) × ((1 + i)^60 - 1) ÷ i = 65,3978. Por mês: 10.000,00 ÷ 65,3978 = 152,9104, para cima R$ 152,92 (com os aportes no fim do mês seriam R$ 153,34, outra convenção). Total no fim: R$ 10.000,63. Sem rendimento: 10.000,00 ÷ 60 = R$ 166,67.
- "Mostrar em dinheiro de hoje": 10.000,63 ÷ 1,12^5 = 10.000,63 ÷ 1,762342 = R$ 5.674,62. A tela diz: "Em dinheiro de hoje, com inflação de 12% ao ano, o total de R$ 10.000,63 equivale a R$ 5.674,62." e "Para manter o poder de compra de R$ 10.000,00, escolha "Corrigir a meta pela inflação"."
- "Corrigir a meta pela inflação": meta corrigida = 10.000,00 × 1,12^5 = 17.623,4168, no centavo R$ 17.623,42. Por mês: 17.623,42 ÷ 65,3978 = 269,4803, para cima R$ 269,49. Sem rendimento: 17.623,42 ÷ 60 = R$ 293,73. Total no fim: R$ 17.624,05, que equivale a R$ 10.000,35 de hoje. "Criar meta com estes valores" leva a meta corrigida (R$ 17.623,42), o prazo (mês de hoje + 59 meses) e os R$ 269,49 por mês.

**Outros exemplos (conferidos nos testes, com 10% ao ano).** Juntar R$ 22.500,00 em 14 meses com R$ 4.500,00 iniciais: R$ 1.175,15 por mês (sem rendimento, R$ 1.285,72). Com R$ 1.000,00 por mês: 17 meses (sem rendimento, 18). Quanto posso ter com R$ 1.000,00 por mês, 14 meses e R$ 4.500,00 iniciais: R$ 19.896,17 (aportado R$ 18.500,00). R$ 500,00 por mês por 120 meses: R$ 100.728,79; com inflação de 4,5% ao ano, equivale a R$ 64.862,05 de hoje (a partir do total mostrado; veja a política de arredondamento). Com a taxa arredondada da tela (0,80% ao mês) o total seria outro: a conta usa a taxa completa.

**O que mudou nesta revisão.** O valor já guardado que cumpre a meta passou a dar prazo 0 e R$ 0,00 por mês (antes, sem valores), e em "Quanto guardar por mês" com a meta corrigida a comparação é com a meta corrigida; o documento passou a dizer "aproximadamente" para 1,0080^12, a explicar por que o prazo com meta corrigida é procurado em ordem e a escrever a política do centavo.

## Revisão externa de 18/11/2026

A revisão externa "Avaliação das calculadoras" (18/11/2026) leu a versão de 17/11/2026 deste documento, sem acesso ao código. Cada ponto foi conferido no código (`packages/core/src/calculators/` e `packages/core/src/simulate.ts`) e terminou como **corrigido** (o código mudou, com teste), **já tratado** (o código já fazia; agora há um teste que prova) ou **limitação declarada** (a hipótese aparece na tela e neste documento). Os testes citados ficam em `packages/core/test/`; "revisao-externa" é `revisao-externa-18-11.test.ts`.

| Calculadora | Ponto da revisão | Resultado | Teste |
|---|---|---|---|
| Antes de financiar | CET não é troca direta da taxa de juros | Corrigido: escolha "Taxa de juros" ou "CET ao mês"; com o CET, simulação de custo equivalente e "custo adicional estimado" | revisao-externa T04; calc-antes-de-financiar "CET ao mês: simulação de custo equivalente" |
| Antes de financiar | Centavos e última parcela com taxa zero (R$ 100,00 em 3; R$ 0,02 em 4) | Corrigido: centavos distribuídos nas últimas parcelas, total exato, nenhuma negativa | revisao-externa T02 e T03; calc-antes-de-financiar "taxa zero" (dois testes) e a conferência com o gerador Python |
| Antes de financiar | Total com taxa positiva é a multiplicação da parcela arredondada | Limitação declarada (hipótese do acerto de centavos na última) | calc-antes-de-financiar "R$ 1.000,00 financiado em 12 ×" |
| Antes de financiar | Entrada igual ao preço | Já tratado (financiamento zero) | revisao-externa T01 |
| Antes de financiar | Entradas de +10% e +20% limitadas ao preço | Já tratado (nunca passavam do preço); a que chegaria ao preço passou a ser citada | calc-antes-de-financiar "soma à entrada que a pessoa já informou" |
| Antes de financiar | Renda zero não divide | Já tratado (o campo recusa zero) | revisao-externa T01 |
| Antes de financiar | Peso na renda não mede capacidade; juntar antes com preço constante; aportes e tempo | Limitação declarada (hipóteses da tela) | calc-antes-de-financiar "juntar antes" |
| Parcelado ou à vista | Total igual ao preço | Corrigido: 0% ao mês e o adiamento dos pagamentos | calc-parcelado-ou-a-vista "total igual ao preço à vista" |
| Parcelado ou à vista | Total menor que o preço não é "não há juros embutidos" | Corrigido: "O total parcelado é R$ X menor que o preço à vista." | calc-parcelado-ou-a-vista "total menor que o preço à vista" |
| Parcelado ou à vista | Primeira na compra igual ou acima do preço | Já tratado (a busca não começa); frase mais precisa | revisao-externa T05 |
| Parcelado ou à vista | Taxas muito altas | Já tratado (o intervalo da bisseção dobra; a tela mostra "mais de 10.000%") | revisao-externa T05 |
| Parcelado ou à vista | Taxa ao ano com a taxa interna completa | Já tratado | revisao-externa T05 |
| Parcelado ou à vista | Comparação econômica, tributos e datas irregulares | Limitação declarada (custo nominal, hipótese da taxa) | calc-parcelado-ou-a-vista |
| Quanto custa por ano | "Média por dia corrido", 52 semanas e 22 dias úteis explícitos | Corrigido | calc-custo-por-ano (três testes) |
| Quanto custa por ano | Total anual como referência | Corrigido (hipótese quando 12 × mês difere do ano) | calc-custo-por-ano "R$ 25,00 por semana" |
| Quanto custa por ano | Calendário real e quantidade real de ocorrências | Limitação declarada (médias convencionais) | calc-custo-por-ano |
| Quanto custa uma dívida | Teto de 8% do cheque especial é de pessoas físicas e MEI; taxa acima como cenário fora da regra | Corrigido (aviso e hipótese) | calc-custo-da-divida "cheque especial acima de 8% ao mês" |
| Quanto custa uma dívida | Teto do cartão precisa fechar o fluxo (24 × R$ 75,79 contra R$ 1.400,00) | Corrigido: parcelas iguais que cabem no teto, total reconciliado | revisao-externa T06; calc-custo-da-divida "parcelar em 24 × R$ 75,79" |
| Quanto custa uma dívida | Histórico de uma dívida existente (encargos já pagos, migrações) | Limitação declarada (cenário novo, a partir desta fatura) | revisao-externa T06 |
| Multa e juros | Fatura além do primeiro ciclo | Corrigido: a conta para na próxima fatura e diz que não projeta o resto | revisao-externa T07; calc-multa-e-juros "só o primeiro ciclo" |
| Multa e juros | IOF com principal constante não é o valor legal | Limitação declarada (hipótese simplificada; pode já estar na fatura) | revisao-externa T08 |
| Multa e juros | "A fatura pode vir um pouco maior" | Corrigido (frase removida; o mesmo para "tende a ser um pouco maior" do CET) | calc-multa-e-juros; calc-custo-da-divida |
| Multa e juros | Multa até 20% e o limite de 2% do CDC | Corrigido: aviso acima de 2%, sem validar a cobrança nem generalizar | calc-multa-e-juros "faixas" e "IOF da hipótese simplificada" |
| Multa e juros | Boleto com correção monetária ou regras próprias | Limitação declarada (hipótese nova) | calc-multa-e-juros |
| Quitar antes | Pedir a taxa efetiva do contrato, não o CET | Corrigido (dica) | calc-quitar-antes "36 × R$ 850,00" |
| Quitar antes | Taxa zero com desconto zero | Corrigido | calc-quitar-antes "taxa de 0%" |
| Quitar antes | Vencidas separadas, sem desconto fictício nem quitação completa | Corrigido | revisao-externa T12; calc-quitar-antes "parcela vencida"; calc-links "quitar-antes com prazos" |
| Quitar antes | SAC, contratos indexados e parcelas distintas | Limitação declarada (hipótese) | calc-quitar-antes |
| Quitar antes | Adiantar as últimas reduz o prazo, não a parcela | Limitação declarada (hipótese) | calc-quitar-antes "adiantar as 3 últimas" |
| Quitar antes | 30 dias por mês é convenção | Limitação declarada (hipótese) | calc-quitar-antes "com os vencimentos da série" |
| Em que ordem quitar | Não excluir a dívida cujo pagamento não passa dos juros (T09) | Corrigido: fica no plano; a referência que não termina não vira ganho finito | revisao-externa T09; calc-plano-dividas "T09" e "pagamento que não cobre os juros" |
| Em que ordem quitar | Taxa desconhecida não é taxa zero | Corrigido: aviso de incerteza, ordem não apresentada como comprovada | revisao-externa T10 |
| Em que ordem quitar | A comparação mistura valor a mais, repasse e prioridade | Corrigido: referência "Pagamentos atuais, sem repasse" e o ganho só do repasse | revisao-externa T11; calc-plano-dividas "as duas ordens se afastam" |
| Em que ordem quitar | Cronograma e centavos sem convenção nem trilha | Corrigido: convenção escrita e trilha mês a mês (`planoTrail`) | revisao-externa "trilha do plano" |
| Em que ordem quitar | Crédito do valor a mais equivalente ao saldo líquido | Já tratado (demonstrado) | revisao-externa "crédito do valor a mais numa parcelada" |
| Juntar para um objetivo | falta = máximo(meta - já tem, 0) | Já tratado no código; corrigido no documento | revisao-externa T13 |
| Reserva, Juntar, Simulador | Meta já atingida: prazo zero e aporte zero | Corrigido (antes, sem valores) | revisao-externa T13; calc-reserva; calc-juntar-para-objetivo; simulate "inalcançável em 50 anos e valor já alcançado" |
| Reserva, Juntar, Simulador | Aporte zero com algo faltando | Corrigido na reserva (frase sem divisão); já tratado em Juntar e no simulador (o campo recusa zero) | revisao-externa T14 |
| Reserva | Cobertura futura é estimativa; limites de interface | Limitação declarada (hipóteses) | calc-reserva |
| Contas da casa | Renda zero aceita, todas zero pedem renda ou partes iguais, negativas inválidas | Corrigido | revisao-externa T15; calc-dividir-contas "de 2 a 6 pessoas" |
| Contas da casa | Percentuais que somam 99,9% ou 100,1% | Corrigido (explicado na hipótese) | revisao-externa T16 |
| Contas da casa | Mais de 100% da renda | Corrigido (aviso) | revisao-externa T15 |
| Simulador | Prazo com meta corrigida não monotônico (T17) | Já tratado (meses de 1 a 600 em ordem, primeiro alcance) | revisao-externa T17 |
| Simulador | Tudo zero e meta positiva | Já tratado (o campo recusa; a função responde sem travar) | revisao-externa T14 e T19 |
| Simulador | Taxa interna completa, não a da tela | Já tratado | revisao-externa "saldo final do simulador" |
| Simulador | "1,0080^12 = 1,10" | Corrigido no documento ("aproximadamente") | revisao-externa "saldo final do simulador" |
| Simulador | Criar meta depois de corrigir a inflação | Já tratado (meta corrigida, prazo e aporte) | revisao-externa T20 |
| Precisão | Política de arredondamento definida | Corrigido (escrita aqui e no código) | revisao-externa "política do centavo" |
| Precisão | Truncamento intermediário (R$ 64.862,05) | Limitação declarada: é a política de partir do valor mostrado | revisao-externa "política do centavo" |
| Precisão | Estouro do Number do JavaScript | Já tratado (BigInt e avisos de resultado alto); corrigido no plano (dívida que só cresce) | revisao-externa T19 |
| Precisão | Validação compartilhada das entradas | Já tratado | revisao-externa "leitura compartilhada dos campos"; calc-inputs |
| Precisão | Invalidar o resultado antigo ao mudar um campo | Já tratado (calculadoras ao vivo; o simulador limpa o resultado) | teste de telas (`scripts/e2e-web.js`) |
| Testes | Invariantes: conservação, saldo final, menor aporte, primeiro prazo, nada negativo ou não finito | Corrigido (testes novos) | revisao-externa, bloco "invariantes e precisão" e T18 |

**Testes de aceitação da página 11.** T01 a T20 estão em `revisao-externa-18-11.test.ts`, um teste por caso, todos passando: T01 entrada igual ao preço; T02 R$ 100,00 em 3; T03 R$ 0,02 em 4; T04 CET com tarifa no início; T05 primeira parcela igual ou acima do preço; T06 cartão de R$ 700,00 e 24 × 8%; T07 cartão além da fatura seguinte; T08 IOF; T09 dívida que não diminui sozinha; T10 dívida sem taxa; T11 valor a mais zero com repasse; T12 parcela vencida na quitação; T13 guardado acima da meta; T14 meta não atingida e aporte zero; T15 rendas zero; T16 R$ 100,00 por três pessoas; T17 inflação móvel; T18 aporte A e A - R$ 0,01; T19 taxa zero, taxa mínima, 600 meses e extremos; T20 criar meta depois de corrigir a inflação.

## Como conferir

No repositório: `cd packages/core && npx vitest run test/calc-*.test.ts test/simulate.test.ts test/revisao-externa-18-11.test.ts`. Cada exemplo deste documento está num teste com o mesmo número.
