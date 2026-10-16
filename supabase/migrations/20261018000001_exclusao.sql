-- Clarevo · migração 0015 · Excluir a minha conta pelo app (D-058, Ciclo P). Depois de 20261017000001_empresas.sql.
-- As lojas exigem a exclusão de conta dentro do app (D-054, item 7; CL-04 e CL-16). Até aqui a conta não podia ser apagada: o
-- "Delete user" do painel falhava (financial_contexts_owner_person_id_fkey, depois financial_records_context_id_fkey) e não havia
-- roteiro nem teste com todos os módulos. Esta migração dá o caminho completo, pelas regras de D-058 (a confirmar com advogado: os
-- prazos de guarda e os textos finais passam por revisão jurídica):
--   1. quem exclui perde o acesso na hora e não desfaz; o e-mail fica livre para uma conta nova, que começa vazia;
--   2. o Pessoal inteiro é apagado de verdade (não é exclusão lógica): registros, contas a pagar, gastos fixos, contas do ano, metas e
--      movimentos, cartões, lançamentos e faturas, notas, orçamento, limite, renda de referência, contas de origem, assinaturas,
--      importações, operações, atividade, revisão dos últimos meses e resposta do plano de guardar;
--   3. Família: quem é titular com outras pessoas ativas precisa passar a titularidade ou remover as pessoas antes
--      (transferir_antes); titular sozinho encerra a Família e apaga os dados dela como no Pessoal; membro ou leitor sai da Família e o
--      que anotou continua como histórico da casa, com a autoria "Pessoa que saiu" (sem nome e sem e-mail);
--   4. benefício pela empresa: a licença ativa é encerrada no ato (a empresa vê só que terminou) e os direitos ao plano da pessoa são
--      apagados;
--   5. nada é mantido por garantia além do item 3; o rastro técnico (P-010) da pessoa sai junto.
-- Escrita só por delete_my_account(p_confirmation, p_key): security definer, search_path fixo, só authenticated. A confirmação
-- precisa ser exatamente EXCLUIR (confirmacao_invalida). Repetir a chave depois de excluída responde sem erro e sem efeito: as
-- operações da pessoa saem com ela, então não há o que reconhecer além de "a conta já não existe".
--
-- Invariantes:
-- X1. Nenhuma linha de persons depende mais de auth.users por chave estrangeira. A pessoa anônima (deleted_at, sem nome) fica só
--     enquanto ainda é autora de algo numa Família que continua; quem não é autor de nada é apagada. O gatilho
--     clarevo_erase_on_user_delete (antes de apagar a linha de auth.users) aplica as mesmas regras a qualquer exclusão de usuário,
--     inclusive a do painel do Supabase: as regras são as de clarevo_erase_person, e quem é titular com outras pessoas ativas
--     recebe transferir_antes também ali.
-- X2. A pessoa anônima e a que já não existe não conseguem voltar a agir com um token ainda válido: criar contexto e criar vínculo
--     são recusados (sem_permissao), nada do que ela lia aparece e a linha anônima não se renomeia.
-- X3. A autoria nunca é reescrita: created_by e deleted_by continuam apontando para a mesma linha de persons, que fica anônima.
-- X4. Uma Família que acaba (titular sozinho apaga a conta) leva junto as pessoas anônimas que só existiam por causa dela.
-- X5. Nenhuma escrita em andamento deixa rastro: quem exclui trava a linha da pessoa (for update) antes de apagar qualquer coisa, e
--     toda gravação em record_operations (todas as funções de escrita terminam nela) confere a pessoa com for key share: se a
--     exclusão terminou, a pessoa já não existe ou está anônima, e a transação inteira de quem escrevia é desfeita (conta_excluida).
--     A geração das contas de gasto fixo (sync_series_occurrences), a única escrita sem operação, confere a pessoa que criou a série.
-- X6. A pessoa não volta a existir: persons_auth_guard trava a linha de auth.users (for key share) e recusa se ela sumiu, e
--     ensure_personal_space toma a mesma trava por pessoa da exclusão antes de ler auth.users.
-- X7. A Família nunca fica sem titular: o que é da pessoa e o que é dos outros é calculado DEPOIS das travas (passar a titularidade
--     e excluir a conta ao mesmo tempo), e a pessoa só vira anônima se já não é dona nem titular de nada.
-- Ordem de travas (a mesma em todos os caminhos, para duas sessões nunca se esperarem em volta): trava consultiva da pessoa (a mesma
-- de create_family, accept_family_invite e ensure_personal_space) -> trava consultiva de cada Família da pessoa, em ordem de
-- identificador -> linha da pessoa em persons (for update) -> contextos da pessoa (for update).

-- ---------------------------------------------------------------------------
-- Pessoas: sem chave estrangeira para auth.users; a linha anônima mantém só o que a autoria precisa
-- ---------------------------------------------------------------------------
alter table public.persons add column deleted_at timestamptz;
alter table public.persons drop constraint persons_id_fkey;
alter table public.persons drop constraint persons_display_name_check;
alter table public.persons add constraint persons_display_name_check check (
  (deleted_at is null and char_length(btrim(display_name)) between 1 and 80)
  or (deleted_at is not null and display_name = ''));
comment on column public.persons.deleted_at is
  'Quando a pessoa excluiu a conta (delete_my_account). A linha só fica, sem nome, enquanto a pessoa ainda é autora de algo numa Família que continua; some junto com o último vestígio.';

-- A chave estrangeira garantia que toda pessoa tem conta: o gatilho a substitui na criação (a linha anônima nunca é criada, só
-- nasce de uma pessoa que existia). A linha de auth.users é travada (for key share): se alguém a está apagando agora, a criação
-- espera o fim da exclusão e então recusa, em vez de enxergar a linha que ainda não saiu e recriar a pessoa depois que ela se foi.
create or replace function public.persons_auth_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from auth.users u where u.id = new.id for key share;
  if not found then
    raise exception 'pessoa_sem_conta' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger persons_auth_guard
  before insert on public.persons
  for each row execute function public.persons_auth_guard();

-- X2: quem excluiu a conta não cria contexto nem vínculo, mesmo com um token ainda válido.
create or replace function public.financial_contexts_person_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.persons p where p.id = new.owner_person_id and p.deleted_at is not null) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger financial_contexts_person_guard
  before insert on public.financial_contexts
  for each row execute function public.financial_contexts_person_guard();

create or replace function public.context_memberships_person_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.persons p where p.id = new.person_id and p.deleted_at is not null) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger context_memberships_person_guard
  before insert on public.context_memberships
  for each row execute function public.context_memberships_person_guard();

-- X5: toda função de escrita termina gravando a operação em record_operations (idempotência e rastro), e as que mudam dados em nome de
-- alguém o fazem antes ou junto dela, na mesma transação. Este gatilho é o ponto comum: trava a linha da pessoa (for key share, que
-- espera a exclusão em andamento, que a trava com for update) e relê o estado. Se a exclusão terminou, a linha sumiu ou está
-- anônima, e a transação inteira de quem escrevia é desfeita: nenhum registro, operação nem atividade fica para trás. Quem chegou
-- antes da exclusão termina e é apagado por ela (a exclusão espera a linha da pessoa). 42501 como sem_permissao: para o app, um
-- aparelho com a conta já excluída.
create or replace function public.record_operations_actor_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted timestamptz;
begin
  select p.deleted_at into v_deleted from public.persons p where p.id = new.actor_id for key share;
  if not found or v_deleted is not null then
    raise exception 'conta_excluida' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger record_operations_actor_guard
  before insert on public.record_operations
  for each row execute function public.record_operations_actor_guard();

-- ---------------------------------------------------------------------------
-- Funções antigas recriadas com a mesma assinatura (X5 e X6): ensure_personal_space toma a trava por pessoa antes de ler auth.users, e
-- a geração de gastos fixos confere a pessoa que criou a série. O resto de cada função é o da migração anterior, sem mudança.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_personal_space(p_account_name text default 'Conta principal', p_time_zone text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user auth.users%rowtype;
  v_name text;
  v_ctx uuid;
  v_account public.financial_accounts%rowtype;
  v_account_name text := btrim(coalesce(p_account_name, ''));
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  -- X6: a trava por pessoa da exclusão (a mesma de create_family e accept_family_invite) vem ANTES de ler auth.users. Com a exclusão
  -- em andamento, esta chamada espera o fim dela e então não encontra a conta (email_nao_confirmado); sem a trava, ela leria a linha
  -- que ainda não saiu e recriaria a pessoa e o Pessoal depois que a conta se foi.
  perform pg_advisory_xact_lock(hashtext('familia:p:' || v_uid::text));
  select * into v_user from auth.users where id = v_uid;
  if not found or v_user.email_confirmed_at is null then
    raise exception 'email_nao_confirmado' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('space:' || v_uid::text));

  v_name := left(coalesce(nullif(btrim(v_user.raw_user_meta_data ->> 'display_name'), ''), split_part(v_user.email, '@', 1), 'Pessoa'), 80);
  -- Fuso do aparelho no primeiro acesso (validado); sem ele, São Paulo.
  insert into public.persons (id, display_name, time_zone)
  values (v_uid, v_name,
          coalesce((select name from pg_timezone_names where name = p_time_zone limit 1), 'America/Sao_Paulo'))
  on conflict (id) do nothing;

  select id into v_ctx from public.financial_contexts where owner_person_id = v_uid and kind = 'pessoal';
  if v_ctx is null then
    insert into public.financial_contexts (kind, name, owner_person_id) values ('pessoal', 'Pessoal', v_uid) returning id into v_ctx;
    insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
    values (v_ctx, v_uid, 'titular', true, true, true);
  end if;

  -- A conta que volta é a principal (ou, faltando, a ativa mais antiga): nunca uma arquivada nem uma excluída (A2 garante que há uma).
  select * into v_account from public.financial_accounts
   where context_id = v_ctx and deleted_at is null
   order by is_default desc, (status = 'ativa') desc, created_at, id
   limit 1;
  if not found then
    if char_length(v_account_name) not between 1 and 40 then
      raise exception 'nome_da_conta_invalido' using errcode = '22023';
    end if;
    insert into public.financial_accounts (context_id, name, created_by)
    values (v_ctx, v_account_name, v_uid)
    returning * into v_account;
  end if;

  return jsonb_build_object(
    'person_id', v_uid,
    'display_name', (select display_name from public.persons where id = v_uid),
    'context_id', v_ctx,
    'account', jsonb_build_object('id', v_account.id, 'name', v_account.name, 'currency', v_account.currency)
  );
end;
$$;

create or replace function public.clarevo_materialize_series(p_series_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_s public.commitment_series%rowtype;
  v_t public.series_terms%rowtype;
  v_today date;
  v_floor date;
  v_top date;
  v_anchor date;
  v_year_top int;
  v_from int;
  v_to int;
  v_due date;
  v_created int := 0;
  v_overdue int := 0;
begin
  -- X5: a geração não grava operação, então a pessoa que criou a série é conferida aqui, ANTES da trava da série (a ordem da exclusão:
  -- pessoa, depois o que é dela). Com a exclusão dela em andamento, espera o fim e, se a pessoa já não existe ou está anônima, não
  -- gera nada: uma conta de gasto fixo nunca nasce em nome de quem saiu.
  select s.created_by into v_creator from public.commitment_series s where s.id = p_series_id;
  if not found then
    return jsonb_build_object('created', 0, 'created_overdue', 0);
  end if;
  perform 1 from public.persons p where p.id = v_creator and p.deleted_at is null for key share;
  if not found then
    return jsonb_build_object('created', 0, 'created_overdue', 0);
  end if;
  select * into v_s from public.commitment_series where id = p_series_id for update;        -- trava 1: série
  if not found or v_s.deleted_at is not null then
    return jsonb_build_object('created', 0, 'created_overdue', 0);
  end if;
  -- Quem criou a série perdeu a escrita no contexto: nada é gerado em nome dessa pessoa.
  if not exists (select 1 from public.context_memberships m
                  where m.context_id = v_s.context_id and m.person_id = v_s.created_by
                    and m.revoked_at is null and m.can_read and m.can_write) then
    return jsonb_build_object('created', 0, 'created_overdue', 0);
  end if;
  v_today := public.clarevo_today(v_s.created_by);
  v_floor := (date_trunc('month', v_today::timestamp) - interval '1 month')::date;
  if v_s.kind = 'anual' then
    v_top := (date_trunc('month', v_today::timestamp) + interval '2 months')::date;
    v_anchor := public.clarevo_series_month(v_s, 1);
    if v_top < v_anchor then
      return jsonb_build_object('created', 0, 'created_overdue', 0);
    end if;
    v_year_top := public.clarevo_months_between(v_anchor, v_top) / 12;                       -- último ano que já entrou
    v_from := greatest(v_s.first_number, (v_year_top - 1) * v_s.parts_per_year + 1);
    v_to   := (v_year_top + 1) * v_s.parts_per_year;
  else
    v_top  := (date_trunc('month', v_today::timestamp) + interval '1 month')::date;
    v_from := greatest(v_s.first_number, v_s.first_number + public.clarevo_months_between(v_s.first_due_month, v_floor));
    v_to   := v_s.first_number + public.clarevo_months_between(v_s.first_due_month, v_top);
  end if;
  if v_s.last_number is not null then
    v_to := least(v_to, v_s.last_number);
  end if;
  for v_n in v_from .. v_to loop
    -- Parcela de mês antes do piso: fica "sem conta registrada".
    continue when public.clarevo_series_month(v_s, v_n) < v_floor;
    -- Viva, ou excluída só neste mês (ou tirada do ano): não cria. Removida por encerramento: recria (retomar).
    continue when exists (select 1 from public.commitments c
                           where c.series_id = v_s.id and c.occurrence_number = v_n
                             and (c.deleted_at is null or c.series_skipped));
    select * into v_t from public.series_terms
     where series_id = v_s.id and superseded_at is null and from_number <= v_n
     order by from_number desc limit 1;
    v_due := public.clarevo_series_due(v_s, v_n, v_t.due_day);
    insert into public.commitments (context_id, description, amount_cents, currency, due_on, status, category,
                                    created_by, series_id, occurrence_number, amount_is_estimate)
    values (v_s.context_id, v_t.description, v_t.amount_cents, v_s.currency, v_due, 'aberto', v_t.category,
            v_s.created_by, v_s.id, v_n, v_t.amount_mode = 'variavel')
    on conflict (series_id, occurrence_number) where series_id is not null and deleted_at is null do nothing;
    if found then
      v_created := v_created + 1;
      if v_due < v_today then
        v_overdue := v_overdue + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('created', v_created, 'created_overdue', v_overdue);
end;
$$;

-- A pessoa anônima não renomeia a própria linha com um token ainda válido.
drop policy persons_update_self on public.persons;
create policy persons_update_self on public.persons for update to authenticated
  using (id = auth.uid() and deleted_at is null) with check (id = auth.uid() and deleted_at is null);

-- ---------------------------------------------------------------------------
-- Autoria: a pessoa anônima aparece como "Pessoa que saiu" (visão dos membros e rótulo usado pelas respostas das funções)
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_person_label(p_person uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (select 1 from public.persons p where p.id = p_person and p.deleted_at is not null)
              then 'Pessoa que saiu'
              else public.clarevo_first_name((select p.display_name from public.persons p where p.id = p_person),
                                             (select u.email from auth.users u where u.id = p_person)) end;
$$;

-- Mesma visão da 0013 (as mesmas colunas, na mesma ordem); só o primeiro nome muda para a pessoa anônima.
create or replace view public.family_member_items with (security_barrier = true) as
select m.context_id,
       m.person_id,
       case when p.deleted_at is not null then 'Pessoa que saiu'
            when b.t = '' or position('@' in b.t) > 0 or (a.l <> '' and (a.n = a.l or b.t = a.l))
            then 'Pessoa da Família' else left(b.t, 40) end as first_name,
       case when m.role = 'titular' then 'titular' when m.can_write then 'membro' else 'leitor' end as role,
       case when m.revoked_at is null then 'ativo' else 'ex-membro' end as status,
       (m.person_id = auth.uid()) as is_me,
       m.created_at as joined_at,
       m.revoked_at as left_at
  from public.context_memberships m
  join public.financial_contexts c on c.id = m.context_id and c.kind = 'familia'
  join public.persons p on p.id = m.person_id
  left join auth.users u on u.id = m.person_id
  cross join lateral (
    select regexp_replace(coalesce(p.display_name, ''), '^\s+|\s+$', '', 'g') as n,
           left(split_part(coalesce(u.email, ''), '@', 1), 80) as l
  ) a
  cross join lateral (
    select coalesce((regexp_split_to_array(a.n, '\s+'))[1], '') as t
  ) b
 where public.context_permission(m.context_id, 'read');
comment on view public.family_member_items is
  'Membros da Família que quem consulta pode ler: ativos e ex-membros, com o primeiro nome, o papel e a situação. Nunca devolve e-mail nem o nome inteiro de outra pessoa; nome que é o início do e-mail vira "Pessoa da Família" e quem excluiu a conta, "Pessoa que saiu".';

-- ---------------------------------------------------------------------------
-- Apagar um contexto por inteiro (o Pessoal, ou uma Família cuja titular está só). Sem funções de apoio executáveis: só
-- clarevo_erase_person chama. A ordem respeita as chaves estrangeiras que não têm cascata (financial_records.context_id é restrict;
-- lançamentos, gastos e contas apontam para cartões, séries, contas e metas): primeiro quem aponta, depois quem é apontado.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_erase_context(p_context uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ghosts uuid[];
  v_ghost uuid;
begin
  -- Pessoas anônimas que só continuavam por causa deste contexto (X4): voltam a ser candidatas a sair depois.
  select coalesce(array_agg(distinct m.person_id), '{}') into v_ghosts
    from public.context_memberships m
    join public.persons p on p.id = m.person_id
   where m.context_id = p_context and p.deleted_at is not null;

  delete from public.card_entries where context_id = p_context;
  delete from public.financial_records where context_id = p_context;
  delete from public.commitments where context_id = p_context;
  delete from public.goal_movements where context_id = p_context;
  delete from public.goals where context_id = p_context;
  delete from public.series_terms where context_id = p_context;
  delete from public.commitment_series where context_id = p_context;
  delete from public.cards where context_id = p_context;
  delete from public.financial_accounts where context_id = p_context;
  delete from public.category_budgets where context_id = p_context;
  delete from public.commitment_limits where context_id = p_context;
  delete from public.income_references where context_id = p_context;
  delete from public.savings_checks where context_id = p_context;
  delete from public.return_reviews where context_id = p_context;
  delete from public.context_activity where context_id = p_context;
  delete from public.family_invites where context_id = p_context;
  delete from public.record_operations where context_id = p_context;
  delete from public.context_memberships where context_id = p_context;
  delete from public.financial_contexts where id = p_context;

  foreach v_ghost in array v_ghosts loop
    begin
      delete from public.persons where id = v_ghost and deleted_at is not null;
    exception when foreign_key_violation then
      null; -- ainda é autora de algo em outra Família: a linha anônima continua
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Apagar uma pessoa (regras 2 a 5 de D-058), na ordem certa para as chaves estrangeiras. Idempotente: sem linha viva em persons
-- (conta que nunca criou espaço, já excluída ou anônima), não há o que apagar. Recusa transferir_antes (titular com outras pessoas
-- ativas) antes de mudar qualquer coisa. Chamada por delete_my_account e pelo gatilho de auth.users.
--
-- Ordem (X5 e X7): 1) trava por pessoa; 2) trava de cada Família com que a pessoa tem ou teve vínculo, em ordem de identificador (o
-- conjunto não cresce com a trava da pessoa: aceitar convite e criar Família usam a mesma, e passar a titularidade só vai para quem
-- já é membro); 3) linha da pessoa em persons, for update, que faz esperar quem está gravando por ela (record_operations_actor_guard)
-- e deixa a exclusão esperar quem já gravou; 4) SÓ ENTÃO o que é dela e o que é dos outros, com as Famílias paradas: calcular antes
-- das travas deixava a Família sem titular quando a titularidade chegava à pessoa enquanto ela excluía.
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

  -- Regra 4: a licença ativa termina no ato; os direitos ao plano saem; a empresa fica só com a licença encerrada, sem a pessoa.
  update public.licenses set status = 'encerrada', ended_at = now() where person_id = p_person and status = 'ativa';
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
-- Excluir a minha conta. Ordem: sessão (nao_autenticado); chave (chave_invalida); confirmação exata (confirmacao_invalida); trava da
-- pessoa; chave já usada em outra operação da pessoa (chave_reutilizada); clarevo_erase_person, que trava as Famílias da pessoa e
-- depois a linha dela em persons (for update, X5) e só então calcula o que apagar (transferir_antes); por fim a linha de auth.users.
-- A trava da linha fica DENTRO de clarevo_erase_person, logo depois das travas das Famílias (e não antes delas): quem passa a
-- titularidade segura a trava da Família e depois grava a nova titular, e uma exclusão com a linha já travada esperaria a Família
-- enquanto essa pessoa espera a linha (as duas se esperariam). O efeito é o mesmo de travar no começo: nada é apagado, e ninguém grava
-- em nome da pessoa, sem que a linha esteja travada. A resposta não traz dado nenhum: {deleted: true}, também quando a conta já não
-- existe (repetição da mesma chave com um token ainda válido: sem erro e sem efeito).
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account(p_confirmation text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  if p_confirmation is distinct from 'EXCLUIR' then
    raise exception 'confirmacao_invalida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('familia:p:' || v_uid::text));
  -- A chave é da pessoa e vale para uma operação só: se já serviu a outra, é reutilizada (como nas outras funções).
  if exists (select 1 from public.record_operations o where o.actor_id = v_uid and o.idempotency_key = p_key) then
    raise exception 'chave_reutilizada' using errcode = 'PT409';
  end if;

  perform public.clarevo_erase_person(v_uid);
  delete from auth.users where id = v_uid;

  return jsonb_build_object('deleted', true);
end;
$$;

-- X1: qualquer exclusão de usuário (a do painel do Supabase também) passa pelas mesmas regras antes de a linha sair.
create or replace function public.clarevo_erase_on_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.clarevo_erase_person(old.id);
  return old;
end;
$$;

create trigger clarevo_erase_on_user_delete
  before delete on auth.users
  for each row execute function public.clarevo_erase_on_user_delete();

-- Nenhuma destas funções é executável por quem tem sessão: só delete_my_account (e o gatilho de auth.users) chega nelas.
revoke all on function public.persons_auth_guard() from public, anon, authenticated;
revoke all on function public.financial_contexts_person_guard() from public, anon, authenticated;
revoke all on function public.context_memberships_person_guard() from public, anon, authenticated;
revoke all on function public.record_operations_actor_guard() from public, anon, authenticated;
revoke all on function public.clarevo_erase_context(uuid) from public, anon, authenticated;
revoke all on function public.clarevo_erase_person(uuid) from public, anon, authenticated;
revoke all on function public.clarevo_erase_on_user_delete() from public, anon, authenticated;
revoke all on function public.delete_my_account(text, text) from public, anon, authenticated;
-- No Supabase os privilégios padrão dão execute também a service_role; as funções de apoio e os gatilhos não precisam dele.
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['persons_auth_guard()', 'financial_contexts_person_guard()', 'context_memberships_person_guard()',
                             'record_operations_actor_guard()', 'clarevo_erase_context(uuid)', 'clarevo_erase_person(uuid)', 'clarevo_erase_on_user_delete()'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Privilégios: retirar os padrões e conceder só o necessário (a mesma lista da 0014, mais delete_my_account)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
-- As funções da equipe Clarevo também não são executáveis por service_role (de novo aqui, para o estado final não depender da ordem
-- dos blocos acima nem de privilégios padrão concedidos depois).
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['clarevo_staff_find_admin(text)', 'clarevo_staff_create_organization(text, integer, text, date, date, text)',
                             'clarevo_staff_add_org_admin(uuid, text)', 'clarevo_staff_update_contract(uuid, integer, date)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
  end if;
end $$;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant update (display_name, locale) on public.persons to authenticated;
grant update (name) on public.financial_accounts to authenticated;

grant execute on function public.ensure_personal_space(text, text) to authenticated;
grant execute on function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text, text) to authenticated;
grant execute on function public.update_record(text, uuid, integer, uuid, bigint, date, text, text) to authenticated;
grant execute on function public.delete_record(text, uuid, integer) to authenticated;
grant execute on function public.month_totals(uuid, date) to authenticated;
-- Usadas pelas políticas e pelas visões (avaliadas com os privilégios de quem consulta).
grant execute on function public.context_permission(uuid, text) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

grant execute on function public.create_commitment(text, uuid, bigint, date, text, text) to authenticated;
grant execute on function public.update_commitment(text, uuid, integer, bigint, date, text, text, boolean) to authenticated;
grant execute on function public.delete_commitment(text, uuid, integer) to authenticated;
grant execute on function public.pay_commitment(text, uuid, integer, uuid, bigint, date, text) to authenticated;
grant execute on function public.undo_commitment_payment(text, uuid, integer) to authenticated;
grant execute on function public.month_to_pay(uuid, date) to authenticated;

grant execute on function public.create_series(text, uuid, text, text, text, text, bigint, text, integer, date, integer, integer, date, integer) to authenticated;
grant execute on function public.update_series_from(text, uuid, integer, integer, jsonb, text, text, text, bigint, text, integer) to authenticated;
grant execute on function public.end_series(text, uuid, integer, integer, jsonb) to authenticated;
grant execute on function public.delete_series(text, uuid, integer, jsonb) to authenticated;
grant execute on function public.sync_series_occurrences(uuid) to authenticated;
grant execute on function public.inform_series_year(text, uuid, integer, jsonb, bigint) to authenticated;
grant execute on function public.skip_series_year(text, uuid, integer, jsonb) to authenticated;

grant execute on function public.create_series_occurrence(text, uuid, integer, integer, text) to authenticated;
grant execute on function public.decide_return_review(text, uuid, integer, date, text) to authenticated;
grant execute on function public.months_overview(uuid, date, date) to authenticated;

grant execute on function public.set_income_reference(text, uuid, date, integer, bigint, boolean) to authenticated;
grant execute on function public.delete_income_reference(text, uuid, integer) to authenticated;
grant execute on function public.month_committed(uuid, date) to authenticated;

grant execute on function public.create_goal(text, uuid, text, text, bigint, date, bigint, bigint, integer, text, bigint, date) to authenticated;
grant execute on function public.update_goal(text, uuid, integer, text, text, bigint, date, bigint, bigint, integer, text) to authenticated;
grant execute on function public.set_goal_status(text, uuid, integer, text) to authenticated;
grant execute on function public.delete_goal(text, uuid, integer) to authenticated;
grant execute on function public.add_goal_movement(text, uuid, text, bigint, date, text, uuid) to authenticated;
grant execute on function public.update_goal_movement(text, uuid, integer, bigint, date, text, uuid) to authenticated;
grant execute on function public.delete_goal_movement(text, uuid, integer) to authenticated;
grant execute on function public.set_savings_answer(text, uuid, integer, text, bigint) to authenticated;

-- Funções de data das visões de cartão (puras).
grant execute on function public.my_today() to authenticated;
grant execute on function public.invoice_due_on(integer, date) to authenticated;
grant execute on function public.invoice_closing_on(integer, integer, date) to authenticated;
grant execute on function public.invoice_month_for(integer, integer, date) to authenticated;

grant execute on function public.create_card(text, uuid, text, text, integer, integer, bigint) to authenticated;
grant execute on function public.update_card(text, uuid, integer, text, text, integer, integer, bigint) to authenticated;
grant execute on function public.set_card_status(text, uuid, integer, text) to authenticated;
grant execute on function public.delete_card(text, uuid, integer) to authenticated;
grant execute on function public.add_card_purchase(text, uuid, date, bigint, integer, text, text, text) to authenticated;
grant execute on function public.update_card_entry(text, uuid, integer, text, bigint, date, text, text, integer, date, text) to authenticated;
grant execute on function public.delete_card_entry(text, uuid, integer) to authenticated;
grant execute on function public.add_card_charge(text, uuid, date, text, bigint) to authenticated;
grant execute on function public.add_card_refund(text, uuid, date, bigint, text, text) to authenticated;
grant execute on function public.pay_invoice(text, uuid, date, integer, bigint, date, uuid) to authenticated;
grant execute on function public.undo_invoice_payment(text, uuid, date, integer) to authenticated;

grant execute on function public.set_category_budget(text, uuid, text, date, integer, bigint) to authenticated;
grant execute on function public.delete_category_budget(text, uuid, integer) to authenticated;
grant execute on function public.month_budget(uuid, date) to authenticated;
grant execute on function public.set_commitment_limit(text, uuid, date, integer, integer) to authenticated;
grant execute on function public.delete_commitment_limit(text, uuid, integer) to authenticated;

grant execute on function public.create_account(text, uuid, text, text) to authenticated;
grant execute on function public.update_account(text, uuid, integer, text, text) to authenticated;
grant execute on function public.set_default_account(text, uuid, integer) to authenticated;
grant execute on function public.set_account_status(text, uuid, integer, text, uuid) to authenticated;
grant execute on function public.delete_account(text, uuid, integer) to authenticated;

grant execute on function public.set_series_subscription(text, uuid, integer, boolean) to authenticated;
grant execute on function public.mark_subscriptions_reviewed(text, uuid) to authenticated;

grant execute on function public.import_records(text, uuid, text, uuid, jsonb) to authenticated;

grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.create_family_invite(uuid, text, text) to authenticated;
grant execute on function public.cancel_family_invite(uuid, text) to authenticated;
grant execute on function public.preview_family_invite(text) to authenticated;
grant execute on function public.accept_family_invite(text, text) to authenticated;
grant execute on function public.leave_family(uuid, text) to authenticated;
grant execute on function public.remove_family_member(uuid, uuid, text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text, text) to authenticated;
grant execute on function public.transfer_family_ownership(uuid, uuid, text) to authenticated;
grant execute on function public.end_family(uuid, text) to authenticated;

-- Empresa (D-056): as licenças só mudam por estas funções; a equipe Clarevo (clarevo_staff_*) não tem execute para ninguém com sessão.
grant execute on function public.invite_licenses(uuid, text[], text) to authenticated;
grant execute on function public.renew_license_invite(uuid, text) to authenticated;
grant execute on function public.cancel_license_invite(uuid, text) to authenticated;
grant execute on function public.end_license(uuid, text) to authenticated;
grant execute on function public.preview_license_invite(text) to authenticated;
grant execute on function public.accept_license(text, text) to authenticated;
grant execute on function public.organization_usage(uuid) to authenticated;

-- Excluir a conta (D-058): a única função nova com execute para quem tem sessão; as de apoio, os gatilhos e a guarda não têm.
grant execute on function public.delete_my_account(text, text) to authenticated;

revoke select on public.family_invites from authenticated;
grant select (id, context_id, created_by, role, expires_at, used_at, used_by, cancelled_at, created_at)
  on public.family_invites to authenticated;

-- Licenças: a empresa lê as do próprio contrato e a pessoa lê a própria, sempre sem o resumo do código e sem a identidade de quem
-- aceitou (a pessoa lê o próprio benefício pela visão my_benefit). Nenhum insert, update nem delete direto.
revoke select on public.licenses from authenticated;
grant select (id, contract_id, invited_email, status, invited_at, activated_at, ended_at, cancelled_at, created_at)
  on public.licenses to authenticated;
