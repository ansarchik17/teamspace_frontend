import { io } from "socket.io-client";
import { appPath } from "../appPath";

const SOCKET_URL = window.location.origin;

export const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  path: appPath("/socket.io"),
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});
