"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ModeChecklist } from "@/components/mode-checklist";
import { CONDITION_LABEL, isCondition, workPath, type Condition } from "@/lib/study-config";

export default function InstructionsPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Condition | null>(null);

  useEffect(() => {
    // Task already submitted (e.g. browser Back) — continue to the questionnaire.
    if (sessionStorage.getItem("humaid_session_data")) { router.replace("/submit"); return; }
    const m = sessionStorage.getItem("humaid_mode");
    if (!isCondition(m)) { router.push("/"); return; }
    setMode(m);
    // Record when the instructions page was shown, to measure dwell time.
    sessionStorage.setItem("humaid_instructions_start", String(Date.now()));
  }, [router]);

  function handleBegin() {
    sessionStorage.setItem("humaid_mode_start_time", new Date().toISOString());
    const start = Number(sessionStorage.getItem("humaid_instructions_start") || 0);
    if (start) sessionStorage.setItem("humaid_time_on_instructions_ms", String(Date.now() - start));
    if (mode) router.push(workPath(mode));
  }

  if (!mode) return null;

  return (
    <div className="max-w-3xl mx-auto">

      {/* Centered header */}
      <div style={{ textAlign: "center" }} className="mb-8">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">
          {CONDITION_LABEL[mode]}
        </p>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Before You Begin</h1>
        <p className="text-sm text-gray-500">Read the instructions carefully before starting.</p>
      </div>

      {mode === "collaborative" ? (
        <div className="space-y-4 mb-8">
          <ModeChecklist mode="collaborative" />
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">How It Works</p>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              In Collaborative Mode, three AI agents work in sequence. The Orchestrator reads your task and dynamically decides what each agent should do — the roles are not fixed. Each agent hands its output to the next, building progressively toward a final report, and the Orchestrator reviews each stage before passing it on.
            </p>
            <div className="space-y-4">
              {[
                {
                  label: "Step 1 — First agent",
                  desc: "The Orchestrator assigns the first agent a task based on your prompt (for example, gathering data, defining the report's scope, or researching the topic). This agent's output becomes the foundation for the next stage.",
                },
                {
                  label: "Step 2 — Second agent",
                  desc: "The second agent builds on the first agent's work with its own assigned task — such as analysis, gathering evidence, or adding depth. The Orchestrator reviews the first agent's output before briefing this stage.",
                },
                {
                  label: "Step 3 — Final agent",
                  desc: "The final agent synthesises everything into the finished report. This is your working draft — you can read it, edit it directly in the text editor, and revise it as much as you like before submitting.",
                },
              ].map((step, i) => (
                <div key={i} className="flex gap-3">
                  <span className="w-6 h-6 bg-gray-900 text-white rounded-full text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{step.label}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Your Role</p>
            <ul className="space-y-2.5 text-sm text-gray-600">
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>At the start, you can give the Orchestrator any specific requirements (for example, tone or focus) and, optionally, instructions for individual agents.</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>After the pipeline completes, you will see the Orchestrator's full activity log showing every decision and handoff between agents.</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>If you are not satisfied with the result, you can give the Orchestrator written feedback and it will re-run the full pipeline incorporating your guidance.</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>Edit the final report produced by the last agent as you see fit before submitting it as your answer.</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>AI agents can make mistakes. Check the report carefully — you are responsible for the accuracy of the report you submit.</li>
            </ul>
          </div>
        </div>
      ) : mode === "single" ? (
        <div className="space-y-4 mb-8">
          <ModeChecklist mode="single" />
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">How It Works</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              In Single-Agent Mode, one AI agent writes the report for you. You can give it requirements before it starts, read its draft, edit the draft directly, or send feedback to have it write a revised version.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Your Role</p>
            <ul className="space-y-2.5 text-sm text-gray-600">
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>At the start, you can give the agent any specific requirements (for example, tone or focus).</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>Read the draft carefully. If you are not satisfied, send written feedback and the agent will revise it.</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>Edit the report as you see fit before submitting it as your answer.</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>AI agents can make mistakes. Check the report carefully — you are responsible for the accuracy of the report you submit.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          <ModeChecklist mode={mode} />
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">How It Works</p>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              In Competitive Mode, all three agents tackle the same task independently and simultaneously, each bringing a different writing style and perspective. An Orchestrator manages the full process: assigning the task, collecting outputs, and running a critique round in which the agents evaluate each other's work{mode === "competitive" ? ", and then selecting the strongest version" : ""}.
            </p>
            <div className="space-y-4">
              {[
                { label: "Agent A", desc: "Independently works on the task and produces its own report." },
                { label: "Agent B", desc: "Independently works on the same task and produces its own report." },
                { label: "Agent C", desc: "Independently works on the same task and produces its own report." },
              ].map((agent, i) => (
                <div key={i} className="flex gap-3">
                  <span className="w-6 h-6 bg-gray-900 text-white rounded-full text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">{String.fromCharCode(65 + i)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{agent.label}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{agent.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">The Process</p>
            <div className="space-y-2.5 text-sm text-gray-600 mb-4">
              {mode === "competitive" ? (
                <p className="text-xs text-gray-600 leading-relaxed">Once the agents have submitted their reports, they each write a critique of the other two. The Orchestrator then reviews all outputs and critiques and recommends the version it considers strongest, providing a written rationale for its decision.</p>
              ) : (
                <p className="text-xs text-gray-600 leading-relaxed">Once the agents have submitted their reports, they each write a critique of the other two. You then decide which report to use.</p>
              )}
              <p className="text-xs text-gray-600 leading-relaxed mt-2">You will see the full Orchestrator log, all three agent outputs, and each agent's critique, so you can make a fully informed judgment.</p>
            </div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Your Role</p>
            <ul className="space-y-2.5 text-sm text-gray-600">
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>At the start, you can give any preferences — such as desired tone or focus areas — and, optionally, a style for each agent.</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>Read all three agent outputs and critiques carefully before deciding.</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>{mode === "competitive" ? <>Use the &quot;Use this&quot; button next to the agent whose output you prefer. You are not required to follow the Orchestrator&apos;s recommendation.</> : <>Use the &quot;Use this&quot; button next to the agent whose output you prefer.</>}</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>Edit the selected report in the text editor before submitting it as your final answer.</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>If none of the outputs satisfy you, you can ask the Orchestrator to run another round with your feedback.</li>
              <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span>AI agents can make mistakes. Check the report carefully — you are responsible for the accuracy of the report you submit.</li>
            </ul>
          </div>
        </div>
      )}

      <button
        onClick={handleBegin}
        className="w-full bg-gray-900 hover:bg-gray-700 text-white font-medium py-3 rounded-lg transition-colors text-sm"
      >
        I understand, begin the task
      </button>
    </div>
  );
}
