const AppError = require("./AppError");

const KEYWORD_MAX_LENGTH = 32;

// a keyword is a short tag; reject long ones before they reach the DB
const checkMotionKeyword = (keyword) => {
  if (keyword && String(keyword).length > KEYWORD_MAX_LENGTH) {
    throw new AppError(
      `Motion keyword must be at most ${KEYWORD_MAX_LENGTH} characters.`,
      400,
    );
  }
};

module.exports = { KEYWORD_MAX_LENGTH, checkMotionKeyword };
