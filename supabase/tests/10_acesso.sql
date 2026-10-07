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
insert into public.commitments (context_id, description, amount_cents, due_on, created_by)
  select id, 'Internet', 15000, '2026-10-15', :ana from ids where name = 'ana_ctx';
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
end $$;
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
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin assert (select count(*) from public.financial_records) = 0, 'sem sessão não vê registros'; end $$;
select pg_temp.expect_error($$select public.ensure_personal_space('Conta principal')$$, 'nao_autenticado');

-- Papel anônimo: sem acesso a tabelas nem funções.
reset role;
set role anon;
select pg_temp.expect_error($$select count(*) from public.financial_records$$, 'permission denied%');
select pg_temp.expect_error($$select public.ensure_personal_space('Conta principal')$$, 'permission denied%');
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

rollback;
