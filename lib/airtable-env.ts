const DEFAULT_TABLE_NAME = "Vehicle Listings";

const TOKEN_ENV_KEYS = [
  "AIRTABLE_TOKEN",
  "AIRTABLE_API_KEY",
  "AIRTABLE_PAT",
  "AIRTABLE_PERSONAL_ACCESS_TOKEN",
  "AIRTABLE_ACCESS_TOKEN",
  "AIRTABLE_API_TOKEN",
  "AIRTABLE_BEARER_TOKEN",
  "AIRTABLE_SECRET",
] as const;

const BASE_ENV_KEYS = ["AIRTABLE_BASE_ID", "AIRTABLE_BASE"] as const;

const SKIP_TOKEN_DISCOVERY = new Set([
  "AIRTABLE_BASE_ID",
  "AIRTABLE_BASE",
  "AIRTABLE_TABLE_NAME",
]);

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

function normalizeBaseId(value: string): string {
  const fromUrl = value.match(/airtable\.com\/(app[a-zA-Z0-9]+)/i);
  if (fromUrl) return fromUrl[1];
  const appOnly = value.match(/^(app[a-zA-Z0-9]+)/i);
  if (appOnly) return appOnly[1];
  return value.trim();
}

function looksLikeAirtablePat(value: string): boolean {
  return /^pat[a-zA-Z0-9]/i.test(value);
}

function discoverAirtableToken(): string | undefined {
  const explicit = readEnv(...TOKEN_ENV_KEYS);
  if (explicit) return explicit;

  for (const key of Object.keys(process.env).sort()) {
    const upper = key.toUpperCase();
    if (!upper.startsWith("AIRTABLE_") || SKIP_TOKEN_DISCOVERY.has(upper)) {
      continue;
    }
    if (upper.includes("BASE") || upper.includes("TABLE")) continue;

    const value = readEnv(key);
    if (!value) continue;

    if (/TOKEN|KEY|PAT|SECRET|AUTH/i.test(upper)) return value;
    if (looksLikeAirtablePat(value)) return value;
  }

  return undefined;
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
  const token = discoverAirtableToken();
  const baseIdRaw = readEnv(...BASE_ENV_KEYS);
  const baseId = baseIdRaw ? normalizeBaseId(baseIdRaw) : undefined;
  const tableName = readEnv("AIRTABLE_TABLE_NAME") ?? DEFAULT_TABLE_NAME;

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

export function getAirtableEnvDiagnostics() {
  const airtableKeys = Object.keys(process.env)
    .filter((k) => k.toUpperCase().includes("AIRTABLE"))
    .sort();

  const env = getAirtableEnv();
  const hasBaseId = Boolean(readEnv(...BASE_ENV_KEYS));
  const hasToken = Boolean(discoverAirtableToken());

  return {
    ok: env.ok,
    hasAirtableToken: hasToken,
    hasAirtableBaseId: hasBaseId,
    airtableEnvKeys: airtableKeys,
    acceptedTokenNames: [...TOKEN_ENV_KEYS],
  };
}

export function formatAirtableEnvError(missing: string[]): string {
  const onVercel = Boolean(process.env["VERCEL"]);
  const onlyToken = missing.length === 1 && missing[0] === "AIRTABLE_TOKEN";
  const keys = getAirtableEnvDiagnostics().airtableEnvKeys;

  if (onlyToken && onVercel) {
    const keyHint =
      keys.length > 0
        ? ` Found on server: ${keys.join(", ")}.`
        : "";
    return (
      "AIRTABLE_TOKEN is not set on Vercel (AIRTABLE_BASE_ID is present)." +
      keyHint +
      " In Vercel → Settings → Environment Variables, add AIRTABLE_TOKEN with your Airtable personal access token (starts with pat…), enable Production, save, then Redeploy."
    );
  }

  if (onVercel) {
    return (
      `Server is missing Airtable configuration (${missing.join(", ")}). ` +
      "In Vercel → Settings → Environment Variables, add them for Production, save, then Redeploy."
    );
  }

  return (
    `Server is missing Airtable configuration (${missing.join(", ")}). ` +
    "Add them to .env.local and restart npm run dev."
  );
}
