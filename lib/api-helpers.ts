/**
 * Shared helpers for all external LLM API calls.
 * Provides: timeout protection, retry with backoff, key sanitisation, friendly errors.
 */

export type Msg = { role: string; content: string };

// ── Key sanitisation ─────────────────────────────────────────────────────────
// Strips non-ASCII chars (e.g. em dashes pasted from email) that cause
// the "Cannot convert argument to a ByteString" error in fetch headers.
export function sanitizeKey(key: string): string {
  return (key ?? "").replace(/[^\x00-\x7F]/g, "").trim();
}

// ── Text cleaning ─────────────────────────────────────────────────────────────
// Replaces smart quotes / dashes before sending to DeepSeek / Groq.
export function cleanText(text: string): string {
  return text
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/‘/g, "'")
    .replace(/’/g, "'")
    .replace(/“/g, '"')
    .replace(/”/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x00-\x7F]/g, "");
}

// ── Timeout wrapper ───────────────────────────────────────────────────────────
export function withTimeout<T>(fn: () => Promise<T>, ms: number, label = "Request"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms
    );
    fn().then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ── Retry with exponential backoff ────────────────────────────────────────────
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 1500,
  onError?: (err: unknown) => void
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    onError?.(err); // count every failed attempt, including the final one
    // Do not retry on auth errors — retrying won't help
    if (err instanceof Error && err.message.includes("(401)")) throw err;
    if (retries <= 0) throw err;
    await new Promise((r) => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2, onError);
  }
}

// ── API call metrics (latency + error counting) ───────────────────────────────
// Accumulates per-call latency and a count of failed model/API calls across a
// single orchestrator run, for the apiLatencyMs / apiErrorCount session fields.
export type CallMetrics = { latencies: number[]; errorCount: number };

export function createMetrics(): CallMetrics {
  return { latencies: [], errorCount: 0 };
}

/** Times a model/API call and records any failures into `metrics`. */
export async function trackCall<T>(
  metrics: CallMetrics,
  fn: () => Promise<T>,
  retries = 0
): Promise<T> {
  const start = Date.now();
  try {
    return await withRetry(fn, retries, 1500, () => {
      metrics.errorCount++;
    });
  } finally {
    metrics.latencies.push(Date.now() - start);
  }
}

export function summariseMetrics(m: CallMetrics): {
  apiLatencyMs: { perCall: number[]; total: number };
  apiErrorCount: number;
} {
  return {
    apiLatencyMs: { perCall: m.latencies, total: m.latencies.reduce((a, b) => a + b, 0) },
    apiErrorCount: m.errorCount,
  };
}

// ── Friendly HTTP error messages ──────────────────────────────────────────────
function httpError(provider: string, status: number, body: string): Error {
  if (status === 401)
    return new Error(`${provider}: Invalid API key — please update the key in Vercel environment variables.`);
  if (status === 429)
    return new Error(`${provider}: Rate limit reached — please wait a moment and try again.`);
  if (status === 503 || status === 502)
    return new Error(`${provider}: Service temporarily unavailable. Please try again in a few seconds.`);
  return new Error(`${provider} error (HTTP ${status}): ${body.slice(0, 200)}`);
}

// ── DeepSeek ──────────────────────────────────────────────────────────────────
export async function callDeepSeek(
  messages: Msg[],
  temperature = 0.8,
  timeoutMs = 25000
): Promise<string> {
  const key = sanitizeKey(process.env.DEEPSEEK_API_KEY ?? "");
  if (!key) throw new Error("DeepSeek API key is not configured in environment variables.");

  const payload = JSON.stringify({
    model: "deepseek-chat",
    messages: messages.map((m) => ({ ...m, content: cleanText(m.content) })),
    temperature,
  });

  const res = await withTimeout(
    () =>
      fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${key}`,
        },
        body: Buffer.from(payload, "utf8"),
      }),
    timeoutMs,
    "DeepSeek"
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw httpError("DeepSeek", res.status, body);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

// ── Groq ──────────────────────────────────────────────────────────────────────
// Groq retires models regularly (llama-3.3-70b-versatile was shut down for
// developer-tier keys in Aug 2026, which broke every run). The model is now
// configurable via GROQ_MODEL, with automatic fallback when a model is gone.
const GROQ_FALLBACKS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "llama-3.1-8b-instant"];
let resolvedGroqModel: string | null = null;

function groqCandidates(): string[] {
  const preferred = (process.env.GROQ_MODEL ?? "").trim();
  const list = [resolvedGroqModel, preferred || null, ...GROQ_FALLBACKS].filter(Boolean) as string[];
  return [...new Set(list)];
}

/** The Groq model currently in use (for the modelRouting record). */
export function groqModelInUse(): string {
  return resolvedGroqModel ?? groqCandidates()[0];
}

/** Remove any reasoning traces some open models emit inline. */
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export async function callGroq(
  messages: Msg[],
  temperature = 0.8,
  timeoutMs = 25000
): Promise<string> {
  const key = sanitizeKey(process.env.GROQ_API_KEY ?? "");
  if (!key) throw new Error("Groq API key is not configured in environment variables.");

  let lastErr: Error | null = null;
  for (const model of groqCandidates()) {
    const payload = JSON.stringify({
      model,
      messages: messages.map((m) => ({ ...m, content: cleanText(m.content) })),
      temperature,
      ...(model.startsWith("qwen/") ? { reasoning_format: "hidden" } : {}),
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    });

    const res = await withTimeout(
      () =>
        fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${key}`,
          },
          body: Buffer.from(payload, "utf8"),
        }),
      timeoutMs,
      "Groq"
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Model retired / not available to this key → try the next candidate.
      if ((res.status === 404 || res.status === 400) && /model_not_found|model_decommissioned|does not exist|decommissioned/i.test(body)) {
        console.warn(`[groq] model ${model} unavailable, trying next fallback`);
        if (resolvedGroqModel === model) resolvedGroqModel = null;
        lastErr = httpError("Groq", res.status, body);
        continue;
      }
      throw httpError("Groq", res.status, body);
    }

    resolvedGroqModel = model;
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return stripReasoning(data.choices[0]?.message?.content ?? "");
  }
  throw lastErr ?? new Error("Groq: no available model.");
}
