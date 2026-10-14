import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { startWorker } = await import("./worker");
await startWorker();
