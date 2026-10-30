#!/usr/bin/env bash
# Integração: código do app (SupabaseRepository) → API PostgREST (a mesma do Supabase) → banco com as migrações.
# Uso: npm run test:api   (requer Postgres local e o binário `postgrest` no PATH: https://postgrest.org)
# Pessoas fictícias; segredo de assinatura válido só para este teste local.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd .. && pwd)"
DB="clarevo_api_$$"
API_PORT="${CLAREVO_API_PORT:-54399}"
PROXY_PORT="${CLAREVO_PROXY_PORT:-54321}"
SECRET="segredo-de-teste-local-clarevo-0123456789abcdef"
ANA=00000000-0000-0000-0000-0000000000a1
BRUNO=00000000-0000-0000-0000-0000000000b1
EVA=00000000-0000-0000-0000-0000000000e1
CARLA=00000000-0000-0000-0000-0000000000c1
DAVI=00000000-0000-0000-0000-0000000000d1
FABIO=00000000-0000-0000-0000-0000000000f1
GIL=00000000-0000-0000-0000-0000000000a7

createdb "$DB"
cleanup() {
  [ -n "${PGRST_PID:-}" ] && kill "$PGRST_PID" 2>/dev/null || true
  [ -n "${PROXY_PID:-}" ] && kill "$PROXY_PID" 2>/dev/null || true
  sleep 0.5
  dropdb --if-exists "$DB"
}
trap cleanup EXIT

psql -v ON_ERROR_STOP=1 -q -d "$DB" -f tests/00_auth_shim.sql
for f in migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"; done
psql -v ON_ERROR_STOP=1 -q -d "$DB" <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'clarevo_api_teste') then
    create role clarevo_api_teste login noinherit password 'senha-local-de-teste';
  end if;
end \$\$;
-- service_role: só o teste do WhatsApp usa, como a função do servidor (chave de serviço).
grant anon, authenticated, service_role to clarevo_api_teste;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('$ANA', 'ana@exemplo.test', now(), '{"display_name":"Ana"}'),
  ('$BRUNO', 'bruno@exemplo.test', now(), '{"display_name":"Bruno"}'),
  ('$EVA', 'eva@exemplo.test', null, '{"display_name":"Eva"}'),
  ('$CARLA', 'carla@exemplo.test', now(), '{"display_name":"Carla Souza"}'),
  ('$DAVI', 'davi@exemplo.test', now(), '{"display_name":"Davi Prado"}'),
  ('$FABIO', 'fabio@exemplo.test', now(), '{"display_name":"Fábio Reis"}'),
  ('$GIL', 'gil@exemplo.test', now(), '{"display_name":"Gil"}');
alter database "$DB" set clarevo.today = '2026-10-07';
-- Só neste banco descartável: o cabeçalho x-clarevo-today muda o "hoje" de uma requisição, para conferir a geração
-- de contas de gasto fixo com o passar dos meses. Sem o cabeçalho, vale o dia fixo acima.
create schema clarevo_teste;
create function clarevo_teste.hoje_da_requisicao() returns void language plpgsql as \$\$
declare
  v_today text := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-clarevo-today';
begin
  if v_today is not null then
    perform set_config('clarevo.today', v_today::date::text, true);
  end if;
end \$\$;
grant usage on schema clarevo_teste to anon, authenticated;
grant execute on function clarevo_teste.hoje_da_requisicao() to anon, authenticated;
SQL

PGRST_DB_URI="postgres://clarevo_api_teste:senha-local-de-teste@127.0.0.1:${PGPORT:-5432}/$DB" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT=$API_PORT \
PGRST_DB_PRE_REQUEST=clarevo_teste.hoje_da_requisicao \
  postgrest > "${TMPDIR:-/tmp}/clarevo-postgrest-$API_PORT.log" 2>&1 &
PGRST_PID=$!
node tests/api-proxy.js $PROXY_PORT $API_PORT &
PROXY_PID=$!
for i in $(seq 1 40); do
  curl -s -o /dev/null "http://127.0.0.1:$API_PORT/" && break
  sleep 0.25
done

cd "$ROOT"
CLAREVO_DB="$DB" CLAREVO_API_URL="http://127.0.0.1:$PROXY_PORT" CLAREVO_JWT_SECRET="$SECRET" \
CLAREVO_ANA=$ANA CLAREVO_BRUNO=$BRUNO CLAREVO_EVA=$EVA CLAREVO_CARLA=$CARLA CLAREVO_DAVI=$DAVI CLAREVO_FABIO=$FABIO \
  npx vitest run --root apps/app test/supabase-api.int.test.ts
# WhatsApp (D-076): depois do teste principal, com a pessoa só dele (Gil) e a chave de serviço, como a função do servidor.
CLAREVO_API_URL="http://127.0.0.1:$PROXY_PORT" CLAREVO_JWT_SECRET="$SECRET" CLAREVO_GIL=$GIL \
  npx vitest run --root apps/app test/whatsapp-api.int.test.ts
