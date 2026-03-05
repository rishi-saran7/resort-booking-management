const supabase = require("../config/supabaseClient");

function isFullyPaid(amountPaid, totalAmount) {
  return parseFloat(amountPaid) >= parseFloat(totalAmount);
}

/**
 * Fetch all data needed to render an invoice for a booking.
 * Returns { booking, payment, customer, room } or null if not fully paid.
 */
async function getInvoiceData(bookingId) {
  // ── Fetch booking ─────────────────────────────────────────────────────────
  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();

  if (bookingErr || !booking) {
    throw new Error(`Booking not found: ${bookingErr?.message}`);
  }

  // ── Fetch room ────────────────────────────────────────────────────────────
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", booking.room_id)
    .single();

  if (roomErr || !room) {
    throw new Error(`Room not found: ${roomErr?.message}`);
  }

  // ── Fetch customer ────────────────────────────────────────────────────────
  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", booking.customer_id)
    .single();

  if (customerErr || !customer) {
    throw new Error(`Customer not found: ${customerErr?.message}`);
  }

  // ── Fetch payment ─────────────────────────────────────────────────────────
  const { data: payments, error: paymentErr } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });

  if (paymentErr || !payments || payments.length === 0) {
    throw new Error(`Payment not found: ${paymentErr?.message}`);
  }

  const payment = payments[0];

  // ── Guard: only fully paid ────────────────────────────────────────────────
  if (!isFullyPaid(payment.amount_paid, booking.total_amount)) {
    return null;
  }

  return { booking, payment, customer, room };
}

module.exports = { getInvoiceData, isFullyPaid };