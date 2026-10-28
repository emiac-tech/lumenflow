// Detects values that list several alternatives, e.g. "2200K / 2700K / 3000K",
// "IP20 / IP65", "7W / 10W" or "White (01) | Black (04)". These are shown in red
// so the user keeps only the option that applies.
// Comma-separated values ("White body, Black optic") are flagged too.
// Not flagged: single values with an unspaced slash ("Wall/Ceiling-mounted",
// "DMX/RDM"), unit conversions ("2.98lbs / 1.35kg", "120-277V / 60Hz"),
// ranges ("2700 - 5000K", often one tunable product) and long sentences.

const UNIT_TOKEN =
  /^(?:\d+(?:[.,]\d+)?\s*(?:k|w|lm|v|vac|vdc|ma|a|°|deg|mm|cm|m|kg|g|%)?|ip\s?\d{2}|ik\s?\d{2}|cri\s?\d{2})$/i;
const MEASURE = /^[\d.,\-–\s]+\s*([a-z°%"']+)$/i;
const MAX_OPTION_LENGTH = 40;

function isUnitConversion(parts: string[]): boolean {
  if (parts.length !== 2) return false;
  const units = parts.map((part) => part.match(MEASURE)?.[1]?.toLowerCase() || "");
  return units.every(Boolean) && units[0] !== units[1];
}

function looksLikeOptions(parts: string[]): boolean {
  if (parts.length < 2) return false;
  if (parts.some((part) => part.length > MAX_OPTION_LENGTH)) return false;
  if (isUnitConversion(parts)) return false;
  return true;
}

// More than one IP rating in one value, e.g. "IP20/43 Ceiling - IP20/40 Wall",
// "IP20/IP65" or "IP44, IP65".
function hasMultipleIpRatings(text: string): boolean {
  const ratings = new Set<string>();
  const pattern = /IP\s?(\d{2})((?:\s*\/\s*(?:IP\s?)?\d{2})*)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    ratings.add(match[1]);
    for (const extra of match[2].match(/\d{2}/g) || []) ratings.add(extra);
  }
  return ratings.size > 1;
}

export function hasMultipleOptions(value: string | null | undefined): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.length <= 80 && hasMultipleIpRatings(text)) return true;
  if (/\s\/\s/.test(text) || text.includes("|")) {
    return looksLikeOptions(text.split(/\s\/\s|\|/).map((part) => part.trim()).filter(Boolean));
  }
  if (/\s+or\s+/i.test(text)) {
    return looksLikeOptions(text.split(/\s+or\s+/i).map((part) => part.trim()).filter(Boolean));
  }
  if (text.includes(",")) {
    // Split on commas, but not thousands separators such as "1,225 lm".
    const parts = text.split(/(?<!\d),|,(?!\d)/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return false;
    if (parts.every((part) => UNIT_TOKEN.test(part))) return true;
    // Comma-separated alternatives / parts, e.g. "White body, Black optic" or
    // "Fiberglass, Aluminium". Long free text (notes, sentences) is not flagged.
    return text.length <= 120 && parts.length <= 6 && looksLikeOptions(parts) && !/[.!?]\s/.test(text);
  }
  return false;
}

export const MULTI_OPTION_HINT = "Multiple options found. Keep the one that applies.";
