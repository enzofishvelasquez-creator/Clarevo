-- Clarevo · migração 0028 · Compra no cartão pelo Telegram e pelo WhatsApp (D-089 C). Depois de 20261106000002_categoria_credito.sql.
-- A mensagem "farmácia 41 cartão" (ou "mercado 120 cartão azul", com o nome do cartão depois da palavra) vira uma compra à vista no
-- cartão de crédito, pela mesma add_card_purchase do app, em nome da pessoa; DESFAZER desfaz também a compra (delete_card_entry).
-- Cartões são do espaço Pessoal (D-037): na Família, ou sem cartão ativo, a resposta explica e nada entra. Com um cartão só, é ele;
-- com mais de um, o nome escrito escolhe (sem acento e sem caixa), e sem um só que combine a resposta pergunta, listando os apelidos.
-- Nada do texto da mensagem é guardado: as funções recebem só o resumo de quem escreve, o identificador resumido da mensagem e o que
-- vira lançamento; chat_messages ganha entry_id (o lançamento do cartão), além de record_id, para o DESFAZER.
-- Aplicar no SQL Editor depois da 0027 (docs/05, passo 12r) e publicar de novo as funções whatsapp e telegram (geradas por
-- npm run whatsapp). Testes em supabase/tests/99zzzzzzz_chat_cartao.sql.

-- ---------------------------------------------------------------------------
-- Tabela das mensagens: o lançamento do cartão e os resultados novos
-- ---------------------------------------------------------------------------
alter table public.chat_messages add column entry_id uuid references public.card_entries (id) on delete cascade;
-- A hora de chegada passa a ser a do relógio no instante da gravação (clock_timestamp), e não a do início da transação (now()): na
-- produção dá no mesmo (cada mensagem chega numa transação), e nos testes, que gravam várias mensagens numa transação só, o DESFAZER
-- passa a ter uma ordem definida pela chegada, e não pelo identificador.
alter table public.chat_messages alter column received_at set default clock_timestamp();
alter table public.chat_messages add constraint chat_messages_um_alvo check (record_id is null or entry_id is null);
create index chat_messages_entry_idx on public.chat_messages (entry_id) where entry_id is not null;
comment on column public.chat_messages.entry_id is 'Compra no cartão anotada por esta mensagem (D-089 C), para o DESFAZER; record_id continua para gastos e recebimentos.';

alter table public.chat_messages drop constraint chat_messages_outcome_check;
alter table public.chat_messages add constraint chat_messages_outcome_check check (outcome in (
  'ligado', 'anotado', 'desfeito', 'desligado', 'nao_ligado', 'codigo_invalido', 'ja_ligado', 'muitas_tentativas', 'muitas_mensagens',
  'nada_para_desfazer', 'sem_permissao', 'sem_conta', 'data_futura', 'valor_invalido', 'valor_acima_do_limite', 'descricao_invalida',
  'sem_assinatura', 'ajuda', 'midia', 'nao_entendi', 'compra_anotada', 'compra_desfeita', 'sem_cartao', 'qual_cartao', 'fatura_paga',
  'limite_do_cartao'));

-- O registro da mensagem aceita o lançamento do cartão (a assinatura muda, então a função é recriada; quem a chama resolve pelo nome).
drop function public.clarevo_chat_log(text, text, text, uuid, text, uuid);
create function public.clarevo_chat_log(
  p_channel text, p_message_id text, p_sender_hash text, p_person uuid, p_outcome text, p_record uuid default null, p_entry uuid default null
)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  delete from public.chat_messages where received_at < now() - interval '30 days';
  insert into public.chat_messages (channel, message_id, sender_hash, person_id, outcome, record_id, entry_id)
  values (p_channel, p_message_id, p_sender_hash, p_person, p_outcome, p_record, p_entry);
end;
$$;

-- ---------------------------------------------------------------------------
-- Apoio: achar o cartão pelo nome escrito e descrever a compra na resposta
-- ---------------------------------------------------------------------------
-- Sem acento e em minúsculas, para achar o cartão pelo nome escrito na mensagem ("azul" acha "Cartão Azul").
create or replace function public.clarevo_chat_fold(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(translate(coalesce(p_text, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
                                                 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'))
$$;

-- O que a resposta diz de uma compra no cartão anotada ou desfeita pelo chat: valor, data da compra, descrição, categoria, o apelido
-- do cartão (nunca os dígitos) e a fatura em que a compra caiu.
create or replace function public.clarevo_chat_purchase(p_entry uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object('amount_cents', e.purchase_total_cents, 'purchased_on', e.purchased_on, 'description', e.description,
                            'category', e.category, 'card_nickname', c.nickname, 'invoice_month', e.invoice_month)
    from public.card_entries e
    join public.cards c on c.id = e.card_id
   where e.id = p_entry;
$$;

-- ---------------------------------------------------------------------------
-- Anotar a compra no cartão (as mesmas regras de clarevo_chat_add_record, pela add_card_purchase do app)
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_chat_add_card_purchase(
  p_channel text, p_message_id text, p_sender_hash text, p_sent_at timestamptz, p_amount_cents bigint, p_days_ago integer,
  p_occurred_on date, p_description text, p_category text, p_card_hint text
)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_gate jsonb;
  v_link public.chat_links%rowtype;
  v_today date;
  v_on date;
  v_kind text;
  v_names text[];
  v_card uuid;
  v_matches integer;
  v_pick text;
  v_hint text := nullif(public.clarevo_chat_fold(btrim(coalesce(p_card_hint, ''))), '');
  v_key text := p_channel || ':' || md5(p_message_id);
  v_entry uuid;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_error text;
  v_result text;
begin
  if p_sent_at is null or (p_days_ago is null) = (p_occurred_on is null) or p_days_ago not between 0 and 31 then
    raise exception 'mensagem_invalida' using errcode = '22023';
  end if;
  v_gate := public.clarevo_chat_gate(p_channel, p_message_id, p_sender_hash);
  if v_gate is not null then
    return v_gate;
  end if;

  v_link := public.clarevo_chat_link_locked(p_channel, p_sender_hash);
  if v_link.person_id is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, null, 'nao_ligado');
    return jsonb_build_object('result', 'nao_ligado');
  end if;
  v_today := public.clarevo_chat_day(v_link.person_id, p_sent_at);
  v_on := coalesce(p_occurred_on, v_today - p_days_ago);

  -- Cartões são do espaço Pessoal (D-037): na Família, ou sem cartão ativo, a compra não entra e a resposta explica.
  select c.kind into v_kind from public.financial_contexts c where c.id = v_link.context_id;
  select array_agg(c.nickname order by c.nickname) into v_names
    from public.cards c
   where c.context_id = v_link.context_id and c.status = 'ativo' and c.deleted_at is null;
  if v_kind is distinct from 'pessoal' or v_names is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'sem_cartao');
    return jsonb_build_object('result', 'sem_cartao', 'space', public.clarevo_chat_space(v_link.context_id), 'today', v_today);
  end if;
  -- Um cartão só: é ele. Com mais de um, o nome escrito depois de "cartão" escolhe: primeiro o apelido igual (sem acento e sem caixa;
  -- "azul" escolhe "Azul" mesmo havendo "Azul Infinite"); senão, um só cujo apelido contenha o nome escrito ou esteja nele ("cartão
  -- azul obrigado" escolhe "Azul"). Sem isso, a resposta pergunta.
  if cardinality(v_names) = 1 then
    select c.id into v_card from public.cards c
     where c.context_id = v_link.context_id and c.status = 'ativo' and c.deleted_at is null;
  elsif v_hint is not null then
    select count(*), min(c.id::text) into v_matches, v_pick from public.cards c
     where c.context_id = v_link.context_id and c.status = 'ativo' and c.deleted_at is null
       and public.clarevo_chat_fold(c.nickname) = v_hint;
    if v_matches <> 1 then
      select count(*), min(c.id::text) into v_matches, v_pick from public.cards c
       where c.context_id = v_link.context_id and c.status = 'ativo' and c.deleted_at is null
         and (position(v_hint in public.clarevo_chat_fold(c.nickname)) > 0 or position(public.clarevo_chat_fold(c.nickname) in v_hint) > 0);
    end if;
    if v_matches = 1 then
      v_card := v_pick::uuid;
    end if;
  end if;
  if v_card is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'qual_cartao');
    return jsonb_build_object('result', 'qual_cartao', 'space', public.clarevo_chat_space(v_link.context_id), 'cards', to_jsonb(v_names),
                              'today', v_today);
  end if;

  begin
    perform public.clarevo_chat_as(v_link.person_id);
    perform public.add_card_purchase(v_key, v_card, v_on, p_amount_cents, 1, p_description, p_category, null);
    perform public.clarevo_chat_as(null, v_claims, v_sub);
  exception when others then
    -- O bloco desfaz o que a add_card_purchase gravou e a sessão emprestada. Só os casos esperados viram resposta.
    get stacked diagnostics v_error = message_text;
    v_result := case v_error
      when 'sem_permissao' then 'sem_permissao'
      when 'conta_excluida' then 'nao_ligado'
      when 'nao_encontrado' then 'sem_cartao'
      when 'cartao_arquivado' then 'sem_cartao'
      when 'fatura_paga' then 'fatura_paga'
      when 'data_futura' then 'data_futura'
      when 'data_invalida' then 'data_futura'
      when 'valor_invalido' then 'valor_invalido'
      when 'valor_acima_do_limite' then 'valor_acima_do_limite'
      when 'descricao_obrigatoria' then 'descricao_invalida'
      when 'descricao_longa' then 'descricao_invalida'
      when 'categoria_invalida' then 'descricao_invalida'
      when 'assinatura_necessaria' then 'sem_assinatura'
      -- 5.000 lançamentos vivos no cartão: resposta, e não erro (a Meta e o Telegram entregariam a mensagem de novo).
      when 'limite_de_lancamentos' then 'limite_do_cartao'
    end;
    if v_result is null then
      raise;
    end if;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash,
                                    case when v_result = 'nao_ligado' then null else v_link.person_id end, v_result);
    return jsonb_build_object('result', v_result, 'space', public.clarevo_chat_space(v_link.context_id), 'today', v_today);
  end;

  -- O lançamento criado é o da operação gravada pela add_card_purchase com a chave desta mensagem.
  select o.entry_id into v_entry from public.record_operations o where o.actor_id = v_link.person_id and o.idempotency_key = v_key;
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'compra_anotada', null, v_entry);
  return jsonb_build_object('result', 'compra_anotada', 'space', public.clarevo_chat_space(v_link.context_id),
                            'purchase', public.clarevo_chat_purchase(v_entry), 'today', v_today);
end;
$$;

-- ---------------------------------------------------------------------------
-- DESFAZER: a última anotação do canal, gasto, recebimento ou compra no cartão
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_chat_undo(p_channel text, p_message_id text, p_sender_hash text, p_sent_at timestamptz)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_gate jsonb;
  v_link public.chat_links%rowtype;
  v_msg public.chat_messages%rowtype;
  v_record public.financial_records%rowtype;
  v_entry public.card_entries%rowtype;
  v_purchase jsonb;
  v_context uuid;
  v_today date;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_error text;
  v_result text;
begin
  v_gate := public.clarevo_chat_gate(p_channel, p_message_id, p_sender_hash);
  if v_gate is not null then
    return v_gate;
  end if;

  v_link := public.clarevo_chat_link_locked(p_channel, p_sender_hash);
  if v_link.person_id is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, null, 'nao_ligado');
    return jsonb_build_object('result', 'nao_ligado');
  end if;
  v_today := public.clarevo_chat_day(v_link.person_id, p_sent_at);

  -- A última anotação deste canal nas últimas 24 horas que ainda existe (gasto, recebimento ou compra no cartão), feita pela pessoa,
  -- num espaço em que ela ainda anota.
  select m.* into v_msg from public.chat_messages m
   where m.person_id = v_link.person_id and m.channel = p_channel and m.outcome in ('anotado', 'compra_anotada') and m.undone_at is null
     and m.received_at > now() - interval '24 hours'
     and ((m.record_id is not null and exists (
             select 1 from public.financial_records r
              join public.context_memberships cm on cm.context_id = r.context_id and cm.person_id = v_link.person_id
                                                 and cm.revoked_at is null and cm.can_write
             where r.id = m.record_id and r.deleted_at is null and r.created_by = v_link.person_id))
          or (m.entry_id is not null and exists (
             select 1 from public.card_entries e
              join public.context_memberships cm on cm.context_id = e.context_id and cm.person_id = v_link.person_id
                                                 and cm.revoked_at is null and cm.can_write
             where e.id = m.entry_id and e.deleted_at is null and e.created_by = v_link.person_id)))
   order by m.received_at desc, m.message_id desc
   limit 1
   for update of m;
  -- A versão é lida com a linha travada: uma edição no app ao mesmo tempo espera aqui.
  if found and v_msg.record_id is not null then
    select * into v_record from public.financial_records where id = v_msg.record_id and deleted_at is null for update;
  elsif found and v_msg.entry_id is not null then
    select * into v_entry from public.card_entries where id = v_msg.entry_id and deleted_at is null for update;
  end if;
  if v_record.id is null and v_entry.id is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'nada_para_desfazer');
    return jsonb_build_object('result', 'nada_para_desfazer');
  end if;
  v_context := coalesce(v_record.context_id, v_entry.context_id);
  if v_entry.id is not null then
    v_purchase := public.clarevo_chat_purchase(v_entry.id);
  end if;

  begin
    perform public.clarevo_chat_as(v_link.person_id);
    if v_record.id is not null then
      perform public.delete_record(p_channel || ':' || md5(p_message_id), v_record.id, v_record.version);
    else
      perform public.delete_card_entry(p_channel || ':' || md5(p_message_id), v_entry.id, v_entry.version);
    end if;
    perform public.clarevo_chat_as(null, v_claims, v_sub);
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_result := case v_error
      when 'sem_permissao' then 'sem_permissao'
      when 'nao_encontrado' then 'nada_para_desfazer'
      when 'versao_desatualizada' then 'nada_para_desfazer'
      when 'conta_excluida' then 'nao_ligado'
      when 'assinatura_necessaria' then 'sem_assinatura'
      when 'fatura_paga' then 'fatura_paga'
    end;
    if v_result is null then
      raise;
    end if;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash,
                                    case when v_result = 'nao_ligado' then null else v_link.person_id end, v_result);
    return case when v_result in ('sem_permissao', 'fatura_paga')
                then jsonb_build_object('result', v_result, 'space', public.clarevo_chat_space(v_context), 'today', v_today)
                else jsonb_build_object('result', v_result) end;
  end;

  update public.chat_messages set undone_at = now() where message_id = v_msg.message_id;
  if v_record.id is not null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'desfeito', v_record.id);
    return jsonb_build_object('result', 'desfeito', 'space', public.clarevo_chat_space(v_record.context_id),
                              'record', public.clarevo_chat_record(v_record.id), 'today', v_today);
  end if;
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'compra_desfeita', null, v_entry.id);
  return jsonb_build_object('result', 'compra_desfeita', 'space', public.clarevo_chat_space(v_entry.context_id),
                            'purchase', v_purchase, 'today', v_today);
end;
$$;

-- ---------------------------------------------------------------------------
-- As funções do servidor, uma por canal (só a chave de serviço executa)
-- ---------------------------------------------------------------------------
create or replace function public.whatsapp_add_card_purchase(
  p_message_id text, p_phone_hash text, p_sent_at timestamptz, p_amount_cents bigint, p_days_ago integer, p_occurred_on date,
  p_description text, p_category text default null, p_card_hint text default null
)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_add_card_purchase('whatsapp', p_message_id, p_phone_hash, p_sent_at, p_amount_cents, p_days_ago, p_occurred_on,
                                               p_description, p_category, p_card_hint);
$$;

create or replace function public.telegram_add_card_purchase(
  p_message_id text, p_sender_hash text, p_sent_at timestamptz, p_amount_cents bigint, p_days_ago integer, p_occurred_on date,
  p_description text, p_category text default null, p_card_hint text default null
)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_add_card_purchase('telegram', p_message_id, p_sender_hash, p_sent_at, p_amount_cents, p_days_ago, p_occurred_on,
                                               p_description, p_category, p_card_hint);
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: as internas, ninguém de fora; as do servidor, só service_role.
-- ---------------------------------------------------------------------------
revoke all on function public.clarevo_chat_log(text, text, text, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.clarevo_chat_fold(text) from public, anon, authenticated;
revoke all on function public.clarevo_chat_purchase(uuid) from public, anon, authenticated;
revoke all on function public.clarevo_chat_add_card_purchase(text, text, text, timestamptz, bigint, integer, date, text, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_add_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text) from public, anon, authenticated;
revoke all on function public.telegram_add_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text) from public, anon, authenticated;
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['clarevo_chat_log(text, text, text, uuid, text, uuid, uuid)', 'clarevo_chat_fold(text)', 'clarevo_chat_purchase(uuid)',
                             'clarevo_chat_add_card_purchase(text, text, text, timestamptz, bigint, integer, date, text, text, text)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
    foreach f in array array['whatsapp_add_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text)',
                             'telegram_add_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text)'] loop
      execute format('grant execute on function public.%s to service_role', f);
    end loop;
  end if;
end $$;
