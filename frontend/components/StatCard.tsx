"use client";

import { type ReactNode } from "react";

// ─── Color palette ─────────────────────────────────────────────────────────────

const palette: Record<
  string,
  { card: string; value: string; icon: string; border: string }
> = {
  blue: {
    card:   "bg-white",
    value:  "text-blue-600",
    icon:   "bg-blue-50 text-blue-500",
    border: "border-blue-100",
  },
  green: {
    card:   "bg-white",
    value:  "text-green-600",
    icon:   "bg-green-50 text-green-500",
    border: "border-green-100",
  },
  orange: {
    card:   "bg-white",
    value:  "text-orange-600",
    icon:   "bg-orange-50 text-orange-500",
    border: "border-orange-100",
  },
  purple: {
    card:   "bg-white",
    value:  "text-purple-700",
    icon:   "bg-purple-50 text-purple-500",
    border: "border-purple-100",
  },
  red: {
    card:   "bg-white",
    value:  "text-red-600",
    icon:   "bg-red-50 text-red-500",
    border: "border-red-100",
  },
};

// ─── Props ─────────────────────────────────────────────────────────────────────

interface StatCardProps {
  title:      string;
  value:      string | number;
  subtitle?:  string;
  color?:     "blue" | "green" | "orange" | "purple" | "red";
  icon?:      ReactNode;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function StatCard({
  title,
  value,
  subtitle,
  color = "blue",
  icon,
}: StatCardProps) {
  const p = palette[color] ?? palette.blue;

  return (
    <div
      className={`
        group relative overflow-hidden rounded-2xl border ${p.border} ${p.card}
        p-6 shadow-sm transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-md
      `}
    >
      {/* Top row: title + icon */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {icon && (
          <span
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-lg ${p.icon}`}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Value */}
      <p className={`mt-3 text-3xl font-bold tracking-tight ${p.value}`}>
        {value}
      </p>

      {/* Subtitle */}
      {subtitle && (
        <p className="mt-1.5 text-xs text-gray-400">{subtitle}</p>
      )}

      {/* Subtle decorative gradient in bottom-right */}
      <div
        className={`
          pointer-events-none absolute -bottom-4 -right-4 h-20 w-20 rounded-full
          opacity-0 transition-opacity duration-300 group-hover:opacity-100
          ${p.icon}
        `}
      />
    </div>
  );
}
