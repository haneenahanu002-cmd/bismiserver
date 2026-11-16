require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

async function createAdmins() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const admins = [
      {
        username: process.env.ADMIN1_USERNAME,
        email: process.env.ADMIN1_EMAIL,
        password: process.env.ADMIN1_PASSWORD,
      },
      {
        username: process.env.ADMIN2_USERNAME,
        email: process.env.ADMIN2_EMAIL,
        password: process.env.ADMIN2_PASSWORD,
      },
    ];

    for (const admin of admins) {
      if (!admin.username || !admin.email || !admin.password) {
        throw new Error("Admin environment variables are missing.");
      }

      const email = admin.email.trim().toLowerCase();
      const existingUser = await User.findOne({
        $or: [
          { username: admin.username },
          { email },
        ],
      });

      if (existingUser) {
        if (
          existingUser.role === "admin" &&
          existingUser.username === admin.username &&
          existingUser.email === email
        ) {
          console.log(`Admin already exists: ${admin.username}`);
          continue;
        }

        throw new Error(
          `Username or email already belongs to another account: ${admin.username}`
        );
      }

      const hashedPassword = await bcrypt.hash(admin.password, 12);

      await User.create({
        username: admin.username,
        email,
        password: hashedPassword,
        role: "admin",
      });

      console.log(`Admin created successfully: ${admin.username}`);
    }
  } catch (error) {
    console.error("Admin setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

createAdmins();