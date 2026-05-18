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
  "vehicle_features",
  "feature",
] as const;

const EV_BRAND_FORM_KEYS = [
  "evBrand",
  "interestedEvBrand",
  "interested_ev_brand",
  "Interested EV Brand",
] as const;

const NOTES_FORM_KEYS = [
  "notes",
  "Notes",
  "note",
  "remarks",
  "Remarks",
  "additionalNotes",
  "additional_notes",
] as const;

const FINANCE_FORM_KEYS = ["finance", "Finance", "lookingForFinance"] as const;

const DOCUMENT_FORM_KEYS = [
  "documents",
  "document",
  "vehicleDocuments",
  "vehicle_documents",
  "Vehicle Documents",
  "uploadVehicleDocument",
] as const;

const PHOTO_FORM_KEYS = [
  "photos",
  "photo",
  "vehiclePhotos",
  "vehicle_photos",
  "Vehicle Photos",
  "uploadVehiclePhoto",
] as const;

/** Lines the mobile app appends to notes when attachment upload fails client-side. */
const NOTES_METADATA_LINE =
  /^(vehicle documents?|vehicle photos?|request type|finance \(entered\)|features \(not in airtable list\)|city \(entered\)|vehicle type \(entered\)|vehicle color \(entered\)|transmission \(entered\)|accidents \(entered\)|fuel type \(entered\)|interested ev brand \(entered\)|additional features):/i;

export const FORM_FIELD_ALIASES = {
  evBrand: EV_BRAND_FORM_KEYS,
  features: FEATURE_FORM_KEYS,
  notes: NOTES_FORM_KEYS,
  finance: FINANCE_FORM_KEYS,
  documents: DOCUMENT_FORM_KEYS,
  photos: PHOTO_FORM_KEYS,
} as const;

function isFinanceYesNo(value: string): boolean {
  return /^(yes|no)$/i.test(value.trim());
}

/** Keep only user-written notes; strip mobile metadata and legacy server fallbacks. */
export function sanitizeClientNotes(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (kept.length > 0 && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    if (NOTES_METADATA_LINE.test(trimmed)) continue;
    kept.push(line.trimEnd());
  }

  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  return kept.join("\n").trim();
}

export function parseNotesFromForm(form: FormData): string {
  return sanitizeClientNotes(getFirstFormString(form, NOTES_FORM_KEYS));
}

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

async function entryToFeatureStrings(entry: FormDataEntryValue): Promise<string[]> {
  if (typeof entry === "string") return parseFeatureString(entry);
  if (entry instanceof Blob) {
    try {
      return parseFeatureString(await entry.text());
    } catch {
      return [];
    }
  }
  return [];
}

/** Collect features from all alias keys (JSON array, comma list, repeated fields, or File/Blob parts). */
export async function parseFeaturesFromForm(form: FormData): Promise<string[]> {
  const collected: string[] = [];

  for (const key of FEATURE_FORM_KEYS) {
    for (const entry of form.getAll(key)) {
      collected.push(...(await entryToFeatureStrings(entry)));
    }
  }

  return [...new Set(collected)];
}

export function parseEvBrandFromForm(form: FormData): string {
  return getFirstFormString(form, EV_BRAND_FORM_KEYS);
}

export function parseFinanceFromForm(form: FormData): string {
  return getFirstFormString(form, FINANCE_FORM_KEYS);
}

/**
 * If the client puts free-text finance details in the finance field (not Yes/No),
 * move that text into notes and return a valid Yes/No when present elsewhere.
 */
export function reconcileFinanceAndNotes(
  finance: string,
  notes: string,
  form: FormData,
): { finance: string; notes: string } {
  if (!finance || isFinanceYesNo(finance)) return { finance, notes };

  const freeText = finance.trim();
  let mergedNotes = notes;
  if (
    freeText &&
    !mergedNotes.toLowerCase().includes(freeText.toLowerCase().slice(0, 12))
  ) {
    mergedNotes = mergedNotes
      ? `${mergedNotes}\n\n${freeText}`
      : freeText;
  }

  for (const key of FINANCE_FORM_KEYS) {
    for (const entry of form.getAll(key)) {
      if (typeof entry !== "string") continue;
      const candidate = entry.trim();
      if (isFinanceYesNo(candidate)) {
        return { finance: candidate, notes: mergedNotes };
      }
    }
  }

  return { finance: "", notes: mergedNotes };
}

async function entryToUploadFile(
  entry: FormDataEntryValue,
  fallbackName: string,
): Promise<File | null> {
  if (entry instanceof File && entry.size > 0) return entry;
  if (entry instanceof Blob && entry.size > 0) {
    const name =
      entry instanceof File && entry.name ? entry.name : fallbackName;
    return new File([entry], name, {
      type: entry.type || "application/octet-stream",
    });
  }
  return null;
}

async function collectUploadFiles(
  form: FormData,
  keys: readonly string[],
  fallbackPrefix: string,
): Promise<File[]> {
  const files: File[] = [];
  let index = 0;

  for (const key of keys) {
    for (const entry of form.getAll(key)) {
      const file = await entryToUploadFile(
        entry,
        `${fallbackPrefix}-${++index}`,
      );
      if (file) files.push(file);
    }
  }

  return files;
}

export async function parseDocumentFilesFromForm(
  form: FormData,
): Promise<File[]> {
  return collectUploadFiles(form, DOCUMENT_FORM_KEYS, "document");
}

export async function parsePhotoFilesFromForm(
  form: FormData,
): Promise<File[]> {
  return collectUploadFiles(form, PHOTO_FORM_KEYS, "photo");
}
