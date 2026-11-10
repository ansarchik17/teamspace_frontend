import { encrypt } from "./security.js";
import { fail } from "./db.js";
import { discoverSession } from "./stalwart.js";
import { jmap } from "./mail.js";
import type { Context } from "./auth.js";

// Identity is checked with the user's credential, never with the management key.
export async function verifyMailboxConnection(
  ctx: Context,
  credential: { password?: string; accessToken?: string; accountId?: string },
) {
  const secret = encrypt(
    credential.password !== undefined
      ? JSON.stringify({
          login: ctx.member.email,
          password: credential.password,
        })
      : credential.accessToken!,
  );
  const response = await discoverSession(secret);
  if (!response.ok)
    fail(
      400,
      "MAIL_LOGIN_FAILED",
      "Не удалось войти в почтовый ящик. Проверьте пароль или токен.",
    );
  const session: any = await response.json();
  const accountId =
    credential.accountId ??
    session.primaryAccounts?.["urn:ietf:params:jmap:mail"];
  if (!accountId || !session.accounts?.[accountId])
    fail(403, "MAIL_ACCOUNT", "Нет доступа к указанному почтовому ящику");
  const proposed = {
    ...ctx,
    member: {
      ...ctx.member,
      mail_secret: secret,
      mail_account_id: accountId,
      mail_auth_failed: false,
    },
  };
  const { result } = await jmap(
    proposed,
    [["Identity/get", { accountId }, "identity"]],
    ["urn:ietf:params:jmap:submission"],
  );
  if (
    !result.methodResponses[0]?.[1]?.list?.some(
      (identity: any) =>
        identity.email?.toLowerCase() === ctx.member.email.toLowerCase(),
    )
  )
    fail(
      403,
      "MAIL_IDENTITY_MISMATCH",
      "Почтовый аккаунт не соответствует вашему адресу",
    );
  return { secret, accountId };
}

export type MailCursor = { emailState?: string; mailboxState?: string };
export async function mailboxChanges(ctx: Context, cursor: MailCursor) {
  const accountId = ctx.member.mail_account_id;
  const snapshot = async () => {
    const { result } = await jmap(ctx, [
      ["Email/get", { accountId, ids: [], properties: ["id"] }, "emails"],
      ["Mailbox/get", { accountId, ids: [], properties: ["id"] }, "folders"],
    ]);
    return {
      emailState: result.methodResponses[0][1].state,
      mailboxState: result.methodResponses[1][1].state,
      changed: true,
      reset: true,
    };
  };
  if (!cursor.emailState || !cursor.mailboxState) return snapshot();
  const { result } = await jmap(
    ctx,
    [
      [
        "Email/changes",
        { accountId, sinceState: cursor.emailState, maxChanges: 100 },
        "emails",
      ],
      [
        "Mailbox/changes",
        { accountId, sinceState: cursor.mailboxState, maxChanges: 100 },
        "folders",
      ],
    ],
    ["urn:ietf:params:jmap:mail"],
    ["cannotCalculateChanges"],
  );
  // No local message mirror: a fresh list covers expired cursors and large batches.
  if (
    result.methodResponses.some(
      (r: any) => r[0] === "error" || r[1].hasMoreChanges,
    )
  )
    return snapshot();
  const emails = result.methodResponses[0][1],
    folders = result.methodResponses[1][1];
  return {
    emailState: emails.newState,
    mailboxState: folders.newState,
    changed: [emails, folders].some(
      (r) => r.created?.length || r.updated?.length || r.destroyed?.length,
    ),
    reset: false,
  };
}
