const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.");
}

// Wrap native fetch with a 10-second timeout so the server never hangs
const fetchWithTimeout = (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
};

// Service-role client — has admin privileges (bypass RLS)
// Use ONLY on the backend, never expose to the client
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});

module.exports = supabase;
