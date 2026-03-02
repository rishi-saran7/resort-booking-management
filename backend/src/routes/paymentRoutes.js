const express = require("express");
const router = express.Router();
const { updatePayment } = require("../controllers/paymentController");

// All routes already protected by the middleware applied in index.js

router.patch("/:id", updatePayment);

module.exports = router;
