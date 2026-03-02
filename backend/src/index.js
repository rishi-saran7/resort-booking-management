const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const authRoutes      = require("./routes/authRoutes");
const roomRoutes      = require("./routes/roomRoutes");
const customerRoutes  = require("./routes/customerRoutes");
const bookingRoutes   = require("./routes/bookingRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const paymentRoutes   = require("./routes/paymentRoutes");
const auditLogRoutes  = require("./routes/auditLogRoutes");
const { protect }     = require("./middleware/authMiddleware");

const app = express();
const PORT = process.env.PORT || 5001;

// CORS — allow frontend origin from env, fallback to localhost for local dev
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json());

// Public routes
app.get("/api/health", (req, res) => {
  res.json({ status: "Server running" });
});
app.use("/api/auth", authRoutes);

// Protected routes
app.use("/api/rooms",       protect, roomRoutes);
app.use("/api/customers",   protect, customerRoutes);
app.use("/api/bookings",    protect, bookingRoutes);
app.use("/api/dashboard",   protect, dashboardRoutes);
app.use("/api/payments",    protect, paymentRoutes);
app.use("/api/audit-logs",  protect, auditLogRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
