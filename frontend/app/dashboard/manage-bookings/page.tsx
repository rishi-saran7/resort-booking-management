"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Payment {
  id:             string;
  payment_status: "paid" | "partial" | "pending";
  amount_paid:    number;
  payment_method: string;
}

interface Booking {
  id:             string;
  check_in:       string;
  check_out:      string;
  extra_beds:     number;
  total_amount:   number;
  booking_status: "confirmed" | "completed" | "cancelled";
  created_at:     string;
  rooms:          { room_number: string } | null;
  customers:      { full_name: string; phone: string } | null;
  payments:       Payment[];
}

interface Filters {
  status: "" | "confirmed" | "completed" | "cancelled";
  from:   string;
  to:     string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inr(n: number) {
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Booking["booking_status"] }) {
  const map = {
    confirmed: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[status]}`}>
      {status}
    </span>
  );
}

function PaymentBadge({ status }: { status: Payment["payment_status"] }) {
  const map = {
    paid:    "bg-green-100 text-green-700",
    partial: "bg-yellow-100 text-yellow-700",
    pending: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status]}`}>
      {status}
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-xl">
      <span className="text-green-400">✓</span>
      {message}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ManageBookingsPage() {
  const [bookings, setBookings]   = useState<Booking[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [toast, setToast]         = useState("");

  const [filters, setFilters]     = useState<Filters>({ status: "", from: "", to: "" });

  // ── Cancel modal ──────────────────────────────────────────────────────────
  const [cancelTarget, setCancelTarget]   = useState<Booking | null>(null);
  const [cancelling, setCancelling]       = useState(false);
  const [cancelErr, setCancelErr]         = useState("");

  // ── Payment modal ─────────────────────────────────────────────────────────
  const [payTarget, setPayTarget]         = useState<Booking | null>(null);
  const [newAmountPaid, setNewAmountPaid] = useState("");
  const [payLoading, setPayLoading]       = useState(false);
  const [payErr, setPayErr]               = useState("");

  // ── Checkout guard (prevent double-click) ─────────────────────────────────
  const checkingOutRef = useRef<Set<string>>(new Set());

  // ── Fetch bookings ────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (filters.status) qs.set("status", filters.status);
      if (filters.from)   qs.set("from", filters.from);
      if (filters.to)     qs.set("to", filters.to);
      const url = `/api/bookings${qs.toString() ? `?${qs}` : ""}`;
      const res = await api.get<Booking[]>(url);
      if (res.success) {
        setBookings(res.data);
      } else {
        setError(res.error ?? "Failed to load bookings.");
      }
    } catch {
      setError("Unable to reach the server.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // ── Checkout ─────────────────────────────────────────────────────────────
  async function handleCheckout(booking: Booking) {
    if (checkingOutRef.current.has(booking.id)) return;
    checkingOutRef.current.add(booking.id);
    try {
      const res = await api.patch<unknown>(`/api/bookings/${booking.id}/checkout`, {});
      if (res.success) {
        setToast("Guest checked out successfully.");
        fetchBookings(false);
      } else {
        setToast(""); // clear
        setError(res.error ?? "Checkout failed.");
      }
    } catch {
      setError("Unable to reach the server.");
    } finally {
      checkingOutRef.current.delete(booking.id);
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelErr("");
    try {
      const res = await api.patch<unknown>(`/api/bookings/${cancelTarget.id}/cancel`, {});
      if (res.success) {
        setCancelTarget(null);
        setToast("Booking cancelled.");
        fetchBookings(false);
      } else {
        setCancelErr(res.error ?? "Cancellation failed.");
      }
    } catch {
      setCancelErr("Unable to reach the server.");
    } finally {
      setCancelling(false);
    }
  }

  // ── Update payment ────────────────────────────────────────────────────────
  function openPaymentModal(booking: Booking) {
    const pmt = booking.payments[0];
    setPayTarget(booking);
    setNewAmountPaid(pmt ? String(pmt.amount_paid) : "0");
    setPayErr("");
  }

  async function handleUpdatePayment() {
    if (!payTarget) return;
    const pmt = payTarget.payments[0];
    if (!pmt) return;

    const amount = parseFloat(newAmountPaid);
    if (isNaN(amount) || amount < 0) {
      setPayErr("Enter a valid non-negative amount.");
      return;
    }
    const total = parseFloat(String(payTarget.total_amount));
    if (amount > total) {
      setPayErr(`Amount cannot exceed booking total (${inr(total)}).`);
      return;
    }

    setPayLoading(true);
    setPayErr("");
    try {
      const res = await api.patch<unknown>(`/api/payments/${pmt.id}`, { amount_paid: amount });
      if (res.success) {
        setPayTarget(null);
        setToast(`Payment updated — ${inr(amount)} recorded.`);
        fetchBookings(false);
      } else {
        setPayErr(res.error ?? "Payment update failed.");
      }
    } catch {
      setPayErr("Unable to reach the server.");
    } finally {
      setPayLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Page header ───────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Bookings</h1>
        <p className="mt-0.5 text-sm text-gray-500">View, checkout, cancel and update payments for all bookings.</p>
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters["status"] }))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* From */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {/* To */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {/* Clear */}
        {(filters.status || filters.from || filters.to) && (
          <button
            onClick={() => setFilters({ status: "", from: "", to: "" })}
            className="self-end rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto self-end text-xs text-gray-400">
          {!loading && `${bookings.length} booking${bookings.length !== 1 ? "s" : ""}`}
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            onClick={() => fetchBookings()}
            className="ml-4 rounded-lg bg-red-100 px-3 py-1 text-xs font-medium hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
          <p className="text-4xl">🗒️</p>
          <p className="text-lg font-semibold text-gray-700">No bookings found</p>
          <p className="text-sm text-gray-400">
            {filters.status || filters.from || filters.to
              ? "Try adjusting the filters."
              : "No bookings have been created yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Booking ID</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Check-out</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bookings.map((booking) => {
                const pmt = booking.payments[0] ?? null;
                return (
                  <tr
                    key={booking.id}
                    className="transition-colors hover:bg-blue-50/30"
                  >
                    {/* Booking ID */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className="cursor-default font-mono text-xs text-gray-500"
                        title={booking.id}
                      >
                        {shortId(booking.id)}
                      </span>
                    </td>

                    {/* Room */}
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-gray-800">
                      {booking.rooms?.room_number ?? "—"}
                    </td>

                    {/* Customer */}
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {booking.customers?.full_name ?? "—"}
                    </td>

                    {/* Phone */}
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {booking.customers?.phone ?? "—"}
                    </td>

                    {/* Check-in */}
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {fmtDate(booking.check_in)}
                    </td>

                    {/* Check-out */}
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {fmtDate(booking.check_out)}
                    </td>

                    {/* Booking status */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={booking.booking_status} />
                    </td>

                    {/* Total amount */}
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800">
                      {inr(booking.total_amount)}
                    </td>

                    {/* Amount paid */}
                    <td className="whitespace-nowrap px-4 py-3">
                      {pmt ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-gray-800">{inr(pmt.amount_paid)}</span>
                          <PaymentBadge status={pmt.payment_status} />
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {booking.booking_status === "confirmed" && (
                          <>
                            <button
                              onClick={() => handleCheckout(booking)}
                              className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 active:scale-95"
                            >
                              Checkout
                            </button>
                            <button
                              onClick={() => { setCancelTarget(booking); setCancelErr(""); }}
                              className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 active:scale-95"
                            >
                              Cancel
                            </button>
                          </>
                        )}

                        {pmt && pmt.payment_status !== "paid" && (
                          <button
                            onClick={() => openPaymentModal(booking)}
                            className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 active:scale-95"
                          >
                            Update Payment
                          </button>
                        )}

                        {booking.booking_status !== "confirmed" && (!pmt || pmt.payment_status === "paid") && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cancel confirmation modal ─────────────────────────────── */}
      {cancelTarget && (
        <ModalOverlay onClose={() => { if (!cancelling) setCancelTarget(null); }}>
          <h2 className="text-base font-semibold text-gray-900">Cancel booking?</h2>
          <p className="mt-2 text-sm text-gray-500">
            This will cancel the booking for{" "}
            <strong>{cancelTarget.customers?.full_name}</strong> in room{" "}
            <strong>{cancelTarget.rooms?.room_number}</strong>. This action cannot be undone.
          </p>
          {cancelErr && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{cancelErr}</p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setCancelTarget(null)}
              disabled={cancelling}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Keep Booking
            </button>
            <button
              onClick={handleConfirmCancel}
              disabled={cancelling}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Yes, Cancel"}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Update Payment modal ──────────────────────────────────── */}
      {payTarget && (
        <ModalOverlay onClose={() => { if (!payLoading) setPayTarget(null); }}>
          <h2 className="text-base font-semibold text-gray-900">Update Payment</h2>

          <div className="mt-4 space-y-3">
            <InfoRow label="Customer"   value={payTarget.customers?.full_name ?? "—"} />
            <InfoRow label="Room"       value={`Room ${payTarget.rooms?.room_number ?? "—"}`} />
            <InfoRow label="Total"      value={inr(payTarget.total_amount)} />
            <InfoRow
              label="Currently Paid"
              value={inr(payTarget.payments[0]?.amount_paid ?? 0)}
            />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-500">
              New Amount Paid (₹)
            </label>
            <input
              type="number"
              min={0}
              max={payTarget.total_amount}
              step="0.01"
              value={newAmountPaid}
              onChange={(e) => setNewAmountPaid(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            />
            <p className="mt-1 text-xs text-gray-400">
              Max: {inr(payTarget.total_amount)}
              {parseFloat(newAmountPaid) >= 0 && !isNaN(parseFloat(newAmountPaid)) && (
                <span className="ml-2 text-gray-500">
                  → Balance: {inr(Math.max(0, payTarget.total_amount - parseFloat(newAmountPaid)))}
                </span>
              )}
            </p>
          </div>

          {payErr && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{payErr}</p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setPayTarget(null)}
              disabled={payLoading}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdatePayment}
              disabled={payLoading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {payLoading ? "Saving…" : "Save Payment"}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Toast ────────────────────────────────────────────────── */}
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
