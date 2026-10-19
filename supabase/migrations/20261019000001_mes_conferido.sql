-- Clarevo · migração 0016 · "Conferi este mês" (D-060, item 2; resolve P-022, Ciclo S). Depois de 20261018000001_exclusao.sql.
-- A pessoa pode marcar que conferiu um mês já terminado e que ele não teve recebimentos ("recebimentos") ou não teve pagamentos
-- ("pagamentos", a base de Pago: caixa, pela data do pagamento, D-057 D07): é o "zero confirmado", que se distingue do mês sem registro.
-- A marca é por contexto, mês e tipo, só nasce e só muda pelas funções abaixo e nunca muda nenhum total (Recebido, Pago, Diferença,
-- renda comprometida): é uma afirmação da pessoa, não um lançamento. Marcar e desmarcar exigem escrita no contexto (na Família, quem
-- anota marca e desmarca; quem só lê vê); a empresa nunca lê. Nenhuma função nova grava financial_records, commitments, card_entries
-- nem metas.
--
-- Invariantes:
-- M1. Uma linha persistente por (contexto, mês, tipo): nasce na primeira marcação e nunca é apagada (só sai com o contexto). O mês é
--     sempre o primeiro dia de um mês; o tipo é 'recebimentos' ou 'pagamentos'. `checked` diz se a marca está ligada.
-- M2. Só se marca um mês já terminado: o mês atual e os futuros, no fuso de quem marca, são recusados (mes_invalido).
-- M3. Só se marca um mês que, naquele tipo, não tem nenhum registro vivo (mes_com_registros): o mesmo critério de Pago e de Recebido
--     (financial_records vivos do tipo, pela data do pagamento). Compra no cartão NÃO é registro de Pago: ela só entra no Pago quando a
--     fatura é paga (o pagamento da fatura é um registro, pela data em que foi pago). Por isso um mês só com compras no cartão pode ser
--     marcado, e months_overview avisa (card_purchase_count) que há compras no cartão pela data da compra, inclusive as importadas.
--     Se um registro aparecer depois da marca, ela deixa de valer (months_overview devolve false) SEM ser desligada; ao excluir o
--     registro, ela volta a valer. A marca vale só enquanto `checked` e a contagem do tipo no mês é zero.
-- M4. Versão crescente: a primeira marcação cria a linha com versão 1; cada marcar e cada desmarcar soma 1 e troca `checked`, nunca
--     mais nem menos. Marcar espera a versão que a pessoa leu (0 quando ainda não há linha) e uma linha desligada; desmarcar espera a
--     versão da linha ligada. Quem chega com versão velha, ou com a marca já no estado pedido, recebe versao_desatualizada com o
--     detalhe versao_atual (0 quando não há linha). A linha só muda de estado: o contexto, o mês e o tipo nunca mudam.
-- M5. Autoria: updated_by aponta para persons e é quem fez a última mudança (marcar ou desmarcar). A conta excluída (D-058) leva as
--     linhas do Pessoal e das Famílias que ela encerra (saem com o contexto, em cascata); numa Família que continua, a linha fica e a
--     autoria vira "Pessoa que saiu" (a linha anônima de persons), porque a chave estrangeira impede apagar a pessoa enquanto ela for
--     autora de algo.
-- M6. Marcar e desmarcar NÃO contam como anotação para a atividade de "Seus últimos meses" (D-030), como responder_guardar.
-- M7. Escrita só pelas duas funções (security definer, search_path fixo, só authenticated); sem insert, update nem delete diretos.
-- Ordem de travas: chave (consultiva da operação) -> (contexto, mês, tipo) (consultiva) -> linha da marca. A operação é a última
-- gravação, como em toda função de escrita (record_operations_actor_guard, X5 da 0015: conta_excluida).
--
-- months_overview ganha cinco colunas no fim, com os mesmos argumentos: received_checked e paid_checked (a marca vale: está ligada e o
-- mês não tem registro do tipo), received_check_version e paid_check_version (a versão da linha da marca, 0 sem linha: é a que o app
-- manda ao marcar e desmarcar) e card_purchase_count (compras no cartão vivas pela data da compra no mês; só informa, nunca entra em
-- Pago). O app publicado lê as colunas por nome e ignora as novas. Como o tipo de retorno muda, a função é recriada (drop e create) e
-- os privilégios são concedidos de novo no fim, como em toda migração.

-- ---------------------------------------------------------------------------
-- Marcas de "Conferi este mês"
-- ---------------------------------------------------------------------------
create table public.month_checks (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  month date not null,
  kind text not null,
  checked boolean not null,
  updated_by uuid not null references public.persons (id),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  constraint month_checks_unica unique (context_id, month, kind),
  constraint month_checks_mes check (extract(day from month) = 1),
  constraint month_checks_tipo check (kind in ('recebimentos', 'pagamentos'))
);
comment on table public.month_checks is
  'Marca de "Conferi este mês": a pessoa conferiu que o mês já terminado não teve recebimentos ou pagamentos (zero confirmado, P-022). '
  'Uma linha por contexto, mês e tipo, com o estado (checked) e a versão, que cresce 1 a cada marcar e desmarcar. Vale só enquanto o mês não tem registro do tipo; '
  'nunca muda um total. Escrita só por set_month_check e clear_month_check.';

-- M4: a linha só muda de estado, uma versão por vez (a identidade da marca nunca muda).
create or replace function public.month_checks_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.month <> old.month or new.kind <> old.kind
     or new.checked = old.checked or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger month_checks_guard
  before update on public.month_checks
  for each row execute function public.month_checks_guard();

-- Compras no cartão pela data da compra, por contexto (só a primeira parcela, uma por compra): a leitura de months_overview.
create index card_entries_purchased_on on public.card_entries (context_id, purchased_on)
  where kind = 'parcela' and installment_number = 1 and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (a da 0014, que a 0015 não mudou) mais as duas ações novas, sem alvo (o contexto já está em
-- context_id), no mesmo ramo de decidir_revisao e responder_guardar.
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
  'marcar_mes_conferido', 'desmarcar_mes_conferido'));
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
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Atividade: mesma função da 0014, sem contar também as duas ações novas (M6: conferir um mês não é anotar).
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
                    'marcar_mes_conferido', 'desmarcar_mes_conferido',
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
-- Resultado das duas funções (e da repetição da mesma chave): o estado atual da marca do contexto, mês e tipo. Sem execute para
-- authenticated: só as funções abaixo chamam. Sem linha: {checked: false, version: 0}; com a linha desligada: {checked: false,
-- version: n}, sem hora.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_month_check_result(p_context uuid, p_month date, p_kind text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('context_id', c.context_id, 'month', c.month, 'kind', c.kind, 'checked', c.checked,
                               'version', c.version, 'checked_at', case when c.checked then c.updated_at end)
       from public.month_checks c where c.context_id = p_context and c.month = p_month and c.kind = p_kind),
    jsonb_build_object('context_id', p_context, 'month', p_month, 'kind', p_kind, 'checked', false, 'version', 0, 'checked_at', null));
$$;

-- Validação comum (M1 e M2): o tipo e o mês (primeiro dia de um mês já terminado, no fuso de quem chama). A ordem dos códigos é a
-- das duas funções: tipo_invalido, depois mes_invalido.
create or replace function public.clarevo_month_check_validate(p_uid uuid, p_month date, p_kind text)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_cur date;
begin
  if p_kind is null or p_kind not in ('recebimentos', 'pagamentos') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  v_cur := date_trunc('month', public.clarevo_today(p_uid)::timestamp)::date;
  -- Datas não finitas são recusadas antes de qualquer conta: extract(day ...) delas é nulo.
  if p_month is null or not isfinite(p_month) or extract(day from p_month) <> 1 or p_month >= v_cur then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Marcar: "Conferi: não houve recebimentos (ou pagamentos) em {mês}". Ordem: sessão (nao_autenticado); chave (chave_invalida); trava da
-- chave; repetição (chave_reutilizada se a ação ou o hash mudam; nao_encontrado se a leitura do contexto se perdeu); sem_permissao
-- (escrita no contexto); tipo_invalido; mes_invalido; trava da marca; versao_desatualizada (marcar espera p_version igual à versão da
-- linha, 0 sem linha, e a marca desligada); mes_com_registros (o mês tem registro vivo do tipo; compra no cartão não é registro de
-- Pago); escrita (cria a linha com versão 1, ou liga a desligada e soma 1 à versão); operação. Recusa não grava nada (a chave pode
-- ser usada de novo). Retorno: {context_id, month, kind, checked, version, checked_at}; na repetição, o estado atual.
-- ---------------------------------------------------------------------------
create or replace function public.set_month_check(p_context uuid, p_month date, p_kind text, p_key text, p_version integer)
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
  v_row public.month_checks%rowtype;
  v_count bigint;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('marcar_mes_conferido', p_context, p_month, p_kind, p_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'marcar_mes_conferido' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_month_check_result(v_op.context_id, p_month, p_kind);
  end if;

  if not public.context_permission(p_context, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform public.clarevo_month_check_validate(v_uid, p_month, p_kind);

  -- A linha pode ainda não existir: a trava consultiva serializa quem marca e desmarca o mesmo mês e tipo; depois, a linha.
  perform pg_advisory_xact_lock(hashtext('conferido:' || p_context::text || ':' || p_month::text || ':' || p_kind));
  select * into v_row from public.month_checks where context_id = p_context and month = p_month and kind = p_kind for update;
  if p_version is distinct from coalesce(v_row.version, 0) or coalesce(v_row.checked, false) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_row.version, 0);
  end if;

  -- M3: o mesmo critério de months_overview e month_totals (registros vivos do tipo, pela data). Compra no cartão não conta: o que
  -- entra no Pago é o pagamento da fatura, que é um registro.
  select count(*) into v_count from public.financial_records r
   where r.context_id = p_context and r.deleted_at is null
     and r.kind = (case p_kind when 'recebimentos' then 'receita' else 'despesa' end)::public.record_kind
     and r.occurred_on >= p_month and r.occurred_on < (p_month + interval '1 month')::date;
  if v_count > 0 then
    raise exception 'mes_com_registros' using errcode = 'PT409';
  end if;

  if v_row.id is null then
    insert into public.month_checks (context_id, month, kind, checked, updated_by) values (p_context, p_month, p_kind, true, v_uid);
  else
    update public.month_checks set checked = true, version = version + 1, updated_by = v_uid, updated_at = now() where id = v_row.id;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'marcar_mes_conferido', p_context, v_hash, null, null, null);

  return public.clarevo_month_check_result(p_context, p_month, p_kind);
end;
$$;

-- ---------------------------------------------------------------------------
-- Desmarcar. Mesma ordem; no lugar de mes_com_registros, a linha precisa existir, estar ligada e p_version precisa ser a dela
-- (versao_desatualizada com versao_atual=0 quando não há linha, ou com a versão dela quando outro aparelho já desmarcou). Desmarcar vale
-- mesmo com registro no mês (a marca que deixou de valer também pode sair). A linha fica, desligada, com a versão somada de 1.
-- Retorno: o estado depois de desmarcar ({checked: false, version: n + 1}).
-- ---------------------------------------------------------------------------
create or replace function public.clear_month_check(p_context uuid, p_month date, p_kind text, p_key text, p_version integer)
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
  v_row public.month_checks%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('desmarcar_mes_conferido', p_context, p_month, p_kind, p_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'desmarcar_mes_conferido' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_month_check_result(v_op.context_id, p_month, p_kind);
  end if;

  if not public.context_permission(p_context, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform public.clarevo_month_check_validate(v_uid, p_month, p_kind);

  perform pg_advisory_xact_lock(hashtext('conferido:' || p_context::text || ':' || p_month::text || ':' || p_kind));
  select * into v_row from public.month_checks where context_id = p_context and month = p_month and kind = p_kind for update;
  if not found or not v_row.checked or p_version is distinct from v_row.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_row.version, 0);
  end if;

  update public.month_checks set checked = false, version = version + 1, updated_by = v_uid, updated_at = now() where id = v_row.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'desmarcar_mes_conferido', p_context, v_hash, null, null, null);

  return public.clarevo_month_check_result(p_context, p_month, p_kind);
end;
$$;

-- ---------------------------------------------------------------------------
-- Recebido e pago por mês (a mesma de antes, 0005), agora com a marca e as compras no cartão. received_checked e paid_checked: a
-- marca do tipo está ligada no mês e o mês não tem registro do tipo (M3). received_check_version e paid_check_version: a versão da linha
-- da marca (0 sem linha), que o app manda ao marcar e desmarcar. card_purchase_count: compras no cartão vivas pela data da compra no
-- mês (uma por compra, inclusive as importadas); só informa, não entra em Pago nem muda a marca. Mês sem anotação aparece com zeros e
-- false (nunca é omitido). Security invoker: a RLS de quem consulta vale (a de financial_records, a de card_entries e a de
-- month_checks). Mesma ordem de conferência: primeiro o período, depois a permissão.
-- ---------------------------------------------------------------------------
drop function public.months_overview(uuid, date, date);
create function public.months_overview(p_context_id uuid, p_from date, p_to date)
returns table (month date, received_count integer, received_cents bigint, paid_count integer, paid_cents bigint,
               received_checked boolean, paid_checked boolean, received_check_version integer, paid_check_version integer,
               card_purchase_count integer)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  -- Sem auxiliares: com security invoker, authenticated não executa clarevo_months_between.
  -- Datas não finitas ('infinity', '-infinity') são recusadas: extract(day ...) delas é nulo e a série de meses não terminaria.
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
     or extract(day from p_from) <> 1 or extract(day from p_to) <> 1
     or p_to < p_from or p_to > (p_from + interval '11 months')::date then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return query
  select g.m::date,
         (count(r.id) filter (where r.kind = 'receita'))::int,
         coalesce(sum(r.amount_cents) filter (where r.kind = 'receita'), 0)::bigint,
         (count(r.id) filter (where r.kind = 'despesa'))::int,
         coalesce(sum(r.amount_cents) filter (where r.kind = 'despesa'), 0)::bigint,
         (coalesce(cr.checked, false) and count(r.id) filter (where r.kind = 'receita') = 0),
         (coalesce(cp.checked, false) and count(r.id) filter (where r.kind = 'despesa') = 0),
         coalesce(cr.version, 0),
         coalesce(cp.version, 0),
         (select count(*)::int from public.card_entries e
           where e.context_id = p_context_id and e.kind = 'parcela' and e.installment_number = 1 and e.deleted_at is null
             and e.purchased_on >= g.m::date and e.purchased_on < (g.m + interval '1 month')::date)
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 month') as g(m)
    left join public.financial_records r
      on r.context_id = p_context_id and r.deleted_at is null
     and r.occurred_on >= g.m::date and r.occurred_on < (g.m + interval '1 month')::date
    left join public.month_checks cr
      on cr.context_id = p_context_id and cr.month = g.m::date and cr.kind = 'recebimentos'
    left join public.month_checks cp
      on cp.context_id = p_context_id and cp.month = g.m::date and cp.kind = 'pagamentos'
   group by g.m, cr.id, cp.id
   order by g.m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura: quem lê o contexto vê as marcas dele (vínculo revogado não vê nada; a empresa nunca lê). Sem escrita direta.
-- ---------------------------------------------------------------------------
alter table public.month_checks enable row level security;
create policy month_checks_read on public.month_checks for select to authenticated
  using (public.context_permission(context_id, 'read'));

-- A guarda e as funções de apoio não são executáveis por quem tem sessão (a revogação geral abaixo cuida de public, anon e
-- authenticated; no Supabase os privilégios padrão dão execute também a service_role, que também não precisa delas).
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['month_checks_guard()', 'clarevo_month_check_result(uuid, date, text)',
                             'clarevo_month_check_validate(uuid, date, text)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Privilégios: retirar os padrões e conceder só o necessário (a mesma lista da 0015, mais as duas funções de "Conferi este mês";
-- months_overview, recriada acima, ganha o execute de novo)
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

-- Conferi este mês (D-060, item 2): as únicas funções novas com execute para quem tem sessão; month_checks fica só com leitura (pela RLS),
-- e a guarda e as funções de apoio ficam sem execute.
grant execute on function public.set_month_check(uuid, date, text, text, integer) to authenticated;
grant execute on function public.clear_month_check(uuid, date, text, text, integer) to authenticated;

revoke select on public.family_invites from authenticated;
grant select (id, context_id, created_by, role, expires_at, used_at, used_by, cancelled_at, created_at)
  on public.family_invites to authenticated;

-- Licenças: a empresa lê as do próprio contrato e a pessoa lê a própria, sempre sem o resumo do código e sem a identidade de quem
-- aceitou (a pessoa lê o próprio benefício pela visão my_benefit). Nenhum insert, update nem delete direto.
revoke select on public.licenses from authenticated;
grant select (id, contract_id, invited_email, status, invited_at, activated_at, ended_at, cancelled_at, created_at)
  on public.licenses to authenticated;
