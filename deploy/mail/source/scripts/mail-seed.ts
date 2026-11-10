import "dotenv/config";
import { pool, query } from "../server/db.js";
import { syncStalwart } from "../server/stalwart.js";
import { jmap } from "../server/mail.js";
if (process.env.STALWART_URL !== "http://127.0.0.1:28083")
  throw Error(
    "Demo seeding is allowed only against the isolated local Stalwart",
  );
try {
  await syncStalwart();
  const members = await query(
    "SELECT m.* FROM memberships m JOIN identities u ON u.id=m.user_id WHERE u.login=ANY($1) AND m.mail_backend='stalwart'",
    [
      [
        "000000000001",
        "000000000002",
        "000000000003",
        "000000000004",
        "000000000005",
      ],
    ],
  );
  for (const member of members) {
    const c = {
      member,
      tenant: { id: member.tenant_id },
      user: { id: member.user_id },
      session: null,
    };
    const { result } = await jmap(c, [
      ["Mailbox/get", { accountId: member.mail_account_id }, "m"],
      ["Email/query", { accountId: member.mail_account_id, limit: 1 }, "e"],
    ]);
    if (result.methodResponses[1][1].ids.length) continue;
    const inbox = result.methodResponses[0][1].list.find(
      (x: any) => x.role === "inbox",
    );
    const samples = await query(
      "SELECT * FROM messages WHERE mailbox_id=$1 ORDER BY created_at DESC",
      [member.id],
    );
    const create: any = {};
    for (let i = 0; i < samples.length; i++) {
      const m = samples[i];
      create["m" + i] = {
        mailboxIds: { [inbox.id]: true },
        from: [{ email: m.sender }],
        to: [{ email: member.email }],
        subject: m.subject,
        keywords: m.starred ? { $flagged: true } : {},
        textBody: [{ partId: "body", type: "text/plain" }],
        bodyValues: { body: { value: m.body } },
      };
    }
    if (samples.length)
      await jmap(c, [
        ["Email/set", { accountId: member.mail_account_id, create }, "c"],
      ]);
  }
  console.log("Local Stalwart demo mailboxes are ready");
} finally {
  await pool.end();
}
