#!/usr/bin/env node

/**
 * cleanup-devices.mjs
 *
 * Maintenance script to audit and clean stale Fenéla device registrations from Redis.
 * This removes devices without an active push subscription.
 *
 * It does not wipe active device registrations.
 *
 * Run:
 *   node scripts/cleanup-devices.mjs
 *
 * Requires STORAGE_KV_REST_API_URL and STORAGE_KV_REST_API_TOKEN in .env.local.
 */

import { createClient } from "@vercel/kv";
import { readFileSync } from "fs";
import { createInterface } from "readline";

// Parse .env.local manually. No dotenv dependency needed.
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

const url = process.env.STORAGE_KV_REST_API_URL;
const token = process.env.STORAGE_KV_REST_API_TOKEN;

if (!url || !token) {
  console.error("Missing STORAGE_KV_REST_API_URL or STORAGE_KV_REST_API_TOKEN in .env.local");
  process.exit(1);
}

const kv = createClient({ url, token });

const DEVICES_SET_KEY = "push:devices:set";
const SUB_KEY = (id) => `push:sub:${id}`;
const ZSET_KEY = (id) => `push:jobs:${id}:zset`;
const JOB_KEY = (deviceId, jobId) => `push:job:${deviceId}:${jobId}`;
const DAILY_POINTER_KEY = (id) => `push:dailyStart:jobId:${id}`;

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function audit() {
  const deviceIds = await kv.smembers(DEVICES_SET_KEY);

  if (!deviceIds || deviceIds.length === 0) {
    console.log("No devices found in push:devices:set.");
    return { active: [], stale: [] };
  }

  console.log(`\nFound ${deviceIds.length} device(s) in Redis.\n`);

  const active = [];
  const stale = [];

  for (const id of deviceIds) {
    const sub = await kv.get(SUB_KEY(id));
    const jobIds = await kv.zrange(ZSET_KEY(id), 0, -1);
    const pointer = await kv.get(DAILY_POINTER_KEY(id));

    const hasSub = !!sub?.endpoint;
    const jobCount = jobIds?.length ?? 0;

    const device = {
      id,
      hasSub,
      jobCount,
      hasPointer: !!pointer,
      pointerId: pointer,
    };

    if (hasSub) {
      active.push(device);
    } else {
      stale.push(device);
    }
  }

  console.log("─── ACTIVE (have subscription) ───");

  if (active.length === 0) {
    console.log("  (none)\n");
  } else {
    for (const d of active) {
      console.log(`  ${d.id}`);
      console.log(
        `    subscription: ✅  jobs: ${d.jobCount}  dailyPointer: ${
          d.hasPointer ? d.pointerId : "none"
        }`
      );
    }

    console.log();
  }

  console.log("─── STALE (no subscription) ───");

  if (stale.length === 0) {
    console.log("  (none)\n");
  } else {
    for (const d of stale) {
      console.log(`  ${d.id}`);
      console.log(
        `    subscription: ❌  jobs: ${d.jobCount}  dailyPointer: ${
          d.hasPointer ? d.pointerId : "none"
        }`
      );
    }

    console.log();
  }

  return { active, stale };
}

async function cleanup(staleDevices) {
  let removedJobs = 0;
  let removedDevices = 0;

  for (const device of staleDevices) {
    const jobIds = await kv.zrange(ZSET_KEY(device.id), 0, -1);

    for (const jobId of jobIds ?? []) {
      await kv.del(JOB_KEY(device.id, jobId));
      removedJobs++;
    }

    if (jobIds?.length > 0) {
      await kv.del(ZSET_KEY(device.id));
    }

    await kv.del(SUB_KEY(device.id));
    await kv.del(DAILY_POINTER_KEY(device.id));
    await kv.srem(DEVICES_SET_KEY, device.id);

    removedDevices++;
  }

  console.log(
    `Done. Removed ${removedDevices} stale device(s) and ${removedJobs} orphaned job(s).\n`
  );

  const remaining = await kv.smembers(DEVICES_SET_KEY);
  console.log(`Devices remaining in set: ${remaining?.length ?? 0}`);
}

async function main() {
  console.log("Fenéla – Device Cleanup\n");

  const { active, stale } = await audit();

  if (stale.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  console.log(`Summary: ${active.length} active, ${stale.length} stale.`);

  const answer = await ask(`\nRemove ${stale.length} stale device(s) and their data? (yes/no): `);

  if (answer === "yes" || answer === "ja") {
    await cleanup(stale);
  } else {
    console.log("Cancelled.");
  }
}

main().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});
