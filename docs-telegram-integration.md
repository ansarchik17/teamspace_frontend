Telegram is available at `/telegram` and in the Services catalog. The parent page uses Workspace authorization and the existing Growy proxy. Owners / mapped tenant_admin roles share all Telegram accounts in their organization.

`public/growy-telegram` contains the common Growy inbox UI (source: Growy `static/telegram` and `config/templates/telegram/inbox.html`), adapted to a Workspace transport. When updating the shared UI, preserve `bridge.js`, the Workspace bootstrap, the disabled token handoff and the hidden Growy login/logout elements. The iframe does not receive credentials. The parent accepts only the same-origin iframe and Telegram account paths. Multipart bodies, binary responses, cancellation and Retry-After are preserved.

Checks:

```sh
node --test tests/telegram/bridge.test.cjs
npm run build
```

Deploy Growy platform Telegram API and Workspace backend before deploying the frontend. No new Workspace environment variables are needed.
