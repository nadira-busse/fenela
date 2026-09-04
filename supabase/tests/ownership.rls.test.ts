// Real-database RLS integration test. Proves Postgres Row
// Level Security itself rejects cross-user access — not a mock, and not an
// app-level user_id filter standing in for the database check.
//
// Requires a running local Supabase stack with the current migrations
// applied (`npx supabase start`, then `npx supabase db reset` if migrations
// changed).
//
// For normal local development, the required Supabase values are loaded from
// .env.local. This test can also run when the same variables are provided
// directly through the environment.
//
// Not part of `npm run test` / CI — run explicitly via `npm run test:rls`.
//
// Each test user is created fresh (random email) via the Auth Admin API and
// signs in for real with a password, so `auth.uid()` is populated by an
// actual verified session JWT flowing through PostgREST — exactly the
// mechanism every RLS policy in supabase/migrations keys off. Fixture rows
// are created through user A's own authenticated client under the same
// `*_insert_own` policies production traffic uses, not the admin/service-role
// client, so setup itself doesn't bypass anything this test is trying to
// prove.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database.types";

const TEST_PASSWORD = "Rls-Test-Passw0rd-1!";

type OwnedUser = {
  id: string;
  client: SupabaseClient<Database>;
};

async function createSignedInUser(
  admin: SupabaseClient<Database>,
  label: string
): Promise<OwnedUser> {
  const email = `rls-test-${label}-${randomUUID()}@fenela.test`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    // Bypasses email-confirmation entirely, regardless of the local
    // project's auth.email.enable_confirmations setting — this test must
    // not depend on reading a confirmation email out of Inbucket/Mailpit.
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw new Error(`Failed to create test user "${label}": ${createError?.message}`);
  }

  const { url, publishableKey } = getSupabasePublicEnv();
  const client = createClient<Database>(url, publishableKey);

  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });

  if (signInError) {
    throw new Error(`Failed to sign in test user "${label}": ${signInError.message}`);
  }

  return { id: created.user.id, client };
}

describe("RLS ownership boundary (real local Postgres, no mocks)", () => {
  let admin: SupabaseClient<Database>;
  let userA: OwnedUser;
  let userB: OwnedUser;

  let goalId: string;
  let anchorId: string;

  beforeAll(async () => {
    admin = createSupabaseAdminClient();

    userA = await createSignedInUser(admin, "a");
    userB = await createSignedInUser(admin, "b");

    // Fixture setup as user A, through her own authenticated client —
    // exercises goals_insert_own / anchors_insert_own, the same policies
    // production writes go through.
    const { data: goal, error: goalError } = await userA.client
      .from("goals")
      .insert({
        // goals.user_id has no default — the app always supplies it
        // explicitly (e.g. createGoalWithAnchorsAction), and RLS's
        // goals_insert_own WITH CHECK verifies it matches auth.uid()
        // rather than deriving it. Mirrors that real write shape.
        user_id: userA.id,
        title: "RLS test goal",
        why: "Proving the ownership boundary",
        initial_struggle: "N/A",
      })
      .select("id")
      .single();

    if (goalError || !goal) {
      throw new Error(`Fixture setup failed creating goal: ${goalError?.message}`);
    }

    goalId = goal.id;

    const { data: anchor, error: anchorError } = await userA.client
      .from("anchors")
      .insert({
        goal_id: goalId,
        text: "Write one sentence",
        source: "USER",
        position: 1,
      })
      .select("id")
      .single();

    if (anchorError || !anchor) {
      throw new Error(`Fixture setup failed creating anchor: ${anchorError?.message}`);
    }

    anchorId = anchor.id;
  });

  afterAll(async () => {
    // auth.users cascade removes every row created above (goals, anchors,
    // and anything a test wrongly managed to insert) — the same mechanism
    // production account deletion relies on. Runs even if a test above
    // failed/threw, so no rls-test-*@fenela.test user is left behind.
    if (userA) {
      await admin.auth.admin.deleteUser(userA.id);
    }

    if (userB) {
      await admin.auth.admin.deleteUser(userB.id);
    }
  });

  it("direct ownership: user B cannot read user A's goal", async () => {
    const { data, error } = await userB.client.from("goals").select("*").eq("id", goalId);

    // RLS SELECT policies filter rows out silently — no error, just an
    // empty result — so absence of both an error and any row is the actual
    // "rejected" signal here.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("indirect ownership: user B cannot read user A's anchor (anchor -> goal -> user)", async () => {
    const { data, error } = await userB.client.from("anchors").select("*").eq("id", anchorId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("cross-user write rejection: user B cannot insert an action_event against user A's anchor", async () => {
    const { data, error } = await userB.client.from("action_events").insert({
      anchor_id: anchorId,
      client_event_id: `rls-test-${randomUUID()}`,
      event_type: "STARTED",
      occurred_at: new Date().toISOString(),
      local_date: new Date().toISOString().slice(0, 10),
      time_zone: "UTC",
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();

    // Belt-and-suspenders on the assertion itself: re-check through user
    // A's own client (still RLS-scoped, not admin) — ownership of
    // action_events is structural (anchor -> goal -> user_id), not tied to
    // who performed the insert, so if user B's write had wrongly slipped
    // through, it would show up here under user A's own read.
    const { data: rows } = await userA.client
      .from("action_events")
      .select("id")
      .eq("anchor_id", anchorId);

    expect(rows).toEqual([]);
  });
});
