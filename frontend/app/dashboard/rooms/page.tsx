"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import RoomForm, { RoomFormValues } from "../../../components/RoomForm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Room {
  id:              string;
  room_number:     string;
  room_type:       string;
  capacity:        number;
  price_per_night: number;
  extra_bed_price: number;
  is_active:       boolean;
  created_at:      string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoomsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // ── State ────────────────────────────────────────────────────────────────
  const [rooms, setRooms]               = useState<Room[]>([]);
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");

  // Modal state
  const [modal, setModal] = useState<
    | { type: "add" }
    | { type: "edit"; room: Room }
    | { type: "delete"; room: Room }
    | null
  >(null);
  const [modalError, setModalError] = useState("");

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchRooms = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      // Today's window for occupancy check
      const today    = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const checkIn  = today.toISOString().split("T")[0];
      const checkOut = tomorrow.toISOString().split("T")[0];

      // Fetch all rooms + today's available rooms in parallel
      const [roomsRes, availRes] = await Promise.all([
        api.get<Room[]>("/api/rooms"),
        api.get<{ room_id: string }[]>(
          `/api/rooms/availability?check_in=${checkIn}&check_out=${checkOut}&guests=1`
        ),
      ]);

      if (roomsRes.success) {
        setRooms(roomsRes.data);
      } else {
        setError(roomsRes.error ?? "Failed to load rooms.");
      }

      if (availRes.success) {
        setAvailableIds(new Set(availRes.data.map((r) => r.room_id)));
      }
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Close modal on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Modal helpers ────────────────────────────────────────────────────────
  function closeModal() {
    setModal(null);
    setModalError("");
  }

  // ── Add Room ─────────────────────────────────────────────────────────────
  async function handleAdd(values: RoomFormValues) {
    const res = await api.post<Room>("/api/rooms", values);
    if (!res.success) {
      const msg = res.error ?? "Failed to create room.";
      if (msg.toLowerCase().includes("403") || msg.toLowerCase().includes("admin")) {
        throw new Error("Admin access required.");
      }
      throw new Error(msg);
    }
    closeModal();
    fetchRooms(false);
  }

  // ── Edit Room ─────────────────────────────────────────────────────────────
  async function handleEdit(values: RoomFormValues) {
    if (modal?.type !== "edit") return;
    const res = await api.put<Room>(`/api/rooms/${modal.room.id}`, values);
    if (!res.success) {
      const msg = res.error ?? "Failed to update room.";
      if (msg.toLowerCase().includes("403") || msg.toLowerCase().includes("admin")) {
        throw new Error("Admin access required.");
      }
      throw new Error(msg);
    }
    closeModal();
    fetchRooms(false);
  }

  // ── Delete Room ───────────────────────────────────────────────────────────
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (modal?.type !== "delete") return;
    setDeleting(true);
    setModalError("");
    try {
      const res = await api.delete<null>(`/api/rooms/${modal.room.id}`);
      if (!res.success) {
        const msg = res.error ?? "Failed to delete room.";
        setModalError(
          msg.toLowerCase().includes("403") || msg.toLowerCase().includes("admin")
            ? "Admin access required."
            : msg
        );
        return;
      }
      closeModal();
      fetchRooms(false);
    } catch {
      setModalError("Unable to reach the server.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  const editInitial = (room: Room): Partial<RoomFormValues> => ({
    room_number:     room.room_number,
    room_type:       room.room_type as RoomFormValues["room_type"],
    capacity:        room.capacity,
    price_per_night: room.price_per_night,
    extra_bed_price: room.extra_bed_price,
  });

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <PageHeader isAdmin={isAdmin} onAdd={() => {}} disabled />
        <div className="mt-5 h-64 animate-pulse rounded-2xl bg-gray-200" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error && rooms.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-4xl">⚠️</p>
        <p className="text-lg font-semibold text-gray-700">Failed to load rooms</p>
        <p className="text-sm text-gray-400">{error}</p>
        <button
          onClick={() => fetchRooms()}
          className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <PageHeader
        isAdmin={isAdmin}
        onAdd={() => { setModalError(""); setModal({ type: "add" }); }}
      />

      {/* Soft error (data already loaded but refresh failed) */}
      {error && rooms.length > 0 && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-sm text-yellow-700">
          ⚠ Refresh failed — showing last known data.
        </div>
      )}

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md">
        {rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-gray-400">
            <p className="text-4xl">🏨</p>
            <p className="text-sm font-medium">No rooms found.</p>
            {isAdmin && (
              <button
                onClick={() => setModal({ type: "add" })}
                className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add your first room
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {[
                    "Room No.",
                    "Type",
                    "Capacity",
                    "Price / Night",
                    "Extra Bed",
                    "Status",
                    ...(isAdmin ? ["Actions"] : []),
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rooms.map((room) => (
                  <tr
                    key={room.id}
                    className="transition-colors hover:bg-blue-50/40"
                  >
                    <td className="px-5 py-4 font-semibold text-gray-800">
                      {room.room_number}
                    </td>
                    <td className="px-5 py-4 capitalize text-gray-700">
                      {room.room_type}
                    </td>
                    <td className="px-5 py-4 text-gray-700">{room.capacity}</td>
                    <td className="px-5 py-4 text-gray-700">
                      ₹{Number(room.price_per_night).toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      ₹{Number(room.extra_bed_price).toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        isActive={room.is_active}
                        isAvailable={availableIds.has(room.id)}
                      />
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setModal({ type: "edit", room })}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setModalError(""); setModal({ type: "delete", room }); }}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Modal ─────────────────────────────────────────────────────── */}
      {modal?.type === "add" && (
        <Modal title="Add New Room" onClose={closeModal}>
          <RoomForm
            onSubmit={handleAdd}
            onCancel={closeModal}
            submitLabel="Add Room"
          />
        </Modal>
      )}

      {/* ── Edit Modal ────────────────────────────────────────────────────── */}
      {modal?.type === "edit" && (
        <Modal title={`Edit Room ${modal.room.room_number}`} onClose={closeModal}>
          <RoomForm
            initial={editInitial(modal.room)}
            onSubmit={handleEdit}
            onCancel={closeModal}
            submitLabel="Save Changes"
          />
        </Modal>
      )}

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      {modal?.type === "delete" && (
        <Modal title="Delete Room" onClose={closeModal} maxW="max-w-sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete room{" "}
              <span className="font-semibold text-gray-900">
                {modal.room.room_number}
              </span>
              ? This action cannot be undone.
            </p>
            {modalError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {modalError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={deleting}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageHeader({
  isAdmin,
  onAdd,
  disabled = false,
}: {
  isAdmin: boolean;
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage all resort rooms and their pricing.
        </p>
      </div>
      {isAdmin && (
        <button
          onClick={onAdd}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-base leading-none">+</span>
          Add Room
        </button>
      )}
    </div>
  );
}

function StatusBadge({ isActive, isAvailable }: { isActive: boolean; isAvailable: boolean }) {
  if (!isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
        Inactive
      </span>
    );
  }
  if (isAvailable) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Available
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Occupied
    </span>
  );
}

function Modal({
  title,
  children,
  onClose,
  maxW = "max-w-lg",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxW?: string;
}) {
  // Prevent body scroll while modal is open
  const firstRender = useRef(true);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  void firstRender;

  return (
    // Overlay — click outside to close
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`w-full ${maxW} rounded-2xl bg-white p-6 shadow-xl`}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
