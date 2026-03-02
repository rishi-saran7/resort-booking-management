"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "../app/context/AuthContext";

// ─── Route → page title map ───────────────────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":                "Dashboard",
  "/dashboard/rooms":          "Rooms",
  "/dashboard/bookings":       "New Booking",
  "/dashboard/manage-bookings": "Manage Bookings",
  "/dashboard/audit-logs":     "Audit Logs",
};

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const pathname        = usePathname();
  const { user, logout } = useAuth();
  const isAdmin         = user?.role === "admin";

  const title = PAGE_TITLES[pathname] ?? "Dashboard";

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 shadow-sm sm:px-6">
      {/* Left — hamburger (mobile) + page title */}
      <div className="flex items-center gap-3">
        {/* Hamburger — visible only < lg */}
        <button
          onClick={onMenuClick}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
          aria-label="Open menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <h1 className="text-base font-semibold text-gray-800">{title}</h1>
      </div>

      {/* Right — user info + role badge + sign out */}
      <div className="flex items-center gap-3">
        {/* Name + role (hidden on very small screens) */}
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-none text-gray-900">{user?.full_name}</p>
          <p className="mt-0.5 text-xs capitalize text-gray-500">{user?.role}</p>
        </div>

        {/* Role badge */}
        <span
          className={`hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline-block ${
            isAdmin
              ? "bg-purple-100 text-purple-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {user?.role}
        </span>

        {/* Avatar circle — shown on mobile where name is hidden */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 sm:hidden">
          {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
        </div>

        {/* Sign out */}
        <button
          onClick={logout}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
