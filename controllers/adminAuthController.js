const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const AdminAccount = require("../models/AdminAccount");

function signAdminJwt(payload = {}) {
  const body = { typ: "admin", v: 2, scopes: ["admin"], ...payload };
  return jwt.sign(body, config.adminJwtSecret, { expiresIn: config.adminJwtExpiresSeconds });
}

/** POST /api/admin/auth/login — email + password → JWT */
exports.loginWithPassword = async (req, res) => {
  if (!config.adminJwtSecret) {
    res.status(503).json({ error: "Admin JWT is not configured (set JWT_SECRET or ADMIN_JWT_SECRET)" });
    return;
  }

  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const operatorCount = await AdminAccount.countDocuments();
  if (operatorCount === 0) {
    res.status(503).json({
      error:
        process.env.NODE_ENV === "production"
          ? "No admin operators are configured. On the server run: npm run create:admin (set ADMIN_OPERATOR_EMAIL and ADMIN_OPERATOR_PASSWORD)."
          : `No admin operators in the database. Restart the API (it auto-creates ${config.seedAdminEmail} in non-production when the collection is empty), or run npm run create:admin. If you disabled auto-seed, set DISABLE_AUTO_ADMIN=false or create an account manually.`,
    });
    return;
  }

  const admin = await AdminAccount.findOne({ email, isActive: { $ne: false } }).select("+passwordHash");
  const bad = { error: "Invalid email or password" };

  if (!admin || !admin.passwordHash) {
    res.status(401).json(bad);
    return;
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    res.status(401).json(bad);
    return;
  }

  const token = signAdminJwt({
    sub: admin._id.toString(),
    email: admin.email,
  });

  res.json({
    token,
    expiresInSeconds: config.adminJwtExpiresSeconds,
    email: admin.email,
  });
};

/** POST /api/admin/auth/token — legacy: `X-Nestpage-Admin-Key` mints anonymous admin JWT */
exports.mintToken = (req, res) => {
  if (!config.adminJwtSecret) {
    res.status(503).json({ error: "Admin JWT is not configured (set ADMIN_JWT_SECRET or rely on JWT_SECRET)" });
    return;
  }
  const token = signAdminJwt();
  res.json({
    token,
    expiresInSeconds: config.adminJwtExpiresSeconds,
  });
};

/** POST /api/admin/auth/refresh — Bearer admin JWT → new JWT (preserves sub/email when present) */
exports.refreshToken = (req, res) => {
  if (!config.adminJwtSecret) {
    res.status(503).json({ error: "Admin JWT is not configured" });
    return;
  }
  const a = req.adminAuth || {};
  const token = signAdminJwt({
    ...(a.sub ? { sub: a.sub } : {}),
    ...(a.email ? { email: a.email } : {}),
  });
  res.json({
    token,
    expiresInSeconds: config.adminJwtExpiresSeconds,
  });
};
