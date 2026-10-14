import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db, hashToken, id, later, now, token } from "./platform-db";

const COOKIE_NAME = "content_platform_session";
type User = { id: string; email: string; display_name: string; is_root: number };
export type Role = "owner" | "admin" | "member";

export function passwordHash(password: string) {
  const salt = crypto.randomBytes(16);
  const digest = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${digest.toString("hex")}`;
}

export function passwordMatches(password: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const actual = crypto.scryptSync(password, Buffer.from(salt, "hex"), 64);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createUser(email: string, password: string) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (password.length < 12) throw new Error("Use a password with at least 12 characters.");
  const userId = id();
  db().prepare("INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)")
    .run(userId, email.toLowerCase(), passwordHash(password), now());
  return userId;
}

export async function createSession(userId: string) {
  const value = token();
  db().prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)")
    .run(hashToken(value), userId, later(30 * 24 * 60 * 60 * 1000));
  (await cookies()).set(COOKIE_NAME, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
}

export async function currentUser(): Promise<User | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return null;
  return (db().prepare("SELECT u.id,u.email,u.display_name,u.is_root FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?")
    .get(hashToken(value), now()) as User | undefined) ?? null;
}

export function updateDisplayName(userId: string, name: string) {
  const displayName = name.trim().replace(/\s+/g, " ");
  if (displayName.length > 80) throw new Error("Use a name under 80 characters.");
  db().prepare("UPDATE users SET display_name=? WHERE id=?").run(displayName, userId);
  return displayName;
}

export async function endSession() {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  if (value) db().prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(value));
  jar.delete(COOKIE_NAME);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("Sign in required.");
  return user;
}

export function roleFor(userId: string, companyId: string): Role | null {
  const root = db().prepare("SELECT is_root FROM users WHERE id=?").get(userId) as { is_root: number } | undefined;
  if (root?.is_root && db().prepare("SELECT id FROM companies WHERE id=?").get(companyId)) return "owner";
  const row = db().prepare("SELECT role FROM memberships WHERE user_id=? AND company_id=?").get(userId, companyId) as { role: Role } | undefined;
  return row?.role ?? null;
}

export async function requireMembership(companyId: string, minimum: Role = "member") {
  const user = await requireUser();
  const role = roleFor(user.id, companyId);
  if (!role || (minimum === "admin" && role === "member") || (minimum === "owner" && role !== "owner")) throw new Error("Access denied.");
  return { user, role };
}

export async function requireProjectAccess(projectId: string) {
  const row = db().prepare("SELECT company_id FROM projects WHERE id=?").get(projectId) as { company_id: string } | undefined;
  if (!row) throw new Error("Project not found.");
  return requireMembership(row.company_id);
}

export function createInvitation(companyId: string, email: string, role: "admin" | "member") {
  const value = token();
  db().prepare("INSERT INTO invitations(token_hash,company_id,email,role,expires_at) VALUES(?,?,?,?,?)")
    .run(hashToken(value), companyId, email.toLowerCase(), role, later(7 * 24 * 60 * 60 * 1000));
  return value;
}

export function acceptInvitation(value: string, email: string, password?: string) {
  const invitation = db().prepare("SELECT * FROM invitations WHERE token_hash=? AND expires_at>? AND accepted_at IS NULL")
    .get(hashToken(value), now()) as { company_id: string; email: string; role: Role } | undefined;
  if (!invitation || invitation.email !== email.toLowerCase()) throw new Error("Invitation expired or does not match this email.");
  const existingUser = db().prepare("SELECT id,password_hash FROM users WHERE email=?").get(invitation.email) as { id: string; password_hash: string } | undefined;
  if (existingUser && !passwordMatches(password ?? "", existingUser.password_hash)) throw new Error("Enter your existing account password to accept this invitation.");
  let userId = existingUser?.id;
  if (!userId) {
    if (!password) throw new Error("Choose a password to accept the invitation.");
    userId = createUser(invitation.email, password);
  }
  db().prepare("INSERT OR IGNORE INTO memberships(user_id,company_id,role) VALUES(?,?,?)").run(userId, invitation.company_id, invitation.role);
  db().prepare("UPDATE invitations SET accepted_at=? WHERE token_hash=?").run(now(), hashToken(value));
  return userId;
}
