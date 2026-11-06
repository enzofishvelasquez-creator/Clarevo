-- Clarevo · migração 0027 · Categoria "Crédito e parcelas" (D-086). Depois de 20261106000001_assinatura_web.sql.
-- A sétima categoria padrão de gasto (packages/core/src/records.ts) entra onde o banco conhece a lista: a restrição de category_budgets,
-- set_category_budget (categoria_invalida fora da lista) e month_budget (sempre todas as categorias, na ordem de sempre; o app recusa
-- a leitura com número de linhas diferente de BUDGET_CATEGORIES). Os registros, as compras no cartão e a importação já aceitavam
-- qualquer categoria de até 40 caracteres: nada muda neles. Nenhum dado existente é alterado. As duas funções são recriadas com o
-- corpo da 0010, só com a lista nova (create or replace mantém os privilégios). Aplicar no SQL Editor depois da 0026 (docs/05, passo
-- 12q). Testes em supabase/tests/80_orcamento.sql (as sete linhas) e 99zzzzzz_categoria_credito.sql.

alter table public.category_budgets drop constraint category_budgets_categoria;
alter table public.category_budgets add constraint category_budgets_categoria
  check (category in ('Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Crédito e parcelas'));

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
  if p_category is null or p_category not in ('Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Crédito e parcelas') then
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
     where e.context_id = p_context_id and e.deleted_at is null
       and ((e.kind = 'parcela'
             and (date_trunc('month', e.purchased_on::timestamp) + make_interval(months => e.installment_number - 1))::date = p_month)
            or (e.kind = 'estorno' and e.source_month is null and e.invoice_month = p_month))
     group by e.category
  )
  select c.category,
         b.id, b.version, b.from_month, b.amount_cents,
         greatest(0::bigint, coalesce(s.cents, 0) + coalesce(k.cents, 0))::bigint
    from (values ('Moradia', 1), ('Mercado', 2), ('Transporte', 3), ('Saúde', 4), ('Educação', 5), ('Lazer', 6), ('Crédito e parcelas', 7)) as c (category, ord)
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
