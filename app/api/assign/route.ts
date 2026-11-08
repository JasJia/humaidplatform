import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isCondition } from "@/lib/study-config";
import { activeCells, assignBalanced, cellLoads } from "@/lib/assignment";

/**
 * POST: assign a new participant to a study cell (condition × seeded error).
 *   Body: { sessionId, test?: boolean, mode?: Condition, error?: "0" | "1" }
 *   mode/error are piloting overrides (logged as "url_param", never counted).
 *   See lib/assignment.ts for the balancing rule.
 *
 * GET (admin only): current load per cell, for monitoring recruitment.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : `anon_${Date.now()}`;
  const isTest = body.test === true;
  const overrideMode = isCondition(body.mode) ? body.mode : null;
  const overrideError = body.error === "1" ? true : body.error === "0" ? false : null;
  const cells = activeCells();

  if (overrideMode || overrideError !== null) {
    return NextResponse.json({
      condition: overrideMode ?? cells[Math.floor(Math.random() * cells.length)].condition,
      seedError: overrideError ?? (cells.some((c) => c.seedError) && Math.random() < 0.5),
      method: "url_param",
    });
  }

  try {
    const cell = await assignBalanced(sessionId, !isTest);
    return NextResponse.json({ condition: cell.condition, seedError: cell.seedError, method: "balanced_random_server_side" });
  } catch (err) {
    // KV unavailable — fall back to simple randomisation (still unbiased).
    console.error("[humaid/assign] KV unavailable, using simple randomisation:", err);
    const cell = cells[Math.floor(Math.random() * cells.length)];
    return NextResponse.json({ condition: cell.condition, seedError: cell.seedError, method: "random_server_side" });
  }
}

export async function GET() {
  const token = (await cookies()).get("humaid_admin_token")?.value;
  if (!token || token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loads = await cellLoads(activeCells());
  return NextResponse.json(loads.map((l) => ({ cell: l.cell.key, completed: l.done, inProgress: l.pending })));
}
