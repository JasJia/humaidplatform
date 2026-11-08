"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SURVEY, blockApplies, missingOnPage } from "@/lib/survey";
import { SurveyBlock, type Answers } from "@/components/survey-block";
import { isCondition, prolificCompletionUrl, type Condition } from "@/lib/study-config";

function applyInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function scholarUrl(ref: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(ref)}`;
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inList = false;
  let inRefSection = false;
  let inRefList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect "References" / "References:" heading
    if (/^(\*{1,2})?references?:?(\*{1,2})?\s*$/i.test(trimmed)) {
      if (inList) { result.push("</ul>"); inList = false; }
      if (inRefList) { result.push("</ol>"); inRefList = false; }
      result.push(`<p style="font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;margin:20px 0 8px;border-top:1px solid #e5e7eb;padding-top:12px">References</p>`);
      inRefSection = true;
      continue;
    }

    if (line.startsWith("### ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      if (inRefList) { result.push("</ol>"); inRefList = false; }
      inRefSection = false;
      result.push(`<h3 style="font-size:13px;font-weight:600;color:#1f2937;margin:10px 0 4px">${applyInline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      if (inRefList) { result.push("</ol>"); inRefList = false; }
      inRefSection = false;
      result.push(`<h2 style="font-size:14px;font-weight:700;color:#111827;margin:12px 0 4px">${applyInline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      if (inList) { result.push("</ul>"); inList = false; }
      if (inRefList) { result.push("</ol>"); inRefList = false; }
      inRefSection = false;
      result.push(`<h1 style="font-size:15px;font-weight:700;color:#111827;margin:12px 0 6px">${applyInline(line.slice(2))}</h1>`);
    } else if (trimmed === "") {
      if (inList) { result.push("</ul>"); inList = false; }
      // Don't close ref list on blank lines — references may have blank lines between them
    } else if (inRefSection) {
      // Render as numbered list item with Scholar link
      if (!inRefList) {
        result.push('<ol style="margin:0;padding-left:20px;list-style-type:decimal">');
        inRefList = true;
      }
      const clean = trimmed.replace(/^\d+\.\s*/, ""); // strip any "1." the model added
      const link = `<a href="${scholarUrl(clean)}" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;font-size:11px;margin-left:6px;text-decoration:underline">Link</a>`;
      result.push(`<li style="font-size:12px;color:#4b5563;line-height:1.8;margin:5px 0;padding-left:4px">${applyInline(clean)}${link}</li>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) { result.push('<ul style="margin:4px 0;padding-left:16px">'); inList = true; }
      result.push(`<li style="font-size:13px;color:#374151;line-height:1.6;margin:2px 0">${applyInline(line.slice(2))}</li>`);
    } else {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 8px">${applyInline(line)}</p>`);
    }
  }
  if (inList) result.push("</ul>");
  if (inRefList) result.push("</ol>");
  return result.join("");
}

type SessionData = {
  sessionId: string;
  mode: string;
  condition?: string;
  task: string;
  startTime: string;
  endTime: string;
  finalSubmission: string;
  wasEdited: boolean;
  selectedAgentName?: string;
  [k: string]: unknown;
};

const LIKERT_QUESTIONS = [
  { id: "trust", label: "How much did you trust the AI output?", low: "Did not trust at all", high: "Trusted completely" },
  { id: "difficulty", label: "How difficult was the task?", low: "Very easy", high: "Very difficult" },
  { id: "satisfaction", label: "How satisfied are you with your final answer?", low: "Not satisfied", high: "Very satisfied" },
  { id: "effort", label: "How much mental effort did this task require?", low: "Very little effort", high: "A great deal of effort" },
];

function LikertScale({
  question,
  value,
  onChange,
}: {
  question: (typeof LIKERT_QUESTIONS)[0];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <p className="text-sm font-medium text-gray-800 mb-3">{question.label}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-24 text-right leading-tight">{question.low}</span>
        <div className="flex gap-2 flex-1 justify-center">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`w-9 h-9 rounded-full text-sm font-medium border transition-all ${
                value === n
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-200 text-gray-500 hover:border-gray-400"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 w-24 leading-tight">{question.high}</span>
      </div>
    </div>
  );
}

// Change 7: copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={handleCopy}
      className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-400 px-2.5 py-1 rounded transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function SubmitPage() {
  const [data, setData] = useState<SessionData | null>(null);
  const [condition, setCondition] = useState<Condition>("collaborative");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [likert, setLikert] = useState<Record<string, number>>({});
  // step 0 = review + quick ratings; 1..N = questionnaire pages; N+1 = Prolific ID
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [showMissing, setShowMissing] = useState<Set<string>>(new Set());
  const [prolificId, setProlificId] = useState("");
  const [completion, setCompletion] = useState<{ code: string | null; duplicate: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [surveyStartedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    const raw = sessionStorage.getItem("humaid_session_data");
    if (raw) setData(JSON.parse(raw));
    const m = sessionStorage.getItem("humaid_mode");
    if (isCondition(m)) setCondition(m);
    setProlificId(sessionStorage.getItem("humaid_participant_id") ?? "");
    const done = sessionStorage.getItem("humaid_completion");
    if (done) { setCompletion(JSON.parse(done)); return; }
    // Restore progress if the page is reloaded mid-questionnaire.
    try {
      const saved = JSON.parse(sessionStorage.getItem("humaid_survey_progress") ?? "null");
      if (saved) { setAnswers(saved.answers ?? {}); setStep(saved.step ?? 0); setRating(saved.rating ?? 0); setLikert(saved.likert ?? {}); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!data) return;
    sessionStorage.setItem("humaid_survey_progress", JSON.stringify({ answers, step, rating, likert }));
    window.scrollTo({ top: 0 });
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(k: string, v: string | number) {
    setAnswers((prev) => ({ ...prev, [k]: v }));
  }

  const quickDone = rating > 0 && LIKERT_QUESTIONS.every((q) => likert[q.id] > 0);
  const pages = SURVEY;
  const lastSurveyStep = pages.length;

  function next() {
    if (step === 0) {
      if (!quickDone) return;
      setStep(1);
      return;
    }
    const page = pages[step - 1];
    const missing = missingOnPage(page, condition, answers);
    if (missing.length) { setShowMissing(new Set(missing)); return; }
    setShowMissing(new Set());
    setStep(step + 1);
  }

  async function handleFinalSubmit() {
    const pid = prolificId.trim();
    if (!pid || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          participantId: pid,
          participantIdFromUrl: sessionStorage.getItem("humaid_participant_id"),
          studyId: sessionStorage.getItem("humaid_study_id"),
          prolificSessionId: sessionStorage.getItem("humaid_prolific_session_id"),
          isTest: sessionStorage.getItem("humaid_is_test") === "1",
          completionCodeFromUrl: sessionStorage.getItem("humaid_cc"),
          consentAt: sessionStorage.getItem("humaid_consent_at"),
          confidenceRating: rating,
          postTaskSurvey: likert,
          // Pre-task measures (AI literacy, trust propensity) + post-task questionnaire.
          survey: { ...JSON.parse(sessionStorage.getItem("humaid_pre_survey") ?? "{}"), ...answers },
          attentionCheckPassed: Number(answers.attn_1) === 2,
          surveyStartedAt,
          surveyCompletedAt: new Date().toISOString(),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j) throw new Error(j?.error ?? `HTTP ${res.status}`);
      const done = { code: j.completionCode ?? null, duplicate: Boolean(j.duplicate) };
      setCompletion(done);
      sessionStorage.removeItem("humaid_survey_progress");
      sessionStorage.setItem("humaid_completion", JSON.stringify(done)); // prevents re-submission on reload
    } catch (err) {
      setSubmitError(`We could not save your response (${err instanceof Error ? err.message : "error"}). Please try again.`);
    }
    setIsSubmitting(false);
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-sm text-gray-400">No session data found.</p>
        <Link href="/" className="text-gray-700 underline text-sm mt-2 inline-block">Return to home</Link>
      </div>
    );
  }

  // ── Completion screen ───────────────────────────────────────────────────────
  if (completion) {
    return (
      <div className="max-w-md mx-auto py-10" style={{ textAlign: "center" }}>
        <div className="w-9 h-9 border-2 border-gray-900 rounded-full flex items-center justify-center mb-4 mx-auto">
          <svg className="w-4 h-4 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Thank you — your response has been recorded</h1>
        <p className="text-sm text-gray-500 mb-6">AI agents can produce plausible but inaccurate information; please do not rely on the report from this study as a factual source.</p>
        {completion.code ? (
          <div className="border border-gray-200 rounded-lg p-5 mb-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Your Prolific completion code</p>
            <p className="font-mono text-2xl font-semibold text-gray-900 mb-3 select-all">{completion.code}</p>
            <CopyButton text={completion.code} />
            <a href={prolificCompletionUrl(completion.code)} className="block w-full mt-4 bg-gray-900 hover:bg-gray-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              Return to Prolific
            </a>
          </div>
        ) : (
          <p className="text-sm text-red-500">The completion code is not configured. Please contact the researcher via Prolific.</p>
        )}
        <p className="text-xs text-gray-400 font-mono">Session: {data.sessionId}</p>
      </div>
    );
  }

  const totalSteps = pages.length + 2;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6" style={{ textAlign: "center" }}>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">
          {step === 0 ? "Review and Rate" : step <= lastSurveyStep ? pages[step - 1].title : "Finish"}
        </h1>
        <p className="text-sm text-gray-500">Questionnaire — part {step + 1} of {totalSteps}</p>
        <div className="h-1 bg-gray-100 rounded mt-3 overflow-hidden">
          <div className="h-1 bg-gray-900 transition-all" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
        </div>
      </div>

      {step === 0 && (
        <>
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">Your Submitted Report</p>
              <CopyButton text={data.finalSubmission} />
            </div>
            <div className="p-5 max-h-96 overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(data.finalSubmission) }} />
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-5 mb-6">
            <p className="text-sm font-medium text-gray-900 mb-1">How confident are you that your report is accurate?</p>
            <p className="text-xs text-gray-400 mb-4">1 = not confident, 5 = very confident</p>
            <div className="flex gap-2 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setRating(star)} onMouseEnter={() => setHoverRating(star)} onMouseLeave={() => setHoverRating(0)} className="focus:outline-none">
                  <svg className={`w-8 h-8 transition-colors ${star <= (hoverRating || rating) ? "text-gray-900" : "text-gray-200"}`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-5 mb-6">
            <p className="text-sm font-medium text-gray-900 mb-1">Quick ratings</p>
            {LIKERT_QUESTIONS.map((q) => (
              <LikertScale key={q.id} question={q} value={likert[q.id] || 0} onChange={(v) => setLikert((prev) => ({ ...prev, [q.id]: v }))} />
            ))}
          </div>
        </>
      )}

      {step >= 1 && step <= lastSurveyStep &&
        pages[step - 1].blocks.filter((b) => blockApplies(b, condition)).map((b) => (
          <SurveyBlock key={b.id} block={b} condition={condition} answers={answers} set={set} showMissing={showMissing} />
        ))}

      {step === lastSurveyStep + 1 && (
        <div className="border border-gray-200 rounded-lg p-5 mb-6">
          <p className="text-sm font-medium text-gray-900 mb-1">Please enter your Prolific ID</p>
          <p className="text-xs text-gray-400 mb-3">We need your Prolific ID to pay you. Your completion code will appear after you submit.</p>
          <input
            type="text"
            value={prolificId}
            onChange={(e) => setProlificId(e.target.value)}
            placeholder="24-character Prolific ID"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-700 focus:outline-none focus:border-gray-400"
          />
          {prolificId.trim() && !/^[a-f0-9]{24}$/i.test(prolificId.trim()) && (
            <p className="text-xs text-amber-600 mt-2">Prolific IDs are usually 24 letters and numbers. Please double-check yours.</p>
          )}
          {submitError && <p className="text-sm text-red-500 mt-3">{submitError}</p>}
        </div>
      )}

      {showMissing.size > 0 && <p className="text-sm text-red-500 mb-3 text-center">Please answer the highlighted questions to continue.</p>}

      {step <= lastSurveyStep ? (
        <button
          onClick={next}
          disabled={step === 0 && !quickDone}
          className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors text-sm"
        >
          {step === 0 && !quickDone ? "Complete all ratings to continue" : "Continue"}
        </button>
      ) : (
        <button
          onClick={handleFinalSubmit}
          disabled={!prolificId.trim() || isSubmitting}
          className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors text-sm"
        >
          {isSubmitting ? "Submitting..." : "Submit and get my completion code"}
        </button>
      )}
    </div>
  );
}
