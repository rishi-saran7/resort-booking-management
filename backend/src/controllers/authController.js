const jwt = require("jsonwebtoken");
const supabase = require("../config/supabaseClient");

// ─── Helper ──────────────────────────────────────────────────────────────────

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

// ─── POST /api/auth/signup ────────────────────────────────────────────────────

const signupStaff = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const role = "staff"; // always staff — never accept role from client

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "name, email, and password are required.",
      });
    }

    // 1. Create user in Supabase Auth (admin API, bypasses email confirmation)
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      return res.status(400).json({
        success: false,
        data: null,
        error: authError.message,
      });
    }

    const userId = authData.user.id;

    // 2. Insert into staff_profiles table
    // Note: email lives in auth.users — do not duplicate it here
    // The table uses full_name, not name
    const { data: profile, error: profileError } = await supabase
      .from("staff_profiles")
      .insert([{ id: userId, full_name: name, role: "staff" }])
      .select()
      .single();

    if (profileError) {
      // Rollback: delete the auth user if profile insert fails
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({
        success: false,
        data: null,
        error: profileError.message,
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        message: "Staff account created successfully. Please log in.",
        profile: { ...profile, email },
      },
      error: null,
    });
  } catch (err) {
    const message = err.cause?.message || err.message;
    console.error("[signupStaff] Unexpected error:", err.cause ?? err);
    return res.status(500).json({
      success: false,
      data: null,
      error: message,
    });
  }
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

const loginStaff = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "email and password are required.",
      });
    }

    // 1. Verify credentials via Supabase Auth REST endpoint directly
    //    (avoids a known hang with the service-role JS client + signInWithPassword)
    const authRes = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!authRes.ok) {
      return res.status(401).json({
        success: false,
        data: null,
        error: "Invalid email or password.",
      });
    }

    const authJson = await authRes.json();
    const userId = authJson.user.id;

    // 2. Fetch staff profile from staff_profiles table
    const { data: profile, error: profileError } = await supabase
      .from("staff_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        data: null,
        error: "Staff profile not found.",
      });
    }

    // 3. Issue our own JWT
    const token = signToken({ id: userId, email, role: profile.role });

    return res.status(200).json({
      success: true,
      data: {
        access_token: token,
        // Merge email from auth.users into the profile response
        profile: { ...profile, email },
      },
      error: null,
    });
  } catch (err) {
    const message = err.cause?.message || err.message;
    console.error("[loginStaff] Unexpected error:", err.cause ?? err);
    return res.status(500).json({
      success: false,
      data: null,
      error: message,
    });
  }
};

// ─── GET /api/auth/me (protected) ────────────────────────────────────────────

const getCurrentStaff = async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from("staff_profiles")
      .select("*")
      .eq("id", req.user.id)
      .single();

    if (error || !profile) {
      return res.status(404).json({
        success: false,
        data: null,
        error: "Staff profile not found.",
      });
    }

    // Merge email from auth.users into the profile response
    return res.status(200).json({
      success: true,
      data: { profile: { ...profile, email: req.user.email } },
      error: null,
    });
  } catch (err) {
    const message = err.cause?.message || err.message;
    console.error("[getCurrentStaff] Unexpected error:", err.cause ?? err);
    return res.status(500).json({
      success: false,
      data: null,
      error: message,
    });
  }
};

module.exports = { signupStaff, loginStaff, getCurrentStaff };
