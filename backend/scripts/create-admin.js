const mongoose = require("mongoose");
const readline = require("readline");
const path = require("path");
const fs = require("fs");

// Load .env
function loadDotEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

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

    const name = await question("Enter Admin Name: ");
    const email = await question("Enter Admin Email: ");
    const mobileNumber = await question("Enter Admin Mobile Number: ");
    const password = await question("Enter Password: ");
    const confirmPassword = await question("Confirm Password: ");

    if (password !== confirmPassword) {
      console.error("Passwords do not match!");
      process.exit(1);
    }

    if (password.length < 6) {
      console.error("Password must be at least 6 characters.");
      process.exit(1);
    }

    const existingUser = await User.findOne({ 
      $or: [{ email: email.toLowerCase() }, { mobileNumber }] 
    });

    if (existingUser) {
      console.error("User with this email or mobile number already exists.");
      process.exit(1);
    }

    await User.create({
      name,
      email: email.toLowerCase(),
      mobileNumber,
      passwordHash: hashPassword(password),
      role: "admin",
    });

    console.log(`Admin user ${email} created successfully!`);
  } catch (error) {
    console.error("Error creating admin:", error);
  } finally {
    await mongoose.connection.close();
    rl.close();
  }
}

main();
