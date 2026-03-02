"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import StatCard from "../../components/StatCard";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DashboardStats {
  total_rooms:           number;
  available_rooms:       number;
  booked_rooms:          number;
  today_checkins:        number;
  today_checkouts:       number;
  total_revenue_paid:    number;
  total_revenue_pending: number;
}

const AUTO_REFRESH_MS = 30_000; // 30 seconds

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [stats, setStats]         = useState<DashboardStats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ── Fetch stats ─────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError("");

    try {
      const res = await api.get<DashboardStats>("/api/dashboard/stats");
      if (res.success) {
        setStats(res.data);
        setLastRefresh(new Date());
      } else {
        setError(res.error ?? "Failed to load statistics.");
      }
    } catch {
      setError("Unable to reach the server. Is the backend running?");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // ── Auto-refresh via setInterval ────────────────────────────────────────────
  // The interval fires fetchStats (not initial) every 30 s without a spinner.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchStats(true); // first load

    intervalRef.current = setInterval(() => {
      fetchStats(false); // silent background refresh
    }, AUTO_REFRESH_MS);

    // Re-fetch when the user navigates back to this tab/page
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchStats(false);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchStats]);

  // ── Greeting ─────────────────────────────────────────────────────────────────
  const firstName = user?.full_name?.split(" ")[0] ?? "there";
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ── Render: loading skeletons ─────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <HeaderSkeleton />
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  // ── Render: error ─────────────────────────────────────────────────────────
  if (error && !stats) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">
          ⚠️
        </div>
        <h2 className="text-lg font-semibold text-gray-800">
          Unable to load dashboard statistics
        </h2>
        <p className="max-w-sm text-sm text-gray-500">{error}</p>
        <button
          onClick={() => fetchStats(true)}
          className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const s = stats!;

  return (
    <div>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Here&apos;s what&apos;s happening at the resort today.
          </p>
        </div>

        {/* Last-refresh timestamp + manual refresh */}
        <div className="hidden items-center gap-3 text-right sm:flex">
          {lastRefresh && (
            <p className="text-xs text-gray-400">
              Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              <span className="ml-1 text-gray-300">· auto every 30s</span>
            </p>
          )}
          <button
            onClick={() => fetchStats(true)}
            title="Refresh now"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Background-refresh soft error banner */}
      {error && stats && (
        <div className="mb-5 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-sm text-yellow-700">
          ⚠ Background refresh failed — showing last known data.
        </div>
      )}

      {/* ── Row 1: Room occupancy ───────────────────────────────────────────── */}
      <SectionLabel>Room Overview</SectionLabel>
      <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
        <StatCard
          title="Total Rooms"
          value={s.total_rooms}
          subtitle="All registered rooms"
          color="blue"
          icon="🏨"
        />
        <StatCard
          title="Available Rooms"
          value={s.available_rooms}
          subtitle="Ready for new bookings"
          color="green"
          icon="✅"
        />
        <StatCard
          title="Occupied Rooms"
          value={s.booked_rooms}
          subtitle="Currently booked"
          color="orange"
          icon="🔑"
        />
      </div>

      {/* ── Row 2: Today activity ───────────────────────────────────────────── */}
      <SectionLabel className="mt-8">Today&apos;s Activity</SectionLabel>
      <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
        <StatCard
          title="Check-ins Today"
          value={s.today_checkins}
          subtitle="Guests arriving today"
          color="purple"
          icon="📥"
        />
        <StatCard
          title="Check-outs Today"
          value={s.today_checkouts}
          subtitle="Guests departing today"
          color="purple"
          icon="📤"
        />
      </div>

      {/* ── Row 3: Revenue (admin only) ─────────────────────────────────────── */}
      {isAdmin && (
        <>
          <SectionLabel className="mt-8">Revenue</SectionLabel>
          <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
            <StatCard
              title="Revenue Collected"
              value={inr(s.total_revenue_paid)}
              subtitle="Total payments received"
              color="green"
              icon="💰"
            />
            <StatCard
              title="Revenue Pending"
              value={inr(s.total_revenue_pending)}
              subtitle="Outstanding balance"
              color="red"
              icon="⏳"
            />
          </div>
        </>
      )}

      {/* Staff notice when revenue is hidden */}
      {!isAdmin && (
        <p className="mt-8 text-xs text-gray-400">
          Revenue data is visible to admin accounts only.
        </p>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-xs font-semibold uppercase tracking-widest text-gray-400 ${className}`}
    >
      {children}
    </h2>
  );
}

function HeaderSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-56 rounded-lg bg-gray-200" />
      <div className="mt-2 h-4 w-72 rounded-lg bg-gray-100" />
    </div>
  );
}

