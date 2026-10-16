# Clarevo · Resposta ao Relatório Técnico de Revisão v0.9

15/10/2026. Avaliação item a item (CL-01 a CL-20 e casos T01 a T15) feita na versão atual do código, com sondas próprias no núcleo e num banco descartável (apagado depois). Verificações executadas nesta avaliação: `npm test` (1.352 testes), `npm run typecheck`, `npm run test:db` e `npm run test:api` (181 testes), todas aprovadas. Não foram feitos testes em aparelho nem no Supabase real. Em 15/10/2026, depois desta avaliação, os itens 1 a 8 do plano (seção 2, os que não dependem de decisão) foram implementados (D-050, sem migração); o que depende de Enzo (seção 3) segue sem alteração no app. A evidência de cada item está na seção 2.

Em 16/10/2026, Enzo respondeu à seção 3 ("sim, recomendações", D-054) e o Ciclo N implementou o que dependia só de texto, tela e regra de exibição, sem migração: CL-01 (estorno E1: a regra fica e a tela explica, sugerindo "Editar compra"), CL-10 (barra cheia com trecho listrado e "R$ X acima"; aviso de 80% dispensável no card), CL-05 (legenda "Recebido menos pago até DD/MM · não é saldo") e CL-06 (maior resto nos grupos). Onde esta resposta descreve o app "hoje" nesses itens (partes 1 e 2), vale o que está em `docs/02` e em D-054 de `docs/00`. O roteiro do teste de usabilidade de CL-13 está em `docs/15_TESTE_DE_USABILIDADE.md`.

## 1. Resultado em uma página

**Falhas confirmadas (corrigir):**
- **CL-01 / T06:** o estorno no cartão não reconcilia o orçamento por categoria (estorno total de uma compra em 3x ainda deixa R$ 200,00 no orçamento). Faturas, Pago, Ainda a pagar e renda comprometida ficam corretos.
- **CL-08 / T09:** em Gastos fixos, "R$ 4.200,00 por ano" é só o total das contas do ano (IPVA e IPTU), e "Por mês" inclui séries que ainda não começaram; uma assinatura com término multiplica por 12 mesmo terminando antes.
- **CL-11 / T13:** na demonstração, os formulários mostram "Salvando em Pessoal" sem o selo de demonstração.
- **CL-03 / CL-19:** se a conexão cai depois de gravar, a tela diz "Não foi possível salvar"; se a pessoa sai e anota de novo, pode duplicar.
- **CL-07:** a fatura paga em parte aparece como "Paga em 08/11" em Contas a pagar, enquanto a tela da fatura diz "Paga em parte"; não existe o rótulo "Vencida" para fatura.
- **CL-10:** a barra de 133,3% é igual à de 100% (só o texto muda).

**Já implementado e comprovado por testes:** T01 (Resumo 6.000 / 3.900 / 2.100), T02 (52,5%), T03 (orçamento 100%, 77,8%, 133,3%; 4.300 de 4.600), T05 (fatura parcial), T07 (mesma receita não duplica), T08 (reimportação marca "Já anotado"), T10 (reserva: faltam R$ 19.000; 15% = piso de 15,56%), T11 (renda zero recusada), T12 (outra pessoa não acessa nada: 56 funções em 66 tentativas recusadas, 25 tabelas e visões sem vazamento), T15 (meses sem atividade). CL-15 (calculadoras) e CL-17 (Aprender) já atendem.

**Pendências que não são de código:** exclusão de conta, política de privacidade e retenção (CL-04, CL-16) precisam de decisão e revisão jurídica antes de pessoas reais; teclado do celular, leitor de tela e notas reais do RJ precisam de teste em aparelho (CL-12, CL-14, CL-18); teste de usabilidade com pessoas (CL-13); integração contínua, monitoramento e plano de reversão (CL-20).

## 2. Plano proposto (por prioridade)

**P0, sem decisão (feito em 15/10/2026, D-050):**
1. **Feito.** CL-02: dicionário de indicadores em `docs/02` (fórmula, período, origem, exclusões de cada número: Recebido, Pago, Diferença, Ainda a pagar, Renda comprometida, Usado do orçamento, Faturas, Guardado em metas) e um teste automatizado que acompanha uma compra de R$ 300,00 em 3x por todos os indicadores, mês a mês (T04).
   - O que mudou: `docs/02` ganhou "Quando cada valor conta" (a tabela (a) a (f) e o exemplo de 10/10) e "Dicionário de indicadores" (22 linhas, com fórmula, o que decide o mês, origem no core e no banco, o que não entra e se é confirmado ou estimado); a linha 148 deixou de dizer que "Por mês" é R$ 3.530,00 (R$ 3.668,90 desde D-046).
   - Teste: `packages/core/test/consolidacao.test.ts` › "T04 e CL-02: compra de R$ 300,00 em 3x em 10/10/2026, indicador por indicador, mês a mês" (7 testes: "antes de pagar nada (10/10) ...", "pagando cada fatura no vencimento (10/11, 10/12 e 10/01) ...", "pagamento parcial de R$ 50,00 da fatura de dezembro ..." (com Ainda a pagar e o limite restante), "alterar um lançamento muda só os indicadores dele ...", "os mesmos números do banco (supabase/tests/95_consolidacao.sql, cenário 6) ...", "conta paga com atraso ...", "o mesmo caminho nos textos ..."); no banco, `supabase/tests/95_consolidacao.sql` (`month_totals`, `month_to_pay`, `month_committed`, `month_budget`, `invoice_items`, `card_items` e `goal_movements`), com os mesmos números.
   - Valores conferidos (core e banco, iguais): usado em Lazer R$ 100,00 / R$ 100,00 / R$ 100,00 / R$ 0,00; fatura R$ 0,00 / R$ 100,00 / R$ 100,00 / R$ 100,00; Ainda a pagar e renda comprometida (1,7%) R$ 0,00 / R$ 100,00 / R$ 100,00 / R$ 100,00; Pago pagando no vencimento R$ 0,00 / R$ 100,00 / R$ 100,00 / R$ 100,00 (10/11, 10/12 e 10/01); soma R$ 300,00 em todas as colunas; Recebido R$ 6.000,00 e Diferença só em outubro, sem mudar com a compra. Pagando R$ 50,00 da fatura de dezembro: Pago R$ 50,00, janeiro R$ 150,00 e renda comprometida R$ 100,00 / R$ 50,00 / R$ 150,00 (soma R$ 300,00).
2. **Feito.** CL-01 texto: a mesma frase na tela do orçamento, no guia e no manual, descrevendo a regra que existe hoje, com teste que compara os três textos.
   - Antes: tela "Compras no cartão contam no mês da compra (cada parcela no seu mês), mesmo antes de a fatura ser paga."; guia e manual "Compras no cartão contam no mês da compra, mesmo antes de a fatura ser paga."
   - Depois, nos três (`BUDGET_TEXT.rule`) e em `docs/02`: "No orçamento, cada compra no cartão conta a partir do mês da compra: a 1ª parcela no mês da compra, a 2ª no mês seguinte, e assim por diante, mesmo antes de a fatura ser paga. Em Pago, ela só entra quando a fatura é paga. Gastos e contas pagas contam no mês da data do pagamento." A regra não mudou (parcela k no mês da compra + (k - 1); estorno sem mudança; as decisões 1 e 2 da seção 3 seguem pendentes). O manual foi regenerado com `npm run manual` (só o passo do orçamento mudou).
   - Teste: `regressao-revisao.test.ts` › "CL-01: a regra do orçamento escrita uma vez só" (3 testes: a frase da tela é a do guia, a do manual e a de `docs/02`, palavra por palavra e sem as frases antigas; a frase diz a regra de hoje, conferida contra `categoryUsage` com a compra de R$ 300,00 em 3x; sem travessão nem expressão proibida); `budget.test.ts` › "textos montados › as frases do enunciado saem exatamente como escritas".

**P1, sem decisão (feito em 15/10/2026, D-050):**
3. **Feito.** CL-08: renomear para "Contas do ano: R$ 4.200,00 por ano", separar o que ainda não começou ("Começam depois: ...") e calcular o custo no ano só pelos meses em que a série vale.
   - Antes: "Por mês, se os valores não mudarem: R$ 3.668,90 (inclui R$ 180,00 estimados). Contas do ano ficam fora desta soma." e "Por ano, se os valores não mudarem: R$ 4.200,00 (inclui R$ 4.200,00 estimados)."; assinatura de R$ 39,90 que termina em dezembro de 2026, "R$ 478,80 por ano".
   - Depois: "Gastos fixos, parcelamentos e assinaturas: R$ 3.668,90 por mês, se os valores não mudarem (inclui R$ 180,00 estimados)." e, à parte, "Já começaram: R$ 2.500,00. Começam depois: R$ 1.168,90 (4 itens, o primeiro em novembro de 2026)."; "Contas do ano (IPVA, IPTU e outras): R$ 4.200,00 por ano, se os valores não mudarem (valor estimado)." e "Começam depois: R$ 4.200,00 (2 itens, o primeiro em janeiro de 2027)."; a assinatura que termina em dezembro de 2026 mostra "R$ 119,70 até dezembro de 2026" (3 meses), e o total do grupo diz "No por ano, as assinaturas com término contam só os meses até o último." A demonstração segue em R$ 138,90 por mês e R$ 1.666,80 por ano, e o atalho "Dividir estas contas" recebe os mesmos R$ 3.668,90.
   - Teste: `regressao-revisao.test.ts` › "CL-08: Gastos fixos, parcelamentos, assinaturas e contas do ano" (6 testes, entre eles "demonstração: a frase de cada soma diz o conjunto ...", "a parte que ainda não começou ...", "assinatura que termina antes de 12 meses: só os meses em que vale ...", "assinatura que ainda não começou conta 12 meses a partir do primeiro mês dela ...", "o total do grupo soma o por ano de cada uma ..." e "parcelamento curto entra uma vez no por mês e nunca é multiplicado ..."); `subscriptions.test.ts` › "por mês é o valor vigente e, sem término, por ano é por mês × 12" e "totais: soma dos valores vigentes das ativas ..."; roteiro web, "gastos fixos: soma por mês com a parte estimada, dizendo o conjunto, e o que ainda não começou à parte (CL-08)" e "contas do ano: ...".
4. **Feito.** CL-11: selo "Demonstração" também nos formulários e em Metas.
   - Antes: formulários e detalhes da demonstração mostravam "Salvando em Pessoal" e nenhuma palavra de demonstração; Metas não mostrava o contexto.
   - Depois: pílula "Demonstração · Pessoal" (lima, como o selo das abas) em todo formulário e detalhe que tem contexto fixo (a mesma `ContextPill`, que também vale para "Importando em Pessoal"); a linha final de Anotar gasto e de Novo gasto fixo acrescenta "Fica só nesta demonstração, com dados fictícios."; Metas mostra o contexto ao lado do título ("Demonstração · Pessoal" na demonstração, "Pessoal" numa conta real); numa conta real nada disso aparece; `demoWithData` passou a exigir também o modo de demonstração.
   - Teste: `regressao-revisao.test.ts` › "CL-11: demonstração visível nos formulários e em Metas" (3 testes: o texto da pílula na demonstração e fora dela; nenhuma tela escreve "Salvando em" fora de `ContextPill`; a linha final e o contexto de Metas); roteiro web, bloco 12b, "CL-11 demonstração: o formulário de gasto mostra ..." e, em 390 e 320 px, `headerChecks` com a pílula "Demonstração · Pessoal" e "CL-11 Metas: o cabeçalho mostra o contexto ...".
5. **Feito.** CL-03 / CL-19: texto de resultado incerto ("Não deu para confirmar se salvou. Confira em Movimentos antes de anotar de novo.") e guardar a tentativa pendente para não duplicar ao voltar.
   - Antes: "Não foi possível salvar. Seu preenchimento foi mantido. Tente novamente." também quando a gravação tinha acontecido; sair do formulário e anotar de novo gerava uma chave nova e duplicava.
   - Depois: o texto novo em todo caminho de rede incerta (Movimentos para gasto, recebimento, conta a pagar, pagamento, gasto fixo, conta do ano e fatura; Metas, Cartões, Conta, Orçamento por categoria e Renda comprometida citam o próprio lugar); "Não foi possível salvar" fica só para a recusa do servidor. A tentativa pendente (chave e conteúdo) fica na memória do app (`PendingAttemptStore`), por pessoa e por formulário, nunca no aparelho; o mesmo conteúdo ao reabrir confere e conclui, outro conteúdo é outro registro e o anterior não é sobrescrito; some ao sair da conta. A importação já era segura (resumo SHA-256 por linha).
   - Teste: `regressao-revisao.test.ts` › "CL-03 e CL-19: resultado incerto" (7 testes: o texto; "resposta perdida depois de gravar, sair do formulário e anotar de novo o mesmo gasto: um registro só (antes: dois)"; "outro conteúdo depois de sair do formulário é outro gasto ..."; isolamento por pessoa e por formulário; meta e conta a pagar com resposta perdida; o caminho sem queda); roteiro web, bloco 12b, "CL-03 resultado incerto ..." e "CL-03 e CL-19 sair do formulário e anotar de novo o mesmo gasto: a tela conclui e continua um registro só"; "H2 editar só a marca com falha ...".
6. **Feito.** CL-07: "Paga em parte" e "Vencida" iguais em todas as telas.
   - Antes: a conta da fatura paga em parte aparecia em Contas a pagar como "Paga em 08/11/2026" (tela da fatura: "Paga em parte"); a fatura fechada e não paga depois do vencimento aparecia como "Fechada" (só em Contas a pagar era "Vencida").
   - Depois: "Paga em parte em 08/11/2026 · R$ 230,00 foram para a fatura de dezembro" na linha e no detalhe da conta; "Vencida" (calculada na leitura, sem gravar; no dia do vencimento ainda é "Fechada") na tela da fatura, na lista de cartões ("Fatura vencida de novembro: R$ 530,00. Venceu em 10/11") e no nome acessível. Nenhum número mudou: Pago de novembro R$ 300,00; dezembro com saldo anterior de R$ 230,00 e total de R$ 580,00; renda comprometida R$ 300,00 em novembro e R$ 580,00 em dezembro (soma R$ 880,00 = 530 + 350).
   - Teste: `regressao-revisao.test.ts` › "CL-07: situação da fatura nas telas do cartão e em Contas a pagar" (4 testes: "fatura fechada e não paga depois do vencimento é Vencida ..."; "conta da fatura paga em parte: Paga em parte em Contas a pagar, igual à tela da fatura"; "fatura paga por inteiro continua Paga em 08/11/2026 ..."; as palavras iguais nas telas); `cards.test.ts` (pagamento parcial, sem mudança).
7. **Feito.** CL-09: dizer no card da reserva "sem contar rendimentos", o mês do primeiro aporte considerado, o arredondamento para baixo e o que fica fora da base de gastos.
   - Antes: "Planejado: R$ 500,00 por mês" (card); "Planejado: R$ 500,00 por mês · chega lá em dezembro de 2029" (meta); "Você planejou guardar R$ 500,00 por mês. Nesse ritmo, chega lá em dezembro de 2029." (detalhe); "Média de setembro de 2026 em Moradia e Mercado. Lazer e gastos sem categoria não entram." (base).
   - Depois: "Planejado: R$ 500,00 por mês, sem contar rendimentos"; "Planejado: R$ 500,00 por mês · chega lá em dezembro de 2029, sem contar rendimentos"; "Você planejou guardar R$ 500,00 por mês. Contando a partir de novembro de 2026, sem rendimentos, chega lá em dezembro de 2029."; "Média do que foi pago em setembro de 2026 em Moradia e Mercado (1 mês com gastos anotados). Contas ainda não pagas, Lazer e gastos sem categoria não entram."; e, no card e no detalhe da reserva, "O percentual e os meses cobertos são arredondados para baixo." Os números de T10 não mudaram (R$ 3.500,00 de R$ 22.500,00, 15%, 0,9 mês, faltam R$ 19.000,00, dezembro de 2029).
   - Teste: `regressao-revisao.test.ts` › "CL-09: explicações da reserva para imprevistos" (3 testes: textos da demonstração; "o mês de partida acompanha o aporte do mês ..."; a nota nas telas); `goals.test.ts` › "demonstração: média de setembro, R$ 3.750,00", "sequência de aceite C ... reserva, aporte, resgates e valorização ...", "demonstração do Ciclo C › reserva 15% e 0,9 mês ...".
8. **Feito.** CL-20: testes de regressão para cada falha acima; documento de reversão (como voltar a `main` a uma versão anterior).
   - O que mudou: um teste de regressão por falha corrigida (CL-01, CL-03 e CL-19, CL-07, CL-08, CL-09 e CL-11, nos blocos acima, com o antes e o depois de cada texto ou valor), `supabase/tests/95_consolidacao.sql` para a matriz no banco e o bloco 12b do roteiro web; `docs/07_PUBLICACAO_WEB.md` ganhou "Como voltar atrás" (identificar a versão no ar por commit e migração, voltar a implantação na Cloudflare, voltar a `main` com `git revert` sem reescrever o histórico, migrações só aditivas e o que fazer se uma falhar no meio); `docs/04` ganhou a tabela de rastreabilidade do que mudou.
   - Ainda abertos em CL-20 (fora destes itens): integração contínua e monitoramento (decisão 9).

**Revisão das correções (commit `0bd8fcd`), quatro achados corrigidos em 15/10/2026 (D-050, ainda sem migração, sem função nova no banco e sem pacote novo).** Uma revisão independente das correções acima apontou um defeito novo e três ajustes. Os totais de outubro da demonstração seguem em 6.000 / 3.900 / 2.100 / 650 e 52,5%.

1. **Achado 1, médio-alto (regressão de CL-03 e CL-19): outro conteúdo numa visita nova reenviava a chave antiga.**
   - Antes: os formulários de gasto, de conta a pagar e de pagamento cuidam das próprias chaves (não passam por `guardedWrite`), e a troca de chave estava dentro do "tem tentativa relevante". Depois de um resultado incerto, na visita seguinte com conteúdo diferente a tentativa da visita anterior não era relevante, a troca não rodava e o envio levava a chave antiga com outro conteúdo: o banco recusava com `chave_reutilizada` e o gasto novo não era gravado.
   - Depois: a escolha da chave é uma função só, `keyForSend`, chamada pelos três formulários e por `slotKeys` (os demais): a mesma chave para o mesmo conteúdo e uma chave nova para outro, também quando a última tentativa é de uma visita anterior. `recordUncertain` e `refuseKey` completam o caminho, e os três formulários usam as mesmas funções, na mesma ordem.
   - Teste: `regressao-revisao.test.ts` › "CL-03 e CL-19, segunda rodada" › "achado 1: outro conteúdo numa visita nova envia com chave nova, nos formulários de caminho próprio (antes: chave_reutilizada)" (percorre o gasto e a conta a pagar com a sequência de chamadas dos formulários, e mostra o `chave_reutilizada` de antes), "achado 1, pagamento ...", "keyForSend ..." e "os formulários chamam as mesmas funções, na mesma ordem" (confere o código-fonte dos três formulários); roteiro web, bloco 12b: "outro conteúdo depois de um resultado incerto (gasto)" e "(conta a pagar)", nas telas de verdade.
2. **Achado 2, médio: a entrada idêntica legítima era descartada em silêncio.**
   - Antes: uma tentativa de visita anterior, achada gravada, concluía sozinha ("Gasto salvo") e abria o registro antigo, mesmo que a pessoa quisesse anotar outro igual (dois cafés de R$ 8,00 no mesmo dia); se o registro tinha sido excluído, "salvo" apontava para nada; a tentativa nunca vencia.
   - Depois: em todos os formulários que guardam a tentativa fora da tela (gasto e recebimento, compra no cartão, conta a pagar, pagamento, gasto fixo, parcelamento e conta do ano, meta, reserva, aporte, resgate e rendimento, cartão, conta de origem, pagamento de fatura e lançamento da fatura), a tela pergunta, sem enviar nada: "Este gasto já tinha sido salvo. Anotar outro igual?", com "Anotar outro igual" (esquece a tentativa e envia com chave nova) e "Ver o gasto salvo" (resolve a tentativa e abre o que foi salvo). Cada formulário tem o seu texto (`SAVED_BEFORE_TEXT`); onde um segundo igual não é possível (pagamento de uma conta, reserva para imprevistos), só há "Ver ...". A tentativa de visita anterior vale 30 minutos (`CARRIED_ATTEMPT_MAX_AGE_MS`). O que foi excluído depois nunca conta como salvo: a tentativa é esquecida e o envio segue com chave nova (`slotKeys` ganhou a conferência "ainda existe" para gasto, conta a pagar, gasto fixo, meta, movimento, cartão, lançamento, pagamento de fatura e conta de origem). Na mesma visita nada mudou: salvar de novo depois de "Não deu para confirmar" conclui.
   - Teste: `regressao-revisao.test.ts` › "CL-03 e CL-19, segunda rodada" (11 testes): "achado 2: tentativa de visita anterior achada gravada não conclui sozinha ..." (gasto, pelo caminho próprio), "... nos outros formulários (guardedWrite) ...", "a tentativa da MESMA visita continua concluindo sozinha ...", "o que foi excluído depois nunca conta como salvo ...", "a tentativa de visita anterior vale 30 minutos ..." (29, 30 e 31 minutos), "todo formulário que guarda a tentativa fora da tela mostra "já tinha sido salvo"" (confere o código-fonte dos 11 formulários) e os textos; `copy.test.ts` › "textos de "já tinha sido salvo""; os testes antigos de meta e de conta a pagar passaram a esperar `saved_before`; roteiro web, bloco 12b: o gasto (pergunta, aviso anunciado, 390 e 320 px, "Ver o gasto salvo", "Anotar outro igual", gasto excluído em outro aparelho), a conta a pagar, o pagamento desfeito e refeito e a meta (pelo `guardedWrite`).
3. **Achado 3, baixo: o por ano da assinatura multiplicava o valor de hoje pelos meses.**
   - Antes: `subscriptionRow` fazia valor de hoje × meses da janela; um aumento agendado e um mês excluído da série não entravam na conta (R$ 39,90 até novembro e R$ 44,90 de dezembro em diante, hoje em outubro: R$ 478,80 por ano).
   - Depois: o por ano é a soma do valor vigente de cada mês da janela (`subscriptionYearAmount`, com `termFor`), sem os meses excluídos: 2 × R$ 39,90 + 10 × R$ 44,90 = R$ 528,80; com novembro excluído, 11 × R$ 39,90 = R$ 438,90. A demonstração segue em R$ 138,90 por mês e R$ 1.666,80 por ano.
   - Teste: `regressao-revisao.test.ts` › "CL-08: ..." › "por ano soma o valor vigente de cada mês: aumento agendado entra a partir do mês dele e mês excluído não entra ...".
4. **Achado 4, baixo: a matriz do banco não tinha dois cenários do core, nem o limite restante.**
   - Antes: `95_consolidacao.sql` não cobria "alterar um lançamento" nem "conta paga com atraso", não conferia Ainda a pagar nem o limite restante no pagamento parcial, e o cabeçalho citava `goal_items` onde o código lê `goal_movements`.
   - Depois: o banco ganhou os cenários 6 ("alterar um lançamento": aporte, encargo de R$ 12,00 e edição da compra para R$ 330,00, com a linha de texto de cada mês igual à do core) e 7 ("conta paga com atraso"), Ainda a pagar 0 / 0 / 0 / R$ 150,00 e limite usado de R$ 150,00 (R$ 4.850,00 restantes) no pagamento parcial, e o cabeçalho foi corrigido. `consolidacao.test.ts` ganhou as mesmas linhas de texto, para os dois lados provarem os mesmos números.
   - Teste: `supabase/tests/95_consolidacao.sql` (cenários 5, 6 e 7) e `consolidacao.test.ts` › "os mesmos números do banco ..." e o pagamento parcial com o limite.

**Verificações executadas depois das correções (15/10/2026):** `npm run typecheck` (core e app), `npm test` (54 arquivos, 1.385 testes, todos aprovados; antes eram 52 e 1.352), `npm run test:db` (15 arquivos, com o novo `95_consolidacao.sql`), `npm run test:api` (181 testes) e `npm run test:web` (4.117 verificações OK, com o bloco 12b novo). Depois da revisão das correções (os quatro achados acima) e da integração com o Ciclo I2 (D-051): `npm run typecheck`, `npm test` (56 arquivos, 1.480 testes), `npm run test:db` (15 arquivos, com os cenários 6 e 7 do `95_consolidacao.sql`), `npm run test:api` (181 testes; a expectativa do por ano do Streaming com aumento agendado passou de R$ 478,80 para R$ 533,80) e `npm run test:web` (4.279 verificações OK). Não foram feitos testes em aparelho nem no Supabase real.

**Dependem de decisão de Enzo (seção 3).**

## 3. Decisões de Enzo

1. **CL-01, parcela no orçamento:** A (atual, recomendada) parcela k no mês da compra + (k - 1); B compra inteira no mês da compra; C parcela no mês da fatura. Consequências na Parte 1.
2. **CL-01 / T06, estorno no orçamento:** E1 (manter a regra e explicar na tela, recomendando "Editar compra" quando nenhuma fatura foi paga; esforço pequeno) ou E2 (estorno ligado à compra de origem, reconcilia exato; esforço grande, muda o banco).
3. **CL-10, acima de 100%:** como mostrar o excedente na barra (ex.: barra cheia com um trecho listrado e o texto "R$ 100,00 acima") e se o aviso de 80% pode ser dispensado no card.
4. **CL-05:** se o topo do Resumo ganha a frase "Diferença não é saldo da conta" (muda a estrutura aprovada, D-022).
5. **CL-06:** percentuais dos grupos somarem exatamente o total (maior resto) ou só uma nota.
6. **CL-11 / T13, Família:** o que mostrar enquanto não há convites (três alternativas na Parte 2).
7. **CL-04 / CL-16, privacidade:** exclusão de conta pelo app, prazo de retenção e textos de "Quem vê estes dados?" sobre suporte técnico e empresa (com revisão jurídica).
8. **CL-13:** fazer teste de usabilidade com 5 pessoas e 5 tarefas.
9. **CL-20:** qual monitoramento de falhas usar (sem dados financeiros).

As Partes 1 e 2, abaixo, trazem para cada item: status, o que o app faz hoje, causa, proposta, riscos, teste de aceite e os testes que já existem ou faltam.

---

# Clarevo · Revisão v0.9 · Parte 1 (CL-01 a CL-10 e testes T01 a T06, T09 a T11)

Avaliação técnica de 15/10/2026, só leitura, sobre o código em `HEAD` (7b1a3d5). Nenhum arquivo do repositório foi alterado.

## O que foi executado de verdade

- `npm test`: 52 arquivos, 1.352 testes, todos passaram.
- `npm run typecheck`: passou (core e app).
- `npm run test:db`: os 14 arquivos SQL de `supabase/tests` passaram, em banco descartável.
- Sondas próprias, fora do repositório: `probes_p1/probe.test.ts` e `probes_p1/probe2.test.ts` (vitest sobre `packages/core`, com o repositório em memória) e `probes_p1/probe_db.sql` (banco descartável `clarevo_probe_p1_*`, criado com o `00_auth_shim.sql` e todas as migrações, e apagado logo depois). Caminho completo: `/tmp/claude-0/-home-user/1580a5fb-b479-5b5b-aff6-916ff9dc81be/scratchpad/revisao_v09/probes_p1/`.
- Não executados: `npm run test:web` (roteiro web, por instrução) e `npm run test:api`. Quando cito um teste do roteiro web, li o código, mas não o rodei.
- Telas conferidas em `docs/telas`: `06_resumo_demo.png`, `16_metas.png`, `101_renda_comprometida_outubro.png`, `116_detalhe_reserva.png`, `119_plano_de_guardar.png`, `137_fatura_paga_em_parte.png`, `144_renda_comprometida_faturas.png`, `200_orcamento.png` e `270_gastos_fixos_assinaturas.png`.

Demonstração usada nos números: `packages/core/src/demo.ts`, hoje = 07/10/2026, dados fictícios.

---

## CL-01 · Competência, desembolso e fatura

**1. Status:** necessita decisão de negócio. A regra está implementada e testada no core e no banco, mas o texto da tela é ambíguo, o manual diz outra coisa e o estorno não reconcilia o orçamento (falha confirmada no critério 3).

**2. O que o app faz hoje**

| Regra pedida | Como está | Onde |
|---|---|---|
| (a) Registro do consumo | Gasto comum entra com a data do pagamento. Compra no cartão é lançamento do cartão, com a data da compra, e nunca entra em Pago na data da compra | D-011, D-021(1), D-037(4); `records.ts`, `cards.ts` |
| (b) Orçamento por categoria ("Usado") | Gastos com a categoria e data no mês (menos o pagamento de fatura) + a parcela k de cada compra no cartão no mês da compra + (k - 1) meses - estornos com categoria no mês da fatura em que foram informados, nunca abaixo de zero por categoria e mês | D-041(2); `budget.ts` (`categoryUsage`); banco `month_budget` |
| (c) Parcelas | Total ÷ n em centavos, o resto de centavos na 1ª | `cards.ts` (`installmentAmounts`) |
| (d) Formação da fatura | A 1ª parcela cai na fatura cujo fechamento é igual ou posterior à data da compra (comprar no dia do fechamento ainda entra nela); as outras nas faturas seguintes. Total = parcelas + encargos + saldo anterior - estornos - crédito levado | D-037(2), (3) e (7) |
| (e) Pagamento da fatura | Só depois do fechamento. Cria um único gasto na data do pagamento, dividido em "Por categoria" pela composição da fatura. Parcial: a diferença vira "Saldo anterior" na fatura seguinte, sem juros | D-037(4), (5), (6) e (8) |
| (f) Pago no Resumo | Gastos com data de pagamento no mês, inclusive o pagamento da fatura; nunca a compra | `summary.ts` (`summarizeMonth`) |

**Exemplo reproduzido (sonda):** compra de R$ 300,00 em 3 vezes em 10/10/2026, Lazer, no cartão que fecha dia 3 e vence dia 10 (o mesmo dos dados de demonstração).

| Mês | Orçamento: usado em Lazer | Fatura (vence dia 10) | Ainda a pagar e renda comprometida (grupo Faturas) | Pago, pagando no vencimento |
|---|---:|---:|---:|---:|
| outubro de 2026 | R$ 100,00 (parcela 1) | nenhuma | R$ 0,00 | R$ 0,00 |
| novembro de 2026 | R$ 100,00 (parcela 2) | R$ 100,00 (parcela 1) | R$ 100,00 | R$ 100,00 em 10/11 |
| dezembro de 2026 | R$ 100,00 (parcela 3) | R$ 100,00 (parcela 2) | R$ 100,00 | R$ 100,00 em 10/12 |
| janeiro de 2027 | R$ 0,00 | R$ 100,00 (parcela 3) | R$ 100,00 | R$ 100,00 em 10/01 |
| Soma | R$ 300,00 | R$ 300,00 | R$ 300,00 | R$ 300,00 |

Pagando só R$ 50,00 da fatura de dezembro: Pago de dezembro R$ 50,00; fatura de dezembro "Paga em parte"; R$ 50,00 viram "Saldo anterior" e a fatura de janeiro passa a R$ 150,00; renda comprometida de dezembro R$ 50,00 (o valor pago) e de janeiro R$ 150,00; "Por categoria" do Pago de dezembro: Lazer R$ 50,00; o orçamento não muda. As somas continuam R$ 300,00 em todas as colunas. Critérios (1) e (2) do relatório: atendidos, sem dupla contagem.

**Estorno (critério 3): falha confirmada no orçamento.**
- Estorno total de R$ 300,00 informado na fatura de novembro: as faturas zeram (crédito de R$ 200,00 levado para dezembro e de R$ 100,00 para janeiro), Ainda a pagar e renda comprometida zeram. O orçamento de Lazer fica outubro R$ 100,00, novembro R$ 0,00 (100 - 300, limitado a zero) e dezembro R$ 100,00: soma R$ 200,00 para um consumo líquido de R$ 0,00. Conferido no core e no banco (`month_budget`, sonda SQL).
- Estorno parcial de R$ 150,00 informado na fatura de janeiro: o orçamento continua somando R$ 300,00, porque janeiro não tem parcela no orçamento e o desconto para em zero. Consumo líquido: R$ 150,00.
- O mesmo estorno informado na fatura de dezembro: soma R$ 200,00 (outubro 100, novembro 100, dezembro 0).

**"Usado" mistura dois critérios.** Sonda: conta vencida em 25/09 e paga em 02/10 conta no orçamento de outubro (data do pagamento), na renda comprometida de setembro (vencimento) e no Pago de outubro. Ou seja, "Usado" é caixa para gastos e contas pagas e competência só para compras no cartão; a D-041 chama o conjunto de "por competência".

**Textos hoje, não iguais entre si:**
- Tela `/orcamento` (`BUDGET_TEXT.cardRule`): "Compras no cartão contam no mês da compra (cada parcela no seu mês), mesmo antes de a fatura ser paga." O "seu mês" pode ser lido como o mês da fatura.
- Manual (`docs/manual/index.html`) e guia (`packages/core/src/guide/catalog.ts`, em edição por outra frente): "Compras no cartão contam no mês da compra, mesmo antes de a fatura ser paga.", sem a parte das parcelas, o que sugere a compra inteira no mês da compra.

**3. Causa.** (1) A resposta de Enzo em D-041 ("No mês da compra") não fala de parcelas; espalhar cada parcela por um mês foi detalhe proposto pelo Claude. (2) O estorno não tem data própria nem vínculo com a compra (D-037(7)), então desconta no mês da fatura em que foi informado, e o piso zero por categoria descarta o excedente. (3) O texto não diz que gastos e contas contam pela data do pagamento.

**4. Proposta**
1. Texto, sem mudar regra (`BUDGET_TEXT.cardRule`, manual e guia com a mesma frase): "No orçamento, cada compra no cartão conta a partir do mês da compra: a 1ª parcela no mês da compra, a 2ª no mês seguinte, e assim por diante, mesmo antes de a fatura ser paga. Em Pago, ela só entra quando a fatura é paga." e "Gastos e contas pagas contam no mês da data do pagamento."
2. Documentar em `docs/02` uma seção "Quando cada valor conta", com a tabela (a) a (f) e o exemplo de 10/10 acima.
3. **Decisão de Enzo: regra da parcela no orçamento.** Renda comprometida, faturas, Ainda a pagar e Pago não mudam em nenhuma alternativa.
   - A (atual, recomendada): parcela k no mês da compra + (k - 1). Demonstração em outubro: Lazer R$ 400,00 (133,3%), Usado R$ 4.300,00; novembro e dezembro, Lazer R$ 200,00.
   - B: compra inteira no mês da compra. Outubro: Lazer R$ 800,00 (266,7%), Educação R$ 1.500,00 (sem orçamento), Usado R$ 4.700,00; novembro e dezembro, Lazer R$ 0,00. É a leitura literal do manual.
   - C: parcela no mês da fatura. Outubro: Lazer R$ 0,00, Usado R$ 3.900,00; novembro Lazer R$ 400,00 (133,3%); dezembro e janeiro R$ 200,00. Contradiz a resposta de Enzo em D-041.
4. **Decisão de Enzo: estorno no orçamento.** Faturas, Pago, Ainda a pagar e renda comprometida não mudam; muda só o Usado e os avisos de 80% e 100%.
   - E1 (sem mudança de regra): manter e dizer na tela "Registrar estorno": "O estorno desconta no orçamento do mês da fatura em que você o informa, até zerar a categoria nesse mês. Se nenhuma fatura da compra foi paga, prefira corrigir o valor em Editar compra." Editar a compra já ajusta todas as parcelas, faturas e o orçamento.
   - E2: o estorno escolhe a compra de origem e desconta nas parcelas dela, nos meses delas. Reconcilia exatamente (exemplo: R$ 0,00 depois do estorno total), mas precisa de coluna nova em `card_entries`, mudanças em `add_card_refund`, `update_card_entry`, `month_budget`, telas e testes. Esforço G.
   - Uma regra sem vínculo (levar o excedente para meses vizinhos) não reconcilia em geral, porque não se sabe de qual compra é o estorno.

**5. Riscos e dependências.** `month_budget` repete a regra no banco e `80_orcamento.sql` compara banco e core mês a mês; o aviso de 80% e 100% (`budgetCrossing`) muda junto; CL-02, CL-07 e T06 dependem da decisão; o tutorial em edição repete o texto.

**6. Teste de aceite.** Com o cartão que fecha dia 3 e vence dia 10, compra de R$ 300,00 em 3x em 10/10: a tabela acima, mês a mês, em `/orcamento`, na fatura, em Contas a pagar, na renda comprometida e no Resumo, com somas iguais a R$ 300,00; depois do estorno, o resultado da alternativa escolhida; os três textos iguais.
- Já cobrem: `budget.test.ts` › "compra parcelada: cada parcela conta no mês da compra mais (k - 1), com o resto de centavos na primeira", "a parcela 1 conta no mês da data da compra, não no mês da fatura (...)", "o pagamento de uma fatura não conta: é só a quitação de compras que já foram contadas", "estorno com categoria desconta no mês da fatura em que foi informado, nunca abaixo de zero por categoria" (fixa o comportamento atual), "o usado vem dos gastos e das compras no cartão do contexto, mês a mês, sem mexer nos totais do mês"; `cards.test.ts` › "pagar a fatura › pagamento parcial: 300,00 de 530,00 → saldo anterior de 230,00 em dezembro, sem juros"; `80_orcamento.sql` ("pagar a fatura não muda o usado de outubro").
- Faltam: um teste integrado (core e banco) da compra de 10/10 em 3x conferindo todas as colunas por mês e no total; o teste de reconciliação do estorno conforme a decisão; um teste de texto que compare a frase da tela, do manual e do guia.

---

## CL-02 · Modelo único para as consolidações

**1. Status:** parcial.

**2. O que o app faz hoje.** Cada indicador tem regra escrita e testada: `docs/02` (tabela "Implementado e testado", com a coluna "Onde é testado") e as decisões D-011, D-021, D-026, D-027, D-037, D-041, D-042 e D-043. As telas explicam o critério de cada total (por exemplo, `composicao.tsx`: "Recebimentos menos pagamentos confirmados no período. Não é o saldo da conta nem dinheiro disponível (...). Contas a pagar não entram."). As separações pedidas:
- Gasto registrado: Pago. Compromisso futuro: Contas a pagar e "Ainda a pagar", nunca em Pago (D-021(5)). Pagamento realizado: o gasto único criado por `pay_commitment` ou `pay_invoice`.
- Transferência entre contas: não existe (P-018); a importação marca "Parece transferência" e deixa a linha desmarcada (D-048).
- Aporte em meta: nunca em Pago, Recebido, Diferença, Ainda a pagar nem na renda comprometida (D-027(3)).
- Saldo bancário: não é calculado (D-043, "O Clarevo não calcula saldo por conta").
- Encargo: só na fatura; entra em Pago quando a fatura é paga, em "Encargos do cartão"; fica fora do orçamento.
- Estorno: abate a fatura e o orçamento, com a limitação de CL-01.

Contra a dupla contagem: compra no cartão não entra em Pago; pagamento de fatura não entra no orçamento; conta paga tem exatamente um gasto vivo (garantido no banco, D-021(7)); aviso ao anotar gasto com "fatura" ou "cartão" (D-020); "Parece pagamento de fatura" na importação; "Dinheiro guardado não é gasto" no formulário de gasto. A sonda de CL-01 fechou R$ 300,00 em todas as colunas. Exceção: estorno no orçamento (CL-01).

**3. Causa.** Não há um dicionário único com fórmula, período, origem, exclusões e regra de atualização lado a lado; a informação está espalhada em cerca de 480 linhas de `docs/02` e em decisões longas. Há trecho desatualizado: `docs/02`, linha 148, diz "'Por mês' continua R$ 3.530,00", e desde D-046 o valor é R$ 3.668,90 (a linha 363 do mesmo documento já diz isso).

**4. Proposta (só documentação e teste).**
1. Seção "Dicionário de indicadores" em `docs/02`, uma linha por indicador: Recebido, Pago, Diferença, Ainda a pagar, Previsto para o mês, Previsão dos pagamentos do mês, Renda comprometida (valor e percentual), Fora dos compromissos, Orçado e Usado, Faturas do mês, Total da fatura, Limite usado, Guardado, Guardado no mês, Planejado, Progresso, Cobertura, Gastos essenciais, "Por mês" dos gastos fixos, "Por ano" das contas do ano e Assinaturas por mês e por ano. Colunas: fórmula; data que decide o mês; origem (tabela e função do banco); o que entra e o que não entra; estimado ou confirmado; telas; teste.
2. Corrigir a linha 148 de `docs/02`.
3. Teste "matriz de consolidação", no core e no banco: demonstração + compra de 10/10 em 3x + pagamento parcial + estorno + conta paga com atraso + aporte, conferindo todos os indicadores mês a mês e que alterar um lançamento muda só os indicadores dele.

**5. Riscos e dependências.** Depende das decisões de CL-01, CL-06 e CL-08 para não documentar regra que vai mudar.

**6. Teste de aceite.** Dicionário revisado por Enzo; matriz automatizada passando; R$ 6.000,00 - R$ 3.900,00 = R$ 2.100,00 continua chamado "Diferença do mês", sem "saldo" nem "disponível" (os testes de texto já recusam "disponível" e "sobra" na renda comprometida).
- Já cobrem: `core.test.ts` › "sequência de aceite do primeiro ciclo (mesmo mês e contexto) › reproduz a tabela do handoff, com R$ 650 previstos sempre separados" e "a composição soma exatamente o total"; `committed.test.ts` (identidade comprometido = pagas do mês + "Ainda a pagar" do mês, nos testes da demonstração); `cards.test.ts` › "Pago e Recebido não mudam com compras, encargos, estornos e cartões (só o pagamento da fatura mexe em Pago)"; `budget.test.ts` › "os totais de outubro não mudam (6.000 / 3.900 / 2.100) nem o comprometido (52,5%), e o limite de 60% aparece".
- Falta: a matriz de consolidação.

---

## CL-03 · Edição, confirmação e importações idempotentes

**1. Status:** já implementado no núcleo; parcial nos testes de tela com rede instável.

**2. O que o app faz hoje.** Toda escrita passa por função do banco com chave de idempotência e versão (D-012; `docs/02`, linhas "Duplicidade" e "Falha de rede incerta"). Repetir a mesma chave devolve o mesmo resultado; a mesma chave com outro conteúdo é recusada (`chave_reutilizada`); versão antiga é recusada (`versao_desatualizada`). Antes de repetir depois de uma falha incerta, o app consulta se a tentativa anterior foi gravada. Conta paga tem exatamente um gasto, conferido no fim da transação (D-021(7)). Importação: resumo SHA-256 por linha, único entre linhas vivas; importar de novo com outra chave cria 0 e pula as já gravadas; "Já anotado" aparece na revisão, antes de gravar (D-048). Gerar de novo as contas das séries não cria nada (D-024(3)).

"Confirmar duas vezes a mesma receita": não existe receita prevista a confirmar (contas a receber estão fora do ciclo; D-011 só tem realizados). O envio repetido usa a mesma chave e grava um registro só. Anotar a mesma receita de novo, à mão, em outra operação, cria outro registro: não há aviso de semelhança para registros manuais (há para nota fiscal, pela chave, e para gasto fixo no cadastro).

**3. Causa da lacuna.** O próprio `docs/02` registra: "as telas ainda sem teste automatizado de queda de rede".

**4. Proposta (só testes).** Testes de tela com repositório que falha depois de gravar, para Anotar gasto, Pagar conta, Pagar fatura e Importar, conferindo um único lançamento; teste "reabrir ou atualizar a tela não cria lançamento". Aviso de possível duplicidade em registro manual seria funcionalidade nova: não proponho sem decisão de Enzo.

**5. Riscos e dependências.** Nenhum indicador muda.

**6. Teste de aceite.** Repetir cada operação com a mesma chave depois de "falha de rede" e conferir Recebido, Pago e Ainda a pagar iguais e uma linha só.
- Já cobrem: `core.test.ts` › "duplicidade, versões e falhas › mesma operação enviada duas vezes cria um único registro" e "timeout depois de gravar + nova tentativa com a mesma chave: um único registro"; "contas a pagar › repositório › 9. pagamento idempotente: resposta perdida e falha antes de gravar"; `cards.test.ts` › "falha de rede: antes não grava; depois grava e a mesma chave devolve o resultado, sem duplicar"; `importar-repo.test.ts`; `90_importar.sql` (passos 2 a 4 da sequência de aceite).
- Faltam: os testes de tela com queda de rede.

---

## CL-04 · Permissões no servidor e isolamento

**1. Status:** já implementado para o escopo atual; pendências de LGPD que dependem de revisão jurídica e de decisão.

**2. O que o app faz hoje.** Leitura por políticas do banco (RLS) e escrita só pelas funções listadas no `CLAUDE.md`; escrita direta nas tabelas é recusada. Matriz de papéis em `docs/03` ("Quem pode o quê"). Testes negativos em `10_acesso.sql` (rodou e passou): familiar não vê o pessoal da titular nem por ID; quem administra a empresa vê a licença e não vê registros, compromissos nem a composição familiar; operações de outras pessoas ficam ocultas. Cada módulo tem casos `sem_permissao`. A demonstração roda só em memória, com o selo "Demonstração" (D-013, D-016), e conta nova nunca recebe dados de exemplo. A aba Família mostra "Família ainda não está ativa". Não existe painel de empresas (fora do ciclo).

**3. Causa das pendências.** `docs/03` lista como pendente: convite familiar, registro auditável de acesso interno, retenção do rastro técnico de exclusões (P-010), exportação completa e exclusão de conta (LGPD). Os testes de banco rodam em Postgres local com simulação do `auth`; `docs/03` pede repetir os fluxos no Supabase real.

**4. Proposta (sem ampliar o produto).** (1) Rodar `npm run test:api` e o roteiro de permissões no projeto de teste do Supabase; (2) texto curto de privacidade e retenção para revisão jurídica e decisão de Enzo sobre P-010; (3) manter um caso negativo por API para cada função nova.

**5. Riscos e dependências.** Exclusão de conta e exportação completa seriam funcionalidades novas: precisam de decisão.

**6. Teste de aceite.** Chamada direta com ID de outra pessoa recusada em todas as funções; RH sem acesso a nenhum dado financeiro.
- Já cobrem: `10_acesso.sql` e os blocos de permissão de cada arquivo em `supabase/tests`; `apps/app/test/supabase-api.int.test.ts` (não executado aqui).
- Falta: execução no Supabase real (não verificado por mim).

---

## CL-05 · Resumo: diferença, saldo e valores por vencer

**1. Status:** já implementado em quase tudo; a frase "não é saldo" só aparece um toque adiante. Mudar o topo do Resumo precisa de decisão de Enzo (D-022).

**2. O que o app faz hoje (demonstração, outubro de 2026).** Topo: "Diferença do mês R$ 2.100,00" com a legenda "Recebimentos menos pagamentos confirmados · até 07/10"; Recebido R$ 6.000,00 e Pago R$ 3.900,00, tocáveis. Card "Ainda a pagar neste mês": R$ 650,00, "2 contas · próxima: Internet, 15/10", "Valores previstos, separados do que já foi pago.", "Ver contas"; com estimados, "Inclui R$ X em valores estimados."; vencidas em linha própria, com ícone; "Renda comprometida em outubro 52,5%" no mesmo card. Tocar na Diferença abre: "Não é o saldo da conta nem dinheiro disponível (...). Contas a pagar não entram." Mês sem receita: Diferença negativa com "Pagamentos acima dos recebimentos no período"; mês passado sem anotação: "Nada anotado em setembro.", "Nenhum recebimento anotado em setembro." Receita variável: não há receita prevista (D-011); contas a pagar nunca entram na Diferença (D-021(5)). Arquivos: `apps/app/src/app/(tabs)/index.tsx`, `composicao.tsx`, `packages/core/src/commitments.ts` (`toPayCaption`), `retorno.ts` (`emptyMonthCaption`).

**3. Causa.** Topo enxuto aprovado (D-022); a explicação ficou na composição.

**4. Proposta (decisão de Enzo, só texto; nenhum número muda).** (a) Manter; (b) legenda "Recebido menos pago até 07/10 · não é saldo"; (c) "O que é?" ao lado de "Diferença do mês", abrindo a explicação.

**5. Riscos e dependências.** Estrutura aprovada do Resumo; caber em 320 px.

**6. Teste de aceite.** Resumo de outubro: R$ 2.100,00, R$ 6.000,00, R$ 3.900,00 e R$ 650,00; texto escolhido visível em 320 px e lido pelo leitor de tela.
- Já cobrem os números: os testes de T01 (abaixo) e o roteiro web (não executado).
- Falta: teste de texto e de tela para a frase nova, se aprovada.

---

## CL-06 · Renda comprometida: fórmula, base e horizonte

**1. Status:** já implementado; dois ajustes pequenos (a soma dos percentuais dos grupos pode diferir 0,1 ponto do total; a função pura não se protege de renda zero, situação hoje inalcançável).

**2. O que o app faz hoje.**
- Comprometido do mês = contas a pagar com vencimento no mês: pagas pelo valor pago, em aberto pelo previsto, estimadas ou não (D-026(1); `committed.ts`; banco `month_committed`).
- Denominador = renda de referência informada pela pessoa (líquida, "a partir de" um mês, com "Minha renda varia"); nunca o Recebido.
- Outubro: R$ 3.150,00 de R$ 6.000,00 = 52,5% (Gastos fixos R$ 2.500,00 · 41,7%; Parcelamentos R$ 0,00 · 0,0%; Outras contas a pagar R$ 650,00 · 10,8%). "Fora dos compromissos: R$ 2.850,00" com "Não é saldo: ainda precisa cobrir gastos do dia a dia, como mercado, e não considera o dinheiro que já estava na conta." "Como calculamos" diz que gastos sem conta a pagar, como mercado, ficam fora (o Mercado de R$ 1.400,00 de outubro não entra).
- Renda zero: impossível. O core (`validateIncomeReferenceDraft`) e o banco (`set_income_reference` e a restrição de 1 a 999.999.999 centavos) recusam 0 com `valor_invalido`. Sem referência: "Contas de outubro R$ 3.150,00" e o convite para informar a renda, sem percentual; `month_committed` devolve percentuais nulos.
- Renda que varia: "Referência de setembro. Revise para outubro." Mudar a referência a partir de novembro não muda outubro (`referenceFor`). Próximos meses sempre "Previsto".

Achados da sonda:
- Novembro na demonstração: total 73,0% (R$ 4.380,00); grupos 44,7% + 14,2% + 9,2% + 5,0% = 73,1%. Em reais a soma fecha exatamente; em percentual não, porque cada grupo é arredondado sozinho. Isso está em `docs/02`, mas não na tela.
- `committedPermille(315000, 0)` dá 0 e `formatPermille` mostra "menos de 0,1%". Hoje é inalcançável (renda 0 é recusada), e a linha do Resumo cairia no estado "sem referência", mas a função fica sem proteção.

**3. Causa.** Arredondamento por grupo (decisão de D-026(3)); `percentTenths` devolve 0 quando o divisor é 0 ou menor.

**4. Proposta.**
1. **Decisão de Enzo, leve:** (a) nota sob a composição: "Cada percentual é arredondado sozinho; a soma pode diferir 0,1 do total." (só texto); ou (b) maior resto nos grupos, como já é feito em "Por categoria" do Pago. Com (b), em novembro "Faturas de cartão" mostra 9,1% em vez de 9,2%; muda o core, `month_committed` e os testes.
2. Proteção: `committedPermille` devolve nulo com referência menor ou igual a zero, com teste.
3. Opcional (texto): "Fora dos compromissos" inclui o que já foi gasto sem conta a pagar; a nota pode dizer "gastos sem conta a pagar, como o mercado, saem daqui".

**5. Riscos e dependências.** "Seu limite" (D-041(5)) e o percentual de Cartões (D-042) usam a mesma função; nenhum total muda.

**6. Teste de aceite.** Outubro 52,5% com R$ 3.150,00 = 2.500 + 0 + 650; novembro 73,0% com a nota visível ou com grupos somando 73,0%; renda 0 recusada; sem referência, só reais.
- Já cobrem: `committed.test.ts` › "percentual em milésimos e formato › metade para cima em inteiros: 52,5%, 52,665% → 52,7%, menos de 0,1% e acima de 100%", "referenceFor: a mais recente com início até o mês; nenhuma antes da primeira", "demonstração (...) › outubro: 52,5%, fora dos compromissos R$ 2.850,00; Resumo sem mudança (6.000 / 3.900 / 2.100 / 650)", "casos de borda › gasto anotado sem conta a pagar fica fora; mês sem contas mostra 0,0% e a frase própria", "renda que varia: referência de um mês anterior pede revisão, sem bloquear", "MemoryRepository: renda de referência com as regras do banco › mês (mes_invalido e referencia_fora_do_intervalo), valor, tipo e permissão, na ordem do banco"; `cards.test.ts` › "integração: renda comprometida, lembretes e revisão dos últimos meses › demonstração: outubro igual (52,5%); novembro ganha o grupo "Faturas de cartão" (R$ 550,00) fora de Dívidas"; `50_renda_comprometida.sql`.
- Faltam: teste da soma dos percentuais (ou da nota); teste da função com renda 0.

---

## CL-07 · Cartões, faturas parciais e estimados

**1. Status:** parcial.

**2. O que o app faz hoje.** Situações da fatura: Aberta, Fechada, Paga e Paga em parte (`INVOICE_SITUATION_LABEL`, `cards.ts`). Datas: "Fecha em 03/11", "Vence em 10/11" ou "Venceu em 10/11". Fatura aberta: "Valor estimado: pode mudar com novas compras."; em Contas a pagar, "≈" e "estimado". Pagamento só depois do fechamento. Parcial: "Ficaram R$ 230,00 para a fatura de dezembro. Juros e encargos do banco entram quando você informar a fatura de dezembro.", com "Quanto custa pagar só uma parte?"; o valor pago entra em Pago na data do pagamento; o resto vira "Saldo anterior" na fatura seguinte, sem juros. Encargos são informados pela pessoa; o app não calcula juros. Estorno é um crédito com categoria opcional, sem vínculo com a compra (D-037(7)).

Lacunas confirmadas no código:
1. "Vencida" não é situação da fatura: a fatura fechada e não paga depois do vencimento aparece como "Fechada" com "Venceu em 10/11" (em Contas a pagar ela já aparece entre as vencidas).
2. Em Contas a pagar e em Seus últimos meses, a conta da fatura paga em parte aparece como paga: "Paga em 08/11/2026", R$ 300,00 e "Previsto R$ 530,00" (`commitment-row.tsx` usa `commitmentSituation`, e a conta fica com situação quitada), enquanto a tela da fatura diz "Paga em parte".
3. Estorno: o orçamento não reconcilia (CL-01).
4. Risco não testado: encargo informado duas vezes em operações diferentes entra duas vezes (com a mesma chave não duplica). Na importação de fatura (D-048), toda linha que não é estorno vira compra à vista; uma linha de IOF ou juros do arquivo poderia somar com um encargo informado à mão, e o "Já anotado" compara compras, não encargos. Fica para CL-14.

**3. Causa.** Situação "vencida" não foi prevista na fatura; a linha de Contas a pagar não distingue pagamento parcial de fatura; estorno sem vínculo por decisão de D-037.

**4. Proposta (só texto e rótulo, sem mudar número).** (1) "Vencida", calculada na leitura (fechada, sem pagamento e vencimento antes de hoje), como nas contas (D-021(4)); (2) em Contas a pagar, para conta de fatura com pagamento menor que o total: "Paga em parte em 08/11/2026 · R$ 230,00 foram para a fatura de dezembro"; (3) estorno conforme a decisão de CL-01.

**5. Riscos e dependências.** Lembretes, Seus últimos meses e renda comprometida usam a conta da fatura; nenhum número muda.

**6. Teste de aceite.** Fatura de R$ 530,00 paga R$ 300,00 em 08/11: tela da fatura "Paga em parte"; Contas a pagar "Paga em parte"; dezembro com "Saldo anterior R$ 230,00" e total R$ 580,00; Pago de novembro R$ 300,00; renda comprometida de novembro R$ 300,00 e de dezembro R$ 580,00 (soma R$ 880,00 = 530 + 350; a sonda confirmou a mesma identidade com outros valores). Fatura fechada e não paga em 11/11: "Vencida".
- Já cobrem: `cards.test.ts` › "pagar a fatura › pagamento parcial: 300,00 de 530,00 → saldo anterior de 230,00 em dezembro, sem juros", "desfazer pagamento parcial apaga o gasto e o saldo anterior; com a fatura seguinte paga, fatura_seguinte_paga", "fatura: composição, total e situação › situação: aberta até o dia do fechamento (inclusive), fechada depois; "estimado" some com o fechamento", "total = parcelas + encargos + saldo anterior - estornos (...)", "total negativo: crédito levado para a fatura seguinte como estorno (...)", "Por categoria com pagamento de fatura › pagamento parcial de 300,00: Lazer 198,11, Educação 84,91 e Encargos do cartão 16,98 (...)"; `70_cartoes.sql`.
- Faltam: testes dos rótulos "Vencida" e "Paga em parte" em Contas a pagar; renda comprometida depois do pagamento parcial.

---

## CL-08 · "Por mês" e "Por ano" em Gastos fixos

**1. Status:** falha confirmada de rótulo. O cálculo está correto.

**2. O que o app faz hoje** (`apps/app/src/app/gastos-fixos/index.tsx`; `series.ts`, `seriesMonthlyTotal` e `seriesYearlyTotal`; `subscriptions.ts`; tela `270_gastos_fixos_assinaturas.png`):
- "Por mês, se os valores não mudarem: R$ 3.668,90 (inclui R$ 180,00 estimados). Contas do ano ficam fora desta soma." = Aluguel R$ 2.500,00 + Luz R$ 180,00 (estimada, começa em novembro) + Financiamento do carro R$ 850,00 (começa em novembro, termina em outubro de 2029) + Streaming (exemplo) R$ 39,90 + Academia (exemplo) R$ 99,00 (as duas assinaturas começam em junho de 2027). R$ 1.168,90 desse total são de séries que ainda não têm conta em outubro.
- "Por ano, se os valores não mudarem: R$ 4.200,00 (inclui R$ 4.200,00 estimados)." = só as contas do ano: IPVA R$ 2.400,00 (cota única) + IPTU 10 × R$ 180,00 = R$ 1.800,00, todos estimados. Resposta à pergunta do relatório: sim, R$ 4.200,00 são só as contas do ano. R$ 3.668,90 × 12 (R$ 44.026,80) não aparece em lugar nenhum.
- Card Assinaturas: "R$ 138,90 por mês · R$ 1.666,80 por ano" (por mês × 12).
- Sonda: assinatura de R$ 39,90 que termina em dezembro de 2026 mostra "R$ 478,80 por ano", mas só restam 3 contas (R$ 119,70). Um parcelamento de 3 parcelas entra inteiro no "Por mês" (correto) e a previsão dos próximos meses para no término (correto).
- `docs/02`, linha 148, ainda diz R$ 3.530,00.

**3. Causa.** Rótulos genéricos ("Por mês", "Por ano") que não dizem o conjunto; "por ano = por mês × 12" das assinaturas ignora o término.

**4. Proposta.**
1. Textos: "Gastos fixos, parcelamentos e assinaturas: R$ 3.668,90 por mês, se os valores não mudarem (inclui R$ 180,00 estimados)." e "Contas do ano (IPVA, IPTU e outras): R$ 4.200,00 por ano, se os valores não mudarem (valor estimado)." Com tudo estimado, "valor estimado" em vez de "inclui R$ 4.200,00 estimados".
2. **Decisão de Enzo, leve:** o "Por mês" deve incluir séries que ainda não começaram? (a) Manter e dizer "inclui as que começam depois"; (b) somar só as que já têm conta até o mês seguinte (demonstração: R$ 3.530,00, sem as assinaturas de junho de 2027). Nenhum indicador do mês muda; mudam o texto e o valor levado ao atalho "Dividir estas contas".
3. Assinatura com término em menos de 12 meses: "R$ 119,70 até dezembro" em vez de "por ano" (regra em `subscriptions.ts` e testes).
4. Corrigir `docs/02`, linha 148.

**5. Riscos e dependências.** O roteiro web confere os textos exatos (`scripts/e2e-web.js`, linhas 870, 886-887 e 7077-7079); "Dividir estas contas" e "Quanto custa por ano?" recebem esses valores.

**6. Teste de aceite.** Demonstração com as duas frases novas; assinatura que termina em dezembro não mostra R$ 478,80; parcelamento curto não é multiplicado.
- Já cobrem: `annual.test.ts` › "contas do ano: totais, ano a ano, informar, tirar e sugestão › seriesMonthlyTotal ignora contas do ano; seriesYearlyTotal da demonstração: R$ 4.200,00, todos estimados" (também confere R$ 3.668,90); `series.test.ts` › "seriesMonthlyTotal: por mês, se os valores não mudarem"; `subscriptions.test.ts` (totais).
- Faltam: assinatura com término; "Por mês" com séries que ainda não começaram, se Enzo escolher (b).

---

## CL-09 · Reserva: base, prazo e arredondamento

**1. Status:** parcial. O cálculo é reproduzível e testado; faltam explicações na tela.

**2. O que o app faz hoje (demonstração).**
- Gastos essenciais R$ 3.750,00 = média do Pago de setembro em Moradia (Aluguel R$ 2.500,00) e Mercado (R$ 1.250,00), o único mês fechado com gastos entre os 6 anteriores. Regra: até 3 meses fechados mais recentes com gastos; Moradia, Mercado, Transporte, Saúde e Educação; Lazer, "Sem categoria" e pagamentos de contas do ano ficam fora; o pagamento de fatura entra dividido pelas categorias (D-027(6), `goals.ts`, `essentialMonthly`). Tela: "Média de setembro de 2026 em Moradia e Mercado. Lazer e gastos sem categoria não entram." e "Ajustar valor".
- Reserva de 6 meses: R$ 22.500,00 = 6 × R$ 3.750,00. Guardado R$ 3.500,00 (R$ 3.000,00 já guardados em 01/10 + aporte de R$ 500,00 em 06/10).
- 15% = piso(100 × 3.500 ÷ 22.500) = piso(15,56); a barra é desenhada com 15% (`barPercent`). "Cobre 0,9 mês" = piso(10 × 3.500 ÷ 3.750) = piso(9,33) décimos.
- Faltam R$ 19.000,00. Mês previsto = P0 + teto(falta ÷ plano) - 1. P0 é o mês seguinte quando já houve aporte no mês atual, então novembro de 2026; teto(19.000 ÷ 500) = 38 aportes, dezembro de 2029. Sem o aporte de outubro, P0 seria outubro e o mês, novembro de 2029 (sonda).
- Etapas do plano: 1 mês (R$ 3.750,00, faltam R$ 250,00) em novembro de 2026; 3 meses (R$ 11.250,00, faltam R$ 7.750,00, 16 aportes) em fevereiro de 2028; 6 meses em dezembro de 2029.
- Mudar o plano para R$ 700,00: fevereiro de 2029, e o guardado continua R$ 3.500,00 (sonda): o plano é intenção, não movimento (D-027(5)).

Lacunas na tela:
1. "sem contar rendimentos" aparece na prévia dos formulários e no plano de guardar, mas não na legenda do card ("Planejado: R$ 500,00 por mês · chega lá em dezembro de 2029") nem no detalhe ("Você planejou guardar R$ 500,00 por mês. Nesse ritmo, chega lá em dezembro de 2029.", tela `116_detalhe_reserva.png`).
2. O mês a partir do qual se conta (P0) não aparece.
3. O arredondamento para baixo do percentual e da cobertura não aparece.
4. A base não diz que só entra o que foi pago (contas em aberto e faturas não pagas ficam fora) nem que, no exemplo, a "média" é de um mês só.

**3. Causa.** Textos curtos por escolha de D-027 e D-036; as regras estão só em `docs/02`.

**4. Proposta (só texto).** Detalhe: "Você planejou guardar R$ 500,00 por mês. Contando a partir de novembro de 2026, sem rendimentos, chega lá em dezembro de 2029." Card: "(...) chega lá em dezembro de 2029, sem contar rendimentos". Base: "Média do que foi pago em setembro de 2026 em Moradia e Mercado (1 mês com gastos anotados). Contas ainda não pagas, Lazer e gastos sem categoria não entram." Em "O que é isso?": "O percentual e os meses cobertos são arredondados para baixo."

**5. Riscos e dependências.** Testes de texto e roteiro web que conferem as legendas das metas.

**6. Teste de aceite (T10).** R$ 3.500,00 de R$ 22.500,00, 15%, faltam R$ 19.000,00, dezembro de 2029 com P0 em novembro; plano de R$ 700,00 dá fevereiro de 2029 sem mudar o guardado; textos novos visíveis.
- Já cobrem: `goals.test.ts` › "goalProgress: para baixo, nunca 100% antes de alcançar", "P0, valor por mês até o prazo e mês previsto com o plano (2.5)", "demonstração do Ciclo C › reserva 15% e 0,9 mês; viagem 20% e R$ 480,00 por mês; totais de outubro e renda comprometida iguais"; `savings.test.ts` › "demonstração: gastos essenciais R$ 3.750,00, R$ 3.500,00 guardados, R$ 500,00 por mês", "P0: sem aporte da reserva em outubro, o plano conta desde outubro", "exemplo do texto: R$ 300,00 por mês, reserva vazia, primeira etapa chega em novembro de 2027"; `60_metas.sql` e `65_guardar.sql`.
- Faltam: teste explícito de que mudar o plano não muda movimentos; testes de texto das legendas novas.

---

## CL-10 · Orçamento acima de 100% e avisos neutros

**1. Status:** parcial.

**2. O que o app faz hoje (outubro, tela `200_orcamento.png`).** "Orçado R$ 4.600,00 · Usado R$ 4.300,00" (2.500 + 1.800 + 300; 2.500 + 1.400 + 400) e "Soma só as categorias com orçamento."; Moradia 100,0% "Orçamento usado por inteiro"; Mercado 77,8% "Faltam R$ 400,00"; Lazer 133,3% "R$ 100,00 acima do orçamento" (1ª parcela do tênis R$ 200,00 + restaurante R$ 200,00).

Como os 133,3% são desenhados: largura da barra = mínimo entre 100% e o percentual (`barTenths = min(1000, tenths)` em `budget.ts`; `orcamento/index.tsx`), sempre na cor da marca (D-041(3) e (6)). Lazer 133,3% e Moradia 100% têm barras idênticas, cheias; a diferença está só no número e na linha de texto, que não dependem de cor.

Estados (sonda `budgetRow`):

| Usado de R$ 1.000,00 | Percentual | Barra | Linha | Nível interno |
|---|---|---|---|---|
| R$ 799,00 | 79,9% | 79,9% | Faltam R$ 201,00 | 0 |
| R$ 800,00 | 80,0% | 80% | Faltam R$ 200,00 | 1 |
| R$ 1.000,00 | 100,0% | 100% | Orçamento usado por inteiro | 1 |
| R$ 400,00 de R$ 300,00 | 133,3% | 100% | R$ 100,00 acima do orçamento | 2 |

O leitor de tela diz "Lazer, R$ 400,00 de R$ 300,00, 133,3% do orçamento. R$ 100,00 acima do orçamento." O nível de 80% não aparece no card: só vira a linha "Mercado chegou a 85% do orçamento de outubro." na mensagem de sucesso, no cruzamento, que some na tela seguinte e não grava nada (D-041(4)).

Usado e Pago: a tela diz "O orçamento conta o usado no mês. Pago por categoria mostra o que foi pago, e a compra no cartão entra em Pago quando a fatura é paga.", mas não diz que contas a pagar em aberto ficam fora. Em outubro, Moradia mostra 100% com Internet (R$ 150,00) e Condomínio (R$ 500,00), ambos de Moradia, ainda em aberto; pagos em outubro, Moradia vai a R$ 3.150,00 (126,0%).

Mudar a categoria move o valor sem duplicar (`80_orcamento.sql`, "mudar a categoria muda de linha").

**3. Causa.** D-041 escolheu a barra sempre na cor da marca e o aviso de 80% só no cruzamento.

**4. Proposta (decisão de Enzo sobre a forma; nenhum número muda).**
- Acima de 100%: (a) "+" no fim da barra cheia e o trecho que passa listrado, como o medidor da renda comprometida ("medidor cheio com '+'", `docs/02`), sem cor nova (recomendada, por coerência); (b) barra na escala do maior valor, com um traço no ponto do orçamento (em 133,3% o traço fica em 75%) e o excedente listrado; (c) manter.
- 80%: manter só no aviso, como em D-041, ou acrescentar ao card a linha neutra "Chegou a 80% do orçamento".
- Texto: acrescentar "Contas a pagar em aberto entram no usado quando você as marca como pagas."

**5. Riscos e dependências.** Testes de texto recusam "estourou", "excedeu" e "alerta"; caber em 320 px; roteiro web.

**6. Teste de aceite.** Os quatro estados da tabela, com 100% e 133,3% visualmente diferentes sem depender de cor; o texto sobre contas em aberto visível.
- Já cobrem: `budget.test.ts` › "resumo do mês e textos › acima do orçamento: "R$ 12,30 acima do orçamento", barra cheia e percentual real", "exatamente no valor do orçamento: "Orçamento usado por inteiro" (nível 1, não passou)", "níveis pelo valor exato: 79,99% abaixo, 80% e 100% no nível 1, 100,01% passou", os cinco testes de "aviso dentro do app ao cruzar 80% ou 100%" e o teste de demonstração de T03.
- Faltam: teste de tela que diferencie 100% de 133,3%; teste do texto novo.

---

## Matriz de testes: T01 a T06 e T09 a T11

| Caso | Existe teste automatizado que prova o resultado esperado? | Testes (arquivo › nome) | O que falta |
|---|---|---|---|
| T01 · Resumo | Sim | `core.test.ts` › "sequência de aceite do primeiro ciclo (mesmo mês e contexto) › reproduz a tabela do handoff, com R$ 650 previstos sempre separados"; `core.test.ts` › "contas a pagar › repositório › 8. sequência de aceite estendida (2.7), com Recebido, Pago e Diferença sem contar contas a pagar"; `20_registros.sql` ("base 6000/3900/2100"); `30_contas_a_pagar.sql` ("contas a pagar não entram em Recebido, Pago ou Diferença") | Só o texto novo de CL-05, se aprovado |
| T02 · Comprometimento | Sim, para 52,5% e R$ 3.150,00 = 2.500 + 0 + 650 | `committed.test.ts` › "demonstração (renda de referência R$ 6.000,00 desde setembro) › outubro: 52,5%, fora dos compromissos R$ 2.850,00; Resumo sem mudança (6.000 / 3.900 / 2.100 / 650)"; `50_renda_comprometida.sql` ("somas coerentes") | Soma dos percentuais dos grupos igual ao total: em novembro dá 73,1% para 73,0% |
| T03 · Orçamento | Sim | `budget.test.ts` › "a demonstração (fictícia): orçamento de outubro e limite de 60% › usado em outubro: Moradia 100%, Mercado 77,8%, Lazer com a 1ª parcela do tênis e o restaurante (133,3%)" (inclui "Orçado R$ 4.600,00 · Usado R$ 4.300,00"); "resumo do mês e textos › o total soma só as categorias com orçamento; a categoria mais perto do limite é a de maior percentual" | Teste de tela da barra acima de 100% |
| T04 · Parcela de cartão | Em partes | `budget.test.ts` › "compra parcelada: cada parcela conta no mês da compra mais (k - 1) (...)" e "o pagamento de uma fatura não conta (...)"; `80_orcamento.sql` ("pagar a fatura não muda o usado de outubro"); `cards.test.ts` › "pagar a fatura › pagamento total: UM gasto na data do pagamento, conta paga, nada em Pago antes disso" | Cenário integrado da compra de 10/10 em 3x, conferindo por mês e no total orçamento, faturas, Pago, Ainda a pagar e renda comprometida (a sonda fechou R$ 300,00 em todos) |
| T05 · Fatura parcial | Sim | `cards.test.ts` › "pagar a fatura › pagamento parcial: 300,00 de 530,00 → saldo anterior de 230,00 em dezembro, sem juros", "desfazer pagamento parcial apaga o gasto e o saldo anterior (...)", "MemoryRepository: cartões com as regras do banco › pagamento parcial depois do fechamento (...)", "Por categoria com pagamento de fatura › pagamento parcial de 300,00 (...) Encargos do cartão 16,98 (...)"; `70_cartoes.sql` | Renda comprometida depois do parcial; rótulo "Paga em parte" em Contas a pagar (hoje "Paga") |
| T06 · Estorno | Não. Falha confirmada no orçamento | O comportamento atual está fixado em `budget.test.ts` › "estorno com categoria desconta no mês da fatura em que foi informado, nunca abaixo de zero por categoria"; faturas em `cards.test.ts` › "total negativo: crédito levado (...)" e "crédito em cadeia (...)" | Teste de reconciliação conforme a decisão de CL-01. Sonda: estorno total de R$ 300,00 zera as faturas, mas o orçamento soma R$ 200,00 (core e banco) |
| T09 · Recorrência | Em partes | `committed.test.ts` › "próximos meses (previsão) e "O que muda" › série com término, novo valor programado e números pulados no futuro" e "demonstração: novembro 63,8%, dezembro 58,8%, janeiro 98,8% (contas do ano 40,0%), fevereiro 61,8% (3,0%)"; `annual.test.ts` › "(...) seriesYearlyTotal da demonstração: R$ 4.200,00, todos estimados"; `series.test.ts` › "seriesMonthlyTotal: por mês, se os valores não mudarem" | Falha: assinatura com término mostra × 12 (R$ 478,80 em vez de R$ 119,70), sem teste |
| T10 · Reserva | Sim | `goals.test.ts` › "P0, valor por mês até o prazo e mês previsto com o plano (2.5)" (R$ 19.000,00 com R$ 500,00 a partir de novembro dá dezembro de 2029), "goalProgress: para baixo, nunca 100% antes de alcançar", "demonstração do Ciclo C › reserva 15% e 0,9 mês (...)"; `savings.test.ts` › "demonstração: gastos essenciais R$ 3.750,00, R$ 3.500,00 guardados, R$ 500,00 por mês" e "P0: sem aporte da reserva em outubro, o plano conta desde outubro" | Só os textos de CL-09 |
| T11 · Renda zero | Sim, para o que o produto permite | `committed.test.ts` › "MemoryRepository: renda de referência com as regras do banco › mês (...), valor, tipo e permissão, na ordem do banco" (0 dá `valor_invalido`); `50_renda_comprometida.sql` (0 dá `valor_invalido`; sem referência, "sem referência: só reais"); `committed.test.ts` › "medidor na escala da referência: cheio com "+" acima de 100%; sem referência, nenhum" e "casos de borda › gasto anotado sem conta a pagar fica fora; mês sem contas mostra 0,0% e a frase própria" | Proteção na função pura para renda 0 (hoje inalcançável) |

---

## Quadro final

| Item | Status | Prioridade sugerida | Precisa decisão? | Esforço |
|---|---|---|---|---|
| CL-01 | Necessita decisão de negócio (texto ambíguo; estorno não reconcilia o orçamento) | P0 | Sim: regra da parcela e do estorno | M (texto P; estorno ligado à compra G) |
| CL-02 | Feito em 15/10/2026 (D-050): dicionário em `docs/02` e matriz de consolidação no core e no banco | P0 | Não | M |
| CL-03 | Já implementado no núcleo; parcial em testes de tela com queda de rede | P1 | Não | M |
| CL-04 | Já implementado no escopo atual; pendências de LGPD | P0 (revisão jurídica e teste no Supabase real) | Sim: retenção (P-010) e revisão jurídica | M |
| CL-05 | Já implementado; "não é saldo" fora do topo | P2 | Sim: texto no topo do Resumo (D-022) | P |
| CL-06 | Já implementado; arredondamento dos grupos e proteção para renda 0 | P2 | Sim, leve: nota ou maior resto | P (nota) / M (maior resto) |
| CL-07 | Rótulos feitos em 15/10/2026 (D-050); estorno pendente (via CL-01) | P1 | Sim, só o estorno (via CL-01) | P (rótulos) |
| CL-08 | Corrigido em 15/10/2026 (D-050): rótulos, "Começam depois" e por ano só pelos meses em que vale | P1 | Não (a decisão leve virou a opção a, com o que ainda não começa dito à parte) | P |
| CL-09 | Corrigido em 15/10/2026 (D-050): explicações na reserva | P2 | Não | P |
| CL-10 | Parcial (100% e 133,3% desenhados iguais; contas em aberto fora do usado sem aviso) | P1 | Sim: forma do excedente; 80% no card | P |

---

# Revisão v0.9 · Parte 2: segurança, idempotência e experiência (CL-03, CL-04, CL-11 a CL-20, T07, T08, T12 a T15)

15/10/2026. Avaliação técnica só de leitura, sobre o código do repositório no commit `7b1a3d5`. Nenhum arquivo do projeto foi alterado.

## Como foi verificado

Executado nesta avaliação:

- `npm test`: 52 arquivos, 1.352 testes, todos passaram.
- `npm run typecheck`: sem erros no core e no app.
- `npm run test:db`: os 14 arquivos de `supabase/tests` passaram (Postgres 16 local, com a simulação do `auth` do Supabase).
- `npm run test:api` (portas 58399 e 58321): 181 testes passaram.
- Três sondas próprias num banco descartável com as 12 migrações (o banco já foi apagado):
  - `/tmp/claude-0/-home-user/1580a5fb-b479-5b5b-aff6-916ff9dc81be/scratchpad/p2/probe_cross.sql`: uma segunda pessoa (Beto) chama cada função executável com os ids da primeira (Ana) e lê todas as tabelas e visões.
  - `/tmp/claude-0/-home-user/1580a5fb-b479-5b5b-aff6-916ff9dc81be/scratchpad/p2/probe_concurrent.sql`: duas sessões ao mesmo tempo com a mesma chave de operação.
  - `/tmp/claude-0/-home-user/1580a5fb-b479-5b5b-aff6-916ff9dc81be/scratchpad/p2/probe_exclusao.sql`: exclusão de uma pessoa com dados.
- Leitura das capturas de `docs/telas` (390 px e 320 px) e do roteiro `scripts/e2e-web.js`.

Não executado: `npm run test:web` (pedido para não rodar). O último registro em `docs/04_ROTEIRO_LANCAMENTO.md` é de 11/10/2026, com 3.588 verificações. Nada foi testado em aparelho iOS ou Android, nem no projeto real do Supabase.

---

## CL-03 | Edição, confirmação e importações idempotentes (P0 no relatório)

**1. Status:** parcial. O núcleo já está implementado e testado no banco, na API e nas telas. Há uma lacuna residual confirmada: resultado incerto seguido de saída do formulário.

**2. O que o app faz hoje**

- Toda escrita passa por funções do banco com chave de operação por pessoa (D-012). A chave fica em `record_operations` (chave primária `actor_id, idempotency_key`), e uma trava por pessoa e chave (`pg_advisory_xact_lock`) faz uma segunda chamada simultânea esperar a primeira. Mesma chave com o mesmo conteúdo devolve o mesmo resultado; com outro conteúdo, `chave_reutilizada`. Editar e excluir exigem a versão (`versao_desatualizada`, inclusive com versão ausente).
- Nas telas, a chave de cada formulário é guardada entre tentativas. Com falha de rede, a tentativa fica pendente; a próxima, com o mesmo conteúdo, usa a mesma chave, e antes disso o app confere se a anterior foi gravada (`findOperation`, `findCommitmentOperation`, `findSeriesOperation` e outras; `apps/app/src/lib/guarded-write.ts`, `apps/app/src/components/record-form.tsx`). Se o conteúdo mudou e a anterior foi gravada, o app edita o registro gravado, nunca cria um segundo.
- Toque duplo: o botão fica ocupado ("Salvando…") e o segundo toque é ignorado (`if (busy) return`). Escritas nunca são repetidas sozinhas (`mutations: { retry: 0 }` em `apps/app/src/app/_layout.tsx`).
- Abrir ou atualizar o app gera as contas de gasto fixo do mês (`sync_series_occurrences`); o índice único `commitments_one_live_occurrence (series_id, occurrence_number)` impede conta repetida, mesmo com dois aparelhos.
- Importação (D-048): cada linha leva `import_key` (resumo SHA-256 calculado no aparelho), única por contexto entre linhas vivas. Na revisão, linha já importada aparece como "Já anotado", sem caixa para marcar; linha parecida com um registro existente (mesmo tipo e valor, até 3 dias, descrição parecida) aparece "Já anotado" desmarcada. Linha já importada é pulada pelo banco e contada. Cada lote tem chave própria, e repetir um lote devolve o mesmo resultado.
- Nota fiscal: o resumo da chave é único por contexto (`nota_ja_anotada`), com aviso antes de salvar.
- Ligação entre origem e ocorrência: o pagamento de uma conta cria um gasto ligado a ela (`commitment_id`); a conta de uma série guarda a série e o número; a exclusão é lógica (D-007); toda operação fica em `record_operations`, que é a trilha mínima.
- Sonda de concorrência: duas sessões chamaram `create_record` com a mesma chave ao mesmo tempo. A segunda esperou a trava e devolveu o mesmo id; ficou um registro só.

**3. Causa da lacuna**

- As tentativas pendentes ficam só na memória do formulário (`useRef`). Quando a resposta se perde, a tela diz "Não foi possível salvar. Seu preenchimento foi mantido. Tente novamente." (`packages/core/src/validation.ts`), embora a gravação possa ter acontecido. Se a pessoa sai do formulário (ou recarrega a página) e anota de novo, o app gera uma chave nova. O banco reconhece repetição só pela chave (sonda: o mesmo recebimento com chave nova vira um segundo registro), então o lançamento fica duplicado.
- Duas anotações manuais iguais, feitas em momentos diferentes, viram dois registros. Isso é intencional (dois cafés iguais no mesmo dia existem), mas fora da importação e da nota fiscal não há aviso de possível repetição.

**4. Proposta de solução**

- Texto próprio para resultado incerto, sem mudar regra: "Não deu para confirmar se foi salvo. Toque em Salvar de novo: o Clarevo confere antes e não anota duas vezes." Ao sair do formulário com tentativa pendente: "Pode ter sido salvo. Confira em Movimentações antes de anotar de novo."
- Guardar a tentativa pendente fora do componente, só na memória do app e por pessoa (nunca no aparelho), para que reabrir o mesmo formulário ainda confira a operação anterior.
- Testes a acrescentar: concorrência com a mesma chave em `create_record`, `pay_commitment` e `import_records` (no padrão `dblink` já usado em `40_gastos_fixos.sql`, item 8b); no roteiro web, toque duplo em "Salvar gasto" e em "Confirmar pagamento"; resultado incerto seguido de "Cancelar" e nova anotação.
- Opcional, **decisão de Enzo**: aviso leve ao anotar à mão quando já existe um registro igual ("Já existe um recebimento igual em 05/10, de R$ 6.000,00. Salvar mesmo assim?"), sem bloquear. Consequências: (a) sem o aviso, nada muda; (b) com o aviso, um toque a mais nos casos legítimos e nenhuma mudança no banco.

**5. Riscos e dependências:** o aviso de repetido precisa usar a mesma regra de semelhança da importação (`packages/core/src/importar`), senão os dois critérios divergem. Textos novos passam pelo `copy.test.ts`.

**6. Teste de aceite**

- Mesma chave duas vezes, em sequência e ao mesmo tempo: um registro.
- Resposta perdida e nova tentativa: um registro e a tela de sucesso.
- Resposta perdida, sair, reabrir e salvar de novo: o app avisa ou reconcilia, e Movimentações mostra um registro.
- Importar o mesmo OFX duas vezes: na segunda, todas as linhas vêm "Já anotado", sem caixa, e nenhum registro novo.

Cobertura que já existe:

- Banco: `20_registros.sql` (idempotência, versão, versão ausente, repetir edição e exclusão); `30_contas_a_pagar.sql` (idempotência e pagamento atômico, item 24 de `docs/03`); `40_gastos_fixos.sql` (8b, concorrência entre encerrar e pagar, com `dblink`); `70_cartoes.sql` (nota única por contexto); `90_importar.sql` (chave pulada, repetição, `chave_reutilizada`, excluir libera a chave).
- API (`apps/app/test/supabase-api.int.test.ts`): "repetir a operação devolve o mesmo registro; mesma chave com outro conteúdo é recusada"; "4. repetir o pagamento devolve o mesmo gasto"; "5. segundo pagamento é recusado"; "8. reconciliação por findSeriesOperation depois de falha de rede; excluir o gasto fixo"; "compra com a resposta perdida: a chave mostra se foi gravada e repetir não duplica"; "a resposta se perde: a importação foi gravada, e a chave encontra o resultado e repete sem duplicar"; mais 10 usos de resposta perdida (`lostResponse`) em contas do ano, revisão, renda, metas, plano de guardar, cartões, orçamento, limite, contas e assinaturas.
- Core: `core.test.ts` ("timeout depois de gravar + nova tentativa com a mesma chave: um único registro"); `importar-revisao.test.ts` ("o mesmo extrato lido duas vezes dá as mesmas chaves; uma linha nova no meio não muda as outras"); `importar-repo.test.ts`.
- Web: "I1 o mesmo arquivo de novo: as quatro linhas importadas vêm 'Já anotado'..." e "I1 o mesmo arquivo de novo: nenhum registro a mais foi criado"; "'Já paguei' com resultado incerto: conferido na hora, sucesso e um único gasto".

Faltam: concorrência com a mesma chave fora de `end_series`; toque duplo no roteiro web; resultado incerto seguido de saída do formulário.

---

## CL-04 | Permissões verificadas no servidor e isolamento entre contextos (P0 no relatório)

**1. Status:** parcial. O isolamento entre pessoas, Família e empresa já está implementado e foi comprovado também pela sonda desta avaliação. Política de privacidade, retenção e exclusão de conta **necessitam decisão de negócio e revisão jurídica**; a exclusão de conta não existe, e a exclusão direta pelo painel do Supabase falha (sonda).

**2. O que o app faz hoje**

- RLS ligada nas 24 tabelas do esquema público. Escrita direta recusada com sessão, com duas exceções previstas: o `update (name)` antigo de `financial_accounts` (D-043, mantido para o app publicado antes da 0010) e o gerenciamento de licenças por quem administra a empresa.
- 62 funções executáveis com sessão; o papel anônimo não executa nenhuma. A autoria vem da sessão. Id de outra pessoa responde `nao_encontrado` (não revela que existe); contexto sem permissão responde `sem_permissao` em vez de zero.
- 8 visões: `commitment_items` e `goal_items` com `security_invoker`; `card_items`, `card_entry_items`, `invoice_items`, `receipt_items`, `series_items` e `import_items` com `security_barrier` e o filtro de permissão escrito na visão.
- Papéis e escopos documentados em `docs/03_ACESSO_E_PERMISSOES.md` (titular, membro, RH, pessoa externa, sessão anônima), com 70 itens de teste listados.
- Empresa: vê só as licenças do próprio contrato (e-mail convidado, situação e datas de ativação e fim). Não existe painel corporativo.
- Exportação (D-047): usa as mesmas leituras, com RLS; nada novo vai ao servidor.
- Demonstração: roda só no aparelho, sem cliente do Supabase (detalhes em CL-11).

**Sonda desta avaliação** (`probe_cross.sql`): Beto, com o próprio espaço Pessoal, chamou 56 funções (todas as que recebem um id ou um contexto) em 66 tentativas com os ids da Ana. Entre elas: repetir a chave e o conteúdo exatos da Ana, usar a conta da Ana no Pessoal do Beto, pagar a fatura do próprio cartão com a conta da Ana e importar para o cartão da Ana. Resultado:

- Todas recusadas, com `nao_encontrado`, `sem_permissao` ou `conta_invalida`. `context_permission` devolveu falso para leitura e escrita.
- `insert`, `update` e `delete` diretos em `financial_records`: `permission denied`.
- O `update` direto do nome de uma conta da Ana passou sem erro, mas alterou 0 linhas (conferido: nome e versão iguais). Isso é esperado pela política `accounts_rename`.
- Leitura: 0 linha da Ana nas 25 tabelas e visões com `context_id`; nas outras 7, Beto vê só a própria pessoa e o próprio contexto, e nada de empresa.
- As 6 funções restantes não recebem dado de outra pessoa: `ensure_personal_space`, `my_today`, `invoice_due_on`, `invoice_closing_on`, `invoice_month_for` e `is_org_admin`.
- Nada da Ana mudou, e nenhuma operação foi gravada em nome do Beto além das dele.

**Sonda de exclusão** (`probe_exclusao.sql`): apagar a pessoa em `auth.users`, que é o que o "Delete user" do painel faz, falha com `financial_contexts_owner_person_id_fkey`. Apagar o contexto antes também falha (`financial_records_context_id_fkey`, `on delete restrict`). Só a ordem registros, contexto e pessoa funcionou, num caso simples com só o Pessoal. Não há roteiro documentado nem teste desse procedimento com todos os módulos e com Família.

**3. Causa das lacunas:** a política de privacidade, a retenção do rastro técnico (P-010) e o canal de pedidos de titular (P-023, que depende do domínio, P-006) estão pendentes por decisão. A exclusão de conta não entrou em nenhum ciclo. Os testes rodam fora do Supabase real, limite já registrado em `docs/03`.

**4. Proposta de solução** (sem ampliar o produto)

- Teste de matriz, por exemplo `supabase/tests/95_isolamento.sql`, no formato da sonda: lê do catálogo todas as funções executáveis e todas as tabelas e visões, e falha se uma função nova não tiver um caso "outra pessoa" ou se alguma leitura devolver linha de outro contexto. Assim, funções futuras já nascem com teste negativo.
- Roteiro de exclusão de pessoa (script do backend, testado em `supabase/tests` com todos os módulos e com Família) e registro em `docs/05`. A forma de pedir depende da decisão de CL-16.
- Teste rápido no projeto `clarevo-teste` do Supabase real, com duas contas, repetindo três chamadas da sonda pela API.
- Endurecimento opcional: conferir no banco real que a configuração `clarevo.today` (gancho de teste lido por `clarevo_today`) está vazia; retirar o `grant update (name)` de `financial_accounts` depois da publicação, como D-043 já prevê.
- Política de privacidade, retenção e exclusão: **decisão de Enzo com assessoria jurídica** (alternativas em CL-16).

**5. Riscos e dependências:** um script de exclusão errado pode apagar dados da Família; o teste precisa incluir uma pessoa que criou registros no contexto de outra (`created_by`). Retirar o `grant` antigo quebra o app publicado antes da 0010, se ainda houver cópias em uso.

**6. Teste de aceite:** matriz de isolamento sem falhas para todas as funções e leituras; exclusão de uma pessoa com dados em todos os módulos remove tudo dela e preserva a Família; no Supabase real, Beto recebe `nao_encontrado` ao pedir um registro da Ana pelo id.

Testes negativos que já existem (outra pessoa, por id ou chamada direta):

- `10_acesso.sql`: itens 1 a 16 de `docs/03` (Pessoal de outra pessoa, Família, RH, pessoa externa, anônimo, revogação, repetir operação antiga depois da revogação, totais recusados em vez de zero).
- `30_contas_a_pagar.sql` (itens 18 a 23), `40_gastos_fixos.sql` (25 a 28), `45_contas_do_ano.sql` (30), `47_retorno.sql` (35 a 38), `50_renda_comprometida.sql` (42), `60_metas.sql` (44), `65_guardar.sql` (45), `70_cartoes.sql` (50 e 51, bloco "9. Permissões"), `80_orcamento.sql` (56), `85_contas.sql` (61), `88_assinaturas.sql` (66) e `90_importar.sql` (70). Cada arquivo também confere a lista exata de funções executáveis e a escrita direta recusada.
- API: "outra pessoa não lê nem altera por ID, filtro ou operação"; "gravação direta na tabela é recusada; sem sessão nada é visível"; "9. outra pessoa não lê, não altera e não consulta o total" (contas a pagar); "9. outra pessoa não lê, não altera e não gera" (gastos fixos); "informar e tirar: validação no banco; outra pessoa não lê nem altera"; "R6 · decisão: versão, mês e decisão conferidos; o mês revisado nunca recua; só a própria pessoa decide e lê"; "outra pessoa não lê nem altera a referência, nem consulta a renda comprometida; gravação direta é recusada"; "outra pessoa não lê nem altera metas, movimentos nem operações; gravação direta é recusada"; "a resposta é só da pessoa e não grava nada além dela"; "outra pessoa não vê o cartão, não lança nem cria cartão no contexto"; "outra pessoa não lê nem altera orçamento e limite, nem consulta o usado; gravação direta é recusada"; "escrita direta: sem inserir, excluir ou mudar outra coluna; a pessoa de fora não renomeia nem lê"; "a pessoa de fora não lê nada deste contexto" (busca, também usada pela exportação); "recusas: a posição do item vem no detalhe e nada do lote é gravado" (importação, com a pessoa de fora); "versão velha traz a atual; ... fora da pessoa não existe" (assinaturas).

Tabela, visão ou função sem teste negativo: **nenhuma** encontrada no conjunto atual. O que falta é: (a) um teste que obrigue funções futuras a ter esse caso; (b) o mesmo conjunto no Supabase real; (c) o procedimento de exclusão de pessoa; (d) token forjado ou expirado na API (responsabilidade do PostgREST e do Supabase, não testada aqui).

---

## CL-11 | Separação entre demonstração, Pessoal e Família (P1)

**1. Status:** falha confirmada, parcial. O isolamento é real; a identificação visual tem duas lacunas; o que a Família mostra **necessita decisão de Enzo**.

**2. O que o app faz hoje**

- A demonstração (D-013, D-016) só existe no build `export:demo` (`EXPO_PUBLIC_MODO_DEMO=1`, publicado em clarevo-demo.pages.dev) ou em desenvolvimento sem Supabase. Usa `DemoAuth` e `MemoryRepository` (`apps/app/src/lib/demo-auth.ts`): nada vai a servidor, o cliente do Supabase nem é criado, e tudo some ao recarregar. Mesmo com o Supabase configurado no projeto da demonstração, a demonstração vence (`apps/app/src/state/session.tsx`). O build real não mostra o botão "Ver demonstração com dados fictícios" (`apps/app/src/app/boas-vindas.tsx`).
- Na demonstração, as preferências e memórias do aparelho não são gravadas (`persist = auth.mode !== 'demo'`).
- Conta real nunca herda dados fictícios: conta nova nasce só com a "Conta principal" (banco), e os dois sites têm endereços diferentes, então o armazenamento do navegador também é separado.
- Troca de pessoa: o cache de consultas e a memória da nota são limpos; as consultas levam o `contextId` na chave. Na Família nenhuma consulta é feita.
- O selo "Demonstração" aparece no cabeçalho das abas (`apps/app/src/components/header.tsx`) e nas telas de entrada; Conta diz "Demonstração: acesso simulado e dados fictícios, guardados só neste aparelho enquanto o app está aberto."
- Família: o seletor "Pessoal | Família" fica no Resumo e em Movimentações. Na Família, o Resumo mostra "Família ainda não está ativa" e o card "Nenhuma família vinculada. Em uma próxima versão você poderá convidar pessoas e escolher o que compartilhar. Seus registros pessoais continuam visíveis só para você." (`apps/app/src/components/family-state.tsx`, captura `docs/telas/15_familia.png`). O banco já tem Família com papéis e testes, sem tela nem convite (D-008).

**3. Causa**

- Formulários e detalhes usam o cabeçalho compacto (`SubHeader`), que mostra só a pílula "Salvando em Pessoal", sem o selo. Na demonstração, "Anotar gasto" diz "Salvando em Pessoal" e "Será salvo em Pessoal, Conta principal.", sem nada que indique demonstração (captura `docs/telas/08_anotar_preenchido.png`, feita na conta de demonstração).
- A aba Metas não mostra o contexto: quem escolheu "Família" no Resumo vê Metas com dados do Pessoal sem indicação.
- O seletor da Família tem o peso visual de um recurso pronto; o mês continua trocável numa tela sem dados.
- Detalhe menor: "Primeiros passos" trata o e-mail `demo@clarevo.app` como demonstração mesmo fora do modo de demonstração (`demoWithData` em `apps/app/src/components/primeiros-passos.tsx`), o que esconderia o card de uma conta real com esse e-mail.

**4. Proposta de solução**

- Na demonstração, a pílula de formulários e detalhes passa a dizer "Demonstração · Pessoal", e a linha final do formulário, "Fica só nesta demonstração, com dados fictícios." É correção de rótulo, coerente com D-013 ("selo visível"); registrar em `docs/00`.
- Pílula "Pessoal" no cabeçalho de Metas (D-027 já define Metas como Pessoal).
- `demoWithData` passa a exigir também `auth.mode === 'demo'`.
- Família, **decisão de Enzo**:
  - (a) Manter como está. Sem custo; o seletor continua sugerindo um recurso pronto, mas o estado explica.
  - (b) Manter o seletor com o rótulo "Família (em breve)"; o toque mostra só a explicação, sem o seletor de mês. Custo pequeno; deixa claro o que existe; muda um texto aprovado (CL-V002).
  - (c) Esconder o seletor até existirem convites e explicar a Família em Conta e em Aprender. Custo pequeno; tira um elemento aprovado em D-018 e CL-V002; o cabeçalho fica mais curto e "Anotar gasto" sobe (muda a medida de D-039(1)); o seletor volta com os convites.

**5. Riscos e dependências:** a pílula nova muda as conferências de cabeçalho do roteiro web (`headerChecks`) e várias capturas. A opção (c) muda medidas registradas em D-039.

**6. Teste de aceite:** na demonstração, todo formulário e detalhe mostra "Demonstração" no cabeçalho, em 390 e 320 px; numa conta real, nenhum; uma conta nova criada depois de sair da demonstração começa com R$ 0,00 e sem nenhum registro; a Família mostra o estado escolhido por Enzo.

Cobertura que já existe: web "conta nova começa vazia (sem dados fictícios)", "demonstração: recarregar volta às boas-vindas, sem 'Primeiros passos' gravado no aparelho", "primeiros passos: fora da conta de demonstração com dados", "I1 conta nova: a revisão não tem 'Já anotado' por semelhança (nada anotado ainda), e a memória do aparelho é de outra pessoa"; API "primeira conta é criada uma única vez, sem dados de exemplo"; banco `10_acesso.sql` (item 2) e `85_contas.sql` (item 59); core `retorno.test.ts` (bloco "demonstração").

Faltam: conferência do selo nos formulários da demonstração; conferência do contexto em Metas.

---

## CL-12 | Experiência de lançamento no celular (P1)

**1. Status:** parcial. A versão web está conferida em 390 e 320 px; o teclado do celular nunca foi testado em aparelho (pendência aberta em `docs/04`).

**2. O que o app faz hoje**

- Rodapé fixo com "Cancelar" e "Salvar gasto" (`apps/app/src/components/form-footer.tsx`), dentro de `KeyboardAvoidingView` com `behavior="padding"` só no iOS; no Android, depende do ajuste do sistema. A barra de abas some com o teclado aberto (`apps/app/src/components/tab-bar.tsx`).
- Valor: campo livre lido por `parseBRL` (D-015). Aceita "80", "80,5", "1.234,56", "R$ 80" e "12.50"; recusa "1,234", "-10" e "80,001". Teclado decimal.
- Sair com alterações pede "Descartar o preenchimento?" (voltar, gesto ou botão do sistema) em Anotar gasto, contas a pagar, pagamento, gastos fixos e nos demais formulários (`useLeaveGuard`); captura `09_descartar.png`.
- Envio duplicado: botão ocupado, segundo toque ignorado e a mesma chave (CL-03).
- "Como você pagou?": "Dinheiro, débito ou Pix" e "Cartão de crédito"; com cartão, o formulário troca "Saiu de" pela escolha do cartão. "Saiu de" vem sempre preenchido com a conta principal no gasto e no recebimento; no aporte e no resgate há "Sem conta" (é opcional).
- O roteiro web confere em 320 px: nenhuma rolagem lateral, nada fora da largura, nenhum valor em reais cortado, "R$" junto do valor, alvos de 44 px e avatar inteiro (109 capturas `*_320px.png`).

**3. Causa das lacunas**

- O roteiro web não abre teclado virtual; o item "Testar em celular (Expo Go) com teclado aberto e texto ampliado" (`docs/04`, linha 21) continua desmarcado.
- Risco a confirmar em aparelho: no Android com a tela de ponta a ponta, padrão no SDK 57, um `KeyboardAvoidingView` sem `behavior` pode não empurrar o rodapé, que ficaria atrás do teclado.
- Na web, recarregar ou fechar a aba com preenchimento não pede confirmação (só a navegação dentro do app pede).
- O roteiro web não tem teste de toque duplo.
- O formulário não diz quando "Saiu de" é obrigatório; a explicação está em Conta, "Suas contas".

**4. Proposta de solução**

- Teste em aparelho (um iPhone pequeno e um Android de 360 dp, com fonte ampliada), com o aceite abaixo. Se o rodapé ficar coberto no Android, ajustar o comportamento de teclado no Android conforme a documentação do SDK 57 (conferir antes de mudar).
- Na web, aviso do navegador ao fechar a aba com preenchimento.
- Teste de toque duplo no roteiro web.
- Opcional: legenda curta sob "Saiu de" quando há 2 ou mais contas ("Só informa de onde saiu. Não muda nenhum total.").

**5. Riscos e dependências:** o ajuste de teclado no Android afeta todos os formulários (26 arquivos usam `KeyboardAvoidingView`); exige aparelho real ou build de desenvolvimento.

**6. Teste de aceite:** em 360 × 640 e em 320 px de largura, com o teclado aberto no Valor e depois em "Saiu de", "Salvar gasto" e a mensagem de erro do campo ficam visíveis sem fechar o teclado; "12,50" e "1.234,56" salvam 1.250 e 123.456 centavos; voltar com preenchimento pede confirmação; dois toques rápidos criam um registro.

Cobertura que já existe: core `core.test.ts`, bloco "dinheiro"; web `layoutChecks` em 320 px e a captura do descarte.

Faltam: teclado virtual e fonte ampliada (aparelho); toque duplo e aviso ao fechar a aba (web).

---

## CL-13 | Navegação orientada por tarefa (P1)

**1. Status:** necessita decisão de negócio. A navegação foi revista e implementada (D-039); o teste com pessoas reais não foi feito.

**2. O que o app faz hoje:** quatro abas (Resumo, Movimentos, Metas e Aprender). "Anotar gasto" fica logo abaixo do cabeçalho do Resumo (D-039(1)). Movimentos tem Buscar, "Anotar gasto", "Registrar recebimento" e o bloco "Organizar" com 6 linhas (Contas a pagar, Gastos fixos e parcelamentos, Cartões, Orçamento por categoria, Importar extrato ou fatura e Calculadoras), os totais e a lista. A barra inferior aparece nas telas de consulta, com a aba de origem marcada (`packages/core/src/navigation.ts`). Contas a pagar tem seletor de mês próprio. A busca de Aprender acha 28 telas do app ("No app"). Medidas registradas: "Anotar gasto" a 2 toques; "Já paguei" a 3 toques (conta a vencer) e 4 (vencida). A análise de `docs/10_NAVEGACAO.md` usou pessoas fictícias e medidas da versão web.

**3. Causa:** nenhuma sessão com pessoas do público. Movimentos concentra 9 entradas por decisões anteriores (D-033, D-035(8), D-048(1)).

**4. Proposta de solução:** teste de usabilidade curto, com 5 pessoas, uma sessão de 20 minutos cada, sem instrução e na demonstração (nunca com dados reais), com as quatro tarefas do relatório ("anotar gasto", "marcar conta paga", "consultar fatura", "simular financiamento") e mais "importar um extrato", registrando acerto sem ajuda e número de toques. O resultado vira decisão em `docs/00` antes de mudar rótulos ou a ordem. **Decisão de Enzo:**

- (a) Fazer antes do piloto: atrasa alguns dias; os ajustes chegam antes das primeiras pessoas.
- (b) Fazer durante o piloto, com as primeiras pessoas: sem atraso; ajustes depois.
- (c) Não fazer agora: sem custo; o risco de rótulo confuso chega às pessoas.

Pendências já registradas e que dependem de Enzo: A16 ("Nova conta do ano" no topo) e a vencida em 4 toques (`docs/10`).

**5. Riscos e dependências:** recrutar pessoas; manter a privacidade usando só a demonstração.

**6. Teste de aceite:** 4 de 5 pessoas concluem cada tarefa sem ajuda; o retorno pela barra é previsível; o mês e o contexto ficam visíveis. Cobertura automática que já existe: `navigation.test.ts` (modos da barra); web, bloco da navegação (D-039: posição de "Anotar gasto" em 390 e 320 px, barra em cada tela de consulta, aba de origem). Faltam: o teste com pessoas (manual).

---

## CL-14 | Leitura de documentos e importação (P1)

**1. Status:** parcial. Implementado com revisão antes de gravar; o aceite com notas reais (P-025) e o teste em aparelho estão pendentes.

**2. O que o app faz hoje**

- Nota fiscal (D-038): câmera (QR da NFC-e e código de barras da NF-e), PDF do DANFE (até 10 MB e 3 páginas) e "Colar o link ou a chave", tudo lido no aparelho. Nada é gravado antes de "Salvar gasto". O bloco "Nota lida: Loja · RJ · data" mostra o que veio da nota; a descrição repetida de uma compra anterior leva a legenda "Como da última vez nesta loja"; o que falta é pedido ("O valor não vem no código desta nota. Digite o total impresso no cupom."). Sefaz-RJ: leitura automática só de NFC-e do RJ, no celular, com limite de 12 segundos; se falhar, "Não deu para ler a página da Sefaz. Confira o valor no cupom.", com o formulário mantido; outras UFs: link oficial e preenchimento manual; na web, o navegador bloqueia a leitura e fica só o link. Nota repetida: aviso antes de salvar e recusa no banco. Guarda só o resumo SHA-256 da chave, nunca CPF.
- Importar (D-048): OFX e CSV (até 5 MB e 5.000 linhas), lidos no aparelho; PDF, Excel e imagem recusados com mensagem. Destino escolhido antes da revisão (conta ou cartão). Revisão linha a linha, com caixas e as marcas "Já anotado", "Parece pagamento de fatura", "Parece transferência" e "Parece parcela". Gravação só por `import_records`. Não se liga ao banco nem guarda o arquivo; "O saldo que vem no arquivo é ignorado. O Clarevo não guarda saldo por conta."

**3. Causa:** o ambiente de trabalho não alcança a Sefaz, então os testes usam páginas e PDFs sintéticos (P-025). Câmera, permissão, lanterna, seletor de arquivos e a biblioteca de PDF nunca foram exercitados em aparelho (D-038(9)). "Foto ilegível" não se aplica do jeito descrito: a câmera lê código, não lê texto da foto; depois de 10 segundos aparece "Não achou o código? Use a lanterna ou cole a chave."

**4. Proposta de solução:** executar P-025 (Enzo envia de 5 a 10 cupons do RJ e 2 ou 3 DANFEs de compras online); teste em aparelho. Na revisão da importação, só marcar a categoria como "sugerida" se o teste de usabilidade mostrar confusão. Nenhuma função nova.

**5. Riscos e dependências:** mudança no layout da página da Sefaz quebra a leitura automática (o caminho manual continua); notas de outros estados dependem da lista de domínios oficiais.

**6. Teste de aceite:** com 5 cupons reais, loja, valor, data e forma de pagamento conferem com o impresso; ler a mesma nota duas vezes mostra "Esta nota já foi anotada em ..."; com a Sefaz fora do ar, a mensagem aparece e o formulário fica; importar o mesmo arquivo duas vezes não cria nada.

Cobertura que já existe: core `nota.test.ts`, `nota-flow.test.ts`, `nota-pagamento.test.ts`, `danfe.test.ts`, `sefaz-page.test.ts`, `sha256.test.ts`, `importar-leitores.test.ts`, `importar-revisao.test.ts` e `importar-repo.test.ts`; banco `70_cartoes.sql` (item 51) e `90_importar.sql`; API "nota fiscal: só o resumo da chave chega ao banco; nota repetida é achada antes de salvar" e o bloco "API real: importar extrato e fatura (Ciclo I1, D-048)"; web, blocos das notas e "Importar extrato (D-048)".

Faltam: notas reais e aparelho.

---

## CL-15 | Calculadoras: hipóteses e critérios verificáveis (P1)

**1. Status:** já implementado.

**2. O que o app faz hoje:** 10 calculadoras (D-035, D-040, D-044), com as contas no core em centavos inteiros e arredondamento metade para cima só no fim. A taxa é sempre digitada pela pessoa; nenhuma vem preenchida. Hipóteses visíveis logo abaixo do resultado. Avisos fixos: "Simulação com os valores e as taxas que você informou. Não é recomendação de produto financeiro nem oferta de crédito."; em Antes de financiar, "Estimativa. As condições oficiais são as da proposta; peça o CET." e "Só a taxa de juros informada, sem tarifas, seguros e IOF."; escolha "A primeira parcela vence em 1 mês?"; o plano de dívidas diz que não considera atrasos nem novas compras. Nada é gravado.

**3. Causa:** sem falha. Limites declarados nas próprias telas: sem CET calculado, IOF, SAC, atrasos no plano de dívidas e taxas que mudam.

**4. Proposta de solução:** só documentação: uma tabela "premissas por calculadora" (taxa e unidade, primeira parcela, arredondamento, o que fica de fora), copiada das hipóteses do core, em `docs/02` ou `docs/08`, para revisão externa.

**5. Riscos e dependências:** nenhum no código.

**6. Teste de aceite e cobertura que já existe:** juros zero ("taxa zero: parcela é o valor financiado dividido pelas parcelas, a última absorve o arredondamento e nunca há juros"); zero parcelas e parcelas negativas (`calc-inputs.test.ts`, "parseCount: inteiro na faixa, com milhar opcional"); taxa negativa ("parsePercentBp: vazio, invalido, casas_demais e fora_da_faixa", com "-2" recusado); entrada acima do preço ("entrada: acima do preço, formato e limite") e igual ao preço ("entrada igual ao preço: não há o que financiar"); dívidas de taxas diferentes e desempate (`calc-plano-dividas.test.ts`); dias depois do vencimento (`calc-multa-e-juros.test.ts`); vencimentos irregulares ("com os vencimentos da série: t = dias ÷ 30...", `calc-quitar-antes.test.ts`); 220 casos de Price e 220 de poupança conferidos por uma implementação independente em Python; palavras vetadas e ordens simétricas, sem recomendar caminho. Faltam: nada obrigatório.

---

## CL-16 | Segurança e transparência para quem usa e para a empresa (P1)

**1. Status:** parcial; **necessita decisão de negócio e revisão jurídica**.

**2. O que o app diz hoje, comparado com as permissões reais**

| Texto da tela | Onde | Situação real |
|---|---|---|
| "{Nome} (você): Única pessoa que vê, anota, edita e exclui registros em Pessoal." | Quem vê estes dados? (Pessoal) | Verdadeiro para quem usa o app e para a empresa (RLS e funções; sonda de CL-04). Não fala de quem opera o banco: quem administra o projeto no Supabase acessa tudo pelo painel, sem RLS, e o fornecedor (Supabase) hospeda os dados. |
| "Se uma empresa oferecer o Clarevo como benefício, ela administra seu acesso ao plano. Seus registros financeiros têm permissões próprias e não ficam visíveis para a empresa." | Quem vê | Verdadeiro (D-006; `10_acesso.sql`, item 7). Do benefício, a empresa vê o e-mail convidado, a situação e as datas de ativação e fim da licença; a tela não diz isso de forma explícita. |
| Gastos fixos, contas do ano, renda, metas, simulações, revisão e plano de guardar "só seus" | Quem vê | Verdadeiro. Cartões, faturas, notas, orçamento, contas de origem, assinaturas e importações não são citados um a um, mas entram em "registros financeiros", e `docs/03` confirma. |
| "Nenhuma família vinculada. Quando houver, esta tela mostrará o nome e as permissões de cada pessoa." | Quem vê (Família) | Verdadeiro: não há convites. |
| "Seus registros ficam protegidos por permissões no servidor: só você vê o contexto Pessoal." | Conta, Segurança | Mesma ressalva sobre quem opera o banco. |
| "A empresa que oferece o benefício vê meus gastos?": "Não. ... O banco de dados nega a leitura a quem administra o benefício, e isso é testado." | Aprender, dúvidas | Verdadeiro. |
| "Ao abrir o app, o aparelho pede a biometria ou, se ela falhar, a senha do aparelho. Sair da conta nunca depende dela." | Conta, Privacidade neste aparelho | Não promete segurança absoluta. "Ocultar valores" é descrito como algo deste aparelho. A separação entre controle de acesso (servidor), ocultar valores (tela) e biometria (aparelho) aparece nos títulos dos cards, mas não numa frase. |

**O que não está documentado**

- Acesso da equipe do Clarevo e suporte: não existe papel de suporte; o "Registro auditável de acesso interno (equipe Clarevo)" está pendente em `docs/03`.
- Retenção: a do rastro técnico de exclusões está pendente (P-010); não há política de privacidade nem termos no repositório; o canal de pedidos de titular (P-023) depende do domínio; o tema "Como apagar meus dados?" está em rascunho.
- Exclusão de conta: não existe, e o "Delete user" do painel falha (CL-04).
- Logs: o app não grava logs (nenhum `console.*` no código; teste de API "códigos de erro: ... nada é registrado em log"). No servidor, a busca e a exportação vão ao PostgREST por GET, com o padrão do texto buscado e as faixas de valor no endereço. Os logs de API do Supabase costumam guardar o endereço de cada requisição: **não verificado aqui**; precisa ser conferido no painel, junto com o prazo de retenção do plano.
- Aparelho: o que fica guardado depois de "Sair deste aparelho": a memória de categorias da importação (até 300 descrições, chave `clarevo.aparelho.v1.<pessoa>`), "Como da última vez nesta loja" (até 50 lojas, `clarevo.notas.v1.<pessoa>`) e as preferências. Na web, isso fica no armazenamento do navegador. "Sair" limpa só a memória do app. Em computador compartilhado, as descrições continuam no navegador (outra conta não as vê, porque a chave é por pessoa).
- Sessões: "Encerrar sessão em todos os aparelhos" usa o encerramento global do Supabase; o efeito sobre tokens já emitidos, que valem até expirar, **não foi testado aqui**. A revogação de vínculo na Família é testada no banco (`docs/03`, item 9).

**3. Causa:** decisões pendentes (P-010, P-023 e P-006) e ausência de política de privacidade.

**4. Proposta de solução**

- Acesso da equipe, **decisão de Enzo com o jurídico**:
  - (a) Dizer agora o que vale hoje (por exemplo, "A equipe que mantém o servidor pode acessar o banco só para manutenção", com a regra de uso escrita antes). Transparente; exige a regra pronta.
  - (b) Criar antes o processo (acesso interno registrado, suporte sem leitura de valores) e só depois o texto. Mais forte; custo médio a grande.
  - (c) Manter a tela e tratar o assunto na política de privacidade. Menor custo; "só você" pode ser lido como absoluto.
- Em "Quem vê estes dados?", uma linha sobre o benefício: "A empresa vê só se o convite foi aceito e até quando vale o acesso." (confere com a tabela `licenses`).
- Uma frase que separa os três controles: "Quem vê é decidido pelas permissões no servidor. Ocultar valores e biometria só protegem a tela deste aparelho."
- Memórias do aparelho ao sair, **decisão de Enzo**: (a) apagar sempre ao sair (perde a memória das categorias); (b) perguntar ao sair; (c) manter e dizer no texto de Conta.
- Retenção e exclusão: um documento único (o que é guardado, onde, por quanto tempo, quem acessa e como pedir a exclusão) para revisão jurídica, mais o script de exclusão testado (CL-04).
- Conferir no painel do Supabase o que os logs da API guardam e por quanto tempo, e registrar em `docs/05`.

**5. Riscos e dependências:** texto de privacidade é compromisso; nenhum texto novo deve ir ao ar antes do jurídico. Mudanças passam pelo `copy.test.ts` e pelas capturas.

**6. Teste de aceite:** a matriz "quem vê o quê" de `docs/03` coincide com cada frase da tela (revisão lado a lado); revogar um membro bloqueia a leitura na hora (já testado); "Encerrar sessão em todos os aparelhos" faz o outro aparelho voltar à entrada (teste manual no Supabase real); documento de retenção revisado. Cobertura que já existe: `10_acesso.sql` (RH, revogação), textos em `learn-catalog.test.ts` e `copy.test.ts`. Faltam: sessão global no Supabase real, procedimento de exclusão e conferência dos logs.

---

## CL-17 | Aprender integrado ao momento de decisão (P2)

**1. Status:** já implementado.

**2. O que o app faz hoje:** D-031 e D-032. O catálogo tem 42 temas (40 publicados e 2 rascunhos). Cada tema tem fonte, "Consultada em" e "Revisado em"; o exemplo fictício tem "Ver a conta" e "Hipóteses do exemplo"; "Fazer a conta com os seus números" abre a calculadora sem a taxa e sem gravar nada; leitura e busca não são registradas; "O que é isso?" leva ao tema e "Voltar à tarefa" mantém o preenchimento.

**3. Causa:** nenhuma falha encontrada.

**4. Proposta de solução:** nada obrigatório. Manter o calendário de revisão (o teste avisa 30 dias antes) e publicar "Como apagar meus dados?" quando o canal de P-023 existir.

**5. Riscos e dependências:** temas com números que mudam (Selic, IOF, teto do cheque especial) envelhecem; o aviso de revisão cobre.

**6. Teste de aceite e cobertura que já existe:** `learn-catalog.test.ts` ("R1 a R7, R9 e R12: validateLearnCatalog sem problemas...", "R7: conjunto esperado calculado por learn/math.ts mais os fatos do tema", "'Fazer a conta com os seus números': calculadora de cada tema..."), `learn-math.test.ts`, `learn-links.test.ts` ("todo explanationHref ... aponta para tema publicado"), `learn-entries.test.ts`, `learn-search.test.ts` e `copy.test.ts`; web "nav Aprender: a busca não registra nada (nenhuma requisição nem gravação, nada no aparelho)". Faltam: leitor de tela em aparelho (CL-18).

---

## CL-18 | Acessibilidade e legibilidade (P2)

**1. Status:** parcial.

**2. O que o app faz hoje:** no roteiro web, de forma automática: `layoutChecks` em 390 e 320 px (sem rolagem lateral, nada fora da tela, valores não cortados, alvos de pelo menos 44 px); `headerChecks` (título inteiro e pílula visível); foco visível de 3 px no teclado físico ("teclado: caixa e botão da linha com foco visível de 3 px; Espaço marca a caixa"); regiões vivas educadas nos resultados e nas buscas; nomes acessíveis conferidos pela árvore de acessibilidade do Chromium (inclusive "2026 a 2027"). Barras de progresso de metas e parcelamentos têm valor em texto (`accessibilityValue`). Movimento reduzido é respeitado. Contrastes anotados à mão em `apps/app/src/theme/tokens.ts`; recalculados nesta avaliação: texto sobre lima 12,4:1; branco sobre azul 5,6:1; texto secundário sobre o fundo 6,7:1; texto de exemplo nos campos 4,7:1 sobre branco (4,4:1 sobre o fundo #F6F8FC, se usado ali); contorno de campos 3,5:1.

**3. Causa:** não há auditoria automática de contraste nem teste de texto ampliado; leitor de tela (VoiceOver e TalkBack) e fonte ampliada no celular estão pendentes em `docs/04`.

**4. Proposta de solução:** acrescentar ao roteiro web uma auditoria automática de acessibilidade nas telas principais (ferramenta só de teste, sem mudar o app) e uma passada com texto em 200% na web; roteiro manual em aparelho (VoiceOver, TalkBack e fonte máxima) para Resumo, Anotar gasto, Contas a pagar e uma calculadora; um mapa curto da WCAG 2.2 AA com o que já é conferido.

**5. Riscos e dependências:** texto ampliado pode apertar a barra inferior (rótulo em uma linha, com limite de ampliação).

**6. Teste de aceite:** nenhuma violação séria na auditoria; com texto em 200%, nenhum valor ou botão cortado em 320 px; o leitor de tela anuncia "Gasto salvo" e o erro do campo. Cobertura que já existe: `scripts/e2e-web.js` (`layoutChecks`, `headerChecks`, nomes acessíveis, regiões vivas) e `privacy-app.test.ts` ("valor oculto" para o leitor de tela). Faltam: contraste automático, texto ampliado e aparelho.

---

## CL-19 | Estados vazios, erros e recuperação (P2)

**1. Status:** parcial.

**2. O que o app faz hoje:** estados vazio, carregando (esqueleto) e erro com "Tentar novamente" (`apps/app/src/components/states.tsx`); estados vazios com ação (D-035(9)); "Salvando…" no botão; "Gasto salvo" só depois da confirmação do servidor; erro ao salvar mantém o preenchimento. A revisão dos últimos meses não culpa: palavras vetadas, sem contar dias, sem vermelho (D-030(7)); "Seguir adiante" não obriga a completar o passado. Consultas têm uma repetição automática; escritas, nenhuma.

**3. Causa da lacuna:** a mesma de CL-03: resultado incerto aparece como "Não foi possível salvar", e a tentativa pendente se perde ao sair do formulário. Não há aviso de "sem conexão" antes de tentar, o que não é obrigatório.

**4. Proposta de solução:** os dois textos propostos em CL-03; nada mais.

**5. Riscos e dependências:** baixos.

**6. Teste de aceite:** com a rede caindo depois da gravação, a tela diz que vai conferir, e salvar de novo não duplica; mês sem registros mostra estado vazio, não erro. Cobertura que já existe: `retorno.test.ts` ("RETURN_TEXT e os textos calculados: sem termos proibidos, sem cobrança, sem contar dias"), `copy.test.ts`; web, cenário `?cenario=retorno` e as faixas de resultado incerto ("resultado incerto ao tirar as parcelas do ano: conferido na hora, a tela fecha com a faixa de sucesso"). Faltam: resultado incerto seguido de saída do formulário.

---

## CL-20 | Instrumentação técnica e regressão (P2)

**1. Status:** parcial; o monitoramento em produção **necessita decisão de negócio**.

**2. O que o app faz hoje:** 1.352 testes do core (52 arquivos), 181 testes de API, 14 arquivos de banco (cerca de 3.800 conferências) e o roteiro web com 1.397 chamadas `ok(...)` no código (3.588 verificações na última execução registrada). Os testes cobrem autorização, cálculo, recorrências, estornos, importação, versões e navegação. Decisões numeradas em `docs/00` e migrações numeradas; cada migração nova não muda as funções antigas, e a compatibilidade com o app publicado é registrada em `docs/07`.

**3. Lacunas:** não há integração contínua (nenhum `.github/workflows`), então os testes só rodam quando alguém os executa; não há monitoramento de falhas no app nem no servidor; não há plano de reversão escrito (a Cloudflare guarda implantações anteriores e as migrações só avançam); não há versão das regras de cálculo à vista; não há tabela de rastreabilidade entre risco e teste.

**4. Proposta de solução**

- Integração contínua no GitHub com `npm test`, `npm run typecheck`, `npm run test:db` e `npm run test:api` em cada envio (Postgres e PostgREST no job).
- Seção "Como voltar atrás" em `docs/07`: reverter a implantação na Cloudflare; migrações só aditivas; o que fazer se uma migração falhar no meio.
- Tabela de rastreabilidade em `docs/04`: cada CL e cada T com o teste que o cobre (esta parte 2 já serve de base).
- Versão das regras: identificar cada publicação pelo commit e pela última migração aplicada (já anotada em `docs/07`) e citá-la nas notas de versão.
- Monitoramento, **decisão de Enzo**:
  - (a) Nenhum até o piloto: nenhum risco de privacidade; falhas só por relato.
  - (b) Monitor de erros só com código do erro, tela e versão, sem valores, descrições, e-mails nem ids: pacote novo e revisão de privacidade.
  - (c) Só os logs do Supabase, com retenção documentada: sem pacote novo; não enxerga falhas que acontecem no aparelho.
- Onboarding e retenção: hoje nada é coletado, e a atividade não pode ir à empresa nem somada (D-030(9)). Qualquer métrica agregada depende de decisão e da política de privacidade.

**5. Riscos e dependências:** a integração contínua precisa do binário do PostgREST; um monitor mal configurado pode levar dados pessoais.

**6. Teste de aceite:** um envio com teste quebrado fica vermelho no GitHub; `docs/07` tem o passo a passo de reversão; a tabela de rastreabilidade aponta o teste de cada caso de T01 a T15.

---

## Casos da matriz de testes (seção 4 do relatório)

**T07, Receita confirmada mais de uma vez:** já implementado. O Clarevo não tem "receita a confirmar": só existem recebimentos realizados (D-011), e receita recorrente está fora (D-030). "Confirmar duas vezes" equivale a salvar duas vezes: a mesma chave gera um recebimento só (banco `20_registros.sql`, bloco "Idempotência"; API "repetir a operação devolve o mesmo registro; mesma chave com outro conteúdo é recusada"; core "timeout depois de gravar + nova tentativa com a mesma chave: um único registro"; sonda de concorrência desta avaliação). Duas anotações em momentos diferentes geram dois registros, por desenho (aviso opcional em CL-03). Faltam: toque duplo no roteiro web e o caso de saída do formulário depois de resultado incerto.

**T08, Reimportar o mesmo arquivo:** já implementado para OFX e CSV. PDF de extrato não é aceito (D-048); para PDF de nota fiscal, a repetição é barrada por `nota_ja_anotada`. Duplicatas aparecem antes de gravar ("Já anotado", sem caixa) e o banco pula chaves repetidas. Testes: `90_importar.sql`; API "chaves já importadas viram 'puladas'..." e "a resposta se perde: a importação foi gravada..."; core `importar-revisao.test.ts`; web "I1 o mesmo arquivo de novo...". Lacuna conhecida e aceitável: o mesmo período importado de outro formato (OFX e depois CSV) gera chaves diferentes; nesse caso as linhas vêm "Já anotado" por semelhança, desmarcadas, mas a pessoa pode marcá-las.

**T12, Acesso indevido pela API:** já implementado; detalhes, testes e lacunas em CL-04.

**T13, Demonstração, Pessoal e Família:** parcial; isolamento confirmado, identificação da demonstração nos formulários ausente; ver CL-11.

**T14, Teclado no celular:** não reproduzido na web (o roteiro não abre teclado virtual); precisa de aparelho; ver CL-12.

**T15, Meses sem atividade:** já implementado (D-030). Depois de uma ausência longa, o Resumo mostra a faixa "Seus últimos meses"; o app nunca preenche valor por média ou estimativa nem marca conta como paga sem confirmação, e como não há receita recorrente, nenhum recebimento é espelhado. Cada mês tem "Anotar recebimentos" sem valor sugerido, e "Seguir adiante" não cria nem apaga nada. Testes: `47_retorno.sql`; `retorno.test.ts` (sequências R e R7); API "Seus últimos meses (Ciclo A4, D-030)"; web, cenário `?cenario=retorno`. Falta: teste manual em aparelho com leitor de tela (`docs/04`).

---

## Quadro resumo

| Item | Status | Prioridade sugerida | Precisa decisão? | Esforço |
|---|---|---|---|---|
| CL-03 | Texto e tentativa guardada feitos em 15/10/2026 (D-050); aviso de repetido segue opcional | P1 | Opcional (aviso de repetido) | P |
| CL-04 | parcial (isolamento comprovado; exclusão e retenção ausentes) | P0 (exclusão e retenção antes de pessoas reais); P1 (teste de matriz) | Sim (jurídico) | M |
| CL-11 | Selo nos formulários e contexto em Metas feitos em 15/10/2026 (D-050); Família pendente | P1 | Sim (Família) | P |
| CL-12 | parcial (falta aparelho) | P1 | Não | M |
| CL-13 | necessita decisão (teste com pessoas) | P1 | Sim | M |
| CL-14 | parcial (notas reais e aparelho) | P1 | Insumo de Enzo (P-025) | M |
| CL-15 | já implementado | P2 | Não | P |
| CL-16 | parcial; necessita decisão | P1 | Sim (jurídico) | M |
| CL-17 | já implementado | P2 | Não | P |
| CL-18 | parcial | P2 | Não | M |
| CL-19 | Texto do resultado incerto feito em 15/10/2026 (D-050) | P1 (texto do resultado incerto) | Não | P |
| CL-20 | Testes de regressão e "Como voltar atrás" feitos em 15/10/2026 (D-050); integração contínua e monitoramento pendentes | P2 | Sim (monitoramento) | M |
| T07 | já implementado | P2 (teste de toque duplo) | Não | P |
| T08 | já implementado | P2 | Não | P |
| T12 | já implementado | P1 (teste de matriz) | Não | P |
| T13 | parcial | P1 | Sim (Família) | P |
| T14 | não reproduzido (precisa aparelho) | P1 | Não | M |
| T15 | já implementado | P2 (aparelho) | Não | P |
