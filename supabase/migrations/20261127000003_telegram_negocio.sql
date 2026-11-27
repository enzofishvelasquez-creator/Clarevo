-- Clarevo · migração 0049 · Telegram e WhatsApp no espaço Negócio (decisão do Enzo de 27/11/2026, no lugar do item 5 da D-113 para os
-- canais de mensagem). Depois de 20261127000002_assinar_no_teste.sql.
-- O vínculo continua um por pessoa e canal, no Pessoal ou na Família em que a pessoa anota (o código de ligar ainda recusa o negócio,
-- D-113a). Uma mensagem que começa com a palavra "negócio" ("negócio material 120 cartão", "negócio recebi 300 conserto") anota no
-- espaço Negócio da própria pessoa. A função do servidor só tira a palavra do começo e chama as funções novas; o negócio é achado aqui,
-- pela pessoa do vínculo, e nunca pelo texto da mensagem.
--
-- O que muda no banco:
--   1. clarevo_own_business(pessoa): o negócio ativo que é da própria pessoa (dona do contexto e titular com escrita, o negócio que ela
--      criou). O negócio de outra pessoa (Clarevo Plus, desligado) não conta: para quem só anota no negócio de outra pessoa, é como não ter
--      negócio, e a resposta é a mesma (sem_negocio), sem dizer nada do Plus. clarevo_own_business_locked faz a mesma busca com a trava de
--      end_business (familia:c:<negócio>) e confere de novo depois dela, como a retirada e o mover (D-113a).
--   2. clarevo_chat_add_record e clarevo_chat_add_card_purchase ganham p_business no fim (padrão falso: tudo como antes; saem e voltam com
--      a assinatura nova, para a chamada das funções de cada canal não ficar ambígua). Com p_business, o espaço é o negócio da pessoa; sem
--      negócio, nada é gravado, a mensagem fica registrada como sem_negocio e a resposta não traz espaço. O resto é o caminho de sempre:
--      create_record ou add_card_purchase em nome da pessoa (autoria, permissão de escrita, a trava "só ver e exportar" do gatilho de
--      record_operations, que vira sem_assinatura), a conta principal do negócio (sem_conta) e os cartões ativos do negócio, com as mesmas
--      regras de escolha do Pessoal (na Família, compra no cartão continua sem_cartao). As marcas do negócio ("Teve nota fiscal?" e "Quem
--      pagou") ficam vazias: a pessoa preenche no app. DESFAZER não muda: desfaz a última anotação do canal, no negócio ou no espaço ligado.
--   3. Quatro funções novas do servidor, só com a chave de serviço, com os mesmos argumentos de *_add_record e *_add_card_purchase:
--      telegram_add_business_record, telegram_add_business_card_purchase, whatsapp_add_business_record e
--      whatsapp_add_business_card_purchase.
--   4. clarevo_chat_note (na ajuda) e clarevo_chat_link (no ligado) devolvem também "negocio": true quando a pessoa do vínculo tem o próprio
--      negócio, para a resposta ensinar a palavra só a quem tem. Sem negócio, a resposta é a de antes, sem a chave.
--   5. O resultado novo sem_negocio em chat_messages.
-- Compatibilidade: as funções que a função telegram publicada chama mantêm nomes, argumentos e respostas (a chave "negocio" a mais ela
-- ignora); a função nova chama as quatro funções novas. Nenhuma função nova para o app (130 continuam), nenhuma ação nova em
-- record_operations (105), nenhum dado muda. Aplicar no SQL Editor ANTES de publicar a função telegram nova (docs/05, passo 12ap) e
-- recarregar o esquema da API. Testes em supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzzzzzz_telegram_negocio.sql.

-- ---------------------------------------------------------------------------
-- 1. O resultado novo: a lista da 0040 e sem_negocio.
-- ---------------------------------------------------------------------------
alter table public.chat_messages drop constraint chat_messages_outcome_check;
alter table public.chat_messages add constraint chat_messages_outcome_check check (outcome in (
  'ligado', 'anotado', 'desfeito', 'desligado', 'nao_ligado', 'codigo_invalido', 'ja_ligado', 'muitas_tentativas', 'muitas_mensagens',
  'nada_para_desfazer', 'sem_permissao', 'sem_conta', 'data_futura', 'valor_invalido', 'valor_acima_do_limite', 'descricao_invalida',
  'sem_assinatura', 'ajuda', 'midia', 'nao_entendi', 'compra_anotada', 'compra_desfeita', 'sem_cartao', 'qual_cartao', 'fatura_paga',
  'limite_do_cartao', 'pagamento_de_fatura', 'sem_negocio'));

-- ---------------------------------------------------------------------------
-- 2. O negócio da própria pessoa (internas, sem execute para ninguém)
-- ---------------------------------------------------------------------------

-- O negócio ativo que a pessoa criou: dona do contexto e titular com escrita (nunca a Contabilidade). null: sem negócio próprio.
create or replace function public.clarevo_own_business(p_person uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $$
begin
  return (select c.id
            from public.financial_contexts c
            join public.context_memberships m on m.context_id = c.id and m.person_id = p_person
           where c.kind = 'negocio' and c.ended_at is null and c.owner_person_id = p_person
             and m.role = 'titular' and m.revoked_at is null and m.can_write and not m.accountant
           order by c.created_at, c.id
           limit 1);
end;
$$;

-- O mesmo, com a trava de end_business antes de conferir de novo: um negócio encerrado ao mesmo tempo não recebe a anotação.
create or replace function public.clarevo_own_business_locked(p_person uuid)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_ctx uuid := public.clarevo_own_business(p_person);
begin
  if v_ctx is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('familia:c:' || v_ctx::text));
  if public.clarevo_own_business(p_person) is distinct from v_ctx then
    return null;
  end if;
  return v_ctx;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Anotar um gasto ou recebimento: a função da 0023 (20261104000001_assinatura.sql) com p_business no fim.
-- Retorno: {result: anotado | nao_ligado | sem_negocio | sem_conta | sem_permissao | sem_assinatura | data_futura | valor_invalido |
-- valor_acima_do_limite | descricao_invalida, space?, record?, today}.
-- ---------------------------------------------------------------------------
drop function public.clarevo_chat_add_record(text, text, text, timestamptz, public.record_kind, bigint, integer, date, text, text);
create function public.clarevo_chat_add_record(
  p_channel text, p_message_id text, p_sender_hash text, p_sent_at timestamptz, p_kind public.record_kind, p_amount_cents bigint,
  p_days_ago integer, p_occurred_on date, p_description text, p_category text, p_business boolean default false
)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_gate jsonb;
  v_link public.chat_links%rowtype;
  v_ctx uuid;
  v_today date;
  v_on date;
  v_account uuid;
  v_record public.financial_records%rowtype;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_error text;
  v_result text;
begin
  if p_sent_at is null or (p_days_ago is null) = (p_occurred_on is null) or p_days_ago not between 0 and 31 or p_business is null then
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

  -- O espaço: o do vínculo ou, com a palavra "negócio", o negócio da própria pessoa (achado aqui, nunca pelo texto).
  v_ctx := v_link.context_id;
  if p_business then
    v_ctx := public.clarevo_own_business_locked(v_link.person_id);
    if v_ctx is null then
      perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'sem_negocio');
      return jsonb_build_object('result', 'sem_negocio', 'today', v_today);
    end if;
  end if;

  select a.id into v_account from public.financial_accounts a
   where a.context_id = v_ctx and a.is_default and a.deleted_at is null;
  if v_account is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'sem_conta');
    return jsonb_build_object('result', 'sem_conta', 'space', public.clarevo_chat_space(v_ctx), 'today', v_today);
  end if;

  begin
    perform public.clarevo_chat_as(v_link.person_id);
    v_record := public.create_record(p_channel || ':' || md5(p_message_id), v_ctx, v_account, p_kind, p_amount_cents,
                                     v_on, p_description, p_category, null);
    perform public.clarevo_chat_as(null, v_claims, v_sub);
  exception when others then
    -- O bloco desfaz o que a create_record gravou e a sessão emprestada. Só os casos esperados viram resposta.
    get stacked diagnostics v_error = message_text;
    v_result := case v_error
      when 'sem_permissao' then 'sem_permissao'
      when 'conta_excluida' then 'nao_ligado'
      when 'conta_invalida' then 'sem_conta'
      when 'data_futura' then 'data_futura'
      when 'data_invalida' then 'data_futura'
      when 'valor_invalido' then 'valor_invalido'
      when 'valor_acima_do_limite' then 'valor_acima_do_limite'
      when 'descricao_obrigatoria' then 'descricao_invalida'
      when 'descricao_longa' then 'descricao_invalida'
      when 'categoria_invalida' then 'descricao_invalida'
      when 'assinatura_necessaria' then 'sem_assinatura'
    end;
    if v_result is null then
      raise;
    end if;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash,
                                    case when v_result = 'nao_ligado' then null else v_link.person_id end, v_result);
    return jsonb_build_object('result', v_result, 'space', public.clarevo_chat_space(v_ctx), 'today', v_today);
  end;

  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'anotado', v_record.id);
  return jsonb_build_object('result', 'anotado', 'space', public.clarevo_chat_space(v_ctx),
                            'record', public.clarevo_chat_record(v_record.id), 'today', v_today);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Anotar a compra no cartão: a função da 0028 (20261109000001_chat_cartao.sql) com p_business no fim. Cartões do Pessoal (D-037) e,
-- com a palavra "negócio", os do negócio da própria pessoa; na Família, ou sem cartão ativo, a compra não entra e a resposta explica.
-- ---------------------------------------------------------------------------
drop function public.clarevo_chat_add_card_purchase(text, text, text, timestamptz, bigint, integer, date, text, text, text);
create function public.clarevo_chat_add_card_purchase(
  p_channel text, p_message_id text, p_sender_hash text, p_sent_at timestamptz, p_amount_cents bigint, p_days_ago integer,
  p_occurred_on date, p_description text, p_category text, p_card_hint text, p_business boolean default false
)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_gate jsonb;
  v_link public.chat_links%rowtype;
  v_ctx uuid;
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
  if p_sent_at is null or (p_days_ago is null) = (p_occurred_on is null) or p_days_ago not between 0 and 31 or p_business is null then
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

  -- O espaço: o do vínculo ou, com a palavra "negócio", o negócio da própria pessoa (achado aqui, nunca pelo texto).
  v_ctx := v_link.context_id;
  if p_business then
    v_ctx := public.clarevo_own_business_locked(v_link.person_id);
    if v_ctx is null then
      perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'sem_negocio');
      return jsonb_build_object('result', 'sem_negocio', 'today', v_today);
    end if;
  end if;

  -- Cartões do Pessoal e do negócio da pessoa: na Família, ou sem cartão ativo, a compra não entra e a resposta explica.
  select c.kind into v_kind from public.financial_contexts c where c.id = v_ctx;
  select array_agg(c.nickname order by c.nickname) into v_names
    from public.cards c
   where c.context_id = v_ctx and c.status = 'ativo' and c.deleted_at is null;
  if (v_kind is distinct from 'pessoal' and not p_business) or v_names is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'sem_cartao');
    return jsonb_build_object('result', 'sem_cartao', 'space', public.clarevo_chat_space(v_ctx), 'today', v_today);
  end if;
  -- Um cartão só: é ele. Com mais de um, o nome escrito depois de "cartão" escolhe: primeiro o apelido igual (sem acento e sem caixa;
  -- "azul" escolhe "Azul" mesmo havendo "Azul Infinite"); senão, um só cujo apelido contenha o nome escrito ou esteja nele ("cartão
  -- azul obrigado" escolhe "Azul"). Sem isso, a resposta pergunta.
  if cardinality(v_names) = 1 then
    select c.id into v_card from public.cards c
     where c.context_id = v_ctx and c.status = 'ativo' and c.deleted_at is null;
  elsif v_hint is not null then
    select count(*), min(c.id::text) into v_matches, v_pick from public.cards c
     where c.context_id = v_ctx and c.status = 'ativo' and c.deleted_at is null
       and public.clarevo_chat_fold(c.nickname) = v_hint;
    if v_matches <> 1 then
      select count(*), min(c.id::text) into v_matches, v_pick from public.cards c
       where c.context_id = v_ctx and c.status = 'ativo' and c.deleted_at is null
         and (position(v_hint in public.clarevo_chat_fold(c.nickname)) > 0 or position(public.clarevo_chat_fold(c.nickname) in v_hint) > 0);
    end if;
    if v_matches = 1 then
      v_card := v_pick::uuid;
    end if;
  end if;
  if v_card is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'qual_cartao');
    return jsonb_build_object('result', 'qual_cartao', 'space', public.clarevo_chat_space(v_ctx), 'cards', to_jsonb(v_names),
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
    return jsonb_build_object('result', v_result, 'space', public.clarevo_chat_space(v_ctx), 'today', v_today);
  end;

  -- O lançamento criado é o da operação gravada pela add_card_purchase com a chave desta mensagem.
  select o.entry_id into v_entry from public.record_operations o where o.actor_id = v_link.person_id and o.idempotency_key = v_key;
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'compra_anotada', null, v_entry);
  return jsonb_build_object('result', 'compra_anotada', 'space', public.clarevo_chat_space(v_ctx),
                            'purchase', public.clarevo_chat_purchase(v_entry), 'today', v_today);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. A ajuda e o ligado dizem se a pessoa do vínculo tem o próprio negócio (para a resposta ensinar a palavra "negócio" só a quem tem).
-- ---------------------------------------------------------------------------

-- A função da 0022 (20261101000001_telegram.sql), com a chave "negocio" na ajuda de quem tem o próprio negócio.
-- Retorno: {result: registrada | repetida | muitas_mensagens | silencio, negocio?: true}.
create or replace function public.clarevo_chat_note(p_channel text, p_message_id text, p_sender_hash text, p_outcome text)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_gate jsonb;
  v_person uuid;
begin
  if p_outcome is null or p_outcome not in ('ajuda', 'midia', 'nao_entendi') then
    raise exception 'resultado_invalido' using errcode = '22023';
  end if;
  v_gate := public.clarevo_chat_gate(p_channel, p_message_id, p_sender_hash);
  if v_gate is not null then
    return v_gate;
  end if;
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, null, p_outcome);
  if p_outcome = 'ajuda' then
    select l.person_id into v_person from public.chat_links l where l.sender_hash = p_sender_hash and l.channel = p_channel;
    if v_person is not null and public.clarevo_own_business(v_person) is not null then
      return jsonb_build_object('result', 'registrada', 'negocio', true);
    end if;
  end if;
  return jsonb_build_object('result', 'registrada');
end;
$$;

-- A função da 0042 (20261117000004_espaco_negocio.sql), com a chave "negocio" no ligado de quem tem o próprio negócio.
create or replace function public.clarevo_chat_link(p_channel text, p_message_id text, p_sender_hash text, p_code text)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_gate jsonb;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]+', '', 'g'));
  v_code_hash text;
  v_person uuid;
  v_c public.chat_link_codes%rowtype;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_ok boolean;
begin
  v_gate := public.clarevo_chat_gate(p_channel, p_message_id, p_sender_hash);
  if v_gate is not null then
    return v_gate;
  end if;

  if (select count(*) from public.chat_messages
       where sender_hash = p_sender_hash and outcome = 'codigo_invalido' and received_at > now() - interval '1 hour') >= 5 then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, null, 'muitas_tentativas');
    return jsonb_build_object('result', 'muitas_tentativas');
  end if;

  v_code_hash := encode(sha256(convert_to(v_code, 'UTF8')), 'hex');
  -- A trava da pessoa vem antes da trava da linha do código (mesma ordem de create_*_code, unlink_* e da exclusão).
  select person_id into v_person from public.chat_link_codes where code_hash = v_code_hash and channel = p_channel;
  if v_person is not null then
    perform pg_advisory_xact_lock(hashtext('chat:p:' || v_person::text));
  end if;
  select * into v_c from public.chat_link_codes
   where code_hash = v_code_hash and channel = p_channel and expires_at > now() for update;
  if not found or v_c.person_id is distinct from v_person then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, null, 'codigo_invalido');
    return jsonb_build_object('result', 'codigo_invalido');
  end if;

  -- T2: quem escreve já está ligado a outra pessoa. Não passa sozinho a quem mandou o código: desliga antes, pela própria conversa.
  if exists (select 1 from public.chat_links where sender_hash = p_sender_hash and person_id <> v_c.person_id) then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, null, 'ja_ligado');
    return jsonb_build_object('result', 'ja_ligado');
  end if;

  -- Ainda anota no espaço do código (pode ter saído da Família depois de gerar o código).
  perform public.clarevo_chat_as(v_c.person_id);
  -- D-113a: um código do espaço Negócio não liga (create_*_code já recusa; aqui, por garantia, como quem perdeu a escrita).
  v_ok := public.context_permission(v_c.context_id, 'write') and not public.clarevo_is_business(v_c.context_id);
  perform public.clarevo_chat_as(null, v_claims, v_sub);
  if not v_ok then
    delete from public.chat_link_codes where person_id = v_c.person_id and channel = p_channel;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_c.person_id, 'sem_permissao');
    return jsonb_build_object('result', 'sem_permissao', 'space', public.clarevo_chat_space(v_c.context_id));
  end if;

  insert into public.chat_links as l (person_id, channel, sender_hash, context_id)
  values (v_c.person_id, p_channel, p_sender_hash, v_c.context_id)
  on conflict (person_id, channel) do update set sender_hash = excluded.sender_hash, context_id = excluded.context_id, linked_at = now();
  delete from public.chat_link_codes where person_id = v_c.person_id and channel = p_channel;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_c.person_id, p_channel || ':' || md5(p_message_id), 'ligar_' || p_channel, v_c.context_id,
          md5(jsonb_build_array('ligar_' || p_channel, p_message_id)::text), null, null, null);
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_c.person_id, 'ligado');
  return jsonb_build_object('result', 'ligado', 'space', public.clarevo_chat_space(v_c.context_id),
                            'name', (select nullif(p.display_name, '') from public.persons p where p.id = v_c.person_id))
         || case when public.clarevo_own_business(v_c.person_id) is not null then jsonb_build_object('negocio', true) else '{}'::jsonb end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. As funções do servidor, duas por canal (só a chave de serviço executa): os mesmos argumentos de *_add_record e *_add_card_purchase.
-- ---------------------------------------------------------------------------
create or replace function public.telegram_add_business_record(
  p_message_id text, p_sender_hash text, p_sent_at timestamptz, p_kind public.record_kind, p_amount_cents bigint, p_days_ago integer,
  p_occurred_on date, p_description text, p_category text default null
)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_add_record('telegram', p_message_id, p_sender_hash, p_sent_at, p_kind, p_amount_cents, p_days_ago,
                                        p_occurred_on, p_description, p_category, true);
$$;

create or replace function public.telegram_add_business_card_purchase(
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
                                               p_description, p_category, p_card_hint, true);
$$;

create or replace function public.whatsapp_add_business_record(
  p_message_id text, p_phone_hash text, p_sent_at timestamptz, p_kind public.record_kind, p_amount_cents bigint, p_days_ago integer,
  p_occurred_on date, p_description text, p_category text default null
)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_add_record('whatsapp', p_message_id, p_phone_hash, p_sent_at, p_kind, p_amount_cents, p_days_ago,
                                        p_occurred_on, p_description, p_category, true);
$$;

create or replace function public.whatsapp_add_business_card_purchase(
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
                                               p_description, p_category, p_card_hint, true);
$$;

-- ---------------------------------------------------------------------------
-- 7. Privilégios: as internas, ninguém de fora; as quatro do servidor, só service_role. clarevo_chat_note e clarevo_chat_link, recriadas
-- com o mesmo nome e os mesmos argumentos, mantêm os privilégios que tinham (nenhum de fora).
-- ---------------------------------------------------------------------------
revoke all on function public.clarevo_own_business(uuid) from public, anon, authenticated;
revoke all on function public.clarevo_own_business_locked(uuid) from public, anon, authenticated;
revoke all on function public.clarevo_chat_add_record(text, text, text, timestamptz, public.record_kind, bigint, integer, date, text, text, boolean) from public, anon, authenticated;
revoke all on function public.clarevo_chat_add_card_purchase(text, text, text, timestamptz, bigint, integer, date, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.telegram_add_business_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text) from public, anon, authenticated;
revoke all on function public.telegram_add_business_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_add_business_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_add_business_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text) from public, anon, authenticated;
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['clarevo_own_business(uuid)', 'clarevo_own_business_locked(uuid)',
                             'clarevo_chat_add_record(text, text, text, timestamptz, public.record_kind, bigint, integer, date, text, text, boolean)',
                             'clarevo_chat_add_card_purchase(text, text, text, timestamptz, bigint, integer, date, text, text, text, boolean)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
    foreach f in array array['telegram_add_business_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text)',
                             'telegram_add_business_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text)',
                             'whatsapp_add_business_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text)',
                             'whatsapp_add_business_card_purchase(text, text, timestamptz, bigint, integer, date, text, text, text)'] loop
      execute format('grant execute on function public.%s to service_role', f);
    end loop;
  end if;
end $$;
