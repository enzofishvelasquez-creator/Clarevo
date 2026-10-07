#!/usr/bin/env bash
# Cria um banco descartável, aplica as migrações e roda os testes de banco.
# Uso: npm run test:db   (requer Postgres local; variáveis PG* padrão)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="clarevo_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f tests/00_auth_shim.sql
for f in migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"; done
for t in tests/[1-9]*.sql; do
  echo "· $t"
  psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "$DB" -f "$t"
done
echo "Testes de banco: OK"
