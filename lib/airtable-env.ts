const DEFAULT_TABLE_NAME = "Vehicle Listings";

/** Bracket access so Next.js does not inline values at build time. */
function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim().replace(/^['"]|['"]$/g, "");
    if (value) return value;
  }
  return undefined;
}

function looksLikeBaseId(value: string): boolean {
  return /^app[a-zA-Z0-9]+$/i.test(value.trim());
}

function normalizeBaseId(value: string): string {
  const fromUrl = value.match(/airtable\.com\/(app[a-zA-Z0-9]+)/i);
  if (fromUrl) return fromUrl[1];
  const appOnly = value.match(/^(app[a-zA-Z0-9]+)/i);
  if (appOnly) return appOnly[1];
  return value.trim();
}

/** Fix swapped or duplicated base id / table name in env vars. */
function resolveBaseAndTable(): { baseId?: string; tableName: string } {
  const baseRaw = readEnv("AIRTABLE_BASE_ID", "AIRTABLE_BASE");
  const tableRaw = readEnv("AIRTABLE_TABLE_NAME");

  const baseFromVar = baseRaw ? normalizeBaseId(baseRaw) : undefined;
  const baseIsValid = Boolean(baseFromVar && looksLikeBaseId(baseFromVar));
  const tableIsBaseId = Boolean(tableRaw && looksLikeBaseId(tableRaw));
  const baseIsTableName = Boolean(baseRaw && !looksLikeBaseId(normalizeBaseId(baseRaw)));

  if (tableIsBaseId && baseIsTableName && tableRaw && baseRaw) {
    return {
      baseId: normalizeBaseId(tableRaw),
      tableName: baseRaw.trim(),
    };
  }

  if (tableIsBaseId && tableRaw) {
    return {
      baseId: baseIsValid ? baseFromVar : normalizeBaseId(tableRaw),
      tableName:
        baseIsTableName && baseRaw ? baseRaw.trim() : DEFAULT_TABLE_NAME,
    };
  }

  return {
    baseId: baseFromVar,
    tableName: tableRaw?.trim() || DEFAULT_TABLE_NAME,
  };
}

export type AirtableEnvConfig = {
  token: string;
  baseId: string;
  tableName: string;
};

export type AirtableEnvStatus =
  | { ok: true; config: AirtableEnvConfig }
  | { ok: false; missing: string[] };

export function getAirtableEnv(): AirtableEnvStatus {
  const token = readEnv(
    "AIRTABLE_TOKEN",
    "AIRTABLE_API_KEY",
    "AIRTABLE_PAT",
    "AIRTABLE_PERSONAL_ACCESS_TOKEN",
  );
  const { baseId, tableName } = resolveBaseAndTable();

  if (!token || !baseId) {
    const missing: string[] = [];
    if (!token) missing.push("AIRTABLE_TOKEN");
    if (!baseId) missing.push("AIRTABLE_BASE_ID");
    return { ok: false, missing };
  }

  return {
    ok: true,
    config: { token, baseId, tableName },
  };
}

export function formatAirtableEnvError(missing: string[]): string {
  const onVercel = Boolean(process.env["VERCEL"]);
  if (onVercel) {
    return (
      `Server is missing Airtable configuration (${missing.join(", ")}). ` +
      "In Vercel → Project → Settings → Environment Variables, add them for Production, save, then Redeploy (Deployments → ⋮ → Redeploy)."
    );
  }
  return (
    `Server is missing Airtable configuration (${missing.join(", ")}). ` +
    "Add them to .env.local and restart npm run dev."
  );
}
