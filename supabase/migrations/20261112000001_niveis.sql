-- Clarevo · migração 0034 · Níveis de conta (pedido do Enzo em 12/11/2026, D-095; docs/48_NIVEIS.md). Depois de 20261111000003_pix_mes_a_mes.sql.
-- A conta ganha um nível (Bronze, Prata, Ouro e Diamante) pelo quanto a pessoa já usa a Clarevo: 16 marcos do tipo "já fez alguma vez".
-- O nível NUNCA mede dinheiro (nenhum valor entra na conta) e nunca desce: os marcos saem do registro das operações da própria pessoa
-- (record_operations), que não se desfaz quando ela exclui um lançamento. Nada novo é guardado: my_account_marks só lê e devolve os 16
-- sinais de sim ou não da pessoa que chama; quantos marcos dão cada nível fica no app (packages/core/src/levels.ts).
-- Nenhum dado existente muda. Aplicar no SQL Editor (docs/05, passo 12z). Testes em supabase/tests/99zzzzzzzzzzzzzz_niveis.sql.

create or replace function public.my_account_marks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_marks jsonb;
begin
  if v_me is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  with ops as materialized (
    select o.action, o.record_id, o.created_at from public.record_operations o where o.actor_id = v_me
  )
  select jsonb_build_object(
    -- Anotou um gasto: um gasto anotado, uma compra no cartão ou um extrato importado.
    'gasto', exists (select 1 from ops o join public.financial_records r on r.id = o.record_id where o.action = 'criar' and r.kind = 'despesa')
             or exists (select 1 from ops where action in ('criar_compra_cartao', 'importar_extrato')),
    'recebimento', exists (select 1 from ops o join public.financial_records r on r.id = o.record_id where o.action = 'criar' and r.kind = 'receita'),
    'gasto_fixo', exists (select 1 from ops where action in ('criar_serie', 'criar_compromisso')),
    'guardar', exists (select 1 from ops where action = 'responder_guardar'),
    'meta', exists (select 1 from ops where action = 'criar_meta'),
    'aporte', exists (select 1 from ops where action = 'registrar_movimento_meta'),
    'orcamento', exists (select 1 from ops where action = 'definir_orcamento_categoria'),
    'renda', exists (select 1 from ops where action = 'definir_renda_referencia'),
    'cartao', exists (select 1 from ops where action = 'criar_cartao'),
    'investimento', exists (select 1 from ops where action = 'criar_investimento'),
    'conferiu', exists (select 1 from ops where action = 'marcar_mes_conferido'),
    'pagou', exists (select 1 from ops where action in ('pagar_compromisso', 'pagar_fatura')),
    -- Anotou em três meses diferentes (qualquer anotação, pelo mês de Brasília em que foi feita).
    'tres_meses', (select count(distinct date_trunc('month', o.created_at at time zone 'America/Sao_Paulo')) from ops o
                    where o.action in ('criar', 'criar_compra_cartao', 'pagar_compromisso', 'pagar_fatura', 'registrar_movimento_meta',
                                       'registrar_movimento_investimento', 'importar_extrato')) >= 3,
    'importou', exists (select 1 from ops where action = 'importar_extrato'),
    'telegram', exists (select 1 from ops where action = 'ligar_telegram'),
    'familia', exists (select 1 from ops where action in ('criar_familia', 'aceitar_convite_familia'))
  ) into v_marks;
  return v_marks;
end;
$$;

revoke all on function public.my_account_marks() from public, anon;
grant execute on function public.my_account_marks() to authenticated;
