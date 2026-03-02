const express = require("express");
const router = express.Router();
const {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  checkoutBooking,
  cancelBooking,
} = require("../controllers/bookingController");

// All routes already protected by the middleware applied in index.js

// List & create
router.get("/", getAllBookings);          // ?status= ?from= ?to=
router.post("/", createBooking);

// Lifecycle — must be before /:id to avoid route shadowing
router.patch("/:id/status",   updateBookingStatus);
router.patch("/:id/checkout", checkoutBooking);
router.patch("/:id/cancel",   cancelBooking);

// Single booking detail
router.get("/:id", getBookingById);

module.exports = router;
