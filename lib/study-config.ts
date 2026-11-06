/**
 * Study design configuration (shared by client and server).
 *
 * Design (see research proposal, Study 1):
 *   4 architectures × 2 seeded-error levels, between-subjects.
 *     - single            : one AI agent writes the report (baseline)
 *     - collaborative     : 3 agents in a sequential pipeline under an orchestrator
 *     - competitive       : 3 agents compete; orchestrator recommends one report
 *     - competitive_norec : 3 agents compete; NO orchestrator recommendation shown
 *   Seeded error: a verifiable, internally inconsistent claim is (or is not)
 *   inserted into the AI output the participant reviews.
 *
 * Which arms are active can be narrowed with the STUDY_CONDITIONS env var
 * (comma-separated), and the error factor turned off with SEEDED_ERROR=off.
 */

export type Condition = "single" | "collaborative" | "competitive" | "competitive_norec";

export const ALL_CONDITIONS: Condition[] = ["single", "collaborative", "competitive", "competitive_norec"];

/** The page (route) each condition works in. */
export function workPath(c: Condition): string {
  if (c === "single") return "/single";
  if (c === "collaborative") return "/collaborative";
  return "/competitive"; // competitive and competitive_norec share a page
}

export function isCondition(v: unknown): v is Condition {
  return typeof v === "string" && (ALL_CONDITIONS as string[]).includes(v);
}

/** Participant-facing name of each condition. */
export const CONDITION_LABEL: Record<Condition, string> = {
  single: "Single-Agent Mode",
  collaborative: "Collaborative Mode",
  competitive: "Competitive Mode",
  competitive_norec: "Competitive Mode",
};

// ── Seeded error ──────────────────────────────────────────────────────────────
// An internally inconsistent figure: $50M → $40M is a 20% reduction, not 40%.
// It can be spotted by careful reading alone, with no outside knowledge needed.
export const SEEDED_ERROR = {
  id: "maintenance_40pct_v1",
  sentence:
    "For example, one automotive manufacturer reported that generative AI-driven predictive maintenance cut its annual maintenance costs by 40%, from $50 million to $40 million (Deloitte, 2024).",
  /** The error counts as retained if this span survives in the final text (whitespace-insensitive). */
  signature: "by 40%, from $50 million to $40 million",
};

function norm(s: string): string {
  return s.replace(/\s+/g, " ").toLowerCase();
}

export function containsSeededError(text: string): boolean {
  return norm(text ?? "").includes(norm(SEEDED_ERROR.signature));
}

/**
 * Insert the seeded sentence at the end of the first body paragraph (before any
 * References section). No-op if the error is already present.
 */
export function injectSeededError(text: string): string {
  if (!text || containsSeededError(text)) return text;
  const refIdx = text.search(/\n\s*(\*{0,2})references?:?(\*{0,2})\s*\n/i);
  const body = refIdx >= 0 ? text.slice(0, refIdx) : text;
  const rest = refIdx >= 0 ? text.slice(refIdx) : "";
  const paras = body.split(/\n\s*\n/);
  // Skip headings / very short lines so the sentence lands inside real prose.
  let target = paras.findIndex((p) => p.trim().length > 120 && !/^#/.test(p.trim()));
  if (target < 0) target = Math.max(0, paras.length - 1);
  paras[target] = `${paras[target].trimEnd()} ${SEEDED_ERROR.sentence}`;
  return paras.join("\n\n") + rest;
}

// ── Prolific ──────────────────────────────────────────────────────────────────
export function prolificCompletionUrl(code: string): string {
  return `https://app.prolific.com/submissions/complete?cc=${encodeURIComponent(code)}`;
}
