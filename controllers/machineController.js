const Machine = require("../models/Machine");

// GET ALL MACHINES
const getAllMachines = async (req, res) => {
  try {
    const machines = await Machine.find().sort({ createdAt: -1 });

    const formattedMachines = machines.map((machine) => ({
      id: `MCH-${machine._id.toString().slice(-6).toUpperCase()}`,
      _id: machine._id,
      name: machine.name,
      model: machine.model,
      registration: machine.registration,
      status: machine.status,
      image: machine.image || "",
      createdAt: machine.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: machines.length,
      machines: formattedMachines,
    });
  } catch (error) {
    console.error("Get Machines Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch machines.",
    });
  }
};
// GET AVAILABLE MACHINES FOR BOOKING
const getAvailableMachines = async (req, res) => {
  try {
    const machines = await Machine.find({
      status: "Available",
    }).sort({ createdAt: -1 });

    const formattedMachines = machines.map((machine) => ({
      id: `MCH-${machine._id.toString().slice(-6).toUpperCase()}`,
      _id: machine._id,
      name: machine.name,
      model: machine.model,
      registration: machine.registration,
      status: machine.status,
      image: machine.image || "",
    }));

    return res.status(200).json({
      success: true,
      count: formattedMachines.length,
      machines: formattedMachines,
    });
  } catch (error) {
    console.error("Get Available Machines Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch available machines.",
    });
  }
};

// ADD MACHINE
const addMachine = async (req, res) => {
  try {
    const { name, model, registration, status, image } = req.body;

    if (!name || !model || !registration) {
      return res.status(400).json({
        success: false,
        message: "Name, model and registration are required.",
      });
    }

    const normalizedRegistration = registration.trim().toUpperCase();

    const existingMachine = await Machine.findOne({
      registration: normalizedRegistration,
    });

    if (existingMachine) {
      return res.status(409).json({
        success: false,
        message: "This registration number already exists.",
      });
    }

    const machine = await Machine.create({
      name: name.trim(),
      model: model.trim(),
      registration: normalizedRegistration,
      status: status || "Available",
      image: image || "",
    });

    return res.status(201).json({
      success: true,
      message: "Machine added successfully.",
      machine: {
        id: `MCH-${machine._id.toString().slice(-6).toUpperCase()}`,
        _id: machine._id,
        name: machine.name,
        model: machine.model,
        registration: machine.registration,
        status: machine.status,
        image: machine.image,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This registration number already exists.",
      });
    }

    console.error("Add Machine Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to add machine.",
    });
  }
};

// UPDATE MACHINE
const updateMachine = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, model, registration, status, image } = req.body;

    if (!name || !model || !registration) {
      return res.status(400).json({
        success: false,
        message: "Name, model and registration are required.",
      });
    }

    const normalizedRegistration = registration.trim().toUpperCase();

    const existingRegistration = await Machine.findOne({
      registration: normalizedRegistration,
      _id: { $ne: id },
    });

    if (existingRegistration) {
      return res.status(409).json({
        success: false,
        message: "This registration number already exists.",
      });
    }

    const machine = await Machine.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        model: model.trim(),
        registration: normalizedRegistration,
        status,
        image: image || "",
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "Machine not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Machine updated successfully.",
      machine: {
        id: `MCH-${machine._id.toString().slice(-6).toUpperCase()}`,
        _id: machine._id,
        name: machine.name,
        model: machine.model,
        registration: machine.registration,
        status: machine.status,
        image: machine.image,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This registration number already exists.",
      });
    }

    console.error("Update Machine Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update machine.",
    });
  }
};

// DELETE MACHINE
const deleteMachine = async (req, res) => {
  try {
    const machine = await Machine.findByIdAndDelete(req.params.id);

    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "Machine not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Machine deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Machine Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete machine.",
    });
  }
};

module.exports = {
  getAllMachines,
    getAvailableMachines,
  addMachine,
  updateMachine,
  deleteMachine,
};