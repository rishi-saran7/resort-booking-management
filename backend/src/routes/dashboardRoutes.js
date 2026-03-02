const express = require("express");
const router = express.Router();
const { getDashboardStats } = require("../controllers/dashboardController");

// All routes already protected by the middleware applied in index.js

router.get("/stats", getDashboardStats);

module.exports = router;
