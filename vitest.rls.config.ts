import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Opt-in config for the real-database RLS integration test
// (supabase/tests/ownership.rls.test.ts). Deliberately separate from
// vitest.config.ts / `npm run test`: that suite mocks every Supabase call
// and is safe to run in CI with no external services; this one requires a
// running local Supabase stack (`npx supabase start`) and real network
// calls against it, so it must never be picked up by the default test run.
// Invoked explicitly via `npm run test:rls`.
function loadDotEnvLocal(): void {
  const path = fileURLToPath(new URL("./.env.local", import.meta.url));

  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");

    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Shell-exported env wins over .env.local, matching Next.js's own
    // precedence convention.
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnvLocal();

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["supabase/tests/**/*.rls.test.ts"],
    // Real network calls against local Supabase (Auth Admin API + PostgREST)
    // are slower than the mocked unit-test defaults.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
