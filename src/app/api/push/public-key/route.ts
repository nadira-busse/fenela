// src/app/api/push/public-key/route.ts

import { NextResponse } from "next/server";

import { configureWebPush } from "@/lib/pushServer";

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function GET() {
  try {
    const { publicKey } = configureWebPush();

    if (!publicKey) {
      return NextResponse.json(
        { ok: false, error: "Missing publicKey from configureWebPush()" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, publicKey });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
