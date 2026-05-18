import { formatAirtableEnvError, getAirtableEnv } from "@/lib/airtable-env";

const AIRTABLE_API = "https://api.airtable.com/v0";

type AirtableFieldMeta = { id: string; name: string; type: string };
type AirtableTableMeta = { id: string; name: string; fields: AirtableFieldMeta[] };
type TableTarget = {
  tableName: string;
  attachmentFieldNames: {
    documents?: string;
    photos?: string;
  };
};

let tableTargetCache: TableTarget | null = null;

const AIRTABLE_FEATURES = new Set([
  "Basic",
  "A/C",
  "Full",
  "Premium",
  "4WD",
  "Sunroof",
  "Navigation",
  "Autopilot",
  "Leather Seats",
  "Panoramic Roof",
  "AWD",
  "Backup Camera",
  "Hybrid",
  "Cruise Control",
  "Blind Spot Monitor",
  "Heated Seats",
  "Tow Package",
  "Other",
]);

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

  const findField = (name: string) =>
    table.fields.find((f) => f.name === name && f.type === "multipleAttachments");

  const fieldName = (name: string) => findField(name)?.name;

  tableTargetCache = {
    tableName: table.name,
    attachmentFieldNames: {
      documents: fieldName("Upload Vehicle Document"),
      photos: fieldName("Upload Vehicle Photo"),
    },
  };

  return tableTargetCache;
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

function mapAccidents(value: string): string | undefined {
  if (!value) return undefined;
  // Same labels as the website form — add these options on Airtable "Accidents"
  return value.trim();
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

/** Must match Single select options on Airtable field "Interested EV Brand". */
const AIRTABLE_EV_BRANDS = new Set([
  "BYD",
  "Tesla",
  "Nissan",
  "Hyundai",
  "MG",
  "Tata",
  "Mahindra",
  "Other/undecide",
]);

function mapEvBrand(brand: string): {
  interested: string;
  other?: string;
} {
  const value = brand.trim();
  if (value === "Other / undecided") {
    return { interested: "Other/undecide" };
  }
  if (AIRTABLE_EV_BRANDS.has(value)) {
    return { interested: value };
  }
  return { interested: "Other/undecide", other: value };
}

function splitFeatures(features: string[]): {
  airtable: string[];
  extra: string[];
} {
  const airtable: string[] = [];
  const extra: string[] = [];

  for (const f of features) {
    const alias = FEATURE_ALIASES[f.toLowerCase()];
    if (alias && AIRTABLE_FEATURES.has(alias)) {
      if (!airtable.includes(alias)) airtable.push(alias);
      continue;
    }
    if (AIRTABLE_FEATURES.has(f)) {
      if (!airtable.includes(f)) airtable.push(f);
    } else {
      extra.push(f);
    }
  }

  return { airtable, extra };
}

export function buildAirtableFields(payload: ListingPayload): Record<string, unknown> {
  const year = parseInt(payload.year, 10);
  const km = parseInt(payload.kmDriven, 10);
  const { airtable: featureTags } = splitFeatures(payload.features);
  const ev = mapEvBrand(payload.evBrand);
  const accidents = mapAccidents(payload.accidents);

  let notes = payload.notes.trim();
  if (payload.city && mapCity(payload.city) === "Others" && payload.city !== "Others") {
    const line = `City (entered): ${payload.city}`;
    notes = notes ? `${notes}\n\n${line}` : line;
  }

  // Order matches the website / mobile form (EV brand, finance, notes last).
  const entries: [string, unknown][] = [
    ["Full Name", payload.fullName.trim()],
    ["Email", payload.email.trim()],
    ["Phone", payload.phone.trim()],
    ["City", mapCity(payload.city)],
    ["Year of Manufacture", Number.isFinite(year) ? year : undefined],
    ["Vehicle Type", mapVehicleType(payload.vehicleType)],
    ["Vehicle Model", payload.vehicleModel.trim()],
    ["Vehicle Brand", payload.vehicleBrand.trim()],
    ["Vehicle Color", mapColor(payload.vehicleColor)],
    ["KM Driven", Number.isFinite(km) ? km : undefined],
    ["Transmission / Gear", mapTransmission(payload.transmission)],
    ["Accidents", accidents],
    ["Fuel Type", payload.fuelType],
    ["Features", featureTags.length > 0 ? featureTags : undefined],
    ["Interested EV Brand", ev.interested.trim()],
    ["Finance", payload.finance],
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

