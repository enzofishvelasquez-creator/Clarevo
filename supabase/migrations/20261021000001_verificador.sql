-- Clarevo · migração 0017 · Ajustes do Verificador do Supabase (Security Advisor e Performance Advisor, 21/10/2026).
-- Depois de 20261019000001_mes_conferido.sql.
-- O Verificador do painel, rodado no projeto de produção (migrações até a 0016), apontou 9 erros e 82 avisos de segurança, além de
-- avisos e informações de desempenho. O mesmo verificador oficial (splinter), rodado num banco local com todas as migrações, deu o mesmo
-- quadro. Esta migração corrige o que era defeito e deixa documentado, em docs/05_SUPABASE.md, o que aparece de propósito.
--
-- Esta migração NÃO cria tabela, visão nem função, NÃO muda regra financeira, de permissão nem de autoria, e NÃO mexe em privilégios
-- (por isso não repete o bloco final de revoke e grant das migrações anteriores, que existe para dar execute às funções novas).
-- Ela só faz três coisas, todas repetíveis sem efeito colateral:
--
-- 1. Função com search_path fixo (aviso "Function Search Path Mutable"): financial_records_guard() é o gatilho que impede mudar os campos
--    imutáveis de um registro e carimba updated_at. Só compara colunas da própria linha e chama now(); nada depende de outro esquema.
--    Passa a ter search_path = public, como todas as outras funções do app (as 8 que usam pgcrypto já fixam public, extensions).
--
-- 2. Políticas com (select auth.uid()) (aviso "Auth RLS Initialization Plan", 10 políticas): escrito com auth.uid() solto, o Postgres
--    chama a função a cada linha lida; dentro de (select ...) ele chama uma vez por consulta e reaproveita o valor. O resultado é
--    exatamente o mesmo; só muda o desempenho com tabelas grandes. Cada política abaixo mantém papel, comando e regra como estavam
--    (as expressões vêm de pg_policies do banco depois das migrações até a 0016), trocando só auth.uid() por (select auth.uid()).
--
-- 3. Índices nas chaves estrangeiras sem índice (informação "Unindexed foreign keys", 40 chaves): sem índice na coluna da chave, apagar a
--    linha de origem (excluir a conta, D-058, e o que sai em cascata) e as junções por essa coluna varrem a tabela inteira. Um índice
--    por chave, com as colunas na ordem da chave: <tabela>_<colunas>_fk_idx. Só entra chave que não tem nenhum índice com as colunas da
--    chave na frente, o mesmo critério do verificador, que conta também índice parcial (com where). Por isso 14 chaves (a maioria
--    context_id, que já tem índice parcial de "não excluídos") não ganham índice novo.
--
-- O que continua aparecendo DE PROPÓSITO e não é mudado aqui (docs/05_SUPABASE.md, "Verificador do Supabase: o que é esperado"):
-- - ERRO "Security Definer View" (8 visões: series_items, card_items, invoice_items, card_entry_items, receipt_items, import_items,
--   my_benefit e family_member_items) e ERRO "Exposed Auth Users" (family_member_items): essas visões têm filtro de permissão explícito
--   na própria consulta (context_permission ou a pessoa da sessão), security_barrier e nenhum acesso de anon; family_member_items só toca
--   em auth.users para escolher o primeiro nome e nunca devolve e-mail nem o nome inteiro de outra pessoa. Ver os comentários das
--   migrações que as criam. As visões commitment_items e goal_items usam security_invoker e não aparecem.
-- - AVISO "Signed-In Users Can Execute SECURITY DEFINER Function" (80 funções): as funções de escrita e de apoio do app, de propósito
--   (CLAUDE.md: toda escrita passa por função com autorização validada no banco; as de apoio, os gatilhos e as da equipe Clarevo não
--   têm execute para quem tem sessão e não aparecem).
-- - AVISO "Multiple Permissive Policies" em licenses (licenses_admin e licenses_own_read, as duas de leitura): uma é da empresa, que
--   lê as licenças do próprio contrato, e a outra é da própria pessoa; unir as duas mexeria numa regra de Empresas (D-056) sem ganho
--   de desempenho com a tabela pequena. Fica como está.
-- - AVISO "Extension in Public" (pgcrypto): só no banco local dos testes; no Supabase o pgcrypto já fica no esquema extensions.
-- - INFORMAÇÃO "Unused Index": esperada num banco novo, sem uso ainda.
-- - Proteção contra senhas vazadas (Auth): é configuração do projeto, não do banco, e depende do plano (a conferir quando assinar o Pro).
--
-- Teste: supabase/tests/99v_verificador.sql (guarda contra o retorno de cada ponto acima).

-- ---------------------------------------------------------------------------
-- 1. search_path fixo no gatilho dos registros
-- ---------------------------------------------------------------------------
alter function public.financial_records_guard() set search_path = public;

-- ---------------------------------------------------------------------------
-- 2. As 10 políticas, com (select auth.uid()) e a mesma regra de antes
-- ---------------------------------------------------------------------------
-- Pessoas: cada uma lê e atualiza só a própria linha (atualizar: só nome de apresentação e idioma, por privilégio de coluna).
alter policy persons_read on public.persons
  using (id = (select auth.uid()));
alter policy persons_update_self on public.persons
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()) and deleted_at is null);

-- Vínculos: a própria linha, ou os vínculos do contexto que a pessoa pode ler.
alter policy memberships_read on public.context_memberships
  using (person_id = (select auth.uid()) or public.context_permission(context_id, 'read'));

-- Contas: renomear exige escrita no contexto e ser autora da conta ou poder editar o que outras pessoas anotaram.
alter policy accounts_rename on public.financial_accounts
  using (deleted_at is null and public.context_permission(context_id, 'write')
         and (created_by = (select auth.uid()) or public.context_permission(context_id, 'edit_others')))
  with check (deleted_at is null and public.context_permission(context_id, 'write')
         and (created_by = (select auth.uid()) or public.context_permission(context_id, 'edit_others')));

-- Leituras só da própria pessoa: histórico de operações, licença, direito ao plano, atividade, revisão dos últimos meses e plano de guardar.
alter policy operations_read_own on public.record_operations
  using (actor_id = (select auth.uid()));
alter policy licenses_own_read on public.licenses
  using (person_id = (select auth.uid()));
alter policy entitlements_own_read on public.plan_entitlements
  using (person_id = (select auth.uid()));
alter policy context_activity_own on public.context_activity
  using (person_id = (select auth.uid()) and public.context_permission(context_id, 'read'));
alter policy return_reviews_own on public.return_reviews
  using (person_id = (select auth.uid()) and public.context_permission(context_id, 'read'));
alter policy savings_checks_own on public.savings_checks
  using (person_id = (select auth.uid()) and public.context_permission(context_id, 'read'));

-- ---------------------------------------------------------------------------
-- 3. Índices das chaves estrangeiras sem índice (40), na ordem das colunas da chave
-- ---------------------------------------------------------------------------
create index if not exists benefit_contracts_organization_id_fk_idx on public.benefit_contracts (organization_id);
create index if not exists card_entries_card_id_context_id_fk_idx on public.card_entries (card_id, context_id);
create index if not exists card_entries_created_by_fk_idx on public.card_entries (created_by);
create index if not exists card_entries_deleted_by_fk_idx on public.card_entries (deleted_by);
create index if not exists cards_created_by_fk_idx on public.cards (created_by);
create index if not exists cards_deleted_by_fk_idx on public.cards (deleted_by);
create index if not exists category_budgets_created_by_fk_idx on public.category_budgets (created_by);
create index if not exists category_budgets_deleted_by_fk_idx on public.category_budgets (deleted_by);
create index if not exists commitment_limits_created_by_fk_idx on public.commitment_limits (created_by);
create index if not exists commitment_limits_deleted_by_fk_idx on public.commitment_limits (deleted_by);
create index if not exists commitment_series_created_by_fk_idx on public.commitment_series (created_by);
create index if not exists commitment_series_deleted_by_fk_idx on public.commitment_series (deleted_by);
create index if not exists commitments_card_id_context_id_fk_idx on public.commitments (card_id, context_id);
create index if not exists commitments_created_by_fk_idx on public.commitments (created_by);
create index if not exists commitments_deleted_by_fk_idx on public.commitments (deleted_by);
create index if not exists commitments_series_id_context_id_fk_idx on public.commitments (series_id, context_id);
create index if not exists context_memberships_person_id_fk_idx on public.context_memberships (person_id);
create index if not exists family_invites_created_by_fk_idx on public.family_invites (created_by);
create index if not exists family_invites_used_by_fk_idx on public.family_invites (used_by);
create index if not exists financial_accounts_created_by_fk_idx on public.financial_accounts (created_by);
create index if not exists financial_accounts_deleted_by_fk_idx on public.financial_accounts (deleted_by);
create index if not exists financial_records_account_id_context_id_currency_fk_idx on public.financial_records (account_id, context_id, currency);
create index if not exists financial_records_card_id_context_id_fk_idx on public.financial_records (card_id, context_id);
create index if not exists financial_records_commitment_id_context_id_fk_idx on public.financial_records (commitment_id, context_id);
create index if not exists financial_records_created_by_fk_idx on public.financial_records (created_by);
create index if not exists financial_records_deleted_by_fk_idx on public.financial_records (deleted_by);
create index if not exists goal_movements_account_id_context_id_fk_idx on public.goal_movements (account_id, context_id);
create index if not exists goal_movements_created_by_fk_idx on public.goal_movements (created_by);
create index if not exists goal_movements_deleted_by_fk_idx on public.goal_movements (deleted_by);
create index if not exists goal_movements_goal_id_context_id_fk_idx on public.goal_movements (goal_id, context_id);
create index if not exists goals_created_by_fk_idx on public.goals (created_by);
create index if not exists goals_deleted_by_fk_idx on public.goals (deleted_by);
create index if not exists income_references_created_by_fk_idx on public.income_references (created_by);
create index if not exists income_references_deleted_by_fk_idx on public.income_references (deleted_by);
create index if not exists month_checks_updated_by_fk_idx on public.month_checks (updated_by);
create index if not exists organization_admins_person_id_fk_idx on public.organization_admins (person_id);
create index if not exists plan_entitlements_person_id_fk_idx on public.plan_entitlements (person_id);
create index if not exists series_terms_created_by_fk_idx on public.series_terms (created_by);
create index if not exists series_terms_series_id_context_id_fk_idx on public.series_terms (series_id, context_id);
create index if not exists series_terms_superseded_by_fk_idx on public.series_terms (superseded_by);
