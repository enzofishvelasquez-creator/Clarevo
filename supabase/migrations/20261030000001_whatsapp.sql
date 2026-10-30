-- Clarevo · migração 0020 · Anotar pelo WhatsApp, fase 1: só mensagens escritas (D-076). Depois de 20261029000001_reforcos.sql.
-- A pessoa liga o próprio número no app (Conta, WhatsApp) com um código e passa a anotar gastos e recebimentos mandando mensagens
-- como "mercado 52,30" para o número da Clarevo. A função do servidor (supabase/functions/whatsapp, Edge Function do Supabase) recebe a
-- mensagem da Meta, lê o texto com as regras de packages/core/src/whatsapp (sem IA) e chama as funções whatsapp_* abaixo, com a chave de
-- serviço, que só existe no servidor. Sem custo: a Clarevo só responde à mensagem que a pessoa mandou (janela de atendimento que a Meta
-- não cobra) e nunca inicia conversa nem usa mensagem de modelo.
--
-- Invariantes:
-- W1. Nada da mensagem fica guardado: nem o texto, nem o número. Do número fica só o resumo SHA-256 (64 hexadecimais, calculado no
--     servidor); da mensagem, só o identificador da Meta (para não anotar duas vezes a mesma entrega), o resumo do número, a pessoa, o
--     resultado e o registro anotado, por 30 dias (whatsapp_messages). Do código de ligar, só o SHA-256.
-- W2. Um número por pessoa e uma pessoa por número (whatsapp_links): ligar de novo troca o número ou o espaço; o número que passa a
--     outra pessoa sai da anterior (quem mandou o código pelo número prova as duas pontas).
-- W3. O código de ligar (create_whatsapp_code) tem 8 símbolos de um alfabeto de 32 (sem I, O, 0 e 1), vale 15 minutos, serve uma vez e é
--     um por pessoa (gerar outro substitui o anterior). Exige anotar no espaço escolhido (context_permission write). Cinco códigos errados
--     em uma hora pelo mesmo número travam as tentativas desse número por uma hora (muitas_tentativas).
-- W4. Anotar e desfazer pelo WhatsApp passam pelas MESMAS funções do app (create_record e delete_record), em nome da pessoa ligada: a
--     função define a sessão como a da pessoa só dentro da transação (request.jwt.claims) e devolve a anterior. Permissão, validação,
--     idempotência (chave whatsapp:<md5 do identificador>), operação em record_operations, conta excluída e atividade são as de sempre.
--     A conta de origem é a principal do espaço ligado. Desfazer vale só para a última anotação feita pelo WhatsApp, nas últimas 24 horas.
-- W5. A mesma entrega repetida pela Meta (mesmo identificador) não grava nada e devolve {result: 'repetida'} (o servidor não responde).
--     Mais de 30 mensagens em 10 minutos pelo mesmo número: muitas_mensagens, sem anotar.
-- W6. As funções whatsapp_link, whatsapp_add_record, whatsapp_undo e whatsapp_unlink só são executáveis pela chave de serviço
--     (service_role); nem anon, nem authenticated. As do app (create_whatsapp_code, unlink_whatsapp e my_whatsapp) só por authenticated.
--     As internas clarevo_whatsapp_* por ninguém (como toda clarevo_*, 0019). As três tabelas têm RLS e nenhuma leitura direta pelo app.
-- W7. Gerar código, ligar e desligar ficam em record_operations sem alvo e NÃO contam como anotação na atividade (D-030); anotar e
--     desfazer contam, como no app (são criar e excluir).
-- W8. Exclusão da conta (D-058): clarevo_erase_person apaga o vínculo, o código e as mensagens da pessoa (a mesma função da 0019, com
--     três linhas a mais). As chaves para persons e financial_contexts também têm cascata.
--
-- Esta migração cria três tabelas, quatro funções internas, três funções do app e quatro do servidor; recria clarevo_track_activity e
-- clarevo_erase_person (só com as linhas novas) e as listas de ações de record_operations. Privilégios no fim, só do que é novo.
-- Aplicar no SQL Editor depois da 0019 (docs/05, passo 12j). Testes em supabase/tests/99x_whatsapp.sql e no npm run test:api.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.whatsapp_links (
  person_id uuid primary key references public.persons (id) on delete cascade,
  phone_hash text not null unique check (phone_hash ~ '^[0-9a-f]{64}$'),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index whatsapp_links_context_id_fk_idx on public.whatsapp_links (context_id);
comment on table public.whatsapp_links is
  'Número de WhatsApp ligado a cada pessoa (D-076): só o resumo SHA-256 do número e o espaço em que as mensagens anotam. Um número por '
  'pessoa e uma pessoa por número. Escrita só pelas funções whatsapp_link, whatsapp_unlink e unlink_whatsapp; o app lê por my_whatsapp.';

create table public.whatsapp_link_codes (
  person_id uuid primary key references public.persons (id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index whatsapp_link_codes_context_id_fk_idx on public.whatsapp_link_codes (context_id);
comment on table public.whatsapp_link_codes is
  'Código de ligar o WhatsApp (D-076): um por pessoa, só o SHA-256, 15 minutos, uso único. Escrita só por create_whatsapp_code, '
  'whatsapp_link e as funções de desligar.';

create table public.whatsapp_messages (
  message_id text primary key check (char_length(message_id) between 1 and 200),
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  person_id uuid references public.persons (id) on delete cascade,
  outcome text not null check (outcome in (
    'ligado', 'anotado', 'desfeito', 'desligado', 'nao_ligado', 'codigo_invalido', 'muitas_tentativas', 'muitas_mensagens',
    'nada_para_desfazer', 'sem_permissao', 'sem_conta', 'data_futura', 'valor_invalido', 'valor_acima_do_limite', 'descricao_invalida')),
  record_id uuid references public.financial_records (id) on delete set null,
  undone_at timestamptz,
  received_at timestamptz not null default now()
);
create index whatsapp_messages_person_id_fk_idx on public.whatsapp_messages (person_id, received_at);
create index whatsapp_messages_record_id_fk_idx on public.whatsapp_messages (record_id);
create index whatsapp_messages_phone_idx on public.whatsapp_messages (phone_hash, received_at);
create index whatsapp_messages_received_idx on public.whatsapp_messages (received_at);
comment on table public.whatsapp_messages is
  'Mensagens do WhatsApp já tratadas (D-076), por 30 dias: o identificador da Meta (repetição), o resumo do número, a pessoa, o resultado '
  'e o registro anotado (para desfazer). Nunca o texto nem o número. Escrita só pelas funções whatsapp_*.';

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (a da 0018) mais as três ações novas, sem alvo (o espaço está em context_id).
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
  'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp'));
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
                 'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido',
                 'responder_origem_cadastro', 'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Atividade: mesma função da 0018, sem contar também as três ações novas (W7: ligar e desligar não é anotar).
-- ---------------------------------------------------------------------------
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
                    'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
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

-- ---------------------------------------------------------------------------
-- Internas (sem execute para ninguém)
-- ---------------------------------------------------------------------------

-- O espaço como as respostas mostram: {kind: 'pessoal' | 'familia', name}.
create or replace function public.clarevo_whatsapp_space(p_context uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object('kind', c.kind, 'name', c.name) from public.financial_contexts c where c.id = p_context;
$$;

-- O registro como as respostas mostram, com o nome da conta de origem.
create or replace function public.clarevo_whatsapp_record(p_record uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object('kind', r.kind, 'amount_cents', r.amount_cents, 'occurred_on', r.occurred_on, 'description', r.description,
                            'category', r.category, 'account_name', a.name)
    from public.financial_records r join public.financial_accounts a on a.id = r.account_id
   where r.id = p_record;
$$;

-- W4: a sessão passa a ser a da pessoa (p_person) só dentro da transação; com p_person nulo, volta ao que estava (p_claims, p_sub).
create or replace function public.clarevo_whatsapp_as(p_person uuid, p_claims text default '', p_sub text default '')
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  if p_person is null then
    perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  else
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_person, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_person::text, true);
  end if;
end;
$$;

-- W1 e W5: guarda a mensagem tratada e apaga as de mais de 30 dias.
create or replace function public.clarevo_whatsapp_log(
  p_message_id text, p_phone_hash text, p_person uuid, p_outcome text, p_record uuid default null
)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  delete from public.whatsapp_messages where received_at < now() - interval '30 days';
  insert into public.whatsapp_messages (message_id, phone_hash, person_id, outcome, record_id)
  values (p_message_id, p_phone_hash, p_person, p_outcome, p_record);
end;
$$;

-- Estado para o app: {linked, context_id, linked_at, code_context_id, code_expires_at} (código só enquanto vale).
create or replace function public.clarevo_whatsapp_state(p_person uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'linked', l.person_id is not null,
    'context_id', l.context_id,
    'linked_at', l.linked_at,
    'code_context_id', c.context_id,
    'code_expires_at', c.expires_at)
    from (select p_person as id) p
    left join public.whatsapp_links l on l.person_id = p.id
    left join public.whatsapp_link_codes c on c.person_id = p.id and c.expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- App (authenticated)
-- ---------------------------------------------------------------------------

-- Estado do WhatsApp da própria pessoa (só leitura).
create or replace function public.my_whatsapp()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  return public.clarevo_whatsapp_state(v_uid);
end;
$$;

-- Gerar o código de ligar (W3). Ordem: sessão; chave; trava da chave; repetição (chave_reutilizada se a ação ou o pedido mudam; a
-- repetição certa devolve o código nulo, porque só o resumo fica guardado: quem perdeu a resposta gera outro); sem_permissao (anotar no
-- espaço); trava da pessoa; código novo no lugar do anterior; operação (recusa conta excluída). Retorno: {code, expires_at, context_id}.
create or replace function public.create_whatsapp_code(p_context_id uuid, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_op public.record_operations%rowtype;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
  v_expires timestamptz := now() + interval '15 minutes';
  i integer;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('gerar_codigo_whatsapp', p_context_id)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'gerar_codigo_whatsapp' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return jsonb_build_object('code', null, 'context_id', v_op.context_id,
                              'expires_at', (select c.expires_at from public.whatsapp_link_codes c where c.person_id = v_uid));
  end if;

  if p_context_id is null or not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('whatsapp:p:' || v_uid::text));

  -- 8 bytes aleatórios, cada um em um dos 32 símbolos (256 é múltiplo de 32: sem viés).
  v_bytes := gen_random_bytes(8);
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  insert into public.whatsapp_link_codes as c (person_id, code_hash, context_id, expires_at)
  values (v_uid, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), p_context_id, v_expires)
  on conflict (person_id) do update
    set code_hash = excluded.code_hash, context_id = excluded.context_id, expires_at = excluded.expires_at, created_at = now();

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'gerar_codigo_whatsapp', p_context_id, v_hash, null, null, null);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires, 'context_id', p_context_id);
end;
$$;

-- Desligar pelo app: apaga o vínculo e o código. Ordem: sessão; chave; trava da chave; repetição (devolve o estado atual);
-- sem_permissao (a pessoa precisa ter o Pessoal, onde a operação fica); trava da pessoa; apagar; operação. Retorno: o estado de my_whatsapp.
create or replace function public.unlink_whatsapp(p_key text)
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
  v_hash := md5(jsonb_build_array('desligar_whatsapp')::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'desligar_whatsapp' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return public.clarevo_whatsapp_state(v_uid);
  end if;

  select c.id into v_ctx from public.financial_contexts c
    join public.persons p on p.id = c.owner_person_id and p.deleted_at is null
   where c.owner_person_id = v_uid and c.kind = 'pessoal';
  if v_ctx is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('whatsapp:p:' || v_uid::text));
  delete from public.whatsapp_links where person_id = v_uid;
  delete from public.whatsapp_link_codes where person_id = v_uid;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'desligar_whatsapp', v_ctx, v_hash, null, null, null);

  return public.clarevo_whatsapp_state(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Servidor (só service_role). Todas: trava do número; repetição (W5); formato do identificador e do resumo (22023, o servidor manda
-- sempre certo). Os casos esperados voltam em {result}; só falha inesperada vira erro (o servidor devolve 500 e a Meta entrega de novo).
-- ---------------------------------------------------------------------------

-- Ligar o número com o código. Retorno: {result: ligado | codigo_invalido | muitas_tentativas | sem_permissao, space?}.
create or replace function public.whatsapp_link(p_message_id text, p_phone_hash text, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]+', '', 'g'));
  v_code_hash text;
  v_person uuid;
  v_c public.whatsapp_link_codes%rowtype;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_ok boolean;
begin
  if p_message_id is null or char_length(p_message_id) not between 1 and 200 or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'mensagem_invalida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('whatsapp:' || p_phone_hash));
  if exists (select 1 from public.whatsapp_messages where message_id = p_message_id) then
    return jsonb_build_object('result', 'repetida');
  end if;

  if (select count(*) from public.whatsapp_messages
       where phone_hash = p_phone_hash and outcome = 'codigo_invalido' and received_at > now() - interval '1 hour') >= 5 then
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, null, 'muitas_tentativas');
    return jsonb_build_object('result', 'muitas_tentativas');
  end if;

  v_code_hash := encode(sha256(convert_to(v_code, 'UTF8')), 'hex');
  -- A trava da pessoa vem antes da trava da linha do código (mesma ordem de create_whatsapp_code e unlink_whatsapp).
  select person_id into v_person from public.whatsapp_link_codes where code_hash = v_code_hash;
  if v_person is not null then
    perform pg_advisory_xact_lock(hashtext('whatsapp:p:' || v_person::text));
  end if;
  select * into v_c from public.whatsapp_link_codes where code_hash = v_code_hash and expires_at > now() for update;
  if not found or v_c.person_id is distinct from v_person then
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, null, 'codigo_invalido');
    return jsonb_build_object('result', 'codigo_invalido');
  end if;

  -- Ainda anota no espaço do código (pode ter saído da Família depois de gerar o código).
  perform public.clarevo_whatsapp_as(v_c.person_id);
  v_ok := public.context_permission(v_c.context_id, 'write');
  perform public.clarevo_whatsapp_as(null, v_claims, v_sub);
  if not v_ok then
    delete from public.whatsapp_link_codes where person_id = v_c.person_id;
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, v_c.person_id, 'sem_permissao');
    return jsonb_build_object('result', 'sem_permissao', 'space', public.clarevo_whatsapp_space(v_c.context_id));
  end if;

  delete from public.whatsapp_links where phone_hash = p_phone_hash and person_id <> v_c.person_id;
  insert into public.whatsapp_links as l (person_id, phone_hash, context_id)
  values (v_c.person_id, p_phone_hash, v_c.context_id)
  on conflict (person_id) do update set phone_hash = excluded.phone_hash, context_id = excluded.context_id, linked_at = now();
  delete from public.whatsapp_link_codes where person_id = v_c.person_id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_c.person_id, 'whatsapp:' || md5(p_message_id), 'ligar_whatsapp', v_c.context_id,
          md5(jsonb_build_array('ligar_whatsapp', p_message_id)::text), null, null, null);
  perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, v_c.person_id, 'ligado');
  return jsonb_build_object('result', 'ligado', 'space', public.clarevo_whatsapp_space(v_c.context_id));
end;
$$;

-- Anotar um gasto ou recebimento (W4) pela create_record, na conta de origem principal do espaço ligado.
-- Retorno: {result: anotado | nao_ligado | muitas_mensagens | sem_conta | sem_permissao | data_futura | valor_invalido |
-- valor_acima_do_limite | descricao_invalida, space?, record?}.
create or replace function public.whatsapp_add_record(
  p_message_id text, p_phone_hash text, p_kind public.record_kind, p_amount_cents bigint, p_occurred_on date, p_description text,
  p_category text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_link public.whatsapp_links%rowtype;
  v_account uuid;
  v_record public.financial_records%rowtype;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_error text;
  v_result text;
begin
  if p_message_id is null or char_length(p_message_id) not between 1 and 200 or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'mensagem_invalida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('whatsapp:' || p_phone_hash));
  if exists (select 1 from public.whatsapp_messages where message_id = p_message_id) then
    return jsonb_build_object('result', 'repetida');
  end if;

  select * into v_link from public.whatsapp_links where phone_hash = p_phone_hash;
  if not found then
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, null, 'nao_ligado');
    return jsonb_build_object('result', 'nao_ligado');
  end if;
  if (select count(*) from public.whatsapp_messages
       where phone_hash = p_phone_hash and received_at > now() - interval '10 minutes') >= 30 then
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, v_link.person_id, 'muitas_mensagens');
    return jsonb_build_object('result', 'muitas_mensagens');
  end if;

  select a.id into v_account from public.financial_accounts a
   where a.context_id = v_link.context_id and a.is_default and a.deleted_at is null;
  if v_account is null then
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, v_link.person_id, 'sem_conta');
    return jsonb_build_object('result', 'sem_conta', 'space', public.clarevo_whatsapp_space(v_link.context_id));
  end if;

  begin
    perform public.clarevo_whatsapp_as(v_link.person_id);
    v_record := public.create_record('whatsapp:' || md5(p_message_id), v_link.context_id, v_account, p_kind, p_amount_cents,
                                     p_occurred_on, p_description, p_category, null);
    perform public.clarevo_whatsapp_as(null, v_claims, v_sub);
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
    end;
    if v_result is null then
      raise;
    end if;
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, v_link.person_id, v_result);
    return jsonb_build_object('result', v_result, 'space', public.clarevo_whatsapp_space(v_link.context_id));
  end;

  perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, v_link.person_id, 'anotado', v_record.id);
  return jsonb_build_object('result', 'anotado', 'space', public.clarevo_whatsapp_space(v_link.context_id),
                            'record', public.clarevo_whatsapp_record(v_record.id));
end;
$$;

-- Desfazer a última anotação feita pelo WhatsApp nas últimas 24 horas (W4), pela delete_record.
-- Retorno: {result: desfeito | nada_para_desfazer | nao_ligado | sem_permissao, space?, record?}.
create or replace function public.whatsapp_undo(p_message_id text, p_phone_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_link public.whatsapp_links%rowtype;
  v_msg public.whatsapp_messages%rowtype;
  v_record public.financial_records%rowtype;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_error text;
begin
  if p_message_id is null or char_length(p_message_id) not between 1 and 200 or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'mensagem_invalida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('whatsapp:' || p_phone_hash));
  if exists (select 1 from public.whatsapp_messages where message_id = p_message_id) then
    return jsonb_build_object('result', 'repetida');
  end if;

  select * into v_link from public.whatsapp_links where phone_hash = p_phone_hash;
  if not found then
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, null, 'nao_ligado');
    return jsonb_build_object('result', 'nao_ligado');
  end if;

  select m.* into v_msg from public.whatsapp_messages m
    join public.financial_records r on r.id = m.record_id and r.deleted_at is null
   where m.person_id = v_link.person_id and m.outcome = 'anotado' and m.undone_at is null
     and m.received_at > now() - interval '24 hours'
   order by m.received_at desc, m.message_id desc
   limit 1
   for update of m;
  if not found then
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, v_link.person_id, 'nada_para_desfazer');
    return jsonb_build_object('result', 'nada_para_desfazer');
  end if;

  -- A versão é lida com a linha travada: uma edição no app ao mesmo tempo espera aqui.
  select * into v_record from public.financial_records where id = v_msg.record_id for update;
  begin
    perform public.clarevo_whatsapp_as(v_link.person_id);
    perform public.delete_record('whatsapp:' || md5(p_message_id), v_record.id, v_record.version);
    perform public.clarevo_whatsapp_as(null, v_claims, v_sub);
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error not in ('sem_permissao', 'nao_encontrado', 'conta_excluida') then
      raise;
    end if;
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, v_link.person_id, 'sem_permissao');
    return jsonb_build_object('result', 'sem_permissao', 'space', public.clarevo_whatsapp_space(v_record.context_id));
  end;

  update public.whatsapp_messages set undone_at = now() where message_id = v_msg.message_id;
  perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, v_link.person_id, 'desfeito', v_record.id);
  return jsonb_build_object('result', 'desfeito', 'space', public.clarevo_whatsapp_space(v_record.context_id),
                            'record', public.clarevo_whatsapp_record(v_record.id));
end;
$$;

-- Desligar pelo próprio WhatsApp ("desligar", "parar", "sair"). Retorno: {result: desligado | nao_ligado}.
create or replace function public.whatsapp_unlink(p_message_id text, p_phone_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_link public.whatsapp_links%rowtype;
begin
  if p_message_id is null or char_length(p_message_id) not between 1 and 200 or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'mensagem_invalida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('whatsapp:' || p_phone_hash));
  if exists (select 1 from public.whatsapp_messages where message_id = p_message_id) then
    return jsonb_build_object('result', 'repetida');
  end if;

  select * into v_link from public.whatsapp_links where phone_hash = p_phone_hash;
  if not found then
    perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, null, 'nao_ligado');
    return jsonb_build_object('result', 'nao_ligado');
  end if;
  perform pg_advisory_xact_lock(hashtext('whatsapp:p:' || v_link.person_id::text));
  delete from public.whatsapp_links where person_id = v_link.person_id and phone_hash = p_phone_hash;
  delete from public.whatsapp_link_codes where person_id = v_link.person_id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_link.person_id, 'whatsapp:' || md5(p_message_id), 'desligar_whatsapp', v_link.context_id,
          md5(jsonb_build_array('desligar_whatsapp', p_message_id)::text), null, null, null);
  perform public.clarevo_whatsapp_log(p_message_id, p_phone_hash, v_link.person_id, 'desligado');
  return jsonb_build_object('result', 'desligado');
end;
$$;

-- ---------------------------------------------------------------------------
-- Excluir a conta (W8): a mesma função da 0019, com o vínculo, o código e as mensagens da pessoa na regra 5.
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
  delete from public.whatsapp_links where person_id = p_person;
  delete from public.whatsapp_link_codes where person_id = p_person;
  delete from public.whatsapp_messages where person_id = p_person;

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
-- Privilégios, só do que é novo (W6). As tabelas ficam sem leitura e escrita direta (RLS ligada, sem política). As funções recriadas
-- acima mantêm os privilégios que tinham. O papel service_role pode não existir num Postgres comum, por isso a conferência em pg_roles.
-- ---------------------------------------------------------------------------
alter table public.whatsapp_links enable row level security;
alter table public.whatsapp_link_codes enable row level security;
alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_links, public.whatsapp_link_codes, public.whatsapp_messages from anon, authenticated;

revoke all on function public.clarevo_whatsapp_space(uuid) from public, anon, authenticated;
revoke all on function public.clarevo_whatsapp_record(uuid) from public, anon, authenticated;
revoke all on function public.clarevo_whatsapp_as(uuid, text, text) from public, anon, authenticated;
revoke all on function public.clarevo_whatsapp_log(text, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.clarevo_whatsapp_state(uuid) from public, anon, authenticated;
revoke all on function public.my_whatsapp() from public, anon, authenticated;
revoke all on function public.create_whatsapp_code(uuid, text) from public, anon, authenticated;
revoke all on function public.unlink_whatsapp(text) from public, anon, authenticated;
revoke all on function public.whatsapp_link(text, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_add_record(text, text, public.record_kind, bigint, date, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_undo(text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_unlink(text, text) from public, anon, authenticated;
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.whatsapp_links, public.whatsapp_link_codes, public.whatsapp_messages from service_role';
    foreach f in array array['clarevo_whatsapp_space(uuid)', 'clarevo_whatsapp_record(uuid)', 'clarevo_whatsapp_as(uuid, text, text)',
                             'clarevo_whatsapp_log(text, text, uuid, text, uuid)', 'clarevo_whatsapp_state(uuid)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
    foreach f in array array['whatsapp_link(text, text, text)',
                             'whatsapp_add_record(text, text, public.record_kind, bigint, date, text, text)',
                             'whatsapp_undo(text, text)', 'whatsapp_unlink(text, text)'] loop
      execute format('grant execute on function public.%s to service_role', f);
    end loop;
  end if;
end $$;

grant execute on function public.my_whatsapp() to authenticated;
grant execute on function public.create_whatsapp_code(uuid, text) to authenticated;
grant execute on function public.unlink_whatsapp(text) to authenticated;
