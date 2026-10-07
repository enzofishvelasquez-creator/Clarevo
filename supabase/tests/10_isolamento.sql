-- Testes de isolamento entre pessoas, famílias e empresas (seção 6 das instruções; CL-V005, CL-V006).
-- Pessoas FICTÍCIAS: Ana (titular), Bruno (familiar), Carla (RH da empresa), Davi (externo).
\set ON_ERROR_STOP 1
\set ana   '''00000000-0000-0000-0000-00000000000a'''
\set bruno '''00000000-0000-0000-0000-00000000000b'''
\set carla '''00000000-0000-0000-0000-00000000000c'''
\set davi  '''00000000-0000-0000-0000-00000000000d'''

-- ---------- Preparação (superusuário, como faria o backend) ----------
insert into auth.users (id, email) values
  (:ana, 'ana@exemplo.test'), (:bruno, 'bruno@exemplo.test'),
  (:carla, 'carla@empresa.test'), (:davi, 'davi@exemplo.test');
insert into public.persons (id, display_name) values
  (:ana, 'Ana'), (:bruno, 'Bruno'), (:carla, 'Carla'), (:davi, 'Davi');

do $$ begin
  assert (select count(*) from public.financial_contexts where kind = 'pessoal') = 4,
    'cada pessoa deve ganhar um contexto pessoal';
end $$;

insert into public.organizations (id, name) values ('10000000-0000-0000-0000-000000000001', 'Empresa Fictícia');
insert into public.organization_admins values ('10000000-0000-0000-0000-000000000001', :carla);
insert into public.benefit_contracts (id, organization_id, seats, plan, starts_on)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 10, 'familiar', '2026-10-01');
insert into public.licenses (id, contract_id, invited_email, person_id, status, activated_at)
  values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'ana@exemplo.test', :ana, 'ativa', now());
insert into public.plan_entitlements (person_id, source, license_id, plan)
  values (:ana, 'beneficio', '30000000-0000-0000-0000-000000000001', 'familiar');

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
insert into ids select 'ana_pessoal', id from public.financial_contexts where owner_person_id = :ana and kind = 'pessoal';
insert into ids select 'bruno_pessoal', id from public.financial_contexts where owner_person_id = :bruno and kind = 'pessoal';

-- ---------- Ana cria a família e registra eventos ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :ana, false);

insert into ids select 'familia', public.create_family_context('Família da Ana');

insert into public.financial_events (context_id, direction, status, amount_cents, description, competence, settled_on, idempotency_key, created_by)
select id, 'saida', 'confirmado', 140000, 'Mercado', '2026-10-01', '2026-10-05', 'idem-ana-0001', :ana from ids where name = 'ana_pessoal';
insert into public.financial_events (context_id, direction, status, amount_cents, description, competence, settled_on, idempotency_key, created_by)
select id, 'saida', 'confirmado', 70000, 'Mercado da família', '2026-10-01', '2026-10-05', 'idem-fam-0001', :ana from ids where name = 'familia';

-- Envio duplicado com a mesma chave é recusado pelo banco.
do $$ begin
  begin
    insert into public.financial_events (context_id, direction, status, amount_cents, description, competence, settled_on, idempotency_key, created_by)
    select id, 'saida', 'confirmado', 140000, 'Mercado', '2026-10-01', '2026-10-05', 'idem-ana-0001', auth.uid() from ids where name = 'ana_pessoal';
    raise exception 'FALHA: duplicidade aceita';
  exception when unique_violation then null;
  end;
end $$;

-- Confirmado sem data de pagamento é recusado.
do $$ begin
  begin
    insert into public.financial_events (context_id, direction, status, amount_cents, description, competence, idempotency_key, created_by)
    select id, 'saida', 'confirmado', 100, 'X', '2026-10-01', 'idem-ana-0002', auth.uid() from ids where name = 'ana_pessoal';
    raise exception 'FALHA: confirmado sem settled_on aceito';
  exception when check_violation then null;
  end;
end $$;

-- ---------- Ana convida Bruno (aceite simulado pelo backend) ----------
reset role;
insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
select id, :bruno, 'membro', true, true, false from ids where name = 'familia';

-- ---------- Bruno: vê a família, não vê o pessoal da Ana ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :bruno, false);
do $$ begin
  assert (select count(*) from public.financial_events where description = 'Mercado da família') = 1, 'Bruno deveria ver o evento da família';
  assert (select count(*) from public.financial_events where description = 'Mercado') = 0, 'Bruno NÃO pode ver o pessoal da Ana';
  assert (select count(*) from public.financial_contexts c join ids on ids.id = c.id and ids.name = 'ana_pessoal') = 0, 'Bruno NÃO pode ver o contexto pessoal da Ana';
end $$;

-- Bruno não registra no pessoal da Ana (acesso direto).
do $$ begin
  begin
    insert into public.financial_events (context_id, direction, status, amount_cents, description, competence, settled_on, idempotency_key, created_by)
    select id, 'saida', 'confirmado', 100, 'Intruso', '2026-10-01', '2026-10-05', 'idem-bru-0001', auth.uid() from ids where name = 'ana_pessoal';
    raise exception 'FALHA: Bruno escreveu no pessoal da Ana';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Bruno não pode se passar pela Ana como autor.
do $$ begin
  begin
    insert into public.financial_events (context_id, direction, status, amount_cents, description, competence, settled_on, idempotency_key, created_by)
    select id, 'saida', 'confirmado', 100, 'Falso autor', '2026-10-01', '2026-10-05', 'idem-bru-0002', '00000000-0000-0000-0000-00000000000a' from ids where name = 'familia';
    raise exception 'FALHA: autoria falsificada';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Bruno registra na família.
insert into public.financial_events (context_id, direction, status, amount_cents, description, competence, settled_on, idempotency_key, created_by)
select id, 'saida', 'confirmado', 20000, 'Transporte', '2026-10-01', '2026-10-06', 'idem-bru-0003', :bruno from ids where name = 'familia';

-- Bruno não edita o evento da Ana (sem can_edit_others): a atualização não alcança a linha.
update public.financial_events set amount_cents = 1 where description = 'Mercado da família';
do $$ begin
  assert (select count(*) from public.financial_events where description = 'Mercado da família' and amount_cents = 1) = 0,
    'Bruno NÃO pode editar evento de outra pessoa';
end $$;

-- Bruno não pode apagar fisicamente nenhum evento.
do $$ begin
  begin
    delete from public.financial_events;
    raise exception 'FALHA: delete permitido';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Bruno não pode se promover nem mudar permissões.
update public.context_memberships set can_edit_others = true, role = 'titular' where person_id = auth.uid();
do $$ begin
  assert (select can_edit_others from public.context_memberships m join ids on ids.id = m.context_id and ids.name = 'familia'
          where person_id = auth.uid()) = false, 'Bruno NÃO pode alterar as próprias permissões';
end $$;

-- ---------- Carla (RH): gere licenças, não vê finanças nem família ----------
select set_config('request.jwt.claim.sub', :carla, false);
do $$ begin
  assert (select count(*) from public.licenses) = 1, 'Carla deveria ver a licença da empresa';
  assert (select count(*) from public.financial_events) = 0, 'Carla NÃO pode ver eventos financeiros';
  assert (select count(*) from public.financial_contexts) = 1, 'Carla só vê o próprio contexto pessoal';
  assert (select count(*) from public.context_memberships where person_id <> auth.uid()) = 0, 'Carla NÃO pode ver composição familiar';
  assert (select count(*) from public.plan_entitlements) = 0, 'Carla NÃO vê direitos ao plano de outras pessoas';
end $$;

-- ---------- Davi (externo): não vê nada de ninguém ----------
select set_config('request.jwt.claim.sub', :davi, false);
do $$ begin
  assert (select count(*) from public.financial_events) = 0, 'Davi não deveria ver eventos';
  assert (select count(*) from public.licenses) = 0, 'Davi não deveria ver licenças';
  assert (select count(*) from public.organizations) = 0, 'Davi não deveria ver organizações';
  assert (select count(*) from public.persons) = 1, 'Davi só vê a si mesmo';
end $$;

-- ---------- Sem sessão: nada ----------
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.financial_events) = 0, 'sem sessão não vê eventos';
end $$;

-- ---------- Ana revoga Bruno; Bruno perde acesso imediatamente ----------
select set_config('request.jwt.claim.sub', :ana, false);
update public.context_memberships set revoked_at = now()
  where person_id = '00000000-0000-0000-0000-00000000000b';

select set_config('request.jwt.claim.sub', :bruno, false);
do $$ begin
  assert (select count(*) from public.financial_events) = 0, 'Bruno revogado NÃO pode ver eventos da família';
  begin
    insert into public.financial_events (context_id, direction, status, amount_cents, description, competence, settled_on, idempotency_key, created_by)
    select id, 'saida', 'confirmado', 100, 'Após revogação', '2026-10-01', '2026-10-05', 'idem-bru-0004', auth.uid() from ids where name = 'familia';
    raise exception 'FALHA: revogado registrou';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Fim do benefício não apaga conta, histórico ou família ----------
reset role;
update public.licenses set status = 'encerrada', ended_at = now();
update public.plan_entitlements set valid_until = now();
set role authenticated;
select set_config('request.jwt.claim.sub', :ana, false);
do $$ begin
  assert (select count(*) from public.financial_events) = 3, 'Ana mantém todo o histórico após fim do benefício';
  assert (select count(*) from public.financial_contexts) = 2, 'Ana mantém pessoal e família';
end $$;

-- Autoria é imutável.
do $$ begin
  begin
    update public.financial_events set created_by = '00000000-0000-0000-0000-00000000000d' where description = 'Mercado';
    raise exception 'FALHA: autoria alterada';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
