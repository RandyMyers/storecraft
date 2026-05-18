/**
 * Server-side Turnstile verification (Cloudflare).
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
async function verifyTurnstileToken(secret, token, remoteip) {
  const s = String(secret || "").trim();
  const t = String(token || "").trim();
  if (!s || !t) return false;

  const body = new URLSearchParams();
  body.set("secret", s);
  body.set("response", t);
  const ip = String(remoteip || "").trim();
  if (ip) body.set("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    return false;
  }

  return data && data.success === true;
}

module.exports = { verifyTurnstileToken };
