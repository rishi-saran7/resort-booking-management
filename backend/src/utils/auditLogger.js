const supabase = require("../config/supabaseClient");

/**
 * Fire-and-forget audit logger.
 * Never rejects — errors are swallowed so a logging failure
 * never breaks the request that triggered it.
 *
 * @param {object} params
 * @param {string} params.staff_id    - UUID of the staff member who performed the action
 * @param {string} params.action      - e.g. "ROOM_CREATED", "BOOKING_CANCELLED"
 * @param {string} params.entity_type - "room" | "booking" | "payment" | "customer"
 * @param {string} [params.entity_id] - UUID of the affected record
 * @param {object} [params.metadata]  - arbitrary JSON context (room_number, previous_status, etc.)
 */
const logAudit = async ({ staff_id, action, entity_type, entity_id = null, metadata = null }) => {
  try {
    const { error } = await supabase.from("audit_logs").insert([{
      staff_id,
      action,
      entity_type,
      entity_id,
      metadata,
    }]);

    if (error) {
      // Never throw — just surface to server console for observability
      console.error(`[auditLogger] Failed to write audit log (${action}):`, error.message);
    }
  } catch (err) {
    console.error(`[auditLogger] Unexpected error (${action}):`, err.message);
  }
};

module.exports = { logAudit };
