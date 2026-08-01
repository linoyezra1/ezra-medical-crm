import { spawnSync } from "node:child_process";

const port = String(process.env.PORT || "3000");
const host = "0.0.0.0";

console.log(`[start] Syncing database schema...`);
const push = spawnSync("npx", ["prisma", "db", "push"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
if (push.status !== 0) {
  process.exit(push.status ?? 1);
}

console.log(`[start] Starting Next.js on ${host}:${port}`);
const next = spawnSync(
  "npx",
  ["next", "start", "-H", host, "-p", port],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: port,
      HOSTNAME: host,
    },
    shell: true,
  }
);

process.exit(next.status ?? 1);
