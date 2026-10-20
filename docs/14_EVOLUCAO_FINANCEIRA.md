# Evolução financeira: avaliação e decisões (EF v1.0.1)

16/10/2026. Avaliação só de leitura de `/home/user/clarevo`: nenhum arquivo alterado e nenhum teste executado.

> **Situação em 16/10/2026: as fases 1b e 2 estão feitas (D-057, Ciclos O e O2).** A fase 2 (tela D, "Entender o que mudou", com D06, D08 e D10; EF-16 e EF-17) trouxe o Recebido por categoria (`receivedCategoryBreakdown`) e a seção recolhida do painel (`explainChange`, `evolutionExplainPlan`, `evolutionExplanation`), sem migração e sem pacote novo; os detalhes e as decisões do Claude estão em `docs/00` (D-057, itens 16 a 25) e `docs/02`. Abaixo, a situação da fase 1b, como estava. **A fase 1b está feita (D-057, Ciclo O).** A tela `/evolucao` (telas A, B, C e E), a entrada em Movimentações e na busca de Aprender, o guia, o cenário `?cenario=evolucao` e o bloco "Evolução (D-057)" do roteiro web entraram sem migração e sem pacote novo; onde e como está em `docs/00` (D-057), `docs/01`, `docs/02` (regra de exibição), `docs/04` (Ciclo O) e `docs/10`. As seções abaixo são a avaliação de 16/10/2026, mantida como registro; onde dizem "nenhum está implementado", leia a situação de antes da fase 1b. O aviso de lacuna em mês fechado de Pago (a segunda metade de D04) entrou na revisão da fase 1b, no mesmo dia (`evolutionGapMonths` e `loadEvolutionGaps`, com `seriesGapsInRange`; `docs/00`, D-057, itens 11 e 12). Seguem adiadas a fase 3 (comprometimento e metas) e a 3b (competência). **Atualização de 19/10/2026 (Ciclo S, D-060 item 2): P-022 está resolvida.** O estado `zero_confirmado` existe em `evolutionPoints` (o mês conferido mostra "R$ 0,00, conferido" e entra na média e na mediana como zero, D04), e a conferência é gravada pela migração 0016 (`month_checks`, uma linha por contexto, mês e tipo com a versão crescente; `set_month_check`, `clear_month_check` e cinco colunas a mais em `months_overview`: `received_checked`, `paid_checked`, as duas versões e `card_purchase_count`); "pagamentos" é a base de Pago (caixa, pela data do pagamento), e compra no cartão não é registro de Pago, então o painel de um mês só com compras no cartão traz o aviso "Há compras no cartão em {mês}. Elas entram no Pago quando a fatura é paga." junto da conferência; regras em `docs/00` (D-060 item 2), `docs/02` (seção "Conferi este mês") e `docs/03`. Onde as seções abaixo dizem que P-022 está pendente, que "hoje só existe sem registros" ou que não há migração, leia a situação de antes do Ciclo S. **Atualização de 20/10/2026 (Ciclo W, D-062 item 3):** os números do §6 (média R$ 4.125,00 e mediana R$ 3.425,00; sem abril, R$ 3.390,00 e R$ 3.400,00) são o exemplo do tema de Aprender "Média e mediana" (`media-e-mediana`), e a tela ganhou "O que é mediana?", junto da média e da mediana, que abre o resumo do tema e leva à explicação completa; a conta da mediana (`medianCents`) passou de `evolucao.ts` para `learn/math.ts` e é a mesma nas duas telas. **Atualização de 20/10/2026 (Ciclo X, D-062 item 4): a fase 3 está feita** (sem migração, sem função nova no banco e sem pacote novo). O seletor da Evolução ganhou, depois de Recebido e Pago, **"Renda comprometida"** (o percentual da renda de referência ligado a contas do mês, o `committedPermille` de `summarizeCommitted`, lido com uma `listCommitments` por mês fechado, no máximo 12 por janela) e **"Guardado em metas"** (aportes menos resgates do mês, `savedInMonth`, que pode ser negativo), os dois só de meses já fechados: nada do mês atual nem de meses futuros, nunca previsão. Cada um escreve a própria base no subtítulo; mês sem renda de referência é "sem base" e mês sem registros fica fora das médias, nunca como zero (no Guardado em metas, o zero só é afirmado com ao menos uma meta ativa no mês); a média e a mediana valem para os dois (percentual em milésimos, metade para cima); a seleção de meses fora da comparação é de cada valor (T13) e "Entender o que mudou" segue só em Recebido e Pago ("Disponível para Recebido e Pago"). Regras e decisões em `docs/00` (D-062 item 4), `docs/02` (seção "Evolução") e `docs/04` (Ciclo X). Onde as seções abaixo dizem que a fase 3 está adiada, leia a situação de antes do Ciclo X.

## 1. O que já existe e pode ser reaproveitado

| Recurso | Onde | Uso na Evolução |
|---|---|---|
| Recebido e Pago por mês, com contagem | banco `months_overview` (`20261009000001_retorno.sql:413`); core `monthsOverview` (`retorno.ts:565`); `repository.ts:369`, `supabase-repository.ts:1854`, `memory-repository.ts:1332` | Fonte da série: todo mês do período, com contagem 0 quando vazio (`retorno.sql:410-412`), até 12 meses (`:425`), recusa sem leitura (`:429`), igual a `month_totals` (`47_retorno.sql:189`, `retorno.test.ts:921`) |
| "Seus últimos meses" | `app/retomar/index.tsx`, `retorno.ts` | Só os dados e o sinal de lacuna `seriesGapsInRange` (`retorno.ts:173`); a tela depende de ausência longa (D-030(2) e (3)) |
| `summarizeMonth` | `summary.ts:34` | Lançamentos do mês escolhido |
| Por categoria | `categoryBreakdown` (`summary.ts:148`), `useCategoryBreakdown` (`data.ts:1734`) | Categorias do ponto, com a fatura já dividida |
| Seu mês em 30 segundos | `compareWithPrevious` (`seu-mes.ts:264`, comparação só como fato), "Mês sem anotação não quer dizer mês sem gastos" (`seu-mes.ts:132`), `useSeuMes` (`data.ts:1335`) | Tom, textos e porta de entrada |
| Exportação (D-047) | `exportMonths` e `buildExportReport` (`export.ts:176`, `:396`) | Série acima de 12 meses sem migração; a análise não entra no arquivo (EF-27) |
| Renda comprometida | `summarizeCommitted` (`committed.ts:241`); banco `month_committed`, um mês por chamada | Fase 3 (**feita em 20/10/2026**, D-062 item 4) |
| Metas | `savedInMonth` (`goals.ts:257`), `movementsByMonth` (`goals.ts:1131`) | Fase 3 (**feita em 20/10/2026**, D-062 item 4) |
| Média exata | `averageCents` em bigint, metade para cima (`learn/math.ts:287`); `roundDivBig` (`:30`) | Média; a mediana não existe |
| Gráficos | `react-native-svg` 15.15.4; barras com "Ver tabela ano a ano" (`sim-year-bars.tsx:146-175`); `Meter` e `GroupBar` (`committed-parts.tsx:69`, `:107`) | Não há gráfico de linha: componente novo no mesmo padrão |
| Ocultar valores | `lib/privacy.ts` ("R$ ••••", "valor oculto") | Pontos, eixo e tabela |
| Preferências do aparelho | `lib/device-prefs.ts:13` | Não usar para meses ocultos (persistiria) |
| Isolamento | `session.tsx:101-106` e `:126-132` limpam o cache ao trocar de pessoa | Limpar também a seleção |

## 2. Contradições

| Tema | Regra atual | Especificação | Consequência |
|---|---|---|---|
| Cartão, competência e caixa | Pago é caixa: gasto pela data do pagamento, fatura paga uma vez, compra nunca (`docs/02:70`, `:97`, `:120`). D-054(1) fixou a regra A só no orçamento, cujo "Usado" mistura caixa e competência (`docs/12`, CL-01). `docs/02:111` e `:338` ainda dizem "em decisão" | §5 e §9 tratam CL-01 como pendente e falam em competência | Não há base pura de competência; v1 só em caixa |
| Sem registros e zero confirmado | Mês sem registro vem com 0 e contagem 0; registro vale no mínimo 1 centavo (`fundacao.sql:94`); "mês conferido" era P-022, pendente (`docs/00:91`; resolvida no Ciclo S, D-060 item 2). O Resumo mostra R$ 0,00 com "Nenhum gasto anotado em agosto." (`retorno.ts:551-558`) | Estado `zero_confirmado`; não desenhar 0 sem dados | Hoje só existe "sem registros" (contagem 0) [desde o Ciclo S, `zero_confirmado` existe] |
| Mês parcial | Não há estado guardado. O mês atual está em andamento; a revisão acha série sem conta registrada | Estado `parcial` | Derivar "em andamento" e o sinal "pode faltar algo", nunca parcial comprovado |
| Transferência | Não existe (`docs/02:587`, P-018). Na importação, "Parece transferência" vem desmarcada (`importar/revisao.ts:173`, `:187`); marcada, vira gasto | T18 | Atendida por ausência, sem garantia |
| Estorno | No cartão abate a fatura (`docs/02:75`) e chega ao Pago quando ela é paga; o texto de E1 entra com D-054. Fora do cartão não há estorno: a importação classifica "estorno" como recebimento "Reembolso" (`importar/categorias.ts:38`) | T16 | Estorno de débito aumenta Recebido em vez de reduzir Pago |
| "Despesas pagas" e "Pago" | O Resumo diz "Pago" (`(tabs)/index.tsx:132`): inclui fatura com encargos e parcelas de financiamento, exclui aportes | Nome novo | Mesma soma com outro nome; usar "Pago", com "pela data do pagamento" (EF-18) |

## 3. Entidades e APIs por métrica

| Métrica | Entidade | Banco | Core | Situação |
|---|---|---|---|---|
| Recebido | `financial_records` receita; status só `realizado` (`fundacao.sql:26`) | `months_overview`, `month_totals` | `monthsOverview`, `summarizeMonth` | Pronta |
| Pago | idem, despesa, inclusive `pay_commitment` e `pay_invoice` | idem | idem e `categoryBreakdown` | Pronta |
| Ainda a pagar | `commitments` | `month_to_pay`, estoque de hoje | `summarizeToPay` | Não é série histórica |
| Comprometimento | `commitments`, `income_references` | `month_committed` | `summarizeCommitted`, `projectCommitted` | Por vencimento, pago e previsto juntos |
| Metas | `goal_movements` | `goal_items.saved_cents` | `savedInMonth` | Aporte não é Pago |
| Consumo por categoria | registros e `card_entries` | `month_budget` | `categoryUsage` | Critério misto |
| Renda prevista | `income_references` | | | Nunca é Recebido (T17) |

`searchRecords` devolve lista vazia sem leitura (`repository.ts:258-264`); `months_overview` recusa, o que evita confundir falta de acesso com "sem registros" (regra 15, `docs/03:57`).

## 4. Arquitetura proposta

**Core, sem banco** (`packages/core/src/evolucao.ts`, testes próprios e `copy.test.ts`):
- `evolutionPoints(overview, métrica, mêsAtual)`: `com_registros`, `sem_registros` (contagem 0) ou `em_andamento`.
- `comparisonStats(pontos, ocultos)`: N elegíveis, n visíveis; soma em bigint; média por `averageCents`; mediana dos valores ordenados e, com n par, `roundDivBig(a + b, 2)`; n = 0 devolve nulo ("Selecione ao menos um período"); total canônico sempre sobre todos os pontos.
- `pointVariation(a, b)`: diferença absoluta; percentual só com base maior que zero; marca de meses não vizinhos.
- `explainChange` (fase 2): diferença por categoria entre dois `categoryBreakdown` e os maiores registros.

**Estado de apresentação:** meses ocultos por métrica, em memória, por pessoa e contexto (como `pendingAttempts`), limpos em `clearReceiptMemory` (`session.tsx:78`) e na troca de contexto.

**Agregação:** `months_overview` sem migração, com chave de consulta iniciada por `records`, invalidada a cada escrita (`data.ts:271`, `:327`), o que cobre T26. Acima de 12 meses, duas chamadas. Migração só se P-022 for aprovada (foi, no Ciclo S: migração 0016).

**Telas, na navegação de D-039** (quatro abas, `navigation.ts:14`; Resumo intacto, D-022):

| Tela | Proposta |
|---|---|
| A | `/evolucao`, consulta com barra e aba Movimentos marcada (`TAB_OF_TOPIC`, `navigation.ts:72`); entrada abaixo de "Seu mês em 30 segundos" (`movimentacoes.tsx:170`) e na busca de Aprender (`APP_SCREENS`, `navigation.ts:210`). Recebido ou Pago, 3, 6 ou 12 meses, linha SVG com toque de 44 px e "Ver valores mês a mês" |
| B | Painel do mês na mesma tela: valor, estado, variação com as duas datas, 3 maiores categorias, interruptor e "Ver lançamentos" (define o mês e abre `/composicao?tipo=pago`, como `setsMonth` do Seu mês) |
| C | "Comparação personalizada: 2 de 6 meses fora da comparação", "Restaurar todos" e lista dos ocultos |
| D | "Entender o que mudou" dentro do painel (fase 2, **feita em 16/10/2026**: botão recolhido abaixo da variação) |
| E | Carregando e erro sem dado parcial (`combineParts`, `data.ts:729`); sem registros; em andamento; um ponto; todos ocultos; valores ocultos; Família (`FamilyNotLinked`, `movimentacoes.tsx:163`) |

**Acesso:**
- Pessoal: permissão conferida no banco; o cliente não envia `user_id`.
- Família: o banco já serve, mas a tela da Família não existe (D-055); entra com o Ciclo L, e a seleção é de cada pessoa.
- Empresa: nunca. Quem administra recebe "sem permissão" em `months_overview` (`docs/03:77`); D-056 veda finanças, mesmo somadas.
- Demonstração: cenário fictício `?cenario=evolucao` com os números do §6, como D-030(10).

**Esforço e dependências:**

| Fase | Entrega | Esforço | Depende de |
|---|---|---|---|
| 1a | `evolucao.ts` e testes | P | nada |
| 1b | Telas A, B, C e E, demonstração, guia e roteiro web, e o aviso de lacuna em mês fechado de Pago (**feita em 16/10/2026**) | M | D01, D03, D04, D05, D09 |
| 2 | Categorias e "Entender o que mudou" (**feita em 16/10/2026**) | M | D06, D08, D10 |
| 3 | Comprometimento e metas (**feita em 20/10/2026**, Ciclo X) | M | D02 |
| 3b | Consumo por competência | G | D07, regra nova, talvez migração |

## 5. D01 a D10

| Nº | Recomendação | Fundamento |
|---|---|---|
| D01 | Tela nova "Evolução", aberta de Movimentos | "Seus últimos meses" só aparece depois de ausência longa e cobre 11 meses fechados (D-030); Resumo e abas ficam como aprovados |
| D02 | Só Recebido e Pago | Já reconciliados com o Resumo; comprometimento é por vencimento e inclui previsto |
| D03 | Só na sessão, em memória | Persistir exige tabela, função e teste (`CLAUDE.md`) e decisão de privacidade |
| D04 | Fora das médias por padrão: mês em andamento e meses sem registros, visíveis e rotulados; mês fechado com sinal de lacuna entra, com aviso | São os únicos casos verificáveis hoje |
| D05 | Marcador vazio e linha interrompida, com "fora da comparação" no eixo e na tabela | Pontilhado sugere continuidade (EF-13) |
| D06 | "De março para maio", com as duas datas e "abril fora da comparação"; nunca "mês a mês" entre meses não vizinhos | T14 |
| D07 | Caixa: sim (`month_totals` = `months_overview` = `summarizeMonth`, com testes). Competência: não há base | `docs/12`, CL-01 |
| D08 | Fase 2; na v1, as 3 maiores categorias e o link para Por categoria | Decompor variação é regra nova |
| D09 | Média e mediana lado a lado, com "n de N" | A mediana mostra o efeito do mês atípico sem esconder nada; duas colunas cabem a 320 px |
| D10 | Também em mês com sinal de lacuna, com aviso; nunca em mês sem registros | Mesmo critério de `seu-mes.ts:132` |

## 6. Casos de aceite

Nenhum está implementado. Atendíveis só construindo: T01, T03 a T10, T13, T17, T19 a T27; T02 espera só a forma visual (D05). Dependem de decisão: T11 (P-022), T12 (D04), T14 (D06), T15 (em caixa não duplica, `consolidacao.test.ts`; competência, D07), T16 (estorno fora do cartão), T18 (P-018) e T28 (D04, D06 e D07).

## Conferência do §6, em centavos

Valores: 320.000, 340.000, 330.000, 780.000, 345.000 e 360.000.
- Soma 2.475.000; média 2.475.000 ÷ 6 = 412.500, exata; mediana (340.000 + 345.000) ÷ 2 = 342.500. Conferem.
- Sem abril: soma 1.695.000; média ÷ 5 = 339.000, exata; mediana 340.000; n = 5. Conferem.
- Abril menos março: 450.000; descontado o reparo de 440.000, sobram 10.000 de outras variações. Confere.

No protótipo, "Entender o que mudou" compara com o mês anterior mesmo oculto, e os valores saem sem centavos.

## Resumo

O núcleo cabe sem migração: `months_overview` já entrega Recebido e Pago por mês, com contagem, permissão conferida no banco e igualdade testada com `month_totals`. Falta no core a mediana e o cálculo de n de N (a média exata já existe em `averageCents`) e, no app, um gráfico de linha com tabela equivalente. Recomenda-se uma tela "Evolução" aberta de Movimentos, só com Recebido e Pago pela data do pagamento, meses ocultos só na sessão e sem mexer no Resumo. As contradições principais: não há zero confirmado (P-022), mês parcial, transferência (P-018) nem base de competência; estorno fora do cartão vira recebimento. Os números do §6 conferem. Atendíveis sem decisão: T01, T03 a T10, T13, T17, T19 a T27.
