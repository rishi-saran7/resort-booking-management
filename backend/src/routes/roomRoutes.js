const express = require("express");
const router = express.Router();
const { getAllRooms, createRoom, updateRoom, deleteRoom, checkAvailability } = require("../controllers/roomController");
const { authorizeRoles } = require("../middleware/roleMiddleware");

// All routes already protected by the middleware applied in index.js

// NOTE: /availability must be declared before /:id to avoid route shadowing
router.get("/availability", checkAvailability);
router.get("/", getAllRooms);
router.post("/",     authorizeRoles("admin"), createRoom);
router.put("/:id",   authorizeRoles("admin"), updateRoom);
router.delete("/:id", authorizeRoles("admin"), deleteRoom);

module.exports = router;
