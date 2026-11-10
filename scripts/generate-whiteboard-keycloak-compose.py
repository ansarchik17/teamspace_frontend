#!/usr/bin/env python3
"""Generate shared-Keycloak variants without changing storage or app services."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1] / 'deploy/whiteboard'


def generate(source):
    model = json.loads(subprocess.check_output([
        'docker', 'compose', '--env-file', '/dev/null', '-f', str(source),
        'config', '--no-interpolate', '--no-normalize', '--no-path-resolution',
        '--format', 'json',
    ], text=True))
    model['services']['keycloak'] = {
        # Reuse the existing, published nginx runtime; no new image dependency.
        'image': '${WHITEBOARD_FRONTEND_IMAGE_REF}',
        'container_name': 'whiteboard-keycloak-proxy',
        'entrypoint': ['nginx', '-g', 'daemon off;'],
        'user': '101:101',
        'read_only': True,
        'cap_drop': ['ALL'],
        'security_opt': ['no-new-privileges:true'],
        'mem_limit': '48m',
        'memswap_limit': '64m',
        'cpus': 0.25,
        'pids_limit': 64,
        'tmpfs': ['/tmp:rw,noexec,nosuid,size=8m,mode=1777'],
        'volumes': ['./keycloak/shared-proxy.conf:/etc/nginx/nginx.conf:ro'],
        'networks': {'whiteboard': {'aliases': ['whiteboard-keycloak']}, 'workspace': None},
        'healthcheck': {
            'test': ['CMD', 'wget', '-q', '-O', '/dev/null',
                     'http://127.0.0.1:8080/realms/whiteboard/.well-known/openid-configuration'],
            'interval': '15s', 'timeout': '5s', 'start_period': '10s', 'retries': 4,
        },
        'restart': 'unless-stopped',
    }
    # The stopped original container/volume is retained separately for rollback.
    model.get('volumes', {}).pop('whiteboard_keycloak_data', None)
    return json.dumps(model, ensure_ascii=False, indent=2) + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for name in ('compose.yml', 'compose.yml.shared.yml'):
        source = ROOT / name
        target = ROOT / name.replace('compose.yml', 'compose.keycloak-shared.yml', 1)
        content = generate(source)
        if args.check:
            if not target.exists() or target.read_text() != content:
                raise SystemExit(f'{target.name} is outdated; run {Path(__file__).name}')
        else:
            target.write_text(content)


if __name__ == '__main__':
    main()
