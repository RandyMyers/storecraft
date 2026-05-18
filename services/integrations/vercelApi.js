/**
 * Verify a Vercel personal access token (Bearer).
 * @see https://vercel.com/docs/rest-api/endpoints#get-the-authenticated-user
 * @param {string} token
 * @returns {Promise<{ ok: boolean, status: number, message: string, username?: string }>}
 */
async function verifyVercelToken(token) {
  const t = String(token || "").trim();
  if (!t) {
    return { ok: false, status: 400, message: "Empty token" };
  }
  try {
    const res = await fetch("https://api.vercel.com/v2/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: "application/json",
      },
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    if (!res.ok) {
      const msg =
        (body && typeof body.error?.message === "string" && body.error.message) ||
        (typeof body.message === "string" && body.message) ||
        `Vercel API HTTP ${res.status}`;
      return { ok: false, status: res.status, message: msg };
    }
    const username = body?.user?.username || body?.user?.name || "";
    return {
      ok: true,
      status: res.status,
      message: username ? `Vercel token OK (user: ${username})` : "Vercel token OK",
      username: username || undefined,
    };
  } catch (e) {
    return { ok: false, status: 0, message: e.message || "Vercel request failed" };
  }
}

module.exports = { verifyVercelToken };
