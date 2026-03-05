const mongoose = require("mongoose");
const settings = require("../config/settings");

async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(settings.mongoUri);
  return mongoose.connection;
}

module.exports = connectMongo;
