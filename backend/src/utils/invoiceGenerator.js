const PDFDocument = require("pdfkit");

// ─── Resort Config ────────────────────────────────────────────────────────────
const RESORT = {
  name:    "Lemon Peak Resort",
  tagline: "An Exquisite Retreat in the Hills",
  address: "123 Hill View Road, Ooty, Tamil Nadu - 643001",
  phone:   "+91 98765 43210",
  email:   "info@lemonpeakresort.com",
  website: "www.lemonpeakresort.com",
  gst:     "33AABCL1234F1Z5",
};

// ─── Premium Color Palette ────────────────────────────────────────────────────
const C = {
  navy:          "#0c1f3f",
  darkNavy:      "#081428",
  gold:          "#c8a45e",
  goldLight:     "#e8d5a3",
  goldDark:      "#a07e3a",
  white:         "#ffffff",
  offWhite:      "#fafbfd",
  cream:         "#f7f4ef",
  lightGray:     "#f0f2f5",
  midGray:       "#d1d5db",
  textPrimary:   "#1a1a2e",
  textSecondary: "#4a5568",
  textMuted:     "#8896a6",
  success:       "#0d7c42",
  successBg:     "#e8f5ee",
  successBdr:    "#b8e0ca",
  tableHeader:   "#0c1f3f",
  tableRowAlt:   "#f6f8fb",
  accentLine:    "#c8a45e",
};

// ─── Formatters ───────────────────────────────────────────────────────────────
const inr = (n) =>
  `Rs. ${parseFloat(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

const fmtDateLong = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
};

const invoiceNumber = (bookingId) =>
  `INV-${bookingId.slice(0, 8).toUpperCase()}`;

// ─── Drawing Helpers ──────────────────────────────────────────────────────────
const drawRect = (doc, x, y, w, h, color, radius = 0) => {
  doc.save();
  if (radius > 0) {
    doc.roundedRect(x, y, w, h, radius).fill(color);
  } else {
    doc.rect(x, y, w, h).fill(color);
  }
  doc.restore();
};

const drawLine = (doc, x1, y1, x2, y2, color = C.midGray, lw = 0.5) => {
  doc.save().strokeColor(color).lineWidth(lw)
     .moveTo(x1, y1).lineTo(x2, y2).stroke().restore();
};

const drawStrokedRect = (doc, x, y, w, h, strokeColor, lw = 0.5, radius = 0) => {
  doc.save().strokeColor(strokeColor).lineWidth(lw);
  if (radius > 0) {
    doc.roundedRect(x, y, w, h, radius).stroke();
  } else {
    doc.rect(x, y, w, h).stroke();
  }
  doc.restore();
};

/**
 * Returns a Promise<Buffer> containing the complete premium PDF invoice.
 */
function buildInvoiceBuffer({ booking, payment, customer, room }) {
  return new Promise((resolve, reject) => {
    try {
      console.log("[invoiceGenerator] Starting premium PDF build...");

      const chunks = [];
      const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });

      doc.on("data",  (chunk) => chunks.push(chunk));
      doc.on("end",   () => { resolve(Buffer.concat(chunks)); });
      doc.on("error", (err) => reject(err));

      const PW = 595.28;
      const PH = 841.89;
      const ML = 45;
      const MR = 45;
      const CW = PW - ML - MR;   // 505.28

      // ── Computed values ────────────────────────────────────────────────────
      const nights = Math.max(1, Math.round(
        (new Date(booking.check_out) - new Date(booking.check_in)) / 86400000
      ));

      const totalAmount    = parseFloat(booking.total_amount     || 0);
      const basePrice      = parseFloat(booking.base_price       || totalAmount / 1.05);
      const cgst           = parseFloat(booking.cgst_amount      || (totalAmount / 1.05) * 0.025);
      const sgst           = parseFloat(booking.sgst_amount      || (totalAmount / 1.05) * 0.025);
      const totalGst       = parseFloat(booking.total_gst_amount || cgst + sgst);
      const discountAmount = parseFloat(booking.discount_amount  || 0);
      const pricePerNight  = parseFloat(room.price_per_night     || 0);
      const extraBedPrice  = parseFloat(room.extra_bed_price     || 0);
      const extraBeds      = parseInt(booking.extra_beds         || 0, 10);
      const amountPaid     = parseFloat(payment.amount_paid      || 0);
      const balance        = Math.max(0, totalAmount - amountPaid);

      // ═══════════════════════════════════════════════════════════════════════
      // 1. TOP GOLD ACCENT BAR
      // ═══════════════════════════════════════════════════════════════════════
      drawRect(doc, 0, 0, PW, 5, C.gold);

      // ═══════════════════════════════════════════════════════════════════════
      // 2. HEADER
      // ═══════════════════════════════════════════════════════════════════════
      drawRect(doc, 0, 5, PW, 100, C.navy);

      doc.fontSize(26).font("Helvetica-Bold").fillColor(C.white)
         .text(RESORT.name, ML, 25, { width: 320 });
      doc.fontSize(9).font("Helvetica").fillColor(C.goldLight)
         .text(RESORT.tagline, ML, 58);
      doc.fontSize(7.5).font("Helvetica").fillColor(C.goldLight)
         .text(RESORT.address, ML, 74);

      doc.fontSize(32).font("Helvetica-Bold").fillColor(C.gold)
         .text("INVOICE", 0, 28, { width: PW - MR, align: "right" });

      drawRect(doc, 0, 105, PW, 2, C.gold);

      // ═══════════════════════════════════════════════════════════════════════
      // 3. INVOICE META STRIP
      // ═══════════════════════════════════════════════════════════════════════
      let y = 120;
      drawRect(doc, 0, y - 3, PW, 50, C.cream);

      const metaCols = [
        { label: "INVOICE NO.",  value: invoiceNumber(booking.id) },
        { label: "DATE",         value: fmtDateLong(new Date()) },
        { label: "BOOKING REF",  value: booking.id.slice(0, 8).toUpperCase() },
        { label: "PAYMENT MODE", value: (payment.payment_method || "—").toUpperCase() },
      ];

      const metaW = CW / metaCols.length;
      metaCols.forEach((item, i) => {
        const mx = ML + i * metaW;
        doc.fontSize(6.5).font("Helvetica").fillColor(C.textMuted)
           .text(item.label, mx, y + 2, { width: metaW });
        doc.fontSize(9.5).font("Helvetica-Bold").fillColor(C.navy)
           .text(item.value, mx, y + 15, { width: metaW - 10 });
        if (i < metaCols.length - 1) {
          drawLine(doc, mx + metaW - 1, y + 2, mx + metaW - 1, y + 36, C.goldLight, 0.5);
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      // 4. BILLED TO + STAY DETAILS panels
      // ═══════════════════════════════════════════════════════════════════════
      y = 182;
      const panelW = (CW - 20) / 2;
      const panelH = 120;
      const rightX = ML + panelW + 20;

      // ── LEFT: BILLED TO ────────────────────────────────────────────────────
      drawRect(doc, ML, y, panelW, panelH, C.white, 6);
      drawStrokedRect(doc, ML, y, panelW, panelH, C.midGray, 0.5, 6);
      drawRect(doc, ML, y + 8, 3, panelH - 16, C.gold, 1);

      doc.fontSize(7).font("Helvetica-Bold").fillColor(C.gold)
         .text("BILLED TO", ML + 14, y + 12);
      drawLine(doc, ML + 14, y + 24, ML + panelW - 14, y + 24, C.goldLight, 0.5);

      doc.fontSize(12).font("Helvetica-Bold").fillColor(C.textPrimary)
         .text(customer.full_name, ML + 14, y + 32, { width: panelW - 28 });

      const guestDetails = [
        { label: "Phone:",   val: customer.phone },
        { label: "Email:",   val: customer.email || "N/A" },
        { label: "Aadhaar:", val: customer.aadhaar_number || "N/A" },
      ];
      let gy = y + 52;
      guestDetails.forEach((item) => {
        doc.fontSize(7.5).font("Helvetica").fillColor(C.textMuted)
           .text(item.label, ML + 14, gy, { width: 48 });
        doc.fontSize(8).font("Helvetica").fillColor(C.textSecondary)
           .text(item.val, ML + 62, gy, { width: panelW - 76 });
        gy += 16;
      });

      // ── RIGHT: STAY DETAILS ────────────────────────────────────────────────
      drawRect(doc, rightX, y, panelW, panelH, C.white, 6);
      drawStrokedRect(doc, rightX, y, panelW, panelH, C.midGray, 0.5, 6);
      drawRect(doc, rightX, y + 8, 3, panelH - 16, C.gold, 1);

      doc.fontSize(7).font("Helvetica-Bold").fillColor(C.gold)
         .text("STAY DETAILS", rightX + 14, y + 12);
      // FIX: removed the broken duplicate drawLine with swapped args that caused the ghost artifact
      drawLine(doc, rightX + 14, y + 24, rightX + panelW - 14, y + 24, C.goldLight, 0.5);

      const stayLabelW = 75;
      const stayValX   = rightX + 14 + stayLabelW;
      const stayValW   = panelW - 28 - stayLabelW;

      const stayDetails = [
        { label: "Room",       value: `Room ${room.room_number}  ·  ${(room.room_type || "").charAt(0).toUpperCase() + (room.room_type || "").slice(1)}` },
        { label: "Check-in",   value: fmtDate(booking.check_in) },
        { label: "Check-out",  value: fmtDate(booking.check_out) },
        { label: "Duration",   value: `${nights} Night${nights !== 1 ? "s" : ""}` },
        { label: "Extra Beds", value: String(extraBeds) },
      ];
      let sy = y + 32;
      stayDetails.forEach((item) => {
        doc.fontSize(7.5).font("Helvetica").fillColor(C.textMuted)
           .text(item.label, rightX + 14, sy, { width: stayLabelW });
        doc.fontSize(8.5).font("Helvetica-Bold").fillColor(C.textPrimary)
           .text(item.value, stayValX, sy, { width: stayValW });
        sy += 16;
      });

      // ═══════════════════════════════════════════════════════════════════════
      // 5. CHARGES TABLE
      // ═══════════════════════════════════════════════════════════════════════
      y += panelH + 18;

      doc.fontSize(8).font("Helvetica-Bold").fillColor(C.gold)
         .text("CHARGES SUMMARY", ML, y);
      y += 14;

      drawLine(doc, ML, y, ML + CW, y, C.gold, 1);
      y += 1;

      const ROW_H = 30;
      drawRect(doc, ML, y, CW, ROW_H, C.navy);

      // FIX: Recalculated all column x positions to fit exactly within CW=505.28
      // Total used: 20+10 + 185+10 + 75+10 + 50+10 + 40+10 + 60+15 = 505.28 ✓
      // Structure: [gap][col][gap][col]...[gap][col][gap]
      const COL_GAP  = 12;
      const colRight = ML + CW - COL_GAP;   // right edge for "Amount" right-align

      const cols = [
        { label: "#",            x: ML + COL_GAP,       w: 18,  align: "left"   },
        { label: "Description",  x: ML + COL_GAP + 30,  w: 200, align: "left"   },
        { label: "Rate/Night",   x: ML + COL_GAP + 238, w: 75,  align: "right"  },
        { label: "Nights",       x: ML + COL_GAP + 323, w: 45,  align: "center" },
        { label: "Qty",          x: ML + COL_GAP + 378, w: 35,  align: "center" },
        // Amount: anchored from right edge so it never overflows
        { label: "Amount",       x: colRight - 68,       w: 68,  align: "right"  },
      ];

      cols.forEach((c) => {
        doc.fontSize(7).font("Helvetica-Bold").fillColor(C.goldLight)
           .text(c.label.toUpperCase(), c.x, y + 11, { width: c.w, align: c.align });
      });

      y += ROW_H;

      // Line items
      const roomTypeName = room.room_type
        ? room.room_type.charAt(0).toUpperCase() + room.room_type.slice(1)
        : "Standard";

      const lineItems = [
        {
          desc: `${roomTypeName} Room — #${room.room_number}`,
          ppn:  pricePerNight,
          n:    nights,
          qty:  1,
          amt:  pricePerNight * nights,
        },
      ];

      if (extraBeds > 0) {
        lineItems.push({
          desc: `Extra Bed Charge (×${extraBeds})`,
          ppn:  extraBedPrice,
          n:    nights,
          qty:  extraBeds,
          amt:  extraBedPrice * nights * extraBeds,
        });
      }

      const ITEM_ROW_H = 28;
      lineItems.forEach((row, i) => {
        const ry = y + i * ITEM_ROW_H;
        drawRect(doc, ML, ry, CW, ITEM_ROW_H, i % 2 === 0 ? C.offWhite : C.white);
        drawLine(doc, ML, ry + ITEM_ROW_H, ML + CW, ry + ITEM_ROW_H, C.midGray, 0.3);

        doc.fontSize(8).font("Helvetica").fillColor(C.textSecondary)
           .text(String(i + 1), cols[0].x, ry + 9, { width: cols[0].w, align: cols[0].align });
        doc.text(row.desc,      cols[1].x, ry + 9, { width: cols[1].w, align: cols[1].align });
        doc.text(inr(row.ppn),  cols[2].x, ry + 9, { width: cols[2].w, align: cols[2].align });
        doc.text(String(row.n), cols[3].x, ry + 9, { width: cols[3].w, align: cols[3].align });
        doc.text(String(row.qty),cols[4].x, ry + 9, { width: cols[4].w, align: cols[4].align });
        doc.font("Helvetica-Bold").fillColor(C.textPrimary)
           .text(inr(row.amt),  cols[5].x, ry + 9, { width: cols[5].w, align: cols[5].align });
      });

      const tableEnd = y + lineItems.length * ITEM_ROW_H;
      drawLine(doc, ML, tableEnd, ML + CW, tableEnd, C.navy, 1.5);

      // ═══════════════════════════════════════════════════════════════════════
      // 6. TOTALS SECTION
      // ═══════════════════════════════════════════════════════════════════════
      y = tableEnd + 14;

      // ── Build totRows array first so we know exact height ──────────────────
      const totRows = [];
      totRows.push({ label: "Subtotal (excl. GST)", value: inr(basePrice),   color: C.textSecondary });

      if (discountAmount > 0) {
        const discLabel = booking.discount_type === "percentage"
          ? `Discount (${booking.discount_value || ""}%)`
          : "Discount (Flat)";
        totRows.push({ label: discLabel, value: `– ${inr(discountAmount)}`, color: C.success });
      }

      totRows.push({ label: "CGST @ 2.5%",    value: inr(cgst),     color: C.textSecondary });
      totRows.push({ label: "SGST @ 2.5%",    value: inr(sgst),     color: C.textSecondary });
      totRows.push({ label: "Total GST (5%)", value: inr(totalGst), color: C.textSecondary });
      totRows.push({ separator: true });
      totRows.push({ label: "GRAND TOTAL",    value: inr(totalAmount), grand: true });
      totRows.push({ label: "Amount Paid",    value: inr(amountPaid),  color: C.success });
      totRows.push({ label: "Balance Due",    value: inr(balance),
                     color: balance > 0 ? "#c0392b" : C.success, bold: true });

      // FIX: Calculate exact container height before drawing it
      const ROW_LINE_H  = 20;   // height per normal row
      const SEP_H       = 12;   // height for separator pseudo-row
      const GRAND_H     = 26;   // height for grand total row
      const PAD_V       = 12;   // top + bottom padding inside card

      let exactTotH = PAD_V;
      totRows.forEach((r) => {
        if (r.separator) exactTotH += SEP_H;
        else if (r.grand) exactTotH += GRAND_H;
        else exactTotH += ROW_LINE_H;
      });
      exactTotH += PAD_V;

      // Totals card — right-aligned, fixed width
      const totW  = 240;
      const totX  = ML + CW - totW;
      const lblX  = totX + 14;
      const valX  = totX + totW - 14;   // right edge for right-aligned values
      const lblW  = 140;
      const valW  = totW - 28 - lblW;   // remaining width for value column

      drawRect(doc, totX, y, totW, exactTotH, C.offWhite, 6);
      drawStrokedRect(doc, totX, y, totW, exactTotH, C.midGray, 0.4, 6);

      let ty = y + PAD_V;

      totRows.forEach((row) => {
        if (row.separator) {
          drawLine(doc, lblX, ty + 4, valX, ty + 4, C.gold, 1);
          ty += SEP_H;
          return;
        }

        if (row.grand) {
          drawRect(doc, totX + 4, ty - 2, totW - 8, GRAND_H - 2, C.navy, 3);
          doc.fontSize(10).font("Helvetica-Bold").fillColor(C.white)
             .text(row.label, lblX, ty + 4, { width: lblW });
          doc.fontSize(10).font("Helvetica-Bold").fillColor(C.white)
             .text(row.value, lblX + lblW, ty + 4, { width: valW, align: "right" });
          ty += GRAND_H;
          return;
        }

        doc.fontSize(8).font(row.bold ? "Helvetica-Bold" : "Helvetica")
           .fillColor(row.color || C.textSecondary)
           .text(row.label, lblX, ty + 2, { width: lblW });
        doc.fontSize(8.5).font(row.bold ? "Helvetica-Bold" : "Helvetica")
           .fillColor(row.color || C.textPrimary)
           .text(row.value, lblX + lblW, ty + 2, { width: valW, align: "right" });
        ty += ROW_LINE_H;
      });

      // ── Payment badge — left of totals, vertically centred ────────────────
      const badgeW = totX - ML - 16;
      const badgeH = 90;
      const badgeY = y + (exactTotH - badgeH) / 2;   // vertically centred

      drawRect(doc, ML, badgeY, badgeW, badgeH, C.successBg, 6);
      drawStrokedRect(doc, ML, badgeY, badgeW, badgeH, C.successBdr, 0.8, 6);

      // Circle tick
      drawRect(doc, ML + 14, badgeY + 14, 24, 24, C.success, 12);
      doc.fontSize(13).font("Helvetica-Bold").fillColor(C.white)
         .text("✓", ML + 14, badgeY + 18, { width: 24, align: "center" });

      doc.fontSize(10).font("Helvetica-Bold").fillColor(C.success)
         .text("PAYMENT CONFIRMED", ML + 46, badgeY + 16);
      doc.fontSize(7).font("Helvetica").fillColor(C.textMuted)
         .text(`Ref: ${payment.id.slice(0, 16).toUpperCase()}`, ML + 46, badgeY + 30);

      drawLine(doc, ML + 14, badgeY + 48, ML + badgeW - 14, badgeY + 48, C.successBdr, 0.5);

      doc.fontSize(7).font("Helvetica").fillColor(C.textMuted)
         .text("Method", ML + 14, badgeY + 56);
      doc.fontSize(9).font("Helvetica-Bold").fillColor(C.textPrimary)
         .text((payment.payment_method || "").toUpperCase(), ML + 14, badgeY + 68);

      doc.fontSize(7).font("Helvetica").fillColor(C.textMuted)
         .text("Amount Received", ML + badgeW / 2 + 4, badgeY + 56);
      doc.fontSize(9).font("Helvetica-Bold").fillColor(C.success)
         .text(inr(amountPaid), ML + badgeW / 2 + 4, badgeY + 68);

      // ═══════════════════════════════════════════════════════════════════════
      // 7. FOOTER
      // ═══════════════════════════════════════════════════════════════════════
      const footerStartY = PH - 132;

      drawRect(doc, ML, footerStartY, CW, 1.5, C.gold);

      doc.fontSize(13).font("Helvetica-Bold").fillColor(C.navy)
         .text(`Thank you for choosing ${RESORT.name}!`, ML, footerStartY + 14, {
           width: CW, align: "center",
         });
      doc.fontSize(8).font("Helvetica").fillColor(C.textMuted)
         .text(
           "We hope you had a delightful stay. We look forward to welcoming you again.",
           ML, footerStartY + 32, { width: CW, align: "center" }
         );

      const termsW = CW * 0.58;
      const sigW   = CW - termsW - 10;
      const sigX   = ML + termsW + 10;
      const tY     = footerStartY + 54;

      doc.fontSize(6.5).font("Helvetica-Bold").fillColor(C.textMuted)
         .text("TERMS & CONDITIONS", ML, tY);
      doc.fontSize(6).font("Helvetica").fillColor(C.textMuted)
         .text(
           "1. This is a computer-generated invoice and is valid without a physical signature.\n" +
           "2. All disputes are subject to jurisdiction of the local courts at Ooty.\n" +
           "3. GST has been charged as per the prevailing rates applicable.",
           ML, tY + 11, { width: termsW, lineGap: 2 }
         );

      drawLine(doc, sigX + 10, tY + 30, sigX + sigW - 10, tY + 30, C.navy, 0.8);
      doc.fontSize(8).font("Helvetica-Bold").fillColor(C.navy)
         .text("Authorized Signatory", sigX + 10, tY + 36, { width: sigW - 20, align: "center" });
      doc.fontSize(7).font("Helvetica").fillColor(C.textMuted)
         .text(RESORT.name, sigX + 10, tY + 48, { width: sigW - 20, align: "center" });

      // ═══════════════════════════════════════════════════════════════════════
      // 8. BOTTOM BAR
      // ═══════════════════════════════════════════════════════════════════════
      drawRect(doc, 0, PH - 28, PW, 2,  C.gold);
      drawRect(doc, 0, PH - 26, PW, 26, C.navy);

      doc.fontSize(7).font("Helvetica").fillColor(C.goldLight)
         .text(
           `${RESORT.phone}   ·   ${RESORT.email}   ·   ${RESORT.website}   ·   GSTIN: ${RESORT.gst}`,
           ML, PH - 17, { width: CW, align: "center" }
         );

      doc.end();

    } catch (err) {
      console.error("[invoiceGenerator] Build error:", err.message, err.stack);
      reject(err);
    }
  });
}

module.exports = { buildInvoiceBuffer };