const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/wa-web-bulk";

async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(MONGO_URI);
  return mongoose.connection;
}

module.exports = connectMongo;
