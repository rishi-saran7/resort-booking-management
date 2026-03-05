const express = require("express");
const router = express.Router();
const {
  createBooking,
  getAllBookings,
  getBookingById,
  getPricingPreview,
  updateBookingStatus,
  checkoutBooking,
  cancelBooking,
} = require("../controllers/bookingController");

// All routes already protected by the middleware applied in index.js

// List & create
router.get("/", getAllBookings);          // ?status= ?from= ?to=
router.post("/", createBooking);

// Pricing preview (stateless — no booking created)
router.post("/pricing-preview", getPricingPreview);

// Lifecycle — must be before /:id to avoid route shadowing
router.patch("/:id/status",   updateBookingStatus);
router.patch("/:id/checkout", checkoutBooking);
router.patch("/:id/cancel",   cancelBooking);

// Single booking detail
router.get("/:id", getBookingById);

module.exports = router;
