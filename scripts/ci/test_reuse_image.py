import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parent / 'reuse-image.py'
SPEC = importlib.util.spec_from_file_location('reuse_image', SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReuseImageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.context = Path(self.temp.name)
        (self.context / 'Dockerfile').write_text('FROM alpine:3.22\n')

    def tag(self, week='2026-W44'):
        return MODULE.image_tag('ghcr.io/test/runtime', self.context, week)

    def test_identical_inputs_have_same_tag(self):
        self.assertEqual(self.tag(), self.tag())

    def test_source_change_invalidates_tag(self):
        before = self.tag()
        (self.context / 'Dockerfile').write_text('FROM alpine:3.23\n')
        self.assertNotEqual(before, self.tag())

    def test_added_file_invalidates_tag(self):
        before = self.tag()
        (self.context / 'install.sh').write_text('echo changed\n')
        self.assertNotEqual(before, self.tag())

    def test_execute_mode_invalidates_tag(self):
        before = self.tag()
        (self.context / 'Dockerfile').chmod(0o755)
        self.assertNotEqual(before, self.tag())

    def test_weekly_refresh(self):
        self.assertNotEqual(self.tag(), self.tag('2026-W45'))

    def test_unrelated_files_do_not_invalidate(self):
        before = self.tag()
        other = self.context / 'nested'
        other.mkdir()
        self.assertEqual(before, self.tag())

    def test_symlinks_rejected(self):
        (self.context / 'link').symlink_to('/etc/passwd')
        with self.assertRaises(ValueError):
            self.tag()

    def test_generated_dependencies_excluded_by_dockerignore(self):
        (self.context / '.dockerignore').write_text('node_modules\ndist\n.git\n')
        before = self.tag()
        dependencies = self.context / 'node_modules'
        dependencies.mkdir()
        (dependencies / 'tool').symlink_to('/etc/passwd')
        (dependencies / 'generated').write_text('not a build input')
        self.assertEqual(before, self.tag())

    def test_generated_directory_is_not_implicitly_ignored(self):
        dependencies = self.context / 'node_modules'
        dependencies.mkdir()
        before = self.tag()
        (dependencies / 'generated').write_text('a build input without dockerignore')
        self.assertNotEqual(before, self.tag())

    def test_dockerignore_negation_disables_generated_exclusions(self):
        (self.context / '.dockerignore').write_text('node_modules\n!node_modules/tool\n')
        dependencies = self.context / 'node_modules'
        dependencies.mkdir()
        before = self.tag()
        (dependencies / 'tool').write_text('a build input')
        self.assertNotEqual(before, self.tag())

    def test_invalid_image_rejected(self):
        with self.assertRaises(ValueError):
            MODULE.image_tag('untrusted.example/runtime:latest', self.context)

    def test_hit_resolves_digest(self):
        digest = 'sha256:' + 'a' * 64
        with patch.object(MODULE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '{"digest":"' + digest + '"}', '')):
            self.assertEqual(MODULE.lookup(self.tag()), digest)

    def test_absent_manifest_is_only_cache_miss(self):
        for error in ['manifest unknown', 'name unknown', 'not found']:
            with self.subTest(error=error), patch.object(MODULE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', error)):
                self.assertEqual(MODULE.lookup(self.tag()), '')

    def test_registry_errors_are_not_misses(self):
        for error in ['401 Unauthorized', '403 denied', '502 Bad Gateway', 'connection reset']:
            with self.subTest(error=error), patch.object(MODULE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', error)):
                with self.assertRaises(RuntimeError):
                    MODULE.lookup(self.tag())

    def test_malformed_digest_rejected(self):
        with patch.object(MODULE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '{"digest":"latest"}', '')):
            with self.assertRaises(ValueError):
                MODULE.lookup(self.tag())

    def test_timeout_is_not_a_miss(self):
        with patch.object(MODULE.subprocess, 'run', side_effect=subprocess.TimeoutExpired('docker', 90)):
            with self.assertRaises(subprocess.TimeoutExpired):
                MODULE.lookup(self.tag())


if __name__ == '__main__':
    unittest.main()
