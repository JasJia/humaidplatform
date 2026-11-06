"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TASK } from "@/lib/data";
import { logEvent, getEvents } from "@/lib/event-logger";
import { computeProvenance, summariseProvenance } from "@/lib/provenance";
import { editDistance, wordDelta } from "@/lib/edit-distance";
import { containsSeededError } from "@/lib/study-config";

type LogEntry = {
  id: string;
  timestamp: string;
  actor: "orchestrator" | "agent_a" | "agent_b" | "agent_c";
  type: "plan" | "assignment" | "output" | "review" | "final";
  content: string;
};

type ModelRouting = Record<string, { provider: string; model: string }>;

type Round = {
  roundNumber: number;
  userMessage: string;
  logs: LogEntry[];
  summary: string;
  contributions?: { agentA: string; agentB: string; agentC?: string };
  tasks?: { agentA: string; agentB: string; agentC: string };
  writer?: "a" | "b" | "c";
  order?: ("a" | "b" | "c")[];
  modelRouting?: ModelRouting;
  apiLatencyMs?: { perCall: number[]; total: number };
  apiErrorCount?: number;
};

const ACTOR_CONFIG: Record<LogEntry["actor"], { label: string; bg: string; text: string }> = {
  orchestrator: { label: "Orchestrator", bg: "bg-gray-900",     text: "text-white" },
  agent_a:      { label: "Agent A",      bg: "bg-blue-100",     text: "text-blue-800" },
  agent_b:      { label: "Agent B",      bg: "bg-emerald-100",  text: "text-emerald-800" },
  agent_c:      { label: "Agent C",      bg: "bg-violet-100",   text: "text-violet-800" },
};

function wordCount(t: string) { return t.trim().split(/\s+/).filter(Boolean).length; }

/** Split report text into body and references array */
function parseReport(text: string): { body: string; references: string[] } {
  // Match "References", "References:", "REFERENCES", etc. at the start of a line
  const refMatch = text.match(/\n\s*references?:?\s*\n/i);
  if (!refMatch || refMatch.index === undefined) {
    // Also try matching at very start of a line even without leading newline
    const altMatch = text.match(/^references?:?\s*\n/im);
    if (!altMatch || altMatch.index === undefined) return { body: text, references: [] };
    const body = text.slice(0, altMatch.index).trim();
    const refBlock = text.slice(altMatch.index + altMatch[0].length).trim();
    const references = refBlock.split("\n").map((l) => l.replace(/^\s*[-•*\d.]+\s*/, "").trim()).filter(Boolean);
    return { body, references };
  }
  const body = text.slice(0, refMatch.index).trim();
  const refBlock = text.slice(refMatch.index + refMatch[0].length).trim();
  const references = refBlock.split("\n").map((l) => l.replace(/^\s*[-•*\d.]+\s*/, "").trim()).filter(Boolean);
  return { body, references };
}

function scholarUrl(ref: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(ref)}`;
}

function applyInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

/** Render the report body markdown to clean HTML (headings, bold, lists, paragraphs) */
function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<h3 style="font-size:13px;font-weight:600;color:#1f2937;margin:10px 0 4px">${applyInline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<h2 style="font-size:14px;font-weight:700;color:#111827;margin:12px 0 4px">${applyInline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<h1 style="font-size:15px;font-weight:700;color:#111827;margin:12px 0 6px">${applyInline(line.slice(2))}</h1>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) { result.push('<ul style="margin:4px 0;padding-left:16px">'); inList = true; }
      result.push(`<li style="font-size:13px;color:#374151;line-height:1.6;margin:2px 0">${applyInline(line.slice(2))}</li>`);
    } else if (line.trim() === "") {
      if (inList) { result.push("</ul>"); inList = false; }
    } else {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 8px">${applyInline(line)}</p>`);
    }
  }
  if (inList) result.push("</ul>");
  return result.join("");
}

// Tracks how far the user has scrolled through a panel (25/50/75/100% milestones).
// Returns a callback ref — pass it directly to a div's `ref` prop.
function useScrollDepth(label: string) {
  const fired = useRef(new Set<number>());
  const cleanupRef = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    fired.current.clear();
    if (!el) return;
    const element = el;
    function check() {
      const rect = element.getBoundingClientRect();
      if (rect.height === 0) return;
      const pct = Math.min(100, Math.max(0, ((window.innerHeight - rect.top) / rect.height) * 100));
      [25, 50, 75, 100].forEach((milestone) => {
        if (pct >= milestone && !fired.current.has(milestone)) {
          fired.current.add(milestone);
          logEvent("scroll_depth", { panel: label, depthPct: milestone });
        }
      });
    }
    window.addEventListener("scroll", check, { passive: true });
    check();
    cleanupRef.current = () => window.removeEventListener("scroll", check);
  }, [label]);
}

function useTimer() {
  const [s, setS] = useState(0);
  useEffect(() => { const i = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function LogBubble({ entry }: { entry: LogEntry }) {
  const cfg = ACTOR_CONFIG[entry.actor];
  return (
    <div className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 h-fit mt-0.5 ${cfg.bg} ${cfg.text}`}>
        {cfg.label}
      </span>
      <span className="text-xs text-gray-600 leading-relaxed">{entry.content}</span>
    </div>
  );
}

function LogSkeleton() {
  return (
    <div className="space-y-3 py-2">
      {["w-3/4", "w-full", "w-5/6", "w-2/3", "w-full", "w-4/5", "w-3/4", "w-full"].map((w, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-5 w-20 bg-gray-200 rounded animate-pulse flex-shrink-0" />
          <div className={`h-4 bg-gray-100 rounded animate-pulse ${w}`} />
        </div>
      ))}
    </div>
  );
}

export default function CollaborativePage() {
  const router = useRouter();
  const timer = useTimer();
  const submittingRef = useRef(false);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [phase, setPhase] = useState<"brief" | "running" | "complete">("brief");
  const [userBrief, setUserBrief] = useState("");
  const [userTask, setUserTask] = useState("");
  const [preferences, setPreferences] = useState("");
  const [agentAInstruction, setAgentAInstruction] = useState("");
  const [agentBInstruction, setAgentBInstruction] = useState("");
  const [agentCInstruction, setAgentCInstruction] = useState("");
  const [showAgentAssign, setShowAgentAssign] = useState(false);
  const [disagreeText, setDisagreeText] = useState("");
  const [showDisagree, setShowDisagree] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [finalText, setFinalText] = useState("");
  const [originalSummary, setOriginalSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [actualTask, setActualTask] = useState(TASK.topic);
  const [taskWasCustomized, setTaskWasCustomized] = useState(false);
  const [seedError, setSeedError] = useState(false);

  const logPanelRef = useScrollDepth("orchestrator_log");
  const reportPanelRef = useScrollDepth("final_report");

  useEffect(() => {
    // Task already submitted (e.g. browser Back) — continue to the questionnaire.
    if (sessionStorage.getItem("humaid_session_data")) { router.replace("/submit"); return; }
    if (sessionStorage.getItem("humaid_mode") !== "collaborative") { router.replace("/"); return; }
    setSeedError(sessionStorage.getItem("humaid_seed_error") === "1");
    logEvent("session_start", { mode: "collaborative" });
    const handler = (e: BeforeUnloadEvent) => {
      if (submittingRef.current) return;
      e.preventDefault(); e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [router]);

  async function runPipeline(message: string, roundNum: number, topicOverride?: string) {
    setPhase("running");
    setError(null);
    logEvent("orchestrator_start", { round: roundNum, message });

    try {
      const res = await fetch("/api/orchestrator/collaborative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicOverride ?? TASK.topic,
          userMessage: message,
          previousSummary: (finalText || currentRound?.summary) ?? null,
          round: roundNum,
          seedError,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let errMsg = `Server error (HTTP ${res.status})`;
        try {
          const j = JSON.parse(text);
          const e = j.error ?? j.message;
          if (typeof e === "string") errMsg = e;
          else if (e && typeof e === "object") errMsg = (e as { message?: string }).message ?? JSON.stringify(e);
        } catch {
          if (text) errMsg = text.slice(0, 200);
        }
        throw new Error(errMsg);
      }
      const data = await res.json();

      const round: Round = {
        roundNumber: roundNum,
        userMessage: message,
        logs: data.logs ?? [],
        summary: data.summary ?? "",
        contributions: data.contributions,
        tasks: data.tasks,
        writer: data.writer,
        order: data.order,
        modelRouting: data.modelRouting,
        apiLatencyMs: data.apiLatencyMs,
        apiErrorCount: data.apiErrorCount,
      };
      setRounds((prev) => [...prev, round]);
      setCurrentRound(round);
      setFinalText(data.summary ?? "");
      if (roundNum === 1) setOriginalSummary(data.summary ?? "");
      setPhase("complete");
      setShowDisagree(false);
      setDisagreeText("");
      logEvent("orchestrator_complete", { round: roundNum });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The orchestrator encountered an error.";
      setError(msg);
      setPhase(roundNum === 1 ? "brief" : "complete");
      logEvent("orchestrator_error", { round: roundNum });
    }
  }

  function handleStart() {
    const taskInput = TASK.topic;
    setActualTask(taskInput);
    setTaskWasCustomized(
      Boolean(
        userTask.trim() ||
        preferences.trim() ||
        agentAInstruction.trim() ||
        agentBInstruction.trim() ||
        agentCInstruction.trim()
      )
    );
    const combinedMessage = [
      preferences.trim(),
      agentAInstruction.trim() ? `Agent A instructions: ${agentAInstruction.trim()}` : "",
      agentBInstruction.trim() ? `Agent B instructions: ${agentBInstruction.trim()}` : "",
      agentCInstruction.trim() ? `Agent C instructions: ${agentCInstruction.trim()}` : "",
    ].filter(Boolean).join("\n") || "No specific requirements.";
    runPipeline(combinedMessage, 1, taskInput);
  }

  function handleDisagree() {
    const msg = disagreeText.trim();
    if (!msg) return;
    const nextRound = rounds.length + 1;
    logEvent("user_disagree", { round: nextRound, feedback: msg });
    runPipeline(msg, nextRound);
  }

  function handleTextareaChange(text: string) {
    setFinalText(text);
    clearTimeout(editDebounceRef.current);
    editDebounceRef.current = setTimeout(() => {
      logEvent("textarea_edit", { charCount: text.length, wordCount: wordCount(text) });
    }, 1500);
  }

  async function handleSubmit() {
    submittingRef.current = true;
    const provenanceSources = [
      { id: "final_report", text: originalSummary },
      ...(currentRound?.contributions ? [
        { id: "agent_a_contribution", text: currentRound.contributions.agentA },
        { id: "agent_b_contribution", text: currentRound.contributions.agentB },
        { id: "agent_c_contribution", text: currentRound.contributions.agentC ?? "" },
      ] : []),
    ];
    const provenanceSpans = computeProvenance(finalText, provenanceSources);
    const provenanceSummary = summariseProvenance(provenanceSpans);
    logEvent("session_end", { provenanceSummary, totalRounds: rounds.length });

    // ── Assemble the data-quality fields for the session record ──────────────
    const startedAt = sessionStorage.getItem("humaid_start_time");
    const completedAt = new Date().toISOString();
    const totalDurationMs = startedAt
      ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
      : 0;
    const timeOnInstructionsMs = Number(sessionStorage.getItem("humaid_time_on_instructions_ms")) || null;
    const allLatencies = rounds.flatMap((r) => r.apiLatencyMs?.perCall ?? []);
    const apiLatencyMs = { perCall: allLatencies, total: allLatencies.reduce((a, b) => a + b, 0) };
    const apiErrorCount = rounds.reduce((a, r) => a + (r.apiErrorCount ?? 0), 0);
    const agentDisplayOrder = (currentRound?.order ?? ["a", "b", "c"]).map((id) => `Agent ${id.toUpperCase()}`);

    const sessionData = {
      sessionId: sessionStorage.getItem("humaid_session_id"),
      mode: "collaborative",
      task: TASK.topic,
      // Data-quality schema fields
      conditionAssignmentMethod: sessionStorage.getItem("humaid_assignment_method") ?? "unknown",
      condition: "collaborative",
      seededErrorCondition: seedError,
      seededErrorRetained: seedError ? containsSeededError(finalText) : null,
      editDistanceFromBase: editDistance(currentRound?.summary ?? "", finalText),
      actualTask,
      taskWasCustomized,
      agentDisplayOrder,
      modelRouting: currentRound?.modelRouting ?? null,
      startedAt,
      completedAt,
      totalDurationMs,
      timeOnInstructionsMs,
      timeViewingEachAgentMs: {}, // collaborative has no per-agent view panels
      editDistance: editDistance(originalSummary, finalText),
      wordDelta: wordDelta(originalSummary, finalText),
      rerunCount: Math.max(0, rounds.length - 1),
      acceptedCoordinatorRecommendation: null, // n/a in collaborative mode
      apiLatencyMs,
      apiErrorCount,
      // Existing fields
      startTime: sessionStorage.getItem("humaid_start_time"),
      endTime: completedAt,
      totalRounds: rounds.length,
      finalSubmission: finalText,
      originalSubmission: originalSummary,
      wasEdited: finalText !== originalSummary,
      originalLength: originalSummary.length,
      finalLength: finalText.length,
      charsAdded: Math.max(0, finalText.length - originalSummary.length),
      charsRemoved: Math.max(0, originalSummary.length - finalText.length),
      provenanceSpans,
      provenanceSummary,
      rounds: rounds.map((r) => ({
        roundNumber: r.roundNumber,
        userMessage: r.userMessage,
        logs: r.logs,
        tasks: r.tasks,
        contributions: r.contributions,
        summary: r.summary,
        writer: r.writer,
        order: r.order,
      })),
      events: getEvents(),
    };
    sessionStorage.setItem("humaid_session_data", JSON.stringify(sessionData));
    await new Promise(r => setTimeout(r, 50));
    router.push("/submit");
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <span />
        <span className="font-mono text-xs text-gray-400 tabular-nums">{timer}</span>
      </div>

      <div className="mb-6" style={{ textAlign: "center" }}>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Collaborative Mode</h1>
        <p className="text-sm text-gray-500">The Orchestrator coordinates Agent A, B, and C through a sequential pipeline. You can see every decision it makes.</p>
      </div>

      {/* How it works */}
      <div className="border border-gray-200 rounded-lg p-5 mb-6 bg-gray-50">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">How It Works</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          The Orchestrator coordinates the entire pipeline and dynamically assigns a different role to each AI agent based on your prompt. The roles are not fixed — the Orchestrator decides how to best divide the work. You can also assign specific roles to each agent yourself before starting, in which case the Orchestrator will follow your instructions instead.
        </p>
      </div>

      {/* Brief phase */}
      {phase === "brief" && (
        <div className="border border-gray-200 rounded-lg p-6 bg-white space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Your Task</label>
            <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3">{TASK.topic}.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Preferences &amp; Requirements
            </label>
            <p className="text-xs text-gray-400 mb-2">Specify any constraints, tone, audience, or focus areas for the Orchestrator.</p>
            <textarea
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="e.g., Focus on cost implications, keep the tone practical, target audience is senior managers..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors"
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPreferences("Focus on cost implications, keep the tone practical, target audience is senior managers")}
                className="text-xs font-medium border border-gray-300 text-gray-500 hover:bg-gray-900 hover:border-gray-900 hover:text-white px-3 py-1.5 rounded-md transition-colors"
              >
                Use default preferences
              </button>
              {preferences && (
                <button
                  type="button"
                  onClick={() => setPreferences("")}
                  className="text-xs font-medium border border-red-200 text-red-400 hover:bg-red-500 hover:border-red-500 hover:text-white px-3 py-1.5 rounded-md transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAgentAssign((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg
                style={{ transform: showAgentAssign ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Assign specific roles to agents
            </button>

            {showAgentAssign && (
              <div className="mt-4 space-y-4 pl-6 border-l border-gray-100">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Agent A — Data Collection</label>
                  <textarea
                    value={agentAInstruction}
                    onChange={(e) => setAgentAInstruction(e.target.value)}
                    placeholder="e.g., Focus on data collection from recent 2025–2026 sources"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setAgentAInstruction("Focus on data collection from recent 2025–2026 sources")}
                      className="text-xs font-medium border border-gray-300 text-gray-500 hover:bg-gray-900 hover:border-gray-900 hover:text-white px-3 py-1.5 rounded-md transition-colors"
                    >
                      Use default
                    </button>
                    {agentAInstruction && (
                      <button type="button" onClick={() => setAgentAInstruction("")} className="text-xs font-medium border border-red-200 text-red-400 hover:bg-red-500 hover:border-red-500 hover:text-white px-3 py-1.5 rounded-md transition-colors">Clear</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Agent B — Analysis & Statistics</label>
                  <textarea
                    value={agentBInstruction}
                    onChange={(e) => setAgentBInstruction(e.target.value)}
                    placeholder="e.g., Include statistical trends and market size data"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setAgentBInstruction("Include statistical trends and market size data")}
                      className="text-xs font-medium border border-gray-300 text-gray-500 hover:bg-gray-900 hover:border-gray-900 hover:text-white px-3 py-1.5 rounded-md transition-colors"
                    >
                      Use default
                    </button>
                    {agentBInstruction && (
                      <button type="button" onClick={() => setAgentBInstruction("")} className="text-xs font-medium border border-red-200 text-red-400 hover:bg-red-500 hover:border-red-500 hover:text-white px-3 py-1.5 rounded-md transition-colors">Clear</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Agent C — Summary Writing</label>
                  <textarea
                    value={agentCInstruction}
                    onChange={(e) => setAgentCInstruction(e.target.value)}
                    placeholder="e.g., Write in an executive summary style, 300 words max"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setAgentCInstruction("Write in an executive summary style, 300 words max")}
                      className="text-xs font-medium border border-gray-300 text-gray-500 hover:bg-gray-900 hover:border-gray-900 hover:text-white px-3 py-1.5 rounded-md transition-colors"
                    >
                      Use default
                    </button>
                    {agentCInstruction && (
                      <button type="button" onClick={() => setAgentCInstruction("")} className="text-xs font-medium border border-red-200 text-red-400 hover:bg-red-500 hover:border-red-500 hover:text-white px-3 py-1.5 rounded-md transition-colors">Clear</button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={handleStart} className="w-full bg-gray-900 hover:bg-gray-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            Start Task
          </button>
        </div>
      )}

      {/* Running phase */}
      {phase === "running" && (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <svg className="w-10 h-10 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <div style={{ textAlign: "center" }}>
            <p className="text-sm font-medium text-gray-700">Orchestrator is coordinating the pipeline…</p>
            <p className="text-xs text-gray-400 mt-1">Each agent is being briefed and reviewed. This takes about a minute.</p>
          </div>
        </div>
      )}

      {/* Complete phase */}
      {phase === "complete" && currentRound && (
        <>
          {/* Past rounds (collapsed) */}
          {rounds.slice(0, -1).map((r) => (
            <div key={r.roundNumber} className="border border-gray-100 rounded-lg mb-3 overflow-hidden">
              <button
                onClick={() => setExpandedRounds((prev) => { const s = new Set(prev); s.has(r.roundNumber) ? s.delete(r.roundNumber) : s.add(r.roundNumber); return s; })}
                className="w-full px-5 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-sm text-gray-600 font-medium">Round {r.roundNumber} — "{r.userMessage.slice(0, 60)}{r.userMessage.length > 60 ? "…" : ""}"</span>
                </div>
                <span className="text-xs text-gray-400">{expandedRounds.has(r.roundNumber) ? "Hide" : "Show"} log</span>
              </button>
              {expandedRounds.has(r.roundNumber) && (
                <div className="px-5 py-3 divide-y divide-gray-50">
                  {r.logs.map((entry) => <LogBubble key={entry.id} entry={entry} />)}
                </div>
              )}
            </div>
          ))}

          {/* Current round log */}
          <div ref={logPanelRef} className="border border-gray-300 rounded-lg overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">Round {currentRound.roundNumber} — Orchestrator Log</p>
                <p className="text-xs text-gray-400 mt-0.5">{currentRound.logs.length} events · 3 agents collaborated</p>
              </div>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">Complete</span>
            </div>
            <div className="px-5 py-3 divide-y divide-gray-50">
              {currentRound.logs.map((entry) => <LogBubble key={entry.id} entry={entry} />)}
            </div>
          </div>

          {/* Final output */}
          {(() => {
            const { body, references } = parseReport(finalText);
            return (
              <div ref={reportPanelRef} className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Your Report</p>
                    <p className="text-xs text-gray-400 mt-0.5">Produced by {currentRound.writer ? `Agent ${currentRound.writer.toUpperCase()}` : "the final agent"} and reviewed by the Orchestrator. Edit before submitting.</p>
                  </div>
                  <button
                    onClick={() => setEditMode((v) => !v)}
                    style={{ fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", color: "#6b7280", cursor: "pointer", flexShrink: 0 }}
                  >
                    {editMode ? "Preview" : "Edit"}
                  </button>
                </div>
                <div className="p-5">
                  {editMode ? (
                    <textarea
                      value={body}
                      onChange={(e) => handleTextareaChange(
                        references.length
                          ? `${e.target.value}\n\nReferences\n${references.join("\n")}`
                          : e.target.value
                      )}
                      rows={13}
                      className="w-full border border-gray-200 rounded-lg p-4 text-sm text-gray-700 leading-relaxed resize-none focus:outline-none focus:border-gray-400 transition-colors font-mono"
                    />
                  ) : (
                    <div
                      className="border border-gray-100 rounded-lg p-4 bg-gray-50 min-h-40 cursor-text"
                      onClick={() => setEditMode(true)}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
                    />
                  )}
                  <p className="text-xs text-gray-400 mt-1.5">
                    {finalText !== originalSummary ? "Modified from original — " : ""}
                    {wordCount(finalText)} words · {editMode ? "editing" : "click to edit"}
                  </p>
                </div>

                {references.length > 0 && (
                  <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">References</p>
                    <ol className="space-y-2">
                      {references.map((ref, i) => (
                        <li key={i} className="flex gap-2 text-xs text-gray-600 leading-relaxed">
                          <span className="text-gray-300 flex-shrink-0 font-mono">{i + 1}.</span>
                          <span>
                            {ref}{" "}
                            <a
                              href={scholarUrl(ref)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700 underline underline-offset-2 transition-colors ml-1.5 text-xs"
                            >
                              Link
                            </a>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="px-5 pb-5 flex justify-center">
                  <button onClick={handleSubmit} className="bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium px-6 py-2.5 rounded-md transition-colors">
                    Submit final answer
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Disagree section */}
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <button
              onClick={() => setShowDisagree(!showDisagree)}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className={`w-4 h-4 transition-transform ${showDisagree ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              Not satisfied? Ask the Orchestrator to revise
            </button>
            {showDisagree && (
              <div className="mt-4">
                <p className="text-xs text-gray-400 mb-2">Tell the Orchestrator what to improve. It will run the full pipeline again with your feedback.</p>
                <textarea
                  value={disagreeText}
                  onChange={(e) => setDisagreeText(e.target.value)}
                  placeholder="e.g., The report is too academic. Make it more practical and focused on cost implications..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors mb-2"
                />
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => setDisagreeText("The report is too academic. Make it more practical and focused on cost implications for senior managers.")}
                    className="text-xs font-medium border border-gray-300 text-gray-500 hover:bg-gray-900 hover:border-gray-900 hover:text-white px-3 py-1.5 rounded-md transition-colors"
                  >
                    Use default feedback
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisagreeText("")}
                    disabled={!disagreeText}
                    className="text-xs font-medium border border-red-200 text-red-400 hover:bg-red-500 hover:border-red-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors"
                  >
                    Clear
                  </button>
                </div>
                {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={handleDisagree}
                    disabled={!disagreeText.trim()}
                    className="bg-gray-900 hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-md transition-colors"
                  >
                    Submit feedback — Run Round {rounds.length + 1}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}


