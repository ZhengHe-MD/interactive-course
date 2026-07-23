const controls = {
  prior: document.querySelector("#prior"),
  sensitivity: document.querySelector("#sensitivity"),
  falsePositive: document.querySelector("#false-positive"),
};

function updateMachine() {
  const prior = Number(controls.prior.value) / 100;
  const sensitivity = Number(controls.sensitivity.value) / 100;
  const falsePositive = Number(controls.falsePositive.value) / 100;
  const truePositives = prior * sensitivity * 1000;
  const falsePositives = (1 - prior) * falsePositive * 1000;
  const allPositives = truePositives + falsePositives;
  const posterior = allPositives ? (truePositives / allPositives) * 100 : 0;

  document.querySelector("#prior-output").value = `${controls.prior.value}%`;
  document.querySelector("#sensitivity-output").value = `${controls.sensitivity.value}%`;
  document.querySelector("#false-positive-output").value = `${controls.falsePositive.value}%`;
  document.querySelector("#posterior").textContent = posterior.toFixed(1);
  document.querySelector("#truth-bar").style.width = `${Math.max(1.5, posterior)}%`;
  document.querySelector("#natural-frequency").textContent = `Out of ${Math.round(allPositives)} positive tests, about ${Math.round(truePositives)} belong to people who are actually sick.`;
}

Object.values(controls).forEach((control) => control.addEventListener("input", updateMachine));
updateMachine();

const feedback = document.querySelector("#feedback");
document.querySelectorAll("[data-answer]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-answer]").forEach((choice) => choice.classList.remove("correct", "incorrect"));
    const correct = button.dataset.answer === "up";
    button.classList.add(correct ? "correct" : "incorrect");
    document.querySelector('[data-answer="up"]').classList.add("correct");
    feedback.hidden = false;
    feedback.textContent = correct
      ? "Exactly. A larger prior creates more true cases, so a greater share of positive results are real—even though the test itself did not change."
      : "It goes up. Making the disease more common increases the pool of real cases, so the same test's positive results become more trustworthy.";
  });
});
