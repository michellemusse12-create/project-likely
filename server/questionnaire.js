import crypto from "node:crypto";

const allowedCategories = new Set([
  "Communication",
  "Personality",
  "Interests",
  "Values",
  "Lifestyle",
  "Social habits",
  "Humor",
  "Relationship expectations",
  "Other"
]);
const protectedTraitPattern = /\b(?:race|racial|ethnicity|ethnic|skin\s+(?:tone|color)|national origin|religion|religious beliefs|sexual orientation|gender identity|disability)\b/i;

export function rejectProtectedTraitPreferences(text) {
  if (protectedTraitPattern.test(text)) {
    throw new Error("Avoid scoring race, ethnicity, or other protected traits in a LIKELY.");
  }
}

export function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 3 || questions.length > 15) {
    throw new Error("A questionnaire must contain 3 to 15 questions.");
  }

  return questions.map((question) => {
    if (typeof question.text !== "string" || question.text.trim().length < 8 || question.text.length > 500) {
      throw new Error("Each question must have between 8 and 500 characters.");
    }
    if (!allowedCategories.has(question.category)) throw new Error("Choose a valid question category.");
    if (typeof question.preference !== "string" || question.preference.trim().length < 2 ||
      question.preference.length > 160) {
      throw new Error("Each question needs a short preference description.");
    }
    rejectProtectedTraitPreferences(`${question.text} ${question.preference}`);
    if (!Number.isInteger(question.weight) || question.weight < 1 || question.weight > 10) {
      throw new Error("Question weights must be integers from 1 to 10.");
    }
    const type = question.type === undefined ? "choice" : question.type;
    if (type !== "choice" && type !== "scale") throw new Error("Choose a supported question type.");
    if (!Array.isArray(question.choices) || question.choices.length < (type === "scale" ? 5 : 2) ||
      question.choices.length > (type === "scale" ? 5 : 6)) {
      throw new Error(type === "scale"
        ? "Scale questions need exactly 5 answer choices."
        : "Multiple-choice questions need 2 to 6 answer choices.");
    }

    const choices = question.choices.map((choice) => {
      if (typeof choice.text !== "string" || choice.text.trim().length < 1 || choice.text.length > 200) {
        throw new Error("Answer choices must contain 1 to 200 characters.");
      }
      rejectProtectedTraitPreferences(choice.text);
      if (!Number.isInteger(choice.score) || choice.score < 0 || choice.score > 100) {
        throw new Error("Answer matching scores must be integers from 0 to 100.");
      }
      return { text: choice.text.trim(), score: choice.score };
    });

    return {
      id: typeof question.id === "string" && question.id.length < 80 ? question.id : crypto.randomUUID(),
      type,
      text: question.text.trim(),
      category: question.category,
      preference: question.preference.trim(),
      weight: question.weight,
      choices
    };
  });
}

export async function generateQuestions(preferences) {
  rejectProtectedTraitPreferences(preferences);
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("AI generation is not configured. Add OPENAI_API_KEY to the server environment, or start with an editable questionnaire.");
    error.status = 503;
    throw error;
  }

  const response = await fetch(process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Create 10 to 15 thoughtful situational questions for an adult's self-reflection questionnaire about alignment with the creator's stated romantic preferences. Avoid protected traits and discriminatory inferences. Return JSON with a questions array. Each question must have type 'choice', text, category (Communication, Personality, Interests, Values, Lifestyle, Social habits, Humor, Relationship expectations, or Other), preference (short explanation), weight (integer 1-10), and choices (3-5 objects with text and score integer 0-100). Scores represent alignment with stated preferences, not attractiveness or probability of attraction. Never claim these scores scientifically predict attraction. Make all choices respectful and nonjudgmental."
        },
        { role: "user", content: preferences }
      ]
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`The AI provider returned status ${response.status}. Check its configuration and try again.`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("The AI provider returned no questionnaire.");
  const parsed = JSON.parse(content);
  return validateQuestions(parsed.questions);
}
