// ── Vehicle physics (local player) ─────────────────────────────────────
// Heading: 0 = North, 90 = East, clockwise (matches Google Maps bearing).
// Speed: km/h, positive = forward, negative = reverse.

class VehiclePhysics {
  constructor(config) {
    this.cfg = config;
    this.lat     = 0;
    this.lng     = 0;
    this.heading = 0;
    this.speed   = 0;
  }

  setPosition(lat, lng, heading = 0) {
    this.lat     = lat;
    this.lng     = lng;
    this.heading = heading;
    this.speed   = 0;
  }

  // dt in milliseconds, speedMult scales maxSpeed and acceleration for testing
  update(dt, input, speedMult = 1) {
    const s = dt / 1000; // seconds
    const { cfg } = this;
    const maxSpeed    = cfg.maxSpeed    * speedMult;
    const acceleration = cfg.acceleration * speedMult;
    const braking     = cfg.braking     * speedMult;

    // ── Speed ──────────────────────────────────────────────────────────
    if (input.handbrake) {
      // Rapid deceleration
      this.speed *= Math.pow(0.88, s * 60);
    } else if (input.accelerate) {
      this.speed += acceleration * s;
    } else if (input.brake) {
      if (this.speed > 0.5) {
        this.speed -= braking * s;
      } else {
        // Reverse
        this.speed -= acceleration * 0.45 * s;
      }
    } else {
      // Rolling friction
      if (Math.abs(this.speed) < 0.3) {
        this.speed = 0;
      } else {
        this.speed *= Math.pow(cfg.friction, s * 60);
      }
    }

    // Clamp
    const revMax = -(maxSpeed / 4);
    this.speed = Math.max(revMax, Math.min(maxSpeed, this.speed));

    // ── Steering ───────────────────────────────────────────────────────
    // Always allow turning; scale is lower when stationary (in-place pivot)
    // and at very high speeds (reduced grip).
    if (input.left || input.right) {
      const absSpeed  = Math.abs(this.speed);
      let turnScale;
      if (absSpeed < 1) {
        // Stationary / near-stationary: slow in-place pivot
        turnScale = 0.35;
      } else {
        const speedNorm = absSpeed / cfg.maxSpeed;
        turnScale = speedNorm < 0.5
          ? speedNorm * 2           // ramp up 0→1 over first half of speed range
          : 1 - (speedNorm - 0.5); // ramp down 1→0.5 at high speeds
        turnScale = Math.max(turnScale, 0.2); // always keep a minimum
      }
      const turn = cfg.turnRate * turnScale * s * 60;
      const dir  = absSpeed < 1 ? 1 : Math.sign(this.speed); // stationary turns same direction
      if (input.left)  this.heading -= turn * dir;
      if (input.right) this.heading += turn * dir;
      this.heading = ((this.heading % 360) + 360) % 360;
    }

    // ── Position ───────────────────────────────────────────────────────
    if (Math.abs(this.speed) > 0.01) {
      const rad   = this.heading * (Math.PI / 180);
      const mps   = this.speed   * (1000 / 3600);  // km/h → m/s
      const north = Math.cos(rad) * mps;           // m/s northward
      const east  = Math.sin(rad) * mps;           // m/s eastward

      const degPerMeterLat = 1 / 111320;
      const degPerMeterLng = 1 / (111320 * Math.cos(this.lat * (Math.PI / 180)));

      this.lat += north * degPerMeterLat * s;
      this.lng += east  * degPerMeterLng * s;
    }
  }

  getState() {
    return {
      lat:     this.lat,
      lng:     this.lng,
      heading: this.heading,
      speed:   this.speed,
    };
  }
}

// ── SVG car top-down views ──────────────────────────────────────────────
// All SVGs point "up" = North = heading 0°.

function getCarSVG(vehicleConfig, size = 44) {
  const c = vehicleConfig.color;
  const shapes = {
    sports: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 56" width="${size}" height="${Math.round(size*1.75)}">
      <rect x="5" y="14" width="22" height="30" rx="5" fill="${c}"/>
      <rect x="7" y="10" width="18" height="8" rx="4" fill="${c}" opacity=".75"/>
      <rect x="7" y="16" width="18" height="11" rx="2" fill="rgba(160,220,255,.42)"/>
      <rect x="7" y="31" width="18" height="9"  rx="2" fill="rgba(160,220,255,.28)"/>
      <rect x="1"  y="15" width="5" height="10" rx="2" fill="#111"/>
      <rect x="26" y="15" width="5" height="10" rx="2" fill="#111"/>
      <rect x="1"  y="32" width="5" height="10" rx="2" fill="#111"/>
      <rect x="26" y="32" width="5" height="10" rx="2" fill="#111"/>
      <rect x="8"  y="11" width="6" height="3"  rx="1" fill="rgba(255,255,200,.9)"/>
      <rect x="18" y="11" width="6" height="3"  rx="1" fill="rgba(255,255,200,.9)"/>
    </svg>`,

    truck: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 58" width="${size}" height="${Math.round(size*1.6)}">
      <rect x="4" y="6"  width="28" height="20" rx="4" fill="${c}"/>
      <rect x="6" y="8"  width="24" height="12" rx="2" fill="rgba(160,220,255,.4)"/>
      <rect x="4" y="28" width="28" height="24" rx="3" fill="${c}" opacity=".7"/>
      <rect x="10" y="30" width="16" height="20" rx="2" fill="rgba(0,0,0,.18)"/>
      <rect x="0"  y="8"  width="5" height="10" rx="2" fill="#111"/>
      <rect x="31" y="8"  width="5" height="10" rx="2" fill="#111"/>
      <rect x="0"  y="38" width="5" height="10" rx="2" fill="#111"/>
      <rect x="31" y="38" width="5" height="10" rx="2" fill="#111"/>
      <rect x="6"  y="7"  width="7" height="3"  rx="1" fill="rgba(255,255,200,.9)"/>
      <rect x="23" y="7"  width="7" height="3"  rx="1" fill="rgba(255,255,200,.9)"/>
    </svg>`,

    sedan: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 54" width="${size}" height="${Math.round(size*1.7)}">
      <rect x="4" y="12" width="24" height="32" rx="5" fill="${c}"/>
      <rect x="6" y="9"  width="20" height="7"  rx="3" fill="${c}" opacity=".8"/>
      <rect x="6" y="15" width="20" height="12" rx="2" fill="rgba(160,220,255,.4)"/>
      <rect x="6" y="30" width="20" height="10" rx="2" fill="rgba(160,220,255,.28)"/>
      <rect x="0"  y="14" width="5" height="10" rx="2" fill="#111"/>
      <rect x="27" y="14" width="5" height="10" rx="2" fill="#111"/>
      <rect x="0"  y="32" width="5" height="10" rx="2" fill="#111"/>
      <rect x="27" y="32" width="5" height="10" rx="2" fill="#111"/>
      <rect x="7"  y="10" width="7" height="3"  rx="1" fill="rgba(255,255,200,.9)"/>
      <rect x="18" y="10" width="7" height="3"  rx="1" fill="rgba(255,255,200,.9)"/>
    </svg>`,

    race: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 60" width="${Math.round(size*.8)}" height="${size*1.9}">
      <rect x="4" y="8"  width="18" height="44" rx="4" fill="${c}"/>
      <rect x="5" y="10" width="16" height="13" rx="2" fill="rgba(160,220,255,.48)"/>
      <rect x="5" y="35" width="16" height="13" rx="2" fill="rgba(160,220,255,.3)"/>
      <rect x="1" y="12" width="4" height="9"   rx="2" fill="#111"/>
      <rect x="21" y="12" width="4" height="9"  rx="2" fill="#111"/>
      <rect x="1" y="37" width="4" height="9"   rx="2" fill="#111"/>
      <rect x="21" y="37" width="4" height="9"  rx="2" fill="#111"/>
      <rect x="3" y="52" width="20" height="4"  rx="2" fill="${c}" opacity=".9"/>
      <rect x="6" y="9"  width="5" height="2"   rx="1" fill="rgba(255,255,200,.95)"/>
      <rect x="15" y="9" width="5" height="2"   rx="1" fill="rgba(255,255,200,.95)"/>
    </svg>`,

    suv: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 54" width="${size}" height="${Math.round(size*1.5)}">
      <rect x="3" y="10" width="30" height="36" rx="5" fill="${c}"/>
      <rect x="5" y="12" width="26" height="13" rx="2" fill="rgba(160,220,255,.38)"/>
      <rect x="5" y="30" width="26" height="12" rx="2" fill="rgba(160,220,255,.25)"/>
      <rect x="0"  y="13" width="5" height="11" rx="2" fill="#111"/>
      <rect x="31" y="13" width="5" height="11" rx="2" fill="#111"/>
      <rect x="0"  y="32" width="5" height="11" rx="2" fill="#111"/>
      <rect x="31" y="32" width="5" height="11" rx="2" fill="#111"/>
      <rect x="6"  y="11" width="8" height="3"  rx="1" fill="rgba(255,255,200,.9)"/>
      <rect x="22" y="11" width="8" height="3"  rx="1" fill="rgba(255,255,200,.9)"/>
    </svg>`,
  };
  return shapes[vehicleConfig.shape] || shapes.sedan;
}
