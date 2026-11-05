-- Clarevo · migração 0024 · Aceite dos termos de uso e da política de privacidade (A1, aprovada em 04/11/2026). Depois de
-- 20261104000001_assinatura.sql.
-- O cadastro continua sem caixa de seleção: a frase acima de "Criar conta" diz que, ao criar a conta, a pessoa concorda com os termos e
-- a política. Agora o banco guarda qual versão dos textos ela aceitou e quando, no cadastro e a cada versão nova que peça novo aceite.
--
-- Invariantes:
-- L1. A versão vigente dos textos é clarevo_legal_version() (um número; uma migração nova a troca quando os textos mudarem de um jeito
--     que peça novo aceite, A5). As datas de cada versão ficam na página de versões do site (A16).
-- L2. legal_acceptances: uma linha por pessoa e versão aceita, com a data e a origem ('cadastro' ou 'app'). Sem leitura direta pelo app
--     (RLS sem política); a pessoa lê só o próprio aceite por my_legal_acceptance.
-- L3. Cadastro: o app manda a versão mostrada na tela de cadastro nos metadados (terms_version). Quando a linha de persons nasce (primeira
--     entrada, ensure_personal_space), um gatilho grava esse aceite com a hora do cadastro (auth.users.created_at), origem 'cadastro'.
--     Só vale uma versão de 1 até a vigente; fora disso, nada é gravado (a pessoa aceita no app).
-- L4. accept_legal_terms(p_version, p_key): só a versão vigente, idempotente pela chave (record_operations, ação 'aceitar_termos'), vale
--     mesmo em só leitura (assinatura, D-083) e não conta como anotação na atividade. Exige o Pessoal (sem_permissao), como
--     set_signup_source.
-- L5. Excluir a conta apaga os aceites (clarevo_erase_person).
--
-- Aplicar no SQL Editor depois da 0023 (docs/05, passo 12n). Testes em supabase/tests/99zzz_aceite.sql.

create or replace function public.clarevo_legal_version()
returns integer
language sql
immutable
set search_path = public
as $$
  select 1;
$$;

create table public.legal_acceptances (
  person_id uuid not null references public.persons (id) on delete cascade,
  version integer not null check (version between 1 and 1000),
  accepted_at timestamptz not null default now(),
  origin text not null check (origin in ('cadastro', 'app')),
  primary key (person_id, version)
);
comment on table public.legal_acceptances is
  'Aceite dos termos de uso e da política de privacidade (A1): a versão, a data e a origem (cadastro ou app). Escrita só pelo gatilho '
  'de persons (cadastro) e por accept_legal_terms; leitura da própria pessoa só por my_legal_acceptance.';

-- ---------------------------------------------------------------------------
-- Cadastro (L3)
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_legal_from_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta text;
  v_created timestamptz;
begin
  select u.raw_user_meta_data ->> 'terms_version', u.created_at into v_meta, v_created from auth.users u where u.id = new.id;
  if v_meta ~ '^[0-9]{1,4}$' and v_meta::integer between 1 and public.clarevo_legal_version() then
    insert into public.legal_acceptances (person_id, version, accepted_at, origin)
    values (new.id, v_meta::integer, coalesce(v_created, now()), 'cadastro')
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger persons_legal_from_signup after insert on public.persons
  for each row execute function public.clarevo_legal_from_signup();

-- ---------------------------------------------------------------------------
-- Operações (L4): a lista vigente (a da 0022) mais 'aceitar_termos', sem alvo.
-- ---------------------------------------------------------------------------
alter table public.record_operations drop constraint record_operations_action_check;
alter table public.record_operations add constraint record_operations_action_check check (action in (
  'criar', 'editar', 'excluir',
  'criar_compromisso', 'editar_compromisso', 'excluir_compromisso', 'pagar_compromisso', 'desfazer_pagamento',
  'criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano',
  'criar_ocorrencia', 'decidir_revisao',
  'definir_renda_referencia', 'excluir_renda_referencia',
  'criar_meta', 'alterar_meta', 'situacao_meta', 'excluir_meta',
  'registrar_movimento_meta', 'alterar_movimento_meta', 'excluir_movimento_meta',
  'responder_guardar',
  'criar_cartao', 'alterar_cartao', 'situacao_cartao', 'excluir_cartao',
  'criar_compra_cartao', 'alterar_lancamento_cartao', 'excluir_lancamento_cartao',
  'criar_encargo_cartao', 'criar_estorno_cartao',
  'pagar_fatura', 'desfazer_pagamento_fatura',
  'definir_orcamento_categoria', 'excluir_orcamento_categoria',
  'definir_limite_comprometimento', 'excluir_limite_comprometimento',
  'criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta',
  'marcar_assinatura', 'revisar_assinaturas',
  'importar_extrato',
  'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
  'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
  'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca',
  'marcar_mes_conferido', 'desmarcar_mes_conferido',
  'responder_origem_cadastro',
  'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
  'imagem_meta',
  'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram',
  'aceitar_termos'));
alter table public.record_operations drop constraint record_operations_target_check;
alter table public.record_operations add constraint record_operations_target_check check (
  (action in ('criar', 'editar', 'excluir') and record_id is not null and target_id is null)
  or (action in ('criar_compromisso', 'editar_compromisso', 'excluir_compromisso')
      and commitment_id is not null and record_id is null and target_id is null)
  or (action in ('pagar_compromisso', 'desfazer_pagamento')
      and commitment_id is not null and record_id is not null and target_id is null)
  or (action in ('criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano',
                 'definir_renda_referencia', 'excluir_renda_referencia',
                 'criar_meta', 'alterar_meta', 'situacao_meta', 'excluir_meta',
                 'registrar_movimento_meta', 'alterar_movimento_meta', 'excluir_movimento_meta',
                 'criar_cartao', 'alterar_cartao', 'situacao_cartao', 'excluir_cartao',
                 'criar_compra_cartao', 'alterar_lancamento_cartao', 'excluir_lancamento_cartao',
                 'criar_encargo_cartao', 'criar_estorno_cartao',
                 'definir_orcamento_categoria', 'excluir_orcamento_categoria',
                 'definir_limite_comprometimento', 'excluir_limite_comprometimento',
                 'criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta',
                 'marcar_assinatura', 'importar_extrato',
                 'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                 'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
                 'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca',
                 'imagem_meta')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido',
                 'responder_origem_cadastro', 'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
                 'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos')
      and record_id is null and commitment_id is null and target_id is null));


-- Atividade (L4): a função da 0022, sem contar também 'aceitar_termos'.
create or replace function public.clarevo_track_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
begin
  if new.action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas',
                    'marcar_mes_conferido', 'desmarcar_mes_conferido', 'responder_origem_cadastro',
                    'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp', 'imagem_meta',
                    'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos',
                    'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                    'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
                    'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca') then
    return null;
  end if;
  v_day := public.clarevo_today(new.actor_id);
  insert into public.context_activity as a (person_id, context_id, last_write_on)
  values (new.actor_id, new.context_id, v_day)
  on conflict (person_id, context_id) do update
    set absence_from_on  = case when public.clarevo_long_absence(a.last_write_on, excluded.last_write_on)
                                then a.last_write_on else a.absence_from_on end,
        absence_until_on = case when public.clarevo_long_absence(a.last_write_on, excluded.last_write_on)
                                then excluded.last_write_on else a.absence_until_on end,
        last_write_on    = excluded.last_write_on
    where excluded.last_write_on > a.last_write_on;
  return null;
end;
$$;

-- As ações que valem mesmo em só leitura (0023, A2), mais 'aceitar_termos'.
create or replace function public.clarevo_write_free_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['sair_familia', 'aceitar_convite_familia', 'encerrar_familia', 'remover_membro_familia', 'transferir_titularidade_familia',
               'alterar_papel_familia', 'cancelar_convite_familia', 'aceitar_licenca', 'convidar_licencas', 'renovar_convite_licenca',
               'cancelar_convite_licenca', 'encerrar_licenca', 'ligar_whatsapp', 'desligar_whatsapp', 'ligar_telegram', 'desligar_telegram',
               'responder_origem_cadastro', 'decidir_revisao', 'aceitar_termos']::text[];
$$;

-- ---------------------------------------------------------------------------
-- App (L2, L4)
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_legal_result(p_person uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'current', public.clarevo_legal_version(),
    'version', (select a.version from public.legal_acceptances a where a.person_id = p_person order by a.version desc limit 1),
    'accepted_at', (select a.accepted_at from public.legal_acceptances a where a.person_id = p_person order by a.version desc limit 1));
$$;

create or replace function public.my_legal_acceptance()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  return public.clarevo_legal_result(auth.uid());
end;
$$;

create or replace function public.accept_legal_terms(p_version integer, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_op public.record_operations%rowtype;
  v_ctx uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('aceitar_termos', p_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));
  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'aceitar_termos' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return public.clarevo_legal_result(v_uid);
  end if;

  select c.id into v_ctx from public.financial_contexts c
    join public.persons p on p.id = c.owner_person_id and p.deleted_at is null
   where c.owner_person_id = v_uid and c.kind = 'pessoal';
  if v_ctx is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_version is distinct from public.clarevo_legal_version() then
    raise exception 'versao_invalida' using errcode = '22023';
  end if;

  insert into public.legal_acceptances (person_id, version, origin) values (v_uid, p_version, 'app') on conflict do nothing;
  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'aceitar_termos', v_ctx, v_hash, null, null, null);
  return public.clarevo_legal_result(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Exclusão (L5): a função da 0022, apagando também os aceites.
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
  -- T7 (0022): a trava das mensagens da pessoa (WhatsApp e Telegram), antes da linha da pessoa; as funções do servidor a tomam depois
  -- da de quem escreve.
  perform pg_advisory_xact_lock(hashtext('chat:p:' || p_person::text));

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
  delete from public.legal_acceptances where person_id = p_person;
  delete from public.chat_links where person_id = p_person;
  delete from public.chat_link_codes where person_id = p_person;
  delete from public.chat_messages where person_id = p_person;

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

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------
alter table public.legal_acceptances enable row level security;
revoke all on public.legal_acceptances from anon, authenticated;
revoke all on function public.clarevo_legal_version() from public, anon, authenticated;
revoke all on function public.clarevo_legal_from_signup() from public, anon, authenticated;
revoke all on function public.clarevo_legal_result(uuid) from public, anon, authenticated;
revoke all on function public.clarevo_write_free_actions() from public, anon, authenticated;
revoke all on function public.clarevo_erase_person(uuid) from public, anon, authenticated;
revoke all on function public.my_legal_acceptance() from public, anon, authenticated;
revoke all on function public.accept_legal_terms(integer, text) from public, anon, authenticated;
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.legal_acceptances from service_role';
    foreach f in array array['clarevo_legal_version()', 'clarevo_legal_from_signup()', 'clarevo_legal_result(uuid)',
                             'clarevo_write_free_actions()', 'clarevo_erase_person(uuid)', 'my_legal_acceptance()',
                             'accept_legal_terms(integer, text)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
  end if;
end $$;
grant execute on function public.my_legal_acceptance() to authenticated;
grant execute on function public.accept_legal_terms(integer, text) to authenticated;
