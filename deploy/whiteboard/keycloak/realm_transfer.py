"""Realm-only transfer primitives. Never export/import master or overwrite a realm."""
import copy
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True,
                                    separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


class Admin:
    def __init__(self, base, username, password):
        self.base = base.rstrip('/')
        body = urllib.parse.urlencode({'grant_type': 'password', 'client_id': 'admin-cli',
                                      'username': username, 'password': password}).encode()
        request = urllib.request.Request(self.base + '/realms/master/protocol/openid-connect/token',
                                         data=body, headers={'Content-Type': 'application/x-www-form-urlencoded'})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                self.token = json.load(response)['access_token']
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'Keycloak admin authentication failed: HTTP {error.code}') from None

    def request(self, method, path, value=None):
        data = None if value is None else json.dumps(value).encode()
        request = urllib.request.Request(self.base + '/admin' + path, method=method, data=data,
                                         headers={'Authorization': 'Bearer ' + self.token,
                                                  'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            # Error bodies can contain realm settings; keep them out of logs.
            raise RuntimeError(f'Keycloak admin operation failed: HTTP {error.code}') from None

    def realms(self):
        return self.request('GET', '/realms')

    def snapshot(self, realm='whiteboard'):
        if realm != 'whiteboard':
            raise ValueError('Only the whiteboard realm may be transferred')
        prefix = '/realms/' + realm
        users = []
        offset = 0
        while True:
            page = self.request('GET', prefix + f'/users?first={offset}&max=100&briefRepresentation=false')
            if not page:
                break
            for user in page:
                identity = {k: user.get(k) for k in ('id', 'username', 'email', 'emailVerified',
                            'firstName', 'lastName', 'enabled', 'attributes', 'requiredActions')}
                identity['groups'] = self.request('GET', prefix + '/users/' + user['id'] + '/groups')
                identity['roles'] = self.request('GET', prefix + '/users/' + user['id'] + '/role-mappings')
                credentials = self.request('GET', prefix + '/users/' + user['id'] + '/credentials')
                identity['credentials'] = sorted(({k: c.get(k) for k in
                    ('id', 'type', 'userLabel', 'createdDate', 'credentialData')} for c in credentials),
                    key=lambda c: c['id'])
                users.append(identity)
            offset += len(page)
            if offset > 100000:
                raise RuntimeError('User pagination exceeded the safety limit')
        clients = sorted(self.request('GET', prefix + '/clients'), key=lambda c: c['clientId'])
        # Clients include secrets internally; only fingerprints/counts leave this helper.
        return {'users': sorted(users, key=lambda u: u['id']), 'clients': clients,
                'roles': sorted(self.request('GET', prefix + '/roles'), key=lambda r: r['id'])}


def prepare_export(document, issuer):
    if document.get('realm') != 'whiteboard' or not document.get('id') or not document.get('enabled'):
        raise ValueError('A complete, enabled whiteboard realm export is required')
    if not isinstance(document.get('users'), list) or not document.get('components'):
        raise ValueError('CLI export including users and key-provider components is required')
    parsed = urllib.parse.urlsplit(issuer)
    suffix = '/realms/whiteboard'
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or not parsed.path.endswith(suffix) or parsed.query or parsed.fragment or parsed.username:
        raise ValueError('Invalid original realm issuer')
    result = copy.deepcopy(document)
    result.setdefault('attributes', {})['frontendUrl'] = issuer[:-len(suffix)]
    # Credentials/configuration are verified before any sign-in is enabled.
    result['enabled'] = False
    return result


def import_new(admin, document, issuer):
    if any(r.get('realm') == 'whiteboard' or r.get('id') == document.get('id') for r in admin.realms()):
        raise RuntimeError('Destination realm/ID already exists; refusing to overwrite it')
    admin.request('POST', '/realms', prepare_export(document, issuer))


def restore_import_defaults(admin, before):
    """Undo the logout attribute KC24 adds to built-in non-browser clients.

    Keep this deliberately narrow: any other difference still blocks cutover.
    The destination realm must remain disabled while restoring these settings.
    """
    realm = admin.request('GET', '/realms/whiteboard')
    if realm.get('enabled'):
        raise RuntimeError('Destination must remain disabled during verification')
    clients = {c['id']: c for c in admin.request('GET', '/realms/whiteboard/clients')}
    for original in before['clients']:
        current = clients.get(original['id'])
        if current is None:
            raise RuntimeError('An original client is missing after import')
        attributes = original.get('attributes', {})
        if (original['clientId'] in ('admin-cli', 'broker', 'realm-management')
                and 'post.logout.redirect.uris' not in attributes
                and current.get('attributes') == {**attributes, 'post.logout.redirect.uris': '+'}):
            admin.request('PUT', '/realms/whiteboard/clients/' + original['id'],
                          {'attributes': {**attributes, 'post.logout.redirect.uris': None}})


def compare_snapshots(before, after):
    for key in ('users', 'clients', 'roles'):
        if digest(before[key]) != digest(after[key]):
            raise RuntimeError(f'Transferred realm {key} differ from the source')
