/**
 * Participant activity logging.
 *
 * Every event is (1) kept in sessionStorage, so it is included in the final
 * session record, and (2) streamed to the server (/api/events) in small
 * batches — every 10 s and whenever the page is hidden or closed — so that
 * activity of participants who drop out before submitting is preserved too.
 */

export type AppEvent = {
  sessionId: string;
  timestamp: string;
  eventType: string;
  path?: string;
  payload: Record<string, unknown>;
};

const STORAGE_KEY = "humaid_events";
const QUEUE_KEY = "humaid_event_queue";
const FLUSH_INTERVAL_MS = 10_000;

/** Event types that are streamed to the server but kept out of the final record (size). */
const STREAM_ONLY = new Set(["text_snapshot"]);

function read<T>(key: string): T[] {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "[]"); } catch { return []; }
}

export function logEvent(eventType: string, payload: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  const sessionId = sessionStorage.getItem("humaid_session_id") ?? "unknown";
  const event: AppEvent = {
    sessionId,
    timestamp: new Date().toISOString(),
    eventType,
    path: window.location.pathname,
    payload,
  };
  try {
    if (!STREAM_ONLY.has(eventType)) {
      const existing = read<AppEvent>(STORAGE_KEY);
      existing.push(event);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    }
    const queue = read<AppEvent>(QUEUE_KEY);
    queue.push(event);
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // sessionStorage full or unavailable — logging must never break the task.
  }
}

export function getEvents(): AppEvent[] {
  if (typeof window === "undefined") return [];
  return read<AppEvent>(STORAGE_KEY);
}

export function clearEvents(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Context sent with each batch so dropouts can be identified on the server. */
function sessionMeta() {
  return {
    sessionId: sessionStorage.getItem("humaid_session_id"),
    participantId: sessionStorage.getItem("humaid_participant_id"),
    studyId: sessionStorage.getItem("humaid_study_id"),
    condition: sessionStorage.getItem("humaid_mode"),
    seedError: sessionStorage.getItem("humaid_seed_error") === "1",
    isTest: sessionStorage.getItem("humaid_is_test") === "1",
  };
}

/** Send queued events to the server. `beacon` is used when the page is closing. */
export function flushEvents(beacon = false): void {
  if (typeof window === "undefined") return;
  const queue = read<AppEvent>(QUEUE_KEY);
  const meta = sessionMeta();
  if (!queue.length || !meta.sessionId) return;
  const batch = queue.slice(0, 200);
  const body = JSON.stringify({ ...meta, events: batch });
  // Optimistically remove the batch; on fetch failure it is put back.
  sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(batch.length)));
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); })
    .catch(() => {
      const rest = read<AppEvent>(QUEUE_KEY);
      sessionStorage.setItem(QUEUE_KEY, JSON.stringify([...batch, ...rest]));
    });
}

let flushTimer: ReturnType<typeof setInterval> | null = null;
/** Start periodic flushing (idempotent). */
export function startEventStreaming(): void {
  if (typeof window === "undefined" || flushTimer) return;
  flushTimer = setInterval(() => flushEvents(false), FLUSH_INTERVAL_MS);
}

// ── Report text snapshots (to reconstruct the editing process) ────────────────
let lastSnapshot = "";
let lastSnapshotAt = 0;
let pendingSnapshot: ReturnType<typeof setTimeout> | null = null;
const SNAPSHOT_EVERY_MS = 15_000;

/**
 * Record the current report text, at most once every 15 s (plus a trailing
 * snapshot after edits stop), so the full editing trajectory can be rebuilt.
 */
export function snapshotReport(text: string, reason = "edit"): void {
  if (typeof window === "undefined" || text === lastSnapshot) return;
  const write = () => {
    if (text === lastSnapshot) return;
    lastSnapshot = text;
    lastSnapshotAt = Date.now();
    logEvent("text_snapshot", { reason, charCount: text.length, text });
  };
  if (pendingSnapshot) clearTimeout(pendingSnapshot);
  if (reason !== "edit" || Date.now() - lastSnapshotAt >= SNAPSHOT_EVERY_MS) write();
  else pendingSnapshot = setTimeout(write, SNAPSHOT_EVERY_MS);
}
