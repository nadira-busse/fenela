// Shown to an unauthenticated visitor who is about to start screening for
// the first time (Phase 4A). Gives brief orientation before asking for
// authentication — screening now persists to an authenticated account, so
// it must not start before identity is established (AGENTS.md §8).
//
// Not a new onboarding wizard: same product explanation ScreeningScreen
// already showed, just placed before account creation instead of after.
//
// Visual language matches the rest of the app rather than a plain text
// block: the rounded card, primary-CTA green and spacing scale here are
// the same tokens/utilities CoachingScreen's Card/ActionBtn already use
// (--cta-primary, --text-soft, --badge-bg, rounded-[32px]/rounded-2xl),
// so this is the first thing a new visitor sees and it already looks like
// Fenéla rather than a generic form.

type Props = { nextPath: string };

export default function AuthGateScreen({ nextPath }: Props) {
  return (
    <div className="min-h-[100dvh] w-full bg-[var(--bg-app)] text-[var(--text-main)] font-sans">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col justify-center px-6 py-12">
        <div className="rounded-[32px] border border-black/5 bg-[var(--card-bg)] p-8 shadow-[0_15px_40px_rgba(0,0,0,0.04)]">
          <h1 className="text-2xl font-bold">Welcome to Fenéla</h1>

          <p className="mt-5 text-sm leading-relaxed text-[var(--text-soft)]">
            Fenéla helps you turn one goal into small, concrete steps.
          </p>

          <p className="mt-4 text-sm leading-relaxed text-[var(--text-soft)]">
            Let’s set your preferences so Fenéla can support you consistently.
          </p>

          <a
            href={`/auth?next=${encodeURIComponent(nextPath)}`}
            className="mt-8 block w-full rounded-2xl bg-[var(--cta-primary)] py-5 text-center text-base font-bold text-[var(--cta-primary-text)] transition-transform active:scale-95"
          >
            Continue
          </a>
        </div>
      </div>
    </div>
  );
}
