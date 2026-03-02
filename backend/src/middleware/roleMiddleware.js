/**
 * Role-based access control middleware factory.
 *
 * Usage:
 *   router.post("/", authorizeRoles("admin"), createRoom);
 *   router.patch("/:id/cancel", authorizeRoles("admin", "staff"), cancelBooking);
 *
 * Must be used AFTER the `protect` middleware, which populates req.user.role
 * from the database (never from the JWT claim).
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        data: null,
        error: "Not authenticated.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        data: null,
        error: `Access denied. Required role(s): ${allowedRoles.join(", ")}. Your role: ${req.user.role}.`,
      });
    }

    next();
  };
};

module.exports = { authorizeRoles };
