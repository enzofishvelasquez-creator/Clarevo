-- Clarevo · migração 0025 · Apagar de vez, depois de 6 meses, o que foi marcado como excluído (A7, aprovada em 04/11/2026; P-010).
-- Depois de 20261105000001_aceite.sql.
-- Excluir um item no app (registro, conta a pagar, gasto fixo, meta, movimento, cartão, lançamento, conta de origem, orçamento, limite ou
-- renda de referência) só marca a linha como excluída (deleted_at), para os totais e o histórico continuarem certos. A política promete
-- apagar de vez depois de 6 meses. O mesmo prazo vale para a Família encerrada (ended_at): depois de 6 meses, ela é apagada inteira.
--
-- Invariantes:
-- E1. clarevo_purge_deleted(p_before) apaga de vez as linhas com deleted_at antes de p_before, na ordem das chaves estrangeiras, e só
--     as que nada mais usa (nem item excluído há menos tempo, que ainda espera o prazo dele): um registro que ainda é o pagamento de um lançamento de cartão vivo, uma conta a pagar com registro, uma série
--     com conta a pagar, um cartão ou uma conta de origem com registro, conta a pagar ou movimento continuam até o que os usa sair.
-- E2. A Família encerrada antes de p_before é apagada inteira por clarevo_erase_context (o mesmo da exclusão da conta).
-- E3. Nada vivo é apagado. A conta de um gasto fixo excluída "só neste mês" (series_skipped) é o que impede a conta de voltar: ela só
--     sai junto com o gasto fixo, quando ele também foi excluído há mais de 6 meses (a regra S3 da série confere no fim da transação).
-- E5. Das operações com mais de 6 meses fica só o rastro técnico: o resumo do pedido (request_hash, de onde daria para tentar descobrir
--     valor e descrição) vira 'apagado'. A pessoa anônima ("Pessoa que saiu") sai quando não é mais autora de nada.
-- E4. Ninguém de fora executa (nem o app nem a chave de serviço): roda pelo agendamento do banco (pg_cron, docs/05 passo 12o) ou pela
--     equipe no SQL Editor. O padrão é agora menos 6 meses; devolve as contagens do que saiu, sem dado de ninguém.
--
-- Aplicar no SQL Editor depois da 0024 (docs/05, passo 12o). Testes em supabase/tests/99zzzz_apagar_excluidos.sql.

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
    'antes_de', p_before, 'familias', n_families, 'registros', n_records, 'lancamentos_cartao', n_entries, 'movimentos_meta', n_movements,
    'metas', n_goals, 'contas_a_pagar', n_commitments, 'series', n_series, 'cartoes', n_cards, 'contas_de_origem', n_accounts,
    'orcamentos', n_budgets, 'limites', n_limits, 'rendas_de_referencia', n_incomes, 'operacoes_resumidas', n_operations,
    'pessoas_anonimas', n_persons);
end;
$$;

revoke all on function public.clarevo_purge_deleted(timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.clarevo_purge_deleted(timestamptz) from service_role';
  end if;
end $$;
