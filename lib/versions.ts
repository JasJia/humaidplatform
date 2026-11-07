/**
 * Version stamps attached to every session record so that data collected under
 * different code / prompt revisions can be told apart during analysis.
 */

// Data schema version — bump whenever the shape of the logged session changes.
export const SCHEMA_VERSION = "2.1.0"; // 2.1: 5-point scales, pre-task AI literacy/trust propensity, completion-based balancing

// Version of the agent prompt set. Bump when any orchestrator/agent prompt changes.
export const PROMPT_VERSION = "2.0.0"; // 2.0: fixed task, ~300-word reports in all arms, single-agent prompt, orchestrator picks one agent verbatim

// Deployed app version. On Vercel this is injected automatically; falls back to
// "dev" for local development.
export const APP_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  process.env.NEXT_PUBLIC_APP_VERSION ??
  "dev";
