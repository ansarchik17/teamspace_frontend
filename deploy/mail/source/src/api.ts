let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
export class RequestError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined || body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new RequestError(
      "SERVICE_UNAVAILABLE",
      "Сервис перезапускается или недоступен. Повторите через несколько секунд.",
    );
  }
  if (!res.ok) {
    if (
      path !== "/session" &&
      [
        "UNAUTHENTICATED",
        "PASSWORD_CHANGE_REQUIRED",
        "CONSENT_REQUIRED",
        "TENANT_ACCESS_DENIED",
      ].includes(data.code)
    )
      window.dispatchEvent(new Event("session-check"));
    throw new RequestError(data.code, data.message ?? "Ошибка запроса");
  }
  return data;
}
export const bytes = (n: number) =>
  n >= 1073741824
    ? (n / 1073741824).toFixed(1) + " ГБ"
    : n >= 1048576
      ? (n / 1048576).toFixed(1) + " МБ"
      : n >= 1024
        ? (n / 1024).toFixed(0) + " КБ"
        : n + " Б";
export const date = (s: string) =>
  new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
export const roleName = (r: string) =>
  ({
    tenant_admin: "Администратор компании",
    hr: "Кадровик",
    user: "Сотрудник",
  })[r] ?? r;
