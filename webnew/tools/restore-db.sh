#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

backup_file="${1:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" || ! -r "$backup_file" ]]; then
  echo "Usage: bash tools/restore-db.sh <backup-file.dump>" >&2
  exit 2
fi
if [[ "$backup_file" != /* ]]; then
  backup_file="$PWD/$backup_file"
fi

db_admin() {
  docker compose exec -T db sh -c \
    'PGPASSWORD="$POSTGRES_PASSWORD" "$@"' sh "$@"
}

restore_db="anviet_restore_$(date -u +%Y%m%d%H%M%S)_$$_${RANDOM}"
previous_db="anviet_before_restore_$(date -u +%Y%m%d%H%M%S)_$$_${RANDOM}"
failed_db="anviet_failed_restore_$(date -u +%Y%m%d%H%M%S)_$$_${RANDOM}"
restore_db_created=0
old_renamed=0
new_renamed=0
api_stopped=0

restore_previous_database() {
  db_admin psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER DATABASE $previous_db ALLOW_CONNECTIONS true"
  db_admin psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER DATABASE $previous_db RENAME TO anviet"
}

cleanup() {
  result=$?
  trap - EXIT
  set +e
  if (( result != 0 )); then
    if (( old_renamed && !new_renamed )); then
      restore_previous_database || echo "Could not restore database name; previous database is $previous_db." >&2
    elif (( old_renamed && new_renamed && api_stopped )); then
      docker compose stop api >/dev/null 2>&1
      db_admin psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
        -c "ALTER DATABASE anviet ALLOW_CONNECTIONS false" >/dev/null 2>&1
      db_admin psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'anviet' AND pid <> pg_backend_pid()" >/dev/null 2>&1
      db_admin psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
        -c "ALTER DATABASE anviet RENAME TO $failed_db" >/dev/null 2>&1
      restore_previous_database || echo "Could not roll back automatically; keep $previous_db and $failed_db for recovery." >&2
    fi
    if (( restore_db_created && !new_renamed )); then
      db_admin dropdb --if-exists -U postgres "$restore_db" >/dev/null 2>&1
    fi
    if (( api_stopped )); then
      docker compose up -d api >/dev/null 2>&1
    fi
  fi
  exit "$result"
}
trap cleanup EXIT

echo "Validating custom-format PostgreSQL archive..."
docker compose exec -T db pg_restore --list < "$backup_file" >/dev/null
for database_name in "$restore_db" "$previous_db" "$failed_db"; do
  existing_database="$(db_admin psql -U postgres -d postgres -Atqc \
    "SELECT 1 FROM pg_database WHERE datname = '$database_name'")"
  if [[ "$existing_database" == "1" ]]; then
    echo "Generated database name already exists: $database_name" >&2
    exit 1
  fi
done

echo "Restoring backup into temporary database $restore_db..."
db_admin createdb -U postgres -O postgres "$restore_db"
restore_db_created=1
docker compose exec -T db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$1"' \
  sh "$restore_db" < "$backup_file"
db_admin psql -U postgres -d "$restore_db" -v ON_ERROR_STOP=1 \
  -c "TRUNCATE TABLE auth_sessions"

printf 'This replaces the active anviet database. Type "RESTORE anviet" to continue: '
IFS= read -r confirmation
if [[ "$confirmation" != "RESTORE anviet" ]]; then
  echo "Restore cancelled. The active database was not changed." >&2
  exit 1
fi

docker compose stop api
api_stopped=1
db_admin psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER DATABASE anviet ALLOW_CONNECTIONS false"
db_admin psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'anviet' AND pid <> pg_backend_pid()"
db_admin psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER DATABASE anviet RENAME TO $previous_db"
old_renamed=1
db_admin psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER DATABASE $restore_db RENAME TO anviet"
new_renamed=1

docker compose up -d api
healthy=0
for _ in {1..30}; do
  if docker compose exec -T api node -e \
    'fetch("http://127.0.0.1:3000/api/health").then(async r => { const d = await r.json(); if (!r.ok || d.status !== "ok") process.exitCode = 1; }).catch(() => { process.exitCode = 1; })' \
    >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done
if (( !healthy )); then
  echo "Restored database did not pass API health check; rolling back." >&2
  exit 1
fi
api_stopped=0

echo "Restore completed. Previous database is preserved as $previous_db."
echo "After verifying the site, remove that old database only if you need the disk space."
