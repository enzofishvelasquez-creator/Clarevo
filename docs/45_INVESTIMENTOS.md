# Investimentos (D-093)

Decisão de 11/11/2026 (D-093, item 2). Pedido do Enzo: "Encontrar soluções para investidores. Pessoas que investem, e que querem controlar,
investimentos, ganhos, rentabilidades, aportes. E etc. Como podemos fazer isso?". Respostas dele nas perguntas do mesmo dia: acompanhamento
**manual + CDI e IPCA**, numa **aba nova**, **antes do lançamento**, **só no Pessoal**.

## 1. O que é

A aba **Investir** (a quarta da barra, entre Metas e Aprender; o título da tela é "Investimentos") acompanha o que a pessoa **já investe**.
Ela registra o que colocou (aporte), o que tirou (resgate), o rendimento que recebeu na conta e o valor que aparece no extrato. A Clarevo
calcula o aportado, o valor de hoje, o ganho ou a perda, a rentabilidade de cada mês e compara com o CDI e o IPCA do mesmo período.

Fica de fora, de propósito:

- **Recomendação de investimento** e qualquer nome de produto, banco ou corretora (regra de textos de sempre). A tela diz: "Não é
  recomendação de investimento, e o que rendeu no passado não garante o futuro" e "A Clarevo não guarda, não movimenta nem indica
  investimentos".
- **Cotação automática** de ações, fundos ou títulos e **conexão com corretora** (exigiria fonte paga ou Open Finance, `docs/11`).
- **Cálculo de imposto** (come-cotas, IR na fonte, isenções). O valor é o do extrato, já com o que o banco descontou.
- **Família**: investimentos não vão para a Família (escolha do Enzo). Mesmo com a Família escolhida no seletor, a aba mostra o Pessoal.
- **Exportar meus dados**: hoje a exportação leva lançamentos e compras no cartão, sem metas nem investimentos. Se entrar, entra junto
  com as metas, depois do lançamento.

## 2. As telas

| Tela | Endereço | O que tem |
| --- | --- | --- |
| Investimentos (aba) | `/investimentos` | Card azul "Seus investimentos hoje" (total, aportado, resgatado e rendimentos quando houver, ganho, rentabilidade com CDI e IPCA), a lista "Seus investimentos", "Encerrados", "Novo investimento" e os avisos (não é recomendação, não entra em Pago nem em Recebido, ninguém da Família nem a empresa vê) |
| Novo investimento | `/investimento/novo` | Nome (até 40 caracteres), tipo (renda fixa, títulos públicos, ações, fundos, previdência, criptoativos, outro), quanto aplicou até hoje (obrigatório), quanto vale hoje (opcional) e desde quando (opcional, hoje sem ela) |
| Detalhe | `/investimento/<id>` | Valor, totais, última atualização, rentabilidade, "Atualizar valor", "Registrar aporte", "Registrar resgate", "Registrar rendimento recebido", o valor no fim de cada mês (até 12), o histórico, editar, encerrar ou reabrir e excluir |
| Editar | `/investimento/<id>/editar` | Só nome e tipo; os valores mudam pelos movimentos |
| Movimento | `/investimento/<id>/movimento?tipo=aporte\|resgate\|rendimento\|valor` ou `?movimento=<id>` | Valor, data (hoje preenchida, sem data futura) e observação (até 80 caracteres); alterar e excluir um movimento |

Formulários sem a barra inferior; a aba e o detalhe com a barra (regra de navegação de `docs/10`). O selo do contexto fica fixo em
"Pessoal" em todas as telas de investimento. Capturas: `docs/telas/540_investimentos.png`, `541_investimento_detalhe.png` e
`542_novo_investimento.png`; o manual do app tem a entrada "Investimentos".

## 3. As regras

### 3.1 O valor de cada dia

- **Aporte** soma ao valor e ao aportado. **Resgate** tira do valor e soma ao resgatado. **Rendimento recebido** é o que caiu na conta da
  pessoa (juros, dividendos): não muda o valor do investimento, só conta no ganho.
- **Atualizar valor** grava o valor total do extrato numa data. No mesmo dia, os aportes e resgates entram primeiro e a atualização fecha o
  dia: ela já inclui os movimentos daquele dia.
- Sem atualização num dia, o valor é o do dia anterior mais aportes menos resgates. Antes da primeira atualização, o valor é o custo
  (o aportado menos o resgatado), e a tela pede para atualizar.
- **I1. O valor ao fim de cada dia nunca fica negativo.** Um resgate maior que o valor, ou excluir um aporte que cobre um resgate, é
  recusado antes de enviar, com o dia: "Com este movimento, o investimento ficaria com valor negativo em 07/10/2026. Confira o valor e a
  data." O banco confere de novo (`valor_insuficiente`, com `dia=AAAA-MM-DD`).
- **Ganho** = valor de hoje + resgatado + rendimentos recebidos − aportado.

### 3.2 Rentabilidade

- **Por mês, pelo método de Dietz modificado**: (valor no fim − valor no início − entradas + saídas + rendimentos) ÷ (valor no início +
  entradas e saídas ponderadas pelos dias que faltam até o fim do período). O período é o mês, ou do dia 1 até hoje no mês em andamento.
  Os aportes e resgates contam no fim do dia em que aconteceram.
- **O mês só tem taxa com o valor conhecido nas duas pontas** (revisão independente de 11/11/2026): no começo, o investimento teve uma
  atualização de valor no mês anterior (ou começou no próprio mês); no fim, teve uma atualização no mês. Sem isso, o mês fica "sem taxa"
  (antes, o ganho de meses sem atualização caía todo num mês só e dava taxas absurdas).
- **Investimento que começa no mês** entra como um aporte: com "Quanto vale hoje" no cadastro, entra no fim daquele dia pelo valor
  informado, então o ganho de antes do cadastro aparece no "Ganho", mas não como rendimento do mês; sem o valor, os aportes do primeiro dia
  contam desde o começo do dia.
- **Sem taxa** também quando a base é zero ou negativa, quando nenhum dia passou e quando a conta daria −100% ou menos.
- **No mesmo dia**, duas atualizações de valor: vale a última criada, como no banco.
- **A carteira** soma o valor de cada investimento ativo e usa o mesmo cálculo: um investimento sem atualização no mês deixa a carteira sem
  taxa naquele mês. No mês de hoje, o card azul diz quem falta atualizar, no lugar do aviso geral (pedido do Enzo, 11/11/2026, depois do
  teste na web): "Para ter a taxa deste mês, falta atualizar o valor de Ações." e, para quem começou antes e não tem valor no mês
  passado, "Falta o valor de outubro para Previdência: em "Atualizar valor", use a data 31/10/2026." (o último dia do mês passado, que
  nunca fica antes do primeiro aporte; até três nomes, depois "e mais N"; `investmentsMissingValue`). Só cita quando atualizar dá a taxa
  hoje: se tudo começou hoje (base zero), fica o aviso geral (revisão independente de 11/11/2026).
- **Na tela**: "Neste mês, até hoje", e a comparação com os **meses fechados seguidos mais recentes com taxa, até 12** ("Nos 4 meses
  fechados, de junho a setembro de 2026: +3,54%"), com o CDI e o IPCA **dos mesmos meses**, acumulados (produto de 1 + taxa de cada mês).
  Mês sem índice publicado: "CDI: sem dados para todos os meses".
- **Encerrados** saem do total e da rentabilidade da carteira; o detalhe continua mostrando o que aconteceu.

### 3.3 CDI e IPCA

- Fonte: **Banco Central do Brasil**, Sistema Gerenciador de Séries Temporais, dados públicos e gratuitos. Série **4391** (CDI acumulado no
  mês, % ao mês) e série **433** (IPCA, variação mensal, %). A tela diz a fonte e a data da consulta.
- Quem busca é a função do servidor **`indices`** (`packages/core/src/indices/servidor.ts`, gerada em `supabase/functions/indices/index.ts`
  por `npm run indices`): recebe só o mês de partida (`{"desde": "AAAA-MM"}`), nunca dado de ninguém; guarda a resposta por 6 horas; só
  responde ao endereço do app (`CLAREVO_APP_URL`, padrão `https://app.clarevo.app.br`) e ao app em desenvolvimento no próprio computador;
  e só para quem está no app (confere a sessão no Supabase Auth: sem sessão, `401 {"erro": "nao_autenticado"}`).
  Cada série é buscada à parte: o IPCA do mês ainda não publicado não leva o CDI junto (e uma resposta com uma série faltando não fica
  guardada). Se o Banco Central não responder para nenhuma das duas: `502 {"erro": "indices_indisponiveis"}`, e a tela diz "Não foi possível buscar o CDI e o IPCA agora. A
  sua rentabilidade continua aqui." O app nunca inventa índice.
- **Na demonstração**, os índices são de exemplo (CDI 0,90% e IPCA 0,35% ao mês), e a tela diz isso.

### 3.4 Limites e exclusão

- **I2.** Só no Pessoal (`contexto_invalido` na Família) e até **50 investimentos ativos** (`limite_de_investimentos`).
- **I3.** Encerrado não recebe, não altera nem exclui movimento: reabrir primeiro (`investimento_encerrado`).
- **I4.** Só as sete funções gravam (`create_investment`, `update_investment`, `set_investment_status`, `delete_investment`,
  `add_investment_movement`, `update_investment_movement`, `delete_investment_movement`); **excluir apaga de vez**, o investimento com os
  movimentos.
- **I5.** Toda escrita grava a operação (`record_operations`) e conta como anotação (vale para "Seus últimos meses").
- **I6.** Excluir a conta e encerrar a Família apagam tudo (chaves estrangeiras em cascata a partir de `financial_contexts`). A tela de
  excluir a conta cita os investimentos.
- Valor do movimento até R$ 9.999.999,99, como os registros; a atualização de valor pode ser R$ 0,00.

## 4. Onde está

| Parte | Arquivo |
| --- | --- |
| Regras, cálculo e textos | `packages/core/src/investments.ts` |
| Função dos índices | `packages/core/src/indices/servidor.ts` → `supabase/functions/indices/index.ts` |
| Banco | `supabase/migrations/20261111000002_investimentos.sql` (migração 0032), testes em `supabase/tests/99zzzzzzzzzzz_investimentos.sql` |
| Repositório | `packages/core/src/repository.ts` (contrato), `memory-repository.ts` (demonstração e testes), `apps/app/src/lib/supabase-repository.ts` |
| Telas | `apps/app/src/app/(tabs)/investimentos.tsx`, `apps/app/src/app/investimento/`, `apps/app/src/components/investment-form.tsx` e `investment-parts.tsx` |
| Testes | `packages/core/test/investments.test.ts`, `indices-servidor.test.ts`, bloco "D-093 Investimentos" de `scripts/e2e-web.js` |
| Demonstração | `packages/core/src/demo.ts`: "Aplicação do banco" e "Previdência", fictícios |

## 5. Privacidade

- Os investimentos ficam no Supabase do Pessoal, com a mesma proteção de tudo (RLS: só quem lê o contexto lê). **Ninguém da Família nem a
  empresa que oferece o benefício vê.**
- A função `indices` não recebe nem guarda dado pessoal: só o mês de partida, e devolve dados públicos.
- Nada de investimento vai para relatório da empresa, lembrete, Telegram ou WhatsApp.
- **Para o advogado (pergunta 49 de `docs/legal/resumo-para-advogado.md`):** a política de privacidade passa a citar "investimentos que você registra (nome que você escolhe,
  tipo, aportes, resgates, rendimentos e valores)" entre os dados financeiros anotados, com a mesma base legal dos registros, e a
  consulta ao Banco Central sem dado pessoal. Confirmar se o aviso "não é recomendação de investimento" basta para não caracterizar
  consultoria (CVM, Resolução 19/2021), já que o app não indica produto nenhum.

## 6. Passos do Enzo (Supabase)

Em `docs/05_SUPABASE.md`, passos 12v, 12w e 12x, e as conferências 21s e 21t:

1. SQL Editor: rodar a migração 0031 (`20261111000001_metas_ordem.sql`, prioridade das metas) e depois a 0032
   (`20261111000002_investimentos.sql`), cada uma numa consulta nova, e recarregar o esquema.
2. Edge Functions: criar a função `indices` pelo editor, colar `supabase/functions/indices/index.ts` e publicar com **"Verify JWT with legacy secret"
   desligado**, como as outras funções: só quem está no app consulta, porque a função confere a sessão da pessoa no Supabase Auth (a
   verificação do painel só aceita o segredo antigo e recusaria as sessões assinadas com as chaves novas). Não há segredo: o Banco Central
   é público. Feito em 11/11/2026: a versão que confere a sessão, com a verificação do painel desligada (aba Settings da função).
3. Aplicar antes de publicar o app novo: a aba nova lê `investment_items` e chama as funções novas.
4. Ficha ampliada (D-099): rodar a migração 0035 (`20261113000001_investimentos_ficha.sql`) e recarregar o esquema; publicar de novo a função
   `indices` (agora busca também a Selic do mês, série 4390, e a poupança, série 195), com a verificação de JWT continuando desligada. Aplicar
   antes do merge: o app novo envia a ficha nas funções novas e lê as colunas novas.

## 7. Ficha ampliada (D-099, 13/11/2026)

Estudo e decisões em `docs/49_ESTUDO_INVESTIMENTOS.md`; regras no núcleo e repetidas no banco.

- **Campos (todos opcionais):** tipo exato dentro do tipo (os títulos públicos com os nomes oficiais do Tesouro Nacional), onde está (texto da
  pessoa, até 40 caracteres), como rende (% do CDI, Selic mais taxa, IPCA mais taxa, prefixado, regra da poupança ou variável), a taxa (em centésimos
  de ponto: 11000 é 110% do CDI, 650 é 6,5% ao ano), o vencimento e quando pode resgatar (qualquer dia, alguns dias depois do pedido, a partir de uma
  data, só no vencimento). Editar grava a ficha inteira; sem ela (versão antiga do app), a ficha fica como está, e só o tipo exato sai se o tipo mudou.
  No rendimento recebido, o tipo (juros ou cupom, dividendos, JCP, rendimento de FII, outro); ao alterar sem ele, o tipo fica como está.
- **O que a ficha deduz** (`investment-details.ts`): a regra de imposto (isento, tabela regressiva, come-cotas, sobre a venda, previdência,
  criptoativos) e a garantia (FGC para poupança, CDB, LC, LCI, LCA e LCD; Tesouro Nacional para os títulos públicos; nenhuma das duas para o resto).
  A tela sempre diz "Confira no seu extrato ou no contrato".
- **Imposto estimado** (`investment-tax.ts`): na tabela regressiva, cada aporte é um lote com a própria data; um resgate tira dos mais antigos, na
  proporção entre o aplicado e o valor do dia; o rendimento de hoje se divide entre os lotes pelo aplicado vezes os dias; IOF antes do imposto nos
  primeiros 30 dias. As outras regras têm só a explicação. Regras e fontes num lugar só, com revisão a cada 6 meses.
- **Valor pela taxa contratada** (`investment-insights.ts`): parte do último valor do extrato (ou dos aportes); aportes depois entram, resgates e
  rendimentos pagos saem; a taxa diária de cada mês sai do índice acumulado no mês e dos dias úteis do mercado (feriados nacionais mais Carnaval,
  Sexta-feira Santa e Corpus Christi); mês sem índice publicado repete o último. Valor "na curva", bruto. Só é gravado com "Usar este valor".
- **Na aba:** próximos vencimentos (12 meses, e os vencidos que ainda têm valor), como está dividido (seis jeitos, barras na mesma cor, sem faixa
  recomendada), soma do FGC por instituição (a grafia não importa: sem acento, sem caixa), rendimentos recebidos no ano, ganho real e poupança no
  mesmo período no bloco azul.
- **Telas novas:** `/investimento/declaracao` (resumo para conferir com os informes) e `/investimento/comparar` (até quatro opções, taxas digitadas).
- **Lembretes** (aparelho): "Vencimentos dos investimentos" (7 dias antes e no dia do vencimento, e do fim da carência com texto próprio) e
  "Atualizar os investimentos" (dia 1, se algum está sem valor desde o último dia do mês passado).
- **Itens P2 feitos em 13/11/2026 (depois do merge do PR #34):** "Evolução da carteira" (o valor no fim de cada um dos últimos 6 meses e o
  aportado acumulado, `portfolioEvolution`); "Datas do ano para quem investe" (come-cotas só com fundo que tem, informes de rendimentos,
  declaração e o 31/12, `fiscalCalendar`; e a regra do DARF para quem tem ações); o aviso neutro de taxa fora do comum na ficha (200% do CDI,
  ou o dobro do CDI dos últimos 12 meses no prefixado, no IPCA mais taxa e na Selic mais taxa, `unusualRate`, com o tema de golpes); e os
  investimentos na exportação (terceiro CSV com um movimento por linha e a seção "Investimentos" no PDF). Sem mudança no banco.
- **Revisão independente (13/11/2026):** a ordem do mesmo dia no imposto estimado, o nome da instituição na linha do FGC acima do limite,
  o total escondido com "Ocultar valores", o tipo do rendimento que não é escolhido sozinho, o texto da carência nos lembretes e a ficha mantida
  quando uma versão antiga do app edita sem ela. Corrigidos, com testes.
