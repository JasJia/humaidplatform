# HUMAID Platform

**Human Multi-Agent AI Interaction Dynamics**

HUMAID is a research platform for studying how people work with multiple AI agents on a knowledge task. Each participant writes a short industrial report on the use of Generative AI in industry, assisted by a team of three AI agents. The platform records how the participant guides, reviews, and edits the agents' output, and makes that data available to researchers through a password-protected dashboard.

Deployment: NA

## Overview

Participants are recruited through CloudResearch Connect. On arrival they enter their Connect participant ID, which is validated before the session begins. They are then given a writing task and complete it in one of two interaction modes. Every meaningful action during the session is logged, and the final submission is compared against the original AI output to measure how much of it the participant actually changed.

The study is built around a comparison between two ways of organising several agents around a single task.

## Study Design (v2, schema 2.0)

Version 2 turns the platform into a self-contained randomized experiment for Prolific (see the research proposal, Study 1).

- **No login.** Participants open the study link, give consent, and go straight to the task. Prolific's `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID` URL parameters are captured automatically when present.
- **Random assignment.** `/api/assign` places each participant in the least-filled cell of the design: **4 architectures × 2 seeded-error levels**. The architectures are `single` (one agent), `collaborative` (sequential pipeline), `competitive` (parallel agents, orchestrator recommends one), and `competitive_norec` (parallel agents, no recommendation). The cell is chosen with balanced randomization using KV counters.
- **Seeded error.** In error cells, a verifiable, internally inconsistent claim ("cut costs by 40%, from $50 million to $40 million") is inserted into the AI report the participant reviews. In competitive modes it goes into the orchestrator's pick. `seededErrorRetained` records whether the error survived in the submitted report.
- **Fixed task.** Every condition uses the same task and ~300-word report length. Participants can add preferences but cannot change the task.
- **Questionnaire.** After submitting the report, participants answer a multi-page questionnaire (`lib/survey.ts`). It covers manipulation check, perceived consensus, verification, error noticing, trust, orchestrator reliance, psychological ownership, accountability, responsibility allocation, NASA-TLX, overload, demographics, an attention check, and a self-reported honesty check. They then enter or confirm their Prolific ID and receive the completion code.
- **Prolific study link.** `https://<host>/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}&cc=<COMPLETION_CODE>`. The `cc` parameter supplies the completion code when the env var is not set.
- **Database.** Sessions are stored in Upstash Redis (Vercel Storage, `KV_*` env vars). Free Upstash databases are archived after inactivity; if saving fails, check the store status under Vercel → Storage.
- **Test runs.** Use `/?test=1&reset=1` (optionally `&mode=single|collaborative|competitive|competitive_norec&error=0|1`). Test sessions are flagged `isTest`, do not count toward balancing, and are hidden from dashboard statistics by default.

Study environment variables:

```
PROLIFIC_COMPLETION_CODE  Completion code shown on the final page (optional: otherwise pass &cc=CODE in the study link)
GROQ_MODEL                Preferred Groq model; falls back automatically if retired (default: openai/gpt-oss-120b)
STUDY_CONDITIONS          Optional subset of arms, e.g. "collaborative,competitive"
SEEDED_ERROR              Set to "off" to disable the seeded-error factor
NEXT_PUBLIC_PI_CONTACT    PI name and email shown on the consent page
NEXT_PUBLIC_IRB_PROTOCOL  IRB protocol number shown on the consent page
```

## Interaction Modes

### Collaborative

Three agents work in sequence under a coordinating orchestrator. The orchestrator reads the participant's task and decides what each agent should do; the roles are not fixed and vary from run to run. The first two agents carry out research and analysis, and the final agent writes the report using their combined work. The participant sees the orchestrator's full activity log, reads the finished report, and can edit it before submitting. If the result is unsatisfactory, the participant can send written feedback and the orchestrator runs the pipeline again.

### Competitive

Three agents work on the same task independently and in parallel, each producing its own report. They then review each other's work, and the orchestrator selects the version it considers strongest, with a written rationale. The participant sees all three reports, the critiques, and the orchestrator's decision. They can keep the recommended version or choose a different agent's output, edit it, and submit. As in collaborative mode, the participant can request another round with feedback.

Before starting, the participant can optionally provide a custom task, set preferences such as tone or audience, and assign specific instructions to individual agents.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI providers | OpenAI, Groq, DeepSeek |
| Data store | Upstash Redis (Vercel KV) |
| Recruitment | CloudResearch Connect |
| Auth | Cookie-based password gate |

## AI Models

The three agents are deliberately powered by different model providers (OpenAI, Groq, and DeepSeek) so that their outputs are genuinely distinct rather than three variations from a single model. The orchestrator's planning and decision steps run on OpenAI. The provider assigned to each agent is recorded with every session.

## Data Collection

Each completed session is stored as a single record. Alongside the participant's submission and survey responses, the record captures a structured set of fields intended for quantitative analysis, including:

- Version stamps for the data schema, the deployed build, and the agent prompt set
- The participant, assignment, and project identifiers from CloudResearch Connect
- The condition (mode) and how it was assigned
- The actual task used and whether the participant customised it
- The order agents were shown and which model served each one
- Timing: total session duration, time spent on the instructions, and time spent viewing each agent's output
- Edit metrics: edit distance and word-count change between the AI output and the final submission
- The number of re-runs, and whether the participant kept the orchestrator's recommendation
- API latency per call and in aggregate, and the number of failed model calls

A separate event stream records lower-level interactions during the session, such as scroll depth on each panel and debounced edits to the report.

## Participant Validation

Connect participant IDs are validated on the server through the CloudResearch validate-participants endpoint before a participant can start or submit. A participant who has already completed a session is prevented from completing a second one. Both behaviours are controlled by environment flags so the study settings can change without a code change:

- `STRICT_PARTICIPANT_VALIDATION` set to `true` blocks participants when validation cannot be completed. By default the platform allows them through and records the session as unvalidated.
- `ALLOW_REPEAT_PARTICIPATION` set to `true` permits repeat completions. By default they are blocked.

## Admin Dashboard

The dashboard sits behind a private path and a password, with the session cookie lasting seven days. It shows summary counts, survey averages, a table of all sessions, and a per-session log that includes the full agent conversation and the data-quality metrics. Researchers can export the data as Excel, CSV, or JSON.

## Environment Variables

Set the following for local development and in the hosting environment for production:

```
OPENAI_API_KEY            OpenAI API key
GROQ_API_KEY              Groq API key
DEEPSEEK_API_KEY          DeepSeek API key
ADMIN_PASSWORD            Password for the admin dashboard
ADMIN_SECRET              Secret used to sign the admin session cookie
KV_REST_API_URL           Key-value store REST URL
KV_REST_API_TOKEN         Key-value store REST token
CLOUDRESEARCH_API_KEY     CloudResearch Connect API key (participant validation)
```

Optional flags: `STRICT_PARTICIPANT_VALIDATION`, `ALLOW_REPEAT_PARTICIPATION`.

## Running Locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The AI routes require valid model provider keys. Participant validation falls back to allowing entry when no CloudResearch key is configured, so the flow can be tested locally without one.

## Research Context

The platform supports work on the HUMAID framework, which addresses a gap in human-AI interaction theory. Most existing models describe a single human interacting with a single AI. As multi-agent systems become more common, new dynamics arise around information overload, inconsistent outputs across agents, delegation, and social influence, none of which the dyadic models account for. HUMAID provides a controlled setting in which these dynamics can be observed and measured.
