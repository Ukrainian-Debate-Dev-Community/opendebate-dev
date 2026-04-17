// custom error class for better logging
class AppError extends Error {
  constructor(message, statusCode) {
    super(message); // set the message as in Error class

    this.statusCode = statusCode;

    // 4xx codes are 'fail', 5xx are 'error'
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";

    // flaged as an operational error (a known/expected error)
    this.isOperational = true;

    // capture the stack trace to know error origin
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
