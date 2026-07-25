// The base-rate machine. Given a prior, a sensitivity, and a false-alarm rate,
// Bayes' theorem gives the chance a positive test is real:
//
//   P(sick | positive) = (prior * sensitivity)
//                        / (prior * sensitivity + (1 - prior) * falseAlarm)
//
// Everything here is vanilla DOM wiring — the kind of small, legible script the
// studio's design guide asks for.
(function () {
  "use strict";

  var COHORT = 1000;
  var inputs = {
    prior: document.querySelector('[data-in="prior"]'),
    sens: document.querySelector('[data-in="sens"]'),
    fpr: document.querySelector('[data-in="fpr"]'),
  };
  var out = {};
  document.querySelectorAll("[data-out]").forEach(function (el) {
    out[el.getAttribute("data-out")] = el;
  });

  function set(name, value) {
    if (out[name]) out[name].textContent = value;
  }

  function update() {
    var prior = parseFloat(inputs.prior.value) / 100;
    var sens = parseFloat(inputs.sens.value) / 100;
    var fpr = parseFloat(inputs.fpr.value) / 100;

    var truePos = prior * sens;
    var falsePos = (1 - prior) * fpr;
    var posterior = truePos + falsePos === 0 ? 0 : truePos / (truePos + falsePos);

    // Slider read-outs.
    set("prior", round(prior * 100, 1) + "%");
    set("sens", Math.round(sens * 100) + "%");
    set("fpr", Math.round(fpr * 100) + "%");

    // Headline posterior + the truth/false-alarm bar.
    set("posterior", round(posterior * 100, 1));
    if (out.barSick) out.barSick.style.width = round(posterior * 100, 1) + "%";

    // The concrete story out of 1,000 people.
    var nSick = prior * COHORT;
    var nTruePos = nSick * sens;
    var nFalsePos = (COHORT - nSick) * fpr;
    var nPos = nTruePos + nFalsePos;
    set("nSick", Math.round(nSick));
    set("nTruePos", Math.round(nTruePos));
    set("nTruePos2", Math.round(nTruePos));
    set("nFalsePos", Math.round(nFalsePos));
    set("nPos", Math.round(nPos));
  }

  function round(n, places) {
    var f = Math.pow(10, places);
    return Math.round(n * f) / f;
  }

  Object.keys(inputs).forEach(function (key) {
    inputs[key].addEventListener("input", update);
  });
  update();

  // Quick check.
  var quiz = document.querySelector("[data-quiz]");
  var explain = document.querySelector("[data-quiz-explain]");
  if (quiz) {
    quiz.addEventListener("click", function (e) {
      var btn = e.target.closest(".quiz-option");
      if (!btn || quiz.dataset.answered) return;
      quiz.dataset.answered = "1";
      var options = quiz.querySelectorAll(".quiz-option");
      options.forEach(function (o) {
        o.disabled = true;
        if (o.getAttribute("data-correct") === "true") o.classList.add("correct");
      });
      if (btn.getAttribute("data-correct") !== "true") btn.classList.add("wrong");
      if (explain) explain.hidden = false;
    });
  }
})();
