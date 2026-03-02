const supabase = require("../config/supabaseClient");
const { logAudit } = require("../utils/auditLogger");

// ─── GET /api/rooms ───────────────────────────────────────────────────────────

const getAllRooms = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("is_active", true)
      .order("room_number", { ascending: true });

    if (error) {
      return res.status(500).json({ success: false, data: null, error: error.message });
    }

    return res.status(200).json({ success: true, data, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── POST /api/rooms ──────────────────────────────────────────────────────────

const createRoom = async (req, res) => {
  try {
    const { room_number, room_type, capacity, price_per_night, extra_bed_price } = req.body;

    // Validation
    if (!room_number || !room_type || !capacity || !price_per_night) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "room_number, room_type, capacity, and price_per_night are required.",
      });
    }

    if (capacity <= 0) {
      return res.status(400).json({ success: false, data: null, error: "capacity must be greater than 0." });
    }

    if (price_per_night <= 0) {
      return res.status(400).json({ success: false, data: null, error: "price_per_night must be greater than 0." });
    }

    const upsertPayload = {
      room_number,
      room_type,
      capacity,
      price_per_night,
      is_active: true,
      ...(extra_bed_price !== undefined && { extra_bed_price }),
    };

    // Check if a room with this number already exists (active or soft-deleted)
    const { data: existing } = await supabase
      .from("rooms")
      .select("id, is_active")
      .eq("room_number", room_number)
      .maybeSingle();

    if (existing) {
      if (existing.is_active) {
        // Truly a duplicate — reject
        return res.status(400).json({ success: false, data: null, error: `Room number "${room_number}" already exists.` });
      }
      // Soft-deleted room with same number — reactivate with new values
      const { data, error: updateError } = await supabase
        .from("rooms")
        .update(upsertPayload)
        .eq("id", existing.id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ success: false, data: null, error: updateError.message });
      }

      logAudit({
        staff_id:    req.user.id,
        action:      "ROOM_CREATED",
        entity_type: "room",
        entity_id:   data.id,
        metadata:    { room_number: data.room_number, room_type: data.room_type, price_per_night: data.price_per_night },
      });

      return res.status(201).json({ success: true, data, error: null });
    }

    const { data, error } = await supabase
      .from("rooms")
      .insert([upsertPayload])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, data: null, error: error.message });
    }

    // Fire-and-forget audit log
    logAudit({
      staff_id:    req.user.id,
      action:      "ROOM_CREATED",
      entity_type: "room",
      entity_id:   data.id,
      metadata:    { room_number: data.room_number, room_type: data.room_type, price_per_night: data.price_per_night },
    });

    return res.status(201).json({ success: true, data, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── PUT /api/rooms/:id ───────────────────────────────────────────────────────

const updateRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { room_type, capacity, price_per_night, extra_bed_price, is_active } = req.body;

    // Build only the fields that were provided
    const updates = {};
    if (room_type !== undefined)       updates.room_type = room_type;
    if (capacity !== undefined)        updates.capacity = capacity;
    if (price_per_night !== undefined) updates.price_per_night = price_per_night;
    if (extra_bed_price !== undefined) updates.extra_bed_price = extra_bed_price;
    if (is_active !== undefined)       updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, data: null, error: "No valid fields provided for update." });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("rooms")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, data: null, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ success: false, data: null, error: "Room not found." });
    }

    // Fire-and-forget audit log
    logAudit({
      staff_id:    req.user.id,
      action:      "ROOM_UPDATED",
      entity_type: "room",
      entity_id:   id,
      metadata:    { room_number: data.room_number, changes: updates },
    });

    return res.status(200).json({ success: true, data, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── DELETE /api/rooms/:id  (soft delete) ────────────────────────────────────

const deleteRoom = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("rooms")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, data: null, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ success: false, data: null, error: "Room not found." });
    }

    // Fire-and-forget audit log
    logAudit({
      staff_id:    req.user.id,
      action:      "ROOM_DEACTIVATED",
      entity_type: "room",
      entity_id:   id,
      metadata:    { room_number: data.room_number },
    });

    return res.status(200).json({ success: true, data: { message: "Room deactivated successfully.", room: data }, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

// ─── GET /api/rooms/availability ─────────────────────────────────────────────

const checkAvailability = async (req, res) => {
  try {
    const { check_in, check_out, guests, extra_beds = 0 } = req.query;

    // ── 1. Validate required params ─────────────────────────────────────────
    if (!check_in || !check_out) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "check_in and check_out are required.",
      });
    }

    const checkInDate  = new Date(check_in);
    const checkOutDate = new Date(check_out);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "check_in and check_out must be valid ISO date strings.",
      });
    }

    if (checkOutDate <= checkInDate) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "check_out must be after check_in.",
      });
    }

    const guestsCount   = parseInt(guests, 10);
    const extraBedsCount = parseInt(extra_beds, 10);

    if (!guests || isNaN(guestsCount) || guestsCount <= 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "guests must be a positive integer.",
      });
    }

    if (isNaN(extraBedsCount) || extraBedsCount < 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "extra_beds must be >= 0.",
      });
    }

    // ── 2. Fetch all active rooms + overlapping confirmed bookings in parallel
    const [roomsResult, overlappingResult] = await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .eq("is_active", true),

      // Standard date overlap: new_check_in < existing_check_out
      //                    AND new_check_out > existing_check_in
      supabase
        .from("bookings")
        .select("room_id")
        .eq("booking_status", "confirmed")
        .lt("check_in", check_out)   // existing check_in < new check_out
        .gt("check_out", check_in),  // existing check_out > new check_in
    ]);

    if (roomsResult.error) {
      console.error("[checkAvailability] rooms query error:", roomsResult.error.message);
      return res.status(500).json({ success: false, data: null, error: "Failed to fetch rooms." });
    }

    if (overlappingResult.error) {
      console.error("[checkAvailability] bookings query error:", overlappingResult.error.message);
      return res.status(500).json({ success: false, data: null, error: "Failed to fetch bookings." });
    }

    // ── 3. Build Set of unavailable room IDs (O(1) lookup) ──────────────────
    const bookedRoomIds = new Set(
      (overlappingResult.data || []).map((b) => b.room_id)
    );

    // ── 4. Filter by capacity and availability ───────────────────────────────
    const nights = Math.round(
      (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)
    );

    const availableRooms = (roomsResult.data || [])
      .filter((room) => {
        const isAvailable  = !bookedRoomIds.has(room.id);
        const hasCapacity  = room.capacity + extraBedsCount >= guestsCount;
        return isAvailable && hasCapacity;
      })
      .map((room) => {
        const baseTotal  = nights * parseFloat(room.price_per_night);
        const extraTotal = extraBedsCount * parseFloat(room.extra_bed_price || 0) * nights;
        return {
          room_id:               room.id,
          room_number:           room.room_number,
          room_type:             room.room_type,
          capacity:              room.capacity,
          price_per_night:       parseFloat(room.price_per_night),
          extra_bed_price:       parseFloat(room.extra_bed_price || 0),
          nights,
          total_estimated_price: Math.round((baseTotal + extraTotal) * 100) / 100,
        };
      });

    return res.status(200).json({
      success: true,
      data: availableRooms,
      error: null,
    });
  } catch (err) {
    console.error("[checkAvailability] Unexpected error:", err.message);
    return res.status(500).json({ success: false, data: null, error: "Internal server error." });
  }
};

module.exports = { getAllRooms, createRoom, updateRoom, deleteRoom, checkAvailability };
