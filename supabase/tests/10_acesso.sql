-- Isolamento entre pessoas, famílias e empresas (CL C006). Pessoas FICTÍCIAS:
-- Ana (titular), Bruno (familiar), Carla (RH da empresa), Davi (externo), Eva (e-mail não confirmado).
\set ON_ERROR_STOP 1
\set ana   '''00000000-0000-0000-0000-00000000000a'''
\set bruno '''00000000-0000-0000-0000-00000000000b'''
\set carla '''00000000-0000-0000-0000-00000000000c'''
\set davi  '''00000000-0000-0000-0000-00000000000d'''
\set eva   '''00000000-0000-0000-0000-00000000000e'''

begin;
set local clarevo.today = '2026-10-07';

-- Executa um comando e exige um erro cuja mensagem combine com o padrão (LIKE).
create function pg_temp.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_pattern then return; end if;
    raise exception 'esperado "%", veio "%" (%) em: %', p_pattern, sqlerrm, sqlstate, p_sql;
  end;
  raise exception 'esperado erro "%", mas passou: %', p_pattern, p_sql;
end $$;

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:ana,   'ana@exemplo.test',   now(), '{"display_name":"Ana"}'),
  (:bruno, 'bruno@exemplo.test', now(), '{"display_name":"Bruno"}'),
  (:carla, 'carla@empresa.test', now(), '{"display_name":"Carla"}'),
  (:davi,  'davi@exemplo.test',  now(), '{}'),
  (:eva,   'eva@exemplo.test',   null,  '{"display_name":"Eva"}');

set role authenticated;

-- 1. E-mail não confirmado não libera nada.
select set_config('request.jwt.claim.sub', :eva, true);
select pg_temp.expect_error($$select public.ensure_personal_space('Conta principal')$$, 'email_nao_confirmado');
do $$ begin assert (select count(*) from public.persons) = 0, 'Eva não deveria ver pessoas'; end $$;

-- 2. Espaço pessoal criado uma única vez.
select set_config('request.jwt.claim.sub', :ana, true);
do $$
declare a jsonb; b jsonb;
begin
  a := public.ensure_personal_space('Conta principal');
  b := public.ensure_personal_space('Outro nome');
  assert a = b, 'chamar duas vezes deve devolver o mesmo espaço';
  assert a #>> '{account,name}' = 'Conta principal', 'primeira conta deve se chamar Conta principal';
  assert a ->> 'display_name' = 'Ana', 'nome de apresentação vem do cadastro';
  assert (select count(*) from public.persons) = 1, 'uma pessoa';
  assert (select count(*) from public.financial_contexts) = 1, 'um contexto pessoal';
  assert (select count(*) from public.context_memberships) = 1, 'um vínculo de titular';
  assert (select count(*) from public.financial_accounts) = 1, 'uma conta';
  assert (select initial_balance_cents from public.financial_accounts) is null, 'saldo inicial desconhecido não é zero';
  assert (select count(*) from public.financial_records) = 0, 'conta nova sem registros';
  insert into ids values ('ana_ctx', (a ->> 'context_id')::uuid), ('ana_conta', (a #>> '{account,id}')::uuid);
end $$;

select set_config('request.jwt.claim.sub', :davi, true);
select pg_temp.expect_error($$select public.ensure_personal_space('   ')$$, 'nome_da_conta_invalido');
select public.ensure_personal_space('Conta principal', 'America/Rio_Branco');
do $$ begin
  assert (select display_name from public.persons where id = auth.uid()) = 'davi', 'sem nome, usa o início do e-mail';
  assert (select time_zone from public.persons where id = auth.uid()) = 'America/Rio_Branco', 'fuso do aparelho é guardado';
end $$;
select pg_temp.expect_error($$update public.persons set time_zone = 'Marte/Olimpo' where id = auth.uid()$$, 'permission denied%');
select set_config('request.jwt.claim.sub', :bruno, true);
insert into ids select 'bruno_ctx', (public.ensure_personal_space('Conta do Bruno') ->> 'context_id')::uuid;
select set_config('request.jwt.claim.sub', :carla, true);
select public.ensure_personal_space('Conta principal', 'Marte/Olimpo');
do $$ begin assert (select time_zone from public.persons where id = auth.uid()) = 'America/Sao_Paulo', 'fuso inválido vira São Paulo'; end $$;

-- Preparação feita pelo backend (convites e benefício ficam para ciclos seguintes).
reset role;
with f as (
  insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Família da Ana', :ana) returning id
) insert into ids select 'familia', id from f;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  select id, :ana::uuid, 'titular'::public.membership_role, true, true, true from ids where name = 'familia'
  union all
  select id, :bruno::uuid, 'membro'::public.membership_role, true, true, false from ids where name = 'familia';
with c as (
  insert into public.financial_accounts (context_id, name, created_by) select id, 'Conta da casa', :ana from ids where name = 'familia' returning id
) insert into ids select 'familia_conta', id from c;
with c as (
  insert into public.commitments (context_id, description, amount_cents, due_on, created_by)
    select id, 'Internet', 15000, '2026-10-15', :ana from ids where name = 'ana_ctx' returning id
) insert into ids select 'ana_internet', id from c;
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-000000000001', 'Empresa Fictícia');
insert into public.organization_admins values ('10000000-0000-0000-0000-000000000001', :carla);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 10, 'familiar', '2026-10-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'ana@exemplo.test', :ana, 'ativa', now());
insert into public.plan_entitlements (person_id, source, license_id, plan)
  values (:ana, 'beneficio', '30000000-0000-0000-0000-000000000001', 'familiar');
set role authenticated;

-- Ana registra no pessoal e na família.
select set_config('request.jwt.claim.sub', :ana, true);
select public.create_record('chave-ana-0001', (select id from ids where name = 'ana_ctx'), (select id from ids where name = 'ana_conta'),
  'despesa', 140000, '2026-10-05', 'Mercado');
select public.create_record('chave-ana-0002', (select id from ids where name = 'familia'), (select id from ids where name = 'familia_conta'),
  'despesa', 70000, '2026-10-05', 'Mercado da família');
insert into ids select 'ana_mercado', id from public.financial_records where description = 'Mercado';
insert into ids select 'familia_mercado', id from public.financial_records where description = 'Mercado da família';

-- 3. Bruno: vê a família, não vê o pessoal da Ana; não altera por ID nem grava fora do permitido.
select set_config('request.jwt.claim.sub', :bruno, true);
do $$ begin
  assert (select count(*) from public.financial_records where description = 'Mercado da família') = 1, 'Bruno vê a família';
  assert (select count(*) from public.financial_records where description = 'Mercado') = 0, 'Bruno NÃO vê o pessoal da Ana';
  assert (select count(*) from public.financial_contexts where id = (select id from ids where name = 'ana_ctx')) = 0, 'contexto pessoal da Ana oculto';
  assert (select count(*) from public.financial_accounts where id = (select id from ids where name = 'ana_conta')) = 0, 'conta pessoal da Ana oculta';
  assert (select count(*) from public.commitments) = 0, 'compromissos pessoais da Ana ocultos';
  assert (select count(*) from public.persons) = 2, 'Bruno vê a si e a Ana (mesma família)';
end $$;
select pg_temp.expect_error(format($$select public.create_record('chave-bru-0001', %L, %L, 'despesa', 100, '2026-10-05', 'Intruso')$$,
  (select id from ids where name = 'ana_ctx'), (select id from ids where name = 'ana_conta')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.update_record('chave-bru-0002', %L, 1, %L, 1, '2026-10-05', 'x')$$,
  (select id from ids where name = 'ana_mercado'), (select id from ids where name = 'ana_conta')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.delete_record('chave-bru-0003', %L, 1)$$,
  (select id from ids where name = 'ana_mercado')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.update_record('chave-bru-0004', %L, 1, %L, 1, '2026-10-05', 'x')$$,
  (select id from ids where name = 'familia_mercado'), (select id from ids where name = 'familia_conta')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.create_record('chave-bru-0005', %L, %L, 'despesa', 100, '2026-10-05', 'Conta errada')$$,
  (select id from ids where name = 'familia'), (select id from ids where name = 'ana_conta')), 'conta_invalida');
select public.create_record('chave-bru-0006', (select id from ids where name = 'familia'), (select id from ids where name = 'familia_conta'),
  'despesa', 20000, '2026-10-06', 'Transporte');
do $$ begin
  assert (select created_by from public.financial_records where description = 'Transporte') = auth.uid(), 'autoria vem da sessão';
end $$;

-- Escrita direta nas tabelas é recusada (só pelas funções).
select pg_temp.expect_error(format($$insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, created_by)
  values (%L, %L, 'despesa', 1, 'BRL', '2026-10-05', 'Direto', %L)$$,
  (select id from ids where name = 'familia'), (select id from ids where name = 'familia_conta'), :bruno), 'permission denied%');
select pg_temp.expect_error($$update public.financial_records set amount_cents = 1$$, 'permission denied%');
select pg_temp.expect_error($$delete from public.financial_records$$, 'permission denied%');
select pg_temp.expect_error($$insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id)
  values (auth.uid(), 'chave-falsa-01', 'criar', gen_random_uuid(), 'x', gen_random_uuid())$$, 'permission denied%');
select pg_temp.expect_error($$insert into public.commitments (context_id, description, amount_cents, due_on, created_by)
  values (gen_random_uuid(), 'x', 1, '2026-10-10', auth.uid())$$, 'permission denied%');
select pg_temp.expect_error($$insert into public.financial_contexts (kind, name, owner_person_id) values ('familia', 'Outra', auth.uid())$$, 'permission denied%');

-- Bruno não muda as próprias permissões.
update public.context_memberships set can_edit_others = true where person_id = auth.uid();
reset role;
do $$ begin
  assert (select can_edit_others from public.context_memberships m join ids on ids.id = m.context_id and ids.name = 'familia'
          where person_id = '00000000-0000-0000-0000-00000000000b') = false, 'Bruno NÃO altera as próprias permissões';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', :bruno, true);
do $$ begin
  assert (select count(*) from public.record_operations where actor_id <> auth.uid()) = 0, 'operações de outras pessoas ocultas';
end $$;

-- 3b. Contas a pagar seguem as permissões de registro: quem tem escrita anota; altera, paga e desfaz só o que criou,
-- salvo "editar de outras pessoas". A família ainda não tem tela, mas as regras já valem no banco.
select set_config('request.jwt.claim.sub', :ana, true);
with c as (
  select public.create_commitment('chave-ana-c001', (select id from ids where name = 'familia'), 9000, '2026-10-12', 'Gás') as res
) insert into ids select 'familia_gas', (res #>> '{commitment,id}')::uuid from c;
-- Gastos fixos (D-024) seguem as mesmas permissões: Ana cadastra um na família (desde novembro) e um no pessoal.
with s as (
  select public.create_series('chave-ana-s001', (select id from ids where name = 'familia'), 'mensal', 'conta', 'Condomínio', 'Moradia',
    50000, 'fixo', 20, '2026-11-01', 1, null, null) as res
) insert into ids select 'familia_condominio', (res #>> '{series,id}')::uuid from s;
with s as (
  select public.create_series('chave-ana-s002', (select id from ids where name = 'ana_ctx'), 'mensal', 'conta', 'Aluguel', 'Moradia',
    250000, 'fixo', 5, '2026-10-01', 1, null, null) as res
) insert into ids select 'ana_aluguel', (res #>> '{series,id}')::uuid from s;
select set_config('request.jwt.claim.sub', :bruno, true);
do $$ begin
  assert (select count(*) from public.commitments where description = 'Gás') = 1, 'Bruno vê o Gás da família';
  assert (select count(*) from public.commitment_items where description = 'Gás') = 1, 'Bruno vê o Gás na visão';
  assert (select count(*) from public.commitments where description = 'Internet') = 0, 'Bruno NÃO vê a Internet pessoal da Ana';
  assert (select count(*) from public.commitment_items where description = 'Internet') = 0, 'Bruno NÃO vê a Internet na visão';
  assert (select count(*) from public.series_items) = 1 and (select count(*) from public.commitment_series) = 1
     and (select count(*) from public.series_terms) = 1, 'Bruno vê só o gasto fixo da família';
  assert (select count(*) from public.series_items where id = (select id from ids where name = 'ana_aluguel')) = 0,
    'Bruno NÃO vê o gasto fixo pessoal da Ana';
  assert (select count(*) from public.commitment_items where description = 'Aluguel') = 0, 'Bruno NÃO vê as contas do Aluguel da Ana';
end $$;
select pg_temp.expect_error(format($$select public.create_series('chave-bru-s001', %L, 'mensal', 'conta', 'Intruso', null, 100, 'fixo', 10,
  '2026-10-01', 1, null, null)$$, (select id from ids where name = 'ana_ctx')), 'sem_permissao');
-- Gasto fixo pessoal da Ana: não revela que existe.
select pg_temp.expect_error(format($$select public.update_series_from('chave-bru-s002', %L, 1, 1, '[]', 'conta', 'Aluguel', null, 100, 'fixo', 5)$$,
  (select id from ids where name = 'ana_aluguel')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.end_series('chave-bru-s003', %L, 1, 1, '[]')$$,
  (select id from ids where name = 'ana_aluguel')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.delete_series('chave-bru-s004', %L, 1, '[]')$$,
  (select id from ids where name = 'ana_aluguel')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.sync_series_occurrences(%L)$$, (select id from ids where name = 'ana_ctx')), 'sem_permissao');
-- Gasto fixo da Ana na família: Bruno lê e dispara a geração, mas não altera sem "editar de outras pessoas".
select pg_temp.expect_error(format($$select public.end_series('chave-bru-s005', %L, 1, 0, '[]')$$,
  (select id from ids where name = 'familia_condominio')), 'sem_permissao');
do $$ begin
  assert public.sync_series_occurrences((select id from ids where name = 'familia')) = '{"created": 0, "created_overdue": 0}'::jsonb,
    'Bruno sincroniza a família (nada novo)';
end $$;
select pg_temp.expect_error(format($$select public.create_commitment('chave-bru-c000', %L, 100, '2026-10-12', 'Intruso')$$,
  (select id from ids where name = 'ana_ctx')), 'sem_permissao');
-- Conta a pagar pessoal da Ana: não revela que existe.
select pg_temp.expect_error(format($$select public.update_commitment('chave-bru-c010', %L, 1, 100, '2026-10-15', 'Internet')$$,
  (select id from ids where name = 'ana_internet')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.delete_commitment('chave-bru-c011', %L, 1)$$,
  (select id from ids where name = 'ana_internet')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.pay_commitment('chave-bru-c012', %L, 1, %L, 15000, '2026-10-07')$$,
  (select id from ids where name = 'ana_internet'), (select id from ids where name = 'familia_conta')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.undo_commitment_payment('chave-bru-c013', %L, 1)$$,
  (select id from ids where name = 'ana_internet')), 'nao_encontrado');
-- Gás criado pela Ana na família: Bruno lê, mas não tem "editar de outras pessoas".
select pg_temp.expect_error(format($$select public.update_commitment('chave-bru-c020', %L, 1, 100, '2026-10-12', 'Gás')$$,
  (select id from ids where name = 'familia_gas')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.delete_commitment('chave-bru-c021', %L, 1)$$,
  (select id from ids where name = 'familia_gas')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.pay_commitment('chave-bru-c022', %L, 1, %L, 9000, '2026-10-07')$$,
  (select id from ids where name = 'familia_gas'), (select id from ids where name = 'familia_conta')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.undo_commitment_payment('chave-bru-c023', %L, 1)$$,
  (select id from ids where name = 'familia_gas')), 'sem_permissao');
-- Bruno anota e paga a própria conta a pagar na família, só com conta da família.
with c as (
  select public.create_commitment('chave-bru-c001', (select id from ids where name = 'familia'), 4000, '2026-10-12', 'Feira') as res
) insert into ids select 'familia_feira', (res #>> '{commitment,id}')::uuid from c;
select pg_temp.expect_error(format($$select public.pay_commitment('chave-bru-c003', %L, 1, %L, 4000, '2026-10-07')$$,
  (select id from ids where name = 'familia_feira'), (select id from ids where name = 'ana_conta')), 'conta_invalida');
select public.pay_commitment('chave-bru-c002', (select id from ids where name = 'familia_feira'), 1,
  (select id from ids where name = 'familia_conta'), 4000, '2026-10-07');
do $$ begin
  assert (select (status, version, paid_amount_cents) from public.commitment_items where id = (select id from ids where name = 'familia_feira'))
    = ('quitado'::public.commitment_status, 2, 4000::bigint), 'Bruno pagou a Feira';
  assert (select to_pay_cents from public.month_to_pay((select id from ids where name = 'familia'), '2026-10-01')) = 9000,
    'família: só o Gás a pagar (Feira paga)';
end $$;
select pg_temp.expect_error(format($$select * from public.month_to_pay(%L, '2026-10-01')$$, (select id from ids where name = 'ana_ctx')), 'sem_permissao');
select pg_temp.expect_error($$update public.commitments set amount_cents = 1$$, 'permission denied%');
select pg_temp.expect_error($$delete from public.commitments$$, 'permission denied%');
-- Ana (titular, com "editar de outras pessoas") desfaz o pagamento feito pelo Bruno.
select set_config('request.jwt.claim.sub', :ana, true);
select public.undo_commitment_payment('chave-ana-c002', (select id from ids where name = 'familia_feira'), 2);
do $$ begin
  assert (select (status, version, paid_record_id is null) from public.commitment_items where id = (select id from ids where name = 'familia_feira'))
    = ('aberto'::public.commitment_status, 3, true), 'Ana desfez o pagamento do Bruno';
end $$;

-- 4. Carla (RH): vê a licença, não vê finanças nem família.
select set_config('request.jwt.claim.sub', :carla, true);
do $$ begin
  assert (select count(*) from public.licenses) = 1, 'Carla vê a licença da empresa';
  assert (select count(*) from public.financial_records) = 0, 'Carla NÃO vê registros';
  assert (select count(*) from public.financial_contexts) = 1, 'Carla só vê o próprio contexto';
  assert (select count(*) from public.financial_accounts) = 1, 'Carla só vê a própria conta';
  assert (select count(*) from public.context_memberships where person_id <> auth.uid()) = 0, 'Carla NÃO vê composição familiar';
  assert (select count(*) from public.plan_entitlements) = 0, 'Carla NÃO vê direitos ao plano de outras pessoas';
  assert (select count(*) from public.commitments) = 0, 'Carla NÃO vê compromissos';
  assert (select count(*) from public.commitment_items) = 0, 'Carla NÃO vê contas a pagar';
  assert (select count(*) from public.commitment_series) = 0, 'Carla NÃO vê gastos fixos';
  assert (select count(*) from public.series_terms) = 0, 'Carla NÃO vê os valores dos gastos fixos';
  assert (select count(*) from public.series_items) = 0, 'Carla NÃO vê gastos fixos na visão';
end $$;
select pg_temp.expect_error(format($$select public.create_commitment('chave-car-c001', %L, 100, '2026-10-12', 'Intruso')$$,
  (select id from ids where name = 'ana_ctx')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.create_series('chave-car-s001', %L, 'mensal', 'conta', 'Intruso', null, 100, 'fixo', 10,
  '2026-10-01', 1, null, null)$$, (select id from ids where name = 'ana_ctx')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.delete_series('chave-car-s002', %L, 1, '[]')$$,
  (select id from ids where name = 'ana_aluguel')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.sync_series_occurrences(%L)$$, (select id from ids where name = 'familia')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.pay_commitment('chave-car-c002', %L, 1, %L, 15000, '2026-10-07')$$,
  (select id from ids where name = 'ana_internet'), (select id from ids where name = 'ana_conta')), 'nao_encontrado');
select pg_temp.expect_error(format($$select * from public.month_totals(%L, '2026-10-01')$$, (select id from ids where name = 'ana_ctx')), 'sem_permissao');
-- Empresa convida por e-mail, mas não escolhe beneficiário nem ativa a licença.
select pg_temp.expect_error($$insert into public.licenses (contract_id, invited_email, person_id)
  values ('20000000-0000-0000-0000-000000000001', 'davi@exemplo.test', '00000000-0000-0000-0000-00000000000d')$$, 'permission denied%');
insert into public.licenses (contract_id, invited_email) values ('20000000-0000-0000-0000-000000000001', 'novo@exemplo.test');
do $$ begin assert (select status from public.licenses where invited_email = 'novo@exemplo.test') = 'convidada', 'convite nasce como convidada'; end $$;
select pg_temp.expect_error($$update public.licenses set status = 'ativa' where invited_email = 'novo@exemplo.test'$$, '%licenses_check%');
select pg_temp.expect_error($$update public.licenses set person_id = '00000000-0000-0000-0000-00000000000d'$$, 'permission denied%');

-- 5. Davi (externo) e sem sessão: nada de ninguém.
select set_config('request.jwt.claim.sub', :davi, true);
do $$ begin
  assert (select count(*) from public.financial_records) = 0, 'Davi não vê registros';
  assert (select count(*) from public.licenses) = 0, 'Davi não vê licenças';
  assert (select count(*) from public.organizations) = 0, 'Davi não vê organizações';
  assert (select count(*) from public.persons) = 1, 'Davi só vê a si';
  assert (select count(*) from public.series_items) = 0 and (select count(*) from public.series_terms) = 0, 'Davi não vê gastos fixos';
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin assert (select count(*) from public.financial_records) = 0, 'sem sessão não vê registros'; end $$;
select pg_temp.expect_error($$select public.ensure_personal_space('Conta principal')$$, 'nao_autenticado');

-- Papel anônimo: sem acesso a tabelas nem funções.
reset role;
set role anon;
select pg_temp.expect_error($$select count(*) from public.financial_records$$, 'permission denied%');
select pg_temp.expect_error($$select public.ensure_personal_space('Conta principal')$$, 'permission denied%');
select pg_temp.expect_error($$select public.create_commitment('chave-anon-c01', gen_random_uuid(), 100, '2026-10-12', 'x')$$, 'permission denied%');
select pg_temp.expect_error($$select count(*) from public.commitment_items$$, 'permission denied%');
select pg_temp.expect_error($$select count(*) from public.commitment_series$$, 'permission denied%');
select pg_temp.expect_error($$select count(*) from public.series_terms$$, 'permission denied%');
select pg_temp.expect_error($$select count(*) from public.series_items$$, 'permission denied%');
select pg_temp.expect_error($$select public.sync_series_occurrences(gen_random_uuid())$$, 'permission denied%');
select pg_temp.expect_error($$select public.create_series('chave-anon-s01', gen_random_uuid(), 'mensal', 'conta', 'x', null, 100, 'fixo', 10,
  '2026-10-01', 1, null, null)$$, 'permission denied%');
reset role;
set role authenticated;

-- 6. Ana revoga Bruno: bloqueio imediato de leitura e escrita.
select set_config('request.jwt.claim.sub', :ana, true);
update public.context_memberships set revoked_at = now() where person_id = auth.uid();
do $$ begin
  assert (select count(*) from public.context_memberships where person_id = auth.uid() and revoked_at is not null) = 0, 'titular NÃO revoga o próprio vínculo';
  assert (select count(*) from public.financial_contexts) = 2, 'Ana continua vendo pessoal e família';
end $$;
update public.context_memberships set revoked_at = now() where person_id = '00000000-0000-0000-0000-00000000000b';
select set_config('request.jwt.claim.sub', :bruno, true);
do $$ begin assert (select count(*) from public.financial_records) = 0, 'Bruno revogado não vê a família'; end $$;
select pg_temp.expect_error(format($$select public.create_record('chave-bru-0007', %L, %L, 'despesa', 100, '2026-10-05', 'Depois da revogação')$$,
  (select id from ids where name = 'familia'), (select id from ids where name = 'familia_conta')), 'sem_permissao');
-- Repetir uma operação antiga (mesma chave e conteúdo) não devolve o registro depois da revogação.
select pg_temp.expect_error(format($$select public.create_record('chave-bru-0006', %L, %L, 'despesa', 20000, '2026-10-06', 'Transporte')$$,
  (select id from ids where name = 'familia'), (select id from ids where name = 'familia_conta')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.pay_commitment('chave-bru-c002', %L, 1, %L, 4000, '2026-10-07')$$,
  (select id from ids where name = 'familia_feira'), (select id from ids where name = 'familia_conta')), 'nao_encontrado');
select pg_temp.expect_error(format($$select public.create_commitment('chave-bru-c004', %L, 100, '2026-10-12', 'Depois da revogação')$$,
  (select id from ids where name = 'familia')), 'sem_permissao');
do $$ begin assert (select count(*) from public.commitments) = 0, 'Bruno revogado não vê contas a pagar da família'; end $$;
do $$ begin
  assert (select count(*) from public.series_items) = 0 and (select count(*) from public.commitment_series) = 0
     and (select count(*) from public.series_terms) = 0, 'Bruno revogado não vê gastos fixos da família';
end $$;
select pg_temp.expect_error(format($$select public.sync_series_occurrences(%L)$$, (select id from ids where name = 'familia')), 'sem_permissao');
select pg_temp.expect_error(format($$select public.create_series('chave-bru-s006', %L, 'mensal', 'conta', 'Depois da revogação', null, 100,
  'fixo', 10, '2026-10-01', 1, null, null)$$, (select id from ids where name = 'familia')), 'sem_permissao');

-- 7. Fim do benefício não apaga conta, histórico ou família.
reset role;
update public.licenses set status = 'encerrada', ended_at = now();
update public.plan_entitlements set valid_until = now();
set role authenticated;
select set_config('request.jwt.claim.sub', :ana, true);
do $$ begin
  assert (select count(*) from public.financial_records) = 3, 'Ana mantém o histórico (pessoal e família)';
  assert (select count(*) from public.financial_contexts) = 2, 'Ana mantém pessoal e família';
end $$;

-- 8. Autoria, contexto e tipo são imutáveis (defesa adicional, mesmo para o backend).
reset role;
select pg_temp.expect_error($$update public.financial_records set created_by = '00000000-0000-0000-0000-00000000000d' where description = 'Mercado'$$, 'campo_imutavel');
select pg_temp.expect_error($$update public.financial_records set kind = 'receita' where description = 'Mercado'$$, 'campo_imutavel');
-- Vínculo entre contas a pagar e gastos coerente no fim de tudo (invariante adiada conferida agora).
set constraints all immediate;

rollback;
