"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AvailableRoom {
  room_id:              string;
  room_number:          string;
  room_type:            string;
  capacity:             number;
  price_per_night:      number;
  extra_bed_price:      number;
  nights:               number;
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
  check_in:    string;
  check_out:   string;
  guests:      number;
  extra_beds:  number;
}

type PaymentMethod = "cash" | "gpay" | "card" | "pay_later";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** Default check_in = today 12:00, check_out = tomorrow 12:00 */
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

  // ── Wizard step ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Shared booking state (accumulated across steps) ───────────────────
  const [searchParams,    setSearchParams]    = useState<SearchParams>({
    ...defaultDates(),
    guests:     1,
    extra_beds: 0,
  });
  const [selectedRoom,    setSelectedRoom]    = useState<AvailableRoom | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod,   setPaymentMethod]   = useState<PaymentMethod>("cash");
  const [paymentPct,      setPaymentPct]      = useState("");   // "" = full payment

  // ── Step 1 state ──────────────────────────────────────────────────────
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[] | null>(null);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchError,    setSearchError]    = useState("");
  // Raw string states so backspace/clear works in numeric inputs
  const [guestsRaw,    setGuestsRaw]    = useState("1");
  const [extraBedsRaw, setExtraBedsRaw] = useState("0");

  // ── Step 2 state ──────────────────────────────────────────────────────
  const [custSearchQ,    setCustSearchQ]    = useState("");
  const [custResults,    setCustResults]    = useState<Customer[]>([]);
  const [custSearchLoad, setCustSearchLoad] = useState(false);
  const [custSearchErr,  setCustSearchErr]  = useState("");
  const [showCreate,     setShowCreate]     = useState(false);
  const [newCust,        setNewCust]        = useState({ full_name: "", phone: "", aadhaar_number: "", email: "" });
  const [createLoad,     setCreateLoad]     = useState(false);
  const [createErr,      setCreateErr]      = useState("");

  // ── Step 3 state ──────────────────────────────────────────────────────
  const [submitErr,    setSubmitErr] = useState("");
  const [submitted,    setSubmitted] = useState(false);
  const submittingRef = useRef(false);   // prevents double-submission

  // ══ Step 1 handlers ══════════════════════════════════════════════════════

  async function handleSearchAvailability(e: React.FormEvent) {
    e.preventDefault();
    setSearchError("");
    setAvailableRooms(null);

    if (searchParams.guests <= 0) {
      setSearchError("Guests must be at least 1.");
      return;
    }
    if (searchParams.extra_beds < 0) {
      setSearchError("Extra beds cannot be negative.");
      return;
    }
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
        if (res.data.length === 0) setCustSearchErr("No customers found. You can create one below.");
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
        setStep(3);
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
    if (submittingRef.current) return;   // block double-click
    submittingRef.current = true;
    setSubmitErr("");

    try {
      const body: Record<string, unknown> = {
        room_id:        selectedRoom!.room_id,
        customer_id:    selectedCustomer!.id,
        check_in:       searchParams.check_in,
        check_out:      searchParams.check_out,
        extra_beds:     searchParams.extra_beds,
        payment_method: paymentMethod,
      };
      if (paymentPct !== "" && paymentMethod !== "pay_later") {
        const pct = parseFloat(paymentPct);
        if (!isNaN(pct) && pct > 0 && pct < 100) {
          body.payment_percentage = pct;
        }
      }

      const res = await api.post<unknown>("/api/bookings", body);
      if (res.success) {
        setSubmitted(true);
        router.refresh(); // bust Next.js cache so dashboard re-fetches fresh stats
        setTimeout(() => router.push("/dashboard"), 1800);
      } else {
        setSubmitErr(res.error ?? "Booking failed. Please try again.");
        submittingRef.current = false;
      }
    } catch {
      setSubmitErr("Unable to reach the server.");
      submittingRef.current = false;
    }
  }

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

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* ── Step 1 ─────────────────────────────────────────────────────── */}
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

          {/* Results */}
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
                      <span className="text-base font-bold text-blue-700">
                        {inr(room.total_estimated_price)}
                      </span>
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

      {/* ── Step 2 ─────────────────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          {/* Selected room summary strip */}
          <div className="mb-5 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3 text-sm">
            <span className="text-blue-700">
              <strong>Room {selectedRoom!.room_number}</strong> · {selectedRoom!.nights} nights ·{" "}
              {inr(selectedRoom!.total_estimated_price)}
            </span>
            <button
              onClick={() => { setStep(1); setSelectedRoom(null); }}
              className="text-xs text-blue-500 underline underline-offset-2 hover:text-blue-700"
            >
              Change
            </button>
          </div>

          <SectionTitle>Customer Details</SectionTitle>

          {/* Search existing */}
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

              {/* Search results */}
              {custResults.length > 0 && (
                <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100">
                  {custResults.map((c) => (
                    <li
                      key={c.id}
                      onClick={() => { setSelectedCustomer(c); setStep(3); }}
                      className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-blue-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{c.full_name}</p>
                        <p className="text-xs text-gray-500">{c.phone}{c.email ? ` · ${c.email}` : ""}</p>
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

          {/* Create new customer form */}
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

      {/* ── Step 3 ─────────────────────────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <SectionTitle>Confirm Booking</SectionTitle>

          {/* Summary */}
          <div className="mb-5 space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
            <SummaryRow label="Room"     value={`#${selectedRoom!.room_number} · ${selectedRoom!.room_type}`} />
            <SummaryRow label="Check-in"  value={new Date(searchParams.check_in).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} />
            <SummaryRow label="Check-out" value={new Date(searchParams.check_out).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} />
            <SummaryRow label="Nights"    value={String(selectedRoom!.nights)} />
            <SummaryRow label="Guests"    value={String(searchParams.guests)} />
            {searchParams.extra_beds > 0 && (
              <SummaryRow label="Extra Beds" value={String(searchParams.extra_beds)} />
            )}
            <SummaryRow label="Customer"  value={`${selectedCustomer!.full_name} · ${selectedCustomer!.phone}`} />
            <div className="border-t border-gray-200 pt-2">
              <SummaryRow
                label="Total Amount"
                value={inr(selectedRoom!.total_estimated_price)}
                bold
              />
            </div>
          </div>

          {/* Payment method */}
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

          {/* Partial payment percentage — only for non-pay_later */}
          {paymentMethod !== "pay_later" && (
            <div className="mt-4">
              <FormField label="Payment Percentage (leave blank for full payment)">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1} max={99}
                    placeholder="e.g. 50"
                    value={paymentPct}
                    onChange={(e) => setPaymentPct(e.target.value)}
                    className={`${inputCls} w-40`}
                  />
                  <span className="text-sm text-gray-500">%</span>
                  {paymentPct !== "" && !isNaN(parseFloat(paymentPct)) && parseFloat(paymentPct) > 0 && parseFloat(paymentPct) < 100 && (
                    <span className="text-sm font-medium text-blue-600">
                      = {inr(Math.round(selectedRoom!.total_estimated_price * parseFloat(paymentPct) / 100))} now
                    </span>
                  )}
                </div>
              </FormField>
            </div>
          )}

          {submitErr && <div className="mt-4"><ErrorMsg>{submitErr}</ErrorMsg></div>}

          {/* Action buttons */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => { setStep(2); setSubmitErr(""); }}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              onClick={handleConfirmBooking}
              disabled={submittingRef.current}
              className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submittingRef.current ? "Booking…" : "Confirm Booking"}
            </button>
          </div>
        </Card>
      )}
    </div>
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
  return <h2 className="mb-4 text-sm font-semibold text-gray-800">{children}</h2>;
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

function SummaryRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? "font-bold text-gray-900" : "text-gray-700"}>{value}</span>
    </div>
  );
}

const inputCls =
  "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200";
