const errorHandler = (err, req, res, next) => {
  // default status code and status if they aren't provided
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // log the error in development
  console.error(`[ERROR] ${err.name}: ${err.message}`);
  if (process.env.NODE_ENV === "development") {
    console.error(err.stack);
  }

  // specific handlers for Sequelize Database Errors

  if (err.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({
      status: "fail",
      message: "A record with that information already exists.",
      details: err.errors.map((e) => e.message),
    });
  }

  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      status: "fail",
      message: "Invalid input data.",
      details: err.errors.map((e) => e.message),
    });
  }

  if (err.name === "SequelizeForeignKeyConstraintError") {
    return res.status(400).json({
      status: "fail",
      message: "Referenced database record does not exist.",
    });
  }

  // handler for custom error for known issues
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  // catch-all for unknown bugs
  return res.status(500).json({
    status: "error",
    message: "An unexpected internal server error occurred.",
  });
};

module.exports = errorHandler;
