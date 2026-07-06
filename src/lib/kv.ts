// src/lib/kv.ts

import { createClient } from "@vercel/kv";
import { requireEnv } from "@/lib/env";

export type KvClient = ReturnType<typeof createClient>;

let kvClient: KvClient | null = null;

export function getKvClient(): KvClient {
  if (!kvClient) {
    kvClient = createClient({
      url: requireEnv("STORAGE_KV_REST_API_URL"),
      token: requireEnv("STORAGE_KV_REST_API_TOKEN"),
    });
  }

  return kvClient;
}

export function getOptionalKvClient(): KvClient | null {
  const url = process.env.STORAGE_KV_REST_API_URL?.trim();
  const token = process.env.STORAGE_KV_REST_API_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return createClient({ url, token });
}
