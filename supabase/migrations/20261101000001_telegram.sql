-- Clarevo · migração 0022 · Anotar pelo Telegram (D-080). Depois de 20261030000002_metas_imagem.sql.
-- O Telegram entra como um segundo canal de mensagens, com as mesmas regras do WhatsApp (D-076, migração 0020): a pessoa liga a própria
-- conta do Telegram no app (Conta, Telegram) com um código e passa a anotar mandando "mercado 52,30" para o bot da Clarevo. A função do
-- servidor (supabase/functions/telegram) recebe a mensagem do Telegram, lê o texto com as mesmas regras (packages/core/src/whatsapp, sem
-- IA) e chama as funções telegram_* abaixo, com a chave de serviço. Sem custo: a API de bots do Telegram é gratuita, e a Clarevo só
-- responde à mensagem que a pessoa mandou, nunca inicia conversa.
--
-- As três tabelas da 0020 passam a ser dos dois canais (chat_links, chat_link_codes e chat_messages, com o canal em cada linha), e as
-- regras ficam uma vez só, nas funções internas clarevo_chat_*, com o canal como parâmetro. As funções de cada canal (whatsapp_* e
-- telegram_*, do servidor; my_*, create_*_code e unlink_*, do app) só passam o canal adiante: as do WhatsApp mantêm os mesmos nomes,
-- argumentos e respostas da 0020, então a função do WhatsApp já publicada segue funcionando sem mudança.
--
-- Invariantes (as W1 a W8 da 0020 valem para os dois canais, com "número" lido como "quem escreve"):
-- T1. Do Telegram fica só o resumo HMAC-SHA256 do identificador da pessoa no Telegram, feito com uma chave que só a função do servidor
--     conhece (TELEGRAM_ID_KEY), em sender_hash, o mesmo campo do resumo do número do WhatsApp. Nunca o nome, o @ nem o texto. O
--     identificador da mensagem guardado é 'telegram:<conversa>:<mensagem>'; o do WhatsApp nunca começa por 'telegram:' (mensagem_invalida).
-- T2. Um vínculo por pessoa e canal (chave person_id, channel) e um canal por resumo (sender_hash único): ligar o Telegram não desliga o
--     WhatsApp, e vice-versa.
-- T3. O código de ligar é por pessoa e canal e só vale no canal em que foi gerado: o código do WhatsApp mandado ao Telegram é
--     codigo_invalido. Gerar outro código só substitui o do mesmo canal.
-- T4. DESFAZER desfaz a última anotação feita pelo mesmo canal; DESLIGAR e o desligar do app desligam só o canal deles.
-- T5. As funções telegram_* só são executáveis pela chave de serviço; my_telegram, create_telegram_code e unlink_telegram só por
--     authenticated; as internas clarevo_chat_* por ninguém (como toda clarevo_*).
-- T6. Gerar código, ligar e desligar o Telegram ('gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram') ficam em
--     record_operations sem alvo e não contam como anotação; anotar e desfazer são criar e excluir, como no app.
-- T7. Exclusão da conta (D-058): clarevo_erase_person toma a trava das mensagens da pessoa ('chat:p:') antes da linha dela e apaga os
--     vínculos, os códigos e as mensagens dos dois canais.
--
-- Esta migração renomeia as três tabelas e quatro funções internas da 0020, cria o canal, recria as funções da 0020 em cima das internas
-- novas, cria as seis do Telegram e recria clarevo_track_activity, clarevo_erase_person e as listas de ações de record_operations.
-- Aplicar no SQL Editor depois da 0021 (docs/05, passo 12l). Testes em supabase/tests/99x_whatsapp.sql e 99z_telegram.sql.

-- ---------------------------------------------------------------------------
-- Tabelas: as da 0020, agora dos dois canais. As linhas que já existem são do WhatsApp.
-- ---------------------------------------------------------------------------
alter table public.whatsapp_links rename to chat_links;
alter table public.whatsapp_link_codes rename to chat_link_codes;
alter table public.whatsapp_messages rename to chat_messages;
alter table public.chat_links rename column phone_hash to sender_hash;
alter table public.chat_messages rename column phone_hash to sender_hash;

alter table public.chat_links add column channel text not null default 'whatsapp' check (channel in ('whatsapp', 'telegram'));
alter table public.chat_links alter column channel drop default;
alter table public.chat_links drop constraint whatsapp_links_pkey;
alter table public.chat_links add constraint chat_links_pkey primary key (person_id, channel);

alter table public.chat_link_codes add column channel text not null default 'whatsapp' check (channel in ('whatsapp', 'telegram'));
alter table public.chat_link_codes alter column channel drop default;
alter table public.chat_link_codes drop constraint whatsapp_link_codes_pkey;
alter table public.chat_link_codes add constraint chat_link_codes_pkey primary key (person_id, channel);

alter table public.chat_messages add column channel text not null default 'whatsapp' check (channel in ('whatsapp', 'telegram'));
alter table public.chat_messages alter column channel drop default;
alter table public.chat_messages add constraint chat_messages_id_channel_check check ((channel = 'telegram') = (message_id like 'telegram:%'));

-- Os nomes das restrições e dos índices acompanham as tabelas (whatsapp_links_phone_hash_key → chat_links_sender_hash_key).
do $$
declare
  r record;
begin
  for r in select c.conrelid::regclass::text as tbl, c.conname from pg_constraint c
            where c.conrelid in ('public.chat_links'::regclass, 'public.chat_link_codes'::regclass, 'public.chat_messages'::regclass)
              and c.conname like 'whatsapp\_%' loop
    execute format('alter table %s rename constraint %I to %I', r.tbl, r.conname,
                   replace(replace(r.conname, 'whatsapp_', 'chat_'), 'phone_hash', 'sender_hash'));
  end loop;
  for r in select i.relname from pg_index x join pg_class i on i.oid = x.indexrelid
            where x.indrelid in ('public.chat_links'::regclass, 'public.chat_link_codes'::regclass, 'public.chat_messages'::regclass)
              and i.relname like 'whatsapp\_%' loop
    execute format('alter index public.%I rename to %I', r.relname, replace(replace(r.relname, 'whatsapp_', 'chat_'), 'phone_', 'sender_'));
  end loop;
end $$;

comment on table public.chat_links is
  'Conta de mensagens ligada a cada pessoa (D-076 e D-080), por canal (WhatsApp ou Telegram): só o resumo HMAC-SHA256 de quem escreve '
  '(o número do WhatsApp ou o identificador do Telegram) e o espaço em que as mensagens anotam. Um vínculo por pessoa e canal, e um '
  'resumo por vínculo. Escrita só pelas funções *_link, *_unlink e unlink_* de cada canal; o app lê por my_whatsapp e my_telegram.';
comment on table public.chat_link_codes is
  'Código de ligar uma conta de mensagens (D-076 e D-080): um por pessoa e canal, só o SHA-256, 15 minutos, uso único, válido só no '
  'canal em que foi gerado. Escrita só por create_*_code, *_link e as funções de desligar.';
comment on table public.chat_messages is
  'Mensagens já tratadas (D-076 e D-080), por 30 dias: o canal, o identificador da mensagem (repetição), o resumo de quem escreveu, a '
  'pessoa, o resultado e o registro anotado (para desfazer). Nunca o texto, o número nem o identificador do Telegram. Escrita só pelas '
  'funções do servidor de cada canal.';

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (a da 0021) mais as três ações do Telegram, sem alvo (o espaço está em context_id).
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
  'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram'));
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
                 'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Atividade: mesma função da 0021, sem contar também as três ações do Telegram (T6).
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
                    'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp', 'imagem_meta',
                    'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram',
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
-- Internas (sem execute para ninguém). As que não dependem do canal só mudam de nome; as outras são recriadas com o canal.
-- ---------------------------------------------------------------------------
alter function public.clarevo_whatsapp_space(uuid) rename to clarevo_chat_space;
alter function public.clarevo_whatsapp_record(uuid) rename to clarevo_chat_record;
alter function public.clarevo_whatsapp_as(uuid, text, text) rename to clarevo_chat_as;
alter function public.clarevo_whatsapp_day(uuid, timestamptz) rename to clarevo_chat_day;
drop function public.clarevo_whatsapp_log(text, text, uuid, text, uuid);
drop function public.clarevo_whatsapp_state(uuid);
drop function public.clarevo_whatsapp_gate(text, text);
drop function public.clarevo_whatsapp_link_locked(text);

-- O canal tem de ser um dos dois (as funções de cada canal mandam sempre certo).
create or replace function public.clarevo_chat_check_channel(p_channel text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_channel is null or p_channel not in ('whatsapp', 'telegram') then
    raise exception 'canal_invalido' using errcode = '22023';
  end if;
end;
$$;

-- Guarda a mensagem tratada e apaga as de mais de 30 dias (W1, W5).
create or replace function public.clarevo_chat_log(
  p_channel text, p_message_id text, p_sender_hash text, p_person uuid, p_outcome text, p_record uuid default null
)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  delete from public.chat_messages where received_at < now() - interval '30 days';
  insert into public.chat_messages (channel, message_id, sender_hash, person_id, outcome, record_id)
  values (p_channel, p_message_id, p_sender_hash, p_person, p_outcome, p_record);
end;
$$;

-- Estado para o app, por canal: {linked, context_id, linked_at, code_context_id, code_expires_at} (código só enquanto vale).
create or replace function public.clarevo_chat_state(p_person uuid, p_channel text)
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
    left join public.chat_links l on l.person_id = p.id and l.channel = p_channel
    left join public.chat_link_codes c on c.person_id = p.id and c.channel = p_channel and c.expires_at > now();
$$;

-- A porta de todas as funções do servidor (W5): formato (22023: o servidor manda sempre certo; o identificador do Telegram começa por
-- 'telegram:' e o do WhatsApp nunca), trava de quem escreve, repetição e excesso de mensagens. Devolve o resultado quando a mensagem
-- para aqui (repetida; muitas_mensagens na primeira vez que passa de 30 em 10 minutos; silencio nas seguintes), ou null para seguir.
create or replace function public.clarevo_chat_gate(p_channel text, p_message_id text, p_sender_hash text)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_last text;
begin
  perform public.clarevo_chat_check_channel(p_channel);
  if p_message_id is null or char_length(p_message_id) not between 1 and 200 or p_sender_hash is null or p_sender_hash !~ '^[0-9a-f]{64}$'
     or (p_channel = 'telegram') <> (p_message_id like 'telegram:%') then
    raise exception 'mensagem_invalida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('chat:' || p_sender_hash));
  if exists (select 1 from public.chat_messages where message_id = p_message_id) then
    return jsonb_build_object('result', 'repetida');
  end if;
  if (select count(*) from public.chat_messages
       where sender_hash = p_sender_hash and received_at > now() - interval '10 minutes') >= 30 then
    select outcome into v_last from public.chat_messages where sender_hash = p_sender_hash order by received_at desc, message_id desc limit 1;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, null, 'muitas_mensagens');
    return jsonb_build_object('result', case when v_last = 'muitas_mensagens' then 'silencio' else 'muitas_mensagens' end);
  end if;
  return null;
end;
$$;

-- O vínculo de quem escreve neste canal, lido de novo com a trava da pessoa (a exclusão da conta e o desligar pelo app esperam aqui).
-- null: sem vínculo.
create or replace function public.clarevo_chat_link_locked(p_channel text, p_sender_hash text)
returns public.chat_links
language plpgsql
volatile
set search_path = public
as $$
declare
  v_link public.chat_links%rowtype;
  v_person uuid;
begin
  select person_id into v_person from public.chat_links where sender_hash = p_sender_hash and channel = p_channel;
  if v_person is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('chat:p:' || v_person::text));
  select * into v_link from public.chat_links where sender_hash = p_sender_hash and channel = p_channel and person_id = v_person;
  if not found then
    return null;
  end if;
  return v_link;
end;
$$;

-- Gerar o código de ligar (W3, T3), do app. Ordem: sessão; chave; trava da chave; repetição (chave_reutilizada se a ação ou o pedido
-- mudam; a repetição certa devolve o código nulo, porque só o resumo fica guardado: quem perdeu a resposta gera outro); sem_permissao
-- (anotar no espaço); trava da pessoa; código novo no lugar do anterior do mesmo canal; operação (recusa conta excluída).
-- Retorno: {code, expires_at, context_id}.
create or replace function public.clarevo_chat_create_code(p_channel text, p_context_id uuid, p_key text)
returns jsonb
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := 'gerar_codigo_' || p_channel;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
  v_expires timestamptz := now() + interval '15 minutes';
  i integer;
begin
  perform public.clarevo_chat_check_channel(p_channel);
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array(v_action, p_context_id)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> v_action or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return jsonb_build_object('code', null, 'context_id', v_op.context_id,
                              'expires_at', (select c.expires_at from public.chat_link_codes c where c.person_id = v_uid and c.channel = p_channel));
  end if;

  if p_context_id is null or not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('chat:p:' || v_uid::text));

  -- 8 bytes aleatórios, cada um em um dos 32 símbolos (256 é múltiplo de 32: sem viés).
  v_bytes := gen_random_bytes(8);
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  insert into public.chat_link_codes as c (person_id, channel, code_hash, context_id, expires_at)
  values (v_uid, p_channel, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), p_context_id, v_expires)
  on conflict (person_id, channel) do update
    set code_hash = excluded.code_hash, context_id = excluded.context_id, expires_at = excluded.expires_at, created_at = now();

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, v_action, p_context_id, v_hash, null, null, null);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires, 'context_id', p_context_id);
end;
$$;

-- Desligar pelo app (T4): apaga o vínculo e o código do canal. Ordem: sessão; chave; trava da chave; repetição (devolve o estado atual);
-- sem_permissao (a pessoa precisa ter o Pessoal, onde a operação fica); trava da pessoa; apagar; operação. Retorno: o estado do canal.
create or replace function public.clarevo_chat_unlink_app(p_channel text, p_key text)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := 'desligar_' || p_channel;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_ctx uuid;
begin
  perform public.clarevo_chat_check_channel(p_channel);
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array(v_action)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> v_action or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return public.clarevo_chat_state(v_uid, p_channel);
  end if;

  select c.id into v_ctx from public.financial_contexts c
    join public.persons p on p.id = c.owner_person_id and p.deleted_at is null
   where c.owner_person_id = v_uid and c.kind = 'pessoal';
  if v_ctx is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('chat:p:' || v_uid::text));
  delete from public.chat_links where person_id = v_uid and channel = p_channel;
  delete from public.chat_link_codes where person_id = v_uid and channel = p_channel;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, v_action, v_ctx, v_hash, null, null, null);

  return public.clarevo_chat_state(v_uid, p_channel);
end;
$$;

-- Mensagem respondida sem ir aos dados (ajuda, mídia, texto que a Clarevo não entendeu): fica registrada para a repetição e para o
-- limite de mensagens. Retorno: {result: registrada | repetida | muitas_mensagens | silencio}.
create or replace function public.clarevo_chat_note(p_channel text, p_message_id text, p_sender_hash text, p_outcome text)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_gate jsonb;
begin
  if p_outcome is null or p_outcome not in ('ajuda', 'midia', 'nao_entendi') then
    raise exception 'resultado_invalido' using errcode = '22023';
  end if;
  v_gate := public.clarevo_chat_gate(p_channel, p_message_id, p_sender_hash);
  if v_gate is not null then
    return v_gate;
  end if;
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, null, p_outcome);
  return jsonb_build_object('result', 'registrada');
end;
$$;

-- Ligar com o código do mesmo canal (T3). Retorno: {result: ligado | codigo_invalido | muitas_tentativas | sem_permissao, space?}.
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

  -- Ainda anota no espaço do código (pode ter saído da Família depois de gerar o código).
  perform public.clarevo_chat_as(v_c.person_id);
  v_ok := public.context_permission(v_c.context_id, 'write');
  perform public.clarevo_chat_as(null, v_claims, v_sub);
  if not v_ok then
    delete from public.chat_link_codes where person_id = v_c.person_id and channel = p_channel;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_c.person_id, 'sem_permissao');
    return jsonb_build_object('result', 'sem_permissao', 'space', public.clarevo_chat_space(v_c.context_id));
  end if;

  -- Quem escreve passa a esta pessoa: sai do vínculo anterior (W2), de outra pessoa.
  delete from public.chat_links where sender_hash = p_sender_hash and not (person_id = v_c.person_id and channel = p_channel);
  insert into public.chat_links as l (person_id, channel, sender_hash, context_id)
  values (v_c.person_id, p_channel, p_sender_hash, v_c.context_id)
  on conflict (person_id, channel) do update set sender_hash = excluded.sender_hash, context_id = excluded.context_id, linked_at = now();
  delete from public.chat_link_codes where person_id = v_c.person_id and channel = p_channel;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_c.person_id, p_channel || ':' || md5(p_message_id), 'ligar_' || p_channel, v_c.context_id,
          md5(jsonb_build_array('ligar_' || p_channel, p_message_id)::text), null, null, null);
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_c.person_id, 'ligado');
  return jsonb_build_object('result', 'ligado', 'space', public.clarevo_chat_space(v_c.context_id));
end;
$$;

-- Anotar um gasto ou recebimento (W4) pela create_record, na conta de origem principal do espaço ligado. A data: p_days_ago dias antes
-- do dia da pessoa no instante p_sent_at (no fuso dela), ou a data escrita (p_occurred_on); exatamente uma das duas.
-- Retorno: {result: anotado | nao_ligado | sem_conta | sem_permissao | data_futura | valor_invalido | valor_acima_do_limite |
-- descricao_invalida, space?, record?, today}.
create or replace function public.clarevo_chat_add_record(
  p_channel text, p_message_id text, p_sender_hash text, p_sent_at timestamptz, p_kind public.record_kind, p_amount_cents bigint,
  p_days_ago integer, p_occurred_on date, p_description text, p_category text
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
  v_account uuid;
  v_record public.financial_records%rowtype;
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

  select a.id into v_account from public.financial_accounts a
   where a.context_id = v_link.context_id and a.is_default and a.deleted_at is null;
  if v_account is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'sem_conta');
    return jsonb_build_object('result', 'sem_conta', 'space', public.clarevo_chat_space(v_link.context_id), 'today', v_today);
  end if;

  begin
    perform public.clarevo_chat_as(v_link.person_id);
    v_record := public.create_record(p_channel || ':' || md5(p_message_id), v_link.context_id, v_account, p_kind, p_amount_cents,
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
    end;
    if v_result is null then
      raise;
    end if;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash,
                                    case when v_result = 'nao_ligado' then null else v_link.person_id end, v_result);
    return jsonb_build_object('result', v_result, 'space', public.clarevo_chat_space(v_link.context_id), 'today', v_today);
  end;

  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'anotado', v_record.id);
  return jsonb_build_object('result', 'anotado', 'space', public.clarevo_chat_space(v_link.context_id),
                            'record', public.clarevo_chat_record(v_record.id), 'today', v_today);
end;
$$;

-- Desfazer a última anotação feita pelo mesmo canal nas últimas 24 horas (W4, T4), pela delete_record. Só entram as anotações que a
-- pessoa ainda pode apagar (dela, vivas, num espaço em que ainda anota): uma de um espaço que ela deixou não trava as outras.
-- Retorno: {result: desfeito | nada_para_desfazer | nao_ligado | sem_permissao, space?, record?, today?}.
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

  select m.* into v_msg from public.chat_messages m
    join public.financial_records r on r.id = m.record_id and r.deleted_at is null and r.created_by = v_link.person_id
   where m.person_id = v_link.person_id and m.channel = p_channel and m.outcome = 'anotado' and m.undone_at is null
     and m.received_at > now() - interval '24 hours'
     and exists (select 1 from public.context_memberships cm
                  where cm.context_id = r.context_id and cm.person_id = v_link.person_id and cm.revoked_at is null and cm.can_write)
   order by m.received_at desc, m.message_id desc
   limit 1
   for update of m;
  -- A versão é lida com a linha travada: uma edição no app ao mesmo tempo espera aqui.
  if found then
    select * into v_record from public.financial_records where id = v_msg.record_id and deleted_at is null for update;
  end if;
  if v_record.id is null then
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'nada_para_desfazer');
    return jsonb_build_object('result', 'nada_para_desfazer');
  end if;

  begin
    perform public.clarevo_chat_as(v_link.person_id);
    perform public.delete_record(p_channel || ':' || md5(p_message_id), v_record.id, v_record.version);
    perform public.clarevo_chat_as(null, v_claims, v_sub);
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_result := case v_error
      when 'sem_permissao' then 'sem_permissao'
      when 'nao_encontrado' then 'nada_para_desfazer'
      when 'conta_excluida' then 'nao_ligado'
    end;
    if v_result is null then
      raise;
    end if;
    perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash,
                                    case when v_result = 'nao_ligado' then null else v_link.person_id end, v_result);
    return case when v_result = 'sem_permissao'
                then jsonb_build_object('result', v_result, 'space', public.clarevo_chat_space(v_record.context_id))
                else jsonb_build_object('result', v_result) end;
  end;

  update public.chat_messages set undone_at = now() where message_id = v_msg.message_id;
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'desfeito', v_record.id);
  return jsonb_build_object('result', 'desfeito', 'space', public.clarevo_chat_space(v_record.context_id),
                            'record', public.clarevo_chat_record(v_record.id), 'today', v_today);
end;
$$;

-- Desligar pela própria conversa ("desligar", "parar", "sair") ou, no WhatsApp, porque a pessoa trocou de número (o número antigo sai).
-- Só o canal da conversa (T4). Retorno: {result: desligado | nao_ligado}.
create or replace function public.clarevo_chat_unlink(p_channel text, p_message_id text, p_sender_hash text)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_gate jsonb;
  v_link public.chat_links%rowtype;
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
  delete from public.chat_links where person_id = v_link.person_id and channel = p_channel and sender_hash = p_sender_hash;
  delete from public.chat_link_codes where person_id = v_link.person_id and channel = p_channel;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_link.person_id, p_channel || ':' || md5(p_message_id), 'desligar_' || p_channel, v_link.context_id,
          md5(jsonb_build_array('desligar_' || p_channel, p_message_id)::text), null, null, null);
  perform public.clarevo_chat_log(p_channel, p_message_id, p_sender_hash, v_link.person_id, 'desligado');
  return jsonb_build_object('result', 'desligado');
end;
$$;

-- ---------------------------------------------------------------------------
-- WhatsApp: os mesmos nomes, argumentos e respostas da 0020, agora só passando o canal adiante.
-- ---------------------------------------------------------------------------
create or replace function public.my_whatsapp()
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
  return public.clarevo_chat_state(auth.uid(), 'whatsapp');
end;
$$;

create or replace function public.create_whatsapp_code(p_context_id uuid, p_key text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_create_code('whatsapp', p_context_id, p_key);
$$;

create or replace function public.unlink_whatsapp(p_key text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_unlink_app('whatsapp', p_key);
$$;

create or replace function public.whatsapp_note(p_message_id text, p_phone_hash text, p_outcome text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_note('whatsapp', p_message_id, p_phone_hash, p_outcome);
$$;

create or replace function public.whatsapp_link(p_message_id text, p_phone_hash text, p_code text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_link('whatsapp', p_message_id, p_phone_hash, p_code);
$$;

create or replace function public.whatsapp_add_record(
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
                                        p_occurred_on, p_description, p_category);
$$;

create or replace function public.whatsapp_undo(p_message_id text, p_phone_hash text, p_sent_at timestamptz default null)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_undo('whatsapp', p_message_id, p_phone_hash, p_sent_at);
$$;

create or replace function public.whatsapp_unlink(p_message_id text, p_phone_hash text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_unlink('whatsapp', p_message_id, p_phone_hash);
$$;

-- ---------------------------------------------------------------------------
-- Telegram (D-080): as mesmas funções, com o canal 'telegram' e o resumo do identificador do Telegram em p_sender_hash.
-- ---------------------------------------------------------------------------
create or replace function public.my_telegram()
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
  return public.clarevo_chat_state(auth.uid(), 'telegram');
end;
$$;

create or replace function public.create_telegram_code(p_context_id uuid, p_key text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_create_code('telegram', p_context_id, p_key);
$$;

create or replace function public.unlink_telegram(p_key text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_unlink_app('telegram', p_key);
$$;

create or replace function public.telegram_note(p_message_id text, p_sender_hash text, p_outcome text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_note('telegram', p_message_id, p_sender_hash, p_outcome);
$$;

create or replace function public.telegram_link(p_message_id text, p_sender_hash text, p_code text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_link('telegram', p_message_id, p_sender_hash, p_code);
$$;

create or replace function public.telegram_add_record(
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
                                        p_occurred_on, p_description, p_category);
$$;

create or replace function public.telegram_undo(p_message_id text, p_sender_hash text, p_sent_at timestamptz default null)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_undo('telegram', p_message_id, p_sender_hash, p_sent_at);
$$;

create or replace function public.telegram_unlink(p_message_id text, p_sender_hash text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.clarevo_chat_unlink('telegram', p_message_id, p_sender_hash);
$$;

-- ---------------------------------------------------------------------------
-- Excluir a conta (T7): a mesma função da 0020, com a trava 'chat:p:' e as tabelas dos dois canais na regra 5.
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
-- Privilégios (T5), só do que é novo. As tabelas renomeadas e as funções recriadas com o mesmo nome e os mesmos argumentos mantêm os
-- privilégios que tinham (tabelas sem leitura e escrita direta; whatsapp_* só service_role; my_whatsapp, create_whatsapp_code e
-- unlink_whatsapp só authenticated). As internas renomeadas mantêm o execute retirado de todos.
-- ---------------------------------------------------------------------------
revoke all on function public.clarevo_chat_check_channel(text) from public, anon, authenticated;
revoke all on function public.clarevo_chat_log(text, text, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.clarevo_chat_state(uuid, text) from public, anon, authenticated;
revoke all on function public.clarevo_chat_gate(text, text, text) from public, anon, authenticated;
revoke all on function public.clarevo_chat_link_locked(text, text) from public, anon, authenticated;
revoke all on function public.clarevo_chat_create_code(text, uuid, text) from public, anon, authenticated;
revoke all on function public.clarevo_chat_unlink_app(text, text) from public, anon, authenticated;
revoke all on function public.clarevo_chat_note(text, text, text, text) from public, anon, authenticated;
revoke all on function public.clarevo_chat_link(text, text, text, text) from public, anon, authenticated;
revoke all on function public.clarevo_chat_add_record(text, text, text, timestamptz, public.record_kind, bigint, integer, date, text, text) from public, anon, authenticated;
revoke all on function public.clarevo_chat_undo(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.clarevo_chat_unlink(text, text, text) from public, anon, authenticated;
revoke all on function public.my_telegram() from public, anon, authenticated;
revoke all on function public.create_telegram_code(uuid, text) from public, anon, authenticated;
revoke all on function public.unlink_telegram(text) from public, anon, authenticated;
revoke all on function public.telegram_note(text, text, text) from public, anon, authenticated;
revoke all on function public.telegram_link(text, text, text) from public, anon, authenticated;
revoke all on function public.telegram_add_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text) from public, anon, authenticated;
revoke all on function public.telegram_undo(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.telegram_unlink(text, text) from public, anon, authenticated;
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['clarevo_chat_check_channel(text)', 'clarevo_chat_log(text, text, text, uuid, text, uuid)',
                             'clarevo_chat_state(uuid, text)', 'clarevo_chat_gate(text, text, text)', 'clarevo_chat_link_locked(text, text)',
                             'clarevo_chat_create_code(text, uuid, text)', 'clarevo_chat_unlink_app(text, text)',
                             'clarevo_chat_note(text, text, text, text)', 'clarevo_chat_link(text, text, text, text)',
                             'clarevo_chat_add_record(text, text, text, timestamptz, public.record_kind, bigint, integer, date, text, text)',
                             'clarevo_chat_undo(text, text, text, timestamptz)', 'clarevo_chat_unlink(text, text, text)',
                             'my_telegram()', 'create_telegram_code(uuid, text)', 'unlink_telegram(text)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
    foreach f in array array['telegram_note(text, text, text)', 'telegram_link(text, text, text)',
                             'telegram_add_record(text, text, timestamptz, public.record_kind, bigint, integer, date, text, text)',
                             'telegram_undo(text, text, timestamptz)', 'telegram_unlink(text, text)'] loop
      execute format('grant execute on function public.%s to service_role', f);
    end loop;
  end if;
end $$;

grant execute on function public.my_telegram() to authenticated;
grant execute on function public.create_telegram_code(uuid, text) to authenticated;
grant execute on function public.unlink_telegram(text) to authenticated;
