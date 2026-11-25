# 52 · Espaço Negócio (D-113)

Retorno de quem testa, decidido pelo Enzo em 17/11/2026. Pessoas com CNPJ ou que trabalham por conta (exemplos reais: uma loja de
conserto de ar-condicionado; a mãe que vende sacolé) misturam as contas pessoais com as do negócio. O Enzo escolheu um **espaço
separado** ("Espaço Negócio", e não uma marca nos lançamentos), **incluído no plano Individual** (um negócio por pessoa, sem custo a
mais). A Elis pediu que seja **leve e não vire contabilidade**: a pessoa dá o nome do negócio, anota o que entrou e o que saiu e vê,
numa visão separada, quanto entrou, quanto saiu e quanto sobrou, e se o negócio está rendendo mais do que custa, sem julgamento.

**D-113b (18/11/2026, retorno de quem testa).** No alto de Análises ("Pessoal · Novembro de 2026"), uma pessoa perguntou "Como eu mudo a
versão do pessoal para o de negócios?", e o espaço Negócio só se criava por um card de Conta. Pedido do Enzo, repassado pela coordenação:
deixar a troca de espaço à vista. Mudanças: o seletor de espaço sempre à vista nas abas, com o "+" e a folha "Criar um espaço"; a pílula
que troca o espaço nas telas de consulta; o card de Conta junto da Família; "Tem um negócio?" em "Primeiros passos"; e o nome "Seu negócio"
no lugar de "Como está o negócio" (detalhes na seção 1). Ainda sem linha própria em `docs/00`: registrar lá depois da confirmação do Enzo.

Migração: `supabase/migrations/20261117000004_espaco_negocio.sql` (0042). Núcleo: `packages/core/src/business.ts`. Telas:
`apps/app/src/app/negocio/` (index, novo, retirada, nome) e `apps/app/src/app/registro/[id]/mover.tsx`. Testes:
`supabase/tests/99zzzzzzzzzzzzzzzzzzzzz_negocio.sql`, `packages/core/test/business.test.ts` e o bloco "Espaço Negócio (D-113)" de
`scripts/e2e-web.js` (capturas 730 a 739 e, do seletor sempre à vista, 740 a 744).

## 1. O que a pessoa vê

- **Criar.** Três caminhos (D-113b, 18/11/2026): o "+" do seletor de espaço, no topo de Resumo, Movimentos e Metas, abre a folha "Criar
  um espaço" com "Espaço Negócio" ("Para quem tem CNPJ ou trabalha por conta.") e "Família"; a linha "Tem um negócio? Crie o espaço
  Negócio" no fim de "Primeiros passos" (conta nova, só para quem ainda não tem negócio, sem contar como passo); e, em Conta, o card
  "Espaço Negócio", logo depois da assinatura e ao lado do card da Família, que explica para quem é ("Para quem tem CNPJ ou trabalha por
  conta: anote o que entra e o que sai do negócio num espaço separado do Pessoal e veja quanto sobrou no mês. Incluído no plano, um
  negócio por pessoa."). Todos levam a "Criar o espaço Negócio": só o nome (1 a 60 caracteres, por exemplo "Sacolé da Mãe"). O negócio
  nasce com a "Conta do negócio" (bancos e carteira, D-043).
- **Seletor de espaço.** Sempre à vista nas abas que dependem do espaço (Resumo, Movimentos e Metas), mesmo só com o Pessoal (D-113b:
  numa conta só com o Pessoal, ele mostra "Pessoal" escolhido e o "+", enquanto houver um espaço para criar). O nome do negócio entra no
  seletor ao lado de "Pessoal" e da Família, se houver (nome longo cortado com reticências, inteiro no nome lido pelo leitor de tela).
  Investir é só do Pessoal e não tem o seletor. Com o negócio escolhido, as telas de sempre funcionam no negócio: gastos e recebimentos,
  contas a pagar, gastos fixos e parcelamentos, cartões (um cartão do negócio), bancos e carteira, importação de extrato e fatura,
  orçamento por categoria, calendário, busca, Análises e Evolução. A pílula do contexto diz o nome do negócio ("Salvando em Sacolé da
  Mãe"). Nas telas de consulta que leem o espaço (Análises, Calendário do mês, Evolução, Contas a pagar e Contas vencidas, Cartões,
  Orçamento, busca, Gastos fixos e assinaturas, a composição dos totais, Seu mês e Bancos e carteira em Conta), a pílula tem uma seta para
  baixo e abre a folha "Escolher o espaço": trocar ali troca o espaço do app todo, e a tela lê de novo os dados do espaço escolhido.
  Formulários e detalhes mantêm a pílula fixa (o espaço não muda no meio de um preenchimento).
- **Vocabulário do negócio (auditoria visual de 18/11/2026).** No espaço Negócio, as telas de sempre falam de entradas e saídas, como em
  "Seu negócio": no Resumo, "Sobrou" (com retirada no mês, "Ficou no negócio"), "Entrou" e "Saiu" (com retirada, "Saiu, com retiradas",
  porque ali a retirada conta como saída do negócio), "Saídas do mês" e "Anotar saída"; em Movimentos, "Entrou em outubro", "Saiu em
  outubro", "Anotar saída", "Anotar entrada", os filtros "Entradas" e "Saídas" e as linhas como "Saída" e "Entrada"; os formulários e o
  detalhe dizem "Anotar saída", "Editar entrada", "Data da saída". A renda comprometida (do Pessoal e da Família) não aparece no negócio,
  e "Gastos fixos e parcelamentos" dá exemplos do negócio (aluguel do ponto, DAS, maquininha, fornecedor). Ficam para depois, ainda com
  Recebido e Pago no negócio: a tela Evolução (os rádios "Recebido" e "Pago"), a composição dos totais, a busca e as mensagens de salvar
  e excluir (as Análises já dizem "Saiu em outubro de 2026").
- **Categorias do negócio.** Entradas: Vendas, Serviços, Outras entradas. Saídas: Material e mercadoria, Peças e ferramentas,
  Combustível e transporte, Funcionários e ajudantes, Impostos e DAS, Aluguel do ponto, Contas do ponto, Taxas e maquininha, Outras
  saídas. Sem subcategoria no negócio (para ficar leve). O orçamento do negócio usa as 9 de saída.
- **Seu negócio** (`/negocio`, também pelo card "Seu negócio" no Resumo do negócio e por "Ver seu negócio" em Conta; até 18/11/2026 a
  tela se chamava "Como está o negócio"): o mês com Entrou, Saiu e Sobrou numa cor só,
  a frase de fato ("Neste mês, entrou R$ 342,00 a mais do que saiu." ou "Neste mês, saiu R$ 300,00 a mais do que entrou."), as
  retiradas à parte, os últimos 6 meses (com a frase do período: "De maio a outubro de 2026, entrou mais do que saiu em 2 dos 2 meses
  com anotações. Somando, ...") e as maiores saídas do mês por categoria. Lembrete fixo: "Os valores são os que você anotou. A Clarevo não
  faz contabilidade nem cálculo de impostos."
- **Retirada para o Pessoal.** Quando a pessoa leva dinheiro do negócio para casa: o valor sai do negócio (gasto "Retirada para o
  Pessoal") e entra no Pessoal como recebimento ("Retirada do negócio"), os dois gravados juntos e ligados. Cada lado conta uma vez no
  próprio espaço (no Resumo do negócio, o dinheiro saiu; no Pessoal, entrou). Em "Seu negócio", a retirada **não entra em Saiu**
  (não é custo do negócio): aparece à parte ("Retiradas para o Pessoal: R$ 300,00. Não entram em Saiu: é o dinheiro do negócio que foi para
  o Pessoal.") com o que ficou no negócio. A retirada não se edita: exclui-se (os dois lados saem juntos) e anota-se de novo.
- **Mover.** No detalhe de um lançamento comum: "Mover para o espaço Negócio" (no Pessoal) ou "Mover para o Pessoal" (no negócio), para
  quem anotou no lugar errado, com a categoria e a conta do outro espaço. Lançamento ligado (conta a pagar, fatura, rendimento de
  investimento ou retirada) não muda de espaço.
- **Fora do negócio.** Metas e Investir mostram, no negócio, uma explicação curta e "Ir para o Pessoal". WhatsApp e Telegram não anotam
  no negócio (continuam no espaço ligado, Pessoal ou Família; dito na tela do negócio, e o banco recusa ligar um canal ao negócio, D-113a). Exportar meus dados ganha a escolha do espaço (Pessoal ou o negócio).
- **Nome e encerrar.** "Mudar o nome" e "Encerrar o espaço Negócio" ficam em "Seu negócio". Encerrar tira o espaço do app; os
  lançamentos ficam guardados, sem leitura, e são apagados de vez depois de 6 meses (como a Família encerrada); as retiradas que já estão
  no Pessoal continuam lá, como recebimentos comuns. Depois de encerrar, pode criar outro.
- **Quem vê.** Só a própria pessoa. A Família não vê o negócio, e o negócio não vê a Família.

## 2. Regras no banco (0042)

1. `context_kind` ganha o valor `negocio` com `alter type ... add value if not exists`. O valor novo só pode ser **usado** depois do
   commit; por isso a migração só o usa no corpo de funções plpgsql (lido quando a função roda) e nunca em restrição, índice, visão ou
   função sql. A migração foi aplicada numa transação só (como o SQL Editor faz) sem erro, e o teste de banco confere que só plpgsql usa o
   valor.
2. Funções do app (só `authenticated`): `create_business(p_name, p_key)`, `rename_business(p_context, p_name, p_key)`,
   `end_business(p_context, p_key)`, `create_business_withdrawal(p_key, p_business, p_business_account, p_personal_account,
   p_amount_cents, p_occurred_on, p_description)`, `delete_business_withdrawal(p_key, p_record, p_expected_version)` e
   `move_record(p_key, p_record, p_expected_version, p_target_context, p_account, p_category)`. Todas com autoria da sessão, chave de
   idempotência, hash em JSON e `record_operations` (6 ações novas: 91 no total).
3. Um negócio ativo por pessoa: `create_business` recusa o segundo (`ja_tem_negocio`). O modelo aceita mais (nenhum índice único prende
   um só): o Plus só troca essa conferência.
4. Retirada: `financial_records.paired_record_id` liga os dois lados (`on delete set null`); o gatilho `financial_records_pair_guard`
   recusa qualquer mudança num lado ligado fora das funções da retirada (`retirada_ligada`): `update_record`, `delete_record`, pagar e
   ligar não a tocam. Encerrar o negócio desliga os dois lados.
5. Orçamento: `set_category_budget` e `month_budget` usam as categorias pelo tipo do contexto (`clarevo_budget_categories`); o Pessoal e a
   Família recebem as 7 de sempre, na mesma ordem.
6. Metas: o gatilho `goals_context_guard` recusa meta no negócio (`contexto_invalido`). Investimentos já conferiam o Pessoal.
7. Atividade: criar, renomear e encerrar não contam como anotação; encerrar vale em só ver e exportar (como encerrar a Família); criar,
   renomear, anotar e retirar seguem a trava da assinatura (`assinatura_necessaria`).
8. Exclusão da conta: o negócio é da pessoa (`owner_person_id`) e já entrava em `clarevo_erase_person`, como o Pessoal. A limpeza dos 6
   meses (`clarevo_purge_deleted`) apaga o negócio encerrado inteiro (`negocios` na resposta).
9. Revisão independente (D-113a): `create_business_withdrawal` e `move_record` (do lado que for negócio) tomam a trava de `end_business`
   (`familia:c:<negócio>`) antes de conferir, para um negócio encerrado ao mesmo tempo não receber nem perder lançamentos; e a migração
   recria `clarevo_chat_create_code` (o código de ligar o WhatsApp ou o Telegram recusa o negócio com `contexto_invalido`) e
   `clarevo_chat_link` (um código do negócio não liga e é apagado).
10. Compatibilidade: o app anterior lê só os contextos `pessoal` e `familia` (filtro por `kind`), então nunca vê o negócio, e as funções
   que ele chama mantêm as assinaturas. O recebimento "Retirada do negócio" aparece no Pessoal dele como um recebimento comum; editar ou
   excluir por lá recebe `retirada_ligada` ("Não foi possível salvar"). O app novo precisa da 0042 (lê `kind = 'negocio'` e chama as
   funções novas): aplicar antes do merge.

## 3. Demonstração

A demonstração padrão não tem negócio (os totais de sempre; desde a D-113b, o seletor de espaço aparece com "Pessoal" e o "+"): ela deixa
criar um negócio, só na memória do aparelho. O negócio de exemplo, **"Sacolé da Maria"** (fictício), mora no cenário `?cenario=negocio`: setembro de 2026 com R$ 1.760,00 de
entradas e R$ 601,00 de saídas; outubro (até 07/10) com R$ 760,00 e R$ 418,00, maior saída Material e mercadoria. Nenhum total do Pessoal
muda (6.000 / 3.900 / 2.100 e 650 em outubro). O cenário não traz retirada (ela mudaria o Recebido do Pessoal): o roteiro de telas cria e
exclui uma. Motivo de não pôr o negócio na demonstração padrão: ele mudaria telas e números que dezenas de verificações de telas conferem. Com
o seletor sempre à vista (D-113b), o mês do Resumo e de Movimentos ficou 8 px abaixo do seletor (antes 20 px), para o primeiro movimento
continuar à vista sem rolar em 390 × 844.

## 4. O que ficou para depois

- **Guia e Ajuda (feito na junção da segunda rodada).** A entrada do guia (`id: 'negocio'`, captura 730) está em `GUIDE_ENTRIES`, no
  grupo "Conta e privacidade", logo depois da Família; a tela `/negocio` está no índice "No app" da busca de Aprender (`APP_SCREENS`,
  `packages/core/src/navigation.ts`); a Ajuda do site tem o tema "Espaço Negócio" (`ajuda/negocio.html`, `TEMAS` em
  `scripts/site/paginas/ajuda.js`); `/negocio` saiu das exceções de cobertura de `test/guide.test.ts`; o site e o manual foram gerados de
  novo.
- **Política de privacidade (feito na junção da segunda rodada).** A seção 3.3a ("Espaço Negócio (opcional)") entrou com o texto
  proposto (o nome que a pessoa dá ao negócio e o que ela anota nele, como na seção 3.2; só ela vê; sem CNPJ nem dados da empresa;
  encerrar e excluir a conta), e a seção 11 ganhou a linha do espaço encerrado. A versão dos termos (`LEGAL_VERSION` = 1) não mudou: a
  pergunta 62 do resumo para o advogado pergunta se o espaço pede versão nova e se o tratamento de dados de pessoa jurídica muda algo.
- **WhatsApp e Telegram no negócio.** Hoje anotam só no Pessoal. Para escolher o negócio, o caminho simples seria uma palavra no começo
  da mensagem ("negócio 50 frutas"), lida pelas regras de `packages/core/src/whatsapp` e `telegram`, com `clarevo_chat_note` aceitando o
  contexto do negócio da pessoa; ficou para depois.
- **Editar a retirada** (hoje: excluir e anotar de novo), **sugestões de orçamento depois de importar** no negócio (hoje só nas
  categorias do Pessoal) e uma **retirada pelo WhatsApp**.
- **Ver o negócio encerrado** (hoje: sem leitura até a limpeza dos 6 meses; exportar antes).

## 5. Clarevo Plus (preparar agora, lançar depois)

Decisão do Enzo: o modelo de dados já nasce pronto; **nada do Plus aparece no app nem no site** até o Enzo definir.

**Negócio da família (D-116, 19/11/2026).** O negócio compartilhado com outras pessoas (por exemplo, um comércio da família) entra no Plus, depois do lançamento. Regra: qualquer pessoa cria e chama outras; uma só pessoa administra cada negócio (quem criou), e as outras anotam e veem ou só veem. Até lá, o negócio próprio (um por pessoa, privado) fica incluído nos dois planos.

**Pronto e desligado (D-120, 23/11/2026).** O negócio compartilhado foi feito por inteiro e fica desligado até o Enzo abrir o Plus:
- **Banco (migração 0043, `supabase/migrations/20261123000001_negocio_compartilhado.sql`).** A chave do Plus (`plus_settings`, fechada;
  só a equipe abre, no SQL Editor, com `clarevo_staff_set_plus`), os convites do negócio (`business_invites`, as regras do convite da
  Família: só o resumo do código, 7 dias, uso único, cancelável), a visão `business_member_items` ("Pessoa do negócio" para quem não
  tem nome; "Pessoa que saiu" para quem excluiu a conta) e as funções `plus_status`, `create_business_invite` (recusa
  `plus_indisponivel` com o Plus fechado), `cancel_business_invite`, `preview_business_invite`, `accept_business_invite`,
  `leave_business`, `remove_business_member` e `set_business_member_role`. Testes em
  `supabase/tests/99zzzzzzzzzzzzzzzzzzzzzz_negocio_compartilhado.sql`.
- **Regras.** Quem criou administra (convida, muda o papel, remove, renomeia e encerra; não há passar a administração e quem administra
  não sai: `titular_nao_sai`). As outras pessoas anotam e veem ("Anota e vê") ou só veem ("Só vê"). Até 6 pessoas, contando quem
  administra e os convites ainda válidos (`negocio_cheio`). **Um negócio por pessoa, por vez**, o próprio ou o de outra pessoa (como a
  Família): aceitar recusa quem já participa de um negócio (`ja_tem_negocio`; do mesmo, `ja_no_negocio`) e criar recusa quem participa
  do negócio de outra pessoa. Quem sai ou é removido perde o acesso na hora; o que anotou fica como histórico, e as retiradas dessa
  pessoa para o Pessoal dela deixam de ser ligadas (os dois lados viram lançamentos comuns); o mesmo vale para quem passa a
  "Só vê" (ela não conseguiria mais excluir o par). Fechar o Plus invalida os convites pendentes (a prévia e o aceite os recusam). Encerrar continua só sem outras pessoas e
  cancela os convites. Excluir a conta: quem administra com outras pessoas recebe `negocio_com_membros` (remove as pessoas antes); quem
  participa sai, e o que anotou fica com "Pessoa que saiu". Só convidar passa pela trava da assinatura.
- **App.** Com o Plus fechado, nada novo aparece (nem a seção de pessoas, nem textos do Plus), e o app funciona mesmo sem a 0043
  (`plus_status` que falha conta como fechado). Com o Plus aberto, "Seu negócio" ganha "Pessoas do negócio" (pessoas, convites,
  "Convidar alguém", "Gerenciar" e "Sair do negócio"), o convite abre em `/convite/negocio/<código>` e as telas seguem o papel de quem
  usa (quem só vê não anota). A demonstração liga o Plus só em `?cenario=negocio-plus` (quem administra, com uma pessoa que
  anota, uma que saiu e um convite pendente) e `?cenario=negocio-plus-membro` (a pessoa anota no negócio de outra). Núcleo:
  `packages/core/src/business-people.ts` e `memory-business-people.ts`; telas: `apps/app/src/components/business-people.tsx`,
  `apps/app/src/app/negocio/convidar.tsx` e `apps/app/src/app/convite/negocio/[codigo].tsx`; roteiro de telas: bloco "Negócio
  compartilhado (Plus, D-120)" de `scripts/e2e-web.js`, capturas 811 a 826. Na demonstração, cada conta guarda os próprios dados: uma
  conta criada nela que entra no negócio de exemplo não vê os lançamentos de quem administra (no banco de verdade, vê).
- **Para abrir (decisão do Enzo, com preço e lojas).** As perguntas de preço e de lojas abaixo continuam abertas; quando houver plano
  Plus, a única conferência a trocar no banco é `clarevo_plus_allows` (hoje: o Plus aberto para todas as pessoas).

**O que entraria.**
- Vários negócios por pessoa: o banco já aceita (só `create_business` recusa o segundo, `ja_tem_negocio`); o app trocaria o nome único no
  seletor por uma lista (o seletor já monta as opções a partir dos espaços que a pessoa tem).
- Sócios e ajudantes com papéis: `context_memberships` já tem titular, membro ("anota e vê") e leitor ("só vê"), com ler, anotar e
  editar de outras pessoas, como na Família. Faltaria o convite do negócio (o da Família serve de modelo), a regra de quem sai e da
  exclusão da conta com outras pessoas no negócio (hoje `end_business` já recusa com `negocio_com_membros`) e a retirada de um sócio para
  o próprio Pessoal (a função já confere escrita nos dois espaços).
- Exportação para o contador: um livro-caixa simples (CSV e PDF) com entradas e saídas por categoria, mês a mês, a partir dos mesmos
  lançamentos (a exportação de hoje já escolhe o espaço; faltaria o formato do contador e, talvez, a mensagem pronta para enviar).

**Decisões de 25/11/2026 (D-123), a partir do estudo do pequeno e médio no Plus.** Cobrança por pessoa ou em dois níveis (por negócio
saiu); o app pergunta se o negócio é uma sociedade, e quem administra pode passar a administração para outra pessoa do negócio (muda a
regra da D-116); a contabilidade tem papel próprio, só de leitura, fora do limite de 6 pessoas e da regra de um negócio por vez.

**Perguntas de preço (para o Enzo).** Valor do Plus (acréscimo ao Individual ou plano próprio?); por pessoa ou por negócio; quantos
negócios e quantas pessoas por negócio; se o Plano Família inclui o Plus; teste grátis próprio ou o mesmo de 14 dias; o que acontece com
o segundo negócio quando o Plus acaba (só ver e exportar, como hoje no fim do teste).

**Lojas.** Produto novo nas duas lojas (por exemplo `clarevo_plus_mensal`, no mesmo grupo de assinaturas do iPhone para a troca de
plano; no Google, o plano básico `mensal`), o direito no RevenueCat e o plano novo em `billing_apply` e em `my_access` (hoje `individual`
e `familiar`). Revisão das lojas para app com uso empresarial.

**Asaas (web).** Valor novo no Checkout de cartão e no Pix mês a mês (`docs/39_ASAAS.md`), sem nada de pagamento guardado na Clarevo.

**Jurídico (perguntas para o advogado).** Termos: uso para atividade empresarial e para MEI; a Clarevo não faz contabilidade nem
substitui o contador; quem é responsável pelos dados de sócios e ajudantes que entram no negócio (o titular decide quem vê, como na
Família); nomes de funcionários e ajudantes escritos nas descrições (dados de terceiros); a exportação para o contador sai pela própria
pessoa (a Clarevo não envia nada); se o Plus muda a relação de consumo (CDC) para quem é empresa.

## 6. Testes

- Banco: `supabase/tests/99zzzzzzzzzzzzzzzzzzzzz_negocio.sql` (o valor novo só em plpgsql, privilégios, criar e as recusas, quem é de fora,
  lançamentos, conta a pagar, cartão e orçamento no negócio, metas e investimentos recusados, a retirada e o guarda, mover, renomear,
  encerrar, só ver e exportar, exclusão da conta e a limpeza dos 6 meses). As listas de funções e ações dos testes antigos ganharam as 6
  novas (113 funções do app e 91 ações no 99_exclusao).
- Núcleo: `packages/core/test/business.test.ts` (categorias, regras, frases sem julgamento, o repositório em memória e a demonstração).
- Telas: bloco "Espaço Negócio (D-113)" em `scripts/e2e-web.js`, logo antes do bloco do Tema (D-112), capturas 730 a 739; o seletor
  sempre à vista, o "+", a folha e a troca pela pílula de Análises (D-113b), capturas 740 a 744; a linha de "Primeiros passos" e o seletor
  só com o Pessoal também nos blocos de "Primeiros passos" e da Família. Núcleo: `packages/core/test/spaces.test.ts`.

## 7. Fora da operação, tipo do negócio, limite do MEI e resumo do ano (D-121, 24/11/2026)

A partir da pesquisa de 18/11/2026 sobre o que micro e pequenos negócios precisam registrar (itens 1, 2, 4, 5, 6 e 7 da lista
priorizada), sem virar contabilidade e sem a Clarevo calcular imposto nem dizer o que declarar.

- **Fora da operação.** Dinheiro que entra ou sai do negócio sem ser venda nem gasto da operação: "Dinheiro do Pessoal" (só pela ação
  "Trazer dinheiro do Pessoal", o inverso da retirada: um gasto "Dinheiro para o negócio" no Pessoal e uma entrada no negócio, ligados,
  função `create_business_contribution`), "Empréstimo recebido", "Parcela de empréstimo" e "Equipamento" (categorias comuns). Em "Seu
  negócio", Entrou, Saiu e Sobrou são só da operação; o bloco "Fora da operação" mostra o resto, com uma frase do porquê, e "Ficou no
  negócio" soma tudo. No Resumo do negócio, o total do meio passa a se chamar "Ficou no negócio" nos meses com algo fora da operação
  (como já acontecia com a retirada); os números não mudam. Movimentos, Análises e Evolução não mudam: o dinheiro entrou ou saiu de verdade.
- **Tipo do negócio (opcional).** "Sem CNPJ (por conta própria)", "MEI", "Microempresa ou empresa de pequeno porte" ou "Prefiro não
  dizer", só por quem administra (`set_business_profile`). Sem número de CNPJ.
- **Limite do MEI.** Só com o tipo MEI: as vendas e os serviços anotados no ano contra o limite anual (R$ 81.000,00, constante no núcleo
  com a data da regra), com a nota do ano de abertura (R$ 6.750,00 por mês). Numa cor só; acima de 100%, só o fato e "Converse com a sua
  contabilidade".
- **Resumo do ano** (`/negocio/ano`): o ano por categoria (operação), fora da operação, retiradas e o que ficou no negócio, com troca de
  ano e o atalho para exportar os lançamentos do negócio. Para MEI, "Confira com a sua contabilidade antes de declarar."
- **Categorias novas de saída:** "Divulgação", "Contabilidade e sistemas" e "Juros e multas" (contam na operação). Ainda **fora do
  orçamento**: o app publicado antes desta rodada recusa um orçamento com outra contagem de linhas; este app já aceita, e uma migração
  seguinte as põe no orçamento quando ele estiver em todos os aparelhos. "Contas do ponto" passa a cobrir também a parte da casa usada no
  trabalho.
- **Encerrar com cópia.** O diálogo de encerrar oferece "Exportar os lançamentos" e lembra que registros e comprovantes do negócio
  costumam precisar ser guardados por alguns anos.
- **Banco:** migração 0044 (`supabase/migrations/20261124000001_negocio_movimentos.sql`), testes em
  `supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzz_negocio_movimentos.sql`. **Antes do merge**, junto com a 0043 (docs/05, 12aj e 12ak).
- **Telas:** `apps/app/src/app/negocio/trazer.tsx`, `negocio/ano.tsx` e `components/business-pair-form.tsx` (a retirada e o trazer
  usam o mesmo formulário). Roteiro de telas: bloco "Espaço Negócio: fora da operação, tipo do negócio, limite do MEI e resumo do ano
  (D-121)" de `scripts/e2e-web.js`, capturas 827 a 839.
- **Compatibilidade enquanto os celulares atualizam.** O app anterior a esta rodada mostra o par do "Trazer dinheiro do Pessoal" com os
  textos da retirada (no Pessoal, "Retirada para o Pessoal" e "Excluir a retirada") e conta "Dinheiro do Pessoal" em Entrou; excluir
  funciona. Só afeta quem usa a função nova num aparelho ainda sem a atualização pelo ar.
- **Ficou para depois** (da mesma lista): marcar se a venda teve nota e de quem veio; "a receber" (fiado e cartão); lembretes do DAS e
  da declaração anual; as 3 categorias novas no orçamento.

## 8. A receber, nota e quem pagou, lembretes do MEI (D-122, 25/11/2026)

O restante da pesquisa de 18/11/2026 para o Espaço Negócio (itens 3, 8 e 9 da lista priorizada).

- **A receber** (`/negocio/a-receber`): o dinheiro que o negócio ainda vai receber: "Venda no fiado" (com o nome de quem deve, opcional,
  só o nome), "Venda no cartão" (o que ainda vai cair) e "Outro valor a receber", com descrição, valor, data combinada ou prevista e
  categoria de entrada. Não entra em Entrou, Saiu nem nos totais. "Recebi" confirma o valor (pode ser diferente do combinado, por exemplo
  depois da taxa do cartão), a data (até hoje) e a conta, e grava uma entrada comum no negócio, ligada; excluir essa entrada devolve o
  "a receber" para "Em aberto". A entrada ligada não vira gasto nem muda de espaço. "Passou da data combinada" aparece em texto, sem cor
  de alerta. O cartão "A receber" em "Seu negócio" mostra o total em aberto, quantos são e a próxima data. Papéis do negócio
  compartilhado: quem só vê não anota; quem anota altera o que anotou e recebe qualquer um; quem administra altera tudo.
- **Nota e quem pagou:** em "Mais detalhes (opcional)" das entradas do negócio, "Teve nota fiscal?" (Sim ou Não) e "Quem pagou" (Pessoa
  física, Empresa ou Exterior). Não mudam nenhum total. Aparecem no detalhe, no "Resumo do ano" (cartão "Nota e quem pagou", só quando há
  alguma marca) e na exportação do negócio (colunas "Nota fiscal" e "Quem pagou"). Mudar a entrada para gasto ou movê-la para o Pessoal
  tira as marcas.
- **Lembretes do MEI:** só com o tipo MEI, desligados até a pessoa ligar, no celular: o DAS do mês (no dia 15: o DAS do MEI vence no dia
  20) e a declaração anual (em 2 de maio: vai até 31 de maio). Na web, o cartão só descreve os lembretes.
- **Banco:** migração 0045 (`supabase/migrations/20261125000001_negocio_a_receber.sql`): `business_receivables`, as funções
  `create_receivable`, `update_receivable`, `delete_receivable` e `receive_receivable`, `financial_records.receivable_id`, `has_invoice` e
  `payer_kind`, e `p_marks` no fim de `create_record` e `update_record`. Testes em
  `supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzz_negocio_a_receber.sql`. **Antes do merge** (docs/05, 12al e 21ag).
- **Telas:** `apps/app/src/app/negocio/a-receber/` (lista, novo, detalhe, editar e "Recebi"), `components/receivable-parts.tsx` e
  `components/record-marks.tsx`; núcleo em `packages/core/src/business-receivables.ts` e `mei-reminders.ts`. Roteiro de telas: bloco
  "Espaço Negócio: a receber, nota e quem pagou, lembretes do MEI (D-122)" de `scripts/e2e-web.js`, capturas 840 a 853.
- **Compatibilidade enquanto os celulares atualizam.** No app anterior a esta rodada, a entrada de um "a receber" aparece como entrada
  comum: "Mover" aparece e é recusado; trocar para saída é recusado com a mensagem genérica de não salvar; excluir a entrada reabre o
  "a receber" sem avisar; as marcas não aparecem, mas ficam ao editar. Só afeta quem usa as funções novas num aparelho ainda sem a
  atualização pelo ar.
- **Da revisão independente:** o "a receber" excluído deixa de ser lido na hora (com o nome de quem devia); as marcas e o vínculo não
  mudam num lado ligado de retirada ou de dinheiro trazido do Pessoal; alterar e excluir tomam a trava do negócio, como anotar e receber.
- **Ficou para depois:** as marcas no PDF da exportação e no mês de "Seu negócio"; uma demonstração com alguém que só vê.
