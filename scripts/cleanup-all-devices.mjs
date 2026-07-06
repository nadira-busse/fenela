#!/usr/bin/env node

/**
 * cleanup-all-devices.mjs
 *
 * Destructive maintenance script for development and reset scenarios.
 *
 * Wipes ALL device registrations, subscriptions, jobs and pointers from Redis.
 * After running, re-open Fenéla to create a fresh device registration.
 *
 * Run:
 *   node scripts/cleanup-all-devices.mjs
 */

import { createClient } from "@vercel/kv";
import { readFileSync } from "fs";
import { createInterface } from "readline";

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
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  const deviceIds = await kv.smembers(DEVICES_SET_KEY);
  const count = deviceIds?.length ?? 0;

  console.log(`\nFound ${count} device(s) in Redis.\n`);

  if (count === 0) {
    console.log("Nothing to clean.");
    return;
  }

  const answer = await ask(`Wipe ALL ${count} devices + primary subscription? (yes/no): `);

  if (answer !== "yes" && answer !== "ja") {
    console.log("Cancelled.");
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
