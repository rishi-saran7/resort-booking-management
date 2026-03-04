const supabase = require("../config/supabaseClient");
const { logAudit } = require("../utils/auditLogger");
const { applyDiscountAndBreakdown } = require("../utils/gstCalculator");

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
      custom_total_amount,
      booked_via_app = false,
      app_name = null,
      discount_type  = null,   // "flat" | "percentage" | null
      discount_value = 0,      // ₹ amount or % value
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

    // ── 4. Calculate GST-inclusive total (room price already includes GST) ──
    const pricePerNight  = parseFloat(room.price_per_night);   // GST-inclusive
    const extraBedPrice  = parseFloat(room.extra_bed_price || 0); // GST-inclusive
    const extraBedsCount = parseInt(extra_beds, 10);

    // Use custom amount if provided (external app / negotiated price)
    const customAmt = custom_total_amount !== undefined && custom_total_amount !== null
      ? parseFloat(custom_total_amount)
      : null;

    const baseCalculatedTotal =
      (customAmt !== null && !isNaN(customAmt) && customAmt > 0)
        ? customAmt
        : (nights * pricePerNight) + (extraBedsCount * extraBedPrice * nights);

    // ── 5. Apply discount and compute full pricing breakdown ─────────────────
    let pricing;
    try {
      pricing = applyDiscountAndBreakdown(
        baseCalculatedTotal,
        discount_type  || null,
        discount_value || 0
      );
    } catch (discountErr) {
      return res.status(400).json({
        success: false,
        data: null,
        error: discountErr.message,
      });
    }

    const totalAmount = pricing.finalAmount; // GST-inclusive, post-discount

    // ── 6. Insert booking ───────────────────────────────────────────────────
    const bookingRow = {
      room_id,
      customer_id,
      check_in,
      check_out,
      extra_beds:     extraBedsCount,
      total_amount:   totalAmount,
      booking_status: "confirmed",
      created_by:     req.user.id,
      booked_via_app: Boolean(booked_via_app),
      app_name:       booked_via_app && app_name ? String(app_name).trim() : null,
      // GST + discount snapshot columns (add these to your DB migration)
      discount_type:        pricing.discountType,
      discount_amount:      pricing.discountAmount,
      base_price:           pricing.basePrice,
      cgst_amount:          pricing.cgst,
      sgst_amount:          pricing.sgst,
      total_gst_amount:     pricing.totalGst,
    };

    let { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert([bookingRow])
      .select()
      .single();

    // Graceful fallback: if new columns don't exist in DB yet, retry with core fields only
    if (bookingError && bookingError.message && bookingError.message.includes("column")) {
      const {
        booked_via_app: _bva, app_name: _an,
        discount_type: _dt, discount_amount: _da,
        base_price: _bp, cgst_amount: _ca,
        sgst_amount: _sa, total_gst_amount: _tga,
        ...coreRow
      } = bookingRow;
      const fallback = await supabase.from("bookings").insert([coreRow]).select().single();
      booking      = fallback.data;
      bookingError = fallback.error;
    }

    if (bookingError) {
      return res.status(400).json({ success: false, data: null, error: bookingError.message });
    }

    // ── 7. Determine payment record ─────────────────────────────────────────
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
      booking_id:     booking.id,
      payment_method,
      payment_status: paymentStatus,
      amount_paid:    amountPaid,
      ...(payment_percentage !== undefined && {
        payment_percentage: parseFloat(payment_percentage),
      }),
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
        pricing_breakdown: pricing,
        payment_status:    paymentStatus,
        ...(booked_via_app && { booked_via_app: true, app_name }),
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        booking,
        payment,
        pricing_breakdown: pricing, // ← full breakdown returned to the client/UI
      },
      error: null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── GET /api/bookings ────────────────────────────────────────────────────────
// ...existing code...

const getAllBookings = async (req, res) => {
  try {
    const { status, from, to } = req.query;

    let query = supabase
      .from("bookings")
      .select(`
        id, room_id, customer_id, check_in, check_out, extra_beds,
        total_amount, booking_status, created_by, created_at,
        discount_type, discount_amount, base_price,
        cgst_amount, sgst_amount, total_gst_amount,
        rooms(room_number),
        customers(full_name, phone),
        payments(id, payment_status, amount_paid, payment_method)
      `)
      .order("created_at", { ascending: false });

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

// ─── POST /api/bookings/pricing-preview ──────────────────────────────────────
// Stateless endpoint — compute pricing breakdown WITHOUT creating a booking.
// Useful for the UI to show live updates as the user changes discount values.

const getPricingPreview = async (req, res) => {
  try {
    const {
      room_id,
      check_in,
      check_out,
      extra_beds = 0,
      custom_total_amount,
      discount_type  = null,
      discount_value = 0,
    } = req.body;

    if (!room_id || !check_in || !check_out) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "room_id, check_in, and check_out are required.",
      });
    }

    const nights = calcNights(check_in, check_out);
    if (nights <= 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "check_out must be after check_in.",
      });
    }

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("price_per_night, extra_bed_price")
      .eq("id", room_id)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ success: false, data: null, error: "Room not found." });
    }

    const pricePerNight  = parseFloat(room.price_per_night);
    const extraBedPrice  = parseFloat(room.extra_bed_price || 0);
    const extraBedsCount = parseInt(extra_beds, 10);

    const customAmt = custom_total_amount !== undefined && custom_total_amount !== null
      ? parseFloat(custom_total_amount)
      : null;

    const baseCalculatedTotal =
      (customAmt !== null && !isNaN(customAmt) && customAmt > 0)
        ? customAmt
        : (nights * pricePerNight) + (extraBedsCount * extraBedPrice * nights);

    let pricing;
    try {
      pricing = applyDiscountAndBreakdown(
        baseCalculatedTotal,
        discount_type  || null,
        discount_value || 0
      );
    } catch (discountErr) {
      return res.status(400).json({
        success: false,
        data: null,
        error: discountErr.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        nights,
        ...pricing,
      },
      error: null,
    });
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

    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, booking_status, total_amount")
      .eq("id", id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ success: false, data: null, error: "Booking not found." });
    }

    if (booking.booking_status === "completed") {
      return res.status(400).json({ success: false, data: null, error: "Booking is already completed." });
    }
    if (booking.booking_status === "cancelled") {
      return res.status(400).json({ success: false, data: null, error: "Cannot checkout a cancelled booking." });
    }

    const now = new Date().toISOString();

    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({ booking_status: "completed", check_out: now })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ success: false, data: null, error: updateError.message });
    }

    const { data: payment, error: paymentFetchError } = await supabase
      .from("payments")
      .select("id, payment_status, amount_paid")
      .eq("booking_id", id)
      .single();

    let updatedPayment = null;

    if (!paymentFetchError && payment && payment.payment_status !== "paid") {
      const { data: settledPayment, error: paymentUpdateError } = await supabase
        .from("payments")
        .update({ payment_status: "paid", amount_paid: booking.total_amount })
        .eq("id", payment.id)
        .select()
        .single();

      if (!paymentUpdateError) updatedPayment = settledPayment;
    }

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
      data: { booking: updatedBooking, payment: updatedPayment },
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

    const { data: existing, error: fetchError } = await supabase
      .from("bookings")
      .select("id, booking_status")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, data: null, error: "Booking not found." });
    }

    if (existing.booking_status === "completed") {
      return res.status(400).json({ success: false, data: null, error: "Cannot cancel a completed booking." });
    }
    if (existing.booking_status === "cancelled") {
      return res.status(400).json({ success: false, data: null, error: "Booking is already cancelled." });
    }

    const { data, error } = await supabase
      .from("bookings")
      .update({ booking_status: "cancelled" })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, data: null, error: error.message });
    }

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
  getPricingPreview,
  updateBookingStatus,
  checkoutBooking,
  cancelBooking,
};