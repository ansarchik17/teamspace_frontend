param([string]$NginxImage = 'nginx:1.27-alpine', [string]$Python = 'python')
$ErrorActionPreference = 'Stop'
& $Python (Join-Path $PSScriptRoot 'test-ai-ingress.py') --image $NginxImage
if ($LASTEXITCODE -ne 0) { throw 'AI ingress integration test failed' }
