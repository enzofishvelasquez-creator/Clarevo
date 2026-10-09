# Arquitetura

09/10/2026 · versão 0.8 (primeiro ciclo, contas a pagar, gastos fixos, contas do ano, primeiros passos, calculadoras, seus últimos meses e Aprender e dúvidas)

## Escolhas (aprovadas)

| Camada | Escolha | Por quê |
|---|---|---|
| App | Expo SDK 57 + React Native + Expo Router | Um código para iOS, Android e web. Publicação e atualizações pela nuvem (EAS), sem precisar de Mac para compilar. |
| Dados no app | TanStack Query | Estados de carregando, erro e nova tentativa; cache limpo ao sair ou trocar de pessoa. |
| Regras financeiras | `@clarevo/core` (TypeScript puro) | As mesmas regras no app e nos testes; o banco repete as validações. |
| Backend | Supabase: Postgres, Auth, RLS | Confirmação de e-mail e recuperação reais; autorização no banco em cada acesso, inclusive por ID. Região São Paulo. |
| Fonte e ícones | Manrope (OFL), Lucide (ISC), Lexend (OFL) no nome do logo | Licenças livres para uso comercial. |
| Testes | Vitest (regras), SQL em Postgres local (permissões), Playwright (fluxos na web) | Cada camada testada onde a falha acontece. |

## Estrutura

```
apps/app/src/
  app/                  telas (Expo Router)
    boas-vindas, criar-conta, confirmar-email, entrar, recuperar-acesso, nova-senha
    primeira-conta, carregando, confirmado
    (tabs)/             Resumo, Movimentações, Metas, Aprender
    registro/novo, registro/[id], registro/[id]/editar
    a-pagar, a-pagar/nova, a-pagar/vencidas, a-pagar/[id], a-pagar/[id]/editar, a-pagar/[id]/pagar
    gastos-fixos, gastos-fixos/novo, gastos-fixos/[id], gastos-fixos/[id]/editar, gastos-fixos/[id]/encerrar,
    gastos-fixos/[id]/informar
    composicao, quem-ve, conta, explicacao/[tema]
    calcular, calcular/[slug]  calculadoras (nada é gravado)
    retomar, retomar/atualizar, retomar/pagar  seus últimos meses (revisão depois de ausência)
  components/           interface (logo, campos, botões, formulários de registro, conta a pagar, pagamento, gasto fixo e conta do ano, "Ano a ano", "Somar valores", estados)
    retorno-*           faixa do Resumo, linha da revisão, ações e folha do detalhe da série
    term-hint, topic-link, learn-art, topic-example, faq-item  "O que é isso?", links e partes da explicação
    calc/               uma tela por calculadora e as partes comuns (campos, chips de 48 px, resultado anunciado)
  lib/                  autenticação (Supabase e demonstração), learn.ts (links e ações de Aprender), situação do card Primeiros passos (só no aparelho)
  state/                sessão, dados (consultas e gravações), contexto e mês
  theme/                tokens de cor, tipografia, movimento e vetores do logo
packages/core/          regras financeiras, validação, repositório em memória, testes
  src/retorno.ts        revisão dos últimos meses: ausência, período, lacunas, montagem e textos
  src/learn/            conteúdo de Aprender (37 temas), busca, tempo de leitura, validação do catálogo e contas exatas de juros, parcelas e divisão (centavos e pontos-base)
  src/calculators/      as 8 calculadoras, campos, textos e links de contexto
supabase/
  migrations/           esquema, funções e permissões (0001 fundação, 0002 contas a pagar, 0003 gastos fixos, 0004 contas do ano, 0005 seus últimos meses)
  tests/                testes de isolamento, da sequência de aceite, de contas a pagar, de gastos fixos, de contas do ano e da revisão dos últimos meses
scripts/e2e-web.js      roteiro de verificação na versão web
docs/                   decisões, regras, acessos, Supabase, roteiro, Aprender, marca, telas
```

## Navegação protegida

- Sem sessão: só as telas de entrada.
- Sessão de recuperação de senha: só "Nova senha".
- Com sessão e sem conta financeira: só "Sua primeira conta".
- Com conta: o app.
- Sessão expirada: volta para Entrar e, depois do login da mesma pessoa, para a tela onde ela estava.
- Uma falha momentânea de rede não tira a pessoa da tela em que está (os dados já carregados continuam valendo).
- Na web, um endereço de tela do app aberto sem sessão (atalho do ícone, link salvo) fica só em memória e é retomado depois de entrar; parâmetros de links de e-mail (`token`, `code`, `type`, `error`) são descartados (D-035(10)).

A navegação organiza a experiência; **quem protege os dados é o banco**.

## Modelo de dados

```
pessoa ──< vínculo (permissões por ação) >── contexto (pessoal | família) ──< conta financeira ──< registro
   │                                                                    ├──< conta a pagar (previsto) ── 0 ou 1 gasto vivo que a quitou (registro)
   │                                                                    └──< série (gasto fixo, parcelamento ou conta do ano) ──< vigência
   │                                                                                  └──< ocorrência = conta a pagar com número
   ├──< operação (chave de idempotência, ação, registro, conta a pagar ou série resultante) ── gatilho ──> atividade
   ├──< atividade por contexto (dia da última anotação e última ausência longa; só datas)
   ├──< revisão dos últimos meses por contexto (último mês revisado, decisão e versão)
   └──< direito ao plano >── licença >── contrato de benefício >── organização ──< administrador
```

**Contas a pagar** (`commitments`) são origem separada dos registros realizados e nunca entram em Recebido, Pago ou Diferença.

- **Vínculo:** ao marcar como paga, `pay_commitment` cria um gasto com `financial_records.commitment_id` apontando para a conta a pagar. A chave estrangeira é composta com o contexto (mesmo contexto garantido), o gasto é sempre `despesa`, há no máximo um gasto vivo por conta a pagar e o vínculo nunca muda.
- **Leitura:** a visão `commitment_items` junta a conta a pagar e o gasto vivo que a quitou (`paid_record_id`, `paid_on`, `paid_amount_cents`, `paid_account_id`). Ela usa `security_invoker`, então a RLS de quem consulta vale nas duas tabelas. Os dados do pagamento não são copiados para a conta a pagar: vêm sempre do gasto. A lista de um mês (`listCommitments`) traz as contas com vencimento no mês, as pagas com data do pagamento no mês (`paid_on`, qualquer que seja o vencimento) e as em aberto de outros meses; excluídas nunca vêm.
- **Coerência:** uma restrição adiada confere, no fim de cada transação, que conta paga tem exatamente um gasto vivo vinculado e conta em aberto nenhum. Ela dispara ao gravar a conta a pagar, ao gravar um gasto vinculado e ao apagar fisicamente um gasto vinculado; se a conta a pagar foi apagada na mesma transação (contexto inteiro), não há o que conferir.
- **Repetição:** as funções de contas a pagar guardam o hash dos argumentos codificados em JSON (`jsonb_build_array`), sem ambiguidade entre campos de texto e com datas em ISO; as funções de registro mantêm o formato da 0001.
- **"Ainda a pagar":** calculado por `summarizeToPay` no core e repetido no banco por `month_to_pay`; o teste de API compara os dois.

**Gastos fixos e parcelamentos** (migração `20261008000001_gastos_fixos.sql`, D-024) são séries que criam contas a pagar comuns, uma por mês.

- **Tabelas:** `commitment_series` guarda a série (tipo `mensal` ou `parcelada`, natureza `conta`, `financiamento`, `compra_parcelada` ou `outro_parcelamento`, primeiro mês, primeiro e último número, total de parcelas, autoria, versão e exclusão lógica; a 0004 acrescentou o tipo `anual` e as parcelas por ano, abaixo). `series_terms` guarda as vigências (descrição, categoria, valor, modo `fixo` ou `variavel` e dia do vencimento, a partir de um número); uma vigência nunca é editada, só substituída (`superseded_at`, `superseded_by`). Série, vigências e ocorrências ficam no mesmo contexto por chaves estrangeiras compostas; apagar o contexto inteiro apaga tudo em cascata.
- **Ocorrências:** `commitments` ganhou `series_id`, `occurrence_number`, `series_override` (alterada só neste mês), `series_skipped` (excluída só neste mês, nunca volta) e `amount_is_estimate`. Um índice único parcial garante no máximo uma ocorrência viva por série e número; excluídas não bloqueiam a recriação ao retomar uma série encerrada. Pagar, desfazer e "Ainda a pagar" são os de contas a pagar, sem mudança.
- **Operações:** `record_operations.target_id` identifica a série nas ações `criar_serie`, `alterar_serie`, `encerrar_serie`, `excluir_serie` e, desde a 0004, `informar_ano` e `tirar_ano` (só nelas, com `record_id` e `commitment_id` nulos). O app usa a coluna para reconciliar uma gravação de resultado incerto.
- **Leitura:** `commitment_items` ganhou no fim `series_id`, `occurrence_number`, `series_override`, `amount_is_estimate` e, pela junção com a série, `series_kind`, `series_nature` e `series_installment_total`; nada da série é copiado para a conta a pagar. A visão nova `series_items` traz as séries não excluídas com as vigências vivas, os números pulados, as contagens de pagas e em aberto e `generating` (quem criou ainda pode gravar no contexto). Ela não usa `security_invoker`, porque precisa ler as ocorrências excluídas só neste mês, que a RLS esconde; por isso filtra a permissão de leitura de forma explícita e é `security_barrier`, para que um filtro de quem consulta não rode antes da permissão. O consultor de segurança do Supabase pode apontá-la como visão com privilégios de quem a criou: é intencional.
- **Geração:** `clarevo_materialize_series` cria as ocorrências do mês anterior ao seguinte a hoje (no máximo três números por série, qualquer que seja a idade dela), com a vigência de cada número, a autoria de quem criou a série e nada se essa pessoa perdeu a escrita. Ela roda dentro de `create_series`, `update_series_from` e `end_series` e em `sync_series_occurrences`, que o app chama uma vez por dia e contexto (consulta `['seriesSync', contexto, dia]`) antes de mostrar a lista de contas a pagar; se a geração falha, a lista inteira mostra erro, nunca um total parcial. As escritas de série não pedem outra sincronização, porque já criam as contas da janela na mesma transação, e uma nova tentativa de sincronização que falha depois de uma que deu certo não apaga listas já carregadas; uma falha da própria lista continua mostrando erro. O core repete a regra em `occurrencesToMaterialize`, e o teste de API compara os dois.
- **Coerência:** gatilhos de proteção mantêm imutáveis o vínculo da ocorrência (série e número), a forma e o início da série e o conteúdo das vigências; conta paga não muda nem perde a marca de estimado. Uma restrição adiada confere no fim de cada transação que série excluída não tem ocorrência viva, que toda ocorrência viva fica entre o primeiro e o último número e com vencimento no mês dela e que existe vigência viva no primeiro número e nenhuma antes. Ela dispara também ao apagar fisicamente uma vigência ou uma conta da série: sem a vigência viva do primeiro número, a geração falharia para o contexto inteiro, e sem a linha de uma conta excluída só neste mês, a geração a recriaria; apagar o contexto inteiro, vigências substituídas ou contas já excluídas sem essa marca continua possível. Ordem de travas: série, contas a pagar por número crescente, registro.
- **Conjunto afetado:** "esta e as próximas", encerrar e excluir recebem a lista `[{id, version}]` das contas que a pessoa confirmou e a comparam com a atual como conjunto, depois de travar as contas; qualquer diferença é recusada como versão desatualizada. No core, `affectedByEditFrom`, `affectedByEnd` e `affectedByDelete` montam essa lista a partir de todas as contas em aberto: `listSeriesOccurrences` (as 60 ocorrências mais recentes, abertas e pagas, por número decrescente) junto de `listOpenSeriesOccurrences` (todas as em aberto, sem limite, em páginas), unidas por `mergeOccurrences`; com só as 60, uma série com mais contas em aberto seria sempre recusada. A lista de 60 continua sendo a do histórico e dos meses sem conta registrada; "Faltam" e a soma das parcelas que faltam (`installmentProgress`) usam as duas.

**Contas do ano** (migração `20261008000002_contas_do_ano.sql`, D-029) são séries anuais: todo ano, uma conta (cota única) ou de 2 a 12 parcelas em meses seguidos, cada uma uma conta a pagar comum. Tudo o que vale para gastos fixos acima vale para elas, com as diferenças abaixo.

- **Série anual:** `commitment_series.kind = 'anual'`, com a coluna nova `parts_per_year` (k, parcelas por ano, de 1 a 12; nula em gastos fixos e parcelamentos; imutável). A forma de cada tipo é uma restrição da tabela (S9): na anual, natureza `conta`, `first_number` de 1 a k (a próxima parcela a pagar no primeiro ano), `last_number` nulo ou de `first_number - 1` a 50 × k e `installment_total` nulo. A numeração continua entre os anos: `first_due_month` é o mês da parcela `first_number`, e o mês da parcela 1 (âncora) fica `first_number - 1` meses antes.
- **Mês e vencimento:** `clarevo_series_month(série, n)` dá o mês da ocorrência n nos três tipos (na anual, âncora + 12 × ⌊(n - 1) / k⌋ + ((n - 1) mod k), com divisão para baixo e resto não negativo, para servir também a n = 0 de uma série encerrada sem conta), e `clarevo_series_due(série, n, dia)` dá o vencimento, limitado ao último dia do mês. O banco usa as duas em todo lugar (geração, coerência S8, limite de 100, `update_commitment`, `update_series_from` e `end_series`), nunca o mês escrito em linha, e nenhuma das duas é executável com sessão; `clarevo_series_due_on`, da 0003, fica só para os testes da 40. No core, `seriesMonthOf`, `numberOfMonth` (nulo quando o ano não tem parcela naquele mês), `numberAtOrAfter` e `numberAtOrBefore`.
- **Geração:** `clarevo_materialize_series` ganhou o ramo anual. O ano inteiro entra quando a 1ª parcela dele vence até o fim do 2º mês depois do mês de hoje (`annualTop` em `generationWindow`, no core), menos as parcelas de meses antes do mês anterior a hoje, que ficam "sem conta registrada". Cada chamada cria no máximo dois anos, e nenhuma conta criada vence depois do fim do 13º mês a partir do mês de hoje (S10, conferida nos testes do banco e por `checkSeriesInvariants` no repositório em memória). Trava, autoria, quem dispara a geração e "nada se quem criou perdeu a escrita" são os da 0003; o core repete a regra em `occurrencesToMaterialize`, e o teste de API compara os dois.
- **Funções novas:** `inform_series_year(chave, série, número, conjunto, valor)` e `skip_series_year(chave, série, número, conjunto)`, só para séries anuais (`tipo_invalido` nas outras). O número é qualquer parcela do ano, de `first_number` em diante; o ano vai de ⌊(n - 1) / k⌋ × k + 1 a ⌊(n - 1) / k⌋ × k + k. Afetadas: ao informar, as parcelas vivas do ano em aberto e estimadas, que recebem o valor, perdem a marca de estimado, ficam com `series_override` e somam 1 à versão; ao tirar, todas as vivas em aberto do ano, excluídas com `series_skipped` (entram em `skipped_numbers` e nunca voltam). O conjunto `[{id, version}]` confirmado é comparado depois de travar a série e as contas por número crescente; diferente ou vazio é recusado (`versao_desatualizada`, detalhe `contas_afetadas_mudaram`). A versão da série não muda. Retorno `{series, occurrences, changed}`, como as outras funções de série.
- **`create_series`:** um parâmetro a mais no fim, `p_parts_per_year`, com padrão nulo. A assinatura de 13 argumentos foi removida, mas a chamada com 13 argumentos nomeados continua funcionando, e com o parâmetro nulo o hash é o mesmo da 0003 (uma repetição em trânsito continua reconhecida). Na anual, `p_last_month` é o mês da última parcela do último ano, e o banco guarda `last_number = k × (anos até esse mês + 1)`. A validação segue a ordem do core, com o código novo `parcelas_no_ano_invalidas` logo depois de `parcelas_invalidas`; o início da anual vai do mês anterior ao atual até 23 meses depois.
- **Leitura:** `commitment_items` ganhou `series_parts_per_year` no fim, e `series_items`, `parts_per_year` depois de `generating`; as duas visões foram recriadas com as mesmas opções da 0003. O conversor do app recusa, como dado inconsistente, série ou conta em que o tipo e as parcelas por ano não combinam.
- **No core e no app:** `affectedByYear` monta o conjunto de informar e de tirar, com os textos do que muda e do que não muda; `wholeYearPayment`, o de "Paguei o ano todo de uma vez" (pagar a parcela escolhida com o valor total e depois tirar as outras em aberto do ano, com o conjunto calculado antes de pagar); `suggestedAnnualReference`, a sugestão de referência, aplicada por `update_series_from` com `affectedByEditFrom` e oferecida só quando o banco a aceitaria (`editFromMaxNumber`, o mesmo limite de `update_series_from`) e o ano seguinte não tem valor informado; `annualYearSummary`, o "Ano a ano"; `groupAnnualLater`, os grupos por ano em "Próximos meses"; `seriesYearlyTotal`, o "Por ano" (e `seriesMonthlyTotal` ignora as contas do ano). `affectedByYear`, `wholeYearPayment` e `affectedByEditFrom` recebem todas as contas de `mergeOccurrences`, como no Ciclo A. Uma gravação de resultado incerto em informar ou tirar é reconciliada por `findSeriesOperation` (`informar_ano`, `tirar_ano`).

**Seus últimos meses** (migração `20261009000001_retorno.sql`, D-030) é a revisão oferecida depois de um tempo sem anotar. O banco guarda só datas e a decisão da pessoa; o resumo mês a mês é montado no core, sobre leituras que já existiam.

- **Tabelas:** `context_activity` (uma linha por pessoa e contexto: `last_write_on`, o dia da última anotação no fuso da pessoa, e `absence_from_on` e `absence_until_on`, a última ausência longa, os dois nulos ou os dois preenchidos) e `return_reviews` (uma linha por pessoa e contexto: `reviewed_through`, sempre dia 1, `decision` `atualizou` ou `seguiu`, `decided_on` e `version`). Chaves estrangeiras para a pessoa e o contexto em cascata. Conta nova não tem linha em nenhuma das duas.
- **Atividade:** o gatilho `record_operations_activity` (depois de cada operação gravada, função `clarevo_track_activity`, sem execução para ninguém) trata como anotação toda ação menos `decidir_revisao`. Usa o dia de hoje de quem anotou (`clarevo_today`); só muda quando o dia é maior que o último, e, se o intervalo é uma ausência longa (`clarevo_long_absence`: 45 dias ou mais, ou ao menos um mês inteiro fechado entre os dois), grava esse intervalo como a última ausência. A geração `sync_series_occurrences`, recusas e repetições não gravam operação e por isso não contam. A migração carrega uma vez a atividade de quem já usava o app, pelo maior dia de `record_operations.created_at` no fuso da pessoa, sem ausência; contextos já apagados ficam de fora. A tabela própria não depende da retenção de `record_operations` (P-010).
- **Guardas:** as chaves e a criação não mudam; `last_write_on`, `reviewed_through` e `decided_on` nunca recuam (`campo_imutavel`); a versão da revisão sobe de 1 em 1; uma ausência gravada precisa ser longa (`atividade_inconsistente`), conferida só quando ela muda, para que um ajuste futuro do limiar (P-021) não invalide as já gravadas.
- **Funções novas:** `create_series_occurrence(chave, série, versão da série, número, modo)` cria a conta de um mês passado de série, com `'aberta'` (em aberto) ou `'nao_houve'` (gravada já excluída só naquele mês, `series_skipped`, que a geração nunca recria). Aceita só números dos 11 meses fechados anteriores ao mês atual de quem chama (`mes_fora_da_revisao`), dentro da série (`numero_fora_da_serie`) e sem conta viva nem excluída só naquele mês (`ocorrencia_existente`); um número removido por encerramento e depois retomado pode ser registrado. A conta usa a vigência do número, com a autoria de quem criou a série (que precisa continuar com leitura e escrita), não muda a versão da série e não grava gasto; o pagamento continua sendo `pay_commitment`, em outra chamada. A operação fica como `criar_ocorrencia`, com a conta e a série (`target_id`), e o app a reconhece em `findCommitmentOperation`. Uma conta criada assim entra no conjunto afetado de "esta e as próximas", encerrar, informar e tirar, que recusam o conjunto antigo. `decide_return_review(chave, contexto, versão, mês revisado, decisão)` grava só a marca da própria pessoa (basta leitura), com o maior mês revisado e o maior dia de decisão; o mês precisa ser um dos 11 fechados anteriores ao atual (`mes_invalido`). A operação fica como `decidir_revisao`, sem registro, conta ou série. `months_overview(contexto, de, até)` devolve, mês a mês (até 12 meses, com datas finitas no dia 1; fora disso, `periodo_invalido`), a soma e a quantidade de recebimentos e de gastos, com o critério de `month_totals` e a RLS de quem consulta; mês sem anotação vem com zeros. As três usam o hash em JSON de D-021(7) e o mesmo espaço de chaves.
- **Operações:** as restrições de `record_operations` foram recriadas com a lista completa vigente, de 16 ações (com `informar_ano` e `tirar_ano` do A3 e as duas novas). As migrações seguintes que mexerem nelas precisam levar a lista inteira.
- **Leitura e privilégios:** políticas `context_activity_own` e `return_reviews_own`: só a própria pessoa lê, e só enquanto lê o contexto. Sem escrita direta. Com sessão, executam-se 23 funções: as 20 de antes e as três novas; as auxiliares e as guardas não são executáveis.
- **No core e no app:** `retorno.ts` repete a regra de ausência (`isLongAbsence`, `ABSENCE_MIN_DAYS`), calcula o período (`returnWindow`), as contas sem registro pela lista de contas do período (`seriesGapsInRange`, sobre `listCommitmentsDueBetween`, nunca sobre as 60 mais recentes) e monta a revisão (`buildReturnReview`), com as ações de cada linha, o lote, o modo "Dia" e todos os textos (`RETURN_TEXT`). `loadReturnReview` lê `getReturnReviewState`, `monthsOverview`, `listCommitmentsDueBetween` e `listSeries`, sempre depois de a geração do dia dar certo; no app, `useReturnReview` usa a consulta `['returnReview', contexto, dia]`, que toda gravação invalida e que recarrega ao voltar para o app. Se a geração ou a leitura falham, a faixa não aparece e `/retomar` mostra erro, nunca uma lista parcial. O `MemoryRepository` repete o gatilho, as três funções, a ordem das conferências e os códigos.

**Aprender e dúvidas** (D-031 e D-032) não muda o banco: o conteúdo é público, vem no app e funciona sem internet.

- **Core (`src/learn/`):** `types.ts` (seções, os 37 slugs e o formato do tema, das fontes e dos fatos de norma), `sections.ts` (as cinco seções e "Comece por aqui"), `topics/` (o conteúdo, um arquivo por seção), `reading.ts` (palavras e tempo de leitura), `search.ts` (busca no aparelho), `examples.ts` (os números esperados de cada exemplo, calculados por `math.ts`), `validate.ts` (validação do catálogo: tamanhos, fontes, domínios, prazos de revisão, números conferidos e hipóteses), `ui-text.ts` (`LEARN_UI_TEXT`) e `math.ts` e `format.ts`, do A6. O catálogo, as fontes e o registro de revisões estão em `docs/09_APRENDER.md`.
- **App:** `lib/learn.ts` reexporta o core e define `explanationHref(slug, origem)`, que a rota `/explicacao/[tema]` recebe com `origem` (`tarefa` ou `aprender`); com `typedRoutes`, o `typecheck` recusa um slug ou uma rota que não existem. Ali ficam também as ações "No Clarevo" e o link de cada tema para a calculadora. `lib/topics.ts` foi removido: nenhum `/explicacao/` é escrito à mão fora de `lib/learn.ts` (conferido por `learn-links.test.ts`). `TermHint` e `TopicLink` não desenham nada para tema em rascunho. A busca fica só na memória da aba; nada é gravado nem enviado.

## Como executar

```bash
npm install
npm run web          # navegador (demonstração se não houver .env)
npm run app          # Expo Go no celular (QR code)
npm test             # regras financeiras
npm run typecheck
npm run test:db      # banco (Postgres local)
npm run test:api     # app contra a API (PostgREST)
npm run test:web     # fluxos completos na versão web
```

Para dados reais: `docs/05_SUPABASE.md`.
