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
  type: "plan" | "assignment" | "output" | "critique" | "decision" | "final";
  content: string;
};

type AgentOutput = {
  id: number;
  name: string;
  style: string;
  output: string;
  critique: string;
};

type ModelRouting = Record<string, { provider: string; model: string }>;

type Round = {
  roundNumber: number;
  userMessage: string;
  logs: LogEntry[];
  agentOutputs: AgentOutput[];
  finalVersion: string;
  coordinatorDecision: string;
  coordinatorRationale: string;
  recommendedAgentId?: number;
  modelRouting?: ModelRouting;
  apiLatencyMs?: { perCall: number[]; total: number };
  apiErrorCount?: number;
};

const ACTOR_CONFIG: Record<LogEntry["actor"], { label: string; bg: string; text: string }> = {
  orchestrator: { label: "Orchestrator", bg: "bg-gray-900",    text: "text-white" },
  agent_a:      { label: "Agent A",     bg: "bg-blue-100",    text: "text-blue-800" },
  agent_b:      { label: "Agent B",     bg: "bg-emerald-100", text: "text-emerald-800" },
  agent_c:      { label: "Agent C",     bg: "bg-violet-100",  text: "text-violet-800" },
};


function wordCount(t: string) { return t.trim().split(/\s+/).filter(Boolean).length; }

function scholarUrl(ref: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(ref)}`;
}

function applyInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inList = false;
  let inRefSection = false;
  let inRefList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(\*{1,2})?references?:?(\*{1,2})?\s*$/i.test(trimmed)) {
      if (inList) { result.push("</ul>"); inList = false; }
      if (inRefList) { result.push("</ol>"); inRefList = false; }
      result.push(`<p style="font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;margin:16px 0 8px;border-top:1px solid #e5e7eb;padding-top:12px">References</p>`);
      inRefSection = true;
      continue;
    }
    if (inRefSection && trimmed !== "") {
      if (!inRefList) { result.push('<ol style="margin:0;padding-left:20px;list-style-type:decimal">'); inRefList = true; }
      const clean = trimmed.replace(/^\d+\.\s*/, "");
      const link = `<a href="${scholarUrl(clean)}" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;font-size:11px;margin-left:6px;text-decoration:underline">Link</a>`;
      result.push(`<li style="font-size:12px;color:#4b5563;line-height:1.8;margin:5px 0;padding-left:4px">${applyInline(clean)}${link}</li>`);
      continue;
    }
    if (trimmed === "") { inRefSection = false; }
    if (line.startsWith("### ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      if (inRefList) { result.push("</ol>"); inRefList = false; }
      result.push(`<h3 style="font-size:12px;font-weight:600;color:#1f2937;margin:10px 0 4px">${applyInline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      if (inRefList) { result.push("</ol>"); inRefList = false; }
      result.push(`<h2 style="font-size:13px;font-weight:700;color:#111827;margin:12px 0 4px">${applyInline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<h1 style="font-size:14px;font-weight:700;color:#111827;margin:12px 0 6px">${applyInline(line.slice(2))}</h1>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) { result.push('<ul style="margin:4px 0;padding-left:16px">'); inList = true; }
      result.push(`<li style="font-size:12px;color:#4b5563;line-height:1.6;margin:2px 0">${applyInline(line.slice(2))}</li>`);
    } else if (line.trim() === "") {
      if (inList) { result.push("</ul>"); inList = false; }
    } else {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<p style="font-size:12px;color:#4b5563;line-height:1.6;margin:0 0 8px">${applyInline(line)}</p>`);
    }
  }
  if (inList) result.push("</ul>");
  if (inRefList) result.push("</ol>");
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

function AgentOutputPanel({ agent, onSelect, isSelected }: { agent: AgentOutput; onSelect?: () => void; isSelected?: boolean }) {
  const ref = useScrollDepth(agent.name.toLowerCase().replace(/\s+/g, "_"));
  return (
    <div ref={ref} className="px-5 pb-4 space-y-3">
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs font-medium text-gray-400 mb-1.5">Output</p>
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(agent.output) }} />
      </div>
      {agent.critique && (
        <div className="bg-amber-50 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-600 mb-1.5">Critique from this agent on the others</p>
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(agent.critique) }} />
        </div>
      )}
    </div>
  );
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
      {["w-3/4", "w-full", "w-5/6", "w-2/3", "w-full", "w-4/5", "w-3/4", "w-full", "w-2/3", "w-full"].map((w, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-5 w-20 bg-gray-200 rounded animate-pulse flex-shrink-0" />
          <div className={`h-4 bg-gray-100 rounded animate-pulse ${w}`} />
        </div>
      ))}
    </div>
  );
}

export default function CompetitivePage() {
  const router = useRouter();
  const timer = useTimer();
  const submittingRef = useRef(false);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Accumulated time each agent panel has been open (keyed by agent id), and the
  // timestamp at which each currently-open panel was expanded.
  const agentViewMsRef = useRef<Record<number, number>>({});
  const agentOpenAtRef = useRef<Record<number, number>>({});

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
  const [originalFinal, setOriginalFinal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [expandedAgents, setExpandedAgents] = useState<Set<number>>(new Set());
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [actualTask, setActualTask] = useState(TASK.topic);
  const [taskWasCustomized, setTaskWasCustomized] = useState(false);
  // Study condition: with or without the orchestrator's recommendation shown.
  const [showRec, setShowRec] = useState(true);
  const [seedError, setSeedError] = useState(false);
  // Text of the report the participant started editing from (recommended or chosen).
  const [baseText, setBaseText] = useState("");

  useEffect(() => {
    // Task already submitted (e.g. browser Back) — continue to the questionnaire.
    if (sessionStorage.getItem("humaid_session_data")) { router.replace("/submit"); return; }
    const m = sessionStorage.getItem("humaid_mode");
    if (m !== "competitive" && m !== "competitive_norec") { router.replace("/"); return; }
    setShowRec(m === "competitive");
    setSeedError(sessionStorage.getItem("humaid_seed_error") === "1");
    logEvent("session_start", { mode: m });
    const handler = (e: BeforeUnloadEvent) => {
      if (submittingRef.current) return;
      e.preventDefault(); e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [router]);

  async function runCompetition(message: string, roundNum: number, topicOverride?: string) {
    setPhase("running");
    setError(null);
    logEvent("coordinator_start", { round: roundNum, message });

    try {
      const res = await fetch("/api/orchestrator/competitive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicOverride ?? TASK.topic,
          userMessage: message,
          previousFinal: (finalText || currentRound?.finalVersion) ?? null,
          round: roundNum,
          seedError,
          recommend: showRec,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let errMsg = `Server error (HTTP ${res.status})`;
        try { const j = JSON.parse(text); errMsg = j.error ?? errMsg; } catch { /* not JSON — likely a timeout */ }
        throw new Error(errMsg);
      }
      const data = await res.json();

      const round: Round = {
        roundNumber: roundNum,
        userMessage: message,
        logs: data.logs ?? [],
        agentOutputs: data.agentOutputs ?? [],
        finalVersion: data.finalVersion ?? "",
        coordinatorDecision: data.coordinatorDecision ?? "",
        coordinatorRationale: data.coordinatorRationale ?? "",
        recommendedAgentId: data.recommendedAgentId,
        modelRouting: data.modelRouting,
        apiLatencyMs: data.apiLatencyMs,
        apiErrorCount: data.apiErrorCount,
      };
      setRounds((prev) => [...prev, round]);
      setCurrentRound(round);
      // Without a recommendation, the editor starts empty until a report is chosen.
      const start = showRec ? (data.finalVersion ?? "") : "";
      setFinalText(start);
      setBaseText(start);
      if (roundNum === 1) setOriginalFinal(data.finalVersion ?? "");
      setSelectedAgentId(null);
      setEditMode(false);
      setPhase("complete");
      setShowDisagree(false);
      setDisagreeText("");
      logEvent("coordinator_complete", { round: roundNum });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Error: ${msg}. Please try again.`);
      setPhase(roundNum === 1 ? "brief" : "complete");
      logEvent("coordinator_error", { round: roundNum });
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
    runCompetition(combinedMessage, 1, taskInput);
  }

  function handleDisagree() {
    const msg = disagreeText.trim();
    if (!msg) return;
    const nextRound = rounds.length + 1;
    logEvent("user_disagree", { round: nextRound, feedback: msg });
    runCompetition(msg, nextRound);
  }

  function handleTextareaChange(text: string) {
    setFinalText(text);
    clearTimeout(editDebounceRef.current);
    editDebounceRef.current = setTimeout(() => {
      logEvent("textarea_edit", { charCount: text.length, wordCount: wordCount(text) });
    }, 1500);
  }

  function toggleAgent(id: number) {
    setExpandedAgents((prev) => {
      const s = new Set(prev);
      if (s.has(id)) {
        // Closing — accumulate the time this panel was open.
        s.delete(id);
        const openedAt = agentOpenAtRef.current[id];
        if (openedAt) {
          agentViewMsRef.current[id] = (agentViewMsRef.current[id] ?? 0) + (Date.now() - openedAt);
          delete agentOpenAtRef.current[id];
        }
      } else {
        // Opening — start the timer.
        s.add(id);
        agentOpenAtRef.current[id] = Date.now();
      }
      return s;
    });
  }

  // Add any still-open panels' elapsed time into the accumulator (called at submit).
  function flushAgentViewTimes() {
    const now = Date.now();
    for (const [idStr, openedAt] of Object.entries(agentOpenAtRef.current)) {
      const id = Number(idStr);
      agentViewMsRef.current[id] = (agentViewMsRef.current[id] ?? 0) + (now - openedAt);
    }
    agentOpenAtRef.current = {};
  }

  function handleSelectAgent(agent: AgentOutput) {
    setSelectedAgentId(agent.id);
    setFinalText(agent.output);
    setBaseText(agent.output);
    logEvent("agent_selected", {
      agentId: agent.id,
      agentName: agent.name,
      isRecommended: agent.id === currentRound?.recommendedAgentId,
      replacedEdits: finalText !== baseText,
    });
  }

  async function handleSubmit() {
    submittingRef.current = true;
    const agentOutputSources = currentRound?.agentOutputs.map((a) => ({
      id: `agent_${a.name.replace(/\s+/g, "_")}`,
      text: a.output,
    })) ?? [];
    const coordinatorSources = currentRound ? [
      { id: "coordinator_rationale", text: currentRound.coordinatorRationale },
      { id: "coordinator_decision", text: currentRound.coordinatorDecision },
    ] : [];
    const provenanceSources = [...agentOutputSources, ...coordinatorSources];
    const provenanceSpans = computeProvenance(finalText, provenanceSources);
    const provenanceSummary = summariseProvenance(provenanceSpans);
    logEvent("session_end", { provenanceSummary, totalRounds: rounds.length });

    const selectedAgentName = selectedAgentId !== null
      ? (currentRound?.agentOutputs.find(a => a.id === selectedAgentId)?.name ?? null)
      : null;

    // ── Assemble the data-quality fields for the session record ──────────────
    flushAgentViewTimes();
    const startedAt = sessionStorage.getItem("humaid_start_time");
    const completedAt = new Date().toISOString();
    const totalDurationMs = startedAt
      ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
      : 0;
    const timeOnInstructionsMs = Number(sessionStorage.getItem("humaid_time_on_instructions_ms")) || null;
    const allLatencies = rounds.flatMap((r) => r.apiLatencyMs?.perCall ?? []);
    const apiLatencyMs = { perCall: allLatencies, total: allLatencies.reduce((a, b) => a + b, 0) };
    const apiErrorCount = rounds.reduce((a, r) => a + (r.apiErrorCount ?? 0), 0);
    const agentDisplayOrder = (currentRound?.agentOutputs ?? []).map((a) => a.name);
    const timeViewingEachAgentMs: Record<string, number> = {};
    for (const a of currentRound?.agentOutputs ?? []) {
      timeViewingEachAgentMs[a.name] = agentViewMsRef.current[a.id] ?? 0;
    }

    const sessionData = {
      sessionId: sessionStorage.getItem("humaid_session_id"),
      mode: showRec ? "competitive" : "competitive_norec",
      task: TASK.topic,
      // Data-quality schema fields
      conditionAssignmentMethod: sessionStorage.getItem("humaid_assignment_method") ?? "unknown",
      condition: showRec ? "competitive" : "competitive_norec",
      recommendationShown: showRec,
      seededErrorCondition: seedError,
      seededErrorRetained: seedError ? containsSeededError(finalText) : null,
      recommendedAgentId: currentRound?.recommendedAgentId ?? null,
      recommendedAgentName: currentRound?.recommendedAgentId ? `Agent ${"ABC"[currentRound.recommendedAgentId - 1]}` : null,
      // Whether the final answer is based on the orchestrator's pick (shown or hidden).
      basedOnOrchestratorPick: currentRound?.recommendedAgentId
        ? (selectedAgentId ?? (showRec ? currentRound.recommendedAgentId : null)) === currentRound.recommendedAgentId
        : null,
      editDistanceFromBase: editDistance(baseText, finalText),
      actualTask,
      taskWasCustomized,
      agentDisplayOrder,
      modelRouting: currentRound?.modelRouting ?? null,
      startedAt,
      completedAt,
      totalDurationMs,
      timeOnInstructionsMs,
      timeViewingEachAgentMs,
      editDistance: editDistance(originalFinal, finalText),
      wordDelta: wordDelta(originalFinal, finalText),
      rerunCount: Math.max(0, rounds.length - 1),
      // Kept the orchestrator's recommended report (or re-selected it). N/A when no recommendation shown.
      acceptedCoordinatorRecommendation: showRec
        ? selectedAgentId === null || selectedAgentId === currentRound?.recommendedAgentId
        : null,
      apiLatencyMs,
      apiErrorCount,
      // Existing fields
      startTime: sessionStorage.getItem("humaid_start_time"),
      endTime: completedAt,
      totalRounds: rounds.length,
      coordinatorDecision: currentRound?.coordinatorDecision,
      selectedAgent: selectedAgentId,
      selectedAgentName,
      finalSubmission: finalText,
      originalSubmission: originalFinal,
      wasEdited: finalText !== originalFinal,
      originalLength: originalFinal.length,
      finalLength: finalText.length,
      charsAdded: Math.max(0, finalText.length - originalFinal.length),
      charsRemoved: Math.max(0, originalFinal.length - finalText.length),
      provenanceSpans,
      provenanceSummary,
      rounds: rounds.map((r) => ({ roundNumber: r.roundNumber, userMessage: r.userMessage, logs: r.logs, agentOutputs: r.agentOutputs, coordinatorDecision: r.coordinatorDecision, coordinatorRationale: r.coordinatorRationale })),
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

      <div className="mb-8" style={{ textAlign: "center" }}>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Competitive Mode</h1>
        <p className="text-sm text-gray-500">The Orchestrator runs Agent A, B, and C in parallel and has them critique each other{showRec ? ", then recommends the best output" : ". You decide which output to use"}. You see the full conversation.</p>
      </div>

      {/* Brief phase */}
      {phase === "brief" && (
        <div className="border border-gray-200 rounded-lg p-6 bg-white space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Your Task</label>
            <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3">{TASK.topic}.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Preferences &amp; Requirements</label>
            <p className="text-xs text-gray-400 mb-2">Optional: specify any constraints, tone, or focus areas for the Orchestrator.</p>
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
              <button
                type="button"
                onClick={() => setPreferences("")}
                disabled={!preferences}
                className="text-xs font-medium border border-red-200 text-red-400 hover:bg-red-500 hover:border-red-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors"
              >
                Clear
              </button>
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
              Assign specific styles to agents
            </button>

            {showAgentAssign && (
              <div className="mt-4 space-y-4 pl-6 border-l border-gray-100">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Agent A — Style</label>
                  <textarea
                    value={agentAInstruction}
                    onChange={(e) => setAgentAInstruction(e.target.value)}
                    placeholder="e.g., Focus on data collection from recent 2025–2026 sources"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <button type="button" onClick={() => setAgentAInstruction("Focus on data collection from recent 2025–2026 sources")} className="text-xs font-medium border border-gray-300 text-gray-500 hover:bg-gray-900 hover:border-gray-900 hover:text-white px-3 py-1.5 rounded-md transition-colors">Use default</button>
                    <button type="button" onClick={() => setAgentAInstruction("")} disabled={!agentAInstruction} className="text-xs font-medium border border-red-200 text-red-400 hover:bg-red-500 hover:border-red-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors">Clear</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Agent B — Style</label>
                  <textarea
                    value={agentBInstruction}
                    onChange={(e) => setAgentBInstruction(e.target.value)}
                    placeholder="e.g., Include statistical trends and market size data"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <button type="button" onClick={() => setAgentBInstruction("Include statistical trends and market size data")} className="text-xs font-medium border border-gray-300 text-gray-500 hover:bg-gray-900 hover:border-gray-900 hover:text-white px-3 py-1.5 rounded-md transition-colors">Use default</button>
                    <button type="button" onClick={() => setAgentBInstruction("")} disabled={!agentBInstruction} className="text-xs font-medium border border-red-200 text-red-400 hover:bg-red-500 hover:border-red-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors">Clear</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Agent C — Style</label>
                  <textarea
                    value={agentCInstruction}
                    onChange={(e) => setAgentCInstruction(e.target.value)}
                    placeholder="e.g., Write in an executive summary style, 300 words max"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <button type="button" onClick={() => setAgentCInstruction("Write in an executive summary style, 300 words max")} className="text-xs font-medium border border-gray-300 text-gray-500 hover:bg-gray-900 hover:border-gray-900 hover:text-white px-3 py-1.5 rounded-md transition-colors">Use default</button>
                    <button type="button" onClick={() => setAgentCInstruction("")} disabled={!agentCInstruction} className="text-xs font-medium border border-red-200 text-red-400 hover:bg-red-500 hover:border-red-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors">Clear</button>
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
            <p className="text-sm font-medium text-gray-700">Orchestrator is running the competition…</p>
            <p className="text-xs text-gray-400 mt-1">Agents are generating outputs and critiquing each other{showRec ? ", and the Orchestrator is selecting the strongest report" : ""}. This takes about a minute.</p>
          </div>
        </div>
      )}

      {/* Complete phase */}
      {phase === "complete" && currentRound && (
        <>
          {/* Past rounds */}
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
          <div className="border border-gray-300 rounded-lg overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">Round {currentRound.roundNumber} — Orchestrator Log</p>
                <p className="text-xs text-gray-400 mt-0.5">{currentRound.logs.length} events · 3 agents · critique round complete</p>
              </div>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">Complete</span>
            </div>
            <div className="px-5 py-3 divide-y divide-gray-50">
              {currentRound.logs.map((entry) => <LogBubble key={entry.id} entry={entry} />)}
            </div>
          </div>

          {/* Agent outputs (collapsible) */}
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">Agent Outputs &amp; Critiques</p>
            </div>
            {currentRound.agentOutputs.map((agent) => (
              <div key={agent.id} className="border-b border-gray-100 last:border-0">
                <div className="px-5 py-3 flex items-center justify-between">
                  <button
                    onClick={() => toggleAgent(agent.id)}
                    className="flex items-center gap-2 flex-1 text-left hover:opacity-70 transition-opacity"
                  >
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      agent.id === 1 ? "bg-blue-100 text-blue-800" :
                      agent.id === 2 ? "bg-emerald-100 text-emerald-800" :
                      "bg-violet-100 text-violet-800"
                    }`}>{agent.name}</span>
                    <span className="text-xs text-gray-500">{agent.style}</span>
                    {showRec && agent.id === currentRound.recommendedAgentId && (
                      <span className="text-xs font-medium text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">Orchestrator&apos;s pick</span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto mr-4">{expandedAgents.has(agent.id) ? "Hide" : "View output & critique"}</span>
                  </button>
                  <button
                    onClick={() => { handleSelectAgent(agent); setEditMode(false); }}
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: selectedAgentId === agent.id ? "none" : "1px solid #e5e7eb",
                      background: selectedAgentId === agent.id ? "#111827" : "#fff",
                      color: selectedAgentId === agent.id ? "#fff" : "#6b7280",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {selectedAgentId === agent.id ? "Selected" : "Use this"}
                  </button>
                </div>
                {expandedAgents.has(agent.id) && (
                  <AgentOutputPanel
                    agent={agent}
                    onSelect={() => { handleSelectAgent(agent); setEditMode(false); }}
                    isSelected={selectedAgentId === agent.id}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Coordinator's decision */}
          {showRec && currentRound.coordinatorDecision && (
            <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Orchestrator Decision</p>
              <p className="text-sm text-gray-700">{currentRound.coordinatorDecision}</p>
            </div>
          )}

          {/* Final output */}
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">Final Report</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedAgentId !== null
                    ? `Using ${currentRound?.agentOutputs.find(a => a.id === selectedAgentId)?.name ?? "agent"}'s response.`
                    : showRec
                    ? "Recommended by the Orchestrator. Pick a different agent above if you prefer."
                    : "Choose a report above (\"Use this\") to start editing."}
                </p>
              </div>
              <button
                onClick={() => setEditMode((v) => !v)}
                style={{ fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", color: "#6b7280", cursor: "pointer" }}
              >
                {editMode ? "Preview" : "Edit"}
              </button>
            </div>
            <div className="p-5">
              {!showRec && selectedAgentId === null ? (
                <div className="border border-dashed border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
                  No report selected yet. Read the three reports and critiques above, then click &quot;Use this&quot; on the one you want to work with.
                </div>
              ) : editMode ? (
                <textarea
                  value={finalText}
                  onChange={(e) => handleTextareaChange(e.target.value)}
                  rows={15}
                  className="w-full border border-gray-200 rounded-lg p-4 text-sm text-gray-700 leading-relaxed resize-none focus:outline-none focus:border-gray-400 transition-colors font-mono"
                />
              ) : (
                <div
                  className="border border-gray-100 rounded-lg p-4 bg-gray-50 min-h-40 cursor-text"
                  onClick={() => setEditMode(true)}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(finalText) }}
                />
              )}
              <p className="text-xs text-gray-400 mt-1.5" style={{ display: !showRec && selectedAgentId === null ? "none" : undefined }}>
                {finalText !== baseText ? "Modified — " : ""}
                {wordCount(finalText)} words · {editMode ? "editing" : "click to edit"}
              </p>
            </div>
            <div className="px-5 pb-5 flex justify-center">
              <button onClick={handleSubmit} disabled={!finalText.trim()} className="bg-gray-900 hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2.5 rounded-md transition-colors">
                Submit final answer
              </button>
            </div>
          </div>

          {/* Disagree section */}
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <button
              onClick={() => setShowDisagree(!showDisagree)}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className={`w-4 h-4 transition-transform ${showDisagree ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              Not satisfied? Ask the Orchestrator to run another round
            </button>
            {showDisagree && (
              <div className="mt-4">
                <p className="text-xs text-gray-400 mb-2">Tell the Orchestrator what to improve. All three agents will compete again with your feedback incorporated.</p>
                <textarea
                  value={disagreeText}
                  onChange={(e) => setDisagreeText(e.target.value)}
                  placeholder="e.g., The output is too generic. I need more specific data and industry examples from the last 2 years..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors mb-2"
                />
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => setDisagreeText("The output is too generic. I need more specific data and industry examples from the last 2 years.")}
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
