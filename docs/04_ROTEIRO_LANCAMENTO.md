# Roteiro até o lançamento

Atualizado em 08/10/2026. Prazos são estimativas de trabalho, não compromissos; dependem das decisões pendentes.

Ordem a partir de 08/10/2026 (D-023 e D-029): Ciclo A, depois o Ciclo A3 (contas do ano), antes do Ciclo B. A especificação de 08/10/2026 propõe em seguida os Ciclos A4 (seus últimos meses) e A5 (Aprender e dúvidas) e depois B, C e D, todos antes do Ciclo 2 (família); as decisões do A4 e do A5 são registradas ao iniciar cada um. Cada ciclo começa depois de o anterior passar em `npm test`, `npm run typecheck`, `npm run test:db`, `npm run test:api` e `npm run test:web`; A2 pode correr em paralelo, porque não mexe no banco.

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
- [ ] **Você:** criar o projeto Supabase (`docs/05_SUPABASE.md`, ~15 min)
- [ ] Ligar o app ao Supabase e repetir os testes com e-mail real
- [ ] Testar em celular (Expo Go) com teclado aberto e texto ampliado
- [ ] Publicar a versão web para o investidor

## Ciclo A: gastos fixos e parcelamentos (D-023, D-024)

- [x] Banco: séries, vigências e contas de cada mês (migração `20261008000001_gastos_fixos.sql`), com testes de permissão, invariantes e sequência de aceite
- [x] Core: vencimentos, geração, prévia, "esta e as próximas", encerrar, retomar, excluir, progresso do parcelamento, valor estimado e avisos contra contar duas vezes; repositório em memória e demonstração com Aluguel, Luz e Financiamento do carro
- [x] App ligado ao banco (`SupabaseRepository`) com testes pela API
- [x] Telas: lista "Gastos fixos e parcelamentos", cadastro (todo mês ou parcelado), detalhe, "esta e as próximas", encerrar ou retomar
- [x] Telas: "Com que frequência?" em Anotar conta a pagar, revisar contas vencidas, rótulos e "Informar o valor da conta" nas contas de série, "Repetir todo mês" e "Tornar gasto fixo", explicações em Aprender
- [x] Roteiro web (`npm run test:web`) com os passos do Ciclo A
- [ ] Teste manual em iOS, Android e web, com e sem movimento reduzido e com leitor de tela

## Ciclo A3: contas do ano (D-029)

- [x] Banco: tipo `anual` com parcelas por ano, geração do ano inteiro dois meses antes do primeiro vencimento, "Informar o valor do ano" e "Tirar as parcelas do ano" (migração `20261008000002_contas_do_ano.sql`), com testes de permissão, privilégios, invariantes, ausência longa, limite de 100 e sequência de aceite (`supabase/tests/45_contas_do_ano.sql`)
- [x] Core: mês, vencimento e numeração por ano, geração, cadastro e prévia, "Ano a ano", informar, tirar, "Paguei o ano todo de uma vez", sugestão de referência, grupos por ano e soma "Por ano"; repositório em memória e demonstração com IPVA e IPTU, sem mudar os totais de outubro, novembro e dezembro de 2026
- [x] App ligado ao banco (`SupabaseRepository`) com testes pela API, inclusive a sequência de aceite e a ausência longa
- [x] Telas: "Todo ano" em Anotar conta a pagar e no cadastro, seção "Contas do ano" em Gastos fixos, detalhe com "Ano a ano", "Informar o valor de 2027", tirar as parcelas do ano, "Paguei o ano todo de uma vez", grupos por ano em Próximos meses e em Contas vencidas, "Repetir todo ano", "Mudar a forma de pagamento", "Quem vê estes dados?" e o tema "Contas do ano" em Aprender
- [ ] Roteiro web (`npm run test:web`) com os passos do Ciclo A3 e os ajustes que a demonstração nova e a ordem dos chips "Todo mês · Todo ano · Parcelado" pedem nos passos do Ciclo A
- [ ] Teste manual em iOS, Android e web, com e sem movimento reduzido e com leitor de tela (formulário anual, grupo por ano e "Informar")

## Próximos ciclos

- **A4. Seus últimos meses:** depois de um tempo sem anotar, uma faixa discreta no Resumo oferece um resumo mês a mês do que ficou sem registro (contas em aberto e meses sem conta de gastos fixos, parcelamentos e contas do ano), com "Atualizar agora" ou "Seguir adiante"; nada é preenchido sozinho, e não há notificação nem e-mail. Proposto na especificação de 08/10/2026; a decisão (D-030) é registrada ao iniciar o ciclo, depois da resposta de Enzo.
- **A5. Aprender e dúvidas:** aba com busca, cinco seções e temas curtos com exemplo fictício, fonte com data e "Revisado em", mais o "O que é isso?" nas telas, sem indicar produtos. Pedido de Enzo de 08/10/2026; as decisões (D-031 e D-032) são registradas ao iniciar o ciclo.
- **A2. Lembretes de contas a pagar:** aviso local no aparelho no dia anterior ao vencimento, sem valor nem descrição na tela bloqueada (P-011). Exige build de desenvolvimento e teste em aparelho. Pode correr em paralelo aos outros ciclos.
- **B. Renda comprometida:** quanto da renda de referência já tem destino no mês, com gastos fixos, contas do ano, parcelamentos e outras contas, sem cor de alerta; decidir antes a reserva para contas do ano (P-019).
- **C. Metas e reserva para imprevistos:** aba Metas com reserva, metas, aportes, resgates e atualizações registrados; a média de gastos essenciais não conta os pagamentos de contas do ano.
- **D. Simulador:** quanto guardar por mês, em quanto tempo e quanto posso ter, com a taxa digitada pela pessoa; parecer jurídico antes do lançamento comercial.

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
