"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { triggerInvoiceDownload } from "../../lib/invoiceDownload";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AvailableRoom {
  room_id:               string;
  room_number:           string;
  room_type:             string;
  capacity:              number;
  price_per_night:       number;
  extra_bed_price:       number;
  nights:                number;
  total_estimated_price: number;
}

interface Customer {
  id:             string;
  full_name:      string;
  phone:          string;
  aadhaar_number: string | null;
  email:          string | null;
}

interface SearchParams {
  check_in:   string;
  check_out:  string;
  guests:     number;
  extra_beds: number;
}

interface PricingBreakdown {
  nights:          number;
  originalAmount:  number;
  discountType:    "flat" | "percentage" | null;
  discountValue:   number;
  discountAmount:  number;
  finalAmount:     number;   // GST-inclusive, post-discount
  basePrice:       number;   // pre-GST base extracted from finalAmount
  cgst:            number;
  sgst:            number;
  totalGst:        number;
  gstRate:         string;
  cgstRate:        string;
  sgstRate:        string;
}

type PaymentMethod  = "cash" | "gpay" | "card" | "pay_later";
type DiscountType   = "flat" | "percentage" | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function defaultDates(): Pick<SearchParams, "check_in" | "check_out"> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00`;
  const today    = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { check_in: fmt(today), check_out: fmt(tomorrow) };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const router = useRouter();

  // ── Wizard step ───────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Shared booking state ─────────────────────────────────────────────
  const [searchParams,     setSearchParams]     = useState<SearchParams>({
    ...defaultDates(),
    guests:     1,
    extra_beds: 0,
  });
  const [selectedRoom,     setSelectedRoom]     = useState<AvailableRoom | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod,    setPaymentMethod]    = useState<PaymentMethod>("cash");
  const [paymentPct,       setPaymentPct]       = useState("");

  // ── Step 1 state ──────────────────────────────────────────────────────
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[] | null>(null);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchError,    setSearchError]    = useState("");
  const [guestsRaw,      setGuestsRaw]      = useState("1");
  const [extraBedsRaw,   setExtraBedsRaw]   = useState("0");

  // ── Step 2 state ──────────────────────────────────────────────────────
  const [custSearchQ,    setCustSearchQ]    = useState("");
  const [custResults,    setCustResults]    = useState<Customer[]>([]);
  const [custSearchLoad, setCustSearchLoad] = useState(false);
  const [custSearchErr,  setCustSearchErr]  = useState("");
  const [showCreate,     setShowCreate]     = useState(false);
  const [newCust,        setNewCust]        = useState({
    full_name: "", phone: "", aadhaar_number: "", email: "",
  });
  const [createLoad, setCreateLoad] = useState(false);
  const [createErr,  setCreateErr]  = useState("");

  // ── Step 3 — booking meta ─────────────────────────────────────────────
  const [submitErr,       setSubmitErr]       = useState("");
  const [submitted,       setSubmitted]       = useState(false);
  const submittingRef = useRef(false);
  const [bookedViaApp,    setBookedViaApp]    = useState<boolean | null>(null);
  const [appName,         setAppName]         = useState("");
  const [customAmountRaw, setCustomAmountRaw] = useState("");

  // ── Step 3 — discount & live pricing ─────────────────────────────────
  const [discountType,     setDiscountType]     = useState<DiscountType>(null);
  const [discountValueRaw, setDiscountValueRaw] = useState("");
  const [pricing,          setPricing]          = useState<PricingBreakdown | null>(null);
  const [pricingLoading,   setPricingLoading]   = useState(false);
  const [pricingError,     setPricingError]     = useState("");
  const pricingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Live pricing preview — debounced ────────────────────────────────
  const fetchPricingPreview = useCallback(async (
    room:         AvailableRoom,
    params:       SearchParams,
    customAmt:    string,
    dType:        DiscountType,
    dValueRaw:    string,
  ) => {
    setPricingLoading(true);
    setPricingError("");

    const dValue = parseFloat(dValueRaw);

    try {
      const body: Record<string, unknown> = {
        room_id:    room.room_id,
        check_in:   params.check_in,
        check_out:  params.check_out,
        extra_beds: params.extra_beds,
        ...(customAmt !== "" && !isNaN(parseFloat(customAmt)) && parseFloat(customAmt) > 0
          && { custom_total_amount: parseFloat(customAmt) }),
        ...(dType && !isNaN(dValue) && dValue > 0 && {
          discount_type:  dType,
          discount_value: dValue,
        }),
      };

      const res = await api.post<PricingBreakdown>("/api/bookings/pricing-preview", body);
      if (res.success) {
        setPricing(res.data);
        setPricingError("");
      } else {
        setPricingError(res.error ?? "Could not compute pricing.");
        setPricing(null);
      }
    } catch {
      setPricingError("Unable to reach the server.");
      setPricing(null);
    } finally {
      setPricingLoading(false);
    }
  }, []);

  // Trigger preview whenever discount / custom amount changes (debounced 500 ms)
  useEffect(() => {
    if (step !== 3 || !selectedRoom) return;

    if (pricingDebounceRef.current) clearTimeout(pricingDebounceRef.current);

    pricingDebounceRef.current = setTimeout(() => {
      fetchPricingPreview(
        selectedRoom,
        searchParams,
        customAmountRaw,
        discountType,
        discountValueRaw,
      );
    }, 500);

    return () => {
      if (pricingDebounceRef.current) clearTimeout(pricingDebounceRef.current);
    };
  }, [
    step, selectedRoom, searchParams,
    customAmountRaw, discountType, discountValueRaw,
    fetchPricingPreview,
  ]);

  // Reset pricing state when entering step 3
  function enterStep3() {
    setPricing(null);
    setPricingError("");
    setDiscountType(null);
    setDiscountValueRaw("");
    setStep(3);
  }

  // ══ Step 1 handlers ══════════════════════════════════════════════════════

  async function handleSearchAvailability(e: React.FormEvent) {
    e.preventDefault();
    setSearchError("");
    setAvailableRooms(null);

    if (searchParams.guests <= 0) { setSearchError("Guests must be at least 1."); return; }
    if (searchParams.extra_beds < 0) { setSearchError("Extra beds cannot be negative."); return; }
    if (new Date(searchParams.check_out) <= new Date(searchParams.check_in)) {
      setSearchError("Check-out must be after check-in.");
      return;
    }

    setSearchLoading(true);
    try {
      const qs = new URLSearchParams({
        check_in:   searchParams.check_in,
        check_out:  searchParams.check_out,
        guests:     String(searchParams.guests),
        extra_beds: String(searchParams.extra_beds),
      });
      const res = await api.get<AvailableRoom[]>(`/api/rooms/availability?${qs}`);
      if (res.success) {
        setAvailableRooms(res.data);
      } else {
        setSearchError(res.error ?? "Failed to fetch availability.");
      }
    } catch {
      setSearchError("Unable to reach the server.");
    } finally {
      setSearchLoading(false);
    }
  }

  function selectRoom(room: AvailableRoom) {
    setSelectedRoom(room);
    setStep(2);
  }

  // ══ Step 2 handlers ══════════════════════════════════════════════════════

  async function handleCustSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!custSearchQ.trim()) return;
    setCustSearchErr("");
    setCustSearchLoad(true);
    try {
      const res = await api.get<Customer[]>(`/api/customers?search=${encodeURIComponent(custSearchQ)}`);
      if (res.success) {
        setCustResults(res.data);
        if (res.data.length === 0) setCustSearchErr("No customers found. Create one below.");
      } else {
        setCustSearchErr(res.error ?? "Search failed.");
      }
    } catch {
      setCustSearchErr("Unable to reach the server.");
    } finally {
      setCustSearchLoad(false);
    }
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newCust.full_name.trim() || !newCust.phone.trim()) {
      setCreateErr("Full name and phone are required.");
      return;
    }
    setCreateErr("");
    setCreateLoad(true);
    try {
      const payload: Record<string, string> = {
        full_name: newCust.full_name,
        phone:     newCust.phone,
      };
      if (newCust.aadhaar_number.trim()) payload.aadhaar_number = newCust.aadhaar_number;
      if (newCust.email.trim())          payload.email          = newCust.email;

      const res = await api.post<Customer>("/api/customers", payload);
      if (res.success) {
        setSelectedCustomer(res.data);
        enterStep3();
      } else {
        setCreateErr(res.error ?? "Failed to create customer.");
      }
    } catch {
      setCreateErr("Unable to reach the server.");
    } finally {
      setCreateLoad(false);
    }
  }

  // ══ Step 3 handler ═══════════════════════════════════════════════════════

  async function handleConfirmBooking() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitErr("");

    try {
      const customAmt =
        bookedViaApp !== null && customAmountRaw !== ""
          ? parseFloat(customAmountRaw)
          : NaN;

      const dValue = parseFloat(discountValueRaw);

      const body: Record<string, unknown> = {
        room_id:        selectedRoom!.room_id,
        customer_id:    selectedCustomer!.id,
        check_in:       searchParams.check_in,
        check_out:      searchParams.check_out,
        extra_beds:     searchParams.extra_beds,
        payment_method: paymentMethod,
        booked_via_app: bookedViaApp ?? false,
        ...(bookedViaApp && appName.trim() && { app_name: appName.trim() }),
        ...(!isNaN(customAmt) && customAmt > 0 && { custom_total_amount: customAmt }),
        ...(discountType && !isNaN(dValue) && dValue > 0 && {
          discount_type:  discountType,
          discount_value: dValue,
        }),
      };

      if (paymentPct !== "" && paymentMethod !== "pay_later") {
        const pct = parseFloat(paymentPct);
        if (!isNaN(pct) && pct > 0 && pct < 100) {
          body.payment_percentage = pct;
        }
      }

      // ── Updated type — now includes invoice fields from backend ──────────
      const res = await api.post<{
        booking:              { id: string };
        payment:              { payment_status: string; amount_paid: number } | null;
        pricing_breakdown:    unknown;
        invoice_available:    boolean;
        invoice_download_url: string | null;
      }>("/api/bookings", body);

      if (res.success) {
        const { booking, invoice_available, invoice_download_url } = res.data;

        // ── Auto-download invoice ONLY when fully paid ────────────────────
        if (invoice_available && invoice_download_url) {
          await triggerInvoiceDownload(invoice_download_url, booking.id);
        }

        setSubmitted(true);
        router.refresh();
        setTimeout(() => router.push("/dashboard"), 2000);
      } else {
        setSubmitErr(res.error ?? "Booking failed. Please try again.");
        submittingRef.current = false;
      }
    } catch {
      setSubmitErr("Unable to reach the server.");
      submittingRef.current = false;
    }
  }

  // ─── Derived: effective total for payment calc ────────────────────────────
  const effectiveTotal =
    pricing?.finalAmount ??
    (customAmountRaw !== "" && !isNaN(parseFloat(customAmountRaw))
      ? parseFloat(customAmountRaw)
      : selectedRoom?.total_estimated_price ?? 0);

  // ══ Render ════════════════════════════════════════════════════════════════

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">✅</div>
        <h2 className="text-xl font-bold text-gray-900">Booking Confirmed!</h2>
        <p className="text-sm text-gray-500">Redirecting to dashboard…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Booking</h1>
        <p className="mt-1 text-sm text-gray-500">
          Search availability, assign a customer, and confirm payment.
        </p>
      </div>

      <StepIndicator current={step} />

      {/* ── Step 1: Room Availability ──────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <SectionTitle>Search Room Availability</SectionTitle>

          <form onSubmit={handleSearchAvailability} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Check-in" required>
                <input
                  type="datetime-local"
                  value={searchParams.check_in}
                  onChange={(e) => setSearchParams((p) => ({ ...p, check_in: e.target.value }))}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Check-out" required>
                <input
                  type="datetime-local"
                  value={searchParams.check_out}
                  onChange={(e) => setSearchParams((p) => ({ ...p, check_out: e.target.value }))}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Guests" required>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  value={guestsRaw}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    setGuestsRaw(raw);
                    const n = parseInt(raw);
                    if (!isNaN(n) && n >= 1) setSearchParams((p) => ({ ...p, guests: n }));
                  }}
                  onBlur={() => {
                    const n = Math.max(1, parseInt(guestsRaw) || 1);
                    setGuestsRaw(String(n));
                    setSearchParams((p) => ({ ...p, guests: n }));
                  }}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Extra Beds">
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  value={extraBedsRaw}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    setExtraBedsRaw(raw);
                    const n = parseInt(raw);
                    if (!isNaN(n) && n >= 0) setSearchParams((p) => ({ ...p, extra_beds: n }));
                  }}
                  onBlur={() => {
                    const n = Math.max(0, parseInt(extraBedsRaw) || 0);
                    setExtraBedsRaw(String(n));
                    setSearchParams((p) => ({ ...p, extra_beds: n }));
                  }}
                  className={inputCls}
                />
              </FormField>
            </div>

            {searchError && <ErrorMsg>{searchError}</ErrorMsg>}

            <button
              type="submit"
              disabled={searchLoading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {searchLoading ? "Searching…" : "Search Availability"}
            </button>
          </form>

          {availableRooms !== null && (
            <div className="mt-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                {availableRooms.length === 0
                  ? "No rooms available for the selected criteria"
                  : `${availableRooms.length} room${availableRooms.length !== 1 ? "s" : ""} available`}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {availableRooms.map((room) => (
                  <div
                    key={room.room_id}
                    className="group flex flex-col justify-between rounded-xl border border-gray-100 bg-gray-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-800">Room {room.room_number}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500 shadow-sm capitalize">
                          {room.room_type}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Capacity: {room.capacity} · {room.nights} night{room.nights !== 1 ? "s" : ""}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {inr(room.price_per_night)}/night
                        {room.extra_bed_price > 0 && ` · Extra bed: ${inr(room.extra_bed_price)}`}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <span className="text-base font-bold text-blue-700">
                          {inr(room.total_estimated_price)}
                        </span>
                        <p className="text-[10px] text-gray-400">incl. 5% GST</p>
                      </div>
                      <button
                        onClick={() => selectRoom(room)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Select →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Step 2: Customer ───────────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          {/* Selected room strip */}
          <div className="mb-5 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3 text-sm">
            <span className="text-blue-700">
              <strong>Room {selectedRoom!.room_number}</strong> · {selectedRoom!.nights} night
              {selectedRoom!.nights !== 1 ? "s" : ""} · {inr(selectedRoom!.total_estimated_price)}
            </span>
            <button
              onClick={() => { setStep(1); setSelectedRoom(null); }}
              className="text-xs text-blue-500 underline underline-offset-2 hover:text-blue-700"
            >
              Change
            </button>
          </div>

          <SectionTitle>Customer Details</SectionTitle>

          {!showCreate && (
            <>
              <form onSubmit={handleCustSearch} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search by name or phone…"
                  value={custSearchQ}
                  onChange={(e) => { setCustSearchQ(e.target.value); setCustResults([]); setCustSearchErr(""); }}
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="submit"
                  disabled={custSearchLoad || !custSearchQ.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {custSearchLoad ? "…" : "Search"}
                </button>
              </form>

              {custSearchErr && <p className="mt-2 text-sm text-gray-500">{custSearchErr}</p>}

              {custResults.length > 0 && (
                <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100">
                  {custResults.map((c) => (
                    <li
                      key={c.id}
                      onClick={() => { setSelectedCustomer(c); enterStep3(); }}
                      className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-blue-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{c.full_name}</p>
                        <p className="text-xs text-gray-500">
                          {c.phone}{c.email ? ` · ${c.email}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-blue-600">Select →</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex items-center gap-2">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              <button
                onClick={() => { setShowCreate(true); setCreateErr(""); }}
                className="mt-3 w-full rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              >
                + Create New Customer
              </button>
            </>
          )}

          {showCreate && (
            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Full Name" required>
                  <input
                    type="text"
                    placeholder="Ravi Kumar"
                    value={newCust.full_name}
                    onChange={(e) => setNewCust((p) => ({ ...p, full_name: e.target.value }))}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Phone" required>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={newCust.phone}
                    onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Aadhaar Number">
                  <input
                    type="text"
                    placeholder="1234 5678 9012"
                    value={newCust.aadhaar_number}
                    onChange={(e) => setNewCust((p) => ({ ...p, aadhaar_number: e.target.value }))}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Email">
                  <input
                    type="email"
                    placeholder="ravi@example.com"
                    value={newCust.email}
                    onChange={(e) => setNewCust((p) => ({ ...p, email: e.target.value }))}
                    className={inputCls}
                  />
                </FormField>
              </div>

              {createErr && <ErrorMsg>{createErr}</ErrorMsg>}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateErr(""); }}
                  className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Back to Search
                </button>
                <button
                  type="submit"
                  disabled={createLoad}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createLoad ? "Creating…" : "Create & Continue"}
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* ── Step 3: Confirm ────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">

          {/* ── Booking summary card ─────────────────────────────────────── */}
          <Card>
            <SectionTitle>Booking Summary</SectionTitle>
            <div className="space-y-2 text-sm">
              <SummaryRow label="Room"      value={`#${selectedRoom!.room_number} · ${selectedRoom!.room_type}`} />
              <SummaryRow
                label="Check-in"
                value={new Date(searchParams.check_in).toLocaleString("en-IN", {
                  dateStyle: "medium", timeStyle: "short",
                })}
              />
              <SummaryRow
                label="Check-out"
                value={new Date(searchParams.check_out).toLocaleString("en-IN", {
                  dateStyle: "medium", timeStyle: "short",
                })}
              />
              <SummaryRow label="Nights"    value={String(selectedRoom!.nights)} />
              <SummaryRow label="Guests"    value={String(searchParams.guests)} />
              {searchParams.extra_beds > 0 && (
                <SummaryRow label="Extra Beds" value={String(searchParams.extra_beds)} />
              )}
              <SummaryRow
                label="Customer"
                value={`${selectedCustomer!.full_name} · ${selectedCustomer!.phone}`}
              />
            </div>

            {/* ── Booked via app toggle ───────────────────────────────────── */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Booked via external app?</span>
                <div className="flex gap-2">
                  {([true, false] as const).map((val) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => {
                        setBookedViaApp(val);
                        if (!val) { setAppName(""); setCustomAmountRaw(""); }
                      }}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                        bookedViaApp === val
                          ? val
                            ? "bg-blue-600 text-white"
                            : "bg-gray-600 text-white"
                          : "border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                      }`}
                    >
                      {val ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>

              {bookedViaApp === true && (
                <div className="mt-3 flex items-center justify-between gap-4">
                  <span className="shrink-0 text-sm text-gray-500">App Name</span>
                  <input
                    type="text"
                    placeholder="e.g. MakeMyTrip, Booking.com…"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    className={`${inputCls} w-64`}
                  />
                </div>
              )}

              {/* Custom amount — available once Yes/No is chosen */}
              {bookedViaApp !== null && (
                <div className="mt-3 flex items-center justify-between gap-4">
                  <span className="shrink-0 text-sm text-gray-500">
                    Override Amount
                    <span className="ml-1 text-xs text-gray-400">(optional)</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-500">₹</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={String(selectedRoom!.total_estimated_price)}
                      value={customAmountRaw}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.]/g, "");
                        setCustomAmountRaw(raw);
                      }}
                      className="w-36 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-right text-sm font-semibold text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* ── Live Pricing Panel ───────────────────────────────────────── */}
          <PricingPanel
            room={selectedRoom!}
            discountType={discountType}
            discountValueRaw={discountValueRaw}
            pricing={pricing}
            loading={pricingLoading}
            error={pricingError}
            onDiscountTypeChange={(t) => {
              setDiscountType(t);
              setDiscountValueRaw("");
            }}
            onDiscountValueChange={setDiscountValueRaw}
          />

          {/* ── Payment card ─────────────────────────────────────────────── */}
          <Card>
            <SectionTitle>Payment</SectionTitle>

            <FormField label="Payment Method" required>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["cash", "gpay", "card", "pay_later"] as PaymentMethod[]).map((m) => (
                  <label
                    key={m}
                    className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      paymentMethod === m
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:border-blue-200 hover:bg-blue-50/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment_method"
                      value={m}
                      checked={paymentMethod === m}
                      onChange={() => { setPaymentMethod(m); setPaymentPct(""); }}
                      className="sr-only"
                    />
                    {m === "pay_later" ? "Pay Later" : m.charAt(0).toUpperCase() + m.slice(1)}
                  </label>
                ))}
              </div>
            </FormField>

            {paymentMethod !== "pay_later" && (
              <div className="mt-4">
                <FormField label="Advance Percentage (leave blank = full payment)">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1} max={99}
                      placeholder="e.g. 50"
                      value={paymentPct}
                      onChange={(e) => setPaymentPct(e.target.value)}
                      className={`${inputCls} w-36`}
                    />
                    <span className="text-sm text-gray-500">%</span>
                    {paymentPct !== "" &&
                      !isNaN(parseFloat(paymentPct)) &&
                      parseFloat(paymentPct) > 0 &&
                      parseFloat(paymentPct) < 100 && (
                        <span className="rounded-md bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-700">
                          = {inr(Math.round(effectiveTotal * parseFloat(paymentPct) / 100))} now
                        </span>
                    )}
                  </div>
                </FormField>
              </div>
            )}

            {/* Pay Later notice */}
            {paymentMethod === "pay_later" && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <span>⏳</span>
                <span>Payment will be collected at check-out. Amount due: <strong>{inr(effectiveTotal)}</strong></span>
              </div>
            )}
          </Card>

          {submitErr && <ErrorMsg>{submitErr}</ErrorMsg>}

          {/* Action buttons */}
          <div className="flex gap-3 pb-6">
            <button
              onClick={() => {
                setStep(2);
                setSubmitErr("");
                setBookedViaApp(null);
                setAppName("");
                setCustomAmountRaw("");
                setDiscountType(null);
                setDiscountValueRaw("");
                setPricing(null);
              }}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              onClick={handleConfirmBooking}
              disabled={submittingRef.current}
              className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submittingRef.current ? "Booking…" : "✓ Confirm Booking"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PricingPanel ─────────────────────────────────────────────────────────────

interface PricingPanelProps {
  room:                  AvailableRoom;
  discountType:          DiscountType;
  discountValueRaw:      string;
  pricing:               PricingBreakdown | null;
  loading:               boolean;
  error:                 string;
  onDiscountTypeChange:  (t: DiscountType) => void;
  onDiscountValueChange: (v: string) => void;
}

function PricingPanel({
  room,
  discountType,
  discountValueRaw,
  pricing,
  loading,
  error,
  onDiscountTypeChange,
  onDiscountValueChange,
}: PricingPanelProps) {
  const dValue    = parseFloat(discountValueRaw);
  const hasDiscount =
    discountType !== null && !isNaN(dValue) && dValue > 0;

  // Fallback values when no pricing response yet
  const original = pricing?.originalAmount ?? room.total_estimated_price;
  const final    = pricing?.finalAmount    ?? room.total_estimated_price;

  return (
    <Card>
      <SectionTitle>Pricing & GST Breakdown</SectionTitle>

      {/* ── Discount controls ──────────────────────────────────────────── */}
      <div className="mb-5 rounded-xl bg-gray-50 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Apply Discount
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {/* Discount type toggle */}
          <div className="flex gap-2">
            {([null, "flat", "percentage"] as DiscountType[]).map((t) => (
              <button
                key={String(t)}
                type="button"
                onClick={() => onDiscountTypeChange(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  discountType === t
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-gray-200 bg-white text-gray-500 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                {t === null ? "No Discount" : t === "flat" ? "₹ Flat" : "% Off"}
              </button>
            ))}
          </div>

          {/* Discount value input — only when type selected */}
          {discountType !== null && (
            <div className="flex items-center gap-2">
              <div className="relative">
                {discountType === "flat" && (
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">
                    ₹
                  </span>
                )}
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={discountType === "flat" ? "500" : "10"}
                  value={discountValueRaw}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.]/g, "");
                    onDiscountValueChange(raw);
                  }}
                  className={`${inputCls} w-36 ${discountType === "flat" ? "pl-7" : "pr-7"}`}
                />
                {discountType === "percentage" && (
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
                    %
                  </span>
                )}
              </div>

              {/* Live discount preview badge */}
              {hasDiscount && pricing && (
                <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
                  −{inr(pricing.discountAmount)} off
                </span>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-2 text-xs text-red-500">⚠ {error}</p>
        )}
      </div>

      {/* ── Pricing breakdown table ────────────────────────────────────── */}
      <div
        className={`space-y-0 rounded-xl border border-gray-100 overflow-hidden text-sm transition-opacity ${
          loading ? "opacity-50" : "opacity-100"
        }`}
      >
        {/* Original price row */}
        <div className="flex items-center justify-between bg-white px-4 py-3">
          <span className="text-gray-500">
            Room price × {room.nights} night{room.nights !== 1 ? "s" : ""}
          </span>
          <span className="font-medium text-gray-800">
            {inr(original)}
          </span>
        </div>

        {/* Discount row — only when active */}
        {hasDiscount && pricing && (
          <div className="flex items-center justify-between bg-green-50 px-4 py-3">
            <span className="text-green-700">
              Discount
              {discountType === "flat"
                ? ` (₹${dValue} off)`
                : ` (${dValue}% off)`}
            </span>
            <span className="font-semibold text-green-700">
              − {inr(pricing.discountAmount)}
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-gray-100" />

        {/* Final payable */}
        <div className="flex items-center justify-between bg-blue-50 px-4 py-3.5">
          <span className="font-semibold text-blue-800">
            Total Payable
            <span className="ml-1.5 text-xs font-normal text-blue-500">(incl. GST)</span>
          </span>
          <span className="text-lg font-bold text-blue-700">
            {loading ? "…" : inr(final)}
          </span>
        </div>

        {/* GST breakdown — always shown, updates on discount change */}
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            GST Breakdown (extracted from total)
          </p>
          <div className="space-y-1.5">
            <GstRow
              label="Base Price (excl. GST)"
              value={pricing ? inr(pricing.basePrice) : "—"}
              loading={loading}
            />
            <GstRow
              label={`CGST @ ${pricing?.cgstRate ?? "2.5%"}`}
              value={pricing ? inr(pricing.cgst) : "—"}
              loading={loading}
            />
            <GstRow
              label={`SGST @ ${pricing?.sgstRate ?? "2.5%"}`}
              value={pricing ? inr(pricing.sgst) : "—"}
              loading={loading}
            />
            <div className="border-t border-gray-200 pt-1.5">
              <GstRow
                label={`Total GST @ ${pricing?.gstRate ?? "5%"}`}
                value={pricing ? inr(pricing.totalGst) : "—"}
                loading={loading}
                bold
              />
            </div>
          </div>
        </div>

        {/* Verification line */}
        {pricing && (
          <div className="flex items-center gap-1.5 border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-400">
            <span className="text-green-500">✓</span>
            Base {inr(pricing.basePrice)} + GST {inr(pricing.totalGst)} = {inr(pricing.finalAmount)}
          </div>
        )}
      </div>

      {/* Hint when no preview yet */}
      {!pricing && !loading && !error && (
        <p className="mt-3 text-center text-xs text-gray-400">
          GST breakdown will appear here automatically
        </p>
      )}

      {loading && (
        <p className="mt-3 text-center text-xs text-blue-400 animate-pulse">
          Calculating…
        </p>
      )}
    </Card>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Availability" },
  { n: 2, label: "Customer" },
  { n: 3, label: "Confirm" },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-6 flex items-center">
      {STEPS.map(({ n, label }, i) => (
        <div key={n} className="flex flex-1 items-center">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                n < current
                  ? "bg-green-500 text-white"
                  : n === current
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {n < current ? "✓" : n}
            </div>
            <span
              className={`mt-1 text-xs ${
                n === current ? "font-semibold text-blue-700" : "text-gray-400"
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`mb-5 mx-2 h-0.5 flex-1 transition-colors ${
                n < current ? "bg-green-400" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-semibold text-gray-800">{children}</h2>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-0.5">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="text-right text-gray-700">{value}</span>
    </div>
  );
}

function GstRow({
  label,
  value,
  loading,
  bold,
}: {
  label:    string;
  value:    string;
  loading:  boolean;
  bold?:    boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${bold ? "font-semibold text-gray-700" : "text-gray-500"}`}>
        {label}
      </span>
      <span
        className={`text-xs ${
          bold
            ? "font-bold text-gray-800"
            : loading
            ? "text-gray-300"
            : "text-gray-700"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

const inputCls =
  "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 " +
  "placeholder:text-gray-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200";