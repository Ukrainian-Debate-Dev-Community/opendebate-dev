// Shared "which rooms count" step used by the standings and stats
// controllers: rounds of the event(s) filtered by hidden-round
// visibility, then their rooms, optionally restricted to rooms whose
// ballot is final. Everything else stays in the controllers.
const { Round, Room } = require("../models");

// Includes "confirmed" so ballot confirmation composes without changes.
const FINAL_ROOM_STATUSES = ["completed", "confirmed"];

const getEventRooms = async (
  eventIds,
  { includeHidden = false, finalOnly = false } = {},
) => {
  const roundFilter = includeHidden
    ? { event_id: eventIds }
    : { event_id: eventIds, is_hidden: false };

  const rounds = await Round.findAll({
    where: roundFilter,
    attributes: ["id"],
  });

  const roomFilter = { round_id: rounds.map((r) => r.id) };
  if (finalOnly) roomFilter.status = FINAL_ROOM_STATUSES;

  return Room.findAll({ where: roomFilter, attributes: ["id"] });
};

module.exports = { FINAL_ROOM_STATUSES, getEventRooms };
