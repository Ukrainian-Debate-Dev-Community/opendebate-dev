const AppError = require("./AppError");

const isHardDelete = (req) => req.query.hard === "true";

// Archive by default; permanent deletion only on explicit ?hard=true by an Admin.
const destroyOrArchive = async (record, req, options = {}) => {
  if (isHardDelete(req)) {
    if (!req.user.isAdmin) {
      throw new AppError("Only an Admin can permanently delete records.", 403);
    }
    try {
      await record.destroy({ ...options, force: true });
    } catch (error) {
      if (error.name === "SequelizeForeignKeyConstraintError") {
        throw new AppError(
          "Cannot permanently delete: dependent records exist. Archive instead, or permanently delete the dependents first.",
          409,
        );
      }
      throw error;
    }
    return "deleted";
  }

  if (record.archived_at) {
    throw new AppError(
      "Record is already archived. Use ?hard=true to permanently delete it.",
      409,
    );
  }
  await record.destroy(options);
  return "archived";
};

const restoreRecord = async (model, where) => {
  const record = await model.findOne({ where, paranoid: false });
  if (!record) throw new AppError(`${model.name} not found.`, 404);
  if (!record.archived_at) {
    throw new AppError(`${model.name} is not archived.`, 409);
  }
  await record.restore();
  return record;
};

module.exports = { isHardDelete, destroyOrArchive, restoreRecord };
