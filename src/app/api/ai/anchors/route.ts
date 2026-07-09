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

export const runtime = "nodejs";

type ErrorCode = "BAD_REQUEST" | "UNSAFE_INPUT" | "AI_GENERATION_FAILED";

function jsonError(message: string, code: ErrorCode, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
    !hasText(candidate.intake.goal) ||
    !hasText(candidate.intake.struggle) ||
    !hasText(candidate.intake.goalWhy)
  ) {
    return null;
  }

  return {
    mode: candidate.mode,
    deviceId: hasText(candidate.deviceId) ? candidate.deviceId : undefined,
    intake: {
      name: hasText(candidate.intake.name) ? candidate.intake.name : undefined,
      goal: candidate.intake.goal,
      struggle: candidate.intake.struggle,
      goalWhy: candidate.intake.goalWhy,
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
  // (count === 0) never reaches here. Missing deviceId falls into a shared
  // "unknown" bucket rather than bypassing the limit entirely.
  const allowed = await checkRateLimit({
    key: `rate:ai-anchors:${body.deviceId ?? "unknown"}`,
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
