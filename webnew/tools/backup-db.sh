#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

backup_dir="${1:-$project_root/backups}"
mkdir -p "$backup_dir"
backup_name="anviet_$(date -u +%Y%m%dT%H%M%SZ).dump"
backup_file="$backup_dir/$backup_name"
if [[ -e "$backup_file" ]]; then
  echo "Backup already exists: $backup_file" >&2
  exit 1
fi

container_file="/tmp/anviet_backup_$$_${RANDOM}.dump"
temporary_file="$(mktemp "$backup_dir/.anviet_backup.XXXXXX")"
rm -f -- "$temporary_file"
cleanup() {
  docker compose exec -T db rm -f -- "$container_file" >/dev/null 2>&1 || true
  rm -f -- "$temporary_file"
}
trap cleanup EXIT

docker compose exec -T db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --file="$1"' \
  sh "$container_file"
docker compose cp "db:$container_file" "$temporary_file"
if [[ ! -s "$temporary_file" ]]; then
  echo "Backup file is empty; refusing to keep it." >&2
  exit 1
fi
mv -- "$temporary_file" "$backup_file"
chmod 600 "$backup_file"
sha256sum "$backup_file"
echo "Backup created: $backup_file"
