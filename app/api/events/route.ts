import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { cookies } from "next/headers";

/**
 * Raw participant activity stream (see lib/event-logger.ts).
 *
 * POST  — a batch of events from a participant's browser. Stored per session,
 *         so activity of participants who never submit (dropouts) is kept.
 *           ev:<sessionId>       list of event JSON strings
 *           evmeta:<sessionId>   hash: participantId, condition, seedError, isTest, firstSeen, lastSeen
 *           ev_sessions          set of all session ids that sent events
 * GET   — admin only. ?format=csv (default) | json | summary
 */

const MAX_EVENTS_PER_BATCH = 200;
const MAX_BODY_BYTES = 512_000;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Batch too large" }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
  if (!sessionId || !/^[\w.-]{1,80}$/.test(sessionId)) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  if (!events.length) return NextResponse.json({ ok: true, stored: 0 });

  const now = new Date().toISOString();
  const metaKey = `evmeta:${sessionId}`;
  try {
    await kv.rpush(`ev:${sessionId}`, ...events.map((e) => JSON.stringify(e)));
    await kv.hsetnx(metaKey, "firstSeen", now);
    await kv.hset(metaKey, {
      participantId: String(body.participantId ?? ""),
      studyId: String(body.studyId ?? ""),
      condition: String(body.condition ?? ""),
      seedError: body.seedError === true ? "1" : "0",
      isTest: body.isTest === true ? "1" : "0",
      lastSeen: now,
    });
    await kv.sadd("ev_sessions", sessionId);
  } catch (err) {
    console.error("[humaid/events] KV write failed:", err);
    return NextResponse.json({ error: "Storage failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stored: events.length });
}

// ── Admin export ─────────────────────────────────────────────────────────────
function esc(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, "\\n")}"`;
}

export async function GET(req: NextRequest) {
  const token = (await cookies()).get("humaid_admin_token")?.value;
  if (!token || token !== process.env.ADMIN_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = new URL(req.url).searchParams.get("format") ?? "csv";
  const ids = ((await kv.smembers("ev_sessions")) ?? []) as string[];
  const completedRaw = await kv.lrange<string>("sessions", 0, -1);
  const completed = new Set(
    (completedRaw ?? []).map((s) => (typeof s === "string" ? JSON.parse(s) : s)?.sessionId).filter(Boolean)
  );

  const metas = await Promise.all(ids.map((id) => kv.hgetall<Record<string, string>>(`evmeta:${id}`)));
  const sessions = ids.map((id, i) => ({ sessionId: id, ...(metas[i] ?? {}), completed: completed.has(id) }));

  if (format === "summary") {
    const real = sessions.filter((s) => (s as Record<string, unknown>).isTest !== "1");
    return NextResponse.json({
      started: real.length,
      completed: real.filter((s) => s.completed).length,
      droppedOut: real.filter((s) => !s.completed).length,
      testSessions: sessions.length - real.length,
    });
  }

  const lists = await Promise.all(ids.map((id) => kv.lrange<string>(`ev:${id}`, 0, -1)));
  const rows = sessions.flatMap((s, i) =>
    (lists[i] ?? []).map((e) => {
      const ev = (typeof e === "string" ? JSON.parse(e) : e) as Record<string, unknown>;
      return { ...s, timestamp: ev.timestamp, path: ev.path, eventType: ev.eventType, payload: ev.payload };
    })
  );
  rows.sort((a, b) => (a.sessionId === b.sessionId ? String(a.timestamp).localeCompare(String(b.timestamp)) : a.sessionId.localeCompare(b.sessionId)));

  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="humaid-activity-${Date.now()}.json"` },
    });
  }
  const headers = ["sessionId", "participantId", "studyId", "condition", "seedError", "isTest", "completed", "firstSeen", "lastSeen", "timestamp", "path", "eventType", "payload"];
  const lines = [headers.map(esc).join(",")];
  for (const r of rows as Record<string, unknown>[]) {
    lines.push(headers.map((h) => esc(h === "payload" ? JSON.stringify(r.payload ?? {}) : r[h])).join(","));
  }
  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="humaid-activity-${Date.now()}.csv"` },
  });
}
