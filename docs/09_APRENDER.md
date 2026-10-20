# Aprender e dúvidas: catálogo, fontes e revisões

15/10/2026, com a seção 11 de 19/10/2026 e o tema "Média e mediana" de 20/10/2026 · conteúdo em `packages/core/src/learn` (D-031, D-032 e, para os temas de época e o card "Neste mês", D-053, e, para "Média e mediana", D-062; a seção 11 registra a lista de feriados nacionais do aviso de dia útil, D-060, e as fontes da regra do próximo dia útil, D-061, que não são tema). Este documento registra o catálogo, como cada fato foi conferido, os temas em rascunho e o que falta, e as revisões feitas. Ao mudar um tema, atualize este arquivo junto.

## 1. Como funciona

- **Onde fica:** os temas estão em `packages/core/src/learn/topics/` (um arquivo por seção), com o formato de `learn/types.ts`. O app só mostra o que o core entrega (`lib/learn.ts`); não há conteúdo baixado de servidor nem nada gravado sobre leituras e buscas (D-032(6)).
- **Situação:** `publicado` aparece na aba, na busca, nos temas relacionados e nos links das telas; `rascunho` não aparece em lugar nenhum, e o endereço dele mostra "Este conteúdo não está disponível.". Rascunho sempre lista o que falta (`pending`).
- **Quem confere:** `npm test` roda a validação do catálogo (`learn-catalog.test.ts`): tamanhos, fontes, domínios, datas de consulta, decisões citadas (lidas deste repositório, em `docs/00`), prazos de revisão, números conferidos e hipóteses. `copy.test.ts` confere os termos proibidos, `learn-search.test.ts` a busca e `learn-links.test.ts` os links das telas. As regras estão em `docs/02_REGRAS_FINANCEIRAS.md`, seção "Aprender e dúvidas".
- **Números:** todo "R$" e todo "%" de um tema publicado sai das contas de `learn/math.ts` (os resultados esperados ficam em `learn/examples.ts`) ou de um fato de norma declarado no tema, com a fonte (por exemplo, "8% ao mês" no cheque especial).
- **Conteúdo de época (D-053):** o calendário fixo fica em `packages/core/src/learn/epoca.ts` (`SEASONAL_CALENDAR`: para cada mês do ano, de 0 a 3 temas do catálogo) e o card **"Neste mês"** de Aprender mostra os temas do mês de hoje, com a legenda "Temas para outubro", entre "Calculadoras" e "Comece por aqui", e a linha da calculadora ligada a eles (por exemplo, "Cota única ou parcelado?"). Mês sem tema (agosto e setembro) não tem card. O card só lê a data de hoje da sessão: não grava o que a pessoa abre, não envia nada e não há notificação. Os quatro temas novos (`decimo-terceiro`, `ferias`, `volta-as-aulas` e `imposto-de-renda`) são da seção "Organizar o mês" e seguem as mesmas regras de fonte, data de consulta e revisão; o que depende do ano (prazo do Imposto de Renda, IPVA e IPTU de cada estado e município, datas do 13º) é dito com "confira a data oficial do ano" e o link da fonte. O app só explica: não calcula INSS, Imposto de Renda nem a declaração. `learn-epoca.test.ts` confere o calendário (os 12 meses, todo tema citado publicado e com fonte e data de revisão), as contas dos exemplos e o texto de cada tema.
- **Guia de uso (D-049):** o card "Como usar o Clarevo", no topo da aba antes das calculadoras, abre `/aprender/guia`: as funções do app por grupos, cada uma com "Para que serve", "Onde fica" e "Como usar". O catálogo fica em `packages/core/src/guide/catalog.ts`, **separado dos temas**: não tem fonte nem data de revisão, porque descreve telas do próprio app, e quem o confere é `guide.test.ts` (rotas, passos, nomes nas telas, cobertura) e `copy.test.ts`. Ao criar ou renomear uma tela, atualize a entrada junto. Na busca, o grupo "Como usar" (até 5 entradas, depois de "No app") olha só o título e as palavras de busca da entrada. O app não registra qual entrada a pessoa abre nem o que busca. O manual para compartilhar (`scripts/gerar-manual.js`, `docs/manual`) sai do mesmo catálogo. A entrada "Seu mês em 30 segundos" (D-052) é a 29ª e fica em "Dia a dia", logo depois de "Resumo do mês".
- **Busca e o grupo "No app":** o campo da aba diz "Buscar um tema ou uma função" (exemplo "juros, boleto, IPVA"; `LEARN_UI_TEXT.searchLabel`). Com a busca ativa, os resultados começam pelo grupo "No app" (título de nível 2, até 5 telas) e seguem com os temas. O grupo vem de um índice fixo de 29 telas do app (a contagem de 23 não incluía "Orçamento por categoria", D-041) (a 21ª é "Em que ordem quitar as dívidas?", D-040, achada por "dívida", "quitar", "bola de neve" e "avalanche"; a 22ª é "Antes de financiar", D-044, achada por "financiar", "financiamento", "poder de compra", "entrada" e "à vista"; a 23ª é "Suas contas", D-043, achada por "contas", "origem do dinheiro", "saiu de", "carteira", "conta principal", "adicionar conta" e "arquivar conta", e abre Conta na seção das contas; a 25ª é "Buscar em Movimentações", D-045, achada por "buscar", "procurar", "pesquisar", "achar", "quanto paguei", "quanto gastei" e "luz", e abre a busca em todos os meses; a 26ª é "Revisar assinaturas", D-046, achada por "assinatura", "assinaturas", "streaming", "academia", "plano de celular", "clube", "aplicativo" e "mensalidade", e abre `/gastos-fixos/assinaturas`; a 27ª é "Exportar meus dados", D-047, achada por "exportar", "exportação", "planilha", "excel", "csv", "pdf", "backup", "baixar" e "relatório", e abre `/conta/exportar`; a 28ª é "Importar extrato ou fatura", D-048, achada por "importar", "importação", "extrato", "ofx", "banco", "planilha", "csv" e, pelo título, "fatura" (onde "Cartões" continua em primeiro), e abre `/importar`; a 29ª é "Seu mês em 30 segundos", D-052, achada por "seu mês", "mês em 30 segundos", "30 segundos", "revisão do mês", "balanço do mês", "o que entrou", "o que saiu", "resumo rápido" e "visão do mês" (nenhuma delas é "cartão", para "cartão" seguir levando só a Cartões e faturas), e abre `/seu-mes`) em `packages/core/src/navigation.ts` (`APP_SCREENS`), cada uma com título, legenda e palavras de busca, achado pelas mesmas regras dos temas (sem acento nem maiúsculas, palavras vazias fora, todas as palavras precisam casar). Não é conteúdo educativo: não está no catálogo, não tem fonte nem data de revisão, não recomenda produto e só leva a uma função ("Contas a pagar", "Escanear nota fiscal", "Metas e reserva"). A conta é feita no aparelho sobre texto fixo: o app não registra buscas nem leituras (D-032(6); decisão D-039(10)). "Lembretes de vencimento" e "Ocultar valores" abrem Conta, e não a seção. Quem criar uma tela com nome novo acrescenta a entrada ao índice; `navigation.test.ts` confere os títulos, as legendas, os endereços e a busca, e `copy.test.ts` os textos.

## 2. Catálogo

47 temas: 45 publicados e 2 rascunhos (37 do Ciclo A5, mais os cinco dos Ciclos B, C e D, os quatro de época do Ciclo K2, D-053, e "Média e mediana" do Ciclo W, D-062). Por seção, publicados: Usar o Clarevo 8, Organizar o mês 12, Juros e crédito 13, Dinheiro no tempo 5 e Dúvidas frequentes 7. "Comece por aqui": `diferenca`, `juros-simples-compostos` e `gasto-fixo`. Leitura a 200 palavras por minuto, contando título, subtítulo, parágrafos e exemplo. A calculadora é a de "Fazer a conta com os seus números" (sem a taxa, D-035(2)).

| # | Slug | Título | Seção | Tipo | Situação | Revisar até | Leitura | Calculadora | Apelidos |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `diferenca` | Diferença do mês | Usar o Clarevo | tema | publicado | - | 1 min (70 palavras) | - | - |
| 2 | `realizado-previsto` | Realizado e previsto | Usar o Clarevo | tema | publicado | - | 1 min (143 palavras) | - | - |
| 3 | `saldo` | Diferença do mês e saldo da conta | Usar o Clarevo | tema | publicado | - | 1 min (67 palavras) | - | - |
| 4 | `fatura` | Fatura sem contar duas vezes | Usar o Clarevo | tema | publicado | - | 1 min (79 palavras) | - | - |
| 5 | `gasto-fixo` | Gasto fixo, conta a pagar e gasto anotado | Usar o Clarevo | tema | publicado | - | 1 min (65 palavras) | - | - |
| 6 | `estimativa` | Contas que mudam de valor | Usar o Clarevo | tema | publicado | - | 1 min (85 palavras) | - | - |
| 7 | `parcelamentos` | Parcelamentos no Clarevo | Usar o Clarevo | tema | publicado | - | 1 min (123 palavras) | - | - |
| 8 | `sem-registro` | Mês sem registro | Usar o Clarevo | tema | publicado | - | 1 min (99 palavras) | - | - |
| 9 | `gasto-fixo-variavel` | Gasto fixo e gasto variável | Organizar o mês | tema | publicado | 09/10/2027 | 1 min (193 palavras) | - | - |
| 10 | `contas-do-ano` | Contas que chegam uma vez por ano | Organizar o mês | tema | publicado | 09/10/2027 | 2 min (205 palavras) | `parcelado-ou-a-vista?modo=cota-unica` | - |
| 11 | `orcamento-50-30-20` | Orçamento e a referência 50-30-20 | Organizar o mês | tema | rascunho | 09/10/2027 | 1 min (140 palavras) | - | - |
| 12 | `reserva-imprevistos` | Reserva para imprevistos | Organizar o mês | tema | publicado | 09/10/2027 | 1 min (193 palavras) | `reserva` | `reservas` |
| 13 | `renda-comprometida` | Renda comprometida e a referência de 30% | Organizar o mês | tema | publicado | 09/10/2027 | 1 min (189 palavras) | - | - |
| 14 | `renda-variavel` | Quando a renda muda todo mês | Organizar o mês | tema | publicado | 09/10/2027 | 2 min (274 palavras) | - | - |
| 15 | `aporte` | O que muda ao registrar um aporte | Organizar o mês | tema | publicado | 09/10/2027 | 2 min (259 palavras) | - | - |
| 16 | `essenciais` | Gastos essenciais | Organizar o mês | tema | publicado | 09/10/2027 | 2 min (240 palavras) | - | - |
| 17 | `media-e-mediana` | Média e mediana | Organizar o mês | tema | publicado | 20/10/2027 | 2 min (287 palavras) | - | - |
| 18 | `decimo-terceiro` | 13º salário | Organizar o mês | tema | publicado | 15/10/2027 | 2 min (238 palavras) | - | - |
| 19 | `ferias` | Férias: pagamento, um terço e abono | Organizar o mês | tema | publicado | 15/10/2027 | 2 min (225 palavras) | `juntar-para-objetivo` | - |
| 20 | `volta-as-aulas` | Volta às aulas: mensalidade e material | Organizar o mês | tema | publicado | 15/10/2027 | 2 min (252 palavras) | - | - |
| 21 | `imposto-de-renda` | Declaração do Imposto de Renda | Organizar o mês | tema | publicado | 15/04/2027 | 2 min (278 palavras) | - | - |
| 22 | `juros-simples-compostos` | Juros simples e juros compostos | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (140 palavras) | `custo-da-divida` | `juros`, `juros-compostos` |
| 23 | `taxa-mes-ano` | Taxa ao mês e taxa ao ano | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (147 palavras) | `custo-da-divida` | `taxa-mensal-anual` |
| 24 | `taxa-e-tarifa` | Taxa, tarifa e encargo | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (100 palavras) | - | - |
| 25 | `cet` | CET, o Custo Efetivo Total | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (174 palavras) | `custo-da-divida?modo=emprestimo` | - |
| 26 | `iof-credito` | IOF no crédito | Juros e crédito | tema | publicado | 09/04/2027 | 1 min (132 palavras) | - | - |
| 27 | `parcelado-ou-a-vista` | Parcelado, sem juros ou à vista | Juros e crédito | tema | publicado | 09/10/2027 | 2 min (241 palavras) | `parcelado-ou-a-vista` | - |
| 28 | `rotativo-cartao` | Rotativo do cartão e parcelamento da fatura | Juros e crédito | tema | publicado | 10/04/2027 | 2 min (312 palavras) | `custo-da-divida?modo=rotativo` | `cartao-rotativo` |
| 29 | `cheque-especial` | Cheque especial | Juros e crédito | tema | publicado | 09/04/2027 | 1 min (137 palavras) | `custo-da-divida?modo=cheque_especial` | - |
| 30 | `amortizacao-price-sac` | Amortização, Tabela Price e SAC | Juros e crédito | tema | publicado | 09/10/2027 | 2 min (201 palavras) | - | `juros-no-parcelamento` |
| 31 | `quitar-antes` | Quitar antes do prazo | Juros e crédito | tema | publicado | 09/10/2027 | 2 min (247 palavras) | `quitar-antes` | - |
| 32 | `multa-juros-atraso` | Multa e juros por atraso | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (183 palavras) | `multa-e-juros` | `atraso` |
| 33 | `score-credito` | Score de crédito | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (187 palavras) | - | - |
| 34 | `superendividamento` | Quando as dívidas não cabem na renda | Juros e crédito | tema | publicado | 09/10/2027 | 1 min (162 palavras) | - | - |
| 35 | `inflacao-ipca` | Inflação e IPCA | Dinheiro no tempo | tema | publicado | 09/10/2027 | 1 min (174 palavras) | - | `inflacao` |
| 36 | `selic` | Selic, a taxa básica de juros | Dinheiro no tempo | tema | publicado | 09/10/2027 | 1 min (200 palavras) | - | - |
| 37 | `liquidez-risco-retorno` | Liquidez, risco e retorno | Dinheiro no tempo | tema | publicado | 09/10/2027 | 1 min (170 palavras) | - | `liquidez` |
| 38 | `fgc` | Garantia do FGC | Dinheiro no tempo | tema | publicado | 09/10/2027 | 1 min (141 palavras) | - | - |
| 39 | `simulacao` | Como ler uma simulação | Dinheiro no tempo | tema | publicado | 09/10/2027 | 2 min (307 palavras) | - | - |
| 40 | `quem-ve-meus-dados` | Quem vê meus dados? | Dúvidas frequentes | pergunta | publicado | - | 1 min (42 palavras) | - | - |
| 41 | `empresa-ve` | A empresa que oferece o benefício vê meus gastos? | Dúvidas frequentes | pergunta | publicado | - | 1 min (38 palavras) | - | - |
| 42 | `demonstracao` | O que é a demonstração? | Dúvidas frequentes | pergunta | publicado | - | 1 min (31 palavras) | - | - |
| 43 | `marcar-como-paga` | Como marcar uma conta como paga? | Dúvidas frequentes | pergunta | publicado | - | 1 min (62 palavras) | - | - |
| 44 | `contei-duas-vezes` | Anotei duas vezes. Como corrigir? | Dúvidas frequentes | pergunta | publicado | - | 1 min (64 palavras) | - | - |
| 45 | `voltei-depois` | Fiquei um tempo sem abrir o app. O que acontece? | Dúvidas frequentes | pergunta | publicado | - | 1 min (87 palavras) | - | - |
| 46 | `apagar-dados` | Como apagar meus dados? | Dúvidas frequentes | pergunta | rascunho | 09/10/2027 | 1 min (45 palavras) | - | - |
| 47 | `o-que-o-clarevo-nao-faz` | O Clarevo se conecta ao meu banco ou indica investimentos? | Dúvidas frequentes | pergunta | publicado | - | 1 min (58 palavras) | - | - |

Os slugs antigos abrem o tema novo pelos apelidos. `media-e-mediana` (17) entrou em 20/10/2026 com o Ciclo W (D-062), logo depois de `essenciais`: explica a média e a mediana da tela Evolução, com o caso de referência dela (seis meses de Pago, com o mês de abril fora do comum), e liga as duas telas nos dois sentidos (a ação "Ver na Evolução" no tema e o "O que é mediana?" na Evolução); não liga calculadora. Os quatro temas de época (18 a 21) entraram em 15/10/2026 com o Ciclo K2 (D-053); só `ferias` liga uma calculadora ("Juntar para um objetivo"), e o card "Neste mês" também mostra a de `contas-do-ano` ("Cota única ou parcelado?"). `imposto-de-renda` é o único de época com revisão a cada 6 meses, porque o prazo de cada ano só sai pouco antes de março. Os cinco últimos temas entraram em 09/10/2026 com os ciclos que eles explicam: `renda-comprometida` e `renda-variavel` (Ciclo B, D-026), `aporte` e `essenciais` (Ciclo C, D-027) e `simulacao` (Ciclo D, D-028). Nenhum deles liga uma calculadora em "Fazer a conta com os seus números"; as ações "No Clarevo" levam às telas do ciclo (renda comprometida, renda de referência, Metas, reserva e simulador).

Temas que citam só decisões do Clarevo (sem revisão periódica; números só dos exemplos fictícios):

| Slug | Título | Seção | Decisões citadas |
|---|---|---|---|
| `diferenca` | Diferença do mês | Usar o Clarevo | D-005, D-011 |
| `realizado-previsto` | Realizado e previsto | Usar o Clarevo | D-020, D-021 |
| `saldo` | Diferença do mês e saldo da conta | Usar o Clarevo | D-011 |
| `fatura` | Fatura sem contar duas vezes | Usar o Clarevo | D-020, D-037 |
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
6. **Temas de época (Ciclo K2, 15/10/2026).** Os quatro temas novos usam o mesmo método, com a data de consulta 15/10/2026 (`EPOCA_CONSULTED_ON`, em `learn/topics/common.ts`): mais de 30 buscas, e as páginas oficiais pedidas uma a uma (`gov.br` e `planalto.gov.br`) falharam por DNS, então cada fato vem de trecho de resultado de busca e **cada `locator` do tema diz que a página não abriu**. O que a busca trouxe só de reportagens, escritórios de advocacia ou sites de calculadoras (a data de 18 de dezembro de 2026 para a segunda parcela do 13º, as faixas de INSS, o desconto de Imposto de Renda do 13º pela Lei 15.270/2025) não entrou no texto. Prazos que mudam a cada ano só entram como fato do ano passado, com fonte oficial e "confira a data oficial do ano".
7. **Fatos conferidos de novo em 09/10/2026** (17 buscas): teto de 8% ao mês do cheque especial (Res. CMN 4.765/2019, art. 3º); IOF de pessoa física (0,0082% ao dia e 0,38%); mínimo existencial de R$ 600,00 (Decreto 11.567/2023) e a decisão do STF (Informativo 1214); FGC (R$ 250 mil por instituição e R$ 1 milhão a cada 4 anos; entidade privada sem fins lucrativos; o que passa do limite fica na liquidação); meta de inflação de 3% com intervalo de 1,50% a 4,50%; limite do rotativo (Lei 14.690/2023, art. 28, § 1º, desde 3/1/2024, com o IOF fora); Copom com oito reuniões ordinárias por ano; serviços essenciais da Res. CMN 3.919/2010 (cartão de débito, quatro saques, duas transferências e consultas pela internet); CDC art. 52, § 1º (multa de 2%) e § 2º (quitação antecipada); ANEEL REN 1.000/2021, art. 343; Res. CMN 3.516/2007 (sem tarifa de liquidação antecipada) e a data de 10/12/2007 no STJ; CVM (6 a 12 meses de gastos); IBGE (famílias de 1 a 40 salários mínimos no IPCA); direitos da Lei 12.414/2011; LGPD art. 18. Todas confirmaram o texto, menos a divisão 50-30-20 no próprio livro.
8. **"Média e mediana" (Ciclo W, 20/10/2026).** Mesmo método, com a data de consulta 20/10/2026 (`MEDIA_CONSULTED_ON`, em `learn/topics/common.ts`): seis buscas e duas tentativas de abrir as páginas; as páginas do IBGE Educa não abriram (DNS), então os dois trechos vêm de resultado de busca e o `locator` de cada fonte diz isso. A seção 4 separa o que veio entre aspas do que veio como resumo.

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

### `renda-comprometida` · Renda comprometida e a referência de 30% (publicado)

Revisar até 09/10/2027 (12 meses). Fatos de norma declarados: "30%" (fonte 1); "50%" (fonte 2). A referência de 30% é de uma fonte privada, identificada como referência de mercado (P-024); o nome da empresa só aparece neste tema.

1. Referência de mercado. Serasa: Página sobre comprometimento de renda (blog Serasa). <https://www.serasa.com.br/credito/blog/comprometimento-renda/>. Trecho: o comprometimento de renda com dívidas não deve ultrapassar 30% do rendimento líquido mensal; gastos essenciais (água, luz, supermercado) não entram na soma de dívidas. Consulta: 09/10/2026.
2. Oficial. Banco Central do Brasil: Estudo Especial nº 80, Indicadores de endividamento de risco e perfil do tomador de crédito. <https://www.bcb.gov.br/conteudo/relatorioinflacao/EstudosEspeciais/EE080_Indicadores_de_endividamento_de_risco_e_perfil_do_tomador_de_credito.pdf>. Trecho: quatro critérios (atrasos acima de 90 dias; comprometimento da renda mensal com o serviço das dívidas acima de 50%; uso simultâneo de cheque especial, crédito pessoal sem consignação e rotativo; renda disponível abaixo da linha de pobreza); entra no indicador quem atende a dois ou mais. Consulta: 09/10/2026.
3. Oficial. Banco Central do Brasil: Série Cidadania Financeira nº 6, Endividamento de risco no Brasil (2020). <https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/serie_cidadania/serie_cidadania_financeira_6_endividamento_risco.pdf>. Trecho: endividado de risco é quem atende a dois ou mais dos critérios. Consulta: 09/10/2026.
4. Oficial. Banco Central do Brasil: Série Cidadania Financeira nº 8, Endividamento de risco no Brasil, atualização (novembro de 2023). <https://aprendervalor.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/serie_cidadania/serie_cidadania_financeira_8_endividamento_risco_2ed.pdf>. Trecho: edição 8, novembro de 2023, atualização do estudo de 2020 (ficha técnica). Consulta: 09/10/2026.
5. Oficial. Banco Central do Brasil: Relatório de Cidadania Financeira, glossário. <https://www.bcb.gov.br/nor/relcidfin/glossario.html>. Trecho: comprometimento de renda do tomador é a razão entre o serviço da dívida mensal e a renda disponível. Consulta: 09/10/2026.
6. Clarevo: D-026.

Ressalvas e ajustes:

- A Serasa indexa a página com outro título ("Por que meu score é bom, mas não consigo crédito?"); o endereço é o do blog. Abrir a página e conferir o título atual quando a rede permitir. Outra página da mesma empresa usa 30% da renda bruta (financiamento imobiliário) e não é citada: o tema fala em renda líquida.
- A frase "Série 8, novembro de 2023" veio do resumo da ficha técnica pelo buscador; o PDF não foi aberto. O critério de mais de 50% e a regra de dois ou mais critérios foram confirmados nos trechos do domínio do Banco Central (estudo nº 80 e Série 6) e na republicação da Agência Gov (30/11/2023), que não é fonte do app.
- O indicador do Banco Central usa outra base de renda (serviço da dívida sobre a renda disponível); por isso o tema diz que os números não são diretamente comparáveis com os 30% da Serasa.
- A referência de 30% é "referência de mercado, não uma lei nem uma regra" e só aparece na linha de dívidas de `/renda-comprometida`, com fonte e data (P-024).

### `renda-variavel` · Quando a renda muda todo mês (publicado)

Revisar até 09/10/2027 (12 meses). Em materiais da CVM e do Banco Central, "renda variável" costuma significar investimento; por isso o título fala da renda que muda de um mês para o outro, e o texto diz que aqui não é tipo de aplicação.

1. Oficial. Banco Central do Brasil: Caderno de Educação Financeira: Gestão de Finanças Pessoais (Conteúdo Básico), 2013. <https://www.bcb.gov.br/pre/pef/port/caderno_cidadania_financeira.pdf>. Trecho: Módulo 2, receitas fixas não variam ou variam pouco (salário, aposentadoria, aluguel) e receitas variáveis mudam de um mês para o outro (comissões por vendas, aulas particulares); o planejamento usa a rotina passada como base para prever receitas e despesas futuras. Consulta: 09/10/2026.
2. Oficial. Superintendência de Seguros Privados (Susep): Meu Futuro Seguro, Educação Financeira. <https://www.gov.br/susep/pt-br/assuntos/meu-futuro-seguro/educacao-financeira>. Trecho: anotar só valores que se tem certeza de receber, sem acréscimos variáveis como gorjetas e gratificações; quem trabalha por conta própria, com receitas que variam de mês a mês, deve deixar de seis meses a um ano. Consulta: 09/10/2026.
3. Oficial. CVM, Portal do Investidor: Emergências e aposentadoria. <https://www.gov.br/investidor/pt-br/investir/antes-de-investir/defina-seus-objetivos/emergencias-e-aposentadoria>. Trecho: o valor da reserva depende do tipo de renda, se fixa ou variável, da estabilidade no emprego e de quantas pessoas contribuem para a renda familiar. Consulta: 09/10/2026.
4. Clarevo: D-026.

Ressalvas e ajustes:

- Nenhuma fonte oficial prescreve um método para a renda de referência (média de N meses, menor mês). A sugestão do app (média dos meses fechados com recebimentos anotados, sem reembolsos) é escolha do Clarevo e o texto diz isso; "usar o menor valor dos últimos meses" aparece como opção, sem atribuição.
- O botão "Calcular pela média" do formulário da renda de referência (D-062, Ciclo V) é outra escolha do Clarevo, no mesmo espírito: a média do Recebido dos últimos 3 ou 6 meses fechados (com os meses conferidos como zero, sem os meses sem registros e sem reembolsos, como a sugestão), que só preenche o campo e diz que é uma estimativa. O tema não muda: ele já diz que o método é escolha do Clarevo e não uma regra oficial, e nenhum texto do tema cita o botão. O tema "Média e mediana" (Ciclo W, D-062 item 3) é o que explica a conta.
- A faixa de seis meses a um ano é da Susep, com base na renda; a da CVM é em gastos. O tema atribui cada uma à sua fonte e não mapeia 12 meses a renda variável pela autoridade da CVM.
- Há uma 2ª edição do Caderno do Banco Central (2026) que não foi conferida; a citação é da edição de 2013. Nenhum limite de imposto ou de INSS entra no texto, porque mudam por ano.

### `aporte` · O que muda ao registrar um aporte (publicado)

Revisar até 09/10/2027 (12 meses).

1. Oficial. CVM, Portal do Investidor: Planejamento e gestão de reservas financeiras. <https://www.gov.br/investidor/pt-br/penso-logo-invisto/planejamento-e-gestao-de-reservas-financeiras>. Trecho: definir uma meta para a reserva ajuda a manter o foco e a determinação; em seguida, criar um plano para economizar uma parte da renda mensal. Consulta: 09/10/2026.
2. Clarevo: D-027.

Ressalvas e ajustes:

- Só o último parágrafo cita a CVM. As regras de aporte, resgate, rendimento recebido e valorização são do Clarevo (D-027), sem definição externa de "aporte". Os valores do exemplo (R$ 3.000,00, R$ 500,00, R$ 300,00 e o Pago de R$ 3.900,00) são fictícios e saem de `learn/examples.ts`.

### `essenciais` · Gastos essenciais (publicado)

Revisar até 09/10/2027 (12 meses).

1. Oficial. Banco Central do Brasil: Caderno de Educação Financeira: Gestão de Finanças Pessoais (Conteúdo Básico), 2013. <https://www.bcb.gov.br/pre/pef/port/caderno_cidadania_financeira.pdf>. Trecho: gastos necessários, considerados imprescindíveis e ligados às necessidades, como alimentação, moradia e vestuário. Consulta: 09/10/2026.
2. Oficial. CVM, Portal do Investidor: Emergências e aposentadoria. <https://www.gov.br/investidor/pt-br/investir/antes-de-investir/defina-seus-objetivos/emergencias-e-aposentadoria>. Trecho: o montante da reserva para emergências deve estar entre 6 e 12 meses de gastos. Consulta: 09/10/2026.
3. Oficial. CVM, Portal do Investidor: Planejamento e gestão de reservas financeiras. <https://www.gov.br/investidor/pt-br/penso-logo-invisto/planejamento-e-gestao-de-reservas-financeiras>. Trecho: reserva só para imprevistos, o que exclui gastos sazonais (só numa época do ano, mas previsíveis), como tributos e matrículas. Consulta: 09/10/2026.
4. Clarevo: D-027 (a lista de categorias e a regra da média, resolvendo P-017).

Ressalvas e ajustes:

- A lista Moradia, Mercado, Transporte, Saúde e Educação (Lazer e "Sem categoria" fora) é escolha do Clarevo, dita no texto, e não é atribuída a nenhuma instituição.
- **A conferir (R5):** a classificação do Banco Central (necessários, supérfluos e desperdícios) e o exemplo de alimentação, moradia e vestuário foram confirmados só por resumos do buscador e por uma cópia do mesmo texto em material de outra instituição; não houve trecho literal de `bcb.gov.br`. Quem publicar de novo abre o PDF e confere o parágrafo dos gastos necessários.
- O parágrafo 3 diz "impostos e matrículas", e não "IPVA e IPTU", porque a busca indexa os parágrafos e a palavra IPVA levaria a este tema; o exemplo, que não entra na busca, usa o IPVA. O tema cita só `D-027` como fonte do Clarevo (o validador aceita referências D-nnn ou CL-nnn; P-017 está resolvida em D-027(6)).

### `media-e-mediana` · Média e mediana (publicado, Ciclo W)

Seção "Organizar o mês", logo depois de `essenciais` e antes dos temas de época. Sem calculadora. Ação "No Clarevo": "Ver na Evolução" (`/evolucao`). Revisar até 20/10/2027 (12 meses; o aviso do teste começa em 20/09/2027). Consultas de 20/10/2026, por trecho de resultado de busca da própria fonte (a página do IBGE Educa não abriu a partir do ambiente de trabalho: `getaddrinfo ENOTFOUND educa.ibge.gov.br`).

1. Oficial. IBGE (Instituto Brasileiro de Geografia e Estatística): A Mediana (Educa Jovens). <https://educa.ibge.gov.br/jovens/materias-especiais/17870-a-mediana.html>. Trecho: a mediana indica o valor que está exatamente no meio de um conjunto de dados quando eles estão ordenados; com quantidade par de valores há dois valores centrais e a mediana é a média aritmética deles (posições n/2 e n/2 + 1; o exemplo da página usa os 92 municípios do Rio de Janeiro, com 34.410 e 35.347 no meio e mediana de 34.878,5); a mediana "pode nos fornecer um valor típico do conjunto de dados porque ela não é afetada por valores extremos"; é medida de tendência central, junto com a média e a moda. Consulta: 20/10/2026.
2. Oficial. IBGE (Instituto Brasileiro de Geografia e Estatística): A Média Aritmética (Educa Jovens). <https://educa.ibge.gov.br/jovens/materias-especiais/17862-media-pagina-inicial.html>. Trecho: a média aritmética simples é a soma dos valores dividida pelo número de observações (o exemplo da página usa idades de 40, 36, 14 e 10 anos: soma 100, média 25); é medida de tendência central, ao lado da moda e da mediana; fica entre o menor e o maior valor, e todos os valores entram no cálculo. Consulta: 20/10/2026.
3. Clarevo: D-057 (a tela Evolução, que mostra a média e a mediana) e D-062 (o tema).

Ressalvas e ajustes:

- **O que veio como citação e o que veio como resumo.** O trecho "pode nos fornecer um valor típico do conjunto de dados porque ela não é afetada por valores extremos" e a definição de mediana como o valor "exatamente no meio" apareceram entre aspas em resultados de busca da página A Mediana. A regra do número par de valores (média dos dois do meio, posições n/2 e n/2 + 1) e o exemplo dos municípios vieram como resumo do resultado de busca, e a fórmula da média simples (soma dividida pelo número de observações) e o exemplo das quatro idades vieram como resumo da página A Média Aritmética, sem o trecho literal. Abrir as duas páginas e comparar com o `locator` do tema.
- **Por que o IBGE Educa.** A busca por rendimento médio e mediano na PNAD Contínua trouxe só médias (a página de "Rendimento de todas as fontes" e o glossário da PNAD Contínua definem o rendimento médio habitual, não a mediana); o material de ensino de estatística do IBGE Educa é a fonte pública que define as duas medidas. O Atlas do Censo 2010 do IBGE define "rendimento mediano mensal" no glossário dele, mas o trecho veio fragmentado e ficou fora das fontes.
- **O que o tema afirma e o que não afirma.** Afirma a definição das duas, que a mediana não é afetada por valores extremos (a palavra é do IBGE) e que a média leva todos os valores em conta (fonte 2). Não afirma qual das duas é melhor ("Uma não é melhor que a outra: as duas respondem a perguntas diferentes" é texto do Clarevo), não chama nenhum mês de atípico ou anormal e não usa a mediana como regra de planejamento: a renda de referência continua sendo escolha da pessoa (`renda-variavel`).
- **O que é do Clarevo.** Como a tela Evolução usa as duas: só os meses fechados com registros, ou conferidos como zero (D-060), que a pessoa não tirou da comparação; o mês em andamento e os meses sem registros ficam de fora; tirar um mês não muda nenhum lançamento (D-057, D04 e D03).
- **O exemplo.** É o caso de referência da Evolução (`docs/14` §6, cenário `?cenario=evolucao`): Pago de janeiro a junho de R$ 3.200,00, R$ 3.400,00, R$ 3.300,00, R$ 7.800,00 (abril, com um conserto), R$ 3.450,00 e R$ 3.600,00; média R$ 4.125,00 (R$ 24.750,00 ÷ 6) e mediana R$ 3.425,00 ((R$ 3.400,00 + R$ 3.450,00) ÷ 2); sem abril, média R$ 3.390,00 (R$ 16.950,00 ÷ 5) e mediana R$ 3.400,00. As contas saem de `averageCents` e `medianCents` (`learn/math.ts`), as mesmas que `comparisonStats` usa na tela, e `learn/examples.ts` guarda os números esperados.

### `decimo-terceiro` · 13º salário (publicado, Ciclo K2)

Revisar até 15/10/2027 (12 meses). Fontes consultadas em 15/10/2026, todas por trecho de resultado de busca da própria fonte (nenhuma das páginas abriu a partir do ambiente de trabalho).

1. Oficial. Ministério do Trabalho e Emprego: Décimo terceiro salário: entenda o direito, regras e prazos de pagamento (novembro de 2025). <https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2025/novembro/decimo-terceiro-salario-entenda-o-direito-regras-e-prazos-de-pagamento>. Trecho: primeira parcela entre fevereiro e novembro, com prazo máximo até 30 de novembro, e metade da remuneração do mês anterior; segunda parcela até 20 de dezembro. Consulta: 15/10/2026.
2. Oficial. Ministério do Trabalho e Emprego: Décimo terceiro salário: entenda o direito, regras e prazos de pagamento (dezembro de 2024). <https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2024/Dezembro/decimo-terceiro-salario-entenda-o-direito-regras-e-prazos-de-pagamento>. Trecho: fração igual ou superior a 15 dias conta como mês completo. Consulta: 15/10/2026.
3. Oficial. Presidência da República: Lei nº 4.090, de 13 de julho de 1962. <https://www.planalto.gov.br/ccivil_03/leis/l4090.htm>. Trecho: art. 1º, § 1º (um doze avos da remuneração devida em dezembro por mês de serviço) e § 2º (fração igual ou superior a 15 dias vale como mês integral). Consulta: 15/10/2026.
4. Oficial. Presidência da República: Lei nº 4.749, de 12 de agosto de 1965. <https://www.planalto.gov.br/ccivil_03/leis/l4749.htm>. Trecho: art. 1º (pagamento até 20 de dezembro, compensado o adiantamento) e art. 2º (adiantamento entre fevereiro e novembro, de metade do salário do mês anterior, junto com as férias quando pedido em janeiro). Consulta: 15/10/2026.
5. Oficial. Instituto Nacional do Seguro Social: Tabela de contribuição mensal. <https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal>. Trecho: o 13º não é somado à remuneração mensal para o enquadramento na tabela de salários de contribuição. Consulta: 15/10/2026.
6. Oficial. Receita Federal: Meu Imposto de Renda, rendimentos do trabalho. <https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/manual-mir/rendimentos/rendimentos-do-trabalho>. Trecho: o décimo terceiro salário tem a forma de tributação exclusiva na fonte. Consulta: 15/10/2026.
7. Clarevo: D-011 e D-053.

Ressalvas e ajustes:

- **Datas do ano.** Os prazos do texto (30 de novembro e 20 de dezembro) são os da regra geral, confirmados na página do Ministério do Trabalho e Emprego de novembro de 2025. A busca também trouxe reportagens e escritórios de advocacia dizendo que, em 2026, a segunda parcela deve ser paga na sexta-feira, 18 de dezembro (20 de dezembro cai num domingo); isso **não** veio de página oficial e por isso **não** está no tema, que manda conferir os prazos do ano no site do Ministério.
- **Descontos por parcela: fora do texto.** O trecho de "a primeira parcela sai sem tributos e os descontos de Imposto de Renda e INSS incidem na segunda" apareceu na mesma busca que páginas de prefeituras e não foi confirmado em página oficial aberta; por isso o tema **não afirma** em qual parcela cada desconto incide (nem no resumo nem no parágrafo) e só manda conferir os descontos no contracheque. O `locator` da fonte 2 ficou só com a fração de 15 dias. Quem abrir a página do Ministério (dezembro de 2024 ou a de novembro de 2025) e confirmar a frase pode voltar a afirmá-la, com o trecho literal. O tema não tem fatos de norma (`facts` vazio): o texto só diz que o INSS do 13º não entra na faixa do salário do mês (fonte 5) e que o Imposto de Renda é cobrado na fonte (fonte 6). O art. 2º, § 2º da Lei 4.749/1965 (adiantamento junto com as férias, se pedido em janeiro) veio do texto da lei por trecho de busca.
- **Sem faixas nem alíquotas.** O tema não cita tabela de INSS nem de Imposto de Renda, porque mudam por portaria e por lei (a Lei 15.270/2025 criou, desde 1º de janeiro de 2026, uma redução do imposto que a Receita diz valer também para o 13º; não entrou no texto). O app não calcula descontos, e o exemplo é só o proporcional (R$ 3.000,00 ÷ 12 × 7 = R$ 1.750,00), calculado por `thirteenthCents` (`learn/math.ts`) e testado.

### `ferias` · Férias: pagamento, um terço e abono (publicado, Ciclo K2)

Calculadora: `/calcular/juntar-para-objetivo`. Revisar até 15/10/2027 (12 meses). Consultas de 15/10/2026, por trecho de resultado de busca.

1. Oficial. Ministério do Trabalho e Emprego: Férias Anuais e Coletivas (perguntas frequentes do Portal FAT). <https://portalfat.trabalho.gov.br/programas-e-acoes-2/programa-de-protecao-do-emprego-ppe/perguntas-frequentes/ferias-anuais-e-coletivas/>. Trecho: 30 dias corridos para quem não faltou injustificadamente mais de 5 vezes; Constituição, art. 7º, XVII, remuneração superior em pelo menos um terço ao salário normal; pagamento até 2 dias antes do início. Consulta: 15/10/2026.
2. Oficial. Presidência da República: Decreto-Lei nº 1.535, de 13 de abril de 1977 (arts. 143 e 145 da CLT). <https://www.planalto.gov.br/ccivil_03/decreto-lei/del1535.htm>. Trecho: art. 143 (conversão de um terço em abono pecuniário, pedida até 15 dias antes do fim do período aquisitivo) e art. 145 (pagamento até 2 dias antes do início). Consulta: 15/10/2026.
3. Oficial. Câmara dos Deputados: Consolidação das Leis do Trabalho, texto atualizado. <https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-5452-1-maio-1943-415500-normaatualizada-pe.html>. Trecho: art. 134, § 1º (até três períodos, com concordância, um deles com pelo menos 14 dias corridos; redação da Lei 13.467/2017). Consulta: 15/10/2026.
4. Oficial. Presidência da República: Lei nº 4.749/1965. <https://www.planalto.gov.br/ccivil_03/leis/l4749.htm>. Trecho: art. 2º, § 2º (adiantamento do 13º junto com as férias, a pedido em janeiro). Consulta: 15/10/2026.
5. Clarevo: D-053.

Ressalvas e ajustes:

- O tema não traz o abono no exemplo: o terço sobre os dias vendidos tem entendimento próprio no TST (Súmula 328, vista em resultado de busca), e o app não deve calcular o que a lei deixa a cargo de cada caso. O exemplo é o simples: salário mais um terço, por `vacationPayCents` (`learn/math.ts`).
- O desconto de INSS e de Imposto de Renda sobre as férias não é descrito (sem fonte conferida): o exemplo diz "antes dos descontos".
- O art. 130 da CLT (30 dias, e menos com faltas) foi confirmado pelo Portal FAT; o texto diz só "30 dias corridos para quem não faltou mais de cinco vezes sem justificativa". Há projetos de lei em tramitação sobre o pagamento em dobro e sobre o art. 130; nenhum entrou no texto.

### `volta-as-aulas` · Volta às aulas: mensalidade e material (publicado, Ciclo K2)

Revisar até 15/10/2027 (12 meses). Consultas de 15/10/2026, por trecho de resultado de busca.

1. Oficial. Câmara dos Deputados: Lei nº 9.870, de 23 de novembro de 1999, texto atualizado. <https://www2.camara.leg.br/legin/fed/lei/1999/lei-9870-23-novembro-1999-369698-normaatualizada-pl.html>. Trecho: art. 1º (valor anual ou semestral com vigência de um ano, dividido em doze ou seis parcelas mensais iguais, com planos alternativos que não excedam o total) e art. 2º (divulgação da proposta de contrato, do valor e do número de alunos por sala pelo menos 45 dias antes da data final da matrícula). Consulta: 15/10/2026.
2. Oficial. Câmara dos Deputados: Lei nº 12.886, de 26 de novembro de 2013. <https://www2.camara.leg.br/legin/fed/lei/2013/lei-12886-26-novembro-2013-777456-publicacaooriginal-141976-pl.html>. Trecho: acrescenta o § 7º ao art. 1º da Lei 9.870/1999 (é nula a cláusula que imponha pagamento extra, ou o fornecimento, de material de uso coletivo, cujo custo entra no cálculo da anuidade). Consulta: 15/10/2026.
3. Oficial. Procon de Mato Grosso: Confira recomendações do Procon-MT para a volta às aulas. <https://www.procon.mt.gov.br/en/w/confira-recomenda%C3%A7%C3%B5es-do-procon-mt-para-volta-%C3%A0s-aulas>. Trecho: itens de uso coletivo não entram na lista; a escola não pode indicar marcas, direcionar o local de compra nem exigir o material na própria instituição. Consulta: 15/10/2026.
4. Oficial. Prefeitura de Sinop, Procon: Procon Sinop orienta consumidores sobre direitos e economia na volta às aulas. <https://www.sinop.mt.gov.br/portal/noticias/0/3/12931/procon-sinop-orienta-consumidores-sobre-direitos-e-economia-na-volta-as-aulas>. Trecho: não há necessidade de comprar todo o material escolar no início do ano. Consulta: 15/10/2026.
5. Clarevo: D-029 e D-053.

Ressalvas e ajustes:

- **Numeração do parágrafo.** A Lei 9.870/1999 numerou a divisão em parcelas como § 3º no texto original e como § 5º no texto atualizado da Câmara (renumerado pela Medida Provisória nº 2.173-24/2001); por isso o tema e o trecho citam só o art. 1º.
- O § 7º do art. 1º veio da síntese de busca da Lei 12.886/2013. Uma reportagem da Câmara sobre a lei dá exemplos de itens (papel higiênico, álcool, produtos de limpeza e de escritório), mas ela **não está entre as fontes do tema**; por isso o texto não traz exemplos e diz só "itens de uso coletivo", como a lei e o Procon-MT (fonte 3). Não há lista de itens, porque a lista legal é exemplificativa e alguns estados têm lei própria.
- Orientações dos Procons são de órgãos estaduais e municipais, não da lei: o texto diz "Segundo os Procons" e "Os Procons lembram". A taxa de matrícula e a cobrança à parte não entram no tema: não houve fonte oficial confirmada.

### `imposto-de-renda` · Declaração do Imposto de Renda (publicado, Ciclo K2)

Revisar até 15/04/2027 (6 meses; o aviso do teste começa em 16/03/2027). Consultas de 15/10/2026, por trecho de resultado de busca (os arquivos e as páginas não abriram).

1. Oficial. Receita Federal: Receita começa a receber declarações do IRPF no dia 23 de março; prazo de entrega se encerra em 29 de maio. <https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/marco/receita-comeca-a-receber-declaracoes-do-irpf-no-dia-23-de-marco-prazo-de-entrega-se-encerra-em-29-de-maio>. Trecho: o título da página; prazo de 2026 de 23/03/2026 a 29/05/2026, IN RFB nº 2.312/2026, e datas definidas por instrução normativa a cada ano. Consulta: 15/10/2026.
2. Oficial. Receita Federal: Multa por Atraso (Meu Imposto de Renda). <https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/multa>. Trecho: multa de 1% ao mês-calendário ou fração de atraso sobre o imposto devido, ainda que integralmente pago, limitada a 20% do imposto; valor mínimo de R$ 165,74, aplicado ainda que não resulte imposto devido. Consulta: 15/10/2026.
3. Oficial. Receita Federal: Perguntas e Respostas IRPF 2026. <https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf>. Trecho: pergunta 063, saldo em até 8 quotas mensais e sucessivas, nenhuma inferior a R$ 50,00, imposto inferior a R$ 100,00 em quota única; primeira quota (ou única) sem juros no último dia do prazo, demais com a Selic acumulada. Consulta: 15/10/2026.
4. Oficial. Presidência da República: Lei nº 9.250, de 26 de dezembro de 1995. <https://www.planalto.gov.br/ccivil_03/leis/l9250.htm>. Trecho: nenhuma quota será inferior a R$ 50,00, e o imposto de valor inferior a R$ 100,00 será pago de uma só vez. Consulta: 15/10/2026.
5. Oficial. Receita Federal: Quem deve declarar (Meu Imposto de Renda). <https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/quem>. Trecho: critérios e limites de valor do exercício 2026 (rendimentos tributáveis, bens, atividade rural e outros). Consulta: 15/10/2026.
6. Oficial. Receita Federal: Aprovado o novo modelo de Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte (dezembro de 2021). <https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2021/dezembro/aprovado-o-novo-modelo-de-comprovante-de-rendimentos-pagos-e-de-imposto-sobre-a-renda-retido-na-fonte>. Trecho: comprovante fornecido até o último dia útil de fevereiro do ano seguinte ao pagamento, ou na rescisão, se antes. Consulta: 15/10/2026.
7. Clarevo: D-029 e D-053.

Fatos de norma do tema (`facts`): 1%, 20% e R$ 165,74 (fonte 2); R$ 50,00 e R$ 100,00 (fonte 3). O prazo de 2026 aparece como fato do ano passado ("em 2026, o prazo foi de 23 de março a 29 de maio"), com o texto "Confira a data oficial do ano no site da Receita"; o prazo de 2027 só sai depois de uma instrução normativa nova, e o tema não cita nenhuma data dele.

Ressalvas e ajustes:

- **A conferir quando as páginas abrirem:** o artigo da Lei 9.250/1995 sobre as quotas (a busca disse art. 8º; a numeração não foi confirmada, e o tema cita só a lei); a lista de quem deve declarar em 2027 (o tema não traz números dela); o prazo para pagar a multa (a busca trouxe 30 dias nas perguntas frequentes e "20 dias úteis" numa página antiga; o tema não cita esse prazo).
- A Lei 15.270/2025 (isenção até R$ 5 mil por mês, desde 1º de janeiro de 2026, e redução anual a partir da declaração de 2027) não entrou no texto: o tema não traz tabela, faixa nem imposto devido de ninguém.
- A frase "ajuda guardar durante o ano os informes de rendimentos" é orientação do Clarevo, sem recomendação de produto; o app não gera arquivo para a declaração (D-047).
- Por que 6 meses: o texto cita o prazo de 2026, e a Receita publica o de cada ano pouco antes de março; a revisão de abril de 2027 troca o ano e confere multa, quotas e critérios. `SIX_MONTH_REVIEW` (`learn/validate.ts`) ganhou `imposto-de-renda`.

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

Calculadora: `/calcular/custo-da-divida?modo=rotativo`. Revisar até 10/04/2027 (6 meses; revisado em 10/10/2026 por causa do parágrafo dos cartões, D-037). Fonte do Clarevo: D-037.

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

### `simulacao` · Como ler uma simulação (publicado)

Revisar até 09/10/2027 (12 meses). Fatos de norma declarados: "de 0% a 30%" (fonte 5, a decisão D-028, que é do Clarevo).

1. Oficial. Banco Central do Brasil: Glossário Simplificado de Termos Financeiros (2013). <https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Informacoes_gerais/glossario_cidadania_financeira.pdf>. Trecho: verbete "Juros compostos", em que, após cada período de capitalização (normalmente um mês), os juros são incorporados ao capital e passam a render juros (juros sobre juros ou juros capitalizados). Consulta: 09/10/2026.
2. Oficial. Banco Central do Brasil: Calculadora do Cidadão, metodologia da aplicação com depósitos regulares. <https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaAplicacaoDepositosRegulares.do?method=exibirMetodologiaAplicacaoDepositosRegulares>. Trecho: fórmula Sn = (1 + j) × [((1 + j)^n - 1) / j] × p, com n pagamentos iguais realizados no início de cada período; o fator (1 + j) faz cada depósito render já no mês em que é feito. Consulta: 09/10/2026.
3. Oficial. IBGE: IBGE Explica, Inflação. <https://www.ibge.gov.br/explica/inflacao.php>. Trecho: inflação é o nome dado ao aumento dos preços de produtos e serviços. Consulta: 09/10/2026.
4. Oficial. CVM e Senacon: Boletim Consumidor Investidor nº 1, objetivos e riscos. <https://www.gov.br/mj/pt-br/assuntos/seus-direitos/consumidor/boletins-para-o-consumo/boletim-consumidor-investidor/anexos/boletim-cvm-01>. Trecho: há risco em qualquer investimento. Consulta: 09/10/2026.
5. Clarevo: D-028.

Ressalvas e ajustes:

- **Convenção dos aportes:** aportes no início de cada mês, como na Calculadora do Cidadão, por resposta "a" de Enzo em 09/10/2026 (a especificação de 08/10/2026 usava o fim do mês). O trecho da metodologia veio de um resultado de busca; a página e a calculadora não foram abertas, e nenhum resultado dela foi comparado com o do simulador. Conferir ao abrir.
- A frase "rentabilidade passada não garante rentabilidade futura" não foi encontrada em página da CVM e ficou fora do texto: o tema diz só que as taxas mudam e que a CVM lembra que há risco em qualquer investimento.
- O tema não cita as Resoluções CVM 19, 20 e 30 (não verificadas); elas só justificam, em D-028(4), que o simulador não indique produto nem taxa.
- O exemplo (R$ 500,00 por mês por 10 anos a 10% ao ano: R$ 100.728,79, e R$ 64.862,05 em dinheiro de hoje com inflação de 4,5%) vem de `learn/examples.ts` e bate com o vetor do simulador; a taxa de 10% é só para a conta e o texto diz que não é sugestão.

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

Mudança em relação à especificação de 08/10/2026: ela previa "Taxa, tarifa e encargo" em rascunho e o 50-30-20 publicado. A Res. CMN 3.919/2010 foi conferida (o tema saiu publicado, com "Na conta corrente" e "Quando uma conta atrasa, entram encargos"), e o 50-30-20 ficou em rascunho. Com os cinco temas dos Ciclos B, C e D, o total passou a 40 publicados e 2 rascunhos; com os quatro temas de época do Ciclo K2 (D-053), a 44 publicados e 2 rascunhos; com "Média e mediana" do Ciclo W (D-062), a 45 publicados e 2 rascunhos. Antes de publicar `orcamento-50-30-20`, reescrever o parágrafo 1, que diz "o que sobra" (o Clarevo não usa "sobra" para o dinheiro que fica); como é rascunho, o texto não aparece em nenhuma tela.

**Pendências do Ciclo E (D-037 e D-038).** Os cartões e a leitura de notas entraram no app em 10/10/2026, mas o conteúdo de Aprender ainda não acompanha:

- Feito em 10/10/2026: o tema `fatura` (Usar o Clarevo) trocou o segundo parágrafo ("Cartões ainda não estão disponíveis no Clarevo...") por `CARDS_TEXT.topicParagraph` (`packages/core/src/cards.ts`), cita D-037 nas fontes do Clarevo (D-020 e D-037) e passou a 79 palavras. O tema `rotativo-cartao` trocou "O Clarevo ainda não registra cartões. Este conteúdo explica o conceito." por `CARDS_TEXT.rotativoParagraph` (o que sobra de um pagamento parcial vira saldo anterior na fatura seguinte, sem juros, e o Clarevo não calcula juros sozinho), cita D-037 e passou a 312 palavras (2 min, abaixo do limite de 320). Os dois têm `reviewedOn` 10/10/2026; as fontes externas seguem consultadas em 09/10/2026, e o prazo de `rotativo-cartao` passou a 10/04/2027.
- Não existe o tema "Ler nota fiscal" (o que é lido, o que nunca é guardado, com a fonte da Sefaz), nem a linha "A chave da nota fica no registro. O CPF nunca é guardado." em "Quem vê estes dados?", propostos em `docs/10` §2.5. O que o app guarda hoje é só o resumo SHA-256 da chave (D-038(5)), e o texto precisa dizer isso. Ao criar o tema, a fonte da Sefaz passa pela conferência da seção 3.
- Não existe tema sobre o cartão em si (limite, fechamento e vencimento, com fonte); o cadastro do app explica só o que ele guarda.

## 6. Ressalvas para conferir quando as páginas abrirem

Nenhuma muda o texto publicado hoje; todas estão também na seção 4, no tema.

- Res. CMN 5.004/2022: o art. 7º foi confirmado pelo Voto CMN 33/2022 (texto aprovado) e pela ata, não pelo PDF da resolução (`quitar-antes`).
- Res. CMN 4.549/2017 com a 5.112/2023: a definição de "encargos financeiros" veio como resumo da ferramenta de busca sobre o PDF do Banco Central (`rotativo-cartao`).
- Lei 14.905/2024: art. 5º (vigência) e art. 406, § 3º (piso zero), vistos só como paráfrase no Planalto (`multa-juros-atraso`).
- Estatuto e regulamento do FGC: os trechos são das versões de 2024; as de 2026 não foram comparadas (`fgc`).
- Acórdão do TRF3 sobre Price e SAC: número e data não vieram na busca (`amortizacao-price-sac`).
- Mínimo existencial: a primeira avaliação anual pelo CMN, pedida pelo STF, não foi encontrada até 09/10/2026 (`superendividamento`).
- Temas de época (15/10/2026): nenhuma das páginas citadas abriu (`gov.br`, `planalto.gov.br` e `camara.leg.br` falharam por DNS); abrir e comparar cada trecho com o `locator` do tema. Pontos mais frágeis: o momento dos descontos do 13º (`decimo-terceiro`, fonte 2, trecho misturado com páginas de prefeituras), que o tema deixou de afirmar e manda conferir no contracheque; o art. 134, § 1º da CLT (`ferias`, texto atualizado da Câmara) e os arts. 143 e 145 (síntese de busca do Decreto-Lei 1.535/1977); o parágrafo da divisão da anuidade em 12 parcelas (`volta-as-aulas`: § 3º no texto original, § 5º no atualizado); o artigo da Lei 9.250/1995 sobre as quotas e o prazo para pagar a multa (`imposto-de-renda`).
- `imposto-de-renda`: em março de 2027, trocar "em 2026, o prazo foi de 23 de março a 29 de maio" pelo prazo do ano novo (a instrução normativa de 2027 não existia em 15/10/2026) e conferir a multa, as quotas e a lista de quem deve declarar; a Lei 15.270/2025 muda a tabela e a redução anual a partir da declaração de 2027 e hoje não aparece no texto.
- `media-e-mediana` (20/10/2026): as duas páginas do IBGE Educa não abriram (DNS); abrir e comparar com o `locator`. Pontos mais frágeis: a regra do número par (média dos dois do meio) e a fórmula da média simples vieram como resumo do resultado de busca, e não como trecho literal; só a definição de mediana e a frase sobre valores extremos vieram entre aspas.
- Referendo do plenário do STF na ADC 96 (IOF) não encontrado até 09/10/2026; não muda pessoa física (`iof-credito`).
- Res. CMN 3.919/2010 (versão 7) e Res. CMN 4.881/2020: conferidas só por trechos de busca; nenhuma revogação encontrada (`taxa-e-tarifa`, `cet`).
- Res. CMN 5.141/2024 (meta de inflação): número e conteúdo confirmados nos boxes do Relatório de Política Monetária, não no texto da resolução (`inflacao-ipca`).
- MP 1.393/2026 (rotativo) e PLP 135/2026 (limite do FGC): acompanhar a votação; nenhuma das duas está no texto.
- Série 8 do Banco Central e título atual da página da Serasa: o trecho da Série 8 (edição 8, novembro de 2023) e o título que o buscador indexa para a página de comprometimento de renda diferem do que está no tema; abrir as duas páginas (`renda-comprometida`).
- Caderno de Educação Financeira do Banco Central (2013): o parágrafo dos gastos necessários, com alimentação, moradia e vestuário, foi confirmado sem trecho literal de `bcb.gov.br`; há uma 2ª edição, de 2026, não conferida (`essenciais`, `renda-variavel`).
- Calculadora do Cidadão, aplicação com depósitos regulares: a fórmula e o "início de cada período" vieram de um resultado de busca; abrir a página e comparar um resultado com o do simulador (`simulacao`).
- A página da CVM sobre a reserva (6 a 12 meses de gastos) foi confirmada por busca para o tema `reserva-imprevistos`. A calculadora de reserva do Ciclo A6 ainda mostra a referência sem link e sem número (`RESERVA_REFERENCIA`, D-035(3)); usar a mesma conferência ali depende de decisão.
- Feriados nacionais do aviso de dia útil (19/10/2026, seção 11): nenhuma das três páginas do Planalto abriu (DNS na leitura de páginas e bloqueio de saída na linha de comando); abrir e comparar o artigo de cada lei com o `locator`. Pontos mais frágeis: os nomes usuais dos feriados (as Leis 662 e 10.607 citam só as datas, e a Lei 14.759 diz "Dia Nacional de Zumbi e da Consciência Negra"), e os anos de início de vigência de 2 de novembro (**a conferir**: nenhuma fonte consultada traz a cláusula de vigência da Lei 10.607/2002, então o ano de 2003 do código é só o primeiro 2 de novembro depois da publicação, em 20/12/2002, e este documento não o afirma) e de 12 de outubro (1980), que o aviso nunca usa porque só olha vencimentos de hoje em diante. O 21 de abril vale desde 1951 (Lei 1.266/1950, art. 3, que a Lei 10.607/2002 revogou ao manter a data): o artigo 3º da Lei 1.266 e a revogação vieram só de resultado de busca (Senado Federal e Planalto), e a Lei 1.266 não está na lista de fontes do código.
- Regra do próximo dia útil (19/10/2026, seção 11, D-061): nenhuma das duas páginas abriu (a Lei 7.089/1983 no Planalto e a notícia do STJ); os trechos vêm de resultado de busca. Abrir as duas e comparar o art. 1º com o `locator`. Pontos mais frágeis: a lei diz "primeiro dia subsequente" e o STJ lê como primeiro dia útil, e o texto do app diz as duas coisas (a palavra da lei e, em seguida, a leitura do STJ), sem afirmar além do trecho; a lei não menciona multa (o app só diz que a multa e as regras de cada cobrança podem variar); a data da notícia do STJ (o endereço traz 25/02/2022, e o julgamento da Terceira Turma é do fim de 2021) não foi conferida; o caso do acórdão é fatura de cartão paga depois de vencer num sábado, e o app estende a leitura aos outros tipos de cobrança só como aviso para conferir com quem cobra.

## 7. Prazos de revisão

| Prazo | Temas | Aviso do teste a partir de |
|---|---|---|
| 09/04/2027 (6 meses) | `iof-credito`, `cheque-especial` | 10/03/2027 |
| 10/04/2027 (6 meses) | `rotativo-cartao` | 11/03/2027 |
| 15/04/2027 (6 meses) | `imposto-de-renda` (D-053: o prazo de cada ano só sai pouco antes de março) | 16/03/2027 |
| 09/10/2027 (12 meses) | os demais temas com fonte externa publicados em 09/10/2026, inclusive os 2 rascunhos | 09/09/2027 |
| 15/10/2027 (12 meses) | `decimo-terceiro`, `ferias` e `volta-as-aulas` (D-053) | 15/09/2027 |
| 20/10/2027 (12 meses) | `media-e-mediana` (D-062) | 20/09/2027 |
| 19/10/2027 (12 meses) | lista de feriados nacionais do aviso de dia útil e as fontes da regra do próximo dia útil (`packages/core/src/dia-util.ts`, D-060 e D-061), que não são tema de Aprender | `dia-util.test.ts` reprova depois do prazo, sem aviso antes |
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
- `renda-comprometida`, `renda-variavel`, `aporte`, `essenciais` e `simulacao` (Ciclos B, C e D): textos novos da especificação de 09/10/2026, reescritos com o que cada fonte diz. Em `essenciais`, o parágrafo 2 diz que a sugestão olha "os seis meses fechados mais recentes e usa até três deles, os mais recentes com gastos anotados", como `essentialMonthly`, e o parágrafo 3 diz "impostos e matrículas" no lugar de "IPVA e IPTU" (ver o tema na seção 4). Em `simulacao`, o parágrafo 2 registra que os aportes são no início de cada mês. As seções "Organizar o mês" (agora cita renda comprometida, reserva e aportes) e "Dinheiro no tempo" (cita como ler uma simulação) ganharam descrições novas, e `reserva-imprevistos` passou a relacionar `essenciais`, `contas-do-ano` e `liquidez-risco-retorno`.
- `contas-do-ano`: texto do Anexo A, com o parágrafo da CVM, mais o parágrafo do app; `sem-registro`: texto do Ciclo A4.
- `media-e-mediana` (Ciclo W, 20/10/2026): tema novo da seção "Organizar o mês", logo depois de `essenciais`. O texto não chama o mês de abril de atípico nem de anormal ("um mês bem maior ou bem menor", "o mês que mais se afasta dos outros"), não diz qual medida é melhor, não usa moda (a fonte a cita só como a terceira medida de tendência central) e não recomenda método de planejamento. O exemplo usa os valores do caso de referência da Evolução, sem citar o R$ 4.400,00 do conserto. `renda-variavel` e `essenciais`, que falam de média de meses, não mudaram de texto.
- Conteúdo de época (Ciclo K2, 15/10/2026): `decimo-terceiro`, `ferias`, `volta-as-aulas` e `imposto-de-renda` entraram na seção "Organizar o mês", logo depois de `essenciais`, e a descrição da seção passou a dizer "aportes e temas de época, como 13º e Imposto de Renda". `contas-do-ano` (IPVA, IPTU, matrícula e material escolar) e a calculadora "Cota única ou parcelado?" ficaram como estavam e aparecem no card "Neste mês" de outubro a fevereiro. Nada de data do ano seguinte sem fonte: o texto do Imposto de Renda diz "em 2026" e manda conferir a data oficial do ano; o do 13º cita os prazos da lei e manda conferir os do ano; sem faixa de INSS nem de Imposto de Renda; sem abono de férias no exemplo; sem produto financeiro nem crédito (nenhum dos quatro cita antecipação, empréstimo ou financiamento do 13º).

## 9. Registro de revisões

| Data | Temas | O que mudou | Como foi conferido |
|---|---|---|---|
| 08/10/2026 | 21 temas do Anexo A da especificação | Conteúdo escrito e checado, com os exemplos recalculados em frações exatas | Trechos indexados das fontes, sem abrir as páginas |
| 09/10/2026 | Catálogo inteiro (37 temas) | Primeira versão no app: 35 publicados e 2 rascunhos, `reviewedOn` 09/10/2026, os ajustes da seção 8 e os domínios da seção 3 | Busca na web, fato a fato, com o endereço e o trecho de cada fonte e a data 09/10/2026 (seção 4) |
| 09/10/2026 | `quitar-antes`, `estimativa` | `quitar-antes`: o corte da tarifa passou de "desde dezembro de 2007" para "a partir de 10 de dezembro de 2007", a data do trecho do STJ (fonte 4); `estimativa`: exemplo e hipóteses (seção 8) | Trecho da fonte 4 de `quitar-antes` e a conta do exemplo recalculada em `learn/math.ts` (`npm test`) |
| 09/10/2026 | `renda-comprometida`, `renda-variavel`, `aporte`, `essenciais`, `simulacao` | Cinco temas novos, todos publicados (`reviewedOn` 09/10/2026, revisão a cada 12 meses): o catálogo passa a 42 temas, 40 publicados; decisões D-026, D-027 e D-028 citadas e registradas em `docs/00`; atalho "Simular" em Aprender e ações "No Clarevo" nas telas dos ciclos | Busca na web, fato a fato (CVM: duas frases do `aporte`; Banco Central: Estudo Especial nº 80, Séries 6 e 8, glossário e Caderno; Susep; IBGE; Calculadora do Cidadão), com as ressalvas da seção 4 e da seção 6 |
| 10/10/2026 | `fatura`, `rotativo-cartao` | Os cartões entraram no app (D-037): o segundo parágrafo de `fatura` e o último de `rotativo-cartao` deixaram de dizer que não há cartões; as fontes do Clarevo ganharam D-037; `reviewedOn` 10/10/2026 (prazo de `rotativo-cartao`: 10/04/2027) | Texto do app conferido com D-037 e com os testes de `cards.test.ts`; nenhum fato externo novo, então as datas de consulta ficam em 09/10/2026 |
| 15/10/2026 | `decimo-terceiro`, `ferias`, `volta-as-aulas`, `imposto-de-renda` | Quatro temas de época novos, todos publicados (`reviewedOn` e `consultedOn` 15/10/2026; revisão a cada 12 meses, e `imposto-de-renda` a cada 6): o catálogo passa a 46 temas, 44 publicados; calendário `learn/epoca.ts` e card "Neste mês" em Aprender (D-053); passo novo na entrada "Aprender" do guia (D-049) | Busca na web, fato a fato, pelo Ministério do Trabalho e Emprego, Planalto, Câmara dos Deputados, INSS, Receita Federal, Procon de Mato Grosso e Prefeitura de Sinop; as páginas não abriram (DNS), então cada trecho é de resultado de busca e está dito no `locator`; ressalvas nas seções 4 e 6 |
| 20/10/2026 | `media-e-mediana` | Tema novo, publicado (`reviewedOn` e `consultedOn` 20/10/2026; revisão a cada 12 meses): o catálogo passa a 47 temas, 45 publicados; "Ver na Evolução" no tema e "O que é mediana?" na Evolução (D-062, Ciclo W); passo novo na entrada "Evolução" do guia (D-049) | Busca na web, fonte por fonte (IBGE Educa Jovens, A Mediana e A Média Aritmética); as páginas não abriram (DNS), então cada trecho é de resultado de busca e está dito no `locator`; ressalvas nas seções 4 e 6 |
| 19/10/2026 | Lista de feriados nacionais do aviso de dia útil (não é tema) | Nove feriados nacionais com a lei que define cada um e a data da consulta; entra no app como aviso de vencimento em sábado, domingo ou feriado nacional (D-060 item 3, Ciclo T); `reviewedOn` 19/10/2026, revisão a cada 12 meses | Busca na web, lei por lei (Planalto e Câmara dos Deputados); as páginas não abriram, então cada trecho é de resultado de busca e está dito no `locator`; ressalvas na seção 6 e na seção 11 |
| 19/10/2026 | Fontes da regra do próximo dia útil (não é tema) | Lei nº 7.089/1983 e notícia do STJ sobre o REsp 1.954.924; entram no "Saiba mais" do aviso (D-061, Ciclo T2); `consultedOn` 19/10/2026, mesmo prazo de revisão da lista de feriados; o ano de início do feriado de 2 de novembro passou a "a conferir" | Busca na web, fonte por fonte (Planalto, Câmara dos Deputados, Senado Federal, STJ, Conjur e Migalhas para a confirmação do julgamento); as páginas não abriram, então cada trecho é de resultado de busca e está dito no `locator`; ressalvas na seção 6 e na seção 11 |

## 10. Como revisar um tema

1. Abrir cada fonte do tema (ou, se o site não abrir, buscar um trecho da própria fonte) e conferir cada fato citado e cada número de norma.
2. No arquivo da seção (`packages/core/src/learn/topics/`), atualizar o texto, o trecho (`locator`), a data de consulta (`consultedOn`) e a data de revisão (`reviewedOn`).
3. Se um número do exemplo mudou, atualizar a conta em `learn/examples.ts` (sempre por uma função de `learn/math.ts`) ou o fato de norma do tema; `npm test` recusa qualquer "R$" ou "%" que não bata.
4. Fato que não se confirma: tirar ou reescrever a frase; se o tema não se sustenta, passar para `rascunho`, com o que falta em `pending`.
5. Rodar `npm test` e `npm run typecheck` e registrar a revisão na seção 9 (data, temas, o que mudou e como foi conferido), com as ressalvas novas nas seções 4 e 6.

## 11. Feriados nacionais do aviso de dia útil (Ciclo T, D-060)

Não é tema de Aprender: a lista vive em `packages/core/src/dia-util.ts` (`nationalHolidays`, `NATIONAL_HOLIDAY_SOURCES`), com o mesmo método das seções 3 e 10 e o teste `packages/core/test/dia-util.test.ts`, que confere a lista, as fontes, esta seção e o prazo de revisão. O aviso de "vence em dia que não é útil" (D-060 item 3) só considera feriados definidos em lei federal. Revisar até 19/10/2027 (12 meses); depois do prazo o teste reprova, de propósito, como nos temas. Desde D-061 (Ciclo T2), esta seção também guarda as fontes da regra do próximo dia útil (fontes 5 e 6, `DUE_RULE_SOURCES`), com o mesmo prazo.

| Data | Feriado (nome usual) | Lei | Desde |
|---|---|---|---|
| 1º de janeiro | Confraternização Universal | Lei nº 662/1949, com a redação da Lei nº 10.607/2002 | 1949 |
| 21 de abril | Tiradentes | Lei nº 662/1949, com a redação da Lei nº 10.607/2002 (antes, Lei nº 1.266/1950, art. 3, revogada pela Lei nº 10.607/2002, que manteve a data) | 1951 |
| 1º de maio | Dia do Trabalho | Lei nº 662/1949, com a redação da Lei nº 10.607/2002 | 1949 |
| 7 de setembro | Independência do Brasil | Lei nº 662/1949, com a redação da Lei nº 10.607/2002 | 1949 |
| 12 de outubro | Nossa Senhora Aparecida | Lei nº 6.802/1980 | 1980 |
| 2 de novembro | Finados | Lei nº 662/1949, com a redação da Lei nº 10.607/2002 | a conferir (nenhuma fonte consultada traz a cláusula de vigência da Lei 10.607, publicada em 20/12/2002; o código usa 2003, o primeiro 2 de novembro depois da publicação, e o aviso nunca olha datas tão antigas) |
| 15 de novembro | Proclamação da República | Lei nº 662/1949, com a redação da Lei nº 10.607/2002 | 1949 |
| 20 de novembro | Dia Nacional de Zumbi e da Consciência Negra | Lei nº 14.759/2023 | 2024 (a lei entrou em vigor em 22/12/2023; o primeiro feriado foi em 20/11/2024) |
| 25 de dezembro | Natal | Lei nº 662/1949, com a redação da Lei nº 10.607/2002 | 1949 |

Os nomes são os usuais e só aparecem no texto do aviso; as Leis 662 e 10.607 citam apenas as datas. Antes de 2003 só o 21 de abril foi conferido (desde 1951, pela Lei nº 1.266/1950); as outras datas desses anos não foram, e o app só avisa de vencimentos de hoje em diante.

**Não entram:** Carnaval, Sexta-feira Santa, Corpus Christi e os feriados estaduais e municipais. O texto de "Saiba mais" diz isso, diz que só contam os feriados nacionais de data fixa definidos em lei federal, que o dia de eleição cai sempre num domingo e já é coberto pelo fim de semana, e que quem cobra pode ter outro calendário. O aviso nunca diz que o pagamento no próximo dia útil vale para qualquer cobrança nem que não há encargos: termina com "Confira com quem cobra se o pagamento pode ser feito no próximo dia útil."

Fontes (todas oficiais; as três primeiras em `planalto.gov.br`; consulta em 19/10/2026):

1. Oficial. Presidência da República: Lei nº 662, de 6 de abril de 1949, com a redação da Lei nº 10.607, de 19 de dezembro de 2002. <https://www.planalto.gov.br/ccivil_03/leis/l0662.htm>. Trecho: art. 1º, "Redação dada pela Lei nº 10.607, de 19.12.2002": 1º de janeiro, 21 de abril, 1º de maio, 7 de setembro, 2 de novembro, 15 de novembro e 25 de dezembro; a Lei nº 10.607/2002 revogou a Lei nº 1.266, de 8 de dezembro de 1950, cujo art. 3º já declarava feriado nacional o 21 de abril (Tiradentes), por isso o 21 de abril vale desde 1951. Trecho de resultado de busca; a página não abriu. Consulta: 19/10/2026.
2. Oficial. Presidência da República: Lei nº 6.802, de 30 de junho de 1980. <https://www.planalto.gov.br/ccivil_03/LEIS/L6802.htm>. Trecho: art. 1º, declarado feriado nacional o dia 12 de outubro, para culto público e oficial a Nossa Senhora Aparecida, Padroeira do Brasil; vigência na data da publicação (Diário Oficial de 1º de julho de 1980). Trecho de resultado de busca; a página não abriu. Consulta: 19/10/2026.
3. Oficial. Presidência da República: Lei nº 14.759, de 21 de dezembro de 2023. <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm>. Trecho: art. 1º, declarado feriado nacional o dia 20 de novembro, Dia Nacional de Zumbi e da Consciência Negra; art. 2º, vigência na data da publicação (Diário Oficial de 22 de dezembro de 2023). Trecho de resultado de busca; a página não abriu. Consulta: 19/10/2026.
4. Oficial, só histórica (não está em `NATIONAL_HOLIDAY_SOURCES`; explica por que o 21 de abril vale desde 1951). Senado Federal: Lei nº 1.266, de 8 de dezembro de 1950. <https://legis.senado.leg.br/norma/542911>. Trecho: art. 3º, o 21 de abril declarado feriado nacional, em honra a Tiradentes; revogada pela Lei nº 10.607/2002. Trecho de resultado de busca; a página não abriu. Consulta: 19/10/2026.

Fontes da regra do próximo dia útil (D-061, `DUE_RULE_SOURCES`; consulta em 19/10/2026):

5. Oficial. Presidência da República: Lei nº 7.089, de 23 de março de 1983. <https://www.planalto.gov.br/ccivil_03/leis/l7089.htm>. Trecho: art. 1º, "Fica proibida a cobrança de juros de mora, por estabelecimentos bancários e instituições financeiras, sobre títulos de qualquer natureza, cujo vencimento se dê em sábado, domingo ou feriado, desde que seja quitado no primeiro dia subsequente."; o art. 2º foi vetado e a lei não menciona multa (o Senado Federal e a Câmara dos Deputados registram isso e a ausência de revogação expressa). Trecho de resultado de busca; a página não abriu. Consulta: 19/10/2026.
6. Oficial (é notícia do tribunal, não o acórdão). Superior Tribunal de Justiça: juros sobre dívida não paga no primeiro dia útil subsequente incidem a partir do vencimento original (REsp 1.954.924, Terceira Turma). <https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/25022022-Juros-sobre-divida-nao-paga-no-primeiro-dia-util-subsequente-incidem-a-partir-do-vencimento-original.aspx>. Trecho: se a dívida vence em dia não útil e o pagamento não é feito no primeiro dia útil subsequente, os juros de mora são contados a partir do vencimento original (fatura de cartão que venceu num sábado e foi paga depois); a proteção do art. 1º da Lei 7.089/1983 depende do pagamento no primeiro dia útil seguinte. Trecho de resultado de busca; a página não abriu. O mesmo julgamento aparece no Consultor Jurídico (25/12/2021) e no Migalhas, que serviram só para confirmar que ele existe. Consulta: 19/10/2026.

O que o app diz com elas (nunca "sem multa" nem "sem encargos" de forma absoluta): a Lei 7.089/1983 proíbe bancos e instituições financeiras de cobrar juros de mora sobre título que vence em sábado, domingo ou feriado, desde que seja quitado no primeiro dia subsequente (palavra do art. 1º), que o STJ lê como o primeiro dia útil seguinte; a multa e as regras de cada cobrança podem variar (confira com quem cobra); se o pagamento passar do primeiro dia útil, os juros podem contar desde a data original, que é o entendimento do STJ. Contas do ano ficam fora da tolerância e mandam conferir a data no carnê ou no site do órgão: nenhuma das duas fontes fala de tributo.

Conferido por busca (19/10/2026): o portal da Câmara dos Deputados mostra "Não consta revogação expressa" para as Leis 6.802/1980 e 14.759/2023, e o texto consolidado da Lei 662/1949 traz a redação de 2002 no art. 1º. Projetos de lei que acrescentariam feriados (Carnaval, Sexta-feira Santa e Corpus Christi, ou outra data para Tiradentes) apareceram nos resultados e não são lei.

Para revisar: abrir as três páginas (ou, se não abrirem, buscar o trecho da própria fonte), conferir se alguma lei nova criou, mudou ou tirou um feriado nacional, atualizar `NATIONAL_HOLIDAY_SOURCES`, as regras de `dia-util.ts`, a tabela acima e `NATIONAL_HOLIDAYS_REVIEWED_ON`, e registrar na seção 9.
