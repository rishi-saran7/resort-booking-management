const supabase = require("../config/supabaseClient");

// ─── POST /api/customers ──────────────────────────────────────────────────────

const createCustomer = async (req, res) => {
  try {
    const { full_name, phone, aadhaar_number, email } = req.body;

    if (!full_name || !phone) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "full_name and phone are required.",
      });
    }

    const insertPayload = {
      full_name,
      phone,
      ...(aadhaar_number !== undefined && { aadhaar_number }),
      ...(email !== undefined && { email }),
    };

    const { data, error } = await supabase
      .from("customers")
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, data: null, error: error.message });
    }

    return res.status(201).json({ success: true, data, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── GET /api/customers/:id ───────────────────────────────────────────────────

const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, data: null, error: "Customer not found." });
    }

    return res.status(200).json({ success: true, data, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── GET /api/customers  (optional ?search=) ─────────────────────────────────

const getAllCustomers = async (req, res) => {
  try {
    const { search } = req.query;

    let query = supabase.from("customers").select("*").order("created_at", { ascending: false });

    if (search) {
      // ilike search across both phone and full_name using OR filter
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ success: false, data: null, error: error.message });
    }

    return res.status(200).json({ success: true, data, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

module.exports = { createCustomer, getCustomerById, getAllCustomers };
