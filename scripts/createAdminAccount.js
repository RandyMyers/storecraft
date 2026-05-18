/**
 * Create the first (or additional) operator account for Nestpage admin UI.
 *
 * Usage (from `server/` with `.env` loaded):
 *   ADMIN_OPERATOR_EMAIL=you@company.com ADMIN_OPERATOR_PASSWORD='secure-pass' node scripts/createAdminAccount.js
 *
 * Or: npm run create:admin
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { connectDb } = require("../lib/db");
const AdminAccount = require("../models/AdminAccount");

async function main() {
  const email = String(process.env.ADMIN_OPERATOR_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = String(process.env.ADMIN_OPERATOR_PASSWORD || "");

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.error("Set ADMIN_OPERATOR_EMAIL and ADMIN_OPERATOR_PASSWORD in the environment (or server/.env).");
    process.exit(1);
  }
  if (password.length < 8) {
    // eslint-disable-next-line no-console
    console.error("ADMIN_OPERATOR_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  await connectDb();

  const existing = await AdminAccount.findOne({ email }).lean();
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Admin account already exists for ${email} — nothing to do.`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await AdminAccount.create({ email, passwordHash });
  // eslint-disable-next-line no-console
  console.log(`Created admin operator: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
