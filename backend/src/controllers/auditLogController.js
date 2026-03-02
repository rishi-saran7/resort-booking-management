const supabase = require("../config/supabaseClient");

// ─── GET /api/audit-logs ──────────────────────────────────────────────────────
// Admin only. Supports: ?staff_id= ?entity_type= ?from= ?to=

const getAuditLogs = async (req, res) => {
  try {
    const { staff_id, entity_type, from, to } = req.query;

    let query = supabase
      .from("audit_logs")
      .select(`
        id, action, entity_type, entity_id, metadata, created_at,
        staff_profiles(id, full_name, role)
      `)
      .order("created_at", { ascending: false });

    // Filter by staff
    if (staff_id) {
      query = query.eq("staff_id", staff_id);
    }

    // Filter by entity type (room | booking | payment | customer)
    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }

    // Filter by date range
    if (from) {
      query = query.gte("created_at", new Date(from).toISOString());
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setUTCHours(23, 59, 59, 999);
      query = query.lte("created_at", toDate.toISOString());
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

module.exports = { getAuditLogs };
