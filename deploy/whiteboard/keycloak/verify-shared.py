#!/usr/bin/env python3
"""Fail closed when a shared realm is missing, unverified or has different keys."""
import hashlib
import json
from pathlib import Path
import stat
import subprocess
import sys
import urllib.request


def keys_hash(document):
    keys = document.get('keys')
    if not isinstance(keys, list) or not keys or any(not k.get('kid') for k in keys):
        raise ValueError('Invalid realm signing keys')
    return hashlib.sha256(json.dumps(sorted(keys, key=lambda k: k['kid']),
                                    sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def verify(path):
    info = path.stat()
    if info.st_uid != 0 or info.st_mode & 0o022 or not stat.S_ISREG(info.st_mode) or path.is_symlink():
        raise ValueError('Migration marker must be a root-owned, non-writable regular file')
    marker = json.loads(path.read_text())
    if (marker.get('version') != 1 or marker.get('status') != 'verified'
            or marker.get('realm') != 'whiteboard' or marker.get('target') != 'workspace-keycloak'):
        raise ValueError('Shared Keycloak migration is not verified')
    container = json.loads(subprocess.check_output(
        ['docker', 'inspect', 'workspace-keycloak'], text=True))[0]
    if not container['State']['Running']:
        raise ValueError('Shared Keycloak is not running')
    address = container['NetworkSettings']['Networks']['workspace_workspace']['IPAddress']
    base = f'http://{address}:8080/auth/realms/whiteboard'
    def get(url):
        with urllib.request.urlopen(url, timeout=8) as response:
            return json.load(response)
    discovery = get(base + '/.well-known/openid-configuration')
    if discovery.get('issuer') != marker.get('issuer'):
        raise ValueError('Shared realm issuer differs from the verified source')
    if keys_hash(get(base + '/protocol/openid-connect/certs')) != marker.get('jwks_sha256'):
        raise ValueError('Shared realm signing keys differ from the verified source')


if __name__ == '__main__':
    try:
        verify(Path(sys.argv[1]))
    except Exception as error:
        print(f'Shared Keycloak verification failed: {type(error).__name__}', file=sys.stderr)
        sys.exit(1)
    print('Shared whiteboard Keycloak verified')
