import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = String(process.env.PORT || "3000");
const host = "0.0.0.0";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

console.log(`[start] Next.js → ${host}:${port}`);

const child = spawn(
  process.execPath,
  [nextBin, "start", "-H", host, "-p", port],
  {
    stdio: "inherit",
    cwd: root,
    env: {
      ...process.env,
      PORT: port,
      HOSTNAME: host,
    },
  }
);

const shutdown = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
