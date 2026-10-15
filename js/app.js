(function () {
  "use strict";

  const QUESTION_COUNT = 5;
  const views = {
    landing: document.getElementById("landing-view"),
    dashboard: document.getElementById("dashboard-view"),
    setup: document.getElementById("setup-view"),
    interview: document.getElementById("interview-view"),
    report: document.getElementById("report-view")
  };
  const state = {
    view: "landing",
    options: null,
    questions: [],
    answers: [],
    index: 0,
    currentFeedback: null
  };

  document.addEventListener("click", handleAction);
  document.getElementById("setup-form").addEventListener("submit", startSessionFromForm);
  document.getElementById("answer-form").addEventListener("submit", submitAnswer);
  document.getElementById("answer-input").addEventListener("input", updateAnswerCounter);
  document.getElementById("continue-button").addEventListener("click", continueSession);

  function showView(name, focusSelector) {
    if (!views[name]) {
      showView("landing");
      return;
    }
    Object.keys(views).forEach(function (key) {
      views[key].hidden = key !== name;
    });
    state.view = name;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (focusSelector) {
      window.requestAnimationFrame(function () {
        const target = document.querySelector(focusSelector);
        if (target) target.focus();
      });
    }
  }

  function handleAction(event) {
    const control = event.target.closest("[data-action]");
    if (!control) return;
    const action = control.getAttribute("data-action");
    if (action === "home") {
      event.preventDefault();
      showView("landing");
    } else if (action === "how-it-works") {
      event.preventDefault();
      if (state.view !== "landing") showView("landing");
      window.requestAnimationFrame(function () {
        document.getElementById("how-it-works").scrollIntoView({ behavior: "smooth" });
      });
    } else if (action === "dashboard") {
      showView("dashboard", "#dashboard-title");
    } else if (action === "start-interview") {
      showView("setup", "#setup-title");
    } else if (action === "practice") {
      document.querySelector('input[name="type"][value="behavioral"]').checked = true;
      showView("setup", "#setup-title");
    } else if (action === "retry-answer") {
      retryCurrentAnswer();
    } else if (action === "retry-interview") {
      if (state.options) beginSession(state.options);
    }
  }

  function startSessionFromForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const options = {
      role: data.get("role"),
      experience: data.get("experience"),
      type: data.get("type"),
      difficulty: data.get("difficulty")
    };
    const error = document.getElementById("setup-error");
    const validRoles = ["software", "data", "product", "customer"];
    const validTypes = ["mixed", "behavioral", "technical"];
    const validDifficulties = ["friendly", "standard", "challenging"];
    if (validRoles.indexOf(options.role) < 0 || validTypes.indexOf(options.type) < 0 || validDifficulties.indexOf(options.difficulty) < 0) {
      error.textContent = "Please choose a valid option for each field.";
      error.hidden = false;
      return;
    }
    error.hidden = true;
    beginSession(options);
  }

  function beginSession(options) {
    const questions = window.InterviewQuestionBank.selectQuestions(options, QUESTION_COUNT);
    if (questions.length !== QUESTION_COUNT) {
      const error = document.getElementById("setup-error");
      error.textContent = "We couldn't build a complete question set. Please try a different interview type.";
      error.hidden = false;
      showView("setup");
      return;
    }
    state.options = Object.assign({}, options);
    state.questions = questions;
    state.answers = [];
    state.index = 0;
    state.currentFeedback = null;
    renderQuestion();
    showView("interview", "#question-title");
  }

  function renderQuestion() {
    const question = state.questions[state.index];
    const isBehavioral = question.category === "behavioral";
    const progress = Math.round(((state.index + 1) / state.questions.length) * 100);
    document.getElementById("session-meta").textContent = window.InterviewQuestionBank.roleNames[state.options.role] + " · " + experienceLabel(state.options.experience);
    document.getElementById("question-category").textContent = isBehavioral ? "BEHAVIORAL QUESTION" : "ROLE-RELATED QUESTION";
    document.getElementById("progress-label").textContent = isBehavioral ? "A real example helps tell your story." : "Talk through your thinking out loud.";
    document.getElementById("progress-count").textContent = "Question " + (state.index + 1) + " of " + state.questions.length;
    document.getElementById("question-title").textContent = question.prompt;
    document.getElementById("question-context").textContent = question.context;
    document.getElementById("answer-hint").innerHTML = isBehavioral
      ? "<strong>Try STAR:</strong> Situation · Task · Action · Result"
      : "<strong>Try this structure:</strong> Understand the problem · Explain your approach · Share a trade-off or check";
    document.getElementById("answer-input").value = "";
    document.getElementById("answer-input").disabled = false;
    document.getElementById("answer-error").hidden = true;
    document.getElementById("feedback-panel").hidden = true;
    document.getElementById("answer-form").hidden = false;
    const progressBar = document.querySelector(".progress-track");
    progressBar.setAttribute("aria-valuenow", String(state.index + 1));
    progressBar.setAttribute("aria-valuemax", String(state.questions.length));
    document.getElementById("progress-fill").style.width = progress + "%";
    updateAnswerCounter();
  }

  function submitAnswer(event) {
    event.preventDefault();
    const input = document.getElementById("answer-input");
    const answer = input.value.trim();
    const error = document.getElementById("answer-error");
    if (!answer) {
      error.textContent = "Write a few words before asking for feedback.";
      error.hidden = false;
      input.focus();
      return;
    }
    if (answer.length < 20) {
      error.textContent = "Add a little more detail (at least 20 characters) so the checklist can give you useful feedback.";
      error.hidden = false;
      input.focus();
      return;
    }
    error.hidden = true;
    requestFeedback(answer);
  }

  async function requestFeedback(answer) {
    const input = document.getElementById("answer-input");
    const submitButton = document.getElementById("submit-answer");
    const error = document.getElementById("answer-error");
    const originalButtonContent = submitButton.innerHTML;
    const question = state.questions[state.index].prompt;

    submitButton.disabled = true;
    submitButton.textContent = "Getting feedback...";
    input.disabled = true;

    try {
      const response = await fetch("http://127.0.0.1:5000/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, answer: answer })
      });
      let feedback;
      try {
        feedback = await response.json();
      } catch (parseError) {
        feedback = null;
      }

      if (!response.ok) {
        throw new Error(feedback && typeof feedback.error === "string"
          ? feedback.error
          : "The feedback service couldn't process your answer. Please try again.");
      }
      if (
        !feedback
        || !Array.isArray(feedback.strengths)
        || !feedback.strengths.every(function (item) { return typeof item === "string"; })
        || !Array.isArray(feedback.improvements)
        || !feedback.improvements.every(function (item) { return typeof item === "string"; })
        || typeof feedback.sample_improved_answer !== "string"
        || !feedback.sample_improved_answer.trim()
      ) {
        throw new Error("The feedback service returned an unexpected response. Please try again.");
      }

      const rubric = window.InterviewFeedback.analyze(answer, state.questions[state.index].category);
      const result = {
        score: rubric.score,
        wordCount: rubric.wordCount,
        signals: rubric.signals,
        strengths: feedback.strengths,
        gaps: feedback.improvements,
        suggestion: feedback.sample_improved_answer
      };
      state.currentFeedback = { answer: answer, result: result };
      renderFeedback(result);
    } catch (requestError) {
      error.textContent = requestError instanceof TypeError
        ? "We couldn't reach the feedback service. Make sure the Flask backend is running at http://127.0.0.1:5000, then try again."
        : requestError.message;
      error.hidden = false;
      input.disabled = false;
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonContent;
    }
  }

  function renderFeedback(result) {
    document.querySelector("#feedback-title + p").textContent = "Gemini-generated interview-practice feedback";
    document.getElementById("feedback-strengths").replaceChildren.apply(
      document.getElementById("feedback-strengths"),
      result.strengths.map(createListItem)
    );
    document.getElementById("feedback-gaps").replaceChildren.apply(
      document.getElementById("feedback-gaps"),
      result.gaps.map(createListItem)
    );
    document.getElementById("feedback-suggestion").textContent = result.suggestion;
    document.getElementById("answer-input").disabled = true;
    document.getElementById("feedback-panel").hidden = false;
    document.getElementById("continue-button").textContent = state.index === state.questions.length - 1 ? "See my report →" : "Continue →";
    document.getElementById("feedback-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function retryCurrentAnswer() {
    if (state.currentFeedback) state.currentFeedback = null;
    document.getElementById("feedback-panel").hidden = true;
    document.getElementById("answer-form").hidden = false;
    const answerInput = document.getElementById("answer-input");
    answerInput.value = "";
    answerInput.disabled = false;
    updateAnswerCounter();
    answerInput.focus();
  }

  function continueSession() {
    if (!state.currentFeedback) return;
    state.answers[state.index] = {
      question: state.questions[state.index],
      answer: state.currentFeedback.answer,
      feedback: state.currentFeedback.result
    };
    state.currentFeedback = null;
    if (state.index + 1 < state.questions.length) {
      state.index += 1;
      renderQuestion();
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("question-title").focus();
    } else {
      renderReport();
      showView("report", "#report-title");
    }
  }

  function renderReport() {
    const totals = state.answers.reduce(function (sum, item) {
      return sum + item.feedback.score;
    }, 0);
    const average = Math.round(totals / state.answers.length);
    document.getElementById("report-summary").textContent = "You completed " + state.answers.length + " questions for a " + window.InterviewQuestionBank.roleNames[state.options.role] + " interview. Use this checklist as a guide for your next practice—not as a measure of your potential.";
    document.getElementById("score-value").textContent = average;
    const dimensions = [
      { label: "Answer development", key: "detail", max: 30 },
      { label: "Specific evidence", key: "evidence", max: 25 },
      { label: "Structure", key: "structure", max: 25 },
      { label: "Outcome / takeaway", key: "outcome", max: 20 }
    ];
    const sums = { detail: 0, evidence: 0, structure: 0, outcome: 0 };
    state.answers.forEach(function (item) {
      const feedback = item.feedback;
      sums.detail += Math.round(Math.min(feedback.wordCount / (item.question.category === "behavioral" ? 100 : 85), 1) * 30);
      const exampleScore = Math.min((item.answer.match(/\b\d+(?:\.\d+)?%?\b/g) || []).length / 2, 1);
      const signals = feedback.signals.length;
      sums.evidence += Math.round(Math.max((signals / (item.question.category === "behavioral" ? 4 : 3)) * 17, exampleScore * 25));
      sums.structure += Math.round((signals / (item.question.category === "behavioral" ? 4 : 3)) * 25);
      sums.outcome += Math.round(Math.max((item.question.category === "behavioral" ? Number(feedback.signals.indexOf("Result") >= 0) * 12 : Number(signals >= 3) * 12), exampleScore * 20));
    });
    document.getElementById("score-breakdown").replaceChildren.apply(
      document.getElementById("score-breakdown"),
      dimensions.map(function (dimension) {
        const value = Math.round(sums[dimension.key] / state.answers.length);
        const row = document.createElement("div");
        row.className = "score-item";
        const label = document.createElement("span");
        label.textContent = dimension.label;
        const score = document.createElement("strong");
        score.textContent = value + " / " + dimension.max;
        row.append(label, score);
        return row;
      })
    );
    const strengthCounts = countFeedback("strengths");
    const gapCounts = countFeedback("gaps");
    const strongest = topItems(strengthCounts, 3, ["You completed every question in your practice session."]);
    const growth = topItems(gapCounts, 3, ["Keep practicing with clear examples and specific details."]);
    setList("report-strengths", strongest);
    setList("report-improvements", growth);
    const topics = [];
    state.answers.forEach(function (item) {
      if (growth.some(function (gap) { return item.feedback.gaps.indexOf(gap) >= 0; }) && topics.indexOf(item.question.topic) < 0) {
        topics.push(item.question.topic);
      }
    });
    if (topics.length === 0) {
      topics.push(state.answers[0].question.topic, state.answers[1].question.topic);
    }
    const topicList = document.getElementById("recommended-topics");
    topicList.replaceChildren.apply(topicList, topics.slice(0, 3).map(function (topic) {
      const chip = document.createElement("span");
      chip.className = "topic-chip";
      chip.textContent = topic;
      return chip;
    }));
  }

  function countFeedback(kind) {
    const counts = {};
    state.answers.forEach(function (item) {
      item.feedback[kind].forEach(function (value) {
        counts[value] = (counts[value] || 0) + 1;
      });
    });
    return counts;
  }

  function topItems(counts, limit, fallback) {
    const entries = Object.keys(counts).sort(function (left, right) {
      return counts[right] - counts[left];
    }).slice(0, limit);
    return entries.length ? entries : fallback;
  }

  function setList(id, values) {
    const list = document.getElementById(id);
    list.replaceChildren.apply(list, values.map(createListItem));
  }

  function createListItem(text) {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }

  function updateAnswerCounter() {
    const length = document.getElementById("answer-input").value.length;
    document.getElementById("answer-counter").textContent = length + (length === 1 ? " character" : " characters");
  }

  function experienceLabel(value) {
    const labels = {
      student: "Student / recent graduate",
      entry: "Early career",
      experienced: "Experienced"
    };
    return labels[value] || labels.student;
  }

  document.querySelector(".honesty-note p").textContent =
    "Gemini provides interview-practice feedback. Your answers are sent to the feedback service during practice and are not saved by this demo.";
  document.querySelector(".privacy-caption").textContent =
    "Your answer is sent to Gemini for feedback.";
  document.querySelector(".rubric-details p").textContent =
    "The score uses a simple checklist: answer development (0–30), relevant specifics or evidence (0–25), clear structure (0–25), and a useful outcome or takeaway (0–20). This score is deterministic demo feedback. Your strengths, improvements, and sample improved answer are generated by Gemini for practice—not as a hiring assessment or prediction of interview success.";

  showView("landing");
}());
