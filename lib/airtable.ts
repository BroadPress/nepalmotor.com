import { formatAirtableEnvError, getAirtableEnv } from "@/lib/airtable-env";

const AIRTABLE_API = "https://api.airtable.com/v0";
const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const ATTACHMENT_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function inferAttachmentMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ATTACHMENT_MIME_BY_EXT[ext ?? ""] ?? "application/octet-stream";
}

type AirtableFieldMeta = {
  id: string;
  name: string;
  type: string;
  options?: { choices?: { name: string }[] };
};
type AirtableTableMeta = { id: string; name: string; fields: AirtableFieldMeta[] };
export type TableTarget = {
  tableName: string;
  attachmentFieldNames: {
    documents?: string;
    photos?: string;
  };
  attachmentFieldIds: {
    documents?: string;
    photos?: string;
  };
  /** Exact Single select / Multiple select option names from this base. */
  selectChoices: Record<string, string[]>;
};

let tableTargetCache: TableTarget | null = null;

const FEATURE_ALIASES: Record<string, string> = {
  abs: "ABS",
  airbag: "Airbags",
  airbags: "Airbags",
  "leather seats": "Leather Seats",
  "reverse camera": "Backup Camera",
  "cruise control": "Cruise Control",
  sunroof: "Sunroof",
};

export type ListingPayload = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  year: string;
  vehicleType: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  kmDriven: string;
  evBrand: string;
  finance: string;
  transmission: string;
  accidents: string;
  fuelType: string;
  features: string[];
  notes: string;
};

export class FeatureValidationError extends Error {
  readonly unmatchedFeatures: string[];
  readonly featuresColumn: string;

  constructor(unmatchedFeatures: string[], featuresColumn: string) {
    super(
      `These features are not valid for Airtable column "${featuresColumn}": ${unmatchedFeatures.join(", ")}`,
    );
    this.name = "FeatureValidationError";
    this.unmatchedFeatures = unmatchedFeatures;
    this.featuresColumn = featuresColumn;
  }
}

function requireAirtableConfig() {
  const env = getAirtableEnv();
  if (!env.ok) throw new Error(formatAirtableEnvError(env.missing));
  return env.config;
}

function authHeaders(): HeadersInit {
  const { token } = requireAirtableConfig();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function baseId(): string {
  return requireAirtableConfig().baseId;
}

function configuredTableName(): string {
  return requireAirtableConfig().tableName;
}

async function fetchTablesMeta(): Promise<AirtableTableMeta[]> {
  const { token } = requireAirtableConfig();

  const res = await fetch(
    `${AIRTABLE_API}/meta/bases/${baseId()}/tables`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const data = (await res.json()) as {
    tables?: AirtableTableMeta[];
    error?: { message: string };
  };

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        "Airtable base not found (404). Check AIRTABLE_BASE_ID is the app… id from your base URL " +
          "(not a table id tbl…). Ensure your token has access to this base and includes " +
          "schema.bases:read scope.",
      );
    }
    if (res.status === 403) {
      throw new Error(
        "Airtable denied access (403). Recreate your token with data.records:read/write and " +
          "schema.bases:read, and grant access to this base.",
      );
    }
    throw new Error(data.error?.message ?? `Airtable meta error (${res.status})`);
  }

  return data.tables ?? [];
}

export async function resolveTableTarget(): Promise<TableTarget> {
  const tableName = configuredTableName();
  if (tableTargetCache?.tableName === tableName) return tableTargetCache;

  const tables = await fetchTablesMeta();
  const table = tables.find((t) => t.name === tableName);

  if (!table) {
    const available = tables.map((t) => `"${t.name}"`).join(", ") || "(none)";
    const looksLikeBaseId = /^app[a-zA-Z0-9]+$/i.test(tableName);
    const hint = looksLikeBaseId
      ? ' AIRTABLE_TABLE_NAME looks like a base id (app…)—set it to "Vehicle Listings" or remove it from Vercel env vars.'
      : "";
    throw new Error(
      `Airtable table "${tableName}" was not found in this base. Available tables: ${available}.${hint}`,
    );
  }

  const attachmentFields = table.fields.filter(
    (f) => f.type === "multipleAttachments",
  );

  const findAttachmentField = (...preferredNames: string[]) => {
    for (const name of preferredNames) {
      const exact = attachmentFields.find((f) => f.name === name);
      if (exact) return exact;
    }
    return undefined;
  };

  const findAttachmentByKeyword = (keyword: string) =>
    attachmentFields.find((f) => f.name.toLowerCase().includes(keyword));

  const selectChoices: Record<string, string[]> = {};
  for (const field of table.fields) {
    if (field.type !== "singleSelect" && field.type !== "multipleSelects") {
      continue;
    }
    const names =
      field.options?.choices?.map((c) => c.name).filter(Boolean) ?? [];
    if (names.length > 0) selectChoices[field.name] = names;
  }

  let documentsField =
    findAttachmentField("Upload Vehicle Document", "Vehicle Document") ??
    findAttachmentByKeyword("document");
  let photosField =
    findAttachmentField("Upload Vehicle Photo", "Vehicle Photo") ??
    findAttachmentByKeyword("photo") ??
    findAttachmentByKeyword("image");

  if (
    documentsField &&
    photosField &&
    documentsField.id === photosField.id
  ) {
    photosField =
      findAttachmentField("Upload Vehicle Photo", "Vehicle Photo") ??
      attachmentFields.find(
        (f) =>
          f.id !== documentsField?.id &&
          /photo|image/i.test(f.name) &&
          !/document/i.test(f.name),
      );
  }

  tableTargetCache = {
    tableName: table.name,
    attachmentFieldNames: {
      documents: documentsField?.name,
      photos: photosField?.name,
    },
    attachmentFieldIds: {
      documents: documentsField?.id,
      photos: photosField?.id,
    },
    selectChoices,
  };

  return tableTargetCache;
}

function normalizeSelectKey(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Pick a value that already exists on the Airtable select — never invent new options. */
export function pickSingleSelectOption(
  choices: string[],
  candidates: string[],
): string | undefined {
  if (choices.length === 0) {
    return candidates.find((c) => c?.trim())?.trim();
  }

  const byNorm = new Map(
    choices.map((choice) => [normalizeSelectKey(choice), choice]),
  );

  for (const cand of candidates) {
    if (!cand?.trim()) continue;
    if (choices.includes(cand)) return cand;
    const exact = byNorm.get(normalizeSelectKey(cand));
    if (exact) return exact;
  }

  for (const cand of candidates) {
    if (!cand?.trim()) continue;
    const cn = normalizeSelectKey(cand);
    for (const choice of choices) {
      const on = normalizeSelectKey(choice);
      if (on === cn || on.startsWith(cn) || cn.startsWith(on)) return choice;
    }
  }

  for (const fallback of [
    "Other/undecide",
    "Other",
    "I need suggestion",
    "I don't know",
    "I dont know",
    "No",
  ]) {
    const hit = byNorm.get(normalizeSelectKey(fallback));
    if (hit) return hit;
  }

  return undefined;
}

function mapCity(city: string): string {
  const allowed = new Set([
    "Kathmandu",
    "Pokhara",
    "Biratnagar",
    "Itahari",
    "Others",
  ]);
  if (allowed.has(city)) return city;
  return "Others";
}

function mapVehicleType(type: string): string {
  const map: Record<string, string> = {
    Crossover: "Compact SUV",
    "Two-wheeler": "I dont know",
    Other: "I dont know",
  };
  const allowed = new Set([
    "Hatchback",
    "Sedan",
    "SUV",
    "Compact SUV",
    "Van",
    "Pickup",
    "I dont know",
  ]);
  const mapped = map[type] ?? type;
  return allowed.has(mapped) ? mapped : "I dont know";
}

function mapColor(color: string): string {
  const map: Record<string, string> = {
    Gray: "Gray",
    Other: "I don't know",
  };
  const allowed = new Set([
    "White",
    "Silver",
    "Blue",
    "Red",
    "Black",
    "Green",
    "Gray",
    "Yellow",
    "I don't know",
  ]);
  const mapped = map[color] ?? color;
  return allowed.has(mapped) ? mapped : "I don't know";
}

/** Website labels → production Airtable "Accidents" single-select options. */
function mapAccidents(value: string): string | undefined {
  if (!value) return undefined;
  const map: Record<string, string> = {
    None: "No",
    Minor: "Few times",
    Major: "Many times",
    "Prefer not to say": "I don't know",
  };
  const trimmed = value.trim();
  return map[trimmed] ?? trimmed;
}

function mapTransmission(value: string): string {
  const map: Record<string, string> = {
    CVT: "Semi Automatic",
    Other: "Semi Automatic",
  };
  const allowed = new Set(["Automatic", "Manual", "Semi Automatic"]);
  const mapped = map[value] ?? value;
  return allowed.has(mapped) ? mapped : "Semi Automatic";
}

const EV_FORM_TO_MODEL: Record<string, string> = {
  BYD: "BYD Atto 3",
  MG: "MG ZS EV",
  Nissan: "Other",
  Hyundai: "Hyundai Kona Electric",
  Tata: "Tata Nexon EV",
  Mahindra: "Other",
  Tesla: "Other",
};

function evBrandCandidates(formBrand: string): string[] {
  const value = formBrand.trim();
  if (value === "Other / undecided") {
    return ["Other/undecide", "I need suggestion", "Other", value];
  }
  const candidates = [value];
  if (EV_FORM_TO_MODEL[value]) candidates.push(EV_FORM_TO_MODEL[value]);
  return candidates;
}

function normalizeFeature(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  return FEATURE_ALIASES[lower] ?? trimmed;
}

/** Airtable column for multi-select features (exact name varies by base). */
export function resolveFeaturesColumn(
  selectChoices: Record<string, string[]>,
): { columnName: string; choices: string[] } {
  if (Object.prototype.hasOwnProperty.call(selectChoices, "Features")) {
    return { columnName: "Features", choices: selectChoices["Features"] ?? [] };
  }
  for (const [name, choices] of Object.entries(selectChoices)) {
    if (/^features?$/i.test(name.trim())) {
      return { columnName: name, choices };
    }
  }
  for (const [name, choices] of Object.entries(selectChoices)) {
    if (/feature/i.test(name)) {
      return { columnName: name, choices };
    }
  }
  return { columnName: "Features", choices: [] };
}

function fuzzyMultiSelectMatch(
  feature: string,
  choices: string[],
): string | undefined {
  const fn = normalizeSelectKey(feature);
  if (!fn) return undefined;
  for (const c of choices) {
    if (normalizeSelectKey(c) === fn) return c;
  }
  for (const c of choices) {
    const cn = normalizeSelectKey(c);
    if (cn.includes(fn) || fn.includes(cn)) return c;
  }
  return undefined;
}

/** Split label into comparable tokens (handles "PW (Power windows)" etc.). */
function featureMatchTokens(normalizedLabel: string): string[] {
  return normalizedLabel
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** Whether a feature token is covered by some choice token (incl. plural / prefix). */
function featureTokenCoveredByChoiceTokens(
  ft: string,
  choiceTokens: string[],
): boolean {
  for (const ct of choiceTokens) {
    if (ft === ct) return true;
    if (ft.length >= 3 && ct.includes(ft)) return true;
    if (ct.length >= 3 && ft.includes(ct)) return true;
    const [shorter, longer] =
      ft.length <= ct.length ? [ft, ct] : [ct, ft];
    if (shorter.length >= 3 && longer.startsWith(shorter)) return true;
  }
  return false;
}

/** Every feature token must appear in the choice wording (handles abbreviated Airtable labels). */
function bestFeatureChoiceByTokens(
  feature: string,
  choices: string[],
): string | undefined {
  const fn = normalizeSelectKey(feature);
  const fts = featureMatchTokens(fn);
  if (fts.length === 0) return undefined;

  let best: string | undefined;
  let bestScore = 0;

  for (const c of choices) {
    const cts = featureMatchTokens(normalizeSelectKey(c));
    if (cts.length === 0) continue;
    let covered = 0;
    for (const ft of fts) {
      if (featureTokenCoveredByChoiceTokens(ft, cts)) covered += 1;
    }
    const score = covered / fts.length;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return bestScore >= 1 ? best : undefined;
}

function resolveFeatureToChoice(
  feature: string,
  choices: string[],
): string | undefined {
  if (choices.includes(feature)) return feature;
  const byNorm = new Map(
    choices.map((choice) => [normalizeSelectKey(choice), choice]),
  );
  const hit = byNorm.get(normalizeSelectKey(feature));
  if (hit) return hit;
  const fuzzy = fuzzyMultiSelectMatch(feature, choices);
  if (fuzzy) return fuzzy;
  const picked = pickSingleSelectOption(choices, [
    feature,
    normalizeFeature(feature),
  ]);
  if (picked) return picked;
  return bestFeatureChoiceByTokens(feature, choices);
}

/** Map form feature selections to the base's Features multi-select options. */
function mapFeaturesToField(
  features: string[],
  choices: string[],
): { field?: string[]; unmatched: string[] } {
  const normalized = [
    ...new Set(features.map(normalizeFeature).filter(Boolean)),
  ];
  if (normalized.length === 0) return { unmatched: [] };
  if (choices.length === 0) return { field: normalized, unmatched: [] };

  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const feature of normalized) {
    const resolved = resolveFeatureToChoice(feature, choices);
    if (resolved) {
      if (!matched.includes(resolved)) matched.push(resolved);
      continue;
    }
    unmatched.push(feature);
  }

  return {
    field: matched.length > 0 ? matched : undefined,
    unmatched,
  };
}

export function buildAirtableFields(
  payload: ListingPayload,
  target: TableTarget,
): Record<string, unknown> {
  const year = parseInt(payload.year, 10);
  const km = parseInt(payload.kmDriven, 10);
  const choices = target.selectChoices;

  const notes = payload.notes.trim();

  const setSelect = (
    fieldName: string,
    candidates: string[],
  ): string | undefined => {
    const picked = pickSingleSelectOption(choices[fieldName] ?? [], candidates);
    if (picked) return picked;
    return undefined;
  };

  const city = setSelect("City", [mapCity(payload.city), payload.city]);
  const vehicleType = setSelect("Vehicle Type", [
    mapVehicleType(payload.vehicleType),
    payload.vehicleType,
  ]);
  const vehicleColor = setSelect("Vehicle Color", [
    mapColor(payload.vehicleColor),
    payload.vehicleColor,
  ]);
  const transmission = setSelect("Transmission / Gear", [
    mapTransmission(payload.transmission),
    payload.transmission,
  ]);
  const accidents = payload.accidents
    ? setSelect("Accidents", [
        mapAccidents(payload.accidents) ?? "",
        payload.accidents,
      ])
    : undefined;
  const fuelType = setSelect("Fuel Type", [payload.fuelType]);
  const finance = setSelect("Finance", [payload.finance]);
  const evBrand = setSelect(
    "Interested EV Brand",
    evBrandCandidates(payload.evBrand),
  );

  const { columnName: featuresColumnName, choices: featureChoices } =
    resolveFeaturesColumn(choices);

  const { field: matchedFeatures, unmatched: unmatchedFeatures } =
    mapFeaturesToField(payload.features, featureChoices);

  const allFeatures = [
    ...(matchedFeatures ?? []),
    ...unmatchedFeatures.filter(
      (feature) => !(matchedFeatures ?? []).includes(feature),
    ),
  ];
  const featuresField: string[] | undefined =
    allFeatures.length > 0 ? allFeatures : undefined;

  const entries: [string, unknown][] = [
    ["Full Name", payload.fullName.trim()],
    ["Email", payload.email.trim()],
    ["Phone", payload.phone.trim()],
    ["City", city],
    ["Year of Manufacture", Number.isFinite(year) ? year : undefined],
    ["Vehicle Type", vehicleType],
    ["Vehicle Model", payload.vehicleModel.trim()],
    ["Vehicle Brand", payload.vehicleBrand.trim()],
    ["Vehicle Color", vehicleColor],
    ["KM Driven", Number.isFinite(km) ? km : undefined],
    ["Transmission / Gear", transmission],
    ["Accidents", accidents],
    ["Fuel Type", fuelType],
    [featuresColumnName, featuresField],
    ["Interested EV Brand", evBrand],
    ["Finance", finance],
    ["Notes", notes || undefined],
  ];

  return Object.fromEntries(
    entries.filter(([, v]) => v !== undefined && v !== ""),
  );
}

export async function createListingRecord(
  fields: Record<string, unknown>,
): Promise<string> {
  const { tableName } = await resolveTableTarget();
  const res = await fetch(
    `${AIRTABLE_API}/${baseId()}/${encodeURIComponent(tableName)}`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    },
  );

  const data = (await res.json()) as {
    records?: { id: string }[];
    error?: { type: string; message: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message ?? `Airtable error (${res.status})`);
  }

  const id = data.records?.[0]?.id;
  if (!id) throw new Error("Airtable did not return a record id");
  return id;
}

/**
 * Upload a file directly to an Airtable attachment field (base64 body).
 * Prefer field id when available; falls back to the field display name.
 */
export async function uploadAttachmentToField(
  recordId: string,
  fieldIdOrName: string,
  file: File,
): Promise<void> {
  if (file.size === 0) {
    throw new Error(`${file.name || "File"} is empty (0 bytes)`);
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    throw new Error(
      `${file.name} is too large (max ${ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB per file)`,
    );
  }

  const { token } = requireAirtableConfig();
  const bytes = Buffer.from(await file.arrayBuffer());

  const res = await fetch(
    `${AIRTABLE_API}/${baseId()}/${recordId}/${encodeURIComponent(fieldIdOrName)}/uploadAttachment`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contentType: inferAttachmentMime(file),
        filename: file.name,
        file: bytes.toString("base64"),
      }),
    },
  );

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
  };
  if (!res.ok) {
    const msg =
      typeof data.error === "string"
        ? data.error
        : data.error?.message ?? `Airtable attachment upload failed (${res.status})`;
    throw new Error(msg);
  }
}

export type AirtableAttachmentRef = { id?: string; url?: string };

/** Existing attachments on a record (for merge-before-update). */
export async function getRecordAttachments(
  recordId: string,
  fieldName: string,
): Promise<AirtableAttachmentRef[]> {
  const { tableName } = await resolveTableTarget();
  const res = await fetch(
    `${AIRTABLE_API}/${baseId()}/${encodeURIComponent(tableName)}/${recordId}`,
    { headers: authHeaders() },
  );

  const data = (await res.json()) as {
    fields?: Record<string, Array<{ id?: string; url?: string }> | undefined>;
    error?: { message: string };
  };
  if (!res.ok) {
    throw new Error(
      data.error?.message ?? `Failed to read record (${res.status})`,
    );
  }

  const attachments = data.fields?.[fieldName];
  if (!Array.isArray(attachments)) return [];
  return attachments.filter((a) => a.id || a.url);
}

function attachmentPayload(
  existing: AirtableAttachmentRef[],
  newUrls: string[],
): Array<{ id: string } | { url: string }> {
  const payload: Array<{ id: string } | { url: string }> = [];
  for (const item of existing) {
    if (item.id) payload.push({ id: item.id });
    else if (item.url) payload.push({ url: item.url });
  }
  for (const url of newUrls) {
    payload.push({ url });
  }
  return payload;
}

export async function setAttachmentUrls(
  recordId: string,
  fieldName: string,
  urls: string[],
  existing: AirtableAttachmentRef[] = [],
): Promise<void> {
  if (urls.length === 0 && existing.length === 0) return;

  const { tableName } = await resolveTableTarget();
  const res = await fetch(
    `${AIRTABLE_API}/${baseId()}/${encodeURIComponent(tableName)}/${recordId}`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({
        fields: {
          [fieldName]: attachmentPayload(existing, urls),
        },
      }),
    },
  );

  const data = (await res.json()) as { error?: { message: string } };
  if (!res.ok) {
    throw new Error(
      data.error?.message ?? `Attachment update failed (${res.status})`,
    );
  }
}

