import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Server-only runtime configuration.
 *
 * DATABASE_URL must be provided by the environment (fail fast if missing).
 * JWT_SECRET is read from the environment when present; otherwise a strong
 * secret is generated once and persisted to a gitignored file so that issued
 * tokens survive process restarts. Nothing is ever hardcoded into the bundle.
 */

const SECRET_DIR = join(process.cwd(), ".runtime");
const SECRET_FILE = join(SECRET_DIR, "jwt-secret");
const MIN_SECRET_LENGTH = 32;

let cachedSecret: string | null = null;
let storageWarned = false;

function generateSecret(): string {
  return randomBytes(48).toString("base64url");
}

function persistSecret(secret: string): void {
  try {
    mkdirSync(SECRET_DIR, { recursive: true, mode: 0o700 });
    const temporary = join(SECRET_DIR, `.jwt-secret-${process.pid}.tmp`);
    writeFileSync(temporary, `${secret}\n`, { mode: 0o600 });
    renameSync(temporary, SECRET_FILE);
  } catch (error) {
    if (!storageWarned) {
      storageWarned = true;
      console.warn(JSON.stringify({
        level: "warn",
        event: "auth.secret_not_persisted",
        message: error instanceof Error ? error.message : "Filesystem unavailable",
        detail: "Sessions will end when the server restarts.",
      }));
    }
  }
}

export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv && fromEnv.length >= MIN_SECRET_LENGTH) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  try {
    const stored = readFileSync(SECRET_FILE, "utf8").trim();
    if (stored.length >= MIN_SECRET_LENGTH) {
      cachedSecret = stored;
      return cachedSecret;
    }
  } catch {
    // No persisted secret yet; fall through to generation.
  }

  const secret = generateSecret();
  persistSecret(secret);
  cachedSecret = secret;
  return cachedSecret;
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env.local and set a PostgreSQL connection string.",
    );
  }
  return url;
}

export type SecretSource = "environment" | "generated";

function resolveSecretSource(): SecretSource {
  return process.env.JWT_SECRET?.trim() ? "environment" : "generated";
}

/** Redacted summary safe for logs and the health endpoint. Never includes values. */
export function describeRuntimeConfig(): {
  databaseUrl: "configured" | "missing";
  jwtSecret: SecretSource;
} {
  return {
    databaseUrl: process.env.DATABASE_URL?.trim() ? "configured" : "missing",
    jwtSecret: resolveSecretSource(),
  };
}
