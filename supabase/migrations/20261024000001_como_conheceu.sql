-- Clarevo · migração 0018 · "Como você conheceu o Clarevo?" e contagens agregadas da equipe (D-067, item 2). Depois de 20261021000001_verificador.sql.
-- O Clarevo promete não rastrear ninguém (sem analytics, sem cookies, sem pixel, sem UTM lido). Para a equipe saber quantas pessoas chegam,
-- quantas começam a usar e de onde vêm, sem quebrar a promessa, há dois pedaços, os dois sem identificar ninguém:
--   1. uma pergunta OPCIONAL no app ("Como você conheceu o Clarevo?"), cuja resposta é só da própria pessoa e só entra em contagens;
--   2. uma função da equipe, que só quem roda no SQL Editor executa, que devolve contagens por semana com supressão de células pequenas.
-- Nenhum registro financeiro, conta a pagar, meta ou cartão é lido nem gravado pela pergunta. A pergunta não é condição de nada.
--
-- Invariantes:
-- S1. Uma linha por pessoa em signup_sources (a pessoa é a chave): nasce na primeira resposta e só muda de origem, uma versão por vez
--     (versão 1 na primeira resposta; cada mudança de origem soma 1). A origem é uma de: instagram, indicacao, empresa, busca, outro,
--     prefiro_nao_dizer. Sem texto livre: nada do que a pessoa escreve entra aqui.
-- S2. Lida só pela própria pessoa (RLS). Nem a Família, nem a empresa, nem somada: nenhuma visão nem função do app agrega esta tabela.
--     Só a função da equipe (abaixo) a conta, e só em contagens.
-- S3. Escrita só por set_signup_source (security definer, search_path fixo, só authenticated): idempotência pela chave, versão
--     crescente que o app manda (0 quando ainda não há resposta), conta excluída recusada (record_operations_actor_guard, X5 da 0015).
--     Responder de novo com a mesma origem e a versão certa não muda nada (a versão não sobe) e devolve a resposta atual.
-- S4. A operação (responder_origem_cadastro) fica em record_operations no contexto Pessoal da pessoa, sem alvo, e NÃO conta como
--     anotação para a atividade de "Seus últimos meses" (D-030), como responder_guardar: responder não é anotar.
-- S5. Exclusão da conta (D-058): a resposta é só da pessoa e sai com ela, inclusive quando a linha de persons continua como "Pessoa que
--     saiu" (clarevo_erase_person apaga signup_sources explicitamente; a chave para persons também tem cascata, para a exclusão de
--     usuário direto no painel). Nada da resposta fica em contagem anterior: a função da equipe sempre conta o que existe agora.
-- S6. A função da equipe (clarevo_staff_signup_metrics) é a única que lê signup_sources fora da própria pessoa: sem execute para public,
--     anon, authenticated nem service_role (só o dono do banco, no SQL Editor). Devolve contagens por semana inteira (segunda a domingo,
--     fuso America/Sao_Paulo), nunca por dia nem por pessoa, e esconde toda contagem entre 1 e 4 (regra no cabeçalho da função).
--
-- Esta migração cria uma tabela (signup_sources), um gatilho, três funções e recria duas (clarevo_track_activity e clarevo_erase_person,
-- só com a exceção e a linha nova). Os privilégios são concedidos só para o que é novo, no fim (a revogação geral das migrações
-- anteriores já vale para o resto, e as funções recriadas mantêm os privilégios que tinham).

-- ---------------------------------------------------------------------------
-- A resposta
-- ---------------------------------------------------------------------------
create table public.signup_sources (
  person_id uuid primary key references public.persons (id) on delete cascade,
  source text not null,
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  constraint signup_sources_origem check (source in ('instagram', 'indicacao', 'empresa', 'busca', 'outro', 'prefiro_nao_dizer'))
);
comment on table public.signup_sources is
  'Resposta opcional de "Como você conheceu o Clarevo?": uma linha por pessoa, só a origem (lista fechada, sem texto livre), quando respondeu e a versão. '
  'Lida só pela própria pessoa; só a função da equipe a conta, em contagens por semana com supressão de células pequenas. Escrita só por set_signup_source.';

-- S1: a linha só muda de origem, uma versão por vez (a pessoa e o primeiro dia da resposta nunca mudam).
create or replace function public.signup_sources_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.person_id <> old.person_id or new.answered_at <> old.answered_at
     or new.source = old.source or new.version <> old.version + 1 then
    raise exception 'campo_imutavel' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger signup_sources_guard
  before update on public.signup_sources
  for each row execute function public.signup_sources_guard();

-- ---------------------------------------------------------------------------
-- Operações: lista completa vigente (a da 0016) mais a ação nova, sem alvo (o contexto Pessoal já está em context_id), no mesmo ramo de
-- decidir_revisao, responder_guardar e marcar_mes_conferido.
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
  'responder_origem_cadastro'));
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
                 'responder_origem_cadastro')
      and record_id is null and commitment_id is null and target_id is null));

-- ---------------------------------------------------------------------------
-- Atividade: mesma função da 0016, sem contar também a ação nova (S4: responder de onde veio não é anotar).
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
-- Resultado da função e da repetição da mesma chave: a resposta atual da pessoa. Sem execute para authenticated: só a função abaixo
-- chama. Sem linha: {source: null, version: 0}.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_signup_source_result(p_person uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('source', s.source, 'version', s.version, 'answered_at', s.answered_at, 'updated_at', s.updated_at)
       from public.signup_sources s where s.person_id = p_person),
    jsonb_build_object('source', null, 'version', 0, 'answered_at', null, 'updated_at', null));
$$;

-- ---------------------------------------------------------------------------
-- Responder ou mudar a resposta. p_source: uma das seis origens. p_version: a versão que a pessoa leu (0 quando ainda não há resposta).
-- Ordem: sessão (nao_autenticado); chave (chave_invalida); trava da chave; repetição (chave_reutilizada se a ação ou o pedido mudam;
-- na repetição certa devolve a resposta atual); sem_permissao (a pessoa precisa ter o Pessoal: conta que nunca entrou no app, excluída
-- ou anônima não responde); origem_invalida; trava da pessoa; versao_desatualizada (detalhe versao_atual=n); escrita (cria a linha com
-- versão 1, ou troca a origem e soma 1 à versão; mesma origem não grava nada); operação, a última gravação, que recusa a conta excluída
-- (conta_excluida) desfazendo tudo. Recusa não grava nada (a chave pode ser usada de novo).
-- Retorno: {source, version, answered_at, updated_at}.
-- ---------------------------------------------------------------------------
create or replace function public.set_signup_source(p_source text, p_key text, p_version integer)
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
  v_row public.signup_sources%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  perform public.clarevo_check_key(p_key);
  v_hash := md5(jsonb_build_array('responder_origem_cadastro', p_source, p_version)::text);
  perform pg_advisory_xact_lock(hashtext('op:' || v_uid::text || ':' || p_key));

  select * into v_op from public.record_operations where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_op.action <> 'responder_origem_cadastro' or v_op.request_hash <> v_hash then
      raise exception 'chave_reutilizada' using errcode = 'PT409';
    end if;
    return public.clarevo_signup_source_result(v_uid);
  end if;

  -- A operação precisa de um contexto: o Pessoal da pessoa (quem nunca entrou no app, ou já saiu, não tem).
  select c.id into v_ctx from public.financial_contexts c
    join public.persons p on p.id = c.owner_person_id and p.deleted_at is null
   where c.owner_person_id = v_uid and c.kind = 'pessoal';
  if v_ctx is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('instagram', 'indicacao', 'empresa', 'busca', 'outro', 'prefiro_nao_dizer') then
    raise exception 'origem_invalida' using errcode = '22023';
  end if;

  -- A linha pode ainda não existir: a trava consultiva serializa a primeira resposta; depois, a linha.
  perform pg_advisory_xact_lock(hashtext('origem:' || v_uid::text));
  select * into v_row from public.signup_sources where person_id = v_uid for update;
  if p_version is distinct from coalesce(v_row.version, 0) then
    raise exception 'versao_desatualizada' using errcode = 'PT409', detail = 'versao_atual=' || coalesce(v_row.version, 0);
  end if;

  if v_row.person_id is null then
    insert into public.signup_sources (person_id, source) values (v_uid, p_source);
  elsif v_row.source <> p_source then
    update public.signup_sources set source = p_source, version = version + 1 where person_id = v_uid;
  end if;

  insert into public.record_operations (actor_id, idempotency_key, action, context_id, request_hash, record_id, commitment_id, target_id)
  values (v_uid, p_key, 'responder_origem_cadastro', v_ctx, v_hash, null, null, null);

  return public.clarevo_signup_source_result(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura: só a própria pessoa (S2). Sem escrita direta.
-- ---------------------------------------------------------------------------
alter table public.signup_sources enable row level security;
create policy signup_sources_own on public.signup_sources for select to authenticated
  using (person_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Excluir a conta (S5): a mesma função da 0015, com uma linha a mais na regra 5 (o que é só da pessoa, em qualquer contexto).
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

  -- Regra 4: a licença ativa termina no ato; os direitos ao plano saem; a empresa fica só com a licença encerrada, sem a pessoa.
  update public.licenses set status = 'encerrada', ended_at = now() where person_id = p_person and status = 'ativa';
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
-- Contagens da equipe (S6): clarevo_staff_signup_metrics(p_from, p_to). Só quem roda no SQL Editor do Supabase executa: sem execute para
-- public, anon, authenticated nem service_role. Devolve, por semana, contagens agregadas de cadastros, de primeiro registro e de origem.
-- Nada identifica uma pessoa: não há nome, e-mail, identificador, data de um cadastro nem valor financeiro na resposta.
--
-- O que cada medida conta (a semana é a do cadastro: a "coorte" da semana):
--   contas_criadas              pessoas com conta viva em persons cujo cadastro caiu na semana. "Cadastro" é a primeira entrada no app com
--                               o e-mail confirmado (a linha de persons nasce em ensure_personal_space); quem criou a conta no serviço de
--                               autenticação e nunca confirmou o e-mail ou nunca abriu o app não entra. Conta excluída (D-058) não existe
--                               mais no banco e sai da contagem; a pessoa anônima ("Pessoa que saiu") nunca conta.
--   contas_com_registro_7_dias  dessas pessoas, as que tiveram pelo menos um REGISTRO criado por elas nos 7 primeiros dias, contados da hora
--                               do cadastro (de created_at até 7 dias depois, sem incluir o instante final). REGISTRO é uma linha criada pela
--                               própria pessoa (created_by) em uma destas quatro tabelas de escrita do app:
--                               1) financial_records: gasto ou recebimento anotado, importado, ou nascido do pagamento de uma conta ou fatura;
--                               2) commitments avulsas: conta a pagar anotada à mão (sem série e sem cartão; as contas que o app gera
--                                  sozinho a partir de uma série, e as faturas, não contam);
--                               3) commitment_series: gasto fixo, parcelamento ou conta do ano cadastrado;
--                               4) card_entries: compra no cartão (a primeira parcela de cada compra; encargo, estorno e as outras parcelas
--                                  não contam).
--                               Fica de fora o que é preparação ou resposta: conta de origem, cartão, meta, orçamento, limite, renda de
--                               referência, plano de guardar, marcas e revisões. A linha conta mesmo se a pessoa a excluiu depois (o app só
--                               marca como excluída): o que se mede é ter começado a anotar. A janela de 7 dias só fecha quando todas as
--                               contas da semana já a completaram (semana + 14 dias); antes disso a medida sai sem valor, com a marca
--                               "janela aberta", porque um número parcial pareceria queda.
--   origem_<origem>             dessas pessoas, as que responderam "Como você conheceu o Clarevo?" (instagram, indicacao, empresa, busca,
--                               outro, prefiro_nao_dizer) e cuja resposta é essa agora. A resposta pode chegar depois da semana e pode
--                               mudar: a contagem sempre mostra a resposta atual, na semana do cadastro. A pergunta é opcional, então a
--                               soma das origens é menor que contas_criadas, e a diferença não é publicada (não há total de respostas).
--
-- Regras de privacidade (supressão de células pequenas), válidas para toda a resposta:
--   1. Toda contagem entre 1 e 4 sai como total nulo, com a marca "menos de 5". Zero e 5 ou mais saem como são.
--   2. Só semanas inteiras (segunda a domingo, no fuso America/Sao_Paulo): p_from sobe para a segunda-feira da sua semana e p_to
--      para o domingo da sua semana. Nunca há contagem por dia, nem por parte de uma semana, porque duas consultas com cortes de dia
--      diferentes, subtraídas uma da outra, revelariam a contagem de um dia pequeno.
--   3. Não há linha de total do período, nem total de respostas, nem soma de semanas: subtrair as semanas mostradas de um total
--      revelaria a semana escondida. O período pedido tem no máximo 104 semanas.
--   4. A única medida que é parte de outra (contas_com_registro_7_dias dentro de contas_criadas) também sai escondida, com a marca
--      "complemento menor que 5", quando as contas SEM registro nessa semana forem de 1 a 4 (senão contas_criadas menos a medida revelaria
--      essa contagem pequena).
--   5. Marcas possíveis: "menos de 5" (a contagem real está entre 1 e 4), "complemento menor que 5" (regra 4), "janela aberta" (a janela
--      de 7 dias ainda não fechou) e "semana em andamento" (a semana ainda não terminou, a contagem pode crescer; o total aparece).
--   O que a regra protege é o que SAI do SQL Editor (planilha, relatório, print). Quem consulta várias vezes ao longo do dia vê a contagem
--   crescer, sem saber quem entrou.
--
-- Colunas: week_start (a segunda-feira da semana), measure (a medida acima), total (a contagem, ou nulo quando escondida) e mark.
-- O "hoje" é o do fuso America/Sao_Paulo (ou o clarevo.today dos testes). Contas de demonstração e de teste: a demonstração do app roda
-- só na memória do aparelho e nunca grava nada no banco; contas de teste existem só no projeto clarevo-teste (docs/05). Uma conta de
-- teste criada de propósito no projeto de produção (por exemplo, a da revisão das lojas) conta como qualquer conta: a equipe deve lembrar
-- disso ao ler as semanas em que ela nasceu.
-- ---------------------------------------------------------------------------
create or replace function public.clarevo_staff_signup_metrics(p_from date, p_to date)
returns table (week_start date, measure text, total integer, mark text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_w0 date;
  v_w1 date;
  v_today date := public.clarevo_today(null::uuid);
begin
  -- Datas não finitas são recusadas antes de qualquer conta (extract/date_trunc delas não terminariam a série de semanas).
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from then
    raise exception 'periodo_invalido' using errcode = '22023', hint = 'Informe p_from e p_to (datas), com p_to depois de p_from.';
  end if;
  v_w0 := date_trunc('week', p_from::timestamp)::date;
  v_w1 := date_trunc('week', p_to::timestamp)::date;
  if v_w1 - v_w0 > 7 * 103 then
    raise exception 'periodo_invalido' using errcode = '22023', hint = 'No máximo 104 semanas por consulta.';
  end if;

  return query
  with pessoas as (
    select p.id, p.created_at,
           date_trunc('week', p.created_at at time zone 'America/Sao_Paulo')::date as w
      from public.persons p
     where p.deleted_at is null
       and p.created_at >= (v_w0::timestamp at time zone 'America/Sao_Paulo')
       and p.created_at <  ((v_w1 + 7)::timestamp at time zone 'America/Sao_Paulo')
  ),
  por_pessoa as (
    select pe.w, s.source,
           (exists (select 1 from public.financial_records r
                     where r.created_by = pe.id and r.created_at >= pe.created_at and r.created_at < pe.created_at + interval '7 days')
            or exists (select 1 from public.commitments c
                        where c.created_by = pe.id and c.series_id is null and c.card_id is null
                          and c.created_at >= pe.created_at and c.created_at < pe.created_at + interval '7 days')
            or exists (select 1 from public.commitment_series cs
                        where cs.created_by = pe.id and cs.created_at >= pe.created_at and cs.created_at < pe.created_at + interval '7 days')
            or exists (select 1 from public.card_entries e
                        where e.created_by = pe.id and e.kind = 'parcela' and e.installment_number = 1
                          and e.created_at >= pe.created_at and e.created_at < pe.created_at + interval '7 days')) as com_registro
      from pessoas pe
      left join public.signup_sources s on s.person_id = pe.id
  ),
  semanas as (
    select g::date as w from generate_series(v_w0::timestamp, v_w1::timestamp, interval '7 days') g
  ),
  contagens as (
    select sm.w,
           count(pp.w)::int as n,
           (count(pp.w) filter (where pp.com_registro))::int as r,
           (count(pp.w) filter (where pp.source = 'instagram'))::int as o_instagram,
           (count(pp.w) filter (where pp.source = 'indicacao'))::int as o_indicacao,
           (count(pp.w) filter (where pp.source = 'empresa'))::int as o_empresa,
           (count(pp.w) filter (where pp.source = 'busca'))::int as o_busca,
           (count(pp.w) filter (where pp.source = 'outro'))::int as o_outro,
           (count(pp.w) filter (where pp.source = 'prefiro_nao_dizer'))::int as o_prefiro,
           (sm.w + 6 >= v_today) as em_andamento,
           (v_today >= sm.w + 14) as janela_fechada
      from semanas sm
      left join por_pessoa pp on pp.w = sm.w
     group by sm.w
  )
  select c.w, m.measure,
         case when m.mark is not null and m.mark <> 'semana em andamento' then null else m.val end,
         m.mark
    from contagens c
    cross join lateral (
      values
        (1, 'contas_criadas', c.n,
         case when c.n between 1 and 4 then 'menos de 5' when c.em_andamento then 'semana em andamento' end),
        (2, 'contas_com_registro_7_dias', c.r,
         case when not c.janela_fechada then 'janela aberta'
              when c.r between 1 and 4 then 'menos de 5'
              when (c.n - c.r) between 1 and 4 then 'complemento menor que 5' end),
        (3, 'origem_instagram', c.o_instagram,
         case when c.o_instagram between 1 and 4 then 'menos de 5' when c.em_andamento then 'semana em andamento' end),
        (4, 'origem_indicacao', c.o_indicacao,
         case when c.o_indicacao between 1 and 4 then 'menos de 5' when c.em_andamento then 'semana em andamento' end),
        (5, 'origem_empresa', c.o_empresa,
         case when c.o_empresa between 1 and 4 then 'menos de 5' when c.em_andamento then 'semana em andamento' end),
        (6, 'origem_busca', c.o_busca,
         case when c.o_busca between 1 and 4 then 'menos de 5' when c.em_andamento then 'semana em andamento' end),
        (7, 'origem_outro', c.o_outro,
         case when c.o_outro between 1 and 4 then 'menos de 5' when c.em_andamento then 'semana em andamento' end),
        (8, 'origem_prefiro_nao_dizer', c.o_prefiro,
         case when c.o_prefiro between 1 and 4 then 'menos de 5' when c.em_andamento then 'semana em andamento' end)
    ) as m (ord, measure, val, mark)
   order by c.w, m.ord;
end;
$$;
comment on function public.clarevo_staff_signup_metrics(date, date) is
  'Equipe Clarevo, só no SQL Editor: cadastros, contas com registro nos 7 primeiros dias e respostas de origem, por semana inteira, com supressão de contagens de 1 a 4 (mark "menos de 5"). Sem total do período. Regras no cabeçalho da migração 0018.';

-- ---------------------------------------------------------------------------
-- Privilégios, só do que é novo. A tabela fica só com leitura (pela RLS); a função de responder é a única com execute para quem tem
-- sessão; o gatilho, o resultado e a função da equipe ficam sem execute para public, anon, authenticated e service_role (o papel pode
-- não existir num Postgres comum, por isso a conferência em pg_roles). As funções recriadas acima mantêm os privilégios que tinham.
-- ---------------------------------------------------------------------------
revoke all on public.signup_sources from anon, authenticated;
grant select on public.signup_sources to authenticated;

revoke all on function public.signup_sources_guard() from public, anon, authenticated;
revoke all on function public.clarevo_signup_source_result(uuid) from public, anon, authenticated;
revoke all on function public.set_signup_source(text, text, integer) from public, anon, authenticated;
revoke all on function public.clarevo_staff_signup_metrics(date, date) from public, anon, authenticated;
do $$
declare
  f text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['signup_sources_guard()', 'clarevo_signup_source_result(uuid)', 'clarevo_staff_signup_metrics(date, date)'] loop
      execute format('revoke all on function public.%s from service_role', f);
    end loop;
  end if;
end $$;

grant execute on function public.set_signup_source(text, text, integer) to authenticated;
