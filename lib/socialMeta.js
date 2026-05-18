/**
 * Sanitize optional Open Graph / Twitter fields (§9 MVP).
 */
function sanitizeOgTitle(s) {
  return String(s ?? "").trim().slice(0, 200);
}

function sanitizeOgDescription(s) {
  return String(s ?? "").trim().slice(0, 320);
}

function sanitizeOgImage(raw) {
  const s = String(raw ?? "").trim().slice(0, 2000);
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (!["http:", "https:"].includes(u.protocol)) return "";
      return u.href;
    } catch {
      return "";
    }
  }
  if (s.startsWith("/") && !s.includes("..") && !s.includes("\\")) return s;
  return "";
}

/** @returns {"" | "summary" | "summary_large_image"} */
function sanitizeTwitterCard(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "summary" || s === "summary_large_image") return s;
  return "";
}

/** Organization / brand URL for JSON-LD — absolute http(s) only. */
function sanitizeHttpUrlOptional(raw) {
  const s = String(raw ?? "").trim().slice(0, 2000);
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return "";
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol)) return "";
    return u.href;
  } catch {
    return "";
  }
}

function sanitizeOrganizationName(raw) {
  return String(raw ?? "").trim().slice(0, 120);
}

module.exports = {
  sanitizeOgTitle,
  sanitizeOgDescription,
  sanitizeOgImage,
  sanitizeTwitterCard,
  sanitizeHttpUrlOptional,
  sanitizeOrganizationName,
};
