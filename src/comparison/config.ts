import path from "node:path";
import { ROOT_DIR, DATA_DIR } from "../lib/data-directory";
import { defaultModelSettings } from '../lib/model-routing';
export const LAB_DIR = path.resolve(process.env.COMPARISON_DATA_DIR || path.join(ROOT_DIR, ".data/comparison"));
export const SOURCE_DATA_DIR = path.resolve(process.env.COMPARISON_SOURCE_DATA_DIR || path.join(ROOT_DIR, ".data"));
export const ORIGIN = "http://127.0.0.1:3100";
export function assertIsolation() {
  if (DATA_DIR !== path.join(LAB_DIR, "ola") || process.env.OLA_DISABLE_MESSAGING !== "1") throw new Error("Start the lab with npm run dev:compare (isolated Ola storage and messaging disabled are required).");
  if (DATA_DIR === SOURCE_DATA_DIR) throw new Error("Comparison storage must be separate from Ola.");
}
export function assertLocal(request: Request) {
  // Next normalizes request.url to its internal hostname; validate the incoming Host instead.
  if (request.headers.get("host") !== "127.0.0.1:3100") throw new Error("Only the comparison loopback origin is allowed.");
  const origin = request.headers.get("origin");
  if ((origin && origin !== ORIGIN) || (!origin && !["GET", "HEAD"].includes(request.method))) throw new Error("Request origin rejected.");
  // OAuth returns via a cross-site top-level navigation. Its handler separately
  // verifies the browser cookie, one-time state, and PKCE verifier.
  const oauthReturn = request.method === "GET" && new URL(request.url).pathname === "/api/canva/callback" && request.headers.get("sec-fetch-mode") === "navigate";
  if (request.headers.get("sec-fetch-site") === "cross-site" && !oauthReturn) throw new Error("Cross-site request rejected.");
}
export function canvaBlockReason() {
  if (process.env.COMPARISON_CANVA_PERMITTED !== "1") return "Live Canva is disabled until Canva confirms this benchmarking use is permitted. Fixture comparisons are available.";
  if (!process.env.COMPARISON_CANVA_CLIENT_ID || !process.env.COMPARISON_CANVA_CLIENT_SECRET || !process.env.COMPARISON_CANVA_TOKEN_KEY) return "Configure the comparison Canva OAuth credentials and encryption key, then connect Canva.";
  return null;
}
export function providers() {
  const settings = defaultModelSettings();
  return [
    { id: "vercel", label: "Vercel AI Gateway", ...settings.vercel },
    { id: "openrouter", label: "OpenRouter", configured: settings.openrouter.configured, model: settings.openrouter.model },
  ];
}
