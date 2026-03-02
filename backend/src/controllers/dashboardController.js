const supabase = require("../config/supabaseClient");

// ─── GET /api/dashboard/stats ─────────────────────────────────────────────────

const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();

    // Today's window in ISO format
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const todayStartISO = todayStart.toISOString();
    const todayEndISO   = todayEnd.toISOString();
    const nowISO        = now.toISOString();

    // ── Run all independent queries in parallel ─────────────────────────────
    const [
      totalRoomsResult,
      bookedRoomsResult,
      todayCheckInsResult,
      todayCheckOutsResult,
      paidPaymentsResult,
      pendingBookingsResult,
    ] = await Promise.all([

      // 1. Total active rooms
      supabase
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),

      // 2. Currently occupied rooms: any confirmed booking that overlaps today
      //    (check_in ≤ end-of-today AND check_out ≥ start-of-today)
      supabase
        .from("bookings")
        .select("room_id", { count: "exact" })
        .eq("booking_status", "confirmed")
        .lte("check_in", todayEndISO)
        .gte("check_out", todayStartISO),

      // 3. Today's check-ins (confirmed = scheduled today, completed = already checked in+out today)
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("booking_status", ["confirmed", "completed"])
        .gte("check_in", todayStartISO)
        .lte("check_in", todayEndISO),

      // 4. Today's check-outs: confirmed (scheduled today) + completed (manually checked out today —
      //    checkout handler sets check_out = NOW so it falls in today's window)
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("booking_status", ["confirmed", "completed"])
        .gte("check_out", todayStartISO)
        .lte("check_out", todayEndISO),

      // 5. Revenue paid (paid + partial payments)
      supabase
        .from("payments")
        .select("amount_paid")
        .in("payment_status", ["paid", "partial"]),

      // 6. Pending balance: fetch bookings not fully paid
      //    Join total_amount from bookings + amount_paid from payments
      supabase
        .from("payments")
        .select("amount_paid, payment_status, bookings(total_amount)")
        .neq("payment_status", "paid"),
    ]);

    // ── Check for errors ────────────────────────────────────────────────────
    const errors = [
      totalRoomsResult,
      bookedRoomsResult,
      todayCheckInsResult,
      todayCheckOutsResult,
      paidPaymentsResult,
      pendingBookingsResult,
    ]
      .map((r) => r.error)
      .filter(Boolean);

    if (errors.length > 0) {
      console.error("[getDashboardStats] Query errors:", errors);
      return res.status(500).json({
        success: false,
        data: null,
        error: "Failed to fetch dashboard statistics.",
      });
    }

    // ── Compute values ──────────────────────────────────────────────────────

    const totalRooms = totalRoomsResult.count ?? 0;

    // Deduplicate room_ids for booked rooms count
    const bookedRoomIds = new Set(
      (bookedRoomsResult.data || []).map((r) => r.room_id)
    );
    const bookedRooms     = bookedRoomIds.size;
    const availableRooms  = Math.max(0, totalRooms - bookedRooms);

    const todayCheckIns   = todayCheckInsResult.count ?? 0;
    const todayCheckOuts  = todayCheckOutsResult.count ?? 0;

    // Sum all amount_paid for paid/partial payments
    const totalRevenuePaid = (paidPaymentsResult.data || []).reduce(
      (sum, p) => sum + parseFloat(p.amount_paid || 0),
      0
    );

    // Sum (total_amount - amount_paid) for non-paid payments
    const totalRevenuePending = (pendingBookingsResult.data || []).reduce(
      (sum, p) => {
        const totalAmount = parseFloat(p.bookings?.total_amount || 0);
        const amountPaid  = parseFloat(p.amount_paid || 0);
        return sum + Math.max(0, totalAmount - amountPaid);
      },
      0
    );

    return res.status(200).json({
      success: true,
      data: {
        total_rooms:            totalRooms,
        available_rooms:        availableRooms,
        booked_rooms:           bookedRooms,
        today_checkins:         todayCheckIns,
        today_checkouts:        todayCheckOuts,
        total_revenue_paid:     Math.round(totalRevenuePaid * 100) / 100,
        total_revenue_pending:  Math.round(totalRevenuePending * 100) / 100,
      },
      error: null,
    });
  } catch (err) {
    console.error("[getDashboardStats] Unexpected error:", err.message);
    return res.status(500).json({
      success: false,
      data: null,
      error: "Internal server error.",
    });
  }
};

module.exports = { getDashboardStats };
