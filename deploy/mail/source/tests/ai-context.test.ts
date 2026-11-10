import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { z } from "zod";
import { registerAIReadRoutes } from "../server/ai-context.js";
import { ApiError } from "../server/db.js";
import type { Context } from "../server/auth.js";

function appForTest() {
  const app = Fastify();
  const reads: string[] = [];
  app.setErrorHandler((error, _req, reply) => {
    reply
      .code(
        error instanceof ApiError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500,
      )
      .send({ error: error instanceof Error ? error.message : String(error) });
  });
  registerAIReadRoutes(app, {
    context: async (token) => {
      if (token === "revoked")
        throw new ApiError(403, "FORBIDDEN", "Access revoked");
      assert.ok(["alice", "bob"].includes(token));
      return {
        user: { id: token },
        member: { id: `${token}-mailbox` },
        tenant: { id: `${token}-company` },
        session: {},
      } as Context;
    },
    list: async (ctx, folder, search, page) => {
      reads.push(ctx.member.id);
      assert.equal(folder, "sent");
      assert.equal(search, "Review");
      assert.equal(page, 2);
      return {
        items: [{ id: `${ctx.user.id}-message`, subject: "Review" }],
        total: 81,
        counts: [],
      };
    },
    attachment: async (ctx, id) => {
      if (id !== `${ctx.user.id}-attachment`)
        throw new ApiError(404, "NOT_FOUND", "Foreign attachment");
      return {
        filename: "report.txt",
        data: Buffer.from("own attachment text"),
      };
    },
    get: async (ctx, id) => {
      reads.push(ctx.member.id);
      if (id !== `${ctx.user.id}-message`)
        throw new ApiError(404, "NOT_FOUND", "Not found in own mailbox");
      return {
        id,
        body: "я".repeat(7100),
        subject: "Review",
        sender: "colleague@example.test",
        mail_secret: "must-not-leak",
      };
    },
  });
  return { app, reads };
}

test("AI mail lists use authenticated mailbox and return complete page metadata", async () => {
  const { app, reads } = appForTest();
  try {
    for (const actor of ["alice", "bob"]) {
      const response = await app.inject({
        url: "/api/internal/workspace/ai/messages?folder=sent&search=Review&page=2",
        headers: { authorization: `Bearer ${actor}` },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(response.json().items[0].id, `${actor}-message`);
      assert.equal(response.json().has_more, true);
      assert.equal(response.json().next_page, 3);
    }
    assert.deepEqual(reads, ["alice-mailbox", "bob-mailbox"]);
  } finally {
    await app.close();
  }
});

test("AI mail rejects impersonation, revoked sessions, writes and another user's message", async () => {
  const { app, reads } = appForTest();
  try {
    for (const [url, authorization, expected] of [
      ["/api/internal/workspace/ai/messages", "", 401],
      ["/api/internal/workspace/ai/messages", "Bearer revoked", 403],
      [
        "/api/internal/workspace/ai/messages?mailbox_id=bob",
        "Bearer alice",
        400,
      ],
      ["/api/internal/workspace/ai/messages/bob-message", "Bearer alice", 404],
      [
        "/api/internal/workspace/ai/messages/alice-message?page=0",
        "Bearer alice",
        400,
      ],
    ] as const) {
      const response = await app.inject({ url, headers: { authorization } });
      assert.equal(response.statusCode, expected, url);
    }
    const write = await app.inject({
      method: "POST",
      url: "/api/internal/workspace/ai/messages",
      headers: { authorization: "Bearer alice" },
    });
    assert.equal(write.statusCode, 404);
    assert.deepEqual(reads, ["alice-mailbox"]);
  } finally {
    await app.close();
  }
});

test("AI mail reads long message text in ordered parts without credentials", async () => {
  const { app } = appForTest();
  try {
    let combined = "";
    for (let page = 1; page <= 3; page++) {
      const response = await app.inject({
        url: `/api/internal/workspace/ai/messages/alice-message?page=${page}`,
        headers: { authorization: "Bearer alice" },
      });
      assert.equal(response.statusCode, 200);
      const data = response.json();
      combined += data.text;
      assert.equal(data.has_more, page < 3);
      assert.equal(data.total_chars, 7100);
      assert.ok(!response.body.includes("must-not-leak"));
    }
    assert.equal(combined, "я".repeat(7100));
  } finally {
    await app.close();
  }
});

test("Workspace mail context resolves immutable user/company and enforces consent without provisioning", async () => {
  const { workspaceReadContext } = await import("../server/ai-context.js");
  const seen: unknown[][] = [];
  let accepted = true;
  let bound = true;
  const deps = {
    profile: async (token: string) => {
      assert.equal(token, "live-workspace-session");
      return {
        user: {
          id: 42,
          username: "alice",
          first_name: "Alice",
          last_name: "",
          is_active: true,
          organization_id: "org-a",
        },
        organization: {
          id: "org-a",
          name: "A",
          slug: "a",
          status: "active",
          owner_id: 42,
        },
      };
    },
    query: async (sql: string, values: unknown[] = []) => {
      assert.ok(
        sql.trim().startsWith("SELECT"),
        "AI authentication must not provision or alter mail accounts",
      );
      seen.push(values);
      if (sql.includes("i.workspace_user_id=$1")) {
        assert.deepEqual(values, [42, "org-a"]);
        assert.ok(
          sql.includes("m.status='active'") &&
            sql.includes("t.status='active'") &&
            sql.includes("i.active=true"),
        );
        return bound
          ? [
              {
                user_id: "alice",
                member_id: "alice-box",
                tenant_id: "tenant-a",
              },
            ]
          : [];
      }
      if (sql.includes("FROM identities")) return [{ id: "alice" }];
      if (sql.includes("FROM memberships"))
        return [{ id: "alice-box", mail_backend: "local" }];
      if (sql.includes("FROM tenants"))
        return [{ id: "tenant-a", consent_version: 2 }];
      if (sql.includes("FROM consents")) {
        assert.deepEqual(values, ["tenant-a", "alice", 2]);
        return [{ accepted }];
      }
      throw new Error("Unexpected database read");
    },
  };
  const ctx = await workspaceReadContext("live-workspace-session", deps);
  assert.equal(ctx.user.id, "alice");
  assert.equal(ctx.member.id, "alice-box");
  assert.equal(ctx.tenant.id, "tenant-a");
  accepted = false;
  await assert.rejects(
    workspaceReadContext("live-workspace-session", deps),
    (error: unknown) =>
      error instanceof ApiError && error.code === "CONSENT_REQUIRED",
  );
  bound = false;
  await assert.rejects(
    workspaceReadContext("live-workspace-session", deps),
    (error: unknown) =>
      error instanceof ApiError && error.code === "MAIL_ACCESS",
  );
  assert.ok(seen.length > 5);
});

test("AI mail attachment download retains mailbox scope and rejects foreign IDs", async () => {
  const { app } = appForTest();
  try {
    const own = await app.inject({
      url: "/api/internal/workspace/ai/attachments/alice-attachment",
      headers: { authorization: "Bearer alice" },
    });
    assert.equal(own.statusCode, 200);
    assert.equal(own.body, "own attachment text");
    assert.ok(own.headers["content-disposition"]?.includes("report.txt"));
    const foreign = await app.inject({
      url: "/api/internal/workspace/ai/attachments/bob-attachment",
      headers: { authorization: "Bearer alice" },
    });
    assert.equal(foreign.statusCode, 404);
  } finally {
    await app.close();
  }
});
