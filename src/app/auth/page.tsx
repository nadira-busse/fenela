import { requireUser } from "@/server/auth/requireUser";
import { safeRedirectPath } from "@/lib/auth/safeRedirect";
import { AuthPanel } from "./AuthPanel";
import { SignOutButton } from "./SignOutButton";

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
    <main className="flex min-h-[100dvh] flex-col justify-center gap-6 py-10">
      <h1 className="text-xl font-semibold text-[var(--text-main)]">Sign in</h1>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage(error)}
        </p>
      ) : null}

      {user ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--text-main)]">
            Signed in{user.email ? ` as ${user.email}` : ""}.
          </p>
          <SignOutButton />
        </div>
      ) : (
        <AuthPanel next={next} />
      )}
    </main>
  );
}
