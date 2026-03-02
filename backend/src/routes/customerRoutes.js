const express = require("express");
const router = express.Router();
const { createCustomer, getCustomerById, getAllCustomers } = require("../controllers/customerController");

// All routes already protected by the middleware applied in index.js

router.get("/", getAllCustomers);
router.get("/:id", getCustomerById);
router.post("/", createCustomer);

module.exports = router;
