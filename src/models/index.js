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
  Holding: require("./Holding")(sequelize),
  Session: require("./Session")(sequelize),
  Motion: require("./Motion")(sequelize),
  Room: require("./Room")(sequelize),
  Team: require("./Team")(sequelize),
  Admin: require("./Admin")(sequelize),
  Owner: require("./Owner")(sequelize),
  Waitlist: require("./Waitlist")(sequelize),
  RoomTeam: require("./RoomTeam")(sequelize),
  RoomSpeaker: require("./RoomSpeaker")(sequelize),
};

Object.values(models).forEach((model) => {
  if (model.associate) {
    model.associate(models);
  }
});

module.exports = { ...models, sequelize };
