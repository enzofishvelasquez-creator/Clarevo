# 52 · Espaço Negócio (D-113)

Retorno de quem testa, decidido pelo Enzo em 17/11/2026. Pessoas com CNPJ ou que trabalham por conta (exemplos reais: uma loja de
conserto de ar-condicionado; a mãe que vende sacolé) misturam as contas pessoais com as do negócio. O Enzo escolheu um **espaço
separado** ("Espaço Negócio", e não uma marca nos lançamentos), **incluído no plano Individual** (um negócio por pessoa, sem custo a
mais). A Elis pediu que seja **leve e não vire contabilidade**: a pessoa dá o nome do negócio, anota o que entrou e o que saiu e vê,
numa visão separada, quanto entrou, quanto saiu e quanto sobrou, e se o negócio está rendendo mais do que custa, sem julgamento.

Migração: `supabase/migrations/20261117000004_espaco_negocio.sql` (0042). Núcleo: `packages/core/src/business.ts`. Telas:
`apps/app/src/app/negocio/` (index, novo, retirada, nome) e `apps/app/src/app/registro/[id]/mover.tsx`. Testes:
`supabase/tests/99zzzzzzzzzzzzzzzzzzzzz_negocio.sql`, `packages/core/test/business.test.ts` e o bloco "Espaço Negócio (D-113)" de
`scripts/e2e-web.js` (capturas 730 a 739).

## 1. O que a pessoa vê

- **Criar.** Em Conta, o card "Espaço Negócio" explica para quem é ("Para quem tem CNPJ ou trabalha por conta: anote o que entra e o
  que sai do negócio num espaço separado do Pessoal e veja quanto sobrou no mês. Incluído no plano, um negócio por pessoa.") e leva a
  "Criar o espaço Negócio": só o nome (1 a 60 caracteres, por exemplo "Sacolé da Mãe"). O negócio nasce com a "Conta do negócio" (bancos
  e carteira, D-043).
- **Seletor de espaço.** O nome do negócio entra no seletor do topo das abas (Resumo, Movimentos e Metas), ao lado de "Pessoal" e da
  Família, se houver. Com o negócio escolhido, as telas de sempre funcionam no negócio: gastos e recebimentos, contas a pagar, gastos
  fixos e parcelamentos, cartões (um cartão do negócio), bancos e carteira, importação de extrato e fatura, orçamento por categoria,
  calendário, busca, Análises e Evolução. A pílula do contexto diz o nome do negócio ("Salvando em Sacolé da Mãe").
- **Categorias do negócio.** Entradas: Vendas, Serviços, Outras entradas. Saídas: Material e mercadoria, Peças e ferramentas,
  Combustível e transporte, Funcionários e ajudantes, Impostos e DAS, Aluguel do ponto, Contas do ponto, Taxas e maquininha, Outras
  saídas. Sem subcategoria no negócio (para ficar leve). O orçamento do negócio usa as 9 de saída.
- **Como está o negócio** (`/negocio`, também pelo card no Resumo do negócio e por Conta): o mês com Entrou, Saiu e Sobrou numa cor só,
  a frase de fato ("Neste mês, entrou R$ 342,00 a mais do que saiu." ou "Neste mês, saiu R$ 300,00 a mais do que entrou."), as
  retiradas à parte, os últimos 6 meses (com a frase do período: "De maio a outubro de 2026, entrou mais do que saiu em 2 dos 2 meses
  com anotações. Somando, ...") e as maiores saídas do mês por categoria. Lembrete fixo: "Os valores são os que você anotou. A Clarevo não
  faz contabilidade nem cálculo de impostos."
- **Retirada para o Pessoal.** Quando a pessoa leva dinheiro do negócio para casa: o valor sai do negócio (gasto "Retirada para o
  Pessoal") e entra no Pessoal como recebimento ("Retirada do negócio"), os dois gravados juntos e ligados. Cada lado conta uma vez no
  próprio espaço (no Resumo do negócio, o dinheiro saiu; no Pessoal, entrou). Em "Como está o negócio", a retirada **não entra em Saiu**
  (não é custo do negócio): aparece à parte ("Retiradas para o Pessoal: R$ 300,00. Não entram em Saiu: é o dinheiro do negócio que foi para
  o Pessoal.") com o que ficou no negócio. A retirada não se edita: exclui-se (os dois lados saem juntos) e anota-se de novo.
- **Mover.** No detalhe de um lançamento comum: "Mover para o espaço Negócio" (no Pessoal) ou "Mover para o Pessoal" (no negócio), para
  quem anotou no lugar errado, com a categoria e a conta do outro espaço. Lançamento ligado (conta a pagar, fatura, rendimento de
  investimento ou retirada) não muda de espaço.
- **Fora do negócio.** Metas e Investir mostram, no negócio, uma explicação curta e "Ir para o Pessoal". WhatsApp e Telegram continuam
  anotando no Pessoal (dito na tela do negócio). Exportar meus dados ganha a escolha do espaço (Pessoal ou o negócio).
- **Nome e encerrar.** "Mudar o nome" e "Encerrar o espaço Negócio" ficam em "Como está o negócio". Encerrar tira o espaço do app; os
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
9. Compatibilidade: o app anterior lê só os contextos `pessoal` e `familia` (filtro por `kind`), então nunca vê o negócio, e as funções
   que ele chama mantêm as assinaturas. O recebimento "Retirada do negócio" aparece no Pessoal dele como um recebimento comum; editar ou
   excluir por lá recebe `retirada_ligada` ("Não foi possível salvar"). O app novo precisa da 0042 (lê `kind = 'negocio'` e chama as
   funções novas): aplicar antes do merge.

## 3. Demonstração

A demonstração padrão **não muda** (sem seletor de espaço no Resumo, os totais de sempre): ela deixa criar um negócio, só na memória do
aparelho. O negócio de exemplo, **"Sacolé da Maria"** (fictício), mora no cenário `?cenario=negocio`: setembro de 2026 com R$ 1.760,00 de
entradas e R$ 601,00 de saídas; outubro (até 07/10) com R$ 760,00 e R$ 418,00, maior saída Material e mercadoria. Nenhum total do Pessoal
muda (6.000 / 3.900 / 2.100 e 650 em outubro). O cenário não traz retirada (ela mudaria o Recebido do Pessoal): o roteiro de telas cria e
exclui uma. Motivo de não pôr o negócio na demonstração padrão: o seletor de espaço apareceria no Resumo e em Movimentos e mudaria as
posições que dezenas de verificações de telas conferem (a barra de abas, o primeiro movimento à vista sem rolar).

## 4. O que ficou para depois

- **Guia e Ajuda.** A entrada do guia está pronta em `packages/core/src/guide/catalog.ts` (`BUSINESS_GUIDE_ENTRY`, captura 730), fora de
  `GUIDE_ENTRIES`: o site gera a Ajuda a partir do guia e recusa uma entrada sem tema (`scripts/site/paginas/ajuda.js`, `TEMAS`), e o site
  é de outra frente. Na junção: pôr a entrada em `GUIDE_ENTRIES` (depois da Família), criar o tema da Ajuda (sugestão: `{ id: 'negocio',
  titulo: 'Espaço Negócio', descricao: 'Separar as contas do negócio das pessoais: criar, anotar, ver quanto sobrou, retirada para o
  Pessoal e mover.', guias: ['negocio'], topicos: [] }`), tirar `/negocio` das exceções de `test/guide.test.ts`, pôr a entrada "No app"
  (navegação) e gerar o site e o manual (`npm run manual`).
- **Política de privacidade.** O negócio traz um dado novo: o nome que a pessoa dá ao negócio (os lançamentos são do mesmo tipo da seção
  3.2). A política não foi editada nesta frente porque o site gera a página da política a partir de `docs/legal/politica-de-privacidade.md`
  (mudar o arquivo sem gerar o site reprova o teste do site). Texto proposto para a seção 3, depois da 3.3 (Família): "**3.3a Espaço
  Negócio (opcional).** Se você criar um espaço Negócio, guardamos o nome que você der a ele e o que você anotar nele, como na seção 3.2.
  Só você vê. Não pedimos CNPJ nem dados da empresa. Encerrar o espaço tira ele do app; os lançamentos ficam guardados, sem leitura, e são
  apagados de vez depois de 6 meses. Excluir a conta apaga o espaço Negócio junto." Decidir com o advogado se muda a versão dos termos
  (`LEGAL_VERSION`).
- **WhatsApp e Telegram no negócio.** Hoje anotam só no Pessoal. Para escolher o negócio, o caminho simples seria uma palavra no começo
  da mensagem ("negócio 50 frutas"), lida pelas regras de `packages/core/src/whatsapp` e `telegram`, com `clarevo_chat_note` aceitando o
  contexto do negócio da pessoa; ficou para depois.
- **Editar a retirada** (hoje: excluir e anotar de novo), **sugestões de orçamento depois de importar** no negócio (hoje só nas
  categorias do Pessoal) e uma **retirada pelo WhatsApp**.
- **Ver o negócio encerrado** (hoje: sem leitura até a limpeza dos 6 meses; exportar antes).

## 5. Clarevo Plus (preparar agora, lançar depois)

Decisão do Enzo: o modelo de dados já nasce pronto; **nada do Plus aparece no app nem no site** até o Enzo definir.

**O que entraria.**
- Vários negócios por pessoa: o banco já aceita (só `create_business` recusa o segundo, `ja_tem_negocio`); o app trocaria o nome único no
  seletor por uma lista (o seletor já monta as opções a partir dos espaços que a pessoa tem).
- Sócios e ajudantes com papéis: `context_memberships` já tem titular, membro ("anota e vê") e leitor ("só vê"), com ler, anotar e
  editar de outras pessoas, como na Família. Faltaria o convite do negócio (o da Família serve de modelo), a regra de quem sai e da
  exclusão da conta com outras pessoas no negócio (hoje `end_business` já recusa com `negocio_com_membros`) e a retirada de um sócio para
  o próprio Pessoal (a função já confere escrita nos dois espaços).
- Exportação para o contador: um livro-caixa simples (CSV e PDF) com entradas e saídas por categoria, mês a mês, a partir dos mesmos
  lançamentos (a exportação de hoje já escolhe o espaço; faltaria o formato do contador e, talvez, a mensagem pronta para enviar).

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
- Telas: bloco "Espaço Negócio (D-113)" em `scripts/e2e-web.js`, logo antes do bloco do Tema (D-112), capturas 730 a 739.
