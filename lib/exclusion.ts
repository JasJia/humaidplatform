/**
 * Pre-registered data-quality exclusion rules, shared by the admin dashboard
 * and the data exports. Sessions are never deleted; they are flagged so they
 * can be excluded (or kept, for robustness checks) at analysis time.
 *
 *   attention_check_failed  instructed-response item answered incorrectly
 *   too_fast                consent → final submit in under MIN_TOTAL_MINUTES
 *   duplicate               the same participant ID completed more than once
 */
export const MIN_TOTAL_MINUTES = 5;

type SessionLike = {
  attentionCheckPassed?: unknown;
  duplicate?: unknown;
  consentAt?: unknown;
  startTime?: unknown;
  surveyCompletedAt?: unknown;
  loggedAt?: unknown;
};

/** Minutes from consent (or task start) to final submission; null if unknown. */
export function totalMinutes(s: SessionLike): number | null {
  const start = Date.parse(String(s.consentAt ?? s.startTime ?? ""));
  const end = Date.parse(String(s.surveyCompletedAt ?? s.loggedAt ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 60_000;
}

export function exclusionReasons(s: SessionLike): string[] {
  const reasons: string[] = [];
  if (s.attentionCheckPassed === false) reasons.push("attention_check_failed");
  const mins = totalMinutes(s);
  if (mins !== null && mins < MIN_TOTAL_MINUTES) reasons.push("too_fast");
  if (s.duplicate === true) reasons.push("duplicate");
  return reasons;
}

export const EXCLUSION_LABEL: Record<string, string> = {
  attention_check_failed: "Failed attention check",
  too_fast: `Under ${MIN_TOTAL_MINUTES} min`,
  duplicate: "Duplicate participant",
};

/** Classroom pilot sessions (?source=class). */
export function isClassSession(s: { source?: unknown; participantId?: unknown }): boolean {
  return s.source === "class" || String(s.participantId ?? "").startsWith("class_");
}
