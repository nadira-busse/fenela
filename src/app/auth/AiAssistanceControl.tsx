"use client";

import { useState } from "react";
import type { AnchorChoiceHelp } from "@/lib/screeningStorage";
import { updateAiAssistanceAction } from "@/server/preferences/updateAiAssistanceAction";

// Exact required copy, plus the On/Off derivation, exported so both are
// unit-testable without a DOM renderer (this repo has no RTL/jsdom
// dependency) — the same reasoning as e.g. getInitialReminderStatus in
// CoachingScreen.tsx.
export const AI_SUGGESTIONS_LABEL = "AI suggestions";

export function isAiAssistanceEnabled(mode: AnchorChoiceHelp): boolean {
  return mode === "SUGGEST_ANCHORS";
}

type Props = {
  initialMode: AnchorChoiceHelp;
};

export function AiAssistanceControl({ initialMode }: Props) {
  const [mode, setMode] = useState<AnchorChoiceHelp>(initialMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = isAiAssistanceEnabled(mode);

  const handleToggle = async () => {
    if (pending) return;

    const nextMode: AnchorChoiceHelp = enabled ? "I_DECIDE" : "SUGGEST_ANCHORS";

    setPending(true);
    setError(null);

    const result = await updateAiAssistanceAction(nextMode);

    if (result.ok) {
      setMode(nextMode);
    } else {
      setError(result.message);
    }

    setPending(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span id="ai-suggestions-label" className="text-sm font-semibold text-[var(--text-muted)]">
          {AI_SUGGESTIONS_LABEL}
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="ai-suggestions-label"
          onClick={handleToggle}
          disabled={pending}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            enabled ? "bg-[var(--cta-primary)]" : "bg-[var(--cta-secondary)]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
