import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('realm_transfer', ROOT / 'deploy/whiteboard/keycloak/realm_transfer.py')
transfer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transfer)
spec = importlib.util.spec_from_file_location('verify_shared', ROOT / 'deploy/whiteboard/keycloak/verify-shared.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class TransferTest(unittest.TestCase):
    def setUp(self):
        self.realm = {'realm': 'whiteboard', 'id': 'original-realm-id', 'enabled': True,
                      'users': [{'id': 'unchanged-sub', 'username': 'unchanged-login',
                                 'credentials': [{'type': 'password', 'secretData': 'opaque-hash'}]}],
                      'clients': [{'id': 'unchanged-client-id', 'clientId': 'whiteboard-frontend'}],
                      'components': {'key-provider': [{'id': 'unchanged-key', 'config': {'privateKey': ['opaque-private-key']}}]}}

    def test_preserves_subjects_credentials_clients_and_signing_keys(self):
        original = copy.deepcopy(self.realm)
        prepared = transfer.prepare_export(self.realm, 'https://example.invalid/whiteboard/realms/whiteboard')
        self.assertEqual(self.realm, original)
        self.assertFalse(prepared['enabled'])
        self.assertEqual(prepared['attributes']['frontendUrl'], 'https://example.invalid/whiteboard')
        for field in ('id', 'users', 'clients', 'components'):
            self.assertEqual(prepared[field], original[field])

    def test_refuses_partial_exports_wrong_realm_and_replacement(self):
        for change in ({'realm': 'master'}, {'users': None}, {'components': {}}, {'enabled': False}):
            with self.assertRaises(ValueError):
                transfer.prepare_export({**self.realm, **change}, 'https://example.invalid/realms/whiteboard')
        admin = Mock()
        admin.realms.return_value = [{'realm': 'whiteboard', 'id': 'existing'}]
        with self.assertRaises(RuntimeError):
            transfer.import_new(admin, self.realm, 'https://example.invalid/realms/whiteboard')
        admin.request.assert_not_called()

    def test_changed_credentials_or_access_rights_block_cutover(self):
        before = {'users': [{'id': 'same', 'roles': ['member']}], 'clients': [], 'roles': []}
        transfer.compare_snapshots(before, copy.deepcopy(before))
        changed = copy.deepcopy(before)
        changed['users'][0]['roles'] = ['admin']
        with self.assertRaises(RuntimeError):
            transfer.compare_snapshots(before, changed)

    def test_import_defaults_are_restored_only_while_disabled(self):
        admin = Mock()
        client = {'id': 'built-in-id', 'clientId': 'admin-cli', 'attributes': {}}
        admin.request.side_effect = [
            {'enabled': False},
            [{**client, 'attributes': {'post.logout.redirect.uris': '+'}}], None,
        ]
        transfer.restore_import_defaults(admin, {'clients': [client]})
        admin.request.assert_called_with('PUT', '/realms/whiteboard/clients/built-in-id',
                                         {'attributes': {'post.logout.redirect.uris': None}})
        admin.reset_mock()
        admin.request.side_effect = [{'enabled': True}]
        with self.assertRaises(RuntimeError):
            transfer.restore_import_defaults(admin, {'clients': [client]})
        self.assertEqual(admin.request.call_count, 1)

    def test_storage_apps_and_network_boundaries_are_preserved(self):
        for base_name in ('compose.yml', 'compose.yml.shared.yml'):
            base = ROOT / 'deploy/whiteboard' / base_name
            before = json.loads(subprocess.check_output([
                'docker', 'compose', '--env-file', '/dev/null', '-f', str(base), 'config',
                '--no-interpolate', '--no-normalize', '--no-path-resolution', '--format', 'json'], text=True))
            shared = base.with_name(base_name.replace('compose.yml', 'compose.keycloak-shared.yml', 1))
            after = json.loads(subprocess.check_output([
                'docker', 'compose', '--env-file', '/dev/null', '-f', str(shared), 'config',
                '--no-interpolate', '--no-normalize', '--no-path-resolution', '--format', 'json'], text=True))
            for name in before['services']:
                if name != 'keycloak':
                    self.assertEqual(before['services'][name], after['services'][name])
            self.assertEqual(before['networks'], after['networks'])
            remaining = dict(before['volumes'])
            remaining.pop('whiteboard_keycloak_data')
            self.assertEqual(remaining, after['volumes'])
            proxy = after['services']['keycloak']
            self.assertNotIn('ports', proxy)
            self.assertNotIn('environment', proxy)
            self.assertEqual(proxy['mem_limit'], '48m')
            self.assertEqual(set(proxy['networks']), {'whiteboard', 'workspace'})
            self.assertIn('whiteboard-keycloak', proxy['networks']['whiteboard']['aliases'])

    def test_untrusted_or_symlinked_marker_cannot_activate_shared_mode(self):
        with tempfile.TemporaryDirectory() as folder:
            marker = Path(folder) / 'marker.json'
            marker.write_text('{"version":1,"status":"verified"}')
            marker.chmod(0o666)
            link = Path(folder) / 'linked.json'
            link.symlink_to(marker)
            with patch.object(verifier.subprocess, 'check_output') as inspect_container:
                for path in (marker, link):
                    with self.assertRaises(ValueError):
                        verifier.verify(path)
                inspect_container.assert_not_called()

    def test_proxy_config_runs_with_production_read_only_limits(self):
        subprocess.run([
            'docker', 'run', '--rm', '--network', 'none', '--user', '101:101',
            '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
            '--memory', '48m', '--memory-swap', '64m', '--cpus', '0.25', '--pids-limit', '64',
            '--tmpfs', '/tmp:rw,noexec,nosuid,size=8m,mode=1777', '--entrypoint', 'nginx',
            '--volume', str(ROOT / 'deploy/whiteboard/keycloak/shared-proxy.conf') + ':/etc/nginx/nginx.conf:ro',
            'nginx:alpine', '-t',
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


if __name__ == '__main__':
    unittest.main()
