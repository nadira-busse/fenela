"use server";

// Public-facing, client-callable Server Action boundary for permanent
// account deletion (Phase 4G). Accepts NO input at all — user identity
// comes exclusively from requireUser(), never from a caller-supplied
// user_id/email/device id. A confirmation UI step exists purely as a UX
// safeguard (src/app/auth/DeleteAccountButton.tsx); it is never sent here
// as authorization.
//
// Unauthenticated and Auth-verification-failure both fail closed: neither
// case reaches deleteAccountForUser, so nothing is enumerated, cleaned up,
// or deleted. A genuine AuthVerificationError (Auth service itself
// unreachable/broken, as opposed to "no session") is deliberately NOT
// caught here — see requireUser()'s own header — it must propagate rather
// than be treated as a normal, retryable "please sign in again" failure.

import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { deleteAccountForUser } from "@/server/account/deleteAccountForUser";

export type DeleteOwnAccountResult =
  | { ok: true }
  | { ok: false; error: "UNAUTHENTICATED" | "DELETION_FAILED"; message: string };

const UNAUTHENTICATED_MESSAGE = "Your session expired. Please sign in again.";
const DELETION_FAILED_MESSAGE = "Could not delete your account right now. Please try again.";

export async function deleteOwnAccountAction(): Promise<DeleteOwnAccountResult> {
  let user;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, error: "UNAUTHENTICATED", message: UNAUTHENTICATED_MESSAGE };
    }

    throw error;
  }

  const result = await deleteAccountForUser(user.id);

  if (!result.ok) {
    return { ok: false, error: "DELETION_FAILED", message: DELETION_FAILED_MESSAGE };
  }

  return { ok: true };
}
