
require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const bookingRoutes = require("./routes/bookingRouters");
const app = express();
const feedbackRoutes =require( "./routes/feedbackRoutes.js");
const billRoutes = require("./routes/billRoutes");
const operatorPaymentRoutes = require("./routes/operatorPaymentRoutes");
const operatorWageRoutes = require("./routes/operatorWageRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const reportRoutes = require("./routes/reportRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const machineRoutes = require("./routes/machineRoutes");
const messageRoutes = require("./routes/messageRoutes");
const aiRoutes = require("./routes/aiRoutes");
const { initMessageSocket } = require("./socket/messageSocket");
app.use(cors());
app.use(
  express.json({
    limit: "15mb",
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

app.use(express.urlencoded({
  extended: true,
  limit: "15mb",
}));
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Bismi Earth Movers Backend is running!",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/operator-payments", operatorPaymentRoutes);
app.use("/api/operator-wages", operatorWageRoutes);
app.use("/api/payments", paymentRoutes);

app.use("/api/reports", reportRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/machines", machineRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/ai", aiRoutes);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing in .env");
    }
    console.log(
  "MongoDB database:",
  new URL(process.env.MONGO_URI).pathname
);
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Atlas connected successfully!");

    const server = http.createServer(app);
    const { Server } = require("socket.io");
    const io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    initMessageSocket(io);

    server.listen(PORT, () => {
      console.log(`Server running at https://bismiserver.onrender.com`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
