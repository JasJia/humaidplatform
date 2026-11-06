"use client";

import { usePathname } from "next/navigation";

const WORK_PATHS = ["/single", "/collaborative", "/competitive"];

const STEPS = [
  { label: "Welcome", match: (p: string) => p === "/" },
  { label: "Instructions", match: (p: string) => p === "/instructions" },
  { label: "Task", match: (p: string) => WORK_PATHS.includes(p) },
  { label: "Questionnaire", match: (p: string) => p === "/submit" },
];

/**
 * Read-only progress indicator. Steps are deliberately not clickable: going
 * back (e.g. from the questionnaire to the task) would compromise the
 * experimental record.
 */
export function ProgressBar() {
  const pathname = usePathname();
  const currentIndex = STEPS.findIndex((s) => s.match(pathname));
  if (currentIndex === -1) return null;

  return (
    <div className="border-b border-gray-100 bg-white">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-center">
        {STEPS.map((step, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={step.label} className="flex items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                    isDone ? "bg-gray-400" : isCurrent ? "bg-gray-900" : "bg-gray-200"
                  }`}
                />
                <span
                  className={`text-sm select-none ${
                    isCurrent ? "text-gray-900 font-semibold" : isDone ? "text-gray-400" : "text-gray-300"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px mx-3 flex-shrink-0 ${isDone ? "bg-gray-300" : "bg-gray-100"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
