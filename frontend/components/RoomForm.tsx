"use client";

import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoomFormValues {
  room_number:     string;
  room_type:       "single" | "double" | "deluxe" | "suite";
  capacity:        number;
  price_per_night: number;
  extra_bed_price: number;
}

interface RoomFormProps {
  /** When provided the form is in "edit" mode and fields are pre-filled. */
  initial?: Partial<RoomFormValues>;
  onSubmit: (values: RoomFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const ROOM_TYPES: RoomFormValues["room_type"][] = [
  "single",
  "double",
  "deluxe",
  "suite",
];

const EMPTY: RoomFormValues = {
  room_number:     "",
  room_type:       "single",
  capacity:        1,
  price_per_night: 0,
  extra_bed_price: 0,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoomForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save Room",
}: RoomFormProps) {
  const [values, setValues]       = useState<RoomFormValues>({ ...EMPTY, ...initial });
  const [errors, setErrors]       = useState<Partial<Record<keyof RoomFormValues, string>>>({});
  const [apiError, setApiError]   = useState("");
  const [loading, setLoading]     = useState(false);

  // Keep form in sync if the parent swaps `initial` (e.g. opening a different room)
  useEffect(() => {
    setValues({ ...EMPTY, ...initial });
    setErrors({});
    setApiError("");
  }, [initial]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const set = <K extends keyof RoomFormValues>(key: K, val: RoomFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const setNum = (key: keyof RoomFormValues, raw: string) => {
    const n = parseFloat(raw);
    set(key, (isNaN(n) ? 0 : n) as RoomFormValues[typeof key]);
  };

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!values.room_number.trim())  errs.room_number     = "Room number is required.";
    if (values.capacity <= 0)        errs.capacity        = "Capacity must be greater than 0.";
    if (values.price_per_night <= 0) errs.price_per_night = "Price must be greater than 0.";
    if (values.extra_bed_price < 0)  errs.extra_bed_price = "Extra bed price cannot be negative.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");
    if (!validate()) return;
    setLoading(true);
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* Room Number */}
      <Field label="Room Number" error={errors.room_number} required>
        <input
          type="text"
          value={values.room_number}
          onChange={(e) => set("room_number", e.target.value)}
          placeholder="101"
          className={inputCls(!!errors.room_number)}
        />
      </Field>

      {/* Room Type */}
      <Field label="Room Type" required>
        <select
          value={values.room_type}
          onChange={(e) => set("room_type", e.target.value as RoomFormValues["room_type"])}
          className={inputCls(false)}
        >
          {ROOM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </Field>

      {/* Capacity + Price per night — side by side */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Capacity" error={errors.capacity} required>
          <input
            type="number"
            min={1}
            value={values.capacity}
            onChange={(e) => setNum("capacity", e.target.value)}
            className={inputCls(!!errors.capacity)}
          />
        </Field>

        <Field label="Price / Night (₹)" error={errors.price_per_night} required>
          <input
            type="number"
            min={1}
            step="0.01"
            value={values.price_per_night}
            onChange={(e) => setNum("price_per_night", e.target.value)}
            className={inputCls(!!errors.price_per_night)}
          />
        </Field>
      </div>

      {/* Extra Bed Price */}
      <Field label="Extra Bed Price (₹)" error={errors.extra_bed_price}>
        <input
          type="number"
          min={0}
          step="0.01"
          value={values.extra_bed_price}
          onChange={(e) => setNum("extra_bed_price", e.target.value)}
          className={inputCls(!!errors.extra_bed_price)}
        />
      </Field>

      {/* API-level error */}
      {apiError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {apiError}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

const inputCls = (hasError: boolean) =>
  `w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:ring-2 focus:ring-blue-300 ${
    hasError
      ? "border-red-400 bg-red-50 focus:ring-red-200"
      : "border-gray-200 bg-white focus:border-blue-400"
  }`;
