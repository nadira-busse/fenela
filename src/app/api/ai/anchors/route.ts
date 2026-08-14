import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

import {
  anchorCount,
  buildErrorAnchors,
  buildFallbackInterpretation,
  buildPrompt,
  buildRepairPrompt,
  isValidMode,
  safeParseAIResponse,
  sanitizeAndDedupeAnchors,
  sanitizeInterpretation,
  validateAnchors,
  type AIResponse,
  type AnchorsRequest,
} from "@/lib/aiAnchors";
import { validateSafeAnchorList, validateSafeUserText } from "@/lib/safety";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  requireUser,
  UnauthenticatedError,
  type AuthenticatedUser,
} from "@/server/auth/requireUser";

export const runtime = "nodejs";

type ErrorCode = "BAD_REQUEST" | "UNSAFE_INPUT" | "UNAUTHENTICATED" | "AI_GENERATION_FAILED";

function jsonError(message: string, code: ErrorCode, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Rate limiting below bounds the number of OpenAI calls per hour, but not
// the token size of any single call. These limits close that gap so one
// allowed request cannot still send an unbounded amount of text.
const MAX_INTAKE_LENGTH = 500;
const MAX_NAME_LENGTH = 100;

function hasBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function validateRequestBody(body: unknown): AnchorsRequest | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const candidate = body as Partial<AnchorsRequest>;

  if (!isValidMode(candidate.mode)) {
    return null;
  }

  if (!candidate.intake || typeof candidate.intake !== "object") {
    return null;
  }

  if (
    !hasBoundedText(candidate.intake.goal, MAX_INTAKE_LENGTH) ||
    !hasBoundedText(candidate.intake.struggle, MAX_INTAKE_LENGTH) ||
    !hasBoundedText(candidate.intake.goalWhy, MAX_INTAKE_LENGTH)
  ) {
    return null;
  }

  return {
    mode: candidate.mode,
    deviceId: hasText(candidate.deviceId) ? candidate.deviceId : undefined,
    intake: {
      name: hasBoundedText(candidate.intake.name, MAX_NAME_LENGTH)
        ? candidate.intake.name.trim()
        : undefined,
      goal: candidate.intake.goal.trim(),
      struggle: candidate.intake.struggle.trim(),
      goalWhy: candidate.intake.goalWhy.trim(),
    },
    screening: candidate.screening ?? null,
  };
}

function validateUserInput(body: AnchorsRequest) {
  const valuesToValidate = [body.intake.goal, body.intake.struggle, body.intake.goalWhy];

  for (const value of valuesToValidate) {
    if (typeof value !== "string" || value.trim().length === 0) {
      continue;
    }

    const result = validateSafeUserText(value);

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true as const };
}

async function generateOpenAIResponse(input: {
  client: OpenAI;
  prompt: string;
  temperature?: number;
}) {
  const completion = await input.client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: input.temperature ?? 0.7,
    messages: [
      {
        role: "system",
        content:
          "You return only compact, valid JSON for a bounded accountability app. You never provide therapy, diagnosis, crisis advice or harmful instructions.",
      },
      {
        role: "user",
        content: input.prompt,
      },
    ],
  });

  return completion.choices[0]?.message?.content ?? "";
}

async function generateAndValidate(input: { client: OpenAI; body: AnchorsRequest; count: number }) {
  const raw = await generateOpenAIResponse({
    client: input.client,
    prompt: buildPrompt(input.body, input.count),
  });

  const parsed = safeParseAIResponse(raw);
  const anchors = sanitizeAndDedupeAnchors(parsed?.anchors);
  const validation = validateAnchors(anchors, input.count);
  const safetyValidation = validateSafeAnchorList(anchors.map((anchor) => anchor.text));

  if (parsed && validation.ok && safetyValidation.ok) {
    return {
      parsed,
      anchors,
    };
  }

  const repairRaw = await generateOpenAIResponse({
    client: input.client,
    prompt: buildRepairPrompt({
      body: input.body,
      count: input.count,
      previousRaw: raw,
      validationErrors: [
        ...(parsed ? validation.errors : ["Response was not valid JSON."]),
        ...(!safetyValidation.ok ? [safetyValidation.message] : []),
      ],
    }),
    temperature: 0.2,
  });

  const repairParsed = safeParseAIResponse(repairRaw);
  const repairAnchors = sanitizeAndDedupeAnchors(repairParsed?.anchors);
  const repairValidation = validateAnchors(repairAnchors, input.count);
  const repairSafetyValidation = validateSafeAnchorList(repairAnchors.map((anchor) => anchor.text));

  if (repairParsed && repairValidation.ok && repairSafetyValidation.ok) {
    return {
      parsed: repairParsed,
      anchors: repairAnchors,
    };
  }

  return null;
}

function buildFallbackResponse(body: AnchorsRequest, count: number) {
  return {
    personalAnchorInterpretation: buildFallbackInterpretation(body),
    anchors: buildErrorAnchors(body, count),
    source: "fallback" as const,
  };
}

function buildSuccessResponse(
  body: AnchorsRequest,
  parsed: AIResponse,
  anchors: { text: string }[]
) {
  return {
    personalAnchorInterpretation: sanitizeInterpretation(parsed.personalAnchorInterpretation, body),
    anchors,
    source: "ai" as const,
  };
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return jsonError("Invalid JSON body.", "BAD_REQUEST", 400);
  }

  const body = validateRequestBody(rawBody);

  if (!body) {
    return jsonError("Invalid anchor request.", "BAD_REQUEST", 400);
  }

  // Anchor generation is an authenticated product feature — it costs real
  // OpenAI spend and must not be reachable by an anonymous caller.
  // UnauthenticatedError is the genuine "no session" case; anything else
  // (a verification/infrastructure failure) must not be treated the same
  // as anonymous, so it fails closed instead of falling through to
  // generation.
  let user: AuthenticatedUser;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return jsonError("Your session expired. Please sign in again.", "UNAUTHENTICATED", 401);
    }

    return jsonError("Could not verify authentication. Please try again.", "UNAUTHENTICATED", 500);
  }

  const inputValidation = validateUserInput(body);

  if (!inputValidation.ok) {
    return jsonError(inputValidation.message, "UNSAFE_INPUT", 400);
  }

  const count = anchorCount(body.mode);

  if (count === 0) {
    return NextResponse.json({
      personalAnchorInterpretation: buildFallbackInterpretation(body),
      anchors: [],
      source: "deterministic",
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(buildFallbackResponse(body, count));
  }

  // Only the OpenAI-cost path is rate-limited; the deterministic path above
  // (count === 0) never reaches here. Keyed by the authenticated user, not
  // the client-supplied deviceId: deviceId costs nothing to rotate and
  // would let one account mint unlimited fresh buckets.
  const allowed = await checkRateLimit({
    key: `rate:ai-anchors:${user.id}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });

  if (!allowed) {
    return NextResponse.json(buildFallbackResponse(body, count));
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const generated = await generateAndValidate({
      client,
      body,
      count,
    });

    if (!generated) {
      return NextResponse.json(buildFallbackResponse(body, count));
    }

    return NextResponse.json(buildSuccessResponse(body, generated.parsed, generated.anchors));
  } catch {
    return NextResponse.json(buildFallbackResponse(body, count));
  }
}
