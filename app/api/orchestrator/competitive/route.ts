import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { checkEnv } from "@/lib/env";
import { callDeepSeek, callGroq, groqModelInUse, createMetrics, trackCall, summariseMetrics, Msg } from "@/lib/api-helpers";
import { injectSeededError } from "@/lib/study-config";
checkEnv();

export const maxDuration = 60;

// Which provider/model serves each agent in this mode (logged as modelRouting).
function modelRouting() {
  return {
    a: { provider: "openai", model: "gpt-5.5" },
    b: { provider: "groq", model: groqModelInUse() },
    c: { provider: "deepseek", model: "deepseek-chat" },
  };
}

// OpenAI client with 25s per-call timeout
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 25000,
  maxRetries: 1,
});

export type LogEntry = {
  id: string;
  timestamp: string;
  actor: "orchestrator" | "agent_a" | "agent_b" | "agent_c";
  type: "plan" | "assignment" | "output" | "critique" | "decision" | "final";
  content: string;
};

function log(actor: LogEntry["actor"], type: LogEntry["type"], content: string): LogEntry {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    actor,
    type,
    content,
  };
}

export async function POST(req: NextRequest) {
  let body: { topic?: string; userMessage?: string; previousFinal?: string; round?: number; seedError?: boolean; recommend?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
  }

  const { topic, userMessage, previousFinal, round = 1, seedError = false, recommend = true } = body;

  if (!topic || !topic.trim()) {
    return NextResponse.json({ error: "Topic is required", code: "MISSING_TOPIC" }, { status: 400 });
  }

  const logs: LogEntry[] = [];
  const isReRun = round > 1 && previousFinal;
  const metrics = createMetrics();

  try {
    // ── STEP 0: Build brief directly (no extra LLM call) ─────────────────────
    const brief = isReRun
      ? `Revise your report based on this feedback: "${userMessage}". Previous version:\n${previousFinal}`
      : `${topic}${userMessage && userMessage !== "No specific requirements."
          ? `\n\nAdditional requirements: ${userMessage}`
          : ""}`;

    logs.push(log("orchestrator", "plan", `Launching competitive pipeline for: "${topic}".`));
    logs.push(log("orchestrator", "assignment", `Briefing all agents: ${brief.slice(0, 120)}${brief.length > 120 ? "…" : ""}`));

    // ── STEP 1: All three agents generate in parallel (with retry) ────────────
    const reportInstruction = `Write a professional industry report of about 300 words, with in-text citations in Author (Year) format. Do NOT use memo or letter format (no To:/From:/Date: headers). Write in plain prose paragraphs. End with a "References" section listing each cited source in APA format on a separate line. Return ONLY the report text followed by the References section.`;
    const promptA = `You are Agent A. Brief: ${brief}\n${reportInstruction}`;
    const promptB = `You are Agent B. Brief: ${brief}\n${reportInstruction}`;
    const promptC = `You are Agent C. Brief: ${brief}\n${reportInstruction}`;

    const [outputA, outputB, outputC] = await Promise.all([
      trackCall(metrics, () =>
        openaiClient.chat.completions
          .create({ model: "gpt-5.5", reasoning_effort: "none", messages: [{ role: "user", content: promptA }] })
          .then((r) => r.choices[0].message.content ?? ""), 1
      ).catch((e) => { throw new Error(`Agent A failed: ${e.message}`); }),

      trackCall(metrics, () => callGroq([{ role: "user", content: promptB }] as Msg[], 0.8), 1)
        .catch((e) => { throw new Error(`Agent B failed: ${e.message}`); }),

      trackCall(metrics, () => callDeepSeek([{ role: "user", content: promptC }] as Msg[], 0.8), 1)
        .catch((e) => { throw new Error(`Agent C failed: ${e.message}`); }),
    ]);

    logs.push(log("agent_a", "output", `Draft complete (${outputA.split(/\s+/).length} words).`));
    logs.push(log("agent_b", "output", `Draft complete (${outputB.split(/\s+/).length} words).`));
    logs.push(log("agent_c", "output", `Draft complete (${outputC.split(/\s+/).length} words).`));

    // ── STEP 2: Critique round (parallel, with retry) ─────────────────────────
    logs.push(log("orchestrator", "assignment", "Starting critique round — each agent evaluates the other two outputs."));

    const critiqueSystem = `You are a professional peer reviewer. Write a concise, objective critique.
Use plain prose only — no markdown, no bold, no headers, no bullet points.
Format: One short paragraph on the first report, then one short paragraph on the second. Keep each paragraph to 2 sentences maximum.`;

    const [critiqueA, critiqueB, critiqueC] = await Promise.all([
      trackCall(metrics, () =>
        openaiClient.chat.completions
          .create({
            model: "gpt-5.5",
            reasoning_effort: "none",
            messages: [
              { role: "system", content: critiqueSystem },
              { role: "user", content: `Review these two reports and write a brief professional critique of each.\n\nReport B:\n${outputB}\n\nReport C:\n${outputC}` },
            ],
          })
          .then((r) => r.choices[0].message.content ?? ""), 1
      ),
      trackCall(metrics, () =>
        callGroq([
          { role: "system", content: critiqueSystem },
          { role: "user", content: `Review these two reports and write a brief professional critique of each.\n\nReport A:\n${outputA}\n\nReport C:\n${outputC}` },
        ] as Msg[], 0.6), 1
      ),
      trackCall(metrics, () =>
        callDeepSeek([
          { role: "system", content: critiqueSystem },
          { role: "user", content: `Review these two reports and write a brief professional critique of each.\n\nReport A:\n${outputA}\n\nReport B:\n${outputB}` },
        ] as Msg[], 0.6), 1
      ),
    ]);

    // Truncate critique for the log (full text is in agentOutputs)
    const truncate = (s: string, n = 600) => s.replace(/\*\*/g, "").slice(0, n) + (s.length > n ? "…" : "");
    logs.push(log("agent_a", "critique", truncate(critiqueA)));
    logs.push(log("agent_b", "critique", truncate(critiqueB)));
    logs.push(log("agent_c", "critique", truncate(critiqueC)));

    // ── STEP 3: Orchestrator selects the strongest report ─────────────────────
    // The orchestrator picks ONE agent's report (verbatim) rather than rewriting,
    // so "accepting the recommendation" is well defined for analysis. In the
    // no-recommendation condition the pick is still computed and logged, but
    // the client does not show it.
    const decisionRes = await trackCall(metrics, () =>
      openaiClient.chat.completions.create({
        model: "gpt-5.5",
        reasoning_effort: "none",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You are the Main Orchestrator. Review all three agent outputs and critiques, then select the single strongest report. Return JSON: { "selectedAgent": "A" | "B" | "C", "decision": string (one sentence naming the selected agent), "rationale": string (2-3 sentences) }',
          },
          {
            role: "user",
            content: `Agent A:\n${outputA}\n\nAgent B:\n${outputB}\n\nAgent C:\n${outputC}\n\nCritiques:\nA: ${critiqueA}\nB: ${critiqueB}\nC: ${critiqueC}\n\nUser preferences: ${userMessage || "None."}\n\nReturn JSON.`,
          },
        ],
      }), 1
    );

    let decision: Record<string, string> = {};
    try {
      decision = JSON.parse(decisionRes.choices[0].message.content ?? "{}");
    } catch {
      decision = {};
    }
    const letter = String(decision.selectedAgent ?? "").trim().toUpperCase().replace(/^AGENT\s*/, "");
    const recommendedId = letter === "B" ? 2 : letter === "C" ? 3 : 1;

    const outputs = [outputA, outputB, outputC];
    // Seeded-error manipulation: the error is placed in the report the
    // orchestrator selected (after critiques, so it is held constant).
    if (seedError) outputs[recommendedId - 1] = injectSeededError(outputs[recommendedId - 1]);
    const finalVersion = outputs[recommendedId - 1];

    if (recommend) {
      logs.push(log("orchestrator", "decision", decision.decision ?? `Agent ${"ABC"[recommendedId - 1]}'s report is the strongest.`));
      logs.push(log("orchestrator", "final", decision.rationale ?? "Final version selected and ready for review."));
    } else {
      logs.push(log("orchestrator", "final", "All reports and critiques are ready. Please choose the report you want to use."));
    }

    return NextResponse.json({
      success: true,
      logs,
      agentOutputs: [
        { id: 1, name: "Agent A", style: "Agent A's Response", output: outputs[0], critique: critiqueA },
        { id: 2, name: "Agent B", style: "Agent B's Response", output: outputs[1], critique: critiqueB },
        { id: 3, name: "Agent C", style: "Agent C's Response", output: outputs[2], critique: critiqueC },
      ],
      finalVersion,
      recommendedAgentId: recommendedId,
      recommendationShown: recommend,
      seededErrorInjected: seedError,
      coordinatorDecision: decision.decision ?? "",
      coordinatorRationale: decision.rationale ?? "",
      modelRouting: modelRouting(),
      ...summariseMetrics(metrics),
      round,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Coordination failed";
    console.error("[competitive orchestrator]", message);
    return NextResponse.json({ error: message, logs }, { status: 500 });
  }
}
