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
export MOTION_CADDY_IMAGE="motion-caddy:$revision"
export MOTION_AI_IMAGE="motion-ai:$revision"
compose=(docker compose --project-name motion-aws --env-file .env.aws -f deployment/compose.aws.yaml)
"${compose[@]}" config --quiet
# Build API and Admin-enabled Caddy images.
docker build --tag "$MOTION_IMAGE" .
docker build --tag "$MOTION_CADDY_IMAGE" admin-dashboard
# Validate the proxy configuration before migrating or replacing the API.
"${compose[@]}" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
previous=$(docker inspect --format '{{.Config.Image}}' "$("${compose[@]}" ps -q api)" 2>/dev/null || true)

# Build and start the isolated private AI sidecar when AI retention & token are configured.
ai_approved=$(grep -E '^AI_RETENTION_APPROVED=' .env.aws | tail -n1 | cut -d= -f2- | tr -d '\r' || true)
ai_token=$(grep -E '^AI_SERVICE_TOKEN=' .env.aws | tail -n1 | cut -d= -f2- | tr -d '\r' || true)
if [[ "$ai_approved" == "true" && ${#ai_token} -ge 32 ]]; then
  docker build --tag "$MOTION_AI_IMAGE" ai-service
  "${compose[@]}" --profile ai up --detach --wait --wait-timeout 90 ai
fi

# Migrate and seed before replacing the running API. Schema changes must be backward-compatible.
"${compose[@]}" run --rm --no-deps api node dist/infrastructure/database/migrate.js
"${compose[@]}" run --rm --no-deps api node dist/infrastructure/database/seeds/seed-lookups.js
"${compose[@]}" run --rm --no-deps api node dist/infrastructure/database/seeds/seed-content.js
"${compose[@]}" run --rm --no-deps api node dist/infrastructure/database/seeds/seed-programs.js
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
"${compose[@]}" up --detach --wait --wait-timeout 60 caddy
# A bind-mounted configuration can change without Compose recreating the container.
"${compose[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
printf '%s\n' "$revision" > .local/aws-deployed-revision
printf 'Deployment ready: %s\n' "$revision"
