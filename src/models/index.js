const { Sequelize } = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize({
  dialect: "postgres",
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  logging: false,
  define: { timestamps: false, freezeTableName: true },
});

const models = {
  User: require("./User")(sequelize),
  Admin: require("./Admin")(sequelize),
  Organisation: require("./Organisation")(sequelize),
  Owner: require("./Owner")(sequelize),
  Format: require("./Format")(sequelize),
  Event: require("./Event")(sequelize),
  Organizer: require("./Organizer")(sequelize),
  EventParticipant: require("./EventParticipant")(sequelize),
  Round: require("./Round")(sequelize),
  Motion: require("./Motion")(sequelize),
  Team: require("./Team")(sequelize),
  TeamMember: require("./TeamMember")(sequelize),
  Room: require("./Room")(sequelize),
  RoomTeam: require("./RoomTeam")(sequelize),
  RoomAdjudicator: require("./RoomAdjudicator")(sequelize),
  RoomSpeaker: require("./RoomSpeaker")(sequelize),
  Score: require("./Score")(sequelize),
};

Object.values(models).forEach((model) => {
  if (model.associate) {
    model.associate(models);
  }
});

module.exports = { ...models, sequelize };
