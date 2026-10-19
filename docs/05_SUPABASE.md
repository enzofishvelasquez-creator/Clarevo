# Ligar o Clarevo ao Supabase (login e dados reais)

11/10/2026. Sem esta configuração, o app roda em **demonstração**: acesso simulado, nenhum e-mail enviado, dados só na memória do aparelho. Com ela, cadastro, confirmação de e-mail, recuperação de senha, registros, contas a pagar, gastos fixos, contas do ano, a revisão dos últimos meses, a renda de referência, o orçamento por categoria e o limite pessoal, as metas, a resposta do plano de guardar, a conferência de um mês sem registros ("Conferi este mês"), os cartões com as faturas, a chave das notas fiscais lidas, as contas de origem do dinheiro, as assinaturas, a Família e o painel da empresa passam a ser reais. Aprender não depende do banco.

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
6. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261009000001_retorno.sql` (seus últimos meses, migração 0005) e clique em **Run**. Ela cria as tabelas da atividade e da revisão, as três funções novas e o gatilho, e preenche uma única vez a data da última anotação de quem já usava o app, a partir das operações já gravadas (só datas). No projeto que já tem as quatro primeiras, rode os passos 6 a 12, nesta ordem.
7. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261009000002_renda_comprometida.sql` (renda comprometida, migração 0006) e clique em **Run**. Ela cria a tabela da renda de referência, as funções `set_income_reference`, `delete_income_reference` e `month_committed` e atualiza a lista de operações aceitas; não muda nenhum dado que já existe.
8. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261009000003_metas.sql` (metas e plano de guardar, migração 0007) e clique em **Run**. Ela cria as tabelas de metas, de movimentos e da resposta do plano de guardar, a visão `goal_items`, as oito funções novas e atualiza de novo a lista de operações aceitas (26 ações); não muda nenhum dado que já existe. Ela depende da 0006.
9. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261010000001_cartoes.sql` (cartões, faturas e chave da nota fiscal, migração 0008, Ciclo E) e clique em **Run**. Ela cria as tabelas `cards` e `card_entries`, as visões `card_items`, `invoice_items`, `card_entry_items` e `receipt_items`, as 11 funções de cartão (`create_card`, `update_card`, `set_card_status`, `delete_card`, `add_card_purchase`, `add_card_charge`, `add_card_refund`, `update_card_entry`, `delete_card_entry`, `pay_invoice` e `undo_invoice_payment`) e as colunas de ligação em `commitments` e `financial_records`, entre elas `receipt_key`, que guarda só o resumo SHA-256 da chave da nota. Também troca `create_record` (um parâmetro novo no fim, `p_receipt_key`, opcional) e `month_committed` (duas colunas no fim), recria `commitment_items` (três colunas no fim) e atualiza de novo a lista de operações aceitas (37 ações). Não muda nenhum dado que já existe. Ela depende da 0007.
10. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261010000002_orcamento.sql` (orçamento por categoria e limite pessoal de comprometimento, migração 0009, Ciclo F2) e clique em **Run**. Ela cria as tabelas `category_budgets` e `commitment_limits` (com a RLS de leitura e os gatilhos de proteção), o índice `card_entries_ctx_kind` (para o usado no mês), as funções `set_category_budget`, `delete_category_budget`, `set_commitment_limit`, `delete_commitment_limit` e `month_budget` e atualiza de novo a lista de operações aceitas (41 ações). Não muda nenhum dado que já existe e não toca nas tabelas de registros, contas a pagar, cartões ou metas. Ela depende da 0008. Depois dela, a conta nova continua sem orçamento nem limite.
11. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261010000003_contas.sql` (contas de origem do dinheiro, migração 0010, Ciclo G1) e clique em **Run**. Ela acrescenta a `financial_accounts` o tipo (`kind`: banco, dinheiro ou outra), a conta principal (`is_default`), a versão e a exclusão lógica, com índices que garantem uma só principal e nomes sem repetição por contexto, e dois gatilhos (`financial_accounts_default`, que marca a primeira conta ativa como principal, e `financial_accounts_guard`, que impede mudar o que só as funções mudam). Cria as funções `create_account`, `update_account`, `set_default_account`, `set_account_status` e `delete_account` (até 10 contas ativas por contexto; a conta que já tem lançamentos só se arquiva), a coluna opcional `account_id` em `goal_movements` (a origem do aporte e o destino do resgate, só informativa), recria `add_goal_movement`, `update_goal_movement` (sem o argumento da conta, a conta do movimento é mantida), `update_record`, `pay_commitment` (sem conta, vale a principal), `pay_invoice` (sem conta, a principal e não a mais antiga), `ensure_personal_space` (devolve a principal, nunca uma conta arquivada ou excluída) e a validação interna dos registros para aceitar a conta e travar a linha dela, e atualiza de novo a lista de operações aceitas (46 ações). As contas que já existem viram contas do tipo banco e a mais antiga das ativas de cada contexto vira a principal; nenhum lançamento, valor ou total muda. Ela depende da 0009. Depois dela, a conta nova continua com uma só conta, a "Conta principal", e nenhum dado de exemplo. O app publicado antes da 0010 segue funcionando (a troca do nome da conta direto na tabela continua permitida até a publicação deste ciclo).
12. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261011000001_assinaturas.sql` (assinaturas, migração 0011, Ciclo H2) e clique em **Run**. Ela acrescenta a `commitment_series` a marca `subscription` (verdadeiro ou falso, padrão falso), a data da última revisão `subscription_reviewed_on` e o dia da marca `subscription_since`, com a regra `commitment_series_assinatura` (só gasto fixo mensal pode ser assinatura; as duas datas só existem em assinatura), recria a visão `series_items` com as três colunas no fim, cria as funções `set_series_subscription` e `mark_subscriptions_reviewed` e atualiza de novo a lista de operações aceitas (48 ações; a atividade passa a ignorar também `revisar_assinaturas`). Não muda nenhum dado que já existe: todo gasto fixo, parcelamento e conta do ano continua sem marca, e **nenhuma função de antes muda de assinatura**, então o app publicado antes da 0011 segue funcionando depois dela. Ela depende da 0010 e roda uma única vez (colar de novo dá erro de coluna que já existe, sem mudar nada). Depois dela, a conta nova continua sem série e sem assinatura.
12b. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261011000002_importar.sql` (importar extrato e fatura, migração 0012, Ciclo I1) e clique em **Run**. Ela acrescenta `import_key` a `financial_records` e a `card_entries` (resumo SHA-256 da linha importada, único por contexto entre as linhas vivas), a coluna `import_result` a `record_operations`, a visão `import_items` e a função `import_records` (de 1 a 500 linhas por chamada, tudo ou nada), e atualiza de novo a lista de operações aceitas (49 ações; entra `importar_extrato`). Não muda nenhum dado que já existe: todo registro e toda compra continua sem chave de importação, e **nenhuma função de antes muda de assinatura** (`create_record`, `add_card_purchase` e `add_card_refund` seguem como estão), então o app publicado antes da 0012 segue funcionando depois dela. Ela depende da 0011 e roda uma única vez (colar de novo dá erro de coluna que já existe, sem mudar nada). Depois dela, a conta nova continua sem lançamento de exemplo.

12c. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261016000001_familia.sql` (Família: criar, convidar, aceitar, sair, remover, passar a titularidade e encerrar, migração 0013, Ciclo L) e clique em **Run**. Ela acrescenta `ended_at` a `financial_contexts` (a Família encerrada), o índice `context_memberships_one_owner` (um titular ativo por Família), a tabela `family_invites` (o convite guarda só o resumo SHA-256 do código, nunca o código; lida só pelo titular), a visão `family_member_items` (pessoas e ex-membros só com o primeiro nome) e as dez funções `create_family`, `create_family_invite`, `cancel_family_invite`, `preview_family_invite` (só leitura), `accept_family_invite`, `leave_family`, `remove_family_member`, `set_member_role`, `transfer_family_ownership` e `end_family`. Retira a política `memberships_manage` e o `update` direto dos vínculos (a partir daí só as funções mudam vínculo, convite e contexto), recria a política `persons_read` (cada pessoa lê só a própria linha de `persons`: o nome inteiro de outra pessoa não é lido por ninguém, e o primeiro nome dos outros vem só da visão `family_member_items` e das respostas das funções, com "Pessoa da Família" para quem não tem nome para mostrar), recria `pay_commitment` e `undo_commitment_payment` (na Família, quem tem escrita marca como paga a conta de outra pessoa) e `set_income_reference` e `delete_income_reference` (na Família a renda de referência é da casa), todas **com as mesmas assinaturas**, e atualiza de novo a lista de operações aceitas (58 ações; entram as nove da Família, que não contam como anotação para a atividade). A guarda do convite (`family_invites_guard`) deixa `used_by` passar a nulo com o resto igual, para quem aceitou um convite poder apagar a conta (revisão de segurança de 16/10/2026). Não muda nenhum dado que já existe: nenhuma Família, vínculo ou convite é criado, e o Pessoal de ninguém muda. Ela depende da 0012 e roda uma única vez (colar de novo dá erro de coluna que já existe, sem mudar nada). Depois dela, a conta nova continua sem Família e sem dados de exemplo. O app publicado antes da 0013 segue funcionando (sem a tela Família, que só aparece com o app novo).

12d. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261017000001_empresas.sql` (painel de empresas: licenças por função, convite da empresa, contagens de licenças e cadastro pela equipe, migração 0014, Ciclo M) e clique em **Run**. Ela acrescenta a `licenses` o resumo do código do convite (`code_hash`), a data do envio (`invited_at`) e a do cancelamento (`cancelled_at`), com índices que garantem um resumo por licença, **uma licença ativa por pessoa** e um direito ao plano por licença, e três gatilhos de proteção (`licenses_guard`, `licenses_seats_guard` e `benefit_contracts_guard`); acrescenta a `record_operations` a coluna `license_result`, torna `context_id` opcional (só as cinco ações novas ficam sem contexto) e atualiza de novo a lista de operações aceitas (63 ações; a atividade passa a ignorar também as cinco). Cria as sete funções `invite_licenses`, `renew_license_invite`, `cancel_license_invite`, `end_license`, `preview_license_invite` (só leitura), `accept_license` e `organization_usage`, a visão `my_benefit` (o benefício da própria pessoa, sem vagas, outras licenças nem e-mails) e as quatro funções da equipe Clarevo, `clarevo_staff_find_admin`, `clarevo_staff_create_organization`, `clarevo_staff_add_org_admin` e `clarevo_staff_update_contract`, que **só quem roda no SQL Editor executa** (nenhuma pessoa pelo app, e também não a chave de serviço, `service_role`: a migração revoga o `execute` dela de forma segura, conferindo antes se o papel existe). `organization_usage` devolve só as contagens de licenças (vagas, convidadas, ativas e encerradas): o indicador "pessoas que entraram no mês" saiu na revisão de segurança de 16/10/2026, por poder identificar pessoas. Ao aceitar um convite novo, a licença ativa de um contrato já terminado é encerrada no fim do contrato (a pessoa não fica presa a ela), e `licenses_guard` aceita `person_id` nulo numa licença encerrada, para quem já teve licença poder apagar a conta. Retira o `insert`, o `update` e o `delete` diretos em `licenses` (a política `licenses_admin` vira só de leitura, e o app lê só colunas que não incluem o resumo do código nem a pessoa) e acrescenta uma regra ao nome da organização (de 1 a 120 caracteres, sem espaços no começo nem no fim; corrija antes se alguma organização cadastrada à mão tiver espaços nas pontas). Não cria organização, contrato, licença nem direito ao plano: **depois dela nenhuma empresa existe até a equipe cadastrar uma** (item 24). Se já havia licenças de antes (o app não tinha como criá-las), elas continuam como estão, e as convidadas ficam sem link: o RH usa "Reenviar convite" para gerar um. Ela depende da 0013 e roda uma única vez (colar de novo dá erro de coluna que já existe, sem mudar nada). O app publicado antes da 0014 segue funcionando (sem o painel e sem o card "Benefício pela empresa").

12e. **Depois**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261018000001_exclusao.sql` (excluir a minha conta pelo app, migração 0015, Ciclo P, D-058, regras "a confirmar com advogado") e clique em **Run**. Ela cria a função `delete_my_account` (a pessoa digita `EXCLUIR` no app; só quem está entrando com sessão a executa, `anon` não) e as funções de apoio `clarevo_erase_context`, `clarevo_erase_person` e `clarevo_erase_on_user_delete` e as guardas `persons_auth_guard`, `financial_contexts_person_guard`, `context_memberships_person_guard` e `record_operations_actor_guard`, que **ninguém executa** pelo app (nem `anon`, nem a chave de serviço). Quem exclui a conta perde o acesso na hora, sem desfazer, e o e-mail fica livre para uma conta nova, que começa vazia: o Pessoal inteiro é apagado de verdade (lançamentos, contas a pagar, gastos fixos, contas do ano, metas e movimentos, cartões, lançamentos e faturas, notas, orçamento, limite, renda de referência, contas de origem, assinaturas, importações, operações, atividade, revisão dos últimos meses e resposta do plano de guardar); quem é titular de uma Família com outras pessoas ativas recebe `transferir_antes` e precisa passar a titularidade ou remover as pessoas antes; titular sozinho encerra a Família e apaga os dados dela; membro ou leitor sai da Família e o que anotou continua como histórico da casa, com a autoria "Pessoa que saiu"; a licença ativa da empresa é encerrada no ato e os direitos ao plano saem. Para a autoria continuar, a migração acrescenta `persons.deleted_at`, **retira a chave estrangeira de `persons` para `auth.users`** (a linha da pessoa só fica depois da exclusão, sem nome e sem e-mail, enquanto ainda for autora de algo numa Família que continua; quem não é autora de nada é apagada, e a Família que acaba leva junto as pessoas anônimas que só existiam por causa dela), deixa o nome vazio só na pessoa excluída, recria a política `persons_update_self` (só quem ainda está ativa renomeia a própria linha), recria a visão `family_member_items` e `clarevo_person_label` ("Pessoa que saiu"), recria `ensure_personal_space` e `clarevo_materialize_series` com a mesma assinatura (a primeira toma a trava por pessoa da exclusão antes de ler `auth.users`; a segunda, a geração das contas de gasto fixo, confere a pessoa que criou a série) e cria dois gatilhos: `record_operations_actor_guard`, que recusa (`conta_excluida`) gravar em nome de quem excluiu a conta, de modo que uma gravação em andamento em outro aparelho nunca deixa registro, operação nem atividade para trás, e `clarevo_erase_on_user_delete` em `auth.users`: o **"Delete user" do painel do Supabase** passa a seguir as mesmas regras (antes falhava por chaves estrangeiras) e também recusa com `transferir_antes` quem é titular com outras pessoas ativas. Não muda nenhum dado que já existe, não cria linha nenhuma e **não acrescenta ação a `record_operations`** (seguem 63: a conta some com o rastro, então não há operação para guardar); depois dela o app executa 80 funções. A função apaga a linha de `auth.users` com os privilégios de quem colou a migração (o dono do banco, no SQL Editor); a consulta 21c confere isso (`apaga_usuario_0015`). Ela depende da 0014 e roda uma única vez (colar de novo dá erro de coluna que já existe, sem mudar nada). O app publicado antes da 0015 segue funcionando (sem a tela "Excluir minha conta", que só aparece com o app novo).
12f. **Por último**, numa nova consulta, cole todo o conteúdo de `supabase/migrations/20261019000001_mes_conferido.sql` ("Conferi este mês", migração 0016, Ciclo S, D-060, resolve P-022) e clique em **Run**. Ela cria a tabela `month_checks` (a marca "Conferi: não houve gastos em {mês}" ou "não houve recebimentos", por contexto, mês e tipo; só quem lê o contexto lê, **ninguém grava direto**) e as funções `set_month_check` e `clear_month_check` (marcar e desmarcar, com chave de idempotência e versão; só quem entra com sessão e tem escrita no contexto as executa, `anon` não), mais as funções de apoio `month_checks_guard`, `clarevo_month_check_result` e `clarevo_month_check_validate`, que **ninguém executa** pelo app (nem `anon`, nem a chave de serviço). Recria `months_overview` com os mesmos argumentos e duas colunas a mais no fim, `received_checked` e `paid_checked` (a marca vale: existe e o mês não tem registro do tipo), e `clarevo_track_activity`, para que marcar e desmarcar **não contem como anotação** em "Seus últimos meses" (D-030). A marca só vale com o mês terminado e sem registro do tipo; se depois aparecer um registro no mês, ela deixa de valer sem ser apagada, e volta a valer quando o registro é excluído; **nunca muda nenhum total**. Na exclusão da conta, o Pessoal leva as marcas e, numa Família que continua, a marca fica com a autoria "Pessoa que saiu". Não muda nenhum dado que já existe, não cria linha nenhuma (a tabela nasce vazia, e conta nova nunca recebe marca de exemplo) e **acrescenta duas ações a `record_operations`** (`marcar_mes_conferido` e `desmarcar_mes_conferido`, 65 ao todo); depois dela o app executa 82 funções. Ela depende da 0015 e roda uma única vez (colar de novo dá erro de tabela que já existe, sem mudar nada). O app publicado antes da 0016 segue funcionando (a leitura devolve colunas a mais, que ele ignora, e ele não tem a ação "Conferi"); o app novo sem a 0016 mostra a ação, e marcar falha com o aviso de que não deu para salvar, então cole a 0016 **antes** de publicar o app do Ciclo S.

13. A ordem importa: cada arquivo altera tabelas e funções criadas pelos anteriores (a 0006 vem depois da 0005, a 0007 depois da 0006, a 0008 depois da 0007, a 0009 depois da 0008, a 0010 depois da 0009, a 0011 depois da 0010, a 0012 depois da 0011, a 0013 depois da 0012, a 0014 depois da 0013, a 0015 depois da 0014 e a 0016 depois da 0015). Cada arquivo roda uma única vez; se o projeto já tinha os primeiros, rode só os que faltam, na ordem dos nomes.
14. Todos devem terminar sem erro. Se aparecer erro, me envie a mensagem.
15. Para conferir as migrações novas, rode numa nova consulta:

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
16. Para conferir a 0008, rode em outra consulta (só leitura):

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
17. Para conferir a 0009, rode em outra consulta (só leitura):

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
          (select count(*) from pg_indexes
            where schemaname = 'public' and indexname = 'card_entries_ctx_kind') as indice_0009,
          has_function_privilege('authenticated', 'public.set_category_budget(text, uuid, text, date, integer, bigint)', 'execute') as permissao_0009;
   ```

   O resultado esperado é `funcoes_0009 = 5`, `tabelas_0009 = 2`, `gatilhos_0009 = 2`, `regras_0009 = 2`, `acoes_0009 = 41`, `indice_0009 = 1` e `permissao_0009 = true`. Essa consulta foi testada em 10/10/2026 num banco local descartável, montado com `supabase/tests/00_auth_shim.sql` e as nove migrações (apagado depois), e devolveu 5, 2, 2, 2, 41, 1 e verdadeiro.
18. Para conferir a 0010, rode em outra consulta (só leitura):

   ```sql
   select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('create_account', 'update_account', 'set_default_account', 'set_account_status',
                  'delete_account')) as funcoes_0010,
          (select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'financial_accounts'
              and column_name in ('kind', 'is_default', 'version', 'updated_at', 'deleted_at', 'deleted_by')) as colunas_contas_0010,
          (select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'goal_movements' and column_name = 'account_id') as coluna_metas_0010,
          (select count(*) from pg_trigger
            where tgname in ('financial_accounts_guard', 'financial_accounts_default') and not tgisinternal) as gatilhos_0010,
          (select count(*) from pg_indexes
            where schemaname = 'public' and indexname in ('financial_accounts_one_default', 'financial_accounts_name_live')) as indices_0010,
          (select count(*) from pg_policies where schemaname = 'public' and tablename = 'financial_accounts') as regras_0010,
          (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
            where c.conname = 'record_operations_action_check') as acoes_0010,
          (select count(*) from (select context_id from public.financial_accounts where deleted_at is null
                                  group by context_id having count(*) filter (where is_default) <> 1) x) as contextos_sem_principal_0010,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'clarevo_require_account_owner') as apoio_0010,
          has_function_privilege('authenticated', 'public.create_account(text, uuid, text, text)', 'execute') as permissao_0010;
   ```

   O resultado esperado é `funcoes_0010 = 5`, `colunas_contas_0010 = 6`, `coluna_metas_0010 = 1`, `gatilhos_0010 = 2`, `indices_0010 = 2`, `regras_0010 = 2`, `acoes_0010 = 46`, `contextos_sem_principal_0010 = 0`, `apoio_0010 = 1` e `permissao_0010 = true`. Essa consulta foi testada em 10/10/2026 num banco local descartável, montado com `supabase/tests/00_auth_shim.sql` e as dez migrações (apagado depois), e também num banco com dados anteriores à 0010 (apagado depois), e devolveu 5, 6, 1, 2, 2, 2, 46, 0, 1 e verdadeiro. Depois da 0011, `acoes_0010` passa a 48 (a 0011 acrescenta duas ações); o número vigente está na consulta do passo 19.
19. Para conferir a 0011, rode em outra consulta (só leitura):

   ```sql
   select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('set_series_subscription', 'mark_subscriptions_reviewed')) as funcoes_0011,
          (select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'commitment_series'
              and column_name in ('subscription', 'subscription_reviewed_on', 'subscription_since')) as colunas_0011,
          (select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'series_items'
              and column_name in ('subscription', 'subscription_reviewed_on', 'subscription_since')) as colunas_visao_0011,
          (select count(*) from pg_constraint
            where conrelid = 'public.commitment_series'::regclass and conname = 'commitment_series_assinatura') as regra_0011,
          (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
            where c.conname = 'record_operations_action_check') as acoes_0011,
          (select count(*) from public.commitment_series where subscription) as assinaturas_0011,
          has_function_privilege('authenticated', 'public.set_series_subscription(text, uuid, integer, boolean)', 'execute')
            and has_function_privilege('authenticated', 'public.mark_subscriptions_reviewed(text, uuid)', 'execute') as permissao_0011;
   ```

   O resultado esperado é `funcoes_0011 = 2`, `colunas_0011 = 3`, `colunas_visao_0011 = 3`, `regra_0011 = 1`, `acoes_0011 = 48`, `assinaturas_0011 = 0` (nenhuma série ganha a marca sozinha; o número só sobe quando alguém marca uma assinatura no app) e `permissao_0011 = true`. Essa consulta foi testada em 11/10/2026 num banco local descartável, montado com `supabase/tests/00_auth_shim.sql` e as onze migrações (apagado depois), e devolveu 2, 3, 3, 1, 48, 0 e verdadeiro.
20. Para conferir a 0012, rode em outra consulta (só leitura):

   ```sql
   select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'import_records') as funcoes_0012,
          (select count(*) from information_schema.columns
            where table_schema = 'public' and column_name = 'import_key'
              and table_name in ('financial_records', 'card_entries')) as colunas_0012,
          (select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'record_operations' and column_name = 'import_result') as coluna_operacoes_0012,
          (select count(*) from pg_indexes
            where schemaname = 'public' and indexname in ('financial_records_import_key', 'card_entries_import_key')) as indices_0012,
          (select count(*) from pg_constraint
            where conname in ('financial_records_import_key', 'card_entries_import_key', 'record_operations_import_check')) as regras_0012,
          (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
            where c.conname = 'record_operations_action_check') as acoes_0012,
          (select count(*) from information_schema.views
            where table_schema = 'public' and table_name = 'import_items') as visao_0012,
          (select count(*) from public.financial_records where import_key is not null)
            + (select count(*) from public.card_entries where import_key is not null) as importadas_0012,
          has_function_privilege('authenticated', 'public.import_records(text, uuid, text, uuid, jsonb)', 'execute') as permissao_0012;
   ```

   O resultado esperado é `funcoes_0012 = 1`, `colunas_0012 = 2`, `coluna_operacoes_0012 = 1`, `indices_0012 = 2`, `regras_0012 = 3`, `acoes_0012 = 49`, `visao_0012 = 1`, `importadas_0012 = 0` (nenhuma linha ganha chave sozinha; o número só sobe quando alguém importa um arquivo no app) e `permissao_0012 = true`. Essa consulta foi testada em 11/10/2026 num banco local descartável, montado com `supabase/tests/00_auth_shim.sql` e as doze migrações, e também num banco com um gasto e um cartão anteriores à 0012 (as onze primeiras migrações, os dados e depois a 0012): devolveu os mesmos números, e o gasto anterior continuou sem chave. Os dois bancos foram apagados em seguida. Refeita em 15/10/2026, depois da revisão do Ciclo I1 (que não mudou a 0012), num banco descartável montado do mesmo jeito: devolveu os mesmos números e o banco foi apagado.
21. Para conferir a 0013, rode em outra consulta (só leitura):

   ```sql
   select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('create_family', 'create_family_invite', 'cancel_family_invite', 'preview_family_invite',
                  'accept_family_invite', 'leave_family', 'remove_family_member', 'set_member_role', 'transfer_family_ownership',
                  'end_family')) as funcoes_0013,
          (select count(*) from information_schema.tables
            where table_schema = 'public' and table_name = 'family_invites') as tabelas_0013,
          (select count(*) from information_schema.views
            where table_schema = 'public' and table_name = 'family_member_items') as visoes_0013,
          (select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'financial_contexts' and column_name = 'ended_at') as coluna_0013,
          (select count(*) from pg_indexes
            where schemaname = 'public' and indexname in ('context_memberships_one_owner', 'family_invites_code_hash')) as indices_0013,
          (select count(*) from pg_policies where schemaname = 'public' and tablename = 'family_invites') as regras_convites_0013,
          (select count(*) from pg_policies where schemaname = 'public' and policyname = 'memberships_manage') as regra_antiga_0013,
          (select count(*) from pg_policies
            where schemaname = 'public' and tablename = 'persons' and policyname = 'persons_read'
              and qual not like '%context_memberships%') as leitura_pessoas_0013,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('clarevo_first_name', 'clarevo_person_label')) as nomes_0013,
          (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
            where c.conname = 'record_operations_action_check') as acoes_0013,
          (select count(*) from public.family_invites) as convites_0013,
          has_function_privilege('authenticated', 'public.create_family(text, text)', 'execute')
            and has_function_privilege('authenticated', 'public.accept_family_invite(text, text)', 'execute')
            and not has_function_privilege('anon', 'public.create_family(text, text)', 'execute') as permissao_0013;
   ```

   O resultado esperado é `funcoes_0013 = 10`, `tabelas_0013 = 1`, `visoes_0013 = 1`, `coluna_0013 = 1`, `indices_0013 = 2`, `regras_convites_0013 = 1`, `regra_antiga_0013 = 0` (a política `memberships_manage` deixou de existir), `leitura_pessoas_0013 = 1` (a política `persons_read` foi recriada e já não lê as outras pessoas do contexto; se vier 0, a política antiga continua e o nome inteiro de quem divide a Família seria lido), `nomes_0013 = 2` (`clarevo_first_name` e `clarevo_person_label`), `acoes_0013 = 58`, `convites_0013 = 0` (nenhum convite nasce sozinho; o número só sobe quando um titular convida pelo app) e `permissao_0013 = true`. Essa consulta foi testada em 16/10/2026 num banco local descartável, montado com `supabase/tests/00_auth_shim.sql` e as treze migrações (apagado depois), e devolveu 10, 1, 1, 1, 2, 1, 0, 1, 2, 58, 0 e verdadeiro. Refeita em 16/10/2026, depois da revisão de segurança da Família (que acrescentou `leitura_pessoas_0013` e `nomes_0013`), num banco descartável montado do mesmo jeito: devolveu esses mesmos números e o banco foi apagado.
21b. Para conferir a 0014, rode em outra consulta (só leitura):

   ```sql
   select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('invite_licenses', 'renew_license_invite', 'cancel_license_invite', 'end_license',
                  'preview_license_invite', 'accept_license', 'organization_usage')) as funcoes_0014,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('clarevo_staff_find_admin', 'clarevo_staff_create_organization',
                  'clarevo_staff_add_org_admin', 'clarevo_staff_update_contract')) as funcoes_equipe_0014,
          (select count(*) from information_schema.views
            where table_schema = 'public' and table_name = 'my_benefit') as visao_0014,
          (select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'licenses' and column_name in ('code_hash', 'invited_at', 'cancelled_at')) as colunas_0014,
          (select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'record_operations' and column_name = 'license_result') as coluna_operacoes_0014,
          (select count(*) from pg_indexes
            where schemaname = 'public' and indexname in ('licenses_code_hash', 'licenses_one_active_per_person', 'plan_entitlements_one_per_license')) as indices_0014,
          (select count(*) from pg_policies
            where schemaname = 'public' and tablename = 'licenses' and policyname = 'licenses_admin' and cmd = 'SELECT') as regra_rh_0014,
          (select count(*) from pg_policies
            where schemaname = 'public' and tablename = 'licenses' and policyname = 'licenses_admin' and cmd <> 'SELECT') as regra_antiga_0014,
          (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
            where c.conname = 'record_operations_action_check') as acoes_0014,
          (select count(*) from public.licenses) as licencas_0014,
          has_table_privilege('authenticated', 'public.licenses', 'insert')
            or has_table_privilege('authenticated', 'public.licenses', 'update')
            or has_table_privilege('authenticated', 'public.licenses', 'delete')
            or has_column_privilege('authenticated', 'public.licenses', 'code_hash', 'select')
            or has_column_privilege('authenticated', 'public.licenses', 'person_id', 'select') as acesso_indevido_0014,
          has_function_privilege('authenticated', 'public.invite_licenses(uuid, text[], text)', 'execute')
            and has_function_privilege('authenticated', 'public.accept_license(text, text)', 'execute')
            and has_function_privilege('authenticated', 'public.organization_usage(uuid)', 'execute')
            and not has_function_privilege('anon', 'public.accept_license(text, text)', 'execute')
            and not has_function_privilege('authenticated', 'public.clarevo_staff_create_organization(text, integer, text, date, date, text)', 'execute')
            and not has_function_privilege('authenticated', 'public.clarevo_staff_update_contract(uuid, integer, date)', 'execute') as permissao_0014,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('clarevo_staff_find_admin', 'clarevo_staff_create_organization',
                  'clarevo_staff_add_org_admin', 'clarevo_staff_update_contract')
              and exists (select 1 from pg_roles r where r.rolname = 'service_role' and has_function_privilege(r.oid, p.oid, 'execute'))) as equipe_com_service_role_0014,
          (pg_get_functiondef('public.organization_usage(uuid)'::regprocedure) !~* 'auth\.users|last_sign_in_at') as uso_sem_acesso_0014,
          (position('new.person_id is null and old.person_id is not null' in pg_get_functiondef('public.licenses_guard()'::regprocedure)) > 0) as guarda_apagar_conta_0014;
   ```

   O resultado esperado é `funcoes_0014 = 7`, `funcoes_equipe_0014 = 4`, `visao_0014 = 1`, `colunas_0014 = 3`, `coluna_operacoes_0014 = 1`, `indices_0014 = 3`, `regra_rh_0014 = 1` (a política `licenses_admin` agora só lê), `regra_antiga_0014 = 0` (se vier 1, a política antiga, que também gravava, continua), `acoes_0014 = 63`, `licencas_0014 = 0` (nenhuma licença nasce sozinha; o número só sobe quando o RH convida pelo painel), `acesso_indevido_0014 = false` (ninguém pelo app grava em `licenses` nem lê o resumo do código ou a pessoa) `permissao_0014 = true` (a empresa executa as funções dela; `anon` não executa; as funções da equipe não são executáveis pelo app), `equipe_com_service_role_0014 = 0` (nenhuma função da equipe é executável por `service_role`; se o seu projeto não tiver esse papel, também dá 0), `uso_sem_acesso_0014 = true` (`organization_usage` não lê `auth.users` nem o último acesso) e `guarda_apagar_conta_0014 = true` (a guarda de `licenses` aceita `person_id` nulo numa licença encerrada, para quem já teve licença poder apagar a conta; se vier `false`, o arquivo colado é uma versão anterior à revisão de segurança de 16/10/2026). Essa consulta foi testada em 16/10/2026 num banco local descartável, montado com `supabase/tests/00_auth_shim.sql` (que cria o papel `service_role` como o Supabase) e as catorze migrações (apagado depois), e devolveu 7, 4, 1, 3, 1, 3, 1, 0, 63, 0, falso, verdadeiro, 0, verdadeiro e verdadeiro; também num banco montado até a 0013, com uma licença convidada e uma ativa de antes e depois a 0014: devolveu os mesmos números, com `licencas_0014 = 2`, e as duas licenças continuaram como estavam. As catorze migrações também rodaram num banco sem o papel `service_role` (Postgres comum), sem erro.
21c. Para conferir a 0015, rode em outra consulta (só leitura):

   ```sql
   select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'delete_my_account') as funcao_0015,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('clarevo_erase_context', 'clarevo_erase_person', 'clarevo_erase_on_user_delete',
                  'persons_auth_guard', 'financial_contexts_person_guard', 'context_memberships_person_guard',
                  'record_operations_actor_guard')) as apoio_0015,
          (select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'persons' and column_name = 'deleted_at') as coluna_0015,
          (select count(*) from pg_constraint
            where conrelid = 'public.persons'::regclass and contype = 'f') as ligacao_antiga_0015,
          (select count(*) from pg_trigger
            where not tgisinternal and tgname in ('clarevo_erase_on_user_delete', 'persons_auth_guard',
                  'financial_contexts_person_guard', 'context_memberships_person_guard', 'record_operations_actor_guard')) as gatilhos_0015,
          (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
            where c.conname = 'record_operations_action_check') as acoes_0015,
          (select count(*) from public.persons where deleted_at is not null) as pessoas_anonimas_0015,
          (select count(*) from public.persons p
            where not exists (select 1 from auth.users u where u.id = p.id) and p.deleted_at is null) as pessoas_sem_usuario_0015,
          has_function_privilege('authenticated', 'public.delete_my_account(text, text)', 'execute')
            and not has_function_privilege('anon', 'public.delete_my_account(text, text)', 'execute') as permissao_0015,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('clarevo_erase_context', 'clarevo_erase_person', 'clarevo_erase_on_user_delete',
                  'persons_auth_guard', 'financial_contexts_person_guard', 'context_memberships_person_guard',
                  'record_operations_actor_guard')
              and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))) as apoio_aberto_0015,
          (select count(*) from pg_policies
            where schemaname = 'public' and tablename = 'persons' and policyname = 'persons_update_self'
              and qual like '%deleted_at IS NULL%') as regra_renomear_0015,
          (pg_get_viewdef('public.family_member_items'::regclass) like '%Pessoa que saiu%') as visao_autoria_0015,
          (has_table_privilege('auth.users', 'delete') and has_table_privilege('auth.users', 'update')) as apaga_usuario_0015,
          coalesce(pg_get_functiondef(to_regprocedure('public.persons_auth_guard()')) like '%for key share%', false) as guarda_pessoa_0015,
          (select count(*) from pg_trigger t
            where t.tgrelid = 'public.record_operations'::regclass and t.tgname = 'record_operations_actor_guard' and not t.tgisinternal and t.tgenabled = 'O'
              and coalesce(pg_get_functiondef(to_regprocedure('public.record_operations_actor_guard()')) like '%for key share%', false)) as guarda_operacoes_0015,
          coalesce((select position('familia:p:' in d) > 0 and position('familia:p:' in d) < position('from auth.users where id' in d)
                      from (select pg_get_functiondef(to_regprocedure('public.ensure_personal_space(text, text)')) as d) x), false) as trava_entrada_0015,
          coalesce((select position('familia:p:' in d) < position('familia:c:' in d) and position('familia:c:' in d) < position('for update' in d)
                           and position('for update' in d) < position('into v_owned' in d)
                      from (select pg_get_functiondef(to_regprocedure('public.clarevo_erase_person(uuid)')) as d) x), false) as ordem_exclusao_0015,
          coalesce(pg_get_functiondef(to_regprocedure('public.clarevo_materialize_series(uuid)')) like '%v_creator%', false) as geracao_0015;
   ```

   O resultado esperado é `funcao_0015 = 1`, `apoio_0015 = 7`, `coluna_0015 = 1` (`persons.deleted_at`), `ligacao_antiga_0015 = 0` (se vier 1, a chave estrangeira de `persons` para `auth.users` continua e a conta não é apagada sem perder a autoria), `gatilhos_0015 = 5` (o de `auth.users` e as quatro guardas), `acoes_0015 = 63` (a 0015 não acrescenta ação), `pessoas_anonimas_0015 = 0` (o número só sobe quando alguém exclui a conta e ainda é autora de algo numa Família que continua), `pessoas_sem_usuario_0015 = 0` (nenhuma pessoa ativa sem conta), `permissao_0015 = true` (quem entra pelo app executa `delete_my_account`; `anon` não), `apoio_aberto_0015 = 0` (nenhuma função de apoio é executável pelo app), `regra_renomear_0015 = 1` (só a pessoa ativa renomeia a própria linha), `visao_autoria_0015 = true` (a visão dos membros mostra "Pessoa que saiu") e `apaga_usuario_0015 = true` (quem roda no SQL Editor pode apagar a linha de `auth.users`, que é o que a função faz no fim, e travá-la com `for key share`, que a guarda de `persons` faz e que pede o privilégio de atualizar; se vier `false`, a exclusão pelo app falharia no último passo e desfaria tudo, sem apagar nada, e a primeira entrada de uma conta nova também: avise antes de publicar). As cinco últimas conferem as travas da revisão de segurança, e todas devem vir verdadeiras: `guarda_pessoa_0015 = true` (a guarda de `persons` trava a linha de `auth.users`), `guarda_operacoes_0015 = 1` (o gatilho que recusa gravar em nome de quem excluiu a conta está ligado), `trava_entrada_0015 = true` (`ensure_personal_space` toma a trava por pessoa da exclusão antes de ler `auth.users`), `ordem_exclusao_0015 = true` (a exclusão trava a pessoa, as Famílias e a linha da pessoa antes de calcular o que apagar) e `geracao_0015 = true` (a geração das contas de gasto fixo confere a pessoa que criou a série). Se alguma vier `false` ou `0`, o arquivo colado é uma versão anterior à revisão de segurança de 16/10/2026 (a 0015 não tinha sido colada em nenhum projeto antes dela): avise antes de publicar. Se a consulta der erro de coluna `deleted_at` que não existe, a 0015 ainda não foi colada. Essa consulta foi testada em 16/10/2026 num banco local descartável, montado com `supabase/tests/00_auth_shim.sql` e as quinze migrações (apagado depois), e devolveu 1, 7, 1, 0, 5, 63, 0, 0, verdadeiro, 0, 1, verdadeiro, verdadeiro, verdadeiro, 1, verdadeiro, verdadeiro e verdadeiro; também num banco montado até a 0014, com 13 pessoas, 176 gastos, 154 lançamentos de cartão, 3 licenças e 14 usuários de antes e depois a 0015: devolveu os mesmos números, e a soma de verificação de cada tabela conferida (pessoas, gastos, contas a pagar, lançamentos de cartão, contextos, vínculos, licenças, operações, metas e usuários) ficou igual antes e depois da migração; antes da 0015 a mesma consulta dá o erro de coluna `deleted_at`. Nesse mesmo banco, cada uma das 13 pessoas excluiu a conta (sem gravar): 10 foram apagadas e 3, titulares de Família com outras pessoas ativas, receberam `transferir_antes`, sem mudar nada. Os bancos foram apagados em seguida.
21d. Para conferir a 0016, rode em outra consulta (só leitura):

   ```sql
   select (select count(*) from information_schema.tables
            where table_schema = 'public' and table_name = 'month_checks') as tabela_0016,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('set_month_check', 'clear_month_check')) as funcoes_0016,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('month_checks_guard', 'clarevo_month_check_result', 'clarevo_month_check_validate')) as apoio_0016,
          (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
            where c.conname = 'record_operations_action_check') as acoes_0016,
          (select count(*) from pg_proc p, unnest(p.proargmodes) m
            where p.oid = to_regprocedure('public.months_overview(uuid, date, date)') and m = 't') as colunas_leitura_0016,
          (select count(*) from public.month_checks) as marcas_0016,
          (select count(*) from pg_constraint
            where conrelid = 'public.month_checks'::regclass
              and conname in ('month_checks_unica', 'month_checks_context_id_fkey', 'month_checks_checked_by_fkey', 'month_checks_mes', 'month_checks_tipo')) as restricoes_0016,
          (select count(*) from pg_trigger
            where tgrelid = 'public.month_checks'::regclass and tgname = 'month_checks_guard' and not tgisinternal and tgenabled = 'O') as guarda_0016,
          has_function_privilege('authenticated', 'public.set_month_check(uuid, date, text, text, integer)', 'execute')
            and has_function_privilege('authenticated', 'public.clear_month_check(uuid, date, text, text, integer)', 'execute')
            and not has_function_privilege('anon', 'public.set_month_check(uuid, date, text, text, integer)', 'execute')
            and not has_function_privilege('anon', 'public.clear_month_check(uuid, date, text, text, integer)', 'execute') as permissao_0016,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('month_checks_guard', 'clarevo_month_check_result', 'clarevo_month_check_validate')
              and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))) as apoio_aberto_0016,
          (has_table_privilege('authenticated', 'public.month_checks', 'select')
            and not has_table_privilege('authenticated', 'public.month_checks', 'insert, update, delete, truncate')
            and not has_table_privilege('anon', 'public.month_checks', 'select')) as leitura_sem_escrita_0016,
          ((select relrowsecurity from pg_class where oid = 'public.month_checks'::regclass)
            and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'month_checks' and policyname = 'month_checks_read' and cmd = 'SELECT') = 1) as rls_0016,
          (select not p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.months_overview(uuid, date, date)')) as leitura_com_rls_0016,
          (pg_get_functiondef('public.clarevo_track_activity()'::regprocedure) like '%''marcar_mes_conferido'', ''desmarcar_mes_conferido''%') as atividade_0016,
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) as app_executa_0016,
          (select position('insert into public.month_checks' in d) < position('insert into public.record_operations' in d)
             from (select pg_get_functiondef('public.set_month_check(uuid, date, text, text, integer)'::regprocedure) as d) x) as operacao_por_ultimo_0016;
   ```

   O resultado esperado é `tabela_0016 = 1`, `funcoes_0016 = 2`, `apoio_0016 = 3`, `acoes_0016 = 65` (a 0016 acrescenta as duas ações de conferir o mês), `colunas_leitura_0016 = 7` (as cinco colunas de antes de `months_overview` e as duas novas), `marcas_0016 = 0` (nenhuma marca nasce sozinha; o número só sobe quando alguém confere um mês), `restricoes_0016 = 5` (a marca única por contexto, mês e tipo, o dia 1, o tipo e as duas chaves estrangeiras), `guarda_0016 = 1` (a guarda que impede mudar uma marca está ligada), `permissao_0016 = true` (quem entra pelo app executa as duas funções; `anon` não), `apoio_aberto_0016 = 0` (nenhuma função de apoio é executável pelo app), `leitura_sem_escrita_0016 = true` (o app só lê a tabela: sem insert, update nem delete, e `anon` nem lê), `rls_0016 = true` (a segurança por linha está ligada e a política de leitura existe), `leitura_com_rls_0016 = true` (`months_overview` segue com as permissões de quem consulta), `atividade_0016 = true` (marcar e desmarcar não contam como anotação em "Seus últimos meses"), `app_executa_0016 = 82` (as 80 de antes e as 2 novas) e `operacao_por_ultimo_0016 = true` (marcar grava a operação por último, como toda função de escrita). Se alguma vier diferente, o arquivo colado não é o desta versão: avise antes de publicar. Se a consulta der erro de relação `public.month_checks` que não existe, a 0016 ainda não foi colada. Essa consulta foi testada em 19/10/2026 num banco local descartável, montado com `supabase/tests/00_auth_shim.sql` e as dezesseis migrações (apagado depois), e devolveu 1, 2, 3, 65, 7, 0, 5, 1, verdadeiro, 0, verdadeiro, verdadeiro, verdadeiro, verdadeiro, 82 e verdadeiro; também num banco montado até a 0015, com 3 pessoas, 4 contextos, 7 registros, 7 contas a pagar, 3 lançamentos de cartão e 19 operações de antes e depois a 0016: devolveu os mesmos números, e a soma de verificação de cada uma das 25 tabelas (e a das linhas de `months_overview`) ficou igual antes e depois da migração; antes da 0016 a mesma consulta dá o erro de relação `public.month_checks` que não existe. Os bancos foram apagados em seguida.
22. Se o app mostrar erro ao abrir as contas a pagar, os gastos fixos, as contas do ano, as metas, os cartões, a renda comprometida, o orçamento, as contas de origem, as assinaturas, a importação de extrato, a Família, o painel da empresa, a exclusão da conta, a Evolução, a conferência de um mês ou o Resumo logo depois, a API ainda não leu o esquema novo: no SQL Editor, rode `notify pgrst, 'reload schema';`. Faça isso depois de colar a 0016, antes de abrir o app (a 0016 recria `months_overview`, e a API precisa ler a função nova).
23. O consultor de segurança do Supabase (**Advisors**) pode apontar a visão `series_items` como visão com os privilégios de quem a criou (a migração de contas do ano a recria com as mesmas opções). É intencional: ela precisa ler as contas excluídas só em um mês, filtra a permissão de leitura de forma explícita e usa `security_barrier` (ver `docs/01_ARQUITETURA.md`).

24. **Cadastrar uma empresa (só a equipe Clarevo, pelo SQL Editor).** Não existe tela nem cadastro aberto (M-3, D-056): a organização, o contrato e a primeira pessoa administradora (o RH) são criados por funções que só quem roda no SQL Editor do Supabase executa. Nem o app, nem a chave pública, nem outra pessoa conseguem chamá-las. Antes, a pessoa administradora **precisa já ter conta**: criar a conta no app com o e-mail de trabalho, confirmar o e-mail e terminar a primeira entrada ("Sua primeira conta"). Sem isso a função recusa e diz o que fazer (`administrador_sem_conta` ou `administrador_sem_espaco`). Em uma nova consulta, com os dados do contrato assinado (o exemplo é fictício):

   ```sql
   -- nome, vagas, plano ('individual' ou 'familiar'), início, fim (null = sem fim) e e-mail da pessoa administradora
   select public.clarevo_staff_create_organization('Empresa Exemplo', 50, 'individual', '2026-11-01', null, 'rh@empresa-exemplo.com.br');
   ```

   O resultado é um JSON com `organization_id`, `contract_id` e `admin_person_id`: guarde os dois primeiros no registro do contrato. O e-mail é procurado sem diferenciar maiúsculas, e o nome da organização não pode repetir outro (`organizacao_ja_existe`, sem diferenciar maiúsculas). Para **mais uma pessoa administradora** e para **mudar as vagas e o fim do contrato**:

   ```sql
   select public.clarevo_staff_add_org_admin('<organization_id>', 'outra.pessoa@empresa-exemplo.com.br');
   -- vagas e fim novos (fim null = sem fim); as vagas nunca ficam abaixo das licenças convidadas e ativas (vagas_em_uso)
   select public.clarevo_staff_update_contract('<contract_id>', 80, '2027-10-31');
   ```

   Com fim de contrato, o acesso pleno das licenças ativas vai até 30 dias depois do fim (M-4), e `clarevo_staff_update_contract` move esse prazo junto. Depois de cadastrar, a pessoa administradora abre o app **na web**, em Conta › Painel da empresa, e convida as pessoas pelo painel: cada pessoa recebe um link de uso único que o RH envia pelo canal interno da empresa (o Clarevo não envia e-mail). A chave de serviço (`service_role`) também não executa estas funções: só o SQL Editor, que roda como dono do banco. Para conferir quem administra o quê, rode `select o.name, a.person_id from public.organizations o join public.organization_admins a on a.organization_id = o.id;` (só leitura). Nada disso lê ou mostra finanças de ninguém.

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

- Depois da 0014: conta nova não recebe benefício nem empresa de exemplo; em Conta aparece o card "Benefício pela empresa" com "Tenho um convite da empresa", e o card "Painel da empresa" **não** aparece (só para quem administra, e só na web). No projeto de teste, cadastre uma empresa com a sua conta (item 24), abra Conta › Painel da empresa no navegador, convide um segundo e-mail seu, copie o link e abra com a segunda conta: a prévia mostra só o nome da empresa e o plano; aceite, volte ao painel e confira "Ativa". Reenvie um convite (o link antigo deixa de valer), cancele outro e encerre a licença com a confirmação dos 30 dias; a segunda conta continua entrando e vendo os seus registros. O card "Uso do app" mostra só as contagens de licenças (vagas, convites, ativas e encerradas): nada de quem entrou no app nem de quando, e nada do painel mostra valores, categorias, metas, contas, cartões nem a Família de ninguém.

- Depois da 0015: em Conta, o último item é "Excluir minha conta" (sem destaque de alerta). Ele explica o que é apagado e o que fica, oferece "Exportar meus dados antes" e pede para digitar `EXCLUIR`. Teste só com contas de teste, nunca com a sua conta de verdade: crie uma conta nova, anote um gasto, exclua a conta pelo app e confira que o app sai e mostra "Sua conta foi excluída", que entrar de novo com a senha antiga é recusado e que **o mesmo e-mail cria uma conta nova que começa vazia** (sem o gasto, sem Família e sem dados de exemplo). Com uma Família de teste: quem é titular com outra pessoa ativa vê o aviso para passar a titularidade ou remover a pessoa antes (`transferir_antes`); quem é membro exclui a conta, e na Família o que anotou continua com a autoria "Pessoa que saiu". No painel do Supabase, "Delete user" num usuário de teste agora funciona e segue as mesmas regras. Os prazos de guarda e os textos finais passam por advogado antes de publicar nas lojas (D-058).

- Depois da 0016: na Evolução (Pago), um mês já terminado e sem gastos mostra "Sem registros" e o botão "Conferi: não houve gastos em {mês}", com a nota "Não muda nenhum valor e você pode desfazer." Toque nele: o ponto vira "R$ 0,00, conferido", entra na média e na mediana como zero ("n de N meses" sobe em um) e o painel passa a dizer "Você conferiu: não houve gastos em {mês}." com "Desfazer a conferência"; o total dos meses exibidos não muda. Anote um gasto nesse mês: ele volta a ser um mês com registros e a frase some (a marca fica guardada); exclua o gasto, e o "conferido" volta sozinho. Em Recebido a marca é outra (a de Pago não vale lá). O mês atual não tem o botão. O mesmo botão aparece em Pago e Recebido de um mês passado sem registros (em Movimentos, com a frase que antes dizia "Mês sem anotação não quer dizer mês sem gastos") e em Seus últimos meses, em "Atualizar agora": mês conferido deixa de contar como "com algo sem registro" naquele tipo, e as contas em aberto e os números sem conta seguem como antes. Marcar ou desfazer não muda nenhum total, não cria registro e não conta como anotação (a faixa de Seus últimos meses não aparece nem some por causa disso; só o número de "meses com algo sem registro" pode baixar). Numa Família de teste, quem só vê lê a frase e não tem o botão; titular e membro marcam e desmarcam, inclusive a marca de outra pessoa. Com a conta de teste excluída, o Pessoal leva as marcas, e as da Família ficam com a autoria "Pessoa que saiu". No SQL Editor, `select * from public.month_checks` mostra as marcas (só para conferir; nunca grave direto).

Os testes de permissão do banco (`npm run test:db`) rodam em Postgres local com uma simulação do esquema de autenticação do Supabase; esses scripts não devem ser aplicados no Supabase. O mesmo vale para o gancho de teste de `supabase/tests/run_api.sh`, que muda o "hoje" de uma requisição só no banco descartável dos testes de API. Depois de criar o projeto, repetir os fluxos pelo app no `clarevo-teste`.

## Custos (consultados em 07/10/2026 no repositório oficial do Supabase)

- **Free (US$ 0):** bom para desenvolvimento. Pausa o projeto após 1 semana sem uso, não tem backup automático e o e-mail embutido envia cerca de 2 mensagens por hora, só para a equipe do projeto. Não serve para pessoas reais.
- **Pro (a partir de US$ 25 por mês por organização):** não pausa, backup diário de 7 dias, 100 mil usuários ativos por mês incluídos e proteção contra senhas vazadas. Cada projeto a mais (por exemplo, `clarevo-teste`) soma cerca de US$ 10 por mês.
- **E-mail próprio (SMTP):** sem custo no Supabase; o custo é do provedor escolhido.
- **Recuperação para um ponto no tempo (PITR):** cerca de US$ 105 por mês a mais; pode esperar haver volume real.
