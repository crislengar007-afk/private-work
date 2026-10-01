#!/usr/bin/env bash
# Recreates a throwaway local database, applies the Supabase shim and every
# migration in order. For local testing only (needs a local Postgres).
set -euo pipefail
DB="${LOCAL_DB:-fmv_test}"
PGURL="${LOCAL_PG_URL:-postgresql://tester:tester@localhost:5432}"
cd "$(dirname "$0")/.."
psql "$PGURL/postgres" -qc "drop database if exists $DB" -c "create database $DB"
psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/00_local_shim.sql
for f in supabase/migrations/*.sql; do
  psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -f "$f" || { echo "FAILED: $f"; exit 1; }
done
echo "Applied $(ls supabase/migrations/*.sql | wc -l) migrations to $DB"
