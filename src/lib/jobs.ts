// src/lib/jobs.ts
import { randomUUID } from "crypto";
import { getKvClient } from "@/lib/kv";

export type JobKind = "TEST" | "TASK_REMINDER" | "DAILY_START";

export type Job = {
  id: string;
  dueAt: number; // epoch ms
  kind: JobKind;
  payload: { title: string; body: string; url: string };
  attempts: number;

  // optional metadata, for example the selected daily start time
  meta?: Record<string, unknown>;
};

export const DEVICES_SET_KEY = "push:devices:set";

const JOB_KEY = (deviceId: string, id: string) => `push:job:${deviceId}:${id}`;
const ZSET_KEY = (deviceId: string) => `push:jobs:${deviceId}:zset`;

export function makeJob(input: Omit<Job, "id" | "attempts">): Job {
  return { ...input, id: randomUUID(), attempts: 0 };
}

export async function storeJobForDevice(deviceId: string, job: Job) {
  const kv = getKvClient();

  await kv.set(JOB_KEY(deviceId, job.id), job);
  await kv.zadd(ZSET_KEY(deviceId), { score: job.dueAt, member: job.id });
}

export async function getDueJobIdsForDevice(
  deviceId: string,
  nowMs: number,
  limit = 25
): Promise<string[]> {
  const kv = getKvClient();

  return await kv.zrange<string[]>(ZSET_KEY(deviceId), 0, nowMs, {
    byScore: true,
    offset: 0,
    count: limit,
  });
}

export async function getJobForDevice(deviceId: string, id: string): Promise<Job | null> {
  const kv = getKvClient();

  return await kv.get<Job>(JOB_KEY(deviceId, id));
}

export async function removeJobForDevice(deviceId: string, id: string) {
  const kv = getKvClient();

  await kv.zrem(ZSET_KEY(deviceId), id);
  await kv.del(JOB_KEY(deviceId, id));
}
