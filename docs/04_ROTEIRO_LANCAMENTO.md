# Roteiro até o lançamento

Atualizado em 10/10/2026. Prazos são estimativas de trabalho, não compromissos; dependem das decisões pendentes.

Ordem a partir de 08/10/2026 (D-023, D-029, D-033 e D-034): o Ciclo A, o Ciclo A3 (contas do ano) e os Primeiros passos com os atalhos em Movimentações estão feitos. O Ciclo A6 ("Achar tudo" e calculadoras, D-035) está implementado e no roteiro web, com o teste manual em aberto. Os Ciclos A4 (seus últimos meses, D-030) e A5 (Aprender e dúvidas, D-031 e D-032) estão implementados e no roteiro web, com os itens abertos de cada seção abaixo. Em 09/10/2026 foram implementados os Ciclos A2 (lembretes, ocultar valores e biometria, D-025), B (renda comprometida, D-026), C (metas e reserva, D-027, com o plano de guardar, D-036) e D (simulador, D-028), todos antes do Ciclo 2 (família). Neles, o que falta é o mesmo em todos: o teste em aparelho, que fica para depois de o app estar pronto (as migrações 0006 e 0007 foram coladas e conferidas no Supabase em 10/10/2026). Em 10/10/2026 foi implementado também o Ciclo E (cartões de crédito e faturas, D-037, e leitura de notas fiscais, D-038), com a migração 0008 ainda por colar no Supabase. Também em 10/10/2026 entrou a navegação (D-039): "Anotar gasto" logo abaixo do cabeçalho do Resumo, a barra inferior nas telas de consulta, Contas a pagar no mês certo, Metas compacta e a busca "No app" de Aprender, na seção do Ciclo E abaixo. O roteiro web (`scripts/e2e-web.js`) já cobre as telas novas. Cada ciclo começa depois de o anterior passar em `npm test`, `npm run typecheck`, `npm run test:db`, `npm run test:api` e `npm run test:web`.

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

- [x] Card "Primeiros passos" no Resumo, antes de "Anotar gasto" (desde D-039, depois dele): três passos (gastos fixos, recebimento do mês e gasto já pago) com sinal de concluído e "Agora não"; só no Pessoal e no mês corrente, nunca na demonstração com dados; some de vez ao concluir ou dispensar
- [x] Bloco "Organizar" em Movimentações com "Contas a pagar" e "Gastos fixos e parcelamentos"
- [x] Passos do card e do bloco "Organizar" no roteiro web (`npm run test:web`)
- [ ] Teste manual em iOS, Android e web, com e sem movimento reduzido e com leitor de tela

## Achar tudo e calculadoras (D-034, D-035)

Sem mudança no banco. Nas telas, os fluxos estão no roteiro web (`scripts/e2e-web.js`, telas 56 a 71 de `docs/telas`), que passa também com movimento reduzido.

- [x] Core: `learn/math.ts` adiantado do Ciclo A5 (contas exatas em centavos e pontos-base, com os vetores da `spec3` §3.11 conferidos à parte com frações em Python), as 8 calculadoras com textos, faixas e mensagens, os links de contexto, "Somar valores", "Por categoria", "Já paguei" e as legendas do "Organizar"; teste de textos ampliado às calculadoras (`npm test`: 19 arquivos, 316 testes; `npm run typecheck`)
- [x] Tela "Calculadoras" (`/calcular`) com abertura e aviso visíveis sem rolar em 360 px, 3 grupos e as 8 calculadoras em `/calcular/<nome>`: resultado enquanto a pessoa digita, anunciado ao leitor de tela, hipóteses logo abaixo, chips de 48 px e nada gravado
- [x] Portas: linha "Calculadoras" no "Organizar" de Movimentações, card "Calculadoras" no topo de Aprender e card "Enquanto isso, faça as contas" em Metas (o card de Metas foi substituído pela aba Metas completa do Ciclo C, que mantém um acesso a "Calculadoras")
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
- [ ] Completar `RESERVA_REFERENCIA` da calculadora de reserva com o texto de 6 a 12 meses, o endereço e a data da página do Portal do Investidor (CVM): a tela `/reserva` do Ciclo C já mostra a referência conferida, com fonte e data, mas a calculadora ainda mostra o texto sem link e sem número

## Ciclo A4: seus últimos meses (D-030)

Rodados em 09/10/2026, depois das correções da revisão: `npm test` (23 arquivos, 391 testes), `npm run typecheck`, `npm run test:db` (10, 20, 30, 40, 45 e 47), `npm run test:api` (60 testes), `npm run test:web` (1191 verificações) e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js` (1192). Nas duas rodadas do roteiro web, os passos do A4 passam (telas 72 a 85 e 93 a 95); o que falta do ciclo está nos itens abertos abaixo.

- [x] Banco: atividade por pessoa e contexto mantida por gatilho, decisão da revisão, `create_series_occurrence`, `decide_return_review` e `months_overview`, com carga inicial da atividade de quem já usava o app (migração `20261009000001_retorno.sql`), e testes de leitura só pela própria pessoa, permissões, guardas, privilégios e das sequências de aceite R e R7 (`supabase/tests/47_retorno.sql`)
- [x] Core: ausência, período, contas sem registro, montagem da revisão, ações, lote, modo "Dia" e todos os textos (`retorno.ts`); `MemoryRepository` com o mesmo gatilho e as mesmas funções; cenário de demonstração "retorno", fictício e identificado, sem mudar a demonstração padrão (`retorno.test.ts`, 41 testes)
- [x] App ligado ao banco (`SupabaseRepository`), com testes pela API: revisão igual à do core, cada conta sem registro aceita, "Atualizar agora" com os totais da sequência R, reconciliação de `criar_ocorrencia` e decisão
- [x] Faixa "Seus últimos meses" no Resumo, no lugar dos avisos temporários (desde D-039, depois de "Anotar gasto"), só no Pessoal e no mês atual, sem valores; com ela, o card "Primeiros passos" espera
- [x] `/retomar` (resumo mês a mês, "Atualizar agora" e "Seguir adiante"), `/retomar/atualizar` (passo a passo, "Já paguei", "Não houve", "Ainda não paguei", grupos por ano, lote "pagas no vencimento", "Desfazer", "Concluir") e `/retomar/pagar` (registrar e pagar uma conta sem registro, com "Salvar de novo")
- [x] Formulário no modo "Dia" ("Junho tem 30 dias.", "Salvar e anotar outro", aviso de gasto fixo sem conta no mês)
- [x] "Nada anotado em junho." no Resumo de meses fechados; "Registrar este mês" e "Registrar esta parcela" no detalhe de gasto fixo e de parcelamento, com "Sem conta registrada: N" no progresso; linha nova em "Quem vê estes dados?"; tema "Mês sem registro" em Aprender
- [x] Em Contas a pagar, com a faixa ativa, "Ver resumo dos últimos meses" no lugar de "Revisar vencidas" na faixa de contas criadas vencidas, que abre `/retomar` (roteiro web)
- [x] No detalhe da conta do ano, "Registrar parcelas" (uma folha com uma linha por parcela) no lugar do texto do A3 com "Anotar gasto" ("2027: parcelas 6 a 10 sem conta registrada."), só para os 11 meses fechados, e "Por que este mês não tem conta?"; pagar uma parcela que outro aparelho já registrou paga a que existe (roteiro web, telas 94 e 95)
- [x] Demonstração: escolher o cenário "retorno" por `?cenario=retorno` (`lib/demo-auth.ts`), só no modo de demonstração
- [x] Roteiro web (`npm run test:web` e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js`, 1191 e 1192 verificações) com os passos da `spec3` §2.10 e as correções da revisão: modo "Dia" com o campo de 44 px e "Usar outra data" voltando ao passo, "/retomar" sem revisão ativa, "Registrar parcelas" na conta do ano, pagar uma conta que outro aparelho já registrou, aviso de gasto solto em conta do ano, "Não houve" com valor estimado e "Registrar esta parcela" pagando
- [x] **Você:** colar `supabase/migrations/20261009000001_retorno.sql` no SQL Editor do Supabase, depois da 0004 (`docs/05_SUPABASE.md`, passo 6; feito e conferido antes da publicação do Ciclo A4)
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

## Ciclo A2: lembretes, ocultar valores e biometria (D-025)

Sem mudança no banco. Última execução registrada pelas frentes de trabalho em 09/10/2026: `npm test` (30 arquivos, 599 testes) e `npm run typecheck` passando; o `npm run test:web` cobre o que o ciclo traz (item abaixo).

- [x] Core: `reminderPlan` (um aviso por dia na véspera do vencimento, no horário de 8h, 9h, 12h ou 19h, no máximo 30, sem valor, descrição nem identificador de conta) e os textos (`reminders.test.ts`, 11 testes)
- [x] App: "Lembretes de contas a pagar" e "Horário do aviso" em Conta, oferta depois do primeiro gasto fixo salvo, permissão do sistema só depois do toque, "Abrir configurações" quando negada, reagendamento ao abrir, ao voltar ao app e depois de escritas (módulo próprio, sem mexer em `state/data.ts`), toque no aviso abre Contas a pagar, ícone de notificação do Android em uma cor (`docs/marca/`) e o texto da web "Lembretes estão disponíveis no app para celular."
- [x] Ocultar valores: "Ocultar valores ao abrir" em Conta (também na web), olho no cabeçalho das abas quando cabe sem cortar o logotipo (a 390 px na demonstração não cabe, e o ocultar fica em Conta), "R$ ••••" e "valor oculto" para o leitor de tela em todos os valores de dados guardados, com a política e a guarda em `privacy-app.test.ts` (11 testes); varredura no navegador de todas as rotas, com valores ocultos, sem vazamento de valor
- [x] "Pedir biometria ao abrir" (desligado por padrão; só em aparelho com biometria cadastrada; senha do aparelho se a biometria falhar; nunca impede de sair da conta)
- [x] Roteiro web (`npm run test:web` e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js`, 1494 e 1495 verificações, ambos passando em 10/10/2026): texto da web em Conta e ocultar valores na web, sem erro e sem valor à vista
- [ ] Gerar o build de desenvolvimento (iOS e Android) para testar lembretes e biometria, que não existem na web
- [ ] **Você:** teste em aparelho, depois de o app estar pronto (Enzo, 08/10/2026: "O teste será feito, após o app estar pronto"): permissão só depois do toque, aviso no horário, texto sem valor, ícone em uma cor, pagar e reabrir reagenda, desligar cancela tudo, biometria com falha e com senha do aparelho, VoiceOver e TalkBack lendo "valor oculto"

## Ciclo B: renda comprometida (D-026)

Última execução registrada pelas frentes de trabalho em 09/10/2026: `npm test` (30 arquivos, 599 testes), `npm run typecheck`, `npm run test:db` (10, 20, 30, 40, 45, 47, 50, 60 e 65), `npm run test:api` (92 testes, com as sequências de B e C) e `npm run test:web`, que passa (item abaixo).

- [x] Banco: `income_references`, `set_income_reference`, `delete_income_reference` e `month_committed` (migração `20261009000002_renda_comprometida.sql`), com testes de permissão, validação, sequência de aceite, contas do ano, ações de `record_operations`, guarda e privilégios (`supabase/tests/50_renda_comprometida.sql`)
- [x] Core: comprometido por grupo, dívidas, percentual em milésimos, "Fora dos compromissos", renda de referência com vigência, sugestão, "Próximos meses" com "O que muda", linha das contas do ano fora do percentual (P-019), previsão dos pagamentos do mês e textos; repositório em memória com as mesmas regras e demonstração com renda de referência de R$ 6.000,00 (`committed.test.ts`, 30 testes)
- [x] App ligado ao banco (`SupabaseRepository`), com testes pela API: `month_committed` igual a `summarizeCommitted`, referências com versão e os códigos do core
- [x] Telas: a linha "Renda comprometida" dentro do card "Ainda a pagar" do Resumo (estrutura inalterada), `/renda-comprometida` (medidor, grupos, "Fora dos compromissos", recebido, contas do mês, "Próximos meses", "O que muda", "Como calculamos", metas fora do percentual), `/renda-comprometida/referencia` (sugestão, mês de início, "Minha renda varia", excluir) e a previsão dos pagamentos do mês em Contas a pagar; falha de carga mostra erro, nunca 0%
- [x] Temas "Renda comprometida e a referência de 30%" e "Quando a renda muda todo mês" em Aprender, com "O que é isso?" nas telas
- [x] **Você:** colar `supabase/migrations/20261009000002_renda_comprometida.sql` no SQL Editor do Supabase, depois da 0005 (`docs/05_SUPABASE.md`, passo 7; feito e conferido em 10/10/2026, `docs/07_PUBLICACAO_WEB.md`)
- [x] Roteiro web (`npm run test:web` e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js`, 1494 e 1495 verificações, ambos passando em 10/10/2026): linha "Renda comprometida em outubro" dentro de "Ainda a pagar" e a ordem dos títulos do Resumo (Anotar gasto, Ainda a pagar neste mês, Pagamentos do mês, Fatura sem contar duas vezes, Quem vê estes dados?); `/renda-comprometida` com legenda, grupos e "Fora dos compromissos"; novembro com a linha de dívidas; referência de R$ 5.000,00 a partir de outubro (69,0%); excluir as referências; falha simulada sem 0%; rótulo acessível do medidor; previsão em Contas a pagar; nenhum termo proibido
- [ ] Teste manual em iOS, Android e web, com e sem movimento reduzido e com leitor de tela (medidor, troca de mês e formulário da referência)

## Ciclo C: metas e reserva para imprevistos (D-027)

Mesmas execuções do Ciclo B. A migração é a `20261009000003_metas.sql`, que também traz o plano de guardar (seção seguinte).

- [x] Banco: `goals`, `goal_movements`, a visão `goal_items` e as sete funções de metas (migração `20261009000003_metas.sql`), com saldo diário nunca negativo, uma reserva por contexto, meta arquivada, exclusão em cascata lógica, totais intocados, permissões e privilégios (`supabase/tests/60_metas.sql`)
- [x] Core: progresso, valor por mês, mês previsto, gastos essenciais sem os pagamentos de contas do ano (P-017 resolvida), reserva, cobertura em meses, "Atualizar valor guardado", validação na ordem do banco e textos; repositório em memória e demonstração com a reserva (15%, 0,9 mês) e a "Viagem de férias" (20%, R$ 480,00 por mês), sem mudar os totais de outubro (`goals.test.ts`, 39 testes)
- [x] App ligado ao banco, com testes pela API (sequência de aceite C, `goal_items.saved_cents` igual a `goalSaved`, reconciliação de movimentos por `findGoalOperation`)
- [x] Telas: aba Metas ("Seu mês", reserva, metas, acesso a "Calculadoras"), `/reserva`, `/meta/nova`, `/meta/[id]` com editar, aportes, resgates, rendimento e "Atualizar valor guardado", "Criar reserva" na calculadora de reserva, a dica "Dinheiro guardado não é gasto" no formulário de gasto, as metas em `/renda-comprometida` (fora do percentual) e a linha nova em "Quem vê estes dados?"
- [x] Temas "O que muda ao registrar um aporte" e "Gastos essenciais" em Aprender
- [x] **Você:** colar `supabase/migrations/20261009000003_metas.sql` no SQL Editor do Supabase, depois da 0006 (`docs/05_SUPABASE.md`, passo 8; feito e conferido em 10/10/2026, `docs/07_PUBLICACAO_WEB.md`)
- [x] Roteiro web (`npm run test:web` e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js`, 1494 e 1495 verificações, ambos passando em 10/10/2026), já atualizado aos critérios que o ciclo mudou (reserva sem botão "Criar reserva", referência da reserva sem link, 40 temas publicados: 33 nas seções e 7 dúvidas), com: aba Metas da demonstração com o logotipo no cabeçalho (reserva 15% e "0,9 mês"; viagem 20% e R$ 480,00 por mês), calculadora com chips sem pré-seleção, aporte que anima a barra e não muda o Resumo, resgate retroativo recusado com a mensagem, movimento reduzido sem animação, aviso "Dinheiro guardado não é gasto", texto novo de "Quem vê estes dados?"
- [ ] Teste manual em iOS, Android e web, com e sem movimento reduzido e com leitor de tela (barra de progresso, formulários de movimento e exclusão)
- [ ] Opcional, sem ciclo: meta "Contas do ano" pré-preenchida com o valor do ano dividido por 12 (a recomendação de P-019 previa; não entrou)

## Plano de guardar (D-036), dentro do Ciclo C

- [x] Banco: `savings_checks` e `set_savings_answer` na migração 0007, com datas de voltar a perguntar calculadas no banco, leitura só pela própria pessoa, resposta que não conta como atividade e privilégios (`supabase/tests/65_guardar.sql`)
- [x] Core: quando perguntar, plano em etapas (reserva de 1, 3 e 6 meses dos gastos essenciais e metas por prazo), "Usar este plano", reserva mínima a partir de R$ 100,00, passos pequenos e textos; repositório em memória e demonstração com a resposta "consigo" de R$ 500,00 (`savings.test.ts`, 45 testes)
- [x] App ligado ao banco, com testes pela API (responder, repetir a chave, versão e outra pessoa sem leitura)
- [x] Telas: o card da pergunta no topo da aba Metas, `/guardar` (plano, escolha da etapa e "Usar este plano"), `/guardar/minima` (reserva mínima e passos pequenos) e o 4º passo, "Planejar quanto guardar", no card "Primeiros passos" do Resumo (a conta nova passa a ter quatro passos); a reconciliação de resultado incerto repete a mesma chave
- [x] Roteiro web (`npm run test:web` e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js`, 1494 e 1495 verificações, ambos passando em 10/10/2026): os quatro passos em "Primeiros passos", as três respostas, o plano de R$ 300,00 e de R$ 500,00 por mês, a reserva mínima (e depois "consigo"), a volta da pergunta quando a renda de referência muda e o fim dela depois de "Manter o valor" e de "Mudar valor"
- [ ] Revisão dos textos por Enzo antes de publicar (tom sem cobrança, sem "você deveria")

## Ciclo D: simulador (D-028)

Sem mudança no banco. Mesmas execuções do Ciclo B, mais `simulate.test.ts` (35 testes) dentro do `npm test`.

- [x] Core: contas com taxa digitada (aportes no início de cada mês, resposta "a" de Enzo em 09/10/2026), três modos, formulário e erros na ordem da tela, hipóteses (`previewHypotheses`), ano a ano, "Criar meta com estes valores" sem a taxa, links de contexto e textos
- [x] Tela `/simular`: aviso fixo e abertura visíveis sem rolar a 360 × 640, taxa vazia por padrão, resultado sem rendimento ao lado, gráfico por ano com tabela equivalente, nada gravado; conferida no navegador em 390, 360 e 320 px, com movimento reduzido
- [x] Entradas: aba Metas ("Simular um plano"), detalhe da meta ("Simular com rendimento"), calculadora "Juntar para um objetivo" ("Simular com rendimento"), atalho "Simular" no topo de "Dinheiro no tempo" em Aprender, o tema "Como ler uma simulação" e o endereço direto
- [ ] Abrir a Calculadora do Cidadão, do Banco Central, e comparar um resultado de "Aplicação com depósitos regulares" com o do simulador, com tolerância de 1 centavo: a página só foi vista por trecho de busca (`docs/02`)
- [x] Roteiro web (`npm run test:web` e `REDUZIR_MOVIMENTO=1 node scripts/e2e-web.js`, 1494 e 1495 verificações, ambos passando em 10/10/2026), com os passos do Ciclo D: taxa vazia por padrão; resultado sem rendimento ao lado; aviso e abertura sem rolagem em 360 px; tabela ano a ano; "Criar meta com estes valores" sem a taxa no endereço; as quatro entradas e o endereço direto; o aviso dentro do cartão do resultado; nenhum termo proibido
- [ ] Decidir com Enzo: "hipóteses e aviso visíveis sem rolagem em 360 px" vale só para o aviso e a abertura; as hipóteses ficam abaixo do formulário. Subir as hipóteses para antes dos campos empurra os campos para baixo
- [ ] Teste manual em iOS, Android e web, com e sem movimento reduzido e com leitor de tela (anúncio do resultado e rolagem até ele, teclado numérico, tabela ano a ano)


## Ciclo E: cartões de crédito e leitura de notas fiscais (D-037, D-038)

Última execução registrada pelas frentes de trabalho em 10/10/2026, depois da junção do passo 3: `npm test` (37 arquivos, 803 testes), `npm run typecheck` (core e app sem erros), `npm run test:db` (OK, com `70_cartoes.sql`), `npm run test:api` (110 testes) e `npm run test:web` (1859 verificações; com `REDUZIR_MOVIMENTO=1`, 1860), esta última com os blocos "Ciclo E · Cartões" e "Ciclo E · Notas" (134 verificações).

- [x] Banco: `cards`, `card_entries`, as visões `card_items`, `invoice_items`, `card_entry_items` e `receipt_items`, as 11 funções de cartão, a conta da fatura mantida na mesma transação, a chave da nota como resumo SHA-256, `conta_de_fatura` nas funções de contas a pagar e `pagamento_de_fatura` em `update_record` e `delete_record` (migração `20261010000001_cartoes.sql`), com testes de permissão, validação, sequência de aceite, invariantes C1 a C6, atividade, desempenho e privilégios (`supabase/tests/70_cartoes.sql`)
- [x] Core: datas da fatura, parcelas com o resto na primeira, total, pagamento parcial e saldo anterior, pagar só depois do fechamento, crédito levado adiante, limite usado, "Por categoria" com faturas, grupo "Faturas de cartão" na renda comprometida, validação na ordem do banco e textos (`cards.ts`); repositório em memória com as mesmas regras e demonstração com o "Cartão Exemplo", sem mudar os totais de outubro (`cards.test.ts`)
- [x] Core: QR da NFC-e e chave (`nota.ts`), DANFE (`danfe.ts`), página da Sefaz-RJ (`sefaz-page.ts`), regras do formulário (`nota-flow.ts`) e SHA-256 em JavaScript puro (`sha256.ts`), conferidos em Hermes e em Node
- [x] App ligado ao banco (`SupabaseRepository`), com testes pela API
- [x] Telas de cartões: `/cartoes`, `/cartoes/novo`, `/cartoes/[id]`, `/cartoes/[id]/editar`, a fatura com pagar, encargo, estorno e editar compra, "Cartões" em Movimentações › Organizar, "Abrir fatura" em Contas a pagar, em Seus últimos meses e no detalhe do registro, grupo "Faturas de cartão" em `/renda-comprometida` e "Encargos do cartão" em "Por categoria"
- [x] Anotar gasto: "Como você pagou?" depois do Valor, "Em quantas vezes?" até 48 e o aviso da fatura; a compra no cartão leva à fatura
- [x] Anotar gasto: "Escanear nota fiscal" com câmera, PDF e colar, bloco "Nota lida", aviso de nota já anotada, descrição "Como da última vez nesta loja", leitura da página da Sefaz-RJ no celular e nota de exemplo só na demonstração
- [x] Roteiro web com os passos do cartão e das notas; a câmera e a página real da Sefaz ficam de fora do roteiro, que lê o campo "Colar o link ou a chave", um PDF sintético e uma página sintética entregue por um gancho que só existe no roteiro
- [x] **Você:** colar `supabase/migrations/20261010000001_cartoes.sql` no SQL Editor do Supabase, depois da 0007, conferir com a consulta do passo 13 de `docs/05_SUPABASE.md` (11 funções, 2 tabelas e 1 visão) e recarregar o esquema (`docs/05_SUPABASE.md`, passo 9), antes de o Ciclo E entrar na `main` (feito e conferido em 10/10/2026, `docs/07_PUBLICACAO_WEB.md`)
- [ ] **Você:** aceite com notas reais (P-025): de 5 a 10 cupons do RJ para a página da Sefaz e o formato dos QR, e DANFEs de compras online (Mercado Livre, Amazon) para `danfeFromText`
- [ ] Teste em aparelho (iOS e Android): câmera, permissão, lanterna, vibração, seletor de arquivos, Hermes com `Intl` real, o tamanho do `unpdf` (cerca de 3,1 MB de bytecode) e o atraso de 450 ms do iOS entre a folha e a câmera
- [ ] Compartilhar o PDF de outro app direto para o Clarevo (folha de compartilhamento), quando houver build das lojas
- [x] Aprender: tema `fatura` com `CARDS_TEXT.topicParagraph` e `rotativo-cartao` com `CARDS_TEXT.rotativoParagraph` (10/10/2026, `docs/09_APRENDER.md`)
- [ ] Aprender: escrever o tema "Ler nota fiscal" com fonte (a busca já leva "nota", "cupom" e "QR" a "Escanear nota fiscal" pelo grupo "No app", D-039); incluir PDF.js (Apache-2.0) e `unpdf` (MIT) na tela de licenças
- [ ] Fora da entrega do passo 3: atalho `?ler=nota` do ícone, linha da nota em Primeiros passos e o aviso de "conta já anotada" para toda conta em aberto (`docs/10` §2.3 e §2.5)
- [ ] Revisão dos textos por Enzo antes de publicar (tom sem cobrança e sem julgamento)

### Navegação (D-039, `docs/10_NAVEGACAO.md`), junto do Ciclo E

Sem mudança no banco. Regras no core (`packages/core/src/navigation.ts`, `navigation.test.ts`), barra em `apps/app/src/components/tab-bar.tsx` e `apps/app/src/lib/bar-inset.ts`.

- [x] Resumo: "Anotar gasto" sempre logo abaixo do cabeçalho azul (y 408 a 460 em 390 × 844 e em 320 px), com a faixa "Seus últimos meses", o card "Primeiros passos" e as confirmações depois dele (Enzo: "Sim"; muda D-030(3) e D-033(1))
- [x] Resumo: "Ver contas ›" no card "Ainda a pagar", numa linha só também em 320 px, e "›" ao lado de "Recebido" e "Pago" (Enzo: "Sim"; responde a D-034(4))
- [x] Barra inferior à vista em toda tela de consulta (Calculadoras, Contas a pagar e o detalhe, Gastos fixos, Cartões e a fatura, detalhe do registro, composição, Renda comprometida, detalhe da reserva e da meta, Simular, explicação de um tema, Seus últimos meses, Conta), com a aba de origem marcada, sem barra dupla nem salto ao abrir e fora da frente do teclado; sem barra nos formulários e nas telas de passo a passo com rodapé fixo (`/reserva`, `/guardar`, `/guardar/minima`, `/retomar/atualizar`, `/retomar/pagar` e `/a-pagar/vencidas`)
- [x] Contas a pagar: seletor de mês local (sem limite para trás, 12 meses à frente), entradas "de agora" no mês atual, cards com o mês no endereço, "Revisar vencidas" com 1 vencida, "Já paguei" no detalhe, previsão e critério do total depois das listas e a linha de lembretes (celular, fora da demonstração, lembretes desligados) que abre Conta no card de lembretes
- [x] Metas compacta: pergunta de 186 px em 360 × 640, plano de guardar dentro do card da reserva (com ou sem reserva), "Calcular minha reserva" à vista acima da barra e o card "Fazer as contas"
- [x] Aprender: "Buscar um tema ou uma função" e o grupo "No app" com 20 telas do app (`docs/09_APRENDER.md`); nome acessível da aba "Movimentos: movimentações do mês"
- [x] Roteiro web: bloco "Navegação (D-039)" em `scripts/e2e-web.js`, conferido em 390 e 320 px de largura e, nos casos de altura curta, em 360 × 640 e 320 × 640
- [ ] **Você:** decidir se a conta vencida passa a 3 toques contando a confirmação, com "Já paguei" na própria linha da vencida (muda D-035(5)); hoje são 4 toques (D-039(6))
- [ ] **Você:** confirmar que `/reserva`, `/guardar`, `/guardar/minima`, `/retomar/atualizar`, `/retomar/pagar` e `/a-pagar/vencidas` ficam sem a barra (D-039(4)); confirmar o card "Seu mês" depois de "Suas metas" e o título "Marcar como paga" na tela de pagamento
- [ ] "Nova conta do ano" no topo da lista de Gastos fixos (`docs/10` A16), não feito
- [ ] Itens de `docs/10` que D-039 não trata (A3, A4, A10, A13 a A15, o resto de A18, A19, A20, A22 a A25 e B3 a B6): decidir a ordem e conferir no código o que o Ciclo E já entregou
- [ ] Teste em aparelho (iOS e Android): barra sobreposta e a altura reservada na rolagem, barra escondida com o teclado aberto, lembretes ligados pela linha de Contas a pagar e a rolagem de Conta até o card

## Próximos ciclos

Os Ciclos A6, A4, A5, A2, B, C, D e E, que vinham primeiro (D-023 com a mudança de D-034), estão nas seções acima. Seguem a Família (Ciclo 2) e o benefício empresarial, abaixo.

## Ciclo 2: família

Convite com permissões e validade, aceite, saída e revogação; "Quem vê estes dados?" com nomes e permissões reais; contas a pagar, gastos fixos e contas do ano na Família, depois de decidir P-012.

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
