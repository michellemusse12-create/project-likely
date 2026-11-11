import test from "node:test";
import assert from "node:assert/strict";
import { getScoreLabel, scoreSubmission } from "../server/scoring.js";

const questions = [
  {
    category: "Communication",
    weight: 10,
    choices: [{ score: 100 }, { score: 0 }]
  },
  {
    category: "Values",
    weight: 5,
    choices: [{ score: 60 }, { score: 20 }]
  }
];

test("scores a deterministic weighted average and category breakdown", () => {
  const result = scoreSubmission(questions, [0, 1]);
  assert.equal(result.score, 73);
  assert.equal(result.label, "Some alignment");
  assert.deepEqual(result.strongest, [
    { category: "Communication", score: 100 },
    { category: "Values", score: 20 }
  ]);
});

test("labels score bands at their boundaries", () => {
  assert.equal(getScoreLabel(100), "Strong alignment");
  assert.equal(getScoreLabel(90), "Strong alignment");
  assert.equal(getScoreLabel(89), "Good alignment");
  assert.equal(getScoreLabel(75), "Good alignment");
  assert.equal(getScoreLabel(74), "Some alignment");
  assert.equal(getScoreLabel(50), "Some alignment");
  assert.equal(getScoreLabel(49), "Lower alignment");
  assert.equal(getScoreLabel(0), "Lower alignment");
});

test("rejects incomplete or out-of-range answers", () => {
  assert.throws(() => scoreSubmission(questions, [0]), /answer every question/i);
  assert.throws(() => scoreSubmission(questions, [0, 2]), /answers are invalid/i);
});

test("does not label fully aligned categories as areas of difference", () => {
  const allAlignedQuestions = questions.map((question) => ({
    ...question,
    choices: question.choices.map((choice) => ({ ...choice, score: 100 }))
  }));
  const result = scoreSubmission(allAlignedQuestions, [0, 0]);
  assert.equal(result.score, 100);
  assert.deepEqual(result.differences, []);
});
