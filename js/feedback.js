(function () {
  "use strict";

  const behavioralSignals = [
    { key: "situation", label: "Situation", patterns: [/\b(?:during|while|when)\s+(?:(?:our|my|the|a|an)\s+)?[\w'-]+(?:\s+[\w'-]+){0,5}\b/i, /\b(situation|when|while|during|at my|in my|on a|there was|there were|the context|the project|the team)\b/i] },
    { key: "task", label: "Task", patterns: [/\bmy\s+task\s+(?:was|involved|included)\b/i, /\b(task|my (?:goal|responsibility|role)|i needed to|i had to|i was responsible|the challenge|our objective|we needed to|the goal was)\b/i] },
    { key: "action", label: "Action", patterns: [/\bi\s+(?:improved|tested)\b/i, /\b(action|i (?:built|created|led|designed|redesigned|analyzed|analysed|organized|organised|reorganized|reorganised|updated|decided|asked|wrote|tested|worked|implemented|improved|communicated|identified|proposed|used|developed|started|changed|helped|coordinated|prioritized|prioritised|reviewed|solved|found|spoke|planned|managed|chose|made|took)|i then|i first|my approach)\b/i] },
    { key: "result", label: "Result", patterns: [/\bas\s+a\s+result\b/i, /\b(result|outcome|as a result|resulted in|which meant|we achieved|i learned|i learnt|the outcome|in the end|improved by|reduced by|increased by|completed|saved|delivered|finished|reached|enabled|led to|successfully)\b/i] }
  ];

  const technicalSignals = [
    { key: "problem", label: "problem understanding", patterns: [/\b(understand|clarify|requirement|goal|problem|ask|scope|bug|issue|symptom|expected|actual|reproduc(?:e|es|ed|ing)|recreate)\b/i] },
    { key: "approach", label: "a clear approach", patterns: [/\b(first|then|next|approach|step|would|test|check|measure|compare|investigate|validate|analy[sz]e|debug|console|input|one thing at a time|one variable|isolate|regression test)\b/i] },
    { key: "outcome", label: "validation or trade-offs", patterns: [/\b(validat|verif|confirm|retest|regression test|trade.?off|because|however|instead|measure|result|impact|cost|risk|performance|outcome|follow.?up|fixed|working|pass(?:es|ed)?|fail(?:s|ed)?)\b/i] }
  ];

  const debuggingSteps = [
    { label: "reproducing the bug", patterns: [/\b(reproduc(?:e|es|ed|ing)|reproduction|recreate|reproduce the bug|reproduce the issue)\b/i] },
    { label: "checking console errors", patterns: [/\b(console|error log|stack trace|browser log)\b/i] },
    { label: "testing different inputs", patterns: [/\b(test(?:ed|ing|s)?|check(?:ed|ing|s)?)\b.{0,45}\b(inputs?|values?|cases?|edge cases?)\b|\b(inputs?|values?|cases?|edge cases?)\b.{0,35}\b(test(?:ed|ing|s)?|check(?:ed|ing|s)?)\b/i] },
    { label: "changing one thing at a time", patterns: [/\bone thing at a time\b|\bone (?:change|variable|factor) at a time\b|\bchange(?:d|s)? one\b.{0,30}\b(at a time|variable|thing)\b|\bisolat(?:e|ed|ing) one\b/i] },
    { label: "regression testing", patterns: [/\bregression test(?:s|ed|ing)?\b|\bretest(?:ed|ing)?\b|\brun the tests again\b/i] }
  ];

  const validationPatterns = [/\b(validat(?:e|ed|es|ing)|verif(?:y|ied|ies|ying)|confirm(?:ed|s|ing)?|retest(?:ed|ing)?|regression test(?:s|ed|ing)?|test(?:ed|ing|s)? (?:the )?(?:fix|change|solution)|(?:fix|change|solution) (?:worked|works|passed|passes|failed|fails)|(?:tests?|checks?) (?:passed|pass|failed|fail)|working as expected)\b/i];
  const validationOutcomePatterns = [/\b(?:tests?|checks?|regression tests?)\b.{0,40}\b(?:passed|pass|failed|fail)\b|\b(?:fix|change|solution|bug) (?:worked|works|passed|passes|failed|fails|was resolved|is resolved)|\b(?:confirmed|verified) (?:that )?(?:the )?(?:fix|change|issue|bug) (?:worked|works|is fixed|was fixed|is resolved|was resolved)|\bno errors (?:remained|appeared|occurred)\b/i];
  const tradeoffPatterns = [/\b(trade.?off|however|instead|whereas|on the other hand|at the cost of|cost(?:s|ing)?|risk(?:s|y)?|performance|simpler|more reliable|maintainab(?:le|ility)|alternative)\b/i];

  function analyze(answer, category) {
    const text = answer.trim().replace(/\s+/g, " ");
    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const behavioral = category === "behavioral";
    const signals = behavioral ? behavioralSignals : technicalSignals;
    const detectedDebuggingSteps = behavioral ? [] : debuggingSteps.filter(function (step) {
      return step.patterns.some(function (pattern) {
        return pattern.test(text);
      });
    });
    const validationMentioned = !behavioral && validationPatterns.some(function (pattern) {
      return pattern.test(text);
    });
    const validationOutcomeMentioned = !behavioral && validationOutcomePatterns.some(function (pattern) {
      return pattern.test(text);
    });
    const tradeoffMentioned = !behavioral && tradeoffPatterns.some(function (pattern) {
      return pattern.test(text);
    });
    const detected = signals.filter(function (signal) {
      return signal.key === "outcome"
        ? validationMentioned || tradeoffMentioned
        : signal.patterns.some(function (pattern) {
          return pattern.test(text);
        });
    });
    const lengthScore = Math.min(wordCount / (behavioral ? 100 : 85), 1);
    const specificityScore = Math.min(detected.length / signals.length, 1);
    const exampleScore = Math.min((text.match(/\b\d+(?:\.\d+)?%?\b/g) || []).length / 2, 1);
    const sentenceCount = (text.match(/[.!?](?:\s|$)/g) || []).length;
    const clarityScore = wordCount > 0 ? Math.min((sentenceCount + 1) / Math.max(wordCount / 22, 1), 1) : 0;
    const detailPoints = Math.round(lengthScore * 30);
    const evidencePoints = Math.round(Math.max(specificityScore * 17, exampleScore * 25));
    const structurePoints = Math.round(specificityScore * 25);
    const outcomePoints = Math.round(Math.max((behavioral ? Number(detected.some(function (item) { return item.key === "result"; })) : Number(detected.length >= 3)) * 12, exampleScore * 20));
    const score = detailPoints + evidencePoints + structurePoints + outcomePoints;
    const strengths = [];
    const gaps = [];

    if (wordCount >= (behavioral ? 45 : 25)) strengths.push("You gave enough detail to begin following your thinking.");
    else gaps.push("Add more detail: aim for a few complete sentences so your thinking is easy to follow.");
    if (exampleScore > 0) strengths.push("You included a measurable detail; concrete evidence helps make an answer memorable.");
    if (behavioral) {
      const foundKeys = detected.map(function (item) { return item.key; });
      const missing = behavioralSignals.filter(function (item) { return foundKeys.indexOf(item.key) < 0; });
      if (missing.length === 0) {
        strengths.push("Your answer includes all four STAR elements: Situation, Task, Action, and Result.");
      } else {
        gaps.push("STAR details to add: " + missing.map(function (item) { return item.label; }).join(", ") + ".");
      }
      if (foundKeys.indexOf("action") >= 0) strengths.push("You described an action you took, which helps show your contribution.");
    } else {
      const foundKeys = detected.map(function (item) { return item.key; });
      if (foundKeys.indexOf("approach") >= 0) {
        if (detectedDebuggingSteps.length > 0) {
          strengths.push("You described concrete debugging steps: " + detectedDebuggingSteps.map(function (step) { return step.label; }).join(", ") + ".");
        } else {
          strengths.push("You outlined a step-by-step problem-solving approach.");
        }
      } else {
        gaps.push("Describe your investigation in order: reproduce the issue, inspect useful logs, and isolate a likely cause.");
      }
      if (validationMentioned) {
        strengths.push(validationOutcomeMentioned
          ? "You described a validation check and stated what it showed."
          : "You described a validation check; state what the check showed to make the outcome clear.");
      } else {
        gaps.push("Explain how you would validate the fix, for example by retesting the failing case and running regression tests.");
      }
      if (tradeoffMentioned) {
        strengths.push("You noted a trade-off or consequence of the approach.");
      } else {
        gaps.push("Where relevant, mention a trade-off, such as the impact on performance, reliability, or implementation effort.");
      }
      if (foundKeys.indexOf("problem") < 0) {
        gaps.push("Clarify the symptom and expected behavior so it is clear what you are investigating.");
      }
      if (validationMentioned && !validationOutcomeMentioned) {
        gaps.push("State the validation outcome: did the failing case pass, and did regression tests reveal any side effects?");
      }
    }
    if (clarityScore >= 0.7 && wordCount >= 30) strengths.push("Your answer is broken into a readable explanation.");
    if (strengths.length === 0) strengths.push("You took the first step by putting your thinking into words.");
    if (gaps.length === 0) gaps.push("Try one more practice round to make your example even more concise and specific.");

    let suggestion;
    if (behavioral) {
      const guidance = {
        situation: "Set the scene briefly: when or where did this happen, and what was going on?",
        task: "Clarify your responsibility: what goal or challenge were you personally accountable for?",
        action: "Describe the specific steps you personally took, using clear first-person verbs.",
        result: "Explain what changed, what you achieved, or what you learned; add a measurable outcome if you can."
      };
      const missing = behavioralSignals.filter(function (signal) {
        return detected.every(function (item) { return item.key !== signal.key; });
      });
      if (missing.length === 0) {
        suggestion = exampleScore > 0
          ? "You covered all four STAR elements. To make the result even more meaningful, explain who benefited or what you learned from the measurable outcome."
          : "You covered all four STAR elements. Strengthen your Result by adding a measurable outcome, such as time saved, people helped, or work completed.";
      } else {
        suggestion = "For your next draft, focus on these missing STAR elements: " + missing.map(function (signal) {
          return signal.label + ": " + guidance[signal.key];
        }).join(" ");
      }
    } else {
      const foundKeys = detected.map(function (item) { return item.key; });
      const nextSteps = [];
      if (foundKeys.indexOf("problem") < 0) nextSteps.push("start by describing the symptom and expected behavior");
      if (foundKeys.indexOf("approach") < 0) nextSteps.push("outline a step-by-step investigation, such as reproducing the bug, checking console errors, testing inputs, and changing one thing at a time");
      if (!validationMentioned) nextSteps.push("say how you would verify the fix and check for regressions");
      else if (!validationOutcomeMentioned) nextSteps.push("state what the validation showed, including whether the regression tests passed");
      if (!tradeoffMentioned) nextSteps.push("mention a relevant trade-off, such as performance, reliability, or time");
      suggestion = nextSteps.length > 0
        ? "To make this answer more complete, " + nextSteps.join("; ") + "."
        : "You covered the problem, investigation, validation outcome, and a trade-off. Make the answer even stronger by briefly explaining why you chose that approach over an alternative.";
    }

    return {
      score: score,
      wordCount: wordCount,
      strengths: strengths.slice(0, 3),
      gaps: gaps.slice(0, 3),
      suggestion: suggestion,
      signals: detected.map(function (item) { return item.label; })
    };
  }

  window.InterviewFeedback = { analyze: analyze };
}());
