/**
 * Post-task questionnaire (mapped to the research proposal's constructs).
 *
 * Each item is stored in the session record under `survey[<id>]`.
 * (R) items are reverse-scored at analysis time; they are stored as answered.
 * Items can be restricted to some conditions with `only`.
 */

import type { Condition } from "@/lib/study-config";

export type Item =
  | { kind: "likert"; id: string; text: string; reverse?: boolean; attention?: number }
  | { kind: "choice"; id: string; text: string; options: { value: string; label: string }[] }
  | { kind: "text"; id: string; text: string; optional?: boolean; multiline?: boolean; showIf?: { id: string; values: string[] } }
  | { kind: "number"; id: string; text: string; min: number; max: number }
  | { kind: "sum"; id: string; text: string; parts: { id: string; label: string; only?: Condition[] }[] };

export type Block = {
  id: string;
  title?: string;
  intro?: string;
  /** Anchors for likert items in this block (7-point unless given). */
  scale?: string[];
  only?: Condition[];
  items: Item[];
};

export type Page = { id: string; title: string; blocks: Block[] };

const AGREE7 = ["Strongly disagree", "Disagree", "Somewhat disagree", "Neutral", "Somewhat agree", "Agree", "Strongly agree"];
const EXTENT5 = ["Not at all", "Slightly", "Somewhat", "Moderately", "Very much"];
const LOWHIGH7 = ["1 Very low", "2", "3", "4", "5", "6", "7 Very high"];

const MULTI: Condition[] = ["collaborative", "competitive", "competitive_norec"];
const ORCH: Condition[] = ["collaborative", "competitive", "competitive_norec"];

export const SURVEY: Page[] = [
  {
    id: "p1",
    title: "Working with the AI",
    blocks: [
      {
        id: "mc",
        items: [
          {
            kind: "choice",
            id: "mc_mode",
            text: "Which best describes how the AI worked on your report?",
            options: [
              { value: "single", label: "One AI agent wrote the report" },
              { value: "sequential", label: "Several AI agents built on each other's work, one after another" },
              { value: "competing", label: "Several AI agents each wrote their own competing report" },
              { value: "dont_know", label: "I don't remember" },
            ],
          },
        ],
      },
      {
        id: "consensus",
        only: MULTI,
        intro: "Thinking about the AI agents, how much do you agree with each statement?",
        scale: AGREE7,
        items: [
          { kind: "likert", id: "consensus_1", text: "The AI agents seemed to agree with one another." },
          { kind: "likert", id: "consensus_2", text: "The output I received reflected a single, unified point of view." },
          { kind: "likert", id: "consensus_3", text: "I noticed disagreements among the AI agents.", reverse: true },
          { kind: "likert", id: "consensus_4", text: "The AI agents gave me different perspectives to weigh against each other.", reverse: true },
        ],
      },
      {
        id: "verification",
        intro: "While working on the report, to what extent did you do the following?",
        scale: EXTENT5,
        items: [
          { kind: "likert", id: "verify_1", text: "I checked whether the facts and figures in the AI output were correct." },
          { kind: "likert", id: "verify_2", text: "I questioned claims made by the AI." },
          { kind: "likert", id: "verify_3", text: "I read the AI output critically, line by line." },
          { kind: "likert", id: "verify_4", text: "I accepted the AI output largely as it was.", reverse: true },
        ],
      },
      {
        id: "error",
        items: [
          {
            kind: "choice",
            id: "error_noticed",
            text: "Did you notice any factual errors, inconsistent numbers, or questionable claims in the AI output?",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
              { value: "not_sure", label: "Not sure" },
            ],
          },
          {
            kind: "text",
            id: "error_describe",
            text: "What did you notice, and did you correct it in your final report?",
            multiline: true,
            showIf: { id: "error_noticed", values: ["yes", "not_sure"] },
          },
        ],
      },
    ],
  },
  {
    id: "p2",
    title: "Trust and reliance",
    blocks: [
      {
        id: "trust_agents",
        intro: "How much do you agree with each statement about the AI agent(s) that wrote the content?",
        scale: AGREE7,
        items: [
          { kind: "likert", id: "trust_1", text: "The AI was reliable." },
          { kind: "likert", id: "trust_2", text: "The AI produced accurate information." },
          { kind: "likert", id: "trust_3", text: "I could depend on the AI for this task." },
          { kind: "likert", id: "trust_4", text: "I was suspicious of the AI's output.", reverse: true },
        ],
      },
      {
        id: "orch",
        only: ORCH,
        intro: "How much do you agree with each statement about the Orchestrator (the AI that coordinated the agents)?",
        scale: AGREE7,
        items: [
          { kind: "likert", id: "orch_1", text: "I trusted the Orchestrator's decisions." },
          { kind: "likert", id: "orch_2", text: "I relied on the Orchestrator to judge the quality of the agents' work." },
          { kind: "likert", id: "orch_3", text: "I would have made different decisions without the Orchestrator's guidance." },
          { kind: "likert", id: "orch_4", text: "The Orchestrator's reasoning was convincing." },
        ],
      },
    ],
  },
  {
    id: "p3",
    title: "Your report",
    blocks: [
      {
        id: "ownership",
        intro: "Thinking about the final report you submitted, how much do you agree with each statement?",
        scale: AGREE7,
        items: [
          { kind: "likert", id: "own_1", text: "This is MY report." },
          { kind: "likert", id: "own_2", text: "I feel a very high degree of personal ownership for this report." },
          { kind: "likert", id: "attn_1", text: "To show that you are reading carefully, please select \"Somewhat disagree\" for this statement.", attention: 3 },
          { kind: "likert", id: "own_3", text: "I sense that this report reflects my own work." },
          { kind: "likert", id: "own_4", text: "It is hard for me to think about this report as mine.", reverse: true },
        ],
      },
      {
        id: "accountability",
        intro: "How much do you agree with each statement?",
        scale: AGREE7,
        items: [
          { kind: "likert", id: "acct_1", text: "I feel personally responsible for the quality of the final report." },
          { kind: "likert", id: "acct_2", text: "If the report contained an error, it would be my fault." },
          { kind: "likert", id: "acct_3", text: "I would be comfortable putting my name on this report." },
        ],
      },
      {
        id: "resp",
        items: [
          {
            kind: "sum",
            id: "resp",
            text: "Imagine the report contained a serious factual error that misled a manager. How much of the responsibility would lie with each of the following? (Must add up to 100.)",
            parts: [
              { id: "resp_self", label: "Me (the person who submitted it)" },
              { id: "resp_agents", label: "The AI agent(s) that wrote the content" },
              { id: "resp_orch", label: "The Orchestrator that coordinated or selected the content", only: ORCH },
              { id: "resp_designers", label: "The designers of the AI platform" },
            ],
          },
        ],
      },
      {
        id: "quality",
        intro: "How much do you agree with each statement about your final report?",
        scale: AGREE7,
        items: [
          { kind: "likert", id: "qual_1", text: "My final report is accurate." },
          { kind: "likert", id: "qual_2", text: "My final report is useful for senior managers." },
          { kind: "likert", id: "qual_3", text: "My final report is well organized and clearly written." },
        ],
      },
    ],
  },
  {
    id: "p4",
    title: "Workload",
    blocks: [
      {
        id: "tlx",
        intro: "How would you rate the task you just completed?",
        scale: LOWHIGH7,
        items: [
          { kind: "likert", id: "tlx_mental", text: "Mental demand: How mentally demanding was the task?" },
          { kind: "likert", id: "tlx_temporal", text: "Temporal demand: How hurried or rushed was the pace of the task?" },
          { kind: "likert", id: "tlx_performance", text: "Performance: How unsuccessful were you in accomplishing what you were asked to do? (1 = fully successful)" },
          { kind: "likert", id: "tlx_effort", text: "Effort: How hard did you have to work to accomplish your level of performance?" },
          { kind: "likert", id: "tlx_frustration", text: "Frustration: How insecure, discouraged, irritated, stressed, or annoyed were you?" },
        ],
      },
      {
        id: "overload",
        intro: "How much do you agree with each statement?",
        scale: AGREE7,
        items: [
          { kind: "likert", id: "overload_1", text: "There was too much AI-generated information to process." },
          { kind: "likert", id: "overload_2", text: "I felt overwhelmed by the amount of AI output." },
          { kind: "likert", id: "overload_3", text: "It was difficult to decide which content to use." },
        ],
      },
      {
        id: "strategy",
        items: [
          { kind: "text", id: "strategy", text: "In a few sentences, how did you decide what to keep, change, or remove from the AI output?", multiline: true },
        ],
      },
    ],
  },
  {
    id: "p5",
    title: "About you",
    blocks: [
      {
        id: "demo",
        items: [
          { kind: "number", id: "age", text: "What is your age?", min: 18, max: 100 },
          {
            kind: "choice", id: "gender", text: "What is your gender?",
            options: [
              { value: "woman", label: "Woman" }, { value: "man", label: "Man" },
              { value: "nonbinary", label: "Non-binary / third gender" }, { value: "na", label: "Prefer not to say" },
            ],
          },
          {
            kind: "choice", id: "education", text: "What is the highest level of education you have completed?",
            options: [
              { value: "hs", label: "High school or less" }, { value: "some_college", label: "Some college / associate degree" },
              { value: "bachelor", label: "Bachelor's degree" }, { value: "master", label: "Master's degree" },
              { value: "doctoral", label: "Doctoral or professional degree" },
            ],
          },
          {
            kind: "choice", id: "ai_use", text: "How often do you use generative AI tools (e.g., ChatGPT, Claude, Gemini, Copilot)?",
            options: [
              { value: "1", label: "Never" }, { value: "2", label: "Less than once a month" }, { value: "3", label: "A few times a month" },
              { value: "4", label: "A few times a week" }, { value: "5", label: "Daily" },
            ],
          },
          {
            kind: "choice", id: "healthcare_worker", text: "Do you currently work in healthcare (e.g., physician, nurse, pharmacist, allied health)?",
            options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
          },
        ],
      },
      {
        id: "knowledge",
        intro: "How much do you know about the following topics?",
        scale: ["Nothing", "A little", "A moderate amount", "A lot", "Expert"],
        items: [
          { kind: "likert", id: "know_genai", text: "Generative AI and how businesses use it" },
          { kind: "likert", id: "know_manufacturing", text: "The manufacturing industry" },
          { kind: "likert", id: "know_reports", text: "Writing business or industry reports" },
        ],
      },
      {
        id: "literacy",
        intro: "How much do you agree with each statement?",
        scale: AGREE7,
        items: [
          { kind: "likert", id: "ailit_1", text: "I understand the main strengths and weaknesses of AI chatbots." },
          { kind: "likert", id: "ailit_2", text: "I know that AI tools can produce confident but incorrect statements." },
          { kind: "likert", id: "ailit_3", text: "I can check whether information provided by an AI tool is accurate." },
          { kind: "likert", id: "tprop_1", text: "My typical approach is to trust new technologies until they prove to me that I shouldn't trust them." },
          { kind: "likert", id: "tprop_2", text: "I generally give a technology the benefit of the doubt when I first use it." },
        ],
      },
      {
        id: "honesty",
        items: [
          {
            kind: "choice", id: "honesty",
            text: "It is vital to our study that we only include responses from people who devoted their full attention. Your answer will NOT affect your payment. Should we use your data?",
            options: [
              { value: "yes", label: "Yes, I paid full attention and my data should be used" },
              { value: "no", label: "No, I was distracted and my data should not be used" },
            ],
          },
          { kind: "text", id: "comments", text: "Any comments about the study or the platform? (optional)", optional: true, multiline: true },
        ],
      },
    ],
  },
];

export function blockApplies(b: Block, c: Condition): boolean {
  return !b.only || b.only.includes(c);
}

/** Item IDs (and sum-part IDs) required for a page in a condition, given current answers. */
export function missingOnPage(page: Page, c: Condition, answers: Record<string, string | number>): string[] {
  const missing: string[] = [];
  for (const b of page.blocks) {
    if (!blockApplies(b, c)) continue;
    for (const it of b.items) {
      if (it.kind === "text") {
        if (it.optional) continue;
        if (it.showIf && !it.showIf.values.includes(String(answers[it.showIf.id] ?? ""))) continue;
        if (!String(answers[it.id] ?? "").trim()) missing.push(it.id);
      } else if (it.kind === "sum") {
        const parts = it.parts.filter((p) => !p.only || p.only.includes(c));
        const total = parts.reduce((a, p) => a + Number(answers[p.id] ?? 0), 0);
        if (parts.some((p) => answers[p.id] === undefined || answers[p.id] === "") || total !== 100) missing.push(it.id);
      } else if (it.kind === "number") {
        const v = Number(answers[it.id]);
        if (!Number.isFinite(v) || v < it.min || v > it.max) missing.push(it.id);
      } else if (answers[it.id] === undefined || answers[it.id] === "") {
        missing.push(it.id);
      }
    }
  }
  return missing;
}
