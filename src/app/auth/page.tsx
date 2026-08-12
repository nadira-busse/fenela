import Link from "next/link";
import { requireUser } from "@/server/auth/requireUser";
import { safeRedirectPath } from "@/lib/auth/safeRedirect";
import { AuthPanel } from "./AuthPanel";
import { SignOutButton } from "./SignOutButton";
import { DeleteAccountButton } from "./DeleteAccountButton";

export const dynamic = "force-dynamic";

async function getCurrentUser() {
  try {
    return await requireUser();
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

  return (
    <main className="min-h-[100dvh] w-full bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col justify-center px-6 py-12">
        <div className="rounded-[32px] border border-black/5 bg-[var(--card-bg)] p-8 shadow-[0_15px_40px_rgba(0,0,0,0.04)]">
          <h1 className="text-2xl font-bold">Sign in to Fenéla</h1>

          {error ? (
            <p role="alert" className="mt-4 text-sm leading-relaxed text-red-600">
              {errorMessage(error)}
            </p>
          ) : null}

          {user ? (
            <div className="mt-6 flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-[var(--text-soft)]">
                Signed in{user.email ? ` as ${user.email}` : ""}.
              </p>

              <SignOutButton />
              <DeleteAccountButton />
            </div>
          ) : (
            <div className="mt-5">
              <AuthPanel next={next} />
            </div>
          )}

          {/* Secondary, informational only — not a consent mechanism. Shown
              in both the sign-in and signed-in states: this page doubles as
              the app's only account/settings surface (see AccountLink in
              CoachingScreen.tsx), so one link here covers both cases. */}
          <Link
            href="/privacy"
            className="mt-6 block text-center text-xs font-medium text-[var(--text-soft)] underline underline-offset-2"
          >
            Privacy
          </Link>
        </div>
      </div>
    </main>
  );
}
