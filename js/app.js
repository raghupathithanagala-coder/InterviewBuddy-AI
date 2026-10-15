(function () {
  "use strict";

  const QUESTION_COUNT = 5;
  const ROLE_NAMES = {
    software: "Software Developer",
    web: "Web Developer",
    data: "Data Analyst",
    ai_ml: "AI/ML Engineer",
    electronics: "Electronics Engineer",
    embedded: "Embedded Systems Engineer",
    communications: "Communication Engineer",
    hr: "HR/Behavioral Interview"
  };
  const configuredApiBase = document.querySelector('meta[name="api-base-url"]').content.trim().replace(/\/+$/, "");
  const localApiBase = ["localhost", "127.0.0.1"].indexOf(window.location.hostname) >= 0
    ? "http://127.0.0.1:5000"
    : "";
  const API_BASE_URL = configuredApiBase || localApiBase;
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
    currentFeedback: null,
    activeQuestion: null,
    activeIsFollowUp: false,
    previousTurn: null
  };

  document.addEventListener("click", handleAction);
  document.getElementById("setup-form").addEventListener("submit", startSessionFromForm);
  document.getElementById("answer-form").addEventListener("submit", submitAnswer);
  document.getElementById("answer-input").addEventListener("input", updateAnswerCounter);
  document.getElementById("continue-button").addEventListener("click", continueSession);
  document.getElementById("answer-follow-up").addEventListener("click", answerFollowUp);

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
      document.querySelector('input[name="type"][value="mixed"]').checked = true;
      document.querySelector('select[name="difficulty"]').value = "friendly";
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
    const validRoles = Object.keys(ROLE_NAMES);
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

  async function beginSession(options) {
    const error = document.getElementById("setup-error");
    const buildButton = document.getElementById("build-session");
    error.hidden = true;
    buildButton.disabled = true;
    buildButton.textContent = "Generating questions with Gemini...";
    try {
      const result = await requestApi("/api/questions", options);
      if (!result || !Array.isArray(result.questions) || result.questions.length !== QUESTION_COUNT
        || !result.questions.every(function (question) {
          return question && typeof question.question === "string" && question.question.trim()
            && typeof question.context === "string" && typeof question.topic === "string"
            && (question.category === "behavioral" || question.category === "technical")
            && ["warmup", "standard", "stretch"].indexOf(question.stage) >= 0;
        })) {
        throw new Error("Gemini did not return a complete question set. Please try again.");
      }
      state.options = Object.assign({}, options);
      state.questions = result.questions.map(function (question) {
        return {
          prompt: question.question,
          context: question.context,
          category: question.category,
          topic: question.topic,
          stage: question.stage
        };
      });
      state.answers = [];
      state.index = 0;
      state.currentFeedback = null;
      state.previousTurn = null;
      state.activeIsFollowUp = false;
      state.activeQuestion = null;
      renderQuestion();
      showView("interview", "#question-title");
    } catch (requestError) {
      error.textContent = requestError instanceof TypeError
        ? connectionMessage()
        : requestError.message;
      error.hidden = false;
      showView("setup", "#setup-title");
    } finally {
      buildButton.disabled = false;
      buildButton.innerHTML = "Generate AI questions <span aria-hidden=\"true\">→</span>";
    }
  }

  function renderQuestion() {
    const question = state.activeQuestion || state.questions[state.index];
    state.activeQuestion = question;
    const isBehavioral = question.category === "behavioral";
    const progress = Math.round(((state.index + 1) / state.questions.length) * 100);
    document.getElementById("session-meta").textContent = ROLE_NAMES[state.options.role] + " · " + experienceLabel(state.options.experience);
    document.getElementById("question-category").textContent = state.activeIsFollowUp
      ? "PERSONALIZED FOLLOW-UP"
      : (isBehavioral ? "BEHAVIORAL QUESTION" : "ROLE-RELATED QUESTION")
        + " · " + question.stage.toUpperCase();
    document.getElementById("progress-label").textContent = state.activeIsFollowUp
      ? "Build on your last answer; this follow-up is based on what you shared."
      : state.index === 0
        ? "Start with the warm-up. The questions gradually build in challenge."
        : isBehavioral ? "A real example helps tell your story." : "Talk through your thinking out loud.";
    document.getElementById("progress-count").textContent = "Question " + (state.index + 1) + " of " + state.questions.length
      + (state.activeIsFollowUp ? " · follow-up" : "");
    document.getElementById("question-title").textContent = question.prompt;
    document.getElementById("question-context").textContent = question.context;
    document.getElementById("answer-hint").innerHTML = isBehavioral
      ? "<strong>Take it one step at a time:</strong> Situation · Task · Action · Result"
      : "<strong>Take it one step at a time:</strong> Clarify the problem · Explain your approach · Share a trade-off or check";
    document.getElementById("answer-input").value = "";
    document.getElementById("answer-input").disabled = false;
    document.getElementById("answer-error").hidden = true;
    document.getElementById("feedback-panel").hidden = true;
    document.getElementById("answer-form").hidden = false;
    document.getElementById("answer-follow-up").hidden = true;
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
      error.textContent = "Add a little more detail (at least 20 characters) so Gemini can evaluate your answer.";
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
    const question = state.activeQuestion;

    submitButton.disabled = true;
    submitButton.textContent = "Gemini is evaluating...";
    input.disabled = true;

    try {
      const feedback = await requestApi("/api/feedback", {
        role: state.options.role,
        experience: state.options.experience,
        question: question.prompt,
        answer: answer,
        previous_question: state.previousTurn ? state.previousTurn.question : "",
        previous_answer: state.previousTurn ? state.previousTurn.answer : "",
        is_follow_up: state.activeIsFollowUp
      });
      if (
        !feedback
        || !Number.isInteger(feedback.score)
        || feedback.score < 0
        || feedback.score > 100
        || !Array.isArray(feedback.strengths)
        || !feedback.strengths.every(function (item) { return typeof item === "string"; })
        || !Array.isArray(feedback.weaknesses)
        || !feedback.weaknesses.every(function (item) { return typeof item === "string"; })
        || !Array.isArray(feedback.missing_concepts)
        || !feedback.missing_concepts.every(function (item) { return typeof item === "string"; })
        || !Array.isArray(feedback.grammar_suggestions)
        || !feedback.grammar_suggestions.every(function (item) { return typeof item === "string"; })
        || typeof feedback.clarity_feedback !== "string"
        || typeof feedback.relevance_feedback !== "string"
        || typeof feedback.improved_answer !== "string"
        || !feedback.improved_answer.trim()
        || typeof feedback.follow_up_question !== "string"
        || !feedback.follow_up_question.trim()
      ) {
        throw new Error("Gemini returned incomplete feedback. Please try again.");
      }
      state.currentFeedback = { answer: answer, result: feedback };
      renderFeedback(feedback);
    } catch (requestError) {
      error.textContent = requestError instanceof TypeError
        ? connectionMessage()
        : requestError.message;
      error.hidden = false;
      input.disabled = false;
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonContent;
    }
  }

  async function requestApi(path, payload) {
    const response = await fetch(API_BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    let result;
    try {
      result = await response.json();
    } catch (parseError) {
      result = null;
    }
    if (!response.ok) {
      throw new Error(result && typeof result.error === "string"
        ? result.error
        : "The interview service returned an error (" + response.status + "). Please try again.");
    }
    return result;
  }

  function connectionMessage() {
    return API_BASE_URL
      ? "We couldn't reach the interview service at " + API_BASE_URL + ". Check that the Flask backend is running, then try again."
      : "We couldn't reach the interview service. Check the configured API base URL and backend, then try again.";
  }

  function renderFeedback(result) {
    document.getElementById("answer-score").textContent = result.score + " / 100";
    setList("feedback-strengths", result.strengths, "Gemini did not identify any strengths.");
    setList("feedback-weaknesses", result.weaknesses, "Gemini did not identify specific weaknesses.");
    setList("feedback-missing", result.missing_concepts, "Gemini did not identify missing concepts.");
    setList("feedback-grammar", result.grammar_suggestions, "No grammar changes suggested.");
    document.getElementById("feedback-clarity").textContent = result.clarity_feedback;
    document.getElementById("feedback-relevance").textContent = result.relevance_feedback;
    document.getElementById("feedback-improved").textContent = result.improved_answer;
    document.getElementById("follow-up-question").textContent = result.follow_up_question;
    document.getElementById("follow-up-box").hidden = state.activeIsFollowUp;
    document.getElementById("answer-follow-up").hidden = state.activeIsFollowUp;
    document.getElementById("answer-input").disabled = true;
    document.getElementById("feedback-panel").hidden = false;
    document.getElementById("continue-button").textContent = state.index === state.questions.length - 1
      ? "Finish session →"
      : "Next question →";
    document.getElementById("feedback-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function retryCurrentAnswer() {
    state.currentFeedback = null;
    document.getElementById("feedback-panel").hidden = true;
    document.getElementById("answer-form").hidden = false;
    const answerInput = document.getElementById("answer-input");
    answerInput.value = "";
    answerInput.disabled = false;
    updateAnswerCounter();
    answerInput.focus();
  }

  function saveCurrentAnswer() {
    if (!state.currentFeedback) return;
    state.answers.push({
      question: state.activeQuestion,
      answer: state.currentFeedback.answer,
      feedback: state.currentFeedback.result,
      isFollowUp: state.activeIsFollowUp
    });
    state.previousTurn = {
      question: state.activeQuestion.prompt,
      answer: state.currentFeedback.answer
    };
    state.currentFeedback = null;
  }

  function answerFollowUp() {
    if (!state.currentFeedback || !state.currentFeedback.result.follow_up_question) return;
    const followUp = state.currentFeedback.result.follow_up_question;
    const parentQuestion = state.activeQuestion;
    saveCurrentAnswer();
    state.activeIsFollowUp = true;
    state.activeQuestion = {
      prompt: followUp,
      context: "Use your previous answer as a starting point.",
      category: parentQuestion.category,
      topic: parentQuestion.topic,
      stage: parentQuestion.stage
    };
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("question-title").focus();
  }

  function continueSession() {
    if (!state.currentFeedback) return;
    const wasFollowUp = state.activeIsFollowUp;
    saveCurrentAnswer();
    if (!wasFollowUp && state.index + 1 < state.questions.length) {
      state.index += 1;
      state.activeIsFollowUp = false;
      state.activeQuestion = null;
      renderQuestion();
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("question-title").focus();
    } else if (wasFollowUp && state.index + 1 < state.questions.length) {
      state.index += 1;
      state.activeIsFollowUp = false;
      state.activeQuestion = null;
      renderQuestion();
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("question-title").focus();
    } else {
      renderReport();
      showView("report", "#report-title");
    }
  }

  function renderReport() {
    const average = Math.round(state.answers.reduce(function (sum, item) {
      return sum + item.feedback.score;
    }, 0) / state.answers.length);
    document.getElementById("report-summary").textContent =
      "You completed " + state.answers.length + " AI-evaluated answers for a "
      + ROLE_NAMES[state.options.role] + " interview. The session score averages Gemini's evaluation scores.";
    document.getElementById("score-value").textContent = average;
    const scores = state.answers.map(function (item) { return item.feedback.score; });
    const metrics = [
      { label: "AI-evaluated answers", value: String(state.answers.length) },
      { label: "Highest answer score", value: Math.max.apply(null, scores) + " / 100" },
      { label: "Lowest answer score", value: Math.min.apply(null, scores) + " / 100" },
      { label: "Personalized follow-ups", value: String(state.answers.filter(function (item) {
        return item.isFollowUp;
      }).length) }
    ];
    document.getElementById("score-breakdown").replaceChildren.apply(
      document.getElementById("score-breakdown"),
      metrics.map(function (metric) {
        const row = document.createElement("div");
        row.className = "score-item";
        const label = document.createElement("span");
        label.textContent = metric.label;
        const value = document.createElement("strong");
        value.textContent = metric.value;
        row.append(label, value);
        return row;
      })
    );
    const strengthCounts = countFeedback("strengths");
    const growthCounts = countFeedback("weaknesses");
    const conceptCounts = countFeedback("missing_concepts");
    Object.keys(conceptCounts).forEach(function (concept) {
      growthCounts[concept] = (growthCounts[concept] || 0) + conceptCounts[concept];
    });
    setList("report-strengths", topItems(strengthCounts, 3), "Gemini did not identify recurring strengths.");
    setList("report-improvements", topItems(growthCounts, 3), "Gemini did not identify recurring improvement areas.");
    const topics = [];
    state.answers.forEach(function (item) {
      if (item.question.topic && topics.indexOf(item.question.topic) < 0) topics.push(item.question.topic);
    });
    const topicList = document.getElementById("recommended-topics");
    topicList.replaceChildren.apply(topicList, topics.slice(0, 5).map(function (topic) {
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

  function topItems(counts, limit) {
    return Object.keys(counts).sort(function (left, right) {
      return counts[right] - counts[left];
    }).slice(0, limit);
  }

  function setList(id, values, emptyMessage) {
    const list = document.getElementById(id);
    const items = values.length ? values : (emptyMessage ? [emptyMessage] : []);
    list.replaceChildren.apply(list, items.map(createListItem));
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

  showView("landing");
}());
