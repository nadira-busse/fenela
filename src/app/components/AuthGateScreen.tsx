// Shown to an unauthenticated visitor who is about to start screening for
// the first time (Phase 4A). Gives brief orientation before asking for
// authentication — screening now persists to an authenticated account, so
// it must not start before identity is established (AGENTS.md §8).
//
// Not a new onboarding wizard: same product explanation ScreeningScreen
// already showed, just placed before account creation instead of after.

type Props = { nextPath: string };

export default function AuthGateScreen({ nextPath }: Props) {
  return (
    <div className="min-h-[100dvh] w-full bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="mx-auto w-full max-w-[420px] px-4 pt-8 pb-10">
        <h1 className="text-xl font-semibold">Let’s set up Fenéla.</h1>

        <p className="mt-2 text-sm opacity-80">
          Fenéla helps you turn one goal into small, concrete steps (&quot;anchors&quot;) and
          focuses on one at a time.
        </p>
        <p className="mt-2 text-sm opacity-80">
          Your preferences are saved to your account, so Fenéla remembers them the next time you
          return.
        </p>

        <a
          href={`/auth?next=${encodeURIComponent(nextPath)}`}
          className="mt-6 block w-full rounded-2xl bg-white/10 px-4 py-3 text-center font-medium"
        >
          Continue
        </a>
      </div>
    </div>
  );
}
