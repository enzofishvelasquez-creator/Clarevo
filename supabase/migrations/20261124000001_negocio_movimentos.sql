-- Clarevo · migração 0044 · Espaço Negócio: movimentos fora da operação, tipo do negócio e categorias novas (D-121). Depois de
-- 20261123000001_negocio_compartilhado.sql.
-- A partir da pesquisa de 18/11/2026 sobre o que micro e pequenos negócios precisam registrar (docs/52, seção 7): o "sobrou" de "Seu
-- negócio" misturava o resultado da operação com dinheiro que não é venda nem gasto (o dinheiro que a pessoa traz do Pessoal, empréstimo,
-- equipamento), e o app não sabia o tipo do negócio para mostrar o limite do MEI. Leve, sem virar contabilidade (pedido da Elis), e sem
-- a Clarevo calcular imposto nem dizer o que declarar.
--
-- O que muda no banco:
--   1. O tipo do negócio, opcional: financial_contexts.business_profile ('sem_cnpj', 'mei' ou 'me_epp'; nulo é "prefiro não dizer"),
--      só em negócio, mudado só por quem administra (set_business_profile). Sem número de CNPJ.
--   2. Trazer dinheiro do Pessoal (create_business_contribution), o inverso da retirada: um gasto no Pessoal da própria pessoa ("Dinheiro
--      para o negócio") e uma entrada no negócio ("Dinheiro do Pessoal"), gravados juntos e ligados (paired_record_id), com o mesmo guarda
--      da retirada (retirada_ligada). Cada lado conta uma vez no próprio espaço; em "Seu negócio" a entrada fica fora da operação (o app
--      separa pela categoria). Excluir: delete_business_withdrawal, que agora acha o lado do negócio pelo tipo do espaço.
--   3. Orçamento do negócio com 12 categorias de saída: as 9 de antes mais "Divulgação", "Contabilidade e sistemas" e "Juros e multas",
--      antes de "Outras saídas". "Empréstimo recebido", "Parcela de empréstimo" e "Equipamento" são categorias só do app (os lançamentos
--      já aceitam qualquer categoria) e ficam fora do orçamento, como a retirada.
--   4. Duas ações novas em record_operations (99 no total): criar_aporte_negocio (conta como anotação, como a retirada) e
--      definir_perfil_negocio (não conta). Nenhuma vale em só ver e exportar.
-- Compatibilidade: nenhuma função existente muda de assinatura e nenhum dado muda. O app publicado lê o negócio sem a coluna nova e
-- recebe 12 linhas no orçamento do negócio (as 3 novas aparecem com o nome; nenhuma conta muda). O app novo chama as funções novas:
-- aplicar antes do merge, depois da 0043 (docs/05, passo 12ak), e recarregar o esquema da API. Testes em
-- supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzz_negocio_movimentos.sql.

-- ---------------------------------------------------------------------------
-- 1. O tipo do negócio
-- ---------------------------------------------------------------------------
alter table public.financial_contexts add column business_profile text;
-- Só no negócio. A restrição não escreve o valor 'negocio' (a regra da 0042 para restrições): tudo o que não é o Pessoal nem a Família.
alter table public.financial_contexts add constraint financial_contexts_perfil_negocio
  check (business_profile is null or (business_profile in ('sem_cnpj', 'mei', 'me_epp') and kind not in ('pessoal', 'familia')));
comment on column public.financial_contexts.business_profile is
  'Tipo do negócio, opcional (D-121): sem_cnpj, mei ou me_epp; nulo é "prefiro não dizer". Só no negócio, mudado só por set_business_profile. Muda só textos e o limite do MEI no app.';

-- O negócio no formato que o app lê, agora com o tipo.
create or replace function public.clarevo_business_json(p_context uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'created_at', c.created_at, 'ended_at', c.ended_at,
                            'business_profile', c.business_profile)
    from public.financial_contexts c where c.id = p_context;
$$;

-- ---------------------------------------------------------------------------
-- 2. Definir o tipo do negócio. Só quem administra. p_profile nulo limpa. Recusas, em ordem: nao_autenticado; chave; repetição;
-- nao_encontrado; contexto_invalido; sem_permissao; perfil_invalido; assinatura_necessaria (no gatilho de record_operations).
-- Retorno: {context: {id, name, created_at, ended_at, business_profile}}.
-- ---------------------------------------------------------------------------
create or replace function public.set_business_profile(p_context uuid, p_profile text, p_key text)
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
  v_hash := md5(jsonb_build_array('definir_perfil_negocio', p_context, p_profile)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'definir_perfil_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return jsonb_build_object('context', public.clarevo_business_json(v_op.context_id));
  end if;

  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_context::text, '')));
  perform public.clarevo_require_business_owner(p_context);
  if p_profile is not null and p_profile not in ('sem_cnpj', 'mei', 'me_epp') then
    raise exception 'perfil_invalido' using errcode = '22023';
  end if;

  update public.financial_contexts set business_profile = p_profile where id = p_context;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'definir_perfil_negocio', p_context, v_hash, null, null, p_context);

  return jsonb_build_object('context', public.clarevo_business_json(p_context));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Trazer dinheiro do Pessoal. A entrada "Dinheiro do Pessoal" no negócio (p_business, na conta p_business_account) e o gasto
-- "Dinheiro para o negócio" no Pessoal da própria pessoa (da conta p_personal_account), com o mesmo valor e a mesma data, gravados
-- juntos e ligados. Descrição: a da pessoa nos dois lados, ou "Dinheiro do Pessoal" no negócio e "Dinheiro para <negócio>" no Pessoal.
-- As mesmas conferências e recusas da retirada (create_business_withdrawal, 0042). Retorno: {business_record, personal_record}.
-- ---------------------------------------------------------------------------
create or replace function public.create_business_contribution(
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
  v_hash := md5(jsonb_build_array('criar_aporte_negocio', p_business, p_business_account, p_personal_account, p_amount_cents,
                                  p_occurred_on, coalesce(v_desc, ''))::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'criar_aporte_negocio' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    if not public.context_permission(v_op.context_id, 'read') then
      raise exception 'nao_encontrado' using errcode = 'P0002';
    end if;
    return public.clarevo_withdrawal_json(v_op.record_id, v_op.target_id);
  end if;

  -- A mesma trava de end_business e da retirada, antes das conferências: um negócio encerrado ao mesmo tempo não recebe o dinheiro
  -- depois de encerrado.
  perform pg_advisory_xact_lock(hashtext('familia:c:' || coalesce(p_business::text, '')));
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
  v_bdesc := coalesce(v_desc, 'Dinheiro do Pessoal');
  v_pdesc := coalesce(v_desc, left('Dinheiro para ' || v_name, 80));
  v_bacc := public.clarevo_validate_record(v_uid, p_business, p_business_account, p_amount_cents, p_occurred_on, v_bdesc, 'Dinheiro do Pessoal');
  v_pacc := public.clarevo_validate_record(v_uid, v_personal, p_personal_account, p_amount_cents, p_occurred_on, v_pdesc, 'Dinheiro para o negócio');

  perform set_config('clarevo.retirada', 'on', true);
  insert into public.financial_records (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by)
  values (p_business, p_business_account, 'receita', p_amount_cents, v_bacc.currency, p_occurred_on, v_bdesc, 'Dinheiro do Pessoal', v_uid)
  returning * into v_b;
  insert into public.financial_records
    (context_id, account_id, kind, amount_cents, currency, occurred_on, description, category, created_by, paired_record_id)
  values (v_personal, p_personal_account, 'despesa', p_amount_cents, v_pacc.currency, p_occurred_on, v_pdesc, 'Dinheiro para o negócio', v_uid, v_b.id)
  returning * into v_p;
  update public.financial_records set paired_record_id = v_p.id where id = v_b.id returning * into v_b;
  perform set_config('clarevo.retirada', '', true);

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'criar_aporte_negocio', p_business, v_hash, v_b.id, null, v_p.id);

  return public.clarevo_withdrawal_json(v_b.id, v_p.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Excluir a retirada ou o dinheiro trazido do Pessoal: o corpo da 0042, com o lado do negócio escolhido pelo tipo do espaço (antes,
-- pelo tipo do lançamento, que só servia à retirada). Os dois lados saem juntos.
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
  -- O lado do negócio é o que está num espaço negócio (a retirada tem o gasto no negócio; o dinheiro trazido do Pessoal, a entrada).
  if public.clarevo_is_business(v_r.context_id) then
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
-- 5. Orçamento do negócio: 12 categorias de saída, na ordem do app (as 9 de antes e Divulgação, Contabilidade e sistemas e Juros e multas,
-- antes de Outras saídas). O Pessoal e a Família continuam com as 7 de sempre.
-- ---------------------------------------------------------------------------
alter table public.category_budgets drop constraint category_budgets_categoria;
alter table public.category_budgets add constraint category_budgets_categoria
  check (category in ('Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Crédito e parcelas',
                      'Material e mercadoria', 'Peças e ferramentas', 'Combustível e transporte', 'Funcionários e ajudantes',
                      'Impostos e DAS', 'Aluguel do ponto', 'Contas do ponto', 'Taxas e maquininha', 'Divulgação',
                      'Contabilidade e sistemas', 'Juros e multas', 'Outras saídas'));

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
                 'Impostos e DAS', 'Aluguel do ponto', 'Contas do ponto', 'Taxas e maquininha', 'Divulgação',
                 'Contabilidade e sistemas', 'Juros e multas', 'Outras saídas'];
  end if;
  return array['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Crédito e parcelas'];
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Operações: a lista vigente (0043) mais as duas novas. criar_aporte_negocio guarda a entrada do negócio em record_id e o gasto do
-- Pessoal em target_id (como a retirada); definir_perfil_negocio aponta para o negócio.
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
  'criar_negocio', 'renomear_negocio', 'encerrar_negocio', 'criar_retirada_negocio', 'excluir_retirada_negocio', 'mover_lancamento',
  'criar_convite_negocio', 'cancelar_convite_negocio', 'aceitar_convite_negocio', 'sair_negocio', 'remover_membro_negocio',
  'alterar_papel_negocio', 'criar_aporte_negocio', 'definir_perfil_negocio'));
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
                 'criar_negocio', 'renomear_negocio', 'encerrar_negocio',
                 'criar_convite_negocio', 'cancelar_convite_negocio', 'aceitar_convite_negocio', 'sair_negocio',
                 'remover_membro_negocio', 'alterar_papel_negocio', 'definir_perfil_negocio')
      and target_id is not null and record_id is null and commitment_id is null)
  or (action in ('pagar_fatura', 'desfazer_pagamento_fatura')
      and target_id is not null and record_id is not null and commitment_id is not null)
  or (action in ('criar_retirada_negocio', 'excluir_retirada_negocio', 'mover_lancamento', 'criar_aporte_negocio')
      and target_id is not null and record_id is not null and commitment_id is null)
  or (action = 'criar_ocorrencia' and commitment_id is not null and target_id is not null and record_id is null)
  or (action in ('decidir_revisao', 'responder_guardar', 'revisar_assinaturas', 'marcar_mes_conferido', 'desmarcar_mes_conferido',
                 'responder_origem_cadastro', 'gerar_codigo_whatsapp', 'ligar_whatsapp', 'desligar_whatsapp',
                 'gerar_codigo_telegram', 'ligar_telegram', 'desligar_telegram', 'aceitar_termos',
                 'definir_plano_investimentos', 'excluir_plano_investimentos')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- 7. Atividade (a função da 0043) sem contar definir o tipo do negócio; trazer dinheiro do Pessoal conta, como a retirada.
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
                    'criar_negocio', 'renomear_negocio', 'encerrar_negocio',
                    'criar_convite_negocio', 'cancelar_convite_negocio', 'aceitar_convite_negocio', 'sair_negocio',
                    'remover_membro_negocio', 'alterar_papel_negocio', 'definir_perfil_negocio') then
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
-- 8. Privilégios: as duas funções novas só para authenticated; as auxiliares recriadas, para ninguém com sessão.
-- ---------------------------------------------------------------------------
revoke all on function public.clarevo_business_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_budget_categories(uuid) from public, anon, authenticated, service_role;
revoke all on function public.clarevo_track_activity() from public, anon, authenticated, service_role;

revoke all on function public.set_business_profile(uuid, text, text) from public, anon;
revoke all on function public.create_business_contribution(text, uuid, uuid, uuid, bigint, date, text) from public, anon;
revoke all on function public.delete_business_withdrawal(text, uuid, integer) from public, anon;
grant execute on function public.set_business_profile(uuid, text, text) to authenticated;
grant execute on function public.create_business_contribution(text, uuid, uuid, uuid, bigint, date, text) to authenticated;
grant execute on function public.delete_business_withdrawal(text, uuid, integer) to authenticated;
