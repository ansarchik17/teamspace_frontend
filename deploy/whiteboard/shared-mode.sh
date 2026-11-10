#!/usr/bin/env bash
# Sourced only when a project has an installed .shared-infra.env marker.
shared_infra_activate() {
  local root="$1" base="$2" project="$3"
  local infra_root="${SHARED_INFRA_ROOT:-/opt/shared-infra}"
  [[ -r "$root/.shared-infra.env" && -s "$base.shared.yml" ]] || {
    echo "Shared mode is incomplete: install the shared Compose and credentials first." >&2; return 1;
  }
  python3 - "$infra_root/verified/$project.json" "$project" <<'PY'
import json,sys
try:
    record=json.load(open(sys.argv[1]))
    if record.get("status")!="restore_verified" or record.get("target_prefix")!="shared" or record.get("project")!=sys.argv[2]:
        raise ValueError()
except (OSError,ValueError):
    raise SystemExit("Shared mode has no verified restore record; deployment aborted.") from None
PY
  local name
  local containers=(shared-postgres shared-minio)
  case "$project" in
    growy|mail|ai) containers=(shared-postgres) ;;
    whiteboard) containers=(shared-minio) ;;
  esac
  for name in "${containers[@]}"; do
    [[ "$(docker inspect --format '{{.State.Health.Status}}' "$name")" == healthy ]] || {
      echo "Shared infrastructure is not healthy: $name" >&2; return 1;
    }
  done
  docker network inspect shared_infra >/dev/null
  COMPOSE_FILE="$base.shared.yml"
  SHARED_ENV_ARGS=(--env-file "$root/.shared-infra.env")
  ORPHAN_ARGS=()
  SHARED_INFRA_ACTIVE=true
}
