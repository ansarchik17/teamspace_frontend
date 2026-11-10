#!/usr/bin/env bash
# A verified migration marker is required before selecting the shared realm.
shared_keycloak_activate() {
  local root="$1"
  python3 "$root/keycloak/verify-shared.py" "$root/.shared-keycloak.json" || return 1
  COMPOSE_FILE="$root/compose.keycloak-shared.yml"
  if [[ "${SHARED_INFRA_ACTIVE:-false}" == true ]]; then
    COMPOSE_FILE="$COMPOSE_FILE.shared.yml"
  fi
  [[ -s "$COMPOSE_FILE" ]] || {
    echo 'Shared Keycloak Compose is missing; deployment aborted.' >&2; return 1;
  }
  # Preserve rollback containers/volumes, including the original Keycloak data.
  ORPHAN_ARGS=()
}
