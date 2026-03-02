const express = require("express");
const router = express.Router();

const {
  signupStaff,
  loginStaff,
  getCurrentStaff,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// POST /api/auth/signup
router.post("/signup", signupStaff);

// POST /api/auth/login
router.post("/login", loginStaff);

// GET /api/auth/me  (protected)
router.get("/me", protect, getCurrentStaff);

module.exports = router;
