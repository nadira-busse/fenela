#!/usr/bin/env node

/**
 * cleanup-all-devices.mjs
 *
 * DEVELOPMENT / TEST maintenance utility. NOT part of the application
 * runtime and never invoked by it.
 *
 * DESTRUCTIVE: wipes ALL device registrations, subscriptions, jobs and
 * pointers from whichever KV/Redis store is configured through
 * STORAGE_KV_REST_API_URL / STORAGE_KV_REST_API_TOKEN in .env.local.
 * After running, re-open Fenéla to create a fresh device registration.
 *
 * That configured store is not guaranteed to be a disposable local
 * store — this project has no local KV emulator, so .env.local commonly
 * points at the same remote Upstash store the deployed app uses. This
 * script therefore refuses to run against any store it cannot recognize
 * as local unless explicitly overridden (see "Remote store safeguard"
 * below), and always requires typing the exact confirmation phrase.
 *
 * Run:
 *   node scripts/cleanup-all-devices.mjs
 *
 * Remote store safeguard:
 *   If the configured host is not localhost/127.0.0.1, this script exits
 *   without changing anything unless one of these is also given:
 *     node scripts/cleanup-all-devices.mjs --allow-shared-store
 *     ALLOW_SHARED_KV_CLEANUP=true node scripts/cleanup-all-devices.mjs
 */

import { createClient } from "@vercel/kv";
import { readFileSync } from "fs";
import { createInterface } from "readline";

const CONFIRMATION_PHRASE = "DELETE ALL DEVICES";

try {
  const envFile = readFileSync(".env.local", "utf-8");

  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");

    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const val = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error("Could not read .env.local");
  process.exit(1);
}

const requiredEnvVars = ["STORAGE_KV_REST_API_URL", "STORAGE_KV_REST_API_TOKEN"];

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

let kvHost;

try {
  kvHost = new URL(process.env.STORAGE_KV_REST_API_URL).hostname;
} catch {
  console.error("STORAGE_KV_REST_API_URL is not a valid URL.");
  process.exit(1);
}

// Never print the token. The hostname alone is enough for an operator to
// recognize which store is about to be wiped.
function isLikelyLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

const isLocal = isLikelyLocalHost(kvHost);
const allowSharedStore =
  process.argv.includes("--allow-shared-store") || process.env.ALLOW_SHARED_KV_CLEANUP === "true";

if (!isLocal && !allowSharedStore) {
  console.error(`\nRefusing to run: configured KV store host is "${kvHost}", not a local host.`);
  console.error(
    "This is a DESTRUCTIVE cleanup that removes ALL Fenéla reminder operational state\n" +
      "(devices, push subscriptions, jobs and pointers) from that store — which may be\n" +
      "the same shared store the deployed app uses.\n"
  );
  console.error(
    "If you really intend to wipe this store, re-run with --allow-shared-store,\n" +
      "or set ALLOW_SHARED_KV_CLEANUP=true.\n"
  );
  process.exit(1);
}

const kv = createClient({
  url: process.env.STORAGE_KV_REST_API_URL,
  token: process.env.STORAGE_KV_REST_API_TOKEN,
});

const DEVICES_SET_KEY = "push:devices:set";
const SUB_KEY = (id) => `push:sub:${id}`;
const ZSET_KEY = (id) => `push:jobs:${id}:zset`;
const JOB_KEY = (deviceId, jobId) => `push:job:${deviceId}:${jobId}`;
const DAILY_POINTER_KEY = (id) => `push:dailyStart:jobId:${id}`;

// Legacy cleanup only. Fenéla MVP1 no longer uses the primary subscription key in active reminder delivery.
const PRIMARY_SUB_KEY = "push:sub:primary";
const LEGACY_ZSET_KEY = "push:jobs:zset";
const LEGACY_JOB_KEY = (jobId) => `push:job:${jobId}`;

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Read-only: counts what's about to be deleted so the operator sees the
// real blast radius before being asked to confirm anything.
async function countTargetData(deviceIds) {
  let jobCount = 0;
  let subscriptionCount = 0;

  for (const id of deviceIds) {
    const jobIds = await kv.zrange(ZSET_KEY(id), 0, -1);
    jobCount += jobIds?.length ?? 0;

    const sub = await kv.get(SUB_KEY(id));
    if (sub?.endpoint) subscriptionCount++;
  }

  return { jobCount, subscriptionCount };
}

async function main() {
  console.log("Fenéla — cleanup-all-devices (development/test maintenance, DESTRUCTIVE)");
  console.log(
    `Target KV store host: ${kvHost}${isLocal ? " (local)" : " (NOT recognized as local)"}`
  );

  const deviceIds = (await kv.smembers(DEVICES_SET_KEY)) ?? [];
  const count = deviceIds.length;

  if (count === 0) {
    console.log("\nFound 0 devices. Nothing to clean.");
    return;
  }

  const { jobCount, subscriptionCount } = await countTargetData(deviceIds);

  console.log(`\nFound in this store:`);
  console.log(`  devices:       ${count}`);
  console.log(`  subscriptions: ${subscriptionCount}`);
  console.log(`  jobs:          ${jobCount}`);
  console.log(
    "\nThis will permanently remove ALL of the above, plus the legacy primary subscription and job data, from this store."
  );

  const answer = await ask(`\nType ${CONFIRMATION_PHRASE} to continue: `);

  if (answer !== CONFIRMATION_PHRASE) {
    console.log("Cancelled. Nothing was deleted.");
    return;
  }

  let removedJobs = 0;

  for (const id of deviceIds) {
    const jobIds = await kv.zrange(ZSET_KEY(id), 0, -1);

    for (const jobId of jobIds ?? []) {
      await kv.del(JOB_KEY(id, jobId));
      removedJobs++;
    }

    if (jobIds?.length > 0) await kv.del(ZSET_KEY(id));

    await kv.del(SUB_KEY(id));
    await kv.del(DAILY_POINTER_KEY(id));
    await kv.srem(DEVICES_SET_KEY, id);
  }

  await kv.del(PRIMARY_SUB_KEY);

  const legacyJobIds = await kv.zrange(LEGACY_ZSET_KEY, 0, -1);

  for (const jobId of legacyJobIds ?? []) {
    await kv.del(LEGACY_JOB_KEY(jobId));
    removedJobs++;
  }

  if ((legacyJobIds?.length ?? 0) > 0) {
    await kv.del(LEGACY_ZSET_KEY);
  }

  console.log(
    `\nDone. Removed ${count} device(s), ${removedJobs} job(s), primary subscription, and legacy data.`
  );

  const remaining = await kv.smembers(DEVICES_SET_KEY);
  console.log(`Devices remaining: ${remaining?.length ?? 0}\n`);
}

main().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});
