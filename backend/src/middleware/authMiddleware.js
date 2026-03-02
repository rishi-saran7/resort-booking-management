const jwt = require("jsonwebtoken");
const supabase = require("../config/supabaseClient");

/**
 * Middleware to protect routes.
 * Expects: Authorization: Bearer <token>
 *
 * Always resolves role from the DB — never trusts the JWT role claim.
 * Attaches to req.user: { id, email, full_name, role }
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        data: null,
        error: "No token provided. Authorization denied.",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // decoded = { id, email, role, iat, exp }

    // ── Fetch authoritative role + full_name from DB (never trust JWT role) ─
    const { data: profile, error: profileError } = await supabase
      .from("staff_profiles")
      .select("id, full_name, role")
      .eq("id", decoded.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({
        success: false,
        data: null,
        error: "Staff account not found or has been removed.",
      });
    }

    req.user = {
      id:        profile.id,
      email:     decoded.email,   // preserved for /me endpoint
      full_name: profile.full_name,
      role:      profile.role,    // authoritative — from DB
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      data: null,
      error: "Invalid or expired token.",
    });
  }
};

module.exports = { protect };

