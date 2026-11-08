"use client";

import type { Block, Item } from "@/lib/survey";
import type { Condition } from "@/lib/study-config";

/** Renders one questionnaire block (used by the pre-task page and /submit). */
export type Answers = Record<string, string | number>;

function LikertRow({ item, scale, value, onChange }: { item: Extract<Item, { kind: "likert" }>; scale: string[]; value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <p className="text-sm text-gray-800 mb-2">{item.text}</p>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${scale.length}, minmax(0, 1fr))` }}>
        {scale.map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i + 1)}
            className={`text-[11px] leading-tight px-1 py-2 rounded border transition-colors ${
              value === i + 1 ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-500 hover:border-gray-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SurveyBlock({ block, condition, answers, set, showMissing }: { block: Block; condition: Condition; answers: Answers; set: (k: string, v: string | number) => void; showMissing: Set<string> }) {
  const scale = block.scale ?? [];
  return (
    <div className="border border-gray-200 rounded-lg p-5 mb-4 bg-white">
      {block.intro && <p className="text-sm font-medium text-gray-900 mb-2">{block.intro}</p>}
      {block.items.map((it) => {
        const miss = showMissing.has(it.id);
        if (it.kind === "likert") {
          return (
            <div key={it.id} className={miss ? "bg-red-50 -mx-2 px-2 rounded" : ""}>
              <LikertRow item={it} scale={scale} value={answers[it.id] as number | undefined} onChange={(v) => set(it.id, v)} />
            </div>
          );
        }
        if (it.kind === "choice") {
          return (
            <div key={it.id} className={`py-3 ${miss ? "bg-red-50 -mx-2 px-2 rounded" : ""}`}>
              <p className="text-sm font-medium text-gray-900 mb-2">{it.text}</p>
              <div className="space-y-1.5">
                {it.options.map((o) => (
                  <label key={o.value} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name={it.id} checked={answers[it.id] === o.value} onChange={() => set(it.id, o.value)} className="mt-1" />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          );
        }
        if (it.kind === "text") {
          if (it.showIf && !it.showIf.values.includes(String(answers[it.showIf.id] ?? ""))) return null;
          return (
            <div key={it.id} className={`py-3 ${miss ? "bg-red-50 -mx-2 px-2 rounded" : ""}`}>
              <p className="text-sm font-medium text-gray-900 mb-2">{it.text}</p>
              <textarea
                value={String(answers[it.id] ?? "")}
                onChange={(e) => set(it.id, e.target.value)}
                rows={it.multiline ? 3 : 1}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400"
              />
            </div>
          );
        }
        if (it.kind === "number") {
          return (
            <div key={it.id} className={`py-3 ${miss ? "bg-red-50 -mx-2 px-2 rounded" : ""}`}>
              <p className="text-sm font-medium text-gray-900 mb-2">{it.text}</p>
              <input
                type="number" min={it.min} max={it.max}
                value={String(answers[it.id] ?? "")}
                onChange={(e) => set(it.id, e.target.value === "" ? "" : Number(e.target.value))}
                className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-gray-400"
              />
            </div>
          );
        }
        // constant sum
        const parts = it.parts.filter((p) => !p.only || p.only.includes(condition));
        const total = parts.reduce((a, p) => a + Number(answers[p.id] ?? 0), 0);
        return (
          <div key={it.id} className={`py-3 ${miss ? "bg-red-50 -mx-2 px-2 rounded" : ""}`}>
            <p className="text-sm font-medium text-gray-900 mb-3">{it.text}</p>
            <div className="space-y-2">
              {parts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-700">{p.label}</span>
                  <input
                    type="number" min={0} max={100}
                    value={String(answers[p.id] ?? "")}
                    onChange={(e) => set(p.id, e.target.value === "" ? "" : Math.max(0, Math.min(100, Number(e.target.value))))}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:border-gray-400"
                  />
                </div>
              ))}
              <p className={`text-xs text-right ${total === 100 ? "text-gray-400" : "text-red-500"}`}>Total: {total} / 100</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

