const supabase = require("../config/supabaseClient");
const { logAudit } = require("../utils/auditLogger");

// ─── Helper: calculate nights between two date strings ────────────────────────

const calcNights = (checkIn, checkOut) => {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(checkOut) - new Date(checkIn)) / msPerDay);
};

// ─── POST /api/bookings ───────────────────────────────────────────────────────

const createBooking = async (req, res) => {
  try {
    const {
      room_id,
      customer_id,
      check_in,
      check_out,
      extra_beds = 0,
      payment_method = "pay_later",
      payment_percentage,
    } = req.body;

    // ── 1. Required field validation ────────────────────────────────────────
    if (!room_id || !customer_id || !check_in || !check_out) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "room_id, customer_id, check_in, and check_out are required.",
      });
    }

    // ── 2. Date validation ──────────────────────────────────────────────────
    const nights = calcNights(check_in, check_out);
    if (nights <= 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "check_out must be after check_in.",
      });
    }

    // ── 3. Fetch room and validate ──────────────────────────────────────────
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", room_id)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ success: false, data: null, error: "Room not found." });
    }

    if (!room.is_active) {
      return res.status(400).json({ success: false, data: null, error: "Room is not available (inactive)." });
    }

    // ── 4. Calculate total amount ───────────────────────────────────────────
    const pricePerNight = parseFloat(room.price_per_night);
    const extraBedPrice = parseFloat(room.extra_bed_price || 0);
    const extraBedsCount = parseInt(extra_beds, 10);

    const baseTotal   = nights * pricePerNight;
    const extraTotal  = extraBedsCount * extraBedPrice * nights;
    const totalAmount = baseTotal + extraTotal;

    // ── 5. Insert booking ───────────────────────────────────────────────────
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert([{
        room_id,
        customer_id,
        check_in,
        check_out,
        extra_beds: extraBedsCount,
        total_amount: totalAmount,
        booking_status: "confirmed",
        created_by: req.user.id,
      }])
      .select()
      .single();

    if (bookingError) {
      // Surface DB-level double-booking trigger errors as clean 400
      return res.status(400).json({ success: false, data: null, error: bookingError.message });
    }

    // ── 6. Determine payment record ─────────────────────────────────────────
    let paymentStatus;
    let amountPaid;

    if (payment_method === "pay_later") {
      paymentStatus = "pending";
      amountPaid    = 0;
    } else if (payment_percentage !== undefined && payment_percentage !== null) {
      amountPaid    = totalAmount * (parseFloat(payment_percentage) / 100);
      paymentStatus = "partial";
    } else {
      amountPaid    = totalAmount;
      paymentStatus = "paid";
    }

    const paymentPayload = {
      booking_id:         booking.id,
      payment_method,
      payment_status:     paymentStatus,
      amount_paid:        amountPaid,
      ...(payment_percentage !== undefined && { payment_percentage: parseFloat(payment_percentage) }),
    };

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert([paymentPayload])
      .select()
      .single();

    if (paymentError) {
      return res.status(500).json({ success: false, data: null, error: paymentError.message });
    }

    // Fire-and-forget audit log
    logAudit({
      staff_id:    req.user.id,
      action:      "BOOKING_CREATED",
      entity_type: "booking",
      entity_id:   booking.id,
      metadata:    {
        room_id,
        customer_id,
        check_in,
        check_out,
        total_amount: totalAmount,
        payment_status: paymentStatus,
      },
    });

    return res.status(201).json({
      success: true,
      data: { booking, payment },
      error: null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── GET /api/bookings ────────────────────────────────────────────────────────
// Supports: ?status=confirmed  ?from=2026-01-01  ?to=2026-01-31

const getAllBookings = async (req, res) => {
  try {
    const { status, from, to } = req.query;

    let query = supabase
      .from("bookings")
      .select(`
        id, room_id, customer_id, check_in, check_out, extra_beds,
        total_amount, booking_status, created_by, created_at,
        rooms(room_number),
        customers(full_name, phone),
        payments(id, payment_status, amount_paid, payment_method)
      `)
      .order("created_at", { ascending: false });

    // Filter by booking_status (indexed column)
    if (status) {
      const validStatuses = ["confirmed", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}.`,
        });
      }
      query = query.eq("booking_status", status);
    }

    // Filter created_at range
    if (from) {
      query = query.gte("created_at", new Date(from).toISOString());
    }
    if (to) {
      // Include the entire end day
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

// ─── GET /api/bookings/:id ────────────────────────────────────────────────────

const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        rooms(room_number, room_type, price_per_night, extra_bed_price),
        customers(full_name, phone, email, aadhaar_number),
        payments(id, payment_method, payment_status, amount_paid, payment_percentage)
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, data: null, error: "Booking not found." });
    }

    return res.status(200).json({ success: true, data, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── PATCH /api/bookings/:id/status ─────────────────────────────────────────

const VALID_STATUSES = ["confirmed", "completed", "cancelled"];

const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { booking_status } = req.body;

    if (!booking_status || !VALID_STATUSES.includes(booking_status)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `booking_status must be one of: ${VALID_STATUSES.join(", ")}.`,
      });
    }

    // Fetch current booking to enforce guard rules
    const { data: existing, error: fetchError } = await supabase
      .from("bookings")
      .select("id, booking_status")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, data: null, error: "Booking not found." });
    }

    if (existing.booking_status === "completed" && booking_status !== "completed") {
      return res.status(400).json({
        success: false,
        data: null,
        error: "Cannot modify a completed booking.",
      });
    }

    const { data, error } = await supabase
      .from("bookings")
      .update({ booking_status })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, data: null, error: error.message });
    }

    return res.status(200).json({ success: true, data, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── PATCH /api/bookings/:id/checkout ────────────────────────────────────────

const checkoutBooking = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch booking with total_amount
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, booking_status, total_amount")
      .eq("id", id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ success: false, data: null, error: "Booking not found." });
    }

    // 2. Guard: cannot checkout completed or cancelled booking
    if (booking.booking_status === "completed") {
      return res.status(400).json({
        success: false,
        data: null,
        error: "Booking is already completed.",
      });
    }
    if (booking.booking_status === "cancelled") {
      return res.status(400).json({
        success: false,
        data: null,
        error: "Cannot checkout a cancelled booking.",
      });
    }

    const now = new Date().toISOString();

    // 3. Update booking → completed, set actual check_out time
    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({
        booking_status: "completed",
        check_out: now,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ success: false, data: null, error: updateError.message });
    }

    // 4. Check payment status — auto-settle if pending or partial
    const { data: payment, error: paymentFetchError } = await supabase
      .from("payments")
      .select("id, payment_status, amount_paid")
      .eq("booking_id", id)
      .single();

    let updatedPayment = null;

    if (!paymentFetchError && payment && payment.payment_status !== "paid") {
      const { data: settledPayment, error: paymentUpdateError } = await supabase
        .from("payments")
        .update({
          payment_status: "paid",
          amount_paid: booking.total_amount,
        })
        .eq("id", payment.id)
        .select()
        .single();

      if (!paymentUpdateError) {
        updatedPayment = settledPayment;
      }
    }

    // Fire-and-forget audit log
    logAudit({
      staff_id:    req.user.id,
      action:      "BOOKING_COMPLETED",
      entity_type: "booking",
      entity_id:   id,
      metadata:    {
        previous_status:      booking.booking_status,
        new_status:           "completed",
        total_amount:         booking.total_amount,
        payment_auto_settled: updatedPayment !== null,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        booking: updatedBooking,
        payment: updatedPayment,
      },
      error: null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── PATCH /api/bookings/:id/cancel ──────────────────────────────────────────

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch current booking
    const { data: existing, error: fetchError } = await supabase
      .from("bookings")
      .select("id, booking_status")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, data: null, error: "Booking not found." });
    }

    // 2. Guard: cannot cancel a completed booking
    if (existing.booking_status === "completed") {
      return res.status(400).json({
        success: false,
        data: null,
        error: "Cannot cancel a completed booking.",
      });
    }

    if (existing.booking_status === "cancelled") {
      return res.status(400).json({
        success: false,
        data: null,
        error: "Booking is already cancelled.",
      });
    }

    // 3. Mark as cancelled
    const { data, error } = await supabase
      .from("bookings")
      .update({ booking_status: "cancelled" })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, data: null, error: error.message });
    }

    // Fire-and-forget audit log
    logAudit({
      staff_id:    req.user.id,
      action:      "BOOKING_CANCELLED",
      entity_type: "booking",
      entity_id:   id,
      metadata:    { previous_status: existing.booking_status, new_status: "cancelled" },
    });

    return res.status(200).json({ success: true, data, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

module.exports = {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  checkoutBooking,
  cancelBooking,
};
