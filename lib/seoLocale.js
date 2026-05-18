/** BCP 47-ish tag for `<html lang>`, e.g. en, pt, en-gb */
function sanitizeContentLanguage(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (!s || s.length < 2 || s.length > 15) return "en";
  if (!/^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(s)) return "en";
  return s;
}

/** ISO 3166-1 alpha-2 region for geo meta (SEO / local signals). */
function sanitizeGeoRegion(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (s.length !== 2) return "";
  return s;
}

module.exports = { sanitizeContentLanguage, sanitizeGeoRegion };
