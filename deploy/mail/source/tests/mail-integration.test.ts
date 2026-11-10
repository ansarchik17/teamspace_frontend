import { test, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  verifyMailboxConnection,
  mailboxChanges,
} from "../server/mail-integration.js";
import { encrypt, decrypt } from "../server/security.js";
import { managementAuthorization, management } from "../server/stalwart.js";
import { pool } from "../server/db.js";
import { listMail } from "../server/mail.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
process.env.MAIL_CREDENTIAL_KEY = "ab".repeat(32);
process.env.STALWART_URL = "https://mail.example.test";
const ctx: any = {
  user: { id: "u" },
  tenant: { id: "t" },
  session: null,
  member: {
    id: "m",
    email: "alice@example.test",
    mail_account_id: "own",
    mail_secret: encrypt("personal-token"),
  },
};
function mockJmap(
  handler: (method: string, args: any, tag: string) => any,
  identity = "alice@example.test",
) {
  globalThis.fetch = (async (url: any, init: any) => {
    assert.equal(new URL(url).origin, "https://mail.example.test");
    assert.ok(init.headers.Authorization);
    if (new URL(url).pathname === "/.well-known/jmap")
      return Response.json({
        apiUrl: "https://mail.example.test/jmap/",
        accounts: { own: {} },
        primaryAccounts: { "urn:ietf:params:jmap:mail": "own" },
      });
    const { methodCalls } = JSON.parse(init.body);
    return Response.json({
      methodResponses: methodCalls.map(([method, args, tag]: any) => {
        assert.equal(
          args.accountId,
          "own",
          "Only the session's mailbox may be accessed",
        );
        if (method === "Identity/get")
          return [method, { list: [{ email: identity }] }, tag];
        return handler(method, args, tag);
      }),
    });
  }) as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = originalFetch;
});
after(async () => {
  process.env = originalEnv;
  await pool.end();
});

test("linking discovers accountId and stores only an encrypted personal password", async () => {
  mockJmap(() => {
    throw Error("Unexpected call");
  });
  const result = await verifyMailboxConnection(ctx, {
    password: "mail-password",
  });
  assert.equal(result.accountId, "own");
  assert.deepEqual(JSON.parse(decrypt(result.secret)), {
    login: ctx.member.email,
    password: "mail-password",
  });
  assert.ok(!result.secret.includes("mail-password"));
});
test("linking rejects inaccessible account IDs before mailbox access", async () => {
  mockJmap(() => {
    throw Error("Unexpected call");
  });
  await assert.rejects(
    verifyMailboxConnection(ctx, {
      accessToken: "personal-token",
      accountId: "other",
    }),
    { code: "MAIL_ACCOUNT" },
  );
});
test("linking rejects a credential with the wrong sender identity", async () => {
  mockJmap(() => {}, "other@example.test");
  await assert.rejects(
    verifyMailboxConnection(ctx, { accessToken: "personal-token" }),
    { code: "MAIL_IDENTITY_MISMATCH" },
  );
});
test("invalid credentials produce a safe error without response-body secrets", async () => {
  globalThis.fetch = (async () =>
    new Response("sensitive-upstream-error", { status: 401 })) as typeof fetch;
  await assert.rejects(
    verifyMailboxConnection(ctx, { password: "bad" }),
    (e: any) =>
      e.code === "MAIL_LOGIN_FAILED" && !e.message.includes("sensitive"),
  );
});
test("discovery never forwards credentials to a different origin", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/jmap" },
    });
  }) as typeof fetch;
  await assert.rejects(verifyMailboxConnection(ctx, { password: "secret" }), {
    code: "MAIL_ORIGIN",
  });
  assert.equal(calls, 1);
});
test("initial sync reads states without downloading email contents", async () => {
  mockJmap((method, args, tag) => {
    assert.deepEqual(args.ids, []);
    return [
      method,
      { state: method === "Email/get" ? "e1" : "m1", list: [] },
      tag,
    ];
  });
  assert.deepEqual(await mailboxChanges(ctx, {}), {
    changed: true,
    reset: true,
    emailState: "e1",
    mailboxState: "m1",
  });
});
test("unchanged states do not require refreshing the message list", async () => {
  mockJmap((method, args, tag) => [
    method,
    {
      newState: args.sinceState,
      created: [],
      updated: [],
      destroyed: [],
      hasMoreChanges: false,
    },
    tag,
  ]);
  assert.deepEqual(
    await mailboxChanges(ctx, { emailState: "e1", mailboxState: "m1" }),
    { changed: false, reset: false, emailState: "e1", mailboxState: "m1" },
  );
});
test("read flags, new messages and deletions trigger refresh", async () => {
  for (const kind of ["created", "updated", "destroyed"]) {
    mockJmap((method, args, tag) => [
      method,
      { newState: "next", [kind]: ["message"], hasMoreChanges: false },
      tag,
    ]);
    assert.equal(
      (await mailboxChanges(ctx, { emailState: "e1", mailboxState: "m1" }))
        .changed,
      true,
    );
  }
});
test("expired cursors and large backlogs recover with current states", async () => {
  for (const expired of [true, false]) {
    mockJmap((method, args, tag) =>
      method.endsWith("/get")
        ? [method, { state: "current", list: [] }, tag]
        : expired
          ? ["error", { type: "cannotCalculateChanges" }, tag]
          : [method, { newState: "partial", hasMoreChanges: true }, tag],
    );
    assert.deepEqual(
      await mailboxChanges(ctx, { emailState: "old", mailboxState: "old" }),
      {
        changed: true,
        reset: true,
        emailState: "current",
        mailboxState: "current",
      },
    );
  }
});
test("sync does not swallow authentication or permission errors", async () => {
  mockJmap((_method, _args, tag) => ["error", { type: "forbidden" }, tag]);
  await assert.rejects(
    mailboxChanges(ctx, { emailState: "old", mailboxState: "old" }),
    { code: "MAIL_METHOD" },
  );
});
test("management API key is separate from user mail credentials and empty error maps are success", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axis-mail-key-"));
  try {
    const file = join(dir, "key");
    await writeFile(file, "scoped-test-key\n", { mode: 0o600 });
    process.env.STALWART_API_KEY_FILE = file;
    assert.equal(await managementAuthorization(), "Bearer scoped-test-key");
    globalThis.fetch = (async (_url: any, init: any) => {
      assert.equal(init.headers.Authorization, "Bearer scoped-test-key");
      return Response.json({
        methodResponses: [
          ["x:Account/set", { notCreated: {}, notUpdated: {} }, "x"],
        ],
      });
    }) as typeof fetch;
    await management([["x:Account/set", {}, "x"]]);
  } finally {
    delete process.env.STALWART_API_KEY_FILE;
    await rm(dir, { recursive: true });
  }
});

test("draft list resolves Stalwart's standard drafts role", async () => {
  mockJmap((method, args, tag) => {
    if (method === "Mailbox/get")
      return [
        method,
        {
          list: [
            {
              id: "draft-box",
              role: "drafts",
              totalEmails: 1,
              unreadEmails: 0,
            },
          ],
        },
        tag,
      ];
    if (method === "Email/query") {
      assert.equal(args.filter.inMailbox, "draft-box");
      return [method, { ids: ["draft-message"], total: 1 }, tag];
    }
    return [
      method,
      {
        list: [
          {
            id: "draft-message",
            subject: "Meeting draft",
            from: [],
            to: [],
            mailboxIds: { "draft-box": true },
            keywords: { $draft: true },
            size: 10,
          },
        ],
      },
      tag,
    ];
  });
  const result = await listMail(
    { ...ctx, member: { ...ctx.member, mail_backend: "stalwart" } },
    "drafts",
    "",
    1,
  );
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "draft-message");
  assert.equal(result.items[0].folder, "drafts");
});
