/**
 * Canonical schema for a final session record.
 *
 * This is the single source of truth for the data written to KV when a
 * participant completes the study. It includes the richer data-quality fields
 * required before real data collection (version stamps, timing, edit metrics,
 * model routing, API performance, etc.).
 *
 * This type is intentionally not yet wired into the logging flow — it defines
 * the target shape that the mode pages, /submit, and /api/log will populate.
 */

export type Mode = "single" | "collaborative" | "competitive" | "competitive_norec";

/** How the participant ended up in their study condition (mode). */
export type ConditionAssignmentMethod =
  | "balanced_random_server_side"
  | "random_server_side"
  | "manual_choice"
  | "url_param";

/** Which provider/model served a given agent. Keyed by agent id ("a" | "b" | "c"). */
export type ModelRouting = Record<string, { provider: string; model: string }>;

/** Milliseconds a participant actively viewed each agent's output, keyed by agent id. */
export type TimeViewingEachAgent = Record<string, number>;

export type ApiLatency = {
  /** Per-call latencies in the order the calls were made. */
  perCall: number[];
  /** Sum of all call latencies. */
  total: number;
};

/** Post-task Likert survey (1–5 scales). */
export type PostTaskSurvey = {
  trust: number;
  difficulty: number;
  satisfaction: number;
  effort: number;
};

export type Demographics = {
  ageRange?: string;
  education?: string;
  aiFamiliarity?: string;
  fieldOfStudy?: string;
};

export type SessionRecord = {
  // ── Provenance / versioning ───────────────────────────────────────────────
  schemaVersion: string;
  appVersion: string;
  promptVersion: string;
  conditionAssignmentMethod: ConditionAssignmentMethod;

  // ── Identity (CloudResearch Connect) ───────────────────────────────────────
  participantId: string;
  assignmentId: string | null;
  projectId: string | null;
  sessionId: string;

  // ── Task / condition ───────────────────────────────────────────────────────
  actualTask: string;
  taskWasCustomized: boolean;
  mode: Mode;
  agentDisplayOrder: string[];
  modelRouting: ModelRouting;

  // ── Timing ──────────────────────────────────────────────────────────────────
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  timeOnInstructionsMs: number | null;
  timeViewingEachAgentMs: TimeViewingEachAgent;

  // ── Edit / interaction metrics ───────────────────────────────────────────────
  editDistance: number;
  wordDelta: number;
  rerunCount: number;
  acceptedCoordinatorRecommendation: boolean | null;

  // ── API performance ──────────────────────────────────────────────────────────
  apiLatencyMs: ApiLatency;
  apiErrorCount: number;

  // ── Survey + outcome ─────────────────────────────────────────────────────────
  confidenceRating: number;
  postTaskSurvey: PostTaskSurvey;
  demographics: Demographics | null;
  finalSubmission: string;
  originalSubmission: string;
  wasEdited: boolean;
};

/** Field order used for tabular exports (CSV / XLSX header rows). */
export const SESSION_FIELD_ORDER: (keyof SessionRecord)[] = [
  "schemaVersion",
  "appVersion",
  "promptVersion",
  "conditionAssignmentMethod",
  "participantId",
  "assignmentId",
  "projectId",
  "sessionId",
  "actualTask",
  "taskWasCustomized",
  "mode",
  "agentDisplayOrder",
  "modelRouting",
  "startedAt",
  "completedAt",
  "totalDurationMs",
  "timeOnInstructionsMs",
  "timeViewingEachAgentMs",
  "editDistance",
  "wordDelta",
  "rerunCount",
  "acceptedCoordinatorRecommendation",
  "apiLatencyMs",
  "apiErrorCount",
];
