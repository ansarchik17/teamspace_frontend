#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/opt/workspace/whiteboard"
COMPOSE_FILE="$ROOT/compose.yml"
ENV_FILE="$ROOT/.env"
IMAGE_FILE="$ROOT/images.env"

install -d -m 0750 "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
WHITEBOARD_MINIO_ROOT_USER=whiteboard
WHITEBOARD_MINIO_ROOT_PASSWORD=$(openssl rand -hex 32)
WHITEBOARD_KEYCLOAK_ADMIN_USERNAME=admin
WHITEBOARD_KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -hex 32)
WHITEBOARD_PUBLIC_APP_URL=https://teamspace.kz/whiteboard
WHITEBOARD_KEYCLOAK_PUBLIC_URL=https://teamspace.kz/whiteboard
EOF
  chmod 0640 "$ENV_FILE"
fi

[[ -f "$IMAGE_FILE" ]] || {
  echo "Missing $IMAGE_FILE" >&2
  exit 1
}

exec 9>"$ROOT/.deploy.lock"
flock 9


SHARED_ENV_ARGS=()
ORPHAN_ARGS=(--remove-orphans)
SHARED_INFRA_ACTIVE=false
if [[ -f "$ROOT/.shared-infra.env" ]]; then
  source "$(dirname -- "${BASH_SOURCE[0]}")/shared-mode.sh"
  shared_infra_activate "$ROOT" "$COMPOSE_FILE" "whiteboard"
fi

if [[ -e "$ROOT/.shared-keycloak.json" || -L "$ROOT/.shared-keycloak.json" ]]; then
  source "$ROOT/shared-keycloak.sh"
  shared_keycloak_activate "$ROOT"
fi

docker compose --env-file "$ENV_FILE" --env-file "$IMAGE_FILE" ${SHARED_ENV_ARGS[@]+"${SHARED_ENV_ARGS[@]}"} \
  -f "$COMPOSE_FILE" config >/dev/null
docker compose --env-file "$ENV_FILE" --env-file "$IMAGE_FILE" ${SHARED_ENV_ARGS[@]+"${SHARED_ENV_ARGS[@]}"} \
  -f "$COMPOSE_FILE" pull backend frontend
docker compose --env-file "$ENV_FILE" --env-file "$IMAGE_FILE" ${SHARED_ENV_ARGS[@]+"${SHARED_ENV_ARGS[@]}"} \
  -f "$COMPOSE_FILE" up -d ${ORPHAN_ARGS[@]+"${ORPHAN_ARGS[@]}"}

for attempt in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:15173/health >/dev/null 2>&1; then
    docker compose --env-file "$ENV_FILE" --env-file "$IMAGE_FILE" ${SHARED_ENV_ARGS[@]+"${SHARED_ENV_ARGS[@]}"} \
      -f "$COMPOSE_FILE" ps
    exit 0
  fi
  sleep 2
done

docker compose --env-file "$ENV_FILE" --env-file "$IMAGE_FILE" ${SHARED_ENV_ARGS[@]+"${SHARED_ENV_ARGS[@]}"} \
  -f "$COMPOSE_FILE" ps >&2 || true
docker compose --env-file "$ENV_FILE" --env-file "$IMAGE_FILE" ${SHARED_ENV_ARGS[@]+"${SHARED_ENV_ARGS[@]}"} \
  -f "$COMPOSE_FILE" logs --no-color --tail=200 frontend backend >&2 || true
exit 1
