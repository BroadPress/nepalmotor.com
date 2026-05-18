/** First non-empty string for any of these form-data keys (mobile + web aliases). */
export function getFirstFormString(
  form: FormData,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

const FEATURE_FORM_KEYS = [
  "features",
  "Features",
  "vehicleFeatures",
  "Vehicle Features",
] as const;

const EV_BRAND_FORM_KEYS = [
  "evBrand",
  "interestedEvBrand",
  "interested_ev_brand",
  "Interested EV Brand",
] as const;

export const FORM_FIELD_ALIASES = {
  evBrand: EV_BRAND_FORM_KEYS,
  features: FEATURE_FORM_KEYS,
} as const;

function parseFeatureString(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }

  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((part) => part.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  return [trimmed];
}

/** Collect features from all alias keys (JSON array, comma list, or repeated fields). */
export function parseFeaturesFromForm(form: FormData): string[] {
  const collected: string[] = [];

  for (const key of FEATURE_FORM_KEYS) {
    for (const entry of form.getAll(key)) {
      if (typeof entry !== "string") continue;
      collected.push(...parseFeatureString(entry));
    }
  }

  return [...new Set(collected)];
}

export function parseEvBrandFromForm(form: FormData): string {
  return getFirstFormString(form, EV_BRAND_FORM_KEYS);
}
