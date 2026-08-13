import Link from "next/link";
import { requireUser } from "@/server/auth/requireUser";
import { safeRedirectPath } from "@/lib/auth/safeRedirect";
import { getOwnUserPreference } from "@/server/preferences/getOwnUserPreference";
import { mapDbRowToScreeningFields } from "@/lib/userPreferenceMapping";
import { AuthPanel } from "./AuthPanel";
import { SignOutButton } from "./SignOutButton";
import { DeleteAccountButton } from "./DeleteAccountButton";
import { AiAssistanceControl } from "./AiAssistanceControl";

export const dynamic = "force-dynamic";

async function getCurrentUser() {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}

// null both when screening was never completed (nothing persisted yet to
// show/change) and on any read failure — the control simply does not
// render rather than showing a misleading default.
async function getAiAssistanceMode() {
  try {
    const row = await getOwnUserPreference();
    return row ? mapDbRowToScreeningFields(row).mode : null;
  } catch {
    return null;
  }
}

function errorMessage(code: string) {
  if (code === "missing_code") {
    return "The sign-in link was missing required information. Please try again.";
  }

  return "Sign-in could not be completed. Please try again.";
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const errorParam = resolvedSearchParams.error;
  const error = typeof errorParam === "string" ? errorParam : undefined;
  const nextParam = resolvedSearchParams.next;
  const next = safeRedirectPath(typeof nextParam === "string" ? nextParam : undefined);
  const user = await getCurrentUser();
  const aiAssistanceMode = user ? await getAiAssistanceMode() : null;

  return (
    <main className="min-h-[100dvh] w-full bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col justify-center px-6 py-12">
        <div className="rounded-[32px] border border-black/5 bg-[var(--card-bg)] p-8 shadow-[0_15px_40px_rgba(0,0,0,0.04)]">
          {user ? (
            <Link
              href="/"
              className="mb-6 block text-sm font-bold text-[var(--cta-secondary-text)]"
            >
              ← Back
            </Link>
          ) : null}

          <h1 className="text-center text-2xl font-bold">
            {user ? "Account" : "Sign in to Fenéla"}
          </h1>

          {error ? (
            <p role="alert" className="mt-4 text-sm leading-relaxed text-red-600">
              {errorMessage(error)}
            </p>
          ) : null}

          {user ? (
            <>
              {aiAssistanceMode ? (
                <div className="mt-8 border-b border-black/5 pb-6">
                  <AiAssistanceControl initialMode={aiAssistanceMode} />
                </div>
              ) : null}

              <div
                className={`flex flex-col items-center gap-3 text-center ${
                  aiAssistanceMode ? "mt-6" : "mt-8"
                }`}
              >
                <p className="text-sm leading-relaxed text-[var(--text-soft)]">
                  {user.email ?? "Signed in"}
                </p>

                <SignOutButton />
              </div>
            </>
          ) : (
            <div className="mt-5">
              <AuthPanel next={next} />
            </div>
          )}

          {user ? (
            <div className="mt-10 border-t border-black/5 pt-6">
              <div className="flex items-center justify-between">
                <Link
                  href="/privacy"
                  className="text-xs font-semibold text-[var(--text-main)] underline underline-offset-2"
                >
                  Privacy
                </Link>

                <DeleteAccountButton />
              </div>
            </div>
          ) : (
            <>
              {/* Secondary, informational only — not a consent mechanism. */}
              <Link
                href="/privacy"
                className="mt-6 block text-center text-xs font-medium text-[var(--text-soft)] underline underline-offset-2"
              >
                Privacy
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
