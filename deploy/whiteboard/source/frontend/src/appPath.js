const WHITEBOARD_PATH = "/whiteboard";

export const APP_BASE_PATH = window.location.pathname === WHITEBOARD_PATH ||
  window.location.pathname.startsWith(`${WHITEBOARD_PATH}/`)
  ? WHITEBOARD_PATH
  : "";

export function appPath(path = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${APP_BASE_PATH}${normalizedPath}` || "/";
}

export function appRootPath() {
  return APP_BASE_PATH ? `${APP_BASE_PATH}/` : "/";
}
