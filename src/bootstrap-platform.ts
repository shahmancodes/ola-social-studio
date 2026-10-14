import { createUser } from "./lib/platform-auth";
import { createCompany } from "./lib/platform";
import { db } from "./lib/platform-db";

const [email, password, companyName] = process.argv.slice(2);
if (!email || !password) {
  process.stderr.write("Usage: npm run bootstrap -- owner@example.com '12+ character password' [company name]\n");
  process.exit(1);
}
const existing = db().prepare("SELECT id FROM users WHERE email=?").get(email.toLowerCase()) as { id: string } | undefined;
const ownerId = existing?.id ?? createUser(email, password);
const name = companyName?.trim() || "My company";
const companyId = createCompany(name, ownerId);
process.stdout.write(`Created ${name} (${companyId}).\n`);
