import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { ALL_CONDITIONS, isCondition, type Condition } from "@/lib/study-config";

/**
 * Server-side random assignment to a study cell (condition × seeded error).
 *
 * Balanced randomisation: the participant is placed in one of the least-filled
 * cells (ties broken at random), using KV counters of *started* sessions.
 * Test sessions (test=true) and URL overrides never touch the counters.
 *
 * Request body: { test?: boolean, mode?: Condition, error?: "0" | "1" }
 *   mode/error are optional overrides for piloting (logged as "url_param").
 */

const COUNTER_PREFIX = "assign_count";

function activeConditions(): Condition[] {
  const raw = process.env.STUDY_CONDITIONS;
  if (!raw) return ALL_CONDITIONS;
  const list = raw.split(",").map((s) => s.trim()).filter(isCondition);
  return list.length ? list : ALL_CONDITIONS;
}

function errorLevels(): boolean[] {
  return process.env.SEEDED_ERROR === "off" ? [false] : [false, true];
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const isTest = body.test === true;
  const overrideMode = isCondition(body.mode) ? body.mode : null;
  const overrideError = body.error === "1" ? true : body.error === "0" ? false : null;

  const cells = activeConditions().flatMap((condition) =>
    errorLevels().map((seedError) => ({ condition, seedError, key: `${COUNTER_PREFIX}:${condition}:${seedError ? 1 : 0}` }))
  );

  if (overrideMode || overrideError !== null) {
    return NextResponse.json({
      condition: overrideMode ?? cells[Math.floor(Math.random() * cells.length)].condition,
      seedError: overrideError ?? (errorLevels().length > 1 && Math.random() < 0.5),
      method: "url_param",
    });
  }

  let chosen = cells[Math.floor(Math.random() * cells.length)];
  let method = "random_server_side";
  try {
    const counts = await Promise.all(cells.map((c) => kv.get<number>(c.key)));
    const n = counts.map((v) => Number(v ?? 0));
    const min = Math.min(...n);
    const candidates = cells.filter((_, i) => n[i] === min);
    chosen = candidates[Math.floor(Math.random() * candidates.length)];
    if (!isTest) await kv.incr(chosen.key);
    method = "balanced_random_server_side";
  } catch (err) {
    // KV unavailable — fall back to simple randomisation (still unbiased).
    console.error("[humaid/assign] KV unavailable, using simple randomisation:", err);
  }

  return NextResponse.json({ condition: chosen.condition, seedError: chosen.seedError, method });
}
