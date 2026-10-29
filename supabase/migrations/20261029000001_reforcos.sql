-- Migração 0019 (29/10/2026, D-073): três reforços sugeridos pela análise de segurança de 29/10, sem mudar o que o app faz.
--
-- (1) Contas de origem só por funções (CLAUDE.md): sai o update (name) direto em financial_accounts, que só o app publicado antes da
--     0010 usava. O app de hoje renomeia por update_account, com idempotência, versão e operação registrada.
-- (2) A chave de serviço (service_role) perde o execute nas funções internas clarevo_*: nada no app, nos testes ou na equipe as chama
--     com essa chave, e as funções da equipe (clarevo_staff_*) seguem só para quem roda no SQL Editor. No Supabase, os privilégios
--     padrão davam esse execute a cada função nova; o teste 99w_reforcos.sql recusa qualquer clarevo_* executável por service_role.
-- (3) Excluir a conta (D-058): a licença encerrada guarda só o dia (o meio-dia de Brasília daquele dia), não o horário exato, para a
--     empresa não saber a hora em que a pessoa excluiu a conta. Meio-dia, e não meia-noite, para o mesmo dia aparecer no painel e no
--     relatório em qualquer fuso de UTC-12 a UTC+8 (o painel converte para o fuso de quem administra); se a licença foi aceita no
--     mesmo dia depois do meio-dia, vale o horário do aceite, que a empresa já vê, para o fim nunca vir antes do começo. clarevo_erase_person é a mesma da 0018, só com essa linha. O encerramento feito
--     pela própria empresa (end_license) continua com o horário, porque é ela que encerra.
--
-- Aplicar no SQL Editor depois da 0018 (docs/05, passo 12i). Testes em supabase/tests/99w_reforcos.sql.

-- ---------------------------------------------------------------------------
-- (1) Sem renomear conta de origem direto na tabela.
-- ---------------------------------------------------------------------------
revoke update (name) on public.financial_accounts from authenticated;

-- ---------------------------------------------------------------------------
-- (2) service_role sem execute nas funções internas clarevo_*.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    for f in
      select p.oid::regprocedure::text
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'clarevo\_%'
    loop
      execute format('revoke all on function %s from service_role', f);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (3) Excluir a conta: a licença encerrada só com o dia.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_erase_person(p_person uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cand uuid[];
  v_owned uuid[];
  v_member uuid[];
  v_ctx uuid;
begin
  if p_person is null then
    return;
  end if;
  -- 1. Trava por pessoa: a mesma de create_family, accept_family_invite e ensure_personal_space.
  perform pg_advisory_xact_lock(hashtext('familia:p:' || p_person::text));

  -- 2. As Famílias candidatas (dona, titular, membro, leitora ou ex-membro) e a trava de cada uma, em ordem de identificador.
  select coalesce(array_agg(x.id order by x.id), '{}') into v_cand
    from (select c.id from public.financial_contexts c
           where c.kind = 'familia' and c.owner_person_id = p_person
          union
          select m.context_id from public.context_memberships m
            join public.financial_contexts c on c.id = m.context_id and c.kind = 'familia'
           where m.person_id = p_person) x;
  foreach v_ctx in array v_cand loop
    perform pg_advisory_xact_lock(hashtext('familia:c:' || v_ctx::text));
  end loop;

  -- 3. A linha da pessoa. Sem linha viva (nunca criou espaço, já excluída ou anônima), não há o que apagar.
  perform 1 from public.persons p where p.id = p_person and p.deleted_at is null for update;
  if not found then
    return;
  end if;

  -- 4. Agora, com as Famílias travadas: o que é dela (o Pessoal e as Famílias em que é titular, ou dona de Família já encerrada) e o
  -- que é dos outros e ela só frequenta (as Famílias em que é membro, leitora ou ex-membro).
  select coalesce(array_agg(c.id order by c.id), '{}') into v_owned
    from public.financial_contexts c
   where c.owner_person_id = p_person
      or (c.kind = 'familia' and exists (select 1 from public.context_memberships m
                                          where m.context_id = c.id and m.person_id = p_person and m.role = 'titular' and m.revoked_at is null));
  select coalesce(array_agg(m.context_id order by m.context_id), '{}') into v_member
    from public.context_memberships m
    join public.financial_contexts c on c.id = m.context_id and c.kind = 'familia'
   where m.person_id = p_person and not (m.context_id = any (v_owned));
  perform 1 from public.financial_contexts where id = any (v_owned) order by id for update;

  -- Regra 3: titular com outras pessoas ativas passa a titularidade ou remove as pessoas antes. Nada mudou até aqui.
  for v_ctx in select c.id from public.financial_contexts c
                where c.id = any (v_owned) and c.kind = 'familia' and c.ended_at is null loop
    if exists (select 1 from public.context_memberships m
                where m.context_id = v_ctx and m.revoked_at is null and m.person_id <> p_person) then
      raise exception 'transferir_antes' using errcode = 'PT409';
    end if;
  end loop;

  -- Regras 2 e 3: o Pessoal e as Famílias dela (titular sozinha, ou já encerradas) são apagados de verdade.
  foreach v_ctx in array v_owned loop
    perform public.clarevo_erase_context(v_ctx);
  end loop;

  -- Regra 3: nas Famílias dos outros ela sai (o que anotou continua, com a autoria anônima) e os convites dela somem.
  update public.context_memberships set revoked_at = now() where person_id = p_person and revoked_at is null;
  delete from public.family_invites where created_by = p_person;
  update public.family_invites set used_by = null where used_by = p_person;

  -- Regra 5: o que é só dela, em qualquer contexto.
  delete from public.context_activity where person_id = p_person;
  delete from public.return_reviews where person_id = p_person;
  delete from public.savings_checks where person_id = p_person;
  delete from public.signup_sources where person_id = p_person;

  -- Regra 4: a licença ativa termina no ato; os direitos ao plano saem; a empresa fica só com a licença encerrada, sem a pessoa.
  -- Só o dia (o meio-dia de Brasília), não o horário: a empresa vê que a licença terminou, sem saber a hora em que a conta foi excluída.
  update public.licenses
     set status = 'encerrada',
         ended_at = greatest((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '12 hours') at time zone 'America/Sao_Paulo',
                             activated_at)
   where person_id = p_person and status = 'ativa';
  delete from public.plan_entitlements where person_id = p_person;
  update public.licenses set person_id = null where person_id = p_person;
  delete from public.organization_admins where person_id = p_person;

  delete from public.record_operations where actor_id = p_person;

  -- A linha de persons sai; se ainda é autora de algo numa Família que continua, vira a pessoa anônima (X1). Nunca como dona nem
  -- titular: com a Família parada isso já não acontece, e a conferência abaixo é o último fecho (X7), antes de a pessoa virar anônima.
  begin
    delete from public.persons where id = p_person;
  exception when foreign_key_violation then
    if exists (select 1 from public.financial_contexts c where c.owner_person_id = p_person)
       or exists (select 1 from public.context_memberships m where m.person_id = p_person and m.role = 'titular' and m.revoked_at is null) then
      raise exception 'transferir_antes' using errcode = 'PT409';
    end if;
    update public.persons
       set display_name = '', deleted_at = now(), time_zone = 'America/Sao_Paulo', locale = 'pt-BR'
     where id = p_person;
  end;
end;
$$;
