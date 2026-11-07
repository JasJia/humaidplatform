"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";

type Survey = { trust: number; difficulty: number; satisfaction: number; effort: number };

type LogEntry = {
  id: string;
  timestamp: string;
  actor: string;
  type: string;
  content: string;
};

type AgentOutput = {
  id: number;
  name: string;
  style: string;
  output: string;
  critique: string;
};

type RoundLog = {
  roundNumber: number;
  userMessage: string;
  logs?: LogEntry[];
  // collaborative extras
  keywordCount?: number;
  paperCount?: number;
  tasks?: { agentA: string; agentB: string; agentC: string };
  contributions?: { agentA: string; agentB: string; agentC?: string };
  summary?: string;
  writer?: "a" | "b" | "c";
  order?: ("a" | "b" | "c")[];
  // competitive extras
  agentOutputs?: AgentOutput[];
  coordinatorDecision?: string;
  coordinatorRationale?: string;
};

type Session = {
  sessionId: string;
  participantId?: string;
  mode: string;
  // ── Study design (schema 2.0) ──
  condition?: string;
  seededErrorCondition?: boolean;
  seededErrorRetained?: boolean | null;
  isTest?: boolean;
  duplicate?: boolean;
  attentionCheckPassed?: boolean;
  startTime: string;
  endTime: string;
  wasEdited: boolean;
  originalLength?: number;
  finalLength?: number;
  charsAdded?: number;
  charsRemoved?: number;
  selectedAgentName?: string;
  finalSubmission?: string;
  originalSubmission?: string;
  confidenceRating: number;
  postTaskSurvey: Survey;
  demographics?: { ageRange: string; education: string; aiFamiliarity: string; fieldOfStudy: string };
  provenanceSummary?: Record<string, number>;
  events?: unknown[];
  rounds?: RoundLog[];
  loggedAt: string;
  // ── Data-quality schema fields ──
  schemaVersion?: string;
  appVersion?: string;
  promptVersion?: string;
  conditionAssignmentMethod?: string;
  assignmentId?: string;
  projectId?: string;
  actualTask?: string;
  taskWasCustomized?: boolean;
  agentDisplayOrder?: string[];
  modelRouting?: Record<string, { provider: string; model: string }>;
  startedAt?: string;
  completedAt?: string;
  totalDurationMs?: number;
  timeOnInstructionsMs?: number | null;
  timeViewingEachAgentMs?: Record<string, number>;
  editDistance?: number;
  wordDelta?: number;
  rerunCount?: number;
  acceptedCoordinatorRecommendation?: boolean | null;
  apiLatencyMs?: { perCall: number[]; total: number };
  apiErrorCount?: number;
};

// ── Actor badge colours (matches participant-facing pages) ──────────────────
const ACTOR_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  orchestrator: { bg: "bg-gray-900",    text: "text-white",        label: "Orchestrator" },
  coordinator:  { bg: "bg-gray-900",    text: "text-white",        label: "Orchestrator"  },
  agent_a:      { bg: "bg-blue-100",    text: "text-blue-800",     label: "Agent A"      },
  agent_b:      { bg: "bg-emerald-100", text: "text-emerald-800",  label: "Agent B"      },
  agent_c:      { bg: "bg-violet-100",  text: "text-violet-800",   label: "Agent C"      },
};

const TYPE_LABEL: Record<string, string> = {
  plan:       "Plan",
  assignment: "Brief",
  output:     "Output",
  review:     "Review",
  critique:   "Critique",
  decision:   "Decision",
  final:      "Complete",
};

// ── Log Modal ───────────────────────────────────────────────────────────────
function LogModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const dur = session.startTime && session.endTime
    ? duration(session.startTime, session.endTime)
    : "—";

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white w-full max-w-3xl mx-4 my-8 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Modal header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Conversation Log</p>
            <h2 className="text-base font-semibold text-gray-900 capitalize">{session.mode} Mode</h2>
            <div className="flex flex-wrap gap-3 mt-2">
              <span className="text-xs text-gray-400 font-mono">{session.sessionId}</span>
              {session.participantId && (
                <span className="text-xs text-gray-500">Participant: <span className="font-medium">{session.participantId}</span></span>
              )}
              <span className="text-xs text-gray-500">Duration: <span className="font-medium">{dur}</span></span>
              <span className="text-xs text-gray-500">Rounds: <span className="font-medium">{session.rounds?.length ?? 1}</span></span>
              <span className="text-xs text-gray-500">Edited: <span className="font-medium">{session.wasEdited ? "Yes" : "No"}</span></span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 flex-shrink-0 ml-4"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable log body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {/* Data quality metrics */}
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Data Quality</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 px-4 py-3 text-xs">
              {([
                ["Condition", session.conditionAssignmentMethod ?? "—"],
                ["Task customized", session.taskWasCustomized == null ? "—" : session.taskWasCustomized ? "Yes" : "No"],
                ["Rerun count", session.rerunCount ?? "—"],
                ["Accepted coordinator", session.acceptedCoordinatorRecommendation == null ? "N/A" : session.acceptedCoordinatorRecommendation ? "Yes" : "No"],
                ["Edit distance", session.editDistance ?? "—"],
                ["Word delta", session.wordDelta ?? "—"],
                ["API latency (ms)", session.apiLatencyMs?.total ?? "—"],
                ["API errors", session.apiErrorCount ?? "—"],
                ["Time on instructions (ms)", session.timeOnInstructionsMs ?? "—"],
                ["App version", session.appVersion ?? "—"],
                ["Prompt version", session.promptVersion ?? "—"],
                ["Schema version", session.schemaVersion ?? "—"],
              ] as [string, string | number][]).map(([label, value]) => (
                <div key={label}>
                  <p className="text-gray-400">{label}</p>
                  <p className="text-gray-800 font-medium break-words">{String(value)}</p>
                </div>
              ))}
            </div>
            {session.modelRouting && (
              <div className="px-4 pb-3 text-xs">
                <p className="text-gray-400 mb-0.5">Model routing</p>
                <p className="text-gray-700 font-mono break-words">
                  {Object.entries(session.modelRouting).map(([k, v]) => `${k.toUpperCase()}: ${v.provider}/${v.model}`).join(" · ")}
                </p>
              </div>
            )}
          </div>

          {!session.rounds || session.rounds.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No conversation log saved for this session.</p>
          ) : (
            session.rounds.map((round) => (
              <div key={round.roundNumber}>
                {/* Round header */}
                <div className="mb-3">
                  <span className="text-xs font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-full">
                    Round {round.roundNumber}
                  </span>
                </div>

                {/* User message — shown for every round */}
                {round.userMessage && (
                  <div className="mb-3 border border-blue-100 bg-blue-50 rounded-lg px-4 py-3">
                    <p className="text-xs font-medium text-blue-500 uppercase tracking-widest mb-1">
                      {round.roundNumber === 1 ? "User's initial brief" : "User feedback"}
                    </p>
                    <p className="text-xs text-gray-700 leading-relaxed">{round.userMessage}</p>
                  </div>
                )}

                {/* Log entries — table format */}
                {round.logs && round.logs.length > 0 ? (
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 w-24">Actor</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 w-24">Type</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Content</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {round.logs.map((entry, i) => {
                          const style = ACTOR_STYLE[entry.actor] ?? { bg: "bg-gray-100", text: "text-gray-700", label: entry.actor };
                          const prefix = TYPE_LABEL[entry.type] ?? entry.type;
                          return (
                            <tr key={entry.id ?? i} className="align-top hover:bg-gray-50/50">
                              <td className="px-3 py-2.5">
                                <span className={`inline-block font-semibold px-1.5 py-0.5 rounded text-[10px] ${style.bg} ${style.text}`}>
                                  {style.label}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{prefix}</td>
                              <td className="px-3 py-2.5 text-gray-600 leading-relaxed">{entry.content}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 pl-1">No log entries for this round.</p>
                )}

                {/* Collaborative: per-agent tasks + contributions */}
                {(round.tasks || round.contributions || round.summary) && (
                  <div className="mt-3 space-y-2">
                    {round.tasks && (
                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Agent Tasks Assigned by Orchestrator</p>
                        </div>
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-gray-50">
                            {[
                              { label: "Agent A", task: round.tasks.agentA },
                              { label: "Agent B", task: round.tasks.agentB },
                              { label: "Agent C", task: round.tasks.agentC },
                            ].map(({ label, task }) => (
                              <tr key={label} className="align-top">
                                <td className="px-3 py-2 font-semibold text-gray-600 w-20 whitespace-nowrap">{label}</td>
                                <td className="px-3 py-2 text-gray-600 leading-relaxed">{task}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {(() => {
                      const contribMap: Record<string, string | undefined> = {
                        a: round.contributions?.agentA,
                        b: round.contributions?.agentB,
                        c: round.contributions?.agentC,
                      };
                      const labelMap: Record<string, string> = { a: "Agent A", b: "Agent B", c: "Agent C" };
                      // Use execution order if provided, else default a,b,c
                      const seq = round.order ?? (["a", "b", "c"] as ("a" | "b" | "c")[]);
                      return seq.map((id) => {
                        const isWriter = round.writer ? id === round.writer : id === "c";
                        const text = isWriter ? (round.summary || contribMap[id]) : contribMap[id];
                        if (!text) return null;
                        return (
                          <details key={id} className="border border-gray-100 rounded-lg">
                            <summary className="px-4 py-2.5 text-xs font-medium text-gray-600 cursor-pointer hover:bg-gray-50 rounded-lg list-none flex items-center justify-between">
                              <span>{labelMap[id]} — {isWriter ? "final report" : "contribution"}</span><span className="text-gray-300">▸ expand</span>
                            </summary>
                            <div className="px-4 pb-3 border-t border-gray-50"><p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line mt-2">{text}</p></div>
                          </details>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* Competitive: agent outputs */}
                {round.agentOutputs && round.agentOutputs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {round.agentOutputs.map((agent) => (
                      <details key={agent.id} className="border border-gray-100 rounded-lg">
                        <summary className="px-4 py-2.5 text-xs font-medium text-gray-600 cursor-pointer hover:bg-gray-50 rounded-lg list-none flex items-center justify-between">
                          <span>{agent.name} — {agent.style}</span>
                          <span className="text-gray-300">▸ expand</span>
                        </summary>
                        <div className="px-4 pb-3 space-y-2 border-t border-gray-50">
                          <div className="bg-gray-50 rounded p-3 mt-2">
                            <p className="text-xs font-medium text-gray-400 mb-1">Output</p>
                            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{agent.output}</p>
                          </div>
                          <div className="bg-amber-50 rounded p-3">
                            <p className="text-xs font-medium text-amber-600 mb-1">Critique</p>
                            <p className="text-xs text-gray-600 leading-relaxed">{agent.critique}</p>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                )}

                {/* Coordinator decision */}
                {round.coordinatorDecision && (
                  <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Orchestrator Decision</p>
                    <p className="text-xs text-gray-700">{round.coordinatorDecision}</p>
                    {round.coordinatorRationale && (
                      <p className="text-xs text-gray-500 mt-1 italic">{round.coordinatorRationale}</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Final submission — original AI text vs user's edited version */}
          {session.finalSubmission && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">Final Submission</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${session.wasEdited ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                  {session.wasEdited ? `Edited (+${session.charsAdded ?? 0} / -${session.charsRemoved ?? 0} chars)` : "Submitted unchanged"}
                </span>
              </div>
              <div className="p-4 space-y-3">
                {session.wasEdited && session.originalSubmission && (
                  <details className="border border-gray-100 rounded-lg">
                    <summary className="px-4 py-2.5 text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-50 rounded-lg list-none flex items-center justify-between">
                      <span>Original AI output (before user edits)</span><span className="text-gray-300">▸ expand</span>
                    </summary>
                    <div className="px-4 pb-3 border-t border-gray-50"><p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line mt-2">{session.originalSubmission}</p></div>
                  </details>
                )}
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1">{session.wasEdited ? "User's final (edited) submission" : "Submitted text"}</p>
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{session.finalSubmission}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm font-medium border border-gray-300 hover:border-gray-500 text-gray-700 px-4 py-2 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function duration(start: string, end: string) {
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function avg(arr: number[]) {
  if (!arr.length) return "—";
  return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
}

function avgNum(arr: number[]): number {
  if (!arr.length) return 0;
  return parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2));
}

// ── Admin Page ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [rawSessions, setSessions] = useState<Session[]>([]);
  const [includeTests, setIncludeTests] = useState(false);
  // Live assignment counters (completed / in progress) per cell, from /api/assign.
  const [cellLoad, setCellLoad] = useState<Record<string, { completed: number; inProgress: number }>>({});
  useEffect(() => {
    fetch("/api/assign")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { cell: string; completed: number; inProgress: number }[]) =>
        setCellLoad(Object.fromEntries(rows.map((r) => [r.cell, { completed: r.completed, inProgress: r.inProgress }])))
      )
      .catch(() => {});
  }, []);
  const [loading, setLoading] = useState(true);
  const [activeLog, setActiveLog] = useState<Session | null>(null);
  const [dark, setDark] = useState(false);

  // Detect dark mode (mirrors ThemeToggle logic)
  useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Theme-aware chart values
  const tick        = { fontSize: 10, fill: dark ? "#aaaaaa" : "#9ca3af" };
  const tooltipStyle = {
    fontSize: 11, borderRadius: 6,
    background: dark ? "#1e1e1e" : "#ffffff",
    border: dark ? "1px solid #444444" : "1px solid #e5e7eb",
    color: dark ? "#f0f0f0" : "#111827",
  };
  const cursorFill  = dark ? "#2a2a2a" : "#f9fafb";

  // Chart colours — same in both modes
  const PIE_MODE   = ["#60a5fa", "#a78bfa"];
  const PIE_ACCEPT = ["#34d399", "#f87171"];

  const BAR_PRIMARY   = "#60a5fa";
  const BAR_SECONDARY = "#a78bfa";
  const BAR_SURVEY    = "#34d399";
  const BAR_TOTAL     = "#94a3b8";
  const BAR_EDITED    = "#f87171";

  const legendText = (value: string) => (
    <span style={{ fontSize: 11, color: dark ? "#cccccc" : "#6b7280" }}>{value}</span>
  );

  useEffect(() => {
    fetch("/api/sessions")
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/humaidadmin2026/login"; return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setSessions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => { console.error("[admin]", err); setLoading(false); });
  }, []);

  // Study cells (schema 2.0). Test sessions are excluded from all statistics
  // unless "Include test sessions" is ticked.
  const allSessions = rawSessions;
  const sessions = includeTests ? allSessions : allSessions.filter((s) => !s.isTest);
  const testCount = allSessions.filter((s) => s.isTest).length;
  const CONDS = [
    { key: "single", label: "Single agent" },
    { key: "collaborative", label: "Collaborative" },
    { key: "competitive", label: "Competitive + rec." },
    { key: "competitive_norec", label: "Competitive, no rec." },
  ];
  const cellRows = CONDS.map((c) => {
    const inCond = sessions.filter((s) => (s.condition ?? s.mode) === c.key);
    const withErr = inCond.filter((s) => s.seededErrorCondition);
    const caught = withErr.filter((s) => s.seededErrorRetained === false).length;
    return { ...c, n: inCond.length, nErr: withErr.length, nNoErr: inCond.length - withErr.length, caught };
  });

  const collaborative = sessions.filter((s) => s.mode === "collaborative");
  const competitive   = sessions.filter((s) => s.mode === "competitive" || s.mode === "competitive_norec");
  const edited        = sessions.filter((s) => s.wasEdited);

  const modeData = [
    { mode: "Collaborative", count: collaborative.length },
    { mode: "Competitive",   count: competitive.length  },
  ];

  const confidenceData = [1, 2, 3, 4, 5].map((r) => ({
    rating: String(r),
    count: sessions.filter((s) => s.confidenceRating === r).length,
  }));

  const surveyAvgData = [
    { label: "Trust",        value: avgNum(sessions.map((s) => s.postTaskSurvey?.trust).filter(Boolean))        },
    { label: "Difficulty",   value: avgNum(sessions.map((s) => s.postTaskSurvey?.difficulty).filter(Boolean))   },
    { label: "Satisfaction", value: avgNum(sessions.map((s) => s.postTaskSurvey?.satisfaction).filter(Boolean)) },
    { label: "Effort",       value: avgNum(sessions.map((s) => s.postTaskSurvey?.effort).filter(Boolean))       },
  ];

  const editRateData = [
    { mode: "Collaborative", total: collaborative.length, edited: collaborative.filter((s) => s.wasEdited).length },
    { mode: "Competitive",   total: competitive.length,   edited: competitive.filter((s) => s.wasEdited).length   },
  ];

  return (
    <>
      {/* Log Modal */}
      {activeLog && <LogModal session={activeLog} onClose={() => setActiveLog(null)} />}

      <div className="w-full">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Research Data</p>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">Session Dashboard</h1>
            <p className="text-sm text-gray-500">All recorded participant sessions.</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/export?format=xlsx"
              className="flex-shrink-0 text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-900 hover:border-gray-900 hover:text-white px-4 py-2 rounded-md transition-colors"
            >
              Export Excel
            </a>
            <a
              href="/api/export?format=json"
              className="flex-shrink-0 text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-900 hover:border-gray-900 hover:text-white px-4 py-2 rounded-md transition-colors"
            >
              Export JSON
            </a>
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
          </div>
        ) : allSessions.length === 0 ? (
          <div className="border border-gray-200 rounded-lg p-10 text-center">
            <p className="text-sm text-gray-400">No sessions recorded yet.</p>
            <p className="text-xs text-gray-300 mt-1">Sessions appear here after participants complete the study.</p>
          </div>
        ) : (
          <>
            {/* Study design cells */}
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">Study Cells (condition × seeded error)</p>
                <label className="text-xs text-gray-500 flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={includeTests} onChange={(e) => setIncludeTests(e.target.checked)} />
                  Include test sessions ({testCount})
                </label>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400">
                    <th className="text-left px-4 py-2 font-medium">Condition</th>
                    <th className="text-right px-4 py-2 font-medium">Total n</th>
                    <th className="text-right px-4 py-2 font-medium">No error</th>
                    <th className="text-right px-4 py-2 font-medium">Seeded error</th>
                    <th className="text-right px-4 py-2 font-medium">Error corrected</th>
                    <th className="text-right px-4 py-2 font-medium" title="Live assignment counters: completed / in progress (no error · error)">Assignment (done / in progress)</th>
                  </tr>
                </thead>
                <tbody>
                  {cellRows.map((r) => (
                    <tr key={r.key} className="border-b border-gray-50">
                      <td className="px-4 py-2 text-gray-700">{r.label}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{r.n}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{r.nNoErr}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{r.nErr}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{r.nErr ? `${r.caught} (${Math.round((r.caught / r.nErr) * 100)}%)` : "—"}</td>
                      <td className="px-4 py-2 text-right text-gray-500 font-mono">
                        {[0, 1].map((e) => {
                          const l = cellLoad[`${r.key}:${e}`];
                          return l ? `${l.completed}/${l.inProgress}` : "–";
                        }).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: "Total sessions",  value: sessions.length },
                { label: "Collaborative",   value: collaborative.length },
                { label: "Competitive",     value: competitive.length },
                { label: "Edited AI output", value: `${edited.length} (${Math.round((edited.length / sessions.length) * 100)}%)` },
              ].map((card) => (
                <div key={card.label} className="border border-gray-200 rounded-lg p-4 bg-white">
                  <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                  <p className="text-xl font-semibold text-gray-900">{card.value}</p>
                </div>
              ))}
            </div>

            {/* Sessions table — latest first, full width, no horizontal scroll */}
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">All Sessions</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Session ID</th>
                    <th className="text-left px-3 py-2.5 text-gray-400 font-medium whitespace-nowrap">Logged At</th>
                    <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Mode</th>
                    <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Log</th>
                    <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Duration</th>
                    <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Rounds</th>
                    <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Edited</th>
                    <th className="text-center px-3 py-2.5 text-gray-400 font-medium">Conf.</th>
                    <th className="text-center px-3 py-2.5 text-gray-400 font-medium">Trust</th>
                    <th className="text-center px-3 py-2.5 text-gray-400 font-medium">Diff.</th>
                    <th className="text-center px-3 py-2.5 text-gray-400 font-medium">Sat.</th>
                    <th className="text-center px-3 py-2.5 text-gray-400 font-medium">Effort</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.sessionId} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-gray-400">{s.sessionId?.slice(0, 20)}…</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                        {s.loggedAt ? new Date(s.loggedAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{(s.condition ?? s.mode).replace("_", " ")}{s.seededErrorCondition ? " · err" : ""}{s.isTest ? " · test" : ""}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => setActiveLog(s)}
                          className="text-xs font-medium text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-2 py-1 rounded transition-colors"
                        >
                          View Log
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                        {s.startTime && s.endTime ? duration(s.startTime, s.endTime) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 text-center">{s.rounds?.length ?? 1}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded font-medium ${s.wasEdited ? "bg-gray-100 text-gray-700" : "text-gray-300"}`}>
                          {s.wasEdited ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-700">{s.confidenceRating ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center text-gray-700">{s.postTaskSurvey?.trust ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center text-gray-700">{s.postTaskSurvey?.difficulty ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center text-gray-700">{s.postTaskSurvey?.satisfaction ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center text-gray-700">{s.postTaskSurvey?.effort ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Survey averages */}
            <div className="border border-gray-200 rounded-lg p-5 mb-6 bg-white">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-4">Survey Averages</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                {[
                  { label: "Confidence",   values: sessions.map((s) => s.confidenceRating).filter(Boolean)          },
                  { label: "Trust",        values: sessions.map((s) => s.postTaskSurvey?.trust).filter(Boolean)       },
                  { label: "Difficulty",   values: sessions.map((s) => s.postTaskSurvey?.difficulty).filter(Boolean)  },
                  { label: "Satisfaction", values: sessions.map((s) => s.postTaskSurvey?.satisfaction).filter(Boolean)},
                  { label: "Effort",       values: sessions.map((s) => s.postTaskSurvey?.effort).filter(Boolean)      },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                    <p className="font-semibold text-gray-900">{avg(item.values)} <span className="text-xs font-normal text-gray-400">/ 5</span></p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pie charts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">

              {/* Pie 1 — Sessions by Mode */}
              <div className="border border-gray-200 rounded-lg p-5 bg-white">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Sessions by Mode</p>
                <p className="text-xs text-gray-400 mb-3">Total {sessions.length} sessions — collaborative vs competitive split</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: `Collaborative (${collaborative.length})`, value: collaborative.length },
                        { name: `Competitive (${competitive.length})`,     value: competitive.length  },
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={85}
                      paddingAngle={collaborative.length && competitive.length ? 3 : 0}
                      dataKey="value"
                    >
                      <Cell fill={PIE_MODE[0]} />
                      <Cell fill={PIE_MODE[1]} />
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} session${Number(value) !== 1 ? "s" : ""}`, ""]} contentStyle={tooltipStyle} />
                    <Legend iconType="circle" iconSize={8} formatter={legendText} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Pie 2 — AI Output Acceptance Rate */}
              <div className="border border-gray-200 rounded-lg p-5 bg-white">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">AI Output Acceptance</p>
                <p className="text-xs text-gray-400 mb-3">How many participants accepted the AI output without editing</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: `Accepted as-is (${sessions.length - edited.length})`, value: sessions.length - edited.length },
                        { name: `Edited output (${edited.length})`,                    value: edited.length                   },
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={85}
                      paddingAngle={edited.length && edited.length < sessions.length ? 3 : 0}
                      dataKey="value"
                    >
                      <Cell fill={PIE_ACCEPT[0]} />
                      <Cell fill={PIE_ACCEPT[1]} />
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} session${Number(value) !== 1 ? "s" : ""}`, ""]} contentStyle={tooltipStyle} />
                    <Legend iconType="circle" iconSize={8} formatter={legendText} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

            </div>

            {/* Bar charts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="border border-gray-200 rounded-lg p-5 bg-white">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Mode Distribution</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={modeData} barCategoryGap="40%">
                    <XAxis dataKey="mode" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: cursorFill }} />
                    <Bar dataKey="count" fill={BAR_PRIMARY} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="border border-gray-200 rounded-lg p-5 bg-white">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Confidence Rating Distribution</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={confidenceData} barCategoryGap="30%">
                    <XAxis dataKey="rating" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: cursorFill }} />
                    <Bar dataKey="count" fill={BAR_SECONDARY} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="border border-gray-200 rounded-lg p-5 bg-white">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Survey Averages Comparison</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={surveyAvgData} barCategoryGap="40%">
                    <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} domain={[0, 5]} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: cursorFill }} />
                    <Bar dataKey="value" fill={BAR_SURVEY} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="border border-gray-200 rounded-lg p-5 bg-white">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Edit Rate by Mode</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={editRateData} barCategoryGap="30%">
                    <XAxis dataKey="mode" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: cursorFill }} />
                    <Bar dataKey="total"  fill={BAR_TOTAL}  radius={[3, 3, 0, 0]} name="Total" />
                    <Bar dataKey="edited" fill={BAR_EDITED} radius={[3, 3, 0, 0]} name="Edited" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <p className="text-xs text-gray-300 mt-4 text-center">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""} — most recent first
            </p>
          </>
        )}

      </div>
    </>
  );
}
