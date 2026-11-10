import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { migrate } from "./migrate.js";
import { pool, query, tx } from "./db.js";
import { hashPassword, token } from "./security.js";
await migrate();
if ((await query("SELECT id FROM identities LIMIT 1")).length) {
  console.log("Seed skipped: accounts already exist");
  await pool.end();
  process.exit(0);
}
const users = [
  {
    login: "000000000001",
    name: "Администратор платформы",
    role: "tenant_admin",
    email: "platform@axis.test",
    platform: true,
    tenant: 0,
  },
  {
    login: "000000000002",
    name: "Алия Садыкова",
    role: "tenant_admin",
    email: "aliya@axis.test",
    tenant: 0,
  },
  {
    login: "000000000003",
    name: "Дана Омарова",
    role: "hr",
    email: "hr@axis.test",
    tenant: 0,
  },
  {
    login: "000000000004",
    name: "Тамерлан Картаев",
    role: "user",
    email: "tamerlan@axis.test",
    tenant: 0,
  },
  {
    login: "000000000005",
    name: "Руслан Ахметов",
    role: "tenant_admin",
    email: "admin@orbit.test",
    tenant: 1,
  },
];
const credentials: any[] = [];
await tx(async (db) => {
  const tenants = [];
  for (const [name, slug] of [
    ["TeamSpace", "axis"],
    ["Orbit Group", "orbit"],
  ]) {
    const t = (
      await db.query(
        "INSERT INTO tenants(name,slug,quota_mb) VALUES($1,$2,102400) RETURNING *",
        [name, slug],
      )
    ).rows[0];
    tenants.push(t);
    await db.query(
      "INSERT INTO domains(tenant_id,name,verification_token,verified) VALUES($1,$2,$3,true)",
      [t.id, slug + ".test", token()],
    );
  }
  for (const profile of users) {
    const password = "Axis-" + randomBytes(12).toString("base64url") + "9";
    const u = (
      await db.query(
        "INSERT INTO identities(login,name,password_hash,platform_admin,must_change) VALUES($1,$2,$3,$4,true) RETURNING id",
        [
          profile.login,
          profile.name,
          await hashPassword(password),
          !!profile.platform,
        ],
      )
    ).rows[0];
    const t = tenants[profile.tenant];
    const m = (
      await db.query(
        "INSERT INTO memberships(tenant_id,user_id,role,email,quota_mb,department) VALUES($1,$2,$3,$4,5120,$5) RETURNING id",
        [
          t.id,
          u.id,
          profile.role,
          profile.email,
          profile.role === "hr" ? "Кадровая служба" : "Команда",
        ],
      )
    ).rows[0];
    credentials.push({
      ...profile,
      password,
      userId: u.id,
      tenantId: t.id,
      mailboxId: m.id,
    });
    const letters = [
      [
        "Добро пожаловать в TeamSpace Mail",
        "Добро пожаловать в корпоративную почту!\n\nЭто локальный тестовый ящик. Вы можете писать коллегам внутри TeamSpace, создавать черновики, управлять сотрудниками согласно своей роли.\n\nВнешняя доставка и AI подключаются отдельно в настройках сервера. ЭЦП пока не включена.",
        "welcome@" + t.slug + ".test",
      ],
      [
        "Материалы к встрече команды",
        "Коллеги, добрый день!\n\nПредлагаю обсудить запуск почтовой платформы завтра в 10:00.\n\nПовестка:\n1. Подключение подразделений\n2. Политики безопасности\n3. Обратная связь по интерфейсу\n\nПодтвердите, пожалуйста, участие.",
        "team@" + t.slug + ".test",
      ],
      [
        "Политика хранения корпоративной почты",
        "Добрый день!\n\nДля каждого сотрудника выделено 5 ГБ почтового пространства. При заполнении на 80% и 95% вы получите уведомление в приложении.\n\nОчищайте корзину и сохраняйте важные документы согласно правилам компании.",
        "it@" + t.slug + ".test",
      ],
    ];
    for (let i = 0; i < letters.length; i++) {
      const [subject, body, sender] = letters[i];
      await db.query(
        "INSERT INTO messages(tenant_id,mailbox_id,sender,recipients,subject,body,size_bytes,read,starred,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()-($10||' hours')::interval)",
        [
          t.id,
          m.id,
          sender,
          JSON.stringify([profile.email]),
          subject,
          body,
          Buffer.byteLength(body),
          i === 2,
          i === 1,
          String(i * 3),
        ],
      );
    }
  }
});
await mkdir(".local", { recursive: true });
await writeFile(".local/accounts.json", JSON.stringify(credentials, null, 2), {
  mode: 0o600,
});
await writeFile(
  ".local/ACCESS.md",
  "# Локальные тестовые учётные записи\n\nАдрес: http://localhost:5173\n\nВсе ИИН синтетические. При первом входе обязательно сменить пароль и принять тестовый текст согласия.\n\n" +
    credentials
      .map(
        (x) =>
          `- **${x.name}** (${x.role}${x.platform ? ", platform_admin" : ""})\n  - Логин: \`${x.login}\`\n  - Временный пароль: \`${x.password}\`\n  - Почта: \`${x.email}\``,
      )
      .join("\n\n"),
  { mode: 0o600 },
);
console.log("Seed complete. Private credentials: .local/ACCESS.md");
await pool.end();
