"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TASK } from "@/lib/data";
import { logEvent, getEvents } from "@/lib/event-logger";
import { computeProvenance, summariseProvenance } from "@/lib/provenance";
import { editDistance, wordDelta } from "@/lib/edit-distance";
import { containsSeededError } from "@/lib/study-config";

/**
 * Single-agent baseline condition: one AI agent drafts the report; the
 * participant reviews, edits, or asks for a revision. No orchestrator.
 */

type ModelRouting = Record<string, { provider: string; model: string }>;

type Round = {
  roundNumber: number;
  userMessage: string;
  report: string;
  modelRouting?: ModelRouting;
  apiLatencyMs?: { perCall: number[]; total: number };
  apiErrorCount?: number;
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

function useTimer() {
  const [s, setS] = useState(0);
  useEffect(() => { const i = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function SinglePage() {
  const router = useRouter();
  const timer = useTimer();
  const submittingRef = useRef(false);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reportPanelRef = useScrollDepth("final_report");

  const [phase, setPhase] = useState<"brief" | "running" | "complete">("brief");
  const [preferences, setPreferences] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [finalText, setFinalText] = useState("");
  const [originalReport, setOriginalReport] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [seedError, setSeedError] = useState(false);

  useEffect(() => {
    // Task already submitted (e.g. browser Back) — continue to the questionnaire.
    if (sessionStorage.getItem("humaid_session_data")) { router.replace("/submit"); return; }
    if (sessionStorage.getItem("humaid_mode") !== "single") { router.replace("/"); return; }
    setSeedError(sessionStorage.getItem("humaid_seed_error") === "1");
    logEvent("session_start", { mode: "single" });
    const handler = (e: BeforeUnloadEvent) => {
      if (submittingRef.current) return;
      e.preventDefault(); e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [router]);

  async function run(message: string, roundNum: number) {
    setPhase("running");
    setError(null);
    logEvent("agent_start", { round: roundNum, message });
    try {
      const res = await fetch("/api/orchestrator/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: TASK.topic,
          userMessage: message,
          previousReport: (finalText || currentRound?.report) ?? null,
          round: roundNum,
          seedError,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let errMsg = `Server error (HTTP ${res.status})`;
        try { const j = JSON.parse(text); errMsg = j.error ?? errMsg; } catch { /* not JSON */ }
        throw new Error(errMsg);
      }
      const data = await res.json();
      const round: Round = {
        roundNumber: roundNum,
        userMessage: message,
        report: data.report ?? "",
        modelRouting: data.modelRouting,
        apiLatencyMs: data.apiLatencyMs,
        apiErrorCount: data.apiErrorCount,
      };
      setRounds((prev) => [...prev, round]);
      setCurrentRound(round);
      setFinalText(round.report);
      if (roundNum === 1) setOriginalReport(round.report);
      setEditMode(false);
      setShowFeedback(false);
      setFeedback("");
      setPhase("complete");
      logEvent("agent_complete", { round: roundNum });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Error: ${msg}. Please try again.`);
      setPhase(roundNum === 1 ? "brief" : "complete");
      logEvent("agent_error", { round: roundNum });
    }
  }

  function handleStart() {
    run(preferences.trim() || "No specific requirements.", 1);
  }

  function handleFeedback() {
    const msg = feedback.trim();
    if (!msg) return;
    const next = rounds.length + 1;
    logEvent("user_disagree", { round: next, feedback: msg });
    run(msg, next);
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
    const provenanceSpans = computeProvenance(finalText, [
      { id: "agent_report", text: currentRound?.report ?? "" },
      { id: "first_draft", text: originalReport },
    ]);
    const provenanceSummary = summariseProvenance(provenanceSpans);
    logEvent("session_end", { provenanceSummary, totalRounds: rounds.length });

    const startedAt = sessionStorage.getItem("humaid_start_time");
    const completedAt = new Date().toISOString();
    const allLatencies = rounds.flatMap((r) => r.apiLatencyMs?.perCall ?? []);

    const sessionData = {
      sessionId: sessionStorage.getItem("humaid_session_id"),
      mode: "single",
      condition: "single",
      task: TASK.topic,
      conditionAssignmentMethod: sessionStorage.getItem("humaid_assignment_method") ?? "unknown",
      seededErrorCondition: seedError,
      seededErrorRetained: seedError ? containsSeededError(finalText) : null,
      actualTask: TASK.topic,
      taskWasCustomized: Boolean(preferences.trim()),
      agentDisplayOrder: ["Agent"],
      modelRouting: currentRound?.modelRouting ?? null,
      startedAt,
      completedAt,
      totalDurationMs: startedAt ? new Date(completedAt).getTime() - new Date(startedAt).getTime() : 0,
      timeOnInstructionsMs: Number(sessionStorage.getItem("humaid_time_on_instructions_ms")) || null,
      timeViewingEachAgentMs: {},
      editDistance: editDistance(originalReport, finalText),
      editDistanceFromBase: editDistance(currentRound?.report ?? "", finalText),
      wordDelta: wordDelta(originalReport, finalText),
      rerunCount: Math.max(0, rounds.length - 1),
      acceptedCoordinatorRecommendation: null,
      apiLatencyMs: { perCall: allLatencies, total: allLatencies.reduce((a, b) => a + b, 0) },
      apiErrorCount: rounds.reduce((a, r) => a + (r.apiErrorCount ?? 0), 0),
      startTime: startedAt,
      endTime: completedAt,
      totalRounds: rounds.length,
      finalSubmission: finalText,
      originalSubmission: originalReport,
      wasEdited: finalText !== originalReport,
      originalLength: originalReport.length,
      finalLength: finalText.length,
      charsAdded: Math.max(0, finalText.length - originalReport.length),
      charsRemoved: Math.max(0, originalReport.length - finalText.length),
      provenanceSpans,
      provenanceSummary,
      rounds: rounds.map((r) => ({ roundNumber: r.roundNumber, userMessage: r.userMessage, summary: r.report, logs: [] })),
      events: getEvents(),
    };
    sessionStorage.setItem("humaid_session_data", JSON.stringify(sessionData));
    await new Promise((r) => setTimeout(r, 50));
    router.push("/submit");
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <span />
        <span className="font-mono text-xs text-gray-400 tabular-nums">{timer}</span>
      </div>

      <div className="mb-8" style={{ textAlign: "center" }}>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Single-Agent Mode</h1>
        <p className="text-sm text-gray-500">One AI agent drafts the report. You review it, edit it, or ask for a revision.</p>
      </div>

      {phase === "brief" && (
        <div className="border border-gray-200 rounded-lg p-6 bg-white space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Your Task</label>
            <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3">{TASK.topic}.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Preferences &amp; Requirements</label>
            <p className="text-xs text-gray-400 mb-2">Optional: specify any constraints, tone, or focus areas for the agent.</p>
            <textarea
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="e.g., Keep the tone practical and include concrete examples..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={handleStart} className="w-full bg-gray-900 hover:bg-gray-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            Start Task
          </button>
        </div>
      )}

      {phase === "running" && (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <svg className="w-10 h-10 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <div style={{ textAlign: "center" }}>
            <p className="text-sm font-medium text-gray-700">The agent is writing the report…</p>
            <p className="text-xs text-gray-400 mt-1">This takes about 30 seconds.</p>
          </div>
        </div>
      )}

      {phase === "complete" && currentRound && (
        <>
          <div ref={reportPanelRef} className="border border-gray-200 rounded-lg overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">Your Report</p>
                <p className="text-xs text-gray-400 mt-0.5">Draft {currentRound.roundNumber} written by the AI agent. Edit before submitting.</p>
              </div>
              <button
                onClick={() => setEditMode((v) => !v)}
                style={{ fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", color: "#6b7280", cursor: "pointer" }}
              >
                {editMode ? "Preview" : "Edit"}
              </button>
            </div>
            <div className="p-5">
              {editMode ? (
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
              <p className="text-xs text-gray-400 mt-1.5">
                {finalText !== originalReport ? "Modified from original — " : ""}
                {wordCount(finalText)} words · {editMode ? "editing" : "click to edit"}
              </p>
            </div>
            <div className="px-5 pb-5 flex justify-center">
              <button onClick={handleSubmit} disabled={!finalText.trim()} className="bg-gray-900 hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium px-6 py-2.5 rounded-md transition-colors">
                Submit final answer
              </button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <button
              onClick={() => setShowFeedback(!showFeedback)}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className={`w-4 h-4 transition-transform ${showFeedback ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              Not satisfied? Ask the agent for a revised draft
            </button>
            {showFeedback && (
              <div className="mt-4">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g., The report is too generic. Add more specific data and examples..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 transition-colors mb-2"
                />
                {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={handleFeedback}
                    disabled={!feedback.trim()}
                    className="bg-gray-900 hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-md transition-colors"
                  >
                    Submit feedback — Draft {rounds.length + 1}
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
