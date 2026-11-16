const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authmiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const {
  getAllMachines,
  getAvailableMachines,
  addMachine,
  updateMachine,
  deleteMachine,
} = require("../controllers/machineController");

// USER + ADMIN: Available machines
router.get("/available", authMiddleware, getAvailableMachines);
router.get("/user", authMiddleware, getAllMachines);
// ADMIN ONLY: Machine management
router.get("/", authMiddleware, adminMiddleware, getAllMachines);

router.post("/", authMiddleware, adminMiddleware, addMachine);

router.put("/:id", authMiddleware, adminMiddleware, updateMachine);

router.delete("/:id", authMiddleware, adminMiddleware, deleteMachine);

module.exports = router;