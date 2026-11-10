import { spawn } from "node:child_process";
const children = [
  spawn("npm", ["run", "dev"], { stdio: "inherit" }),
  spawn("npm", ["run", "web"], { stdio: "inherit" }),
];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const c of children) c.kill("SIGTERM");
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const c of children) c.on("exit", (code) => stop(code ?? 0));
