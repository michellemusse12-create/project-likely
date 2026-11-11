export function scoreSubmission(questions, answers) {
  if (!Array.isArray(questions) || !Array.isArray(answers) || questions.length !== answers.length) {
    throw new Error("Please answer every question.");
  }

  let weightedTotal = 0;
  let totalWeight = 0;
  const categories = new Map();

  for (const [index, question] of questions.entries()) {
    const answerIndex = answers[index];
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= question.choices.length) {
      throw new Error("One or more answers are invalid.");
    }
    const choice = question.choices[answerIndex];
    const weight = question.weight;
    weightedTotal += choice.score * weight;
    totalWeight += weight;

    const category = categories.get(question.category) || { weighted: 0, weight: 0 };
    category.weighted += choice.score * weight;
    category.weight += weight;
    categories.set(question.category, category);
  }

  const categoryScores = [...categories.entries()]
    .map(([category, scores]) => ({
      category,
      score: Math.round(scores.weighted / scores.weight)
    }))
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));

  const score = totalWeight ? Math.round(weightedTotal / totalWeight) : 0;
  return {
    score,
    label: getScoreLabel(score),
    strongest: categoryScores.slice(0, 3),
    differences: categoryScores
      .filter((item) => item.score < 70)
      .sort((a, b) => a.score - b.score || a.category.localeCompare(b.category))
      .slice(0, 3)
  };
}

export function getScoreLabel(score) {
  if (score >= 90) return "Strong alignment";
  if (score >= 75) return "Good alignment";
  if (score >= 50) return "Some alignment";
  return "Lower alignment";
}
