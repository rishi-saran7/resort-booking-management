const GST_RATE  = 0.05;   // 5% total GST
const CGST_RATE = 0.025;  // 2.5% CGST
const SGST_RATE = 0.025;  // 2.5% SGST

/** Round to 2 decimal places */
const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Extract base price and GST breakdown from a GST-inclusive amount.
 * Formula: base_price = inclusive_amount / 1.05
 *
 * @param {number} inclusiveAmount - GST-inclusive price
 * @returns {{ basePrice, cgst, sgst, totalGst, totalInclusiveAmount }}
 */
const extractGstBreakdown = (inclusiveAmount) => {
  const amount = parseFloat(inclusiveAmount);
  if (isNaN(amount) || amount < 0) {
    throw new Error("inclusiveAmount must be a non-negative number.");
  }

  const basePrice = round2(amount / (1 + GST_RATE));
  const totalGst  = round2(amount - basePrice);
  const cgst      = round2(amount * CGST_RATE / (1 + GST_RATE));
  const sgst      = round2(amount * SGST_RATE / (1 + GST_RATE));

  return {
    basePrice,
    cgst,
    sgst,
    totalGst,
    totalInclusiveAmount: round2(amount),
  };
};

/**
 * Apply a discount to a GST-inclusive price and return the full pricing breakdown.
 *
 * Discount types:
 *   "flat"       — subtract a fixed rupee amount  (e.g. ₹500 off)
 *   "percentage" — subtract a % of the total      (e.g. 10% off)
 *
 * GST is re-extracted from the discounted total.
 *
 * @param {number}                   inclusiveAmount - Original GST-inclusive room total
 * @param {"flat"|"percentage"|null} discountType
 * @param {number}                   discountValue   - ₹ amount or % value (0–100)
 * @returns {PricingBreakdown}
 */
const applyDiscountAndBreakdown = (
  inclusiveAmount,
  discountType  = null,
  discountValue = 0,
) => {
  const original = parseFloat(inclusiveAmount);
  if (isNaN(original) || original < 0) {
    throw new Error("inclusiveAmount must be a non-negative number.");
  }

  let discountAmount = 0;

  if (discountType === "flat") {
    discountAmount = parseFloat(discountValue);
    if (isNaN(discountAmount) || discountAmount < 0) {
      throw new Error("Flat discount value must be a non-negative number.");
    }
    if (discountAmount > original) {
      throw new Error(
        `Flat discount (₹${discountAmount}) cannot exceed the total amount (₹${original}).`
      );
    }

  } else if (discountType === "percentage") {
    const pct = parseFloat(discountValue);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      throw new Error("Percentage discount must be between 0 and 100.");
    }
    discountAmount = round2(original * (pct / 100));

  } else if (discountType !== null && discountType !== undefined) {
    throw new Error('discountType must be "flat", "percentage", or null.');
  }

  const finalAmount  = round2(original - discountAmount);
  const gstBreakdown = extractGstBreakdown(finalAmount);

  return {
    originalAmount: round2(original),
    discountType:   discountType ?? null,
    discountValue:  discountType ? parseFloat(discountValue) : 0,
    discountAmount: round2(discountAmount),
    finalAmount,                      // still GST-inclusive
    basePrice:      gstBreakdown.basePrice,
    cgst:           gstBreakdown.cgst,
    sgst:           gstBreakdown.sgst,
    totalGst:       gstBreakdown.totalGst,
    gstRate:        `${GST_RATE  * 100}%`,
    cgstRate:       `${CGST_RATE * 100}%`,
    sgstRate:       `${SGST_RATE * 100}%`,
  };
};

module.exports = { extractGstBreakdown, applyDiscountAndBreakdown, round2 };