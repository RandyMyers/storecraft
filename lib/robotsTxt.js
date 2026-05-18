/** @typedef {'allow_with_disallow' | 'disallow_with_allow'} RobotsTxtPolicy */

const MAX_PATHS = 25;
const MAX_PATH_LEN = 200;

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function sanitizeRobotsPath(raw) {
  let p = String(raw ?? "").trim();
  if (!p) return null;
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > MAX_PATH_LEN) return null;
  if (/[\r\n\x00]/.test(p)) return null;
  if (p.includes("..")) return null;
  if (p.includes("\\")) return null;
  const rest = p.slice(1);
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(rest)) return null;
  return p;
}

/**
 * @param {unknown} arr
 * @returns {string[]}
 */
function sanitizeRobotsPathsArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const p = sanitizeRobotsPath(item);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= MAX_PATHS) break;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {RobotsTxtPolicy}
 */
function normalizeRobotsPolicy(raw) {
  const s = String(raw || "").trim();
  return s === "disallow_with_allow" ? "disallow_with_allow" : "allow_with_disallow";
}

/**
 * @param {{ policy?: unknown, paths?: unknown }} body
 * @returns {{ policy: RobotsTxtPolicy, paths: string[] }}
 */
function sanitizeRobotsTxtPayload(body) {
  if (!body || typeof body !== "object") {
    return { policy: "allow_with_disallow", paths: [] };
  }
  const policy = normalizeRobotsPolicy(body.policy);
  const paths = sanitizeRobotsPathsArray(body.paths);
  return { policy, paths };
}

/**
 * @param {RobotsTxtPolicy} policy
 * @param {string[]} paths
 * @returns {string}
 */
function buildRobotsTxtBody(policy, paths) {
  const lines = ["User-agent: *"];
  if (policy === "allow_with_disallow") {
    lines.push("Allow: /");
    for (const p of paths) lines.push(`Disallow: ${p}`);
  } else {
    lines.push("Disallow: /");
    for (const p of paths) lines.push(`Allow: ${p}`);
  }
  return `${lines.join("\n")}\n`;
}

module.exports = {
  MAX_PATHS,
  sanitizeRobotsPath,
  sanitizeRobotsPathsArray,
  sanitizeRobotsTxtPayload,
  buildRobotsTxtBody,
};
