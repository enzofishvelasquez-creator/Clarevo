-- Clarevo · migração 0041 · Níveis de conta: a queda por tempo sem anotar e o nível Esmeralda (decisão do Enzo em 17/11/2026, D-111,
-- que substitui partes da D-095; docs/48_NIVEIS.md). Depois de 20261116000001_foto_perfil.sql e das migrações 20261117000001 e
-- 20261117000002 (outras frentes). Depende da 20261117000002 só pela coluna financial_records.investment_movement_id (o rendimento
-- ligado a um recebimento, D-107), lida pelo marco 'inv_rendimento'.
--
-- (1) Seis marcos novos, "Investimentos e reserva", todos pelo uso (já fez alguma vez), nunca pelo valor: um aporte, uma atualização de
--     valor e um rendimento registrados num investimento já criado ('inv_aporte', 'inv_valor', 'inv_rendimento'; o que vem com
--     criar_investimento não conta; o rendimento também conta quando entra pelo recebimento ligado ao investimento, D-107, num
--     recebimento criado pela pessoa), o plano de aportes ('inv_plano'), um investimento ligado a uma meta ('inv_meta') e a reserva para
--     imprevistos criada pela pessoa com um plano por mês, no Pessoal ou na Família ('reserva_plano'). Investimentos só existem no
--     Pessoal (0032), então os cinco de investimento só acontecem lá. A Esmeralda (o Diamante e 4 dos 6) fica no app
--     (packages/core/src/levels.ts); os níveis de baixo continuam contando só os 18 marcos de antes, então nenhum nível muda por eles.
-- (2) A queda (D-111): o nível mostrado desce um degrau a cada 60 dias sem anotar nenhum gasto ou recebimento, com aviso a partir do 45º
--     dia; a conta é do app. O banco diz desde quando conta: account_level_clock guarda, por pessoa, quando o app com a regra leu o nível
--     pela primeira vez (started_at) e a última anotação de gasto ou recebimento já vista (last_note_at, guardada porque o registro das
--     operações perde linhas com a limpeza dos excluídos e a Família apagada). A contagem vale do maior dos dois: quem já estava parado
--     quando a regra chegou tem os 60 dias inteiros a partir da primeira leitura, com o aviso no 45º, e ninguém cai sem aviso.
--     Anotar é: um lançamento (também pelo WhatsApp e pelo Telegram), uma compra ou um encargo no cartão, uma conta ou uma fatura paga e
--     uma importação, no Pessoal ou numa Família (record_operations da própria pessoa). Nenhum valor, descrição nem contexto é guardado.
-- (3) my_account_marks continua aceitando a chamada do app anterior: sem parâmetro, devolve os marcos como antes (agora 24 chaves; o app
--     anterior lê só as 18 que conhece) e não começa a contagem (o app anterior não mostra o aviso). Com p_level_state = true (o app com a
--     D-111), começa ou atualiza a contagem e devolve {"marks": {...}, "idle_since": "AAAA-MM-DD", "last_note_on": "AAAA-MM-DD" ou null},
--     com os dias no fuso da pessoa. Só grava em account_marks e account_level_clock: não é anotação, não entra no registro das operações
--     e funciona também para a conta em "só ver e exportar".
-- (4) A exclusão da conta: account_level_clock some em cascata com a pessoa; no ramo anônimo (a pessoa ainda é autora numa Família que
--     continua), o gatilho clarevo_forget_anonymous apaga também a contagem.
-- Nenhum dado existente muda. Aplicar no SQL Editor (docs/05). Testes em supabase/tests/99zzzzzzzzzzzzzzzzzzzz_niveis_queda.sql.

-- (1) Os marcos novos na tabela dos alcançados.
alter table public.account_marks drop constraint account_marks_mark_check;
alter table public.account_marks add constraint account_marks_mark_check check (mark in (
  'gasto', 'recebimento', 'gasto_fixo', 'guardar', 'meta', 'aporte', 'orcamento', 'renda', 'cartao', 'investimento', 'pagou', 'tres_meses',
  'importou', 'telegram', 'familia', 'conta', 'limite', 'imagem',
  'inv_aporte', 'inv_valor', 'inv_rendimento', 'inv_plano', 'inv_meta', 'reserva_plano'));
comment on table public.account_marks is
  'Níveis de conta (D-095, D-111): os marcos "já fez alguma vez" que a pessoa alcançou, para o nível voltar a eles quando a pessoa volta a '
  'anotar. Só a pessoa, o marco e quando; nenhum valor nem dado financeiro. Escrita e leitura só por my_account_marks. Some com a pessoa.';

-- (2) A contagem do tempo sem anotar.
create table public.account_level_clock (
  person_id uuid primary key references public.persons (id) on delete cascade,
  started_at timestamptz not null default now(),
  last_note_at timestamptz
);
comment on table public.account_level_clock is
  'Níveis de conta (D-111): desde quando conta o tempo sem anotar de cada pessoa, o maior entre a primeira leitura do nível pelo app com a '
  'regra (started_at) e a última anotação de gasto ou recebimento já vista (last_note_at). Nenhum valor, descrição nem contexto. Escrita e '
  'leitura só por my_account_marks(true). Some com a pessoa.';
alter table public.account_level_clock enable row level security;
revoke all on public.account_level_clock from anon, authenticated;

-- (3) Os marcos e, com p_level_state, a contagem. A versão sem parâmetro (0034) sai: a chamada sem parâmetro cai nesta, pelo padrão.
drop function public.my_account_marks();
create function public.my_account_marks(p_level_state boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_live jsonb;
  v_marks jsonb;
  v_alive boolean;
  v_last timestamptz;
  v_clock public.account_level_clock%rowtype;
  v_tz text;
  v_since text;
  v_note text;
begin
  if v_me is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  with ops as materialized (
    select o.action, o.record_id, o.target_id, o.created_at from public.record_operations o where o.actor_id = v_me
  ),
  -- O que a pessoa importou (um extrato pode trazer só gastos ou só recebimentos; uma fatura traz compras no cartão): os lançamentos
  -- importados que ela criou.
  imported as materialized (
    select distinct r.kind::text as kind from public.financial_records r
     where r.created_by = v_me and r.import_key is not null and exists (select 1 from ops where action = 'importar_extrato')
    union
    select 'despesa' from public.card_entries c
     where c.created_by = v_me and c.import_key is not null and c.kind = 'parcela' and exists (select 1 from ops where action = 'importar_extrato')
  ),
  -- Movimentos registrados num investimento já criado (o alvo da operação é o movimento; o aporte e o valor do cadastro vêm com
  -- criar_investimento). Movimento excluído depois sai daqui, mas o marco alcançado fica guardado.
  inv_moves as materialized (
    select distinct m.kind from ops o join public.investment_movements m on m.id = o.target_id
     where o.action = 'registrar_movimento_investimento'
    -- O rendimento gravado pelo recebimento ligado ao investimento (D-107, financial_records.investment_movement_id), que entra pela
    -- ação do recebimento (criar ou editar), não por registrar_movimento_investimento: conta nos recebimentos criados pela pessoa.
    union
    select m.kind from public.financial_records r join public.investment_movements m on m.id = r.investment_movement_id
     where r.created_by = v_me and r.deleted_at is null and r.kind = 'receita' and m.kind = 'rendimento'
  )
  select jsonb_build_object(
    -- Anotou um gasto: um gasto anotado, uma compra no cartão, uma conta ou fatura paga (o pagamento vira gasto) ou um gasto importado.
    'gasto', exists (select 1 from ops o join public.financial_records r on r.id = o.record_id where o.action = 'criar' and r.kind = 'despesa')
             or exists (select 1 from ops where action in ('criar_compra_cartao', 'pagar_compromisso', 'pagar_fatura'))
             or exists (select 1 from imported where kind = 'despesa'),
    'recebimento', exists (select 1 from ops o join public.financial_records r on r.id = o.record_id where o.action = 'criar' and r.kind = 'receita')
             or exists (select 1 from imported where kind = 'receita'),
    'gasto_fixo', exists (select 1 from ops where action in ('criar_serie', 'criar_compromisso')),
    'guardar', exists (select 1 from ops where action = 'responder_guardar'),
    'meta', exists (select 1 from ops where action = 'criar_meta'),
    'aporte', exists (select 1 from ops where action = 'registrar_movimento_meta'),
    'orcamento', exists (select 1 from ops where action = 'definir_orcamento_categoria'),
    'renda', exists (select 1 from ops where action = 'definir_renda_referencia'),
    'cartao', exists (select 1 from ops where action = 'criar_cartao'),
    'investimento', exists (select 1 from ops where action = 'criar_investimento'),
    'pagou', exists (select 1 from ops where action in ('pagar_compromisso', 'pagar_fatura')),
    -- Anotou em três meses diferentes (qualquer anotação, pelo mês de Brasília em que foi feita).
    'tres_meses', (select count(distinct date_trunc('month', o.created_at at time zone 'America/Sao_Paulo')) from ops o
                    where o.action in ('criar', 'criar_compra_cartao', 'pagar_compromisso', 'pagar_fatura', 'registrar_movimento_meta',
                                       'registrar_movimento_investimento', 'importar_extrato')) >= 3,
    'importou', exists (select 1 from ops where action = 'importar_extrato'),
    'telegram', exists (select 1 from ops where action = 'ligar_telegram'),
    'familia', exists (select 1 from ops where action in ('criar_familia', 'aceitar_convite_familia')),
    'conta', exists (select 1 from ops where action = 'criar_conta'),
    'limite', exists (select 1 from ops where action = 'definir_limite_comprometimento'),
    'imagem', exists (select 1 from ops where action = 'imagem_meta'),
    -- Investimentos e reserva (D-111), pelo uso.
    'inv_aporte', exists (select 1 from inv_moves where kind = 'aporte'),
    'inv_valor', exists (select 1 from inv_moves where kind = 'valor'),
    'inv_rendimento', exists (select 1 from inv_moves where kind = 'rendimento'),
    'inv_plano', exists (select 1 from ops where action = 'definir_plano_investimentos'),
    'inv_meta', exists (select 1 from public.investments i where i.created_by = v_me and i.goal_id is not null),
    'reserva_plano', exists (select 1 from public.goals g where g.created_by = v_me and g.goal_type = 'emergencia' and g.deleted_at is null
                               and g.status <> 'arquivada' and g.planned_monthly_cents is not null)
  ) into v_live;

  -- Guarda os marcos que ficaram prontos (uma vez cada) e devolve o guardado ou o de agora. A trava da linha da pessoa (for key share)
  -- faz uma chamada no meio da exclusão da conta esperar a exclusão; depois dela, a pessoa não é achada e nada é gravado.
  perform 1 from public.persons p where p.id = v_me and p.deleted_at is null for key share;
  v_alive := found;
  if v_alive then
    insert into public.account_marks (person_id, mark)
    select v_me, e.key from jsonb_each(v_live) e where e.value = 'true'::jsonb
    on conflict do nothing;
  end if;
  select jsonb_object_agg(e.key, e.value = 'true'::jsonb or exists (select 1 from public.account_marks a where a.person_id = v_me and a.mark = e.key))
    into v_marks from jsonb_each(v_live) e;
  if not coalesce(p_level_state, false) then
    return v_marks;
  end if;

  -- A contagem (D-111): a última anotação de gasto ou recebimento, no Pessoal ou numa Família, e a primeira leitura com a regra.
  select max(o.created_at) into v_last from public.record_operations o
   where o.actor_id = v_me
     and o.action in ('criar', 'criar_compra_cartao', 'criar_encargo_cartao', 'pagar_compromisso', 'pagar_fatura', 'importar_extrato');
  if v_alive then
    insert into public.account_level_clock as c (person_id, last_note_at) values (v_me, v_last)
    on conflict (person_id) do update set last_note_at = excluded.last_note_at
     where excluded.last_note_at is not null and (c.last_note_at is null or excluded.last_note_at > c.last_note_at);
    select * into v_clock from public.account_level_clock where person_id = v_me;
  end if;
  if v_clock.person_id is not null then
    select p.time_zone into v_tz from public.persons p where p.id = v_me;
    begin
      v_since := to_char(greatest(v_clock.started_at, v_clock.last_note_at) at time zone coalesce(v_tz, 'America/Sao_Paulo'), 'YYYY-MM-DD');
      v_note := to_char(v_clock.last_note_at at time zone coalesce(v_tz, 'America/Sao_Paulo'), 'YYYY-MM-DD');
    exception when others then
      v_since := to_char(greatest(v_clock.started_at, v_clock.last_note_at) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
      v_note := to_char(v_clock.last_note_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
    end;
  end if;
  return jsonb_build_object('marks', v_marks, 'idle_since', v_since, 'last_note_on', v_note);
end;
$$;
comment on function public.my_account_marks(boolean) is
  'Níveis de conta (D-095, D-111): os marcos da própria pessoa (os alcançados ficam guardados). Sem parâmetro (app anterior), só os marcos; '
  'com true, {"marks", "idle_since", "last_note_on"}, e a primeira chamada assim começa a contagem do tempo sem anotar.';
revoke all on function public.my_account_marks(boolean) from public, anon;
grant execute on function public.my_account_marks(boolean) to authenticated;

-- (4) A pessoa que vira anônima na exclusão da conta (deleted_at preenchido só por clarevo_erase_person): sai o que é só dela.
create or replace function public.clarevo_forget_anonymous()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.account_marks where person_id = new.id;
  delete from public.account_level_clock where person_id = new.id;
  delete from public.billing_checkouts where person_id = new.id;
  delete from public.billing_pix_payments where person_id = new.id;
  return null;
end;
$$;
revoke all on function public.clarevo_forget_anonymous() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.account_level_clock from service_role';
    execute 'revoke all on function public.clarevo_forget_anonymous() from service_role';
  end if;
end $$;
