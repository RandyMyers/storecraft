const bcrypt = require("bcryptjs");
const config = require("../config");
const AdminAccount = require("../models/AdminAccount");

/**
 * Non-production: if there are zero operators, create one using `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` defaults.
 * Skipped when `DISABLE_AUTO_ADMIN=true` or in production.
 */
async function seedDevAdminOperator() {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  if (process.env.DISABLE_AUTO_ADMIN === "true") {
    return;
  }

  const total = await AdminAccount.countDocuments();
  if (total > 0) {
    return;
  }

  const email = config.seedAdminEmail;
  const password = config.seedAdminPassword;
  if (!email || password.length < 8) {
    // eslint-disable-next-line no-console
    console.warn("[seedAdmin] skipped — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 8 chars) in .env");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await AdminAccount.create({ email, passwordHash });
  // eslint-disable-next-line no-console
  console.log(
    `[seedAdmin] auto-created first operator ${email} (non-production, empty AdminAccount collection). Default password is configured in server config / SEED_ADMIN_PASSWORD.`,
  );
}

module.exports = { seedDevAdminOperator };
