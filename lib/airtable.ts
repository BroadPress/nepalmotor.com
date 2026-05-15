const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_TABLE_NAME = "Vehicle Listings";

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

function authHeaders(): HeadersInit {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN is not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function baseId(): string {
  const id = process.env.AIRTABLE_BASE_ID;
  if (!id) throw new Error("AIRTABLE_BASE_ID is not configured");
  return id;
}

function configuredTableName(): string {
  return process.env.AIRTABLE_TABLE_NAME?.trim() || DEFAULT_TABLE_NAME;
}

async function fetchTablesMeta(): Promise<AirtableTableMeta[]> {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN is not configured");

  const res = await fetch(
    `${AIRTABLE_API}/meta/bases/${baseId()}/tables`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const data = (await res.json()) as {
    tables?: AirtableTableMeta[];
    error?: { message: string };
  };

  if (!res.ok) {
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
    throw new Error(
      `Airtable table "${tableName}" was not found in this base. Available tables: ${available}. Ask your senior to create or rename the table to "${tableName}".`,
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
  const map: Record<string, string> = {
    None: "No",
    Minor: "Few times",
    Major: "Many times",
    "Prefer not to say": "I don't know",
  };
  return map[value] ?? value;
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

const EV_CHOICES = [
  "Tata Nexon EV ",
  "Tata Tigor EV ",
  "Tata Punch EV ",
  "BYD Atto 3 ",
  "BYD Dolphin ",
  "BYD e6 ",
  "MG ZS EV ",
  "MG4 EV ",
  "MG S5 EV ",
  "Neta V ",
  "Neta U ",
  "Neta X ",
  "Hyundai Kona Electric ",
  "Hyundai Ioniq 5 ",
  "Hyundai Creta EV ",
  "Kia EV6 ",
  "Kia EV9 ",
  "Kia Niro EV",
  "I need suggestion",
  "Other",
] as const;

function mapEvBrand(brand: string): {
  interested: string;
  other?: string;
} {
  if ((EV_CHOICES as readonly string[]).includes(brand)) {
    return { interested: brand };
  }
  if (brand === "Other / undecided") {
    return { interested: "I need suggestion" };
  }
  const byPrefix: Record<string, string> = {
    BYD: "BYD Atto 3 ",
    MG: "MG ZS EV ",
    Nissan: "Other",
    Hyundai: "Hyundai Kona Electric ",
    Tata: "Tata Nexon EV ",
    Mahindra: "Other",
  };
  if (byPrefix[brand]) {
    return { interested: byPrefix[brand] };
  }
  return { interested: "Other", other: brand };
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
  const { airtable: featureTags, extra: extraFeatures } = splitFeatures(
    payload.features,
  );
  const ev = mapEvBrand(payload.evBrand);

  let notes = payload.notes.trim();
  if (extraFeatures.length > 0) {
    const line = `Additional features: ${extraFeatures.join(", ")}`;
    notes = notes ? `${notes}\n\n${line}` : line;
  }
  if (payload.city && mapCity(payload.city) === "Others" && payload.city !== "Others") {
    const line = `City (entered): ${payload.city}`;
    notes = notes ? `${notes}\n\n${line}` : line;
  }

  const fields: Record<string, unknown> = {
    "Full Name": payload.fullName.trim(),
    Phone: payload.phone.trim(),
    City: mapCity(payload.city),
    "Year of Manufacture": Number.isFinite(year) ? year : undefined,
    "Vehicle Type": mapVehicleType(payload.vehicleType),
    "Vehicle Brand": payload.vehicleBrand.trim(),
    "Vehicle Model": payload.vehicleModel.trim(),
    "Vehicle Color": mapColor(payload.vehicleColor),
    "KM Driven": Number.isFinite(km) ? km : undefined,
    "Interested EV Brand": ev.interested,
    Finance: payload.finance,
    "Transmission / Gear": mapTransmission(payload.transmission),
    "Fuel Type": payload.fuelType,
  };

  if (payload.email.trim()) fields.Email = payload.email.trim();
  if (ev.other) fields["Other EV Brand"] = ev.other;

  const accidents = mapAccidents(payload.accidents);
  if (accidents) fields.Accidents = accidents;

  if (featureTags.length > 0) fields.Features = featureTags;
  if (notes) fields.Notes = notes;

  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== ""),
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

