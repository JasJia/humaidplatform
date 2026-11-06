type Step = { label: string; time: string };

import type { Condition } from "@/lib/study-config";

const CHECKLISTS: Record<Condition, { total: string; steps: Step[] }> = {
  single: {
    total: "about 15-20 minutes",
    steps: [
      { label: "Add any preferences and start the agent", time: "~1 min" },
      { label: "Read the draft report carefully", time: "~3-4 min" },
      { label: "Edit the report, or send feedback for a revised draft", time: "~4-5 min" },
      { label: "Submit your answer and complete the questionnaire", time: "~6-8 min" },
    ],
  },
  collaborative: {
    total: "about 15-20 minutes",
    steps: [
      { label: "Add any preferences or per-agent instructions and start the pipeline", time: "~1 min" },
      { label: "Start the pipeline and follow the orchestrator's plan and each agent's handoff", time: "~3-4 min" },
      { label: "Read the final report produced by the last agent", time: "~2-3 min" },
      { label: "Edit the report, or send feedback to run the pipeline again", time: "~3-4 min" },
      { label: "Submit your answer and complete the questionnaire", time: "~6-8 min" },
    ],
  },
  competitive: {
    total: "about 15-20 minutes",
    steps: [
      { label: "Add any preferences or per-agent styles and run the agents", time: "~1 min" },
      { label: "Run the agents and read all three reports and their critiques", time: "~4-5 min" },
      { label: "Review the orchestrator's decision and choose the best output", time: "~2 min" },
      { label: "Edit the chosen report, or request another round with feedback", time: "~3-4 min" },
      { label: "Submit your answer and complete the questionnaire", time: "~6-8 min" },
    ],
  },
  competitive_norec: {
    total: "about 15-20 minutes",
    steps: [
      { label: "Add any preferences or per-agent styles and run the agents", time: "~1 min" },
      { label: "Read all three reports and their critiques", time: "~4-5 min" },
      { label: "Choose the report you want to use", time: "~2 min" },
      { label: "Edit the chosen report, or request another round with feedback", time: "~3-4 min" },
      { label: "Submit your answer and complete the questionnaire", time: "~6-8 min" },
    ],
  },
};

export function ModeChecklist({ mode }: { mode: Condition }) {
  const { total, steps } = CHECKLISTS[mode];

  return (
    <div className="border border-gray-200 rounded-lg p-5 bg-white">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Your To-Do List</p>
        <span className="text-xs text-gray-500">Estimated time: {total}</span>
      </div>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="w-5 h-5 bg-gray-900 text-white rounded-full text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="text-sm text-gray-600 leading-relaxed flex-1">{step.label}</span>
            <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5">{step.time}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
