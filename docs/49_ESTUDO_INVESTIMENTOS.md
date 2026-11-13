# Estudo sobre investimentos de pessoas físicas no Brasil e a aba Investir

12/11/2026. Pedido do Enzo: "Levante um estudo profundo sobre Investimentos, possibilidades, o que mais é procurado, como quem utiliza de investimentos trabalha, o que gosta de saber, e tente introduzir o máximo de aparatos para os usuários da Clarevo".

Ponto de partida: a aba Investir de hoje (D-093, `docs/45_INVESTIMENTOS.md`), com cadastro manual, valor de cada dia, rentabilidade dos meses fechados e comparação com o CDI e o IPCA pela função `indices`, só no Pessoal.

**Como ler.** Cada número traz a fonte entre colchetes, listada no fim com link e data. A pesquisa foi feita em 12/11/2026 por busca na web. A rede desta sessão não abriu `www.anbima.com.br` nem `cdn.tesouro.gov.br` (os dois endereços estão fora da lista de acesso do ambiente), então os números da ANBIMA e dos balanços do Tesouro Direto vieram dos trechos devolvidos pela busca e das reportagens que os reproduzem, sem leitura da página inteira. Servem para orientar o produto; antes de citar em peça pública, conferir na página. Itens marcados **[conferir]** têm fontes divergentes ou não foram vistos na norma primária. Nada aqui é parecer jurídico nem tributário.

---

## (a) Resumo para o fundador

1. 36% da população com 16 anos ou mais investe (60,6 milhões de pessoas, dados de 2025), mas a poupança ainda é o produto mais comum e só 12% de quem poupou em 2025 aplicou fora dela [1][4][5].
2. O dinheiro está indo para a renda fixa: pessoas físicas somam R$ 9,1 trilhões aplicados em junho de 2026, o CDB fechou 2025 com R$ 1,33 trilhão, os títulos públicos cresceram 27% no semestre e o Tesouro Direto tem 3,7 milhões de pessoas com título (21% a mais em 12 meses) [9][11][16].
3. O motivo é o juro alto: Selic de 13,75% (Copom de 04/11/2026), poupança perdendo R$ 66 bilhões líquidos de janeiro a setembro e um título novo para reserva, lançado em maio, com aplicação desde R$ 1 e resgate por Pix a qualquer hora [19][21][23].
4. Na tributação, vale a regra de sempre (tabela regressiva e isenções de LCI, LCA, LCD, CRI, CRA, debêntures incentivadas e rendimentos de FII); a MP que unificava tudo em 17,5% caducou em 2025; em 2026 entraram o JCP a 17,5% e a retenção de 10% sobre dividendos acima de R$ 50 mil por mês de uma mesma empresa; IOF sobre os isentos é só estudo do governo [25][26][27][28].
5. Quem investe quer saber: quanto rendeu de verdade (líquido de IR e acima da inflação), comparado ao CDI e à poupança; quando vence e quando pode resgatar; se está coberto pelo FGC; quanto recebeu de proventos; e como declarar.
6. As dores: dinheiro espalhado em várias instituições, imposto difícil de entender, carência e oscilação de preço que assustam, golpes (1 em cada 3 pessoas sofreu tentativa em 2025) e falta de reserva (31% não têm nenhuma) [1][3][4].
7. A aba Investir já resolve o básico, mas não sabe o que é cada investimento: falta o tipo exato, onde está, como rende, quando vence e se tem IR ou FGC.
8. Proposta: ampliar a ficha do investimento e, a partir dela, oferecer alocação, vencimentos, limite do FGC, IR estimado, ganho real, proventos, resumo para a declaração e valor estimado pela taxa contratada, tudo com dados públicos e gratuitos do Banco Central, do Tesouro e da CVM.
9. Fica para depois o que exige contrato ou licença: cotação de ações (licença da B3 ou fornecedor pago), Open Finance (parceiro autorizado, com regras de parceria mais duras desde 22/10/2026) e apuração do imposto de ações [40][41][43].
10. A linha regulatória: mostrar e calcular o que a pessoa registrou, com regras públicas e fonte, pode; sugerir produto, classe, emissor, alocação ou momento de comprar e vender não pode (Resoluções CVM 19, 20 e 30 de 2021) [49][50][51].

---

## (b) Retrato do público investidor no Brasil

### b.1 Quantas pessoas investem e em quê (ANBIMA, Raio X do Investidor Brasileiro, 9ª edição)

Pesquisa ANBIMA com Datafolha, 5.832 entrevistas de 4 a 21/11/2025 nas cinco regiões, pessoas com 16 anos ou mais, divulgada em abril de 2026. Os dados de 2026 saem no começo de 2027 [1][2][6][8].

| Indicador | Número | Fonte |
|---|---|---|
| Pessoas com algum produto financeiro | 36% da população, cerca de 60,6 milhões; 5 pontos acima de 2021 e estável frente a 2024 | [1][8] |
| Poupança | Produto mais usado: 22% da população; entre quem investe, caiu de 75% (2021) para 61% (2025) | [6] |
| Outros produtos (uso na população) | Criptoativos 4%, ações 2%, títulos públicos 2%; títulos privados (CDB, LCI, LCA) em alta | [6] |
| Quem poupou e investiu | Só 12% dos que pouparam em 2025 aplicaram fora da poupança | [5] |
| Por que não poupa | 82% de quem não poupa cita motivo financeiro (falta de dinheiro, gastos, outras prioridades) | [5] |
| Reserva | 31% não têm nenhuma reserva; 15% têm o bastante para 6 a 12 meses | [4][5] |
| Motivo para investir | Retorno (37%) e segurança (26%), os dois em alta | [7] |
| Onde investe | Bancos tradicionais 73,67%; bancos digitais caíram de 43,78% (2024) para 38,87% (2025) | [7] |
| De onde vem a informação | YouTube 35% (5º ano seguido na frente), Instagram 27%, TV 21%; inteligência artificial já citada por 9% | [1][3] |
| Golpes | 34% da população passou por pelo menos uma tentativa de golpe ou fraude financeira em 2025 (tema novo da edição) | [3] |
| Intenção | 23,2 milhões que não investem dizem que vão começar em 2026; a ANBIMA projeta 8,7 milhões de pessoas novas | [1] |
| Mulheres | 31% das mulheres investem | [1] |

Leitura para a Clarevo: a maior parte das pessoas que vão usar a aba tem poupança, um CDB ou "caixinha" do banco e, às vezes, um título público. A minoria tem bolsa. A aba precisa ser excelente em renda fixa antes de qualquer coisa de bolsa.

### b.2 Quanto dinheiro e onde (ANBIMA, consolidado de pessoas físicas)

| Indicador | Número | Fonte |
|---|---|---|
| Total aplicado por pessoas físicas | R$ 9,141 trilhões em junho de 2026, 6,4% acima de dezembro de 2025 (R$ 8,588 trilhões) | [9][10] |
| Crescimento em 2025 | 15,5% no ano; renda fixa perto de 60% do total aplicado | [11] |
| Segmentos | Varejo tradicional R$ 2,774 trilhões (+6,1%); alta renda R$ 3,37 trilhões (+7,8%); private +5,2% | [10] |
| CDB | R$ 1,33 trilhão em 2025, com captação líquida de R$ 288,7 bilhões, o maior volume do ano | [11] |
| Isentos (LCI, LCA, CRI, CRA, LIG, debêntures incentivadas) | Cerca de R$ 1,42 trilhão em 2025 | [11] |
| Previdência | R$ 1,54 trilhão em 2025; mais de R$ 1,6 trilhão em junho de 2026 | [10][11] |
| Fundos de renda fixa | R$ 1,13 trilhão em junho de 2026 (+11,6% no semestre) | [9] |
| Destaques do 1º semestre de 2026 | Títulos públicos +27,4%, LCI +21,2%, ações +12,1% em aplicações; ações somam R$ 816,9 bilhões | [9][10] |

### b.3 Bolsa e Tesouro (B3 e Tesouro Nacional)

| Indicador | Número | Fonte |
|---|---|---|
| CPFs em renda variável na B3 | 5,5 milhões em dezembro de 2025 e cerca de 5,7 milhões no 2º trimestre de 2026 (+7% em 12 meses) | [12][13][61] |
| CPFs com ETF | 862 mil no 2º trimestre de 2026, contra 639 mil um ano antes (+34%) | [12] |
| Cotistas de FII | Cerca de 3,2 milhões (maio de 2026) a 3,3 milhões (agosto de 2026), pelo boletim mensal | [14] |
| CPFs em renda fixa registrados na B3 | 104,8 milhões no 1º trimestre de 2026 (+9%), contando aplicação automática e conta remunerada, por isso não mede quem tem CDB | [13] |
| Mulheres na renda variável | 26,7% (março de 2026) | [15] |
| Idade na renda variável | De 25 a 39 anos caiu de 50% para 48% em cinco anos; de 40 a 59 subiu de 26% para 28% | [13] |
| Tesouro Direto: pessoas com título | 3.689.486 em junho de 2026 (+21,19% em 12 meses); 34,8 milhões de cadastros em fevereiro de 2026 | [16][17] |
| Tesouro Direto: estoque | Cerca de R$ 262,5 bilhões em junho de 2026 (+45,5% em 12 meses): IPCA 50,4%, Selic 37,0%, prefixado 12,6% | [16] |
| Tesouro Direto: vendas | R$ 14,76 bilhões em junho de 2026, segundo melhor mês da história; em maio, 54,7% das operações foram de até R$ 1.000 | [18] |
| Títulos de renda mensal e de educação | Estoque perto de 14,7 mil e 3,4 mil (provavelmente R$ milhões) em junho de 2026 **[conferir unidade]**; 7 em cada 10 com o título de aposentadoria são homens, 48% têm de 25 a 39 anos | [16][62] |
| Título para reserva (lançado em 11/05/2026) | Aplicação desde R$ 1, compra e resgate 24 horas por dia, 7 dias por semana, com liquidação por Pix; segundo reportagem, sem marcação a mercado; R$ 2 bilhões no primeiro mês | [19] |
| Contas por CPF na bolsa | Em 2021 e 2022, cerca de 1,2 conta por CPF (cálculo a partir de 4 milhões de contas para 3,4 milhões de CPFs): parte das pessoas usa mais de uma corretora | [59] |

### b.4 Produto a produto: números, regra em vigor e o que observar

Regras para pessoa física residente, em 12/11/2026. "FGC" indica se o produto entra na garantia de até R$ 250 mil por pessoa e por instituição ou conglomerado (teto de R$ 1 milhão a cada 4 anos) [34].

| Produto | Números recentes | IR para pessoa física hoje | FGC | Liquidez típica | O que observar |
|---|---|---|---|---|---|
| Poupança | Saldo perto de R$ 1,013 trilhão (set/2026); saída líquida de R$ 66,43 bilhões de janeiro a setembro [21] | Isenta | Sim | Diária, rende no aniversário | Com Selic acima de 8,5%, rende 0,5% ao mês mais TR [22] |
| CDB, RDB, LC | CDB com R$ 1,33 trilhão em 2025 [11] | Tabela regressiva (22,5% a 15%) e IOF nos primeiros 30 dias | Sim | Diária ou no vencimento | Taxa em % do CDI, IPCA mais taxa ou prefixada |
| Título público pós-fixado (Selic) | 37% do estoque do Tesouro Direto [16] | Tabela regressiva e IOF nos primeiros 30 dias | Não (garantia do Tesouro Nacional) | Diária | Custódia da B3 de 0,20% ao ano, isenta até R$ 10 mil nesse título [20] |
| Título público com IPCA | 50,4% do estoque [16] | Tabela regressiva | Não | Diária, com preço de mercado | Resgatar antes do vencimento pode dar perda (marcação a mercado) |
| Título público prefixado | 12,6% do estoque [16] | Tabela regressiva | Não | Diária, com preço de mercado | Mesmo cuidado da marcação a mercado |
| Títulos de renda mensal (aposentadoria) e de educação | Estoques em alta em 2026 [16] | Tabela regressiva | Não | Diária, com preço de mercado; pagamentos mensais depois da conversão | A ANBIMA dispensou a análise de perfil por tempo indeterminado, com alerta de perda se resgatar antes [51] |
| Título para reserva (24x7) | R$ 2 bilhões no 1º mês [19] | Tabela regressiva **[conferir]** | Não | Qualquer hora, por Pix | Taxa de custódia ainda a confirmar no site oficial [19] |
| LCI e LCA | LCI +21,2% no 1º semestre de 2026 [9] | Isentas | Sim | Carência mínima de 6 meses sem índice de preços; com IPCA, 36 meses (LCI) e 12 meses (LCA) [32] | Carência e vencimento são a dúvida mais comum |
| LCD (Letra de Crédito do Desenvolvimento) | Emitida só por bancos de desenvolvimento desde dez/2024 | Isenta (Lei 14.937/2024) | Sim, para pessoa física (Resolução CMN 5.169/2024) [33] | Carência relatada de 12 meses **[conferir]** | Produto novo, pouco conhecido |
| CRI e CRA | Ofertas do 1º semestre de 2026: CRI R$ 20,3 bilhões (−15,8%), CRA R$ 7,1 bilhões (−50,4%) [35] | Isentos | Não | Baixa (mercado secundário) | Risco de crédito da empresa ou da operação |
| Debêntures incentivadas | Recorde de R$ 150,7 bilhões em ofertas até nov/2025; cerca de R$ 65 bilhões no 1º semestre de 2026 [35] | Isentas (Lei 12.431/2011) | Não | Baixa | Não confundir com debênture comum (tributada) |
| Fundos de renda fixa e multimercado | Renda fixa com R$ 1,13 trilhão [9] | Come-cotas em maio e novembro (15% longo prazo, 20% curto prazo) e complemento no resgate | Não | Prazo de resgate em dias (D+N) | O valor do extrato já vem com o come-cotas descontado |
| Fundos de ações | | 15% no resgate, sem come-cotas | Não | D+N | |
| Previdência (PGBL e VGBL) | Mais de R$ 1,6 trilhão [10] | Tabela regressiva (35% a 10%) ou progressiva, escolha até o primeiro resgate (Lei 14.803/2024); PGBL deduz até 12% da renda tributável na declaração completa; VGBL paga IR só sobre o rendimento | Não | Carência do plano | IOF de 5% sobre aportes em VGBL acima de R$ 600 mil por ano em 2026 [31] |
| Ações | R$ 816,9 bilhões de pessoas físicas [9]; cerca de 4 milhões de CPFs no mercado à vista (2º trimestre de 2025) [61] | 15% sobre o ganho (20% em day trade); isenção quando as vendas de ações no mês somam até R$ 20 mil (fora day trade) [56] | Não | D+2 | Dividendos isentos até R$ 50 mil por mês de cada empresa; acima, retenção de 10% [27]; JCP com 17,5% retido [28] |
| FII e Fiagro | 3,2 a 3,3 milhões de cotistas de FII [14]; 548,7 mil CPFs em Fiagro (2º trimestre de 2025) [61] | Rendimentos isentos (fundo com 100 cotistas ou mais, cotas em bolsa, pessoa com menos de 10% das cotas); ganho na venda 20%, sem isenção de R$ 20 mil [29] | Não | D+2 | Proventos mensais: a parte de que as pessoas mais gostam de acompanhar |
| ETF | 862 mil CPFs [12] | 15% sobre o ganho, sem isenção de R$ 20 mil; ETF de renda fixa segue prazo médio da carteira **[conferir]** | Não | D+2 | O que mais cresce na bolsa |
| BDR | Cerca de 1 milhão de CPFs (2º trimestre de 2025) [61] | 15% sobre o ganho, sem isenção; dividendos pelo carnê-leão **[conferir]** | Não | D+2 | |
| Criptoativos | 4% da população usa [6] | Isenção quando as vendas do mês somam até R$ 35 mil; acima, 15% a 22,5% sobre o ganho [30] | Não | Variável | Nova declaração mensal à Receita (DeCripto) obrigatória desde julho de 2026 para operações fora de corretora brasileira acima de R$ 35 mil no mês [30] |
| COE | Estoque de R$ 100,25 bilhões na B3 (fev/2026, todos os públicos); no varejo tradicional, R$ 13,7 bilhões (abr/2026) [36] | Tabela regressiva | Não | Baixa, no vencimento | Produto complexo, com regras de risco mais duras da ANBIMA desde 2025 [36] |

### b.5 Juros, inflação e cenário (novembro de 2026)

- **Selic:** 13,75% ao ano, mantida pelo Copom em 04/11/2026 por unanimidade, depois de cortes que vieram de 15% (14% em agosto, 13,75% em setembro) [23].
- **Inflação:** o IPCA-15 de outubro subiu 0,32% e acumulou 4,62% em 12 meses, acima do teto da meta de 4,5%. O IPCA oficial de outubro sai hoje, 12/11/2026 [24].
- **Poupança:** com a Selic acima de 8,5%, rende 0,5% ao mês mais a TR (Lei 12.703/2012; Circular BCB 3.975) [22]. Saques líquidos em 8 dos 9 primeiros meses de 2026 [21].
- **FGC depois do Banco Master:** o Banco Central liquidou o Banco Master em novembro de 2025; o FGC começou a pagar em janeiro de 2026 cerca de R$ 40,6 bilhões a perto de 800 mil pessoas e empresas credoras. O CMN endureceu as contribuições dos bancos que captam com a garantia, sem mudar o limite de R$ 250 mil [34][57]. Isso deixou o tema "estou dentro do FGC?" no centro das conversas.

### b.6 Tributação: o que está em vigor e o que é proposta

**Em vigor em 12/11/2026**

| Regra | Detalhe | Fonte |
|---|---|---|
| Tabela regressiva (renda fixa, títulos públicos, fundos de longo prazo) | 22,5% até 180 dias; 20% de 181 a 360; 17,5% de 361 a 720; 15% acima de 720 dias, sobre o rendimento, retido na fonte | Lei 11.033/2004 [56] |
| IOF regressivo | Resgate antes de 30 dias corridos: de 96% do rendimento no 1º dia a 0% no 30º | Decreto 6.306/2007, anexo [55] |
| Come-cotas | Último dia útil de maio e de novembro: 15% (longo prazo) ou 20% (curto prazo), com complemento no resgate | [56] |
| Isenções para pessoa física | Poupança, LCI, LCA, LCD, CRI, CRA, LIG, debêntures incentivadas, rendimentos de FII e Fiagro (com as condições) | [25][29][33] |
| Ações | 15% sobre o ganho, isenção com vendas de até R$ 20 mil no mês; day trade 20% | Lei 11.033/2004 [56] |
| Dividendos | Isentos até R$ 50 mil por mês de uma mesma empresa para a mesma pessoa; acima, 10% retidos sobre o total do mês, desde 01/01/2026 | Lei 15.270/2025 [27] |
| Imposto mínimo de altas rendas | Para renda total acima de R$ 600 mil por ano: alíquota de 0% a 10%, apurada na declaração de 2027 (ano 2026) | Lei 15.270/2025 [27] |
| JCP | 17,5% retidos na fonte desde 01/01/2026 (antes, 15%) | Lei Complementar 224/2025 [28] |
| Faixa de isenção do IR | Rendimentos de até R$ 5 mil por mês, com redução até R$ 7.350 | Lei 15.270/2025 [27] |
| Criptoativos | Isenção com vendas de até R$ 35 mil no mês; acima, 15% a 22,5%; DeCripto (IN RFB 2.291/2025) | [30] |
| Previdência | Escolha do regime (regressivo ou progressivo) até o primeiro resgate; IOF de 5% sobre aportes em VGBL acima de R$ 600 mil por ano em 2026 | Lei 14.803/2024; Decreto 12.499/2025 [31] |
| Custódia do Tesouro Direto | 0,20% ao ano (B3); título pós-fixado isento até R$ 10 mil; cobrada no resgate, no pagamento de juros ou no vencimento (não mais a cada semestre, desde 31/12/2024) | [20] |

**Proposta ou discussão (não está valendo)**

| Tema | Situação | Fonte |
|---|---|---|
| MP 1.303/2025 (alíquota única de 17,5%, 5% sobre LCI, LCA, CRI, CRA e incentivadas novas, cripto sem isenção) | Caducou em 08/10/2025, quando a Câmara a retirou de pauta (251 a 193) | [25] |
| IOF sobre LCI, LCA, CRI e outros isentos | Reportagens de 28 e 29/10/2026 dizem que a equipe econômica estuda; sem texto, alíquota nem data. IOF muda por decreto, com efeito imediato | [26] |
| Ações no STF contra a Lei 15.270/2025 | ADIs 7.912, 7.914, 7.917 e 7.954 em andamento | [27] |
| Portabilidade de investimentos pelo Open Finance | "No radar" do Banco Central, sem data | [42] |

Consequência para o produto: toda regra de imposto que a Clarevo usar precisa ficar num lugar só do núcleo, com a data de vigência e a fonte, e a tela precisa dizer "estimativa pela regra em vigor em DD/MM/AAAA". O caso da MP 1.303 e o estudo de IOF de outubro de 2026 mostram que a regra pode mudar de um dia para o outro.

---

## (c) O que as pessoas querem saber e as dores

### c.1 Como quem investe trabalha (a rotina)

Rotina típica, montada a partir das pesquisas e do que as ferramentas de mercado oferecem (seção c.4):

- **Todo mês:** recebe a renda, separa um valor e aplica, quase sempre pelo app do próprio banco (73,67% usam banco tradicional) [7]. Olha o saldo e, quem é mais atento, compara com o CDI.
- **Quando algo vence ou libera:** decide se reaplica, resgata ou troca. Carência e vencimento ficam espalhados em vários apps.
- **Quem tem bolsa:** acompanha proventos (dividendos, JCP, rendimentos de FII) e o calendário de pagamentos; renda passiva é o objetivo número 1 de quem se declara de perfil arrojado em pesquisa da CVM (76%) [52].
- **Em fevereiro e março:** junta os informes de rendimentos de cada instituição e o relatório anual da B3, que desde outubro de 2025 também mostra a renda fixa registrada lá [39].
- **De março a maio:** declara. A Receita previa 60% das declarações de 2026 pela pré-preenchida, que exige conta gov.br prata ou ouro, e a B3 recomenda conferir se todos os rendimentos e bens vieram [38].
- **Ferramentas:** app do banco, app da corretora, Área do Investidor da B3, planilha, consolidadores e sites de análise (seção c.4), e conteúdo do YouTube e do Instagram [1].

### c.2 O que querem saber, e o que a Clarevo consegue responder com dados próprios ou públicos

| O que querem saber | Por que importa | Dado necessário | Fonte do dado |
|---|---|---|---|
| Rentabilidade comparada ao CDI, ao IPCA e à poupança | É a régua de todo o mercado; os consolidadores mostram CDI, IPCA e Ibovespa [44] | Valores do extrato e índices | Pessoa e Banco Central (séries do SGS) |
| Rendimento líquido de IR | Rendimento bruto engana; isento contra tributado só se compara no líquido | Data de cada aporte, tipo do produto, regra de IR | Pessoa e lei (Receita) |
| Isenções, come-cotas e IOF dos 30 dias | São as regras que mais mudam o valor líquido e as que mais confundem | Tipo do produto e datas | Lei |
| Liquidez e vencimentos | "Posso tirar quando precisar?" é a pergunta antes e depois de aplicar | Vencimento, carência, prazo de resgate | Pessoa |
| Cobertura do FGC por instituição | Caso Master: 800 mil pessoas e empresas credoras [34] | Instituição, tipo, valor | Pessoa e regras do FGC |
| Proventos (dividendos, JCP, FII) | Renda passiva e declaração | Valor, data e tipo do provento | Pessoa (ou dado pago de mercado) |
| Alocação por classe e por instituição | Ver concentração sem precisar de planilha | Tipo e instituição | Pessoa |
| Consolidação de várias corretoras | Parte das pessoas tem mais de uma conta [59] | Todas as posições | Pessoa, arquivo da B3 ou Open Finance |
| Preparação da declaração anual | Bens e direitos com saldo em 31/12, informes, códigos | Saldo em 31/12 por bem, rendimentos por tipo | Pessoa e tabela de códigos da Receita |
| Aportes mensais e metas | Constância e progresso | Aportes por mês e plano | Pessoa (a Clarevo já tem metas e plano de guardar) |
| Reserva de emergência | 31% não têm reserva [4] | Gastos essenciais e o que é resgatável na hora | Clarevo (reserva) e ficha do investimento |
| Inflação e ganho real | O dinheiro "rende" e compra menos | IPCA do período | Banco Central |

### c.3 Dores comuns e erros frequentes

| Dor ou erro | O que mostra | Fonte |
|---|---|---|
| Começar sem reserva | 31% sem nenhuma reserva; só 15% com 6 a 12 meses | [4][5] |
| Ficar só na poupança | Só 12% de quem poupou aplicou fora dela | [5] |
| Não saber quanto rendeu de verdade | Confusão entre bruto e líquido, e entre ganho nominal e real | [52][56] |
| Assustar-se com a marcação a mercado | Título com IPCA ou prefixado mostra perda temporária; resgatar antes pode realizar a perda; a ANBIMA exige alerta nos títulos de aposentadoria e educação | [51] |
| Perder o vencimento ou esquecer a carência | LCI e LCA com carência mínima de 6 meses, ou 12 e 36 meses com IPCA | [32] |
| Concentrar acima do limite do FGC | Caso Master; o limite é por conglomerado, não por corretora ou plataforma | [34] |
| Dinheiro espalhado e integrações que quebram | Reclamações de 2026 sobre consolidador com integração parada e valores atrasados | [44] |
| Decidir pelo que viu em rede social | YouTube 35% e Instagram 27% como fonte; a CVM descreve os vieses de comportamento que levam a decisões ruins (série CVM Comportamental) | [1][52] |
| Cair em golpe com promessa de ganho alto | 34% sofreram tentativa em 2025; a CVM alerta que promessa muito acima do comum pode ser fraude | [3][60] |
| Vender na queda e comprar na alta | Erro clássico descrito na série CVM Comportamental | [52] |
| Errar a declaração | Ações, FII, ETF e cripto vão pelo custo de compra, não pelo valor de mercado; códigos diferentes por produto; fontes de mercado divergem até no código do ETF | [37] |
| Pagar IOF sem saber | Resgate antes de 30 dias perde parte do rendimento | [55] |
| Não acompanhar os custos | Taxa de custódia, taxa de administração, come-cotas | [20][56] |

### c.4 O que ferramentas de mercado oferecem (só como referência)

| Ferramenta (referência) | O que oferece | De onde vem o dado | Custo e limites | Lição para a Clarevo |
|---|---|---|---|---|
| Consolidador (Kinvo, do BTG desde 2021) | Carteira consolidada, rentabilidade contra CDI, IPCA e Ibovespa, dividendos; no plano pago, análise de cobertura do FGC, risco, relatórios em PDF e metas sem limite | Integração com bancos, corretoras e B3 | Gratuito e pago; reclamações em 2026 de integração parada e dados atrasados | O que as pessoas pagam para ter (FGC, PDF, metas) dá para fazer com cadastro manual; integração frágil gera frustração [44] |
| Consolidador (Gorila) | Consolidação e análise de carteira; foco em instituições, com modelo gratuito para pessoa física | API da Área do Investidor da B3, com autorização expressa da pessoa | Gratuito para pessoa física | A API da B3 é contratada e tarifada [40][45] |
| Site de análise (Status Invest) | Carteira com rentabilidade, composição, proventos e calendário de eventos; indicadores de ativos | Importação da B3 (histórico limitado) e lançamento manual | Plano gratuito e pago | Calendário de proventos depende de dado de mercado; lançamento manual é aceito por quem investe [46] |
| Plataforma de análise e IR (Investidor10) | Análise de ativos, carteira e apoio ao IRPF | Dados de mercado e da pessoa | Gratuito e pago | Ajuda com IR é diferencial cobrado [47] |
| Área do Investidor da B3 | Posição, movimentação e negociação de todas as corretoras; renda fixa registrada desde out/2025; relatório consolidado anual em PDF ou Excel | Central depositária | Gratuita, com conta gov.br | É a "consolidação oficial" gratuita; a Clarevo pode ler o arquivo que a pessoa baixa [39] |
| Simulador do Tesouro Direto | Rendimento líquido de cada título com IR e custódia | Tesouro | Gratuito | Referência de convenção para os simuladores [48] |
| Calculadora do Cidadão (Banco Central) | Aplicação com depósitos regulares, correção de valores por índices | Banco Central | Gratuita | O simulador da Clarevo já segue a convenção dela (D-028) [48] |
| Apps de banco ("caixinhas") | Separar dinheiro por objetivo com liquidez diária | O próprio banco | Gratuito | A Clarevo já tem metas; falta ligar meta e investimento |

### c.5 Open Finance para investimentos: o que existe e o que exige

- **O que existe:** o compartilhamento de dados de investimentos (renda fixa bancária, títulos públicos, fundos e renda variável) começou em setembro de 2023, na fase 4 do Open Finance [42]. A Resolução Conjunta nº 10 trouxe os bancos digitais a partir de 01/07/2025 [42]. Em 3 anos, há dezenas de instituições certificadas e uso crescente, mas "ainda não gerou um caso emblemático", segundo artigo de 14/09/2026 [42].
- **Quem pode receber:** só instituição participante autorizada pelo Banco Central, com consentimento da pessoa. App sem autorização só entra como parceiro de uma instituição autorizada (`docs/11_INTEGRACAO_BANCARIA.md`, seção 1).
- **O que mudou agora:** a Resolução Conjunta nº 21, de 22/10/2026, refaz as regras de parceria: restringe o repasse dos dados recebidos a terceiros e veda certas parcerias; contratos existentes precisam ser revistos [43]. **[conferir texto e prazos de adaptação]**
- **Custo:** fornecedor autorizado a partir de cerca de R$ 2.500 por mês (`docs/11`, seção 5).
- **Alternativa pela B3:** as APIs da Área do Investidor trazem posição e movimentação com autorização da pessoa na própria B3, mas exigem contrato de licença, com tarifa nova desde 02/01/2025 [40].
- **Conclusão:** para a Clarevo, hoje, a consolidação viável e gratuita é a pessoa baixar o arquivo da Área do Investidor (ou do banco) e escolher esse arquivo no app, como já acontece com extrato e fatura (D-048).

---

## (d) O que a Clarevo já faz

| O que | Onde | Observação |
|---|---|---|
| Cadastro manual de investimentos (nome, 7 tipos, aplicado, valor de hoje, desde quando) | Aba Investir, `docs/45` | Até 50 ativos, só no Pessoal |
| Aporte, resgate, rendimento recebido e atualização de valor por data | Detalhe do investimento | O valor do dia segue a regra da seção 3.1 do `docs/45` |
| Ganho, aportado, resgatado, rendimentos | Card azul e detalhe | Ganho = valor + resgatado + rendimentos − aportado |
| Rentabilidade mensal (Dietz modificado), mês de hoje e meses fechados, até 12 | Card azul e detalhe | Só com valor nas duas pontas do mês |
| CDI e IPCA do mesmo período | Função `indices` (séries 4391 e 433 do Banco Central) | Fonte e data na tela |
| Quem falta atualizar para ter a taxa do mês | Card azul | `investmentsMissingValue` |
| Encerrar, reabrir, excluir | Detalhe | Encerrados saem da carteira |
| Avisos de não recomendação e privacidade | Aba | "Não é recomendação de investimento..." |
| Metas com aporte, resgate, rendimento, valorização e desvalorização | Aba Metas | Separadas dos investimentos |
| Reserva para imprevistos com cobertura em meses | Metas e calculadora | Não diz onde guardar |
| Simulador com taxa digitada pela pessoa e "dinheiro de hoje" | Metas e Aprender | Convenção da Calculadora do Cidadão |
| Lembrete mensal de aporte das metas | Conta, lembretes do dia a dia | Só no celular |
| Temas de Aprender: Inflação e IPCA, Selic, Liquidez risco e retorno, Garantia do FGC, Como ler uma simulação | Aprender | Com fonte e data de revisão |
| Importar extrato e fatura (OFX, CSV; PDF de comprovante) no aparelho | Movimentos | Planilha do Excel pede para salvar como CSV |

**O que falta:** a aba não sabe o tipo exato (CDB, LCI, título público com IPCA), onde está, como rende, quando vence, se tem carência, se tem IR ou FGC. Sem isso, não há alocação, vencimentos, FGC, IR, declaração nem valor estimado. Quase todas as propostas abaixo dependem dessa ficha ampliada.

---

## (e) Funcionalidades propostas para a aba Investir

### e.1 Como priorizei

1. Funciona com cadastro manual e dados públicos gratuitos (Banco Central, Tesouro, CVM, Receita, FGC).
2. Responde às perguntas da seção c.2 que mais aparecem nas pesquisas e nas ferramentas pagas.
3. Fica do lado de organizar, nunca de recomendar (seção e2).
4. Esforço baixo antes de alto, e fundação antes do que depende dela.

**Escala de esforço** (equipe atual, com testes no núcleo, no banco e no roteiro web): **pequeno**, até 2 dias, sem migração ou com migração simples; **médio**, de 3 a 7 dias, com migração, telas e testes; **grande**, mais de 2 semanas, ou dependente de contrato, fornecedor ou parecer.

### e.2 Visão geral

| # | Funcionalidade | Prioridade | Esforço | Dado externo | Custo |
|---|---|---|---|---|---|
| 0 | Ficha ampliada do investimento | Fundação | Médio | Nenhum | Zero |
| 1 | Alocação por classe, instituição, liquidez e forma de rendimento | P1 | Pequeno | Nenhum | Zero |
| 2 | Vencimentos e carências, com lembretes | P1 | Pequeno | Nenhum | Zero |
| 3 | Limite do FGC por instituição | P1 | Pequeno | Regras do FGC | Zero |
| 4 | Ganho real sobre o IPCA e régua da poupança | P1 | Pequeno | Banco Central | Zero |
| 5 | Proventos por tipo e renda recebida | P1 | Pequeno | Nenhum | Zero |
| 6 | Lembrete mensal de atualizar valores | P1 | Pequeno | Nenhum | Zero |
| 7 | Rendimento líquido estimado (IR e IOF) | P1 | Médio | Lei (Receita) | Zero |
| 8 | Valor estimado pela taxa contratada (renda fixa) | P1 | Médio | Banco Central | Zero |
| 9 | Resumo para a declaração anual | P1 | Médio | Tabela da Receita | Zero |
| 10 | Simulador "comparar rendimentos líquidos" | P1 | Médio | Banco Central | Zero |
| 11 | Temas novos em Aprender | P1 | Pequeno cada | Fontes oficiais | Zero |
| 12 | Plano de aporte mensal dos investimentos | P2 | Pequeno | Nenhum | Zero |
| 13 | Investimento ligado à reserva e às metas | P2 | Médio (fase 1) a grande (fase 2) | Nenhum | Zero |
| 14 | Evolução do patrimônio investido | P2 | Pequeno | Nenhum | Zero |
| 15 | Calendário fiscal dos investimentos | P2 | Pequeno | Lei | Zero |
| 16 | Aviso neutro de taxa fora do comum | P2 | Pequeno | CVM (alertas) | Zero |
| 17 | Exportar investimentos (CSV e PDF) | P2 | Pequeno | Nenhum | Zero |
| 18 | Importar arquivo da B3 e do banco | P2 | Médio a grande | Formato dos arquivos | Zero |
| 19 | Preço público dos títulos do Tesouro | P2 | Médio | Tesouro Transparente | Zero |
| 20 | Cota diária de fundos | P2 | Médio a grande | CVM, dados abertos (ODbL) | Zero, com custo de servidor |
| 21 | Cotação de ações, FII, ETF e BDR | P3 | Grande | B3 ou fornecedor | Pago |
| 22 | Cotação de criptoativos | P3 | Médio | Fornecedor | Licença a conferir |
| 23 | Apuração de imposto de ações e FII | P3 | Grande | Lei | Zero, risco alto |
| 24 | Alocação-alvo escolhida pela pessoa | P3 | Médio | Nenhum | Parecer jurídico |
| 25 | Consolidação por Open Finance ou API da B3 | P3 | Grande | Fornecedor autorizado ou B3 | Pago |
| 26 | Visão da Família (só totais, opcional) | P3 | Médio | Nenhum | Decisão do Enzo |

### e.3 Fundação

#### 0. Ficha ampliada do investimento

- **O que é:** campos opcionais no cadastro, num bloco "Mais detalhes (opcional)": **tipo exato** dentro dos 7 tipos de hoje (por exemplo, em Renda fixa: poupança, CDB ou RDB, LC, LCI, LCA, LCD, LIG, debênture, debênture incentivada, CRI, CRA, COE; em Títulos públicos: pós-fixado Selic, com IPCA, prefixado, renda mensal para aposentadoria, educação, reserva 24 horas; em Fundos: renda fixa, multimercado, ações, FII, Fiagro, ETF; em Ações: ação, BDR; em Previdência: PGBL, VGBL); **onde está** (nome da instituição digitado pela pessoa, até 40 caracteres, com sugestão só dos nomes que ela mesma já digitou); **como rende** (% do CDI, % da Selic, IPCA mais taxa, prefixado com taxa ao ano, variável); **taxa contratada**; **vencimento**; **quando pode resgatar** (qualquer dia, a partir de uma data, só no vencimento, em N dias). A partir do tipo exato, o núcleo deduz **IR** (isento, tabela regressiva, come-cotas, ganho na venda) e **FGC** (sim, não, garantia do Tesouro).
- **Para quem:** todas as pessoas com investimento cadastrado; quem já tem só o básico continua como está.
- **Por quê:** sem ela, nenhuma das perguntas da seção c.2 além de rentabilidade tem resposta.
- **Esforço:** médio (migração com colunas opcionais em investimentos, funções `create_investment` e `update_investment` com validação repetida no banco, formulário progressivo, testes).
- **Dependências:** nenhuma externa. Decisão do Enzo sobre os nomes dos títulos públicos: "Tesouro Selic", "Tesouro IPCA+" e semelhantes são nomes oficiais do Tesouro Nacional, não marca comercial; a aba hoje usa "Títulos públicos" para evitar nome próprio. Sugestão: rótulo descritivo ("Título público pós-fixado (Selic)") com o nome oficial entre parênteses só no tema de Aprender.
- **Riscos:** formulário longo (mitigar com tudo opcional e recolhido); a pessoa escolher o tipo errado e ver IR ou FGC errados (mostrar a dedução com "confira no seu extrato" e permitir corrigir); nome de instituição é dado da pessoa, não texto da Clarevo, então não fere a regra de marcas, mas a Clarevo nunca oferece lista de instituições.

### e.4 Prioridade 1 (manual e com dados públicos)

#### 1. Alocação por classe, instituição, liquidez e forma de rendimento

- **O que é:** uma seção "Como está dividido" com barras simples e valores em R$ e %: por tipo (os 7 de hoje), por tipo exato, por instituição, por liquidez (resgate em até 1 dia, até 30 dias, até 1 ano, mais de 1 ano ou só no vencimento), por forma de rendimento (pós-fixado, IPCA, prefixado, variável) e por garantia (FGC, Tesouro Nacional, sem garantia).
- **Para quem:** quem tem dois ou mais investimentos, sobretudo em instituições diferentes.
- **Por quê:** é o primeiro painel de todo consolidador; mostra concentração sem planilha.
- **Esforço:** pequeno (depois da ficha); cálculo no núcleo, sem banco novo.
- **Dependências:** ficha ampliada; padrão de gráficos do app.
- **Riscos:** parecer sugestão de "carteira ideal". Mitigar: nunca mostrar faixa "recomendada", meta ou cor de alerta por concentração; só o que existe.

#### 2. Vencimentos e carências, com lembretes

- **O que é:** lista "Próximos vencimentos e liberações" (90 dias e 12 meses), no card da aba e no detalhe ("Vence em 15/03/2027, daqui a 4 meses"; "Pode resgatar a partir de 10/01/2027"). Lembrete local no celular 7 dias antes e no dia, sem valor nem nome na tela bloqueada, como os outros lembretes. No dia do vencimento, atalho "Registrar o resgate do vencimento".
- **Para quem:** quem tem CDB, LCI, LCA, títulos com data, COE, previdência com carência.
- **Por quê:** perder vencimento e esquecer carência estão entre as dores mais citadas; o app de cada banco mostra só as datas daquele banco.
- **Esforço:** pequeno (reaproveita a base dos lembretes de D-025 e D-087).
- **Dependências:** ficha ampliada (vencimento, carência).
- **Riscos:** data digitada errada. Mitigar: mostrar a data no detalhe e no cadastro, pedir confirmação quando o vencimento passa sem resgate registrado.

#### 3. Limite do FGC por instituição

- **O que é:** para cada instituição digitada, a soma do valor de hoje dos investimentos com garantia do FGC e a comparação com R$ 250 mil por pessoa e por instituição ou conglomerado. Texto neutro: "Nesta instituição, R$ 262.000,00 estão em produtos com garantia do FGC. A garantia vai até R$ 250.000,00 por pessoa em cada instituição ou conglomerado." Opção "Estas instituições são do mesmo grupo" para somar duas ou mais. Lembrete do teto de R$ 1 milhão a cada 4 anos e da divisão em conta conjunta, com link para o FGC.
- **Para quem:** quem tem renda fixa bancária em valor alto ou em vários bancos; quem passou pelo susto do caso Master.
- **Por quê:** é recurso do plano pago de consolidador [44] e cabe inteiro em cadastro manual.
- **Esforço:** pequeno.
- **Dependências:** ficha ampliada; regras do FGC (o tema "Garantia do FGC" de Aprender já tem as fontes).
- **Riscos:** a Clarevo não sabe quem é do mesmo conglomerado nem a grafia certa da instituição: dizer "estimativa pelo que você registrou" e mostrar como conferir no site do FGC; nunca dizer para onde mover o dinheiro.

#### 4. Ganho real sobre o IPCA e régua da poupança

- **O que é:** ao lado do CDI e do IPCA de hoje, "Acima da inflação no período: +3,2%" (ganho real = (1 + rentabilidade) ÷ (1 + IPCA) − 1, nos mesmos meses) e "Poupança no mesmo período: +X%". Em reais: quanto o aportado valeria corrigido pelo IPCA, para comparar com o valor de hoje.
- **Para quem:** todas as pessoas, sobretudo quem saiu da poupança.
- **Por quê:** responde "rendeu de verdade?" com dado público; a poupança é a referência da maioria [6].
- **Esforço:** pequeno (a função `indices` ganha a série da poupança; o resto é conta no núcleo).
- **Dependências:** Banco Central, SGS [58]: série da rentabilidade da poupança (195, regra a partir de 04/05/2012) **[conferir código]**, além das 4391 e 433 de hoje.
- **Riscos:** a poupança rende no aniversário; a série do Banco Central é por data de aniversário, então a comparação é aproximada (dizer isso na tela).

#### 5. Proventos por tipo e renda recebida

- **O que é:** o "Rendimento recebido" de hoje ganha um tipo opcional: juros ou cupom, dividendo, JCP, rendimento de FII ou Fiagro, amortização, outro. Resumo "Recebido em 2026: R$ 1.240,00 (dividendos R$ 610,00, rendimentos de FII R$ 480,00, JCP R$ 150,00)" e barras por mês. No JCP, a dica "O valor que cai na conta já vem com 17,5% de IR descontado."
- **Para quem:** quem tem ações, FII, ETF ou títulos com cupom.
- **Por quê:** acompanhar proventos é recurso central das ferramentas de bolsa [46]; a soma por tipo alimenta a declaração (item 9).
- **Esforço:** pequeno (uma coluna opcional no movimento, resumo no núcleo).
- **Dependências:** nenhuma externa.
- **Riscos:** calendário de proventos futuros exige dado de mercado pago (item 21); aqui é só o que a pessoa recebeu.

#### 6. Lembrete mensal de atualizar valores

- **O que é:** um interruptor em Conta, "Atualizar os investimentos", com aviso local no dia escolhido de cada mês (sugestão: dia 1), só quando há investimento sem valor no mês, sem valor nem nome na tela bloqueada.
- **Para quem:** quem já usa a aba; é o que destrava a taxa de cada mês (`docs/45`, seção 3.2).
- **Esforço:** pequeno (mesmo padrão do aviso "aporte" de D-093).
- **Dependências:** nenhuma.
- **Riscos:** cansaço de notificação; desligado por padrão, como os outros.

#### 7. Rendimento líquido estimado (IR e IOF)

- **O que é:** no detalhe e no card, "Se resgatasse hoje: cerca de R$ 10.412,00 líquidos (IR estimado R$ 188,00)". Regras: tabela regressiva por aporte (cada aporte com o seu prazo, saindo primeiro os mais antigos), IOF para aportes com menos de 30 dias, isenções pelo tipo, custódia de títulos públicos (0,20% ao ano, isenção até R$ 10 mil no pós-fixado). Para fundos: "o valor do extrato já desconta o come-cotas; no resgate pode haver um complemento". Para ações, FII, ETF, BDR e cripto: explicação da regra (isenção de R$ 20 mil em vendas de ações, de R$ 35 mil em cripto), sem cálculo. Para previdência: a tabela do regime que a pessoa informar.
- **Para quem:** quem tem renda fixa tributada ou compara isento com tributado.
- **Por quê:** líquido é o número que importa e é o que os simuladores oficiais mostram [48].
- **Esforço:** médio (regras no núcleo com vigência e fonte, testes com exemplos calculados, textos).
- **Dependências:** ficha ampliada; lei em vigor (seção b.6).
- **Riscos:** errar a regra ou ela mudar (MP 1.303, estudo de IOF de out/2026). Mitigar: regras num arquivo só, com data e fonte, revisão como os temas de Aprender, sempre "estimativa"; nunca escrever "imposto devido".

#### 8. Valor estimado pela taxa contratada (renda fixa)

- **O que é:** para investimentos com "como rende" preenchido, a Clarevo calcula o valor bruto estimado de hoje: % do CDI com o CDI diário (série 12), % da Selic com a Selic diária (série 11), IPCA mais taxa com o IPCA mensal publicado, prefixado com a taxa em dias úteis (o núcleo já tem `dia-util.ts`), poupança pela regra do aniversário. A tela mostra "Valor estimado: R$ 10.600,00, pela taxa que você registrou" e o botão "Usar este valor", que cria uma atualização de valor só quando a pessoa confirma. O valor do extrato continua mandando.
- **Para quem:** quem tem CDB, LCI, LCA, LCD, títulos e poupança, a maior parte do público (seção b.1).
- **Por quê:** tira o maior atrito de hoje (atualizar valor todo mês para ter a taxa do mês) usando só dado público e gratuito.
- **Esforço:** médio (a função `indices` passa a devolver séries diárias com cache, cálculo no núcleo, testes contra exemplos de extrato).
- **Dependências:** Banco Central (SGS, gratuito) [58]; ficha ampliada; feriados nacionais.
- **Riscos:** diferença de centavos ou dias para o extrato (convenções de cada instituição); títulos com IPCA e prefixados têm preço de mercado diferente do valor "na curva" (dizer "valor pela taxa contratada, sem a oscilação de mercado"); IPCA do mês ainda não publicado (parar no último mês publicado e dizer isso). Nunca gravar sozinho.

#### 9. Resumo para a declaração anual

- **O que é:** uma tela "Para a declaração de 2027 (ano de 2026)" com, para cada investimento: grupo e código de Bens e Direitos sugeridos pelo tipo exato (por exemplo, poupança 04.01; CDB e títulos públicos 04.02; LCI, LCA, CRI, CRA e incentivadas 04.03; BDR 04.04; ações 03.01; FII 07.03; VGBL 99.06; criptoativos no grupo 08), sempre com "confira no programa da Receita" [37]; uma discriminação sugerida sem CPF ("CDB na instituição X, aplicado em 2025"); o valor em 31/12 do ano anterior e do ano; e os rendimentos recebidos no ano por tipo (isentos, tributação exclusiva, JCP, dividendos). Para ações, FII, ETF, BDR e cripto, o aviso de que o valor declarado é o custo de compra, que está no informe da corretora, não o valor de hoje. Lista de informes a juntar por instituição (marcada só no aparelho). Lembrete local em 2 de janeiro: "Registre o valor de 31/12 de cada investimento." Exportação em PDF no aparelho.
- **Para quem:** quem declara IR e tem investimentos (a pré-preenchida não dispensa a conferência [38]).
- **Por quê:** a declaração é uma tarefa anual difícil e cara de errar; ferramentas cobram para ajudar com ela [47].
- **Esforço:** médio (tabela de códigos com vigência e fonte, telas, PDF).
- **Dependências:** ficha ampliada, proventos por tipo (item 5), tabela da Receita do ano.
- **Riscos:** parecer "declaração pronta" (escrever "resumo para conferir"); códigos mudarem de um ano para outro e divergirem entre fontes (o ETF aparece como 07.06 e 07.09 em guias diferentes [37], então revisar todo ano no programa oficial); custo de compra de ações não é o "aplicado menos resgatado" da Clarevo (não mostrar como se fosse).

#### 10. Simulador "comparar rendimentos líquidos"

- **O que é:** nova calculadora em Aprender, grupo "Guardar e dividir": valor, prazo e até cinco opções genéricas, com a taxa digitada pela pessoa ("rende % do CDI com IR", "rende % do CDI isento", "IPCA mais taxa com IR", "prefixado com IR", "poupança"), com o líquido de cada uma no prazo, o IOF quando o prazo é menor que 30 dias, a custódia do título público e a "taxa equivalente" entre isento e tributado no prazo. O CDI e o IPCA de hoje aparecem como informação ao lado do campo, com fonte e data; a taxa contratada é sempre digitada.
- **Para quem:** quem está decidindo onde aplicar e quer comparar propostas que já recebeu.
- **Por quê:** "isento ou tributado, qual rende mais líquido?" é a conta mais comum ao comparar propostas; o simulador oficial do Tesouro só cobre títulos públicos [48].
- **Esforço:** médio (reaproveita a base do simulador de D-028 e as regras do item 7).
- **Dependências:** regras de IR (item 7); Banco Central.
- **Riscos:** virar comparador de produtos. Mitigar: nenhuma instituição, nenhum ranking, nenhuma "melhor opção" destacada, hipóteses escritas, aviso de que a tributação pode mudar.

#### 11. Temas novos em Aprender

- **O que é:** temas com fonte oficial e data de revisão, exemplos calculados e testados: "Imposto de renda nos investimentos: tabela regressiva, IOF e come-cotas"; "Títulos públicos: os tipos e a marcação a mercado"; "LCI, LCA e LCD: isenção e carência"; "Dividendos, JCP e rendimentos de FII"; "Como declarar investimentos"; "Ganho real"; "Golpes com promessa de rentabilidade" (com o link de alertas da CVM e a consulta de quem tem registro).
- **Para quem:** quem começa e quem tem dúvida pontual; "O que é isso?" nas telas abre o tema.
- **Esforço:** pequeno por tema.
- **Dependências:** fontes da Receita, do Tesouro, da CVM, do FGC e do Banco Central.
- **Riscos:** tema desatualizado com mudança de lei; revisão com data, como já é a regra de Aprender.

### e.5 Prioridade 2

#### 12. Plano de aporte mensal dos investimentos

- **O que é:** a pessoa define, se quiser, quanto pretende aportar por mês nos investimentos; o card mostra "Aportado neste mês: R$ 300,00. Seu plano: R$ 500,00." sem cor de alerta, sem sequência de dias e sem comparação com outras pessoas. Lembrete opcional, como o de metas.
- **Para quem:** quem investe todo mês.
- **Esforço:** pequeno.
- **Dependências:** nenhuma.
- **Riscos:** pressão; manter o tom de D-027 ("o plano é intenção, não aporte").

#### 13. Investimento ligado à reserva e às metas

- **O que é:** fase 1: marcar um investimento como "parte da reserva para imprevistos" ou "para a meta X"; a Reserva mostra "Investimentos marcados com resgate em até 1 dia: R$ 8.000,00", só como informação. Fase 2: a meta passa a ler o valor do investimento ligado, sem lançar aporte duas vezes.
- **Para quem:** quem guarda a reserva ou o objetivo num investimento.
- **Por quê:** hoje a pessoa registra o mesmo dinheiro duas vezes (na meta e no investimento).
- **Esforço:** médio na fase 1; grande na fase 2 (muda regras de metas, G1 e `goal_items`).
- **Dependências:** ficha ampliada (liquidez).
- **Riscos:** confusão entre "guardado na meta" e "valor do investimento"; dizer de onde vem cada número. Nunca sugerir onde guardar a reserva.

#### 14. Evolução do patrimônio investido

- **O que é:** gráfico de linhas por mês com o aportado acumulado e o valor no fim de cada mês da carteira (o detalhe já tem os valores por mês de cada investimento).
- **Esforço:** pequeno.
- **Riscos:** meses sem valor (usar a mesma regra de "sem taxa" e mostrar lacuna).

#### 15. Calendário fiscal dos investimentos

- **O que é:** datas fixas, com explicação curta: come-cotas (último dia útil de maio e de novembro), informes de rendimentos (fevereiro), declaração (de março a maio), valor de 31/12, DARF de ações (até o último dia útil do mês seguinte à venda, para quem vende com ganho acima da isenção).
- **Esforço:** pequeno.
- **Riscos:** datas que mudam por ato da Receita; data de revisão anual.

#### 16. Aviso neutro de taxa fora do comum

- **O que é:** quando a taxa contratada digitada for muito acima do CDI do período (limiar a definir, por exemplo, mais que o dobro), a ficha mostra uma vez: "Taxas muito acima das praticadas no mercado podem ser sinal de golpe. A CVM tem uma página de alertas e uma consulta de quem tem registro." com os links.
- **Para quem:** todas as pessoas; 34% sofreram tentativa de golpe em 2025 [3].
- **Esforço:** pequeno.
- **Riscos:** soar como julgamento; texto informativo, dispensável, sem impedir o cadastro.

#### 17. Exportar investimentos (CSV e PDF)

- **O que é:** investimentos e movimentos em CSV e um resumo em PDF, no aparelho, junto com as metas, como já previsto no `docs/45`.
- **Esforço:** pequeno.
- **Dependências:** exportação existente.
- **Riscos:** arquivo com dado sensível fora do app; gerar só no aparelho, sem envio.

#### 18. Importar arquivo da B3 e do banco

- **O que é:** a pessoa baixa na Área do Investidor da B3 o extrato de posição ou de movimentação (ou o extrato do banco ou da corretora) e escolhe o arquivo; a leitura acontece no aparelho, como a importação de extrato de D-048; cada linha aparece "a revisar" e vira investimento ou movimento só quando a pessoa confirma.
- **Para quem:** quem tem várias corretoras ou muitos ativos.
- **Por quê:** a Área do Investidor já junta todas as corretoras e, desde out/2025, a renda fixa registrada na B3 [39]; é consolidação gratuita sem contrato.
- **Esforço:** médio com CSV (a pessoa salva a planilha como CSV, como hoje); grande se a Clarevo abrir o Excel direto (biblioteca no aparelho, tamanho do app).
- **Dependências:** formato dos arquivos da B3 e das instituições, que muda sem aviso.
- **Riscos:** quebra de formato (testes com arquivos de exemplo fictícios, mensagem clara de "formato não reconhecido"); CPF e dados de conta no arquivo (descartar na leitura, como no comprovante); duplicidade (resumo SHA-256 por linha, como em `import_records`).

#### 19. Preço público dos títulos do Tesouro

- **O que é:** para títulos públicos com a quantidade informada, o valor de mercado do dia pelo preço unitário publicado pelo Tesouro Nacional nos dados abertos ("Taxas dos Títulos Ofertados pelo Tesouro Direto", diário) [54], com "Usar este valor".
- **Esforço:** médio (função do servidor com cache, campo de quantidade).
- **Dependências:** Tesouro Transparente (gratuito) **[conferir licença no catálogo]**.
- **Riscos:** o preço publicado é o do fechamento e pode ser revisto; título para reserva sem marcação a mercado tem regra própria.

#### 20. Cota diária de fundos

- **O que é:** a pessoa informa o CNPJ do fundo e a quantidade de cotas; a Clarevo busca a cota diária no Informe Diário da CVM (dados abertos, licença ODbL) [53].
- **Esforço:** médio a grande (os arquivos são mensais e grandes, em zip; precisa de função do servidor que filtre e guarde só as cotas pedidas).
- **Dependências:** CVM dados abertos (gratuito; a ODbL pede atribuição).
- **Riscos:** custo e limite de memória da função do servidor; atraso de publicação; fundos que não estão no informe.

### e.6 Prioridade 3 (depende de contrato, licença ou parecer)

#### 21. Cotação de ações, FII, ETF e BDR

- **O que é:** valor de mercado automático pela quantidade de cada ativo; calendário de proventos futuros.
- **Esforço:** grande.
- **Dependências:** licença de market data da B3 (uso comercial e redistribuição exigem contrato; política revista em 2025 e 2026) ou fornecedor terceiro com licença limitada e paga [41].
- **Riscos:** custo recorrente; termos que proíbem exibir para terceiros; dado atrasado. Avaliar só com demanda medida.

#### 22. Cotação de criptoativos

- **Esforço:** médio.
- **Dependências:** API de fornecedor ou corretora, com termos de uso a conferir.
- **Riscos:** volatilidade e "app de trading"; manter só o valor, sem gráfico intradiário nem alertas de preço.

#### 23. Apuração de imposto de ações e FII

- **O que é:** registro de compras e vendas, preço médio, isenção de R$ 20 mil, prejuízo a compensar e DARF do mês.
- **Esforço:** grande.
- **Riscos:** altos (erro gera multa para a pessoa); exige revisão tributária. Alternativa menor: lembrete de DARF no calendário fiscal (item 15).

#### 24. Alocação-alvo escolhida pela pessoa

- **O que é:** a pessoa digita os próprios percentuais por classe; a Clarevo mostra a diferença em R$ entre o atual e o que ela escolheu.
- **Esforço:** médio.
- **Riscos:** fica perto da linha da seção e2: só pode existir se a Clarevo nunca sugerir percentuais, perfis ou o que comprar e vender. Pedir parecer antes.

#### 25. Consolidação por Open Finance ou API da B3

- **Esforço:** grande.
- **Dependências:** fornecedor autorizado (a partir de cerca de R$ 2.500 por mês, `docs/11`) ou contrato de licença com a B3 [40]; Resolução Conjunta nº 21/2026 [43].
- **Riscos:** custo, regras de parceria em mudança, integração que quebra (a principal reclamação dos consolidadores [44]).

#### 26. Visão da Família (só totais, opcional)

- **O que é:** cada pessoa escolhe mostrar à Família só o total investido, sem detalhes.
- **Dependências:** decisão do Enzo (D-093: investimentos só no Pessoal).
- **Riscos:** dado sensível compartilhado; só por escolha ativa de cada pessoa, revogável.

### e.7 Campos sugeridos (todos opcionais)

| Campo | Valores | Usado em |
|---|---|---|
| `subkind` | Lista fechada por tipo (item 0) | IR, FGC, declaração, alocação |
| `institution` | Texto até 40, digitado pela pessoa | FGC, alocação, declaração |
| `index_kind` | `cdi`, `selic`, `ipca`, `prefixado`, `variavel` | Valor estimado, alocação |
| `rate_bp` | Pontos-base (% do CDI ou taxa ao ano) | Valor estimado, aviso de taxa |
| `maturity_on` | Data | Vencimentos, lembretes |
| `liquidity` | `diaria`, `a_partir_de`, `no_vencimento`, `dias` (com data ou número) | Alocação por liquidez, reserva |
| `quantity` | Número decimal | Preço público e cotas (P2) |
| `income_kind` (no movimento de rendimento) | `juros`, `dividendo`, `jcp`, `fii`, `amortizacao`, `outro` | Proventos, declaração |

Valores sempre em centavos inteiros, regras no núcleo e repetidas no banco, como o resto da Clarevo.

### e.8 Textos de exemplo para o app

- "Valor estimado pela taxa que você registrou. O valor do seu extrato é o que vale."
- "Se resgatasse hoje, o imposto estimado seria de R$ 188,00, pela regra em vigor em 12/11/2026."
- "Este investimento vence em 15/03/2027."
- "Nesta instituição, R$ 262.000,00 estão em produtos com garantia do FGC. A garantia vai até R$ 250.000,00 por pessoa em cada instituição ou conglomerado."
- "Acima da inflação no período: +3,2%."
- "Para ações, a declaração usa o custo de compra, que está no informe da corretora."
- "Taxas muito acima das praticadas no mercado podem ser sinal de golpe."

Todos sem marca, sem "você deveria", sem cor de julgamento e com a fonte quando há regra ou índice.

---

## (e2) A linha entre organizar e recomendar

A Clarevo não é consultoria, não é análise, não é distribuidora nem intermediária: não tem registro na CVM nem autorização do Banco Central para isso. O que a norma diz:

- **Resolução CVM 19/2021 (consultoria):** consultoria é orientação, recomendação e aconselhamento, de forma profissional, independente e **individualizada**, sobre investimentos no mercado de valores mobiliários, inclusive sobre **classes de ativos**, valores mobiliários específicos e prestadores de serviço. Sistemas automatizados e algoritmos seguem as mesmas regras e não diminuem a responsabilidade [49]. O Ofício-Circular nº 2/2026/CVM/SIN, de 19/01/2026, trouxe interpretações novas da norma [49].
- **Resolução CVM 20/2021 (análise):** relatório de análise é qualquer texto ou estudo sobre valores mobiliários específicos ou emissores, destinado a terceiros; a atividade é privativa de quem tem credenciamento em entidade autorizada pela CVM [50].
- **Resolução CVM 30/2021 (adequação ao perfil, "suitability"):** quem recomenda ou distribui precisa verificar se o produto se ajusta ao perfil de quem investe [51]. Um questionário de perfil que termina em sugestão de classe ou produto é atividade de quem tem esse dever.
- **Exercer atividade do mercado de valores mobiliários sem registro**, mesmo de graça, pode ser crime (Lei 6.385/1976, art. 27-E) **[conferir com a assessoria jurídica]**.
- **Títulos públicos e títulos bancários** (CDB, LCI, LCA, poupança) ficam fora do conceito de valor mobiliário da Lei 6.385/1976 **[conferir]**, mas a regra da Clarevo (nunca recomendar produto) vale para todos.

| Pode (organização) | Cuidado (precisa de texto e desenho neutros) | Não pode (vira recomendação) |
|---|---|---|
| Mostrar e somar o que a pessoa registrou | Comparar com CDI, IPCA e poupança: régua, sem "melhor" ou "pior" | Sugerir produto, emissor, instituição ou ativo |
| Calcular rentabilidade, ganho real e IR estimado pela lei | Alerta do FGC: fato e limite, sem dizer para onde mover | Ranking ou lista de "melhores taxas" ou "melhores ações" |
| Datas de vencimento, carência e lembretes | Aviso de taxa fora do comum: informativo, com link da CVM | "Carteira recomendada", questionário de perfil que leva a alocação |
| Alocação atual por classe, instituição e liquidez | Alocação-alvo digitada pela própria pessoa (item 24), só com parecer | Sugerir percentuais por classe, rebalancear, "está concentrado demais" |
| Simuladores com a taxa digitada pela pessoa e hipóteses escritas | Mostrar CDI e IPCA atuais ao lado do campo, com fonte e data | Sugerir taxa, prazo ou "momento" de comprar e vender |
| Educação geral com fonte oficial (Aprender) | Exemplos com números fictícios e calculados | Conteúdo sobre ativo específico com opinião (análise) |
| Resumo para conferir a declaração | Códigos da Receita com "confira no programa" | Dizer que a declaração está "pronta" ou "correta" |
| Links para fontes públicas (Receita, CVM, Tesouro, FGC) | | Link de afiliado, comissão por indicação ou botão "investir" |

**Para a assessoria jurídica** (complementa a pergunta 49 de `docs/legal/resumo-para-advogado.md`): (a) o IR estimado e o resumo para a declaração precisam de algum aviso além de "estimativa, confira com o informe"? (b) o alerta do FGC e o aviso de taxa fora do comum ficam do lado da organização? (c) a alocação-alvo digitada pela pessoa (item 24) cruza a linha da Resolução CVM 19? (d) ler o arquivo da Área do Investidor no aparelho tem alguma restrição contratual da B3?

---

## (f) O que NÃO fazer

1. **Não recomendar** produto, classe, emissor, instituição, percentual ou momento, nem por texto, nem por cor, nem por ordem de lista. Nada de "melhores", "oportunidade", "vale a pena".
2. **Não fazer questionário de perfil de quem investe** nem "descubra seu perfil": é dever de quem recomenda ou distribui (Resolução CVM 30).
3. **Não prometer rentabilidade** nem mostrar projeção como se fosse resultado: simulação sempre com hipótese escrita e o valor sem rendimento ao lado.
4. **Não ganhar dinheiro com indicação**: nada de link de afiliado, comissão, parceria de distribuição ou "abra sua conta". Isso mudaria a natureza da Clarevo (distribuição, assessoria) e criaria conflito de interesse.
5. **Não pedir senha de banco ou de corretora**, nem raspar tela. Consolidação só por arquivo que a pessoa baixa ou, no futuro, por canal regulado.
6. **Não guardar CPF, número de conta nem dados de terceiros** de arquivos e informes: descartar na leitura, como no comprovante.
7. **Não usar inteligência artificial para responder "onde investir"** (fora do ciclo e cruza a linha da CVM).
8. **Não mostrar cotação em tempo real, gráfico intradiário nem alerta de preço**: viraria app de negociação e estimula decisão por impulso.
9. **Não usar ranking, competição, sequência de dias ou comparação com outras pessoas** no aporte: sem pressão nem julgamento.
10. **Não chamar a estimativa de imposto de "imposto devido"** nem o resumo de "declaração pronta".
11. **Não espalhar regra de imposto pelo código**: num lugar só, com vigência e fonte, para mudar no dia em que a lei mudar.
12. **Não abrir investimentos para a Família ou para a empresa** sem decisão do Enzo e escolha ativa de cada pessoa; a empresa nunca vê, nem somado.
13. **Não contratar dado de mercado pago antes de medir demanda**: começar pelo que é público e gratuito.
14. **Não usar nome de marca nos textos do app** (bancos, corretoras, programas comerciais); o nome da instituição é só o que a pessoa digitar.

---

## Perguntas para o Enzo

1. A ficha ampliada (item 0) entra antes do lançamento ou logo depois?
2. Nomes dos títulos públicos: rótulo descritivo ("Título público com IPCA") ou nome oficial do Tesouro Nacional?
3. A Clarevo pode mostrar o valor estimado pela taxa contratada (item 8), sempre com "Usar este valor" por escolha da pessoa?
4. A ordem dos itens 1 a 11 está boa, ou alguma dor pesa mais para o público das empresas?
5. Importar o arquivo da B3 (item 18) entra no próximo ciclo?

**Respostas do Enzo (13/11/2026, D-099):** seguir as sugestões. (1) A ficha ampliada entra antes do lançamento. (2) Os títulos públicos usam os nomes
oficiais do Tesouro Nacional; o título para reserva lançado em 11/05/2026 se chama Tesouro Reserva (Ministério da Fazenda). (3) O valor estimado pela taxa
contratada entra, sempre com "Usar este valor". (4) A importação do arquivo da B3 fica para depois. A ordem dos itens 1 a 11 ficou como proposta; todos
entraram, e o simulador do item 10 ficou na aba Investir (`/investimento/comparar`), não na lista de calculadoras do site. Os códigos de Bens e Direitos
vieram de guias de corretoras (a página da Receita não abriu): a tela diz "como costuma aparecer nos guias. Confira no programa da Receita".

Decisões tomadas a partir deste estudo vão para `docs/00_VISAO_E_DECISOES.md`.

---

## Fontes

Todas acessadas em 12/11/2026 por resultados de busca. "Página não aberta" indica endereço bloqueado na rede desta sessão; o número veio do trecho da busca ou de reportagem que o reproduz.

1. ANBIMA. "ANBIMA lança a nona edição do Raio X do Investidor Brasileiro: 36% da população aplica em produtos financeiros". Abril de 2026. https://www.anbima.com.br/pt_br/noticias/anbima-lanca-a-nona-edicao-do-raio-x-do-investidor-brasileiro-36-da-populacao-aplica-em-produtos-financeiros.htm (página não aberta). Também: Monitor do Mercado, "Número de investidores no Brasil bate 60 milhões e deve crescer em 2026", abril de 2026, https://monitordomercado.com.br/noticias/377411-numero-de-investidores-no-brasil-bate-60-milhoes-e-deve-crescer-em-2026-diz-anbima/
2. ANBIMA. Raio X do Investidor Brasileiro, 9ª edição (PDF reproduzido pela Finsiders Brasil). Abril de 2026. https://uploads.finsidersbrasil.com.br/2026/04/Raio-X-do-Investidor-9-edicao.pdf
3. Finsiders Brasil. "Golpe financeiro já pegou um terço dos brasileiros". Abril de 2026. https://finsidersbrasil.com.br/estudos-e-relatorios/golpe-financeiro-ja-pegou-um-terco-dos-brasileiros/ e https://finsidersbrasil.com.br/?p=365771
4. InvesTalk (Banco do Brasil). "3 em cada 10 brasileiros não têm reserva financeira, mostra Raio-X da Anbima". Abril de 2026. https://investalk.bb.com.br/noticias/mercado/3-em-cada-10-brasileiros-nao-tem-reserva-financeira-mostra-raio-x-da-anbima
5. Times Brasil. "Brasileiro poupa mais, mas maioria ainda não investe". 2026. https://timesbrasil.com.br/investimentos/brasileiro-poupa-mais-mas-maioria-ainda-nao-investe/ ; Viva, "País deve ganhar 8,7 milhões de novos investidores em 2026", https://viva.com.br/dinheiro/pais-deve-ganhar-87-milhoes-de-novos-investidores-em-2026-calcula-anbima.html
6. Money Times / Seu Dinheiro. "Poupança, imóvel e cripto: estes são os investimentos que o brasileiro gosta, segundo o Raio-X da Anbima". Abril de 2026. https://www.moneytimes.com.br/poupanca-imovel-e-cripto-estes-sao-os-investimentos-que-o-brasileiro-gosta-segundo-o-raio-x-da-anbima/
7. ANBIMA. "Conhecimento sobre bancos digitais quase dobra em quatro anos, indica Raio X do Investidor Brasileiro". Abril e maio de 2026. https://www.anbima.com.br/pt_br/noticias/conhecimento-sobre-bancos-digitais-quase-dobra-em-quatro-anos-indica-raio-x-do-investidor-brasileiro.htm (página não aberta); BMC News, https://bmcnews.com.br/?p=415773
8. Correio da Manhã. "Investidores chegam a 36% no Brasil, com avanço desde 2021 e estabilidade em 2025". 28/04/2026. https://www.correiodamanha.com.br/economia/2026/04/281036-investidores-chegam-a-36-no-brasil-com-avanco-desde-2021-e-estabilidade-em-2025.html
9. ANBIMA. "Investimentos das pessoas físicas crescem 6,4% e somam R$ 9,1 trilhões no 1º semestre de 2026". Setembro de 2026. https://www.anbima.com.br/pt_br/noticias/investimentos-das-pessoas-fisicas-crescem-6-4-e-somam-r-9-1-trilhoes-no-1-semestre-de-2026-8A2AB2ABA05F4D8601A067CBAA4B0A4D-00.htm (página não aberta)
10. DGABC (Estadão Conteúdo). "Investimentos de pessoa física crescem 6,4% no 1º semestre, a R$ 9,141 tri, diz Anbima". Setembro de 2026. https://www.dgabc.com.br/Noticia/4344887/investimentos-de-pessoa-fisica-crescem-6-4-no-1-semestre-a-r-9-141-tri-diz-anbima ; InfoMoney, https://www.infomoney.com.br/?p=3476469
11. ANBIMA. "Investimento dos brasileiros cresce 15,5% e atinge a marca de R$ 8,5 trilhões em 2025". 2026. https://www.anbima.com.br/pt_br/imprensa/investimento-dos-brasileiros-cresce-15-5-e-atinge-a-marca-de-r-8-5-trilhoes-em-2025.htm (página não aberta); InfoMoney, "Investimento de pessoas físicas cresce 15,5% em 2025; CDBs lideram em volume", https://www.infomoney.com.br/?p=3224638
12. B3. "ETFs ganham 223 mil investidores em um ano e alcançam 862 mil CPFs na B3". 2026. https://www.b3.com.br/pt_br/noticias/etfs-ganham-223-mil-investidores-em-um-ano-e-alcancam-862-mil-cpfs-na-b3.htm
13. B3. "Avanço dos ETFs destacam evolução do investidor pessoa física na B3". 06/07/2026. https://b3.com.br/pt_br/noticias/avanco-dos-etfs-destacam-evolucao-do-investidor-pessoa-fisica-na-b3.htm ; B3, "Bolsa atrai 206 mil novos investidores em renda variável em 2025", https://www.b3.com.br/pt_br/noticias/bolsa-atrai-206-mil-novos-investidores-em-renda-variavel-em-2025-veja-estados-com-maior-representatividade.htm
14. B3. "Número de investidores em FIIs quase dobra em cinco anos". https://www.b3.com.br/pt_br/noticias/numero-de-investidores-em-fiis-quase-dobra-em-cinco-anos-e-mercado-se-torna-mais-acessivel-no-brasil-mostra-b3.htm ; Investidor10, "FIIs ganham 41 mil investidores em junho e chegam a 3,25 milhões de cotistas", 2026, https://investidor10.com.br/noticias/fiis-ganham-41-mil-investidores-em-junho-e-chegam-a-3-25-milhoes-de-cotistas-121556/
15. B3. "Raio X da investidora: quem são as mulheres que investem na bolsa". Março de 2026. https://www.b3.com.br/pt_br/noticias/raio-x-da-investidora-quem-sao-as-mulheres-que-investem-na-bolsa.htm
16. Tesouro Nacional. Balanço do Tesouro Direto, junho de 2026 (PDF). https://cdn.tesouro.gov.br/sistemas-internos/apex/producao/sistemas/thot/arquivos/publicacoes/55174_1725700/Balanço%20TD%20-%20Junho%202026.pdf (página não aberta)
17. Tesouro Nacional. Balanços do Tesouro Direto de fevereiro e maio de 2026 (PDF). https://cdn.tesouro.gov.br/sistemas-internos/apex/producao/sistemas/thot/arquivos/publicacoes/54144_1744607/Balanço%20TD%20-%20Fevereiro%202026.pdf e https://cdn.tesouro.gov.br/sistemas-internos/apex/producao/sistemas/thot/arquivos/publicacoes/54934_1718260/Balanço%20TD%20-%20Maio%202026.pdf (páginas não abertas)
18. O Povo (Agência Brasil). "Vendas do Tesouro Direto atingem segundo melhor resultado da história". 28/07/2026. https://www.opovo.com.br/noticias/economia/2026/07/28/vendas-do-tesouro-direto-atingem-segundo-melhor-resultado-da-historia.html ; Portal Tela, maio de 2026, https://www.portaltela.com/noticias/economia/2026/06/25/tesouro-direto-registra-emissao-liquida-de-r-607-bilhoes-em-maio/
19. B3. "Secretaria do Tesouro Nacional e B3 lançam Tesouro Reserva com operação 24h nos 7 dias da semana (24x7), em parceria com Banco do Brasil". 11/05/2026. https://www.b3.com.br/pt_br/noticias/secretaria-do-tesouro-nacional-e-b3-lancam-tesouro-reserva-com-operacao-24h-nos-7-dias-da-semana-24x7-em-parceria-com-banco-do-brasil.htm ; InvesTalk, "Tesouro Reserva não terá marcação a mercado e será negociado 24 h/dia", https://investalk.bb.com.br/noticias/mercado/exclusivo-tesouro-reserva-nao-tera-marcacao-a-mercado-e-sera-negociado-24-hdia
20. Tesouro Direto. "Entenda a nova taxa de custódia". https://www.tesourodireto.com.br/b/entenda-a-nova-taxa-de-custodia ; B3, Ofício Circular 014/2024 (política de tarifação, cobrança no resgate), https://b3.com.br/data/files/CC/A7/6E/11/CC543910B371F339AC094EA8/OC%20014-2024-VPC%20Pol%C3%ADtica%20de%20tarifa%C3%A7%C3%A3o%20do%20Tesouro%20Direto_cobranca_semestral.pdf
21. Rankia (dados do Banco Central). "Poupança perde R$ 9,35 bilhões em setembro e saques do ano já somam R$ 66,4 bi". Outubro de 2026. https://rankia.com.br/poupanca-setembro-2026-saques-9-35-bilhoes-66-bi-ano/
22. Banco Central do Brasil. Remuneração dos depósitos de poupança e Circular 3.975. https://www.bcb.gov.br/pec/poupanca/poupanca.asp?frame=1 e https://www.bcb.gov.br/content/estabilidadefinanceira/especialnor/Circular3975.pdf
23. Metrópoles. "Copom mantém taxa Selic e juros ficam em 13,75% ao ano". 04/11/2026. https://www.metropoles.com/brasil/copom-mantem-taxa-selic-e-juros-ficam-em-1375-ao-ano ; Correio da Manhã, "Copom reduz taxa de juros para 14%", agosto de 2026, https://www.correiodamanha.com.br/economia/2026/08/amp/308529-copom-reduz-taxa-de-juros-para-14-a-menor-desde-marco-de-2025.html
24. Agência Gov. "Prévia da inflação de outubro é menor, com queda de preços de água e luz". Outubro de 2026. https://agenciagov.ebc.com.br/noticias/202610/previa-da-inflacao-de-outubro-e-menor-com-queda-de-precos-de-agua-e-luz ; JB, https://www.jb.com.br/economia/2026/10/1061328-previa-da-inflacao-ipca-15-sobe-032-em-outubro-e-acumula-462-em-12-meses.html
25. O Povo. "Câmara tira de pauta MP alternativa ao IOF e texto caduca". 08/10/2025. https://mais.opovo.com.br/jornal/politica/2025/10/08/camara-tira-de-pauta-mp-alternativa-ao-iof-e-texto-caduca.html ; Nord Investimentos, https://www.nordinvestimentos.com.br/blog/camara-derruba-mp-1303-aumento-impostos/
26. Seu Dinheiro. "LCIs, LCAs e outros isentos voltam à mira do governo e podem passar a ter IOF, diz jornal". Outubro de 2026. https://www.seudinheiro.com/2026/renda-fixa/lcis-lcas-e-outros-isentos-voltam-a-mira-do-governo-e-podem-passar-a-ter-iof-diz-jornal-mlim/ ; Economic News Brasil, 28/10/2026, https://economicnewsbrasil.com.br/2026/10/28/iof-em-investimentos-isentos/ ; Capital Aberto, novembro de 2026, https://capitalaberto.com.br/regulacao/2026/11/tributacao-de-lci-e-lca-pode-mudar-estrutura-de-captacao
27. Lei 15.270, de 26/11/2025 (texto). https://www.lex.com.br/lei-no-15-270-de-26-de-novembro-de-2025/ ; Jornal Contábil, "Lei 15.270 define regras para taxação de lucros e dividendos a partir de 2026", https://jornalcontabil.com.br/noticia/lei-15-270-define-regras-para-taxacao-de-lucros-e-dividendos-a-partir-de-2026/ ; Jettax, tabela do IR de 2026, https://www.jettax.com.br/?p=20818
28. Pinheiro Guimarães. "Sancionada lei complementar que reduz incentivos e benefícios tributários federais, eleva o IRRF sobre JCP e aumenta alíquota da CSLL". 29/12/2025. https://www.pinheiroguimaraes.com.br/sancionada-lei-complementar-que-reduz-incentivos-e-beneficios-tributarios-federais-eleva-o-irrf-sobre-jcp-e-aumenta-aliquota-da-csll/ ; Receita Federal, Nota Cetad/Coest nº 009/2026, https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/estudos/notas-cetad/notas-tecnicas/2026/nota-cetad-coest-no-009-2026
29. Lei 14.754/2023 (texto atualizado, Câmara dos Deputados). https://www2.camara.leg.br/legin/fed/lei/2023/lei-14754-12-dezembro-2023-795058-normaatualizada-pl.pdf ; B3 Bora Investir sobre FII e Fiagro, https://borainvestir.b3.com.br/tipos-de-investimentos/renda-variavel/fundos-investimento/fiis-e-fiagros-vao-perder-isencao-entenda-o-que-muda-no-ir/
30. Instrução Normativa RFB 2.291, de 14/11/2025 (DeCripto). https://www.legisweb.com.br/legislacao/?id=489016 ; Mattos Filho, https://www.mattosfilho.com.br/unico/decripto-receita-federal-ocde/
31. InvesTalk (Banco do Brasil). "VGBL e PGBL: o que você precisa saber para investir na previdência privada sem surpresas". 2026. https://investalk.bb.com.br/noticias/mercado/vgbl-e-pgbl-o-que-voce-precisa-saber-para-investir-na-previdencia-privada-sem-surpresas ; MAG, regime tributário, https://blog.mag.com.br/mudanca-tributacao-previdencia-privada/
32. IRIB. Resolução CMN 5.215, de 22/05/2025 (prazos mínimos de LCI e LCA). https://www.irib.org.br/resolucao-cmn-n-5-215-de-22-de-maio-de-2025/ ; Nord Investimentos, https://www.nordinvestimentos.com.br/blog/novo-prazo-minimo-de-vencimento-de-lca-e-lci/
33. BNDES. Letras de Crédito do Desenvolvimento (cobertura do FGC pela Resolução CMN 5.169/2024). https://www.bndes.gov.br/wps/portal/site/home/transparencia/prestacao-de-contas/fontes-de-recursos/letras-credito-desenvolvimento-bndes/letras-de-credito-do-desenvolvimento-do-bndes ; InfoMoney, https://www.infomoney.com.br/?p=2678825
34. FGC. "Sobre a garantia FGC". https://www.fgc.org.br/en/sobre-garantia-fgc ; Meelion, "FGC após o Banco Master", 2026, https://www.meelion.com/blog/mercado-financeiro/noticias/fgc-apos-o-banco-master/ ; IstoÉ Dinheiro, "CMN endurece regras para bancos captarem recursos com garantia do FGC", 23/04/2026, https://istoedinheiro.com.br/cmn-endurece-regras-para-bancos-captarem-recursos-com-garantia-do-fgc
35. InfoMoney. "Debêntures isentas batem recorde no ano, com R$ 150,7 bi até novembro". Dezembro de 2025. https://www.infomoney.com.br/onde-investir/debentures-isentas-batem-recorde-no-ano-com-r-1507-bi-ate-novembro/ ; InfoMoney, mercado de capitais no 1º semestre de 2026, https://www.infomoney.com.br/?p=3427669 ; ANBIMA, ofertas do 1º semestre de 2026, https://www.anbima.com.br/pt_br/imprensa/com-r-361-8-bilhoes-em-ofertas-mercado-de-capitais-encerra-o-1-semestre-de-2026-com-volume-recorde-8A2AB2969F870D89019FA53D5F7208D8-00.htm (página não aberta)
36. NeoFeed. "Efeito Ambipar, novas regras e juros altos redesenham o mercado de COEs". Junho de 2026. https://neofeed.com.br/negocios/efeito-ambipar-novas-regras-e-juros-altos-redesenham-o-mercado-de-coes/ ; B3 Bora Investir, "Estoque de COE atinge recorde de R$ 100 bilhões em fevereiro", https://borainvestir.b3.com.br/tipos-de-investimentos/estoque-de-coe-atinge-recorde-de-r-100-bilhoes-em-fevereiro-na-b3/
37. B3 Bora Investir. "Como declarar BDRs no Imposto de Renda 2026". https://borainvestir.b3.com.br/noticias/imposto-de-renda/renda-variavel-imposto-de-renda/como-declarar-bdrs-no-imposto-de-renda-2026-veja-guia-completo-para-nao-cometer-erros/ ; Mapfre, cartilha de previdência 2026, https://www.mapfre.com.br/media/cartilha_2026_mprev.pdf ; CNN Brasil, "Imposto de Renda 2026: veja como declarar investimentos", https://www.cnnbrasil.com.br/economia/macroeconomia/imposto-de-renda-2026-veja-como-declarar-investimentos/ ; InvesTalk, ações e ETFs, https://investalk.bb.com.br/noticias/mercado/declarar-acoes-e-etfs
38. B3 Bora Investir. "Receita começa a receber declarações do IR 2026". Março de 2026. https://borainvestir.b3.com.br/noticias/imposto-de-renda/receita-comeca-a-receber-declaracoes-do-ir-2026-veja-prazo-para-enviar-e-saiba-como-fazer/ ; "IR 2026: Receita prevê receber 44 milhões de declarações e 60% delas na opção pré-preenchida", https://borainvestir.b3.com.br/noticias/imposto-de-renda/ir-2026-receita-preve-receber-44-milhoes-de-declaracoes-e-60-delas-na-opcao-pre-preenchida/
39. B3. "Plataforma da B3 que consolida investimentos de diferentes corretoras passa a incluir ativos de renda fixa". Outubro de 2025. https://www.b3.com.br/pt_br/noticias/plataforma-da-b3-que-consolida-investimentos-de-diferentes-corretoras-passa-a-incluir-ativos-de-renda-fixa.htm ; B3, Área do Investidor, https://b3.com.br/pt_br/produtos-e-servicos/central-depositaria/canal-com-investidores/area-do-investidor/
40. B3. "Integrações da Área do Investidor (APIs)". https://b3.com.br/pt_br/produtos-e-servicos/central-depositaria/canal-com-investidores/integracoes-da-area-do-investidor-apis/ ; B3, Ofício Circular 177/2024, nova tarifação das APIs a partir de 02/01/2025, https://b3.com.br/data/files/D8/E6/92/49/4BAB39107A1B8539AC094EA8/OC%20177-2024%20PRE%20Nova%20tarifacao%20-%20APIs%20Area%20do%20Investidor%20da%20B3%20(PT).pdf
41. B3. Market data, perguntas frequentes de distribuidores. https://b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/distribuidores/perguntas-frequentes/ ; B3, Ofício Circular 036/2026, política de market data, https://www.b3.com.br/data/files/52/45/4B/4E/BACFF91094DCD8F9AC094EA8/OC%20036-2026%20PRE%20Vers%C3%A3o%20Atualizada%20Pol%C3%ADtica%20de%20Market%20Data%20(PT)%20V1.2.pdf ; brapi, "A brapi é distribuidora licenciada da B3?", https://brapi.dev/faq/a-brapi-e-distribuidora-licenciada-da-b3
42. InfoMoney. "Open Investments: nova etapa do Open Finance agora abarca os investidores". 2023. https://www.infomoney.com.br/minhas-financas/open-investments-nova-etapa-do-open-finance-agora-abarca-os-investidores-veja-o-que-muda-na-pratica/ ; Gorila, "Open Investment faz 3 anos: uso cresce, mas mercado ainda busca caso de sucesso", 14/09/2026, https://gorila.com.br/blog/open-investment-faz-3-anos/ ; Gorila, "Bancos digitais entram no Open Investment", https://gorila.com.br/blog/bancos-digitais-entram-no-open-investment-e-aceleram-transformacao-do-wealth-management/ ; Finsiders, "Open Finance já destrava mais de R$ 30 bi em crédito, aponta BC", https://finsidersbrasil.com.br/regulamentacao/open-finance-ja-destrava-mais-de-r-30-bi-em-credito-aponta-bc/
43. Let's Money. "Open Finance: parceiras, autorização e a Resolução 21". Outubro de 2026. https://www.letsmoney.com.br/noticias/open-finance-parceiras-autorizacao-resolucao-21/ ; Capital Aberto, "BC endurece regras de parcerias no Open Finance", outubro de 2026, https://capitalaberto.com.br/regulacao/2026/10/bc-endurece-regras-de-parcerias-no-open-finance
44. Renova Invest. "App Kinvo vale a pena conhecer em 2026? Análise honesta da plataforma". Julho de 2026. https://renovainvest.com.br/?p=19889 ; Reclame Aqui, reclamações de 2026, https://www.reclameaqui.com.br/kinvo/novo-problema-com-kinvo-delay-nas-informacoes-da-carteira_qAszXlW2hoqrYRNk/ ; Finsiders, "BTG Pactual paga R$ 72 milhões pela Kinvo", https://finsidersbrasil.com.br/noticias-sobre-fintechs/btg-pactual-paga-r-72-pela-kinvo-plataforma-de-consolidacao-de-investimentos-para-reforcar-marca-digital
45. Gorila. Termos de uso. https://gorila.com.br/termos-de-uso/
46. Status Invest. Carteira de investimentos. https://statusinvest.com.br/produtos/carteira-de-investimentos ; iDinheiro, "Status Invest: conheça a ferramenta", https://www.idinheiro.com.br/investimentos/status-invest/
47. Investidor10. "Investidor10: plataforma de análise de investimentos, gestão de carteira e IRPF". 2026. https://investidor10.com.br/conteudo/investidor10-o-que-e-a-plataforma-como-funciona-e-quais-recursos-oferece-aos-investidores-120727/
48. Tesouro Direto. Simulador de rendimento. https://www.tesourodireto.com.br/en/simuladores/rendimento ; Banco Central, Calculadora do Cidadão, https://www3.bcb.gov.br/CALCIDADAO/ e apresentação https://www.bcb.gov.br/secre/apres/JoseDeodoroCalculadora.pdf
49. CVM. Resolução CVM 19/2021, texto consolidado. https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/001/resol019consolid.pdf ; CompliAsset, "CVM divulga interpretações sobre consultoria de valores mobiliários" (Ofício-Circular nº 2/2026/CVM/SIN, 19/01/2026), https://www.compliasset.com/?p=13083
50. CVM. Resolução CVM 20/2021, texto consolidado. https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/001/resol020consolid.pdf
51. CVM. Resolução CVM 30/2021. https://www.gov.br/cvm/en/foreign-investors/regulation-files/RESOLUTIONCVM30_.pdf ; ANBIMA, "Dispensa do suitability para o Tesouro Educa+ e para o Tesouro Renda+ é renovada", comunicado 2025-000001, https://www.anbima.com.br/pt_br/autorregular/comunicados/integra/comunicado/dispensa-do-suitability-para-o-tesouro-educa-e-para-o-tesouro-renda-e-renovada/numero/2025-000001.htm (página não aberta); Monitor Mercantil, https://monitormercantil.com.br/mais-tempo-indeterminado-para-dispensa-do-suitability/
52. CVM. CVM Comportamental, volume 1: vieses do investidor. https://www.gov.br/investidor/pt-br/educacional/publicacoes-educacionais/cvm-comportamental/volume-1-vieses-do-investidor.pdf ; CVM, Relatório "Perfil e Comportamento do Investidor 2024" (coleta de 15/01 a 15/02/2025, 1.371 respostas), https://www.gov.br/investidor/pt-br/educacional/publicacoes-educacionais/pesquisas/relatorio-perfil-e-comportamento-do-investidor-2024.pdf ; InfoMoney, "Investidor brasileiro mira aposentadoria, mostra pesquisa da CVM", setembro de 2025, https://www.infomoney.com.br/?p=3026748
53. CVM. Dados abertos: Fundos de Investimento, Informe Diário (licença ODbL). https://dados.cvm.gov.br/dataset/groups/fi-doc-inf_diario
54. Tesouro Transparente. Metadados de "Taxas dos Títulos Ofertados pelo Tesouro Direto" (série diária). https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/1a8eb2e3-4902-4a38-a1eb-6410f23d90de/download/Taxa.pdf
55. Decreto 6.306, de 14/12/2007 (IOF), no Senado. https://legis.senado.leg.br/norma/570935/publicacao/15741229
56. Lei 11.033/2004 (tabela regressiva, isenção de ações até R$ 20 mil em vendas no mês) e Lei 9.250/1995: regras conhecidas e repetidas pelos guias de 2026; o texto da lei não foi aberto nesta sessão **[conferir no Planalto e em "Perguntas e Respostas IRPF" da Receita]**. Guias: Fiscalia, "Rendimentos de aplicações financeiras no IRPF 2026", https://fiscalia.app/blog/rendimentos-aplicacoes-financeiras-irpf-2026-guia-completo ; Jettax, https://www.jettax.com.br/?p=20818
57. Seu Dinheiro. "FGC: novas regras passam a valer nesta segunda; veja o que muda". 2026. https://www.seudinheiro.com/2026/economia/fgc-novas-regras-passam-valer-nesta-segunda-veja-que-muda-garg/ ; Money Times, "FGC aperta as regras para evitar novos casos Master", https://www.moneytimes.com.br/fgc-aperta-as-regras-para-evitar-novos-casos-master-rnda/
58. Banco Central do Brasil. Sistema Gerenciador de Séries Temporais (SGS). https://www3.bcb.gov.br/sgspub/ (séries 11 Selic diária, 12 CDI diário, 432 meta Selic, 433 IPCA, 4391 CDI no mês, 195 poupança **[conferir códigos 195 e da TR]**)
59. InfoMoney. "B3 alcança marca de 4 milhões de contas de pessoas físicas em outubro; número de investidores chega a 3,4 milhões". 2021. https://www.infomoney.com.br/?p=1725992
60. CVM, Portal do Investidor. "Pirâmides financeiras e esquemas Ponzi". https://www.gov.br/investidor/pt-br/investir/cuidados-ao-investir/evitando-problemas/principais-fraudes-e-esquemas-irregulares/piramides-financeiras-e-esquemas-ponzi
61. B3. Book Pessoa Física, 1º trimestre de 2026 e 2º trimestre de 2025 (PDF). https://b3.com.br/data/files/EA/80/8F/5D/FDFDD910E7DB5DD9AC094EA8/Book%20PF%201TRI%202026.pdf e https://www.b3.com.br/data/files/9D/00/48/94/7CB589100A29E189AC094EA8/Book%20PF%202TRI%202025.pdf (não abertos nesta sessão; números do 2º trimestre de 2025 pelo trecho da busca)
62. B3. "Tesouro RendA+ completa três anos com recorde de investidores". https://www.b3.com.br/pt_br/noticias/tesouro-renda-completa-tres-anos-com-recorde-de-investidores.htm
