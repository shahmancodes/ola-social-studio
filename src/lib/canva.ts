import crypto from "node:crypto";
import { db, hashToken, later, now } from "./platform-db";

type CanvaTokens = { access_token: string; refresh_token: string; expires_in: number };
type CanvaConnection = { token_json: string; expires_at: string };

export function canvaConfigured() {
  return Boolean(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET && process.env.CANVA_REDIRECT_URI && process.env.CANVA_TOKEN_ENCRYPTION_KEY);
}

function credentials() {
  if (!canvaConfigured()) throw new Error("Canva connection is not configured yet.");
  return { clientId: process.env.CANVA_CLIENT_ID!, clientSecret: process.env.CANVA_CLIENT_SECRET!, redirectUri: process.env.CANVA_REDIRECT_URI! };
}

function encryptionKey() {
  const raw = process.env.CANVA_TOKEN_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) throw new Error("CANVA_TOKEN_ENCRYPTION_KEY must be a 32-byte base64url key.");
  return key;
}

function seal(value: CanvaTokens) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

function open(value: string): CanvaTokens {
  const [iv, tag, data] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as CanvaTokens;
}

export function beginCanvaConnect(companyId: string, userId: string) {
  const { clientId, redirectUri } = credentials();
  const state = crypto.randomBytes(32).toString("base64url");
  const codeVerifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  db().prepare("DELETE FROM canva_oauth_states WHERE expires_at<?").run(now());
  db().prepare("INSERT INTO canva_oauth_states(state_hash,company_id,user_id,code_verifier,expires_at) VALUES(?,?,?,?,?)")
    .run(hashToken(state), companyId, userId, codeVerifier, later(10 * 60 * 1000));
  const url = new URL("https://www.canva.com/api/oauth/authorize");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "design:meta:read design:content:read");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  return url;
}

async function exchange(body: URLSearchParams): Promise<CanvaTokens> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch("https://api.canva.com/rest/v1/oauth/token", { method: "POST", headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) throw new Error("Canva could not complete the connection. Please try again.");
  const tokens = await response.json() as CanvaTokens;
  if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) throw new Error("Canva returned an incomplete connection.");
  return tokens;
}

export async function finishCanvaConnect(state: string, code: string, userId: string) {
  const entry = db().prepare("SELECT company_id,user_id,code_verifier FROM canva_oauth_states WHERE state_hash=? AND expires_at>?")
    .get(hashToken(state), now()) as { company_id: string; user_id: string; code_verifier: string } | undefined;
  if (!entry || entry.user_id !== userId) throw new Error("This Canva connection expired. Start again from company setup.");
  db().prepare("DELETE FROM canva_oauth_states WHERE state_hash=?").run(hashToken(state));
  const body = new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: entry.code_verifier, redirect_uri: credentials().redirectUri });
  const tokens = await exchange(body);
  db().prepare("INSERT INTO canva_connections(company_id,user_id,token_json,expires_at,connected_at) VALUES(?,?,?,?,?) ON CONFLICT(company_id,user_id) DO UPDATE SET token_json=excluded.token_json,expires_at=excluded.expires_at,connected_at=excluded.connected_at")
    .run(entry.company_id, userId, seal(tokens), later(tokens.expires_in * 1000), now());
  return entry.company_id;
}

export function canvaConnected(companyId: string, userId: string) {
  return Boolean(db().prepare("SELECT 1 FROM canva_connections WHERE company_id=? AND user_id=?").get(companyId, userId));
}

export function pendingCanvaCompany(state: string, userId: string) {
  const row = db().prepare("SELECT company_id FROM canva_oauth_states WHERE state_hash=? AND user_id=? AND expires_at>?")
    .get(hashToken(state), userId, now()) as { company_id: string } | undefined;
  return row?.company_id;
}

async function accessToken(companyId: string, userId: string) {
  const row = db().prepare("SELECT token_json,expires_at FROM canva_connections WHERE company_id=? AND user_id=?").get(companyId, userId) as CanvaConnection | undefined;
  if (!row) throw new Error("Connect Canva first.");
  const tokens = open(row.token_json);
  if (Date.parse(row.expires_at) > Date.now() + 60_000) return tokens.access_token;
  const fresh = await exchange(new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }));
  db().prepare("UPDATE canva_connections SET token_json=?,expires_at=? WHERE company_id=? AND user_id=?")
    .run(seal(fresh), later(fresh.expires_in * 1000), companyId, userId);
  return fresh.access_token;
}

export async function canvaRequest(companyId: string, userId: string, endpoint: string, init: RequestInit = {}) {
  const token = await accessToken(companyId, userId);
  const response = await fetch(`https://api.canva.com/rest/v1/${endpoint}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(detail.message || `Canva request failed (${response.status}).`);
  }
  return response.json();
}
