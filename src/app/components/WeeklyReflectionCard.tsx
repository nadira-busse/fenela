"use client";

// Minimal, calm Phase 4F presentation surface: one compact card, the
// existing deterministic generated_text, and a single Continue action.
// Deliberately has no score/streak/percentage/comparison — see
// ReflectionFacts (src/lib/reflectionAggregation.ts) and the renderer
// (src/lib/reflectionRenderer.ts), which already exclude all of that.
// Local Shell/Card/button markup mirrors CoachingScreen.tsx's existing
// visual language (not exported from there, so duplicated here rather than
// reached into).

type WeeklyReflectionCardProps = {
  text: string;
  onContinue: () => void;
};

export default function WeeklyReflectionCard({ text, onContinue }: WeeklyReflectionCardProps) {
  return (
    <div className="min-h-[100dvh] w-full bg-[var(--bg-app)] text-[var(--text-main)] font-sans">
      <div className="mx-auto w-full max-w-[420px] px-6 pt-12 pb-10">
        <h1 className="text-2xl font-bold mb-8">A look back at last week</h1>

        <div className="rounded-[32px] bg-white p-8 shadow-[0_15px_40px_rgba(0,0,0,0.04)] border border-black/5">
          <p className="text-lg leading-relaxed font-medium whitespace-pre-line mb-10">{text}</p>

          <button
            type="button"
            onClick={onContinue}
            className="w-full py-5 rounded-2xl text-base font-bold bg-[var(--cta-primary)] text-white transition-transform active:scale-95"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
