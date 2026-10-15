(function () {
  "use strict";

  const sharedQuestions = [
    {
      category: "behavioral",
      role: "all",
      prompt: "Tell me about a time you had to learn something quickly to complete a task.",
      context: "Interviewers want to understand how you adapt when something is new.",
      topic: "Learning agility"
    },
    {
      category: "behavioral",
      role: "all",
      prompt: "Describe a time you worked with someone whose approach was different from yours.",
      context: "Show how you communicate, collaborate, and find common ground.",
      topic: "Collaboration"
    },
    {
      category: "behavioral",
      role: "all",
      prompt: "Tell me about a mistake or setback and what you learned from it.",
      context: "A thoughtful reflection is more useful than trying to sound perfect.",
      topic: "Resilience"
    },
    {
      category: "technical",
      role: "all",
      prompt: "How do you approach a problem when the requirements are unclear?",
      context: "Talk through how you clarify the problem before choosing a solution.",
      topic: "Problem solving"
    },
    {
      category: "technical",
      role: "all",
      prompt: "How would you explain a complex technical idea to someone without a technical background?",
      context: "Use a simple example and check that your explanation is understood.",
      topic: "Communication"
    }
  ];

  const roleQuestions = {
    software: [
      { category: "behavioral", role: "software", prompt: "Tell me about a project you built and a challenge you had to solve.", context: "Pick a project where you can explain your own contribution.", topic: "Project storytelling" },
      { category: "behavioral", role: "software", prompt: "Describe a time you received feedback on your code. How did you respond?", context: "Show how you use feedback to improve the work.", topic: "Receiving feedback" },
      { category: "technical", role: "software", prompt: "How would you investigate a bug that only happens intermittently?", context: "Walk through how you would reproduce, isolate, and verify a fix.", topic: "Debugging" },
      { category: "technical", role: "software", prompt: "What factors would you consider when choosing between a list and a hash map for a task?", context: "Explain the trade-offs in terms of the operations your task needs.", topic: "Data structures" },
      { category: "technical", role: "software", prompt: "How would you design a simple service that lets users search a large catalog?", context: "Start by clarifying needs, then describe a reasonable first design.", topic: "System design basics" }
    ],
    data: [
      { category: "behavioral", role: "data", prompt: "Tell me about a time your analysis changed someone's understanding of a problem.", context: "Explain the question, your analysis, and how you shared the result.", topic: "Communicating insights" },
      { category: "behavioral", role: "data", prompt: "Describe a time you found an issue or inconsistency in a dataset.", context: "Focus on how you checked the issue and what you did next.", topic: "Data quality" },
      { category: "technical", role: "data", prompt: "How would you investigate a sudden drop in a key business metric?", context: "Describe how you would validate the data and narrow down possible causes.", topic: "Metric investigation" },
      { category: "technical", role: "data", prompt: "How would you explain the difference between correlation and causation to a stakeholder?", context: "A simple example can make this distinction easier to understand.", topic: "Statistical reasoning" },
      { category: "technical", role: "data", prompt: "What would you check before sharing a dashboard with a team?", context: "Consider correctness, context, and whether the visuals answer the intended question.", topic: "Dashboard quality" }
    ],
    product: [
      { category: "behavioral", role: "product", prompt: "Tell me about a time you had to prioritize between competing requests.", context: "Explain the criteria you used and how you communicated the decision.", topic: "Prioritization" },
      { category: "behavioral", role: "product", prompt: "Describe a time you brought people together around a shared goal.", context: "Highlight how you handled different perspectives.", topic: "Stakeholder alignment" },
      { category: "technical", role: "product", prompt: "How would you decide whether a new feature is successful?", context: "Connect a user outcome to a measurable signal and a time frame.", topic: "Product metrics" },
      { category: "technical", role: "product", prompt: "How would you learn why users are abandoning a sign-up flow?", context: "Consider both behavioral data and direct user feedback.", topic: "User research" },
      { category: "technical", role: "product", prompt: "How would you prioritize a bug fix against a planned feature?", context: "Explain how impact, urgency, and effort could inform your decision.", topic: "Product trade-offs" }
    ],
    customer: [
      { category: "behavioral", role: "customer", prompt: "Tell me about a time you helped someone who was frustrated.", context: "Show how you listened, responded, and followed through.", topic: "Empathy" },
      { category: "behavioral", role: "customer", prompt: "Describe a time you had to explain a difficult answer to a customer.", context: "Balance clarity and empathy while describing what you could do.", topic: "Difficult conversations" },
      { category: "technical", role: "customer", prompt: "How would you handle a customer issue you could not resolve immediately?", context: "Explain how you set expectations and keep ownership of the follow-up.", topic: "Case ownership" },
      { category: "technical", role: "customer", prompt: "How would you decide which of several incoming customer requests to address first?", context: "Consider urgency, impact, and how you would keep customers informed.", topic: "Prioritization" },
      { category: "technical", role: "customer", prompt: "What would you do if a customer reported a problem you could not reproduce?", context: "Explain what information you would gather and how you would keep investigating.", topic: "Troubleshooting" }
    ]
  };

  const roleNames = {
    software: "Software engineer",
    data: "Data analyst",
    product: "Product manager",
    customer: "Customer support"
  };

  function selectQuestions(options, count) {
    const rolePool = roleQuestions[options.role] || roleQuestions.software;
    const pool = rolePool.concat(sharedQuestions);
    const matches = pool.filter(function (question) {
      return options.type === "mixed" || question.category === options.type;
    });
    const difficulty = options.difficulty || "standard";

    matches.sort(function (left, right) {
      const leftScore = scoreQuestion(left, difficulty);
      const rightScore = scoreQuestion(right, difficulty);
      return rightScore - leftScore;
    });

    return matches.slice(0, count).map(function (question) {
      return Object.assign({}, question);
    });
  }

  function scoreQuestion(question, difficulty) {
    const roleBonus = question.role === "all" ? 0 : 4;
    const challengeBonus = question.prompt.length > 85 ? 2 : 0;
    if (difficulty === "friendly") {
      return roleBonus - challengeBonus;
    }
    if (difficulty === "challenging") {
      return roleBonus + challengeBonus;
    }
    return roleBonus;
  }

  window.InterviewQuestionBank = {
    roleNames: roleNames,
    selectQuestions: selectQuestions
  };
}());
