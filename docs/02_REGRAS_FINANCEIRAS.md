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
| Duplicidade | Chave por operação; repetir devolve o mesmo resultado; mesma chave com outro conteúdo é recusada. Registros e contas a pagar usam o mesmo espaço de chaves: a mesma chave em outra ação também é recusada. Nas funções de contas a pagar, o conteúdo é comparado pelos argumentos codificados em JSON (texto escapado, nulo diferente de vazio, data em ISO): uma barra vertical ("\|") na descrição ou na categoria não faz pedidos diferentes parecerem repetição. As funções de gastos fixos e parcelamentos usam o mesmo formato e o mesmo espaço de chaves; a repetição devolve o estado atual da série, sem gravar de novo | core, banco, API |
| Falha de rede incerta | Antes de repetir, o app consulta se alguma tentativa anterior foi gravada; se foi e o preenchimento mudou, aplica a mudança como edição do mesmo registro. Em conta a pagar e pagamento vale o mesmo: nunca cria uma segunda conta a pagar nem um segundo pagamento. Em gasto fixo também: nunca cria uma segunda série | core, banco, API (só gasto fixo, com a resposta perdida depois da gravação; as telas ainda sem teste automatizado de queda de rede) |
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
| Versão ausente | Editar, excluir, pagar ou desfazer sem informar a versão é recusado como versão desatualizada, em registros, em contas a pagar e em gastos fixos (antes, editar ou excluir registro sem versão passava sem conferir conflito) | core, banco, API |
| Gasto fixo | Série mensal cadastrada uma vez (D-024): descrição e categoria opcional (mesmas regras do registro), valor fixo ou "valor que muda" (referência estimada), dia do vencimento de 1 a 31, primeiro mês e término opcional (último mês do primeiro até 599 meses depois). O primeiro mês fica entre o mês anterior e 12 meses depois do atual. Cada mês vira uma conta a pagar comum (ocorrência), identificada como "Todo mês", que segue todas as regras de conta a pagar acima. No máximo 100 gastos fixos e parcelamentos ativos por contexto (não excluídos, sem término ou com a última conta a partir do mês anterior a hoje) | core, banco, API |
| Parcelamento | Série de 2 a 480 parcelas, com tipo: financiamento ou empréstimo, compra parcelada (boleto ou crediário) ou outro parcelamento (imposto, taxa, matrícula, consórcio). A pessoa informa a próxima parcela a pagar (de 1 ao total) e o mês dela; as anteriores aparecem como "pagas antes do Clarevo (informado por você)" e não viram gastos. Rótulos "Parcela 13 de 48", "Faltam 36" e a última data. Faltam = números da próxima à última sem conta paga, sem exclusão "só esta" e sem os meses passados sem conta registrada. A soma das que faltam usa o previsto das contas criadas e a vigência das ainda não criadas, avisa quando é aproximada (alguma estimada), nunca é chamada de saldo devedor e vem com "Não é o valor para quitar." O tipo é da série inteira e é lido pela junção: trocá-lo vale para todos os meses, inclusive os pagos, e não muda nenhuma conta a pagar | core, banco, API |
| Vencimento de cada mês | Dia escolhido no mês da ocorrência, limitado ao último dia do mês e calculado sempre a partir do dia escolhido, nunca da ocorrência anterior: dia 31 desde janeiro de 2027 vence em 31/01, 28/02, 31/03 e 30/04; em fevereiro de 2028, em 29/02. Sem ajuste para fim de semana ou feriado (P-014). O vencimento de uma ocorrência fica sempre no mês dela: editar só esta conta com vencimento em outro mês é recusado (`vencimento_fora_do_mes`), e o banco confere a regra no fim de cada transação | core, banco, API |
| Geração das contas do mês | O banco cria as ocorrências com vencimento do 1º dia do mês anterior a hoje até o fim do mês seguinte, no fuso de quem criou a série, com no máximo uma viva por série e número. Gerar de novo não cria nada. Vencimentos mais antigos nunca são criados: depois de uma ausência longa, aparecem no detalhe da série como "sem conta registrada" (com hoje em 15/03/2027, janeiro de 2027 fica sem conta). A geração roda dentro de cada gravação de série e quando o app carrega as contas a pagar (uma vez por dia e contexto, `sync_series_occurrences`, que exige só leitura). A conta criada tem a autoria de quem criou a série, e nada é gerado se essa pessoa perdeu a escrita no contexto. Contas além do mês seguinte são só previsão e não entram em nenhum total | core, banco, API |
| Valor estimado | Num gasto fixo de valor que muda (luz, água), cada conta criada recebe o valor de referência informado e fica marcada "estimado" até a pessoa informar o valor da conta, o que tira a marca mesmo com o valor igual e deixa a conta alterada só naquele mês. A marca vem só da vigência da série: editar uma conta pode tirá-la, nunca pô-la (`estimativa_invalida`). Nenhuma conta criada é reestimada sozinha. Ao pagar conta estimada, o valor não vem preenchido. Quando há estimados no total, "Ainda a pagar" mostra, por exemplo, "Inclui R$ 180,00 em valores estimados." Sugestão de nova referência: média, com metade para cima, dos valores pagos das até 3 contas pagas de maior número (R$ 165,30, R$ 180,00 e R$ 171,90 dão R$ 172,40), aplicada só com toque, como "esta e as próximas" | core, banco, API |
| Só esta conta e esta e as próximas | "Só esta conta" edita a ocorrência como qualquer conta a pagar, mantém o vencimento no mês dela e a marca como alterada só naquele mês; excluir só esta conta tira o mês para sempre (a geração não a recria). "Esta e as próximas" a partir da conta k cria uma vigência nova em k e substitui as posteriores; k pode ser um mês ainda sem conta (reajuste programado), até o término ou, sem término, até 12 meses depois do mês atual. Mudam a conta k, sempre (e ela deixa de ser alterada só no mês), e as contas em aberto seguintes que não foram alteradas só no mês: descrição, categoria, valor, marca de estimado e vencimento, cada uma com versão +1. Pagas, outras alteradas só no mês e anteriores a k nunca mudam. A pessoa confirma a lista do que muda e do que não muda; o banco recusa como versão desatualizada se a série mudou ou se o conjunto confirmado (identificador e versão de cada conta) não é mais o atual, e recusa começar numa conta paga (`inicio_em_conta_paga`) | core, banco, API |
| Encerrar, retomar e excluir série | Encerrar define a última conta (ou nenhuma); as em aberto depois dela são excluídas e as pagas continuam no histórico. É recusado quando há conta paga depois (`serie_tem_pagamento_posterior`), conferida só depois de travar essas contas, para um pagamento em andamento terminar antes. Retomar (última conta maior ou "sem data para terminar"; parcelamento até a última parcela) recria, dentro da janela de geração, as contas removidas pelo encerramento, com a vigência atual; a marca de alterada só no mês não volta. Excluir o gasto fixo só é possível sem conta paga (`serie_tem_pagamentos`; para parar a repetição, encerrar) e exclui também as contas em aberto. Encerrar e excluir conferem o conjunto de contas confirmado, como "esta e as próximas" | core, banco, API |
| Contar duas vezes no cadastro | Ao cadastrar um gasto fixo, o app avisa quando já existe, no primeiro mês, um gasto anotado ou uma conta a pagar avulsa com a mesma descrição (sem diferenciar maiúsculas e minúsculas nem espaços nas pontas) e oferece começar no mês seguinte, e quando já existe gasto fixo parecido que ainda tem contas a partir desse mês | core |

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

## Sequência de aceite de gastos fixos (reproduzida no core, no banco e na API)

Conta nova, contexto Pessoal, hoje = 07/10/2026. Na API, a sequência roda sobre um contexto que já tem R$ 650,00 em contas avulsas de outubro: o "Ainda a pagar" de outubro conferido é essa base mais os valores abaixo, e os de novembro e dezembro são os da tabela.

| Passo | Resultado | Ainda a pagar (out.) | Pago (out.) | Previsto para novembro |
|---|---|---:|---:|---:|
| 1. Gasto fixo "Escola", R$ 1.200,00, dia 10, de outubro a dezembro de 2026 | Escola 10/10 (conta 1) e 10/11 (conta 2) | R$ 1.200,00 | R$ 0,00 | R$ 1.200,00 |
| 2. Gerar de novo | Nada novo | R$ 1.200,00 | R$ 0,00 | R$ 1.200,00 |
| 3. Parcelamento "Financiamento do carro", financiamento, 48 parcelas, próxima 14 em outubro, R$ 980,00, dia 20 | Parcelas 14 (20/10) e 15 (20/11); a 48 vence em 20/08/2029 | R$ 2.180,00 | R$ 0,00 | R$ 2.180,00 |
| 4. Gasto fixo "Luz", valor que muda, referência R$ 210,00, dia 12, desde outubro | Luz 12/10 e 12/11, estimadas | R$ 2.390,00 (inclui R$ 210,00 estimados) | R$ 0,00 | R$ 2.390,00 (inclui R$ 210,00 estimados) |
| 5. Pagar a Luz de outubro: R$ 232,40 em 07/10 | Um gasto de R$ 232,40; a Luz de novembro continua R$ 210,00 estimada | R$ 2.180,00 | R$ 232,40 | R$ 2.390,00 |
| 6. Repetir o pagamento (mesma chave) | Nada muda | R$ 2.180,00 | R$ 232,40 | R$ 2.390,00 |
| 7. "Informar o valor da conta" na Luz de novembro: R$ 210,00 | Deixa de ser estimada (valor igual ao estimado) e fica alterada só neste mês | R$ 2.180,00 | R$ 232,40 | R$ 2.390,00 (nenhum estimado) |
| 8. Excluir só a Escola de novembro | Novembro pulado | R$ 2.180,00 | R$ 232,40 | R$ 1.190,00 |
| 9. "Esta e as próximas" no carro a partir da parcela 15: R$ 1.010,00 | Parcela 15 com R$ 1.010,00 (versão +1); a 14 continua com R$ 980,00 | R$ 2.180,00 | R$ 232,40 | R$ 1.220,00 |
| 10. "Só esta conta" na Escola de outubro com vencimento 05/11 | Recusado: `vencimento_fora_do_mes` | R$ 2.180,00 | R$ 232,40 | R$ 1.220,00 |

Com hoje = 02/11/2026:

- **11. Gerar.** Entram a Escola de 10/12 (conta 3, a última), a parcela 16 do carro em 20/12 (R$ 1.010,00, pela vigência nova) e a Luz de 12/12 (R$ 210,00, estimada). A Escola de novembro **não** volta. Previsto para dezembro: R$ 2.420,00.
- **12. Encerrar a Luz com "nenhuma conta":** recusado, `serie_tem_pagamento_posterior` (outubro está paga).
- **13. Encerrar a Luz com última conta em outubro:** as Luzes de novembro e dezembro saem; a de outubro, paga, continua.
- **14. Retomar a Luz ("Sem data para terminar"):** a geração recria novembro e dezembro, estimadas em R$ 210,00 (a marca de alterada só neste mês, de novembro, não volta, porque a conta foi removida pelo encerramento).

Com hoje = 15/03/2027 (ausência longa):

- **15. Gerar.** Carro: fevereiro (parcela 18), março (19) e abril (20); janeiro (17) **não** é criado e aparece como "sem conta registrada". Luz: fevereiro, março e abril. Seis contas criadas, três delas já vencidas (Luz de 12/02, carro de 20/02 e Luz de 12/03).

Em todos os passos, o banco confere o vínculo entre conta paga e gasto e as invariantes da série (S1 a S8 da migração `20261008000001_gastos_fixos.sql`). Para os passos 11 a 15, o "hoje" muda pela opção do repositório em memória no core, por `clarevo.today` no banco e, na API, por um cabeçalho que só o banco descartável de `run_api.sh` aceita.

**Demonstração** (hoje = 07/10/2026, tudo gravado pelas funções do repositório): Salário de R$ 6.000,00 em 01/09 e 01/10 (categoria Salário); Aluguel de R$ 2.500,00 e Mercado de R$ 1.250,00 em setembro e Mercado de R$ 1.400,00 em 06/10, anotados; gasto fixo "Aluguel" de R$ 2.500,00, dia 5, desde outubro, com a conta de 05/10 paga em 05/10 (é o gasto de Aluguel de outubro) e a de 05/11 em aberto; gasto fixo "Luz" de valor que muda, referência R$ 180,00, dia 12, desde novembro; parcelamento "Financiamento do carro", 48 parcelas de R$ 850,00, próxima 13 em 10/11/2026 (faltam 36, soma R$ 30.600,00, última em 10/10/2029); Internet, Condomínio e Seguro do carro continuam avulsas. Outubro continua com Recebido R$ 6.000,00, Pago R$ 3.900,00, Diferença R$ 2.100,00 e R$ 650,00 a pagar, e a sequência de contas a pagar acima vale sem mudança. "Próximos meses": Aluguel 05/11, Financiamento do carro 10/11 ("Parcela 13 de 48"), Seguro do carro 10/11 e Luz 12/11 (estimada).

## Ainda não implementado (ciclos seguintes, exigem definição antes)

- Contas a pagar: lembretes (Ciclo A2, P-011), pagamento parcial, juros e multa em registro próprio, código de boleto e Pix (P-013), ajuste do vencimento para dia útil (P-014).
- Gastos fixos: contas anuais e outras periodicidades, valor diferente por parcela definido de antemão, juros e saldo devedor calculados, pagar várias parcelas numa só conta, mudar o total de parcelas, pausar série, interface na Família.
- Renda comprometida (Ciclo B).
- Contas a receber previstas.
- Cartão de crédito e fatura: parcelas, pagamento parcial, juros, estorno.
- Transferência entre contas próprias e empréstimos.
- Receita fixa, variável e pontual com revisão mensal.
- Saldo inicial informado como evento próprio (não é renda).
- Metas, reservas e aportes (Ciclo C); simulador (Ciclo D).
