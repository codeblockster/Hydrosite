import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sourcePath = new URL("../src/lib/server/env.ts", import.meta.url);
const raw = readFileSync(sourcePath, "utf8");
const runtimeDir = new URL("../.runtime", import.meta.url);
const secretFile = new URL("../.runtime/jwt-secret", import.meta.url);

function loadModule() {
  // "server-only" is a bundler directive; it is not resolvable in plain node.
  const source = raw.replace('import "server-only";', "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports, require);
  return mod.exports;
}

describe("server runtime configuration", () => {
  const previousSecret = process.env.JWT_SECRET;
  const existedBefore = existsSync(secretFile);
  const backup = existedBefore ? readFileSync(secretFile, "utf8") : null;

  before(() => {
    delete process.env.JWT_SECRET;
    if (existedBefore) rmSync(secretFile);
  });

  after(() => {
    if (previousSecret) process.env.JWT_SECRET = previousSecret;
    if (backup !== null) {
      const fs = require("node:fs");
      fs.writeFileSync(secretFile, backup, { mode: 0o600 });
    }
  });

  test("provisions a strong secret and persists it for restart resilience", () => {
    const env = loadModule();
    const secret = env.getJwtSecret();
    assert.ok(secret.length >= 32, "secret must be at least 32 characters");
    assert.match(secret, /^[A-Za-z0-9_-]+$/, "secret must be url-safe");
    assert.ok(existsSync(secretFile), "generated secret should be persisted");
    assert.notEqual(readFileSync(secretFile, "utf8").trim(), "", "persisted secret must not be empty");
    if (process.platform !== "win32") {
      assert.equal(statSync(secretFile).mode & 0o777, 0o600, "secret file must be owner-only");
    }
    assert.equal(env.getJwtSecret(), secret, "resolution must be stable across calls");
    assert.ok(existsSync(runtimeDir));
  });

  test("prefers an explicit environment secret", () => {
    const fromEnv = "unit-test-secret-value-that-is-long-enough-1234567890";
    process.env.JWT_SECRET = fromEnv;
    const env = loadModule();
    assert.equal(env.getJwtSecret(), fromEnv);
    assert.equal(env.describeRuntimeConfig().jwtSecret, "environment");
  });

  test("ignores a too-short environment secret and falls back to generation", () => {
    process.env.JWT_SECRET = "short";
    const env = loadModule();
    const resolved = env.getJwtSecret();
    assert.ok(resolved.length >= 32);
    assert.notEqual(resolved, "short");
  });

  test("health summary is redacted", () => {
    delete process.env.JWT_SECRET;
    const env = loadModule();
    const summary = JSON.stringify(env.describeRuntimeConfig());
    assert.ok(!summary.includes(env.getJwtSecret()), "config summary must not contain the secret");
    assert.match(summary, /"(databaseUrl|jwtSecret)"/);
  });
});
