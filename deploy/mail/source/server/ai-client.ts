import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { Resolver } from "node:dns/promises";
import { requireAIAccounting } from "./ai-accounting.js";

// Optional resolver override applies only to the configured AI provider, never to OS DNS.
// The original hostname is preserved for TLS certificate and SNI verification.
export async function complete(payload: unknown): Promise<any> {
  requireAIAccounting();
  const url = new URL(
    process.env.AI_BASE_URL!.replace(/\/$/, "") + "/chat/completions",
  );
  if (!["https:", "http:"].includes(url.protocol))
    throw Error("Некорректный адрес AI");
  if (
    url.protocol === "http:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw Error("AI требует HTTPS");
  const resolver = new Resolver();
  const servers = process.env.AI_DNS_SERVERS?.split(",").filter(Boolean);
  if (servers?.length) resolver.setServers(servers);
  const lookup: any = servers?.length
    ? (host: string, options: any, callback: any) => {
        resolver
          .resolve4(host)
          .then((addresses) =>
            options.all
              ? callback(
                  null,
                  addresses.map((address) => ({ address, family: 4 })),
                )
              : callback(null, addresses[0], 4),
          )
          .catch(callback);
      }
    : undefined;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "POST",
        lookup,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...(process.env.AI_API_KEY
            ? { Authorization: "Bearer " + process.env.AI_API_KEY }
            : {}),
        },
      },
      (res) => {
        let result = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          result += chunk;
          if (result.length > 1_000_000)
            req.destroy(new Error("Ответ AI превышает лимит"));
        });
        res.on("error", reject);
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 300) {
            reject(new Error("AI-провайдер вернул HTTP " + res.statusCode));
            return;
          }
          try {
            resolve(JSON.parse(result));
          } catch {
            reject(new Error("AI вернул некорректный ответ"));
          }
        });
      },
    );
    const timeout = setTimeout(
      () => req.destroy(new Error("AI-провайдер не ответил за 60 секунд")),
      60000,
    );
    req.on("close", () => clearTimeout(timeout));
    req.on("error", (e) =>
      reject(
        new Error(
          ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT"].includes(
            (e as any).code,
          )
            ? "Нет соединения с AI-провайдером. Проверьте DNS и сетевой доступ."
            : e.message,
        ),
      ),
    );
    req.end(body);
  });
}
