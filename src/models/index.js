const { Sequelize } = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize({
  dialect: "mssql",
  host: process.env.DB_SERVER,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  dialectOptions: {
    options: { encrypt: false, trustServerCertificate: true },
  },
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
