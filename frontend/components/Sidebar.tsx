"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../app/context/AuthContext";

// ─── Nav item definitions ─────────────────────────────────────────────────────

interface NavItem {
  href:      string;
  label:     string;
  icon:      string;
  adminOnly: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",                label: "Dashboard",       icon: "📊", adminOnly: false },
  { href: "/dashboard/rooms",          label: "Rooms",           icon: "🏨", adminOnly: false },
  { href: "/dashboard/bookings",       label: "New Booking",     icon: "➕", adminOnly: false },
  { href: "/dashboard/manage-bookings", label: "Manage Bookings", icon: "📋", adminOnly: false },
  { href: "/dashboard/audit-logs",     label: "Audit Logs",      icon: "🔍", adminOnly: true  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  open:    boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname        = usePathname();
  const { user, logout } = useAuth();
  const isAdmin         = user?.role === "admin";

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      {/* ── Brand ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
        <span className="text-xl">🏨</span>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-none">Resort</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Management System</p>
        </div>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {visibleItems.map(({ href, label, icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {/* Active accent bar */}
              <span
                className={`absolute left-0 h-7 w-1 rounded-r-full bg-blue-600 transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── User card at bottom ───────────────────────────────────────── */}
      <div className="border-t border-gray-100 px-3 py-4">
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
          {/* Avatar circle */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-gray-800">{user?.full_name}</p>
            <span
              className={`inline-block mt-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                isAdmin
                  ? "bg-purple-100 text-purple-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {user?.role}
            </span>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="ml-auto shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            {/* Exit icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar (always visible ≥ lg) ──────────────────────── */}
      <aside className="relative hidden lg:flex lg:w-60 lg:flex-col lg:shrink-0 lg:border-r lg:border-gray-100 lg:shadow-sm">
        {sidebarContent}
      </aside>

      {/* ── Mobile overlay sidebar ──────────────────────────────────────── */}
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shadow-xl transition-transform duration-300 ease-in-out lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
