# CI resource usage

## Avoid work that cannot change a release

Pushes changing only README.md or docs/**/*.md do not start a production release.
Pull-request checks remain unconditional to avoid leaving required checks pending.
Each job checks out its immutable source once; later phases keep validated build
artifacts instead of deleting them with another checkout. npm uses its local
download cache when possible; dependency lockfiles and audits remain enabled.
The shared VPS still admits one heavy job at a time to protect production.

## Package the browser-tested frontend

The runner builds with the production API, mailbox, tenant, version and build-time
settings, then checks that exact dist/ bundle in Chromium. Dockerfile.ci packages
only dist/ and the existing nginx configuration, without reinstalling npm packages
or rebuilding a different bundle. Whiteboard and bundled Mail behavior remains
unchanged. The larger BuildKit memory budget remains because whiteboard still
requires it.
