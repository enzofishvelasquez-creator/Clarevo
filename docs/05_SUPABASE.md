# Ligar o Clarevo ao Supabase (login e dados reais)

10/10/2026. Sem esta configuração, o app roda em **demonstração**: acesso simulado, nenhum e-mail enviado, dados só na memória do aparelho. Com ela, cadastro, confirmação de e-mail, recuperação de senha, registros, contas a pagar, gastos fixos, contas do ano, a revisão dos últimos meses, a renda de referência, o orçamento por categoria e o limite pessoal, as metas, a resposta do plano de guardar, os cartões com as faturas e a chave das notas fiscais lidas passam a ser reais. Aprender não depende do banco.

Não consegui abrir a documentação do Supabase deste ambiente (acesso bloqueado pela rede). Os nomes dos menus abaixo podem variar um pouco no painel; o conteúdo de cada passo é o mesmo.

## 1. Criar o projeto (você, ~5 min)

1. Entre em supabase.com e crie uma conta (pode usar o GitHub).
2. **New project**: nome `clarevo-producao`, região **South America (São Paulo)**.
3. Crie uma senha forte para o banco e guarde em um gerenciador de senhas. Não envie essa senha a ninguém, nem a mim.
4. Recomendado: crie também `clarevo-teste` para testes, separado dos dados reais.

## 2. Criar as tabelas e permissões

1. No projeto, abra **SQL Editor** → **New query**.
2. Cole todo o conteúdo de `supabase/migrations/20261007000001_fundacao.sql` e clique em **Run**.
3. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261007000002_contas_a_pagar.sql` e clique em **Run**.
4. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261008000001_gastos_fixos.sql` (gastos fixos e parcelamentos) e clique em **Run**.
5. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261008000002_contas_do_ano.sql` (contas do ano) e clique em **Run**.
6. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261009000001_retorno.sql` (seus últimos meses, migração 0005) e clique em **Run**. Ela cria as tabelas da atividade e da revisão, as três funções novas e o gatilho, e preenche uma única vez a data da última anotação de quem já usava o app, a partir das operações já gravadas (só datas). No projeto que já tem as quatro primeiras, rode os passos 6 a 10, nesta ordem.
7. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261009000002_renda_comprometida.sql` (renda comprometida, migração 0006) e clique em **Run**. Ela cria a tabela da renda de referência, as funções `set_income_reference`, `delete_income_reference` e `month_committed` e atualiza a lista de operações aceitas; não muda nenhum dado que já existe.
8. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261009000003_metas.sql` (metas e plano de guardar, migração 0007) e clique em **Run**. Ela cria as tabelas de metas, de movimentos e da resposta do plano de guardar, a visão `goal_items`, as oito funções novas e atualiza de novo a lista de operações aceitas (26 ações); não muda nenhum dado que já existe. Ela depende da 0006.
9. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261010000001_cartoes.sql` (cartões, faturas e chave da nota fiscal, migração 0008, Ciclo E) e clique em **Run**. Ela cria as tabelas `cards` e `card_entries`, as visões `card_items`, `invoice_items`, `card_entry_items` e `receipt_items`, as 11 funções de cartão (`create_card`, `update_card`, `set_card_status`, `delete_card`, `add_card_purchase`, `add_card_charge`, `add_card_refund`, `update_card_entry`, `delete_card_entry`, `pay_invoice` e `undo_invoice_payment`) e as colunas de ligação em `commitments` e `financial_records`, entre elas `receipt_key`, que guarda só o resumo SHA-256 da chave da nota. Também troca `create_record` (um parâmetro novo no fim, `p_receipt_key`, opcional) e `month_committed` (duas colunas no fim), recria `commitment_items` (três colunas no fim) e atualiza de novo a lista de operações aceitas (37 ações). Não muda nenhum dado que já existe. Ela depende da 0007.
10. **Por último**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261010000002_orcamento.sql` (orçamento por categoria e limite pessoal de comprometimento, migração 0009, Ciclo F2) e clique em **Run**. Ela cria as tabelas `category_budgets` e `commitment_limits` (com a RLS de leitura e os gatilhos de proteção), as funções `set_category_budget`, `delete_category_budget`, `set_commitment_limit`, `delete_commitment_limit` e `month_budget` e atualiza de novo a lista de operações aceitas (41 ações). Não muda nenhum dado que já existe e não toca nas tabelas de registros, contas a pagar, cartões ou metas. Ela depende da 0008. Depois dela, a conta nova continua sem orçamento nem limite.
11. A ordem importa: cada arquivo altera tabelas e funções criadas pelos anteriores (a 0006 vem depois da 0005, a 0007 depois da 0006, a 0008 depois da 0007 e a 0009 depois da 0008). Cada arquivo roda uma única vez; se o projeto já tinha os primeiros, rode só os que faltam, na ordem dos nomes.
12. Todos devem terminar sem erro. Se aparecer erro, me envie a mensagem.
13. Para conferir as migrações novas, rode numa nova consulta:

   ```sql
   select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('create_series_occurrence', 'decide_return_review', 'months_overview')) as funcoes_0005,
          (select count(*) from information_schema.tables
            where table_schema = 'public' and table_name in ('context_activity', 'return_reviews')) as tabelas_0005,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('set_income_reference', 'delete_income_reference', 'month_committed')) as funcoes_0006,
          (select count(*) from information_schema.tables
            where table_schema = 'public' and table_name = 'income_references') as tabelas_0006,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('create_goal', 'update_goal', 'set_goal_status', 'delete_goal',
                  'add_goal_movement', 'update_goal_movement', 'delete_goal_movement', 'set_savings_answer')) as funcoes_0007,
          (select count(*) from information_schema.tables
            where table_schema = 'public' and table_name in ('goals', 'goal_movements', 'savings_checks')) as tabelas_0007,
          (select count(*) from information_schema.views
            where table_schema = 'public' and table_name = 'goal_items') as visoes_0007;
   ```

   O resultado esperado é `funcoes_0005 = 3`, `tabelas_0005 = 2`, `funcoes_0006 = 3`, `tabelas_0006 = 1`, `funcoes_0007 = 8`, `tabelas_0007 = 3` e `visoes_0007 = 1`.
14. Para conferir a 0008, rode em outra consulta (só leitura):

   ```sql
   select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('create_card', 'update_card', 'set_card_status', 'delete_card',
                  'add_card_purchase', 'add_card_charge', 'add_card_refund', 'update_card_entry', 'delete_card_entry',
                  'pay_invoice', 'undo_invoice_payment')) as funcoes_0008,
          (select count(*) from information_schema.tables
            where table_schema = 'public' and table_name in ('cards', 'card_entries')) as tabelas_0008,
          (select count(*) from information_schema.views
            where table_schema = 'public' and table_name = 'receipt_items') as visoes_0008;
   ```

   O resultado esperado é `funcoes_0008 = 11`, `tabelas_0008 = 2` e `visoes_0008 = 1`. Essa consulta foi testada em 10/10/2026 num banco local descartável, montado com `supabase/tests/00_auth_shim.sql` e as oito migrações, e devolveu 11, 2 e 1.
15. Para conferir a 0009, rode em outra consulta (só leitura):

   ```sql
   select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('set_category_budget', 'delete_category_budget', 'month_budget',
                  'set_commitment_limit', 'delete_commitment_limit')) as funcoes_0009,
          (select count(*) from information_schema.tables
            where table_schema = 'public' and table_name in ('category_budgets', 'commitment_limits')) as tabelas_0009,
          (select count(*) from pg_trigger
            where tgname in ('category_budgets_guard', 'commitment_limits_guard') and not tgisinternal) as gatilhos_0009,
          (select count(*) from pg_policies
            where schemaname = 'public' and tablename in ('category_budgets', 'commitment_limits')) as regras_0009,
          (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
            where c.conname = 'record_operations_action_check') as acoes_0009,
          has_function_privilege('authenticated', 'public.set_category_budget(text, uuid, text, date, integer, bigint)', 'execute') as permissao_0009;
   ```

   O resultado esperado é `funcoes_0009 = 5`, `tabelas_0009 = 2`, `gatilhos_0009 = 2`, `regras_0009 = 2`, `acoes_0009 = 41` e `permissao_0009 = true`. Essa consulta foi testada em 10/10/2026 num banco local descartável, montado com `supabase/tests/00_auth_shim.sql` e as nove migrações (apagado depois), e devolveu 5, 2, 2, 2, 41 e verdadeiro.
16. Se o app mostrar erro ao abrir as contas a pagar, os gastos fixos, as contas do ano, as metas, os cartões, a renda comprometida, o orçamento ou o Resumo logo depois, a API ainda não leu o esquema novo: no SQL Editor, rode `notify pgrst, 'reload schema';`. Faça isso depois de colar a 0009, antes de abrir o app.
17. O consultor de segurança do Supabase (**Advisors**) pode apontar a visão `series_items` como visão com os privilégios de quem a criou (a migração de contas do ano a recria com as mesmas opções). É intencional: ela precisa ler as contas excluídas só em um mês, filtra a permissão de leitura de forma explícita e usa `security_barrier` (ver `docs/01_ARQUITETURA.md`).

## 3. Configurar o login

Em **Authentication**:

- **Providers → Email**: ativado, com **Confirm email** ligado.
- **Password**: tamanho mínimo **8** e exigência de letras e números (o app já informa essa regra antes do envio).
- **URL Configuration**:
  - *Site URL*: o endereço da versão web quando publicada (por enquanto, `http://localhost:8081`).
  - *Redirect URLs*: adicione `clarevo://**`, `exp://**` (para testar no Expo Go) e `http://localhost:8081/**`.
- **Rate limits**: mantenha os limites padrão contra tentativas abusivas.
- **Emails → SMTP**: o envio padrão do Supabase tem limite baixo e serve só para testes. Antes do lançamento, configure um provedor de e-mail próprio (por exemplo, Resend ou Amazon SES) com o domínio do Clarevo.

### Textos dos e-mails (Authentication → Emails → Templates)

**Confirmar cadastro** · assunto: `Confirme seu e-mail no Clarevo`

```html
<p>Olá!</p>
<p>Para liberar sua conta no Clarevo, confirme este endereço de e-mail.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar meu e-mail</a></p>
<p>Se você não pediu esta conta, ignore esta mensagem.</p>
```

**Recuperar senha** · assunto: `Defina uma nova senha no Clarevo`

```html
<p>Recebemos um pedido para recuperar o acesso à sua conta.</p>
<p><a href="{{ .ConfirmationURL }}">Definir nova senha</a></p>
<p>O link expira em pouco tempo. Se você não fez esse pedido, ignore esta mensagem; sua senha continua a mesma.</p>
```

## 4. Conectar o app

1. Em **Project Settings → API**, copie a **Project URL** e a chave pública (**publishable** ou **anon**). Nunca use a chave `service_role` no app.
2. Na pasta `apps/app`, copie `.env.example` para `.env` e preencha:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=sua-chave-publica
```

3. Rode `npm run web` (ou `npm run app`). A tela de boas-vindas deixa de mostrar o selo "Demonstração".

Se preferir, me envie só a **Project URL** e a **chave pública** (são públicas por natureza: ficam dentro do app) e eu faço o restante.

## 5. Conferir

- Criar conta com um e-mail seu → chega o e-mail de confirmação → abrir o link → "Sua primeira conta".
- "Esqueci minha senha" → chega o e-mail → abrir o link → "Nova senha".
- Anotar um gasto, fechar o app, abrir de novo: o gasto continua lá.
- Anotar uma conta a pagar e marcar como paga: o gasto aparece em Movimentações e Pago sobe; desfazer o pagamento volta tudo.
- Cadastrar um gasto fixo com primeira conta neste mês: as contas deste mês e do próximo aparecem em Contas a pagar; fechar e abrir o app de novo não cria contas repetidas.
- Cadastrar uma conta do ano que vence no mês que vem: ela aparece em Contas a pagar, em "Próximos meses", e "Ainda a pagar" deste mês não muda; fechar e abrir o app de novo não cria contas repetidas.
- Depois da 0005: anotar um gasto e conferir que o Resumo continua igual. A faixa "Seus últimos meses" só aparece depois de 45 dias sem anotar (ou de um mês inteiro sem anotação), e uma conta nova nunca a vê.
- Depois da 0006: o Resumo continua igual, e a linha "Renda comprometida" dentro do card "Ainda a pagar" convida a informar a renda de referência (a conta nova não tem referência). Informe uma renda de referência em "Renda comprometida" e confira o percentual; exclua a referência, e o percentual some em vez de virar 0%.
- Depois da 0007: a aba Metas mostra a pergunta "Você consegue guardar algum valor por mês?" (a conta nova não tem metas nem resposta). Crie a reserva para imprevistos, registre um aporte e confira que o Resumo (Recebido, Pago e Diferença) não muda; um resgate maior que o guardado em qualquer dia é recusado.
- Depois da 0009: o Resumo, Movimentos e a Renda comprometida continuam iguais, e conta nova não tem orçamento nem limite (Movimentos › Organizar mostra "Nenhum orçamento definido"). Defina o orçamento de uma categoria em "Orçamento por categoria", anote um gasto nela e confira o "usado" do mês; uma compra no cartão parcelada conta cada parcela no mês dela. Recebido, Pago, Diferença e "Ainda a pagar" não mudam. Em Renda comprometida (com a renda de referência definida), escolha um limite; o app nunca sugere um valor. Tirar o orçamento volta a mostrar a categoria em "Definir orçamento".
- Depois da 0008: conta nova não tem cartão nem lançamento de exemplo; "Cadastrar cartão" pede só o apelido, os 4 últimos dígitos, o fechamento, o vencimento e o limite opcional. Cadastre um cartão, anote uma compra no cartão e confira que Recebido, Pago e Diferença não mudam; a fatura aparece em Contas a pagar como "Fatura <apelido>", e só o pagamento dela (total ou parcial, com o saldo anterior na fatura seguinte) entra em Pago, na data do pagamento. A fatura só aceita o pagamento depois que fecha: enquanto está aberta, o app mostra quando poderá ser paga e o banco recusa com `fatura_aberta`. Desfazer o pagamento volta tudo. Em Anotar gasto, "Escanear nota fiscal" lê a nota; ler a mesma nota de novo mostra "Esta nota já foi anotada".

Os testes de permissão do banco (`npm run test:db`) rodam em Postgres local com uma simulação do esquema de autenticação do Supabase; esses scripts não devem ser aplicados no Supabase. O mesmo vale para o gancho de teste de `supabase/tests/run_api.sh`, que muda o "hoje" de uma requisição só no banco descartável dos testes de API. Depois de criar o projeto, repetir os fluxos pelo app no `clarevo-teste`.

## Custos (consultados em 07/10/2026 no repositório oficial do Supabase)

- **Free (US$ 0):** bom para desenvolvimento. Pausa o projeto após 1 semana sem uso, não tem backup automático e o e-mail embutido envia cerca de 2 mensagens por hora, só para a equipe do projeto. Não serve para pessoas reais.
- **Pro (a partir de US$ 25 por mês por organização):** não pausa, backup diário de 7 dias, 100 mil usuários ativos por mês incluídos e proteção contra senhas vazadas. Cada projeto a mais (por exemplo, `clarevo-teste`) soma cerca de US$ 10 por mês.
- **E-mail próprio (SMTP):** sem custo no Supabase; o custo é do provedor escolhido.
- **Recuperação para um ponto no tempo (PITR):** cerca de US$ 105 por mês a mais; pode esperar haver volume real.
