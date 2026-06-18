const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const envFileName = process.argv[2];

if (!envFileName) {
  console.error("Usage: node scripts/start-player.js .env.player1");
  process.exit(1);
}

const envPath = path.resolve(process.cwd(), envFileName);

if (!fs.existsSync(envPath)) {
  console.error(`Environment file not found: ${envPath}`);
  process.exit(1);
}

const env = { ...process.env };
const envText = fs.readFileSync(envPath, "utf8");

envText.split(/\r?\n/).forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) return;

  const key = trimmed.slice(0, separatorIndex).trim();
  const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
  if (key) env[key] = value;
});

const reactScriptsBin = path.resolve(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "react-scripts.cmd" : "react-scripts"
);

const command = process.platform === "win32" ? "cmd.exe" : reactScriptsBin;
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", reactScriptsBin, "start"]
  : ["start"];

const child = spawn(command, args, {
  env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
