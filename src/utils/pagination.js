// Opt-in list pagination: activates only when ?limit is a positive integer,
// so existing consumers that expect complete lists keep receiving them.
// The response shape never changes — clients detect the last page by
// receiving fewer rows than the requested limit.
const MAX_LIMIT = 100;

const paginate = (query) => {
  const limit = parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) return {};

  const page = parseInt(query.page, 10);
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safeLimit = Math.min(limit, MAX_LIMIT);
  return { limit: safeLimit, offset: (safePage - 1) * safeLimit };
};

module.exports = { paginate, MAX_LIMIT };
