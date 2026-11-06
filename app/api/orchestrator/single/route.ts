import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { checkEnv } from "@/lib/env";
import { createMetrics, trackCall, summariseMetrics } from "@/lib/api-helpers";
import { injectSeededError } from "@/lib/study-config";
checkEnv();

export const maxDuration = 60;

/**
 * Single-agent baseline condition: one AI agent writes the report, with no
 * orchestrator and no other agents. Same model as Agent A and the same report
 * format/length as the multi-agent conditions.
 */

const MODEL = "gpt-5.5";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 40000,
  maxRetries: 1,
});

export type LogEntry = {
  id: string;
  timestamp: string;
  actor: "agent_a";
  type: "output";
  content: string;
};

export async function POST(req: NextRequest) {
  let body: { topic?: string; userMessage?: string; previousReport?: string; round?: number; seedError?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
  }
  const { topic, userMessage, previousReport, round = 1, seedError = false } = body;
  if (!topic || !topic.trim()) {
    return NextResponse.json({ error: "Topic is required", code: "MISSING_TOPIC" }, { status: 400 });
  }

  const metrics = createMetrics();
  const requirements = userMessage && userMessage !== "No specific requirements." ? userMessage : "";
  const isReRun = round > 1 && previousReport;

  const system = `You are an AI agent writing an industry report. Write in clear, professional prose with in-text citations in Author (Year) format. Do NOT use memo or letter format (no To:/From:/Date: headers). End with a "References" section listing each cited source in APA format, one per line. Return ONLY the report followed by the References section.`;
  const user = isReRun
    ? `Revise your report based on this feedback: "${userMessage}".\n\nPrevious version:\n${previousReport}\n\nWrite the revised report (about 300 words).`
    : `Task: ${topic}.${requirements ? `\n\nUser requirements: ${requirements}` : ""}\n\nWrite the report (about 300 words).`;

  try {
    const res = await trackCall(metrics, () =>
      client.chat.completions.create({
        model: MODEL,
        reasoning_effort: "none",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }), 1
    );
    let report = res.choices[0].message.content ?? "";
    if (seedError) report = injectSeededError(report);

    const logs: LogEntry[] = [{
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actor: "agent_a",
      type: "output",
      content: `Report drafted (${report.split(/\s+/).length} words).`,
    }];

    return NextResponse.json({
      success: true,
      logs,
      report,
      modelRouting: { a: { provider: "openai", model: MODEL } },
      seededErrorInjected: seedError,
      ...summariseMetrics(metrics),
      round,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("[single agent]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
