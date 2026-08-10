"use client";

// Thin wiring for the Phase 4F weekly reflection product flow. All the
// actual decision logic lives in resolveWeeklyReflectionOnReturn.ts (unit
// tested there); this component just calls it once per page load and
// swaps between the reflection card and its normal children — no
// render-level test coverage, matching this repo's existing convention
// (e.g. CoachingScreen.tsx), verified instead via manual acceptance.

import { useEffect, useRef, useState } from "react";
import { resolveWeeklyReflection } from "@/server/reflections/resolveWeeklyReflection";
import {
  resolveWeeklyReflectionOnReturn,
  type WeeklyReflectionPresentation,
} from "@/app/reflections/resolveWeeklyReflectionOnReturn";
import {
  getLastSeenWeeklyReflectionId,
  saveLastSeenWeeklyReflectionId,
} from "@/app/reflections/weeklyReflectionLocalState";
import WeeklyReflectionCard from "./WeeklyReflectionCard";

type WeeklyReflectionGateProps = {
  // True only for an authenticated user with an active Goal — false for
  // anonymous visitors and for authenticated users who have not yet
  // completed Intake (unchanged existing flow in both cases).
  enabled: boolean;
  children: React.ReactNode;
};

export default function WeeklyReflectionGate({ enabled, children }: WeeklyReflectionGateProps) {
  const [presentation, setPresentation] = useState<WeeklyReflectionPresentation | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!enabled || attempted.current) return;
    attempted.current = true;

    resolveWeeklyReflectionOnReturn({
      enabled,
      resolveWeeklyReflection,
      getLastSeenId: getLastSeenWeeklyReflectionId,
    }).then(setPresentation);
  }, [enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  if (presentation === null) {
    // Resolving — brief, same convention as HomeClient's existing
    // `if (!hydrated) return null` hydration guard.
    return null;
  }

  if (presentation.show) {
    return (
      <WeeklyReflectionCard
        text={presentation.reflection.generatedText}
        onContinue={() => {
          saveLastSeenWeeklyReflectionId(presentation.reflection.id);
          setPresentation({ show: false });
        }}
      />
    );
  }

  return <>{children}</>;
}
