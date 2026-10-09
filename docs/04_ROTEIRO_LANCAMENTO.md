# Roteiro até o lançamento

Atualizado em 09/10/2026. Prazos são estimativas de trabalho, não compromissos; dependem das decisões pendentes.

Ordem a partir de 08/10/2026 (D-023, D-029, D-033 e D-034): o Ciclo A, o Ciclo A3 (contas do ano) e os Primeiros passos com os atalhos em Movimentações estão feitos. O Ciclo A6 ("Achar tudo" e calculadoras, D-035) está implementado e no roteiro web, com o teste manual em aberto. Os Ciclos A4 (seus últimos meses, D-030) e A5 (Aprender e dúvidas, D-031 e D-032) começaram em 09/10/2026 e estão implementados (o A4 no banco, no core e nas telas; o A5, sem mudança no banco, no core e nas telas) e no roteiro web, com os itens abertos de cada seção abaixo (entre eles, o teste manual em aparelho). Seguem o A2 (lembretes) e depois B, C e D, todos antes do Ciclo 2 (família). Cada ciclo começa depois de o anterior passar em `npm test`, `npm run typecheck`, `npm run test:db`, `npm run test:api` e `npm run test:web`; A2 pode correr em paralelo, porque não mexe no banco.

## Primeiro ciclo (entregue em demonstração; falta ligar o Supabase)

- [x] Repositório próprio no GitHub
- [x] Logo aprovado vetorizado; ícone do app, splash e favicon
- [x] Boas-vindas, Criar conta, Confirmar e-mail, Entrar, Recuperar acesso, Nova senha
- [x] Sua primeira conta ("Conta principal", sem saldo inicial obrigatório)
- [x] Anotar gasto e Registrar recebimento já realizados, com validação e proteção contra duplicidade
- [x] Detalhe, edição (mesmo registro, nova versão, conflito) e exclusão com confirmação
- [x] Resumo e composição pela mesma origem; troca de mês; estados vazios, de carregamento e de erro
- [x] Rascunho preservado; "Descartar o preenchimento?"; explicações em Aprender
- [x] Banco com permissões e testes de isolamento
- [x] Contas a pagar (D-020): anotar, editar e excluir; marcar como paga (o gasto entra em Pago na mesma operação) e desfazer; lista com vencidas, a vencer, pagas e próximos meses; "Ainda a pagar neste mês" com as vencidas
- [x] **Você:** criar o projeto Supabase (`docs/05_SUPABASE.md`; feito, ver `docs/07_PUBLICACAO_WEB.md`)
- [ ] Ligar o app ao Supabase e repetir os testes com e-mail real
- [ ] Testar em celular (Expo Go) com teclado aberto e texto ampliado
- [x] Publicar a versão web para o investidor (`clarevo-demo.pages.dev` e `clarevo.pages.dev`, `docs/07_PUBLICACAO_WEB.md`)

## Ciclo A: gastos fixos e parcelamentos (D-023, D-024)

- [x] Banco: séries, vigências e contas de cada mês (migração `20261008000001_gastos_fixos.sql`), com testes de permissão, invariantes e sequência de aceite
- [x] Core: vencimentos, geração, prévia, "esta e as próximas", encerrar, retomar, excluir, progresso do parcelamento, valor estimado e avisos contra contar duas vezes; repositório em memória e demonstração com Aluguel, Luz e Financiamento do carro
- [x] App ligado ao banco (`SupabaseRepository`) com testes pela API
- [x] Telas: lista "Gastos fixos e parcelamentos", cadastro (todo mês ou parcelado), detalhe, "esta e as próximas", encerrar ou retomar
- [x] Telas: "Com que frequência?" em Anotar conta a pagar, revisar contas vencidas, rótulos e "Informar o valor da conta" nas contas de série, "Repetir todo mês" e "Tornar gasto fixo", explicações em Aprender
- [x] Roteiro web (`npm run test:web`) com os passos do Ciclo A
- [ ] Teste manual em iOS, Android e web, com e sem movimento reduzido e com leitor de tela

## Ciclo A3: contas do ano (D-029), feito

- [x] Banco: tipo `anual` com parcelas por ano, geração do ano inteiro dois meses antes do primeiro vencimento, "Informar o valor do ano" e "Tirar as parcelas do ano" (migração `20261008000002_contas_do_ano.sql`), com testes de permissão, privilégios, invariantes, ausência longa, limite de 100 e sequência de aceite (`supabase/tests/45_contas_do_ano.sql`)
- [x] Core: mês, vencimento e numeração por ano, geração, cadastro e prévia, "Ano a ano", informar, tirar, "Paguei o ano todo de uma vez", sugestão de referência, grupos por ano e soma "Por ano"; repositório em memória e demonstração com IPVA e IPTU, sem mudar os totais de outubro, novembro e dezembro de 2026
- [x] App ligado ao banco (`SupabaseRepository`) com testes pela API, inclusive a sequência de aceite e a ausência longa
- [x] Telas: "Todo ano" em Anotar conta a pagar e no cadastro, seção "Contas do ano" em Gastos fixos, detalhe com "Ano a ano", "Informar o valor de 2027", tirar as parcelas do ano, "Paguei o ano todo de uma vez", grupos por ano em Próximos meses e em Contas vencidas, "Repetir todo ano", "Mudar a forma de pagamento", "Quem vê estes dados?" e o tema "Contas do ano" em Aprender
- [x] Revisão de 08/10/2026: a sugestão de referência só aparece quando o banco a aceita e nunca troca um valor já informado; "Mudar a forma de pagamento" não cria anos com contas das duas formas; "Informar o valor de 2027" e "Paguei o ano todo" não travam quando uma lista falha ou muda; "Não houve em 2027" nas vencidas mostra todas as parcelas que saem; a nova tentativa de "Tirar todas as parcelas" volta a funcionar; o leitor de tela lê "2026 a 2027"; o "Último ano" explica o ano que atravessa dezembro
- [x] Roteiro web (`npm run test:web`) passando de novo depois da revisão, também com movimento reduzido: os passos do Ciclo A3 já estão em `scripts/e2e-web.js` (telas 36 a 49), e os nomes acessíveis com "2026/2027" passaram a ser lidos como "2026 a 2027"
- [x] **Você:** colar `supabase/migrations/20261008000002_contas_do_ano.sql` no SQL Editor do Supabase antes de juntar o Ciclo A3 na `main` (feito em 09/10/2026 com o Claude no Chrome: rodou sem erro, a conferência deu 2 funções e 1 coluna, e o esquema da API foi recarregado)
- [ ] Teste manual em iOS, Android e web, com e sem movimento reduzido e com leitor de tela (formulário anual, grupo por ano e "Informar")

## Primeiros passos e atalhos em Movimentações (D-033), feito

- [x] Card "Primeiros passos" no Resumo, antes de "Anotar gasto": três passos (gastos fixos, recebimento do mês e gasto já pago) com sinal de concluído e "Agora não"; só no Pessoal e no mês corrente, nunca na demonstração com dados; some de vez ao concluir ou dispensar
- [x] Bloco "Organizar" em Movimentações com "Contas a pagar" e "Gastos fixos e parcelamentos"
- [x] Passos do card e do bloco "Organizar" no roteiro web (`npm run test:web`)
- [ ] Teste manual em iOS, Android e web, com e sem movimento reduzido e com leitor de tela

## Achar tudo e calculadoras (D-034, D-035)

Sem mudança no banco. Nas telas, os fluxos estão no roteiro web (`scripts/e2e-web.js`, telas 56 a 71 de `docs/telas`), que passa também com movimento reduzido.

- [x] Core: `learn/math.ts` adiantado do Ciclo A5 (contas exatas em centavos e pontos-base, com os vetores da `spec3` §3.11 conferidos à parte com frações em Python), as 8 calculadoras com textos, faixas e mensagens, os links de contexto, "Somar valores", "Por categoria", "Já paguei" e as legendas do "Organizar"; teste de textos ampliado às calculadoras (`npm test`: 19 arquivos, 316 testes; `npm run typecheck`)
- [x] Tela "Calculadoras" (`/calcular`) com abertura e aviso visíveis sem rolar em 360 px, 3 grupos e as 8 calculadoras em `/calcular/<nome>`: resultado enquanto a pessoa digita, anunciado ao leitor de tela, hipóteses logo abaixo, chips de 48 px e nada gravado
- [x] Portas: linha "Calculadoras" no "Organizar" de Movimentações, card "Calculadoras" no topo de Aprender e card "Enquanto isso, faça as contas" em Metas
- [x] Links na hora da decisão: "Parcelado ou à vista? Fazer a conta" no cadastro de parcelamento, "Cota única ou parcelado? Fazer a conta" na conta do ano, "Quanto custa por ano?" no gasto fixo mensal, "Quanto economizo se quitar antes?" no financiamento e na compra parcelada, "Calcular multa e juros" na conta vencida, "Dividir estas contas" na lista de gastos fixos e "Enquanto isso, dividir as contas da casa" na Família sem vínculo (fora do Resumo)
- [x] "Anotar como parcelamento" e "Anotar como gasto fixo" depois do resultado; `/gastos-fixos/novo?tipo=parcelada` aceita `parcelas` de 2 a 480 e `natureza`
- [x] Cadastro aberto por "Anotar como parcelamento" com "Parcelado", o valor da parcela, o total de parcelas e "Compra parcelada" preenchidos (conferido no roteiro web)
- [x] "Já paguei" nas contas a vencer do mês em Contas a pagar, com "Confirmar pagamento", "Mudar valor ou data" e "Cancelar"; "Informar valor e pagar" nas estimadas; chave de operação e conferência do resultado incerto, sem segundo pagamento
- [x] "Por categoria" na composição de Pago, com barras que somam Pago e 100%
- [x] "Somar valores" em todos os campos Valor (gasto e recebimento, conta a pagar, pagamento, gasto fixo novo e edição, valor do ano e encerrar)
- [x] "Organizar" com 3 linhas e legendas com valores; medido em 360 × 640, os cards de totais ficam como estão (D-035(8))
- [x] Estados vazios com ação em Movimentações, Contas a pagar e na composição
- [x] Atalhos do ícone na versão web (manifesto com 4 atalhos) e, sem sessão, volta à tela pedida depois de entrar (endereço só em memória)
- [x] Roteiro web (`npm run test:web` e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js`, 923 verificações em cada um) com os passos do Ciclo A6 (spec4 §3) e as legendas novas do "Organizar". "Nada gravado" compara o repositório da pessoa (registros, contas a pagar de outubro e dezembro e gastos fixos) antes da primeira calculadora e depois da última, e antes e depois dos links de contexto; o atalho "Anotar gasto" aberto sem sessão volta ao Resumo por "Voltar", "Cancelar" e "Descartar alterações"
- [ ] Teste manual em iOS, Android e web, com e sem movimento reduzido e com leitor de tela (teclados decimal e numérico, anúncio do resultado e do total da soma no VoiceOver e no TalkBack, foco do leitor de tela no campo Valor depois de "Usar o total", vibração depois de "Já paguei" e as contas com BigInt no Hermes)
- [ ] Conferir a página do Portal do Investidor (CVM) e completar `RESERVA_REFERENCIA` com o texto de 6 a 12 meses, o endereço e a data, para a reserva mostrar o link

## Ciclo A4: seus últimos meses (D-030)

Rodados em 09/10/2026, depois das correções da revisão: `npm test` (23 arquivos, 391 testes), `npm run typecheck`, `npm run test:db` (10, 20, 30, 40, 45 e 47), `npm run test:api` (60 testes), `npm run test:web` (1191 verificações) e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js` (1192). Nas duas rodadas do roteiro web, os passos do A4 passam (telas 72 a 85 e 93 a 95); o que falta do ciclo está nos itens abertos abaixo.

- [x] Banco: atividade por pessoa e contexto mantida por gatilho, decisão da revisão, `create_series_occurrence`, `decide_return_review` e `months_overview`, com carga inicial da atividade de quem já usava o app (migração `20261009000001_retorno.sql`), e testes de leitura só pela própria pessoa, permissões, guardas, privilégios e das sequências de aceite R e R7 (`supabase/tests/47_retorno.sql`)
- [x] Core: ausência, período, contas sem registro, montagem da revisão, ações, lote, modo "Dia" e todos os textos (`retorno.ts`); `MemoryRepository` com o mesmo gatilho e as mesmas funções; cenário de demonstração "retorno", fictício e identificado, sem mudar a demonstração padrão (`retorno.test.ts`, 41 testes)
- [x] App ligado ao banco (`SupabaseRepository`), com testes pela API: revisão igual à do core, cada conta sem registro aceita, "Atualizar agora" com os totais da sequência R, reconciliação de `criar_ocorrencia` e decisão
- [x] Faixa "Seus últimos meses" no Resumo, no lugar dos avisos temporários, só no Pessoal e no mês atual, sem valores; com ela, o card "Primeiros passos" espera
- [x] `/retomar` (resumo mês a mês, "Atualizar agora" e "Seguir adiante"), `/retomar/atualizar` (passo a passo, "Já paguei", "Não houve", "Ainda não paguei", grupos por ano, lote "pagas no vencimento", "Desfazer", "Concluir") e `/retomar/pagar` (registrar e pagar uma conta sem registro, com "Salvar de novo")
- [x] Formulário no modo "Dia" ("Junho tem 30 dias.", "Salvar e anotar outro", aviso de gasto fixo sem conta no mês)
- [x] "Nada anotado em junho." no Resumo de meses fechados; "Registrar este mês" e "Registrar esta parcela" no detalhe de gasto fixo e de parcelamento, com "Sem conta registrada: N" no progresso; linha nova em "Quem vê estes dados?"; tema "Mês sem registro" em Aprender
- [x] Em Contas a pagar, com a faixa ativa, "Ver resumo dos últimos meses" no lugar de "Revisar vencidas" na faixa de contas criadas vencidas, que abre `/retomar` (roteiro web)
- [x] No detalhe da conta do ano, "Registrar parcelas" (uma folha com uma linha por parcela) no lugar do texto do A3 com "Anotar gasto" ("2027: parcelas 6 a 10 sem conta registrada."), só para os 11 meses fechados, e "Por que este mês não tem conta?"; pagar uma parcela que outro aparelho já registrou paga a que existe (roteiro web, telas 94 e 95)
- [x] Demonstração: escolher o cenário "retorno" por `?cenario=retorno` (`lib/demo-auth.ts`), só no modo de demonstração
- [x] Roteiro web (`npm run test:web` e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js`, 1191 e 1192 verificações) com os passos da `spec3` §2.10 e as correções da revisão: modo "Dia" com o campo de 44 px e "Usar outra data" voltando ao passo, "/retomar" sem revisão ativa, "Registrar parcelas" na conta do ano, pagar uma conta que outro aparelho já registrou, aviso de gasto solto em conta do ano, "Não houve" com valor estimado e "Registrar esta parcela" pagando
- [ ] **Você:** colar `supabase/migrations/20261009000001_retorno.sql` no SQL Editor do Supabase, depois da 0004 (`docs/05_SUPABASE.md`, passo 6)
- [ ] Revisão dos textos por Enzo antes de publicar (tom sem cobrança)
- [ ] Teste manual em iOS, Android e web, com leitor de tela na faixa, nas linhas e no lote, com movimento reduzido e em dois aparelhos (decidir num e conferir no outro)

## Ciclo A5: Aprender e dúvidas (D-031, D-032)

Sem mudança no banco. Rodados em 09/10/2026, depois das correções da revisão: `npm test` (23 arquivos, 391 testes), `npm run typecheck`, `npm run test:db`, `npm run test:api` (60 testes), `npm run test:web` (1191 verificações) e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js` (1192). Nas duas rodadas do roteiro web, os passos do A5 passam (telas 86 a 92 e 96).

- [x] Core: módulo `learn` com os 37 temas (35 publicados e 2 rascunhos), seções, "Comece por aqui", busca, tempo de leitura, números dos exemplos, validação do catálogo e textos da interface (`learn-catalog.test.ts`, `learn-search.test.ts`, `learn-links.test.ts` e `copy.test.ts` ampliado)
- [x] Conferência das fontes por busca na web em 09/10/2026, com o endereço, o trecho e a data de cada fato (`docs/09_APRENDER.md`); "Taxa, tarifa e encargo" publicado; "Orçamento e a referência 50-30-20" em rascunho
- [x] Aba "Aprender e dúvidas": busca, card "Calculadoras", "Comece por aqui", atalhos "Ir para", cinco seções, dúvidas frequentes que abrem no lugar e rodapé; nome acessível da aba "Aprender e dúvidas"
- [x] Explicação ampliada: seção e tempo de leitura, exemplo, "Ver a conta", hipóteses, "No Clarevo", "Fazer a conta com os seus números", temas relacionados, fontes com link e data, "Revisado em", aviso educativo e "Voltar à tarefa" ou "Voltar para Aprender"; apelidos e "Este conteúdo não está disponível."
- [x] "O que é isso?" (`TermHint`) e links contextuais nas telas da `spec3` §3.7; todos os links por `explanationHref`; `lib/topics.ts` removido
- [x] Ilustrações por seção, sem o símbolo C, e o token `accentTint`
- [x] Roteiro web (`npm run test:web` e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js`, 1191 e 1192 verificações) com os passos da `spec3` §3.13, já ajustado às três conferências exatas que os links novos mudaram (seção Vencidas e seção Contas do ano em Gastos fixos), com a região viva da busca e o "Ver a conta" de "Contas que mudam de valor"
- [ ] Publicar "Orçamento e a referência 50-30-20" depois de conferir a divisão no próprio livro ou na editora (`docs/09_APRENDER.md`)
- [ ] Publicar "Como apagar meus dados?" depois de P-023
- [ ] Abrir as páginas oficiais quando a rede permitir e conferir as ressalvas listadas em `docs/09_APRENDER.md`
- [ ] Revisar IOF, rotativo e cheque especial até 09/04/2027 e os demais temas com fonte externa até 09/10/2027 (o teste avisa 30 dias antes)
- [ ] Teste manual em iOS, Android e web, com leitor de tela (anúncio da contagem da busca, "O que é isso?", foco em "Ir para"), movimento reduzido e texto a 200%

## Próximos ciclos

Nesta ordem (D-023 com a mudança de D-034). Os Ciclos A6, A4 e A5, que vinham primeiro, estão nas seções acima.

- **A2. Lembretes de contas a pagar:** aviso local no aparelho no dia anterior ao vencimento, sem valor nem descrição na tela bloqueada (P-011). Exige build de desenvolvimento e teste em aparelho. Pode correr em paralelo aos outros ciclos.
- **B. Renda comprometida:** quanto da renda de referência já tem destino no mês, com gastos fixos, contas do ano, parcelamentos e outras contas, sem cor de alerta; decidir antes a reserva para contas do ano (P-019).
- **C. Metas e reserva para imprevistos:** aba Metas com reserva, metas, aportes, resgates e atualizações registrados; a média de gastos essenciais não conta os pagamentos de contas do ano.
- **D. Simulador:** quanto guardar por mês, em quanto tempo e quanto posso ter, com a taxa digitada pela pessoa; só simulação, sem indicar produto, e só informação pública já disponível (D-034).

## Ciclo 2: família

Convite com permissões e validade, aceite, saída e revogação; "Quem vê estes dados?" com nomes e permissões reais; contas a pagar, gastos fixos e contas do ano na Família, depois de decidir P-012.

## Ciclo 3: cartões

Cartão e fatura sem contar duas vezes, com as parcelas de compras no cartão. A recorrência de contas a pagar foi para o Ciclo A, e lembretes e metas foram para os Ciclos A2 e C (D-023).

## Ciclo 4: benefício empresarial e comercialização

Convite empresarial, vagas e licenças; tela "Acesso pelo benefício da sua empresa"; painel simples sem dados financeiros; cobrança.

## O que só você pode providenciar

| Item | Para quê | Custo aproximado |
|---|---|---|
| Conta Supabase | Login e dados reais | Gratuito para começar |
| Provedor de e-mail (ex.: Resend) e domínio | E-mails de confirmação e recuperação com a marca | Gratuito no início; domínio ~R$ 40 a 150/ano |
| Conta Expo | Builds e publicação | Gratuito para começar |
| Apple Developer (preferencialmente em CNPJ) | Publicar no iPhone | US$ 99/ano |
| Google Play Console | Publicar no Android | US$ 25, uma vez |
| Busca de anterioridade da marca no INPI | Evitar conflito de nome | Taxa INPI + eventual assessoria |
