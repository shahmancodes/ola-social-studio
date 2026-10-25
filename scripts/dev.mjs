import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const children = [
  spawn(process.execPath, ["--import", "tsx", "src/video-worker-main.ts"], { stdio: "inherit" }),
  spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev"], { stdio: "inherit" }),
  spawn(process.execPath, ["--import", "tsx", "src/worker-main.ts"], { stdio: "inherit" }),
];

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
    stop();
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      process.exitCode = code || (signal ? 1 : 0);
      stop();
    }
  });
}
