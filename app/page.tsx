"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TASK } from "@/lib/data";

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Read a URL query param, trying several common aliases. */
function readParam(params: URLSearchParams, names: string[]): string {
  for (const n of names) {
    const v = params.get(n);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Entry page. There is no login: participants arrive (e.g. from Prolific),
 * give consent, are randomly assigned to a condition on the server, and go
 * straight to the task. Their Prolific ID is captured silently from the URL
 * when present and confirmed again on the final page for the completion code.
 */
export default function WelcomePage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Capture Prolific (or other panel) parameters from the entry URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // A participant who reloads this page mid-study resumes where they were
    // instead of being re-randomised. ?reset=1 clears the session (testing).
    if (params.get("reset") === "1") {
      sessionStorage.clear();
    } else if (sessionStorage.getItem("humaid_session_data")) {
      router.replace("/submit");
      return;
    } else if (sessionStorage.getItem("humaid_mode")) {
      router.replace("/instructions");
      return;
    }
    const pid = readParam(params, ["PROLIFIC_PID", "prolific_pid", "participantId", "PID", "pid"]);
    const study = readParam(params, ["STUDY_ID", "study_id"]);
    const psess = readParam(params, ["SESSION_ID", "session_id"]);
    if (pid) sessionStorage.setItem("humaid_participant_id", pid);
    if (study) sessionStorage.setItem("humaid_study_id", study);
    if (psess) sessionStorage.setItem("humaid_prolific_session_id", psess);
    // Completion code can be supplied in the study link (&cc=XXXX) so a
    // co-author can run the study on their own Prolific account without
    // changing server settings. PROLIFIC_COMPLETION_CODE (env) takes priority.
    const cc = readParam(params, ["cc", "CC", "completion_code"]);
    if (cc) sessionStorage.setItem("humaid_cc", cc);
    // Piloting / testing overrides: ?test=1, ?mode=<condition>, ?error=0|1
    if (params.get("test") === "1") sessionStorage.setItem("humaid_is_test", "1");
    const mode = params.get("mode");
    if (mode) sessionStorage.setItem("humaid_mode_override", mode);
    const err = params.get("error");
    if (err === "0" || err === "1") sessionStorage.setItem("humaid_error_override", err);
  }, [router]);

  async function handleStart() {
    if (!agreed || loading) return;
    setLoading(true);
    setError("");
    try {
      const sessionId = generateSessionId();
      const res = await fetch("/api/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          test: sessionStorage.getItem("humaid_is_test") === "1",
          mode: sessionStorage.getItem("humaid_mode_override") ?? undefined,
          error: sessionStorage.getItem("humaid_error_override") ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.condition) throw new Error("assign failed");

      sessionStorage.setItem("humaid_session_id", sessionId);
      sessionStorage.setItem("humaid_start_time", new Date().toISOString());
      sessionStorage.setItem("humaid_consent_at", new Date().toISOString());
      sessionStorage.setItem("humaid_mode", data.condition);
      sessionStorage.setItem("humaid_seed_error", data.seedError ? "1" : "0");
      sessionStorage.setItem("humaid_assignment_method", data.method);
      router.push("/pre");
    } catch {
      setError("Something went wrong while starting the study. Please refresh the page and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 text-center" style={{ textAlign: "center" }}>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">HUMAID Study</p>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">{TASK.title}</h1>
        <p className="text-sm text-gray-500">A research study on how people work with AI agents</p>
      </div>

      <div className="border border-gray-200 rounded-lg p-5 mb-5 bg-gray-50">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Your Task</p>
        <p className="text-sm text-gray-700 leading-relaxed">{TASK.description}</p>
        <p className="text-xs text-gray-500 mt-3">Estimated time: {TASK.estimatedTime}. Please use a laptop or desktop computer and do not close this tab until you receive your completion code.</p>
      </div>

      <div className="border border-gray-200 rounded-lg p-5 mb-5 bg-white">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Consent to Participate</p>
        <div className="text-sm text-gray-600 leading-relaxed space-y-2">
          <p>Researchers at Quinnipiac University are studying how people review, edit, and rely on content produced by AI agents. You will work with AI agents to produce a short report, then answer a questionnaire.</p>
          <p>Your interactions on this platform (for example, clicks, time spent, and edits) are recorded. We collect your Prolific ID only to pay you and to prevent duplicate participation. Data are stored securely and reported only in aggregate. There are no risks beyond those of everyday computer use, and you may stop at any time by closing this window.</p>
          <p className="text-xs text-gray-500">
            Questions about this study: {process.env.NEXT_PUBLIC_PI_CONTACT ?? "Shizhen (Jasper) Jia, Quinnipiac University"},{" "}
            <a href="mailto:shizhen.jia@quinnipiac.edu" className="underline">shizhen.jia@quinnipiac.edu</a>
            {process.env.NEXT_PUBLIC_IRB_PROTOCOL ? ` · IRB protocol ${process.env.NEXT_PUBLIC_IRB_PROTOCOL}` : ""}
          </p>
        </div>
        <label className="flex items-start gap-2 mt-4 cursor-pointer">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
          <span className="text-sm text-gray-800">I am 18 or older, I have read the information above, and I agree to participate.</span>
        </label>
      </div>

      {error && <p className="text-sm text-red-500 text-center mb-3">{error}</p>}

      <button
        onClick={handleStart}
        disabled={!agreed || loading}
        className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
      >
        {loading ? "Starting…" : "Start the task"}
      </button>
    </div>
  );
}
