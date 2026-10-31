#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local
exec 9>.local/aws-deploy.lock
flock -n 9 || { echo 'Another deployment is active'; exit 1; }
[[ -f .env.aws && -s .local/rds-ca.pem ]] || { echo 'Prepare .env.aws and .local/rds-ca.pem first'; exit 1; }
revision=$(git rev-parse HEAD)
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Deploy a clean checkout'; exit 1; }
if [[ -n "${1:-}" && "$revision" != "$1" ]]; then echo 'Checkout does not match expected commit'; exit 1; fi
export MOTION_IMAGE="motion-api:$revision"
compose=(docker compose --project-name motion-aws --env-file .env.aws -f deployment/compose.aws.yaml)
"${compose[@]}" config --quiet
previous=$(docker inspect --format '{{.Config.Image}}' "$("${compose[@]}" ps -q api)" 2>/dev/null || true)
docker build --tag "$MOTION_IMAGE" .
# Migrate before replacing the running API. Schema changes must be backward-compatible.
"${compose[@]}" run --rm --no-deps api node dist/infrastructure/database/migrate.js
if ! "${compose[@]}" up --detach --wait --wait-timeout 150 api; then
  echo 'New API failed readiness; database migrations are NOT reverted.'
  if [[ -n "$previous" ]]; then
    export MOTION_IMAGE="$previous"
    "${compose[@]}" up --detach --wait --wait-timeout 150 api || true
  else
    "${compose[@]}" stop api || true
  fi
  exit 1
fi
printf '%s\n' "$revision" > .local/aws-deployed-revision
printf 'Deployment ready: %s\n' "$revision"
