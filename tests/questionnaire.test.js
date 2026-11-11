import assert from "node:assert/strict";
import test from "node:test";
import { rejectProtectedTraitPreferences, validateQuestions } from "../server/questionnaire.js";

const question = {
  id: "question-1",
  type: "choice",
  text: "How do you usually handle a disagreement?",
  category: "Communication",
  preference: "Calm, direct repair",
  weight: 8,
  choices: [
    { text: "Talk openly and listen", score: 100 },
    { text: "Take time before we discuss it", score: 50 }
  ]
};
const threeQuestions = (first) => [first, { ...question, id: "question-2" }, { ...question, id: "question-3" }];

test("editing answer wording preserves the associated deterministic rubric", () => {
  const edited = validateQuestions(threeQuestions({
    ...question,
    choices: [
      { ...question.choices[0], text: "Discuss it and listen carefully" },
      question.choices[1]
    ]
  }))[0];
  assert.equal(edited.choices[0].text, "Discuss it and listen carefully");
  assert.equal(edited.choices[0].score, 100);
});

test("accepts a five-point scale and rejects malformed scales", () => {
  const scale = {
    ...question,
    type: "scale",
    choices: Array.from({ length: 5 }, (_, index) => ({ text: `Level ${index + 1}`, score: index * 25 }))
  };
  assert.equal(validateQuestions(threeQuestions(scale))[0].type, "scale");
  assert.throws(() => validateQuestions(threeQuestions({ ...scale, choices: scale.choices.slice(0, 4) })), /exactly 5/i);
});

test("prevents protected traits from being used as scoring preferences", () => {
  assert.throws(() => rejectProtectedTraitPreferences("I care most about ethnicity"), /protected traits/i);
  assert.throws(() => validateQuestions(threeQuestions({
    ...question,
    preference: "The respondent's race"
  })), /protected traits/i);
});
