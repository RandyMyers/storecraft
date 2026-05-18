/**
 * CI smoke: load route modules without starting HTTP or connecting to MongoDB.
 * Validates that server-side JS parses and top-level requires succeed.
 */
process.env.MONGODB_URI ||= "mongodb://127.0.0.1:27017/ci_smoke_unreachable";
process.env.JWT_SECRET ||= "ci-jwt-secret-must-be-at-least-32-characters";

require("../instrument");
require("../routes/auth");
require("../routes/sites");
require("../routes/public");
require("../routes/media");
require("../routes/health");
require("../routes/account");
require("../routes/adminBilling");
require("../routes/adminOps");
require("../routes/plans");
require("../routes/adminPlans");
require("../routes/adminAuth");
require("../models/AdminAccount");
require("../lib/seedAdminOperator");
require("../routes/templates");
require("../services/domainVerification");
require("../workers/dnsVerificationWorker");
require("../services/sslProbe");
require("../services/domainSslPromotion");
require("../workers/sslStatusWorker");
require("../models/PublishRevision");
require("../models/Plan");
require("../services/publishHistory");
require("../lib/turnstileVerify");
require("../lib/robotsTxt");
require("../models/AuditLog");
require("../models/Template");
require("../services/auditLog");

console.log("[ci-require-smoke] ok");
