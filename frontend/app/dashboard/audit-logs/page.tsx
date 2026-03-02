"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffProfile {
  id:        string;
  full_name: string;
  role:      string;
}

interface AuditLog {
  id:           string;
  action:       string;
  entity_type:  string;
  entity_id:    string;
  metadata:     Record<string, unknown> | null;
  created_at:   string;
  staff_profiles: StaffProfile | null;
}

interface Filters {
  staff_id:    string;
  entity_type: string;
  from:        string;
  to:          string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day:    "2-digit",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function shortId(id: string) {
  return id ? id.slice(0, 8).toUpperCase() : "—";
}

function actionColor(action: string) {
  if (action.includes("CREAT") || action.includes("ADD"))    return "bg-green-100 text-green-700";
  if (action.includes("DELET") || action.includes("CANCEL")) return "bg-red-100 text-red-700";
  if (action.includes("COMPLET") || action.includes("PAID")) return "bg-blue-100 text-blue-700";
  if (action.includes("UPDAT") || action.includes("EDIT"))   return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-700";
}

const ENTITY_TYPES = ["room", "booking", "payment", "customer"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const { user } = useAuth();
  const router   = useRouter();

  const [logs,    setLogs]    = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [filters, setFilters] = useState<Filters>({
    staff_id:    "",
    entity_type: "",
    from:        "",
    to:          "",
  });

  // ── Access guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.staff_id)    params.set("staff_id",    filters.staff_id);
      if (filters.entity_type) params.set("entity_type", filters.entity_type);
      if (filters.from)        params.set("from",        filters.from);
      if (filters.to)          params.set("to",          filters.to);

      const qs  = params.toString() ? `?${params.toString()}` : "";
      const res = await api.get<AuditLog[]>(`/api/audit-logs${qs}`);

      if (res.success) {
        setLogs(res.data ?? []);
      } else {
        setError(res.error ?? "Failed to load audit logs.");
      }
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (user?.role === "admin") fetchLogs();
  }, [fetchLogs, user]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const clearFilters = () =>
    setFilters({ staff_id: "", entity_type: "", from: "", to: "" });

  // ── Don't render for non-admin while redirect fires ────────────────────────
  if (user && user.role !== "admin") return null;

  // ── Input style ───────────────────────────────────────────────────────────
  const inputCls =
    "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Full activity trail — all staff actions recorded here.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Entity type */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Entity type</label>
            <select
              name="entity_type"
              value={filters.entity_type}
              onChange={handleFilterChange}
              className={inputCls + " w-full"}
            >
              <option value="">All types</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Staff ID */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Staff ID (UUID)</label>
            <input
              type="text"
              name="staff_id"
              value={filters.staff_id}
              onChange={handleFilterChange}
              placeholder="e.g. 02b0bdba-…"
              className={inputCls + " w-full"}
            />
          </div>

          {/* From */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">From</label>
            <input
              type="date"
              name="from"
              value={filters.from}
              onChange={handleFilterChange}
              className={inputCls + " w-full"}
            />
          </div>

          {/* To */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">To</label>
            <input
              type="date"
              name="to"
              value={filters.to}
              onChange={handleFilterChange}
              className={inputCls + " w-full"}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={fetchLogs}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Apply filters
          </button>
          <button
            onClick={clearFilters}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
          <span className="ml-auto text-xs text-gray-400">
            {logs.length} record{logs.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-gray-400">
            <svg className="mb-2 h-10 w-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No audit logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">Entity</th>
                  <th className="px-4 py-3 text-left">Entity ID</th>
                  <th className="px-4 py-3 text-left">Staff</th>
                  <th className="px-4 py-3 text-left">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    {/* Timestamp */}
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {fmtDateTime(log.created_at)}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>

                    {/* Entity type */}
                    <td className="px-4 py-3 capitalize text-gray-700">
                      {log.entity_type ?? "—"}
                    </td>

                    {/* Entity ID */}
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {shortId(log.entity_id)}
                    </td>

                    {/* Staff */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {log.staff_profiles?.full_name ?? "Unknown"}
                      </div>
                      <div className="text-xs capitalize text-gray-400">
                        {log.staff_profiles?.role ?? ""}
                      </div>
                    </td>

                    {/* Metadata */}
                    <td className="px-4 py-3">
                      {log.metadata ? (
                        <details className="cursor-pointer">
                          <summary className="text-xs text-indigo-600 hover:underline">
                            View details
                          </summary>
                          <pre className="mt-1 max-w-xs overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
