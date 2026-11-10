import { test } from "node:test";
import assert from "node:assert/strict";
import { api, setCsrf } from "../src/api.js";

test("bodyless actions do not send an empty JSON document (logout regression)", async () => {
  const original = globalThis.fetch;
  setCsrf("synthetic-csrf");
  globalThis.fetch = (async (url: any, init: any) => {
    assert.equal(url, "/api/auth/logout");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["Content-Type"], undefined);
    assert.equal(init.headers["X-CSRF-Token"], "synthetic-csrf");
    assert.equal(init.body, undefined);
    return Response.json({ ok: true });
  }) as typeof fetch;
  try {
    assert.deepEqual(await api("/auth/logout", "POST"), { ok: true });
  } finally {
    globalThis.fetch = original;
  }
});

test("message payload remains JSON with its idempotency key", async () => {
  const original = globalThis.fetch;
  const payload = {
    to: ["recipient@axis.test"],
    subject: "test",
    body: "hello",
  };
  globalThis.fetch = (async (_url: any, init: any) => {
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.equal(init.headers["Idempotency-Key"], "test-key");
    assert.deepEqual(JSON.parse(init.body), payload);
    return Response.json({ status: "accepted" });
  }) as typeof fetch;
  try {
    assert.equal(
      (
        await api("/mail/send", "POST", payload, {
          "Idempotency-Key": "test-key",
        })
      ).status,
      "accepted",
    );
  } finally {
    globalThis.fetch = original;
  }
});
