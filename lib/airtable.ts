import { formatAirtableEnvError, getAirtableEnv } from "@/lib/airtable-env";

const AIRTABLE_API = "https://api.airtable.com/v0";

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
  /** Exact Single select / Multiple select option names from this base. */
  selectChoices: Record<string, string[]>;
};

let tableTargetCache: TableTarget | null = null;

const FEATURE_ALIASES: Record<string, string> = {
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
      if (exact) return exact.name;
    }
    return undefined;
  };

  const findAttachmentByKeyword = (keyword: string) =>
    attachmentFields.find((f) => f.name.toLowerCase().includes(keyword))?.name;

  const selectChoices: Record<string, string[]> = {};
  for (const field of table.fields) {
    if (field.type !== "singleSelect" && field.type !== "multipleSelects") {
      continue;
    }
    const names =
      field.options?.choices?.map((c) => c.name).filter(Boolean) ?? [];
    if (names.length > 0) selectChoices[field.name] = names;
  }

  tableTargetCache = {
    tableName: table.name,
    attachmentFieldNames: {
      documents:
        findAttachmentField("Upload Vehicle Document", "Vehicle Document") ??
        findAttachmentByKeyword("document"),
      photos:
        findAttachmentField("Upload Vehicle Photo", "Vehicle Photo") ??
        findAttachmentByKeyword("photo") ??
        findAttachmentByKeyword("image"),
    },
    selectChoices,
  };

  return tableTargetCache;
}

function normalizeSelectKey(value: string): string {
  return value.trim().toLowerCase();
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

function appendNote(notes: string, line: string): string {
  return notes ? `${notes}\n\n${line}` : line;
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
  return FEATURE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/** Map form feature selections to the base's Features multi-select options. */
function mapFeaturesToField(
  features: string[],
  choices: string[],
): string[] | undefined {
  const normalized = [
    ...new Set(features.map(normalizeFeature).filter(Boolean)),
  ];
  if (normalized.length === 0) return undefined;
  if (choices.length === 0) return normalized;

  const byNorm = new Map(
    choices.map((choice) => [normalizeSelectKey(choice), choice]),
  );
  const matched: string[] = [];

  for (const feature of normalized) {
    if (choices.includes(feature)) {
      if (!matched.includes(feature)) matched.push(feature);
      continue;
    }
    const hit = byNorm.get(normalizeSelectKey(feature));
    if (hit && !matched.includes(hit)) matched.push(hit);
  }

  return matched.length > 0 ? matched : undefined;
}

export function buildAirtableFields(
  payload: ListingPayload,
  target: TableTarget,
): Record<string, unknown> {
  const year = parseInt(payload.year, 10);
  const km = parseInt(payload.kmDriven, 10);
  const choices = target.selectChoices;

  let notes = payload.notes.trim();

  const setSelect = (
    fieldName: string,
    candidates: string[],
    notesLabel: string,
  ): string | undefined => {
    const picked = pickSingleSelectOption(choices[fieldName] ?? [], candidates);
    if (picked) return picked;
    const raw = candidates.find((c) => c?.trim());
    if (raw) notes = appendNote(notes, `${notesLabel}: ${raw}`);
    return undefined;
  };

  const city = setSelect(
    "City",
    [mapCity(payload.city), payload.city],
    "City (entered)",
  );
  const vehicleType = setSelect(
    "Vehicle Type",
    [mapVehicleType(payload.vehicleType), payload.vehicleType],
    "Vehicle Type (entered)",
  );
  const vehicleColor = setSelect(
    "Vehicle Color",
    [mapColor(payload.vehicleColor), payload.vehicleColor],
    "Vehicle Color (entered)",
  );
  const transmission = setSelect(
    "Transmission / Gear",
    [mapTransmission(payload.transmission), payload.transmission],
    "Transmission (entered)",
  );
  const accidents = payload.accidents
    ? setSelect(
        "Accidents",
        [mapAccidents(payload.accidents) ?? "", payload.accidents],
        "Accidents (entered)",
      )
    : undefined;
  const fuelType = setSelect(
    "Fuel Type",
    [payload.fuelType],
    "Fuel Type (entered)",
  );
  const finance = setSelect("Finance", [payload.finance], "Finance (entered)");
  const evBrand = setSelect(
    "Interested EV Brand",
    evBrandCandidates(payload.evBrand),
    "Interested EV Brand (entered)",
  );

  const featuresField = mapFeaturesToField(
    payload.features,
    choices["Features"] ?? [],
  );

  if (payload.city && mapCity(payload.city) === "Others" && payload.city !== "Others" && payload.city !== "Other") {
    notes = appendNote(notes, `City (entered): ${payload.city}`);
  }

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
    ["Features", featuresField],
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
      body: JSON.stringify({ records: [{ fields }] }),
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

export async function setAttachmentUrls(
  recordId: string,
  fieldName: string,
  urls: string[],
): Promise<void> {
  if (urls.length === 0) return;

  const { tableName } = await resolveTableTarget();
  const res = await fetch(
    `${AIRTABLE_API}/${baseId()}/${encodeURIComponent(tableName)}/${recordId}`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({
        fields: {
          [fieldName]: urls.map((url) => ({ url })),
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

