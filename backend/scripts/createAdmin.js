const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const readline = require("readline");
const connectMongo = require("../db/connectMongo");
const { User } = require("../models/User");
const { hashPassword } = require("../utils/auth");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  try {
    await connectMongo();
    console.log("Connected to MongoDB.");
    console.log("Creating Primary Administrator account...");

    const email = await question("Enter Admin Email: ");
    const password = await question("Enter Admin Password: ");

    if (!email || !password) {
      console.error("Email and password are required.");
      process.exit(1);
    }

    const mobileNumber = email.toLowerCase();

    const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { mobileNumber }] });
    if (existingUser) {
      console.error("User with this email or mobile number already exists.");
      process.exit(1);
    }

    const admin = new User({
      name: "Administrator",
      email: email ? email.toLowerCase() : undefined,
      mobileNumber,
      passwordHash: hashPassword(password),
      role: "admin",
    });

    await admin.save();
    console.log(`Admin user created successfully: ${admin.email}`);
  } catch (error) {
    console.error("Error creating admin user:", error);
  } finally {
    mongoose.disconnect();
    rl.close();
  }
}

main();
