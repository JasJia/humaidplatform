export const TASK = {
  title: "Industry Report: Generative AI in Manufacturing",
  // Fixed task text sent to the agents. Held constant across conditions so that
  // outputs are comparable (participants can add preferences, not change the task).
  topic: "Write an industry report on the impact of Generative AI on the manufacturing sector, focusing on cost implications for senior managers",
  description:
    "Your task is to produce a short industry report for senior managers on how Generative AI affects costs in the manufacturing sector. AI agents will draft the report for you. Your job is to guide them, check their work carefully, and edit the report until you would be comfortable putting your name on it. The most accurate, highest-quality reports will receive a bonus.",
  estimatedTime: "about 20 minutes",
};

export const COLLABORATIVE = {
  agent1: {
    id: 1,
    name: "Agent 1",
    role: "Keyword Specialist",
    color: "blue" as const,
    description: "Generates relevant search keywords for your literature review topic.",
    keywords: [
      "Generative AI in higher education",
      "Large language models (LLMs) in academia",
      "ChatGPT educational applications",
      "AI-assisted learning and teaching",
      "Academic integrity and AI tools",
      "Automated feedback systems",
      "Personalized learning with AI",
      "AI ethics in educational settings",
      "Natural language processing in education",
      "Student engagement with generative AI",
      "AI-driven curriculum design",
      "Plagiarism detection in the AI era",
      "Pedagogical innovation and generative AI",
      "Human-AI collaboration in learning",
      "AI assessment and evaluation tools",
    ],
  },
  agent2: {
    id: 2,
    name: "Agent 2",
    role: "Paper Search Specialist",
    color: "emerald" as const,
    description: "Searches academic databases using the provided keywords to identify relevant papers.",
    papers: [
      {
        title: "ChatGPT for Good? On Opportunities and Challenges of Large Language Models for Education",
        authors: "Kasneci, E., Seßler, K., Küchemann, S., Bannert, M., et al.",
        year: 2023,
        journal: "Learning and Individual Differences",
        relevance: "High" as const,
        summary:
          "Examines LLMs as dual-edged tools — powerful for personalized feedback and scaffolding, but prone to generating plausible misinformation requiring careful pedagogical oversight.",
      },
      {
        title:
          "Education in the Era of Generative Artificial Intelligence (AI): Understanding the Potential Benefits of ChatGPT in Promoting Teaching and Learning",
        authors: "Baidoo-Anu, D., & Ansah, L. O.",
        year: 2023,
        journal: "Journal of AI",
        relevance: "High" as const,
        summary:
          "Reviews ChatGPT's potential to support personalized learning, automated feedback generation, and administrative efficiency in university settings.",
      },
      {
        title: "Chatting and Cheating: Ensuring Academic Integrity in the Era of ChatGPT",
        authors: "Cotton, D. R. E., Cotton, P. A., & Shipway, J. R.",
        year: 2023,
        journal: "Innovations in Education and Teaching International",
        relevance: "High" as const,
        summary:
          "Investigates how ChatGPT's conversational fluency challenges traditional assessment paradigms and calls for urgent policy and design responses.",
      },
      {
        title: "Assigning AI: Seven Approaches for Students, with Prompts",
        authors: "Mollick, E. R., & Mollick, L.",
        year: 2023,
        journal: "SSRN Electronic Journal",
        relevance: "Medium" as const,
        summary:
          "Proposes a practical framework for faculty to design AI-integrated assignments that promote critical thinking rather than prohibiting AI use.",
      },
      {
        title: "ChatGPT User Experience: Implications for Education",
        authors: "Zhai, X.",
        year: 2023,
        journal: "SSRN Electronic Journal",
        relevance: "Medium" as const,
        summary:
          "Surveys student perceptions and usage patterns, finding efficiency maximization as the primary motivation — raising concerns about deep learning outcomes.",
      },
      {
        title: "Chatting about ChatGPT: How May AI and GPT Impact Academia and Libraries?",
        authors: "Lund, B. D., & Wang, T.",
        year: 2023,
        journal: "Library Hi Tech News",
        relevance: "Medium" as const,
        summary:
          "Discusses institutional implications for academic libraries and research workflows as AI-generated content blurs traditional authorship boundaries.",
      },
    ],
  },
  agent3: {
    id: 3,
    name: "Agent 3",
    role: "Literature Summarizer",
    color: "violet" as const,
    description: "Synthesizes the identified papers into a structured literature review summary.",
    summary: `The rapid emergence of generative AI technologies — particularly large language models (LLMs) such as ChatGPT — has prompted substantial scholarly attention to their implications for higher education. Recent literature reveals a field grappling simultaneously with transformative opportunity and significant institutional risk. Kasneci et al. (2023) provide a foundational overview, arguing that LLMs possess the capacity to personalize feedback, scaffold complex reasoning, and democratize access to high-quality educational support, while cautioning that their propensity to generate plausible but inaccurate content necessitates careful pedagogical oversight.

A central theme across the reviewed literature is the tension between academic integrity and the utility of AI tools. Cotton et al. (2023) document how the conversational fluency of ChatGPT fundamentally challenges traditional assessment paradigms, calling for urgent reconsideration of what constitutes original student work. In response, scholars such as Mollick and Mollick (2023) have proposed proactive integration strategies — designing assignments that leverage AI capabilities rather than prohibiting them — thereby repositioning AI as a collaborative learning partner rather than a threat to academic honesty.

Empirical investigations into student behavior and perception add further nuance. Zhai (2023) finds that students primarily engage with generative AI for efficiency gains, raising questions about deep learning and cognitive engagement. Meanwhile, Lund and Wang (2023) extend the analysis to institutional stakeholders, noting that academic libraries and research workflows face structural disruption as AI-generated content blurs traditional boundaries of authorship and citation. Collectively, the literature points toward an emerging consensus: successful integration of generative AI in higher education requires not only technical policy but also a fundamental rethinking of pedagogy, assessment design, and institutional governance frameworks.`,
  },
};

export const COMPETITIVE = [
  {
    id: 1,
    name: "Agent A",
    style: "Analytical & Structured",
    description: "Evidence-based findings with clear structure and headers",
    color: "blue" as const,
    output: `Overview
Generative AI has introduced a paradigm shift in higher education, offering measurable improvements in learning outcomes when deployed thoughtfully. The literature consistently identifies three primary domains of impact: personalized instruction, assessment transformation, and administrative efficiency.

Key Findings
• LLMs enable real-time, personalized feedback at scale, addressing longstanding limitations of large-class instruction (Kasneci et al., 2023)
• Faculty-designed AI integration strategies can preserve academic rigor while enhancing student agency (Mollick & Mollick, 2023)
• Institutional frameworks for AI governance are nascent but rapidly developing (Baidoo-Anu & Ansah, 2023)

Challenges Identified
Academic integrity concerns remain the most frequently cited barrier to adoption. Cotton et al. (2023) document a significant increase in AI-assisted submissions across institutions. However, the literature suggests this challenge is addressable through redesigned assessment structures rather than blanket prohibition.

Conclusion
The evidence base supports cautious, structured integration of generative AI in higher education. Institutions that proactively develop AI-inclusive pedagogical frameworks are better positioned to harness benefits while mitigating risks associated with over-reliance and academic dishonesty.`,
  },
  {
    id: 2,
    name: "Agent B",
    style: "Narrative & Flowing",
    description: "Cohesive prose that synthesizes findings into a story",
    color: "emerald" as const,
    output: `The story of generative AI in higher education is still being written — but its opening chapters have already disrupted decades of settled pedagogical assumptions. When ChatGPT became widely accessible in late 2022, universities found themselves confronting a technology that could, within seconds, produce the kind of analytical prose that faculty had spent careers teaching students to write.

Scholars such as Kasneci et al. (2023) have urged the field to resist reactionary prohibition, pointing instead to a rich set of possibilities: AI that tutors struggling students at midnight, generates instant feedback on draft essays, and makes expert knowledge accessible regardless of institutional resources. This optimistic reading finds support in Baidoo-Anu and Ansah (2023), who situate generative AI within a longer arc of educational technology adoption, arguing that each new tool ultimately enriches the learning environment when given time to be absorbed.

Yet the counternarrative is equally compelling. Cotton et al. (2023) document how the very fluency that makes LLMs valuable also makes them dangerous. Zhai (2023) finds that efficiency, not understanding, drives most student AI use — suggesting that without deliberate intervention, generative AI may deepen rather than bridge existing equity gaps. The literature, in sum, offers not a verdict but a provocation: higher education must decide, urgently, what it is actually for.`,
  },
  {
    id: 3,
    name: "Agent C",
    style: "Critical & Concise",
    description: "Precise and critical, surfaces key tensions directly",
    color: "violet" as const,
    output: `Generative AI presents higher education with a structural challenge that existing policy frameworks are poorly equipped to handle. The reviewed literature, while growing rapidly, reflects a field in early-stage sense-making rather than settled understanding.

Three findings warrant particular attention. First, the academic integrity crisis triggered by LLMs is real and underestimated. Cotton et al. (2023) demonstrate that detection tools consistently lag behind generative capabilities, creating an asymmetric arms race that institutions are currently losing. Second, student adoption is driven primarily by cognitive offloading rather than learning enhancement (Zhai, 2023) — a pattern with serious long-term implications for skill development that the current literature does not adequately address.

Third, the enthusiasm for AI integration strategies (Mollick & Mollick, 2023) largely sidesteps equity questions. Access to effective AI tools correlates with digital literacy and socioeconomic status, risks that remain undertheorized in the reviewed literature.

The field requires longitudinal empirical studies, not further conceptual frameworks. Until controlled evidence on learning outcomes is available, institutional adoption decisions rest on speculation rather than evidence.`,
  },
];
