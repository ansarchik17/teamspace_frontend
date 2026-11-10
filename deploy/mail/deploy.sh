#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${MAIL_ROOT:-/opt/workspace/mail}"
COMPOSE_FILE="$ROOT/compose.production.yaml"
ENV_FILE="$ROOT/.env.production"
IMAGE_FILE="$ROOT/images.env"

[[ -f "$COMPOSE_FILE" ]] || { echo "Missing $COMPOSE_FILE" >&2; exit 1; }
[[ -f "$IMAGE_FILE" ]] || { echo "Missing $IMAGE_FILE" >&2; exit 1; }

if [[ ! -f "$ENV_FILE" ]]; then
  umask 077
  mkdir -p "$ROOT/secrets" "$ROOT/.local"
  postgres_password="$(openssl rand -hex 24)"
  mail_credential_key="$(openssl rand -hex 32)"
  cat >"$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$postgres_password
MAIL_CREDENTIAL_KEY=$mail_credential_key
APP_ORIGIN=https://inbox.teamspace.kz
WORKSPACE_ORIGIN=https://teamspace.kz
WORKSPACE_API_URL=https://teamspace.kz
WORKSPACE_MAIL_DOMAIN_BASE=teamspace.kz
COOKIE_SECURE=true
MAIL_MODE=stalwart
STALWART_URL=https://mail.teamspace.kz
STALWART_PUBLIC_URL=https://mail.teamspace.kz
ALLOW_TEST_DOMAINS=false
ALLOW_EXTERNAL_MAIL=true
STALWART_PROVISIONING_ENABLED=false
STALWART_API_KEY_FILE=/run/secrets/stalwart-api-key
EOF
  echo "Created $ENV_FILE with persistent application secrets." >&2
fi


SHARED_ENV_ARGS=()
ORPHAN_ARGS=(--remove-orphans)
SHARED_INFRA_ACTIVE=false
if [[ -f "$ROOT/.shared-infra.env" ]]; then
  source "$(dirname -- "${BASH_SOURCE[0]}")/shared-mode.sh"
  shared_infra_activate "$ROOT" "$COMPOSE_FILE" "mail"
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" --env-file "$IMAGE_FILE" ${SHARED_ENV_ARGS[@]+"${SHARED_ENV_ARGS[@]}"} -f "$COMPOSE_FILE")
"${COMPOSE[@]}" config >/dev/null

for attempt in 1 2 3 4 5; do
  if "${COMPOSE[@]}" pull app; then
    break
  fi
  if [[ "$attempt" == 5 ]]; then
    echo "Unable to pull mail application image" >&2
    exit 1
  fi
  sleep $((attempt * 10))
done

if [[ "$SHARED_INFRA_ACTIVE" == true ]]; then
  "${COMPOSE[@]}" up -d app
else
  "${COMPOSE[@]}" up -d --remove-orphans db app
fi

for attempt in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:14100/api/health >/dev/null 2>&1; then
    echo "Mail healthcheck passed"
    "${COMPOSE[@]}" ps
    exit 0
  fi
  echo "Waiting for mail healthcheck ${attempt}/45..."
  sleep 2
done

echo "Mail healthcheck failed" >&2
"${COMPOSE[@]}" ps >&2 || true
"${COMPOSE[@]}" logs --no-color --tail=200 app >&2 || true
exit 1
