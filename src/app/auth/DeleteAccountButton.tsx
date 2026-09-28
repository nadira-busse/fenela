"use client";

import { useState } from "react";
import { clearLocalStateForSignOut } from "@/lib/localOwner";
import { deleteOwnAccountAction } from "@/server/account/deleteOwnAccountAction";
import { performAccountDeletion } from "./deleteAccountOrchestration";

// Reuses the same server-side signOut() boundary as SignOutButton
// (src/app/auth/signout/route.ts) — the supported Supabase SSR mechanism
// for actually clearing the session cookies, rather than guessing cookie
// names client-side. The redirect this route responds with is irrelevant
// here (this component owns its own navigation via leaveToAuth) and is
// simply followed and discarded.
//
// Explicitly requests "global" scope — unlike ordinary sign-out (which must
// only end the current device's session, see the route's own header), a
// deleted account has no legitimate remaining session anywhere, on any
// device. This must never be weakened to ordinary sign-out's "local"
// default just because the two flows share the same route.
async function clearSupabaseSession() {
  await fetch("/auth/signout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "global" }),
  });
}

async function unsubscribeBrowserPush() {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}

function leaveToAuth() {
  window.location.href = "/auth";
}

type Stage = "idle" | "confirming" | "pending";

export function DeleteAccountButton() {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (stage === "pending") return;

    setStage("pending");
    setError(null);

    const result = await performAccountDeletion({
      deleteAccount: async () => {
        const actionResult = await deleteOwnAccountAction();
        return actionResult.ok ? { ok: true } : { ok: false, message: actionResult.message };
      },
      clearSupabaseSession,
      unsubscribeBrowserPush,
      clearLocalState: clearLocalStateForSignOut,
      leaveToAuth,
    });

    if (!result.ok) {
      // Never navigate away on failure — the account still exists, and the
      // user must be able to see the error and retry.
      setError(result.message);
      setStage("confirming");
    }
  };

  if (stage === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStage("confirming")}
        className="text-left text-sm font-medium text-red-600"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-red-600/30 p-4">
      <p className="text-sm text-[var(--text-main)]">
        This permanently deletes your Fenéla account and the data stored with it. This cannot be
        undone.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            setStage("idle");
            setError(null);
          }}
          disabled={stage === "pending"}
          className="rounded-lg border border-[var(--text-main)]/20 px-4 py-3 text-sm font-medium text-[var(--text-main)] disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={stage === "pending"}
          className="rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {stage === "pending" ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  );
}
