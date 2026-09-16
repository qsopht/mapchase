// Road-following constraint system.
//
// Every SNAP_INTERVAL ms (and only after the vehicle moves MIN_MOVE_METERS),
// a non-blocking fetch to /api/road/snap is fired.  The result is cached and
// applied each frame as a soft correction — position is gently pulled toward
// the nearest road, speed is penalised off-road, and heading is nudged to
// align with the road bearing.  Nothing blocks the game loop.

const RoadFollower = (() => {
  // ── Config ─────────────────────────────────────────────────────────
  const SNAP_INTERVAL_MS    = 350; // max one API call per 350 ms
  const MIN_MOVE_METERS     = 6;   // don't re-snap until we've moved this far
  const TOLERANCE_M         = 10;  // metres off-road before position correction starts
  const MAX_CORRECT_M       = 40;  // metres where correction reaches full strength
  const OFFROAD_THRESHOLD_M = 18;  // metres before speed penalty applies

  // ── State ───────────────────────────────────────────────────────────
  let lastResult    = null;   // { lat, lng, bearing } or null
  let lastSnapTime  = 0;
  let lastSnapLat   = null;
  let lastSnapLng   = null;
  let snapPending   = false;
  let enabled       = true;
  let offRoadDist   = 0;      // metres, updated each frame, read by HUD

  // ── Geometry helpers ────────────────────────────────────────────────
  function haversineM(la1, ln1, la2, ln2) {
    const R = 6371000;
    const dLa = (la2 - la1) * Math.PI / 180;
    const dLn = (ln2 - ln1) * Math.PI / 180;
    const a = Math.sin(dLa / 2) ** 2 +
      Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLn / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d >  180) d -= 360;
    while (d < -180) d += 360;
    return a + d * t;
  }

  // ── API fetch (fire-and-forget) ──────────────────────────────────────
  function fetchSnap(lat, lng, heading) {
    if (snapPending) return;
    snapPending = true;
    fetch(`/api/road/snap?lat=${lat}&lng=${lng}&heading=${heading}`)
      .then(r => r.json())
      .then(data => {
        lastResult  = (data && data.snapped) ? data : null;
        snapPending = false;
      })
      .catch(() => { snapPending = false; });
  }

  // ── Public API ───────────────────────────────────────────────────────
  return {
    // Call once per frame BEFORE physics output is used.
    // Triggers a background snap if conditions are met.
    tick(lat, lng, heading) {
      if (!enabled) return;
      const now = Date.now();
      const distMoved = (lastSnapLat !== null)
        ? haversineM(lat, lng, lastSnapLat, lastSnapLng)
        : Infinity;

      if (now - lastSnapTime >= SNAP_INTERVAL_MS && distMoved >= MIN_MOVE_METERS) {
        lastSnapTime = now;
        lastSnapLat  = lat;
        lastSnapLng  = lng;
        fetchSnap(lat, lng, heading);
      }
    },

    // Apply road constraint to a VehiclePhysics instance (modifies in place).
    // Call AFTER vehicle.update() so physics runs first, then we correct.
    applyTo(vehicle, dt) {
      if (!enabled || !lastResult) { offRoadDist = 0; return; }

      const dtS  = dt / 1000;
      const { lat: sLat, lng: sLng, bearing } = lastResult;

      // Distance from vehicle to snapped road point (metres)
      const distM = haversineM(vehicle.lat, vehicle.lng, sLat, sLng);
      offRoadDist = distM;

      // ── Position correction (soft spring toward road) ────────────────
      if (distM > TOLERANCE_M) {
        const raw = (distM - TOLERANCE_M) / MAX_CORRECT_M;  // 0 → 1
        const strength = Math.min(1, raw) * 0.09 * (dtS * 60);
        vehicle.lat += (sLat - vehicle.lat) * strength;
        vehicle.lng += (sLng - vehicle.lng) * strength;
      }

      // ── Speed penalty off-road ───────────────────────────────────────
      if (distM > OFFROAD_THRESHOLD_M) {
        // Gentle ramp: full speed at threshold, down to 50% at threshold+50 m
        const penalty = Math.max(0.4, 1 - (distM - OFFROAD_THRESHOLD_M) / 50);
        vehicle.speed *= Math.pow(penalty, dtS * 60);
      }

      // ── Heading alignment toward road bearing ────────────────────────
      // Only correct when roughly aligned with the road (not driving across
      // or backwards on it), and only when meaningfully moving.
      if (bearing != null && distM < 30 && Math.abs(vehicle.speed) > 3) {
        let diff = bearing - vehicle.heading;
        while (diff >  180) diff -= 360;
        while (diff < -180) diff += 360;

        // If difference > 90° the road probably runs the other way; flip 180°
        const effectiveBearing = Math.abs(diff) > 90
          ? (bearing + 180) % 360
          : bearing;

        let diff2 = effectiveBearing - vehicle.heading;
        while (diff2 >  180) diff2 -= 360;
        while (diff2 < -180) diff2 += 360;

        if (Math.abs(diff2) < 70) {
          const align = 0.035 * (dtS * 60);
          vehicle.heading = ((lerpAngle(vehicle.heading, effectiveBearing, align) % 360) + 360) % 360;
        }
      }
    },

    // Metres the vehicle is currently from the nearest road (for HUD)
    get offRoadMetres() { return offRoadDist; },

    // Toggle road-following (e.g., for off-road fun)
    setEnabled(v) {
      enabled = v;
      if (!v) { lastResult = null; offRoadDist = 0; }
    },
    get isEnabled() { return enabled; },

    reset() {
      lastResult   = null;
      lastSnapTime = 0;
      lastSnapLat  = null;
      lastSnapLng  = null;
      offRoadDist  = 0;
    },
  };
})();
