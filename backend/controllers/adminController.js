const { User } = require("../models/User");
const { hashPassword } = require("../utils/auth");

async function getAllUsers(req, res) {
  try {
    const users = await User.find({}, "-passwordHash").sort({ createdAt: -1 });
    return res.json(users);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch users." });
  }
}

async function createUser(req, res) {
  try {
    const { name, email, mobileNumber, password, role } = req.body;

    if (!name || !mobileNumber || !password) {
      return res.status(400).json({ message: "Name, mobile number and password are required." });
    }

    const existing = await User.findOne({ mobileNumber });
    if (existing) {
      return res.status(409).json({ message: "Mobile number already exists." });
    }

    if (email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        return res.status(409).json({ message: "Email already exists." });
      }
    }

    const user = await User.create({
      name,
      email: email?.toLowerCase(),
      mobileNumber,
      passwordHash: hashPassword(password),
      role: role || "member",
    });

    const userObj = user.toObject();
    delete userObj.passwordHash;

    return res.status(201).json(userObj);
  } catch (error) {
    return res.status(500).json({ message: "Failed to create user." });
  }
}

async function resetPassword(req, res) {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ message: "User ID and new password are required." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.passwordHash = hashPassword(newPassword);
    await user.save();

    return res.json({ message: "Password reset successful." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to reset password." });
  }
}

async function toggleUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.isActive = !user.isActive;
    await user.save();

    return res.json({ message: `User ${user.isActive ? "activated" : "deactivated"} successfully.`, isActive: user.isActive });
  } catch (error) {
    return res.status(500).json({ message: "Failed to toggle user status." });
  }
}

module.exports = {
  getAllUsers,
  createUser,
  resetPassword,
  toggleUserStatus,
};
