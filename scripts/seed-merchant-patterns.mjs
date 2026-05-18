#!/usr/bin/env node
/**
 * Syncs global_merchant_patterns from the seed JSON file to D1.
 * Only inserts/updates/deletes rows that differ from the JSON source of truth.
 *
 * Usage: node scripts/seed-merchant-patterns.mjs <local|remote> [--env preview|production]
 * Examples:
 *   node scripts/seed-merchant-patterns.mjs local
 *   node scripts/seed-merchant-patterns.mjs remote --env preview
 *   node scripts/seed-merchant-patterns.mjs remote --env production
 */
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const [target, ...rest] = process.argv.slice(2);
if (!target || !["local", "remote"].includes(target)) {
  console.error("Usage: node scripts/seed-merchant-patterns.mjs <local|remote> [--env preview|production]");
  process.exit(1);
}

const envIdx = rest.indexOf("--env");
const envFlag = envIdx !== -1 ? rest[envIdx + 1] : undefined;
if (target === "remote" && !envFlag) {
  console.error("Remote target requires --env <preview|production>");
  process.exit(1);
}

// Read desired state from JSON
const seedPath = resolve(root, "db/seeds/global_merchant_patterns.json");
const desired = JSON.parse(readFileSync(seedPath, "utf-8"));

// Build wrangler command base
function wranglerExec(sql) {
  const envArg = target === "remote" ? ` --env ${envFlag}` : "";
  const remoteArg = target === "remote" ? " --remote" : "";
  const cmd = `pnpm exec wrangler d1 execute DB${envArg}${remoteArg} --command="${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { cwd: root, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
}

// Fetch current state
let existing = [];
try {
  const output = wranglerExec("SELECT pattern, paths FROM global_merchant_patterns");
  // Wrangler outputs JSON like [{ "results": [...], "success": true, ... }]
  const jsonMatch = output.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed) && parsed[0]?.results) {
      existing = parsed[0].results;
    } else {
      existing = parsed;
    }
  }
} catch {
  // Table might not exist yet (migration not applied) — treat as empty
  existing = [];
}

const existingMap = new Map(existing.map((r) => [r.pattern, r.paths]));
const desiredMap = new Map(desired.map((r) => [r.pattern, JSON.stringify(r.paths)]));

// Compute diff
const toInsert = [];
const toUpdate = [];
const toDelete = [];

for (const [pattern, paths] of desiredMap) {
  if (!existingMap.has(pattern)) {
    toInsert.push({ pattern, paths });
  } else if (existingMap.get(pattern) !== paths) {
    toUpdate.push({ pattern, paths });
  }
}

for (const pattern of existingMap.keys()) {
  if (!desiredMap.has(pattern)) {
    toDelete.push(pattern);
  }
}

if (!toInsert.length && !toUpdate.length && !toDelete.length) {
  console.log("✓ Merchant patterns already up to date");
  process.exit(0);
}

// Apply changes
let statements = [];

for (const { pattern, paths } of toInsert) {
  const escaped = (s) => s.replace(/'/g, "''");
  statements.push(`INSERT INTO global_merchant_patterns (pattern, paths) VALUES ('${escaped(pattern)}', '${escaped(paths)}')`);
}

for (const { pattern, paths } of toUpdate) {
  const escaped = (s) => s.replace(/'/g, "''");
  statements.push(`UPDATE global_merchant_patterns SET paths = '${escaped(paths)}' WHERE pattern = '${escaped(pattern)}'`);
}

for (const pattern of toDelete) {
  const escaped = (s) => s.replace(/'/g, "''");
  statements.push(`DELETE FROM global_merchant_patterns WHERE pattern = '${escaped(pattern)}'`);
}

// Execute in a single batch
const batch = statements.join("; ");
wranglerExec(batch);

console.log(`✓ Merchant patterns synced: ${toInsert.length} inserted, ${toUpdate.length} updated, ${toDelete.length} deleted`);
