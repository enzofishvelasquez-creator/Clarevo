-- Clarevo · migração 0042 · Espaço Negócio (D-113). Depois de 20261117000003_niveis_queda_esmeralda.sql.
-- Retorno de quem testa, decidido pelo Enzo em 17/11/2026: quem tem CNPJ ou trabalha por conta (a loja de conserto de ar-condicionado,
-- a mãe que vende sacolé) mistura as contas pessoais com as do negócio. O Enzo escolheu um espaço separado ("Espaço Negócio", e não uma
-- marca nos lançamentos), incluído no plano Individual: um negócio por pessoa, sem custo extra. A Elis pediu que seja leve e não vire
-- contabilidade: o nome do negócio, o que entrou e o que saiu e uma visão com quanto entrou, saiu e sobrou (no app, docs/52).
--
-- O que muda no banco:
--   1. Um terceiro tipo de contexto, 'negocio', no enum context_kind. ALTER TYPE ... ADD VALUE pode rodar dentro da transação da
--      migração (Postgres 12 ou mais novo), mas o valor novo só pode ser USADO depois do commit. Por isso, nesta migração o texto
--      'negocio' aparece só dentro do corpo de funções plpgsql (lido quando a função roda, nunca na criação) e em comparações com
--      kind::text; nenhuma restrição, índice, visão ou função sql usa o valor. A migração inteira roda numa transação só (como o SQL
--      Editor faz): conferido em tests/99zzzzzzzzzzzzzzzzzzzzz_negocio.sql e no roteiro (docs/05, passo 12ai).
--   2. Criar, renomear e encerrar o negócio só pelas funções create_business, rename_business e end_business (como a Família): autoria
--      da sessão, chave de idempotência por pessoa, hash em JSON e record_operations. Quem cria vira titular (ler, anotar e editar), e o
--      negócio nasce com a "Conta do negócio" (bancos e carteira, D-043). Um negócio ativo por pessoa (ja_tem_negocio): o modelo aceita
--      mais (nenhum índice único prende um só), para o Clarevo Plus, mas a função recusa o segundo enquanto o Plus não existir.
--      Membros: só a própria pessoa por enquanto; os papéis da Família (context_memberships: titular, membro, leitor, com ler, anotar e
--      editar de outras pessoas) já servem para sócios e ajudantes no futuro. Encerrar só sem outra pessoa ativa (como end_family):
--      revoga o vínculo, marca ended_at e desliga as retiradas (abaixo); os dados ficam guardados sem leitura e são apagados de vez
--      depois de 6 meses (clarevo_purge_deleted, A7), como a Família encerrada.
--   3. Retirada para o Pessoal (create_business_withdrawal e delete_business_withdrawal): um movimento que sai do negócio (gasto
--      "Retirada para o Pessoal") e entra no Pessoal da própria pessoa (recebimento "Retirada do negócio"), os dois gravados juntos e
--      ligados (financial_records.paired_record_id, nos dois lados). Cada lado conta uma vez no próprio espaço; na visão "Como está o
--      negócio" a retirada não entra em "Saiu" (o app separa pelo vínculo). Um gasto ou recebimento ligado só muda ou sai pelas
--      funções da retirada (gatilho financial_records_pair_guard, retirada_ligada): update_record, delete_record, pagar ou ligar não o
--      tocam. Mudar o valor ou a data: excluir e anotar de novo.
--   4. Mover um lançamento entre o Pessoal e o Negócio (move_record), para quem anotou no lugar errado: o lançamento comum (sem conta
--      a pagar, fatura, rendimento de investimento ou retirada ligados: lancamento_ligado) é gravado de novo no outro espaço, com a
--      categoria escolhida e a conta do outro espaço, e o original sai (exclusão lógica), numa transação só. Só entre o Pessoal da
--      pessoa e um negócio em que ela anota.
--   5. Onde o negócio entra: lançamentos, contas a pagar, gastos fixos, cartões, bancos e carteira e importação já eram genéricos
--      (context_permission); o orçamento passa a conhecer as categorias de gasto do negócio (set_category_budget e month_budget, pelo
--      tipo do contexto; o app antigo, que só lê o Pessoal e a Família, recebe as mesmas linhas de antes). Investimentos continuam só
--      no Pessoal (as funções já conferiam). Metas não entram no negócio por enquanto (gatilho goals_context_guard, contexto_invalido).
--      WhatsApp e Telegram continuam anotando só no Pessoal.
--   6. Exclusão da conta: o negócio é da pessoa (owner_person_id) e já entrava em clarevo_erase_person como o Pessoal; nada muda nela.
--      A retirada apagada de um lado só desfaz o vínculo do outro (on delete set null).
--   7. A atividade não conta criar, renomear nem encerrar o negócio como anotação; encerrar vale mesmo em só ver e exportar (como
--      encerrar a Família).
-- Compatibilidade: o app anterior lê só os contextos 'pessoal' e 'familia' (filtro por kind), então nunca vê o negócio; as funções que
-- ele chama mantêm as assinaturas. O recebimento "Retirada do negócio" aparece no Pessoal como um recebimento comum; editar ou excluir
-- por lá recebe retirada_ligada (o app anterior mostra "Não foi possível salvar"). Nenhum dado existente muda.
-- Aplicar no SQL Editor depois da 0041 (docs/05, passo 12ai) e recarregar o esquema da API. Testes em
-- supabase/tests/99zzzzzzzzzzzzzzzzzzzzz_negocio.sql.

-- ---------------------------------------------------------------------------
-- 1. O tipo de contexto. Usar o valor só depois do commit (ver o cabeçalho).
-- ---------------------------------------------------------------------------
alter type public.context_kind add value if not exists 'negocio';

comment on type public.context_kind is
  'Tipo do contexto financeiro: pessoal (um por pessoa), familia (D-055) e negocio (D-113, Espaço Negócio, um ativo por pessoa enquanto o Clarevo Plus não existir).';

-- O negócio também pode ser encerrado (a regra da 0013 deixava só a Família). Sem usar o valor novo: tudo o que não é o Pessoal.
alter table public.financial_contexts drop constraint financial_contexts_encerrado;
alter table public.financial_contexts
  add constraint financial_contexts_encerrado check (ended_at is null or kind <> 'pessoal');
comment on column public.financial_contexts.ended_at is
  'Quando a Família (end_family) ou o negócio (end_business) foi encerrado. Os dados ficam guardados, sem leitura por ninguém (todos os vínculos revogados), e são apagados de vez depois de 6 meses (clarevo_purge_deleted).';

-- ---------------------------------------------------------------------------
-- 2. Retirada: os dois lançamentos ligados
-- ---------------------------------------------------------------------------
alter table public.financial_records
  add column paired_record_id uuid references public.financial_records (id) on delete set null;
create index financial_records_paired_record_id_fk_idx on public.financial_records (paired_record_id);
alter table public.financial_records add constraint financial_records_par check (
  paired_record_id is null
  or (paired_record_id <> id and commitment_id is null and card_id is null and investment_id is null and not linked_payment
      and receipt_key is null and import_key is null and not next_month and subcategory is null));
comment on column public.financial_records.paired_record_id is
  'Retirada para o Pessoal (D-113): o lançamento do outro lado. O gasto "Retirada para o Pessoal" no negócio e o recebimento "Retirada do negócio" no Pessoal apontam um para o outro; só create_business_withdrawal, delete_business_withdrawal e end_business mudam esses dois lançamentos.';

-- Guarda: um lançamento ligado só muda dentro das funções da retirada (marca da transação clarevo.retirada). A única exceção é o
-- vínculo virar nulo sozinho (o outro lado apagado de vez: on delete set null, na exclusão da conta ou na limpeza dos 6 meses).
create or replace function public.financial_records_pair_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.paired_record_id is not null and coalesce(current_setting('clarevo.retirada', true), '') <> 'on'
     and (new.kind is distinct from old.kind or new.account_id is distinct from old.account_id
          or new.amount_cents is distinct from old.amount_cents or new.occurred_on is distinct from old.occurred_on
          or new.description is distinct from old.description or new.category is distinct from old.category
          or new.subcategory is distinct from old.subcategory or new.deleted_at is distinct from old.deleted_at
          or new.commitment_id is distinct from old.commitment_id or new.card_id is distinct from old.card_id
          or new.invoice_month is distinct from old.invoice_month or new.linked_payment is distinct from old.linked_payment
          or new.investment_id is distinct from old.investment_id or new.investment_movement_id is distinct from old.investment_movement_id
          or new.next_month is distinct from old.next_month
          or (new.paired_record_id is not null and new.paired_record_id is distinct from old.paired_record_id)) then
    raise exception 'retirada_ligada' using errcode = 'PT409';
  end if;
  if old.paired_record_id is null and new.paired_record_id is not null
     and coalesce(current_setting('clarevo.retirada', true), '') <> 'on' then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger financial_records_pair_guard
  before update on public.financial_records
  for each row execute function public.financial_records_pair_guard();

-- ---------------------------------------------------------------------------
-- 3. Categorias de gasto do negócio no orçamento (as de recebimento ficam só no app)
-- ---------------------------------------------------------------------------
alter table public.category_budgets drop constraint category_budgets_categoria;
alter table public.category_budgets add constraint category_budgets_categoria
  check (category in ('Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Crédito e parcelas',
                      'Material e mercadoria', 'Peças e ferramentas', 'Combustível e transporte', 'Funcionários e ajudantes',
                      'Impostos e DAS', 'Aluguel do ponto', 'Contas do ponto', 'Taxas e maquininha', 'Outras saídas'));

-- ---------------------------------------------------------------------------
-- 4. Auxiliares (sem execute para o app)
-- ---------------------------------------------------------------------------

-- O contexto é um negócio (plpgsql: o valor novo só é lido quando a função roda).
create or replace function public.clarevo_is_business(p_context uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.financial_contexts c where c.id = p_context and c.kind = 'negocio');
end;
$$;

-- Negócios ativos de que a pessoa é titular (um só enquanto o Plus não existir).
create or replace function public.clarevo_active_business_count(p_person uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select count(*)::integer
            from public.context_memberships m
            join public.financial_contexts c on c.id = m.context_id
           where m.person_id = p_person and m.role = 'titular' and m.revoked_at is null
             and c.kind = 'negocio' and c.ended_at is null);
end;
$$;

-- As categorias de gasto do orçamento, pelo tipo do contexto (as mesmas listas do núcleo: CATEGORIES e BUSINESS_CATEGORIES).
create or replace function public.clarevo_budget_categories(p_context uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.clarevo_is_business(p_context) then
    return array['Material e mercadoria', 'Peças e ferramentas', 'Combustível e transporte', 'Funcionários e ajudantes',
                 'Impostos e DAS', 'Aluguel do ponto', 'Contas do ponto', 'Taxas e maquininha', 'Outras saídas'];
  end if;
  return array['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Crédito e parcelas'];
end;
$$;

-- O negócio no formato que o app lê.
create or replace function public.clarevo_business_json(p_context uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'created_at', c.created_at, 'ended_at', c.ended_at)
    from public.financial_contexts c where c.id = p_context;
$$;

-- Quem chama precisa ler o negócio (senão nao_encontrado, sem revelar que existe), ele precisa ser um negócio e quem chama, o titular.
create or replace function public.clarevo_require_business_owner(p_context uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_context is null or not public.context_permission(p_context, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.clarevo_is_business(p_context) then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context, 'manage') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
end;
$$;

-- O Pessoal da pessoa (o lado de recebimento da retirada e uma das pontas do mover).
create or replace function public.clarevo_personal_context(p_person uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select c.id from public.financial_contexts c where c.owner_person_id = p_person and c.kind = 'pessoal');
end;
$$;

-- Os dois lados de uma retirada, no formato que o app lê.
create or replace function public.clarevo_withdrawal_json(p_business_record uuid, p_personal_record uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('business_record', (select to_jsonb(r) from public.financial_records r where r.id = p_business_record),
                            'personal_record', (select to_jsonb(r) from public.financial_records r where r.id = p_personal_record));
$$;

-- ---------------------------------------------------------------------------
-- 5. Criar o negócio. Quem cria vira titular (ler, anotar e editar) e o negócio nasce com a "Conta do negócio". Recusas:
-- nome_do_negocio_invalido (1 a 60 caracteres) e ja_tem_negocio (um negócio ativo por pessoa enquanto o Plus não existir).
-- Retorno: {context: {id, name, created_at, ended_at}, role: 'titular'}.
-- ---------------------------------------------------------------------------
create or replace function public.create_business(p_name text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := public.clarevo_trim(p_name);
  v_hash text;
  v_op public.record_operations%rowtype;
  v_ctx uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('criar_negocio', v_name)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'criar_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context', public.clarevo_business_json(v_op.context_id), 'role', 'titular');
  end if;

  -- Quem ainda não tem espaço (primeira entrada) não tem permissão para nada.
  if not exists (select 1 from public.persons where id = v_uid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'nome_do_negocio_invalido' using errcode = '22023';
  end if;
  -- A trava por pessoa (a mesma de create_family e da exclusão da conta): dois pedidos ao mesmo tempo não criam dois negócios.
  perform pg_advisory_xact_lock(hashtext('familia:p:' || v_uid::text));
  if public.clarevo_active_business_count(v_uid) >= 1 then
    raise exception 'ja_tem_negocio' using errcode = 'PT409';
  end if;

  insert into public.financial_contexts (kind, name, owner_person_id) values ('negocio', v_name, v_uid) returning id into v_ctx;
  insert into public.context_memberships (context_id, person_id, role, can_read, can_write, can_edit_others)
  values (v_ctx, v_uid, 'titular', true, true, true);
  insert into public.financial_accounts (context_id, name, created_by, kind, is_default)
  values (v_ctx, 'Conta do negócio', v_uid, 'banco', true);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'criar_negocio', v_ctx, v_hash, null, null, v_ctx);

  return jsonb_build_object('context', public.clarevo_business_json(v_ctx), 'role', 'titular');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Renomear o negócio. Só o titular. Retorno: {context: {...}}.
-- ---------------------------------------------------------------------------
create or replace function public.rename_business(p_context uuid, p_name text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := public.clarevo_trim(p_name);
  v_hash text;
  v_op public.record_operations%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('renomear_negocio', p_context, v_name)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'renomear_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context', public.clarevo_business_json(v_op.context_id));
  end if;

  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  perform public.clarevo_require_business_owner(p_context);
  if char_length(v_name) not between 1 and 60 then
    raise exception 'nome_do_negocio_invalido' using errcode = '22023';
  end if;

  update public.financial_contexts set name = v_name where id = p_context;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'renomear_negocio', p_context, v_hash, null, null, p_context);

  return jsonb_build_object('context', public.clarevo_business_json(p_context));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Encerrar o negócio. Só o titular e só sem outra pessoa ativa (negocio_com_membros; hoje só a própria pessoa participa). Desliga
-- as retiradas (os recebimentos no Pessoal viram recebimentos comuns, que a pessoa pode editar), revoga o vínculo e marca ended_at; os
-- dados ficam guardados, sem leitura, até a limpeza dos 6 meses. Repetir a mesma chave devolve o mesmo resultado mesmo depois.
-- Retorno: {context_id, ended: true}.
-- ---------------------------------------------------------------------------
create or replace function public.end_business(p_context uuid, p_key text)
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
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('encerrar_negocio', p_context)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'encerrar_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return jsonb_build_object('context_id', v_op.context_id, 'ended', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  perform public.clarevo_require_business_owner(p_context);
  if exists (select 1 from public.context_memberships
              where context_id = p_context and revoked_at is null and person_id <> v_uid) then
    raise exception 'negocio_com_membros' using errcode = 'PT409';
  end if;

  -- As retiradas: os dois lados deixam de ser ligados (só o vínculo muda; valores, datas e versões ficam).
  perform set_config('clarevo.retirada', 'on', true);
  update public.financial_records p set paired_record_id = null
   where p.paired_record_id is not null
     and (p.context_id = p_context
          or p.paired_record_id in (select b.id from public.financial_records b where b.context_id = p_context));
  perform set_config('clarevo.retirada', '', true);

  update public.context_memberships set revoked_at = now() where context_id = p_context and revoked_at is null;
  update public.financial_contexts set ended_at = now() where id = p_context;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'encerrar_negocio', p_context, v_hash, null, null, p_context);

  return jsonb_build_object('context_id', p_context, 'ended', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Retirada para o Pessoal. O gasto "Retirada para o Pessoal" no negócio (p_business, da conta p_business_account) e o recebimento
-- "Retirada do negócio" no Pessoal da própria pessoa (na conta p_personal_account), com o mesmo valor e a mesma data, gravados juntos e
-- ligados. Descrição: a da pessoa nos dois lados, ou "Retirada para o Pessoal" no negócio e "Retirada de <negócio>" no Pessoal.
-- Ordem: sessão; chave; repetição; negócio que não lê (nao_encontrado); não é negócio (contexto_invalido); sem escrita no negócio
-- (sem_permissao); sem Pessoal (sem_permissao); as regras de create_record nos dois lados (valor, descrição, data, conta ativa do espaço).
-- Retorno: {business_record, personal_record}.
-- ---------------------------------------------------------------------------
create or replace function public.create_business_withdrawal(
  p_key text,
  p_business uuid,
  p_business_account uuid,
  p_personal_account uuid,
  p_amount_cents bigint,
  p_occurred_on date,
  p_description text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_desc text := nullif(public.clarevo_trim(p_description), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_personal uuid;
  v_name text;
  v_bdesc text;
  v_pdesc text;
  v_bacc public.financial_accounts%rowtype;
  v_pacc public.financial_accounts%rowtype;
  v_b public.financial_records%rowtype;
  v_p public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('criar_retirada_negocio', p_business, p_business_account, p_personal_account, p_amount_cents,
                                  p_occurred_on, coalesce(v_desc, ''))::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'criar_retirada_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_withdrawal_json(v_op.record_id, v_op.target_id);
  end if;

  if p_business is null or not public.context_permission(p_business, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.clarevo_is_business(p_business) then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_business, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_personal := public.clarevo_personal_context(v_uid);
  if v_personal is null or not public.context_permission(v_personal, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select name into v_name from public.financial_contexts where id = p_business;
  v_bdesc := coalesce(v_desc, 'Retirada para o Pessoal');
  v_pdesc := coalesce(v_desc, left('Retirada de ' || v_name, 80));
  v_bacc := public.clarevo_validate_record(v_uid, p_business, p_business_account, p_amount_cents, p_occurred_on, v_bdesc, 'Retirada para o Pessoal');
  v_pacc := public.clarevo_validate_record(v_uid, v_personal, p_personal_account, p_amount_cents, p_occurred_on, v_pdesc, 'Retirada do negócio');

  perform set_config('clarevo.retirada', 'on', true);
  insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by)
  values (p_business, p_business_account, 'despesa', p_amount_cents, v_bacc.currency, p_occurred_on, v_bdesc, 'Retirada para o Pessoal', v_uid)
  returning * into v_b;
  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, paired_record_id)
  values (v_personal, p_personal_account, 'receita', p_amount_cents, v_pacc.currency, p_occurred_on, v_pdesc, 'Retirada do negócio', v_uid, v_b.id)
  returning * into v_p;
  update public.financial_records set paired_record_id = v_p.id where id = v_b.id returning * into v_b;
  perform set_config('clarevo.retirada', '', true);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'criar_retirada_negocio', p_business, v_hash, v_b.id, null, v_p.id);

  return public.clarevo_withdrawal_json(v_b.id, v_p.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Excluir a retirada: pelo lançamento de qualquer um dos lados, os dois saem juntos (exclusão lógica). Ordem: sessão; chave;
-- repetição; o lançamento (nao_encontrado, sem_permissao, como clarevo_lock_record); não é retirada (nao_e_retirada); versão do
-- lançamento escolhido; o outro lado (escrita nos dois espaços). Retorno: {business_record, personal_record}.
-- ---------------------------------------------------------------------------
create or replace function public.delete_business_withdrawal(p_key text, p_record uuid, p_expected_version integer)
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
  v_r public.financial_records%rowtype;
  v_other public.financial_records%rowtype;
  v_b public.financial_records%rowtype;
  v_p public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('excluir_retirada_negocio', p_record, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'excluir_retirada_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_withdrawal_json(v_op.record_id, v_op.target_id);
  end if;

  v_r := public.clarevo_lock_record(p_record);
  if v_r.paired_record_id is null then
    raise exception 'nao_e_retirada' using errcode = '22023';
  end if;
  if v_r.version <> p_expected_version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_r.version;
  end if;
  begin
    v_other := public.clarevo_lock_record(v_r.paired_record_id);
  exception when sqlstate 'P0002' then
    raise exception 'sem_permissao' using errcode = '42501';
  end;
  if v_r.kind = 'despesa' then
    v_b := v_r; v_p := v_other;
  else
    v_b := v_other; v_p := v_r;
  end if;

  perform set_config('clarevo.retirada', 'on', true);
  update public.financial_records set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id in (v_b.id, v_p.id);
  perform set_config('clarevo.retirada', '', true);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'excluir_retirada_negocio', v_b.context_id, v_hash, v_b.id, null, v_p.id);

  return public.clarevo_withdrawal_json(v_b.id, v_p.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Mover um lançamento entre o Pessoal e o negócio. O lançamento comum é gravado de novo no outro espaço (mesmo tipo, valor, data,
-- descrição, recebimento do mês seguinte, nota e chave da importação; a categoria escolhida, sem subcategoria; a conta escolhida do
-- outro espaço) e o original sai (exclusão lógica), juntos. Ordem: sessão; chave; repetição; o lançamento (clarevo_lock_record);
-- versão; lancamento_ligado (conta a pagar, fatura, rendimento ou retirada); contexto_invalido (o par não é o Pessoal da pessoa e um
-- negócio, ou é o mesmo); sem escrita no destino (sem_permissao); as regras de create_record no destino. Retorno: o lançamento novo.
-- ---------------------------------------------------------------------------
create or replace function public.move_record(
  p_key text,
  p_record uuid,
  p_expected_version integer,
  p_target_context uuid,
  p_account uuid,
  p_category text default null
)
returns public.financial_records
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_r public.financial_records%rowtype;
  v_new public.financial_records%rowtype;
  v_personal uuid;
  v_acc public.financial_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('mover_lancamento', p_record, p_expected_version, p_target_context, p_account, coalesce(v_category, ''))::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'mover_lancamento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    select * into v_new from public.financial_records where id = v_op.record_id;
    return v_new;
  end if;

  v_r := public.clarevo_lock_record(p_record);
  if v_r.version <> p_expected_version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_r.version;
  end if;
  if v_r.commitment_id is not null or v_r.card_id is not null or v_r.investment_id is not null or v_r.investment_movement_id is not null
     or v_r.paired_record_id is not null then
    raise exception 'lancamento_ligado' using errcode = 'PT409';
  end if;
  v_personal := public.clarevo_personal_context(v_uid);
  if p_target_context is null or p_target_context = v_r.context_id or v_personal is null
     or not ((v_r.context_id = v_personal and public.clarevo_is_business(p_target_context))
             or (p_target_context = v_personal and public.clarevo_is_business(v_r.context_id))) then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_target_context, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_acc := public.clarevo_validate_record(v_uid, p_target_context, p_account, v_r.amount_cents, v_r.occurred_on, v_r.description, v_category);

  update public.financial_records set deleted_at = now(), deleted_by = v_uid, version = version + 1 where id = v_r.id;
  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, next_month, receipt_key, import_key)
  values (p_target_context, p_account, v_r.kind, v_r.amount_cents, v_acc.currency, v_r.occurred_on, v_r.description, v_category, v_uid,
          v_r.next_month, v_r.receipt_key, v_r.import_key)
  returning * into v_new;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'mover_lancamento', p_target_context, v_hash, v_new.id, null, v_r.id);

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Metas: não no negócio por enquanto (contexto_invalido). Investimentos já conferiam o Pessoal.
-- ---------------------------------------------------------------------------
create or replace function public.goals_context_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.clarevo_is_business(new.context_id) then
    raise exception 'contexto_invalido' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger goals_context_guard
  before insert on public.goals
  for each row execute function public.goals_context_guard();

-- ---------------------------------------------------------------------------
-- 12. Orçamento: as categorias pelo tipo do contexto. set_category_budget com o corpo da 0027 e month_budget com o da 0029 (parcelas
-- importadas em andamento); a lista vem de clarevo_budget_categories (no Pessoal e na Família, a de sempre, na mesma ordem).
-- ---------------------------------------------------------------------------
create or replace function public.set_category_budget(
  p_idempotency_key text,
  p_context_id uuid,
  p_category text,
  p_from_month date,
  p_expected_version integer,
  p_amount_cents bigint
)
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
  v_row public.category_budgets%rowtype;
  v_month date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('definir_orcamento_categoria', p_context_id, p_category, p_from_month, p_expected_version,
                                  p_amount_cents)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'definir_orcamento_categoria' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return (select to_jsonb(b) from public.category_budgets b where b.id = v_op.target_id);
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_from_month is null or extract(day from p_from_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  if p_category is null or not (p_category = any (public.clarevo_budget_categories(p_context_id))) then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;

  -- A linha pode ainda não existir: a trava consultiva serializa a criação; depois, a linha.
  perform pg_advisory_xact_lock(hashtext('orcamento:' || p_context_id::text || ':' || p_category || ':' || to_char(p_from_month, 'YYYY-MM-DD')));
  select * into v_row from public.category_budgets
   where context_id = p_context_id and category = p_category and from_month = p_from_month and deleted_at is null
   for update;

  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from coalesce(v_row.version, 0) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_row.version, 0);
  end if;
  if v_row.id is not null and v_row.created_by <> v_uid and not public.context_permission(p_context_id, 'edit_others') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_month := date_trunc('month', public.clarevo_today(v_uid)::timestamp)::date;
  if p_from_month < (v_month - interval '24 months')::date or p_from_month > (v_month + interval '12 months')::date then
    raise exception 'vigencia_fora_do_intervalo' using errcode = '22023';
  end if;
  if p_amount_cents is not null and p_amount_cents < 100 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_amount_cents is not null and p_amount_cents > 999999999 then
    raise exception 'valor_acima_do_limite' using errcode = '22023';
  end if;

  if v_row.id is null then
    insert into public.category_budgets (context_id, category, from_month, amount_cents, created_by)
    values (p_context_id, p_category, p_from_month, p_amount_cents, v_uid)
    returning * into v_row;
  else
    update public.category_budgets set amount_cents = p_amount_cents, version = version + 1
     where id = v_row.id
    returning * into v_row;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'definir_orcamento_categoria', p_context_id, v_hash, null, null, v_row.id);

  return to_jsonb(v_row);
end;
$$;

create or replace function public.month_budget(p_context_id uuid, p_month date)
returns table (
  category text,
  budget_id uuid,
  budget_version integer,
  budget_from date,
  budget_cents bigint,
  used_cents bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_next date;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_next := (p_month + interval '1 month')::date;
  -- Gastos, parcelas e estornos de cada categoria, agregados uma vez só (uma leitura de financial_records e uma de card_entries,
  -- esta pelo índice card_entries_ctx_kind), em vez de uma subconsulta por categoria.
  return query
  with spent as (
    select r.category as cat, sum(r.amount_cents)::bigint as cents
      from public.financial_records r
     where r.context_id = p_context_id and r.deleted_at is null and r.kind = 'despesa' and r.card_id is null
       and r.occurred_on >= p_month and r.occurred_on < v_next
     group by r.category
  ), cards as (
    select e.category as cat,
           sum(case when e.kind = 'parcela' then e.amount_cents else -e.amount_cents end)::bigint as cents
      from public.card_entries e
      left join public.cards cd on cd.id = e.card_id
      -- Compra importada em andamento (D-089 B): a parcela anda no orçamento a mesma distância que a importação deu à fatura
      -- (a da linha em relação à fatura natural da data da compra); sem deslocamento, a regra de sempre (categoryUsage no núcleo).
      cross join lateral (select case when e.kind = 'parcela' and e.installment_offset > 0
                                      then public.invoice_month_for(cd.closing_day, cd.due_day, e.purchased_on) end as natural_month) n
     where e.context_id = p_context_id and e.deleted_at is null
       and ((e.kind = 'parcela' and e.installment_offset = 0
             and (date_trunc('month', e.purchased_on::timestamp) + make_interval(months => e.installment_number - 1))::date = p_month)
            or (e.kind = 'parcela' and e.installment_offset > 0
                and (date_trunc('month', e.purchased_on::timestamp)
                     + make_interval(months => ((extract(year from e.invoice_month) - extract(year from n.natural_month)) * 12
                                                + extract(month from e.invoice_month) - extract(month from n.natural_month))::int))::date = p_month)
            or (e.kind = 'estorno' and e.source_month is null and e.invoice_month = p_month))
     group by e.category
  )
  select c.category,
         b.id, b.version, b.from_month, b.amount_cents,
         greatest(0::bigint, coalesce(s.cents, 0) + coalesce(k.cents, 0))::bigint
    from unnest(public.clarevo_budget_categories(p_context_id)) with ordinality as c (category, ord)
    left join spent s on s.cat = c.category
    left join cards k on k.cat = c.category
    left join lateral (select x.* from public.category_budgets x
                        where x.context_id = p_context_id and x.category = c.category and x.deleted_at is null
                          and x.from_month <= p_month
                        order by x.from_month desc
                        limit 1) b on true
   order by c.ord;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Operações: a lista vigente (0035) mais as seis do negócio. Criar, renomear e encerrar apontam para o negócio (target_id); a
-- retirada guarda o gasto do negócio em record_id e o recebimento do Pessoal em target_id; mover guarda o lançamento novo em record_id
-- e o original em target_id.
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
  'aceitar_termos',
  'ordenar_metas',
  'criar_investimento', 'alterar_investimento', 'situacao_investimento', 'excluir_investimento',
  'registrar_movimento_investimento', 'alterar_movimento_investimento', 'excluir_movimento_investimento',
  'definir_plano_investimentos', 'excluir_plano_investimentos',
  'origem_valor_meta',
  'criar_negocio', 'renomear_negocio', 'encerrar_negocio', 'criar_retirada_negocio', 'excluir_retirada_negocio', 'mover_lancamento'));
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
                 'imagem_meta', 'ordenar_metas', 'origem_valor_meta',
                 'criar_investimento', 'alterar_investimento', 'situacao_investimento', 'excluir_investimento',
                 'registrar_movimento_investimento', 'alterar_movimento_investimento', 'excluir_movimento_investimento',
                 'criar_negocio', 'renomear_negocio', 'encerrar_negocio')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action in ('criar_retirada_negocio', 'excluir_retirada_negocio', 'mover_lancamento')
      and target_id is not null and record_id is not null and commitment_id is null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido',
                 'responder_origem_cadastro', 'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
                 'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos',
                 'definir_plano_investimentos', 'excluir_plano_investimentos')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- 14. Atividade (a função da 0031) sem contar criar, renomear e encerrar o negócio; e encerrar o negócio vale em só ver e exportar
-- (a lista da 0024 mais encerrar_negocio).
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
                    'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos', 'ordenar_metas',
                    'criar_familia', 'criar_convite_familia', 'cancelar_convite_familia', 'aceitar_convite_familia', 'sair_familia',
                    'remover_membro_familia', 'alterar_papel_familia', 'transferir_titularidade_familia', 'encerrar_familia',
                    'convidar_licencas', 'renovar_convite_licenca', 'cancelar_convite_licenca', 'encerrar_licenca', 'aceitar_licenca',
                    'criar_negocio', 'renomear_negocio', 'encerrar_negocio') then
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

create or replace function public.clarevo_write_free_actions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['sair_familia', 'aceitar_convite_familia', 'encerrar_familia', 'remover_membro_familia', 'transferir_titularidade_familia',
               'alterar_papel_familia', 'cancelar_convite_familia', 'aceitar_licenca', 'convidar_licencas', 'renovar_convite_licenca',
               'cancelar_convite_licenca', 'encerrar_licenca', 'ligar_whatsapp', 'desligar_whatsapp', 'ligar_telegram', 'desligar_telegram',
               'responder_origem_cadastro', 'decidir_revisao', 'aceitar_termos', 'encerrar_negocio']::text[];
$$;

-- ---------------------------------------------------------------------------
-- 15. Limpeza dos 6 meses (A7, a função da 0025): o negócio encerrado há mais de 6 meses sai inteiro, como a Família ('negocios' na
-- resposta). O resto é o corpo da 0025.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_purge_deleted(p_before timestamptz default now() - interval '6 months')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ctx uuid;
  n_records int := 0;
  n_entries int := 0;
  n_movements int := 0;
  n_goals int := 0;
  n_commitments int := 0;
  n_series int := 0;
  n_cards int := 0;
  n_accounts int := 0;
  n_budgets int := 0;
  n_limits int := 0;
  n_incomes int := 0;
  n_families int := 0;
  n_businesses int := 0;
  n_operations int := 0;
  n_persons int := 0;
  v_person uuid;
  n int;
begin
  if p_before is null or p_before > now() - interval '6 months' then
    raise exception 'prazo_invalido' using errcode = '22023';
  end if;

  -- E2: Famílias encerradas há mais de 6 meses, inteiras.
  for v_ctx in select c.id from public.financial_contexts c where c.kind = 'familia' and c.ended_at is not null and c.ended_at < p_before loop
    perform public.clarevo_erase_context(v_ctx);
    n_families := n_families + 1;
  end loop;
  -- D-113: negócios encerrados há mais de 6 meses, inteiros.
  for v_ctx in select c.id from public.financial_contexts c where c.kind = 'negocio' and c.ended_at is not null and c.ended_at < p_before loop
    perform public.clarevo_erase_context(v_ctx);
    n_businesses := n_businesses + 1;
  end loop;

  -- E1, na ordem das chaves: primeiro o que depende, depois o que é usado.
  delete from public.card_entries e where e.deleted_at < p_before;
  get diagnostics n_entries = row_count;

  delete from public.financial_records r
   where r.deleted_at < p_before
     and not exists (select 1 from public.card_entries e where e.payment_record_id = r.id);
  get diagnostics n_records = row_count;

  delete from public.goal_movements m where m.deleted_at < p_before;
  get diagnostics n_movements = row_count;

  delete from public.goals g
   where g.deleted_at < p_before
     and not exists (select 1 from public.goal_movements m where m.goal_id = g.id and m.context_id = g.context_id);
  get diagnostics n_goals = row_count;

  delete from public.commitments c
   where c.deleted_at < p_before and not c.series_skipped
     and not exists (select 1 from public.financial_records r where r.commitment_id = c.id and r.context_id = c.context_id);
  get diagnostics n_commitments = row_count;

  -- E3: as marcas de "só neste mês" saem só com o gasto fixo excluído há mais de 6 meses, e só quando nada mais segura a série.
  with alvo as (
    select s.id, s.context_id from public.commitment_series s
     where s.deleted_at < p_before
       and not exists (select 1 from public.commitments c
                        where c.series_id = s.id and c.context_id = s.context_id
                          and not (c.series_skipped and c.deleted_at < p_before
                                   and not exists (select 1 from public.financial_records r where r.commitment_id = c.id and r.context_id = c.context_id)))
  )
  delete from public.commitments c using alvo where c.series_id = alvo.id and c.context_id = alvo.context_id;
  get diagnostics n = row_count;
  n_commitments := n_commitments + n;

  delete from public.commitment_series s
   where s.deleted_at < p_before
     and not exists (select 1 from public.commitments c where c.series_id = s.id and c.context_id = s.context_id);
  get diagnostics n_series = row_count;

  delete from public.cards k
   where k.deleted_at < p_before
     and not exists (select 1 from public.commitments c where c.card_id = k.id and c.context_id = k.context_id)
     and not exists (select 1 from public.financial_records r where r.card_id = k.id and r.context_id = k.context_id)
     and not exists (select 1 from public.card_entries e where e.card_id = k.id and e.context_id = k.context_id);
  get diagnostics n_cards = row_count;

  delete from public.financial_accounts a
   where a.deleted_at < p_before
     and not exists (select 1 from public.financial_records r where r.account_id = a.id and r.context_id = a.context_id)
     and not exists (select 1 from public.goal_movements m where m.account_id = a.id and m.context_id = a.context_id);
  get diagnostics n_accounts = row_count;

  delete from public.category_budgets b where b.deleted_at < p_before;
  get diagnostics n_budgets = row_count;
  delete from public.commitment_limits l where l.deleted_at < p_before;
  get diagnostics n_limits = row_count;
  delete from public.income_references i where i.deleted_at < p_before;
  get diagnostics n_incomes = row_count;

  -- E5: o resumo do pedido das operações antigas.
  update public.record_operations o set request_hash = 'apagado' where o.created_at < p_before and o.request_hash <> 'apagado';
  get diagnostics n_operations = row_count;

  -- E3: a pessoa anônima que não é mais autora de nada sai (a recusa da chave estrangeira mantém quem ainda é).
  for v_person in select p.id from public.persons p where p.deleted_at is not null loop
    begin
      delete from public.persons where id = v_person and deleted_at is not null;
      if found then n_persons := n_persons + 1; end if;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  return jsonb_build_object(
    'antes_de', p_before, 'familias', n_families, 'negocios', n_businesses, 'registros', n_records, 'lancamentos_cartao', n_entries,
    'movimentos_meta', n_movements, 'metas', n_goals, 'contas_a_pagar', n_commitments, 'series', n_series, 'cartoes', n_cards,
    'contas_de_origem', n_accounts, 'orcamentos', n_budgets, 'limites', n_limits, 'rendas_de_referencia', n_incomes,
    'operacoes_resumidas', n_operations, 'pessoas_anonimas', n_persons);
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. Privilégios: as seis funções do app só para authenticated; auxiliares e gatilhos para ninguém com sessão.
-- ---------------------------------------------------------------------------
revoke all on function public.financial_records_pair_guard() from public, anon, authenticated, service_role;
revoke all on function public.goals_context_guard() from public, anon, authenticated, service_role;
revoke all on function public.clarevo_is_business(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_active_business_count(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_budget_categories(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_business_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_require_business_owner(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_personal_context(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_withdrawal_json(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_track_activity() from public, anon, authenticated, service_role;
revoke all on function public.clarevo_write_free_actions() from public, anon, authenticated, service_role;
revoke all on function public.clarevo_purge_deleted(timestamptz) from public, anon, authenticated, service_role;

revoke all on function public.create_business(text, text) from public, anon;
revoke all on function public.rename_business(uuid, text, text) from public, anon;
revoke all on function public.end_business(uuid, text) from public, anon;
revoke all on function public.create_business_withdrawal(text, uuid, uuid, uuid, bigint, date, text) from public, anon;
revoke all on function public.delete_business_withdrawal(text, uuid, integer) from public, anon;
revoke all on function public.move_record(text, uuid, integer, uuid, uuid, text) from public, anon;
revoke all on function public.set_category_budget(text, uuid, text, date, integer, bigint) from public, anon;
revoke all on function public.month_budget(uuid, date) from public, anon;
grant execute on function public.create_business(text, text) to authenticated;
grant execute on function public.rename_business(uuid, text, text) to authenticated;
grant execute on function public.end_business(uuid, text) to authenticated;
grant execute on function public.create_business_withdrawal(text, uuid, uuid, uuid, bigint, date, text) to authenticated;
grant execute on function public.delete_business_withdrawal(text, uuid, integer) to authenticated;
grant execute on function public.move_record(text, uuid, integer, uuid, uuid, text) to authenticated;
grant execute on function public.set_category_budget(text, uuid, text, date, integer, bigint) to authenticated;
grant execute on function public.month_budget(uuid, date) to authenticated;
