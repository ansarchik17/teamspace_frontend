#!/usr/bin/env python3
"""Read-only production preflight; print counts/fingerprints, never credentials."""
import json
import socket
import subprocess
import sys
import urllib.parse
import urllib.request

from realm_transfer import Admin, digest

EXPECTED_HOST = 'vds38185.vpsza500.kz'


def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name], text=True))[0]


def environment(container):
    return dict(item.split('=', 1) for item in container['Config']['Env'] if '=' in item)


def get(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=10) as response:
        return json.load(response)


def preflight():
    if socket.getfqdn() != EXPECTED_HOST:
        raise RuntimeError('This preflight is restricted to the Beles Workspace host')
    source = inspect('whiteboard-keycloak')
    target = inspect('workspace-keycloak')
    backend = inspect('whiteboard-backend')
    if not all(c['State']['Running'] for c in (source, target, backend)):
        raise RuntimeError('Source, destination and backend must be running')
    if (source['Config']['Image'] != target['Config']['Image']
            or source['Image'] != target['Image']
            or source['Config']['Image'] != 'quay.io/keycloak/keycloak:24.0.0'):
        raise RuntimeError('Only the rehearsed, matching Keycloak 24.0.0 images are supported')
    backend_env = environment(backend)
    public = urllib.parse.urlsplit(backend_env['KEYCLOAK_PUBLIC_URL'])
    if (public.scheme != 'https' or not public.hostname or public.port not in (None, 443)
            or public.username or public.password or public.query or public.fragment
            or backend_env.get('KEYCLOAK_REALM') != 'whiteboard'):
        raise RuntimeError('Unexpected whiteboard public configuration')
    headers = {'Host': public.netloc, 'X-Forwarded-Proto': 'https',
               'X-Forwarded-Prefix': public.path.rstrip('/')}
    base = 'http://127.0.0.1:15173/realms/whiteboard'
    discovery = get(base + '/.well-known/openid-configuration', headers)
    keys = get(base + '/protocol/openid-connect/certs', headers)
    report = {'host': EXPECTED_HOST, 'source_image': source['Config']['Image'],
              'target_image': target['Config']['Image'], 'public_base': backend_env['KEYCLOAK_PUBLIC_URL'],
              'issuer': discovery['issuer'], 'source_jwks_sha256': digest(sorted(keys['keys'], key=lambda k: k['kid'])),
              'source_volumes': [m['Name'] for m in source['Mounts'] if m['Type'] == 'volume']}
    for label, container, network, prefix in (
            ('source', source, 'whiteboard_internal', ''),
            ('target', target, 'workspace_workspace', '/auth')):
        env = environment(container)
        address = container['NetworkSettings']['Networks'][network]['IPAddress']
        username = env.get('KEYCLOAK_ADMIN') or env.get('KC_BOOTSTRAP_ADMIN_USERNAME')
        password = env.get('KEYCLOAK_ADMIN_PASSWORD') or env.get('KC_BOOTSTRAP_ADMIN_PASSWORD')
        try:
            if not username or not password:
                raise RuntimeError('No existing admin credential configured')
            admin = Admin(f'http://{address}:8080{prefix}', username, password)
            realms = admin.realms()
            report[label + '_admin_authenticated'] = True
            if label == 'source':
                report['source_users'] = admin.request('GET', '/realms/whiteboard/users/count')
                report['source_clients'] = sorted(c['clientId'] for c in admin.request('GET', '/realms/whiteboard/clients'))
                report['source_frontend_url'] = admin.request('GET', '/realms/whiteboard').get('attributes', {}).get('frontendUrl')
            else:
                report['target_whiteboard_absent'] = not any(r['realm'] == 'whiteboard' for r in realms)
        except RuntimeError:
            report[label + '_admin_authenticated'] = False
    # Runs inside the existing backend: no credentials or mailbox/board contents leave it.
    storage_probe = '''import os,sqlite3,json,hashlib,boto3
from botocore.config import Config
hash_value=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
connection=sqlite3.connect('file:'+os.environ['AUTH_DB_PATH']+'?mode=ro',uri=True)
users=connection.execute('select id,username,password_hash,created_at from users order by id').fetchall()
connection.close()
s3=boto3.client('s3',endpoint_url=os.environ['MINIO_ENDPOINT'],aws_access_key_id=os.environ['MINIO_ACCESS_KEY'],aws_secret_access_key=os.environ['MINIO_SECRET_KEY'],config=Config(connect_timeout=5,read_timeout=10,retries={'max_attempts':1}))
objects=[]
for page in s3.get_paginator('list_objects_v2').paginate(Bucket=os.environ.get('MINIO_BUCKET','whiteboards')):
 objects.extend((o['Key'],o['ETag'],o['Size']) for o in page.get('Contents',[]))
print(json.dumps({'local_users':len(users),'local_users_sha256':hash_value(users),'board_objects':len(objects),'board_objects_sha256':hash_value(sorted(objects))}))
'''
    report['storage'] = json.loads(subprocess.check_output(
        ['docker', 'exec', 'whiteboard-backend', 'python', '-c', storage_probe], text=True, stderr=subprocess.PIPE))
    report['ready_for_backup'] = (report.get('source_admin_authenticated') is True
                                  and report.get('target_admin_authenticated') is True
                                  and report.get('target_whiteboard_absent') is True)
    return report


if __name__ == '__main__':
    try:
        print(json.dumps(preflight(), ensure_ascii=False, indent=2))
    except Exception as error:
        print(f'Whiteboard preflight failed: {type(error).__name__}', file=sys.stderr)
        sys.exit(1)
