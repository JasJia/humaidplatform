// Keys the app cannot run correctly without. Groq and DeepSeek power Agent B
// and Agent C in both orchestrator modes, so they belong here too.
const required = [
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "DEEPSEEK_API_KEY",
  "ADMIN_PASSWORD",
  "ADMIN_SECRET",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
];

// Optional study settings:
//   PROLIFIC_COMPLETION_CODE  code shown to participants at the end (required for live Prolific runs)
//   GROQ_MODEL                preferred Groq model (falls back automatically if retired)
//   STUDY_CONDITIONS          comma-separated subset of single,collaborative,competitive,competitive_norec
//   SEEDED_ERROR              "off" to disable the seeded-error factor
const optional = ["PROLIFIC_COMPLETION_CODE"];

export function checkEnv() {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[humaid] Missing environment variables: ${missing.join(", ")}`);
  }
  const missingOptional = optional.filter((k) => !process.env[k]);
  if (missingOptional.length > 0) {
    console.warn(`[humaid] Optional environment variables not set: ${missingOptional.join(", ")}`);
  }
}
