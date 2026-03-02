const express = require("express");
const router = express.Router();
const { getAuditLogs } = require("../controllers/auditLogController");
const { authorizeRoles } = require("../middleware/roleMiddleware");

// Admin-only: route is also protected by `protect` applied in index.js
router.get("/", authorizeRoles("admin"), getAuditLogs);

module.exports = router;
