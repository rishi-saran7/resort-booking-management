const express = require("express");
const router  = express.Router();

const supabase               = require("../config/supabaseClient");
const { getInvoiceData }     = require("../utils/invoiceService");
const { buildInvoiceBuffer } = require("../utils/invoiceGenerator");

// ─── GET /api/invoices/:bookingId/status ──────────────────────────────────────

router.get("/:bookingId/status", async (req, res) => {
  const { bookingId } = req.params;

  try {
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, total_amount")
      .eq("id", bookingId)
      .single();

    if (bookingErr || !booking) {
      return res.status(404).json({ success: false, data: null, error: "Booking not found." });
    }

    const { data: payments } = await supabase
      .from("payments")
      .select("payment_status, amount_paid")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false });

    const payment   = payments?.[0] ?? null;
    const fullyPaid = payment
      ? parseFloat(payment.amount_paid) >= parseFloat(booking.total_amount)
      : false;

    return res.status(200).json({
      success: true,
      data: {
        invoice_available: fullyPaid,
        download_url: fullyPaid ? `/api/invoices/${bookingId}/download` : null,
      },
      error: null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
});

// ─── GET /api/invoices/:bookingId/download ────────────────────────────────────

router.get("/:bookingId/download", async (req, res) => {
  const { bookingId } = req.params;

  try {
    console.log(`[invoiceRoutes] Download request for booking: ${bookingId}`);

    // 1. Fetch and validate
    const invoiceData = await getInvoiceData(bookingId);

    if (!invoiceData) {
      console.log("[invoiceRoutes] Not fully paid — returning 403");
      return res.status(403).json({
        success: false,
        data:    null,
        error:   "Invoice not available — booking is not fully paid.",
      });
    }

    console.log("[invoiceRoutes] Data fetched, building PDF buffer...");

    // 2. Build PDF into memory buffer
    const pdfBuffer = await buildInvoiceBuffer(invoiceData);

    console.log(`[invoiceRoutes] PDF buffer built, size: ${pdfBuffer.length} bytes`);

    // 3. Send buffer using Express 5 compatible methods
    const invoiceNo = `INV-${bookingId.slice(0, 8).toUpperCase()}`;

    res
      .status(200)
      .set({
        "Content-Type":        "application/pdf",
        "Content-Length":      pdfBuffer.length,
        "Content-Disposition": `attachment; filename="${invoiceNo}.pdf"`,
        "Cache-Control":       "no-cache",
      })
      .send(pdfBuffer);

    console.log("[invoiceRoutes] PDF sent successfully");

  } catch (err) {
    console.error("[invoiceRoutes] Error:", err.message, err.stack);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, data: null, error: err.message });
    }
  }
});

module.exports = router;