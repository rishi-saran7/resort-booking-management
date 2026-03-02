/**
 * Run with: node test-supabase.js
 * Tests Supabase connectivity independently from the Express server.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("SUPABASE_URL     :", SUPABASE_URL);
console.log("SERVICE_KEY set  :", !!SUPABASE_SERVICE_ROLE_KEY);
console.log("KEY length       :", SUPABASE_SERVICE_ROLE_KEY?.length);

async function run() {
  // ── Step 1: raw fetch to Supabase health ─────────────────────────────────
  console.log("\n[1] Testing raw HTTPS fetch to Supabase...");
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`);
    const body = await res.text();
    console.log("    Status:", res.status, "| Body:", body.slice(0, 80));
  } catch (err) {
    console.error("    FAILED:", err.message);
    console.error("    CAUSE :", err.cause?.message ?? err.cause);
    process.exit(1);
  }

  // ── Step 2: supabase-js admin createUser ─────────────────────────────────
  console.log("\n[2] Testing supabase.auth.admin.createUser...");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const testEmail = `test_${Date.now()}@example.com`;
  const { data, error } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: "TestPass123!",
    email_confirm: true,
  });

  if (error) {
    console.error("    Error:", error.message, "| Code:", error.status);
  } else {
    console.log("    Success! User id:", data.user.id);
    // Clean up
    await supabase.auth.admin.deleteUser(data.user.id);
    console.log("    Cleanup: user deleted.");
  }
}

run().catch((err) => {
  console.error("Unhandled:", err.message, err.cause?.message);
  process.exit(1);
});
