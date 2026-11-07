import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { hasCompleted, markCompleted } from "@/lib/participant-gate";
import { SCHEMA_VERSION, APP_VERSION, PROMPT_VERSION } from "@/lib/versions";
import { containsSeededError, SEEDED_ERROR } from "@/lib/study-config";
import { completeAssignment } from "@/lib/assignment";

/**
 * Persists a completed session and returns the Prolific completion code.
 *
 * Participants are recruited via Prolific: the Prolific ID is entered (or
 * pre-filled from the URL) on the final page. Repeat completions are never
 * blocked here (the data are always saved) but are flagged `duplicate: true`
 * for exclusion at analysis time. Prolific itself prevents a participant from
 * taking the same study twice.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
  }

  if (!body.sessionId || typeof body.sessionId !== "string") {
    return NextResponse.json({ error: "Missing sessionId", code: "MISSING_SESSION_ID" }, { status: 400 });
  }

  const participantId = typeof body.participantId === "string" ? body.participantId.trim() : "";
  const isTest = body.isTest === true;
  const duplicate = participantId ? await hasCompleted(participantId) : false;

  // Authoritative outcome measure, recomputed server-side from the final text.
  const finalText = typeof body.finalSubmission === "string" ? body.finalSubmission : "";
  const seeded = body.seededErrorCondition === true;

  // Version stamps are applied server-side (authoritative) so they can't be
  // spoofed by the client and always reflect the deployed build.
  const entry = {
    ...body,
    participantId,
    duplicate,
    isTest,
    seededErrorId: seeded ? SEEDED_ERROR.id : null,
    seededErrorRetained: seeded ? containsSeededError(finalText) : null,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    promptVersion: PROMPT_VERSION,
    loggedAt: new Date().toISOString(),
  };
  console.log("[humaid/log]", body.sessionId, isTest ? "(test)" : "");

  try {
    await kv.lpush("sessions", JSON.stringify(entry));
  } catch (err) {
    console.error("[humaid/log] KV write failed:", err);
    return NextResponse.json({ error: "Failed to persist session", code: "KV_WRITE_FAILED" }, { status: 500 });
  }

  // Record completion for repeat-participation detection (non-fatal if it fails).
  if (participantId && !isTest) await markCompleted(participantId);
  // Count this session toward its cell's completed total (keeps groups balanced).
  if (!isTest && !duplicate) {
    try { await completeAssignment(body.sessionId as string); } catch (err) { console.error("[humaid/log] completeAssignment failed:", err); }
  }

  // Env var wins; otherwise use the code passed in the study link (&cc=...).
  const urlCode = typeof body.completionCodeFromUrl === "string" ? body.completionCodeFromUrl.trim() : "";
  const completionCode =
    (process.env.PROLIFIC_COMPLETION_CODE ?? "").trim() ||
    (/^[A-Za-z0-9_-]{1,40}$/.test(urlCode) ? urlCode : "") ||
    null;
  return NextResponse.json({ success: true, sessionId: body.sessionId, completionCode, duplicate });
}
