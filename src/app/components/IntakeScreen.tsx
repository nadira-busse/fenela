"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { saveCareAnchors } from "@/lib/storage";
import { AnchorValidationError, validateSafeAnchorText, validateSafeUserText } from "@/lib/safety";
import { CareAnchor } from "@/types/CareAnchor";
import { PersonalAnchorInterpretation } from "@/types/intake";
import { makeId } from "@/lib/id";
import { AnchorChoiceHelp, loadScreening, ScreeningV1 } from "@/lib/screeningStorage";
import { getOrCreateDeviceId } from "@/lib/device";

/** CONFIG */
const MIN_ANCHORS = 1;
const MAX_ANCHORS = 5;

// --- UI COMPONENTS ---
const Screen = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-[100dvh] w-full bg-[var(--bg-app)] text-[var(--text-main)]">
    <div className="mx-auto w-full max-w-[420px] px-4 pt-8 pb-10">{children}</div>
  </div>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-3xl bg-[var(--card-bg)] border border-black/5 shadow-[0_12px_30px_rgba(0,0,0,0.08)] p-5">
    {children}
  </div>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-4 text-base text-black/80 outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
  />
);

const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-4 text-base text-black/80 outline-none resize-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
  />
);

const PrimaryBtn = ({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full py-4 rounded-2xl text-base font-semibold transition active:scale-[0.99] bg-[var(--cta-primary)] text-[var(--cta-primary-text)] shadow-[0_10px_20px_rgba(0,0,0,0.10)] disabled:opacity-40"
  >
    {children}
  </button>
);

const SecondaryBtn = ({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full py-4 rounded-2xl text-base font-semibold transition active:scale-[0.99] bg-[var(--cta-secondary)] text-[var(--cta-secondary-text)] border border-black/10 disabled:opacity-40"
  >
    {children}
  </button>
);

type AnchorGenerationResult = {
  anchors: string[];
  personalAnchorInterpretation: PersonalAnchorInterpretation;
};

type AnchorsApiResponse = {
  ok?: boolean;
  error?: string;
  anchors?: { text?: string }[];
  personalAnchorInterpretation?: PersonalAnchorInterpretation;
};

function isPersonalAnchorInterpretation(value: unknown): value is PersonalAnchorInterpretation {
  const data = value as Partial<PersonalAnchorInterpretation>;

  return (
    typeof data?.directionLine === "string" &&
    typeof data?.whyLine === "string" &&
    typeof data?.frictionLine === "string" &&
    typeof data?.returnLine === "string"
  );
}

function buildLocalFallbackInterpretation(input: {
  goal: string;
  struggle: string;
  goalWhy: string;
}): PersonalAnchorInterpretation {
  const goal = input.goal.trim();
  const struggle = input.struggle.trim();
  const goalWhy = input.goalWhy?.trim();

  return {
    directionLine: goal ? `You want to return to ${goal}` : "You want to return to what matters",
    whyLine: goalWhy || "This matters because you chose it before the day got heavy",
    frictionLine: struggle
      ? `${struggle} may make the step smaller, not impossible`
      : "Friction may make the step smaller, not impossible",
    returnLine: "One small step is enough for today",
  };
}

// --- AI CLIENT ---
async function generateAnchorsClient(payload: {
  mode: AnchorChoiceHelp;
  deviceId?: string;
  intake: { name: string; goal: string; struggle: string; goalWhy: string };
  screening?: ScreeningV1 | null;
}): Promise<AnchorGenerationResult> {
  const res = await fetch("/api/ai/anchors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => null)) as AnchorsApiResponse | null;

  if (!res.ok) {
    const msg = data?.error ?? `POST /api/ai/anchors failed (${res.status})`;
    throw new Error(msg);
  }

  const anchorsRaw = Array.isArray(data?.anchors) ? data.anchors : null;

  if (!anchorsRaw) {
    throw new Error(
      "API /api/ai/anchors returned no anchors[]. Expected { anchors: {text:string}[] }"
    );
  }

  const anchors = anchorsRaw
    .map((item) => String(item?.text ?? ""))
    .map((text) => text.trim())
    .filter((text) => text.length > 0);

  const personalAnchorInterpretation = isPersonalAnchorInterpretation(
    data?.personalAnchorInterpretation
  )
    ? data.personalAnchorInterpretation
    : buildLocalFallbackInterpretation(payload.intake);

  return {
    anchors,
    personalAnchorInterpretation,
  };
}

// --- MAIN ---
interface IntakeScreenProps {
  onComplete: (data: {
    name: string;
    goal: string;
    struggle: string;
    goalWhy: string;
    personalAnchorInterpretation?: PersonalAnchorInterpretation;
  }) => void;
  initialName?: string;
  skipNameStep?: boolean;
}

const IntakeScreen = ({ onComplete, initialName = "" }: IntakeScreenProps) => {
  const [step, setStep] = useState(0);

  const [screening, setScreening] = useState<ScreeningV1 | null>(null);
  const [name, setName] = useState(initialName);

  const [goal, setGoal] = useState("");
  const [struggle, setStruggle] = useState("");
  const [goalWhy, setGoalWhy] = useState("");
  const [personalAnchorInterpretation, setPersonalAnchorInterpretation] =
    useState<PersonalAnchorInterpretation | null>(null);

  const [anchors, setAnchors] = useState<CareAnchor[]>([{ id: makeId("anchor"), text: "" }]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const didGenerateRef = useRef(false);

  useEffect(() => {
    const storedScreening = loadScreening();
    // Intentional: localStorage is only readable after mount, so screening
    // state is deliberately set post-hydration (not derivable during render)
    // to avoid a server/client hydration mismatch.

    setScreening(storedScreening);

    if (storedScreening?.name) {
      setName(storedScreening.name);
    }
  }, []);

  const questions = [
    {
      id: "intake-goal",
      label: name.trim()
        ? `${name.trim()}, what’s one thing you want to do consistently?`
        : "What’s one thing you want to do consistently?",
      helper: "Keep it small and realistic.",
      placeholder: "e.g. Walk 10 minutes after lunch",
      type: "textarea",
    },
    {
      id: "intake-struggle",
      label: "What usually gets in the way?",
      helper: "One honest sentence is enough.",
      placeholder: "e.g. stress, overwhelm, low energy",
      type: "textarea",
    },
    {
      id: "intake-goal-why",
      label: "Why does this matter to you?",
      helper: "One short sentence helps Fenéla suggest better anchors.",
      placeholder: "e.g. I want more steady energy for my days.",
      type: "textarea",
    },
    {
      id: "intake-anchors",
      label: "Your daily care anchors",
      helper: "I made a small starting point. You can edit anything.",
      placeholder: "e.g. Drink a glass of water",
      type: "anchors",
    },
  ] as const;

  const totalSteps = questions.length;
  const lastStep = totalSteps - 1;

  const current = questions[step];
  const isAnchorsStep = current.type === "anchors";

  const choiceMode = screening?.mode ?? "SUGGEST_ANCHORS";
  const userDecidesAnchors = choiceMode === "I_DECIDE";

  const goalValidation = useMemo(() => validateSafeUserText(goal), [goal]);
  const struggleValidation = useMemo(() => validateSafeUserText(struggle), [struggle]);
  const goalWhyValidation = useMemo(() => validateSafeUserText(goalWhy), [goalWhy]);

  const goalValid = goalValidation.ok;
  const struggleValid = struggleValidation.ok;
  const goalWhyValid = goalWhyValidation.ok;

  const cleanedAnchors = useMemo(() => {
    return anchors
      .map((anchor) => ({ ...anchor, text: anchor.text.trim() }))
      .filter((anchor) => anchor.text.length > 0)
      .slice(0, MAX_ANCHORS);
  }, [anchors]);

  const anchorValidationById = useMemo(() => {
    return new Map(
      anchors.map((anchor) => [
        anchor.id,
        anchor.text.trim().length > 0 ? validateSafeAnchorText(anchor.text) : { ok: true as const },
      ])
    );
  }, [anchors]);

  const cleanedAnchorsAreSafe = cleanedAnchors.every(
    (anchor) => validateSafeAnchorText(anchor.text).ok
  );

  const anchorsValid =
    cleanedAnchors.length >= MIN_ANCHORS &&
    cleanedAnchors.length <= MAX_ANCHORS &&
    cleanedAnchorsAreSafe;

  const canContinue = useMemo(() => {
    if (step === 0) return goalValid;
    if (step === 1) return struggleValid;
    if (step === 2) return goalWhyValid;
    if (step === lastStep) return anchorsValid;
    return false;
  }, [step, goalValid, struggleValid, goalWhyValid, anchorsValid, lastStep]);

  const updateAnchor = (id: string, text: string) => {
    setFormError(null);
    setAnchors((prev) => prev.map((anchor) => (anchor.id === id ? { ...anchor, text } : anchor)));
  };

  const addAnchor = () => {
    setAnchors((prev) =>
      prev.length >= MAX_ANCHORS ? prev : [...prev, { id: makeId("anchor"), text: "" }]
    );
  };

  const removeAnchor = (id: string) => {
    setAnchors((prev) =>
      prev.length <= MIN_ANCHORS ? prev : prev.filter((anchor) => anchor.id !== id)
    );
  };

  const runAIGeneration = async () => {
    const hasManual = anchors.some((anchor) => anchor.text.trim().length > 0);
    if (hasManual && didGenerateRef.current) return;

    setAiLoading(true);
    setAiError(null);
    setFormError(null);

    try {
      const storedScreening = screening ?? loadScreening();
      const mode: AnchorChoiceHelp = storedScreening?.mode ?? "SUGGEST_ANCHORS";
      const userName = storedScreening?.name || name.trim() || "Friend";

      if (mode === "I_DECIDE") {
        setPersonalAnchorInterpretation(
          buildLocalFallbackInterpretation({
            goal,
            struggle,
            goalWhy,
          })
        );

        setAnchors([{ id: makeId("anchor"), text: "" }]);

        didGenerateRef.current = true;
        return;
      }

      const desiredCount = MAX_ANCHORS;
      const trimmedGoalWhy = goalWhy.trim();

      const generated = await generateAnchorsClient({
        mode,
        deviceId: typeof window !== "undefined" ? getOrCreateDeviceId() : undefined,
        intake: {
          name: userName,
          goal: goal.trim(),
          struggle: struggle.trim(),
          goalWhy: trimmedGoalWhy,
        },
        screening: storedScreening,
      });

      const trimmed = generated.anchors.slice(0, desiredCount);

      const nextAnchors: CareAnchor[] = trimmed.map((text) => ({
        id: makeId("anchor"),
        text,
      }));

      setAnchors(nextAnchors);
      setPersonalAnchorInterpretation(generated.personalAnchorInterpretation);
      didGenerateRef.current = true;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not generate anchors. You can type them yourself.";

      setAiError(message);
      setPersonalAnchorInterpretation(
        buildLocalFallbackInterpretation({
          goal,
          struggle,
          goalWhy,
        })
      );
      setAnchors([]);
      didGenerateRef.current = true;
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (!isAnchorsStep) return;
    if (didGenerateRef.current) return;

    const hasManual = anchors.some((anchor) => anchor.text.trim().length > 0);
    if (hasManual) {
      didGenerateRef.current = true;
      return;
    }

    // Intentional: kicks off the async AI-generation call (which itself sets
    // a loading flag) once this step becomes active; not derivable during
    // render since it triggers a network request.

    runAIGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnchorsStep]);

  const handleNext = () => {
    setFormError(null);

    if (!canContinue) return;

    if (step >= lastStep) {
      if (!anchorsValid) return;

      try {
        saveCareAnchors(cleanedAnchors);
      } catch (error: unknown) {
        if (error instanceof AnchorValidationError) {
          setFormError(error.message);
          return;
        }

        throw error;
      }

      const trimmedGoalWhy = goalWhy.trim();

      onComplete({
        name: name.trim() || screening?.name || "Friend",
        goal: goal.trim(),
        struggle: struggle.trim(),
        goalWhy: trimmedGoalWhy,
        personalAnchorInterpretation:
          personalAnchorInterpretation ??
          buildLocalFallbackInterpretation({
            goal,
            struggle,
            goalWhy,
          }),
      });

      return;
    }

    setStep((currentStep) => Math.min(currentStep + 1, lastStep));
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isAnchorsStep) return;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleNext();
    }
  };

  return (
    <Screen>
      <div className="mb-5">
        <div className="flex items-center gap-2" aria-hidden="true">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                index <= step ? "bg-black/50" : "bg-black/10"
              }`}
            />
          ))}
        </div>
        <div className="mt-2 text-xs text-black/45">
          Step {step + 1} of {totalSteps}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div className="space-y-1">
            {isAnchorsStep ? (
              <h1 className="text-2xl font-semibold leading-tight">{current.label}</h1>
            ) : (
              <label htmlFor={current.id} className="block text-2xl font-semibold leading-tight">
                {current.label}
              </label>
            )}

            {current.helper && (
              <p id={`${current.id}-helper`} className="text-sm text-black/60 leading-snug">
                {current.helper}
              </p>
            )}
          </div>

          <Card>
            {step === 0 && (
              <div className="space-y-3">
                <Textarea
                  id="intake-goal"
                  name="intake-goal"
                  value={goal}
                  onChange={(event) => {
                    setFormError(null);
                    setGoal(event.target.value);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={current.placeholder}
                  aria-describedby="intake-goal-helper"
                  autoFocus
                  rows={4}
                />

                {goal.trim().length > 0 && !goalValidation.ok && (
                  <p className="text-sm text-black/55 leading-snug">{goalValidation.message}</p>
                )}

                <PrimaryBtn onClick={handleNext} disabled={!canContinue}>
                  Continue
                </PrimaryBtn>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <Textarea
                  id="intake-struggle"
                  name="intake-struggle"
                  value={struggle}
                  onChange={(event) => {
                    setFormError(null);
                    setStruggle(event.target.value);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={current.placeholder}
                  aria-describedby="intake-struggle-helper"
                  autoFocus
                  rows={4}
                />

                {struggle.trim().length > 0 && !struggleValidation.ok && (
                  <p className="text-sm text-black/55 leading-snug">{struggleValidation.message}</p>
                )}

                <PrimaryBtn onClick={handleNext} disabled={!canContinue}>
                  Continue
                </PrimaryBtn>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <Textarea
                  id="intake-goal-why"
                  name="intake-goal-why"
                  value={goalWhy}
                  onChange={(event) => {
                    setFormError(null);
                    setGoalWhy(event.target.value);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={questions[2].placeholder}
                  aria-describedby="intake-goal-why-helper"
                  autoFocus
                  rows={4}
                />

                {goalWhy.trim().length > 0 && !goalWhyValidation.ok && (
                  <p className="text-sm text-black/55 leading-snug">{goalWhyValidation.message}</p>
                )}

                <PrimaryBtn onClick={handleNext} disabled={!canContinue}>
                  Continue
                </PrimaryBtn>
              </div>
            )}

            {step === lastStep && (
              <div className="space-y-4">
                {aiLoading && (
                  <div className="rounded-2xl border border-black/10 bg-white/50 px-4 py-3 text-sm text-black/70">
                    Setting things up for you…
                  </div>
                )}

                {aiError && (
                  <div className="rounded-2xl border border-black/10 bg-white/50 px-4 py-3 text-sm text-black/70">
                    {aiError}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-black/70">Anchors (edit anything)</div>

                  {!userDecidesAnchors && (
                    <button
                      type="button"
                      onClick={() => {
                        didGenerateRef.current = false;
                        setPersonalAnchorInterpretation(null);
                        setAnchors([{ id: makeId("anchor"), text: "" }]);
                        runAIGeneration();
                      }}
                      disabled={aiLoading}
                      className="text-xs font-semibold text-black/60 underline disabled:opacity-40"
                    >
                      Regenerate
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {anchors.map((anchor, index) => {
                    const anchorInputId = `care-anchor-${anchor.id}`;
                    const anchorValidation = anchorValidationById.get(anchor.id);

                    return (
                      <div key={anchor.id} className="space-y-1">
                        <div className="flex gap-2">
                          <label htmlFor={anchorInputId} className="sr-only">
                            Care anchor {index + 1}
                          </label>

                          <Input
                            id={anchorInputId}
                            name="care-anchor"
                            value={anchor.text}
                            onChange={(event) => updateAnchor(anchor.id, event.target.value)}
                            placeholder={`Care anchor ${index + 1}`}
                            aria-invalid={
                              anchor.text.trim().length > 0 && anchorValidation?.ok === false
                            }
                          />

                          <button
                            type="button"
                            onClick={() => removeAnchor(anchor.id)}
                            disabled={anchors.length <= MIN_ANCHORS}
                            aria-label={`Remove care anchor ${index + 1}`}
                            className="shrink-0 w-12 rounded-2xl border border-black/10 bg-white/60 disabled:opacity-30"
                          >
                            ✕
                          </button>
                        </div>

                        {anchor.text.trim().length > 0 && anchorValidation?.ok === false && (
                          <p className="text-sm text-black/55 leading-snug">
                            {anchorValidation.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={addAnchor}
                  disabled={anchors.length >= MAX_ANCHORS}
                  className="text-sm font-semibold text-black/70 disabled:opacity-30"
                >
                  + Add another
                </button>

                {formError && (
                  <div className="rounded-2xl border border-black/10 bg-white/50 px-4 py-3 text-sm text-black/70">
                    {formError}
                  </div>
                )}

                <PrimaryBtn onClick={handleNext} disabled={!canContinue || aiLoading}>
                  Begin
                </PrimaryBtn>
              </div>
            )}

            {step > 0 && (
              <div className="pt-3">
                <SecondaryBtn
                  onClick={() => {
                    setStep((currentStep) => Math.max(0, currentStep - 1));
                  }}
                >
                  Back
                </SecondaryBtn>
              </div>
            )}
          </Card>
        </motion.div>
      </AnimatePresence>
    </Screen>
  );
};

export default IntakeScreen;
