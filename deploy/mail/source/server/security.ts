import {
  scrypt as scryptCb,
  randomBytes,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { promisify } from "node:util";
import { fail } from "./db.js";
const scrypt = promisify(scryptCb);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, value] = encoded.split(":");
  if (!salt || !value) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(value, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function validatePassword(value: string) {
  if (
    value.length < 8 ||
    value.length > 128 ||
    !/[a-zа-я]/i.test(value) ||
    !/\d/.test(value)
  )
    fail(
      400,
      "WEAK_PASSWORD",
      "Пароль: 8–128 символов, минимум одна буква и цифра",
    );
}
function key() {
  const v = process.env.MAIL_CREDENTIAL_KEY;
  if (!v || Buffer.from(v, "hex").length !== 32)
    fail(
      503,
      "CREDENTIAL_KEY_MISSING",
      "Настройте ключ шифрования почтовых credentials",
    );
  return Buffer.from(v, "hex");
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  return [
    iv.toString("hex"),
    c.update(value, "utf8", "hex") + c.final("hex"),
    c.getAuthTag().toString("hex"),
  ].join(".");
}
export function decrypt(value: string) {
  const [iv, data, tag] = value.split(".");
  const c = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
  c.setAuthTag(Buffer.from(tag, "hex"));
  return c.update(data, "hex", "utf8") + c.final("utf8");
}
