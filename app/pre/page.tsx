"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PRE_SURVEY, missingOnPage } from "@/lib/survey";
import { SurveyBlock, type Answers } from "@/components/survey-block";
import { isCondition, type Condition } from "@/lib/study-config";

/**
 * Pre-task questionnaire (AI literacy, trust propensity). Shown after consent
 * and before the instructions so these moderators are measured before the
 * experimental manipulation.
 */
export default function PreSurveyPage() {
  const router = useRouter();
  const [condition, setCondition] = useState<Condition | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [showMissing, setShowMissing] = useState<Set<string>>(new Set());

  useEffect(() => {
    const m = sessionStorage.getItem("humaid_mode");
    if (!isCondition(m)) { router.replace("/"); return; }
    if (sessionStorage.getItem("humaid_pre_survey")) { router.replace("/instructions"); return; }
    setCondition(m);
  }, [router]);

  function handleContinue() {
    if (!condition) return;
    const missing = missingOnPage(PRE_SURVEY, condition, answers);
    if (missing.length) { setShowMissing(new Set(missing)); return; }
    sessionStorage.setItem("humaid_pre_survey", JSON.stringify(answers));
    sessionStorage.setItem("humaid_pre_survey_at", new Date().toISOString());
    router.push("/instructions");
  }

  if (!condition) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6" style={{ textAlign: "center" }}>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">{PRE_SURVEY.title}</h1>
        <p className="text-sm text-gray-500">A few quick questions about you before the task begins.</p>
      </div>

      {PRE_SURVEY.blocks.map((b) => (
        <SurveyBlock
          key={b.id}
          block={b}
          condition={condition}
          answers={answers}
          set={(k, v) => setAnswers((prev) => ({ ...prev, [k]: v }))}
          showMissing={showMissing}
        />
      ))}

      {showMissing.size > 0 && <p className="text-sm text-red-500 mb-3 text-center">Please answer the highlighted questions to continue.</p>}

      <button
        onClick={handleContinue}
        className="w-full bg-gray-900 hover:bg-gray-700 text-white font-medium py-3 rounded-lg transition-colors text-sm"
      >
        Continue
      </button>
    </div>
  );
}
