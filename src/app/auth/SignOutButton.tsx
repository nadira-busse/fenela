"use client";

import { useState } from "react";
import { getDeviceId } from "@/lib/device";
import { clearLocalStateForSignOut } from "@/lib/localOwner";
import { performSignOut } from "./signOutOrchestration";

async function cleanupServerPushState(deviceId: string) {
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
}

async function unsubscribeBrowserPush() {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}

async function finalSignOut() {
  try {
    await fetch("/auth/signout", { method: "POST" });
  } finally {
    // Unconditional navigation (Phase 4D final hardening §9): even if the
    // request itself failed (e.g. a network error), the user must not be
    // left stuck on this page — they land on /auth either way and can
    // retry if the session somehow wasn't actually cleared server-side.
    window.location.href = "/auth";
  }
}

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  const handleSignOut = async () => {
    if (pending) return;
    setPending(true);

    await performSignOut({
      getDeviceId,
      cleanupServerPushState,
      unsubscribeBrowserPush,
      clearLocalState: clearLocalStateForSignOut,
      signOut: finalSignOut,
    });
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      className="rounded-lg border border-[var(--text-main)]/20 px-4 py-3 text-sm font-medium text-[var(--text-main)] disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
