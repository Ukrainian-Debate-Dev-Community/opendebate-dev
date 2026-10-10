const AppError = require("./AppError");

const TYPES = ["integer", "text", "boolean", "choice"];
const KEY = /^[a-z][a-z0-9_]{0,49}$/;

const isInt = (v) => Number.isInteger(v) && v >= -32768 && v <= 32767;

// Validates a question definition (whole, after merging an update) and
// returns the clean attributes to store.
const cleanQuestion = (input) => {
  const q = {
    key: input.key,
    label: typeof input.label === "string" ? input.label.trim() : input.label,
    type: input.type,
    min_value: input.min_value ?? null,
    max_value: input.max_value ?? null,
    choices: input.choices ?? null,
    required: input.required ?? false,
    counts_in_score: input.counts_in_score ?? false,
    position: input.position ?? 0,
  };

  if (typeof q.key !== "string" || !KEY.test(q.key)) {
    throw new AppError(
      "key must start with a lowercase letter and use only a-z, 0-9 and _ (at most 50).",
      400,
    );
  }
  if (typeof q.label !== "string" || !q.label) {
    throw new AppError("label must be a non-empty string.", 400);
  }
  if (!TYPES.includes(q.type)) {
    throw new AppError(`type must be one of: ${TYPES.join(", ")}.`, 400);
  }
  if (
    typeof q.required !== "boolean" ||
    typeof q.counts_in_score !== "boolean"
  ) {
    throw new AppError("required and counts_in_score must be booleans.", 400);
  }
  if (!isInt(q.position)) {
    throw new AppError("position must be an integer.", 400);
  }

  if (q.type === "integer") {
    if (q.min_value !== null && !isInt(q.min_value)) {
      throw new AppError("min_value must be an integer.", 400);
    }
    if (q.max_value !== null && !isInt(q.max_value)) {
      throw new AppError("max_value must be an integer.", 400);
    }
    if (
      q.min_value !== null &&
      q.max_value !== null &&
      q.min_value > q.max_value
    ) {
      throw new AppError("min_value cannot be greater than max_value.", 400);
    }
  } else if (q.min_value !== null || q.max_value !== null) {
    throw new AppError(
      "min_value and max_value apply to integer questions only.",
      400,
    );
  }

  if (q.counts_in_score && q.type !== "integer") {
    throw new AppError("Only integer questions can count in the score.", 400);
  }

  if (q.type === "choice") {
    const choices = q.choices;
    if (
      !Array.isArray(choices) ||
      choices.length === 0 ||
      !choices.every((c) => typeof c === "string" && c.trim()) ||
      new Set(choices).size !== choices.length
    ) {
      throw new AppError(
        "choices must be a list of distinct non-empty strings.",
        400,
      );
    }
  } else if (q.choices !== null) {
    throw new AppError("choices apply to choice questions only.", 400);
  }

  return q;
};

// Checks submitted answers ([{ key, value }]) against the event's
// questions and returns the answer rows to store.
const cleanAnswers = (questions, answers) => {
  if (answers === undefined || answers === null) answers = [];
  if (!Array.isArray(answers)) {
    throw new AppError("answers must be a list of { key, value }.", 400);
  }

  const byKey = new Map(questions.map((q) => [q.key, q]));
  const seen = new Set();
  const rows = [];

  for (const answer of answers) {
    const question = answer && byKey.get(answer.key);
    if (!question) {
      throw new AppError(`Unknown question: ${answer && answer.key}.`, 400);
    }
    if (seen.has(question.key)) {
      throw new AppError(`Question ${question.key} is answered twice.`, 400);
    }
    seen.add(question.key);

    const value = answer.value;
    const row = { question_id: question.id };

    if (question.type === "integer") {
      if (!isInt(value)) {
        throw new AppError(
          `The answer to ${question.key} must be a whole number.`,
          400,
        );
      }
      if (
        (question.min_value !== null && value < question.min_value) ||
        (question.max_value !== null && value > question.max_value)
      ) {
        throw new AppError(
          `The answer to ${question.key} must be from ${question.min_value} to ${question.max_value}.`,
          400,
        );
      }
      row.integer_value = value;
    } else if (question.type === "text") {
      if (typeof value !== "string" || !value.trim()) {
        throw new AppError(
          `The answer to ${question.key} must be non-empty text.`,
          400,
        );
      }
      row.text_value = value;
    } else if (question.type === "boolean") {
      if (typeof value !== "boolean") {
        throw new AppError(
          `The answer to ${question.key} must be true or false.`,
          400,
        );
      }
      row.boolean_value = value;
    } else {
      if (!question.choices.includes(value)) {
        throw new AppError(
          `The answer to ${question.key} must be one of: ${question.choices.join(", ")}.`,
          400,
        );
      }
      row.text_value = value;
    }

    rows.push(row);
  }

  const missing = questions.filter((q) => q.required && !seen.has(q.key));
  if (missing.length > 0) {
    throw new AppError(
      `Required questions not answered: ${missing.map((q) => q.key).join(", ")}.`,
      400,
    );
  }

  return rows;
};

const answerValue = (answer, question) => {
  if (question.type === "integer") return answer.integer_value;
  if (question.type === "boolean") return answer.boolean_value;
  return answer.text_value;
};

// The feedback's score: the average of its answers to counting
// questions when the event has any, otherwise the stored score.
const feedbackScore = (feedback, countingIds) => {
  if (countingIds.size === 0) {
    return feedback.score === null ? null : Number(feedback.score);
  }
  const values = (feedback.Answers || [])
    .filter((a) => countingIds.has(a.question_id) && a.integer_value !== null)
    .map((a) => a.integer_value);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

module.exports = { cleanQuestion, cleanAnswers, answerValue, feedbackScore };
