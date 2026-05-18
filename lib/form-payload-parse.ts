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
  "Upload Vehicle Document",
  "vehicleDocument",
  "vehicle_document",
  "docs",
  "doc",
] as const;

const PHOTO_FORM_KEYS = [
  "photos",
  "photo",
  "vehiclePhotos",
  "vehicle_photos",
  "Vehicle Photos",
  "uploadVehiclePhoto",
  "Upload Vehicle Photo",
  "vehiclePhoto",
  "vehicle_photo",
  "images",
  "image",
  "pictures",
  "picture",
] as const;

const GENERIC_FILE_FORM_KEYS = ["file", "files", "attachment", "attachments"] as const;

/** Scalar fields — never treat as file uploads when scanning form keys. */
const NON_FILE_FORM_KEYS = new Set(
  [
    "fullName",
    "email",
    "phone",
    "city",
    "year",
    "vehicleType",
    "vehicleBrand",
    "vehicleModel",
    "vehicleColor",
    "kmDriven",
    "transmission",
    "accidents",
    "fuelType",
    "requestType",
    "request_type",
    ...NOTES_FORM_KEYS,
    ...FINANCE_FORM_KEYS,
    ...EV_BRAND_FORM_KEYS,
    ...FEATURE_FORM_KEYS,
  ].map((k) => k.toLowerCase()),
);

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

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function mimeFromFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return MIME_BY_EXT[ext ?? ""] ?? "application/octet-stream";
}

function sniffImageMime(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return "image/webp";
  }
  return undefined;
}

function base64ToFile(
  encoded: string,
  filename: string,
  mimeType?: string,
): File | null {
  const cleaned = encoded.replace(/\s/g, "");
  if (cleaned.length < 16) return null;
  try {
    const bytes = Buffer.from(cleaned, "base64");
    if (bytes.length === 0) return null;
    const sniffed = sniffImageMime(new Uint8Array(bytes));
    const type = mimeType || sniffed || mimeFromFilename(filename);
    return new File([new Uint8Array(bytes)], filename, { type });
  } catch {
    return null;
  }
}

async function fetchUrlAsFile(url: string, fallbackName: string): Promise<File | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) return null;
    const fromUrl = url.split("/").pop()?.split("?")[0] ?? "";
    const name = fromUrl.includes(".") ? fromUrl : fallbackName;
    const type =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      sniffImageMime(bytes) ||
      mimeFromFilename(name);
    return new File([bytes], name, { type });
  } catch {
    return null;
  }
}

async function jsonValueToUploadFile(
  value: unknown,
  fallbackName: string,
): Promise<File | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const name =
    (typeof obj.filename === "string" && obj.filename) ||
    (typeof obj.name === "string" && obj.name) ||
    fallbackName;
  const mime =
    (typeof obj.mimeType === "string" && obj.mimeType) ||
    (typeof obj.type === "string" && obj.type) ||
    (typeof obj.contentType === "string" && obj.contentType) ||
    undefined;

  const encoded =
    (typeof obj.base64 === "string" && obj.base64) ||
    (typeof obj.data === "string" && obj.data) ||
    (typeof obj.file === "string" && obj.file) ||
    (typeof obj.content === "string" && obj.content) ||
    undefined;
  if (encoded) return base64ToFile(encoded, name, mime);

  const uri =
    (typeof obj.uri === "string" && obj.uri) ||
    (typeof obj.url === "string" && obj.url) ||
    undefined;
  if (uri && /^https?:\/\//i.test(uri)) return fetchUrlAsFile(uri, name);

  return null;
}

async function stringToUploadFile(
  raw: string,
  fallbackName: string,
): Promise<File | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const dataUrl = trimmed.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]+)$/i);
  if (dataUrl) {
    const mime = dataUrl[1] || mimeFromFilename(fallbackName);
    return base64ToFile(dataUrl[2], fallbackName, mime);
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return null;
      }
      return jsonValueToUploadFile(parsed, fallbackName);
    } catch {
      /* fall through */
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return fetchUrlAsFile(trimmed, fallbackName);
  }

  if (trimmed.length >= 64 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    return base64ToFile(trimmed, fallbackName);
  }

  return null;
}

async function entryToUploadFile(
  entry: FormDataEntryValue,
  fallbackName: string,
): Promise<File | null> {
  if (entry instanceof Blob && entry.size > 0) {
    const name =
      entry instanceof File && entry.name ? entry.name : fallbackName;
    const ext = name.includes(".") ? "" : guessExtFromMime(entry.type);
    return new File([entry], ext ? `${name}${ext}` : name, {
      type: entry.type || mimeFromFilename(name),
    });
  }
  if (typeof entry === "string") {
    return stringToUploadFile(entry, fallbackName);
  }
  return null;
}

function guessExtFromMime(mime: string): string {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "application/pdf") return ".pdf";
  return "";
}

function normalizeFormKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

function formKeyAttachmentKind(key: string): "photo" | "document" | null {
  if (NON_FILE_FORM_KEYS.has(key.toLowerCase())) return null;
  const k = normalizeFormKey(key);
  if (
    /^(photos?|images?|pictures?|vehiclephotos?|uploadvehiclephoto|photosbase64|imagebase64)/.test(
      k,
    )
  ) {
    return "photo";
  }
  if (
    /^(documents?|docs?|vehicledocuments?|uploadvehicledocument|documentsbase64)/.test(
      k,
    )
  ) {
    return "document";
  }
  if (/base64|blob|binary|bytes/.test(k)) {
    if (/doc/.test(k)) return "document";
    if (/photo|image|picture|pic/.test(k)) return "photo";
  }
  if (/photo|image|picture|selfie|camera/.test(k) && !/document/.test(k)) {
    return "photo";
  }
  if (/document|doc|license|registration|bluebook/.test(k)) return "document";
  return null;
}

function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const out: File[] = [];
  for (const file of files) {
    const key = `${file.name}:${file.size}:${file.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
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

async function collectGenericUploadFiles(form: FormData): Promise<{
  documents: File[];
  photos: File[];
}> {
  const documents: File[] = [];
  const photos: File[] = [];
  let index = 0;

  for (const key of GENERIC_FILE_FORM_KEYS) {
    for (const entry of form.getAll(key)) {
      const file = await entryToUploadFile(entry, `upload-${++index}`);
      if (!file) continue;
      if (file.type.startsWith("image/")) photos.push(file);
      else documents.push(file);
    }
  }

  return { documents, photos };
}

/** Scan every form field for mobile-specific keys (e.g. photos[0], imageBase64). */
async function collectScannedUploadFiles(form: FormData): Promise<{
  documents: File[];
  photos: File[];
}> {
  const documents: File[] = [];
  const photos: File[] = [];
  const known = new Set<string>([
    ...DOCUMENT_FORM_KEYS,
    ...PHOTO_FORM_KEYS,
    ...GENERIC_FILE_FORM_KEYS,
  ]);
  let index = 0;

  for (const [key, entry] of form.entries()) {
    if (known.has(key)) continue;
    const kind = formKeyAttachmentKind(key);
    if (!kind) continue;

    const entries =
      typeof entry === "string" && entry.trim().startsWith("[")
        ? (() => {
            try {
              const arr = JSON.parse(entry) as unknown;
              return Array.isArray(arr) ? arr : [entry];
            } catch {
              return [entry];
            }
          })()
        : [entry];

    for (const item of entries) {
      let file: File | null = null;
      if (typeof item === "string") {
        file = await stringToUploadFile(item, `${kind}-${++index}`);
      } else if (item && typeof item === "object" && !(item instanceof Blob)) {
        file = await jsonValueToUploadFile(item, `${kind}-${++index}`);
      } else {
        file = await entryToUploadFile(
          item as FormDataEntryValue,
          `${kind}-${++index}`,
        );
      }
      if (!file) continue;
      if (kind === "photo") photos.push(file);
      else documents.push(file);
    }
  }

  return { documents, photos };
}

export type PhotoUploadFormDiagnostic = {
  photoFieldKeysFound: string[];
  entries: Array<{
    key: string;
    kind: "blob" | "string";
    size?: number;
    mime?: string;
    name?: string;
    issue?: string;
  }>;
  parsedPhotoCount: number;
  /** Who should fix it when photos are missing. */
  likelyFault?: "mobile" | "server" | "airtable";
  hint?: string;
};

/** Inspect raw form parts to distinguish mobile format issues from server/Airtable failures. */
export function diagnosePhotoUploadForm(
  form: FormData,
  parsedPhotoCount: number,
): PhotoUploadFormDiagnostic {
  const photoFieldKeysFound: string[] = [];
  const entries: PhotoUploadFormDiagnostic["entries"] = [];

  for (const [key, entry] of form.entries()) {
    const knownPhoto = (PHOTO_FORM_KEYS as readonly string[]).includes(key);
    const scannedPhoto = formKeyAttachmentKind(key) === "photo";
    if (!knownPhoto && !scannedPhoto) continue;

    photoFieldKeysFound.push(key);

    if (entry instanceof Blob) {
      const name = entry instanceof File ? entry.name : undefined;
      entries.push({
        key,
        kind: "blob",
        size: entry.size,
        mime: entry.type || undefined,
        name,
        issue: entry.size === 0 ? "empty_file" : undefined,
      });
      continue;
    }

    if (typeof entry === "string") {
      const trimmed = entry.trim();
      let issue: string | undefined;
      if (/^(file|ph|content|assets-library):\/\//i.test(trimmed)) {
        issue = "local_uri_string";
      } else if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed) as { uri?: string; url?: string };
          const uri = parsed.uri ?? parsed.url;
          if (typeof uri === "string" && !/^https?:\/\//i.test(uri)) {
            issue = "local_uri_in_json";
          } else if (!parsed.uri && !parsed.url && !("base64" in parsed)) {
            issue = "json_without_bytes";
          }
        } catch {
          issue = "invalid_json";
        }
      } else if (trimmed.length > 0 && trimmed.length < 64) {
        issue = "short_string_not_base64";
      }
      entries.push({ key, kind: "string", issue });
    }
  }

  const uniqueKeys = [...new Set(photoFieldKeysFound)];
  let hint: string | undefined;
  let likelyFault: PhotoUploadFormDiagnostic["likelyFault"];

  if (
    entries.some(
      (e) => e.issue === "local_uri_in_json" || e.issue === "local_uri_string",
    )
  ) {
    likelyFault = "mobile";
    hint =
      "Device file path was sent, not image bytes. Mobile must use multipart FormData.append('photos', { uri, name, type }) so RN uploads the file, or send base64 in JSON.";
  } else if (entries.some((e) => e.issue === "empty_file")) {
    likelyFault = "mobile";
    hint =
      "Photo part is 0 bytes (broken iOS URI or failed read). Fix image picker / appendUpload on mobile.";
  } else if (uniqueKeys.length === 0 && parsedPhotoCount === 0) {
    likelyFault = "mobile";
    hint = "No photo field in request. Use form key 'photos' (repeat for each image).";
  } else if (parsedPhotoCount === 0 && entries.length > 0) {
    likelyFault = "mobile";
    hint =
      "Photo fields were sent but could not be parsed. Send multipart file bytes or base64, not a local path string.";
  } else if (parsedPhotoCount > 0) {
    likelyFault = undefined;
  }

  return {
    photoFieldKeysFound: uniqueKeys,
    entries,
    parsedPhotoCount,
    likelyFault,
    hint,
  };
}

/** Documents + photos from all known and discovered mobile/web form keys. */
export async function parseAttachmentsFromForm(form: FormData): Promise<{
  documents: File[];
  photos: File[];
}> {
  const documents = await parseDocumentFilesFromForm(form);
  const photos = await parsePhotoFilesFromForm(form);
  const generic = await collectGenericUploadFiles(form);
  const scanned = await collectScannedUploadFiles(form);

  return {
    documents: dedupeFiles([
      ...documents,
      ...generic.documents,
      ...scanned.documents,
    ]),
    photos: dedupeFiles([...photos, ...generic.photos, ...scanned.photos]),
  };
}

function appendJsonValue(form: FormData, key: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    form.append(key, String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item === null || item === undefined) continue;
      if (typeof item === "object") {
        form.append(key, JSON.stringify(item));
      } else {
        form.append(key, String(item));
      }
    }
    return;
  }
  if (typeof value === "object") {
    form.append(key, JSON.stringify(value));
  }
}

/** Mobile apps sometimes POST JSON instead of multipart/form-data. */
export function jsonBodyToFormData(body: unknown): FormData {
  const form = new FormData();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return form;
  }
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    appendJsonValue(form, key, value);
  }
  return form;
}

/** Parse multipart or JSON submission bodies into FormData. */
export async function readSubmissionFormData(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return jsonBodyToFormData(await request.json());
    } catch {
      throw new Error("Invalid JSON body");
    }
  }
  return request.formData();
}
