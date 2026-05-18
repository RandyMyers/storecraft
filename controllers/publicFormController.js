const config = require("../config");
const Site = require("../models/Site");
const FormSubmission = require("../models/FormSubmission");
const { allowFormSubmit } = require("../lib/formRateLimit");
const { verifyTurnstileToken } = require("../lib/turnstileVerify");
const { dispatchFormWebhook } = require("../lib/formWebhookDispatch");

let warnedTurnstileDbFallback = false;

exports.submit = async (req, res) => {
  const subdomain = String(req.params.subdomain || "").toLowerCase();
  if (!subdomain) {
    res.status(400).json({ error: "Invalid site" });
    return;
  }

  if (req.body && String(req.body.hp || "").trim()) {
    res.status(200).json({ ok: true });
    return;
  }

  const site = await Site.findOne({ subdomain })
    .select("_id disabled formWebhookUrl formWebhookSecret")
    .lean();
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  if (site.disabled) {
    res.status(403).json({ error: "This site is suspended.", code: "site_disabled" });
    return;
  }

  const ip = req.ip || req.socket?.remoteAddress || "";

  if (!allowFormSubmit(ip, subdomain)) {
    res.status(429).json({ error: "Too many submissions — try again later." });
    return;
  }

  let turnstileSecret = String(config.turnstileSecretKey || "").trim();
  if (!turnstileSecret) {
    const { getPlainSecretForProvider } = require("../services/integrationSecretsResolve");
    turnstileSecret = String((await getPlainSecretForProvider("turnstile")) || "").trim();
    if (turnstileSecret && !warnedTurnstileDbFallback) {
      warnedTurnstileDbFallback = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[turnstile] Using IntegrationSecret (provider turnstile). TURNSTILE_SECRET_KEY is not set in env — DB store is the active source.",
      );
    }
  }

  if (turnstileSecret) {
    const token = String(
      req.body.turnstileToken || req.body["cf-turnstile-response"] || "",
    ).trim();
    if (!token) {
      res.status(400).json({ error: "Human verification required." });
      return;
    }
    const ok = await verifyTurnstileToken(turnstileSecret, token, ip);
    if (!ok) {
      res.status(400).json({ error: "Verification failed — refresh and try again." });
      return;
    }
  }

  const email = String(req.body.email || "")
    .trim()
    .slice(0, 320);
  const message = String(req.body.message || "")
    .trim()
    .slice(0, 4000);
  const pageSlug = String(req.body.pageSlug || "home").toLowerCase();

  const doc = await FormSubmission.create({
    siteId: site._id,
    subdomain,
    pageSlug,
    email,
    message,
  });

  res.status(201).json({ ok: true });

  const hookUrl = typeof site.formWebhookUrl === "string" ? site.formWebhookUrl.trim() : "";
  const hookSecret = typeof site.formWebhookSecret === "string" ? site.formWebhookSecret : "";
  if (hookUrl) {
    const payload = {
      event: "nestpage.form.submission",
      submissionId: doc._id.toString(),
      subdomain,
      pageSlug,
      email,
      message,
      submittedAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
    };
    dispatchFormWebhook(hookUrl, hookSecret, payload).catch(() => {});
  }
};
