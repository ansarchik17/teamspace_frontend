#!/usr/bin/env python3
"""Test the real nginx with an isolated fake AI, never an external provider."""
import argparse
import json
import re
from pathlib import Path
import subprocess
import tempfile
import time
import uuid


def run(*args, data=None):
    return subprocess.run(["docker", *args], input=data, text=True, capture_output=True, check=True, timeout=30).stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", default="nginx:1.27-alpine")
    image = parser.parse_args().image
    name = "workspace-ai-ingress-" + uuid.uuid4().hex[:12]
    network, upstream, frontend = name + "-net", name + "-ai", name + "-front"
    config = Path(__file__).resolve().parent.parent / "docker/nginx.conf"
    created = []
    with tempfile.TemporaryDirectory(prefix="workspace-ai-ingress-") as folder:
        mock = Path(folder) / "mock.conf"

        def mock_config(status):
            mock.write_text('server { listen 8000; default_type application/json; '
                            'location = /internal/accounting/ready { return ' + str(status) + '; } '
                            'location / { return 200 \'{"method":"$request_method","uri":"$uri","authorization":"$http_authorization"}\'; } }\n')

        def request(path, method="POST"):
            args = ["docker", "exec", frontend, "wget", "-S", "-q", "-O", "-", "--header=Host: tenant.teamspace.kz", "--header=Authorization: Bearer test-user-token"]
            if method == "POST":
                args += ["--post-data={}", "--header=Content-Type: application/json"]
            result = subprocess.run([*args, "http://127.0.0.1" + path], capture_output=True, text=True, timeout=10)
            statuses = re.findall(r"HTTP/1\.[01] (\d+)", result.stderr)
            if not statuses:
                raise subprocess.CalledProcessError(result.returncode, args, result.stdout, result.stderr)
            return int(statuses[-1]), result.stdout

        try:
            run("network", "create", "--internal", network)
            mock_config(404)
            for container, config_path, alias in [(upstream, mock, ["--network-alias", "alemcloud-api"]), (frontend, config, [])]:
                run("run", "--detach", "--pull=never", "--user", "0", "--name", container, "--network", network, *alias,
                    "--mount", f"type=bind,source={config_path},target=/etc/nginx/conf.d/default.conf,readonly", image)
                created.append(container)
            run("exec", frontend, "nginx", "-t")
            for _ in range(30):
                try:
                    old = request("/api/tools/notes-ai/proofread")
                    break
                except subprocess.CalledProcessError:
                    time.sleep(0.1)
            else:
                raise AssertionError("Test nginx did not start")
            assert old[0] == 500, old
            mock_config(204)
            run("exec", upstream, "nginx", "-s", "reload")
            for _ in range(30):
                current = request("/api/tools/notes-ai/proofread")
                if current[0] == 200:
                    break
                time.sleep(0.1)
            else:
                raise AssertionError(current)
            for path, method in [("/api/ask", "POST"), ("/api/tools", "GET"), ("/api/tools/notes-ai/proofread", "POST"),
                                 ("/api/tools/smart-agent/chat/stream", "POST"), ("/api/tools/meeting-ai/meeting/analyze/async", "POST")]:
                response = request(path, method)
                assert response[0] == 200, response
                body = json.loads(response[1])
                assert body == {"method": method, "uri": path.removeprefix("/api"), "authorization": "Bearer test-user-token"}, body
            assert request("/_workspace_ai_accounting_ready", "GET")[0] == 404
            print("PASS: old AI blocked; accounted AI receives paths, methods and auth; readiness is private")
        finally:
            for container in reversed(created):
                subprocess.run(["docker", "rm", "--force", container], capture_output=True, timeout=30)
            subprocess.run(["docker", "network", "rm", network], capture_output=True, timeout=30)


if __name__ == "__main__":
    main()
