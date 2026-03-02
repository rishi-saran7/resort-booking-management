const supabase = require("../config/supabaseClient");
const { logAudit } = require("../utils/auditLogger");

// ─── PATCH /api/payments/:id ──────────────────────────────────────────────────
// Staff can manually update a payment record.
// Body: { amount_paid: number, payment_status?: "paid|partial|pending" }
//
// Rules:
//  - amount_paid cannot exceed booking.total_amount
//  - If amount_paid == total_amount → force payment_status = "paid"
//  - If amount_paid < total_amount  → force payment_status = "partial"
//  - amount_paid = 0                → force payment_status = "pending"

const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount_paid, payment_status } = req.body;

    // ── 1. Validate input ────────────────────────────────────────────────────
    if (amount_paid === undefined || amount_paid === null) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "amount_paid is required.",
      });
    }

    const parsedAmount = parseFloat(amount_paid);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "amount_paid must be a non-negative number.",
      });
    }

    // ── 2. Fetch payment + associated booking total ──────────────────────────
    const { data: payment, error: paymentFetchError } = await supabase
      .from("payments")
      .select("id, booking_id, payment_status, amount_paid")
      .eq("id", id)
      .single();

    if (paymentFetchError || !payment) {
      return res.status(404).json({ success: false, data: null, error: "Payment not found." });
    }

    const { data: booking, error: bookingFetchError } = await supabase
      .from("bookings")
      .select("id, total_amount, booking_status")
      .eq("id", payment.booking_id)
      .single();

    if (bookingFetchError || !booking) {
      return res.status(404).json({ success: false, data: null, error: "Associated booking not found." });
    }

    // ── 3. Business rule: completed bookings allow payment adjustments,
    //    but we still enforce the overpay guard ───────────────────────────────
    const totalAmount = parseFloat(booking.total_amount);

    if (parsedAmount > totalAmount) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `amount_paid (${parsedAmount}) cannot exceed booking total_amount (${totalAmount}).`,
      });
    }

    // ── 4. Auto-derive payment_status (override any client-supplied value) ───
    let resolvedStatus;
    if (parsedAmount === totalAmount) {
      resolvedStatus = "paid";
    } else if (parsedAmount > 0) {
      resolvedStatus = "partial";
    } else {
      resolvedStatus = "pending";
    }

    // Allow explicit override only when it doesn't contradict the amount rules
    // (e.g. staff may want to mark pending despite partial — we auto-derive
    //  above, so explicit payment_status is silently ignored to stay safe)

    // ── 5. Persist update ────────────────────────────────────────────────────
    const { data: updatedPayment, error: updateError } = await supabase
      .from("payments")
      .update({
        amount_paid: parsedAmount,
        payment_status: resolvedStatus,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ success: false, data: null, error: updateError.message });
    }

    // Fire-and-forget audit log
    logAudit({
      staff_id:    req.user.id,
      action:      "PAYMENT_UPDATED",
      entity_type: "payment",
      entity_id:   id,
      metadata:    {
        booking_id:      payment.booking_id,
        previous_status: payment.payment_status,
        new_status:      resolvedStatus,
        amount_paid:     parsedAmount,
        total_amount:    totalAmount,
      },
    });

    return res.status(200).json({ success: true, data: updatedPayment, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

module.exports = { updatePayment };
