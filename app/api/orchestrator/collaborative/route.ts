import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { checkEnv } from "@/lib/env";
import { callDeepSeek, callGroq, groqModelInUse, createMetrics, trackCall, summariseMetrics, Msg } from "@/lib/api-helpers";
import { injectSeededError } from "@/lib/study-config";
checkEnv();

export const maxDuration = 300;

// Which provider/model serves each agent in this mode (logged as modelRouting).
function modelRouting() {
  return {
    a: { provider: "openai", model: "gpt-5.5" },
    b: { provider: "deepseek", model: "deepseek-chat" },
    c: { provider: "groq", model: groqModelInUse() },
  };
}

// Orchestrator uses GPT-5.5 (needs reliable JSON mode)
// maxRetries: 0 — auto-retry doubles latency on a sequential pipeline, which we can't afford.
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 40000,
  maxRetries: 0,
});

export type LogEntry = {
  id: string;
  timestamp: string;
  actor: "orchestrator" | "agent_a" | "agent_b" | "agent_c";
  type: "plan" | "assignment" | "output" | "review" | "final";
  content: string;
};

function log(actor: LogEntry["actor"], type: LogEntry["type"], content: string): LogEntry {
  return { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date().toISOString(), actor, type, content };
}

// Randomly chosen each run so the orchestrator varies how it divides the work
// across the three agents instead of always using the same pattern.
const DIVISION_STRATEGIES = [
  "Agent A gathers data and evidence, Agent B analyses it and draws insights, Agent C writes the report.",
  "Agent A defines scope and structure, Agent B researches and gathers sources, Agent C writes the report.",
  "Agent A researches market context, Agent B researches challenges/risks and case studies, Agent C synthesises the report.",
  "Agent A drafts an outline and key arguments, Agent B fills in evidence and counterpoints, Agent C polishes the final report.",
  "Agent A identifies trends and opportunities, Agent B identifies barriers and financial implications, Agent C writes the report.",
  "Agent A handles qualitative analysis, Agent B handles quantitative data and statistics, Agent C writes the report.",
];

function safeParse(s: string | null | undefined): Record<string, string> {
  try {
    return JSON.parse(s ?? "{}");
  } catch {
    return {};
  }
}

/** Short one-line summary of an agent's output for the log (markdown stripped) */
function snippet(text: string, n = 140): string {
  const clean = text
    .replace(/^#{1,6}\s+/gm, "")   // strip heading markers (##)
    .replace(/\*\*(.+?)\*\*/g, "$1") // strip bold (**)
    .replace(/\*(.+?)\*/g, "$1")     // strip italic (*)
    .replace(/^[-*•]\s+/gm, "")      // strip bullet markers
    .replace(/`+/g, "")              // strip code ticks
    .replace(/\s+/g, " ")            // collapse whitespace
    .trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

export async function POST(req: NextRequest) {
  let body: { topic?: string; userMessage?: string; previousSummary?: string; round?: number; seedError?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
  }
  const { topic, userMessage, previousSummary, round = 1, seedError = false } = body;

  if (!topic || !topic.trim()) {
    return NextResponse.json({ error: "Topic is required", code: "MISSING_TOPIC" }, { status: 400 });
  }

  const logs: LogEntry[] = [];
  const isReRun = round > 1 && previousSummary;
  const requirements = userMessage && userMessage !== "No specific requirements." ? userMessage : "";
  const metrics = createMetrics();

  try {
    // ── Randomly choose which agent writes the FINAL report this run ─────────
    // The writer must run LAST (it needs the others' work), but WHICH agent it
    // is varies every run — nothing about the roles is fixed.
    type Id = "a" | "b" | "c";
    const ALL: Id[] = ["a", "b", "c"];
    const LABEL: Record<Id, string> = { a: "Agent A", b: "Agent B", c: "Agent C" };
    const ACTOR: Record<Id, LogEntry["actor"]> = { a: "agent_a", b: "agent_b", c: "agent_c" };
    const shuffle = <T,>(arr: T[]): T[] => arr.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

    const writer: Id = ALL[Math.floor(Math.random() * 3)];
    const researchers = shuffle(ALL.filter((i) => i !== writer)); // two agents, random order
    const order: Id[] = [...researchers, writer];                 // writer always last

    // Runs an agent on the model bound to its label (A=GPT-5.5, B=DeepSeek, C=Groq)
    async function runAgent(id: Id, system: string, user: string, timeoutMs: number): Promise<string> {
      if (id === "a") {
        const r = await client.chat.completions.create(
          { model: "gpt-5.5", reasoning_effort: "none", messages: [{ role: "system", content: system }, { role: "user", content: user }] },
          { timeout: timeoutMs }
        );
        return r.choices[0].message.content ?? "";
      }
      if (id === "b") return callDeepSeek([{ role: "system", content: system }, { role: "user", content: user }] as Msg[], 0.7, timeoutMs);
      return callGroq([{ role: "system", content: system }, { role: "user", content: user }] as Msg[], 0.7, timeoutMs);
    }

    // ── STEP 0: Orchestrator plans the pipeline (GPT-5.5) ────────────────────
    const planRes = await trackCall(metrics, () => client.chat.completions.create({
      model: "gpt-5.5",
      reasoning_effort: "none",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are the Main Orchestrator coordinating three AI agents (Agent A, Agent B, Agent C) who work in sequence to produce one industrial report on "${topic}".

For THIS run, the execution order is: ${order.map((i) => LABEL[i]).join(" → ")}. ${LABEL[writer]} works LAST and writes the FINAL report; the other two do the research/analysis groundwork first.

Assign a clear, specific task to EACH agent that fits this order. If the user assigned a specific role/instruction to any agent, you MUST use it exactly. Otherwise vary the roles based on the topic and this suggested strategy: ${DIVISION_STRATEGIES[Math.floor(Math.random() * DIVISION_STRATEGIES.length)]}

Return JSON: { "plan": string, "agentATask": string, "agentBTask": string, "agentCTask": string }`,
        },
        {
          role: "user",
          content: isReRun
            ? `Round ${round}. The user was not satisfied with the previous report:\n${previousSummary}\n\nUser feedback: "${userMessage}"\n\nRe-plan the three agents' tasks (execution order ${order.map((i) => LABEL[i]).join(" → ")}) to address this feedback. Return JSON.`
            : `Report topic: "${topic}".\n\nUser requirements / role assignments: "${requirements || "None — you decide how to divide the work."}"\n\nAssign tasks to A, B, and C for the execution order ${order.map((i) => LABEL[i]).join(" → ")}. Return JSON.`,
        },
      ],
    }, { timeout: 15000 }), 0);
    const plan = safeParse(planRes.choices[0].message.content);
    const tasks: Record<Id, string> = {
      a: plan.agentATask || `Contribute to the report on "${topic}".`,
      b: plan.agentBTask || `Contribute to the report on "${topic}".`,
      c: plan.agentCTask || `Contribute to the report on "${topic}".`,
    };
    logs.push(log("orchestrator", "plan", plan.plan ?? `Dividing the work — execution order ${order.map((i) => LABEL[i]).join(" → ")}.`));

    const outputs: Record<Id, string> = { a: "", b: "", c: "" };

    // ── Execute the two researchers, then the writer, with live reviews ──────
    for (let step = 0; step < order.length; step++) {
      const id = order[step];
      const isWriter = id === writer;
      const priorWork = order.slice(0, step).map((p) => `${LABEL[p]}'s contribution:\n${outputs[p]}`).join("\n\n");

      logs.push(log("orchestrator", "assignment", `Assigning to ${LABEL[id]} — ${tasks[id]}`));

      let system: string;
      let user: string;
      if (isWriter) {
        system = `You are ${LABEL[id]}, the final agent in a 3-agent collaborative pipeline. Using your teammates' work, produce the FINAL industrial report on "${topic}". Write in clear, professional prose with in-text citations in Author (Year) format. Do NOT use memo or letter format (no To:/From:/Date: headers).

CRITICAL CITATION RULES:
- NEVER cite "Agent A", "Agent B", or "Agent C" as a source. They are your teammates, not references.
- Cite only the real organizations, companies, reports, or authors mentioned in the teammates' contributions (e.g. McKinsey, Deloitte, Siemens, Gartner, World Economic Forum, etc.).
- End with a "References" section listing each cited real source in APA format, one per line. Never list an Agent as a reference.`;
        user = `Your assigned task: ${tasks[id]}\n\n${priorWork}${requirements ? `\n\nOverall user requirements: ${requirements}` : ""}\n\nWrite the final report (about 300 words) with in-text citations to the REAL sources mentioned above, followed by the References section. Return ONLY the report and references.`;
      } else {
        system = `You are ${LABEL[id]}, a contributing agent in a 3-agent collaborative pipeline producing an industrial report on "${topic}". Complete your assigned task — focused and concise (under 250 words). Where relevant, reference real, named industry sources (e.g. McKinsey, Deloitte, Gartner, World Economic Forum) with approximate years so the final report can cite them. Your output will be passed to the next agent. Return only your work, no preamble.`;
        user = `Your assigned task: ${tasks[id]}${priorWork ? `\n\nWork so far from your teammates:\n${priorWork}` : ""}${requirements ? `\n\nOverall user requirements: ${requirements}` : ""}`;
      }

      // GPT-5.5 (Agent A) needs more headroom than the faster DeepSeek/Groq agents
      const agentTimeout = id === "a" ? 30000 : 20000;
      const out = await trackCall(metrics, () => runAgent(id, system, user, agentTimeout), 0)
        .catch((e) => { throw new Error(`${LABEL[id]} failed: ${e.message}`); });
      outputs[id] = out;
      logs.push(log(ACTOR[id], "output", isWriter ? `Final report drafted (${out.split(/\s+/).length} words).` : snippet(out)));

      // Orchestrator hands off to the next agent (derived from real output — no extra LLM call)
      if (!isWriter) {
        const next = order[step + 1];
        logs.push(log("orchestrator", "review", `Reviewed ${LABEL[id]}'s contribution (${out.split(/\s+/).length} words). Passing the work to ${LABEL[next]}.`));
      }
    }

    // Seeded-error manipulation: inserted into the final report the participant
    // reviews (after generation, so the error is held constant across runs).
    if (seedError) outputs[writer] = injectSeededError(outputs[writer]);
    const summary = outputs[writer];

    // ── Orchestrator completion message (built from this run's real data) ────
    // Derived from the actual execution order/writer rather than an extra LLM
    // call, to keep the sequential pipeline within the serverless time limit.
    const researcherLabels = order.filter((i) => i !== writer).map((i) => LABEL[i]);
    const finalMessage = `${researcherLabels.join(" and ")} carried out the research and analysis, and ${LABEL[writer]} synthesised their work into the final ${summary.split(/\s+/).length}-word report. Please review it below.`;
    logs.push(log("orchestrator", "final", finalMessage));

    return NextResponse.json({
      success: true,
      logs,
      summary,
      writer,
      order,
      tasks: { agentA: tasks.a, agentB: tasks.b, agentC: tasks.c },
      contributions: { agentA: outputs.a, agentB: outputs.b, agentC: outputs.c },
      orchestratorMessage: finalMessage,
      modelRouting: modelRouting(),
      seededErrorInjected: seedError,
      ...summariseMetrics(metrics),
      round,
    });
  } catch (err) {
    let message = "Orchestration failed";
    if (err instanceof Error && typeof err.message === "string") message = err.message;
    else if (typeof err === "string") message = err;
    else if (err) { try { message = JSON.stringify(err); } catch { /* keep default */ } }
    console.error("[collaborative orchestrator]", message, err);
    return NextResponse.json({ error: message, logs }, { status: 500 });
  }
}
