# Aprender e dúvidas: catálogo, fontes e revisões

09/10/2026 · conteúdo em `packages/core/src/learn` (D-031 e D-032). Este documento registra o catálogo, como cada fato foi conferido, os temas em rascunho e o que falta, e as revisões feitas. Ao mudar um tema, atualize este arquivo junto.

## 1. Como funciona

- **Onde fica:** os temas estão em `packages/core/src/learn/topics/` (um arquivo por seção), com o formato de `learn/types.ts`. O app só mostra o que o core entrega (`lib/learn.ts`); não há conteúdo baixado de servidor nem nada gravado sobre leituras e buscas (D-032(6)).
- **Situação:** `publicado` aparece na aba, na busca, nos temas relacionados e nos links das telas; `rascunho` não aparece em lugar nenhum, e o endereço dele mostra "Este conteúdo não está disponível.". Rascunho sempre lista o que falta (`pending`).
- **Quem confere:** `npm test` roda a validação do catálogo (`learn-catalog.test.ts`): tamanhos, fontes, domínios, datas de consulta, decisões citadas (lidas deste repositório, em `docs/00`), prazos de revisão, números conferidos e hipóteses. `copy.test.ts` confere os termos proibidos, `learn-search.test.ts` a busca e `learn-links.test.ts` os links das telas. As regras estão em `docs/02_REGRAS_FINANCEIRAS.md`, seção "Aprender e dúvidas".
- **Números:** todo "R$" e todo "%" de um tema publicado sai das contas de `learn/math.ts` (os resultados esperados ficam em `learn/examples.ts`) ou de um fato de norma declarado no tema, com a fonte (por exemplo, "8% ao mês" no cheque especial).

## 2. Catálogo

37 temas: 35 publicados e 2 rascunhos. Por seção, publicados: Usar o Clarevo 8, Organizar o mês 3, Juros e crédito 13, Dinheiro no tempo 4 e Dúvidas frequentes 7. "Comece por aqui": `diferenca`, `juros-simples-compostos` e `gasto-fixo`. Leitura a 200 palavras por minuto, contando título, subtítulo, parágrafos e exemplo. A calculadora é a de "Fazer a conta com os seus números" (sem a taxa, D-035(2)).

| # | Slug | Título | Seção | Tipo | Situação | Revisar até | Leitura | Calculadora | Apelidos |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `diferenca` | Diferença do mês | Usar o Clarevo | tema | publicado | - | 1 min (70 palavras) | - | - |
| 2 | `realizado-previsto` | Realizado e previsto | Usar o Clarevo | tema | publicado | - | 1 min (143 palavras) | - | - |
| 3 | `saldo` | Diferença do mês e saldo da conta | Usar o Clarevo | tema | publicado | - | 1 min (67 palavras) | - | - |
| 4 | `fatura` | Fatura sem contar duas vezes | Usar o Clarevo | tema | publicado | - | 1 min (62 palavras) | - | - |
| 5 | `gasto-fixo` | Gasto fixo, conta a pagar e gasto anotado | Usar o Clarevo | tema | publicado | - | 1 min (65 palavras) | - | - |
| 6 | `estimativa` | Contas que mudam de valor | Usar o Clarevo | tema | publicado | - | 1 min (85 palavras) | - | - |
| 7 | `parcelamentos` | Parcelamentos no Clarevo | Usar o Clarevo | tema | publicado | - | 1 min (123 palavras) | - | - |
| 8 | `sem-registro` | Mês sem registro | Usar o Clarevo | tema | publicado | - | 1 min (99 palavras) | - | - |
| 9 | `gasto-fixo-variavel` | Gasto fixo e gasto variável | Organizar o mês | tema | publicado | 09/10/2027 | 1 min (193 palavras) | - | - |
| 10 | `contas-do-ano` | Contas que chegam uma vez por ano | Organizar o mês | tema | publicado | 09/10/2027 | 2 min (205 palavras) | `parcelado-ou-a-vista?modo=cota-unica` | - |
| 11 | `orcamento-50-30-20` | Orçamento e a referência 50-30-20 | Organizar o mês | tema | rascunho | 09/10/2027 | 1 min (140 palavras) | - | - |
| 12 | `reserva-imprevistos` | Reserva para imprevistos | Organizar o mês | tema | publicado | 09/10/2027 | 1 min (193 palavras) | `reserva` | `reservas` |
| 13 | `juros-simples-compostos` | Juros simples e juros compostos | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (140 palavras) | `custo-da-divida` | `juros`, `juros-compostos` |
| 14 | `taxa-mes-ano` | Taxa ao mês e taxa ao ano | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (147 palavras) | `custo-da-divida` | `taxa-mensal-anual` |
| 15 | `taxa-e-tarifa` | Taxa, tarifa e encargo | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (100 palavras) | - | - |
| 16 | `cet` | CET, o Custo Efetivo Total | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (174 palavras) | `custo-da-divida?modo=emprestimo` | - |
| 17 | `iof-credito` | IOF no crédito | Juros e crédito | tema | publicado | 09/04/2027 | 1 min (132 palavras) | - | - |
| 18 | `parcelado-ou-a-vista` | Parcelado, sem juros ou à vista | Juros e crédito | tema | publicado | 09/10/2027 | 2 min (241 palavras) | `parcelado-ou-a-vista` | - |
| 19 | `rotativo-cartao` | Rotativo do cartão e parcelamento da fatura | Juros e crédito | tema | publicado | 09/04/2027 | 2 min (283 palavras) | `custo-da-divida?modo=rotativo` | `cartao-rotativo` |
| 20 | `cheque-especial` | Cheque especial | Juros e crédito | tema | publicado | 09/04/2027 | 1 min (137 palavras) | `custo-da-divida?modo=cheque_especial` | - |
| 21 | `amortizacao-price-sac` | Amortização, Tabela Price e SAC | Juros e crédito | tema | publicado | 09/10/2027 | 2 min (201 palavras) | - | `juros-no-parcelamento` |
| 22 | `quitar-antes` | Quitar antes do prazo | Juros e crédito | tema | publicado | 09/10/2027 | 2 min (247 palavras) | `quitar-antes` | - |
| 23 | `multa-juros-atraso` | Multa e juros por atraso | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (183 palavras) | `multa-e-juros` | `atraso` |
| 24 | `score-credito` | Score de crédito | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (187 palavras) | - | - |
| 25 | `superendividamento` | Quando as dívidas não cabem na renda | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (162 palavras) | - | - |
| 26 | `inflacao-ipca` | Inflação e IPCA | Dinheiro no tempo | tema | publicado | 09/10/2027 | 1 min (174 palavras) | - | `inflacao` |
| 27 | `selic` | Selic, a taxa básica de juros | Dinheiro no tempo | tema | publicado | 09/10/2027 | 1 min (200 palavras) | - | - |
| 28 | `liquidez-risco-retorno` | Liquidez, risco e retorno | Dinheiro no tempo | tema | publicado | 09/10/2027 | 1 min (170 palavras) | - | `liquidez` |
| 29 | `fgc` | Garantia do FGC | Dinheiro no tempo | tema | publicado | 09/10/2027 | 1 min (141 palavras) | - | - |
| 30 | `quem-ve-meus-dados` | Quem vê meus dados? | Dúvidas frequentes | pergunta | publicado | - | 1 min (42 palavras) | - | - |
| 31 | `empresa-ve` | A empresa que oferece o benefício vê meus gastos? | Dúvidas frequentes | pergunta | publicado | - | 1 min (38 palavras) | - | - |
| 32 | `demonstracao` | O que é a demonstração? | Dúvidas frequentes | pergunta | publicado | - | 1 min (31 palavras) | - | - |
| 33 | `marcar-como-paga` | Como marcar uma conta como paga? | Dúvidas frequentes | pergunta | publicado | - | 1 min (62 palavras) | - | - |
| 34 | `contei-duas-vezes` | Anotei duas vezes. Como corrigir? | Dúvidas frequentes | pergunta | publicado | - | 1 min (64 palavras) | - | - |
| 35 | `voltei-depois` | Fiquei um tempo sem abrir o app. O que acontece? | Dúvidas frequentes | pergunta | publicado | - | 1 min (87 palavras) | - | - |
| 36 | `apagar-dados` | Como apagar meus dados? | Dúvidas frequentes | pergunta | rascunho | 09/10/2027 | 1 min (45 palavras) | - | - |
| 37 | `o-que-o-clarevo-nao-faz` | O Clarevo se conecta ao meu banco ou indica investimentos? | Dúvidas frequentes | pergunta | publicado | - | 1 min (58 palavras) | - | - |

Os slugs antigos abrem o tema novo pelos apelidos. Entram depois: `renda-comprometida` e `renda-variavel` (Ciclo B), `aporte` e `essenciais` (Ciclo C) e `simulacao` (Ciclo D).

Temas que citam só decisões do Clarevo (sem revisão periódica; números só dos exemplos fictícios):

| Slug | Título | Seção | Decisões citadas |
|---|---|---|---|
| `diferenca` | Diferença do mês | Usar o Clarevo | D-005, D-011 |
| `realizado-previsto` | Realizado e previsto | Usar o Clarevo | D-020, D-021 |
| `saldo` | Diferença do mês e saldo da conta | Usar o Clarevo | D-011 |
| `fatura` | Fatura sem contar duas vezes | Usar o Clarevo | D-020 |
| `gasto-fixo` | Gasto fixo, conta a pagar e gasto anotado | Usar o Clarevo | D-024 |
| `estimativa` | Contas que mudam de valor | Usar o Clarevo | D-024 |
| `parcelamentos` | Parcelamentos no Clarevo | Usar o Clarevo | D-024 |
| `sem-registro` | Mês sem registro | Usar o Clarevo | D-030 |
| `quem-ve-meus-dados` | Quem vê meus dados? | Dúvidas frequentes | D-006, D-012 |
| `empresa-ve` | A empresa que oferece o benefício vê meus gastos? | Dúvidas frequentes | D-006 |
| `demonstracao` | O que é a demonstração? | Dúvidas frequentes | D-013, D-016 |
| `marcar-como-paga` | Como marcar uma conta como paga? | Dúvidas frequentes | D-021 |
| `contei-duas-vezes` | Anotei duas vezes. Como corrigir? | Dúvidas frequentes | D-021, D-024 |
| `voltei-depois` | Fiquei um tempo sem abrir o app. O que acontece? | Dúvidas frequentes | D-024, D-029, D-030 |
| `o-que-o-clarevo-nao-faz` | O Clarevo se conecta ao meu banco ou indica investimentos? | Dúvidas frequentes | D-008, D-023, D-034 |

## 3. Método de conferência das fontes

1. **Por que busca na web.** Os sites oficiais (planalto.gov.br, bcb.gov.br, gov.br, in.gov.br) não abrem a partir do ambiente de trabalho: a tentativa de abrir a página de normativos do Banco Central falhou por DNS. Por isso, cada fato foi conferido com a ferramenta de busca, em 09/10/2026.
2. **O que conta como confirmado.** Um fato citado (número de lei, artigo, limite, percentual, data) só entra se o trecho de um resultado de busca da **própria fonte** o confirmar: página oficial ou, para as fontes privadas de P-024, a página da própria entidade. Resenhas, blogs, sites de bancos e cópias não oficiais não contam.
3. **O que fica registrado.** Para cada fonte do tema: instituição, título, endereço exato da página (sempre tirado do resultado da busca), o trecho que confirma o fato (`locator`) e a data da consulta (`consultedOn`, 09/10/2026). A seção 4 guarda, por tema, a fonte, o endereço, o trecho e a data; as páginas de resultado das buscas não foram guardadas no repositório. Nunca se inventa endereço nem data.
4. **Fato não confirmado.** A frase sai ou é reescrita com o que a fonte diz (os ajustes estão na seção 4); se o tema não se sustenta sem o fato, ele fica em rascunho, com o que falta (seção 5).
5. **Domínios aceitos** (`OFFICIAL_SOURCE_DOMAINS` e `MARKET_SOURCE_DOMAINS`, em `learn/validate.ts`): oficiais terminados em `gov.br`, `leg.br`, `jus.br` e `def.br`, sempre em `https`; de mercado, `fgc.org.br` só no tema `fgc` e `serasa.com.br` só em `renda-comprometida` (Ciclo B). A especificação de 08/10/2026 aceitava só `gov.br`, `stf.jus.br` e `fgc.org.br`; a lista cresceu porque vários fatos foram confirmados em páginas oficiais da Câmara e do Senado (`leg.br`), do STJ e do TRF3 (`jus.br`) e de uma Defensoria Pública (`def.br`). Obra publicada entra sem endereço, como "obra".
6. **Fatos conferidos de novo em 09/10/2026** (17 buscas): teto de 8% ao mês do cheque especial (Res. CMN 4.765/2019, art. 3º); IOF de pessoa física (0,0082% ao dia e 0,38%); mínimo existencial de R$ 600,00 (Decreto 11.567/2023) e a decisão do STF (Informativo 1214); FGC (R$ 250 mil por instituição e R$ 1 milhão a cada 4 anos; entidade privada sem fins lucrativos; o que passa do limite fica na liquidação); meta de inflação de 3% com intervalo de 1,50% a 4,50%; limite do rotativo (Lei 14.690/2023, art. 28, § 1º, desde 3/1/2024, com o IOF fora); Copom com oito reuniões ordinárias por ano; serviços essenciais da Res. CMN 3.919/2010 (cartão de débito, quatro saques, duas transferências e consultas pela internet); CDC art. 52, § 1º (multa de 2%) e § 2º (quitação antecipada); ANEEL REN 1.000/2021, art. 343; Res. CMN 3.516/2007 (sem tarifa de liquidação antecipada) e a data de 10/12/2007 no STJ; CVM (6 a 12 meses de gastos); IBGE (famílias de 1 a 40 salários mínimos no IPCA); direitos da Lei 12.414/2011; LGPD art. 18. Todas confirmaram o texto, menos a divisão 50-30-20 no próprio livro.

## 4. Fontes e fatos por tema

Temas com fonte externa, na ordem do catálogo. "Fonte n" nos fatos de norma é a posição na lista do tema.

### `gasto-fixo-variavel` · Gasto fixo e gasto variável (publicado)

Revisar até 09/10/2027 (12 meses).

1. Oficial. Banco Central do Brasil: Caderno de Educação Financeira: Gestão de Finanças Pessoais (Conteúdo Básico), 2013. <https://www.bcb.gov.br/pre/pef/port/caderno_cidadania_financeira.pdf>. Trecho: Módulo 2, orçamento pessoal ou familiar; despesas fixas são as que não variam ou variam muito pouco, como o aluguel e a prestação de um financiamento. Consulta: 09/10/2026.
2. Oficial. CVM, Portal do Investidor: Guia de Planejamento Financeiro. <https://www.gov.br/investidor/pt-br/educacional/publicacoes-educacionais/guias/guia-de-planejamento-financeiro/guia-planejamento-financeiro.pdf/@@display-file/file>. Trecho: Registrar as despesas que não são mensais, como impostos, seguros e matrículas. Consulta: 09/10/2026.
3. Oficial. CVM, Portal do Investidor: Planejamento e gestão de reservas financeiras. <https://www.gov.br/investidor/pt-br/penso-logo-invisto/planejamento-e-gestao-de-reservas-financeiras>. Trecho: Reserva só para imprevistos, o que exclui gastos sazonais e previsíveis, como tributos e matrículas. Consulta: 09/10/2026.
4. Clarevo: D-024.

Ressalvas e ajustes:

- Definição de gasto variável (parágrafo 1, 2ª metade): o trecho do caderno do BCB não trouxe a definição de "despesas variáveis"; a definição só apareceu numa cartilha de banco público (não citada). É conceito, não número nem norma; publicado.

### `contas-do-ano` · Contas que chegam uma vez por ano (publicado)

Calculadora: `/calcular/parcelado-ou-a-vista?modo=cota-unica`. Revisar até 09/10/2027 (12 meses).

1. Oficial. CVM, Portal do Investidor: Planejamento e gestão de reservas financeiras. <https://www.gov.br/investidor/pt-br/penso-logo-invisto/planejamento-e-gestao-de-reservas-financeiras>. Trecho: Reserva só para imprevistos: exclui gastos sazonais e previsíveis, como tributos e matrículas. Consulta: 09/10/2026.
2. Oficial. CVM, Portal do Investidor: Guia de Planejamento Financeiro. <https://www.gov.br/investidor/pt-br/educacional/publicacoes-educacionais/guias/guia-de-planejamento-financeiro/guia-planejamento-financeiro.pdf/@@display-file/file>. Trecho: Registrar as despesas que não são mensais, como impostos, seguros e matrículas. Consulta: 09/10/2026.
3. Oficial. Prefeitura de São Paulo, Secretaria da Fazenda: Edital do IPTU 2026. <https://prefeitura.sp.gov.br/web/fazenda/w/editaldoiptu2026>. Trecho: Primeira parcela ou pagamento à vista em fevereiro; condições definidas pelo município. Consulta: 09/10/2026.
4. Oficial. Governo do Paraná: Fazenda divulga datas do IPVA 2026. <https://www.parana.pr.gov.br/Audio/Com-aliquota-de-19-e-desconto-vista-Fazenda-divulga-datas-do-IPVA-2026>. Trecho: Vencimentos a partir de janeiro; condições definidas pelo estado. Consulta: 09/10/2026.
5. Clarevo: D-029.

Ressalvas e ajustes:

- "Material escolar" não aparece no trecho da CVM (o texto não atribui isso à CVM). Frase original em português da página da CVM confirmada no trecho de busca do tema reserva-imprevistos.

### `orcamento-50-30-20` · Orçamento e a referência 50-30-20 (rascunho)

Revisar até 09/10/2027 (12 meses). Fatos de norma declarados: "50%" (fonte 1); "30%" (fonte 1); "20%" (fonte 1).

1. Obra: Elizabeth Warren e Amelia Warren Tyagi. All Your Worth: The Ultimate Lifetime Money Plan. Free Press, 2005. Consulta: não confirmada.
2. Oficial. Banco Central do Brasil: Caderno de Educação Financeira: Gestão de Finanças Pessoais (Conteúdo Básico), 2013. <https://www.bcb.gov.br/pre/pef/port/caderno_cidadania_financeira.pdf>. Trecho: Módulo 2, orçamento pessoal ou familiar. Consulta: 09/10/2026.

O que falta para publicar (anotado no próprio tema):

- Confirmar no próprio livro (ou na página da editora) a divisão 50% necessidades, 30% escolhas pessoais e 20% para guardar ou quitar dívidas; as buscas de 09/10/2026 só trouxeram resenhas e resumos de terceiros.
- Confirmar no livro que a base é a renda líquida (depois dos impostos).
- Registrar capítulo ou página da divisão e preencher a data de consulta da obra (`consultedOn`).

Ressalvas e ajustes:

- Ajuste já aplicado: "em muitas cidades" virou "em algumas cidades".

### `reserva-imprevistos` · Reserva para imprevistos (publicado)

Calculadora: `/calcular/reserva`. Revisar até 09/10/2027 (12 meses).

1. Oficial. CVM, Portal do Investidor: Emergências e aposentadoria. <https://www.gov.br/investidor/pt-br/investir/antes-de-investir/defina-seus-objetivos/emergencias-e-aposentadoria>. Trecho: Entre 6 e 12 meses de gastos, conforme o tipo de renda, a estabilidade no emprego e quantas pessoas contribuem para a renda; reserva de baixo risco e liquidez diária. Consulta: 09/10/2026.
2. Oficial. CVM, Portal do Investidor: Planejamento e gestão de reservas financeiras. <https://www.gov.br/investidor/pt-br/penso-logo-invisto/planejamento-e-gestao-de-reservas-financeiras>. Trecho: 1, 3 ou 6 meses de despesas, por exemplo; reserva só para imprevistos, como problemas médicos, demissão ou reparo em casa. Consulta: 09/10/2026.
3. Oficial. CVM, Portal do Investidor: Guia de Planejamento Financeiro. <https://www.gov.br/investidor/pt-br/educacional/publicacoes-educacionais/guias/guia-de-planejamento-financeiro/guia-planejamento-financeiro.pdf/@@display-file/file>. Trecho: Custo de vida de 6 a 12 meses; por prudência, 12 meses. Consulta: 09/10/2026.

Ressalvas e ajustes:

- "Dinheiro para aproveitar uma oportunidade é outra meta" é enquadramento do Clarevo (proposta do Clarevo), sem fonte externa e sem número.

### `juros-simples-compostos` · Juros simples e juros compostos (publicado)

Calculadora: `/calcular/custo-da-divida`. Revisar até 09/10/2027 (12 meses).

1. Oficial. Banco Central do Brasil: Glossário Simplificado de Termos Financeiros (2013). <https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Informacoes_gerais/glossario_cidadania_financeira.pdf>. Trecho: Verbetes "juros", "juros simples" e "juros compostos"; a maioria das operações usa juros compostos. Consulta: 09/10/2026.
2. Oficial. Banco Central do Brasil: Calculadora do Cidadão: metodologia do financiamento com prestações fixas. <https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaFinanciamentoPrestacoesFixas.do?method=exibirMetodologiaFinanciamentoPrestacoesFixas>. Trecho: "Cálculo com juros compostos e capitalização mensal". Consulta: 09/10/2026.

Ressalvas e ajustes:

- "A taxa diz quanto, em percentual, por período" é definição geral, sem trecho literal (não é número nem norma).

### `taxa-mes-ano` · Taxa ao mês e taxa ao ano (publicado)

Calculadora: `/calcular/custo-da-divida`. Revisar até 09/10/2027 (12 meses).

1. Oficial. Presidência da República: Código de Defesa do Consumidor (Lei nº 8.078/1990). <https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm>. Trecho: art. 52, II (taxa efetiva anual de juros), e art. 54-B, § 2º (CET em taxa percentual anual). Consulta: 09/10/2026.
2. Oficial. Banco Central do Brasil: Calculadora do Cidadão: metodologia do financiamento com prestações fixas. <https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaFinanciamentoPrestacoesFixas.do?method=exibirMetodologiaFinanciamentoPrestacoesFixas>. Trecho: Juros compostos, capitalização mensal e taxa de juros mensal. Consulta: 09/10/2026.
3. Oficial. Banco Central do Brasil: Calculadora do Cidadão: metodologia da aplicação com depósitos regulares. <https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaAplicacaoDepositosRegulares.do?method=exibirMetodologiaAplicacaoDepositosRegulares>. Trecho: Fórmula com taxa de juros mensal e número de meses. Consulta: 09/10/2026.

Ressalvas: nenhum fato citado ficou sem confirmação.

### `taxa-e-tarifa` · Taxa, tarifa e encargo (publicado)

Revisar até 09/10/2027 (12 meses).

1. Oficial. Conselho Monetário Nacional e Banco Central do Brasil: Resolução CMN nº 3.919/2010 (tarifas), texto consolidado. <https://normativos.bcb.gov.br/Lists/Normativos/Attachments/49514/Res_3919_v7_P.pdf>. Trecho: art. 1º (tarifa) e art. 2º, I (serviços essenciais da conta de depósitos à vista: cartão de débito, até quatro saques, até duas transferências entre contas na própria instituição por mês, consultas pela internet). Consulta: 09/10/2026.
2. Oficial. Governo Federal: Entenda quais tarifas podem ou não ser cobradas dos clientes. <https://www.gov.br/pt-br/noticias/financas-impostos-e-gestao-publica/2021/12/entenda-quais-tarifas-podem-ou-nao-ser-cobradas-dos-clientes>. Trecho: Serviços essenciais gratuitos até uma quantidade máxima; acima dela, cobrança pelo uso a mais. Consulta: 09/10/2026.
3. Oficial. Banco Central do Brasil: Glossário Simplificado de Termos Financeiros (2013). <https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Informacoes_gerais/glossario_cidadania_financeira.pdf>. Trecho: Verbete "juros": o custo de "deslocar" o dinheiro no tempo. Consulta: 09/10/2026.
4. Oficial. Presidência da República: Código de Defesa do Consumidor (Lei nº 8.078/1990). <https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm>. Trecho: art. 52, § 1º (multa de mora). Consulta: 09/10/2026.
5. Oficial. ANEEL: Resolução Normativa nº 1.000/2021 (texto consolidado). <https://www2.aneel.gov.br/cedoc/ren20211000.html>. Trecho: art. 343 (multa, atualização pelo IPCA e juros de mora na conta de luz). Consulta: 09/10/2026.

Ressalvas e ajustes:

- Texto da Res. CMN 3.919/2010 v7 confirmado só por trechos de busca (as páginas não abrem daqui).
- Não se achou se as resoluções CMN de 2026 sobre direitos do consumidor financeiro mexeram na lista de serviços essenciais (a tabela de tarifas de um banco público de 01/10/2026 ainda cita as gratuidades da 3.919).

### `cet` · CET, o Custo Efetivo Total (publicado)

Calculadora: `/calcular/custo-da-divida?modo=emprestimo`. Revisar até 09/10/2027 (12 meses).

1. Oficial. Conselho Monetário Nacional e Banco Central do Brasil: Resolução CMN nº 4.881, de 23/12/2020 (Custo Efetivo Total). <https://www.bcb.gov.br/content/estabilidadefinanceira/especialnor/Resolu%C3%A7%C3%A3o4881.pdf>. Trecho: arts. 3º e 4º (componentes do CET; taxa percentual anual), art. 7º (informar antes da contratação, demonstrativo de cálculo destacado no contrato) e vigência desde 01/02/2021. Consulta: 09/10/2026.
2. Oficial. Presidência da República: Lei nº 14.181/2021 (inclui o art. 54-B no Código de Defesa do Consumidor). <https://planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14181.htm>. Trecho: art. 54-B, I (custo efetivo total na oferta de crédito e na venda a prazo). Consulta: 09/10/2026.

Ressalvas e ajustes:

- Situação da Res. 4.881 em normativos.bcb.gov.br não aberta; lista oficial de normas vigentes (ago/2022) e buscas até out/2026 não acharam revogação.

### `iof-credito` · IOF no crédito (publicado)

Revisar até 09/04/2027 (6 meses). Fatos de norma declarados: "0,38%" (fonte 2); "0,0082%" (fonte 1).

1. Oficial. Câmara dos Deputados: Decreto nº 6.306/2007 (Regulamento do IOF), norma atualizada. <https://www2.camara.leg.br/legin/fed/decret/2007/decreto-6306-14-dezembro-2007-566561-normaatualizada-pe.html>. Trecho: art. 7º, I, "b", item 2 (mutuário pessoa física: 0,0082% ao dia, redação do Decreto nº 8.392/2015); art. 7º, I, "a" (saldos devedores diários). Consulta: 09/10/2026.
2. Oficial. Câmara dos Deputados: Decreto nº 12.499/2025 (publicação original). <https://www2.camara.leg.br/legin/fed/decret/2025/decreto-12499-11-junho-2025-797588-publicacaooriginal-175631-pe.html>. Trecho: art. 7º, § 15, do Decreto nº 6.306/2007: alíquota adicional de 0,38%, seja o mutuário pessoa jurídica ou pessoa física. Consulta: 09/10/2026.
3. Oficial. Ministério da Fazenda: Apresentação sobre o IOF (maio de 2025). <https://www.gov.br/fazenda/pt-br/central-de-conteudo/publicacoes/apresentacoes/2025/Maio/iof-maio-2025.pdf>. Trecho: A alíquota diária só incide pelo prazo máximo de 1 ano; nada muda nas operações de crédito de pessoas físicas. Consulta: 09/10/2026.
4. Oficial. Conselho Monetário Nacional e Banco Central do Brasil: Resolução CMN nº 4.881, de 23/12/2020 (Custo Efetivo Total). <https://www.bcb.gov.br/content/estabilidadefinanceira/especialnor/Resolu%C3%A7%C3%A3o4881.pdf>. Trecho: art. 3º: o CET considera tributos. Consulta: 09/10/2026.
5. Oficial. Procon Goiás: Com nova regra, juros do rotativo do cartão não poderão ultrapassar dívida original. <https://goias.gov.br/procon/com-nova-regra-juros-do-rotativo-do-cartao-nao-poderao-ultrapassar-divida-original-a-partir-de-hoje/>. Trecho: O custo do IOF está fora do cálculo do limite. Consulta: 09/10/2026.

Ressalvas e ajustes:

- Referendo do plenário do STF na ADC 96 não encontrado até 09/10/2026 (não muda pessoa física; não está no texto).
- Data de início do Decreto 8.392/2015 (21 ou 22/01/2015) não fixada (não está no texto).

### `parcelado-ou-a-vista` · Parcelado, sem juros ou à vista (publicado)

Calculadora: `/calcular/parcelado-ou-a-vista`. Revisar até 09/10/2027 (12 meses).

1. Oficial. Câmara dos Deputados: Lei nº 13.455/2017 (publicação original). <https://www2.camara.leg.br/legin/fed/lei/2017/lei-13455-26-junho-2017-785093-publicacaooriginal-153193-pl.html>. Trecho: art. 1º: diferenciação de preços em função do prazo ou do instrumento de pagamento. Consulta: 09/10/2026.
2. Oficial. Senado Federal: Lei nº 13.455/2017 (inclui o art. 5º-A na Lei nº 10.962/2004). <https://legis.senado.leg.br/norma/17711076/publicacao/17711085>. Trecho: art. 5º-A: informar, em local e formato visíveis, os descontos por prazo ou instrumento de pagamento. Consulta: 09/10/2026.
3. Oficial. Presidência da República: Código de Defesa do Consumidor (Lei nº 8.078/1990). <https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm>. Trecho: art. 52, I a V. Consulta: 09/10/2026.
4. Oficial. Banco Central do Brasil: Calculadora do Cidadão: financiamento com prestações fixas. <https://www3.bcb.gov.br/CALCIDADAO/publico/exibirFormFinanciamentoPrestacoesFixas.do?method=exibirFormFinanciamentoPrestacoesFixas>. Trecho: Informe 3 valores para obter o 4º; a 1ª prestação não é no ato; o valor financiado não inclui a entrada. Consulta: 09/10/2026.

Ressalvas: nenhum fato citado ficou sem confirmação.

### `rotativo-cartao` · Rotativo do cartão e parcelamento da fatura (publicado)

Calculadora: `/calcular/custo-da-divida?modo=rotativo`. Revisar até 09/04/2027 (6 meses).

1. Oficial. Presidência da República: Lei nº 14.690/2023. <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14690.htm>. Trecho: art. 28, § 1º: juros e encargos financeiros limitados ao valor original da dívida. Consulta: 09/10/2026.
2. Oficial. Conselho Monetário Nacional e Banco Central do Brasil: Resolução CMN nº 4.549/2017, texto consolidado com a Resolução CMN nº 5.112/2023. <https://normativos.bcb.gov.br/Lists/Normativos/Attachments/50330/Res_4549_v2_L.pdf>. Trecho: art. 1º (rotativo até o vencimento da fatura seguinte), art. 2º (parcelamento em condições mais vantajosas), art. 2º-A (encargos financeiros; parágrafo único, I e II: valor original e contagem desde o início do rotativo) e art. 2º-B (valor original e encargos na fatura). Consulta: 09/10/2026.
3. Oficial. Conselho Monetário Nacional e Banco Central do Brasil: Voto CMN nº 67/2023. <https://normativos.bcb.gov.br/Votos/CMN/202367/Voto_do_CMN_67_2023.pdf>. Trecho: Os arts. 2º-A a 2º-C valem só para operações feitas depois do prazo de 90 dias do art. 28, § 1º, da Lei nº 14.690/2023. Consulta: 09/10/2026.
4. Oficial. Banco Central do Brasil: Instruções de preenchimento do documento 3060 (juros acumulados do cartão). <https://www.bcb.gov.br/content/estabilidadefinanceira/Leiaute_de_documentos/3060/Instrucoes-preenchimento-Juros-acumulados-cartao.pdf>. Trecho: Operações iniciadas a partir de 3/1/2024. Consulta: 09/10/2026.
5. Oficial. Procon Goiás: Com nova regra, juros do rotativo do cartão não poderão ultrapassar dívida original. <https://goias.gov.br/procon/com-nova-regra-juros-do-rotativo-do-cartao-nao-poderao-ultrapassar-divida-original-a-partir-de-hoje/>. Trecho: IOF fora do cálculo; dívida de R$ 100 não pode passar de R$ 200 com juros e encargos. Consulta: 09/10/2026.

Ressalvas e ajustes:

- Definição de "encargos financeiros" (art. 2º-A, III, da Res. 4.549 com a 5.112): o trecho veio como resumo da ferramenta de busca sobre o PDF do BCB; a redação literal só apareceu em cópias não oficiais.
- Numeração da MP 1.393/2026 (arts. 28-A e 31-A a 31-H) só em sites de terceiros (nota interna; não está no texto). Rever depois da votação da MP.
- Página da Secom "Novo teto de juros do cartão de crédito passa a valer a partir desta quarta" só com título indexado: saiu das fontes (a data de 3/1/2024 está no documento 3060 do BCB).

### `cheque-especial` · Cheque especial (publicado)

Calculadora: `/calcular/custo-da-divida?modo=cheque_especial`. Revisar até 09/04/2027 (6 meses). Fatos de norma declarados: "8% ao mês" (fonte 1).

1. Oficial. Conselho Monetário Nacional e Banco Central do Brasil: Resolução CMN nº 4.765/2019, texto consolidado. <https://normativos.bcb.gov.br/Lists/Normativos/Attachments/50875/Res_4765_v2_P.pdf>. Trecho: art. 1º (pessoas naturais e MEI; limite de crédito rotativo vinculado à conta), art. 3º (juros limitados a 8% ao mês sobre o valor utilizado), vigência em 6 de janeiro de 2020 e nota sobre a ADI 6.407 no art. 2º. Consulta: 09/10/2026.
2. Oficial. Governo Federal: Já está valendo a limitação de juros para cheque especial (janeiro de 2020). <https://www.gov.br/pt-br/noticias/financas-impostos-e-gestao-publica/2020/01/ja-esta-valendo-a-limitacao-de-juros-para-cheque-especial>. Trecho: A Resolução 4.765, aprovada em novembro de 2019, começou a valer em janeiro de 2020. Consulta: 09/10/2026.
3. Oficial. Presidência da República: Decreto nº 6.306/2007 (Regulamento do IOF), texto compilado. <https://planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306compilado.htm>. Trecho: art. 7º, I, "a": crédito com reutilização prevista, base no somatório dos saldos diários. Consulta: 09/10/2026.
4. Oficial. Supremo Tribunal Federal: ADI 6.407: cobrança de tarifa pela disponibilização de cheque especial. <https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=465221&ori=1>. Trecho: Mérito julgado procedente, com a declaração de inconstitucionalidade, em sessão virtual encerrada em 30/4/2021. Consulta: 09/10/2026.

Ressalvas e ajustes:

- "Juros pelos dias de uso" não tem trecho oficial: o texto passou a "juros sobre o valor usado pelo tempo em que a conta fica negativa, conforme o contrato" (subtítulo e resumo também).
- A data de 6/1/2020 veio do resumo da ferramenta sobre o PDF do BCB, com a notícia do gov.br de janeiro de 2020 ("só começou a valer agora").

### `amortizacao-price-sac` · Amortização, Tabela Price e SAC (publicado)

Revisar até 09/10/2027 (12 meses).

1. Oficial. Banco Central do Brasil: Calculadora do Cidadão: financiamento com prestações fixas (metodologia). <https://www.bcb.gov.br/pec/calculo/calc_financiamento/metodologia.asp?frame=1>. Trecho: "Cálculo com juros compostos e capitalização mensal"; fórmula da prestação fixa. Consulta: 09/10/2026.
2. Oficial. Banco Central do Brasil: Calculadora do Cidadão: ajuda. <https://www3.bcb.gov.br/CALCIDADAO/publico/ajudaCartaoCredito.do>. Trecho: Parcelas fixas, "similar ao método da tabela Price (ou sistema francês)", com juros decrescentes. Consulta: 09/10/2026.
3. Oficial. Banco Central do Brasil: Nota Técnica nº 56: Estabilizando a prestação nominal em contratos (outubro de 2025). <https://www.bcb.gov.br/content/publicacoes/notastecnicas/NT_56_202510.pdf>. Trecho: Price com prestação nominal constante, maior parte de juros no início; prestações de contratos corrigidos sensíveis à inflação. Consulta: 09/10/2026.
4. Oficial. Tribunal de Contas do Município de São Paulo, Escola de Contas: Sistemas de Amortização de Financiamentos: SAC, PRICE. <https://egcportalantigo.tcm.sp.gov.br/artigos/1705-sistemas-de-amortizacao-de-financiamentos-sac-price>. Trecho: Prestação = amortização + juros; SAC com amortização constante, juros e prestação decrescentes; o SAC amortiza a dívida de forma mais rápida. Consulta: 09/10/2026.
5. Oficial. Tribunal Regional Federal da 3ª Região: Acórdão sobre Tabela Price e SAC (busca de jurisprudência). <https://web.trf3.jus.br/acordaos/Acordao/BuscarDocumentoPje/262326291>. Trecho: A Tabela Price implica pagamento total maior de juros, decorrência de uma prestação constante e inicialmente inferior à do SAC. Consulta: 09/10/2026.

Ressalvas e ajustes:

- Número e data do acórdão do TRF3 não vieram na busca (fonte citada pelo endereço e pelo trecho).
- Qual resultado do BCB traz as duas frases da Price (a NT 56 encabeçou a lista, sem a ferramenta dizer qual).

### `quitar-antes` · Quitar antes do prazo (publicado)

Calculadora: `/calcular/quitar-antes`. Revisar até 09/10/2027 (12 meses).

1. Oficial. Presidência da República: Código de Defesa do Consumidor (Lei nº 8.078/1990). <https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm>. Trecho: art. 52, § 2º (liquidação antecipada com redução proporcional dos juros) e art. 54-B (liquidação antecipada e não onerosa informada na oferta). Consulta: 09/10/2026.
2. Oficial. Conselho Monetário Nacional e Banco Central do Brasil: Resolução CMN nº 3.516/2007, texto consolidado. <https://normativos.bcb.gov.br/Lists/Normativos/Attachments/48006/Res_3516_v3_L.pdf>. Trecho: art. 1º (vedada a tarifa por liquidação antecipada em contratos com pessoas físicas, microempresas e empresas de pequeno porte); arts. 2º e 3º revogados desde 2/5/2022 pela Resolução CMN nº 5.004/2022. Consulta: 09/10/2026.
3. Oficial. Conselho Monetário Nacional e Banco Central do Brasil: Resolução CMN nº 3.516/2007, texto original. <https://www.bcb.gov.br/pre/normativos/res/2007/pdf/res_3516_v1_o.pdf>. Trecho: Vigência na data da publicação; recursos direcionados e taxas administradas fora da regra de cálculo. Consulta: 09/10/2026.
4. Oficial. Superior Tribunal de Justiça: Informativo de Jurisprudência nº 597 (REsp 1.370.144-SP). <https://processo.stj.jus.br/jurisprudencia/externo/informativo/?livre=@CNOT%3D016192>. Trecho: Tarifa de liquidação antecipada: contratos celebrados antes de 10/12/2007, data da publicação da Resolução CMN nº 3.516/2007. Consulta: 09/10/2026.
5. Oficial. Conselho Monetário Nacional e Banco Central do Brasil: Voto CMN nº 33/2022 (texto aprovado da Resolução CMN nº 5.004/2022). <https://normativos.bcb.gov.br/Votos/CMN/202233/Voto_do_CMN_33_2022.pdf>. Trecho: art. 7º: taxa de juros pactuada no contrato para o valor presente na liquidação antecipada, em operações prefixadas; exceção para recursos direcionados ou taxas administradas. Consulta: 09/10/2026.
6. Clarevo: D-024, D-034.

Ressalvas e ajustes:

- PDF da própria Res. CMN 5.004/2022 não veio em nenhuma busca: o art. 7º está confirmado pelo Voto CMN 33/2022 (texto aprovado) e pela ata do CMN.
- Sem confirmação oficial de que o art. 7º da 5.004 e o art. 1º da 3.516 seguem iguais até out/2026 (nenhuma revogação encontrada).
- O inciso V do art. 54-B do CDC só apareceu em resumos: a fonte cita "art. 54-B", sem o inciso.
- Ajustes: exceção de recursos direcionados e taxas administradas no parágrafo 2 (sem citar o nome do banco de fomento); frase da estimativa da calculadora com a taxa digitada (D-034(3)).

### `multa-juros-atraso` · Multa e juros por atraso (publicado)

Calculadora: `/calcular/multa-e-juros`. Revisar até 09/10/2027 (12 meses). Fatos de norma declarados: "2% do valor da prestação" (fonte 1); "multa de até 2%" (fonte 2); "1% ao mês" (fonte 2).

1. Oficial. Presidência da República: Código de Defesa do Consumidor (Lei nº 8.078/1990). <https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm>. Trecho: art. 52, § 1º, com redação da Lei nº 9.298/1996. Consulta: 09/10/2026.
2. Oficial. ANEEL: Resolução Normativa nº 1.000/2021 (texto consolidado). <https://www2.aneel.gov.br/cedoc/ren20211000.html>. Trecho: art. 343 (multa de até 2%, IPCA e juros de mora de 1% ao mês pro rata die; vencimento em sábado, domingo ou feriado), com a redação da REN nº 1.115/2025. Consulta: 09/10/2026.
3. Oficial. Presidência da República: Lei nº 14.905/2024. <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14905.htm>. Trecho: Nova redação do Código Civil: art. 389, parágrafo único (IPCA), art. 406, § 1º (taxa legal: Selic menos o IPCA) e art. 1.336, § 1º (condomínio: multa de até 2%). Consulta: 09/10/2026.
4. Oficial. Banco Central do Brasil: Calculadora do Cidadão: metodologia da taxa legal (Resolução CMN nº 5.171/2024). <https://www3.bcb.gov.br/CALCIDADAO/publico/metodologiaCorrigirPelaTaxaLegal.do?method=metodologiaCorrigirPelaTaxaLegal>. Trecho: Valores negativos: a taxa legal do mês é zero. Consulta: 09/10/2026.

Ressalvas e ajustes:

- Lei 14.905/2024, art. 5º (vigência 60 dias depois de 01/07/2024) e art. 406, § 3º (piso zero) vistos só como paráfrase no Planalto; o piso zero está literal na metodologia do BCB e o mês (agosto de 2024) sai da regra de 60 dias.
- Número do parágrafo da regra de sábado, domingo ou feriado na REN 1.000 não apareceu literal (o texto não cita o parágrafo).
- Frase do aluguel (STJ) retirada, como pedia a especificação de 08/10/2026.
- REN 1.000, art. 343, § 2º (iluminação pública fora da multa e dos juros) só em paráfrase: usado apenas nas hipóteses do exemplo.

### `score-credito` · Score de crédito (publicado)

Revisar até 09/10/2027 (12 meses).

1. Oficial. Presidência da República: Lei nº 12.414/2011 (Cadastro Positivo). <https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12414.htm>. Trecho: art. 5º, I e § 4º (cancelamento e reabertura gratuitos), II (acesso gratuito ao histórico e à nota) e IV (principais elementos e critérios, resguardado o segredo empresarial); art. 7º-A, I (informações vedadas na nota). Consulta: 09/10/2026.
2. Oficial. Banco Central do Brasil, Revista da PGBC: Cadastro Positivo: a solução para o combate à assimetria informacional. <https://revistapgbc.bcb.gov.br/index.php/revista/article/download/1016/31/>. Trecho: Direito do cadastrado de conhecer os principais elementos e critérios considerados para a análise de risco. Consulta: 09/10/2026.
3. Oficial. Presidência da República: Lei Complementar nº 166/2019. <https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp166.htm>. Consulta: 09/10/2026.
4. Oficial. Banco Central do Brasil: Cadastro Positivo: análise dos efeitos do novo modelo. <https://www.bcb.gov.br/content/publicacoes/Documents/outras_pub_alfa/analise_dos_efeitos_do_cadastro_positivo.pdf>. Trecho: A situação padrão passa a ser estar dentro do Cadastro Positivo. Consulta: 09/10/2026.
5. Oficial. Governo Federal: Cadastro Positivo já está no ar (janeiro de 2020). <https://www.gov.br/pt-br/noticias/financas-impostos-e-gestao-publica/2020/01/cadastro-positivo-ja-esta-no-ar>. Trecho: O Cadastro Positivo funciona como um histórico: quanto mais pontual com as contas, maior a nota. Consulta: 09/10/2026.
6. Oficial. Governo Federal: Emitir Relatório de Empréstimos e Financiamentos (SCR). <https://www.gov.br/pt-br/servicos/obter-relatorio-do-sistema-de-informacoes-de-credito-scr>. Trecho: Acesso pelo Registrato, sem custo; empréstimos e financiamentos em dia ou em atraso. Consulta: 09/10/2026.
7. Oficial. Procon Niterói: Difícil tomar empréstimo? Problema pode ser o score de crédito (abril de 2024). <https://procon.niteroi.rj.gov.br/2024/04/02/dificil-tomar-emprestimo-problema-pode-ser-o-score-de-credito-veja-como-seu-risco-e-avaliado-e-saiba-como-melhorar-a-nota/>. Trecho: Cinco empresas têm permissão para calcular score no país. Consulta: 09/10/2026.

Ressalvas e ajustes:

- "Cada empresa tem seu modelo, e a nota pode variar entre elas" sem trecho oficial: virou "Mais de uma empresa calcula essa nota." (Procon Niterói).
- "O peso de cada dado na nota não é público" sem trecho oficial: virou "a lei protege o segredo empresarial do cálculo".
- Art. 5º, IV, da Lei 12.414 aparece truncado no Planalto: confirmado pelo documento do Senado e pela Revista da PGBC.

### `superendividamento` · Quando as dívidas não cabem na renda (publicado)

Revisar até 09/10/2027 (12 meses). Fatos de norma declarados: "R$ 600,00" (fonte 3).

1. Oficial. Presidência da República: Código de Defesa do Consumidor (Lei nº 8.078/1990). <https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm>. Trecho: art. 54-A, § 1º (definição), art. 104-A, caput e § 1º (plano de até 5 anos; dívidas excluídas) e art. 104-C (órgãos de defesa do consumidor na fase conciliatória). Consulta: 09/10/2026.
2. Oficial. Presidência da República: Lei nº 14.181/2021. <https://planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14181.htm>. Trecho: Altera o Código de Defesa do Consumidor. Consulta: 09/10/2026.
3. Oficial. Presidência da República: Decreto nº 11.567/2023. <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/decreto/d11567.htm>. Trecho: Mínimo existencial: renda mensal equivalente a R$ 600,00. Consulta: 09/10/2026.
4. Oficial. Planalto: Presidente amplia mínimo existencial para R$ 600 (junho de 2023). <https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2023/06/presidente-amplia-minimo-existencial-para-r-600>. Trecho: Decreto publicado em 20/06/2023. Consulta: 09/10/2026.
5. Oficial. Presidência da República: Decreto nº 11.150/2022. <https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/decreto/d11150.htm>. Trecho: Regulamenta o mínimo existencial. Consulta: 09/10/2026.
6. Oficial. Supremo Tribunal Federal: Informativo STF nº 1214 (ADPF 1.005, julgamento finalizado em 23/04/2026). <https://www.stf.jus.br/arquivo/informativo/documento/informativo1214.htm>. Trecho: Avaliação anual do valor do mínimo existencial; manutenção do valor fixado no momento. Consulta: 09/10/2026.
7. Oficial. Ministério da Justiça e Segurança Pública, Senacon: Nota Técnica nº 11/2023. <https://www.gov.br/mj/pt-br/assuntos/seus-direitos/consumidor/notas-tecnicas/nota-tecnica-no-11-2023-cgemm-dpdc-senacon-mj.pdf>. Trecho: Plano de pagamento com prazo máximo de 5 anos, preservado o mínimo existencial (art. 104-A). Consulta: 09/10/2026.
8. Oficial. Defensoria Pública do Maranhão: DPE/MA garante na Justiça renegociação de consumidora com superendividamento. <https://defensoria.ma.def.br/dpema/portal/noticias/9014/dpema-garante-na-justica-renegociacao-de-consumidora-com-superendividamento>. Trecho: Quem tem o mínimo existencial comprometido pode procurar o Núcleo de Defesa do Consumidor da Defensoria para orientações. Consulta: 09/10/2026.

Ressalvas e ajustes:

- Primeira avaliação anual do mínimo existencial pelo CMN (pedida pelo STF) não encontrada até 09/10/2026.
- Texto consolidado do Decreto 11.150/2022 depois da decisão do STF (consignado) não conferido no Planalto.
- Acórdão das ADPFs 1005, 1006 e 1097 não consultado (só o Informativo 1214 e notícias do STF).

### `inflacao-ipca` · Inflação e IPCA (publicado)

Revisar até 09/10/2027 (12 meses). Fatos de norma declarados: "3% ao ano" (fonte 4); "de 1,5% a 4,5%" (fonte 4).

1. Oficial. IBGE: IBGE Explica: Inflação. <https://www.ibge.gov.br/explica/inflacao.php>. Trecho: Definição de inflação; o IPCA é o índice oficial; a inflação pessoal pode ser maior ou menor que o IPCA. Consulta: 09/10/2026.
2. Oficial. IBGE: IPCA: Índice Nacional de Preços ao Consumidor Amplo. <https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9256-indice-nacional-de-precos-ao-consumidor-amplo.html>. Trecho: População-objetivo: famílias com rendimentos de 1 a 40 salários mínimos, residentes nas áreas urbanas; periodicidade mensal. Consulta: 09/10/2026.
3. Oficial. Presidência da República: Decreto nº 12.079/2024. <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/decreto/d12079.htm>. Trecho: Meta representada por variações acumuladas em doze meses, apuradas mês a mês; mudança com antecedência mínima de trinta e seis meses. Consulta: 09/10/2026.
4. Oficial. Banco Central do Brasil: Relatório de Política Monetária, março de 2026 (boxe). <https://www.bcb.gov.br/content/ri/relatorioinflacao/202603/rpm202603b10p.pdf>. Trecho: Meta de 3,00% para o período iniciado em janeiro de 2025, medida pelo IPCA, com intervalo de 1,50% a 4,50%. Consulta: 09/10/2026.
5. Oficial. Banco Central do Brasil: Relatório de Política Monetária, setembro de 2025 (boxe). <https://www.bcb.gov.br/content/ri/relatorioinflacao/202509/rpm202509b12p.pdf>. Trecho: Meta fixada pela Resolução CMN nº 5.141, de 26 de junho de 2024. Consulta: 09/10/2026.

Ressalvas e ajustes:

- Texto da Res. CMN 5.141/2024 não veio (número e conteúdo confirmados nos boxes do Relatório de Política Monetária).
- Nota do Ministério da Fazenda sem trecho literal: saiu das fontes.

### `selic` · Selic, a taxa básica de juros (publicado)

Revisar até 09/10/2027 (12 meses).

1. Oficial. Banco Central do Brasil: Relatório de Administração do Selic 2023: Taxa Selic. <https://www3.bcb.gov.br/rasselic2023/taxa-selic>. Trecho: Taxa básica de juros, que influencia outras taxas; principal instrumento de política monetária para controlar a inflação. Consulta: 09/10/2026.
2. Oficial. Banco Central do Brasil: Estudo Especial nº 118: Repasse da taxa Selic para o mercado de crédito bancário. <https://www.bcb.gov.br/conteudo/relatorioinflacao/EstudosEspeciais/EE118_Repasse_da_taxa_Selic_para_o_mercado_de_credito_bancario.pdf>. Trecho: Alterações da Selic repassadas às diferentes modalidades de crédito. Consulta: 09/10/2026.
3. Oficial. Banco Central do Brasil: Monetary Policy Committee (Copom). <https://www.bcb.gov.br/en/monetarypolicy/committee>. Trecho: Oito reuniões por ano, aproximadamente a cada 45 dias; calendário publicado até junho do ano anterior. Consulta: 09/10/2026.
4. Oficial. Banco Central do Brasil: Voto BCB nº 3/2021 (regulamento do Copom). <https://normativos.bcb.gov.br/Votos/BCB/20213/Voto_do_BC_3_2021.pdf>. Trecho: Oito reuniões ordinárias por ano e extraordinárias por convocação. Consulta: 09/10/2026.
5. Oficial. Banco Central do Brasil: Glossário das estatísticas monetárias e de crédito. <https://www.bcb.gov.br/content/estatisticas/Documents/Estatisticas_mensais/Monetaria_credito/glossariocredito.pdf>. Trecho: Spread: diferença entre a taxa média de juros e o custo de captação. Consulta: 09/10/2026.
6. Oficial. Banco Central do Brasil: Relatório de Estabilidade Financeira, abril de 2025 (apresentação). <https://www.bcb.gov.br/conteudo/home-ptbr/TextosApresentacoes/REF_abril2025_coletiva_imprensa.pdf>. Trecho: Componentes do spread: inadimplência, despesas administrativas, tributos e FGC, margem. Consulta: 09/10/2026.

Ressalvas e ajustes:

- "As taxas de crédito costumam ficar bem acima da Selic" sem trecho oficial: frase retirada; parágrafo 3 reescrito pelo spread do BCB (diferença até o custo de captação).
- Número da resolução do regulamento do Copom (texto do Voto BCB 3/2021) não veio.

### `liquidez-risco-retorno` · Liquidez, risco e retorno (publicado)

Revisar até 09/10/2027 (12 meses).

1. Oficial. CVM, Portal do Investidor: Liquidez. <https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos/liquidez>. Trecho: Facilidade ou rapidez com que o investimento pode ser resgatado, vendido ou convertido em dinheiro, a um valor justo; reserva em alternativas mais líquidas. Consulta: 09/10/2026.
2. Oficial. CVM, Portal do Investidor: Risco e a relação risco x retorno. <https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos/risco-e-a-relacao-risco-x-retorno>. Trecho: Risco: probabilidade de o retorno obtido ser diferente do esperado. Consulta: 09/10/2026.
3. Oficial. CVM e Senacon: Boletim Consumidor Investidor nº 1: objetivos e riscos. <https://www.gov.br/mj/pt-br/assuntos/seus-direitos/consumidor/boletins-para-o-consumo/boletim-consumidor-investidor/anexos/boletim-cvm-01>. Trecho: Há risco em qualquer investimento; quanto maior a rentabilidade, maior o risco. Consulta: 09/10/2026.
4. Oficial. CVM, Portal do Investidor: Pirâmides financeiras e esquemas Ponzi. <https://www.gov.br/investidor/pt-br/investir/cuidados-ao-investir/evitando-problemas/principais-fraudes-e-esquemas-irregulares/piramides-financeiras-e-esquemas-ponzi>. Trecho: Ofertas com promessa de rentabilidade alta, acima do que o mercado oferece, em curto espaço de tempo. Consulta: 09/10/2026.

Ressalvas e ajustes:

- A frase de risco ("probabilidade de o retorno obtido ser diferente do esperado") está numa de duas páginas do Portal do Investidor; citada a de risco x retorno.

### `fgc` · Garantia do FGC (publicado)

Revisar até 09/10/2027 (12 meses). Fatos de norma declarados: "R$ 250.000,00" (fonte 1); "R$ 1.000.000,00" (fonte 2).

1. Referência de mercado. FGC: Sobre a garantia FGC. <https://www.fgc.org.br/en/sobre-garantia-fgc>. Trecho: R$ 250.000,00 por pessoa, por instituição ou conglomerado; o site lista o que é e o que não é coberto. Consulta: 09/10/2026.
2. Referência de mercado. FGC: Regulamento do FGC. <https://www.fgc.org.br/documents/d/asset-library-52554/regulamento-fgc240905-1>. Trecho: R$ 1.000.000,00 a cada período de quatro anos consecutivos, contado do primeiro evento. Consulta: 09/10/2026.
3. Referência de mercado. FGC: Estatuto do FGC. <https://fgc.org.br/documents/d/asset-library-52554/estatuto-fgc_-241055nv>. Trecho: Garantia em intervenção, liquidação extrajudicial ou insolvência reconhecida pelo Banco Central; receitas de contribuições das associadas. Consulta: 09/10/2026.
4. Referência de mercado. FGC: Quem somos. <https://www1.fgc.org.br/sobre-o-fgc/quem-somos>. Trecho: Entidade privada, sem fins lucrativos; custeio pelas contribuições mensais das associadas. Consulta: 09/10/2026.
5. Referência de mercado. FGC: Pagamento de garantia. <https://fgc.org.br/en/pagamento-de-garantia>. Trecho: O que passa do limite fica como saldo a ser habilitado na instituição em liquidação. Consulta: 09/10/2026.

Ressalvas e ajustes:

- "Não cobre perdas por variação de preços" sem texto do FGC: o parágrafo 3 passou a "só é acionada em intervenção, liquidação extrajudicial ou insolvência reconhecida pelo Banco Central" (estatuto).
- Trechos literais do estatuto e do regulamento são das versões de 2024; existem versões de 2026 não comparadas (comunicados de 2026 repetem os mesmos valores).
- Situação do PLP 135/2026 depois de 12/05/2026 (nota de revisão; não está no texto).

### `apagar-dados` · Como apagar meus dados? (rascunho)

Revisar até 09/10/2027 (12 meses).

1. Clarevo: D-007.
2. Oficial. Presidência da República: Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018). <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm>. Trecho: art. 18, II (acesso), III (correção), IV e VI (eliminação). Consulta: 09/10/2026.

O que falta para publicar (anotado no próprio tema):

- Definir o canal de pedidos de titular (P-023) e trocar {canal de P-023} no resumo.

Ressalvas e ajustes:

- O art. 18 da LGPD (acesso, correção e eliminação) foi confirmado por busca em 09/10/2026.

## 5. Temas em rascunho e o que falta

| Tema | Por que está em rascunho | O que falta |
|---|---|---|
| `orcamento-50-30-20` · Orçamento e a referência 50-30-20 | A divisão 50% / 30% / 20% e a base "renda líquida" não foram confirmadas no próprio livro nem na página da editora; as buscas só trouxeram resenhas e resumos de terceiros, que P-024 não aceita | Abrir o livro (Elizabeth Warren e Amelia Warren Tyagi, *All Your Worth*, Free Press, 2005, ISBN 9780743279741) ou a página da editora, confirmar a divisão e a base, registrar capítulo ou página e a data de consulta, e mudar para `publicado` |
| `apagar-dados` · Como apagar meus dados? | Depende do canal de pedidos de titular (P-023); o resumo ainda tem a marca "{canal de P-023}", que a validação recusa em tema publicado | Criar o endereço de P-023, trocar a marca pelo canal e publicar |

Mudança em relação à especificação de 08/10/2026: ela previa "Taxa, tarifa e encargo" em rascunho e o 50-30-20 publicado. A Res. CMN 3.919/2010 foi conferida (o tema saiu publicado, com "Na conta corrente" e "Quando uma conta atrasa, entram encargos"), e o 50-30-20 ficou em rascunho. O total continua 35 publicados e 2 rascunhos.

## 6. Ressalvas para conferir quando as páginas abrirem

Nenhuma muda o texto publicado hoje; todas estão também na seção 4, no tema.

- Res. CMN 5.004/2022: o art. 7º foi confirmado pelo Voto CMN 33/2022 (texto aprovado) e pela ata, não pelo PDF da resolução (`quitar-antes`).
- Res. CMN 4.549/2017 com a 5.112/2023: a definição de "encargos financeiros" veio como resumo da ferramenta de busca sobre o PDF do Banco Central (`rotativo-cartao`).
- Lei 14.905/2024: art. 5º (vigência) e art. 406, § 3º (piso zero), vistos só como paráfrase no Planalto (`multa-juros-atraso`).
- Estatuto e regulamento do FGC: os trechos são das versões de 2024; as de 2026 não foram comparadas (`fgc`).
- Acórdão do TRF3 sobre Price e SAC: número e data não vieram na busca (`amortizacao-price-sac`).
- Mínimo existencial: a primeira avaliação anual pelo CMN, pedida pelo STF, não foi encontrada até 09/10/2026 (`superendividamento`).
- Referendo do plenário do STF na ADC 96 (IOF) não encontrado até 09/10/2026; não muda pessoa física (`iof-credito`).
- Res. CMN 3.919/2010 (versão 7) e Res. CMN 4.881/2020: conferidas só por trechos de busca; nenhuma revogação encontrada (`taxa-e-tarifa`, `cet`).
- Res. CMN 5.141/2024 (meta de inflação): número e conteúdo confirmados nos boxes do Relatório de Política Monetária, não no texto da resolução (`inflacao-ipca`).
- MP 1.393/2026 (rotativo) e PLP 135/2026 (limite do FGC): acompanhar a votação; nenhuma das duas está no texto.
- A página da CVM sobre a reserva (6 a 12 meses de gastos) foi confirmada por busca para o tema `reserva-imprevistos`. A calculadora de reserva do Ciclo A6 ainda mostra a referência sem link e sem número (`RESERVA_REFERENCIA`, D-035(3)); usar a mesma conferência ali depende de decisão.

## 7. Prazos de revisão

| Prazo | Temas | Aviso do teste a partir de |
|---|---|---|
| 09/04/2027 (6 meses) | `iof-credito`, `rotativo-cartao`, `cheque-especial` | 10/03/2027 |
| 09/10/2027 (12 meses) | os demais temas com fonte externa, inclusive os 2 rascunhos | 09/09/2027 |
| Sem prazo | temas que citam só decisões do Clarevo | |

Depois do prazo, `npm test` reprova o tema, com o slug na mensagem, de propósito: as regras de IOF, rotativo, cheque especial, taxa legal, mínimo existencial e limite do FGC mudam por decreto, resolução ou lei.

## 8. Ajustes de texto feitos na conferência

Em relação ao conteúdo checado da especificação de 08/10/2026 (Anexo A e textos de 3.4):

- `voltei-depois`, resumo: "Se você passou mais de 45 dias sem anotar" virou "Depois de um tempo sem anotar" (os textos nunca contam dias sem anotar).
- `o-que-o-clarevo-nao-faz`: parágrafo novo sobre as calculadoras ("fazem contas com os valores e as taxas que você digita e não indicam produto", D-034).
- `reserva-imprevistos`: "Como meta inicial, o mesmo portal sugere 1, 3 ou 6 meses" virou "Como exemplo de meta para começar, o mesmo portal cita 1, 3 ou 6 meses de despesas" (a CVM escreve "por exemplo").
- `taxa-e-tarifa`: "Na conta corrente, pessoas físicas têm direito..." e "Quando uma conta atrasa, entram encargos..."; sem marca de conferência pendente.
- `cheque-especial`: "juros pelos dias de uso" virou "juros sobre o valor usado pelo tempo em que a conta fica negativa, conforme o contrato" (subtítulo e resumo também).
- `estimativa`: exemplo fictício curto (contas de luz de R$ 165,30, R$ 180,00 e R$ 171,90, média de R$ 172,40), calculado por `learn/math.ts`, para a conta "(165,30 + 180,00 + 171,90) ÷ 3" chegar à tela; antes o tema tinha a conta e não tinha o exemplo, e "Ver a conta" não aparecia.
- `quitar-antes`: texto do Anexo A no lugar do anterior, com a exceção das linhas com recursos direcionados ou taxas administradas (crédito rural e Sistema Financeiro da Habitação, sem nome de banco, D-032(5)) e a frase de que o app mostra uma estimativa com a taxa digitada e que o valor oficial é o que a instituição informar; nunca "saldo devedor". O corte da tarifa diz "a partir de 10 de dezembro de 2007", a data do trecho do STJ (fonte 4).
- `multa-juros-atraso`: saiu a frase do aluguel (sem o número do acórdão do STJ); as hipóteses dizem que a fatura só tem o consumo de energia.
- `score-credito`: "Mais de uma empresa calcula essa nota." e "a lei protege o segredo empresarial do cálculo" no lugar de frases sem trecho oficial; o exemplo fala em "12 contas pagas nos últimos 12 meses".
- `selic`: "oito reuniões ordinárias por ano"; o parágrafo do spread foi reescrito pelo glossário do Banco Central, sem "as taxas de crédito costumam ficar bem acima da Selic".
- `liquidez-risco-retorno`: a definição de liquidez segue a da CVM.
- `fgc`: a garantia "só é acionada em intervenção, liquidação extrajudicial ou insolvência reconhecida pelo Banco Central" (estatuto), no lugar de uma frase sem texto do FGC.
- `iof-credito`: hipóteses com a data de 09/10/2026 e a frase do crédito parcelado.
- `contas-do-ano`: texto do Anexo A, com o parágrafo da CVM, mais o parágrafo do app; `sem-registro`: texto do Ciclo A4.

## 9. Registro de revisões

| Data | Temas | O que mudou | Como foi conferido |
|---|---|---|---|
| 08/10/2026 | 21 temas do Anexo A da especificação | Conteúdo escrito e checado, com os exemplos recalculados em frações exatas | Trechos indexados das fontes, sem abrir as páginas |
| 09/10/2026 | Catálogo inteiro (37 temas) | Primeira versão no app: 35 publicados e 2 rascunhos, `reviewedOn` 09/10/2026, os ajustes da seção 8 e os domínios da seção 3 | Busca na web, fato a fato, com o endereço e o trecho de cada fonte e a data 09/10/2026 (seção 4) |
| 09/10/2026 | `quitar-antes`, `estimativa` | `quitar-antes`: o corte da tarifa passou de "desde dezembro de 2007" para "a partir de 10 de dezembro de 2007", a data do trecho do STJ (fonte 4); `estimativa`: exemplo e hipóteses (seção 8) | Trecho da fonte 4 de `quitar-antes` e a conta do exemplo recalculada em `learn/math.ts` (`npm test`) |

## 10. Como revisar um tema

1. Abrir cada fonte do tema (ou, se o site não abrir, buscar um trecho da própria fonte) e conferir cada fato citado e cada número de norma.
2. No arquivo da seção (`packages/core/src/learn/topics/`), atualizar o texto, o trecho (`locator`), a data de consulta (`consultedOn`) e a data de revisão (`reviewedOn`).
3. Se um número do exemplo mudou, atualizar a conta em `learn/examples.ts` (sempre por uma função de `learn/math.ts`) ou o fato de norma do tema; `npm test` recusa qualquer "R$" ou "%" que não bata.
4. Fato que não se confirma: tirar ou reescrever a frase; se o tema não se sustenta, passar para `rascunho`, com o que falta em `pending`.
5. Rodar `npm test` e `npm run typecheck` e registrar a revisão na seção 9 (data, temas, o que mudou e como foi conferido), com as ressalvas novas nas seções 4 e 6.
