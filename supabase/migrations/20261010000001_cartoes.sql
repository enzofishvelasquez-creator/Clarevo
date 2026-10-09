-- Clarevo · migração 0008 · cartões de crédito, faturas e chave da nota fiscal (D-037, D-038).
-- Depois de 20261009000003_metas.sql.
-- Cartões só por create_card, update_card, set_card_status e delete_card; lançamentos (compras com parcelas, encargos,
-- estornos) só por add_card_purchase, update_card_entry, delete_card_entry, add_card_charge e add_card_refund; faturas só por
-- pay_invoice e undo_invoice_payment: autoria da sessão, chave de idempotência por pessoa (o mesmo espaço das outras
-- operações), hash em JSON (D-021, regra 7), versão e exclusão lógica. O saldo anterior e o crédito levado à fatura
-- seguinte nascem e morrem dentro dessas funções; ninguém os cria à mão.
-- Compra no cartão NUNCA entra em Pago: só o pagamento da fatura (pay_invoice) cria o gasto, na data do pagamento.
-- Nunca se grava número completo do cartão, código de segurança ou validade: o cartão tem apelido e, se a pessoa quiser,
-- os 4 últimos dígitos. Nenhum CPF de nota fiscal: a chave de acesso de uma NF-e de emitente pessoa física carrega o CPF
-- dele, então o banco NUNCA guarda a chave: guarda só o resumo SHA-256 (64 caracteres hexadecimais minúsculos) da chave de
-- 44 caracteres normalizada (maiúsculas), calculado no aparelho (packages/core, receiptKeyDigest). A nota repetida continua
-- sendo detectada (mesmo resumo) e nenhum dado pessoal fica gravado. O banco confere só a forma do resumo; o dígito
-- verificador e o CNPJ (numérico ou alfanumérico) são conferidos pelo core antes de gerar o resumo.
--
-- Fatura: identificada pelo mês de vencimento (primeiro dia do mês), como os bancos fazem.
--   vencimento(M)  = dia de vencimento em M, limitado ao último dia do mês;
--   fechamento(M)  = dia de fechamento no mês do fechamento, limitado ao último dia dele; o mês do fechamento é M se
--                    o dia de vencimento é maior que o dia de fechamento, senão M - 1;
--   parcela 1 da compra de data D cai na primeira fatura M com D <= fechamento(M) (comprar no dia do fechamento ainda
--   entra nela; depois dele, vai para a seguinte) e as n - 1 parcelas seguem nas faturas dos meses seguintes.
--   Parcela k = total div n, com o resto de centavos na primeira. Total da fatura = parcelas + encargos + saldo anterior
--   - estornos. Aberta enquanto hoje <= fechamento; fechada depois; paga ou paga em parte com o pagamento.
-- Cada fatura com total maior que zero é UMA conta a pagar ("Fatura <apelido>", vencimento da fatura, valor = total),
-- mantida pelo banco dentro de cada gravação de cartão (clarevo_sync_card). Total zero ou negativo: nenhuma conta;
-- o crédito (total negativo) vira um estorno automático na fatura seguinte.
--
-- Invariantes (conferidas no fim da transação, também para escrita direta no banco):
-- C1. Conta da fatura viva = total dos lançamentos vivos da fatura; fatura com total maior que zero tem a conta.
-- C2. Parcelas vivas de uma compra: numeradas de 1 a n, somam o total da compra, primeira com o resto, uma por mês
--     seguido, mesma versão e mesmos dados; a compra inteira é viva ou excluída.
-- C3. Um único gasto vivo por pagamento de fatura, ligado à conta do mesmo cartão e mês; a diferença entre a conta e o gasto
--     existe como UM saldo anterior vivo na fatura seguinte, e só nesse caso.
-- C4. O estorno automático de uma fatura seguinte = crédito (total negativo) da anterior.
-- C5. Fatura paga não muda: encargos e estornos novos, e lançamentos alterados ou excluídos numa fatura paga, são recusados
--     (fatura_paga). Uma COMPRA nova (ou com data nova) cujo ciclo cairia numa fatura paga não é recusada: vai para a primeira
--     fatura seguinte livre (clarevo_first_free_month), para que pagar a fatura aberta cedo não trave o cartão.
-- C6. Nota fiscal: o resumo SHA-256 da chave de acesso é único por contexto entre gastos e compras no cartão vivos.
-- Ordem de travas: chave → cartão → compra (parcelas por número) → contas das faturas (por mês) → registro.
-- A atividade (gatilho de record_operations, 0005) é a última, como em toda escrita. Pagar fatura de outra pessoa exige
-- "editar de outras pessoas" (a conta da fatura leva a autoria de quem criou o cartão).

-- ---------------------------------------------------------------------------
-- Cartões
-- ---------------------------------------------------------------------------
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.financial_contexts (id) on delete cascade,
  nickname text not null check (nickname = btrim(nickname) and char_length(nickname) between 1 and 30),
  -- Só os 4 últimos dígitos (opcional). Nunca o número inteiro.
  last_digits text check (last_digits is null or last_digits ~ '^[0-9]{4}$'),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  limit_cents bigint check (limit_cents is null or limit_cents between 100 and 999999999),
  status text not null default 'ativo' check (status in ('ativo', 'arquivado')),
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.persons (id),
  constraint cards_id_context_key unique (id, context_id),
  constraint cards_exclusao check ((deleted_at is null) = (deleted_by is null)),
  -- O apelido não é lugar de número de cartão: 13 a 19 dígitos (ignorando todo caractere que não seja dígito: espaço,
  -- ponto, hífen, barra, vírgula, sublinhado...) são recusados.
  constraint cards_apelido_sem_numero check (regexp_replace(nickname, '[^0-9]', '', 'g') !~ '[0-9]{13,19}')
);
create index cards_ctx on public.cards (context_id) where deleted_at is null;
comment on table public.cards is
  'Cartões de crédito (D-037): apelido, 4 últimos dígitos opcionais, dias de fechamento e vencimento, limite opcional. Nunca o número inteiro.';

-- ---------------------------------------------------------------------------
-- Lançamentos do cartão
--   parcela        = uma parcela de uma compra (uma linha por parcela; purchase_id liga as parcelas; a primeira tem
--                    id = purchase_id); soma na fatura;
--   encargo        = juros, multa, IOF, anuidade ou tarifa informados pela pessoa; soma;
--   estorno        = devolução ou crédito; subtrai. Automático (source_month preenchido) quando a fatura anterior ficou
--                    com total negativo: o crédito é levado à seguinte;
--   saldo_anterior = o que sobrou de um pagamento parcial; soma na fatura seguinte. Só nasce em pay_invoice.
-- amount_cents é sempre positivo; o sinal vem do tipo.
-- ---------------------------------------------------------------------------
create table public.card_entries (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null,
  card_id uuid not null,
  kind text not null check (kind in ('parcela', 'encargo', 'estorno', 'saldo_anterior')),
  -- Fatura (mês de vencimento, primeiro dia do mês).
  invoice_month date not null check (extract(day from invoice_month) = 1),
  amount_cents bigint not null check (amount_cents between 1 and 999999999),
  description text check (description is null or (description = btrim(description) and char_length(description) between 1 and 80)),
  category text check (category is null or (category = btrim(category) and char_length(category) between 1 and 40)),
  -- Compra (só parcelas).
  purchase_id uuid,
  purchased_on date,
  installment_number smallint,
  installment_total smallint,
  purchase_total_cents bigint,
  -- Encargo.
  charge_kind text check (charge_kind is null or charge_kind in ('juros', 'multa', 'iof', 'anuidade', 'tarifa')),
  -- Saldo anterior e estorno automático: a fatura de origem (sempre o mês anterior).
  source_month date check (source_month is null or extract(day from source_month) = 1),
  -- Saldo anterior: o gasto do pagamento parcial que o criou.
  payment_record_id uuid references public.financial_records (id) on delete cascade,
  -- Resumo SHA-256 (64 hexadecimais minúsculos) da chave de acesso da nota fiscal, só na primeira parcela da compra.
  -- Nunca a chave: a de pessoa física carrega o CPF.
  receipt_key text check (receipt_key is null or receipt_key ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.persons (id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.persons (id),
  constraint card_entries_exclusao check ((deleted_at is null) = (deleted_by is null)),
  constraint card_entries_card_fk foreign key (card_id, context_id)
    references public.cards (id, context_id) on delete cascade,
  constraint card_entries_origem check (source_month is null or invoice_month = (source_month + interval '1 month')::date),
  -- Forma de cada tipo. Os "is not null" são explícitos: um check que dá NULL passa.
  constraint card_entries_forma check (
    (kind = 'parcela'
       and purchase_id is not null and purchased_on is not null and installment_total is not null
       and installment_number is not null and purchase_total_cents is not null
       and installment_total between 1 and 48 and installment_number between 1 and installment_total
       and purchase_total_cents between installment_total and 999999999 and amount_cents <= purchase_total_cents
       and description is not null and charge_kind is null and source_month is null and payment_record_id is null
       and (receipt_key is null or installment_number = 1))
    or (kind = 'encargo'
       and charge_kind is not null and description is null and category is null and purchase_id is null
       and purchased_on is null and installment_number is null and installment_total is null
       and purchase_total_cents is null and source_month is null and payment_record_id is null and receipt_key is null)
    or (kind = 'estorno'
       and charge_kind is null and purchase_id is null and purchased_on is null and installment_number is null
       and installment_total is null and purchase_total_cents is null and payment_record_id is null and receipt_key is null
       and ((source_month is null and description is not null)
            or (source_month is not null and description is null and category is null)))
    or (kind = 'saldo_anterior'
       and source_month is not null and payment_record_id is not null and description is null and category is null
       and charge_kind is null and purchase_id is null and purchased_on is null and installment_number is null
       and installment_total is null and purchase_total_cents is null and receipt_key is null))
);
create index card_entries_card_month on public.card_entries (card_id, invoice_month) where deleted_at is null;
create index card_entries_purchase on public.card_entries (purchase_id) where purchase_id is not null;
create index card_entries_payment on public.card_entries (payment_record_id) where payment_record_id is not null;
create unique index card_entries_one_installment on public.card_entries (purchase_id, installment_number)
  where kind = 'parcela' and deleted_at is null;
-- No máximo um saldo anterior e um crédito levado vivos por fatura de origem.
create unique index card_entries_one_carry on public.card_entries (card_id, source_month)
  where kind = 'saldo_anterior' and deleted_at is null;
create unique index card_entries_one_credit on public.card_entries (card_id, source_month)
  where kind = 'estorno' and source_month is not null and deleted_at is null;
-- C6: chave de acesso da nota única por contexto entre compras vivas (e, por gatilho, entre gastos e compras).
create unique index card_entries_receipt_key on public.card_entries (context_id, receipt_key)
  where receipt_key is not null and deleted_at is null;
comment on table public.card_entries is
  'Lançamentos de cartão (parcelas de compras, encargos, estornos e saldo anterior). Nunca entram em Pago: só o pagamento da fatura.';

-- ---------------------------------------------------------------------------
-- Contas a pagar: a conta da fatura (cartão e mês), com o fechamento para a marca "estimado"
-- ---------------------------------------------------------------------------
alter table public.commitments
  add column card_id uuid,
  add column invoice_month date,
  add column card_closing_on date,
  add constraint commitments_card_fk foreign key (card_id, context_id) references public.cards (id, context_id),
  add constraint commitments_cartao_par check (
    (card_id is null) = (invoice_month is null) and (card_id is null) = (card_closing_on is null)),
  add constraint commitments_cartao_mes check (invoice_month is null or extract(day from invoice_month) = 1),
  add constraint commitments_cartao_sem_serie check (card_id is null or series_id is null);
-- A marca "estimado" (valor que ainda pode mudar) também vale para a fatura aberta; "alterada só neste mês" e "excluída
-- só neste mês" continuam só de série.
alter table public.commitments drop constraint commitments_series_marcas;
alter table public.commitments add constraint commitments_series_marcas check (
  (series_id is not null or not (series_override or series_skipped))
  and (series_id is not null or card_id is not null or not amount_is_estimate));
create unique index commitments_one_live_invoice on public.commitments (card_id, invoice_month)
  where card_id is not null and deleted_at is null;
comment on column public.commitments.card_id is
  'Conta de fatura de cartão (com invoice_month): só muda pelas funções de cartão; update_commitment, delete_commitment, pay_commitment e undo_commitment_payment a recusam (conta_de_fatura).';

-- Gastos realizados: pagamento de fatura (cartão e mês) e chave de acesso da nota fiscal.
alter table public.financial_records
  add column card_id uuid,
  add column invoice_month date,
  add column receipt_key text,
  add constraint financial_records_card_fk foreign key (card_id, context_id) references public.cards (id, context_id),
  add constraint financial_records_cartao check (
    (card_id is null) = (invoice_month is null)
    and (card_id is null or (commitment_id is not null and kind = 'despesa' and extract(day from invoice_month) = 1))),
  add constraint financial_records_receipt_key check (receipt_key is null or (receipt_key ~ '^[0-9a-f]{64}$' and kind = 'despesa' and card_id is null));
create unique index financial_records_receipt_key on public.financial_records (context_id, receipt_key)
  where receipt_key is not null and deleted_at is null;
comment on column public.financial_records.card_id is
  'Pagamento de fatura (com invoice_month e commitment_id): criado só por pay_invoice; origem "Pagamento de fatura".';
comment on column public.financial_records.receipt_key is
  'Resumo SHA-256 (64 hexadecimais minúsculos) da chave de acesso da NF-e/NFC-e (a chave pode ter CPF; o resumo não a revela); único por contexto entre gastos e compras no cartão vivos.';

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (26 ações das migrações anteriores) mais as 11 de cartão. Todas as de cartão apontam
-- para o cartão em target_id. As quatro de cartão não apontam para mais nada; as cinco de lançamento (criar_compra_cartao,
-- alterar_lancamento_cartao, excluir_lancamento_cartao, criar_encargo_cartao e criar_estorno_cartao) apontam também para
-- o lançamento em entry_id (na compra, qualquer parcela da compra; ao criar, a primeira, que é o id da compra);
-- pagar_fatura e desfazer_pagamento_fatura apontam para a conta da fatura (commitment_id) e o gasto (record_id).
-- ---------------------------------------------------------------------------
alter table public.record_operations add column entry_id uuid;
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
  'pagar_fatura', 'desfazer_pagamento_fatura'));
-- entry_id só existe nas cinco ações de lançamento.
alter table public.record_operations add constraint record_operations_entry_check check (
  (entry_id is not null) = (action in ('criar_compra_cartao', 'alterar_lancamento_cartao', 'excluir_lancamento_cartao',
                                       'criar_encargo_cartao', 'criar_estorno_cartao')));
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
                 'criar_encargo_cartao', 'criar_estorno_cartao')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar') and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Funções puras (sem execute para authenticated)
-- ---------------------------------------------------------------------------

-- Último dia do mês de uma data.
create or replace function public.clarevo_month_last_day(p_month date)
returns integer
language sql
immutable
set search_path = public
as $$
  select extract(day from (date_trunc('month', p_month::timestamp) + interval '1 month' - interval '1 day'))::int
$$;

-- As três funções de data da fatura (invoice_due_on, invoice_closing_on e invoice_month_for) e my_today são as únicas
-- auxiliares com execute para authenticated: as visões card_items e invoice_items as chamam e o Postgres confere o execute
-- de quem consulta, mesmo em visão sem security_invoker. São puras (só dependem dos argumentos, e my_today devolve o dia da
-- própria pessoa); security definer para que as chamadas aninhadas (clarevo_month_last_day) não exijam execute.

-- Dia de hoje de quem consulta (fuso da pessoa; o gancho clarevo.today vale como em clarevo_today).
create or replace function public.my_today()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select public.clarevo_today(auth.uid())
$$;

-- Vencimento da fatura do mês p_month (primeiro dia do mês de vencimento): o dia de vencimento, limitado ao último dia.
create or replace function public.invoice_due_on(p_due_day integer, p_month date)
returns date
language sql
immutable
security definer
set search_path = public
as $$
  select (date_trunc('month', p_month::timestamp)::date
          + (least(p_due_day, public.clarevo_month_last_day(p_month)) - 1))::date
$$;

-- Fechamento da fatura do mês p_month: o dia de fechamento no mês do fechamento (limitado ao último dia dele). O mês do
-- fechamento é o da fatura se o dia de vencimento é MAIOR que o de fechamento; senão, o mês anterior.
create or replace function public.invoice_closing_on(p_closing_day integer, p_due_day integer, p_month date)
returns date
language sql
immutable
security definer
set search_path = public
as $$
  select (x.cm + (least(p_closing_day, public.clarevo_month_last_day(x.cm)) - 1))::date
    from (select case when p_due_day > p_closing_day then date_trunc('month', p_month::timestamp)::date
                      else (date_trunc('month', p_month::timestamp) - interval '1 month')::date end as cm) x
$$;

-- Mês da fatura (primeiro dia) que recebe a parcela 1 de uma compra feita em p_date: a primeira cujo fechamento não é
-- anterior à data. O fechamento cresce a cada mês; partindo de dois meses antes, termina em no máximo quatro passos.
create or replace function public.invoice_month_for(p_closing_day integer, p_due_day integer, p_date date)
returns date
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  v_m date := (date_trunc('month', p_date::timestamp) - interval '2 months')::date;
begin
  while p_date > public.invoice_closing_on(p_closing_day, p_due_day, v_m) loop
    v_m := (v_m + interval '1 month')::date;
  end loop;
  return v_m;
end;
$$;

-- Parcela k de n: total div n, com o resto de centavos na primeira.
create or replace function public.clarevo_installment_cents(p_total bigint, p_n integer, p_k integer)
returns bigint
language sql
immutable
set search_path = public
as $$
  select p_total / p_n + case when p_k = 1 then p_total % p_n else 0 end
$$;

create or replace function public.clarevo_month_name(p_month date)
returns text
language sql
immutable
set search_path = public
as $$
  select (array['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro',
                'novembro', 'dezembro'])[extract(month from p_month)::int]
$$;

-- Chave da nota guardada: resumo SHA-256 em 64 hexadecimais minúsculos. O resumo é da chave de acesso de 44 caracteres em
-- maiúsculas (NF-e ou NFC-e, com CNPJ numérico ou alfanumérico) e é calculado no aparelho: o banco não recebe a chave (que pode
-- carregar o CPF do emitente pessoa física) e por isso confere só a forma. Dígito verificador, UF, mês, CNPJ e modelo são
-- conferidos pelo core (parseAccessKey) antes de gerar o resumo.
create or replace function public.clarevo_receipt_key_valid(p_key text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_key ~ '^[0-9a-f]{64}$', false)
$$;

-- Mês seguinte (primeiro dia).
create or replace function public.clarevo_next_month(p_month date)
returns date
language sql
immutable
set search_path = public
as $$
  select (p_month + interval '1 month')::date
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos de proteção (defesa adicional: só as funções de cartão gravam)
-- ---------------------------------------------------------------------------

-- Podem mudar: apelido, final, dias, limite, situação, version (+1), updated_at e a exclusão.
create or replace function public.cards_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or old.deleted_at is not null or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger cards_guard
  before update on public.cards
  for each row execute function public.cards_guard();

-- Identidade, cartão, tipo, compra, número da parcela, origem, gasto do pagamento, chave da nota, autoria e criação nunca
-- mudam; excluído não muda mais; versão +1 por escrita.
create or replace function public.card_entries_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.card_id <> old.card_id or new.kind <> old.kind
     or new.purchase_id is distinct from old.purchase_id
     or new.installment_number is distinct from old.installment_number
     or new.source_month is distinct from old.source_month
     or new.payment_record_id is distinct from old.payment_record_id
     or new.receipt_key is distinct from old.receipt_key
     or new.created_by <> old.created_by or new.created_at <> old.created_at
     or old.deleted_at is not null or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger card_entries_guard
  before update on public.card_entries
  for each row execute function public.card_entries_guard();

-- Guarda das contas a pagar (0003): cartão e mês da fatura também nunca mudam; na conta paga, o fechamento não muda.
create or replace function public.commitments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.context_id <> old.context_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.currency <> old.currency
     or new.series_id is distinct from old.series_id
     or new.occurrence_number is distinct from old.occurrence_number
     or new.card_id is distinct from old.card_id
     or new.invoice_month is distinct from old.invoice_month
     or (old.series_skipped and not new.series_skipped) then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  -- Conta paga: o previsto (e a marca de estimado) não muda enquanto o pagamento existir.
  if old.status = 'quitado' and new.status = 'quitado'
     and (new.amount_cents <> old.amount_cents or new.due_on <> old.due_on or new.description <> old.description
          or new.category is distinct from old.category or new.amount_is_estimate <> old.amount_is_estimate
          or new.card_closing_on is distinct from old.card_closing_on) then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Guarda dos gastos (0002): pagamento de fatura (cartão e mês) e chave da nota também nunca mudam.
create or replace function public.financial_records_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.created_by <> old.created_by or new.context_id <> old.context_id
     or new.kind <> old.kind or new.created_at <> old.created_at
     or new.commitment_id is distinct from old.commitment_id
     or new.card_id is distinct from old.card_id
     or new.invoice_month is distinct from old.invoice_month
     or new.receipt_key is distinct from old.receipt_key then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Validações (mesmas regras do app em packages/core, na mesma ordem)
-- ---------------------------------------------------------------------------

-- Cartão: apelido (1 a 30, sem número de cartão), final (4 dígitos), dias (1 a 31) e limite (R$ 1,00 a R$ 9.999.999,99).
create or replace function public.clarevo_validate_card(
  p_nickname text, p_last_digits text, p_closing_day integer, p_due_day integer, p_limit_cents bigint
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_nickname is null or p_nickname = '' or char_length(p_nickname) > 30
     or regexp_replace(p_nickname, '[^0-9]', '', 'g') ~ '[0-9]{13,19}' then
    raise exception 'apelido_invalido' using errcode = '22023';
  end if;
  if p_last_digits is not null and p_last_digits !~ '^[0-9]{4}$' then
    raise exception 'final_invalido' using errcode = '22023';
  end if;
  if p_closing_day is null or p_closing_day not between 1 and 31 then
    raise exception 'dia_de_fechamento_invalido' using errcode = '22023';
  end if;
  if p_due_day is null or p_due_day not between 1 and 31 then
    raise exception 'dia_de_vencimento_invalido' using errcode = '22023';
  end if;
  if p_limit_cents is not null and (p_limit_cents < 100 or p_limit_cents > 999999999) then
    raise exception 'limite_invalido' using errcode = '22023';
  end if;
end;
$$;

-- Compra no cartão: valor, descrição, categoria, parcelas (1 a 48, cada uma com ao menos 1 centavo) e data (até hoje; do
-- primeiro dia do mês 48 meses antes do mês de hoje em diante, quando conferida).
create or replace function public.clarevo_validate_purchase(
  p_actor uuid, p_total_cents bigint, p_description text, p_category text, p_installments integer, p_purchased_on date,
  p_check_range boolean
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.clarevo_today(p_actor);
begin
  if p_total_cents is null or p_total_cents < 1 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_total_cents > 999999999 then
    raise exception 'valor_acima_do_limite' using errcode = '22023';
  end if;
  if p_description is null or p_description = '' then
    raise exception 'descricao_obrigatoria' using errcode = '22023';
  end if;
  if char_length(p_description) > 80 then
    raise exception 'descricao_longa' using errcode = '22023';
  end if;
  if p_category is not null and char_length(p_category) > 40 then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
  if p_installments is null or p_installments not between 1 and 48 or p_total_cents < p_installments then
    raise exception 'parcelas_invalidas' using errcode = '22023';
  end if;
  if p_purchased_on is null
     or (p_check_range and p_purchased_on < (date_trunc('month', v_today::timestamp) - interval '48 months')::date) then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  if p_purchased_on > v_today then
    raise exception 'data_futura' using errcode = '22023';
  end if;
end;
$$;

-- Fatura de um encargo ou estorno: primeiro dia de um mês, de 48 meses antes a 48 meses depois do mês de hoje (conferido
-- no intervalo só quando a fatura é nova ou muda). Tudo isso é mes_invalido.
create or replace function public.clarevo_validate_invoice_month(p_actor uuid, p_month date, p_check_range boolean)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cur date := date_trunc('month', public.clarevo_today(p_actor)::timestamp)::date;
begin
  if p_month is null or extract(day from p_month) <> 1
     or (p_check_range and (p_month < (v_cur - interval '48 months')::date or p_month > (v_cur + interval '48 months')::date)) then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.clarevo_validate_charge(p_charge_kind text, p_amount_cents bigint)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_charge_kind is null or p_charge_kind not in ('juros', 'multa', 'iof', 'anuidade', 'tarifa') then
    raise exception 'tipo_de_encargo_invalido' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 1 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_amount_cents > 999999999 then
    raise exception 'valor_acima_do_limite' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.clarevo_validate_refund(p_amount_cents bigint, p_description text, p_category text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_amount_cents is null or p_amount_cents < 1 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_amount_cents > 999999999 then
    raise exception 'valor_acima_do_limite' using errcode = '22023';
  end if;
  if p_description is null or p_description = '' then
    raise exception 'descricao_obrigatoria' using errcode = '22023';
  end if;
  if char_length(p_description) > 80 then
    raise exception 'descricao_longa' using errcode = '22023';
  end if;
  if p_category is not null and char_length(p_category) > 40 then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Travas e limites (sem execute para authenticated)
-- ---------------------------------------------------------------------------

-- Carrega o cartão para alteração, sem revelar se existe para quem não pode ler. Escrita no contexto sempre; p_owner:
-- cartão de outra pessoa só com "editar de outras pessoas" (alterar o cartão, pagar ou desfazer a fatura).
create or replace function public.clarevo_lock_card(p_card_id uuid, p_owner boolean)
returns public.cards
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_card public.cards%rowtype;
begin
  select * into v_card from public.cards where id = p_card_id for update;
  if not found or v_card.deleted_at is not null or not public.context_permission(v_card.context_id, 'read') then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if not public.context_permission(v_card.context_id, 'write')
     or (p_owner and v_card.created_by <> auth.uid() and not public.context_permission(v_card.context_id, 'edit_others')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v_card;
end;
$$;

-- Carrega o lançamento para alteração: trava o cartão (nao_encontrado, sem_permissao), as parcelas vivas da compra por
-- número e a linha. Lançamento automático (saldo anterior, crédito levado): lancamento_automatico. Lançamento de outra
-- pessoa exige "editar de outras pessoas".
create or replace function public.clarevo_lock_card_entry(p_entry_id uuid)
returns public.card_entries
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cid uuid;
  v_pid uuid;
  v_e public.card_entries%rowtype;
begin
  -- card_id e purchase_id são imutáveis: ler sem trava é seguro.
  select card_id, purchase_id into v_cid, v_pid from public.card_entries where id = p_entry_id;
  if v_cid is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  perform public.clarevo_lock_card(v_cid, false);
  if v_pid is not null then
    perform 1 from public.card_entries where purchase_id = v_pid and deleted_at is null order by installment_number for update;
  end if;
  select * into v_e from public.card_entries where id = p_entry_id for update;
  if not found or v_e.deleted_at is not null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if v_e.kind = 'saldo_anterior' or (v_e.kind = 'estorno' and v_e.source_month is not null) then
    raise exception 'lancamento_automatico' using errcode = 'PT409';
  end if;
  if v_e.created_by <> auth.uid() and not public.context_permission(v_e.context_id, 'edit_others') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v_e;
end;
$$;

-- Até 20 cartões ativos por contexto. A trava consultiva serializa a criação e a reativação.
create or replace function public.clarevo_check_card_limit(p_context_id uuid, p_card_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('cartoes:' || p_context_id::text));
  if (select count(*) from public.cards c
       where c.context_id = p_context_id and c.deleted_at is null and c.status = 'ativo'
         and c.id is distinct from p_card_id) >= 20 then
    raise exception 'limite_de_cartoes' using errcode = 'PT409';
  end if;
end;
$$;

-- Até 5.000 lançamentos vivos por cartão (cada parcela é um lançamento).
create or replace function public.clarevo_check_entry_cap(p_card_id uuid, p_adding integer)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.card_entries e where e.card_id = p_card_id and e.deleted_at is null) + p_adding > 5000 then
    raise exception 'limite_de_lancamentos' using errcode = 'PT409';
  end if;
end;
$$;

-- Fatura paga ou paga em parte: a conta viva do cartão e mês está quitada.
create or replace function public.clarevo_invoice_paid(p_card_id uuid, p_month date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.commitments c
                  where c.card_id = p_card_id and c.invoice_month = p_month and c.deleted_at is null and c.status = 'quitado')
$$;

-- Primeira fatura, a partir de p_from, em que as p_n parcelas seguidas não cruzam nenhuma fatura paga. Pagar a fatura aberta
-- antes do fechamento é permitido; as compras que ainda cairiam nela (ou numa fatura paga adiantada) vão para a primeira
-- fatura seguinte livre, em vez de serem recusadas: o dinheiro é conservado (a compra continua inteira em faturas a pagar) e a
-- pessoa continua podendo pagar o que falta. Termina porque cada volta passa do último mês pago encontrado.
create or replace function public.clarevo_first_free_month(p_card_id uuid, p_from date, p_n integer)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m date := p_from;
  v_paid date;
begin
  loop
    select max(c.invoice_month) into v_paid from public.commitments c
     where c.card_id = p_card_id and c.deleted_at is null and c.status = 'quitado'
       and c.invoice_month >= v_m and c.invoice_month <= (v_m + make_interval(months => p_n - 1))::date;
    exit when v_paid is null;
    v_m := (v_paid + interval '1 month')::date;
  end loop;
  return v_m;
end;
$$;

-- Chave da nota já anotada neste contexto (gasto ou compra no cartão vivos). A trava consultiva serializa a anotação.
-- Detalhe: registro=<id do gasto> ou compra=<id da compra>.
create or replace function public.clarevo_check_receipt_free(p_context_id uuid, p_key text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('nota:' || p_context_id::text || ':' || p_key));
  select r.id into v_id from public.financial_records r
   where r.context_id = p_context_id and r.receipt_key = p_key and r.deleted_at is null;
  if found then
    raise exception 'nota_ja_anotada' using errcode = 'PT409', detail = 'registro=' || v_id;
  end if;
  select e.purchase_id into v_id from public.card_entries e
   where e.context_id = p_context_id and e.receipt_key = p_key and e.deleted_at is null;
  if found then
    raise exception 'nota_ja_anotada' using errcode = 'PT409', detail = 'compra=' || v_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura derivada: limite usado e fatura atual do cartão, faturas
-- ---------------------------------------------------------------------------

-- Usado = soma, por fatura ainda não paga, de max(0, total da fatura) (parcelas + encargos + saldo anterior - estornos). O
-- crédito de uma fatura negativa é levado como estorno automático à seguinte, então somar com sinal contaria o crédito duas
-- vezes. Fatura atual = a que recebe uma compra de hoje (mês, fechamento e vencimento).
create or replace function public.clarevo_card_derived(p_card public.cards)
returns table (used_cents bigint, current_month date, current_closing_on date, current_due_on date)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sum(greatest(0, t.total))
                     from (select e.invoice_month, sum(case when e.kind = 'estorno' then -e.amount_cents else e.amount_cents end) as total
                             from public.card_entries e
                            where e.card_id = p_card.id and e.deleted_at is null
                            group by e.invoice_month) t
                    where not exists (select 1 from public.commitments m
                                       where m.card_id = p_card.id and m.invoice_month = t.invoice_month
                                         and m.deleted_at is null and m.status = 'quitado')), 0)::bigint,
         x.m,
         public.invoice_closing_on(p_card.closing_day, p_card.due_day, x.m),
         public.invoice_due_on(p_card.due_day, x.m)
    from (select public.invoice_month_for(p_card.closing_day, p_card.due_day, public.clarevo_today(auth.uid())) as m) x
$$;

-- Sem security_invoker e com security_barrier, como series_items (0003): o filtro de permissão é explícito. Só chama
-- funções que authenticated executa (my_today, invoice_*_on, invoice_month_for e context_permission).
create view public.card_items with (security_barrier = true) as
select c.id, c.context_id, c.nickname, c.last_digits, c.closing_day, c.due_day, c.limit_cents, c.status, c.created_by,
       c.version, c.created_at, c.updated_at,
       coalesce((select sum(greatest(0, t.total))
                   from (select e.invoice_month, sum(case when e.kind = 'estorno' then -e.amount_cents else e.amount_cents end) as total
                           from public.card_entries e
                          where e.card_id = c.id and e.deleted_at is null
                          group by e.invoice_month) t
                  where not exists (select 1 from public.commitments m
                                     where m.card_id = c.id and m.invoice_month = t.invoice_month
                                       and m.deleted_at is null and m.status = 'quitado')), 0)::bigint as used_cents,
       x.m as current_month,
       public.invoice_closing_on(c.closing_day, c.due_day, x.m) as current_closing_on,
       public.invoice_due_on(c.due_day, x.m) as current_due_on
  from public.cards c
  cross join lateral (select public.invoice_month_for(c.closing_day, c.due_day, public.my_today()) as m) x
 where c.deleted_at is null and public.context_permission(c.context_id, 'read');
comment on view public.card_items is
  'Cartões não excluídos que quem consulta pode ler, com o limite usado e a fatura atual (a que recebe uma compra de hoje).';

-- Uma linha por fatura (cartão e mês) que tenha lançamento vivo ou conta viva. status: aberta (hoje <= fechamento),
-- fechada, paga ou paga_em_parte (o gasto do pagamento é menor que a conta; a diferença está no saldo anterior da
-- fatura seguinte). total_cents = parcelas + encargos + saldo anterior - estornos (pode ser negativo: crédito levado à
-- seguinte). commitment_version é a versão a mandar em pay_invoice e undo_invoice_payment.
create view public.invoice_items with (security_barrier = true) as
select b.card_id, b.context_id, b.month, b.closing_on, b.due_on,
       case when b.commitment_status = 'quitado'
              then case when b.paid_cents < b.commitment_amount_cents then 'paga_em_parte' else 'paga' end
            when public.my_today() <= b.closing_on then 'aberta'
            else 'fechada' end as status,
       b.total_cents, b.purchases_cents, b.charges_cents, b.carried_in_cents, b.refunds_cents,
       greatest(0, -b.total_cents)::bigint as credit_cents,
       b.entry_count,
       b.commitment_id, b.commitment_version,
       -- Marca "estimado" calculada na hora, com o fechamento e o dia de quem consulta: a gravada em commitments só é atualizada
       -- por uma gravação de cartão ou por sync_series_occurrences e fica velha depois do dia do fechamento. Conta paga: falso.
       (b.commitment_status is distinct from 'quitado' and public.my_today() <= b.closing_on) as amount_is_estimate,
       case when b.commitment_status = 'aberto' then b.commitment_amount_cents else 0::bigint end as to_pay_cents,
       b.paid_record_id, b.paid_cents, b.paid_on, b.paid_account_id,
       case when b.commitment_status = 'quitado' then b.commitment_amount_cents - b.paid_cents end as left_over_cents
  from (
    select k.card_id, c.context_id, k.invoice_month as month,
           coalesce(m.card_closing_on, public.invoice_closing_on(c.closing_day, c.due_day, k.invoice_month)) as closing_on,
           coalesce(m.due_on, public.invoice_due_on(c.due_day, k.invoice_month)) as due_on,
           coalesce(e.total_cents, 0)::bigint as total_cents,
           coalesce(e.purchases_cents, 0)::bigint as purchases_cents,
           coalesce(e.charges_cents, 0)::bigint as charges_cents,
           coalesce(e.carried_in_cents, 0)::bigint as carried_in_cents,
           coalesce(e.refunds_cents, 0)::bigint as refunds_cents,
           coalesce(e.entry_count, 0)::integer as entry_count,
           m.id as commitment_id, m.version as commitment_version, m.status::text as commitment_status,
           m.amount_cents as commitment_amount_cents,
           r.id as paid_record_id, r.amount_cents as paid_cents, r.occurred_on as paid_on, r.account_id as paid_account_id
      from (select x.card_id, x.invoice_month from public.card_entries x where x.deleted_at is null
            union
            select y.card_id, y.invoice_month from public.commitments y where y.card_id is not null and y.deleted_at is null) k
      join public.cards c on c.id = k.card_id and c.deleted_at is null
      left join (select n.card_id, n.invoice_month,
                        sum(case when n.kind = 'estorno' then -n.amount_cents else n.amount_cents end) as total_cents,
                        sum(n.amount_cents) filter (where n.kind = 'parcela') as purchases_cents,
                        sum(n.amount_cents) filter (where n.kind = 'encargo') as charges_cents,
                        sum(n.amount_cents) filter (where n.kind = 'saldo_anterior') as carried_in_cents,
                        sum(n.amount_cents) filter (where n.kind = 'estorno') as refunds_cents,
                        count(*) as entry_count
                   from public.card_entries n where n.deleted_at is null
                  group by n.card_id, n.invoice_month) e
             on e.card_id = k.card_id and e.invoice_month = k.invoice_month
      left join public.commitments m on m.card_id = k.card_id and m.invoice_month = k.invoice_month and m.deleted_at is null
      left join public.financial_records r on r.commitment_id = m.id and r.deleted_at is null
     where public.context_permission(c.context_id, 'read')
  ) b;
comment on view public.invoice_items is
  'Faturas dos cartões que quem consulta pode ler: total, composição, situação, conta a pagar e pagamento. Calculada, nunca gravada.';

-- Lançamentos do cartão como o core os lê: a compra é UM lançamento (id = id da compra, a primeira parcela; valor total;
-- número de parcelas; fatura da primeira parcela; versão da compra); encargo, estorno e saldo anterior, um cada. As
-- parcelas de cada fatura estão em card_entries. Só chama context_permission.
create view public.card_entry_items with (security_barrier = true) as
select e.id, e.context_id, e.card_id,
       case e.kind when 'parcela' then 'compra' else e.kind end as kind,
       e.description, e.category, e.charge_kind, e.purchased_on,
       coalesce(e.purchase_total_cents, e.amount_cents) as amount_cents,
       coalesce(e.installment_total, 1)::integer as installments,
       e.invoice_month, e.source_month, e.payment_record_id, e.receipt_key,
       e.created_by, e.version, e.created_at, e.updated_at
  from public.card_entries e
 where e.deleted_at is null and (e.kind <> 'parcela' or e.installment_number = 1)
   and public.context_permission(e.context_id, 'read');
comment on view public.card_entry_items is
  'Lançamentos vivos dos cartões que quem consulta pode ler, com a compra como um lançamento (kind compra, valor total, parcelas).';

-- Nota já anotada, para o aviso "Esta nota já foi anotada" logo depois de escanear (antes do Salvar): uma linha por gasto
-- vivo ou compra viva no cartão (primeira parcela) que tem chave. receipt_key é o resumo SHA-256 da chave (nunca a chave).
-- record_id preenchido = gasto; card_entry_id preenchido = compra no cartão (id da compra) e card_id o cartão. O app consulta
-- com context_id e receipt_key (índices únicos parciais já existem) e abre o registro ou a compra. Só chama context_permission.
create view public.receipt_items with (security_barrier = true) as
select r.context_id, r.receipt_key, r.id as record_id, null::uuid as card_entry_id, null::uuid as card_id
  from public.financial_records r
 where r.receipt_key is not null and r.deleted_at is null and public.context_permission(r.context_id, 'read')
union all
select e.context_id, e.receipt_key, null::uuid, e.purchase_id, e.card_id
  from public.card_entries e
 where e.receipt_key is not null and e.deleted_at is null and public.context_permission(e.context_id, 'read');
comment on view public.receipt_items is
  'Notas fiscais já anotadas (gasto ou compra no cartão vivos) que quem consulta pode ler, pelo resumo da chave: ler antes de Salvar para avisar "Esta nota já foi anotada".';

-- ---------------------------------------------------------------------------
-- Resultados (JSON) das onze funções de cartão: {card, entry, entries, invoices, commitments, commitment, record}
--   card:        linha de card_items (mais deleted_at e deleted_by), no estado atual;
--   entry:       o lançamento envolvido no formato de card_entry_items (mais deleted_at e deleted_by): a compra é UM
--                lançamento. null nas funções de cartão; em pay_invoice e undo_invoice_payment, o saldo anterior criado
--                (ou excluído), se houver;
--   entries:     as linhas de card_entries envolvidas (todas as parcelas da compra; o lançamento; o saldo anterior do
--                pagamento), na situação atual (na exclusão, com deleted_at); [] nas funções de cartão;
--   invoices:    linhas de invoice_items das faturas envolvidas que ainda existem;
--   commitments: todas as contas de fatura vivas do cartão (formato de commitment_items), já com o valor mantido na mesma
--                transação;
--   commitment:  a conta da fatura paga ou reaberta (pay_invoice e undo_invoice_payment); null nas outras;
--   record:      o gasto do pagamento (criado) ou desfeito (excluído, o rastro); null nas outras.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_card_json(p_card_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(c) || to_jsonb(d)
    from public.cards c
    cross join lateral public.clarevo_card_derived(c) d
   where c.id = p_card_id
$$;

create or replace function public.clarevo_invoice_json(p_card_id uuid, p_month date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(i) from public.invoice_items i where i.card_id = p_card_id and i.month = p_month
$$;

-- Lançamento no formato da visão card_entry_items (mais deleted_at e deleted_by): a compra é UM lançamento (id = id da
-- compra, a primeira parcela), com o valor total e o número de parcelas. Aceita o id de qualquer parcela.
create or replace function public.clarevo_entry_json(p_entry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'id', e.id, 'context_id', e.context_id, 'card_id', e.card_id,
           'kind', case e.kind when 'parcela' then 'compra' else e.kind end,
           'description', e.description, 'category', e.category, 'charge_kind', e.charge_kind, 'purchased_on', e.purchased_on,
           'amount_cents', coalesce(e.purchase_total_cents, e.amount_cents),
           'installments', coalesce(e.installment_total, 1)::integer,
           'invoice_month', e.invoice_month, 'source_month', e.source_month, 'payment_record_id', e.payment_record_id,
           'receipt_key', e.receipt_key, 'created_by', e.created_by, 'version', e.version, 'created_at', e.created_at,
           'updated_at', e.updated_at, 'deleted_at', e.deleted_at, 'deleted_by', e.deleted_by)
    from public.card_entries e
   where e.id = (select coalesce(x.purchase_id, x.id) from public.card_entries x where x.id = p_entry_id)
$$;

create or replace function public.clarevo_card_result(
  p_card_id uuid, p_entry_id uuid, p_entries jsonb, p_months date[], p_commitment_id uuid, p_record_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'card', public.clarevo_card_json(p_card_id),
    'entry', case when p_entry_id is null then null else public.clarevo_entry_json(p_entry_id) end,
    'entries', coalesce(p_entries, '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(public.clarevo_invoice_json(p_card_id, u.m) order by u.m)
                            from (select distinct m from unnest(p_months) m) u
                           where public.clarevo_invoice_json(p_card_id, u.m) is not null), '[]'::jsonb),
    'commitments', coalesce((select jsonb_agg(public.clarevo_commitment_json(c.id) order by c.invoice_month)
                               from public.commitments c where c.card_id = p_card_id and c.deleted_at is null), '[]'::jsonb),
    'commitment', case when p_commitment_id is null then null else public.clarevo_commitment_json(p_commitment_id) end,
    'record', (select to_jsonb(r) from public.financial_records r where r.id = p_record_id))
$$;

-- Resultado de um lançamento: compra = todas as parcelas vivas (ou, excluída, as excluídas por último).
create or replace function public.clarevo_card_entry_result(p_entry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_e public.card_entries%rowtype;
  v_rows jsonb;
  v_months date[];
begin
  select * into v_e from public.card_entries where id = p_entry_id;
  if not found then
    return null;
  end if;
  if v_e.purchase_id is not null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.installment_number), '[]'::jsonb), array_agg(x.invoice_month)
      into v_rows, v_months
      from public.card_entries x
     where x.purchase_id = v_e.purchase_id
       and (x.deleted_at is null
            or (not exists (select 1 from public.card_entries y where y.purchase_id = v_e.purchase_id and y.deleted_at is null)
                and x.deleted_at = (select max(z.deleted_at) from public.card_entries z where z.purchase_id = v_e.purchase_id)));
  else
    v_rows := jsonb_build_array(to_jsonb(v_e));
    v_months := array[v_e.invoice_month];
  end if;
  return public.clarevo_card_result(v_e.card_id, v_e.id, v_rows, v_months, null, null);
end;
$$;

-- Resultado de pagar ou desfazer o pagamento de uma fatura: o saldo anterior que o pagamento criou (se houver; no
-- desfazer, já excluído), as faturas do mês e do seguinte, a conta e o gasto.
create or replace function public.clarevo_pay_result(p_card_id uuid, p_month date, p_commitment_id uuid, p_record_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.clarevo_card_result(
    p_card_id,
    (select e.id from public.card_entries e where e.payment_record_id = p_record_id order by e.created_at limit 1),
    (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb)
       from public.card_entries e where e.payment_record_id = p_record_id),
    array[p_month, public.clarevo_next_month(p_month)],
    p_commitment_id, p_record_id)
$$;

-- ---------------------------------------------------------------------------
-- Manutenção da conta da fatura e do crédito levado (dentro de cada gravação de cartão)
-- Do mês p_from ao mês p_to (primeiros dias de mês), em ordem crescente:
--  1. Total da fatura = lançamentos vivos. Total > 0: a conta existe e acompanha o total, o vencimento, o fechamento, o
--     apelido e a marca "estimado" (aberta: hoje <= fechamento); total <= 0: a conta é excluída. Conta paga não muda
--     (total diferente do pago: fatura_paga).
--  2. Total negativo: o crédito vira UM estorno automático na fatura seguinte (criado, ajustado ou excluído conforme o
--     crédito); a fatura seguinte entra na rodada. O crédito só é levado adiante enquanto houver, na fatura seguinte ou
--     depois dela, algum lançamento comum (parcela, encargo, estorno comum ou saldo anterior) para recebê-lo: sem isso ele
--     fica na própria fatura, com total negativo, e o encadeamento não corre para o infinito. A rodada começa na fatura
--     negativa mais antiga, para que um lançamento novo mais adiante receba o crédito que estava parado e para que a
--     exclusão do último lançamento comum desfaça o encadeamento. Fatura seguinte paga não aceita mudança:
--     fatura_seguinte_paga.
-- Quem chama já travou o cartão. As contas são travadas em ordem crescente de mês.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_sync_card(p_card_id uuid, p_from date, p_to date)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := public.clarevo_today(auth.uid());
  v_card public.cards%rowtype;
  v_m date := p_from;
  v_to date := p_to;
  v_next date;
  v_t bigint;
  v_c public.commitments%rowtype;
  v_a public.card_entries%rowtype;
  v_due date;
  v_closing date;
  v_est boolean;
  v_desc text;
  v_credit bigint;
  v_changed boolean;
  v_guard integer := 0;
  v_neg date;
  v_last date;
begin
  if p_from is null or p_to is null or p_from > p_to then
    return;
  end if;
  select * into v_card from public.cards where id = p_card_id;
  v_desc := 'Fatura ' || v_card.nickname;
  select min(x.m) into v_neg
    from (select e.invoice_month as m from public.card_entries e
           where e.card_id = p_card_id and e.deleted_at is null
           group by e.invoice_month
          having sum(case when e.kind = 'estorno' then -e.amount_cents else e.amount_cents end) < 0) x;
  v_m := least(p_from, coalesce(v_neg, p_from));
  select max(e.invoice_month) into v_last from public.card_entries e
   where e.card_id = p_card_id and e.deleted_at is null and not (e.kind = 'estorno' and e.source_month is not null);
  while v_m <= v_to loop
    v_guard := v_guard + 1;
    if v_guard > 700 then
      raise exception 'fatura_inconsistente' using errcode = '23514';
    end if;
    v_next := public.clarevo_next_month(v_m);
    select coalesce(sum(case when e.kind = 'estorno' then -e.amount_cents else e.amount_cents end), 0)::bigint into v_t
      from public.card_entries e where e.card_id = p_card_id and e.invoice_month = v_m and e.deleted_at is null;
    select * into v_c from public.commitments c
     where c.card_id = p_card_id and c.invoice_month = v_m and c.deleted_at is null for update;
    if v_c.id is not null and v_c.status = 'quitado' then
      if v_t <> v_c.amount_cents then
        raise exception 'fatura_paga' using errcode = 'PT409';
      end if;
    else
      v_due := public.invoice_due_on(v_card.due_day, v_m);
      v_closing := public.invoice_closing_on(v_card.closing_day, v_card.due_day, v_m);
      v_est := v_today <= v_closing;
      if v_t > 999999999 then
        raise exception 'valor_acima_do_limite' using errcode = '22023';
      end if;
      if v_t > 0 then
        if v_c.id is null then
          insert into public.commitments (context_id, description, amount_cents, currency, due_on, status, created_by,
                                          amount_is_estimate, card_id, invoice_month, card_closing_on)
          values (v_card.context_id, v_desc, v_t, (select currency from public.financial_contexts where id = v_card.context_id),
                  v_due, 'aberto', v_card.created_by, v_est, p_card_id, v_m, v_closing);
        elsif v_c.amount_cents <> v_t or v_c.due_on <> v_due or v_c.description <> v_desc
              or v_c.amount_is_estimate <> v_est or v_c.card_closing_on <> v_closing then
          update public.commitments
             set amount_cents = v_t, due_on = v_due, description = v_desc, amount_is_estimate = v_est,
                 card_closing_on = v_closing, version = version + 1
           where id = v_c.id;
        end if;
      elsif v_c.id is not null then
        update public.commitments set deleted_at = now(), deleted_by = v_uid, version = version + 1 where id = v_c.id;
      end if;
    end if;

    -- Crédito levado à fatura seguinte.
    v_credit := case when v_next <= v_last then greatest(0, -v_t) else 0 end;
    select * into v_a from public.card_entries e
     where e.card_id = p_card_id and e.source_month = v_m and e.kind = 'estorno' and e.deleted_at is null for update;
    v_changed := false;
    if v_credit > 0 then
      if v_a.id is null then
        if public.clarevo_invoice_paid(p_card_id, v_next) then
          raise exception 'fatura_seguinte_paga' using errcode = 'PT409';
        end if;
        insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, source_month, created_by)
        values (v_card.context_id, p_card_id, 'estorno', v_next, v_credit, v_m, v_uid);
        v_changed := true;
      elsif v_a.amount_cents <> v_credit then
        if public.clarevo_invoice_paid(p_card_id, v_next) then
          raise exception 'fatura_seguinte_paga' using errcode = 'PT409';
        end if;
        update public.card_entries set amount_cents = v_credit, version = version + 1 where id = v_a.id;
        v_changed := true;
      end if;
    elsif v_a.id is not null then
      if public.clarevo_invoice_paid(p_card_id, v_next) then
        raise exception 'fatura_seguinte_paga' using errcode = 'PT409';
      end if;
      update public.card_entries set deleted_at = now(), deleted_by = v_uid, version = version + 1 where id = v_a.id;
      v_changed := true;
    end if;
    if v_changed then
      v_to := greatest(v_to, v_next);
    end if;
    v_m := v_next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invariantes C1 a C4 e C6, conferidas no fim da transação (no modelo de clarevo_check_commitment_payment).
-- Defesa de último nível: as funções de cartão nunca as disparam; elas pegam escrita manual no banco.
-- ---------------------------------------------------------------------------

-- C1 de uma fatura: a conta acompanha o total; fatura paga tem o gasto do pagamento.
create or replace function public.clarevo_check_card_month(p_card_id uuid, p_month date)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t bigint;
  v_c public.commitments%rowtype;
begin
  select coalesce(sum(case when e.kind = 'estorno' then -e.amount_cents else e.amount_cents end), 0) into v_t
    from public.card_entries e where e.card_id = p_card_id and e.invoice_month = p_month and e.deleted_at is null;
  select * into v_c from public.commitments c where c.card_id = p_card_id and c.invoice_month = p_month and c.deleted_at is null;
  if found then
    if v_c.amount_cents <> v_t then
      raise exception 'fatura_inconsistente' using errcode = '23514';
    end if;
    if v_c.status = 'quitado' and not exists (select 1 from public.financial_records r
                                               where r.commitment_id = v_c.id and r.deleted_at is null
                                                 and r.card_id = p_card_id and r.invoice_month = p_month) then
      raise exception 'fatura_inconsistente' using errcode = '23514';
    end if;
  elsif v_t > 0 then
    raise exception 'fatura_inconsistente' using errcode = '23514';
  end if;
end;
$$;

-- C4, no cartão inteiro: o estorno automático de cada fatura é o crédito (total negativo) da anterior, e só existe
-- enquanto houver, naquela fatura ou depois dela, um lançamento comum para recebê-lo. Numa só passada sobre os lançamentos
-- do cartão (agrupados por mês e ligados por mês, sem subconsulta correlacionada por mês): custa O(lançamentos), não
-- O(meses x lançamentos), porque o gatilho de consistência roda uma vez por linha alterada (uma compra em 48 parcelas
-- dispara 48 vezes).
create or replace function public.clarevo_check_card_credit(p_card_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (
    with tot as (select e.invoice_month as m,
                        sum(case when e.kind = 'estorno' then -e.amount_cents else e.amount_cents end) as t,
                        coalesce(sum(e.amount_cents) filter (where e.kind = 'estorno' and e.source_month is not null), 0) as a,
                        bool_or(not (e.kind = 'estorno' and e.source_month is not null)) as regular
                   from public.card_entries e where e.card_id = p_card_id and e.deleted_at is null
                  group by e.invoice_month),
         lastm as (select max(t.m) as lm from tot t where t.regular),
         months as (select t.m from tot t union select (t.m + interval '1 month')::date from tot t)
    select 1 from months x
      left join tot cur on cur.m = x.m
      left join tot prev on prev.m = (x.m - interval '1 month')::date
     where coalesce(cur.a, 0)
        <> case when x.m <= (select lm from lastm) then greatest(0, -coalesce(prev.t, 0)) else 0 end) then
    raise exception 'fatura_inconsistente' using errcode = '23514';
  end if;
end;
$$;

-- C2: as parcelas vivas de uma compra.
create or replace function public.clarevo_check_purchase(p_purchase_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
begin
  select count(*) as cnt, min(installment_total) as tmin, max(installment_total) as tmax,
         min(purchase_total_cents) as pmin, max(purchase_total_cents) as pmax, sum(amount_cents) as total,
         min(installment_number) as nmin, max(installment_number) as nmax, count(distinct installment_number) as ndist,
         count(distinct version) as vdist,
         count(distinct md5(concat_ws('|', description, coalesce(category, ''), purchased_on, card_id))) as cdist
    into v from public.card_entries where purchase_id = p_purchase_id and deleted_at is null;
  if v.cnt = 0 then
    return;
  end if;
  if v.tmin <> v.tmax or v.pmin <> v.pmax or v.cnt <> v.tmax or v.ndist <> v.cnt or v.nmin <> 1 or v.nmax <> v.cnt
     or v.total <> v.pmax or v.vdist <> 1 or v.cdist <> 1 then
    raise exception 'compra_inconsistente' using errcode = '23514';
  end if;
  if not exists (select 1 from public.card_entries f where f.purchase_id = p_purchase_id and f.installment_number = 1
                    and f.deleted_at is null)
     or exists (select 1 from public.card_entries e
                  join public.card_entries f on f.purchase_id = e.purchase_id and f.installment_number = 1 and f.deleted_at is null
                 where e.purchase_id = p_purchase_id and e.deleted_at is null
                   and (e.amount_cents <> public.clarevo_installment_cents(e.purchase_total_cents, e.installment_total, e.installment_number)
                        or e.invoice_month <> (f.invoice_month + make_interval(months => e.installment_number - 1))::date)) then
    raise exception 'compra_inconsistente' using errcode = '23514';
  end if;
end;
$$;

-- C3: o gasto de um pagamento de fatura e o saldo anterior que ele deixou.
create or replace function public.clarevo_check_invoice_payment(p_record_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r public.financial_records%rowtype;
  v_c public.commitments%rowtype;
  v_n integer;
  v_s bigint;
begin
  select * into v_r from public.financial_records where id = p_record_id;
  if not found or v_r.deleted_at is not null or v_r.card_id is null then
    -- Gasto apagado, excluído ou que não paga fatura: nenhum saldo anterior vivo pode depender dele.
    if exists (select 1 from public.card_entries e where e.payment_record_id = p_record_id and e.deleted_at is null) then
      raise exception 'fatura_inconsistente' using errcode = '23514';
    end if;
    return;
  end if;
  select * into v_c from public.commitments c where c.id = v_r.commitment_id;
  if not found or v_c.card_id is distinct from v_r.card_id or v_c.invoice_month is distinct from v_r.invoice_month
     or v_c.deleted_at is not null or v_r.amount_cents > v_c.amount_cents then
    raise exception 'fatura_inconsistente' using errcode = '23514';
  end if;
  select count(*), coalesce(sum(e.amount_cents), 0) into v_n, v_s
    from public.card_entries e where e.payment_record_id = v_r.id and e.deleted_at is null;
  if v_c.amount_cents = v_r.amount_cents then
    if v_n <> 0 then
      raise exception 'fatura_inconsistente' using errcode = '23514';
    end if;
  elsif v_n <> 1 or v_s <> v_c.amount_cents - v_r.amount_cents
        or not exists (select 1 from public.card_entries e
                        where e.payment_record_id = v_r.id and e.deleted_at is null and e.kind = 'saldo_anterior'
                          and e.card_id = v_r.card_id and e.source_month = v_r.invoice_month) then
    raise exception 'fatura_inconsistente' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.clarevo_check_card_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id uuid;
  v_months date[] := '{}';
  v_pid uuid;
  v_rid uuid;
  v_src date;
  v_card public.cards%rowtype;
  v_m date;
begin
  if tg_table_name = 'cards' then
    v_card_id := new.id;
  elsif tg_table_name = 'card_entries' then
    if tg_op = 'DELETE' then
      v_card_id := old.card_id; v_months := array[old.invoice_month]; v_pid := old.purchase_id;
      v_rid := old.payment_record_id; v_src := old.source_month;
    else
      v_card_id := new.card_id; v_months := array[new.invoice_month]; v_pid := new.purchase_id;
      v_rid := new.payment_record_id; v_src := new.source_month;
      if tg_op = 'UPDATE' then
        v_months := v_months || old.invoice_month;
      end if;
    end if;
  elsif tg_table_name = 'commitments' then
    if tg_op = 'DELETE' then
      v_card_id := old.card_id; v_months := array[old.invoice_month];
    else
      v_card_id := new.card_id; v_months := array[new.invoice_month];
    end if;
  else
    if tg_op = 'DELETE' then
      v_card_id := old.card_id; v_months := array[old.invoice_month]; v_rid := old.id;
    else
      v_card_id := new.card_id; v_months := array[new.invoice_month]; v_rid := new.id;
    end if;
  end if;
  select * into v_card from public.cards where id = v_card_id;
  -- Cartão (ou contexto inteiro) apagado na mesma transação: não sobra fatura para conferir.
  if not found then
    return null;
  end if;
  if v_card.deleted_at is not null
     and (exists (select 1 from public.card_entries e where e.card_id = v_card_id and e.deleted_at is null)
          or exists (select 1 from public.commitments c where c.card_id = v_card_id and c.deleted_at is null)) then
    raise exception 'fatura_inconsistente' using errcode = '23514';
  end if;
  foreach v_m in array v_months loop
    perform public.clarevo_check_card_month(v_card_id, v_m);
    perform public.clarevo_check_card_month(v_card_id, public.clarevo_next_month(v_m));
  end loop;
  if v_src is not null then
    perform public.clarevo_check_card_month(v_card_id, v_src);
  end if;
  perform public.clarevo_check_card_credit(v_card_id);
  if v_pid is not null then
    perform public.clarevo_check_purchase(v_pid);
  end if;
  if v_rid is not null then
    perform public.clarevo_check_invoice_payment(v_rid);
  end if;
  return null;
end;
$$;

create constraint trigger cards_consistency
  after update on public.cards
  deferrable initially deferred
  for each row when (new.deleted_at is not null)
  execute function public.clarevo_check_card_consistency();
create constraint trigger card_entries_consistency
  after insert or update on public.card_entries
  deferrable initially deferred
  for each row execute function public.clarevo_check_card_consistency();
create constraint trigger card_entries_consistency_del
  after delete on public.card_entries
  deferrable initially deferred
  for each row execute function public.clarevo_check_card_consistency();
create constraint trigger commitments_card_consistency
  after insert or update on public.commitments
  deferrable initially deferred
  for each row when (new.card_id is not null)
  execute function public.clarevo_check_card_consistency();
create constraint trigger commitments_card_consistency_del
  after delete on public.commitments
  deferrable initially deferred
  for each row when (old.card_id is not null)
  execute function public.clarevo_check_card_consistency();
create constraint trigger records_card_consistency
  after insert or update on public.financial_records
  deferrable initially deferred
  for each row when (new.card_id is not null)
  execute function public.clarevo_check_card_consistency();
create constraint trigger records_card_consistency_del
  after delete on public.financial_records
  deferrable initially deferred
  for each row when (old.card_id is not null)
  execute function public.clarevo_check_card_consistency();

-- C6: a chave da nota é única entre gastos e compras no cartão vivos do contexto (cada tabela tem o índice próprio; este
-- gatilho cobre as duas juntas, com a mesma trava consultiva de clarevo_check_receipt_free).
create or replace function public.clarevo_check_receipt_unique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('nota:' || new.context_id::text || ':' || new.receipt_key));
  if (select count(*) from public.financial_records r
       where r.context_id = new.context_id and r.receipt_key = new.receipt_key and r.deleted_at is null)
     + (select count(*) from public.card_entries e
         where e.context_id = new.context_id and e.receipt_key = new.receipt_key and e.deleted_at is null) > 1 then
    raise exception 'nota_ja_anotada' using errcode = '23505';
  end if;
  return null;
end;
$$;

create constraint trigger records_receipt_unique
  after insert or update on public.financial_records
  deferrable initially deferred
  for each row when (new.receipt_key is not null and new.deleted_at is null)
  execute function public.clarevo_check_receipt_unique();
create constraint trigger card_entries_receipt_unique
  after insert or update on public.card_entries
  deferrable initially deferred
  for each row when (new.receipt_key is not null and new.deleted_at is null)
  execute function public.clarevo_check_receipt_unique();

-- ---------------------------------------------------------------------------
-- Cartões: criar, alterar, situação e excluir (atômico, idempotente, versionado).
-- Estrutura comum: sessão; chave; textos aparados; hash de jsonb_build_array(ação, argumentos)::text; trava da chave;
-- repetição (ação e hash iguais, leitura do contexto; devolve o estado atual); permissão e travas; versão; situação;
-- validação; escrita; operação com target_id. Recusa não grava operação (a chave pode ser usada de novo).
-- ---------------------------------------------------------------------------

-- Cadastra o cartão (ativo, versão 1). Até 20 cartões ativos por contexto.
create or replace function public.create_card(
  p_idempotency_key text,
  p_context_id uuid,
  p_nickname text,
  p_last_digits text,
  p_closing_day integer,
  p_due_day integer,
  p_limit_cents bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := public.clarevo_trim(p_nickname);
  v_digits text := nullif(public.clarevo_trim(p_last_digits), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_card public.cards%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('criar_cartao', p_context_id, v_nickname, v_digits, p_closing_day, p_due_day,
                                  p_limit_cents)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'criar_cartao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_card_result(v_op.target_id, null, null, null, null, null);
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform public.clarevo_validate_card(v_nickname, v_digits, p_closing_day, p_due_day, p_limit_cents);
  perform public.clarevo_check_card_limit(p_context_id, null);

  insert into public.cards (context_id, nickname, last_digits, closing_day, due_day, limit_cents, created_by)
  values (p_context_id, v_nickname, v_digits, p_closing_day, p_due_day, p_limit_cents, v_uid)
  returning * into v_card;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'criar_cartao', p_context_id, v_hash, null, null, v_card.id);

  return public.clarevo_card_result(v_card.id, null, null, null, null, null);
end;
$$;

-- Altera apelido, final, dias e limite. As compras já feitas ficam nas faturas em que foram lançadas; as contas das faturas
-- em aberto seguem o apelido e os dias novos (vencimento e fechamento); as pagas não mudam.
create or replace function public.update_card(
  p_idempotency_key text,
  p_card_id uuid,
  p_expected_version integer,
  p_nickname text,
  p_last_digits text,
  p_closing_day integer,
  p_due_day integer,
  p_limit_cents bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := public.clarevo_trim(p_nickname);
  v_digits text := nullif(public.clarevo_trim(p_last_digits), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_card public.cards%rowtype;
  v_from date;
  v_to date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('alterar_cartao', p_card_id, p_expected_version, v_nickname, v_digits, p_closing_day,
                                  p_due_day, p_limit_cents)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'alterar_cartao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_card_result(v_op.target_id, null, null, null, null, null);
  end if;

  v_card := public.clarevo_lock_card(p_card_id, true);
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_card.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_card.version;
  end if;
  perform public.clarevo_validate_card(v_nickname, v_digits, p_closing_day, p_due_day, p_limit_cents);

  update public.cards
     set nickname = v_nickname, last_digits = v_digits, closing_day = p_closing_day, due_day = p_due_day,
         limit_cents = p_limit_cents, version = version + 1
   where id = v_card.id
  returning * into v_card;

  select min(x.m), max(x.m) into v_from, v_to
    from (select e.invoice_month as m from public.card_entries e where e.card_id = v_card.id and e.deleted_at is null
          union all
          select c.invoice_month from public.commitments c where c.card_id = v_card.id and c.deleted_at is null) x;
  perform public.clarevo_sync_card(v_card.id, v_from, v_to);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'alterar_cartao', v_card.context_id, v_hash, null, null, v_card.id);

  return public.clarevo_card_result(v_card.id, null, null, null, null, null);
end;
$$;

-- Arquivar (não recebe compras novas; as faturas e os lançamentos continuam) e reativar ('ativo', 'arquivado').
-- Reativar respeita o limite de 20 cartões ativos.
create or replace function public.set_card_status(
  p_idempotency_key text,
  p_card_id uuid,
  p_expected_version integer,
  p_status text
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
  v_card public.cards%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('situacao_cartao', p_card_id, p_expected_version, p_status)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'situacao_cartao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_card_result(v_op.target_id, null, null, null, null, null);
  end if;

  v_card := public.clarevo_lock_card(p_card_id, true);
  if p_expected_version is distinct from v_card.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_card.version;
  end if;
  if p_status is null or p_status not in ('ativo', 'arquivado') then
    raise exception 'situacao_invalida' using errcode = '22023';
  end if;
  if v_card.status = 'arquivado' and p_status = 'ativo' then
    perform public.clarevo_check_card_limit(v_card.context_id, v_card.id);
  end if;

  update public.cards set status = p_status, version = version + 1 where id = v_card.id
  returning * into v_card;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'situacao_cartao', v_card.context_id, v_hash, null, null, v_card.id);

  return public.clarevo_card_result(v_card.id, null, null, null, null, null);
end;
$$;

-- Exclui o cartão (exclusão lógica). Só sem lançamento vivo e sem conta de fatura viva (cartao_com_lancamentos).
create or replace function public.delete_card(
  p_idempotency_key text,
  p_card_id uuid,
  p_expected_version integer
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
  v_card public.cards%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_cartao', p_card_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_cartao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_card_result(v_op.target_id, null, null, null, null, null);
  end if;

  v_card := public.clarevo_lock_card(p_card_id, true);
  if p_expected_version is distinct from v_card.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_card.version;
  end if;
  if exists (select 1 from public.card_entries e where e.card_id = v_card.id and e.deleted_at is null)
     or exists (select 1 from public.commitments c where c.card_id = v_card.id and c.deleted_at is null) then
    raise exception 'cartao_com_lancamentos' using errcode = 'PT409';
  end if;

  update public.cards set deleted_at = now(), deleted_by = v_uid, version = version + 1 where id = v_card.id
  returning * into v_card;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'excluir_cartao', v_card.context_id, v_hash, null, null, v_card.id);

  return public.clarevo_card_result(v_card.id, null, null, null, null, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lançamentos: compra (com parcelas), encargo e estorno. Escrita no contexto basta (como create_record); alterar ou
-- excluir o lançamento de outra pessoa exige "editar de outras pessoas". Fatura paga não recebe nem perde lançamento
-- (fatura_paga). O banco mantém a conta de cada fatura afetada na mesma transação (clarevo_sync_card).
-- ---------------------------------------------------------------------------

-- Compra no cartão: p_installments parcelas (1 a 48) a partir da fatura que contém a data da compra. Cartão arquivado
-- não recebe compra (cartao_arquivado). p_receipt_key: resumo SHA-256 da chave de acesso da nota (opcional, só na primeira
-- parcela). Fatura paga (por exemplo, paga antes do fechamento): a compra NÃO é recusada; ela vai para a primeira fatura
-- seguinte em que nenhuma parcela cruza fatura paga (clarevo_first_free_month), e a conta dessa fatura cresce.
-- Ordem: sessão; chave; repetição; trava (nao_encontrado, sem_permissao); cartao_arquivado; validação (valor_invalido,
-- valor_acima_do_limite, descricao_obrigatoria, descricao_longa, categoria_invalida, parcelas_invalidas, data_invalida,
-- data_futura); chave da nota (chave_de_nota_invalida, nota_ja_anotada); limite_de_lancamentos; escrita.
create or replace function public.add_card_purchase(
  p_idempotency_key text,
  p_card_id uuid,
  p_purchased_on date,
  p_total_cents bigint,
  p_installments integer,
  p_description text,
  p_category text default null,
  p_receipt_key text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := public.clarevo_trim(p_description);
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_receipt text := nullif(public.clarevo_trim(p_receipt_key), '');
  v_args jsonb;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_card public.cards%rowtype;
  v_m1 date;
  v_first uuid := gen_random_uuid();
  k integer;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_args := jsonb_build_array('criar_compra_cartao', p_card_id, p_purchased_on, p_total_cents, p_installments,
                              v_description, v_category);
  if v_receipt is not null then
    v_args := v_args || jsonb_build_array(v_receipt);
  end if;
  v_hash := md5(v_args::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'criar_compra_cartao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_card_entry_result(v_op.entry_id);
  end if;

  v_card := public.clarevo_lock_card(p_card_id, false);
  if v_card.status <> 'ativo' then
    raise exception 'cartao_arquivado' using errcode = 'PT409';
  end if;
  perform public.clarevo_validate_purchase(v_uid, p_total_cents, v_description, v_category, p_installments, p_purchased_on, true);
  if v_receipt is not null then
    if not public.clarevo_receipt_key_valid(v_receipt) then
      raise exception 'chave_de_nota_invalida' using errcode = '22023';
    end if;
    perform public.clarevo_check_receipt_free(v_card.context_id, v_receipt);
  end if;
  perform public.clarevo_check_entry_cap(v_card.id, p_installments);
  v_m1 := public.clarevo_first_free_month(v_card.id, public.invoice_month_for(v_card.closing_day, v_card.due_day, p_purchased_on),
                                          p_installments);

  for k in 1 .. p_installments loop
    insert into public.card_entries (id, context_id, card_id, kind, invoice_month, amount_cents, description, category,
                                     purchase_id, purchased_on, installment_number, installment_total, purchase_total_cents,
                                     receipt_key, created_by)
    values (case when k = 1 then v_first else gen_random_uuid() end, v_card.context_id, v_card.id, 'parcela',
            (v_m1 + make_interval(months => k - 1))::date, public.clarevo_installment_cents(p_total_cents, p_installments, k),
            v_description, v_category, v_first, p_purchased_on, k, p_installments, p_total_cents,
            case when k = 1 then v_receipt end, v_uid);
  end loop;
  perform public.clarevo_sync_card(v_card.id, v_m1, (v_m1 + make_interval(months => p_installments - 1))::date);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id, entry_id)
  values (v_uid, p_idempotency_key, 'criar_compra_cartao', v_card.context_id, v_hash, null, null, v_card.id, v_first);

  return public.clarevo_card_entry_result(v_first);
end;
$$;

-- Alterar um lançamento, com a versão dele (nas parcelas, a versão é a mesma em todas as da compra). p_kind é o tipo do
-- lançamento ('compra', 'encargo' ou 'estorno') e precisa ser o dele (tipo_invalido).
--   compra (todas as parcelas): p_amount_cents = valor total; p_occurred_on = data da compra; p_description;
--     p_category; p_installments. Sem mudar valor, data nem parcelas, só descrição e categoria mudam (também com
--     parcelas em fatura paga). Com mudança, nenhuma parcela de hoje ou de depois pode estar em fatura paga (fatura_paga);
--     a primeira fatura só é recalculada se a data muda (e então vai para a primeira fatura livre, como em add_card_purchase);
--     mais parcelas ou menos parcelas ajustam o fim da compra.
--   encargo: p_amount_cents; p_charge_kind; p_invoice_month.
--   estorno: p_amount_cents; p_description; p_category; p_invoice_month.
-- Campo que não se aplica ao tipo, se vier preenchido: campo_nao_se_aplica. Saldo anterior e crédito levado:
-- lancamento_automatico. A data da compra e a fatura de encargo ou estorno só são conferidas no intervalo quando mudam.
-- Ordem: sessão; chave; repetição; trava (nao_encontrado, sem_permissao, lancamento_automatico); tipo_invalido; versão;
-- campos que não se aplicam; validação na ordem de add_*; fatura_paga; escrita.
create or replace function public.update_card_entry(
  p_idempotency_key text,
  p_entry_id uuid,
  p_expected_version integer,
  p_kind text,
  p_amount_cents bigint,
  p_occurred_on date,
  p_description text,
  p_category text,
  p_installments integer default null,
  p_invoice_month date default null,
  p_charge_kind text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := nullif(public.clarevo_trim(p_description), '');
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_e public.card_entries%rowtype;
  v_card public.cards%rowtype;
  v_first public.card_entries%rowtype;
  v_old_n integer;
  v_n integer;
  v_m1 date;
  v_month date;
  v_from date;
  v_to date;
  v_change boolean;
  k integer;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('alterar_lancamento_cartao', p_entry_id, p_expected_version, p_kind, p_amount_cents,
                                  p_occurred_on, v_description, v_category, p_installments, p_invoice_month,
                                  p_charge_kind)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'alterar_lancamento_cartao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_card_entry_result(v_op.entry_id);
  end if;

  v_e := public.clarevo_lock_card_entry(p_entry_id);
  select * into v_card from public.cards where id = v_e.card_id;
  if p_kind is distinct from (case v_e.kind when 'parcela' then 'compra' else v_e.kind end) then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_e.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_e.version;
  end if;

  if v_e.kind = 'parcela' then
    if p_invoice_month is not null or p_charge_kind is not null then
      raise exception 'campo_nao_se_aplica' using errcode = '22023';
    end if;
    select * into v_first from public.card_entries
     where purchase_id = v_e.purchase_id and installment_number = 1 and deleted_at is null;
    perform public.clarevo_validate_purchase(v_uid, p_amount_cents, v_description, v_category, p_installments, p_occurred_on,
                                             p_occurred_on is distinct from v_first.purchased_on);
    v_old_n := v_first.installment_total;
    v_n := p_installments;
    v_change := p_amount_cents <> v_first.purchase_total_cents or v_n <> v_old_n or p_occurred_on <> v_first.purchased_on;
    if v_change then
      v_m1 := case when p_occurred_on = v_first.purchased_on then v_first.invoice_month
                   else public.clarevo_first_free_month(v_card.id, public.invoice_month_for(v_card.closing_day, v_card.due_day, p_occurred_on), v_n) end;
      if exists (select 1 from public.card_entries x
                  where x.purchase_id = v_e.purchase_id and x.deleted_at is null
                    and public.clarevo_invoice_paid(x.card_id, x.invoice_month)) then
        raise exception 'fatura_paga' using errcode = 'PT409';
      end if;
      for k in 0 .. v_n - 1 loop
        if public.clarevo_invoice_paid(v_card.id, (v_m1 + make_interval(months => k))::date) then
          raise exception 'fatura_paga' using errcode = 'PT409';
        end if;
      end loop;
      if v_n > v_old_n then
        perform public.clarevo_check_entry_cap(v_card.id, v_n - v_old_n);
      end if;
      v_from := least(v_first.invoice_month, v_m1);
      v_to := greatest((v_first.invoice_month + make_interval(months => v_old_n - 1))::date,
                       (v_m1 + make_interval(months => v_n - 1))::date);
      for k in 1 .. v_n loop
        v_month := (v_m1 + make_interval(months => k - 1))::date;
        if k <= v_old_n then
          update public.card_entries
             set invoice_month = v_month, amount_cents = public.clarevo_installment_cents(p_amount_cents, v_n, k),
                 description = v_description, category = v_category, purchased_on = p_occurred_on,
                 installment_total = v_n, purchase_total_cents = p_amount_cents, version = version + 1
           where purchase_id = v_e.purchase_id and installment_number = k and deleted_at is null;
        else
          insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, description, category,
                                           purchase_id, purchased_on, installment_number, installment_total,
                                           purchase_total_cents, created_by, version)
          values (v_card.context_id, v_card.id, 'parcela', v_month, public.clarevo_installment_cents(p_amount_cents, v_n, k),
                  v_description, v_category, v_e.purchase_id, p_occurred_on, k, v_n, p_amount_cents, v_first.created_by,
                  v_first.version + 1);
        end if;
      end loop;
      update public.card_entries
         set deleted_at = now(), deleted_by = v_uid, version = version + 1
       where purchase_id = v_e.purchase_id and installment_number > v_n and deleted_at is null;
      perform public.clarevo_sync_card(v_card.id, v_from, v_to);
    else
      update public.card_entries set description = v_description, category = v_category, version = version + 1
       where purchase_id = v_e.purchase_id and deleted_at is null;
    end if;
  elsif v_e.kind = 'encargo' then
    if p_occurred_on is not null or v_description is not null or v_category is not null or p_installments is not null then
      raise exception 'campo_nao_se_aplica' using errcode = '22023';
    end if;
    perform public.clarevo_validate_charge(p_charge_kind, p_amount_cents);
    perform public.clarevo_validate_invoice_month(v_uid, p_invoice_month, p_invoice_month is distinct from v_e.invoice_month);
    if public.clarevo_invoice_paid(v_card.id, v_e.invoice_month) or public.clarevo_invoice_paid(v_card.id, p_invoice_month) then
      raise exception 'fatura_paga' using errcode = 'PT409';
    end if;
    update public.card_entries
       set invoice_month = p_invoice_month, amount_cents = p_amount_cents, charge_kind = p_charge_kind, version = version + 1
     where id = v_e.id;
    perform public.clarevo_sync_card(v_card.id, least(v_e.invoice_month, p_invoice_month), greatest(v_e.invoice_month, p_invoice_month));
  else
    if p_occurred_on is not null or p_installments is not null or p_charge_kind is not null then
      raise exception 'campo_nao_se_aplica' using errcode = '22023';
    end if;
    perform public.clarevo_validate_refund(p_amount_cents, v_description, v_category);
    perform public.clarevo_validate_invoice_month(v_uid, p_invoice_month, p_invoice_month is distinct from v_e.invoice_month);
    if public.clarevo_invoice_paid(v_card.id, v_e.invoice_month) or public.clarevo_invoice_paid(v_card.id, p_invoice_month) then
      raise exception 'fatura_paga' using errcode = 'PT409';
    end if;
    update public.card_entries
       set invoice_month = p_invoice_month, amount_cents = p_amount_cents, description = v_description, category = v_category,
           version = version + 1
     where id = v_e.id;
    perform public.clarevo_sync_card(v_card.id, least(v_e.invoice_month, p_invoice_month), greatest(v_e.invoice_month, p_invoice_month));
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id, entry_id)
  values (v_uid, p_idempotency_key, 'alterar_lancamento_cartao', v_e.context_id, v_hash, null, null, v_e.card_id, v_e.id);

  return public.clarevo_card_entry_result(v_e.id);
end;
$$;

-- Excluir um lançamento (exclusão lógica, versão +1). Compra: todas as parcelas. Fatura paga: fatura_paga.
-- Ordem: sessão; chave; repetição; trava (nao_encontrado, sem_permissao, lancamento_automatico); versão; fatura_paga.
create or replace function public.delete_card_entry(
  p_idempotency_key text,
  p_entry_id uuid,
  p_expected_version integer
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
  v_e public.card_entries%rowtype;
  v_from date;
  v_to date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_lancamento_cartao', p_entry_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_lancamento_cartao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_card_entry_result(v_op.entry_id);
  end if;

  v_e := public.clarevo_lock_card_entry(p_entry_id);
  if p_expected_version is distinct from v_e.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_e.version;
  end if;
  if v_e.purchase_id is not null then
    select min(x.invoice_month), max(x.invoice_month) into v_from, v_to
      from public.card_entries x where x.purchase_id = v_e.purchase_id and x.deleted_at is null;
    if exists (select 1 from public.card_entries x
                where x.purchase_id = v_e.purchase_id and x.deleted_at is null
                  and public.clarevo_invoice_paid(x.card_id, x.invoice_month)) then
      raise exception 'fatura_paga' using errcode = 'PT409';
    end if;
    update public.card_entries set deleted_at = now(), deleted_by = v_uid, version = version + 1
     where purchase_id = v_e.purchase_id and deleted_at is null;
  else
    v_from := v_e.invoice_month;
    v_to := v_e.invoice_month;
    if public.clarevo_invoice_paid(v_e.card_id, v_e.invoice_month) then
      raise exception 'fatura_paga' using errcode = 'PT409';
    end if;
    update public.card_entries set deleted_at = now(), deleted_by = v_uid, version = version + 1 where id = v_e.id;
  end if;
  perform public.clarevo_sync_card(v_e.card_id, v_from, v_to);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id, entry_id)
  values (v_uid, p_idempotency_key, 'excluir_lancamento_cartao', v_e.context_id, v_hash, null, null, v_e.card_id, v_e.id);

  return public.clarevo_card_entry_result(v_e.id);
end;
$$;

-- Encargo informado a partir da fatura do banco (juros, multa, IOF, anuidade ou tarifa), na fatura p_invoice_month.
-- Também em cartão arquivado. O app não calcula juros: só registra o que a pessoa informa.
-- Ordem: sessão; chave; repetição; trava; tipo_de_encargo_invalido; valor_invalido; valor_acima_do_limite; mes_invalido
-- (formato e de 48 meses antes a 48 meses depois do mês de hoje); limite_de_lancamentos; fatura_paga; escrita.
create or replace function public.add_card_charge(
  p_idempotency_key text,
  p_card_id uuid,
  p_invoice_month date,
  p_charge_kind text,
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
  v_card public.cards%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('criar_encargo_cartao', p_card_id, p_invoice_month, p_charge_kind, p_amount_cents)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'criar_encargo_cartao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_card_entry_result(v_op.entry_id);
  end if;

  v_card := public.clarevo_lock_card(p_card_id, false);
  perform public.clarevo_validate_charge(p_charge_kind, p_amount_cents);
  perform public.clarevo_validate_invoice_month(v_uid, p_invoice_month, true);
  perform public.clarevo_check_entry_cap(v_card.id, 1);
  if public.clarevo_invoice_paid(v_card.id, p_invoice_month) then
    raise exception 'fatura_paga' using errcode = 'PT409';
  end if;

  insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, charge_kind, created_by)
  values (v_card.context_id, v_card.id, 'encargo', p_invoice_month, p_amount_cents, p_charge_kind, v_uid)
  returning id into v_id;
  perform public.clarevo_sync_card(v_card.id, p_invoice_month, p_invoice_month);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id, entry_id)
  values (v_uid, p_idempotency_key, 'criar_encargo_cartao', v_card.context_id, v_hash, null, null, v_card.id, v_id);

  return public.clarevo_card_entry_result(v_id);
end;
$$;

-- Estorno ou devolução (crédito) na fatura p_invoice_month, com a descrição e a categoria da compra devolvida.
-- Também em cartão arquivado. Crédito maior que o total da fatura é levado à seguinte (estorno automático).
-- Ordem: sessão; chave; repetição; trava; valor_invalido; valor_acima_do_limite; descricao_obrigatoria; descricao_longa;
-- categoria_invalida; mes_invalido (formato e de 48 meses antes a 48 meses depois do mês de hoje); limite_de_lancamentos;
-- fatura_paga; escrita.
create or replace function public.add_card_refund(
  p_idempotency_key text,
  p_card_id uuid,
  p_invoice_month date,
  p_amount_cents bigint,
  p_description text,
  p_category text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := public.clarevo_trim(p_description);
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_card public.cards%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('criar_estorno_cartao', p_card_id, p_invoice_month, p_amount_cents, v_description,
                                  v_category)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'criar_estorno_cartao' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_card_entry_result(v_op.entry_id);
  end if;

  v_card := public.clarevo_lock_card(p_card_id, false);
  perform public.clarevo_validate_refund(p_amount_cents, v_description, v_category);
  perform public.clarevo_validate_invoice_month(v_uid, p_invoice_month, true);
  perform public.clarevo_check_entry_cap(v_card.id, 1);
  if public.clarevo_invoice_paid(v_card.id, p_invoice_month) then
    raise exception 'fatura_paga' using errcode = 'PT409';
  end if;

  insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, description, category, created_by)
  values (v_card.context_id, v_card.id, 'estorno', p_invoice_month, p_amount_cents, v_description, v_category, v_uid)
  returning id into v_id;
  perform public.clarevo_sync_card(v_card.id, p_invoice_month, p_invoice_month);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id, entry_id)
  values (v_uid, p_idempotency_key, 'criar_estorno_cartao', v_card.context_id, v_hash, null, null, v_card.id, v_id);

  return public.clarevo_card_entry_result(v_id);
end;
$$;

-- Pagar a fatura: cria UM gasto (valor e data efetivamente pagos) e quita a conta da fatura, na mesma operação. Valor de
-- R$ 0,01 até o total da fatura; data até hoje e não antes do menor entre 1 ano atrás e o primeiro dia do período da fatura
-- (o dia seguinte ao fechamento da fatura anterior), para que uma fatura antiga possa ser paga na data real. A fatura não
-- precisa ter fechado (a pessoa pode pagar antes): as compras seguintes do ciclo vão para a primeira fatura seguinte livre
-- (clarevo_first_free_month) e a fatura paga não recebe lançamentos (fatura_paga em encargo e estorno). Pagamento parcial: a diferença vira o "saldo anterior" da fatura
-- seguinte (sem juros: os encargos entram quando a pessoa informar a fatura seguinte); a fatura seguinte não pode estar
-- paga (fatura_seguinte_paga). p_expected_version é a versão da conta da fatura (commitment_version de invoice_items).
-- p_account_id (opcional, depois da data): a conta de saída; sem ela, a conta ativa mais antiga do contexto. O gasto:
-- descrição "Fatura <apelido> (<mês>)", sem categoria (o "Por categoria" distribui o valor pelas categorias dos lançamentos
-- da fatura, no core), ligado ao cartão e ao mês da fatura.
-- Ordem: sessão; chave; repetição; trava do cartão (nao_encontrado; sem_permissao: cartão de outra pessoa exige "editar
-- de outras pessoas"); mes_invalido; nao_encontrado (fatura sem conta); versao_desatualizada; compromisso_quitado;
-- valor_invalido; valor_acima_da_fatura; data_invalida (nula, ou antes do menor entre 1 ano atrás e o início do período
-- da fatura); data_futura; conta_invalida; fatura_seguinte_paga; escrita.
create or replace function public.pay_invoice(
  p_idempotency_key text,
  p_card_id uuid,
  p_month date,
  p_expected_version integer,
  p_paid_cents bigint,
  p_paid_on date,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_args jsonb;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_card public.cards%rowtype;
  v_c public.commitments%rowtype;
  v_account public.financial_accounts%rowtype;
  v_r public.financial_records%rowtype;
  v_desc text;
  v_next date;
  v_left bigint;
  v_today date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_args := jsonb_build_array('pagar_fatura', p_card_id, p_month, p_expected_version, p_paid_cents, p_paid_on);
  if p_account_id is not null then
    v_args := v_args || jsonb_build_array(p_account_id);
  end if;
  v_hash := md5(v_args::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'pagar_fatura' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_pay_result(v_op.target_id, p_month, v_op.commitment_id, v_op.record_id);
  end if;

  v_card := public.clarevo_lock_card(p_card_id, true);                                      -- trava 1: cartão
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  select * into v_c from public.commitments c
   where c.card_id = v_card.id and c.invoice_month = p_month and c.deleted_at is null for update;   -- trava 2: conta
  if v_c.id is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'aberto' then
    raise exception 'compromisso_quitado' using errcode = 'PT409';
  end if;
  v_today := public.clarevo_today(v_uid);
  if p_paid_cents is null or p_paid_cents < 1 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_paid_cents > v_c.amount_cents then
    raise exception 'valor_acima_da_fatura' using errcode = '22023';
  end if;
  if p_paid_on is null
     or p_paid_on < least((v_today - interval '1 year')::date,
                          (public.invoice_closing_on(v_card.closing_day, v_card.due_day, (p_month - interval '1 month')::date) + 1)) then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  if p_paid_on > v_today then
    raise exception 'data_futura' using errcode = '22023';
  end if;
  if p_account_id is null then
    select * into v_account from public.financial_accounts a
     where a.context_id = v_card.context_id and a.status = 'ativa' order by a.created_at, a.id limit 1;
  else
    select * into v_account from public.financial_accounts a
     where a.id = p_account_id and a.context_id = v_card.context_id and a.status = 'ativa';
  end if;
  if v_account.id is null or v_account.currency <> v_c.currency then
    raise exception 'conta_invalida' using errcode = '22023';
  end if;
  v_left := v_c.amount_cents - p_paid_cents;
  v_next := public.clarevo_next_month(p_month);
  if v_left > 0 and public.clarevo_invoice_paid(v_card.id, v_next) then
    raise exception 'fatura_seguinte_paga' using errcode = 'PT409';
  end if;
  v_desc := 'Fatura ' || v_card.nickname || ' (' || public.clarevo_month_name(p_month)
            || case when extract(year from p_month) <> extract(year from p_paid_on)
                    then ' de ' || extract(year from p_month)::int else '' end || ')';

  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, commitment_id,
     card_id, invoice_month)
  values
    (v_card.context_id, v_account.id, 'despesa', p_paid_cents, v_account.currency, p_paid_on, v_desc, null, v_uid, v_c.id,
     v_card.id, p_month)
  returning * into v_r;

  update public.commitments set status = 'quitado', amount_is_estimate = false, version = version + 1 where id = v_c.id;

  if v_left > 0 then
    insert into public.card_entries (context_id, card_id, kind, invoice_month, amount_cents, source_month, payment_record_id, created_by)
    values (v_card.context_id, v_card.id, 'saldo_anterior', v_next, v_left, p_month, v_r.id, v_uid);
    perform public.clarevo_sync_card(v_card.id, p_month, v_next);
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'pagar_fatura', v_card.context_id, v_hash, v_r.id, v_c.id, v_card.id);

  return public.clarevo_pay_result(v_card.id, p_month, v_c.id, v_r.id);
end;
$$;

-- Desfazer o pagamento: exclui logicamente o gasto (o vínculo fica como rastro), exclui o saldo anterior que ele criou e
-- reabre a conta da fatura, na mesma operação. Se havia saldo anterior e a fatura seguinte já foi paga:
-- fatura_seguinte_paga. Ordem: sessão; chave; repetição; trava do cartão; mes_invalido; nao_encontrado (fatura sem
-- conta); versao_desatualizada; compromisso_aberto; permissão sobre o gasto; fatura_seguinte_paga; escrita.
create or replace function public.undo_invoice_payment(
  p_idempotency_key text,
  p_card_id uuid,
  p_month date,
  p_expected_version integer
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
  v_card public.cards%rowtype;
  v_c public.commitments%rowtype;
  v_r public.financial_records%rowtype;
  v_rid uuid;
  v_next date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('desfazer_pagamento_fatura', p_card_id, p_month, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'desfazer_pagamento_fatura' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_pay_result(v_op.target_id, p_month, v_op.commitment_id, v_op.record_id);
  end if;

  v_card := public.clarevo_lock_card(p_card_id, true);                                      -- trava 1: cartão
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  select * into v_c from public.commitments c
   where c.card_id = v_card.id and c.invoice_month = p_month and c.deleted_at is null for update;   -- trava 2: conta
  if v_c.id is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'quitado' then
    raise exception 'compromisso_aberto' using errcode = 'PT409';
  end if;
  select id into v_rid from public.financial_records where commitment_id = v_c.id and deleted_at is null;
  -- Também exige permissão sobre o gasto (autoria ou "editar de outras pessoas").
  v_r := public.clarevo_lock_record(v_rid);
  v_next := public.clarevo_next_month(p_month);
  if exists (select 1 from public.card_entries e where e.payment_record_id = v_r.id and e.deleted_at is null)
     and public.clarevo_invoice_paid(v_card.id, v_next) then
    raise exception 'fatura_seguinte_paga' using errcode = 'PT409';
  end if;

  update public.card_entries set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where payment_record_id = v_r.id and deleted_at is null;
  update public.financial_records set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_r.id
  returning * into v_r;
  update public.commitments set status = 'aberto', version = version + 1 where id = v_c.id;
  perform public.clarevo_sync_card(v_card.id, p_month, v_next);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_idempotency_key, 'desfazer_pagamento_fatura', v_card.context_id, v_hash, v_r.id, v_c.id, v_card.id);

  -- record = gasto excluído (rastro).
  return public.clarevo_pay_result(v_card.id, p_month, v_c.id, v_r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Gastos realizados: create_record com a chave da nota (opcional) e update_record / delete_record que recusam o
-- gasto de pagamento de fatura
-- ---------------------------------------------------------------------------

-- Um parâmetro a mais no fim, p_receipt_key: chave de acesso da nota (44 dígitos com dígito verificador), só em despesa;
-- a nota já anotada neste contexto (gasto ou compra no cartão vivos) é recusada (nota_ja_anotada, detalhe registro=<id> ou
-- compra=<id>). Com a chave nula, o hash é idêntico ao da 0001 e o cliente antigo (8 argumentos nomeados) continua
-- funcionando.
drop function public.create_record(text, uuid, uuid, public.record_kind, bigint, date, text, text);
create or replace function public.create_record(
  p_idempotency_key text,
  p_context_id uuid,
  p_account_id uuid,
  p_kind public.record_kind,
  p_amount_cents bigint,
  p_occurred_on date,
  p_description text,
  p_category text default null,
  p_receipt_key text default null
)
returns public.financial_records
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := public.clarevo_trim(p_description);
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_receipt text := nullif(public.clarevo_trim(p_receipt_key), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_account public.financial_accounts%rowtype;
  v_record public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  v_hash := md5(concat_ws('|', 'criar', p_context_id, p_account_id, p_kind, p_amount_cents, p_occurred_on, v_description, coalesce(v_category, ''), v_receipt));
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || coalesce(p_idempotency_key, '')));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    -- Repetição só devolve o registro se a pessoa ainda pode ler o contexto (vínculo revogado não vê nada).
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    select * into v_record from public.financial_records where id = v_op.record_id;
    return v_record;
  end if;

  if not public.context_permission(p_context_id, 'write') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_account := public.clarevo_validate_record(v_uid, p_context_id, p_account_id, p_amount_cents, p_occurred_on, v_description, v_category);
  if v_receipt is not null then
    if p_kind <> 'despesa' or not public.clarevo_receipt_key_valid(v_receipt) then
      raise exception 'chave_de_nota_invalida' using errcode = '22023';
    end if;
    perform public.clarevo_check_receipt_free(p_context_id, v_receipt);
  end if;

  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, receipt_key)
  values
    (p_context_id, p_account_id, p_kind, p_amount_cents, v_account.currency, p_occurred_on, v_description, v_category, v_uid, v_receipt)
  returning * into v_record;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id)
  values (v_uid, p_idempotency_key, 'criar', p_context_id, v_hash, v_record.id);

  return v_record;
end;
$$;

-- Mesma assinatura, hash, repetição e retorno da 0002. Mudança: o gasto de pagamento de fatura só muda de conta de saída e
-- de data (valor, descrição e categoria vêm da fatura): outra mudança é recusada (pagamento_de_fatura).
create or replace function public.update_record(
  p_idempotency_key text,
  p_record_id uuid,
  p_expected_version integer,
  p_account_id uuid,
  p_amount_cents bigint,
  p_occurred_on date,
  p_description text,
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
  v_description text := public.clarevo_trim(p_description);
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_hash text;
  v_op public.record_operations%rowtype;
  v_record public.financial_records%rowtype;
  v_cid uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  v_hash := md5(concat_ws('|', 'editar', p_record_id, p_expected_version, p_account_id, p_amount_cents, p_occurred_on, v_description, coalesce(v_category, '')));
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || coalesce(p_idempotency_key, '')));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    -- Repetição só devolve o registro se a pessoa ainda pode ler o contexto (vínculo revogado não vê nada).
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    select * into v_record from public.financial_records where id = v_op.record_id;
    return v_record;
  end if;

  -- O vínculo é imutável: ler sem trava é seguro. A trava da conta a pagar vem antes da do registro
  -- (mesma ordem de pay_commitment e undo_commitment_payment); a permissão continua sendo a do registro.
  select commitment_id into v_cid from public.financial_records where id = p_record_id;
  if v_cid is not null then
    perform 1 from public.commitments where id = v_cid for update;
  end if;
  v_record := public.clarevo_lock_record(p_record_id);
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_record.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_record.version;
  end if;
  if v_record.card_id is not null
     and (p_amount_cents is distinct from v_record.amount_cents or v_description is distinct from v_record.description
          or v_category is distinct from v_record.category) then
    raise exception 'pagamento_de_fatura' using errcode = 'PT409';
  end if;
  perform public.clarevo_validate_record(v_uid, v_record.context_id, p_account_id, p_amount_cents, p_occurred_on, v_description, v_category);

  update public.financial_records
     set account_id = p_account_id,
         amount_cents = p_amount_cents,
         occurred_on = p_occurred_on,
         description = v_description,
         category = v_category,
         version = version + 1
   where id = p_record_id
  returning * into v_record;

  -- Gasto de conta a pagar: o previsto não muda, mas a versão da conta sobe (o pagamento mostrado mudou).
  if v_cid is not null then
    update public.commitments set version = version + 1 where id = v_cid;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'editar', v_record.context_id, v_hash, v_record.id, v_cid);

  return v_record;
end;
$$;

-- Mesma assinatura, hash, repetição e retorno da 0002. Mudança: o gasto de pagamento de fatura não é excluído por aqui
-- (pagamento_de_fatura): o caminho é undo_invoice_payment, que também desfaz o saldo anterior.
create or replace function public.delete_record(
  p_idempotency_key text,
  p_record_id uuid,
  p_expected_version integer
)
returns public.financial_records
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_op public.record_operations%rowtype;
  v_record public.financial_records%rowtype;
  v_cid uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  v_hash := md5(concat_ws('|', 'excluir', p_record_id, p_expected_version));
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || coalesce(p_idempotency_key, '')));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    -- Repetição só devolve o registro se a pessoa ainda pode ler o contexto (vínculo revogado não vê nada).
    -- Não reabre a conta a pagar de novo.
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    select * into v_record from public.financial_records where id = v_op.record_id;
    return v_record;
  end if;

  -- Mesma ordem de travas de update_record: conta a pagar antes do registro.
  select commitment_id into v_cid from public.financial_records where id = p_record_id;
  if v_cid is not null then
    perform 1 from public.commitments where id = v_cid for update;
  end if;
  v_record := public.clarevo_lock_record(p_record_id);
  if p_expected_version is distinct from v_record.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_record.version;
  end if;
  if v_record.card_id is not null then
    raise exception 'pagamento_de_fatura' using errcode = 'PT409';
  end if;

  -- Exclusão lógica: some das consultas, mantém o rastro mínimo de autoria e operação.
  update public.financial_records
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = p_record_id
  returning * into v_record;

  -- Excluir o gasto de uma conta paga é o mesmo que desfazer o pagamento: a conta volta a ficar em aberto.
  if v_cid is not null then
    update public.commitments set status = 'aberto', version = version + 1 where id = v_cid;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'excluir', v_record.context_id, v_hash, v_record.id, v_cid);

  return v_record;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contas a pagar: a conta de fatura não é editada, excluída, paga nem desfeita por estas funções (conta_de_fatura). Ela
-- muda só pelos lançamentos do cartão e é paga por pay_invoice. Mesmas assinaturas, hash, repetição e retorno; a recusa
-- vem logo depois da trava (nao_encontrado e sem_permissao primeiro) e antes da versão.
-- ---------------------------------------------------------------------------
create or replace function public.update_commitment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer,
  p_amount_cents bigint,
  p_due_on date,
  p_description text,
  p_category text default null,
  p_amount_is_estimate boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_description text := public.clarevo_trim(p_description);
  v_category text := nullif(public.clarevo_trim(p_category), '');
  v_args jsonb;
  v_hash text;
  v_op public.record_operations%rowtype;
  v_c public.commitments%rowtype;
  v_s public.commitment_series%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_args := jsonb_build_array('editar_compromisso', p_commitment_id, p_expected_version, p_amount_cents, p_due_on,
                              v_description, v_category);
  if p_amount_is_estimate is not null then
    v_args := v_args || jsonb_build_array(p_amount_is_estimate);
  end if;
  v_hash := md5(v_args::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'editar_compromisso' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  v_c := public.clarevo_lock_commitment(p_commitment_id);
  if v_c.card_id is not null then
    raise exception 'conta_de_fatura' using errcode = 'PT409';
  end if;
  -- Versão ausente (NULL) também é recusada.
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'aberto' then
    raise exception 'compromisso_quitado' using errcode = 'PT409';
  end if;
  -- Só nulo (mantém) ou falso (valor informado): a estimativa nasce só da vigência da série.
  if p_amount_is_estimate then
    raise exception 'estimativa_invalida' using errcode = '22023';
  end if;
  perform public.clarevo_validate_commitment(v_uid, p_amount_cents, p_due_on, v_description, v_category,
                                             p_due_on is distinct from v_c.due_on);
  if v_c.series_id is not null then
    -- Colunas imutáveis: leitura sem trava.
    select * into v_s from public.commitment_series where id = v_c.series_id;
    if date_trunc('month', p_due_on::timestamp)::date <> public.clarevo_series_month(v_s, v_c.occurrence_number) then
      raise exception 'vencimento_fora_do_mes' using errcode = '22023';
    end if;
  end if;

  update public.commitments
     set amount_cents = p_amount_cents,
         due_on = p_due_on,
         description = v_description,
         category = v_category,
         amount_is_estimate = coalesce(p_amount_is_estimate, amount_is_estimate),
         series_override = series_override or series_id is not null,
         version = version + 1
   where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'editar_compromisso', v_c.context_id, v_hash, null, v_c.id);

  return public.clarevo_commitment_result(v_c.id, null);
end;
$$;

create or replace function public.delete_commitment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer
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
  v_c public.commitments%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('excluir_compromisso', p_commitment_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'excluir_compromisso' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  v_c := public.clarevo_lock_commitment(p_commitment_id);
  if v_c.card_id is not null then
    raise exception 'conta_de_fatura' using errcode = 'PT409';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'aberto' then
    raise exception 'compromisso_quitado' using errcode = 'PT409';
  end if;

  -- Exclusão lógica: some das consultas e de "Ainda a pagar", mantém o rastro mínimo de autoria e operação.
  update public.commitments
     set deleted_at = now(), deleted_by = v_uid, version = version + 1,
         series_skipped = (series_id is not null)
   where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'excluir_compromisso', v_c.context_id, v_hash, null, v_c.id);

  return public.clarevo_commitment_result(v_c.id, null);
end;
$$;

create or replace function public.pay_commitment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer,
  p_account_id uuid,
  p_amount_cents bigint,
  p_paid_on date,
  p_category text default null
)
returns jsonb
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
  v_c public.commitments%rowtype;
  v_account public.financial_accounts%rowtype;
  v_r public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('pagar_compromisso', p_commitment_id, p_expected_version, p_account_id, p_amount_cents,
                                  p_paid_on, v_category)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'pagar_compromisso' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  v_c := public.clarevo_lock_commitment(p_commitment_id);
  -- Pagar a conta de uma fatura sem distribuir a diferença quebraria o saldo anterior: o caminho é pay_invoice.
  if v_c.card_id is not null then
    raise exception 'conta_de_fatura' using errcode = 'PT409';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'aberto' then
    raise exception 'compromisso_quitado' using errcode = 'PT409';
  end if;
  -- Mesmas regras do gasto realizado: valor, categoria, data até hoje (data_futura), conta ativa do contexto.
  v_account := public.clarevo_validate_record(v_uid, v_c.context_id, p_account_id, p_amount_cents, p_paid_on, v_c.description, v_category);
  if v_account.currency <> v_c.currency then
    raise exception 'conta_invalida' using errcode = '22023';
  end if;

  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, commitment_id)
  values
    (v_c.context_id, p_account_id, 'despesa', p_amount_cents, v_account.currency, p_paid_on, v_c.description, v_category, v_uid, v_c.id)
  returning * into v_r;

  update public.commitments set status = 'quitado', version = version + 1 where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'pagar_compromisso', v_c.context_id, v_hash, v_r.id, v_c.id);

  return public.clarevo_commitment_result(v_c.id, v_r.id);
end;
$$;

create or replace function public.undo_commitment_payment(
  p_idempotency_key text,
  p_commitment_id uuid,
  p_expected_version integer
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
  v_c public.commitments%rowtype;
  v_rid uuid;
  v_r public.financial_records%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_idempotency_key);
  v_hash := md5(jsonb_build_array('desfazer_pagamento', p_commitment_id, p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_idempotency_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_op.action <> 'desfazer_pagamento' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_commitment_result(v_op.commitment_id, v_op.record_id);
  end if;

  v_c := public.clarevo_lock_commitment(p_commitment_id);
  -- Desfazer o pagamento da fatura também desfaz o saldo anterior: o caminho é undo_invoice_payment.
  if v_c.card_id is not null then
    raise exception 'conta_de_fatura' using errcode = 'PT409';
  end if;
  if p_expected_version is distinct from v_c.version then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || v_c.version;
  end if;
  if v_c.status <> 'quitado' then
    raise exception 'compromisso_aberto' using errcode = 'PT409';
  end if;
  select id into v_rid from public.financial_records where commitment_id = v_c.id and deleted_at is null;
  -- Também exige permissão sobre o gasto (autoria ou "editar de outras pessoas").
  v_r := public.clarevo_lock_record(v_rid);

  update public.financial_records
     set deleted_at = now(), deleted_by = v_uid, version = version + 1
   where id = v_r.id
  returning * into v_r;

  update public.commitments set status = 'aberto', version = version + 1 where id = v_c.id;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id)
  values (v_uid, p_idempotency_key, 'desfazer_pagamento', v_c.context_id, v_hash, v_r.id, v_c.id);

  -- record = gasto excluído (rastro).
  return public.clarevo_commitment_result(v_c.id, v_r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Geração das contas de série (0003) mais a marca "estimado" das faturas em aberto: o dia do fechamento passa sem
-- gravação, então quem abre o app a atualiza aqui (aberta até o dia do fechamento). Contas travadas por outra gravação
-- ficam para a próxima chamada (skip locked), sem esperar nem travar em ordem diferente.
-- ---------------------------------------------------------------------------
create or replace function public.sync_series_occurrences(p_context_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_r jsonb;
  v_created int := 0;
  v_overdue int := 0;
  v_today date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  for v_id in select id from public.commitment_series
               where context_id = p_context_id and deleted_at is null order by id loop
    v_r := public.clarevo_materialize_series(v_id);
    v_created := v_created + (v_r ->> 'created')::int;
    v_overdue := v_overdue + (v_r ->> 'created_overdue')::int;
  end loop;
  v_today := public.clarevo_today(v_uid);
  with t as (
    select c.id from public.commitments c
     where c.context_id = p_context_id and c.card_id is not null and c.deleted_at is null and c.status = 'aberto'
       and c.amount_is_estimate <> (v_today <= c.card_closing_on)
     order by c.id for update skip locked)
  update public.commitments c
     set amount_is_estimate = (v_today <= c.card_closing_on), version = c.version + 1
    from t where c.id = t.id;
  return jsonb_build_object('created', v_created, 'created_overdue', v_overdue);
end;
$$;

-- ---------------------------------------------------------------------------
-- Renda comprometida (0006) com o grupo "Faturas de cartão": as contas de fatura saem de "outras contas" e formam o grupo
-- novo (card_cents e card_permille, no fim). Fora de "Dívidas", que continua só com financiamento e compra parcelada. O
-- total é fixos + contas do ano + parcelamentos + outras + faturas de cartão. Mesma regra e mesma ordem de conferência.
-- ---------------------------------------------------------------------------
drop function public.month_committed(uuid, date);
create or replace function public.month_committed(p_context_id uuid, p_month date)
returns table (
  fixed_cents bigint,            -- gastos fixos (séries mensais)
  annual_cents bigint,           -- contas do ano (séries anuais; nunca dívida)
  installment_cents bigint,      -- parcelamentos (séries parceladas)
  debt_cents bigint,             -- dívidas: parte de parcelamentos (financiamento ou compra parcelada)
  other_cents bigint,            -- outras contas a pagar (sem série e sem cartão)
  committed_cents bigint,        -- fixos + contas do ano + parcelamentos + outras + faturas de cartão
  paid_part_cents bigint,        -- já pago: valor pago das contas pagas de C(M)
  open_part_cents bigint,        -- em aberto: valor previsto das contas em aberto de C(M)
  estimated_open_cents bigint,   -- parte de open_part com valor estimado
  overdue_before_cents bigint,   -- só no mês de hoje: em aberto vencidas antes de M (fora do comprometido)
  reference_cents bigint,        -- renda de referência vigente em M (nula sem referência)
  reference_from date,           -- mês de início da referência vigente
  reference_varies boolean,      -- "Minha renda varia" da referência vigente
  outside_cents bigint,          -- fora dos compromissos = referência - comprometido (pode ser negativo)
  committed_permille bigint,     -- milésimos da referência, metade para cima; nulos sem referência
  debt_permille bigint,
  fixed_permille bigint,
  annual_permille bigint,
  installment_permille bigint,
  other_permille bigint,
  card_cents bigint,             -- faturas de cartão (contas ligadas a um cartão)
  card_permille bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current boolean;
  v_next date;
  v_ref public.income_references%rowtype;
  v_fixed bigint;
  v_annual bigint;
  v_installment bigint;
  v_debt bigint;
  v_other bigint;
  v_card bigint;
  v_paid bigint;
  v_open bigint;
  v_estimated bigint;
  v_overdue bigint;
  v_total bigint;
  v_r numeric;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;
  if not public.context_permission(p_context_id, 'read') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_current := date_trunc('month', public.clarevo_today(auth.uid())::timestamp)::date = p_month;
  v_next := (p_month + interval '1 month')::date;

  -- Cada conta uma vez: paga pelo gasto vivo vinculado (I1: exatamente um), em aberto pelo previsto.
  select coalesce(sum(x.v) filter (where x.kind = 'mensal'), 0)::bigint,
         coalesce(sum(x.v) filter (where x.kind = 'anual'), 0)::bigint,
         coalesce(sum(x.v) filter (where x.kind = 'parcelada'), 0)::bigint,
         coalesce(sum(x.v) filter (where x.kind = 'parcelada' and x.nature in ('financiamento', 'compra_parcelada')), 0)::bigint,
         coalesce(sum(x.v) filter (where x.kind is null and not x.is_card), 0)::bigint,
         coalesce(sum(x.v) filter (where x.is_card), 0)::bigint,
         coalesce(sum(x.v) filter (where x.paid), 0)::bigint,
         coalesce(sum(x.v) filter (where not x.paid), 0)::bigint,
         coalesce(sum(x.v) filter (where not x.paid and x.estimate), 0)::bigint
    into v_fixed, v_annual, v_installment, v_debt, v_other, v_card, v_paid, v_open, v_estimated
    from (select c.status = 'quitado' as paid,
                 case when c.status = 'quitado' then r.amount_cents else c.amount_cents end as v,
                 -- Fatura aberta: a marca "estimado" vale até o dia do fechamento (calculada na hora, não a gravada).
                 case when c.card_id is not null and c.status = 'aberto' then public.clarevo_today(auth.uid()) <= c.card_closing_on
                      else c.amount_is_estimate end as estimate,
                 c.card_id is not null as is_card,
                 s.kind, s.nature
            from public.commitments c
            left join public.financial_records r on r.commitment_id = c.id and r.deleted_at is null
            left join public.commitment_series s on s.id = c.series_id
           where c.context_id = p_context_id
             and c.deleted_at is null
             and c.due_on >= p_month
             and c.due_on < v_next) x;
  v_total := v_fixed + v_annual + v_installment + v_other + v_card;

  -- Mesmo critério de overdue_before_cents em month_to_pay.
  select coalesce(sum(c.amount_cents), 0)::bigint into v_overdue
    from public.commitments c
   where c.context_id = p_context_id
     and c.deleted_at is null
     and c.status = 'aberto'
     and c.due_on < p_month
     and v_current;

  select * into v_ref from public.income_references i
   where i.context_id = p_context_id and i.deleted_at is null and i.from_month <= p_month
   order by i.from_month desc
   limit 1;
  v_r := v_ref.amount_cents;

  return query
  select v_fixed, v_annual, v_installment, v_debt, v_other, v_total, v_paid, v_open, v_estimated, v_overdue,
         v_ref.amount_cents, v_ref.from_month, v_ref.varies,
         v_ref.amount_cents - v_total,
         div(2000::numeric * v_total + v_r, 2 * v_r)::bigint,
         div(2000::numeric * v_debt + v_r, 2 * v_r)::bigint,
         div(2000::numeric * v_fixed + v_r, 2 * v_r)::bigint,
         div(2000::numeric * v_annual + v_r, 2 * v_r)::bigint,
         div(2000::numeric * v_installment + v_r, 2 * v_r)::bigint,
         div(2000::numeric * v_other + v_r, 2 * v_r)::bigint,
         v_card,
         div(2000::numeric * v_card + v_r, 2 * v_r)::bigint;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura: RLS (negado por padrão; só quem lê o contexto vê cartões e lançamentos vivos) e a visão das contas a pagar com
-- o cartão e o mês da fatura no fim. Sem escrita direta.
-- ---------------------------------------------------------------------------
alter table public.cards enable row level security;
alter table public.card_entries enable row level security;

create policy cards_read on public.cards for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));
create policy card_entries_read on public.card_entries for select to authenticated
  using (deleted_at is null and public.context_permission(context_id, 'read'));

-- Lista inicial idêntica à da 0004; colunas novas no fim.
create or replace view public.commitment_items with (security_invoker = true) as
select c.id, c.context_id, c.description, c.amount_cents, c.currency, c.due_on, c.status, c.category,
       c.created_by, c.version, c.created_at, c.updated_at,
       r.id as paid_record_id, r.occurred_on as paid_on, r.amount_cents as paid_amount_cents, r.account_id as paid_account_id,
       c.series_id, c.occurrence_number, c.series_override,
       -- Fatura de cartão em aberto: "estimado" até o dia do fechamento, calculado na hora (a marca gravada só é atualizada por
       -- uma gravação de cartão ou por sync_series_occurrences e fica velha depois do fechamento). As outras contas: a gravada.
       case when c.card_id is not null and c.status = 'aberto' then public.my_today() <= c.card_closing_on
            else c.amount_is_estimate end as amount_is_estimate,
       s.kind as series_kind, s.nature as series_nature, s.installment_total as series_installment_total,
       s.parts_per_year as series_parts_per_year,
       c.card_id, c.invoice_month, c.card_closing_on
  from public.commitments c
  left join public.financial_records r on r.commitment_id = c.id and r.deleted_at is null
  left join public.commitment_series s on s.id = c.series_id
 where c.deleted_at is null;
comment on view public.commitment_items is 'Contas a pagar não excluídas com o gasto vivo que as quitou (paid_* nulos quando em aberto), a série e o cartão da fatura, quando houver. A marca amount_is_estimate da fatura aberta é calculada na hora.';

-- ---------------------------------------------------------------------------
-- Privilégios: bloco inteiro da 0007 (idempotente), com create_record de 9 argumentos e month_committed refeita, mais as
-- onze funções públicas de cartão. cards, card_entries, card_items e invoice_items ficam sem insert, update ou delete
-- diretos; auxiliares, guardas e gatilhos de consistência ficam sem execute para authenticated.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant update (display_name, locale) on public.persons to authenticated;
grant update (name) on public.financial_accounts to authenticated;
grant update (can_read, can_write, can_edit_others, revoked_at) on public.context_memberships to authenticated;
-- Empresa: convida (e-mail), encerra e apaga convites não aceitos. Beneficiário e ativação são definidos no aceite.
grant insert (contract_id, invited_email) on public.licenses to authenticated;
grant update (status, ended_at) on public.licenses to authenticated;
grant delete on public.licenses to authenticated;

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
grant execute on function public.add_goal_movement(text, uuid, text, bigint, date, text) to authenticated;
grant execute on function public.update_goal_movement(text, uuid, integer, bigint, date, text) to authenticated;
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
